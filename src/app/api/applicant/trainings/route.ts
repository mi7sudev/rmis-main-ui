import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { requireApplicantFromReq, getApplicantIdForUser } from "@/lib/auth";
import { trainingSchema } from "@/lib/validation";
import {
  loadApplicantTrainings,
  linkTrainingToApplicant,
} from "@/lib/applicant-data";

export const GET = handleApi(async (req: NextRequest) => {
  const user = await requireApplicantFromReq(req);
  const applicantId = await getApplicantIdForUser(parseInt(user.id, 10));
  if (!applicantId) return err("Applicant profile not found", 404);
  const items = await loadApplicantTrainings(applicantId);
  items.sort((a, b) => {
    const aTime = a.inclusiveDateFrom?.getTime() ?? 0;
    const bTime = b.inclusiveDateFrom?.getTime() ?? 0;
    return bTime - aTime;
  });
  return ok(items);
});

export const POST = handleApi(async (req: NextRequest) => {
  const user = await requireApplicantFromReq(req);
  const applicantId = await getApplicantIdForUser(parseInt(user.id, 10));
  if (!applicantId) return err("Applicant profile not found", 404);

  const body = await req.json();
  const data = body.data ?? body;
  const parsed = trainingSchema.safeParse(data);
  if (!parsed.success) return err("Invalid input", 400, parsed.error.flatten());
  const d = parsed.data;

  const item = await db.applicantTraining.create({
    data: {
      titleOfTraining: d.titleOfTraining || null,
      isPresentWork: d.isPresentWork ?? false,
      isGovtService: d.isGovtService ?? false,
      typeOfTraining: d.typeOfTraining || null,
      specifyTraining: d.specifyTraining || null,
      numberHours: d.numberHours ?? null,
      hourDecimal: d.hourDecimal ?? (d.numberHours ? Number(d.numberHours) : 0),
      hrRemarks: d.hrRemarks || null,
      inclusiveDateFrom: d.inclusiveDateFrom ? new Date(d.inclusiveDateFrom) : null,
      inclusiveDateTo: d.inclusiveDateTo ? new Date(d.inclusiveDateTo) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await linkTrainingToApplicant(item.id, applicantId);
  return ok(item, 201);
});
