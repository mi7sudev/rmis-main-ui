import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { requireEvaluatorFromReq } from "@/lib/auth";
import { auditLog } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { assessmentSchema } from "@/lib/validation";
import {
  findApplicationApplicantId,
  findApplicationJobId,
  loadJobPostingPosition,
} from "@/lib/applicant-data";

// Production schema notes for Assessment (`applicant_interview_assessments`):
//   * No `applicationId` or `evaluatorId` columns.
//   * Linked to applicants via `applicant_interview_assessments_applicants_lnk`.
//   * Linked to interviewers via `applicant_interview_assessments_interviewers_lnk`.
//   * `overallAssessmentRating` is a String? (e.g. "Outstanding").
//   * `typeOfApplication` is a String?.
//
// Map: this route's `applicationId` URL param → find the linked applicant →
// find/create an Assessment linked to that applicant + the current evaluator's
// Interviewer record.

async function findOrCreateInterviewerForUser(userId: number) {
  // Check if any Interviewer is already linked to this user via up_users_postion_lnk
  // (production has no direct user↔interviewer junction). Fall back to lookup
  // by the user's name.
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || `User ${user.id}`;
  // Try to find an existing Interviewer with the same name
  const existing = await db.interviewer.findFirst({ where: { name: fullName } });
  if (existing) return existing;
  // Create one
  const now = new Date();
  return db.interviewer.create({
    data: {
      name: fullName,
      position: "Evaluator",
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      // NOTE: created_by_id / updated_by_id FK references admin_users, not up_users.
    },
  });
}

async function findAssessmentForApplicantByInterviewer(
  applicantId: number,
  interviewerId: number
): Promise<{ id: number } | null> {
  const applLinks = await db.assessmentApplicantLink.findMany({ where: { applicantId } });
  const aIds = applLinks
    .map((l) => l.applicantInterviewAssessmentId)
    .filter((x): x is number => x != null);
  if (!aIds.length) return null;
  const intLinks = await db.assessmentInterviewerLink.findMany({
    where: { applicantInterviewAssessmentId: { in: aIds }, interviewerId },
  });
  const matchId = intLinks
    .map((l) => l.applicantInterviewAssessmentId)
    .find((x): x is number => x != null);
  return matchId ? { id: matchId } : null;
}

export const GET = handleApi(async (
  req: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> }
) => {
  const user = await requireEvaluatorFromReq(req);
  const { applicationId: idStr } = await params;
  const applicationId = parseInt(idStr, 10);
  if (isNaN(applicationId)) return err("Invalid applicationId", 400);

  const applicantId = await findApplicationApplicantId(applicationId);
  if (applicantId == null) return ok(null);

  const interviewer = await findOrCreateInterviewerForUser(parseInt(user.id, 10));
  if (!interviewer) return ok(null);

  const found = await findAssessmentForApplicantByInterviewer(applicantId, interviewer.id);
  if (!found) return ok(null);
  const assessment = await db.assessment.findUnique({ where: { id: found.id } });
  return ok(assessment ? { ...assessment, applicationId, applicantId, evaluatorId: user.id } : null);
});

