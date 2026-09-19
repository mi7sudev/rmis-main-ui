import { NextRequest } from "next/server";
import { ok, err, handleApi } from "@/lib/api";
import { requireEvaluatorFromReq } from "@/lib/auth";
import {
  loadApplicantFullProfile,
  fillEligibilityTitleFromSpecificLinks,
  findApplicationsForApplicant,
  loadJobPostingPosition,
} from "@/lib/applicant-data";
import { listApplicantDocuments } from "@/lib/documents";
import { db } from "@/lib/db";

// ============================================================================
// GET /api/admin/applicants/[id]
//
// Returns the FULL live applicant profile — the core Applicant row, all five
// child sections (educations, work experiences, trainings, eligibilities,
// awards), character references, uploaded documents, and the applicant's
// application history (with resolved job/position titles).
//
// Auth: EVALUATOR + ADMIN (requireEvaluatorFromReq allows both). This is the
// data source for the "Applicant Details" page accessible to evaluators and
// admins — a read-only, comprehensive view of an applicant's credentials,
// profile sections, and uploaded documents.
//
// NOTE: This reads LIVE data (the current Applicant + child rows), NOT the
// frozen snapshots captured at application time. The evaluator-review page
// shows snapshots; this page shows the live, editable profile.
// ============================================================================

export const GET = handleApi(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requireEvaluatorFromReq(req);

  const { id } = await ctx.params;
  const applicantId = parseInt(id, 10);
  if (!Number.isInteger(applicantId) || applicantId <= 0) {
    return err("Invalid applicant ID", 400);
  }

  const profile = await loadApplicantFullProfile(applicantId);
  if (!profile) return err("Applicant not found", 404);

  // Backfill eligibility titles via the production specific_eligibilities
  // link chain (loadApplicantEligibilities only reads the category link,
  // which has 0 rows in production — so titles would be null without this).
  await fillEligibilityTitleFromSpecificLinks(profile.eligibilities);

  // Sort child sections for consistent display (mirrors the applicant-facing
  // API routes: work experiences = present-first then dateFrom desc, etc.).
  profile.workExperiences.sort((a, b) => {
    if (a.isPresentWork && !b.isPresentWork) return -1;
    if (!a.isPresentWork && b.isPresentWork) return 1;
    const aTime = a.inclusiveDateFrom?.getTime() ?? 0;
    const bTime = b.inclusiveDateFrom?.getTime() ?? 0;
    return bTime - aTime;
  });
  profile.trainings.sort((a, b) => {
    const aTime = a.inclusiveDateFrom?.getTime() ?? 0;
    const bTime = b.inclusiveDateFrom?.getTime() ?? 0;
    return bTime - aTime;
  });
  profile.eligibilities.sort((a, b) => {
    const aTime = a.examDate?.getTime() ?? 0;
    const bTime = b.examDate?.getTime() ?? 0;
    return bTime - aTime;
  });
  profile.awards.sort((a, b) => {
    // dateGranted is stored as TEXT ("YYYY-MM-DD") — string sort is correct.
    return (b.dateGranted ?? "").localeCompare(a.dateGranted ?? "");
  });

  // Load uploaded documents from the filesystem sidecar JSON files.
  const documents = await listApplicantDocuments(applicantId);

  // Load the applicant's application history (with resolved job + position).
  const applications = await findApplicationsForApplicant(applicantId);
  const applicationsWithJob = await Promise.all(
    applications.map(async (app) => {
      // Resolve the linked job posting (via applications_job_lnk).
      const jobLink = await db.applicationJobLink.findFirst({ where: { applicationId: app.id } });
      const jobpostingId = jobLink?.jobpostingId ?? null;
      let positionTitle: string | null = null;
      if (jobpostingId) {
        const position = await loadJobPostingPosition(jobpostingId);
        positionTitle = position?.positionTitle ?? null;
      }
      return {
        id: app.id,
        status: app.applicationStatus,
        dateApplied: app.dateApplied,
        jobId: jobpostingId,
        positionTitle,
      };
    })
  );

  // Parse character references (stored as a JSON column — read via raw SQL
  // in loadApplicantFullProfile as characterReferenceRaw). The column may
  // contain a JSON array, a JSON object, a plain string, or be null/empty.
  // Normalize to an array (or null) so the frontend can safely .map() it.
  let characterReferences: unknown[] | null = null;
  if (profile.characterReferenceRaw) {
    try {
      const parsed = JSON.parse(profile.characterReferenceRaw);
      if (Array.isArray(parsed)) {
        characterReferences = parsed;
      } else if (parsed && typeof parsed === "object") {
        // Single object instead of array — wrap it.
        characterReferences = [parsed];
      } else {
        characterReferences = null;
      }
    } catch {
      characterReferences = null;
    }
  }

  return ok({
    id: profile.id,
    // Identity
    firstName: profile.firstName,
    middleName: profile.middleName,
    lastName: profile.lastName,
    extensionName: profile.extensionName,
    // Contact
    emailAddress: profile.emailAddress,
    contactNumber: profile.contactNumber,
    mobileNumber: profile.mobileNumber?.toString() ?? null,
    // Demographics
    gender: profile.gender,
    civilStatus: profile.civilStatus,
    citizenship: profile.citizenship,
    birthDate: profile.birthDate,
    birthPlace: profile.birthPlace,
    // Address
    presentAddress: profile.presentAddress,
    city: profile.city,
    province: profile.province,
    country: profile.country,
    zipCode: profile.zipCode,
    // Status
    isProfileComplete: profile.isFillouted ?? false,
    // Full child sections (live data)
    educations: profile.educations,
    workExperiences: profile.workExperiences,
    trainings: profile.trainings,
    eligibilities: profile.eligibilities,
    awards: profile.awards,
    // Character references (parsed JSON)
    characterReferences,
    // Uploaded documents (filesystem sidecar metadata)
    documents,
    // Application history
    applications: applicationsWithJob,
  });
});
