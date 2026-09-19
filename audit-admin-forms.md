# AUDIT-ADMIN-FORMS-3 — Admin Form vs Production DB Compatibility Audit

**System:** RMIS — Recruitment Management & Information System (DOST-MIRDC)
**Stack:** Next.js 16 + Prisma 6.11 + SQLite (production Strapi v5 DB, read-only schema)
**Auditor:** general-purpose sub-agent
**Date:** 2025 (audit session)
**Source of truth:** `/tmp/db-schema.txt` + `PRAGMA table_info` on `/home/z/my-project/db/production-data.db`

---

## 1. Executive Summary

**Overall status: ⚠️ NOT READY FOR PRODUCTION DB SWAP.** Three critical bugs and several moderate issues were found across the admin form stack. The Prisma schema itself maps cleanly to the production DB (including the famous `postions` typo), and most admin writes are correct. However:

- **Applicant self-registration is completely broken** (`/api/auth/register` writes to four non-existent columns).
- **Position creation and Eligibility creation will throw SQLite FK constraint errors** because they write the *admin's up_users ID* into audit columns that FK-reference *admin_users* (the Strapi admin table, a different table).
- **The dashboard "Applications by Status" chart renders zero-height bars** because of a `count` vs `_count` field-name mismatch between API and frontend.
- **Admin-entered job titles are silently discarded** (no `title` column on `jobpostings`; the field is accepted by the schema but never persisted).

### Issue Count by Severity

| Severity | Count |
|----------|-------|
| ❌ Critical (must-fix before production DB swap) | 4 |
| ⚠️ Warning (fragile / silent failure) | 6 |
| ℹ️ Note / minor inconsistency | 4 |
| ✅ Verified OK | (per area, see below) |

---

## 2. Verification Method

For each form, the audit:

1. Read the form component (.tsx) to enumerate every field the UI collects.
2. Read the API route (.ts) to verify the request body → Prisma `data: {...}` mapping.
3. Cross-checked every field name against the production DB schema using both `/tmp/db-schema.txt` and live `PRAGMA table_info` queries via `better-sqlite3` against `/home/z/my-project/db/production-data.db` (read-only).
4. Verified the Prisma schema's `@@map("...")` and `@map("...")` directives match the real table/column names.
5. Sampled real production data (`SELECT` queries) to confirm assumptions about role IDs, FK targets, hash formats, link table contents, etc.

### Production DB facts confirmed by direct query

| Fact | Value |
|------|-------|
| `up_roles` rows | `id=1 "Authenticated"`, `id=2 "Public"`, `id=3 "applicants"` |
| `up_users.is_admin = 1` count | 3 (superadmin, admin, testadmin) |
| All 3 admins have `up_users_role_lnk.role_id = 1` | ✅ (existing pattern: admins link to "Authenticated") |
| `up_users.is_applicant` for admins | `NULL` (not `0`/`false`) |
| Existing `password` hashes | `$2a$10$...` (60 chars, bcrypt cost 10) — **compatible** with `bcrypt.hash(pw, 10)` |
| `admin_users` ID range | 1–3 (only 3 Strapi admin accounts exist) |
| `up_users` ID range | 38–130 |
| `up_users.created_by_id` / `updated_by_id` FK target | `admin_users.id` (NOT `up_users.id`) |
| `postions.created_by_id` values | **all 580 rows = NULL** |
| FK enforcement (`PRAGMA foreign_keys`) | **1 (ON)** — FK violations will throw |
| `jobpostings.title` column | **does not exist** |
| `jobpostings_applicants_lnk` | 0 rows (unused in production currently) |
| `up_users_postion_lnk` | 0 rows (unused in production currently) |
| `eligibilities.index` values | 1, 2, 3 (sort order — existing data uses it) |
| `applications_applicant_lnk` columns | `id`, `application_id`, `applicant_id`, `application_ord` (4 cols; `/tmp/db-schema.txt` omits the 4th — Prisma schema is correct) |

---

## 3. Per-Area Findings

### A) User Management

**Files:**
- `src/components/views/admin-users.tsx` (list + create + edit + disable dialogs)
- `src/app/api/admin/users/route.ts` (GET list, POST create)
- `src/app/api/admin/users/[id]/route.ts` (GET, PATCH, DELETE)
- `src/app/api/auth/register/route.ts` (applicant self-registration)

#### Form fields collected (Create User dialog)
| Form field | Sent to API as | DB column | Status |
|------------|---------------|-----------|--------|
| Email* | `email` | `up_users.email` (varchar 255) | ✅ |
| Username* | `username` | `up_users.username` (varchar 255) | ✅ |
| Password* | `password` | hashed → `up_users.password` (varchar 255) | ✅ bcrypt cost 10, matches existing `$2a$10$` format |
| Role* (APPLICANT/EVALUATOR/ADMIN) | `role` | derived: `is_admin` + `up_users_role_lnk.role_id` | ✅ handled correctly |
| First Name | `firstName` | `up_users.first_name` (TEXT) | ✅ |
| Last Name | `lastName` | `up_users.last_name` (varchar 255) | ✅ |
| (implicit `isActive`) | `isActive` (defaults true) | `up_users.blocked` (boolean, inverted) | ✅ |

