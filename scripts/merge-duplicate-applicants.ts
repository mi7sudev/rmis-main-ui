/**
 * One-time data cleanup — legacy-import duplicate profile consolidation.
 *
 * The legacy import registered several people TWICE (or thrice): identical
 * name + email, separate `applicants` rows, with the same child records
 * (education, experience, applications…) linked to BOTH profiles. This script:
 *
 *   1. Moves every junction-table row from a duplicate profile to the
 *      canonical profile (the one with the account link / fullest record).
 *      If the canonical profile ALREADY has the same child link, the
 *      duplicate row is deleted instead of moved (unique-constraint safe).
 *   2. Collapses any exact-duplicate junction rows left anywhere in each
 *      table (same child + same applicant, differing only by row id).
 *   3. Deletes the merged-away profiles and the 8 empty unnamed import
 *      stubs (no name, no email, no links of any kind, no upload folder).
 *
 * Idempotent — safe to re-run. Run: bun scripts/merge-duplicate-applicants.ts
 * Safety: db/production-data.backup-pre-strapi-cleanup.db is a pre-run copy.
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({
  datasources: { db: { url: "file:/home/z/my-project/db/production-data.db" } },
});

/** [canonicalId, duplicateIds[]] — from the 2026-09 audit. */
const GROUPS: Array<[number, number[]]> = [
  [148, [567]], // Ralph Lawrence Olaguer (canonical has the JobPosting link)
  [369, [555]], // Aldwin Idjirani Jara
  [393, [526]], // Erick De Guzman Edquiban
  [395, [488]], // Eric B Casila
  [468, [478]], // Joanna Mae Burro
  [529, [541]], // Rick David Tundag Suyat
  [568, [574, 575]], // Juan Dela Cruz (canonical holds the testapplicant login)
  [570, [571, 573]], // Anna Louisse Bachoco (canonical holds application + assessment)
  [577, [576]], // Mar James Kenitte Jule Delimios (canonical holds the delimios login)
];

/** Empty import stubs — zero links, no name, no email, no upload folder. */
const ORPHANS = [521, 522, 523, 524, 527, 528, 542, 543];

/** Every junction table with an `applicantId` column. */
const LINK_TABLES = [
  "userApplicantLink",
  "applicationApplicantLink",
  "applicantEducationLink",
  "applicantWorkExperienceLink",
  "applicantTrainingLink",
  "applicantEligibilityLink",
  "applicantAwardLink",
  "applicantAccomplishmentLink",
  "applicantFormLink",
  "applicantSummaryProfileLink",
  "jobPostingApplicantLink",
  "interviewApplicantLink",
  "assessmentApplicantLink",
  "examinationApplicantLink",
  "specificEligibilityApplicantLink",
  "notificationApplicantLink",
  "mergedAwardsAccomplishmentLink",
] as const;

type AnyRow = Record<string, unknown>;
type AnyDb = Record<string, any>;

const bigintSafe = (_k: string, v: unknown) =>
  typeof v === "bigint" ? String(v) : v;

/** Key = every field except the row id and the applicant pointer. */
function childKey(row: AnyRow): string {
  const { id: _id, applicantId: _applicantId, ...rest } = row;
  return JSON.stringify(rest, bigintSafe);
}

async function main() {
  const dupIds = GROUPS.flatMap(([, d]) => d);

  // ---- 1. Move (or drop-redundant) junction rows per group -----------------
  for (const table of LINK_TABLES) {
    for (const [keep, dups] of GROUPS) {
      const dupRows: AnyRow[] = await (db as AnyDb)[table].findMany({
        where: { applicantId: { in: dups } },
      });
      if (!dupRows.length) continue;
      const canonRows: AnyRow[] = await (db as AnyDb)[table].findMany({
        where: { applicantId: keep },
      });
      const canonKeys = new Set(canonRows.map(childKey));
      let moved = 0;
      let dropped = 0;
      for (const row of dupRows) {
        if (canonKeys.has(childKey(row))) {
          // Canonical already links this child — the duplicate row is noise.
          await (db as AnyDb)[table].delete({ where: { id: row.id } });
          dropped++;
        } else {
          await (db as AnyDb)[table].update({
            where: { id: row.id },
            data: { applicantId: keep },
          });
          canonKeys.add(childKey(row));
          moved++;
        }
      }
      if (moved || dropped) {
        console.log(
          `  ${table}: ${moved} row(s) -> #${keep}` +
            (dropped ? `, ${dropped} redundant row(s) dropped` : "")
        );
      }
    }
  }

  // ---- 2. Collapse exact-duplicate rows anywhere in each table -------------
  for (const table of LINK_TABLES) {
    const rows: AnyRow[] = await (db as AnyDb)[table].findMany({
      orderBy: { id: "asc" },
    });
    const seen = new Set<string>();
    const remove: number[] = [];
    for (const row of rows) {
      const key = childKey(row);
      if (seen.has(key)) remove.push(row.id as number);
      else seen.add(key);
    }
    if (remove.length) {
      await (db as AnyDb)[table].deleteMany({ where: { id: { in: remove } } });
      console.log(`  ${table}: ${remove.length} exact duplicate row(s) removed`);
    }
  }

  // ---- 3. Delete merged-away profiles + empty import stubs -----------------
  const gone = await db.applicant.deleteMany({
    where: { id: { in: [...dupIds, ...ORPHANS] } },
  });
  console.log(`Applicant profiles deleted: ${gone.count}`);
  console.log(`Remaining applicant profiles: ${await db.applicant.count()}`);
  console.log(`User accounts (untouched): ${await db.user.count()}`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
