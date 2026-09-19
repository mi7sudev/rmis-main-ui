import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { requireApplicantFromReq, getApplicantIdForUser } from "@/lib/auth";
import {
  loadApplicantEducations,
  loadApplicantWorkExperiences,
  loadApplicantTrainings,
  loadApplicantEligibilities,
  loadApplicantAwards,
} from "@/lib/applicant-data";
import { getApplicantCharacterReference } from "@/lib/raw-json";
import {
  validateProfileCompletion,
  completionErrorMessage,
} from "@/lib/profile-completeness";
import { auditLog } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

// Production schema notes:
//  * All relations are stored in junction tables — no Prisma `include`.
//  * `characterReference` is a JSON column → Unsupported in Prisma; read via raw-json helper.
//  * `birthDate` and `crimeDate` are TEXT ("YYYY-MM-DD") → keep as strings.
//  * `isFillouted` (production column name) replaces the old `isProfileComplete`.

export const GET = handleApi(async (req: NextRequest) => {
  const user = await requireApplicantFromReq(req);
  const applicantId = await getApplicantIdForUser(parseInt(user.id, 10));
  if (!applicantId) return err("Applicant profile not found", 404);

  const applicant = await db.applicant.findUnique({ where: { id: applicantId } });
  if (!applicant) return err("Applicant profile not found", 404);

  // Use Promise.allSettled so that if one section has corrupted/inconsistent
  // DB data (e.g. a TEXT value in a DateTime column from an older auto-apply
  // run), the ENTIRE profile doesn't fail with HTTP 500. The affected section
  // returns [] and is logged; the rest of the profile loads normally.
  const settled = await Promise.allSettled([
    loadApplicantEducations(applicantId),
    loadApplicantWorkExperiences(applicantId),
    loadApplicantTrainings(applicantId),
    loadApplicantEligibilities(applicantId),
    loadApplicantAwards(applicantId),
  ]);
  const educations = settled[0].status === "fulfilled" ? settled[0].value : [];
  const workExperiences = settled[1].status === "fulfilled" ? settled[1].value : [];
  const trainings = settled[2].status === "fulfilled" ? settled[2].value : [];
  const eligibilities = settled[3].status === "fulfilled" ? settled[3].value : [];
  const awards = settled[4].status === "fulfilled" ? settled[4].value : [];
  // Log any section that failed (for debugging) without exposing details to the client
  const sectionNames = ["educations", "workExperiences", "trainings", "eligibilities", "awards"];
  settled.forEach((s, i) => {
    if (s.status === "rejected") {
      console.error(`[PROFILE] Section "${sectionNames[i]}" failed to load for applicant ${applicantId}:`, s.reason?.message || s.reason);
    }
  });

  // raw-json helper is synchronous (better-sqlite3) — call outside Promise.all
  const characterReferenceRaw = getApplicantCharacterReference(applicantId);

  let characterReferences: unknown = null;
  if (characterReferenceRaw) {
    try {
      characterReferences = JSON.parse(characterReferenceRaw);
    } catch {
      characterReferences = null;
    }
  }

  return ok({
    ...applicant,
    characterReferences,
    educations,
    workExperiences,
    trainings,
    eligibilities,
    awards,
    // Backwards-compat alias for the frontend
    isProfileComplete: applicant.isFillouted ?? false,
  });
});

