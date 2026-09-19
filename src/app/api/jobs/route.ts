import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { getSessionFromReq, requireEvaluatorFromReq, getApplicantIdForUser } from "@/lib/auth";
import { sanitizeHtml } from "@/lib/sanitize";
import { jobCreateSchema } from "@/lib/validation";
import { auditLog } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import {
  batchLoadJobPostingPositions,
  batchLoadPositionPlaceOfAssignment,
  findApplicationsForApplicantList,
  loadJobPostingPosition,
  loadPositionPlaceOfAssignment,
} from "@/lib/applicant-data";

// Production schema notes:
//   * JobPosting has NO `isActive`, `authorId`, `positionId`, or `title` field.
//     - "active" job = publishedAt is not null (publication-state convention)
//     - "author" = createdById (legacy audit field)
//     - "position" = linked via `jobpostings_postions_lnk` junction
//     - "title" is sourced from the linked Position's `positionTitle`
//   * Rich-text fields are `*_richtext` columns on JobPosting (String?).

export const GET = handleApi(async (req: NextRequest) => {
  const session = await getSessionFromReq(req);
  const url = new URL(req.url);
  const mine = url.searchParams.get("mine") === "true";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10) || 100, 200);

  // MOM (2026-09-03) — job-posting visibility: a vacancy must leave the public
  // listing the day after its closing date (closing Sep 30 → hidden Oct 1).
  // HR (ADMIN/EVALUATOR) keeps full visibility so postings can still be
  // managed after expiry; applicants and anonymous visitors only see postings
  // whose deadline is today or later (date-level compare, server-local time).
  const isHrViewer =
    !!session && (session.role === "ADMIN" || session.role === "EVALUATOR");
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  // "Active" jobs = published (publishedAt IS NOT NULL). For non-HR viewers
  // the listing additionally excludes expired postings.
  const allJobs = await db.jobPosting.findMany({
    where: { publishedAt: { not: null } },
    orderBy: { publishDate: "desc" },
    take: limit,
  });
  const jobs = isHrViewer
    ? allJobs
    : allJobs.filter((j) => !j.deadlineDate || j.deadlineDate >= startOfToday);

  if (!jobs.length) return ok([]);

  const jobIds = jobs.map((j) => j.id);

  // Batch-load all relations in parallel (eliminates N+1 loop)
  const [positionMap, myApplicantId] = await Promise.all([
    batchLoadJobPostingPositions(jobIds),
    session ? getApplicantIdForUser(parseInt(session.id, 10)) : Promise.resolve(null),
  ]);

  // Batch-load places of assignment for all positions
  const positionIds = Array.from(positionMap.values()).flatMap((p) =>
    p != null ? [p.id] : []
  );
  const placeMap = await batchLoadPositionPlaceOfAssignment(positionIds);

  // Batch-load authors (users who created the jobs)
  const authorIds = jobs
    .map((j) => j.createdById)
    .filter((x): x is number => x != null);
  const authors = authorIds.length
    ? await db.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const authorById = new Map(authors.map((a) => [a.id, a]));

  // Batch-load ALL application links for these jobs (not just the viewer's
  // own) so the admin/evaluator Jobs management table can show the real total
  // application count per job. `applications` (below) only holds the viewer's
  // own applications (for the applicant-facing "Applied" badge); this
  // `applicationCountMap` holds the true total for every viewer.
  const allJobLinks = await db.applicationJobLink.findMany({
    where: { jobpostingId: { in: jobIds } },
    select: { jobpostingId: true, applicationId: true },
  });
  const applicationCountMap = new Map<number, number>();
  for (const link of allJobLinks) {
    if (link.jobpostingId != null && link.applicationId != null) {
      applicationCountMap.set(
        link.jobpostingId,
        (applicationCountMap.get(link.jobpostingId) ?? 0) + 1,
      );
    }
  }

  // Hoist: fetch this applicant's applications ONCE (not per-job)
  let myApplicationIds: number[] = [];
  let myJobApplicationMap = new Map<number, { id: number; status: string | null }[]>();
  if (session && myApplicantId) {
    myApplicationIds = await findApplicationsForApplicantList(myApplicantId);
    if (myApplicationIds.length) {
      // Find which of my applications link to which jobs
      const myJobLinks = await db.applicationJobLink.findMany({
        where: { applicationId: { in: myApplicationIds }, jobpostingId: { in: jobIds } },
      });
      const myApps = await db.application.findMany({
        where: { id: { in: myApplicationIds } },
        select: { id: true, applicationStatus: true },
      });
      const appById = new Map(myApps.map((a) => [a.id, a]));

      // Group applications by jobpostingId
      for (const link of myJobLinks) {
        if (link.jobpostingId == null || link.applicationId == null) continue;
        const list = myJobApplicationMap.get(link.jobpostingId) ?? [];
        const app = appById.get(link.applicationId);
        if (app) list.push({ id: app.id, status: app.applicationStatus });
        myJobApplicationMap.set(link.jobpostingId, list);
      }
    }
  }

  // For "mine" filter: only include jobs the user has applied to
  if (mine && session) {
    const mineJobIds = new Set(myJobApplicationMap.keys());
    const filtered = jobs.filter((j) => mineJobIds.has(j.id));
    return ok(buildJobList(filtered, positionMap, placeMap, authorById, myJobApplicationMap, applicationCountMap));
  }

  return ok(buildJobList(jobs, positionMap, placeMap, authorById, myJobApplicationMap, applicationCountMap));
});

