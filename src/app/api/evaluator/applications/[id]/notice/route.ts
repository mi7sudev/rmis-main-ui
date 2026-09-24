import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { requireEvaluatorFromReq } from "@/lib/auth";
import { auditLog } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import {
  findApplicationApplicantId,
  findApplicationJobId,
  loadJobPostingPosition,
} from "@/lib/applicant-data";
import { stageForStatus } from "@/lib/status";
import {
  emailApplicationRegret,
  emailApplicationInterviewInvite,
  emailApplicationSkillsExam,
} from "@/lib/email";

// ============================================================================
// MOM (2026-09-03) — recruitment-flow notices (steps 4 & 5).
//
//   step 4  "regret"        — automated regret letter for declined /
//                             not-shortlisted applicants.
//   step 5  "interview"     — interview invitation for shortlisted applicants.
//   step 5  "skills_exam"   — skills-examination notice for shortlisted
//                             applicants.
//
// Every send fans out to the two delivery surfaces the system already has:
// EMAIL (provider-agnostic, logged to email_logs) and an in-app Notification
// row linked to the applicant.
// THE PIPELINE ENDS HERE — the in-system status stays "Shortlisted" /
// "Rejected" and every succeeding step is face-to-face (offline by design).
// ============================================================================

type NoticeType = "regret" | "interview" | "skills_exam";

/** Subject prefixes per notice type — doubles as the sent-listing key. */
const NOTICE_SUBJECT_PREFIX: Record<NoticeType, string> = {
  regret: "Application regret —",
  interview: "Interview invitation —",
  skills_exam: "Skills examination notice —",
};

const noticeSchema = z.object({
  type: z.enum(["regret", "interview", "skills_exam"]),
  date: z.string().max(80).optional().nullable(),
  time: z.string().max(40).optional().nullable(),
  venue: z.string().max(200).optional().nullable(),
  contact: z.string().max(160).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  examType: z.string().max(80).optional().nullable(),
});

export const GET = handleApi(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  await requireEvaluatorFromReq(req);
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return err("Invalid id", 400);

  // Sent-notices listing for the review modal: every email whose related link
  // points at this application AND whose subject carries one of the MOM notice
  // prefixes. email_logs is the single audit source — it records mock, skipped
  // and failed sends alike, so the UI reflects reality rather than optimism.
  const logs = await db.emailLog.findMany({
    where: { relatedType: "application", relatedId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, subject: true, status: true, to: true, createdAt: true },
  });
  const notices = logs
    .map((l) => {
      const type = l.subject.startsWith(NOTICE_SUBJECT_PREFIX.regret)
        ? "regret"
        : l.subject.startsWith(NOTICE_SUBJECT_PREFIX.interview)
          ? "interview"
          : l.subject.startsWith(NOTICE_SUBJECT_PREFIX.skills_exam)
            ? "skills_exam"
            : null;
      if (!type) return null;
      return {
        id: l.id,
        type,
        subject: l.subject,
        status: l.status,
        to: l.to,
        sentAt: l.createdAt,
      };
    })
    .filter((n): n is NonNullable<typeof n> => n != null);

  return ok({ notices });
});

