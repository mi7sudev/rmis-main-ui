import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { requireEvaluatorFromReq } from "@/lib/auth";
import { auditLog } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { statusUpdateSchema } from "@/lib/validation";
import {
  findApplicationApplicantId,
  findApplicationJobId,
  loadJobPostingPosition,
  loadPositionPlaceOfAssignment,
} from "@/lib/applicant-data";
import { getApplicationSnapshots } from "@/lib/raw-json";
import { safeJsonParse, transformSnapshotKeys, parseSnapshotArray } from "@/lib/snapshot";
import { buildRequirementsReport, type RequirementSnapshots } from "@/lib/requirements";
import { notifyApplicationStatusChanged } from "@/lib/sms";
import { emailApplicationStatusChanged, emailApplicationRegret } from "@/lib/email";
import { isRejectedStatus } from "@/lib/status";

export const GET = handleApi(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  await requireEvaluatorFromReq(req);
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return err("Invalid id", 400);

  const app = await db.application.findUnique({ where: { id } });
  if (!app) return err("Application not found", 404);

  // Load junction-table relations
  const [applicantId, jobId] = await Promise.all([
    findApplicationApplicantId(id),
    findApplicationJobId(id),
  ]);

  let applicant: {
    id: number; firstName: string | null; lastName: string | null; emailAddress: string | null;
    contactNumber: string | null; gender: string | null; civilStatus: string | null;
    citizenship: string | null; isProfileComplete: boolean;
  } | null = null;
  if (applicantId != null) {
    const a = await db.applicant.findUnique({
      where: { id: applicantId },
      select: {
        id: true, firstName: true, lastName: true, emailAddress: true,
        contactNumber: true, gender: true, civilStatus: true, citizenship: true,
        isFillouted: true,
      },
    });
    if (a) applicant = { ...a, isProfileComplete: a.isFillouted ?? false };
  }

  type JobDetail = {
    id: number;
    title: string | null;
    position: {
      id: number; positionTitle: string | null;
      placeOfAssignment: Awaited<ReturnType<typeof loadPositionPlaceOfAssignment>>[number] | null;
    } | null;
  } & Record<string, unknown>;
  let job: JobDetail | null = null;
  // Keep the full Position row (incl. CSC qualification standards) reachable
  // for the requirements-match computation below.
  let positionFull: Awaited<ReturnType<typeof loadJobPostingPosition>> | null = null;
  if (jobId != null) {
    const j = await db.jobPosting.findUnique({ where: { id: jobId } });
    const position = await loadJobPostingPosition(jobId);
    positionFull = position;
    let placeOfAssignment: Awaited<ReturnType<typeof loadPositionPlaceOfAssignment>>[number] | null = null;
    if (position) {
      const places = await loadPositionPlaceOfAssignment(position.id);
      if (places[0]) placeOfAssignment = places[0];
    }
    if (j) {
      job = {
        ...j,
        title: position?.positionTitle ?? j.briefDescription ?? null,
        position: position ? { ...position, placeOfAssignment } : null,
      } as JobDetail;
    }
  }

  // Read snapshot JSON columns via raw-json helper (Prisma can't deserialize them).
  // Production snapshots were written by the legacy backend using snake_case DB column names
  // (e.g. first_name, position_title, education_level). The evaluator frontend
  // renderers (types.tsx, review-modal.tsx) expect camelCase keys.
  // Transform every snapshot's keys snake_case → camelCase at the API boundary.
  const raw = getApplicationSnapshots(id);
  const snapshots = {
    profile: raw.profile ? transformSnapshotKeys(safeJsonParse(raw.profile)) : null,
    educations: parseSnapshotArray(raw.educations),
    experiences: parseSnapshotArray(raw.experiences),
    trainings: parseSnapshotArray(raw.trainings),
    eligibilities: parseSnapshotArray(raw.eligibilities),
    awards: parseSnapshotArray(raw.awards),
    documents: [], // No DB documents table in production — return empty
  };

  // REQUIREMENTS MATCH — does the applicant's snapshotted credentials satisfy
  // the specific job's CSC qualification standards? Computed server-side from
  // the SAME snapshots the reviewer sees, against the live Position standards.
  // (Legacy note: this used to map snapshot_attachment → "mqrResults", which
  // rendered garbage — the attachment snapshot is a file record, not an MQR
  // verdict. MQR is intentionally recomputed here, not read from storage.)
  const requirementSnapshots: RequirementSnapshots = {
    educations: snapshots.educations,
    experiences: snapshots.experiences,
    trainings: snapshots.trainings,
    eligibilities: snapshots.eligibilities,
  };
  const requirements = positionFull
    ? buildRequirementsReport(
        {
          cscEducation: positionFull.cscEducation ?? null,
          cscWorkExperience: positionFull.cscWorkExperience ?? null,
          cscTrainingRequirements: positionFull.cscTrainingRequirements ?? null,
          cscEligibilityGroup: positionFull.cscEligibilityGroup ?? null,
        },
        requirementSnapshots,
      )
    : null;

  // REVISED WORKFLOW: no evaluation/scoring records. The evaluator reviews
  // the requirements match + credentials snapshots below and records a
  // shortlist decision — legacy assessment rows in the DB are intentionally
  // no longer surfaced.
  return ok({
    ...app,
    status: app.applicationStatus,
    applicantId,
    jobId,
    applicant,
    job,
    snapshots,
    requirements,
    interviews: [],
    examinations: [],
    statusChanges: [],
    documents: [], // No DB documents table in production
  });
});

