import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { requireApplicantFromReq, getApplicantIdForUser } from "@/lib/auth";
import { workExperienceSchema } from "@/lib/validation";
import {
  loadApplicantWorkExperiences,
  linkWorkExperienceToApplicant,
} from "@/lib/applicant-data";

function computeYearDecimal(from: string | null, to: string | null, isPresent: boolean): number {
  if (!from) return 0;
  const start = new Date(from);
  if (isNaN(start.getTime())) return 0;
  const end = isPresent || !to ? new Date() : new Date(to);
  if (isNaN(end.getTime())) return 0;
  const diff = end.getTime() - start.getTime();
  return Math.max(0, Math.round((diff / (365.25 * 24 * 60 * 60 * 1000)) * 100) / 100);
}

export const GET = handleApi(async (req: NextRequest) => {
  const user = await requireApplicantFromReq(req);
  const applicantId = await getApplicantIdForUser(parseInt(user.id, 10));
  if (!applicantId) return err("Applicant profile not found", 404);
  const items = await loadApplicantWorkExperiences(applicantId);
  // Sort: present work first, then by dateFrom desc
  items.sort((a, b) => {
    if ((b.isPresentWork ? 1 : 0) !== (a.isPresentWork ? 1 : 0)) {
      return (b.isPresentWork ? 1 : 0) - (a.isPresentWork ? 1 : 0);
    }
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
  const parsed = workExperienceSchema.safeParse(data);
  if (!parsed.success) return err("Invalid input", 400, parsed.error.flatten());
  const d = parsed.data;

  const from = d.inclusiveDateFrom || null;
  const to = d.inclusiveDateTo || null;
  const yearDecimal = computeYearDecimal(from, to, d.isPresentWork ?? false);

  const item = await db.applicantWorkExperience.create({
    data: {
      positionTitle: d.positionTitle || null,
      isPresentWork: d.isPresentWork ?? false,
      isGovtService: d.isGovtService ?? false,
      statusOfEmployment: d.statusOfEmployment || null,
      monthlySalary: d.monthlySalary ?? null,
      employerName: d.employerName || null,
      employerAddress: d.employerAddress || null,
      supervisorName: d.supervisorName || null,
      supervisorPosition: d.supervisorPosition || null,
      office: d.office || null,
      reasonForLeaving: d.reasonForLeaving || null,
      accomplishment: d.accomplishment || null,
      actualDuties: d.actualDuties || null,
      hrRemarks: d.hrRemarks || null,
      inclusiveDateFrom: from ? new Date(from) : null,
      inclusiveDateTo: to ? new Date(to) : null,
      yearDecimal,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await linkWorkExperienceToApplicant(item.id, applicantId);
  return ok(item, 201);
});
