/**
 * cleanup-no-salary-positions.ts — Delete Strapi-era position records that
 * carry no salary data (the user: "delete those jobs that doesnt have monthly
 * salary or SG because they came from the strapi records that we dont need").
 *
 * Criteria for deletion — a position is removed when ALL salary fields are
 * empty:
 *   salary_grade IS NULL/''  AND  salary_amount IS NULL
 *   AND position_salary_grade IS NULL/''  AND position_salary_amount IS NULL/''
 *
 * Everything that hangs off a deleted position is cleaned too:
 *   1. jobpostings_postions_lnk rows pointing at it
 *   2. Legacy job postings that advertised ONLY such positions (they would
 *      render with a blank title on the frontpage) — deleted after their
 *      position links are gone. Postings used by real applications are
 *      protected: applications reference postings 252/270/273, whose
 *      positions (2040, 1754) have salary data.
 *   3. Position-owned child link rows (place of assignment, eligibilities,
 *      deleted_by) and any applicant-experience junction refs.
 *
 * Positions WITH any salary field are kept (20 of 304 as of this writing).
 *
 * Idempotent: re-running detects nothing left and exits cleanly.
 *
 * Usage:  bun scripts/cleanup-no-salary-positions.ts
 */
import { PrismaClient } from "@prisma/client";

const DB_URL = `file:${process.cwd()}/db/production-data.db`;
const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });

const S = <T,>(r: unknown) =>
  JSON.parse(JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? Number(v) : v))) as T;

/** SQL predicate (alias-less) matching positions with zero salary data. */
const NO_SAL = `COALESCE(salary_grade,'') = '' AND salary_amount IS NULL
  AND COALESCE(position_salary_grade,'') = '' AND COALESCE(position_salary_amount,'') = ''`;

/** Junction/child tables that may hold rows tied to a position. */
const POSITION_LINK_TABLES = [
  "jobpostings_postions_lnk",
  "applicant_awards_positions_lnk",
  "applicant_accomplishments_positions_lnk",
  "applicant_interviews_positions_lnk",
  "applicant_interview_assessments_positions_lnk",
  "applicant_examinations_positions_lnk",
  "merged_awards_accomplishments_position_lnk",
  "up_users_postion_lnk",
  "up_users_postion_update_lnk",
  "postions_place_of_assignment_lnk",
  "postions_eligibilities_lnk",
  "postions_specific_eligibilities_lnk",
  "postions_deleted_by_lnk",
] as const;