function buildJobList(
  jobs: Array<{ id: number; createdById: number | null; publishedAt: Date | null; briefDescription: string | null } & Record<string, unknown>>,
  positionMap: Map<number, ({ id: number; positionTitle: string | null } & Record<string, unknown>) | null>,
  placeMap: Map<number, { id: number; name: string | null }>,
  authorById: Map<number, { firstName: string | null; lastName: string | null }>,
  myJobApplicationMap: Map<number, { id: number; status: string | null }[]>,
  applicationCountMap: Map<number, number>,
) {
  return jobs.map((job) => {
    const position = positionMap.get(job.id) ?? null;
    const placeOfAssignment = position ? (placeMap.get(position.id) ?? null) : null;
    const author = job.createdById != null ? (authorById.get(job.createdById) ?? null) : null;
    const raw = job as unknown as Record<string, unknown>;
    return {
      ...job,
      title: position?.positionTitle ?? job.briefDescription ?? null,
      isActive: job.publishedAt != null,
      position,
      placeOfAssignment,
      author,
      // `applications` = the VIEWER's own applications on this job (for the
      // applicant-facing "Applied" badge). Empty for admin/evaluator viewers.
      applications: myJobApplicationMap.get(job.id) ?? [],
      // `applicationCount` = the TOTAL number of applications on this job
      // (all applicants). Used by the admin/evaluator Jobs management table.
      applicationCount: applicationCountMap.get(job.id) ?? 0,
      // Legacy rich-text columns are stored as *_richtext; the UI
      // contract uses *Html names — map them here so views render content.
      briefDescriptionHtml: (raw.briefDescriptionRichtext as string | null) ?? null,
      dutiesResponsibilitiesHtml: job.dutiesResponsibilities ?? null,
      compensationPackageHtml: (raw.compensationPackageRichtext as string | null) ?? null,
      otherQualificationsHtml: (raw.otherQualificationsRichtext as string | null) ?? null,
    };
  });
}

