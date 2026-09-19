// DB state inspection — pre/post cleanup verification
const tables = [
  "up_users", "up_roles", "up_users_role_lnk", "up_users_applicant_id_lnk",
  "up_users_postion_lnk", "up_users_postion_update_lnk",
  "applicants", "applications", "applications_applicant_lnk", "applications_job_lnk",
  "applicant_educations", "applicant_educations_applicant_id_lnk",
  "applicant_work_experiences", "applicant_work_experiences_applicant_id_lnk",
  "applicant_trainings", "applicant_trainings_applicant_id_lnk",
  "applicant_eligibilities", "applicant_eligibilities_applicant_lnk",
  "applicant_eligibilities_eligibility_category_lnk",
  "applicant_awards", "applicant_awards_applicant_lnk", "applicant_awards_positions_lnk",
  "applicant_accomplishments", "applicant_accomplishments_applicant_lnk",
  "applicant_accomplishments_positions_lnk",
  "applicant_forms", "applicant_forms_applicant_lnk",
  "applicant_summary_profiles", "applicant_summary_profiles_applicant_lnk",
  "applicant_interviews", "applicant_interviews_applicants_lnk", "applicant_interviews_positions_lnk",
  "applicant_interview_assessments", "applicant_interview_assessments_applicants_lnk",
  "applicant_interview_assessments_interviewers_lnk", "applicant_interview_assessments_positions_lnk",
  "applicant_examinations", "applicant_examinations_applicants_lnk", "applicant_examinations_positions_lnk",
  "interviewers", "merged_awards_accomplishments", "merged_awards_accomplishments_applicant_lnk",
  "merged_awards_accomp73efd_applicant_accomplishments_lnk", "merged_awards_accomplishments_applicant_awards_lnk",
  "merged_awards_accomplishments_position_lnk",
  "notifications", "notifications_applicant_lnk",
  "jobpostings", "postions", "jobpostings_postions_lnk", "jobpostings_applicants_lnk", "jobpostings_user_lnk",
  "place_of_assignments", "eligibilities", "specific_eligibilities",
  "specific_eligibilities_admin_lnk", "specific_eligibilities_applicant_lnk",
  "specific_eligibilities_eligibility_lnk", "specific_eligibilities_applicant_eligibility_lnk",
  "courses", "courses_applicant_education_lnk",
  "evaluation_criterias", "evaluation_criterias_user_lnk",
  "files", "files_folder_lnk", "upload_folders", "upload_folders_parent_lnk", "customs",
  "sms_logs", "email_logs", "up_permissions", "up_permissions_role_lnk",
];

import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  console.log("=== TABLE COUNTS ===");
  for (const t of tables) {
    try {
      const rows: any[] = await db.$queryRawUnsafe(`SELECT COUNT(*) as n FROM "${t}"`);
      const n = typeof rows[0].n === "bigint" ? Number(rows[0].n) : rows[0].n;
      if (n > 0) console.log(`${t}: ${n}`);
    } catch (e: any) {
      console.log(`${t}: ERROR ${e.message.slice(0, 60)}`);
    }
  }

  console.log("\n=== UP_USERS ===");
  const users: any[] = await db.$queryRawUnsafe(
    `SELECT u.id, u.username, u.email, u.created_at,
            u.is_admin, u.is_applicant,
            r.name as role_name, r.type as role_type,
            al.applicant_id as applicant_id
     FROM up_users u
     LEFT JOIN up_users_role_lnk rl ON rl.user_id = u.id
     LEFT JOIN up_roles r ON r.id = rl.role_id
     LEFT JOIN up_users_applicant_id_lnk al ON al.user_id = u.id
     ORDER BY u.id`
  );
  for (const u of users) {
    console.log(
      `user#${u.id} ${u.username} <${u.email}> role=${u.role_name}(${u.role_type}) admin=${u.is_admin} applicant=${u.is_applicant} applicant_id=${u.applicant_id ?? "none"}`
    );
  }

  console.log("\n=== APPLICANTS ===");
  const apps: any[] = await db.$queryRawUnsafe(
    `SELECT id, first_name, last_name, email_address, is_fillouted, created_at FROM applicants ORDER BY id`
  );
  for (const a of apps) {
    console.log(`applicant#${a.id} ${a.first_name} ${a.last_name} <${a.email_address}> filled=${a.is_fillouted}`);
  }

  console.log("\n=== APPLICATIONS ===");
  const rel: any[] = await db.$queryRawUnsafe(
    `SELECT id, application_status, date_applied, created_at FROM applications ORDER BY id`
  );
  for (const r of rel) {
    console.log(`application#${r.id} status=${r.application_status} date_applied=${r.date_applied}`);
  }

  console.log("\n=== JOBPOSTINGS (kept catalog) ===");
  const jp: any[] = await db.$queryRawUnsafe(`SELECT id, position_type, deadline_date, created_at FROM jobpostings ORDER BY id`);
  for (const j of jp) {
    console.log(`posting#${j.id} type=${j.position_type} deadline=${j.deadline_date}`);
  }

  console.log("\n=== SQLITE_SEQUENCE (autoincrement) ===");
  try {
    const seq: any[] = await db.$queryRawUnsafe(`SELECT name, seq FROM sqlite_sequence ORDER BY name`);
    for (const s of seq) console.log(`${s.name}: ${s.seq}`);
  } catch { console.log("(no sqlite_sequence table)"); }
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); }).finally(() => db.$disconnect());
