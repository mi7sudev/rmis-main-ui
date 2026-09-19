# Task API-ROUTES — Update all API routes to production Prisma model/field names

## Agent
full-stack-developer

## Task
Update every route file in `src/app/api/` (except auth/login, auth/logout,
auth/register, and session — already done or out of scope) to use the new
production-compatible Prisma schema that maps to the Strapi v5 SQLite DB.

## Files Created / Modified

### New helper module
| Path | Purpose |
|------|---------|
| `src/lib/applicant-data.ts` | **NEW** — Aggregate loaders and junction-table helpers for the production schema (no Prisma relations). Provides `loadApplicantEducations`, `loadApplicantWorkExperiences`, `loadApplicantTrainings`, `loadApplicantEligibilities` (with joined `eligibilityTitle` via `applicant_eligibilities_eligibility_category_lnk`), `loadApplicantAwards`, `loadApplicantFullProfile`, `loadJobPostingPosition(s)`, `loadPositionPlaceOfAssignment`, `findApplication*`, plus `link*ToApplicant` creators. |

### Library fixes
| Path | Change |
|------|--------|
| `src/lib/extraction.ts` | Replaced `import type { DocumentCategory } from "@prisma/client"` (no longer exists in production) with a local alias to `ValidDocumentCategory` from `@/lib/file-types`. |
| `src/lib/file-types.ts` | Updated comment — category list is now the local source of truth (no Prisma enum). |
| `src/lib/mqr.ts` | Relaxed `tokenize` and `extractNumber` parameter types from `string` to `string \| null \| undefined` to accept production `String?` fields. |

### Routes updated (24 files)
| Route | What changed |
|-------|--------------|
| `applicant/profile/route.ts` | Removed `include: {educations, ...}` (no Prisma relations); uses `loadApplicant*` helpers; reads `characterReference` via `raw-json` helper; writes JSON column via `db.$executeRaw`; maps `isProfileComplete` ↔ `isFillouted`. |
| `applicant/educations/route.ts` | Uses `loadApplicantEducations` + `linkEducationToApplicant`; yearFrom/yearTo kept as TEXT (production storage); explicit `createdAt`/`updatedAt`. |
| `applicant/educations/[id]/route.ts` | **NEW** — DELETE via junction link → child record. |
| `applicant/work-experiences/route.ts` | Same pattern; `yearDecimal` computed in JS. |
| `applicant/work-experiences/[id]/route.ts` | **NEW** — DELETE. |
| `applicant/trainings/route.ts` | Same pattern. |
| `applicant/trainings/[id]/route.ts` | **NEW** — DELETE. |
| `applicant/eligibilities/route.ts` | Production has no `eligibilityTitle` column — title comes from linked `Eligibility` via `applicant_eligibilities_eligibility_category_lnk`. POST accepts `eligibilityId` or `eligibilityTitle` (lookup by name). |
| `applicant/eligibilities/[id]/route.ts` | DELETE — also removes category junction rows. |
| `applicant/awards/route.ts` | `dateGranted` kept as TEXT. |
| `applicant/awards/[id]/route.ts` | DELETE — also removes position junction rows. |
| `applicant/documents/route.ts` | **Option D** — no DB `Document` model; filesystem storage with sidecar JSON metadata (`upload/<applicantId>/<uuid>.meta.json`). |
| `applicant/documents/[id]/route.ts` | DELETE — removes file + sidecar. |
| `applicant/documents/extract/route.ts` | Reads sidecar metadata, calls VLM, writes results back to sidecar. |
| `jobs/route.ts` | No `isActive`/`authorId`/`positionId`/`title` — `isActive` ↔ `publishedAt != null`; loads position + place + author via junctions; supports `?mine=true` via `applicationJobLink`. |
| `jobs/apply/route.ts` | Uses `loadApplicantFullProfile`; runs MQR; creates `Application` row, writes snapshot JSON columns via `db.$executeRaw`, links via `applicationApplicantLink` + `applicationJobLink`. Production status `"Applied"`. |
| `jobs/verify-mqr/route.ts` | Loads full profile + position, calls `verifyMqr`. |
| `applications/route.ts` | Loads applicant's applications via `applicationApplicantLink`, joins jobPosting + position + place via junctions. |
| `evaluator/queue/route.ts` | Filter includes both uppercase ("APPLIED") and production-case ("Applied") status labels. |
| `evaluator/applications/[id]/route.ts` | Reads snapshot JSON via `getApplicationSnapshots`; loads applicant + job + position + assessments via junctions; PATCH logs status change to `notifications` (no dedicated status-change table in production). |
| `evaluator/assessments/[applicationId]/route.ts` | Production Assessment has no `applicationId`/`evaluatorId` — uses `assessmentApplicantLink` + `assessmentInterviewerLink`. Auto-creates an `Interviewer` row for the evaluator on first use. Converts Zod enum strings to production text ("Outstanding", "Internal"). |
| `admin/stats/route.ts` | Derives user counts from `up_users.is_admin` + `up_users_role_lnk.role_id=3`; `activeJobs` = `publishedAt != null`; counts both case forms of status labels. |
| `admin/users/route.ts` | Role derived (not stored); password stored in `password` (not `passwordHash`); isActive ↔ `!blocked`; APPLICANT creation also creates `Applicant` + `userApplicantLink`. |
| `admin/users/[id]/route.ts` | Same derivations; PATCH updates role via `userRoleLink` delete+create; DELETE soft-disables via `blocked=true`. |
| `admin/positions/route.ts` | Maps to `postions` table; uses `positionSalaryStep` (production name); links placeOfAssignment via `positionPlaceOfAssignmentLink`. |
| `admin/eligibilities/route.ts` | Drops `category` (not a column in production); only `name` is persisted. |
| `reference/route.ts` | Unchanged queries (model names already match). |