export const POST = handleApi(async (req: NextRequest) => {
  const user = await requireEvaluatorFromReq(req);
  const parsed = jobCreateSchema.safeParse(await req.json());
  if (!parsed.success) return err("Invalid input", 400, parsed.error.flatten());
  const d = parsed.data;

  const now = new Date();
  const job = await db.jobPosting.create({
    data: {
      // Publication state — new admin-created jobs are immediately published
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
      // created_by_id/updated_by_id FK to admin_users (legacy admin accounts) — web
      // admins have no admin_users row, so leave them NULL like legacy rows.
      createdById: null,
      updatedById: null,
      positionType: d.positionType || null,
      dutiesResponsibilities: d.dutiesResponsibilities || null,
      briefDescription: d.briefDescription || null,
      briefDescriptionRichtext: sanitizeHtml(d.briefDescriptionHtml),
      compensationPackage: d.compensationPackage || null,
      compensationPackageRichtext: sanitizeHtml(d.compensationPackageHtml),
      otherQualifications: d.otherQualifications || null,
      otherQualificationsRichtext: sanitizeHtml(d.otherQualificationsHtml),
      numberOfVacancy: d.numberOfVacancy,
      publishDate: d.publishDate ? new Date(d.publishDate) : now,
      deadlineDate: d.deadlineDate ? new Date(d.deadlineDate) : null,
      processingDate: d.processingDate ? new Date(d.processingDate) : null,
    },
  });

  // Link to a position if one was specified. The poster qualification vitals
  // (division, CSC MQR columns, license) live on the POSITION master row, so
  // they are written through to it — and when no position was selected but
  // the form carries those details, a position master row is created and
  // linked so nothing the HR user filled in is silently dropped.
  const qualificationData = {
    division: d.division?.trim() || null,
    cscEducation: d.education?.trim() || null,
    cscWorkExperience: d.experience?.trim() || null,
    cscTrainingRequirements: d.training?.trim() || null,
    cscEligibilityGroup: d.eligibility?.trim() || null,
    specialSkill: d.license?.trim() || null,
  };
  const hasQualifications = Object.values(qualificationData).some((v) => v != null);

  // Position rows created by the web form are immediately published so the
  // batch loaders (which don't filter, but consistency matters for parity
  // with the existing production rows) and future admin screens treat them
  // like legacy master rows.
  type PositionRow = NonNullable<Awaited<ReturnType<typeof db.position.findUnique>>>;
  let position: PositionRow | null = null;
  if (d.positionId) {
    const posId = parseInt(d.positionId, 10);
    if (!isNaN(posId)) {
      await db.jobPostingPositionLink.create({
        data: { jobpostingId: job.id, postionId: posId, postionOrd: 0 },
      });
      if (hasQualifications) {
        await db.position.update({ where: { id: posId }, data: qualificationData });
      }
      position = await db.position.findUnique({ where: { id: posId } });
    }
  }
  if (!position && hasQualifications) {
    position = await db.position.create({
      data: {
        positionTitle: d.title,
        ...qualificationData,
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
      },
    });
    await db.jobPostingPositionLink.create({
      data: { jobpostingId: job.id, postionId: position.id, postionOrd: 0 },
    });
  }
  if (!position) {
    position = await loadJobPostingPosition(job.id);
  }

  let placeOfAssignment: { id: number; name: string | null } | null = null;
  if (position) {
    const places = await loadPositionPlaceOfAssignment(position.id);
    if (places[0]) placeOfAssignment = { id: places[0].id, name: places[0].name };
  }

  // Audit: job posting created (by admin or evaluator)
  await auditLog({
    userId: user.id,
    userLabel: user.name ? `${user.name} (${user.email})` : user.email,
    userRole: user.role,
    action: "JOB_POSTING_CREATED",
    entityType: "job",
    entityId: job.id,
    description: `Created job posting #${job.id}${position?.positionTitle ? ` — ${position.positionTitle}` : ""}`,
    ipAddress: getClientIp(req),
  });

  return ok(
    {
      ...job,
      title: position?.positionTitle ?? job.briefDescription ?? null,
      isActive: job.publishedAt != null,
      position,
      placeOfAssignment,
    },
    201
  );
});