#### Link tables written on POST
| Link table | Written? | Correct? |
|------------|----------|----------|
| `up_users_role_lnk` | ✅ yes (`{userId, roleId}`) | ✅ roleId = 3 for APPLICANT, 1 for ADMIN/EVALUATOR (matches existing pattern) |
| `up_users_applicant_id_lnk` | ✅ yes if role=APPLICANT (`{userId, applicantId}`) | ✅ |
| `up_users_postion_lnk` | ❌ never written | ⚠️ not exposed in form — acceptable for now (production data also has 0 rows) |

#### RBAC
- `GET`, `POST`, `PATCH`, `DELETE` all call `await requireAdminFromReq(req)` — ✅ enforced.
- Password is hashed with `bcrypt.hash(password, 10)` before writing to `up_users.password` — ✅.
- `GET` (list + detail) excludes `password`, `otp`, `encryptedId`, `resetPasswordToken`, `confirmationToken` from `select` — ✅ (security good).
- `DELETE` is actually a soft-disable (`blocked: true`), preserving referential integrity — ✅ sensible.

#### ❌ Critical Issue A-1: `/api/auth/register/route.ts` is broken against production schema

This route is invoked by the public sign-up form (`src/components/views/signup-view.tsx` line 44). It writes **four fields that do not exist** in the production DB:

| Code writes | DB column targeted | Reality |
|-------------|-------------------|---------|
| `passwordHash: passwordHash` | (expects `up_users.passwordHash`) | ❌ column does not exist; real name is `password` |
| `role: "APPLICANT"` | (expects `up_users.role`) | ❌ column does not exist; role is derived via `is_admin` + `up_users_role_lnk` |
| `emailVerified: new Date()` | (expects `up_users.emailVerified`) | ❌ column does not exist; real name is `confirmed` (boolean) |
| `applicant.userId: user.id` | (expects `applicants.userId`) | ❌ column does not exist; link is via `up_users_applicant_id_lnk` junction table |

**Effect:** Every new applicant sign-up attempt throws a Prisma `UnknownArgumentError` or `UnknownFieldError`. Self-registration is non-functional.

The admin-only user create route (`POST /api/admin/users`) has the **correct** mapping (uses `password`, `confirmed`, links via junction). The register route appears to be a leftover from a pre-Strapi-schema template.

**Fix:** Rewrite `register/route.ts` to mirror `admin/users/route.ts` POST logic (substitute `role: "APPLICANT"`).

#### ⚠️ Warning A-2: Audit log records wrong actor

In `admin/users/route.ts` POST:
```ts
await requireAdminFromReq(req);  // <-- return value NOT captured
...
await auditLog({
  userId: parseInt(user.id as unknown as string) || 0,  // <-- uses the CREATED user's id
  action: "USER_CREATED",
  ...
});
```
The audit trail records the **new user** as the actor ("user 131 created user 131"), not the admin who performed the action. Same bug in PATCH (`userId: id`) and DELETE (`userId: id`).

**Fix:** Capture the admin via `const admin = await requireAdminFromReq(req);` and pass `admin.id` to `auditLog({ userId: parseInt(admin.id, 10) })`.

#### ⚠️ Warning A-3: `isApplicant: false` written for non-applicant roles

`POST /api/admin/users` sets `isApplicant: role === "APPLICANT"` (boolean). Production data shows non-applicant users have `is_applicant = NULL`, not `0`. The derivation logic checks `up_users_role_lnk.role_id = 3` rather than `is_applicant`, so this doesn't break role checks — but it creates a data inconsistency.

**Fix:** Use `isApplicant: role === "APPLICANT" ? true : null` for parity with existing data.

#### ℹ️ Note A-4: `requireAdminFromReq` return captured inconsistently

In `admin/users/route.ts` POST, the return value of `requireAdminFromReq(req)` is discarded (line 145). In `admin/positions/route.ts` POST and `admin/eligibilities/route.ts` POST, it IS captured. The capture itself isn't the bug; what's done with it is (see B-1 and D-1).

#### ℹ️ Note A-5: Email uniqueness not enforced at DB level

`up_users.email` has no UNIQUE constraint in production. The API does a manual `findFirst` check before insert, which is correct but racy under concurrent requests. Acceptable for now given low admin concurrency, but flag for awareness.

---

### B) Positions Management

**Files:**
- `src/components/views/admin/positions-tab.tsx` (list + create dialog + view dialog)
- `src/app/api/admin/positions/route.ts` (GET list, POST create)
- (No `admin/positions/[id]/route.ts` exists — no PATCH/DELETE for positions)

#### `@@map("postions")` typo check ✅

The Prisma `Position` model is correctly mapped via `@@map("postions")` (preserving the production typo). All 54 columns of the `postions` table are correctly `@map`-ed. Verified by diffing `PRAGMA table_info(postions)` against the Prisma model. **No mismatches.**

