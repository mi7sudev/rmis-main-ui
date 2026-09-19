/** Analysis: which no-salary positions are referenced by what. */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({
  datasources: { db: { url: `file:${process.cwd()}/db/production-data.db` } },
});

const S = <T,>(r: unknown) =>
  JSON.parse(JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? Number(v) : v))) as T;

const P = "p";
const NO_SAL = `COALESCE(${P}.salary_grade,'') = '' AND ${P}.salary_amount IS NULL AND COALESCE(${P}.position_salary_grade,'') = '' AND COALESCE(${P}.position_salary_amount,'') = ''`;

async function main() {
  // 20 positions WITH salary
  const withSal = S(
    await db.$queryRawUnsafe<Array<{ id: number; item_number: string | null; salary_grade: string | null; position_salary_grade: string | null }>>(
      `SELECT id, item_number, salary_grade, position_salary_grade FROM postions ${P} WHERE NOT (${NO_SAL}) ORDER BY id`,
    ),
  );
  console.log(`WITH salary (${withSal.length}):`);
  for (const p of withSal) {
    console.log(`  id=${p.id} item=${p.item_number ?? "—"} SG=${p.salary_grade ?? p.position_salary_grade ?? "—"}`);
  }

  // Job posting links → salary status of linked position
  const jobLinks = S(
    await db.$queryRawUnsafe<Array<{ jobposting_id: number; postion_id: number; position_title: string; sal: string }>>(
      `SELECT l.jobposting_id, l.postion_id, p.position_title,
        CASE WHEN (${NO_SAL}) THEN 'NO_SALARY' ELSE 'HAS_SALARY' END sal
       FROM jobpostings_postions_lnk l JOIN postions p ON p.id = l.postion_id`,
    ),
  );
  const noSalJobLinks = jobLinks.filter((l) => l.sal === "NO_SALARY");
  console.log(`\nJob-posting links: ${jobLinks.length} total, ${noSalJobLinks.length} point at NO-salary positions`);
  for (const l of noSalJobLinks) console.log(`  posting=${l.jobposting_id} → pos=${l.postion_id} "${l.position_title}"`);

  // Other junction references to no-salary positions
  const tables = [
    "applicant_awards_positions_lnk",
    "applicant_accomplishments_positions_lnk",
    "applicant_interviews_positions_lnk",
    "applicant_interview_assessments_positions_lnk",
    "applicant_examinations_positions_lnk",
    "merged_awards_accomplishments_position_lnk",
    "up_users_postion_lnk",
    "up_users_postion_update_lnk",
  ];
  console.log("");
  for (const t of tables) {
    const r = S(
      await db.$queryRawUnsafe<Array<{ c: number }>>(
        `SELECT COUNT(*) c FROM ${t} l JOIN postions p ON p.id = l.postion_id WHERE (${NO_SAL})`,
      ),
    );
    if (r[0].c > 0) console.log(`${t} → refs to no-salary positions: ${r[0].c}`);
  }

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  await db.$disconnect();
  process.exit(1);
});
