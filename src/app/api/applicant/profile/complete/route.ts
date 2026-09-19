// =============================================================================
// RMIS — Mark Applicant Profile as Complete (Fast-Track Apply)
// =============================================================================
// Sets `isFillouted = true` on the applicant row — but ONLY after the
// server-side government gate confirms the profile is genuinely complete.
//
// GOVERNMENT RULE: a profile must actually BE finished (personal information
// + ≥1 education entry + ≥1 work experience entry) before the applicant can
// apply. A PDS upload whose extraction only recovered a few fields does NOT
// satisfy this — the client can no longer declare completeness.
//
// Used by the "Apply with PDS" fast-track flow (after the applicant reviewed
// the auto-filled data in the dialog's review step):
//   1. POST /api/applicant/documents          (upload PDS)
//   2. POST /api/applicant/documents/extract  (AI extraction)
//   3. POST /api/applicant/profile/auto-apply (write extracted data)
//   4. Applicant reviews + certifies the auto-filled data (dialog review step)
//   5. POST /api/applicant/profile/complete   (THIS — validated completion)
//   6. POST /api/jobs/apply                   (submit the application)
// =============================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { requireApplicantFromReq, getApplicantIdForUser } from "@/lib/auth";
import {
  validateProfileCompletion,
  completionErrorMessage,
} from "@/lib/profile-completeness";
import { auditLog } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

export const POST = handleApi(async (req: NextRequest) => {
  const user = await requireApplicantFromReq(req);
  const applicantId = await getApplicantIdForUser(parseInt(user.id, 10));
  if (!applicantId) return err("Applicant profile not found", 404);

  const applicant = await db.applicant.findUnique({
    where: { id: applicantId },
    select: { id: true, isFillouted: true },
  });
  if (!applicant) return err("Applicant profile not found", 404);

  // ── Government gate: validate ACTUAL data completeness server-side. ──
  // The flag is never trusted from the client. If the requirement is not met
  // (e.g. the PDS extraction produced no education or work experience), the
  // applicant is told exactly what is still missing.
  const completion = await validateProfileCompletion(applicantId);
  if (!completion.complete) {
    return err(completionErrorMessage(completion), 400, {
      missing: completion.missingLabels,
      requirements: completion.requirements,
    });
  }

  if (!applicant.isFillouted) {
    await db.applicant.update({
      where: { id: applicantId },
      data: {
        isFillouted: true,
        submittedDate: new Date(),
        updatedAt: new Date(),
      },
    });

    // Audit: profile completed (manual or via PDS fast-track)
    await auditLog({
      userId: user.id,
      userLabel: user.name ? `${user.name} (${user.email})` : user.email,
      userRole: user.role,
      action: "PROFILE_COMPLETED",
      entityType: "applicant",
      entityId: applicantId,
      description: "Profile marked complete — requirements verified server-side",
      ipAddress: getClientIp(req),
    });
  }

  return ok({ isProfileComplete: true, requirements: completion.requirements });
});
