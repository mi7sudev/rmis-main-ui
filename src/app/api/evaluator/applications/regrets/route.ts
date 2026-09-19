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
import { emailApplicationRegret } from "@/lib/email";
import { sendSms } from "@/lib/sms";

// ============================================================================
// MOM (2026-09-03) step 4 — BULK automated regret letters.
//
// "HR sends an automated regret letter to applicants who are declined or not
// shortlisted." The HR workflow this enables: record the decisions first
// (Reject everyone not making the shortlist), then send the regret batch for
// the rejected set in one action from the queue's Rejected tab.
//
// Safety rails:
//   * Shortlisted applications are NEVER sent a regret (hard skip).
//   * An application that ALREADY received a successful regret email (sent or
//     mock — both are durable proofs of delivery in email_logs) is skipped so
//     re-running the batch never double-sends.
//   * A previous FAILED/SKIPPED attempt is retried — the batch is the
//     recovery path for outages.
// ============================================================================

const REGRET_SUBJECT_PREFIX = "Application regret —";
const MAX_BATCH = 200;

const bulkSchema = z.object({
  applicationIds: z.array(z.number().int().positive()).min(1).max(MAX_BATCH),
});

export const POST = handleApi(async (req: NextRequest) => {
  const user = await requireEvaluatorFromReq(req);

  const parsed = bulkSchema.safeParse(await req.json());
  if (!parsed.success) return err("Invalid batch payload", 400, parsed.error.flatten());
  const ids = Array.from(new Set(parsed.data.applicationIds));

  // Prior successful regrets across the whole batch, in ONE query.
  const priorLogs = await db.emailLog.findMany({
    where: {
      relatedType: "application",
      relatedId: { in: ids },
      subject: { startsWith: REGRET_SUBJECT_PREFIX },
      status: { in: ["sent", "mock"] },
    },
    select: { relatedId: true },
  });
  const alreadySent = new Set(
    priorLogs.map((l) => l.relatedId).filter((x): x is number => x != null)
  );

  const results: Array<{
    applicationId: number;
    outcome: "sent" | "already_sent" | "shortlisted" | "not_found" | "no_applicant" | "failed";
    emailStatus?: string;
    smsStatus?: string;
    error?: string;
  }> = [];

  for (const id of ids) {
    const app = await db.application.findUnique({ where: { id } });
    if (!app) {
      results.push({ applicationId: id, outcome: "not_found" });
      continue;
    }
    if (stageForStatus(app.applicationStatus ?? "") === "Shortlisted") {
      results.push({ applicationId: id, outcome: "shortlisted" });
      continue;
    }
    if (alreadySent.has(id)) {
      results.push({ applicationId: id, outcome: "already_sent" });
      continue;
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
    if (!applicant) {
      results.push({ applicationId: id, outcome: "no_applicant" });
      continue;
    }

    const jobId = await findApplicationJobId(id);
    const position = jobId != null ? await loadJobPostingPosition(jobId) : null;
    const positionTitle =
      position?.positionTitle ??
      (jobId != null
        ? (await db.jobPosting.findUnique({ where: { id: jobId }, select: { briefDescription: true } }))
            ?.briefDescription ?? null
        : null) ??
      `application #${id}`;

    const emailResult = await emailApplicationRegret({
      email: applicant.emailAddress,
      firstName: applicant.firstName,
      positionTitle,
      applicationId: id,
    });

    const name = applicant.firstName ? `Hi ${applicant.firstName}` : "Hi";
    const smsResult = await sendSms({
      to: applicant.mobileNumber ?? applicant.contactNumber,
      message: `DOST-MIRDC Recruitment: ${name}, thank you for applying for ${positionTitle}. After careful review, your application was not shortlisted. We encourage you to apply for future vacancies. (automated — do not reply)`.slice(0, 640),
      related: { type: "application", id },
    });

    try {
      const notification = await db.notification.create({
        data: {
          name: `Regret letter — ${positionTitle}`,
          notificationDescription: `Your application for ${positionTitle} was not shortlisted.`,
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
      console.warn("[evaluator/applications/regrets] in-app record failed", e);
    }

    const emailOk = emailResult.status === "sent" || emailResult.status === "mock";
    results.push({
      applicationId: id,
      outcome: emailOk ? "sent" : "failed",
      emailStatus: emailResult.status,
      smsStatus: smsResult.status,
      error: emailResult.error,
    });
  }

  const summary = {
    total: ids.length,
    sent: results.filter((r) => r.outcome === "sent").length,
    alreadySent: results.filter((r) => r.outcome === "already_sent").length,
    shortlisted: results.filter((r) => r.outcome === "shortlisted").length,
    failed: results.filter((r) => r.outcome === "failed" || r.outcome === "no_applicant").length,
    notFound: results.filter((r) => r.outcome === "not_found").length,
  };

  await auditLog({
    userId: user.id,
    userLabel: user.name ? `${user.name} (${user.email})` : user.email,
    userRole: user.role,
    action: "REGRET_LETTERS_BULK_SENT",
    entityType: "application",
    entityId: 0,
    description: `Bulk regret letters: ${summary.sent} sent, ${summary.alreadySent} already sent, ${summary.shortlisted} skipped (shortlisted), ${summary.failed} failed of ${summary.total}`,
    ipAddress: getClientIp(req),
  });

  return ok({ summary, results });
});
