import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { requireApplicantFromReq, getApplicantIdForUser } from "@/lib/auth";
import { verifyMqr, allMet } from "@/lib/mqr";
import {
  loadApplicantFullProfile,
  loadJobPostingPosition,
  findApplicationForApplicantJob,
} from "@/lib/applicant-data";
import { getApplicantCharacterReference } from "@/lib/raw-json";
import {
  validateProfileCompletion,
  completionErrorMessage,
} from "@/lib/profile-completeness";
import { auditLog } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { notifyApplicationSubmitted } from "@/lib/sms";

const applySchema = z.object({ jobId: z.union([z.string(), z.number()]) });

export const POST = handleApi(async (req: NextRequest) => {
  const user = await requireApplicantFromReq(req);
  const applicantId = await getApplicantIdForUser(parseInt(user.id, 10));
  if (!applicantId) return err("Applicant profile not found", 404);

  const parsed = applySchema.safeParse(await req.json());
  if (!parsed.success) return err("jobId is required", 400, parsed.error.flatten());
  const jobId = parseInt(String(parsed.data.jobId), 10);
  if (isNaN(jobId)) return err("Invalid jobId", 400);

  const job = await db.jobPosting.findUnique({ where: { id: jobId } });
  if (!job) return err("Job not found", 404);
  if (job.deadlineDate && job.deadlineDate < new Date()) {
    return err("Application deadline has passed", 400);
  }

  const existing = await findApplicationForApplicantJob(applicantId, jobId);
  if (existing) return err("You have already applied for this position", 409);

  const fullApplicant = await loadApplicantFullProfile(applicantId);
  if (!fullApplicant) return err("Applicant not found", 404);
  // ── Government gate (validated at submission time, server-side): ──
  // The applicant must have a COMPLETE profile before applying. Both the
  // production flag AND the actual data are checked — a profile that was
  // marked complete but later emptied (e.g. education entries deleted)
  // cannot be used to apply. Message wording is matched by the jobs view
  // (/complete your profile/i) to route into the PDS fast-track.
  const completion = await validateProfileCompletion(applicantId);
  if (!fullApplicant.isFillouted || !completion.complete) {
    return err(completionErrorMessage(completion), 400, {
      missing: completion.missingLabels,
      requirements: completion.requirements,
    });
  }

  const position = await loadJobPostingPosition(jobId);

  // Run MQR verification using the production data shape (built by the loader).
  let mqrResults: ReturnType<typeof verifyMqr> | null = null;
  if (position) {
    mqrResults = verifyMqr(
      {
        ...fullApplicant,
        // mqr.ts expects `eligibilities: { eligibilityTitle }[]` — loader provides it
        educations: fullApplicant.educations,
        workExperiences: fullApplicant.workExperiences,
        trainings: fullApplicant.trainings,
        eligibilities: fullApplicant.eligibilities,
      } as never,
      position as never
    );

    // ── Government MQR gate (server-side enforcement) ──
    // The normal apply flow pre-checks this client-side (verify-mqr → failure
    // dialog), but the PDS fast-track used to submit WITHOUT any MQR check.
    // Enforcing here means NO flow — current or future — can submit an
    // application that does not meet the position's Minimum Qualification
    // Requirements (education, eligibility, experience, training).
    if (!allMet(mqrResults)) {
      return err(
        "You do not meet the Minimum Qualification Requirements for this position. Please update your profile.",
        400,
        { mqrResults }
      );
    }
  }

  // Build snapshots of the applicant's profile at application time. These get
  // written to the production `applications.snapshot_*` JSON columns via raw
  // SQL — Prisma can't write Unsupported("json") fields.
  const characterReferenceRaw = getApplicantCharacterReference(applicantId);
  const snapshotProfile = JSON.stringify({
    id: fullApplicant.id,
    firstName: fullApplicant.firstName,
    lastName: fullApplicant.lastName,
    emailAddress: fullApplicant.emailAddress,
    contactNumber: fullApplicant.contactNumber,
    gender: fullApplicant.gender,
    civilStatus: fullApplicant.civilStatus,
    citizenship: fullApplicant.citizenship,
    birthDate: fullApplicant.birthDate,
    presentAddress: fullApplicant.presentAddress,
    city: fullApplicant.city,
    province: fullApplicant.province,
    country: fullApplicant.country,
    characterReference: characterReferenceRaw ? JSON.parse(characterReferenceRaw) : null,
  });
  const snapshotEducations = JSON.stringify(fullApplicant.educations);
  const snapshotExperiences = JSON.stringify(fullApplicant.workExperiences);
  const snapshotTrainings = JSON.stringify(fullApplicant.trainings);
  const snapshotEligibilities = JSON.stringify(fullApplicant.eligibilities);
  const snapshotAwards = JSON.stringify(fullApplicant.awards);

  const now = new Date();
  // Create the application row (without snapshots — Prisma can't write json cols).
  // Production uses capitalized labels for applicationStatus (e.g. "Applied").
  // NOTE: created_by_id / updated_by_id FK references admin_users (not up_users),
  // so we must NOT set them from the applicant's user ID — leave them null.
  const application = await db.application.create({
    data: {
      dateApplied: now,
      applicationStatus: "Applied",
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    },
  });

  // Write snapshot JSON columns via raw SQL.
  // NOTE: production has no `mqr_results` column — we don't persist MQR results.
  // The response includes them for the frontend's immediate use.
  await db.$executeRaw`UPDATE applications SET
    snapshot_profile = ${snapshotProfile},
    snapshot_educations = ${snapshotEducations},
    snapshot_experiences = ${snapshotExperiences},
    snapshot_trainings = ${snapshotTrainings},
    snapshot_eligibilities = ${snapshotEligibilities},
    snapshot_awards = ${snapshotAwards}
  WHERE id = ${application.id}`;

  // Link application ↔ applicant
  await db.applicationApplicantLink.create({
    data: { applicationId: application.id, applicantId, applicationOrd: 0 },
  });
  // Link application ↔ jobPosting
  await db.applicationJobLink.create({
    data: { applicationId: application.id, jobpostingId: jobId, applicationOrd: 0 },
  });

  // Audit: applicant submitted a job application
  await auditLog({
    userId: user.id,
    userLabel: user.name ? `${user.name} (${user.email})` : user.email,
    userRole: user.role,
    action: "APPLICATION_SUBMITTED",
    entityType: "application",
    entityId: application.id,
    description: `Applied for job #${jobId}${position?.positionTitle ? ` — ${position.positionTitle}` : ""}`,
    ipAddress: getClientIp(req),
  });

  // SMS notification — fire after the success path; sendSms never throws so
  // a gateway outage can never break a submitted application. Every attempt
  // (incl. dev "mock") is persisted to sms_logs for the admin panel.
  const sms = await notifyApplicationSubmitted({
    mobile: fullApplicant.mobileNumber ?? fullApplicant.contactNumber,
    firstName: fullApplicant.firstName,
    positionTitle: position?.positionTitle || job.briefDescription || `job #${jobId}`,
    applicationId: application.id,
  });
  if (sms.status === "failed") {
    console.warn("[jobs/apply] SMS notification failed:", sms.error);
  }

  return ok(
    {
      ...application,
      applicantId,
      jobId,
      status: "APPLIED",
      mqrResults: mqrResults,
      position: position
        ? {
            id: position.id,
            positionTitle: position.positionTitle,
            cscEducation: position.cscEducation,
            cscEligibility: position.cscEligibility,
            cscEligibilityGroup: position.cscEligibilityGroup,
            cscWorkExperience: position.cscWorkExperience,
            cscTrainingRequirements: position.cscTrainingRequirements,
          }
        : null,
    },
    201
  );
});