#### Form fields collected (Create Position dialog)
| Form field | Sent to API as | API maps to Prisma field | DB column | Status |
|------------|---------------|--------------------------|-----------|--------|
| Item Number | `itemNumber` | `itemNumber` | `item_number` (TEXT) | ✅ |
| Position Title* | `positionTitle` | `positionTitle` | `position_title` (TEXT) | ✅ |
| Position Type | `positionType` | `positionType` | `position_type` (TEXT) | ✅ |
| Position Status | `positionStatus` | `positionStatus` | `position_status` (TEXT) | ✅ |
| Position Level | `positionLevel` (int) | `positionLevel` | `position_level` (INTEGER) | ✅ |
| Salary Grade | `salaryGrade` | `salaryGrade` | `salary_grade` (TEXT) | ✅ |
| Salary Step | `salaryStep` | `positionSalaryStep` | `position_salary_step` (varchar 255) | ✅ API maps correctly |
| Monthly Salary | `salaryAmount` (float) | `salaryAmount` | `salary_amount` (float) | ✅ |
| Division | `division` | `division` | `division` (varchar 255) | ✅ |
| Section | `section` | `section` | `section` (varchar 255) | ✅ |
| Classification | `classification` | `classification` | `classification` (varchar 255) | ✅ |
| Education (CSC) | `cscEducation` | `cscEducation` | `csc_education` (varchar 255) | ✅ |
| Eligibility (CSC) | `cscEligibility` | `cscEligibility` | `csc_eligibility` (varchar 255) | ✅ |
| Eligibility Group | `cscEligibilityGroup` | `cscEligibilityGroup` | `csc_eligibility_group` (TEXT) | ✅ |
| Work Experience | `cscWorkExperience` | `cscWorkExperience` | `csc_work_experience` (varchar 255) | ✅ |
| Training Requirements | `cscTrainingRequirements` | `cscTrainingRequirements` | `csc_training_requirements` (varchar 255) | ✅ |
| Preferred Qualification | `preferredQualification` | `preferredQualification` | `preferred_qualification` (TEXT) | ✅ |
| Competency Requirements | `competencyRequirements` | `competencyRequirements` | `competency_requirements` (TEXT) | ✅ |
| Special Skill | `specialSkill` | `specialSkill` | `special_skill` (TEXT) | ✅ |
| Place of Assignment | `placeOfAssignmentId` | writes to `postions_place_of_assignment_lnk` | junction table | ✅ link written |
| (auto) | `createdAt/updatedAt/publishedAt` | `created_at/updated_at/published_at` (datetime) | ✅ set to `now` |
| (auto) | `createdById` | `created_by_id` (INTEGER, FK → `admin_users.id`) | ❌ **see B-1** |

#### Link tables written on POST
| Link table | Written? | Correct? |
|------------|----------|----------|
| `postions_place_of_assignment_lnk` | ✅ if `placeOfAssignmentId` provided | ✅ `{postionId, placeOfAssignmentId}` |
| `postions_eligibilities_lnk` | ❌ not exposed in form | ⚠️ no UI to link eligibilities to a position |
| `postions_specific_eligibilities_lnk` | ❌ not exposed in form | ⚠️ no UI to link specific eligibilities |

#### ❌ Critical Issue B-1: `createdById` / `updatedById` write violates FK constraint

In `admin/positions/route.ts` POST (line 94-95):
```ts
createdById: parseInt(user.id, 10),
updatedById: parseInt(user.id, 10),
```

Here `user` is the SessionUser returned by `requireAdminFromReq(req)` — an `up_users` row whose ID is in the range 38–130. But `postions.created_by_id` is FK-referenced to **`admin_users.id`** (per `CREATE TABLE` definition), and `admin_users` only contains IDs 1, 2, 3.

