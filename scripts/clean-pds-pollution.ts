// Clean the garbage the faulty PDS auto-apply wrote into applicant #1's
// profile (from the blank CS Form 212 template upload on 2026-09-15).
// Restores the "fresh registration" state: firstName=Test,lastName=Applicant,
// all other personal fields NULL, zero work/training/eligibility entries.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL || "file:/home/z/my-project/db/production-data.db" } },
});

async function count(sql: string): Promise<number> {
  const r = await db.$queryRawUnsafe<{ n: number }>(sql);
  return Number(r[0]?.n ?? 0);
}

async function main() {
  console.log("== BEFORE ==");
  console.log("work rows:", await count("SELECT COUNT(*) n FROM applicant_work_experiences"));
  console.log("training rows:", await count("SELECT COUNT(*) n FROM applicant_trainings"));
  console.log("eligibility rows:", await count("SELECT COUNT(*) n FROM applicant_eligibilities"));
  console.log("work lnk:", await count("SELECT COUNT(*) n FROM applicant_work_experiences_applicant_id_lnk"));
  console.log("training lnk:", await count("SELECT COUNT(*) n FROM applicant_trainings_applicant_id_lnk"));
  console.log("elig lnk:", await count("SELECT COUNT(*) n FROM applicant_eligibilities_applicant_lnk"));
  console.log("elig-cat lnk:", await count("SELECT COUNT(*) n FROM applicant_eligibilities_eligibility_category_lnk"));
  const before = await db.$queryRawUnsafe<{ first_name: string | null; gender: string | null; civil_status: string | null; citizenship: string | null }>(
    "SELECT first_name, gender, civil_status, citizenship FROM applicants WHERE id = 1"
  );
  console.log("applicant 1 personal:", JSON.stringify(before[0]));

  // Capture the polluted row ids BEFORE deleting the links.
  const workIds = await db.$queryRawUnsafe<{ id: number }[]>(
    "SELECT applicant_work_experience_id id FROM applicant_work_experiences_applicant_id_lnk WHERE applicant_id = 1"
  );
  const trainIds = await db.$queryRawUnsafe<{ id: number }[]>(
    "SELECT applicant_training_id id FROM applicant_trainings_applicant_id_lnk WHERE applicant_id = 1"
  );
  const eligIds = await db.$queryRawUnsafe<{ id: number }[]>(
    "SELECT applicant_eligibility_id id FROM applicant_eligibilities_applicant_lnk WHERE applicant_id = 1"
  );

  // 1. Delete link rows for applicant 1.
  await db.$executeRawUnsafe("DELETE FROM applicant_work_experiences_applicant_id_lnk WHERE applicant_id = 1");
  await db.$executeRawUnsafe("DELETE FROM applicant_trainings_applicant_id_lnk WHERE applicant_id = 1");
  await db.$executeRawUnsafe("DELETE FROM applicant_eligibilities_applicant_lnk WHERE applicant_id = 1");
  await db.$executeRawUnsafe("DELETE FROM applicant_eligibilities_eligibility_category_lnk WHERE applicant_eligibility_id IN (" + (eligIds.map((r) => Number(r.id)).join(",") || "0") + ")");

  // 2. Delete the now-orphaned data rows.
  for (const [tbl, ids] of [
    ["applicant_work_experiences", workIds],
    ["applicant_trainings", trainIds],
    ["applicant_eligibilities", eligIds],
  ] as const) {
    const idList = ids.map((r) => Number(r.id)).join(",") || "0";
    await db.$executeRawUnsafe(`DELETE FROM ${tbl} WHERE id IN (${idList})`);
  }

  // 3. Restore personal fields to the fresh-registration state.
  await db.$executeRawUnsafe(
    "UPDATE applicants SET first_name = 'Test', gender = NULL, civil_status = NULL, citizenship = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = 1"
  );

  // 4. Reset auto-increment sequences for a tidy fresh state.
  for (const tbl of ["applicant_work_experiences", "applicant_trainings", "applicant_eligibilities",
    "applicant_work_experiences_applicant_id_lnk", "applicant_trainings_applicant_id_lnk",
    "applicant_eligibilities_applicant_lnk", "applicant_eligibilities_eligibility_category_lnk"]) {
    await db.$executeRawUnsafe(`DELETE FROM sqlite_sequence WHERE name = '${tbl}'`);
  }

  console.log("\n== AFTER ==");
  console.log("work rows:", await count("SELECT COUNT(*) n FROM applicant_work_experiences"));
  console.log("training rows:", await count("SELECT COUNT(*) n FROM applicant_trainings"));
  console.log("eligibility rows:", await count("SELECT COUNT(*) n FROM applicant_eligibilities"));
  const after = await db.$queryRawUnsafe<{ first_name: string | null; last_name: string | null; gender: string | null; civil_status: string | null; citizenship: string | null }>(
    "SELECT first_name, last_name, gender, civil_status, citizenship FROM applicants WHERE id = 1"
  );
  console.log("applicant 1 personal:", JSON.stringify(after[0]));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
