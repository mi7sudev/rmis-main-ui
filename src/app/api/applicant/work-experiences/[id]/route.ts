import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { requireApplicantFromReq, getApplicantIdForUser } from "@/lib/auth";
import { findApplicantWorkExperienceId } from "@/lib/applicant-data";

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

  const wexpId = await findApplicantWorkExperienceId(id, applicantId);
  if (!wexpId) return err("Not found", 404);

  await db.applicantWorkExperienceLink.deleteMany({
    where: { applicantWorkExperienceId: wexpId, applicantId },
  });
  await db.applicantWorkExperience.delete({ where: { id: wexpId } });
  return ok({ deleted: true });
});
