// =============================================================================
// RMIS — Profile Completeness Validation (Server-Side Government Gate)
// =============================================================================
// GOVERNMENT RECRUITMENT RULE: an applicant MUST have a complete profile
// before submitting a job application. Browsing the job board is open to
// everyone, but the "apply" action is hard-gated.
//
// This module is the SINGLE SERVER-SIDE SOURCE OF TRUTH for what "complete"
// means. Every path that flips the production `is_fillouted` flag — the
// manual "Mark Complete" button (PUT /api/applicant/profile), the PDS
// fast-track (POST /api/applicant/profile/complete) — must pass through
// here, and the apply endpoint re-validates at submission time so a profile
// that was emptied after being marked complete cannot be used to apply.
//
// The completion rule mirrors the requirement stated in the profile UI:
//   • Personal information : first name, last name, email address
//   • Education            : at least one (1) entry
//   • Work experience      : at least one (1) entry
// =============================================================================

import { db } from "@/lib/db";
import {
  loadApplicantEducations,
  loadApplicantWorkExperiences,
} from "@/lib/applicant-data";

export type CompletionRequirementId = "personal" | "education" | "work";

export type CompletionRequirement = {
  id: CompletionRequirementId;
  label: string;
  met: boolean;
};

export type ProfileCompletion = {
  complete: boolean;
  requirements: CompletionRequirement[];
  /** Human-readable list of unmet requirements (for error messages / UI). */
  missingLabels: string[];
};

export async function validateProfileCompletion(
  applicantId: number
): Promise<ProfileCompletion> {
  const applicant = await db.applicant.findUnique({
    where: { id: applicantId },
    select: { firstName: true, lastName: true, emailAddress: true },
  });
  if (!applicant) throw new Error("Applicant not found");

  // Promise.allSettled-style resilience: a corrupted section row (e.g. TEXT
  // in a DateTime column from an older auto-apply run) must not 500 the whole
  // gate — an empty section simply reads as "not met".
  const [educations, workExperiences] = await Promise.all([
    loadApplicantEducations(applicantId).catch(() => []),
    loadApplicantWorkExperiences(applicantId).catch(() => []),
  ]);

  const personalMet = Boolean(
    String(applicant.firstName ?? "").trim() &&
      String(applicant.lastName ?? "").trim() &&
      String(applicant.emailAddress ?? "").trim()
  );

  const requirements: CompletionRequirement[] = [
    {
      id: "personal",
      label: "Personal information (first name, last name, email)",
      met: personalMet,
    },
    {
      id: "education",
      label: "At least one education entry",
      met: educations.length > 0,
    },
    {
      id: "work",
      label: "At least one work experience entry",
      met: workExperiences.length > 0,
    },
  ];

  return {
    complete: requirements.every((r) => r.met),
    requirements,
    missingLabels: requirements.filter((r) => !r.met).map((r) => r.label),
  };
}

/**
 * User-facing error message for an incomplete profile. Wording deliberately
 * starts with "Please complete your profile" — the jobs view routes failed
 * applications matching /complete your profile/i into the PDS fast-track.
 */
export function completionErrorMessage(completion: ProfileCompletion): string {
  return `Please complete your profile before applying. Still required: ${completion.missingLabels.join("; ")}.`;
}