**PRAGMA foreign_keys = 1 (ON)** in this SQLite instance, so Prisma will throw `FOREIGN KEY constraint failed` when attempting to insert a position with `created_by_id = 129` (testadmin's up_users ID).

**Effect:** Every position creation attempt via the admin UI will crash. The Create Position form appears to succeed client-side (validation passes) but the API returns 500.

**Fix:** Set both fields to `null` (matching all 580 existing production rows). The jobposting POST handler already does this correctly with an explicit comment:
```ts
// created_by_id/updated_by_id FK to admin_users (Strapi admins) — web
// admins have no admin_users row, so leave them NULL like legacy rows.
createdById: null,
updatedById: null,
```
Apply the same pattern to positions and eligibilities.

#### ℹ️ Note B-2: No PATCH/DELETE for positions

There is no `/api/admin/positions/[id]/route.ts`. Once created, positions cannot be edited or disabled through the admin UI. The view-only dialog (`PositionViewDialog`) has no edit action. This may be intentional (positions are reference data), but worth flagging.

#### ℹ️ Note B-3: Position↔Eligibility links not editable

The form has no UI to write to `postions_eligibilities_lnk` or `postions_specific_eligibilities_lnk`. The MQR engine primarily uses the free-text `csc_eligibility_group` column for eligibility matching, so this is likely by design. But production data has 0 rows in these link tables, so admins cannot populate them either.

---

### C) Jobs Management

**Files:**
- `src/components/views/admin/jobs-tab.tsx` (list + create + edit + preview)
- `src/components/views/admin-jobs.tsx` (tab container — Jobs/Positions)
- `src/app/api/jobs/route.ts` (GET public list, POST create — admin only)
- `src/app/api/jobs/[id]/route.ts` (PATCH update — admin only; no GET/DELETE)
- `src/app/api/jobs/apply/route.ts` (applicant applies)
- `src/app/api/jobs/verify-mqr/route.ts` (MQR pre-check)
- `src/lib/mqr.ts` (MQR engine)

#### `@@map("jobpostings")` check ✅
The Prisma `JobPosting` model maps to `jobpostings` with all 22 columns correctly `@map`-ed. No mismatches.

#### Form fields collected (Create/Edit Job dialog)
| Form field | Sent to API as | API maps to Prisma field | DB column | Status |
|------------|---------------|--------------------------|-----------|--------|
| Job Title* | `title` | (discarded — not in `data:{}`) | (no `title` column) | ❌ **see C-1** |
| Position (select) | `positionId` | writes `jobpostings_postions_lnk` | junction table | ✅ link written |
| Position Type | `positionType` | `positionType` | `position_type` (TEXT) | ✅ |
| Number of Vacancies* | `numberOfVacancy` (int) | `numberOfVacancy` | `number_of_vacancy` (INTEGER) | ✅ |
| Brief Description | `briefDescription` | `briefDescription` | `brief_description` (TEXT) | ✅ |
| Brief Description (HTML) | `briefDescriptionHtml` | `briefDescriptionRichtext` | `brief_description_richtext` (TEXT) | ✅ sanitized via `sanitizeHtml` |
| Duties & Responsibilities | `dutiesResponsibilities` | `dutiesResponsibilities` | `duties_responsibilities` (TEXT) | ✅ |
| Duties (HTML) | `dutiesResponsibilitiesHtml` | (NOT persisted — only the plain-text version is saved) | (no separate richtext column for duties) | ⚠️ see C-2 |
| Compensation Package | `compensationPackage` | `compensationPackage` | `compensation_package` (TEXT) | ✅ |
| Compensation (HTML) | `compensationPackageHtml` | `compensationPackageRichtext` | `compensation_package_richtext` (TEXT) | ✅ sanitized |
| Other Qualifications | `otherQualifications` | `otherQualifications` | `other_qualifications` (TEXT) | ✅ |
| Other Qualifications (HTML) | `otherQualificationsHtml` | `otherQualificationsRichtext` | `other_qualifications_richtext` (TEXT) | ✅ sanitized |
| Publish Date | `publishDate` | `publishDate` | `publish_date` (datetime) | ✅ |
| Deadline | `deadlineDate` | `deadlineDate` | `deadline_date` (datetime) | ✅ |
| Processing Date | `processingDate` | `processingDate` | `processing_date` (datetime) | ✅ |
| (auto) | `publishedAt: now` | `published_at` (datetime) | ✅ new admin jobs are immediately published |
| (auto) | `createdAt/updatedAt: now` | `created_at/updated_at` (datetime) | ✅ |
| (auto) | `createdById/updatedById: null` | `created_by_id/updated_by_id` | ✅ correctly NULL (FK to admin_users, not up_users) |

#### Link tables written on POST
| Link table | Written? | Correct? |
|------------|----------|----------|
| `jobpostings_postions_lnk` | ✅ if `positionId` provided | ✅ `{jobpostingId, postionId, postionOrd: 0}` |
| `jobpostings_user_lnk` | ❌ never written | ⚠️ acceptable — production has 0 rows; `createdById: null` substitutes for audit |
| `jobpostings_applicants_lnk` | ❌ not on create | ✅ correctly written by `/api/jobs/apply` route instead |

#### RBAC
- `POST /api/jobs` and `PATCH /api/jobs/[id]` both call `await requireAdminFromReq(req)` — ✅.
- `GET /api/jobs` is public to any logged-in user (uses `getSessionFromReq` for optional personalization) — ✅.
- `POST /api/jobs/apply` calls `requireApplicantFromReq` — ✅.
- `POST /api/jobs/verify-mqr` calls `requireApplicantFromReq` — ✅.

#### ❌ Critical Issue C-1: Job title is silently discarded

`jobCreateSchema` (in `src/lib/validation.ts`) declares `title: z.string().min(1, "Title is required").max(200)` — making it a **required** form field. The frontend enforces this (`title.trim().length > 0` in `formValid`).

But the `POST /api/jobs` handler never writes `title` to the DB:
```ts
const job = await db.jobPosting.create({
  data: {
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
    createdById: null,
    updatedById: null,
    positionType: d.positionType || null,
    dutiesResponsibilities: d.dutiesResponsibilities || null,
    briefDescription: d.briefDescription || null,
    briefDescriptionRichtext: sanitizeHtml(d.briefDescriptionHtml),
    compensationPackage: d.compensationPackage || null,
    compensationPackageRichtext: sanitizeHtml(d.compensationPackageHtml),
    otherQualifications: d.otherQualifications || null,
    otherQualificationsRichtext: sanitizeHtml(d.otherQualificationsHtml),
    numberOfVacancy: d.numberOfVacancy,
    publishDate: d.publishDate ? new Date(d.publishDate) : now,
    deadlineDate: d.deadlineDate ? new Date(d.deadlineDate) : null,
    processingDate: d.processingDate ? new Date(d.processingDate) : null,
    // <-- d.title is NOT here
  },
});
```

The response constructs the title for display via `position?.positionTitle ?? job.briefDescription ?? null` (line 186).

**Effect:**
- If admin selects a position → the position's `position_title` becomes the job's "title" (acceptable).
- If admin does NOT select a position → the admin-typed `title` is silently discarded. The job's `title` falls back to `briefDescription`, which is a separate field the admin may have left empty.

Same discard happens in `PATCH /api/jobs/[id]`.

**Fix options (pick one):**
1. Remove `title` from the form and use only the linked position's `position_title` (require position selection).
2. Persist `title` by writing it to `briefDescription` (and remove the separate brief description field, or merge).
3. Add a `title` column to `jobpostings` (NOT ALLOWED — production schema must not change).

Recommended: option 1 (require position selection on job creation — the position record holds the canonical title).

#### ⚠️ Warning C-2: `dutiesResponsibilitiesHtml` is accepted but never persisted

The form sends `dutiesResponsibilitiesHtml: textToHtml(duties)`, and the schema accepts it. But the DB has no `duties_responsibilities_richtext` column (verified via `PRAGMA table_info(jobpostings)` — only `duties_responsibilities` exists, no richtext variant). The API:
- POST: writes only `dutiesResponsibilities: d.dutiesResponsibilities || null` (the plain text). The HTML version is dropped.
- The public job list response maps `dutiesResponsibilitiesHtml: job.dutiesResponsibilities` (line 122 of `route.ts`) — so applicants see the plain-text version.

This is **acceptable behavior** (plain text renders fine in HTML via whitespace-pre), but the form and schema suggest a richtext capability that doesn't actually exist. Misleading.

**Fix:** Either drop `dutiesResponsibilitiesHtml` from the schema and form, or note in a comment that duties doesn't have a richtext column.

#### MQR verification ✅ (verified against real position data)

The MQR engine (`src/lib/mqr.ts`) reads from the position:
- `cscEducation` (varchar 255) → token-based matching against applicant's `educations.course + specifyOthers`
- `cscEligibilityGroup` (TEXT) → subset match against applicant's `eligibilities.eligibilityTitle`
- `cscWorkExperience` (varchar 255) → numeric extraction (e.g. "3") vs sum of `workExperiences.yearDecimal`
- `cscTrainingRequirements` (varchar 255) → numeric extraction vs sum of `trainings.hourDecimal || numberHours`

All four columns exist on `postions` and are populated by the position form. Sample production data confirms realistic values:
- `csc_education: '8'`, `csc_eligibility_group: 'Career Service Sub-Professional/First Level Eligibility'`, `csc_work_experience: '3'`, `csc_training_requirements: 'Sixteen (16) hours relevant training'`

The MQR engine's `extractNumber` correctly handles both "3" and "Sixteen (16) hours" formats. ✅

#### Application apply route ✅

`POST /api/jobs/apply`:
- Creates `applications` row with `applicationStatus: "Applied"` (matches production value `"Applied"` — production Strapi uses capitalized labels).
- Writes snapshot JSON via raw SQL (Prisma can't write `Unsupported("json")` columns).
- Writes `applications_applicant_lnk` with `{applicationId, applicantId, applicationOrd: 0}` — ✅ matches Prisma schema (which correctly includes `application_ord` even though `/tmp/db-schema.txt` omits it).
- Writes `applications_job_lnk` with `{applicationId, jobpostingId, applicationOrd: 0}` — ✅.
- `createdById/updatedById` left null (correct — FK to admin_users, not up_users). ✅
- Pre-check: refuses if applicant's `isFillouted` is false. ✅

#### ℹ️ Note C-3: No DELETE for job postings

There is no `DELETE /api/jobs/[id]`. Admins can create and edit but cannot remove a job posting. To "close" a posting, they must edit the deadline date to a past date. May be intentional.

---

### D) Eligibilities Management

**Files:**
- `src/app/api/admin/eligibilities/route.ts` (GET list, POST create)

#### Form fields collected
There is no dedicated admin form component for eligibilities (no `admin/eligibilities-tab.tsx`). The API exists; the UI for it is unclear (perhaps embedded elsewhere or not yet built).

API accepts:
| Field | DB column | Status |
|-------|-----------|--------|
| `name` (required, max 200) | `eligibilities.name` (varchar 255) | ✅ |
| `category` (optional) | **NO COLUMN** — accepted for backwards-compat, never persisted | ⚠️ see D-2 |
| (auto) `createdAt/updatedAt/publishedAt: now` | datetime cols | ✅ |
| (auto) `createdById: parseInt(user.id, 10)` | `created_by_id` (INTEGER, FK → `admin_users.id`) | ❌ **see D-1** |
| (auto) `updatedById: parseInt(user.id, 10)` | `updated_by_id` (INTEGER, FK → `admin_users.id`) | ❌ **see D-1** |

#### ❌ Critical Issue D-1: Same FK violation as B-1

`POST /api/admin/eligibilities` writes `createdById: parseInt(user.id, 10)` and `updatedById: parseInt(user.id, 10)` where `user.id` is the up_users ID (38–130 range). These columns FK-reference `admin_users.id` (1–3 range). **Will throw `FOREIGN KEY constraint failed`** on every create.

**Fix:** Same as B-1 — set both to `null`.

#### ⚠️ Warning D-2: `category` field accepted but discarded

The schema accepts `category: z.string().max(100).optional().nullable()` for backwards compatibility, but the production `eligibilities` table has no `category` column. Comment in the route explicitly notes this. Acceptable as a graceful migration, but the field should be removed once all callers are updated.

#### ⚠️ Warning D-3: `eligibilities.index` not set

The DB has an `index` column (INTEGER) that production data uses as a sort order (values 1, 2, 3). The admin POST does NOT set this field, so new records get `index = NULL`. The Prisma model has `index Int? @map("index")` so this is type-compatible, but new records will sort inconsistently relative to existing ones (which use 1/2/3).

**Fix:** Compute the next index value (`SELECT MAX(index) + 1 FROM eligibilities`) or default to a sentinel like 99.

#### ℹ️ Note D-4: No specific_eligibilities management

The audit scope mentions `specific_eligibilities` and `specific_eligibilities_admin_lnk`, but there is no admin route or form to manage these. The Prisma models exist (`SpecificEligibility`, `SpecificEligibilityAdminLink`) and are correctly mapped. Currently read-only via `/api/reference` (presumably).

---

### E) Stats / Dashboard

**Files:**
- `src/components/views/admin-dashboard.tsx`
- `src/app/api/admin/stats/route.ts`

#### Stats computed (all via Prisma `count`/`groupBy` against correct tables)
| Stat | Query | DB tables touched | Correct? |
|------|-------|-------------------|----------|
| `totalUsers` | `db.user.count()` | `up_users` | ✅ |
| `applicants` | `db.userRoleLink.count({ where: { roleId: 3 } })` | `up_users_role_lnk` | ✅ matches production pattern |
| `evaluators` | `totalUsers - adminCount - applicants` | derived | ⚠️ see E-2 |
| `admins` | `db.user.count({ where: { isAdmin: true } })` | `up_users` | ✅ |
| `activeJobs` | `db.jobPosting.count({ where: { publishedAt: { not: null } } })` | `jobpostings` | ✅ matches Strapi publication-state semantics |
| `totalApplications` | `db.application.count()` | `applications` | ✅ |
| `pendingEvaluation` | `applicationStatus IN ["FOR_EVALUATION", "For Evaluation"]` | `applications` | ✅ dual-form check |
| `evaluated` | `applicationStatus IN ["EVALUATED", "Evaluated"]` | `applications` | ✅ |
| `approved` | `applicationStatus IN ["APPROVED", "Approved"]` | `applications` | ✅ |
| `rejected` | `applicationStatus IN ["REJECTED", "Rejected"]` | `applications` | ✅ |
| `byStatus` | `groupBy applicationStatus` | `applications` | ✅ query OK, but **response field name wrong — see E-1** |
| `recent` (8 apps) | join via `applications_applicant_lnk` + `applications_job_lnk` + `jobpostings_postions_lnk` | 4-table traversal | ✅ logic correct, ⚠️ N+1 — see E-3 |

#### RBAC
- `GET /api/admin/stats` calls `await requireAdminFromReq(req)` — ✅.

#### ❌ Critical Issue E-1: Dashboard "Applications by Status" chart renders zero-height bars

The stats API returns:
```ts
const byStatus = grouped.map((g) => ({
  status: g.applicationStatus ?? "(none)",
  count: g._count,        // <-- field name: "count"
}));
```

The dashboard frontend (`admin-dashboard.tsx` line 63) declares:
```ts
byStatus: { status: string; _count: number }[];   // <-- expects "_count"
```

And uses it (line 152):
```ts
const chartData = stats.byStatus.map((s) => ({
  name: ...,
  count: s._count,        // <-- reads "_count" → undefined
  status: s.status,
}));
```

Recharts `<Bar dataKey="count">` with `count: undefined` renders zero-height bars. The chart appears empty even when applications exist.

**Verified impact:** Production DB has 2 applications with status `"Applied"`. The chart should show one bar "Applied" with height 2. Instead it shows zero-height (because `s._count` is `undefined`).

**Fix (one of):**
- API: rename `count` to `_count` in the response shape, OR
- Frontend: change `s._count` to `s.count` (and update the `Stats` type).

Recommended: change the API to `_count` to match the Prisma convention used elsewhere in the codebase.

#### ⚠️ Warning E-2: Evaluator count is an approximation

`evaluators = totalUsers - adminCount - applicants`. This counts ALL non-admin, non-applicant users as evaluators. In production this includes:
- Users with no role link at all (7 of 18 users have no `up_users_role_lnk` entry)
- Users with role_id=1 ("Authenticated") but not flagged as admin or applicant

This is a reasonable approximation but may overcount if there are stale/inactive users. The existing derivation in `role-utils.ts` does the same thing for the user list. Consistent behavior; flagged for awareness only.

#### ⚠️ Warning E-3: N+1 query in recent-applications loop

The `recentApps` loop (lines 73-114) executes 5 queries per application (1 appl link + 1 applicant + 1 job link + 1 jobposting + 1 position link + 1 position) = up to 6 queries × 8 applications = 48 queries. Acceptable for 8 rows, but if the limit is ever raised this becomes slow.

**Fix (low priority):** Batch the link/parent lookups outside the loop.

#### ℹ️ Note E-4: Status counts only cover 4 buckets

The API counts `FOR_EVALUATION`, `EVALUATED`, `APPROVED`, `REJECTED` (and their capitalized variants). But the production data has only `"Applied"` status. This means `pendingEvaluation + evaluated + approved + rejected = 0` while `totalApplications = 2`. The dashboard will show 2 total applications but 0 in each status bucket — which is technically correct (no applications have reached those stages yet), but visually confusing.

Consider adding an `applied` count to the stats response.

---

## 4. Critical Issues Summary (❌ must-fix before production DB swap)

| # | Area | Issue | File | Fix |
|---|------|-------|------|-----|
| 1 | Users | `/api/auth/register` writes to 4 non-existent columns (`passwordHash`, `role`, `emailVerified`, `userId`) — applicant self-registration is broken | `src/app/api/auth/register/route.ts` | Rewrite to mirror `admin/users/route.ts` POST (use `password`, `confirmed`, `is_admin`, junction `up_users_role_lnk` + `up_users_applicant_id_lnk`) |
| 2 | Positions | `createdById`/`updatedById` set to up_users ID, but FK references `admin_users.id` → SQLite FK constraint error on every create | `src/app/api/admin/positions/route.ts` line 94-95 | Set both to `null` (matches all 580 existing rows) |
| 3 | Eligibilities | Same FK violation as #2 | `src/app/api/admin/eligibilities/route.ts` line 37-38 | Set both to `null` |
| 4 | Stats | API returns `byStatus: [{count}]`, frontend reads `s._count` → dashboard chart bars all render zero-height | `src/app/api/admin/stats/route.ts` line 56-59 OR `src/components/views/admin-dashboard.tsx` line 63, 152 | Rename API field to `_count` (preferred) or change frontend to read `count` |

## 5. Warnings Summary (⚠️ fragile / silent failure)

| # | Area | Issue | File |
|---|------|-------|------|
| W1 | Users | Audit log records wrong actor (uses target user ID instead of admin's ID) | `src/app/api/admin/users/route.ts` POST/PATCH/DELETE |
| W2 | Users | `isApplicant: false` written for non-applicants (production uses NULL) | `src/app/api/admin/users/route.ts` line 168 |
| W3 | Jobs | Job `title` accepted by schema but never persisted (silently discarded if no position linked) | `src/app/api/jobs/route.ts` POST, `src/app/api/jobs/[id]/route.ts` PATCH |
| W4 | Jobs | `dutiesResponsibilitiesHtml` accepted by schema but never persisted (no richtext column for duties) | `src/lib/validation.ts` `jobCreateSchema` |
| W5 | Eligibilities | `category` field accepted but never persisted (no DB column) | `src/app/api/admin/eligibilities/route.ts` |
| W6 | Eligibilities | `index` column not set on create → new records won't sort with existing ones | `src/app/api/admin/eligibilities/route.ts` |

## 6. Missing Fields (DB columns not collected by forms; form fields with no DB home)

### DB columns not collected by admin forms (acceptable omissions, listed for awareness)
- `up_users`: `middleName` (admin form has only firstName/lastName), `provider` (auto-set to `"local"`), `otp`, `encryptedId`, `noOfAttempts`, `informationFillouted`, `locale`, `documentId`, `resetPasswordToken`, `confirmationToken`, `publishedAt`
- `postions`: `positionSalaryGrade`, `positionSalaryAmount` (the form uses `salaryGrade` + `salaryAmount` instead — different columns, same purpose), `areaCode`, `areaType`, `level`, `educationCriteria`, `trainingType`, `otherTraining`, `education`, `experience`, `training`, `eligibility`, `officeId`, `departmentId`, `placeOfAssignmentId` (direct FK column — the form uses the junction table instead), `sectionId`, `trancheId`, `salaryGradeId`, `stepId`, `divisionId`, `incumbentId`, `dateVacated`, `yearsRequired`, `hoursRequired`, `hrmisId`, `competencyRequirementsRichtext` (JSON)
- `jobpostings`: `contractDateFrom`, `contractDateTo` (contractual jobs only — form omits), `locale`, `documentId`
- `eligibilities`: `index` (see W6), `locale`, `documentId`

### Form fields with no DB home (silent discards)
- `title` (job form) — see ❌ C-1
- `dutiesResponsibilitiesHtml` (job form) — see ⚠️ W4
- `category` (eligibility form, if any) — see ⚠️ W5

## 7. Recommendations (concrete fixes, in priority order)

### P0 — Block production swap until fixed

1. **Rewrite `src/app/api/auth/register/route.ts`** to match the production schema. Use this skeleton:
   ```ts
   const passwordHash = await bcrypt.hash(password, 10);
   const now = new Date();
   const user = await db.user.create({
     data: {
       email: normalizedEmail,
       username,
       password: passwordHash,        // was: passwordHash: passwordHash
       provider: "local",
       confirmed: true,                // was: emailVerified: new Date()
       blocked: false,
       isAdmin: false,
       isApplicant: true,
       firstName: firstName || null,
       lastName: lastName || null,
       createdAt: now,
       updatedAt: now,
     },
   });
   await db.userRoleLink.create({ data: { userId: user.id, roleId: 3 } });  // "applicants"
   const applicant = await db.applicant.create({
     data: {
       emailAddress: normalizedEmail,
       firstName: firstName || null,
       lastName: lastName || null,
       createdAt: now, updatedAt: now, publishedAt: now,
     },
   });
   await db.userApplicantLink.create({  // was: applicant.userId
     data: { userId: user.id, applicantId: applicant.id },
   });
   ```

2. **Patch `src/app/api/admin/positions/route.ts`** POST:
   ```ts
   // Replace:
   createdById: parseInt(user.id, 10),
   updatedById: parseInt(user.id, 10),
   // With:
   createdById: null,  // FK references admin_users, not up_users — leave NULL like legacy rows
   updatedById: null,
   ```

3. **Patch `src/app/api/admin/eligibilities/route.ts`** POST with the same change.

4. **Fix the stats/dashboard field name mismatch.** Preferred: change `src/app/api/admin/stats/route.ts` line 56-59:
   ```ts
   const byStatus = grouped.map((g) => ({
     status: g.applicationStatus ?? "(none)",
     _count: g._count,        // was: count
   }));
   ```
   This makes the API shape match the frontend type declaration.

### P1 — Fix soon (correctness / audit-trail integrity)

5. **Capture the admin in audit log calls.** In `src/app/api/admin/users/route.ts` POST/PATCH and `admin/users/[id]/route.ts` PATCH/DELETE, change:
   ```ts
   await requireAdminFromReq(req);
   ```
   to:
   ```ts
   const admin = await requireAdminFromReq(req);
   ```
   and pass `userId: parseInt(admin.id, 10)` to `auditLog({...})`.

6. **Decide on job `title` strategy.** Either:
   - Make `positionId` required on the job form (and remove the `title` field), OR
   - Write `title` into the `briefDescription` column if no position is linked (and remove the separate brief-description field), OR
   - Document that the title is informational only and the linked position's `position_title` is canonical.

### P2 — Polish / consistency

7. Use `isApplicant: role === "APPLICANT" ? true : null` in `admin/users/route.ts` POST (matches production NULL convention for non-applicants).

8. Drop `dutiesResponsibilitiesHtml` from `jobCreateSchema` and the job form (no richtext column exists for duties).

9. Drop `category` from the eligibility schema once no caller sends it.

10. Set `eligibilities.index` on create: `index: (await db.eligibility.count()) + 1` or compute `MAX(index) + 1`.

11. Add an `applied` count to `/api/admin/stats` so the dashboard's status buckets sum to `totalApplications`.

12. (Optional) Add a `/api/admin/positions/[id]/route.ts` PATCH/DELETE so positions can be edited/disabled.

13. (Optional) Batch the recent-applications loop in `/api/admin/stats` to eliminate N+1.

---

## 8. What's Already Correct (avoid regressing these)

- ✅ Prisma `@@map("postions")` preserves the production table-name typo; all 54 columns `@map`-ed correctly.
- ✅ Prisma `@@map("up_users")`, `@@map("jobpostings")`, `@@map("eligibilities")`, `@@map("place_of_assignments")` — all correct.
- ✅ All link-table models (`UserRoleLink`, `UserApplicantLink`, `UserPositionLink`, `JobPostingPositionLink`, `JobPostingApplicantLink`, `JobPostingUserLink`, `PositionEligibilityLink`, `PositionPlaceOfAssignmentLink`, `PositionSpecificEligibilityLink`, `ApplicationApplicantLink`, `ApplicationJobLink`, `EligibilityUserLink`, `SpecificEligibilityAdminLink`) — all correctly mapped including the `*_ord` columns and typo'd `postion_id` foreign keys.
- ✅ Password hashing: `bcrypt.hash(password, 10)` produces `$2a$10$...` 60-char hashes — identical format to existing production rows. Compatible.
- ✅ Role derivation: `is_admin → ADMIN`, `up_users_role_lnk.role_id=3 → APPLICANT`, else `EVALUATOR`. Matches production data shape.
- ✅ RBAC enforced on all admin routes via `requireAdminFromReq(req)`.
- ✅ Password column excluded from `select` in user GETs (security best practice).
- ✅ DELETE user is a soft-disable (`blocked: true`) — preserves referential integrity.
- ✅ JobPosting POST correctly sets `createdById: null` (FK-aware).
- ✅ Application apply route writes link tables with correct `*_ord` fields, uses raw SQL for JSON snapshot columns (Prisma can't write `Unsupported("json")`), and uses the production-capitalized `"Applied"` status label.
- ✅ MQR engine reads the correct position columns (`csc_education`, `csc_eligibility_group`, `csc_work_experience`, `csc_training_requirements`) — all populated by the positions form.
- ✅ Snapshot columns on `applications` (snapshot_profile, snapshot_educations, etc.) correctly declared as `Unsupported("json")` and written via `db.$executeRaw`.

---

**Audit complete.** The Prisma schema layer is solid; the four critical bugs are all in API route handlers (3 FK/wrong-column bugs + 1 field-name mismatch). Fixing the P0 items should take ~30 minutes and unblock the production DB swap.
