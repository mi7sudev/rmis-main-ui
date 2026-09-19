import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { requireApplicantFromReq, getApplicantIdForUser } from "@/lib/auth";
import { educationSchema } from "@/lib/validation";
import {
  loadApplicantEducations,
  linkEducationToApplicant,
} from "@/lib/applicant-data";

export const GET = handleApi(async (req: NextRequest) => {
  const user = await requireApplicantFromReq(req);
  const applicantId = await getApplicantIdForUser(parseInt(user.id, 10));
  if (!applicantId) return err("Applicant profile not found", 404);
  const educations = await loadApplicantEducations(applicantId);
  return ok(educations);
});

export const POST = handleApi(async (req: NextRequest) => {
  const user = await requireApplicantFromReq(req);
  const applicantId = await getApplicantIdForUser(parseInt(user.id, 10));
  if (!applicantId) return err("Applicant profile not found", 404);

  const body = await req.json();
  const data = body.data ?? body;
  const parsed = educationSchema.safeParse(data);
  if (!parsed.success) return err("Invalid input", 400, parsed.error.flatten());
  const d = parsed.data;

  // Production: yearFrom/yearTo are TEXT ("YYYY-MM-DD" or year string).
  // Keep them as strings — do NOT convert to Date.
  const item = await db.applicantEducation.create({
    data: {
      educationLevel: d.educationLevel || null,
      degree: d.degree || null,
      course: d.course || null,
      specifyOthers: d.specifyOthers || null,
      schoolName: d.schoolName || null,
      ongoing: d.ongoing ?? false,
      isHighestEducation: d.isHighestEducation ?? false,
      highestLevel: d.highestLevel || null,
      unitsEarned: d.unitsEarned || null,
      yearGraduated: d.yearGraduated || null,
      awards: d.awards || null,
      hrRemarks: d.hrRemarks || null,
      yearFrom: d.yearFrom || null,
      yearTo: d.yearTo || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  // Create the junction-table link to the applicant.
  await linkEducationToApplicant(item.id, applicantId);
  return ok(item, 201);
});
