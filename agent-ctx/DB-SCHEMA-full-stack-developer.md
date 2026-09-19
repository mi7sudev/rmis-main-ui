# Task DB-SCHEMA — Production Prisma Schema for Strapi v5 SQLite

## Agent
full-stack-developer

## Task
Rewrite `prisma/schema.prisma` as a clean, focused, production-compatible
mapping to the existing Strapi v5 SQLite database at
`/home/z/my-project/db/production-data.db` (116 tables, real DOST-MIRDC
recruitment data — ZERO data loss acceptable).

## Files Created / Modified

| Path | Purpose |
|------|---------|
| `prisma/schema.prisma` | **REWRITTEN** — 1,460 lines, 79 models, mapped to production tables via `@@map` and `@map` |
| `src/lib/raw-json.ts` | **NEW** — Helper module to read SQLite `json`-typed columns via direct `bun:sqlite` connection (Prisma 6.11 cannot deserialize these) |
| `scripts/verify-schema.ts` | **NEW** — Verification script that reads users, applicants, positions, applications, assessments, and all junction tables from production DB |

## Schema Design

### Models (79 total, grouped in 10 sections)

1. **Auth & Users** (8): `User`, `Role`, `UserRoleLink`, `UserApplicantLink`, `UserPositionLink`, `UserPositionUpdateLink`, `Permission`, `PermissionRoleLink`
2. **Applicant & Profile** (19): `Applicant` (~90 cols), `ApplicantEducation` (+lnk), `ApplicantWorkExperience` (+lnk), `ApplicantTraining` (+lnk), `ApplicantEligibility` (+lnk + category lnk), `ApplicantAward` (+lnk + position lnk), `ApplicantAccomplishment` (+lnk + position lnk), `ApplicantForm` (+lnk), `ApplicantSummaryProfile` (+lnk)
3. **Jobs & Positions** (10): `JobPosting` (+3 lnks), `Position` (note: maps to `postions` table — typo preserved), `Position` (+4 lnks), `PlaceOfAssignment`
4. **Applications** (3): `Application` (+2 lnks)
5. **Interviews & Assessments** (11): `Interview` (+2 lnks), `Assessment` (+3 lnks), `Examination` (+2 lnks), `Interviewer`
6. **Reference Data** (13): `Eligibility`, `SpecificEligibility` (+4 lnks), `Course` (+lnk), `EvaluationCriteria` (+lnk), `Notification` (+lnk)
7. **Merged Awards/Accomplishments** (5): `MergedAwardsAccomplishment` (+4 lnks)
8. **Projects** (3): `Project` (+2 lnks)
9. **Files (Strapi upload)** (5): `File` (+2 lnks), `UploadFolder` (+parent lnk)
10. **Custom** (1): `Custom` (unused scaffolding preserved for fidelity)

### Type Mapping Rules Applied

| SQLite type | Prisma type | Notes |
|-------------|-------------|-------|
| INTEGER (PK, autoincrement) | `Int @id @default(autoincrement())` | All PKs |
| date (TEXT-stored, e.g. "1993-07-25") | `String?` | birth_date, crime_date, year_from, year_to, date_granted (awards + accomplishments), notification_date |
| datetime (epoch millis) | `DateTime?` | created_at, updated_at, published_at, submitted_date, inclusive_date_from/to, exam_date, license_validity, publish_date, deadline_date, processing_date, contract_date_from/to, date_vacated, date_of_interview, date_of_examination, effectivity_date |
| varchar / TEXT | `String?` | Most string fields; govt_id_date_issued and govt_id_valid_until explicitly String? |
| boolean | `Boolean?` | confirmed, blocked, is_admin, is_applicant, notified, qualified, etc. |
| float | `Float?` | monthly_salary, salary_amount, year_decimal, hour_decimal, rating (examination), size |
| bigint | `BigInt?` | mobile_number, division_id, incumbent_id |
| json | `Unsupported("json")?` | **DEVIATION** — see below |
| float (ord columns) | `Float?` | All `*_ord` columns in junction tables |

## Critical Deviation: JSON Columns

The task spec rule #8 said: "Handles JSON columns as Json". This is **impossible**
with Prisma 6.11's SQLite connector. Prisma throws
`"Conversion failed: Value json not supported"` whenever a query returns a row
with NULL in a `json`-declared SQLite column — even with `db.$queryRaw`. The
bug is universal: ANY json-typed column with NULL values in the result set
fails. We confirmed this empirically:

- `applicants.character_reference` (12 non-null, 8 null): `findMany({where:{characterReference:null}})` → ❌ fails
- `postions.competency_requirements_richtext` (580 rows, all null): `findMany({take:3})` → ❌ fails
- `files.formats` (6 non-null, 54 null): `findMany({take:3})` → ❌ fails (first 3 happened to be null)

### Solution Applied

