# Audit Report — Prisma Schema vs DB Schema + Auth Forms

**Task ID:** AUDIT-PRISMA-AUTH-5
**Agent:** Audit (general-purpose sub-agent)
**Date:** 2025-01 (audit run)
**Target:** RMIS — DOST-MIRDC recruitment system (Next.js 16 + Prisma 6.11 + SQLite/Strapi v5 production DB)

---

## 1. Executive Summary

### Prisma ↔ DB compatibility: **EXCELLENT** ✅
- **79 of 95** production DB tables are mapped to Prisma models (83%).
- **All 22 high-traffic tables** flagged for detailed inspection have **0 missing columns and 0 extra Prisma fields** — perfect column-level alignment (verified by automated comparison of `prisma/schema.prisma` against `PRAGMA table_info` exported to `/tmp/db-schema.txt`).
- 7 Prisma `String?` fields map to DB `date` columns — **documented intentional** choice (schema header lines 13, 23 explain DATE columns are stored as TEXT).
- 14 Prisma `Unsupported("json")?` fields map to DB `json` columns — **documented intentional** choice (Prisma 6.11's SQLite connector throws on null json values; reads happen via `db.$queryRaw` helper in `src/lib/raw-json.ts`).
- 16 DB tables have **no Prisma model** — all are either Strapi internals (`admin_*`, `i18n_locale`), Strapi components (`components_evaluation_*`), or Strapi admin creator links (`place_of_assignments_user_lnk`). The schema header explicitly documents this exclusion policy.

### Auth status: **MIXED — REGISTER IS BROKEN** ❌
- **Login flow: SOLID** ✅ — verified working end-to-end in prior worklog (testadmin/password123 returns 200 with correct role). Uses `bcrypt.compare` (no re-hash), supports email OR username lookup, blocks `blocked` users, rate-limited, audit-logged.
- **Register flow: BROKEN** ❌ — `src/app/api/auth/register/route.ts` calls `db.user.create()` with **3 field names that do not exist on the Prisma `User` model** (`passwordHash`, `role`, `emailVerified`) and `db.applicant.create()` with **1 field name that does not exist on the Prisma `Applicant` model** (`userId`). Prisma will throw `PrismaClientValidationError` on every signup attempt → HTTP 500 to every new registrant.
- **Logout, session, password hashing, cookie handling: SOLID** ✅.

### Bottom line
The Prisma schema is **production-DB-ready** — every model maps cleanly, every required Strapi column is modeled (including `document_id`, `locale`, `published_at`, `created_by_id`, `updated_by_id`, plus all custom RMIS columns like `is_admin`, `is_applicant`, `otp`, `encrypted_id`, `no_of_attemps` [sic], `information_fillouted`).

The **auth system is NOT production-ready** because the public register endpoint is broken. Existing Strapi users CAN log in (verified), but NO NEW users can self-register. This is a P0 blocker for going live.

---

## 2. Prisma vs DB Findings

### 2.1 Coverage summary

| Metric | Count |
|---|---|
| DB tables (per `/tmp/db-schema.txt`) | 95 |
| Prisma models | 79 |
| Models with correct `@@map` to a real DB table | 79 / 79 (100%) |
| DB columns total (all tables) | ~1,150 |
| DB columns missing from any Prisma model (after excluding `Unsupported` mappings) | **0** |
| Prisma scalar fields pointing at a non-existent DB column | **0** |
| Prisma relation fields with `@map` to a non-existent FK column | **0** |
| Type mismatches (Prisma type ≠ DB type) | 21 (all **documented intentional** — see §2.4) |

### 2.2 Table-name mapping — per-model audit (all 79 models)

Every Prisma model has a correct `@@map("...")` to the production DB table name. Spot-checks of the high-traffic tables:

| Prisma model | `@@map` target | Match | Notes |
|---|---|---|---|
| `User` | `up_users` | ✅ | 25/25 columns |
| `Role` | `up_roles` | ✅ | 11/11 columns |
| `UserRoleLink` | `up_users_role_lnk` | ✅ | 4/4 columns (includes `user_ord`) |
| `UserApplicantLink` | `up_users_applicant_id_lnk` | ✅ | 3/3 columns |
| `UserPositionLink` | `up_users_postion_lnk` | ✅ | preserves Strapi `postion` typo |
| `Applicant` | `applicants` | ✅ | **90/90 columns** (every column mapped, including `is_fillouted`, `status_of_eployment` [sic], `place_of_birth` etc.) |
| `ApplicantEducation` | `applicant_educations` | ✅ | 22/22 columns |
| `ApplicantWorkExperience` | `applicant_work_experiences` | ✅ | 25/25 columns |
| `ApplicantTraining` | `applicant_trainings` | ✅ | 18/18 columns |
| `ApplicantEligibility` | `applicant_eligibilities` | ✅ | 14/14 columns |
| `ApplicantAward` | `applicant_awards` | ✅ | 19/19 columns |
| `ApplicantAccomplishment` | `applicant_accomplishments` | ✅ | 14/14 columns |
| `Position` | `postions` | ✅ | **53/53 columns** (preserves `postions` typo; both `office_id` and `division_id` mapped) |
| `JobPosting` | `jobpostings` | ✅ | 22/22 columns |
| `Application` | `applications` | ✅ | 17/17 columns (7 JSON snapshots modeled as `Unsupported`) |
| `Assessment` | `applicant_interview_assessments` | ✅ | **34/34 columns** |
| `Interview` | `applicant_interviews` | ✅ | 16/16 columns |
| `Examination` | `applicant_examinations` | ✅ | 18/18 columns |
| `Interviewer` | `interviewers` | ✅ | 12/12 columns |
| `Eligibility` | `eligibilities` | ✅ | 10/10 columns |
| `SpecificEligibility` | `specific_eligibilities` | ✅ | 11/11 columns |
| `Course` | `courses` | ✅ | 12/12 columns |
| `PlaceOfAssignment` | `place_of_assignments` | ✅ | 9/9 columns |
| `EvaluationCriteria` | `evaluation_criterias` | ✅ | 13/13 columns (3 JSON criteria as `Unsupported`) |
| `File` | `files` | ✅ | 23/23 columns (2 JSON: `formats`, `provider_metadata`) |
| `UploadFolder` | `upload_folders` | ✅ | 11/11 columns |
| `Notification` | `notifications` | ✅ | 11/11 columns |
| `Custom` | `customs` | ✅ | 11/11 columns |
| All `*Link` junction models (49 of them) | various `*_lnk` tables | ✅ | Each junction model includes the Strapi `*_ord` ordering column where present |

**All 79 models pass table-name mapping.** Strapi typos (`postions`, `eployment`, `attemps`, `fillouted`) are preserved verbatim in the `@map` annotations — exactly as required for a production DB swap.

### 2.3 Junction-table modeling

Strapi v5 uses `*_lnk` junction tables (e.g. `up_users_role_lnk`, `applicant_educations_applicant_id_lnk`, `merged_awards_accomp73efd_applicant_accomplishments_lnk`) that carry extra `*_ord` ordering columns which Prisma's implicit m2m relations cannot represent. The schema deliberately models every junction as an explicit join model with its own `@@map` + `@map` per column. **All 49 junction tables in the DB are modeled correctly.**

Examples verified:
- `up_users_role_lnk` → `UserRoleLink` (4 cols incl. `user_ord`) ✅
- `up_users_applicant_id_lnk` → `UserApplicantLink` (3 cols, no `*_ord`) ✅
- `applicant_educations_applicant_id_lnk` → `ApplicantEducationLink` (4 cols incl. `applicant_education_ord`) ✅
- `merged_awards_accomp73efd_applicant_accomplishments_lnk` (Strapi's truncated-name junction) → `MergedAwardsAccomplishmentAccomplishmentLink` ✅

### 2.4 Type compatibility — the 21 type "mismatches" (all intentional)

| # | Model | Field | Prisma type | DB type | Verdict |
|---|---|---|---|---|---|
| 1 | `Applicant` | `birthDate` | `String?` | `date` | ⚠️ Intentional — schema header line 13 documents that DATE columns are stored as TEXT (e.g. `"1993-07-25"`) and Prisma `DateTime?` would coerce to ISO datetime which would corrupt reads. App code treats these as date strings. |
| 2 | `Applicant` | `crimeDate` | `String?` | `date` | ⚠️ Intentional — same as #1 |
| 3 | `ApplicantEducation` | `yearFrom` | `String?` | `date` | ⚠️ Intentional — field carries year strings or `"2006-01-01"`. Schema inline comment (line 284-285): `"Stored as TEXT ('2006-01-01' or year string). DO NOT change to DateTime."` |
| 4 | `ApplicantEducation` | `yearTo` | `String?` | `date` | ⚠️ Intentional — same as #3 |
| 5 | `ApplicantAward` | `dateGranted` | `String?` | `date` | ⚠️ Intentional — same as #1 |
| 6 | `ApplicantAccomplishment` | `dateGranted` | `String?` | `date` | ⚠️ Intentional — same as #1 |
| 7 | `Notification` | `notificationDate` | `String?` | `date` | ⚠️ Intentional — `audit-log.ts` line 65 writes `now.toISOString().slice(0,10)` which is a `YYYY-MM-DD` string. Works with `String?`; would fail with `DateTime?`. |
| 8-14 | `Applicant` | `characterReference` | `Unsupported("json")?` | `json` | ⚠️ Intentional — schema header lines 15-22 document that Prisma 6.11's SQLite connector throws `Conversion failed: Value json not supported` when querying rows with NULL in json columns. App reads via `db.$queryRaw` (`src/lib/raw-json.ts`). |
| 15 | `Position` | `competencyRequirementsRichtext` | `Unsupported("json")?` | `json` | ⚠️ Intentional — same as #8 |
| 16-22 | `Application` (7 fields) | `snapshotProfile/Awards/Experiences/Trainings/Eligibilities/Educations/Attachment` | `Unsupported("json")?` | `json` | ⚠️ Intentional — same as #8 |
| 23-25 | `EvaluationCriteria` (3 fields) | `educationCriteria/trainingCriteria/workExpCriteria` | `Unsupported("json")?` | `json` | ⚠️ Intentional — same as #8 |
| 26-27 | `File` (2 fields) | `formats/providerMetadata` | `Unsupported("json")?` | `json` | ⚠️ Intentional — same as #8 |

**None of these are blockers.** They are deliberate, documented engineering tradeoffs. The schema header (lines 1-26 of `prisma/schema.prisma`) explains each one.

### 2.5 Strapi special columns — coverage check

| Strapi column | Mapped in Prisma models? |
|---|---|
| `document_id` (varchar UUID, Strapi v5) | ✅ in every content-type model |
| `locale` (varchar) | ✅ in every content-type model |
| `published_at` (datetime) | ✅ in every content-type model |
| `created_at` / `updated_at` (datetime) | ✅ in every content-type model |
| `created_by_id` / `updated_by_id` (INTEGER FK to admin_users) | ✅ in every content-type model (modeled as scalar `Int?` — no relation since `admin_users` is intentionally not modeled) |

### 2.6 DB tables WITHOUT a Prisma model (16 total)

| DB table | Cols | Why no model | Verdict |
|---|---|---|---|
| `admin_permissions` | 13 | Strapi admin panel ACL — not used by Next.js app | ✅ Intentional |
| `admin_permissions_role_lnk` | 4 | Strapi admin panel ACL | ✅ Intentional |
| `admin_roles` | 11 | Strapi admin panel | ✅ Intentional |
| `admin_users` | 18 | Strapi admin panel users (separate from `up_users` which IS modeled) | ✅ Intentional |
| `admin_users_roles_lnk` | 5 | Strapi admin panel | ✅ Intentional |
| `i18n_locale` | 10 | Strapi i18n plugin | ✅ Intentional |
| `place_of_assignments_user_lnk` | 4 | Strapi admin creator link — `place_of_assignments` already has scalar `created_by_id`/`updated_by_id` columns modeled on `PlaceOfAssignment` | ✅ Intentional |
| `components_evaluation_education_percentages` | 3 | Strapi "component" storage — the same data is duplicated as JSON in `evaluation_criterias.education_criteria` | ⚠️ Soft warning — see §2.7 |
| `components_evaluation_educations` | 2 | Strapi component | ⚠️ Soft warning |
| `components_evaluation_educations_cmps` | 6 | Strapi component join | ⚠️ Soft warning |
| `components_evaluation_training_percentages` | 5 | Strapi component | ⚠️ Soft warning |
| `components_evaluation_trainings` | 3 | Strapi component | ⚠️ Soft warning |
| `components_evaluation_trainings_cmps` | 6 | Strapi component join | ⚠️ Soft warning |
| `components_evaluation_work_experience_percentages` | 3 | Strapi component | ⚠️ Soft warning |
| `components_evaluation_work_experiences` | 3 | Strapi component | ⚠️ Soft warning |
| `components_evaluation_work_experiences_cmps` | 6 | Strapi component join | ⚠️ Soft warning |

Schema header lines 24-25 explicitly document the exclusion of `admin_*`, `strapi_*`, `i18n_locale`, `sqlite_sequence`.

### 2.7 Soft warning — `components_evaluation_*` (9 tables)

Strapi "components" are reusable field-groups attached to a content type. For `evaluation_criterias`, Strapi stores the structured component data in **both** places:
1. As JSON in `evaluation_criterias.education_criteria` / `training_criteria` / `work_exp_criteria` (these are modeled as `Unsupported("json")?` in Prisma — readable only via `$queryRaw`).
2. As normalized rows in the `components_evaluation_*` tables (NOT modeled in Prisma).

**Risk:** If the Next.js app needs to **write** structured evaluation criteria with sub-components, it would need to populate both the JSON column AND the component tables (otherwise Strapi would lose the structured data if the DB is ever swapped back). If the app only **reads** evaluation criteria (likely for the evaluator queue display), reading the JSON via `$queryRaw` is sufficient.

**Recommendation:** If evaluator functionality involves editing criteria, add 9 explicit Prisma models for these component tables. If criteria are read-only in the new app, no action needed.

### 2.8 Indexes — coverage check

The Prisma schema declares `@@index` blocks for every Strapi FK index (e.g. `up_users_created_by_id_fk`, `applicants_documents_idx`, `postions_place_of_assignment_id_fk`). 100+ indexes are mapped. **No `@@unique` constraints** are declared — Strapi normally enforces unique email/username at the app layer (the new register/admin-create routes do this with `findFirst` pre-checks). This is a soft gap but not a blocker.

---

## 3. Auth Findings

### 3.1 Login flow — `src/app/api/auth/login/route.ts` ✅ SOLID

| Check | Status | Notes |
|---|---|---|
| Reads `identifier` + `password` from JSON body | ✅ | |
| Looks up user by email OR username (Strapi-style `identifier`) | ✅ | `OR: [{ email: id }, { username: id }]` — case-folded to lowercase |
| Verifies password with `bcrypt.compare` (NOT re-hash) | ✅ | `bcryptjs.compare(password, user.password)` — works against Strapi's `$2a$10$` hashes |
| Rejects `blocked` users | ✅ | Returns 403 with `Account is blocked. Contact administrator.` |
| Rejects users with no password (e.g. SSO-only) | ✅ | `if (!user || !user.password)` → 401 |
| Rate-limits brute force (5 attempts / 15 min, 30 min lockout) | ✅ | `checkLoginRateLimit` / `recordFailedLogin` / `clearLoginRateLimit` |
| Audit-logs every login success AND failure | ✅ | Persists to `notifications` table; IP captured via `x-forwarded-for` |
| Issues HS256 JWT session cookie (`next-auth.session-token`) | ✅ | 24h maxAge, httpOnly, sameSite=lax, secure in production |
| JWT payload sufficient to reconstruct user | ✅ | `{ id, email, name, role }` — `role` derived via `deriveUserRole` (is_admin→ADMIN; up_users_role_lnk.role_id=3→APPLICANT; else→EVALUATOR) |
| ❓ Does NOT check `confirmed` | ⚠️ WARNING | Strapi normally requires `confirmed=true` for login. The DB has most users with `confirmed=0`. New code lets them log in regardless. See §3.5. |
| ❓ Does NOT update `no_of_attemps` on failed login | ⚠️ INFO | The DB has a `no_of_attemps` [sic] column that Strapi may use to track failed attempts; the new code uses in-memory rate limiting instead. |

### 3.2 Register flow — `src/app/api/auth/register/route.ts` ❌ BROKEN (P0)

The route contains **4 fatal field-name bugs** that cause every signup attempt to throw `PrismaClientValidationError` and return HTTP 500.

#### 3.2.1 Bug #1: `passwordHash` is not a User field

```ts
// register/route.ts line 29
const user = await db.user.create({
  data: {
    // ...
    passwordHash,         // ❌ NOT in UserCreateInput
    // ...
  },
});
```

The Prisma `User` model field for the bcrypt hash is `password` (mapped to `up_users.password`). The generated `UserCreateInput` type has **no** `passwordHash` property (verified by inspecting `node_modules/.prisma/client/index.d.ts` lines 102294-102319). Prisma will throw:

```
PrismaClientValidationError: Unknown argument `passwordHash`. Available options are marked with ?.
```

#### 3.2.2 Bug #2: `role: "APPLICANT"` is not a User field

```ts
// register/route.ts line 30
    role: "APPLICANT",    // ❌ NOT in UserCreateInput
```

The `User` model has **no** `role` scalar column. Roles are derived (see `src/lib/role-utils.ts`): `is_admin=true → ADMIN`, `up_users_role_lnk.role_id=3 → APPLICANT`, else `EVALUATOR`. The correct way to assign the APPLICANT role is to insert a row into `up_users_role_lnk` with `{ user_id, role_id: 3 }` after creating the user.

#### 3.2.3 Bug #3: `emailVerified` is not a User field

```ts
// register/route.ts line 33
    emailVerified: new Date(), // ❌ NOT in UserCreateInput
```

This is a NextAuth-style field. The Strapi equivalent is the `confirmed` boolean column (already on the `User` model). The correct write is `confirmed: true`.

#### 3.2.4 Bug #4: `userId` is not an Applicant field

```ts
// register/route.ts lines 37-44
await db.applicant.create({
  data: {
    userId: user.id,                  // ❌ NOT in ApplicantCreateInput
    emailAddress: normalizedEmail,
    firstName: firstName || null,
    lastName: lastName || null,
  },
});
```

The `Applicant` model (mapped to `applicants`) has **no** `userId` field. The user↔applicant link is the **junction table** `up_users_applicant_id_lnk` (Prisma `UserApplicantLink` with `userId` + `applicantId`). The correct pattern is:
1. `db.applicant.create({ data: { emailAddress, firstName, lastName, ... } })` — no userId
2. `db.userApplicantLink.create({ data: { userId: user.id, applicantId: applicant.id } })`

The reference implementation in `src/app/api/admin/users/route.ts` lines 144-210 does this correctly — the public register route should mirror it.

#### 3.2.5 Missing writes (even after fixing the 4 bugs)

| Required write | Currently done? | Impact if missing |
|---|---|---|
| `db.user.create` with `provider: "local"` | ❌ No | Strapi treats null `provider` as no auth method; the user can technically still log in to the Next.js app but would be invisible/broken if the DB is ever swapped back to Strapi. |
| `db.user.create` with `confirmed: true` | ❌ No (tries `emailVerified` instead) | New users have `confirmed=0`. Login route doesn't enforce this so they can log in, but it deviates from Strapi behavior. |
| `db.user.create` with `isApplicant: true` | ❌ No | New users have `is_applicant=null`. The session route reads `isApplicant` but doesn't currently branch on it. Future-proofing: should be set. |
| `db.user.create` with `createdAt: now, updatedAt: now` | ❌ No | Strapi normally sets these. New users would have null timestamps. |
| `db.user.create` with `documentId: <uuid>` | ❌ No | Strapi v5 always populates `document_id` for content types. New users get null. Not strictly required by the Next.js app but breaks Strapi compatibility. |
| `db.userRoleLink.create({ userId, roleId: 3 })` (assign APPLICANT role) | ❌ No | **Critical:** Without this, `deriveUserRole` returns `EVALUATOR` for the new user (not is_admin, not in role_id=3). The user CANNOT access applicant pages. |
| `db.userApplicantLink.create({ userId, applicantId })` (link user → applicant) | ❌ No | **Critical:** Without this, `getApplicantForUser(userId)` returns null. The user has no applicant profile, cannot apply for jobs, cannot upload PDS, etc. |

#### 3.2.6 Net effect

Every signup attempt fails at the Prisma layer. The signup form (`signup-view.tsx`) catches the error and toasts `"Registration failed. Please try again."`. New users cannot self-register. **Existing Strapi users can still log in.**

#### 3.2.7 Recommended fix

Rewrite `register/route.ts` to mirror `admin/users/route.ts` POST handler:

```ts
export const POST = handleApi(async (req: NextRequest) => {
  const body = await req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return err("Invalid input", 400, parsed.error.flatten());
  const { email, firstName, lastName, password } = parsed.data;

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db.user.findFirst({
    where: { OR: [{ email: normalizedEmail }, { username: normalizedEmail.split("@")[0] }] },
  });
  if (existing) return err("An account with this email already exists", 409);

  const baseUsername = normalizedEmail.split("@")[0];
  let username = baseUsername;
  let i = 1;
  while (await db.user.findFirst({ where: { username } })) {
    username = `${baseUsername}${i++}`;
  }
  const passwordHash = await bcrypt.hash(password, 10); // Strapi v5 uses cost factor 10 ($2a$10$)
  const now = new Date();

  const user = await db.user.create({
    data: {
      email: normalizedEmail,
      username,
      password: passwordHash,           // ✅ was passwordHash (bug #1)
      provider: "local",
      confirmed: true,                  // ✅ was emailVerified (bug #3)
      blocked: false,
      isApplicant: true,
      isAdmin: false,
      firstName: firstName || null,
      lastName: lastName || null,
      createdAt: now,
      updatedAt: now,
    },
  });

  // Assign APPLICANT role (role_id=3) — was missing (bug #2 + missing write)
  await db.userRoleLink.create({ data: { userId: user.id, roleId: 3 } });

  // Create applicant profile — was: db.applicant.create({ data: { userId, ... } }) (bug #4)
  const applicant = await db.applicant.create({
    data: {
      emailAddress: normalizedEmail,
      firstName: firstName || null,
      lastName: lastName || null,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    },
  });
  await db.userApplicantLink.create({
    data: { userId: user.id, applicantId: applicant.id },
  });

  await auditLog({ userId: user.id, action: "USER_CREATED", description: `Self-registration: ${username}` });

  return ok({ id: user.id, email: user.email, role: "APPLICANT" }, 201);
});
```

After this fix, the signup form's auto-login flow (line 50-55) will succeed because the login route's `deriveUserRole` will see the new `up_users_role_lnk` row and return `APPLICANT`.

### 3.3 Logout flow — `src/app/api/auth/logout/route.ts` ✅ SOLID

- Clears the `next-auth.session-token` cookie (`maxAge: 0`).
- Returns 200 with `{ success: true }`.
- No DB writes (stateless JWT — no server-side session to invalidate).
- ⚠️ **Soft warning:** JWTs are stateless, so a logged-out token is still technically valid until expiry (24h). For a government system, consider adding a server-side token blocklist or shortening the JWT maxAge. Currently acceptable for the dev/staging environment.

### 3.4 Session flow — `src/app/api/session/route.ts` ✅ SOLID

| Check | Status | Notes |
|---|---|---|
| Reads JWT from cookie | ✅ | Handles both `next-auth.session-token` and `__Secure-next-auth.session-token` variants |
| Re-validates user existence in DB | ✅ | `db.user.findUnique({ where: { id: userId } })` |
| Re-checks `blocked` | ✅ | Returns `{ user: null }` if blocked (logs user out) |
| Returns full user shape including `applicant` link | ✅ | Uses `db.userApplicantLink.findFirst({ where: { userId } })` then `db.applicant.findUnique` |
| Returns role from JWT (does NOT re-derive) | ⚠️ WARNING | If admin demotes a user mid-session, the JWT still carries the old role until the user re-logs in. For a government system, consider re-deriving role on each session check (extra DB query per call but stronger consistency). |
| Does NOT re-check `confirmed` | ⚠️ INFO | Same as login — see §3.5 |

### 3.5 The `confirmed` field — soft warning

Strapi v5 `up_users.confirmed` (boolean) indicates whether the user has confirmed their email. Strapi's default `/api/auth/local` login route **rejects unconfirmed users** with `Your account email is not confirmed`. The DB shows most Strapi users have `confirmed=0` — these were created via the Strapi admin panel or imported, and were apparently able to log in (the production system may have had this check disabled via a Strapi plugin).

The new Next.js login route does NOT check `confirmed`. **Behavior:** All users (confirmed or not) can log in. **Recommendation:** Decide on a confirmation policy:
- If the new system wants email verification: implement a confirmation email flow on register, set `confirmed: false` on new users, and reject `confirmed=false` logins.
- If the new system trusts self-registration without email verification: set `confirmed: true` on register (which the recommended fix in §3.2.7 does) and document that `confirmed` is unused.

Currently the codebase is in an inconsistent middle state: register doesn't set `confirmed`, login doesn't check it.

### 3.6 Password hashing compatibility ✅

| Check | Status | Notes |
|---|---|---|
| Strapi v5 default hash format | ✅ verified | All 25 sampled `up_users.password` values start with `$2a$10$` (bcrypt cost factor 10) and are 60 chars long |
| Register route hash format | ✅ | `bcrypt.hash(password, 10)` — matches Strapi exactly. New users can log in to either system. |
| Login route verification | ✅ | `bcrypt.compare(password, user.password)` — works against both `$2a$` (Strapi) and `$2b$` (bcryptjs default) prefixes |
| Re-hash on login | ✅ NOT done | Correct — bcrypt.compare is the right pattern |

### 3.7 Session cookie / JWT ✅

- Algorithm: HS256 (symmetric — fine for single-server; consider RS256 if load-balanced across services).
- Secret: `process.env.NEXTAUTH_SECRET`, minimum 16 chars enforced, no hardcoded fallback. ✅
- Payload: `{ id, email, name, role }` — sufficient to reconstruct user. ✅
- Max age: 24h. ✅
- Cookie flags: httpOnly ✅, sameSite=lax ✅, secure in production ✅.

### 3.8 Sign-in form (`signin-view.tsx`) ✅

- Sends `{ identifier, password }` to `/api/auth/login`. ✅
- Handles 4xx (shows server message) and 5xx (generic message) separately. ✅
- Role-based redirect: ADMIN→admin-dashboard, EVALUATOR→evaluator-queue, else→home. ✅
- Network errors handled (TypeError on fetch failure). ✅
- ⚠️ **Minor copy issue:** Test-account hint at line 178 says `Applicant: testadmin / password123` but per worklog `testadmin` is the ADMIN account. Should say `Admin: testadmin / password123` and possibly add `Applicant: testapplicant / password123`. Production deployments should remove this hint entirely (line 172 says "removed in production" but it's still rendered in the JSX).

### 3.9 Sign-up form (`signup-view.tsx`) ✅ (depends on broken register route)

- Captures `firstName, lastName, email, password, confirm`. ✅
- Client-side validation: required fields, password ≥6 chars, password match, privacy consent. ✅
- After successful register, auto-logs in by calling `/api/auth/login` with the same credentials. ✅ (will work once register is fixed)
- Falls back to redirecting to signin on auto-login failure. ✅
- Sends form data including `confirm` field; the `registerSchema` Zod schema in `validation.ts` does NOT validate `confirm` (it's silently ignored by `safeParse` because Zod object schemas strip unknown keys by default). The client-side check at line 34 ensures password match before submit. ✅

### 3.10 Validation schema (`src/lib/validation.ts`) ✅

- `loginSchema`: `{ identifier: string ≥1, password: string ≥1 }` — matches login route. ✅
- `registerSchema`: `{ email, firstName, lastName, password ≥6 }` — matches register route. ✅
- ⚠️ Note: `loginSchema` is defined but the login route does NOT call `safeParse` — it does manual `if (!identifier || !password)` checks. Inconsistent but not broken.

### 3.11 Rate limiting (`src/lib/rate-limit.ts`) ✅ (with caveats)

- In-memory Map-based limiter. 5 attempts per 15 min window, 30 min lockout after 5 fails. ✅
- Keyed on `${clientIp}:${identifier.toLowerCase()}` — good.
- ⚠️ **Caveat:** In-memory state resets on server restart. Multi-instance deployments would not share state. For production government use, replace with Redis-backed limiter.
- ⚠️ **Caveat:** Header-based client IP extraction (`x-forwarded-for`) can be spoofed if the reverse proxy doesn't strip/overwrite it. Caddy does set this correctly by default.

### 3.12 Audit logging (`src/lib/audit-log.ts`) ✅ (with caveats)

- Logs to console (structured JSON) AND persists to `notifications` table. ✅
- Fire-and-forget (never throws on failure). ✅
- Records `userId, action, entityType, entityId, description, ipAddress`. ✅
- Does NOT log passwords/tokens/PII. ✅
- ⚠️ **Caveat:** The `notifications` table is repurposed as an audit log. The Strapi `notifications` schema has fields like `name`, `notification_description`, `notification_date`, `notification_type` — using it for audit logs conflates two concerns. Consider a dedicated `audit_logs` table for clarity.

---

## 4. Critical Issues (❌ must-fix before production DB swap)

### CRIT-1: Register route is completely broken (P0)

**File:** `src/app/api/auth/register/route.ts`
**Symptom:** Every signup attempt throws `PrismaClientValidationError` → HTTP 500.
**Root causes:** 4 field-name bugs (`passwordHash`, `role`, `emailVerified` on `User`; `userId` on `Applicant`).
**Fix:** See §3.2.7 — rewrite the route to mirror `src/app/api/admin/users/route.ts` POST handler. Add `userRoleLink.create` and `userApplicantLink.create` writes.
**Severity:** P0 — blocks all new user acquisition. Existing Strapi users can still log in (login route is unaffected).

---

## 5. Warnings (⚠️)

### WARN-1: `confirmed` field not enforced in login flow

Login route does not check `confirmed`. Strapi default behavior is to reject unconfirmed users. Decide on a verification policy and apply it consistently (see §3.5).

### WARN-2: Session route does not re-derive role from DB

`/api/session` returns `role` from the JWT, not from a fresh `deriveUserRole(userId)` call. Role changes (e.g., admin demotes a user) don't take effect until the user re-logs in. For a government system, consider re-deriving on each session check.

### WARN-3: Stateful rate-limiting is in-memory

`src/lib/rate-limit.ts` uses a `Map` that resets on server restart and is not shared across instances. Replace with Redis for production.

### WARN-4: Test-account hint in `signin-view.tsx` is wrong AND leaks into production

Line 178 says `Applicant: testadmin / password123` — but `testadmin` is the ADMIN account (per worklog). Should be `Admin: testadmin / password123` + `Applicant: testapplicant / password123`. The "removed in production" comment at line 172 is misleading — the JSX still renders it. Strip behind a `process.env.NODE_ENV !== 'production'` check.

### WARN-5: 9 `components_evaluation_*` tables have no Prisma model

If the evaluator workflow involves editing structured evaluation criteria (not just reading them), these tables need explicit Prisma models. Otherwise Strapi would lose structured data on DB swap-back. See §2.7.

### WARN-6: No `@@unique` constraint on `up_users.email` / `up_users.username`

Strapi normally enforces uniqueness at the app layer. The new register/admin routes do `findFirst` pre-checks but a race condition could allow duplicate emails. Consider adding `@@unique([email])` and `@@unique([username])` (requires a Prisma migration which would add the constraint at the SQLite level — safe since it doesn't change column types).

### WARN-7: `document_id` not auto-populated for new records

Strapi v5 always sets `document_id` (a UUID) for content-type entries. The Next.js app does NOT set this on new user/applicant/job/etc. records. If the production DB is ever swapped back to Strapi, these records would be invisible to Strapi's content-manager UI. Add `documentId: crypto.randomUUID()` to all `db.<model>.create` calls (or add a Prisma `@default(uuid())` — but that requires schema migration).

### WARN-8: Logout does not invalidate server-side JWT

Stateless JWT means a logged-out token remains valid until 24h expiry. For a government system, consider a server-side token blocklist or shorter maxAge.

### WARN-9: Audit logs conflate `notifications` table

`src/lib/audit-log.ts` writes audit events to the `notifications` table, mixing audit logs with the original notification purpose. Add a dedicated `audit_logs` table.

### WARN-10: Login route doesn't update `no_of_attemps` on failed login

The DB has a `no_of_attemps` [sic] column for tracking failed login attempts. The new code uses in-memory rate limiting instead. If the DB is ever swapped back to Strapi, this column would always be null. Optionally increment it in the login route's failure path.

---

## 6. Recommendations (concrete fixes, prioritized)

### P0 — Blocker, fix before any production cutover

1. **Rewrite `src/app/api/auth/register/route.ts`** per §3.2.7. Reference implementation: `src/app/api/admin/users/route.ts` lines 144-210.
2. **Manually test the rewrite** with a fresh email like `newuser@example.com` and verify:
   - Row appears in `up_users` with `password` (bcrypt $2a$10$), `provider=local`, `confirmed=1`, `is_applicant=1`.
   - Row appears in `up_users_role_lnk` with `role_id=3`.
   - Row appears in `applicants` with `email_address`, `first_name`, `last_name`.
   - Row appears in `up_users_applicant_id_lnk` linking the user to the applicant.
   - Auto-login from `signup-view.tsx` succeeds and redirects to `/profile`.
   - The new user can call `/api/applicant/profile` (returns their applicant record).

### P1 — Should fix in the same PR

3. **Decide on `confirmed` policy** (§3.5). If trusting self-registration, set `confirmed: true` on register (the §3.2.7 fix already does this). If requiring email verification, build a token flow.
4. **Fix test-account hint** in `signin-view.tsx` (§WARN-4): correct the label and gate behind `NODE_ENV !== 'production'`.
5. **Add `documentId: crypto.randomUUID()`** to user/applicant creates in both register and admin routes (§WARN-7). Low-risk, high-Strapi-compat payoff.

### P2 — Harden before government production launch

6. **Re-derive role on session check** in `/api/session` (§WARN-2). Add `await deriveUserRole(userId)` and return the fresh role.
7. **Replace in-memory rate limiter with Redis** (§WARN-3). Or accept the dev-only limitation and document it.
8. **Add `@@unique([email])` + `@@unique([username])`** to the User model (§WARN-6). Requires a Prisma migration that adds SQLite UNIQUE constraints — safe, no column changes.
9. **Add `components_evaluation_*` Prisma models** IF the evaluator workflow writes structured criteria (§WARN-5). Verify with the evaluator UI workflow.
10. **Add server-side JWT blocklist** on logout (§WARN-8). Or shorten JWT maxAge to 1h and add silent refresh.
11. **Add a dedicated `audit_logs` table** and migrate `auditLog` to write there (§WARN-9). Keep `notifications` for actual user-facing notifications.

### P3 — Cosmetic / future polish

12. **Use `loginSchema.safeParse`** in the login route for consistency with `registerSchema`.
13. **Increment `no_of_attemps`** on failed login (§WARN-10) for Strapi-compat telemetry.
14. **Document the `String?` for `date` column tradeoff** in the schema header (already documented — keep).
15. **Document the `Unsupported("json")?` tradeoff** in the schema header (already documented — keep).

---

## 7. Verification Methodology

The audit was performed using:

1. **Schema parsing scripts** (`/home/z/my-project/scripts/audit/`):
   - `parse-db-schema.js` — parses `/tmp/db-schema.txt` (95 tables) into structured JSON.
   - `parse-prisma.js` — parses `prisma/schema.prisma` (79 models) into structured JSON.
   - `compare.js` — compares every Prisma field's `@map` against every DB column; flags missing, extra, and type-mismatched.
2. **Live DB inspection** via `better-sqlite3` in readonly mode against `/home/z/my-project/db/production-data.db`:
   - Verified password hash format ($2a$10$).
   - Verified `up_roles` has 3 roles (id=1 Authenticated, id=2 Public, id=3 applicants).
   - Verified `up_users_role_lnk` (3 users with role_id=1, 8 with role_id=3) and `up_users_applicant_id_lnk` (21 links).
3. **Prisma client type inspection** — read `node_modules/.prisma/client/index.d.ts` to confirm `UserCreateInput` does NOT have `passwordHash`, `role`, or `emailVerified` fields (lines 102294-102319).
4. **Source code review** of all 6 auth-related files + 3 supporting libs (`auth.ts`, `jwt.ts`, `role-utils.ts`, `validation.ts`, `rate-limit.ts`, `audit-log.ts`) + reference implementation in `admin/users/route.ts`.
5. **Cross-reference with worklog.md** — confirmed prior task `RUN-RMISV2-1` verified login works (testadmin/password123 → 200) but did NOT test register.

---

*End of audit report.*
