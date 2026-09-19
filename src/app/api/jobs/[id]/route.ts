import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { requireEvaluatorFromReq } from "@/lib/auth";
import { sanitizeHtml } from "@/lib/sanitize";
import { jobCreateSchema } from "@/lib/validation";
import { loadPositionPlaceOfAssignment } from "@/lib/applicant-data";
import { auditLog } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

// PATCH /api/jobs/[id] — evaluator+admin update of a job posting.
// Mirrors POST /api/jobs: *_Html inputs are sanitized and stored in the
// legacy *_richtext columns; plain text goes to the *_description columns.
export const PATCH = handleApi(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  await requireEvaluatorFromReq(req);
  const { id: idStr } = await params;
  const jobId = parseInt(idStr, 10);
  if (isNaN(jobId)) return err("Invalid job id", 400);

  const existing = await db.jobPosting.findUnique({ where: { id: jobId } });
  if (!existing) return err("Job posting not found", 404);

  const parsed = jobCreateSchema.partial().safeParse(await req.json());
  if (!parsed.success) return err("Invalid input", 400, parsed.error.flatten());
  const d = parsed.data;

  // NOTE: created_by_id/updated_by_id FK to admin_users (legacy admin accounts), not
  // up_users — web admins have no admin_users row, so leave the audit trail
  // unchanged (legacy rows use NULL/legacy admin ids).
  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (d.positionType !== undefined) data.positionType = d.positionType || null;
  if (d.briefDescription !== undefined) data.briefDescription = d.briefDescription || null;
  if (d.briefDescriptionHtml !== undefined) data.briefDescriptionRichtext = sanitizeHtml(d.briefDescriptionHtml);
  if (d.dutiesResponsibilities !== undefined) data.dutiesResponsibilities = d.dutiesResponsibilities || null;
  if (d.compensationPackage !== undefined) data.compensationPackage = d.compensationPackage || null;
  if (d.compensationPackageHtml !== undefined) data.compensationPackageRichtext = sanitizeHtml(d.compensationPackageHtml);
  if (d.otherQualifications !== undefined) data.otherQualifications = d.otherQualifications || null;
  if (d.otherQualificationsHtml !== undefined) data.otherQualificationsRichtext = sanitizeHtml(d.otherQualificationsHtml);
  if (d.numberOfVacancy !== undefined) data.numberOfVacancy = d.numberOfVacancy;
  if (d.publishDate !== undefined) data.publishDate = d.publishDate ? new Date(d.publishDate) : null;
  if (d.deadlineDate !== undefined) data.deadlineDate = d.deadlineDate ? new Date(d.deadlineDate) : null;
  if (d.processingDate !== undefined) data.processingDate = d.processingDate ? new Date(d.processingDate) : null;

  const job = await db.jobPosting.update({ where: { id: jobId }, data });

  // Re-link the position junction when a position was specified (or unlink on null)
  if (d.positionId !== undefined) {
    await db.jobPostingPositionLink.deleteMany({ where: { jobpostingId: jobId } });
    const posId = d.positionId != null ? parseInt(d.positionId, 10) : NaN;
    if (!isNaN(posId)) {
      await db.jobPostingPositionLink.create({
        data: { jobpostingId: jobId, postionId: posId, postionOrd: 0 },
      });
    }
  }

  // ---- Poster qualification vitals → the linked POSITION master row ----
  // Same mapping as POST /api/jobs: the form's division / education /
  // experience / training / eligibility / license live on the position's
  // division + CSC MQR columns + specialSkill. Only the fields the form
  // actually sent are applied (PATCH semantics). If the posting has no
  // linked position but the form carries these details, a position master
  // row is created and linked so nothing is silently dropped.
  const qualificationData: Record<string, string | null> = {};
  if (d.division !== undefined) qualificationData.division = d.division?.trim() || null;
  if (d.education !== undefined) qualificationData.cscEducation = d.education?.trim() || null;
  if (d.experience !== undefined) qualificationData.cscWorkExperience = d.experience?.trim() || null;
  if (d.training !== undefined) qualificationData.cscTrainingRequirements = d.training?.trim() || null;
  if (d.eligibility !== undefined) qualificationData.cscEligibilityGroup = d.eligibility?.trim() || null;
  if (d.license !== undefined) qualificationData.specialSkill = d.license?.trim() || null;
  const hasQualifications = Object.keys(qualificationData).length > 0;

  // Load the linked position + place of assignment for the response
  const link = await db.jobPostingPositionLink.findFirst({
    where: { jobpostingId: jobId },
    orderBy: { postionOrd: "asc" },
  });
  let position: NonNullable<Awaited<ReturnType<typeof db.position.findUnique>>> | null = null;
  if (link?.postionId != null) {
    if (hasQualifications) {
      await db.position.update({ where: { id: link.postionId }, data: qualificationData });
    }
    position = await db.position.findUnique({ where: { id: link.postionId } });
  } else if (hasQualifications) {
    position = await db.position.create({
      data: {
        positionTitle: d.title ?? existing.briefDescription ?? "Untitled Position",
        ...qualificationData,
        createdAt: new Date(),
        updatedAt: new Date(),
        publishedAt: new Date(),
      },
    });
    await db.jobPostingPositionLink.create({
      data: { jobpostingId: jobId, postionId: position.id, postionOrd: 0 },
    });
  }
  let placeOfAssignment: { id: number; name: string | null } | null = null;
  if (position) {
    const places = await loadPositionPlaceOfAssignment(position.id);
    if (places[0]) placeOfAssignment = { id: places[0].id, name: places[0].name };
  }

  return ok({
    ...job,
    title: position?.positionTitle ?? job.briefDescription ?? null,
    isActive: job.publishedAt != null,
    position,
    placeOfAssignment,
  });
});

