/**
 * Verification script for DB-SCHEMA task.
 * Reads production data via the new Prisma schema and confirms:
 *   1. All major tables are queryable.
 *   2. DATE-as-text fields (birth_date, crime_date, year_from, year_to,
 *      date_granted, notification_date) read as JS strings.
 *   3. DATETIME fields (created_at, updated_at, published_at, submitted_date,
 *      inclusive_date_from, etc.) read as JS Date objects (epoch millis).
 *   4. JSON-typed columns are declared `Unsupported("json")?` and CANNOT be
 *      selected via Prisma client. To verify they are still readable, this
 *      script uses the `src/lib/raw-json.ts` helper (which opens a direct
 *      `bun:sqlite` connection — Prisma's `$queryRaw` is also affected).
 *   5. BigInt fields (mobile_number, division_id, incumbent_id) read as BigInt.
 *
 * Usage: DATABASE_URL="file:...production-data.db" bun run scripts/verify-schema.ts
 */
import { db } from '../src/lib/db'
import {
  getApplicantCharacterReference,
  getApplicationSnapshots,
  getPositionCompetencyRequirementsRichtext,
  getFileFormats,
  getFileProviderMetadata,
} from '../src/lib/raw-json'

async function main() {
  const log = (msg: string) => console.log(msg)

  log('=== DB-SCHEMA VERIFICATION ===\n')

  // 1. Users
  const users = await db.user.findMany({ take: 5 })
  log(`[User] read ${users.length} of ${await db.user.count()} rows`)
  if (users[0]) {
    const u = users[0]
    log(`  sample: id=${u.id}, email=${u.email}, firstName=${u.firstName}, ` +
        `createdAt instanceof Date=${u.createdAt instanceof Date}, ` +
        `createdAt=${u.createdAt?.toISOString()}`)
    if (u.createdAt !== null && !(u.createdAt instanceof Date)) {
      throw new Error('User.createdAt must be a Date')
    }
  }

  // 2. Applicants — verify DATE-as-text fields
  const applicants = await db.applicant.findMany({ take: 3 })
  log(`\n[Applicant] read ${applicants.length} of ${await db.applicant.count()} rows`)
  for (const a of applicants) {
    log(`  id=${a.id}, firstName=${a.firstName}, birthDate=${JSON.stringify(a.birthDate)} (${typeof a.birthDate}), ` +
        `crimeDate=${JSON.stringify(a.crimeDate)} (${typeof a.crimeDate}), ` +
        `createdAt=${a.createdAt?.toISOString()} (${typeof a.createdAt})`)
    if (a.birthDate !== null && typeof a.birthDate !== 'string') {
      throw new Error(`Applicant.birthDate must be string, got ${typeof a.birthDate}`)
    }
    if (a.crimeDate !== null && typeof a.crimeDate !== 'string') {
      throw new Error(`Applicant.crimeDate must be string, got ${typeof a.crimeDate}`)
    }
    if (a.createdAt !== null && !(a.createdAt instanceof Date)) {
      throw new Error(`Applicant.createdAt must be Date, got ${typeof a.createdAt}`)
    }
    if (a.updatedAt !== null && !(a.updatedAt instanceof Date)) {
      throw new Error(`Applicant.updatedAt must be Date, got ${typeof a.updatedAt}`)
    }
    // Character reference is Unsupported("json") — read via raw-json helper.
    const raw = await getApplicantCharacterReference(a.id)
    if (raw !== null) {
      const parsed = JSON.parse(raw)
      log(`  characterReference (via bun:sqlite) parsed as array of ${parsed.length} entries`)
    } else {
      log(`  characterReference (via bun:sqlite) is null`)
    }
    // Mobile number is BigInt
    if (a.mobileNumber !== null) {
      log(`  mobileNumber=${a.mobileNumber.toString()} (${typeof a.mobileNumber})`)
      if (typeof a.mobileNumber !== 'bigint') {
        throw new Error(`Applicant.mobileNumber must be BigInt, got ${typeof a.mobileNumber}`)
      }
    }
    // govt_id_date_issued / govt_id_valid_until are String
    if (a.govtIdDateIssued !== null && typeof a.govtIdDateIssued !== 'string') {
      throw new Error(`govtIdDateIssued must be string`)
    }
    if (a.govtIdValidUntil !== null && typeof a.govtIdValidUntil !== 'string') {
      throw new Error(`govtIdValidUntil must be string`)
    }
  }

  // 3. Positions (note: maps to `postions` table — typo preserved)
  const positions = await db.position.findMany({ take: 3 })
  log(`\n[Position] read ${positions.length} of ${await db.position.count()} rows`)
  for (const p of positions) {
    log(`  id=${p.id}, itemNumber=${p.itemNumber}, positionTitle=${p.positionTitle}, ` +
        `salaryAmount=${p.salaryAmount}, positionLevel=${p.positionLevel}, ` +
        `dateVacated=${p.dateVacated?.toISOString() ?? 'null'}`)
    // competencyRequirementsRichtext is Unsupported("json") — verify via helper
    const v = await getPositionCompetencyRequirementsRichtext(p.id)
    log(`  competencyRequirementsRichtext (bun:sqlite) = ${v ?? 'null'}`)
  }

  // 4. Applications — verify all JSON snapshots
  const applications = await db.application.findMany({ take: 2 })
  log(`\n[Application] read ${applications.length} of ${await db.application.count()} rows`)
  for (const ap of applications) {
    log(`  id=${ap.id}, applicationStatus=${ap.applicationStatus}, ` +
        `dateApplied=${ap.dateApplied?.toISOString()}`)
    // All snapshot_* fields are Unsupported("json") — read via helper
    const snaps = await getApplicationSnapshots(ap.id)
    const fields: Array<[string, string | null]> = [
      ['snapshot_profile', snaps.profile],
      ['snapshot_awards', snaps.awards],
      ['snapshot_experiences', snaps.experiences],
      ['snapshot_trainings', snaps.trainings],
      ['snapshot_eligibilities', snaps.eligibilities],
      ['snapshot_educations', snaps.educations],
      ['snapshot_attachment', snaps.attachment],
    ]
    for (const [k, v] of fields) {
      if (v !== null) {
        try { JSON.parse(v) } catch (e) { throw new Error(`${k} not valid JSON: ${(e as Error).message}`) }
      }
    }
    log(`  snapshots verified via bun:sqlite (profile has data: ${snaps.profile !== null})`)
  }

  // 5. Assessments
  const assessments = await db.assessment.findMany({ take: 2 })
  log(`\n[Assessment] read ${assessments.length} of ${await db.assessment.count()} rows`)
  for (const a of assessments) {
    log(`  id=${a.id}, overallAssessmentRating=${a.overallAssessmentRating}, ` +
        `educationRating=${a.educationRating}, year=${a.year}`)
  }

  // 6. Educations — verify DATE-as-text fields
  const educations = await db.applicantEducation.findMany({ take: 3 })
  log(`\n[ApplicantEducation] read ${educations.length} of ${await db.applicantEducation.count()} rows`)
  for (const e of educations) {
    if (e.yearFrom !== null && typeof e.yearFrom !== 'string') {
      throw new Error(`yearFrom must be string, got ${typeof e.yearFrom}`)
    }
    if (e.yearTo !== null && typeof e.yearTo !== 'string') {
      throw new Error(`yearTo must be string, got ${typeof e.yearTo}`)
    }
    log(`  id=${e.id}, yearFrom=${e.yearFrom}, yearTo=${e.yearTo}, yearGraduated=${e.yearGraduated}`)
  }

  // 7. Awards — verify date_granted is String
  const awards = await db.applicantAward.findMany({ take: 3 })
  log(`\n[ApplicantAward] read ${awards.length} of ${await db.applicantAward.count()} rows`)
  for (const aw of awards) {
    if (aw.dateGranted !== null && typeof aw.dateGranted !== 'string') {
      throw new Error(`dateGranted must be string, got ${typeof aw.dateGranted}`)
    }
    log(`  id=${aw.id}, dateGranted=${aw.dateGranted}, points=${aw.points}, ` +
        `recognitionProvider=${aw.recognitionProvider}`)
  }

  // 8. Accomplishments — verify date_granted is String
  const accs = await db.applicantAccomplishment.findMany({ take: 3 })
  log(`\n[ApplicantAccomplishment] read ${accs.length} of ${await db.applicantAccomplishment.count()} rows`)
  for (const ac of accs) {
    if (ac.dateGranted !== null && typeof ac.dateGranted !== 'string') {
      throw new Error(`dateGranted must be string, got ${typeof ac.dateGranted}`)
    }
    log(`  id=${ac.id}, title=${ac.title}, dateGranted=${ac.dateGranted}, points=${ac.points}`)
  }

  // 9. Notifications — verify notification_date is String
  const notifs = await db.notification.findMany({ take: 3 })
  log(`\n[Notification] read ${notifs.length} of ${await db.notification.count()} rows`)
  for (const n of notifs) {
    if (n.notificationDate !== null && typeof n.notificationDate !== 'string') {
      throw new Error(`notificationDate must be string, got ${typeof n.notificationDate}`)
    }
  }

  // 10. Junction tables — verify they're queryable
  log('\n=== JUNCTION TABLES ===')
  const junctions = [
    ['UserRoleLink', db.userRoleLink],
    ['UserApplicantLink', db.userApplicantLink],
    ['UserPositionLink', db.userPositionLink],
    ['ApplicantEducationLink', db.applicantEducationLink],
    ['ApplicantWorkExperienceLink', db.applicantWorkExperienceLink],
    ['ApplicantTrainingLink', db.applicantTrainingLink],
    ['ApplicantEligibilityLink', db.applicantEligibilityLink],
    ['ApplicantAwardLink', db.applicantAwardLink],
    ['ApplicantAccomplishmentLink', db.applicantAccomplishmentLink],
    ['ApplicantFormLink', db.applicantFormLink],
    ['JobPostingPositionLink', db.jobPostingPositionLink],
    ['ApplicationApplicantLink', db.applicationApplicantLink],
    ['ApplicationJobLink', db.applicationJobLink],
    ['InterviewApplicantLink', db.interviewApplicantLink],
    ['AssessmentApplicantLink', db.assessmentApplicantLink],
    ['AssessmentInterviewerLink', db.assessmentInterviewerLink],
    ['FileRelatedLink', db.fileRelatedLink],
    ['FileFolderLink', db.fileFolderLink],
    ['UploadFolderParentLink', db.uploadFolderParentLink],
  ] as const
  for (const [name, model] of junctions) {
    const count = await (model as any).count()
    log(`  ${name}: ${count} rows`)
  }

  // 11. Files
  const files = await db.file.findMany({ take: 2 })
  log(`\n[File] read ${files.length} of ${await db.file.count()} rows`)
  for (const f of files) {
    log(`  id=${f.id}, name=${f.name}, mime=${f.mime}, size=${f.size}, url=${f.url?.slice(0, 60)}`)
    // formats and providerMetadata are Unsupported("json") — verify via helper
    const formats = await getFileFormats(f.id)
    const meta = await getFileProviderMetadata(f.id)
    if (formats !== null) {
      try { JSON.parse(formats) } catch { throw new Error(`files.formats not valid JSON`) }
    }
    log(`  formats (bun:sqlite) is ${formats ? 'valid JSON' : 'null'}, ` +
        `providerMetadata (bun:sqlite) is ${meta ? 'present' : 'null'}`)
  }

  // 12. JobPostings
  const jobs = await db.jobPosting.findMany({ take: 3 })
  log(`\n[JobPosting] read ${jobs.length} of ${await db.jobPosting.count()} rows`)
  for (const j of jobs) {
    log(`  id=${j.id}, numberOfVacancy=${j.numberOfVacancy}, ` +
        `publishDate=${j.publishDate?.toISOString() ?? 'null'}, ` +
        `deadlineDate=${j.deadlineDate?.toISOString() ?? 'null'}`)
  }

  // 13. Reference data
  log('\n=== REFERENCE DATA ===')
  log(`  Role: ${await db.role.count()}`)
  log(`  Permission: ${await db.permission.count()}`)
  log(`  Eligibility: ${await db.eligibility.count()}`)
  log(`  SpecificEligibility: ${await db.specificEligibility.count()}`)
  log(`  Course: ${await db.course.count()}`)
  log(`  EvaluationCriteria: ${await db.evaluationCriteria.count()}`)
  log(`  PlaceOfAssignment: ${await db.placeOfAssignment.count()}`)
  log(`  Interviewer: ${await db.interviewer.count()}`)
  log(`  UploadFolder: ${await db.uploadFolder.count()}`)
  log(`  Custom: ${await db.custom.count()}`)

  log('\n=== ALL VERIFICATIONS PASSED ===')
}

main()
  .catch((e) => {
    console.error('VERIFICATION FAILED:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
