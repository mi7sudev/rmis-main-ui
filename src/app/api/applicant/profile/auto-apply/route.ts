// =============================================================================
// RMIS — Auto-Apply Extraction to Profile (OVERRIDE semantics)
// =============================================================================
// Takes an ExtractionResult (from the document-intelligence pipeline) and
// writes it to the database so the applicant's profile reflects the LATEST
// uploaded document.
//
// OVERRIDE BEHAVIOR (per product spec):
//   • Personal Info  → OVERRIDE existing field values with extracted values.
//                       The uploaded document is the latest source of truth.
//   • Education / Work / Training / Eligibility / Awards → REPLACE all
//                       existing entries in that section with the extracted
//                       entries (delete old + create new). If the extraction
//                       returned ZERO entries for a section, the existing
//                       entries are KEPT (an empty extraction could be a
//                       parsing gap, not an actual "no data" signal — we do
//                       not destroy user data on ambiguous signals).
//
// FIELD-MAPPING STRICTNESS:
//   Only fields that exist in the application forms are written. The
//   ExtractionResult schema is defined to mirror the form fields 1:1, and the
//   PERSONAL_FIELD_MAP below is the exhaustive allow-list of personal-info
//   keys. Any unknown keys in the extraction payload are ignored.
// =============================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { requireApplicantFromReq, getApplicantIdForUser } from "@/lib/auth";
import { validateProfileCompletion } from "@/lib/profile-completeness";
import {
  linkEducationToApplicant,
  linkWorkExperienceToApplicant,
  linkTrainingToApplicant,
  linkEligibilityToApplicant,
  linkEligibilityToCategory,
  findOrCreateEligibilityReference,
  linkAwardToApplicant,
  clearApplicantEducations,
  clearApplicantWorkExperiences,
  clearApplicantTrainings,
  clearApplicantEligibilities,
  clearApplicantAwards,
} from "@/lib/applicant-data";

// -----------------------------------------------------------------------------
// Zod schema — mirrors ExtractionResult from @/lib/extraction
//
// NOTE: The extraction prompt templates use `source` as a *type hint* by
// giving it a non-string default (e.g. `source: 0` for numeric fields like
// monthlySalary/numberHours, `source: false` for the boolean isGovtService).
// `source` is unused by this route, so we strip it from the schema entirely —
// making the route robust to whatever the extractor returns.
// -----------------------------------------------------------------------------
const extractedFieldSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  confidence: z.enum(["high", "medium", "low", "none"]),
});

const extractionSchema = z.object({
  personalInfo: z.record(z.string(), extractedFieldSchema).optional(),
  educations: z.array(z.record(z.string(), extractedFieldSchema)).optional(),
  workExperiences: z.array(z.record(z.string(), extractedFieldSchema)).optional(),
  trainings: z.array(z.record(z.string(), extractedFieldSchema)).optional(),
  eligibilities: z.array(z.record(z.string(), extractedFieldSchema)).optional(),
  awards: z.array(z.record(z.string(), extractedFieldSchema)).optional(),
});

const bodySchema = z.object({
  extraction: extractionSchema,
});

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Returns true if the field has a usable (non-"none" confidence, non-empty) value. */
function hasValue(field: unknown): field is { value: string | number | boolean; confidence: string } {
  if (!field || typeof field !== "object") return false;
  const f = field as { value?: unknown; confidence?: string };
  if (f.confidence === "none") return false;
  if (f.value === null || f.value === undefined) return false;
  if (typeof f.value === "string" && f.value.trim() === "") return false;
  return true;
}

/** Convert an extracted date-ish string to ISO YYYY-MM-DD (or null). */
function toISODate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Convert an extracted date string to a JS Date (or null) for DateTime columns. */
function toDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** Convert "true"/"false"/true/false → boolean (or null if not parseable). */
function toBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "yes" || v === "1") return true;
    if (v === "false" || v === "no" || v === "0") return false;
  }
  return null;
}

/** Convert an extracted numeric-ish value to a number (or null). */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return isNaN(value) ? null : value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[^0-9.\-]/g, ""));
    return isNaN(n) ? null : n;
  }
  return null;
}

/**
 * Convert an extracted value to a BigInt suitable for `bigint` DB columns
 * (e.g. `applicants.mobile_number`). Strips all non-digit characters so
 * formatted phone numbers like "+63 917 123 4567" become `639171234567n`.
 * Returns null for empty / non-parseable input so the caller can skip.
 */
