import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleApi } from "@/lib/api";
import { requireEvaluatorFromReq } from "@/lib/auth";
import { paginationSchema, type Paginated } from "@/lib/validation";
import { QUERYABLE_STATUSES } from "@/lib/status";
import {
  findApplicationApplicantId,
  findApplicationJobId,
  loadJobPostingPosition,
  loadPositionPlaceOfAssignment,
} from "@/lib/applicant-data";
import { getApplicationsSnapshotCore } from "@/lib/raw-json";
import { parseSnapshotArray } from "@/lib/snapshot";
import {
  buildRequirementsReport,
  type RequirementsReport,
} from "@/lib/requirements";

export const GET = handleApi(async (req: NextRequest) => {
  await requireEvaluatorFromReq(req);
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const { page, pageSize } = paginationSchema.parse({
    page: url.searchParams.get("page") ?? 1,
    pageSize: url.searchParams.get("pageSize") ?? 50,
  });

  // Default ("All" tab): return EVERY application regardless of status.
  // The frontend filters client-side per tab, and ALL status tabs — including
  // Approved / Rejected / Declined / Needs Correction — must be reachable so
  // that finalized applications don't vanish from the queue after the
  // evaluator acts on them. Previously, excluding terminal statuses here
  // caused approved/rejected apps to completely disappear, leaving the
  // evaluator with no way to review or revisit them.
  const where = status && (QUERYABLE_STATUSES as readonly string[]).includes(status)
    ? { applicationStatus: status }
    : {};

  const [apps, total] = await Promise.all([
    db.application.findMany({
      where,
      orderBy: { dateApplied: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.application.count({ where }),
  ]);

  // ---- REQUIREMENTS MATCH (batch) — one raw read for the whole page ----
  // Precompute the CSC standards per job id, then run the requirements engine
  // over each application's credential snapshots so every queue row carries a
  // compact match verdict (the kanban/list badge). Positions cache per jobId —
  // many applications share the same posting.
  const jobIds = (
    await Promise.all(apps.map((app) => findApplicationJobId(app.id)))
  ).filter((x): x is number => x != null);
  const uniqueJobIds = Array.from(new Set(jobIds));
  const positionByJobId = new Map<
    number,
    Awaited<ReturnType<typeof loadJobPostingPosition>>
  >();
  await Promise.all(
    uniqueJobIds.map(async (jobId) => {
      positionByJobId.set(jobId, await loadJobPostingPosition(jobId));
    }),
  );
  const snapshotCore = getApplicationsSnapshotCore(apps.map((a) => a.id));

  // For each application, load applicant + job + position + placeOfAssignment
  // (all via junction tables) plus the compact requirements-match verdict.
  type MatchSummary = {
    verdict: RequirementsReport["verdict"];
    metCount: number;
    requiredCount: number;
  } | null;
  type QueueItem = (typeof apps)[number] & {
    status: string | null;
    applicant: {
      id: number; firstName: string | null; lastName: string | null;
      emailAddress: string | null; contactNumber: string | null;
      gender: string | null; isProfileComplete: boolean;
    } | null;
    job: {
      id: number; title: string | null;
      position: { positionTitle: string | null; placeOfAssignment: { name: string | null } | null } | null;
    } | null;
    match: MatchSummary;
  };
  const data: QueueItem[] = [];
  for (const app of apps) {
    const applicantId = await findApplicationApplicantId(app.id);
    let applicant: { id: number; firstName: string | null; lastName: string | null; emailAddress: string | null; contactNumber: string | null; gender: string | null; isProfileComplete: boolean } | null = null;
    if (applicantId != null) {
      const a = await db.applicant.findUnique({
        where: { id: applicantId },
        select: { id: true, firstName: true, lastName: true, emailAddress: true, contactNumber: true, gender: true, isFillouted: true },
      });
      if (a) {
        applicant = { ...a, isProfileComplete: a.isFillouted ?? false };
      }
    }

    const jobId = await findApplicationJobId(app.id);
    let job: { id: number; title: string | null; position: { positionTitle: string | null; placeOfAssignment: { name: string | null } | null } | null } | null = null;
    if (jobId != null) {
      const position = positionByJobId.get(jobId) ?? null;
      const j = await db.jobPosting.findUnique({ where: { id: jobId }, select: { id: true, briefDescription: true } });
      let placeOfAssignment: { name: string | null } | null = null;
      if (position) {
        const places = await loadPositionPlaceOfAssignment(position.id);
        if (places[0]) placeOfAssignment = { name: places[0].name };
      }
      if (j) {
        job = {
          id: j.id,
          title: position?.positionTitle ?? j.briefDescription ?? null,
          position: position
            ? { positionTitle: position.positionTitle, placeOfAssignment }
            : null,
        };
      }
    }

    // Compact match verdict for the queue badge (kanban card / list row).
    const core = snapshotCore.get(app.id);
    const position = jobId != null ? positionByJobId.get(jobId) ?? null : null;
    const report = core
      ? buildRequirementsReport(
          position
            ? {
                cscEducation: position.cscEducation,
                cscWorkExperience: position.cscWorkExperience,
                cscTrainingRequirements: position.cscTrainingRequirements,
                cscEligibilityGroup: position.cscEligibilityGroup,
              }
            : null,
          {
            educations: parseSnapshotArray(core.educations),
            experiences: parseSnapshotArray(core.experiences),
            trainings: parseSnapshotArray(core.trainings),
            eligibilities: parseSnapshotArray(core.eligibilities),
          },
        )
      : null;
    const match: MatchSummary = report
      ? { verdict: report.verdict, metCount: report.metCount, requiredCount: report.requiredCount }
      : null;

    data.push({
      ...app,
      status: app.applicationStatus,
      applicant,
      job,
      match,
    });
  }

  const result: Paginated<typeof data[number]> = {
    data,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  };
  return ok(result);
});
