// =============================================================================
// RMIS — Clear All Profile Forms (the gate for re-uploading a PDS)
// =============================================================================
// Product rule: after a document has been extracted & auto-applied to the
// profile, the applicant CANNOT upload another PDS for extraction until they
// explicitly click "Clear Forms & Re-upload". That button hits this endpoint,
// which wipes EVERYTHING the extraction (and the applicant's own typing)
// placed in the forms — so the next upload's extraction becomes the single
// source of truth and overwrites from a clean slate:
//
//   • Personal Information → every form-managed field reset to null/false
//     (the exact fields savePersonal writes — nothing the form never touches).
//   • Education / Work / Training / Eligibility / Awards → ALL entries and
//     their junction links deleted.
//   • Completion flag → isFillouted=false, submittedDate=null (a wiped
//     profile is not a complete profile).
//   • Document extraction state → every extractable-category document meta
//     is reset from EXTRACTED/PARTIALLY_EXTRACTED/FAILED/PROCESSING back to
//     UPLOADED (extraction cache cleared). The FILES themselves are kept —
//     they remain visible in Supporting Documents for HR verification — but
//     their "already extracted" badge no longer applies, which also unlocks
//     the upload strip (the lock condition reads this status).
//   • character_reference JSON column → NULL (raw SQL — Unsupported type).
//
// Deliberately destructive + confirmation-gated on the client (AlertDialog).
// =============================================================================

import { NextRequest } from "next/server";
import fs from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { requireApplicantFromReq, getApplicantIdForUser } from "@/lib/auth";
import {
  clearApplicantEducations,
  clearApplicantWorkExperiences,
  clearApplicantTrainings,
  clearApplicantEligibilities,
  clearApplicantAwards,
} from "@/lib/applicant-data";
import { auditLog } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { uploadDir } from "@/lib/env";
import type { DocumentCategory } from "@/lib/extraction";

// Same set as the extract route — categories that carry structured extraction.
const EXTRACTABLE_CATEGORIES: ReadonlySet<string> = new Set([
  "PDS",
  "RESUME",
  "EDUCATION",
  "WORK_EXPERIENCE",
  "TRAINING",
  "ELIGIBILITY",
  "AWARD",
  "ACCOMPLISHMENT",
]);

// Personal-info fields wiped to NULL — exactly the set the personal-info form
// reads/writes (mirrors loadAll's form init + savePersonal's payload). Fields
// outside the form (nickname, GSIS/PagIBIG IDs, permanent address, etc.) are
// intentionally untouched — extraction never wrote them either.
const CLEARED_PERSONAL_FIELDS = [
  "firstName",
  "middleName",
  "lastName",
  "extensionName",
  "emailAddress",
  "contactNumber",
  "birthDate",
  "birthPlace",
  "gender",
  "civilStatus",
  "citizenship",
  "religion",
  "ethnicity",
  "presentAddress",
  "city",
  "province",
  "country",
  "zipCode",
  "adminCaseDetails",
  "crimeDate",
  "crimeCaseStatus",
] as const;

export const POST = handleApi(async (req: NextRequest) => {
  const user = await requireApplicantFromReq(req);
  const applicantId = await getApplicantIdForUser(parseInt(user.id, 10));
  if (!applicantId) return err("Applicant profile not found", 404);

  const applicant = await db.applicant.findUnique({ where: { id: applicantId } });
  if (!applicant) return err("Applicant profile not found", 404);

  // ---- 1. Section entries: delete every entry + junction link ----
  const cleared = {
    education: await clearApplicantEducations(applicantId),
    work: await clearApplicantWorkExperiences(applicantId),
    training: await clearApplicantTrainings(applicantId),
    eligibility: await clearApplicantEligibilities(applicantId),
    awards: await clearApplicantAwards(applicantId),
  };

  // ---- 2. Personal information: reset every form-managed field ----
  const personalUpdate: Record<string, unknown> = {};
  for (const field of CLEARED_PERSONAL_FIELDS) personalUpdate[field] = null;
  personalUpdate.mobileNumber = null; // BigInt column
  personalUpdate.isPwd = null; // Boolean columns → unknown (form renders "No")
  personalUpdate.adminCase = null;
  personalUpdate.crimeCharge = null;
  personalUpdate.isFillouted = false; // completion flag — profile is wiped
  personalUpdate.submittedDate = null;
  personalUpdate.updatedAt = new Date();
  await db.applicant.update({
    where: { id: applicantId },
    data: personalUpdate as never,
  });

  // character_reference is Unsupported("json") in Prisma → raw SQL (same as PUT route)
  await db.$executeRaw`UPDATE applicants SET character_reference = NULL WHERE id = ${applicantId}`;

  // ---- 3. Reset extraction state on the uploaded documents' meta files ----
  // The FILES stay (Supporting Documents keeps them for HR), but their
  // "extracted" status is revoked — the data it produced no longer exists in
  // the profile. This also unlocks the PDS upload strip, whose lock condition
  // reads these statuses. A re-uploaded document extracts fresh.
  const UPLOAD_ROOT = uploadDir();
  const dir = path.join(UPLOAD_ROOT, String(applicantId));
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    entries = [];
  }
  let documentsReset = 0;
  for (const f of entries.filter((x) => x.endsWith(".meta.json"))) {
    const metaPath = path.join(dir, f);
    try {
      const meta = JSON.parse(await fs.readFile(metaPath, "utf-8")) as {
        category?: DocumentCategory | string;
        status?: string;
        extractedJson?: string | null;
        extractedAt?: string | null;
        extractionError?: string | null;
        updatedAt?: string;
      };
      if (!meta.category || !EXTRACTABLE_CATEGORIES.has(meta.category)) continue;
      if (meta.status === "UPLOADED") continue;
      meta.status = "UPLOADED";
      meta.extractedJson = null;
      meta.extractedAt = null;
      meta.extractionError = null;
      meta.updatedAt = new Date().toISOString();
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
      documentsReset += 1;
    } catch {
      // Corrupt/unreadable meta — skip it; the files API already tolerates this.
    }
  }

  // ---- 4. Audit trail ----
  const totalEntries =
    cleared.education + cleared.work + cleared.training + cleared.eligibility + cleared.awards;
  await auditLog({
    userId: user.id,
    userLabel: user.name ? `${user.name} (${user.email})` : user.email,
    userRole: user.role,
    action: "PROFILE_CLEARED",
    entityType: "applicant",
    entityId: applicantId,
    description: `Cleared all profile forms (${totalEntries} section entries, ${CLEARED_PERSONAL_FIELDS.length + 4} personal fields, ${documentsReset} document extraction states reset) to allow a fresh PDS upload`,
    ipAddress: getClientIp(req),
  });

  return ok({
    cleared: {
      ...cleared,
      personalFields: CLEARED_PERSONAL_FIELDS.length + 4,
      documentsReset,
    },
    message: "All forms cleared. You can now upload a new document.",
  });
});