All 14 json-typed columns are declared as `Unsupported("json")?` (matching the
original Prisma introspection's choice). This makes Prisma **skip** the column
entirely, so `findMany()` succeeds for all rows.

To READ a json column's value, the new `src/lib/raw-json.ts` helper opens a
**separate** SQLite connection via `bun:sqlite` and fetches the value as a
plain string. The caller can `JSON.parse()` it as needed. This bypasses
Prisma's broken json deserializer entirely.

### JSON Columns Affected

| Model | Field | Column |
|-------|-------|--------|
| Applicant | characterReference | character_reference |
| Position | competencyRequirementsRichtext | competency_requirements_richtext |
| Application | snapshotProfile / Awards / Experiences / Trainings / Eligibilities / Educations / Attachment | snapshot_* |
| EvaluationCriteria | educationCriteria / trainingCriteria / workExpCriteria | *_criteria |
| File | formats / providerMetadata | formats / provider_metadata |

### Impact on Existing API Code

The following existing files access these JSON fields directly via the Prisma
client and **will need updates** (not done in this task — out of scope):

- `src/app/api/evaluator/applications/[id]/route.ts:25` — uses `app.snapshotProfile` (replace with `getApplicationSnapshots(ap.id)`)
- `src/app/api/jobs/apply/route.ts:39,53,63` — uses `fullApplicant.characterReferences` (replace with `getApplicantCharacterReference(applicantId)`)
- `src/components/views/profile/personal-info-section.tsx:50,57,66,75` — accesses `form.characterReferences` (will need API-layer change)
- `src/components/views/profile/use-profile-data.ts:99,100,180` — same

## Strapi Internal Tables — Intentionally Excluded

Per task rule #12, the following production tables are NOT in the schema:
- `admin_*` (admin_permissions, admin_roles, admin_users, admin_users_roles_lnk, admin_permissions_role_lnk)
- `strapi_*` (api_tokens, core_store_settings, database_schema, history_versions, migrations, releases, transfer_tokens, webhooks, workflows, etc.)
- `i18n_locale`
- `sqlite_sequence`
- `components_evaluation_*` (Strapi components — not standalone tables, used inline)
- `place_of_assignments_user_lnk` (junction, not in task list — data preserved in DB even if not Prisma-accessible)

The new app does not need these. They remain intact in the production SQLite file.

## Verification Results

```
=== DB-SCHEMA VERIFICATION ===

[User] read 5 of 16 rows
  sample: id=38, email=aijara@mirdc.dost.gov.ph, firstName=John,
  createdAt instanceof Date=true, createdAt=2025-02-26T00:37:59.671Z ✓

[Applicant] read 3 of 20 rows
  id=148, birthDate="1993-07-25" (string) ✓, crimeDate=null ✓,
  createdAt=2025-08-05T02:14:48.343Z (Date) ✓,
  characterReference (bun:sqlite) parsed as array of 2 entries ✓,
  mobileNumber=9977583493 (bigint) ✓

[Position] read 3 of 580 rows ✓
  competencyRequirementsRichtext (bun:sqlite) = null ✓

[Application] read 2 of 2 rows ✓
  snapshots verified via bun:sqlite (profile has data: true) ✓

[Assessment] read 2 of 2 rows ✓

[ApplicantEducation] read 3 of 30 rows
  yearFrom=null (string ✓), yearTo=null (string ✓)

[ApplicantAward] read 3 of 8 rows
  dateGranted=2025-09-15 (string ✓)

[ApplicantAccomplishment] read 2 of 2 rows
  dateGranted=2025-06-01 (string ✓)

=== JUNCTION TABLES === (19 queried, all OK)
  UserRoleLink: 9, UserApplicantLink: 20, UserPositionLink: 0,
  ApplicantEducationLink: 26, ApplicantWorkExperienceLink: 18,
  ApplicantTrainingLink: 18, ApplicantEligibilityLink: 22,
  ApplicantAwardLink: 8, ApplicantAccomplishmentLink: 0,
  ApplicantFormLink: 2, JobPostingPositionLink: 10,
  ApplicationApplicantLink: 2, ApplicationJobLink: 2,
  InterviewApplicantLink: 0, AssessmentApplicantLink: 2,
  AssessmentInterviewerLink: 2, FileRelatedLink: 82,
  FileFolderLink: 45, UploadFolderParentLink: 0

[File] read 2 of 60 rows
  formats (bun:sqlite) is valid JSON ✓, providerMetadata null ✓

[JobPosting] read 3 of 10 rows
  publishDate=2025-10-07T16:00:00.000Z (Date) ✓,
  deadlineDate=2026-12-30T16:00:00.000Z (Date) ✓

=== REFERENCE DATA ===
  Role: 3, Permission: 135, Eligibility: 6, SpecificEligibility: 24,
  Course: 488, EvaluationCriteria: 6, PlaceOfAssignment: 94,
  Interviewer: 4, UploadFolder: 2, Custom: 0

=== ALL VERIFICATIONS PASSED ===
```

## Lint

`bun run lint` passes with zero errors after the verify-schema.ts script
was refactored to use the `src/lib/raw-json.ts` helper (eliminating inline
`require()` calls).

## Dev Server

`bun run dev` continues to serve the app at port 3000 without errors. The
existing API routes that don't touch json columns work correctly. Routes
that DO touch json columns (e.g. `evaluator/applications/[id]`) will need
the API code refactored to use `raw-json.ts` helpers — out of scope for
this task.

## Key Production Tables Touched

The schema is a PURE MAPPING — no writes were made to
`/home/z/my-project/db/production-data.db`. The schema maps to 79 of the
116 production tables (the remaining 37 are Strapi-internal and excluded
per task rule #12). All 79 mapped tables are queryable via Prisma client.
The 14 json-typed columns are accessible via the `raw-json.ts` helper.