function toDigits(value: unknown): bigint | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!isFinite(value)) return null;
    try { return BigInt(Math.trunc(value)); } catch { return null; }
  }
  if (typeof value === "boolean") return null;
  const digits = String(value).replace(/[^0-9]/g, "");
  if (!digits) return null;
  try { return BigInt(digits); } catch { return null; }
}

// Map of extraction personal-info keys → Prisma applicant column names.
// This is the EXHAUSTIVE allow-list of personal-info fields that auto-apply
// will touch. Any extraction key not in this map is ignored — enforcing the
// "only map to fields that exist in the application form" rule.
const PERSONAL_FIELD_MAP: Record<string, string> = {
  firstName: "firstName",
  middleName: "middleName",
  lastName: "lastName",
  extensionName: "extensionName",
  emailAddress: "emailAddress",
  mobileNumber: "mobileNumber",
  contactNumber: "contactNumber",
  birthDate: "birthDate",
  birthPlace: "birthPlace",
  gender: "gender",
  civilStatus: "civilStatus",
  citizenship: "citizenship",
  religion: "religion",
  presentAddress: "presentAddress",
  city: "city",
  province: "province",
  country: "country",
  zipCode: "zipCode",
};

// Personal fields that are stored as TEXT dates ("YYYY-MM-DD"), not DateTime.
const TEXT_DATE_FIELDS = new Set(["birthDate"]);

// Personal fields that are stored as SQLite `bigint` (Prisma BigInt?). These
// must be converted via `toDigits()` before being passed to Prisma.
const BIGINT_FIELDS = new Set(["mobileNumber"]);

// -----------------------------------------------------------------------------
// Route handler
// -----------------------------------------------------------------------------

