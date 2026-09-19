import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { requireApplicantFromReq, getApplicantIdForUser } from "@/lib/auth";
import {
  loadApplicantEligibilities,
  fillEligibilityTitleFromSpecificLinks,
  linkEligibilityToApplicant,
  linkEligibilityToCategory,
  findOrCreateEligibilityReference,
} from "@/lib/applicant-data";
import { dateString } from "@/lib/validation";

// Production schema for ApplicantEligibility has NO `eligibilityTitle` column —
// the title is stored on the linked `eligibilities` row (Eligibility model)
// via the junction table `applicant_eligibilities_eligibility_category_lnk`.
// The shape returned to the frontend includes `eligibilityTitle` (joined).
const eligibilityInputSchema = z.object({
  eligibilityTitle: z.string().max(200).optional().nullable(),
  eligibilityId: z.number().int().positive().optional().nullable(),
  rating: z.string().max(20).optional().nullable(),
  examPlace: z.string().max(200).optional().nullable(),
  licenseNumber: z.string().max(80).optional().nullable(),
  hrRemarks: z.string().max(500).optional().nullable(),
  examDate: dateString,
  licenseValidity: dateString,
});

// `fillEligibilityTitleFromSpecificLinks` (shared backfill helper) lives in
// `@/lib/applicant-data` so both this applicant-facing route and the
// admin/evaluator-facing `/api/admin/applicants/[id]` route use one impl.

export const GET = handleApi(async (req: NextRequest) => {
  const user = await requireApplicantFromReq(req);
  const applicantId = await getApplicantIdForUser(parseInt(user.id, 10));
  if (!applicantId) return err("Applicant profile not found", 404);
  const items = await loadApplicantEligibilities(applicantId);
  // Fix 5: backfill eligibilityTitle from the production link path
  // (specific_eligibilities_applicant_eligibility_lnk → ...).
  await fillEligibilityTitleFromSpecificLinks(items);
  // Sort by examDate desc (nulls last)
  items.sort((a, b) => {
    const aTime = a.examDate?.getTime() ?? 0;
    const bTime = b.examDate?.getTime() ?? 0;
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
  const parsed = eligibilityInputSchema.safeParse(data);
  if (!parsed.success) return err("Invalid input", 400, parsed.error.flatten());
  const d = parsed.data;

  const item = await db.applicantEligibility.create({
    data: {
      rating: d.rating || null,
      examPlace: d.examPlace || null,
      licenseNumber: d.licenseNumber || null,
      hrRemarks: d.hrRemarks || null,
      examDate: d.examDate ? new Date(d.examDate) : null,
      licenseValidity: d.licenseValidity ? new Date(d.licenseValidity) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  // Link eligibility → applicant
  await linkEligibilityToApplicant(item.id, applicantId);

  // Link the title: prefer an explicit `eligibilityId`, otherwise resolve
  // `eligibilityTitle` against the reference vocabulary — creating a DRAFT
  // reference row when the title is new, so the title always persists (the
  // old lookup-only flow silently dropped unknown titles and the entry
  // showed no title after a reload).
  let categoryEligibilityId = d.eligibilityId ?? null;
  if (!categoryEligibilityId && d.eligibilityTitle) {
    categoryEligibilityId = await findOrCreateEligibilityReference(
      d.eligibilityTitle
    );
  }
  if (categoryEligibilityId) {
    await linkEligibilityToCategory(item.id, categoryEligibilityId);
  }

  const eligibilityTitle = categoryEligibilityId
    ? (await db.eligibility.findUnique({ where: { id: categoryEligibilityId } }))?.name ?? null
    : d.eligibilityTitle ?? null;

  return ok({ ...item, eligibilityTitle }, 201);
});
