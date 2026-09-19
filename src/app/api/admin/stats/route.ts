import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleApi } from "@/lib/api";
import { requireAdminFromReq } from "@/lib/auth";
import { queryAuditLogs } from "@/lib/audit-db";

// Production schema notes:
//   * User table has NO `role` column — roles are derived from
//     `up_users.is_admin` (ADMIN) or via the `up_users_role_lnk` junction
//     (APPLICANT if linked to role_id=3, otherwise EVALUATOR).
//   * JobPosting has NO `isActive` — publishedAt != null means "active".
//   * Application has `applicationStatus` (String?), not `status` enum.
//
// Stats are computed directly against the production tables.
// "Needs Attention" metrics (failedLogins24h, deadlinesThisWeek, blockedUsers,
// incompleteProfiles) are computed here so the dashboard can surface actionable
// counts instead of duplicating the topbar navigation.

export const GET = handleApi(async (req: NextRequest) => {
  await requireAdminFromReq(req);

  // 24h ago ISO string — for the failed-logins query against audit.db
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  // 7 days from now — for the deadlines-this-week query
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    adminCount,
    applicantRoleLinkCount,
    activeJobs,
    totalApplications,
    pendingReview,
    shortlisted,
    rejected,
    blockedUsers,
    incompleteProfiles,
    deadlinesThisWeek,
    failedLoginsResult,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { isAdmin: true } }),
    db.userRoleLink.count({ where: { roleId: 3 } }),
    db.jobPosting.count({ where: { publishedAt: { not: null } } }),
    db.application.count(),
    // REVISED WORKFLOW: "awaiting review" = every application that has NOT
    // reached a shortlist decision yet — new applications plus every legacy
    // mid-process spelling (For Evaluation / Screening / Under Review /
    // Final Review / Evaluated) and rows with no status at all. The evaluator
    // reviews credentials/documents and records Shortlisted / Rejected.
    db.application.count({
      where: {
        OR: [
          { applicationStatus: null },
          {
            applicationStatus: {
              in: [
                "Applied", "APPLIED",
                "Pending", "PENDING",
                "For Evaluation", "FOR_EVALUATION",
                "Screening", "SCREENING",
                "Under Review", "UNDER_REVIEW",
                "Evaluation", "EVALUATION",
                "Evaluated", "EVALUATED",
                "Final Review", "FINAL_REVIEW",
                "Needs Correction", "NEEDS_CORRECTION",
              ],
            },
          },
        ],
      },
    }),
    // Revised workflow: the pipeline ends at "Shortlisted". The evaluator's
    // credential assessment directly produces the shortlist decision.
    db.application.count({
      where: { applicationStatus: { in: ["SHORTLISTED", "Shortlisted"] } },
    }),
    db.application.count({
      where: { applicationStatus: { in: ["REJECTED", "Rejected"] } },
    }),
    // Blocked users (soft-disabled accounts)
    db.user.count({ where: { blocked: true } }),
    // Applicants with incomplete profiles. isFillouted is the production
    // column; it is NULL for applicants who never started their profile and
    // false (0) for those who started but haven't finished. Prisma's
    // { not: true } does NOT match NULL rows, so we need an explicit OR to
    // count both NULL and false as incomplete.
    db.applicant.count({
      where: { OR: [{ isFillouted: null }, { isFillouted: false }] },
    }),
    // Published jobs with a deadline in the next 7 days
    db.jobPosting.count({
      where: {
        publishedAt: { not: null },
        deadlineDate: { gte: now, lte: sevenDaysFromNow },
      },
    }),
    // Failed logins in the last 24h — from the dedicated audit.db
    Promise.resolve(
      queryAuditLogs({
        action: "LOGIN_FAILED",
        startDate: twentyFourHoursAgo,
        limit: 1,
        offset: 0,
      }).total,
    ),
  ]);

  const failedLogins24h = failedLoginsResult;

  // "applicants" ≈ users linked to role_id=3 (the "applicants" role in `up_roles`)
  const applicants = applicantRoleLinkCount;
  // "evaluators" ≈ non-admin, non-applicant authenticated users (approximation)
  const evaluators = Math.max(0, totalUsers - adminCount - applicants);

  // Group by applicationStatus (string column)
  const grouped = await db.application.groupBy({ by: ["applicationStatus"], _count: true });
  const byStatus = grouped.map((g) => ({
    status: g.applicationStatus ?? "(none)",
    count: g._count,
  }));

  // Recent applications — join applicant + jobPosting via junction tables
  const recentApps = await db.application.findMany({
    take: 8,
    orderBy: { dateApplied: "desc" },
  });
  type RecentItem = {
    id: number;
    dateApplied: Date | null;
    status: string | null;
    applicantId: number | null;
    applicant: { firstName: string | null; lastName: string | null } | null;
    job: { title: string | null } | null;
  };
  const recent: RecentItem[] = [];
  for (const app of recentApps) {
    // Find applicant
    const applLink = await db.applicationApplicantLink.findFirst({ where: { applicationId: app.id } });
    let applicant: { firstName: string | null; lastName: string | null } | null = null;
    let applicantId: number | null = applLink?.applicantId ?? null;
    if (applLink?.applicantId != null) {
      const a = await db.applicant.findUnique({
        where: { id: applLink.applicantId },
        select: { firstName: true, lastName: true },
      });
      if (a) applicant = a;
    }
    // Find job
    const jobLink = await db.applicationJobLink.findFirst({ where: { applicationId: app.id } });
    let job: { title: string | null } | null = null;
    if (jobLink?.jobpostingId != null) {
      const j = await db.jobPosting.findUnique({
        where: { id: jobLink.jobpostingId },
        select: { id: true, briefDescription: true },
      });
      if (j) {
        // Pull the linked position to get the title
        const posLink = await db.jobPostingPositionLink.findFirst({ where: { jobpostingId: j.id } });
        let title: string | null = j.briefDescription ?? null;
        if (posLink?.postionId != null) {
          const p = await db.position.findUnique({
            where: { id: posLink.postionId },
            select: { positionTitle: true },
          });
          if (p?.positionTitle) title = p.positionTitle;
        }
        job = { title };
      }
    }
    recent.push({
      id: app.id,
      dateApplied: app.dateApplied,
      status: app.applicationStatus,
      applicantId,
      applicant,
      job,
    });
  }

  return ok({
    totalUsers,
    applicants,
    evaluators,
    admins: adminCount,
    activeJobs,
    totalApplications,
    pendingReview,
    shortlisted,
    rejected,
    byStatus,
    recent,
    // "Needs Attention" metrics — surface actionable counts on the dashboard
    // instead of duplicating the topbar navigation.
    failedLogins24h,
    deadlinesThisWeek,
    blockedUsers,
    incompleteProfiles,
  });
});
