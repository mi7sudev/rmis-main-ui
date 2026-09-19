/**
 * clean-to-fresh.ts — FINAL lean cleanup on top of the Task-9 fresh reset.
 *
 * Task 9 (seed-fresh.ts) already removed all legacy Strapi-era records and
 * re-seeded a demo dataset. Per the user's follow-up ("clean the database so
 * that we can start fresh"), this script removes the remaining DEMO residue so
 * the system starts truly empty:
 *
 *   Phase 1 — wipes ALL applicant / pipeline data (children → parents):
 *             applications (+lnks), applicant profile children, merged award
 *             sets, interviews/assessments/examinations, notifications.
 *   Phase 2 — resets AUTOINCREMENT counters of every wiped table.
 *   Phase 3 — accounts: deletes the demo candidate login `mariasantos`;
 *             renames `testapplicant` to the neutral "Test Applicant" and
 *             clears its fillouted flag (matches a brand-new registration).
 *   Phase 4 — recreates ONE minimal applicant profile for `testapplicant`
 *             (exactly the shape /api/auth/register creates) + user link, so
 *             the login stays valid and the applicant side shows the normal
 *             profile-setup journey.
 *   Phase 5 — wipes db/audit.db audit_logs (demo history).
 *
 * KEPT: testadmin / testevaluator / testapplicant logins, RBAC trio
 * (up_roles / up_permissions / up_permissions_role_lnk), recruitment catalog
 * (postions, jobpostings + links, place_of_assignments, eligibilities,
 * specific_eligibilities, courses), evaluation/interviewer tables (empty).
 *
 * RUN: DATABASE_URL=file:/home/z/my-project/db/production-data.db bun scripts/clean-to-fresh.ts
 */

import { PrismaClient } from "@prisma/client";
import { Database } from "bun:sqlite";
import { join } from "path";

process.env.DATABASE_URL = "file:/home/z/my-project/db/production-data.db";
const db = new PrismaClient();

// Children first → parents. Includes 0-row tables so a re-run is always clean.
const WIPE_ORDER: string[] = [
  // pipeline
  "applications_job_lnk",
  "applications_applicant_lnk",
  "applications",
  // merged award/accomplishment sets (applicant-derived)
  "merged_awards_accomp73efd_applicant_accomplishments_lnk",
  "merged_awards_accomplishments_applicant_awards_lnk",
  "merged_awards_accomplishments_applicant_lnk",
  "merged_awards_accomplishments_position_lnk",
  "merged_awards_accomplishments",
  // interviews / assessments / examinations
  "applicant_interview_assessments_interviewers_lnk",
  "applicant_interview_assessments_applicants_lnk",
  "applicant_interview_assessments_positions_lnk",
  "applicant_interview_assessments",
  "applicant_interviews_applicants_lnk",
  "applicant_interviews_positions_lnk",
  "applicant_interviews",
  "applicant_examinations_applicants_lnk",
  "applicant_examinations_positions_lnk",
  "applicant_examinations",
  // notifications
  "notifications_applicant_lnk",
  "notifications",
  // education
  "courses_applicant_education_lnk",
  "applicant_educations_applicant_id_lnk",
  "applicant_educations",
  // work experience
  "applicant_work_experiences_applicant_id_lnk",
  "applicant_work_experiences",
  // training
  "applicant_trainings_applicant_id_lnk",
  "applicant_trainings",
  // eligibility
  "specific_eligibilities_applicant_lnk",
  "specific_eligibilities_applicant_eligibility_lnk",
  "applicant_eligibilities_eligibility_category_lnk",
  "applicant_eligibilities_applicant_lnk",
  "applicant_eligibilities",
  // awards / accomplishments
  "applicant_awards_positions_lnk",
  "applicant_awards_applicant_lnk",
  "applicant_awards",
  "applicant_accomplishments_positions_lnk",
  "applicant_accomplishments_applicant_lnk",
  "applicant_accomplishments",
  // forms / summary profiles
  "applicant_forms_applicant_lnk",
  "applicant_forms",
  "applicant_summary_profiles_applicant_lnk",
  "applicant_summary_profiles",
  // postings ↔ applicants links
  "jobpostings_applicants_lnk",
  // master
  "up_users_applicant_id_lnk",
  "applicants",
];

