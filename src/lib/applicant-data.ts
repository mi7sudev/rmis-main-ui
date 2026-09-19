// Applicant aggregate helpers — load child records (educations, work
// experiences, trainings, eligibilities, awards) for an applicant via the
// explicit junction tables. The production schema does NOT use Prisma relations
// for these — every m2m is stored in an explicit `*_lnk` table.
//
// Each loader returns the child rows already joined with the link row's
// `*_ord` so callers can preserve the schema's manual ordering.

import { db } from "@/lib/db";
import { getApplicantCharacterReference } from "@/lib/raw-json";

// ---- Educations ----
export async function loadApplicantEducations(applicantId: number) {
  const links = await db.applicantEducationLink.findMany({
    where: { applicantId },
    orderBy: { applicantEducationOrd: "asc" },
  });
  if (!links.length) return [];
  const ids = links.map((l) => l.applicantEducationId).filter((x): x is number => x != null);
  const rows = await db.applicantEducation.findMany({ where: { id: { in: ids } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return links
    .map((l) => (l.applicantEducationId ? byId.get(l.applicantEducationId) : undefined))
    .filter((x): x is NonNullable<typeof x> => x != null);
}

// ---- Work Experiences ----
export async function loadApplicantWorkExperiences(applicantId: number) {
  const links = await db.applicantWorkExperienceLink.findMany({
    where: { applicantId },
    orderBy: { applicantWorkExperienceOrd: "asc" },
  });
  if (!links.length) return [];
  const ids = links.map((l) => l.applicantWorkExperienceId).filter((x): x is number => x != null);
  const rows = await db.applicantWorkExperience.findMany({ where: { id: { in: ids } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return links
    .map((l) => (l.applicantWorkExperienceId ? byId.get(l.applicantWorkExperienceId) : undefined))
    .filter((x): x is NonNullable<typeof x> => x != null);
}

// ---- Trainings ----
export async function loadApplicantTrainings(applicantId: number) {
  const links = await db.applicantTrainingLink.findMany({
    where: { applicantId },
    orderBy: { applicantTrainingOrd: "asc" },
  });
  if (!links.length) return [];
  const ids = links.map((l) => l.applicantTrainingId).filter((x): x is number => x != null);
  const rows = await db.applicantTraining.findMany({ where: { id: { in: ids } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return links
    .map((l) => (l.applicantTrainingId ? byId.get(l.applicantTrainingId) : undefined))
    .filter((x): x is NonNullable<typeof x> => x != null);
}

// ---- Eligibilities (with linked category name from `eligibilities` table) ----
export type ApplicantEligibilityWithCategory = Awaited<
  ReturnType<typeof loadApplicantEligibilities>
>[number];

export async function loadApplicantEligibilities(applicantId: number) {
  const links = await db.applicantEligibilityLink.findMany({
    where: { applicantId },
    orderBy: { applicantEligibilityOrd: "asc" },
  });
  if (!links.length) return [];
  const ids = links.map((l) => l.applicantEligibilityId).filter((x): x is number => x != null);
  const [rows, categoryLinks] = await Promise.all([
    db.applicantEligibility.findMany({ where: { id: { in: ids } } }),
    db.applicantEligibilityCategoryLink.findMany({
      where: { applicantEligibilityId: { in: ids } },
    }),
  ]);
  // Map each applicant_eligibility → its first linked eligibility category name
  const eligibilityIds = Array.from(
    new Set(categoryLinks.map((c) => c.eligibilityId).filter((x): x is number => x != null))
  );
  const categories = eligibilityIds.length
    ? await db.eligibility.findMany({ where: { id: { in: eligibilityIds } } })
    : [];
  const catById = new Map(categories.map((c) => [c.id, c.name]));
  const catLinkByApplElig = new Map<number, number | null>();
  for (const cl of categoryLinks) {
    if (cl.applicantEligibilityId == null) continue;
    if (!catLinkByApplElig.has(cl.applicantEligibilityId)) {
      catLinkByApplElig.set(cl.applicantEligibilityId, cl.eligibilityId);
    }
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  return links
    .map((l) => {
      if (!l.applicantEligibilityId) return undefined;
      const row = byId.get(l.applicantEligibilityId);
      if (!row) return undefined;
      const catId = catLinkByApplElig.get(row.id) ?? null;
      const eligibilityTitle = catId != null ? catById.get(catId) ?? null : null;
      return { ...row, eligibilityTitle };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
}

/**
 * Backfill `eligibilityTitle` for eligibility items whose title is still null.
 *
 * Production stores the title link in `specific_eligibilities_applicant_eligibility_lnk`
 * (not in `applicant_eligibilities_eligibility_category_lnk`, which has 0 rows in
 * production). This resolves the title via the path:
 *
 *   specific_eligibilities_applicant_eligibility_lnk
 *     → specific_eligibilities (name)             ← prefer this
 *     → specific_eligibilities_eligibility_lnk
 *         → eligibilities (name)                  ← fallback
 *
 * Only items whose title is still null are touched, so newly-created entries
 * (which write to the category link) keep working. Patches items in place.
 */
export async function fillEligibilityTitleFromSpecificLinks<
  T extends { id: number; eligibilityTitle: string | null }
>(items: T[]): Promise<void> {
  const aeIds = items.filter((it) => it.eligibilityTitle == null).map((it) => it.id);
  if (!aeIds.length) return;

  const specificLinks = await db.specificEligibilityApplicantEligibilityLink.findMany({
    where: { applicantEligibilityId: { in: aeIds } },
    orderBy: { specificEligibilityOrd: "asc" },
  });
  if (!specificLinks.length) return;

  const specificIds = Array.from(
    new Set(
      specificLinks
        .map((l) => l.specificEligibilityId)
        .filter((x): x is number => x != null)
    )
  );
  const [specifics, specificEligLinks] = await Promise.all([
    specificIds.length
      ? db.specificEligibility.findMany({ where: { id: { in: specificIds } } })
      : [],
    specificIds.length
      ? db.specificEligibilityEligibilityLink.findMany({
          where: { specificEligibilityId: { in: specificIds } },
          orderBy: { specificEligibilityOrd: "asc" },
        })
      : [],
  ]);

  const specNameById = new Map<number, string | null>(
    specifics.map((s) => [s.id, s.name] as [number, string | null])
  );
  // First specificEligibilityId per applicantEligibilityId (lowest ord).
  const firstSpecByAe = new Map<number, number | null>();
  for (const sl of specificLinks) {
    if (sl.applicantEligibilityId == null) continue;
    if (!firstSpecByAe.has(sl.applicantEligibilityId)) {
      firstSpecByAe.set(sl.applicantEligibilityId, sl.specificEligibilityId);
    }
  }
  // First eligibilityId per specificEligibilityId (lowest ord).
  const firstEligBySpec = new Map<number, number | null>();
  for (const sel of specificEligLinks) {
    if (sel.specificEligibilityId == null) continue;
    if (!firstEligBySpec.has(sel.specificEligibilityId)) {
      firstEligBySpec.set(sel.specificEligibilityId, sel.eligibilityId);
    }
  }
  const eligIds = Array.from(
    new Set(
      Array.from(firstEligBySpec.values()).filter(
        (x): x is number => x != null
      )
    )
  );
  const eligibilities = eligIds.length
    ? await db.eligibility.findMany({ where: { id: { in: eligIds } } })
    : [];
  const eligNameById = new Map(eligibilities.map((e) => [e.id, e.name]));

  for (const it of items) {
    if (it.eligibilityTitle != null) continue;
    const specId = firstSpecByAe.get(it.id) ?? null;
    if (specId == null) continue;
    // Prefer specific_eligibilities.name (e.g. "RA7883 Barangay Health Worker").
    const specName = specNameById.get(specId) ?? null;
    if (specName) {
      it.eligibilityTitle = specName;
      continue;
    }
    // Fallback: chain through specific_eligibilities_eligibility_lnk → eligibilities.name.
    const eligId = firstEligBySpec.get(specId) ?? null;
    if (eligId != null) {
      it.eligibilityTitle = eligNameById.get(eligId) ?? null;
    }
  }
}

// ---- Awards ----
export async function loadApplicantAwards(applicantId: number) {
  const links = await db.applicantAwardLink.findMany({
    where: { applicantId },
    orderBy: { applicantAwardOrd: "asc" },
  });
  if (!links.length) return [];
  const ids = links.map((l) => l.applicantAwardId).filter((x): x is number => x != null);
  const rows = await db.applicantAward.findMany({ where: { id: { in: ids } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return links
    .map((l) => (l.applicantAwardId ? byId.get(l.applicantAwardId) : undefined))
    .filter((x): x is NonNullable<typeof x> => x != null);
}

// ---- Documents (filesystem-based; see /api/applicant/documents) ----
// The production DB does NOT have a dedicated `documents` table — uploaded
// files live in `files` with a polymorphic relation in `files_related_mph`.
// For now we list documents from the `upload/` directory filtered by applicant.
// This is a known limitation; document metadata is not persisted in the DB.

// ---- Full profile aggregate (for MQR verification + application snapshots) ----
export type ApplicantFullProfile = {
  id: number;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  extensionName: string | null;
  emailAddress: string | null;
  contactNumber: string | null;
  mobileNumber: bigint | null;
  gender: string | null;
  civilStatus: string | null;
  citizenship: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  presentAddress: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  zipCode: string | null;
  isFillouted: boolean | null;
  characterReferenceRaw: string | null;
  educations: Awaited<ReturnType<typeof loadApplicantEducations>>;
  workExperiences: Awaited<ReturnType<typeof loadApplicantWorkExperiences>>;
  trainings: Awaited<ReturnType<typeof loadApplicantTrainings>>;
  eligibilities: Awaited<ReturnType<typeof loadApplicantEligibilities>>;
  awards: Awaited<ReturnType<typeof loadApplicantAwards>>;
};

export async function loadApplicantFullProfile(applicantId: number): Promise<ApplicantFullProfile | null> {
  const applicant = await db.applicant.findUnique({ where: { id: applicantId } });
  if (!applicant) return null;
  // Use allSettled for the same resilience as the profile route — a single
  // corrupted section should not prevent the full-profile snapshot from loading.
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
  // raw-json functions are synchronous (better-sqlite3 is sync)
  const characterReferenceRaw = getApplicantCharacterReference(applicantId);
  return {
    id: applicant.id,
    firstName: applicant.firstName,
    middleName: applicant.middleName,
    lastName: applicant.lastName,
    extensionName: applicant.extensionName,
    emailAddress: applicant.emailAddress,
    contactNumber: applicant.contactNumber,
    mobileNumber: applicant.mobileNumber,
    gender: applicant.gender,
    civilStatus: applicant.civilStatus,
    citizenship: applicant.citizenship,
    birthDate: applicant.birthDate,
    birthPlace: applicant.birthPlace,
    presentAddress: applicant.presentAddress,
    city: applicant.city,
    province: applicant.province,
    country: applicant.country,
    zipCode: applicant.zipCode,
    isFillouted: applicant.isFillouted,
    characterReferenceRaw,
    educations,
    workExperiences,
    trainings,
    eligibilities,
    awards,
  };
}

// ---- Junction-table link creators (call after creating a child row) ----
export async function linkEducationToApplicant(applicantEducationId: number, applicantId: number) {
  return db.applicantEducationLink.create({
    data: { applicantEducationId, applicantId, applicantEducationOrd: Date.now() },
  });
}

export async function linkWorkExperienceToApplicant(applicantWorkExperienceId: number, applicantId: number) {
  return db.applicantWorkExperienceLink.create({
    data: { applicantWorkExperienceId, applicantId, applicantWorkExperienceOrd: Date.now() },
  });
}

export async function linkTrainingToApplicant(applicantTrainingId: number, applicantId: number) {
  return db.applicantTrainingLink.create({
    data: { applicantTrainingId, applicantId, applicantTrainingOrd: Date.now() },
  });
}

export async function linkEligibilityToApplicant(applicantEligibilityId: number, applicantId: number) {
  return db.applicantEligibilityLink.create({
    data: { applicantEligibilityId, applicantId, applicantEligibilityOrd: Date.now() },
  });
}

export async function linkAwardToApplicant(applicantAwardId: number, applicantId: number) {
  return db.applicantAwardLink.create({
    data: { applicantAwardId, applicantId, applicantAwardOrd: Date.now() },
  });
}

// Optionally link an ApplicantEligibility to a category (Eligibility row).
// Production stores this in `applicant_eligibilities_eligibility_category_lnk`.
export async function linkEligibilityToCategory(applicantEligibilityId: number, eligibilityId: number) {
  return db.applicantEligibilityCategoryLink.create({
    data: { applicantEligibilityId, eligibilityId },
  });
}

/**
 * Find-or-create the `eligibilities` reference row that carries an applicant
 * eligibility's TITLE (the ApplicantEligibility table has no title column —
 * the title lives on the linked Eligibility row via the category link).
 *
 * Previously the lookup-only version silently DROPPED any title that wasn't
 * already in the reference vocabulary, so titles typed through the profile
 * form (or extracted from a PDS) vanished from the list after a reload.
 * This now creates the missing reference row, so every title persists.
 *
 * Created rows are DRAFTS (publishedAt left null): they resolve for the
 * owner's own list (loadApplicantEligibilities does not filter published)
 * but do NOT leak into the public /api/reference dropdown other applicants
 * see. Published vocabulary rows are only ever matched, never duplicated.
 */
export async function findOrCreateEligibilityReference(
  name: string
): Promise<number> {
  const trimmed = name.trim();
  const existing = await db.eligibility.findFirst({ where: { name: trimmed } });
  if (existing) return existing.id;
  const now = new Date();
  const created = await db.eligibility.create({
    data: { name: trimmed, createdAt: now, updatedAt: now },
  });
  return created.id;
}

// ---- Bulk section clearers (used by auto-apply OVERRIDE behavior) ----
//
// When an applicant uploads a new PDS / document, the extracted data is the
// LATEST source of truth for matching form fields. Before writing the new
// entries we must CLEAR the existing child rows + their junction links for
// that section so the new document fully REPLACES the old data (instead of
// appending duplicates).
//
// Each clearer:
//   1. Loads all junction links for the applicant (to get the child row ids).
//   2. Deletes the junction links.
//   3. Deletes the child rows themselves.
// Returns the number of entries removed.

/** Clear all education entries + links for an applicant. */
export async function clearApplicantEducations(applicantId: number): Promise<number> {
  const links = await db.applicantEducationLink.findMany({ where: { applicantId } });
  const ids = links.map((l) => l.applicantEducationId).filter((x): x is number => x != null);
  if (!ids.length) return 0;
  await db.applicantEducationLink.deleteMany({ where: { applicantId } });
  await db.applicantEducation.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

/** Clear all work-experience entries + links for an applicant. */
export async function clearApplicantWorkExperiences(applicantId: number): Promise<number> {
  const links = await db.applicantWorkExperienceLink.findMany({ where: { applicantId } });
  const ids = links.map((l) => l.applicantWorkExperienceId).filter((x): x is number => x != null);
  if (!ids.length) return 0;
  await db.applicantWorkExperienceLink.deleteMany({ where: { applicantId } });
  await db.applicantWorkExperience.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

/** Clear all training entries + links for an applicant. */
export async function clearApplicantTrainings(applicantId: number): Promise<number> {
  const links = await db.applicantTrainingLink.findMany({ where: { applicantId } });
  const ids = links.map((l) => l.applicantTrainingId).filter((x): x is number => x != null);
  if (!ids.length) return 0;
  await db.applicantTrainingLink.deleteMany({ where: { applicantId } });
  await db.applicantTraining.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

/**
 * Clear all eligibility entries + links for an applicant.
 * Also clears the eligibility-category junction rows that point at the
 * applicant_eligibilities being removed (so no orphan category links remain).
 */
export async function clearApplicantEligibilities(applicantId: number): Promise<number> {
  const links = await db.applicantEligibilityLink.findMany({ where: { applicantId } });
  const ids = links.map((l) => l.applicantEligibilityId).filter((x): x is number => x != null);
  if (!ids.length) return 0;
  await db.applicantEligibilityLink.deleteMany({ where: { applicantId } });
  // Clean up the category junction rows that referenced these eligibilities.
  await db.applicantEligibilityCategoryLink.deleteMany({
    where: { applicantEligibilityId: { in: ids } },
  });
  await db.applicantEligibility.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

/** Clear all award entries + links for an applicant. */
export async function clearApplicantAwards(applicantId: number): Promise<number> {
  const links = await db.applicantAwardLink.findMany({ where: { applicantId } });
  const ids = links.map((l) => l.applicantAwardId).filter((x): x is number => x != null);
  if (!ids.length) return 0;
  await db.applicantAwardLink.deleteMany({ where: { applicantId } });
  await db.applicantAward.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

// ---- Removal helpers (delete child + its junction row) ----
export async function findApplicantEducationId(id: number, applicantId: number): Promise<number | null> {
  const link = await db.applicantEducationLink.findFirst({
    where: { applicantEducationId: id, applicantId },
  });
  return link?.applicantEducationId ?? null;
}

export async function findApplicantWorkExperienceId(id: number, applicantId: number): Promise<number | null> {
  const link = await db.applicantWorkExperienceLink.findFirst({
    where: { applicantWorkExperienceId: id, applicantId },
  });
  return link?.applicantWorkExperienceId ?? null;
}

export async function findApplicantTrainingId(id: number, applicantId: number): Promise<number | null> {
  const link = await db.applicantTrainingLink.findFirst({
    where: { applicantTrainingId: id, applicantId },
  });
  return link?.applicantTrainingId ?? null;
}

export async function findApplicantEligibilityId(id: number, applicantId: number): Promise<number | null> {
  const link = await db.applicantEligibilityLink.findFirst({
    where: { applicantEligibilityId: id, applicantId },
  });
  return link?.applicantEligibilityId ?? null;
}

export async function findApplicantAwardId(id: number, applicantId: number): Promise<number | null> {
  const link = await db.applicantAwardLink.findFirst({
    where: { applicantAwardId: id, applicantId },
  });
  return link?.applicantAwardId ?? null;
}

// ---- JobPosting ↔ Position (junction: jobpostings_postions_lnk) ----
export async function loadJobPostingPositions(jobpostingId: number) {
  const links = await db.jobPostingPositionLink.findMany({
    where: { jobpostingId },
    orderBy: { postionOrd: "asc" },
  });
  if (!links.length) return [];
  const ids = links.map((l) => l.postionId).filter((x): x is number => x != null);
  const positions = await db.position.findMany({ where: { id: { in: ids } } });
  const byId = new Map(positions.map((p) => [p.id, p]));
  return links
    .map((l) => (l.postionId ? byId.get(l.postionId) : undefined))
    .filter((x): x is NonNullable<typeof x> => x != null);
}

// Load the single (first) position linked to a job posting — most jobs map to one position.
export async function loadJobPostingPosition(jobpostingId: number) {
  const positions = await loadJobPostingPositions(jobpostingId);
  return positions[0] ?? null;
}

// Load linked PlaceOfAssignment rows for a position.
export async function loadPositionPlaceOfAssignment(postionId: number) {
  const links = await db.positionPlaceOfAssignmentLink.findMany({
    where: { postionId },
  });
  if (!links.length) return [];
  const ids = links.map((l) => l.placeOfAssignmentId).filter((x): x is number => x != null);
  const places = await db.placeOfAssignment.findMany({ where: { id: { in: ids } } });
  const byId = new Map(places.map((p) => [p.id, p]));
  return links
    .map((l) => (l.placeOfAssignmentId ? byId.get(l.placeOfAssignmentId) : undefined))
    .filter((x): x is NonNullable<typeof x> => x != null);
}

// ---- Application ↔ Applicant / JobPosting (junction tables) ----
export async function findApplicationForApplicantJob(applicantId: number, jobpostingId: number) {
  // Find all applications linked to this applicant, then check which one is
  // also linked to the given job posting.
  const applLinks = await db.applicationApplicantLink.findMany({ where: { applicantId } });
  const applicationIds = applLinks
    .map((l) => l.applicationId)
    .filter((x): x is number => x != null);
  if (!applicationIds.length) return null;
  const jobLinks = await db.applicationJobLink.findMany({
    where: { applicationId: { in: applicationIds }, jobpostingId },
  });
  if (!jobLinks.length) return null;
  const applicationId = jobLinks[0].applicationId;
  return db.application.findUnique({ where: { id: applicationId! } });
}

export async function findApplicationsForApplicant(applicantId: number) {
  const links = await db.applicationApplicantLink.findMany({ where: { applicantId } });
  const applicationIds = links
    .map((l) => l.applicationId)
    .filter((x): x is number => x != null);
  if (!applicationIds.length) return [];
  return db.application.findMany({
    where: { id: { in: applicationIds } },
    orderBy: { dateApplied: "desc" },
  });
}

export async function findApplicationsForJob(jobpostingId: number) {
  const links = await db.applicationJobLink.findMany({ where: { jobpostingId } });
  const applicationIds = links
    .map((l) => l.applicationId)
    .filter((x): x is number => x != null);
  if (!applicationIds.length) return [];
  return db.application.findMany({
    where: { id: { in: applicationIds } },
    orderBy: { dateApplied: "desc" },
  });
}

export async function findApplicationApplicantId(applicationId: number): Promise<number | null> {
  const link = await db.applicationApplicantLink.findFirst({ where: { applicationId } });
  return link?.applicantId ?? null;
}

export async function findApplicationJobId(applicationId: number): Promise<number | null> {
  const link = await db.applicationJobLink.findFirst({ where: { applicationId } });
  return link?.jobpostingId ?? null;
}

export async function findApplicationsForApplicantList(applicantId: number): Promise<number[]> {
  const links = await db.applicationApplicantLink.findMany({ where: { applicantId } });
  return links.map((l) => l.applicationId).filter((x): x is number => x != null);
}

// ---- Batch loaders (eliminate N+1 in list endpoints) ----

/**
 * Batch-load the first position for each of multiple job postings.
 * Returns a Map<jobPostingId, Position> for O(1) lookup.
 * Uses 2 queries total (junction + positions) instead of 2N.
 */
export async function batchLoadJobPostingPositions(jobPostingIds: number[]) {
  const result = new Map<number, Awaited<ReturnType<typeof db.position.findFirst>>>();
  if (!jobPostingIds.length) return result;

  const links = await db.jobPostingPositionLink.findMany({
    where: { jobpostingId: { in: jobPostingIds } },
    orderBy: { postionOrd: "asc" },
  });
  const positionIds = links
    .map((l) => l.postionId)
    .filter((x): x is number => x != null);
  if (!positionIds.length) return result;

  const positions = await db.position.findMany({ where: { id: { in: positionIds } } });
  const positionById = new Map(positions.map((p) => [p.id, p]));

  // For each job posting, take the first linked position (lowest ord)
  const seen = new Set<number>();
  for (const link of links) {
    if (link.jobpostingId == null) continue;
    if (seen.has(link.jobpostingId)) continue;
    seen.add(link.jobpostingId);
    if (link.postionId != null) {
      const pos = positionById.get(link.postionId);
      if (pos) result.set(link.jobpostingId, pos);
    }
  }
  return result;
}

/**
 * Batch-load the first place of assignment for each of multiple positions.
 * Returns a Map<positionId, {id, name}> for O(1) lookup.
 * Uses 2 queries total instead of 2N.
 */
export async function batchLoadPositionPlaceOfAssignment(positionIds: number[]) {
  const result = new Map<number, { id: number; name: string | null }>();
  if (!positionIds.length) return result;

  const links = await db.positionPlaceOfAssignmentLink.findMany({
    where: { postionId: { in: positionIds } },
  });
  const placeIds = links
    .map((l) => l.placeOfAssignmentId)
    .filter((x): x is number => x != null);
  if (!placeIds.length) return result;

  const places = await db.placeOfAssignment.findMany({ where: { id: { in: placeIds } } });
  const placeById = new Map(places.map((p) => [p.id, p]));

  const seen = new Set<number>();
  for (const link of links) {
    if (link.postionId == null) continue;
    if (seen.has(link.postionId)) continue;
    seen.add(link.postionId);
    if (link.placeOfAssignmentId != null) {
      const place = placeById.get(link.placeOfAssignmentId);
      if (place) result.set(link.postionId, { id: place.id, name: place.name });
    }
  }
  return result;
}