export const PUT = handleApi(async (req: NextRequest) => {
  const user = await requireApplicantFromReq(req);
  const applicantId = await getApplicantIdForUser(parseInt(user.id, 10));
  if (!applicantId) return err("Applicant profile not found", 404);

  const body = await req.json();
  const data = (body.data ?? body) as Record<string, unknown>;

  // ── Government gate: marking the profile complete is validated server-side. ──
  // The client can no longer declare `isProfileComplete: true` — the flag is
  // only granted when the profile ACTUALLY satisfies the completion rule
  // (personal information + ≥1 education entry + ≥1 work experience entry).
  // Ordinary field saves that omit `isProfileComplete` are unaffected.
  if (data.isProfileComplete === true) {
    const completion = await validateProfileCompletion(applicantId);
    if (!completion.complete) {
      return err(completionErrorMessage(completion), 400, {
        missing: completion.missingLabels,
        requirements: completion.requirements,
      });
    }
  }

  // Whitelist of allowed personal-info fields (camelCase Prisma names).
  // `characterReferences` is a JSON column — handled separately below.
  // NOTE: `statusOfEployment` preserves the original production schema typo (not "Employment")
  // — the production DB column is `status_of_eployment` (sic). Do NOT "fix" this.
  const allowed = [
    "respondentTo", "specifyReferral", "firstName", "middleName", "lastName",
    "extensionName", "nickname", "emailAddress", "mobileNumber", "contactNumber",
    "contactNumberSecondary", "telephoneNumber", "birthDate", "birthPlace",
    "gender", "civilStatus", "citizenship", "religion", "height", "weight",
    "bloodType", "isPwd", "ethnicity", "pagibig", "gsis", "philhealth", "tin",
    "sss", "govtIssuedId", "govtIdIssuedNumber", "govtIdIssuedPlace",
    "govtIdDateIssued", "govtIdValidUntil", "presentAddress", "houseNumber",
    "street", "subdivision", "barangay", "city", "province", "country", "zipCode",
    "permanentHouseNumber", "permanentStreet", "permanentSubdivision",
    "permanentBarangay", "permanentCity", "permanentProvince", "permanentCountry",
    "permanentTelephoneNumber", "permanentZipCode", "adminCase", "adminCaseDetails",
    "crimeCharge", "crimeDate", "crimeCaseStatus",
    "statusOfEployment", // sic — production column name, do not rename
    "employeeId", "employeeNumber",
    "institution", "isGovernment", "qualified", "applicationStatus",
    "placeOfBirth", "remarks",
  ];

  const update: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in data) {
      let v = data[k];
      // birthDate / crimeDate / govtIdDateIssued / govtIdValidUntil are TEXT in
      // production (not DateTime) — keep them as strings.
      if (typeof v === "string" && v.trim() === "") v = null;
      // Fix 3: `mobile_number` is SQLite `bigint` (Prisma maps it to `BigInt?`).
      // The form sends a string like "09171234567" or "+639171234567". Prisma
      // coerces non-numeric strings into a PrismaClientValidationError → HTTP
      // 500, and even valid digit-strings drop the leading "0" / "+" when
      // stored as BigInt. Production stores the digit-only form in
      // `mobile_number` (e.g. 9977583493) and keeps the human-readable form in
      // the separate `contact_number` varchar column. Strip non-digits and
      // convert to BigInt here (before the value reaches Prisma's `update`).
      if (k === "mobileNumber" && v !== null && v !== undefined) {
        const digits = String(v).replace(/[^0-9]/g, "");
        v = digits ? BigInt(digits) : null;
      }
      update[k] = v;
    }
  }

  // `characterReferences` is the production `character_reference` JSON column.
  // Prisma can't write Unsupported("json") fields — use a raw SQL UPDATE.
  if ("characterReferences" in data) {
    const refs = data.characterReferences;
    const refJson = refs == null ? null : JSON.stringify(refs);
    await db.$executeRaw`UPDATE applicants SET character_reference = ${refJson} WHERE id = ${applicantId}`;
  }

  // Frontend sends `isProfileComplete` — map to production `isFillouted`.
  if (data.isProfileComplete === true) {
    update.isFillouted = true;
    update.submittedDate = new Date();
  }

  update.updatedAt = new Date();

  const updated = await db.applicant.update({
    where: { id: applicantId },
    data: update as never,
  });

  // Audit: applicant updated their profile
  await auditLog({
    userId: user.id,
    userLabel: user.name ? `${user.name} (${user.email})` : user.email,
    userRole: user.role,
    action: "PROFILE_UPDATED",
    entityType: "applicant",
    entityId: applicantId,
    description: `Updated profile information`,
    ipAddress: getClientIp(req),
  });

  return ok({ ...updated, isProfileComplete: updated.isFillouted ?? false });
});