async function nonZeroTables(): Promise<Record<string, number>> {
  const tables: { name: string }[] = await db.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  );
  const out: Record<string, number> = {};
  for (const t of tables) {
    try {
      const rows: any[] = await db.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM "${t.name}"`);
      const n = typeof rows[0].n === "bigint" ? Number(rows[0].n) : rows[0].n;
      if (n > 0) out[t.name] = n;
    } catch {
      /* skip views/oddities */
    }
  }
  return out;
}

async function wipeAuditDb() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const audit = new Database(join(process.cwd(), "db", "audit.db"));
      audit.exec("DELETE FROM audit_logs");
      audit.close();
      console.log("[audit] audit_logs cleared");
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt === 3) {
        console.log("[audit] skipped after 3 attempts:", msg);
        return;
      }
      console.log(`[audit] attempt ${attempt} failed (${msg}), retrying...`);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

async function main() {
  console.log("=== PRE-CLEAN non-zero tables ===");
  console.log(JSON.stringify(await nonZeroTables(), null, 0));

  const users: any[] = await db.$queryRawUnsafe(
    `SELECT id, username, email, first_name, last_name FROM up_users ORDER BY id`
  );
  const ta = users.find((u) => u.username === "testapplicant");
  const maria = users.find((u) => u.username === "mariasantos");
  if (!ta) throw new Error("testapplicant account not found — aborting (refusing to run blindly)");
  console.log(`[accounts] testapplicant=#${ta.id} <${ta.email}>, mariasantos=${maria ? `#${maria.id}` : "absent"}`);

  await db.$transaction(async (tx) => {
    // ---- Phase 1: wipe applicant / pipeline data -------------------------
    for (const t of WIPE_ORDER) {
      const res = await tx.$executeRawUnsafe(`DELETE FROM "${t}"`);
      if (res > 0) console.log(`[wipe] ${t}: ${res} row(s)`);
    }

    // ---- Phase 2: reset AUTOINCREMENT counters ---------------------------
    await tx.$executeRawUnsafe(
      `DELETE FROM sqlite_sequence WHERE name IN (${WIPE_ORDER.map((t) => `'${t}'`).join(",")})`
    );
    console.log("[sequence] AUTOINCREMENT counters reset for wiped tables");

    // ---- Phase 3: accounts ------------------------------------------------
    if (maria) {
      const r1 = await tx.$executeRawUnsafe(`DELETE FROM up_users_role_lnk WHERE user_id = ?`, maria.id);
      const r2 = await tx.$executeRawUnsafe(`DELETE FROM up_users WHERE id = ?`, maria.id);
      console.log(`[accounts] mariasantos removed (role_lnk=${r1}, user=${r2})`);
    }
    await tx.$executeRawUnsafe(
      `UPDATE up_users SET first_name = ?, last_name = ?, information_fillouted = NULL, updated_at = ? WHERE id = ?`,
      "Test",
      "Applicant",
      new Date(),
      ta.id
    );
    console.log("[accounts] testapplicant renamed to 'Test Applicant', fillouted flag cleared");

    // ---- Phase 4: recreate minimal applicant profile (register-route shape)
    const now = new Date();
    const applicant = await tx.applicant.create({
      data: {
        documentId: crypto.randomUUID(),
        firstName: "Test",
        lastName: "Applicant",
        emailAddress: ta.email,
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
      },
    });
    await tx.userApplicantLink.create({
      data: { userId: ta.id, applicantId: applicant.id },
    });
    console.log(`[reseed] fresh applicant#${applicant.id} created + linked to user#${ta.id}`);
  });

  // ---- Phase 5: audit history --------------------------------------------
  await wipeAuditDb();

  console.log("\n=== POST-CLEAN non-zero tables ===");
  console.log(JSON.stringify(await nonZeroTables(), null, 0));
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
