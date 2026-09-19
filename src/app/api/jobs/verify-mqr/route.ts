import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { requireApplicantFromReq, getApplicantIdForUser } from "@/lib/auth";
import { verifyMqr, allMet } from "@/lib/mqr";
import {
  loadApplicantFullProfile,
  loadJobPostingPosition,
} from "@/lib/applicant-data";

const schema = z.object({ jobId: z.union([z.string(), z.number()]) });

export const POST = handleApi(async (req: NextRequest) => {
  const user = await requireApplicantFromReq(req);
  const applicantId = await getApplicantIdForUser(parseInt(user.id, 10));
  if (!applicantId) return err("Applicant profile not found", 404);

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return err("jobId is required", 400, parsed.error.flatten());
  const jobId = parseInt(String(parsed.data.jobId), 10);
  if (isNaN(jobId)) return err("Invalid jobId", 400);

  const job = await db.jobPosting.findUnique({ where: { id: jobId } });
  if (!job) return err("Job not found", 404);

  const position = await loadJobPostingPosition(jobId);
  if (!position) return err("Position not found for this job", 404);

  const fullApplicant = await loadApplicantFullProfile(applicantId);
  if (!fullApplicant) return err("Applicant not found", 404);

  const results = verifyMqr(
    {
      ...fullApplicant,
      educations: fullApplicant.educations,
      workExperiences: fullApplicant.workExperiences,
      trainings: fullApplicant.trainings,
      eligibilities: fullApplicant.eligibilities,
    } as never,
    position as never
  );
  return ok({ mqrResults: results, allMet: allMet(results) });
});