## Verification

### ESLint
```
$ bun run lint
$ eslint .   ← no errors
```

### TypeScript (only pre-existing errors remain)
Files I touched compile cleanly. Remaining errors are exclusively in:
- `src/app/api/auth/register/route.ts` (task says do NOT modify)
- `src/app/api/session/route.ts` (task says do NOT modify)
- `src/lib/extraction.ts` lines 140/346/398 — pre-existing Buffer/rawText/VLM-model issues, not in scope
- `src/lib/raw-json.ts` — pre-existing `bun:sqlite` type-resolution issue at type-check time (works at runtime)
- `prisma/seed.ts`, `examples/*`, `skills/*`, `src/components/*`, `src/app/page.tsx` — pre-existing, out of scope

### End-to-end test (executed actual route handlers with NextRequest)
All 15 endpoints tested against the production DB at
`/home/z/my-project/db/production-data.db`:

| # | Endpoint | Result |
|---|----------|--------|
| 1 | `GET /api/jobs` | ✓ 5 jobs, first = "METALS TECHNOLOGIST II", position loaded via junction |
| 2 | `GET /api/reference` | ✓ 6 eligibilities, 488 courses, 94 places |
| 3 | `GET /api/admin/stats` (admin auth) | ✓ 17 users, 3 admins, 7 applicants, 5 active jobs, 2 applications, byStatus + recent with joined applicant+job |
| 4 | `GET /api/admin/positions` (admin auth) | ✓ 580 total, paginated 50 |
| 5 | `GET /api/admin/eligibilities` (admin auth) | ✓ 6 rows |
| 6 | `GET /api/applicant/profile` (applicant auth) | ✓ id=148 "Ralph Lawrence Olaguer", 4 educations + 1 wexp + 2 trainings + 2 elig + 1 award, `isFillouted=true` |
| 7 | `GET /api/applicant/educations` | ✓ 4 rows |
| 8 | `GET /api/applications` | ✓ 1 application, job.title="ADMINISTRATIVE AIDE VI" |
| 9 | `GET /api/applicant/work-experiences` | ✓ 1 row |
| 10 | `GET /api/applicant/trainings` | ✓ 2 rows |
| 11 | `GET /api/applicant/eligibilities` | ✓ 2 rows (eligibilityTitle joined via category junction) |
| 12 | `GET /api/applicant/awards` | ✓ 1 row |
| 13 | `GET /api/applicant/documents` | ✓ 0 rows (filesystem-based, fresh start) |
| 14 | `GET /api/evaluator/queue` (admin auth) | ✓ 2 applications in queue |
| 15 | `GET /api/admin/users` (admin auth) | ✓ 17 users, roles derived correctly (testadmin → ADMIN) |

### Sample curl-equivalent verification (login + session)
Login as `testadmin`/`password123` succeeds (the auth/login route was already
updated by a previous task). The session route returns the user with the
correctly derived `role: "ADMIN"`.

## Stage Summary

**Routes updated**: 24 route files (including 3 new `[id]` DELETE handlers
for educations / work-experiences / trainings).

**Key migrations applied**:
1. **Junction tables everywhere** — no Prisma `include: {relation: true}`.
   All m2m relations resolved via explicit `*_lnk` queries.
2. **String session IDs → integers** via `parseInt(session.id, 10)`.
3. **camelCase Prisma fields** — `firstName`, `lastName`, `isAdmin`,
   `isFillouted`, `createdAt`, etc.
4. **JSON columns** (`snapshot_*`, `characterReference`) read via
   `src/lib/raw-json.ts`; written via `db.$executeRaw`.
5. **Production status labels** — `"Applied"` (capitalized) instead of
   `"APPLIED"`. Filters include both forms for safety.
6. **Document feature** — Option D (filesystem + sidecar JSON metadata).
   Documented the tradeoff in code comments.
7. **Zod validation preserved** — only the DB access layer changed.
8. **`documentId` field** — included in all returned records (Strapi's
   public identifier, present on every content-type table).

**Known limitations** (documented in code):
- Document metadata is filesystem-only (no DB persistence). Migrating to
  Strapi's `files` + `files_related_mph` polymorphic relation is a separate
  task.
- `auth/register/route.ts` was intentionally NOT modified (per task scope)
  and still references the old schema's `passwordHash`/`role`/`userId`
  fields — it will fail at runtime until updated separately.
- `evaluator/applications/[id]` PATCH logs status changes to the
  `notifications` table because production has no dedicated status-change
  audit table.