export const POST = handleApi(async (req: NextRequest) => {
  const user = await requireApplicantFromReq(req);
  const applicantId = await getApplicantIdForUser(parseInt(user.id, 10));
  if (!applicantId) return err("Applicant profile not found", 404);

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return err("Invalid extraction payload", 400, parsed.error.flatten());
  }
  const extraction = parsed.data.extraction;

  // Load the current applicant so we can report how many fields were
  // overridden (for UX feedback). The applicant row is updated in place —
  // extracted values OVERRIDE existing values per the product spec.
  const applicant = await db.applicant.findUnique({ where: { id: applicantId } });
  if (!applicant) return err("Applicant profile not found", 404);

  const applied = {
    personal: 0,
    education: 0,
    work: 0,
    training: 0,
    eligibility: 0,
    awards: 0,
  };
  // Track how many existing entries were replaced (for UX feedback).
  const replaced = {
    education: 0,
    work: 0,
    training: 0,
    eligibility: 0,
    awards: 0,
  };

  // ---- 1. Personal Information (OVERRIDE existing values) ----
  // The uploaded document is the latest source of truth. For every personal
  // field where the extraction has a usable value, we OVERRIDE the existing
  // DB value (whether empty or already filled). Fields not present in the
  // extraction (or with confidence "none") are left untouched.
  const personalUpdate: Record<string, unknown> = {};
  if (extraction.personalInfo) {
    for (const [extKey, profileKey] of Object.entries(PERSONAL_FIELD_MAP)) {
      const field = extraction.personalInfo[extKey];
      if (!hasValue(field)) continue;
      let v: unknown = field.value;
      if (TEXT_DATE_FIELDS.has(profileKey)) {
        v = toISODate(field.value);
        if (!v) continue; // unparseable date → skip rather than write garbage
      }
      if (BIGINT_FIELDS.has(profileKey)) {
        const digits = toDigits(field.value);
        if (digits === null) continue;
        v = digits;
      }
      personalUpdate[profileKey] = v;
    }
    if (Object.keys(personalUpdate).length > 0) {
      personalUpdate.updatedAt = new Date();
      await db.applicant.update({
        where: { id: applicantId },
        data: personalUpdate as never,
      });
      // Exclude the `updatedAt` marker from the count.
      applied.personal = Object.keys(personalUpdate).length - 1;
    }
  }

  // ---- 2. Education entries (REPLACE existing if extraction has ≥1 entry) ----
  // If the extraction found at least one education entry, we treat the
  // uploaded document as the latest source for the education section: delete
  // all existing education rows + links for this applicant, then create new
  // rows from the extraction. If extraction returned zero entries, we leave
  // existing data untouched (could be a parsing gap, not "no data").
  if (extraction.educations && extraction.educations.length > 0) {
    replaced.education = await clearApplicantEducations(applicantId);
    for (const edu of extraction.educations) {
      const schoolName = hasValue(edu.schoolName) ? String(edu.schoolName.value) : null;
      const course = hasValue(edu.course) ? String(edu.course.value) : null;
      const degree = hasValue(edu.degree) ? String(edu.degree.value) : null;
      const educationLevel = hasValue(edu.educationLevel)
        ? String(edu.educationLevel.value)
        : null;
      const yearGraduated = hasValue(edu.yearGraduated)
        ? String(edu.yearGraduated.value)
        : null;
      const unitsEarned = hasValue(edu.unitsEarned)
        ? String(edu.unitsEarned.value)
        : null;
      const awards = hasValue(edu.awards) ? String(edu.awards.value) : null;

      // Require at least a school name or course to create the entry.
      if (!schoolName && !course && !degree && !educationLevel) continue;

      const item = await db.applicantEducation.create({
        data: {
          educationLevel,
          degree,
          course,
          schoolName,
          unitsEarned,
          yearGraduated,
          awards,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await linkEducationToApplicant(item.id, applicantId);
      applied.education += 1;
    }
  }

  // ---- 3. Work Experience entries (REPLACE existing if extraction has ≥1) ----
  if (extraction.workExperiences && extraction.workExperiences.length > 0) {
    replaced.work = await clearApplicantWorkExperiences(applicantId);
    for (const w of extraction.workExperiences) {
      const positionTitle = hasValue(w.positionTitle) ? String(w.positionTitle.value) : null;
      const employerName = hasValue(w.employerName) ? String(w.employerName.value) : null;
      const employerAddress = hasValue(w.employerAddress)
        ? String(w.employerAddress.value)
        : null;
      const inclusiveDateFrom = toDate(hasValue(w.inclusiveDateFrom) ? w.inclusiveDateFrom.value : null);
      const inclusiveDateTo = toDate(hasValue(w.inclusiveDateTo) ? w.inclusiveDateTo.value : null);
      const statusOfEmployment = hasValue(w.statusOfEmployment)
        ? String(w.statusOfEmployment.value)
        : null;
      const monthlySalary = hasValue(w.monthlySalary)
        ? toNumber(w.monthlySalary.value)
        : null;
      const isGovtService = hasValue(w.isGovtService) ? toBool(w.isGovtService.value) ?? false : false;
      const actualDuties = hasValue(w.actualDuties) ? String(w.actualDuties.value) : null;

      if (!positionTitle && !employerName) continue;

      // Compute yearDecimal (matches work-experiences/route.ts logic)
      let yearDecimal = 0;
      if (inclusiveDateFrom) {
        const end = !inclusiveDateTo ? new Date() : inclusiveDateTo;
        const diff = end.getTime() - inclusiveDateFrom.getTime();
        yearDecimal = Math.max(
          0,
          Math.round((diff / (365.25 * 24 * 60 * 60 * 1000)) * 100) / 100
        );
      }

      const item = await db.applicantWorkExperience.create({
        data: {
          positionTitle,
          employerName,
          employerAddress,
          inclusiveDateFrom,
          inclusiveDateTo,
          statusOfEmployment,
          monthlySalary,
          isGovtService,
          actualDuties,
          isPresentWork: !inclusiveDateTo,
          yearDecimal,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await linkWorkExperienceToApplicant(item.id, applicantId);
      applied.work += 1;
    }
  }

  // ---- 4. Training entries (REPLACE existing if extraction has ≥1) ----
  if (extraction.trainings && extraction.trainings.length > 0) {
    replaced.training = await clearApplicantTrainings(applicantId);
    for (const t of extraction.trainings) {
      const titleOfTraining = hasValue(t.titleOfTraining)
        ? String(t.titleOfTraining.value)
        : null;
      const typeOfTraining = hasValue(t.typeOfTraining)
        ? String(t.typeOfTraining.value)
        : null;
      const inclusiveDateFrom = toDate(hasValue(t.inclusiveDateFrom) ? t.inclusiveDateFrom.value : null);
      const inclusiveDateTo = toDate(hasValue(t.inclusiveDateTo) ? t.inclusiveDateTo.value : null);
      const numberHours = hasValue(t.numberHours) ? toNumber(t.numberHours.value) : null;

      if (!titleOfTraining) continue;

      const item = await db.applicantTraining.create({
        data: {
          titleOfTraining,
          typeOfTraining,
          inclusiveDateFrom,
          inclusiveDateTo,
          numberHours,
          hourDecimal: numberHours ?? 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await linkTrainingToApplicant(item.id, applicantId);
      applied.training += 1;
    }
  }

  // ---- 5. Eligibility entries (REPLACE existing if extraction has ≥1) ----
  if (extraction.eligibilities && extraction.eligibilities.length > 0) {
    replaced.eligibility = await clearApplicantEligibilities(applicantId);
    for (const el of extraction.eligibilities) {
      const eligibilityTitle = hasValue(el.eligibilityTitle)
        ? String(el.eligibilityTitle.value)
        : null;
      const rating = hasValue(el.rating) ? String(el.rating.value) : null;
      const examPlace = hasValue(el.examPlace) ? String(el.examPlace.value) : null;
      const licenseNumber = hasValue(el.licenseNumber)
        ? String(el.licenseNumber.value)
        : null;
      const examDate = toDate(hasValue(el.examDate) ? el.examDate.value : null);
      const licenseValidity = toDate(
        hasValue(el.licenseValidity) ? el.licenseValidity.value : null
      );

      if (!eligibilityTitle && !licenseNumber && !rating) continue;

      const item = await db.applicantEligibility.create({
        data: {
          rating,
          examPlace,
          licenseNumber,
          examDate,
          licenseValidity,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await linkEligibilityToApplicant(item.id, applicantId);

      // Link the title via the category path — find-or-create so extracted
      // titles not yet in the reference vocabulary still persist (draft row).
      if (eligibilityTitle) {
        const catId = await findOrCreateEligibilityReference(eligibilityTitle);
        await linkEligibilityToCategory(item.id, catId);
      }
      applied.eligibility += 1;
    }
  }

  // ---- 6. Award entries (REPLACE existing if extraction has ≥1) ----
  if (extraction.awards && extraction.awards.length > 0) {
    replaced.awards = await clearApplicantAwards(applicantId);
    for (const a of extraction.awards) {
      const recognitionType = hasValue(a.recognitionType)
        ? String(a.recognitionType.value)
        : null;
      const recognitionDetails = hasValue(a.recognitionDetails)
        ? String(a.recognitionDetails.value)
        : null;
      const recognitionScope = hasValue(a.recognitionScope)
        ? String(a.recognitionScope.value)
        : null;
      const recognitionCategory = hasValue(a.recognitionCategory)
        ? String(a.recognitionCategory.value)
        : null;
      const recognitionProvider = hasValue(a.recognitionProvider)
        ? String(a.recognitionProvider.value)
        : null;
      const dateGranted = toISODate(hasValue(a.dateGranted) ? a.dateGranted.value : null);

      if (!recognitionDetails && !recognitionType && !recognitionProvider) continue;

      const item = await db.applicantAward.create({
        data: {
          recognitionType: recognitionType || "Award",
          recognitionDetails,
          recognitionScope,
          recognitionCategory,
          recognitionProvider,
          dateGranted,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await linkAwardToApplicant(item.id, applicantId);
      applied.awards += 1;
    }
  }

  const totalFilled =
    applied.personal +
    applied.education +
    applied.work +
    applied.training +
    applied.eligibility +
    applied.awards;

  const totalReplaced =
    replaced.education +
    replaced.work +
    replaced.training +
    replaced.eligibility +
    replaced.awards;

  // Post-apply government-gate status: the fast-track dialog uses this to
  // render the completion checklist and the attestation step. Computed AFTER
  // all writes so it reflects the applicant's profile as it stands now —
  // NOT the apply counts (a section the document didn't cover may already
  // have existing entries).
  const profileCompletion = await validateProfileCompletion(applicantId).catch(
    () => null
  );

  return ok({
    applied,
    replaced,
    totalFilled,
    totalReplaced,
    profileCompletion,
    message:
      totalReplaced > 0
        ? `Updated ${totalFilled} field${totalFilled === 1 ? "" : "s"} from your document (${totalReplaced} existing entr${totalReplaced === 1 ? "y" : "ies"} replaced).`
        : `Updated ${totalFilled} field${totalFilled === 1 ? "" : "s"} from your document.`,
  });
});
