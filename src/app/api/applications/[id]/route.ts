import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { requireApplicantFromReq, getApplicantIdForUser } from "@/lib/auth";
import { findApplicationApplicantId } from "@/lib/applicant-data";

// DELETE /api/applications/[id]
//
// Allows an applicant to cancel (withdraw + delete) their own application.
// This is a destructive action — the application record AND its junction-table
// links are removed so the applicant can re-apply to the same position later
// (the apply route's "already applied" check would otherwise block them).
//
// Safety constraints:
//   * The requester must be signed in as an APPLICANT.
//   * The application must belong to the requesting applicant (verified via
//     ApplicationApplicantLink — no cross-applicant deletion).
//   * The application status must still be "Applied" (the initial state). Once
//     an application has progressed to Pending / Under Review / For Evaluation
//     / etc. it is being actively processed and can no longer be cancelled by
//     the applicant — they'd need to contact HR.
//
// Junction tables are cleaned up BEFORE the application row to avoid orphaned
// links (and because the junction tables have no ON DELETE CASCADE in the
// production schema).
export const DELETE = handleApi(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const user = await requireApplicantFromReq(req);
  const applicantId = await getApplicantIdForUser(parseInt(user.id, 10));
  if (!applicantId) return err("Applicant profile not found", 404);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return err("Invalid application id", 400);

  const app = await db.application.findUnique({ where: { id } });
  if (!app) return err("Application not found", 404);

  // Ownership check: the application must be linked to the requesting applicant.
  const linkedApplicantId = await findApplicationApplicantId(id);
  if (linkedApplicantId !== applicantId) {
    return err("You do not have permission to cancel this application", 403);
  }

  // Status check: only allow cancellation while the application is still in
  // the initial "Applied" state. The production DB stores Title Case status
  // ("Applied"); the legacy UPPER_CASE ("APPLIED") is accepted for safety.
  const status = app.applicationStatus;
  const isCancellable = status === "Applied" || status === "APPLIED";
  if (!isCancellable) {
    return err(
      "This application is already being processed and can no longer be cancelled online. Please contact HR if you need to withdraw it.",
      400
    );
  }

  // Clean up junction tables first (no ON DELETE CASCADE in production schema).
  await db.applicationApplicantLink.deleteMany({ where: { applicationId: id } });
  await db.applicationJobLink.deleteMany({ where: { applicationId: id } });

  // Finally, delete the application record itself.
  await db.application.delete({ where: { id } });

  return ok({ id, cancelled: true });
});
