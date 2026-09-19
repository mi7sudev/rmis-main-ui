import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { requireApplicantFromReq, getApplicantIdForUser } from "@/lib/auth";
import { findApplicantEligibilityId } from "@/lib/applicant-data";

export const DELETE = handleApi(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const user = await requireApplicantFromReq(req);
  const applicantId = await getApplicantIdForUser(parseInt(user.id, 10));
  if (!applicantId) return err("Applicant profile not found", 404);
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return err("Invalid id", 400);

  const eligId = await findApplicantEligibilityId(id, applicantId);
  if (!eligId) return err("Not found", 404);

  // Snapshot the title (category) reference rows BEFORE deleting links, so
  // auto-created DRAFT rows can be retired if nothing else references them.
  const categoryLinks = await db.applicantEligibilityCategoryLink.findMany({
    where: { applicantEligibilityId: eligId },
  });

  // Delete junction links (applicant + category) then the child record.
  await db.applicantEligibilityLink.deleteMany({
    where: { applicantEligibilityId: eligId, applicantId },
  });
  await db.applicantEligibilityCategoryLink.deleteMany({
    where: { applicantEligibilityId: eligId },
  });
  await db.applicantEligibility.delete({ where: { id: eligId } });

  // Retire orphaned DRAFT reference rows (created automatically by POST when
  // the title wasn't in the vocabulary yet). Published vocabulary rows are
  // never deleted — they are shared reference data. A draft survives only if
  // some other eligibility entry, specific eligibility or position still
  // references it (covers the update flow = delete + re-create with a new
  // title, and duplicate titles shared by several entries).
  for (const link of categoryLinks) {
    if (link.eligibilityId == null) continue;
    const ref = await db.eligibility.findUnique({
      where: { id: link.eligibilityId },
    });
    if (!ref || ref.publishedAt) continue;
    const [catCount, specCount, posCount] = await Promise.all([
      db.applicantEligibilityCategoryLink.count({
        where: { eligibilityId: ref.id },
      }),
      db.specificEligibilityEligibilityLink.count({
        where: { eligibilityId: ref.id },
      }),
      db.positionEligibilityLink.count({ where: { eligibilityId: ref.id } }),
    ]);
    if (catCount === 0 && specCount === 0 && posCount === 0) {
      await db.eligibility.delete({ where: { id: ref.id } });
    }
  }

  return ok({ deleted: true });
});