export const POST = handleApi(async (
  req: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> }
) => {
  const user = await requireEvaluatorFromReq(req);
  const { applicationId: idStr } = await params;
  const applicationId = parseInt(idStr, 10);
  if (isNaN(applicationId)) return err("Invalid applicationId", 400);

  const parsed = assessmentSchema.safeParse(await req.json());
  if (!parsed.success) return err("Invalid input", 400, parsed.error.flatten());
  const data = parsed.data;

  const applicantId = await findApplicationApplicantId(applicationId);
  if (applicantId == null) return err("Application not found", 404);

  const interviewer = await findOrCreateInterviewerForUser(parseInt(user.id, 10));
  if (!interviewer) return err("Could not resolve interviewer profile", 500);

  // Resolve the position linked to this application (via applications_job_lnk
  // → jobpostings_postions_lnk → postions). Production data always wrote a
  // row to `applicant_interview_assessments_positions_lnk` for every new
  // assessment, so we replicate that here.
  const jobId = await findApplicationJobId(applicationId);
  const position = jobId != null ? await loadJobPostingPosition(jobId) : null;
  const positionId = position?.id ?? null;

  const existing = await findAssessmentForApplicantByInterviewer(applicantId, interviewer.id);

  // Production stores overall_assessment_rating and type_of_application as
  // free-text varchar using the Title Case convention of the production data (e.g. "Outstanding",
  // "Internal"). The Zod schema already accepts both UPPER_CASE and Title Case
  // forms. Pass the value through unchanged so we don't mangle the user's
  // selection (e.g. "Better than required" → "Better Than Required").
  const overallText = data.overallAssessmentRating ?? null;
  const typeText = data.typeOfApplication ?? null;

  const now = new Date();
  const payload = {
    educationRating: data.educationRating ?? null,
    workExperienceRating: data.workExperienceRating ?? null,
    trainingRating: data.trainingRating ?? null,
    eligibilityRating: data.eligibilityRating ?? null,
    technicalSkillsRating: data.technicalSkillsRating ?? null,
    organizationalAwarenessRating: data.organizationalAwarenessRating ?? null,
    interpersonalSkillsRating: data.interpersonalSkillsRating ?? null,
    adaptabilityRating: data.adaptabilityRating ?? null,
    extraCurricularRating: data.extraCurricularRating ?? null,
    personalDevelopmentRating: data.personalDevelopmentRating ?? null,
    technologyApplicationRating: data.technologyApplicationRating ?? null,
    educationComments: data.educationComments ?? null,
    workExperienceComments: data.workExperienceComments ?? null,
    trainingComments: data.trainingComments ?? null,
    eligibilityComments: data.eligibilityComments ?? null,
    technicalSkillsComments: data.technicalSkillsComments ?? null,
    organizationalAwarenessComments: data.organizationalAwarenessComments ?? null,
    interpersonalSkillsComments: data.interpersonalSkillsComments ?? null,
    adaptabilityComments: data.adaptabilityComments ?? null,
    extraCurricularComments: data.extraCurricularComments ?? null,
    personalDevelopmentComments: data.personalDevelopmentComments ?? null,
    technologyApplicationComments: data.technologyApplicationComments ?? null,
    overallAssessmentRating: overallText,
    commentAndRecommendation: data.commentAndRecommendation ?? null,
    typeOfApplication: typeText,
    year: data.year ?? null,
    updatedAt: now,
    // NOTE: created_by_id / updated_by_id FK references admin_users, not up_users.
    // Do not set them from the evaluator's user ID — leave null.
  };

  let assessment;
  if (existing) {
    assessment = await db.assessment.update({ where: { id: existing.id }, data: payload });
  } else {
    assessment = await db.assessment.create({
      data: {
        ...payload,
        createdAt: now,
        publishedAt: now,
      },
    });
    // Link to applicant
    await db.assessmentApplicantLink.create({
      data: { applicantInterviewAssessmentId: assessment.id, applicantId },
    });
    // Link to interviewer
    await db.assessmentInterviewerLink.create({
      data: { applicantInterviewAssessmentId: assessment.id, interviewerId: interviewer.id },
    });
    // Link to position — production data always wrote this third link row.
    // The junction column is misspelled `postion_id` in the production schema,
    // and the Prisma model mirrors that spelling (`postionId`).
    if (positionId != null) {
      await db.assessmentPositionLink.create({
        data: {
          applicantInterviewAssessmentId: assessment.id,
          postionId: positionId,
          postionOrd: 1,
          applicantInterviewAssessmentOrd: 1,
        },
      });
    }
  }

  // Revised workflow: submitting the credential assessment IS the
  // shortlisting decision. The application is automatically moved to
  // "Shortlisted" (positive outcome) or "Rejected" (when the overall
  // rating is "Unsatisfactory"). There is no longer a separate
  // "Evaluated" stage — the evaluator's review directly produces the
  // final shortlist outcome.
  if (data.overallAssessmentRating) {
    const isUnsatisfactory =
      data.overallAssessmentRating === "Unsatisfactory" ||
      data.overallAssessmentRating === "UNSATISFACTORY";
    const newStatus = isUnsatisfactory ? "Rejected" : "Shortlisted";

    await db.application.update({
      where: { id: applicationId },
      data: {
        applicationStatus: newStatus,
        updatedAt: now,
      },
    });

    await auditLog({
      userId: user.id,
      userLabel: user.name ? `${user.name} (${user.email})` : user.email,
      userRole: user.role,
      action: "ASSESSMENT_SUBMITTED",
      entityType: "application",
      entityId: applicationId,
      description: `Assessment submitted for application ${applicationId}: ${overallText} → ${newStatus}`,
      ipAddress: getClientIp(req),
    });
  }

  return ok({ ...assessment, applicationId, applicantId, evaluatorId: user.id });
});