// DELETE /api/jobs/[id] — evaluator+admin delete of a job posting.
//
// Hard-deletes the JobPosting row plus every junction-table link that points
// at it (positions, applicants, users). Because the production schema
// has no FK cascade, those link rows are removed explicitly BEFORE the job
// row so nothing is orphaned.
//
// Linked APPLICATIONS are also removed — but ONLY when the client explicitly
// acknowledges the cascade with `?scope=all`. Without it, a posting that has
// applications is refused with 409 + the count, so the UI can surface an
// accurate confirmation ("this will permanently delete N application(s)")
// before the destructive call is retried. The user's session/role is still
// resolved first: the confirm gate protects against accidents, not attackers.
export const DELETE = handleApi(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const user = await requireEvaluatorFromReq(req);
  const { id: idStr } = await params;
  const jobId = parseInt(idStr, 10);
  if (isNaN(jobId)) return err("Invalid job id", 400);

  const job = await db.jobPosting.findUnique({ where: { id: jobId } });
  if (!job) return err("Job posting not found", 404);

  // Resolve the position title for the audit trail (the posting itself has
  // no title column — it is sourced from the linked Position master row).
  const link = await db.jobPostingPositionLink.findFirst({
    where: { jobpostingId: jobId },
    orderBy: { postionOrd: "asc" },
  });
  const position = link?.postionId
    ? await db.position.findUnique({ where: { id: link.postionId } })
    : null;
  const label = position?.positionTitle ?? job.briefDescription ?? `Job #${jobId}`;

  // Applications linked to this posting (they carry PDS snapshots, so their
  // deletion must be explicit).
  const appLinks = await db.applicationJobLink.findMany({
    where: { jobpostingId: jobId },
    select: { applicationId: true },
  });
  const appIds = appLinks
    .map((l) => l.applicationId)
    .filter((id): id is number => id != null);

  if (appIds.length > 0 && new URL(req.url).searchParams.get("scope") !== "all") {
    return err(
      `This posting has ${appIds.length} linked application${appIds.length === 1 ? "" : "s"}. Deleting it will also permanently remove them.`,
      409,
      { applicationCount: appIds.length },
    );
  }

  // 1) Applications + their junction rows (no FK cascade in production).
  if (appIds.length > 0) {
    await db.applicationApplicantLink.deleteMany({
      where: { applicationId: { in: appIds } },
    });
    await db.applicationJobLink.deleteMany({
      where: { applicationId: { in: appIds } },
    });
    await db.application.deleteMany({ where: { id: { in: appIds } } });
  }

  // 2) The job's own junction rows.
  await db.jobPostingPositionLink.deleteMany({ where: { jobpostingId: jobId } });
  await db.jobPostingApplicantLink.deleteMany({ where: { jobpostingId: jobId } });
  await db.jobPostingUserLink.deleteMany({ where: { jobpostingId: jobId } });

  // 3) The posting itself.
  await db.jobPosting.delete({ where: { id: jobId } });

  // Audit: recruiter removed a job posting (+ how many applications went with it)
  await auditLog({
    userId: user.id,
    userLabel: user.name ? `${user.name} (${user.email})` : user.email,
    userRole: user.role,
    action: "JOB_POSTING_DELETED",
    entityType: "job",
    entityId: jobId,
    description: `Deleted job posting "${label}"${appIds.length > 0 ? ` and ${appIds.length} linked application${appIds.length === 1 ? "" : "s"}` : ""}`,
    ipAddress: getClientIp(req),
  });

  return ok({ id: jobId, deleted: true, applicationsDeleted: appIds.length });
});