export const PATCH = handleApi(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const user = await requireEvaluatorFromReq(req);
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return err("Invalid id", 400);

  const parsed = statusUpdateSchema.safeParse(await req.json());
  if (!parsed.success) return err("Invalid status", 400, parsed.error.flatten());
  const { status, reason } = parsed.data;

  const app = await db.application.findUnique({ where: { id } });
  if (!app) return err("Application not found", 404);

  const updated = await db.application.update({
    where: { id },
    data: {
      applicationStatus: status,
      updatedAt: new Date(),
    },
  });

  await auditLog({
    userId: user.id,
    userLabel: user.name ? `${user.name} (${user.email})` : user.email,
    userRole: user.role,
    action: "APPLICATION_STATUS_CHANGED",
    entityType: "application",
    entityId: id,
    description: `Application ${id} status changed from ${app.applicationStatus ?? "(none)"} to ${status}`,
    ipAddress: getClientIp(req),
  });

  // Production has NO dedicated status-change table. We'd need to store this
  // somewhere — for now, log it via a notification record (the production
  // `notifications` table is the closest match). If creation fails for any
  // reason, swallow the error (the status update itself already succeeded).
  // NOTE: created_by_id / updated_by_id FK references admin_users, not up_users.
  try {
    await db.notification.create({
      data: {
        name: `Application #${id} status: ${status}`,
        notificationDescription: reason || `Status changed from ${app.applicationStatus ?? "(none)"} to ${status}`,
        notificationDate: new Date().toISOString().slice(0, 10),
        createdAt: new Date(),
        updatedAt: new Date(),
        publishedAt: new Date(),
      },
    });
  } catch (e) {
    console.warn("[evaluator/applications/[id] PATCH] could not log status change", e);
  }

  // SMS notification to the applicant — best-effort (sendSms never throws).
  // Resolve the applicant's mobile + first name and the position title.
  // Status "Under Review" (the explicit evaluator Review action) IS a notified
  // transition: the applicant receives the under-review email + SMS. A literal
  // "Applied" write remains a SILENT revert kept for backward compatibility.
  const isSilentRevert = status.trim().toUpperCase() === "APPLIED";
  // Rejected family (Rejected/Declined): the applicant's notification is the
  // FORMAL regret letter (MOM step 4) — never a generic status notice on top
  // of it, and never a second SMS next to the regret SMS. See the blocks below.
  const isRejectedFamily = isRejectedStatus(status);
  let applicantFirstName: string | null = null;
  let applicantEmail: string | null | undefined = null;
  let applicantMobile: string | bigint | number | null | undefined = null;
  let positionTitle = `application #${id}`;
  try {
    const applicantId = await findApplicationApplicantId(id);
    const jobId = await findApplicationJobId(id);
    const applicant = applicantId
      ? await db.applicant.findUnique({
          where: { id: applicantId },
          select: {
            firstName: true,
            mobileNumber: true,
            contactNumber: true,
            emailAddress: true,
          },
        })
      : null;
    const position = jobId ? await loadJobPostingPosition(jobId) : null;
    if (applicant) {
      applicantFirstName = applicant.firstName;
      applicantEmail = applicant.emailAddress;
      applicantMobile = applicant.mobileNumber ?? applicant.contactNumber;
    }
    if (position?.positionTitle) positionTitle = position.positionTitle;

    if (applicant && !isSilentRevert && !isRejectedFamily) {
      const sms = await notifyApplicationStatusChanged({
        mobile: applicantMobile,
        firstName: applicantFirstName,
        positionTitle,
        status,
        reason,
        applicationId: id,
      });
      if (sms.status === "failed") {
        console.warn("[evaluator/applications/[id] PATCH] SMS failed:", sms.error);
      }
    }
  } catch (e) {
    console.warn("[evaluator/applications/[id] PATCH] SMS notification error", e);
  }

  // EMAIL notification to the applicant — best-effort (sendEmail never
  // throws). REVISED WORKFLOW: two flagged moments — (1) "Under Review" (the
  // explicit evaluator Review action) sends the dedicated under-review notice,
  // and (2) the shortlist decision sends the full shortlist notice (face-to-
  // face hand-off, bring-original-documents). Every other decision gets a
  // simple status notice — EXCEPT a literal "Applied" write, which stays
  // silent (backward-compat revert). All sends are logged to email_logs and
  // visible in the admin Settings → Email panel.
  try {
    if (!isSilentRevert) {
      // MOM step 4: recording the Rejected decision IS the regret moment — the
      // applicant receives the FORMAL regret letter, not a generic status
      // notice. The bulk regrets route dedupes on the "Application regret —"
      // subject prefix, so re-running the batch never double-sends.
      const mail = isRejectedFamily
        ? await emailApplicationRegret({
            email: applicantEmail,
            firstName: applicantFirstName,
            positionTitle,
            applicationId: id,
          })
        : await emailApplicationStatusChanged({
            email: applicantEmail,
            firstName: applicantFirstName,
            positionTitle,
            status,
            reason,
            applicationId: id,
          });
      if (mail.status === "failed") {
        console.warn("[evaluator/applications/[id] PATCH] Email failed:", mail.error);
      }
    }
  } catch (e) {
    console.warn("[evaluator/applications/[id] PATCH] Email notification error", e);
  }

  return ok({ ...updated, status: updated.applicationStatus });
});
