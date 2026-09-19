import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { requireApplicantFromReq, getApplicantIdForUser } from "@/lib/auth";
import {
  findApplicationsForApplicant,
  findApplicationJobId,
  loadJobPostingPosition,
  loadPositionPlaceOfAssignment,
} from "@/lib/applicant-data";

// Returns the applicant's applications, joined with the linked jobPosting,
// position, and place of assignment (all via junction tables).

export const GET = handleApi(async (req: NextRequest) => {
  const user = await requireApplicantFromReq(req);
  const applicantId = await getApplicantIdForUser(parseInt(user.id, 10));
  if (!applicantId) return err("Applicant profile not found", 404);

  const applications = await findApplicationsForApplicant(applicantId);

  // Batch-load jobPosting links for all applications, then the JobPosting rows
  // and their linked positions.
  const appIds = applications.map((a) => a.id);
  const jobLinks = appIds.length
    ? await db.applicationJobLink.findMany({ where: { applicationId: { in: appIds } } })
    : [];
  const jobIdByApp = new Map<number, number | null>();
  for (const link of jobLinks) {
    if (link.applicationId != null && !jobIdByApp.has(link.applicationId)) {
      jobIdByApp.set(link.applicationId, link.jobpostingId ?? null);
    }
  }
  const jobIds = Array.from(new Set(
    Array.from(jobIdByApp.values()).filter((x): x is number => x != null)
  ));
  const jobs = jobIds.length
    ? await db.jobPosting.findMany({ where: { id: { in: jobIds } } })
    : [];
  const jobById = new Map(jobs.map((j) => [j.id, j]));

  // For each job, load its position + placeOfAssignment
  const jobPositionMap = new Map<number, Awaited<ReturnType<typeof loadJobPostingPosition>>>();
  for (const jobId of jobIds) {
    jobPositionMap.set(jobId, await loadJobPostingPosition(jobId));
  }
  const positionIds = Array.from(new Set(
    Array.from(jobPositionMap.values())
      .filter((p): p is NonNullable<typeof p> => p != null)
      .map((p) => p.id)
  ));
  const placeByPosition = new Map<number, { id: number; name: string | null } | null>();
  for (const pid of positionIds) {
    const places = await loadPositionPlaceOfAssignment(pid);
    placeByPosition.set(pid, places[0] ? { id: places[0].id, name: places[0].name } : null);
  }

  // Load assessments linked to each application (via AssessmentApplicantLink —
  // production stores assessments against the applicant, not the application,
  // but the original semantics were "assessments for this application").
  // For backwards compat with the frontend, expose `assessments: []` for now —
  // the evaluator endpoints build the real list.
  const result = applications.map((app) => {
    const jobId = jobIdByApp.get(app.id) ?? null;
    const job = jobId ? jobById.get(jobId) ?? null : null;
    const position = jobId ? jobPositionMap.get(jobId) ?? null : null;
    const placeOfAssignment = position ? placeByPosition.get(position.id) ?? null : null;
    return {
      ...app,
      // Frontend expects `status` (alias for applicationStatus)
      status: app.applicationStatus,
      job: job
        ? {
            ...job,
            title: position?.positionTitle ?? job.briefDescription ?? null,
            position: position
              ? { ...position, placeOfAssignment }
              : null,
          }
        : null,
      assessments: [],
    };
  });

  return ok(result);
});
