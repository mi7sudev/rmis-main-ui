import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { requireApplicantFromReq, getApplicantIdForUser } from "@/lib/auth";
import { awardSchema } from "@/lib/validation";
import {
  loadApplicantAwards,
  linkAwardToApplicant,
} from "@/lib/applicant-data";

export const GET = handleApi(async (req: NextRequest) => {
  const user = await requireApplicantFromReq(req);
  const applicantId = await getApplicantIdForUser(parseInt(user.id, 10));
  if (!applicantId) return err("Applicant profile not found", 404);
  const items = await loadApplicantAwards(applicantId);
  // dateGranted is TEXT ("YYYY-MM-DD") — sort as a string desc.
  items.sort((a, b) => {
    const av = a.dateGranted ?? "";
    const bv = b.dateGranted ?? "";
    return bv.localeCompare(av);
  });
  return ok(items);
});

export const POST = handleApi(async (req: NextRequest) => {
  const user = await requireApplicantFromReq(req);
  const applicantId = await getApplicantIdForUser(parseInt(user.id, 10));
  if (!applicantId) return err("Applicant profile not found", 404);

  const body = await req.json();
  const data = body.data ?? body;
  const parsed = awardSchema.safeParse(data);
  if (!parsed.success) return err("Invalid input", 400, parsed.error.flatten());
  const d = parsed.data;

  // Production: dateGranted is TEXT (stored as "YYYY-MM-DD"). Keep as string.
  const item = await db.applicantAward.create({
    data: {
      recognitionType: d.recognitionType || null,
      awardType: d.awardType || null,
      recognitionScope: d.recognitionScope || null,
      recognitionCategory: d.recognitionCategory || null,
      recognitionSubcategory: d.recognitionSubcategory || null,
      recognitionDetails: d.recognitionDetails || null,
      recognitionProvider: d.recognitionProvider || null,
      points: d.points ?? 0,
      hrRemarks: d.hrRemarks || null,
      dateGranted: d.dateGranted || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await linkAwardToApplicant(item.id, applicantId);
  return ok(item, 201);
});