export const POST = handleApi(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const user = await requireEvaluatorFromReq(req);
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return err("Invalid id", 400);

  const parsed = noticeSchema.safeParse(await req.json());
  if (!parsed.success) return err("Invalid notice payload", 400, parsed.error.flatten());
  const { type, date, time, venue, contact, notes, examType } = parsed.data;

  // Schedule fields are mandatory for the two shortlist-stage notices.
  if (type !== "regret" && (!date?.trim() || !time?.trim() || !venue?.trim())) {
    return err("Date, time and venue are required for this notice", 400);
  }

  const app = await db.application.findUnique({ where: { id } });
  if (!app) return err("Application not found", 404);

  // Doctrine guard: a REGRET letter only ever goes to an application that is
  // NOT shortlisted (the rejected family, or anyone not picked up for the
  // shortlist). Sending a regret to a shortlisted applicant would contradict
  // the shortlist decision the system already communicated.
  if (type === "regret" && stageForStatus(app.applicationStatus ?? "") === "Shortlisted") {
    return err("This application is shortlisted — a regret letter cannot be sent", 409);
  }

  // Doctrine guard (steps 4 & 5 of the MOM flow): interview invitations and
  // skills-exam notices are SHORTLIST-stage communications — they may only go
  // to applications whose decision was the shortlist. Letting them through to
  // Applied/Under Review/Rejected applications would invite someone HR has
  // not (or not yet) shortlisted. Statuses past the shortlist (Interview /
  // Selected / Approved) still map to the "Shortlisted" stage, so schedule
  // updates for those remain possible.
  if (type !== "regret" && stageForStatus(app.applicationStatus ?? "") !== "Shortlisted") {
    return err("Only shortlisted applications can receive an interview or skills-exam notice", 409);
  }

  const applicantId = await findApplicationApplicantId(id);
  const applicant = applicantId != null
    ? await db.applicant.findUnique({
        where: { id: applicantId },
        select: {
          id: true, firstName: true, emailAddress: true,
          mobileNumber: true, contactNumber: true,
        },
      })
    : null;
  if (!applicant) return err("Applicant not found for this application", 404);

  const jobId = await findApplicationJobId(id);
  const position = jobId != null ? await loadJobPostingPosition(jobId) : null;
  const positionTitle =
    position?.positionTitle ??
    (jobId != null
      ? (await db.jobPosting.findUnique({ where: { id: jobId }, select: { briefDescription: true } }))
          ?.briefDescription ?? null
      : null) ??
    `application #${id}`;

  const firstName = applicant.firstName;
  const details = { date: date ?? null, time: time ?? null, venue: venue ?? null, contact: contact ?? null, notes: notes ?? null };

  // --- EMAIL (primary channel per the MOM: "the applicant has been emailed") -
  const emailResult = await (type === "regret"
    ? emailApplicationRegret({ email: applicant.emailAddress, firstName, positionTitle, applicationId: id })
    : type === "interview"
      ? emailApplicationInterviewInvite({ email: applicant.emailAddress, firstName, positionTitle, applicationId: id, details })
      : emailApplicationSkillsExam({ email: applicant.emailAddress, firstName, positionTitle, applicationId: id, details: { ...details, examType } }));

  // --- In-app record (Notification linked to the applicant) ------------------
  const noticeLabel =
    type === "regret" ? "Regret letter" : type === "interview" ? "Interview invitation" : "Skills-examination notice";
  const detailLine =
    type === "regret"
      ? `Your application for ${positionTitle} was not shortlisted.`
      : `${details.date} at ${details.time}, ${details.venue}.`;
  try {
    const notification = await db.notification.create({
      data: {
        name: `${noticeLabel} — ${positionTitle}`,
        notificationDescription: detailLine,
        notificationDate: new Date().toISOString().slice(0, 10),
        createdAt: new Date(),
        updatedAt: new Date(),
        publishedAt: new Date(),
      },
    });
    await db.notificationApplicantLink.create({
      data: { notificationId: notification.id, applicantId: applicant.id, notificationOrd: 0 },
    });
  } catch (e) {
    console.warn("[evaluator/applications/[id]/notice] in-app record failed", e);
  }

  await auditLog({
    userId: user.id,
    userLabel: user.name ? `${user.name} (${user.email})` : user.email,
    userRole: user.role,
    action: "NOTICE_SENT",
    entityType: "application",
    entityId: id,
    description: `${noticeLabel} sent for application ${id} (${positionTitle}) — email ${emailResult.status}`,
    ipAddress: getClientIp(req),
  });

  return ok({
    type,
    email: emailResult,
  });
});