async function main() {
  const before = (S(
    await db.$queryRawUnsafe<{ c: number }>("SELECT COUNT(*) c FROM postions"),
  ))[0].c;

  const doomed = S(
    await db.$queryRawUnsafe<Array<{ id: number }>>(
      `SELECT id FROM postions WHERE ${NO_SAL}`,
    ),
  );
  const doomedIds = doomed.map((r) => r.id);

  if (doomedIds.length === 0) {
    console.log("No salary-less positions found — nothing to do.");
    await db.$disconnect();
    return;
  }

  // Legacy postings that advertise ONLY doomed positions → they would render
  // blank after cleanup, so they go too. (Postings mixed with healthy links,
  // or referenced by applications, are never touched.)
  const postingsOfDoomed = S(
    await db.$queryRawUnsafe<Array<{ jobposting_id: number }>>(
      `SELECT DISTINCT jobposting_id FROM jobpostings_postions_lnk
       WHERE postion_id IN (${doomedIds.join(",")})`,
    ),
  ).map((r) => r.jobposting_id);

  let postingsToDelete: number[] = [];
  if (postingsOfDoomed.length > 0) {
    const stillHealthy = S(
      await db.$queryRawUnsafe<Array<{ jobposting_id: number }>>(
        `SELECT DISTINCT jobposting_id FROM jobpostings_postions_lnk
         WHERE jobposting_id IN (${postingsOfDoomed.join(",")})
         AND postion_id NOT IN (${doomedIds.join(",")})`,
      ),
    ).map((r) => r.jobposting_id);
    const usedByApps = S(
      await db.$queryRawUnsafe<Array<{ jobposting_id: number }>>(
        `SELECT DISTINCT jobposting_id FROM applications_job_lnk
         WHERE jobposting_id IN (${postingsOfDoomed.join(",")})`,
      ),
    ).map((r) => r.jobposting_id);
    const protectedIds = new Set([...stillHealthy, ...usedByApps]);
    postingsToDelete = postingsOfDoomed.filter((id) => !protectedIds.has(id));
    if (protectedIds.size > 0) {
      console.log(`Protected postings (healthy links / used by applications): ${[...protectedIds].join(", ")}`);
    }
  }

  console.log(`Positions to delete: ${doomedIds.length} (of ${before})`);
  console.log(`Legacy postings to delete: ${postingsToDelete.length ? postingsToDelete.join(", ") : "none"}`);

  await db.$transaction(
    async (tx) => {
      const exe = tx.$executeRawUnsafe.bind(tx);
      const idList = doomedIds.join(",");

      // 1. Remove every link row tied to a doomed position
      for (const t of POSITION_LINK_TABLES) {
        try {
          const n = await exe(
            `DELETE FROM ${t} WHERE postion_id IN (${idList})`,
          );
          if (n > 0) console.log(`  ${t}: deleted ${n} link row(s)`);
        } catch {
          console.warn(`  (skipped missing table ${t})`);
        }
      }

      // 2. Remove legacy postings that advertised only doomed positions
      if (postingsToDelete.length > 0) {
        const pl = postingsToDelete.join(",");
        const a = await exe(`DELETE FROM jobpostings_postions_lnk WHERE jobposting_id IN (${pl})`);
        if (a > 0) console.log(`  jobpostings_postions_lnk: deleted ${a} posting link row(s)`);
        const b = await exe(`DELETE FROM applications_job_lnk WHERE jobposting_id IN (${pl})`);
        if (b > 0) console.warn(`  applications_job_lnk: deleted ${b} row(s) — should not happen!`);
        const c = await exe(`DELETE FROM jobpostings_applicants_lnk WHERE jobposting_id IN (${pl})`);
        if (c > 0) console.log(`  jobpostings_applicants_lnk: deleted ${c} row(s)`);
        const d = await exe(`DELETE FROM jobpostings_user_lnk WHERE jobposting_id IN (${pl})`);
        if (d > 0) console.log(`  jobpostings_user_lnk: deleted ${d} row(s)`);
        const e = await exe(`DELETE FROM jobpostings WHERE id IN (${pl})`);
        console.log(`  jobpostings: deleted ${e} posting(s)`);
      }

      // 3. Delete the doomed positions themselves
      const n = await exe(`DELETE FROM postions WHERE id IN (${idList})`);
      console.log(`  postions: deleted ${n} position(s)`);
    },
    { timeout: 60_000 },
  );

  // Verification
  const after = (S(
    await db.$queryRawUnsafe<{ c: number }>("SELECT COUNT(*) c FROM postions"),
  ))[0].c;
  const remainingNoSal = (S(
    await db.$queryRawUnsafe<{ c: number }>(`SELECT COUNT(*) c FROM postions WHERE ${NO_SAL}`),
  ))[0].c;
  const orphanLinks = (S(
    await db.$queryRawUnsafe<{ c: number }>(
      "SELECT COUNT(*) c FROM jobpostings_postions_lnk WHERE postion_id NOT IN (SELECT id FROM postions)",
    ),
  ))[0].c;
  const appLinks = (S(
    await db.$queryRawUnsafe<{ c: number }>("SELECT COUNT(*) c FROM applications_job_lnk"),
  ))[0].c;

  console.log(`\nPositions: ${before} → ${after}`);
  console.log(`Remaining salary-less positions: ${remainingNoSal}`);
  console.log(`Orphaned posting→position links: ${orphanLinks}`);
  console.log(`Application links intact: ${appLinks} (expected 6)`);
  console.log("Done. Re-run is a no-op.");

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  await db.$disconnect();
  process.exit(1);
});
