# AUDIT-DOC-EXTRACT-2 — Document Upload + AI Extraction + Auto-Apply Pipeline Audit

**Audit target:** RMIS (DOST-MIRDC) — Next.js + Prisma (SQLite) recruitment system
**Production DB:** `/home/z/my-project/db/production-data.db` (real Strapi v5 SQLite — schema MUST NOT change)
**Audit scope:** Upload → VLM extract → auto-apply → DB write pipeline
**Audit date:** (current session)
**Source of truth:** `/tmp/db-schema.txt` (95-table production schema, verified live via `better-sqlite3`)

---

## 1. Executive Summary

The pipeline runs end-to-end and the **Prisma schema matches the actual production DB columns 1:1** for all 12 audited tables (verified programmatically — see §6). All five junction/link tables ARE written by the auto-apply route, so child records are not orphaned. Personal-info writes are correctly guarded against overwriting existing data.

However, the audit found **3 critical issues** and **7 warnings** that, taken together, mean the auto-apply path can silently corrupt data or hard-crash on realistic VLM output. The most severe is a **prompt/zod mismatch** (`source: 0`/`source: false` in VLM prompt templates vs. `z.string()` in auto-apply zod schema) that causes the **entire auto-apply to return HTTP 400** whenever the VLM extracts a work-experience salary, work govt-service flag, or training hours field while following the template literally — verified by a live zod reproduction. The second critical issue is that **`applicants.mobile_number` (a `bigint` column) is written as a raw string with no sanitization**, so a formatted phone number like `"+63 917 123 4567"` from the VLM throws `PrismaClientValidationError` and aborts the entire personal-info update. The third critical issue is that **uploaded files are NOT written to the production `files` table at all** — the upload route persists metadata in sidecar JSON files on disk, leaving the production Strapi `files` / `files_related_mph` tables untouched (a documented but unfixed limitation).

### Issue counts by severity
| Severity | Count | Areas affected |
|----------|------:|----------------|
| ❌ Critical | 3 | auto-apply zod vs. prompt; `mobile_number` BigInt crash; `files` table not written |
| ⚠️ Warning  | 7 | no dedup; low-confidence values written; missing fields; eligibility title lookup fragile; orphan-risk on partial failure; non-transactional; count off-by-one edge case |
| ✅ Pass     | 9 | Prisma schema match; link tables written; null-skip for personal; type compat for dates/floats/booleans; etc. |

---

## 2. Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  UPLOAD-PDS-CARD.TSX (Profile page)                                        │
│  Phase: idle → uploading → extracting → applying → done/error              │
│                                                                             │
│  1. POST /api/applicant/documents            (upload binary)               │
│     └─ writes file to upload/<applId>/<uuid>.<ext>                         │
│     └─ writes sidecar JSON  upload/<applId>/<uuid>.meta.json               │
│        ❌ Does NOT write to the production `files` table                   │
│                                                                             │
│  2. POST /api/applicant/documents/extract    (VLM extract)                 │
│     └─ parses file (Excel/PDF/Word → text; image → VLM)                   │
│     └─ calls z-ai-web-dev-sdk                                              │
│     └─ persists extractedJson back to the sidecar JSON                    │
│     └─ returns { results, merged: ExtractionResult }                      │
│                                                                             │
│  3. POST /api/applicant/profile/auto-apply   (DB WRITE — audited)          │
│     └─ zod-validates ExtractionResult                                      │
│     └─ updates applicants (empty fields only)                             │
│     └─ creates rows + link-table rows for 5 child entity types            │
│     └─ returns { applied: {...6 counts...}, totalFilled }                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

The same flow is also triggered by `documents-section.tsx`'s "Re-run Extraction" button (via `use-profile-data.ts`'s `onExtract` handler), so **both UI entry points run auto-apply automatically without an explicit user "Apply" click**.

---

## 3. Extraction Result Schema → DB Column Mapping

The canonical extraction-result TypeScript types live in **`src/lib/extraction.ts`** (lines 27-116). The auto-apply route re-declares them as a Zod schema at **`src/app/api/applicant/profile/auto-apply/route.ts`** (lines 37-50). The frontend has a third copy in **`src/components/views/profile/types.ts`** (lines 20-37). The three copies are NOT identical (see §4.4 below).

### 3.1 Personal Information (`ExtractionResult.personalInfo` → `applicants`)

DB table: `applicants` (90 columns; auto-apply touches 18 of them via `PERSONAL_FIELD_MAP`).

| VLM-extracted field | Auto-apply writes to DB column | DB type | Prisma type | Type compat | Notes |
|---|---|---|---|---|---|
| firstName | first_name | varchar(255) | String? | ✅ | |
| middleName | middle_name | varchar(255) | String? | ✅ | |
| lastName | last_name | varchar(255) | String? | ✅ | |
| extensionName | extension_name | varchar(255) | String? | ✅ | |
| emailAddress | email_address | varchar(255) | String? | ✅ | |
| mobileNumber | mobile_number | **bigint** | BigInt? | ❌ | **String passed raw — no BigInt conversion, no digit sanitization. Formatted numbers crash Prisma.** |
| contactNumber | contact_number | varchar(255) | String? | ✅ | |
| birthDate | birth_date | date (stored as TEXT) | String? | ✅ | Converted via `toISODate()` → "YYYY-MM-DD". Listed in `TEXT_DATE_FIELDS`. |
| birthPlace | birth_place | TEXT | String? | ✅ | |
| gender | gender | varchar(255) | String? | ✅ | |
| civilStatus | civil_status | varchar(255) | String? | ✅ | |
| citizenship | citizenship | varchar(255) | String? | ✅ | |
| religion | religion | varchar(255) | String? | ✅ | |
| presentAddress | present_address | varchar(255) | String? | ✅ | |
| city | city | varchar(255) | String? | ✅ | |
| province | province | varchar(255) | String? | ✅ | |
| country | country | varchar(255) | String? | ✅ | |
| zipCode | zip_code | TEXT | String? | ✅ | |

**DB columns that exist but are NOT extracted** (acceptable — out of VLM scope):
`nickname`, `telephone_number`, `contact_number_secondary`, `height`, `weight`, `blood_type`, `naturalized`, `ethnicity`, `pagibig`, `gsis`, `philhealth`, `tin`, `sss`, `govt_issued_id`, `govt_id_*`, `house_number`, `street`, `subdivision`, `barangay`, `permanent_*`, `place_of_birth` (duplicate of `birth_place`), `crime_*`, `admin_case*`, `respondent_to`, `character_reference` (json), `extension_name` ✓ (extracted), `employee_*`, etc.

**Notable observation:** the DB has BOTH `birth_place` (TEXT) AND `place_of_birth` (TEXT) — a Strapi schema-evolution duplicate. Extraction only writes `birth_place`. Not a bug; just a data-quality footnote.

### 3.2 Education (`ExtractionResult.educations[]` → `applicant_educations` + `applicant_educations_applicant_id_lnk`)

| VLM-extracted field | Auto-apply writes to DB column | DB type | Prisma type | Type compat | Notes |
|---|---|---|---|---|---|
| educationLevel | education_level | TEXT | String? | ✅ | |
| degree | degree | TEXT | String? | ✅ | |
| course | course | TEXT | String? | ✅ | |
| schoolName | school_name | TEXT | String? | ✅ | |
| yearGraduated | year_graduated | TEXT | String? | ✅ | Stored as TEXT (Prisma comment: "DO NOT change to DateTime"). |
| unitsEarned | units_earned | TEXT | String? | ✅ | |
| awards | awards | TEXT | String? | ✅ | |
| highestLevel | — | highest_level (TEXT) | String? | ⚠️ | **Declared in `ExtractedEducation` type but NOT written by auto-apply. Silently dropped.** |
| (not extracted) | year_from | date | String? | ⚠️ | DB has it; existing rows are all NULL. Matches production convention (year_graduated is the canonical field). |
| (not extracted) | year_to | date | String? | ⚠️ | Same as year_from. |
| (not extracted) | ongoing, is_highest_education, specify_others, hr_remarks | | | ⚠️ | DB has them; auto-apply doesn't set. Acceptable (out of scope). |

**Link table write:** ✅ `linkEducationToApplicant(item.id, applicantId)` (auto-apply/route.ts:223) writes `applicant_educations_applicant_id_lnk`. Verified the helper at `src/lib/applicant-data.ts:196-200` creates the link row with `applicantEducationOrd: Date.now()`.

### 3.3 Work Experience (`ExtractionResult.workExperiences[]` → `applicant_work_experiences` + link table)

| VLM-extracted field | Auto-apply writes to DB column | DB type | Prisma type | Type compat | Notes |
|---|---|---|---|---|---|
| positionTitle | position_title | TEXT | String? | ✅ | |
| employerName | employer_name | TEXT | String? | ✅ | |
| employerAddress | employer_address | TEXT | String? | ✅ | |
| inclusiveDateFrom | inclusive_date_from | datetime | DateTime? | ✅ | Converted via `toDate()` → JS Date. |
| inclusiveDateTo | inclusive_date_to | datetime | DateTime? | ✅ | Same. |
| statusOfEmployment | status_of_employment | TEXT | String? | ✅ | |
| monthlySalary | monthly_salary | float | Float? | ✅ | Converted via `toNumber()` (strips non-numeric chars). |
| isGovtService | is_govt_service | boolean | Boolean? | ✅ | Converted via `toBool() ?? false`. |
| actualDuties | actual_duties | TEXT | String? | ✅ | |
| (computed) | is_present_work | boolean | Boolean? | ✅ | Set to `!inclusiveDateTo` — reasonable heuristic. |
| (computed) | year_decimal | float | Float? | ✅ | Computed from inclusive dates — matches `work-experiences/route.ts` logic. |
| reasonForLeaving | — | reason_for_leaving (TEXT) | String? | ⚠️ | Declared in `ExtractedWorkExperience` type; NOT in PDS prompt; NOT written. Dead type. |
| accomplishment | — | accomplishment (TEXT) | String? | ⚠️ | Same — declared in type, not prompted, not written. |
| (not extracted) | supervisor_name, supervisor_position, office, hr_remarks | | | ⚠️ | DB has them; not in scope. |

**Link table write:** ✅ `linkWorkExperienceToApplicant(item.id, applicantId)` (auto-apply/route.ts:277).

### 3.4 Training (`ExtractionResult.trainings[]` → `applicant_trainings` + link table)

| VLM-extracted field | Auto-apply writes to DB column | DB type | Prisma type | Type compat | Notes |
|---|---|---|---|---|---|
| titleOfTraining | title_of_training | TEXT | String? | ✅ | |
| typeOfTraining | type_of_training | TEXT | String? | ✅ | |
| inclusiveDateFrom | inclusive_date_from | datetime | DateTime? | ✅ | `toDate()`. |
| inclusiveDateTo | inclusive_date_to | datetime | DateTime? | ✅ | `toDate()`. |
| numberHours | number_hours | **INTEGER** | Int? | ⚠️ | `toNumber()` returns float; SQLite is flexible so a fractional value like 8.5 would be stored as REAL in an INTEGER column. The zod validation schema (`trainingSchema`) enforces `z.number().int()` — but **auto-apply bypasses `trainingSchema`** and uses its own looser zod (`z.record(z.string(), extractedFieldSchema)`). |
| (computed) | hour_decimal | float | Float? | ✅ | Set to `numberHours ?? 0`. Matches production convention (sample data shows `number_hours` == `hour_decimal`). |
| isGovtService | — | is_govt_service (boolean) | Boolean? | ⚠️ | Declared in `ExtractedTraining` type; NOT in PDS prompt; NOT written. Dead type. |
| (not extracted) | is_present_work, specify_training, hr_remarks | | | ⚠️ | DB has them; not in scope. |

**Link table write:** ✅ `linkTrainingToApplicant(item.id, applicantId)` (auto-apply/route.ts:309).

### 3.5 Eligibility (`ExtractionResult.eligibilities[]` → `applicant_eligibilities` + `applicant_eligibilities_applicant_lnk` + `applicant_eligibilities_eligibility_category_lnk`)

The `applicant_eligibilities` table has **NO title column** — the "title" is stored as the `name` of a row in the master `eligibilities` table, linked via the junction `applicant_eligibilities_eligibility_category_lnk`. Auto-apply correctly handles this two-step lookup.

| VLM-extracted field | Auto-apply writes to DB column | DB type | Prisma type | Type compat | Notes |
|---|---|---|---|---|---|
| eligibilityTitle | (eligibilities.name, via junction) | varchar(255) | String? | ⚠️ | **Lookup is `findFirst({ where: { name: eligibilityTitle } })` — case-sensitive, exact-match only.** VLM returning "Civil Service Professional" matches; "CSE Professional" or "civil service professional" does NOT. The title is then silently dropped (the `applicant_eligibility` row is still created but with no category link → shows up with no title in the UI). |
| rating | rating | TEXT | String? | ✅ | |
| examDate | exam_date | datetime | DateTime? | ✅ | `toDate()`. |
| examPlace | exam_place | TEXT | String? | ✅ | |
| licenseNumber | license_number | TEXT | String? | ✅ | |
| licenseValidity | license_validity | datetime | DateTime? | ✅ | `toDate()`. |

**Link table writes:** ✅ Both:
- `linkEligibilityToApplicant(item.id, applicantId)` → writes `applicant_eligibilities_applicant_lnk` (auto-apply/route.ts:343).
- `linkEligibilityToCategory(item.id, match.id)` → writes `applicant_eligibilities_eligibility_category_lnk` (auto-apply/route.ts:351), but ONLY if the title lookup matched a master `eligibilities` row.

**Data quality note (master `eligibilities` table):** the production DB has duplicate names — e.g. "Career Service Professional" exists at id=7 AND id=8; "None Required" at id=1 AND id=9. `findFirst` returns an arbitrary one. Not a bug in auto-apply; flagged for awareness.

### 3.6 Awards (`ExtractionResult.awards[]` → `applicant_awards` + `applicant_awards_applicant_lnk`)

| VLM-extracted field | Auto-apply writes to DB column | DB type | Prisma type | Type compat | Notes |
|---|---|---|---|---|---|
| recognitionType | recognition_type | varchar(255) | String? | ✅ | Defaults to `"Award"` if null. |
| recognitionDetails | recognition_details | varchar(255) | String? | ✅ | |
| recognitionScope | recognition_scope | varchar(255) | String? | ✅ | |
| recognitionCategory | recognition_category | varchar(255) | String? | ✅ | |
| recognitionProvider | recognition_provider | varchar(255) | String? | ✅ | |
| dateGranted | date_granted | **date (stored as TEXT)** | String? | ✅ | Converted via `toISODate()` → "YYYY-MM-DD". Prisma comment: "DO NOT change to DateTime". Verified in production sample data: `"2025-09-15"`. |
| (not extracted) | award_type, recognition_subcategory, points, number, hr_remarks | | | ⚠️ | DB has them; not in scope. |

**Link table write:** ✅ `linkAwardToApplicant(item.id, applicantId)` (auto-apply/route.ts:392).

---

## 4. Critical Issues (❌)

### ❌ C1. Prompt-template / zod-schema mismatch on `source` field — entire auto-apply fails

**Files:**
- `src/lib/extraction.ts` lines 300, 301, 316, 318, 326 — VLM prompt templates
- `src/app/api/applicant/profile/auto-apply/route.ts` lines 37-41 — zod schema

**The bug:**

The VLM prompt templates (`buildPrompt()`) deliberately use `source` as a **type hint** by giving it a non-string default value:
```js
// extraction.ts line 300 (PDS prompt, workExperiences)
"monthlySalary": {"value": null, "confidence": "none", "source": 0},
"isGovtService": {"value": null, "confidence": "none", "source": false},
// line 301 (PDS prompt, trainings)
"numberHours": {"value": null, "confidence": "none", "source": 0},
```
Same pattern appears in the `WORK_EXPERIENCE`, `TRAINING`, and `COE` category prompts.

But the auto-apply route's zod schema requires `source` to be a **string**:
```js
// auto-apply/route.ts lines 37-41
const extractedFieldSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  confidence: z.enum(["high", "medium", "low", "none"]),
  source: z.string().optional().default(""),
});
```

**If the VLM follows the template literally and returns `source: 0` (number) for monthlySalary or `source: false` (boolean) for isGovtService**, the entire extraction payload is rejected by zod.

**Live reproduction (run in this audit):**
```js
// Simulated VLM response for a work experience with salary
const vlmResponse = {
  workExperiences: [{
    positionTitle: { value: 'Engineer', confidence: 'high', source: 'header' },
    monthlySalary: { value: 50000, confidence: 'high', source: 0 },  // per template
  }],
};
const result = extractionSchema.safeParse(vlmResponse);
// → REJECTED: "Invalid input: expected string, received number"
```

**Impact:**
- The entire `/api/applicant/profile/auto-apply` request returns HTTP 400 "Invalid extraction payload".
- **Zero** fields are written (not even the personal info or education sections).
- `upload-pds-card.tsx` shows `"Processing Failed"` — the user has no idea why; the API error message ("Invalid extraction payload") is the zod error which gets passed through as `data?.error`.
- This bug is **non-deterministic** — it depends on whether the VLM copies the template's `source: 0` literally or invents a string. The worklog shows prior end-to-end tests passed, which means the VLM happened to return string sources in those tests. Any model update, prompt tweak, or unusual document could flip the behavior.

**Fix (recommended):**

In `src/lib/extraction.ts`, change the prompt templates to NOT use `source` as a type hint. Use string defaults everywhere:
```js
// Before
"monthlySalary": {"value": null, "confidence": "none", "source": 0},
// After
"monthlySalary": {"value": null, "confidence": "none", "source": ""},
```
And/or — defensively — relax the auto-apply zod schema to accept any scalar for `source`:
```js
source: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional().default(""),
```
And/or — strip `source` from the auto-apply payload entirely since the route never uses it.

---

### ❌ C2. `applicants.mobile_number` (bigint) written as raw string — crashes on formatted phone numbers

**Files:**
- `src/app/api/applicant/profile/auto-apply/route.ts` lines 108-127 (`PERSONAL_FIELD_MAP`), 161-188 (personal update loop)

**The bug:**

`applicants.mobile_number` is declared `bigint` in the production DB and `BigInt?` in the Prisma schema (verified — schema.prisma line 185). Production sample data confirms integer storage: `{"id":369,"mobile_number":9977583493}`.

The auto-apply route's personal-update loop (lines 173-178):
```js
let v: unknown = field.value;
if (TEXT_DATE_FIELDS.has(profileKey)) {
  v = toISODate(field.value);
  if (!v) continue;
}
personalUpdate[profileKey] = v;
```

For `mobileNumber`, `TEXT_DATE_FIELDS.has("mobileNumber")` is **false** (only `birthDate` is in the set). So `v = field.value` — the raw string from the VLM. No `toBigInt()`, no digit-stripping, no validation.

Prisma accepts strings for `BigInt?` fields and internally calls `BigInt(value)`. This works for pure-digit strings like `"9977583493"` but **throws `SyntaxError: Cannot convert ... to a BigInt`** for:
- `"+63 917 123 4567"` (country code + spaces)
- `"0917-123-4567"` (dashes)
- `"(02) 917-1234"` (parentheses + dashes)
- `"0917 123 4567"` (spaces)

The Prisma error is wrapped by `handleApi` into a generic HTTP 500 `"An unexpected error occurred"`. The user sees `"Processing Failed"` and the entire personal-info update is aborted (and because list-item inserts come AFTER the personal update, none of them run either — the whole auto-apply fails).

**Phone numbers from VLM are very likely to contain formatting characters** — real PDS/resume documents display them formatted.

**Fix (recommended):**

Add a `toBigIntOrNull` helper in auto-apply/route.ts and a `BIGINT_FIELDS` set, mirroring `TEXT_DATE_FIELDS`:
```js
const BIGINT_FIELDS = new Set(["mobileNumber"]);

function toDigits(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string") {
    const digits = value.replace(/[^\d]/g, ""); // strip +, -, spaces, parens
    if (!digits) return null;
    try { return BigInt(digits); } catch { return null; }
  }
  return null;
}
// In the personal loop:
if (BIGINT_FIELDS.has(profileKey)) {
  v = toDigits(field.value);
  if (!v) continue; // skip rather than crash
}
```

Also consider: leading-zero loss. Philippine mobile numbers conventionally start with `0` (e.g. `09171234567`), but `BigInt("09171234567")` returns `9171234567n` (leading zero dropped). The production data already follows this convention (10-digit numbers without leading zero), so this is consistent — but worth documenting.

---

### ❌ C3. Upload route does NOT write to the production `files` table

**Files:**
- `src/app/api/applicant/documents/route.ts` (entire file, esp. lines 19-38, 97-194)
- `src/app/api/applicant/documents/[id]/route.ts` (DELETE — also filesystem-only)
- `src/lib/applicant-data.ts` lines 118-122 (comments acknowledging this)

**The bug:**

The task asks: *"Does the upload route correctly write to `files` table with all required columns (name, url, size, mime, hash, etc.)?"*

**Answer: NO.** The upload route does not touch the `files` table at all. It writes:
1. The binary file to `upload/<applicantId>/<uuid>.<ext>`
2. A sidecar JSON metadata file to `upload/<applicantId>/<uuid>.meta.json`

The production `files` table schema (verified live) has 23 columns including: `name`, `hash`, `ext`, `mime`, `size`, `url`, `provider`, `folder_path`, `width`, `height`, `formats` (json), `preview_url`, `provider_metadata` (json), `alternative_text`, `caption`, `document_id`, `created_at`, `updated_at`, `published_at`, `created_by_id`, `updated_by_id`, `locale`.

Production sample rows show the expected convention:
```
id=1, name="avatar.jpg", hash="avatar_d0edb38dff", ext=".jpg", mime="image/jpeg",
     size=5.53, url="/uploads/avatar_d0edb38dff.jpg", provider="local",
     folder_path="/", width=200, height=200, created_at=1739331359553 (ms epoch),
     document_id="o9d9q8ntu05i5rfbztyephv4"
```

The current implementation stores equivalent data in the JSON sidecar but never creates a `files` row, never creates a `files_related_mph` polymorphic link, and never updates the `applicants.pds_path` / `image_path` / `curriculum_vitae_path` / etc. columns that exist precisely to reference uploaded documents.

**Impact:**
1. Uploaded documents are invisible to Strapi's admin file browser (and to any future Strapi integration).
2. Files are NOT linked to applicants via `files_related_mph` — there's no DB-level association between an applicant and their uploaded PDS.
3. The `applicants.pds_path` column stays NULL even after a successful PDS upload — downstream code that expects `pds_path` to point to the PDS will not find it.
4. If the server's `upload/` directory is lost (no DB backup of file metadata), all document records are lost. The production DB has no record of them.
5. The `files` table's existing 60 rows (real Strapi uploads from the production system) are disconnected from new uploads.

**This is a documented limitation** (route.ts lines 19-38 explicitly explain it), and migrating to the Strapi model would require also creating `files_related_mph` rows + an `applicant_forms` content-type row to attach the file — non-trivial. But the task explicitly flags this as in scope, so it's marked ❌ critical for the audit.

**Fix (recommended):**

A minimal fix that doesn't change the production schema:

1. In `POST /api/applicant/documents`, after writing the binary, ALSO insert a row into `files`:
```js
import crypto from "crypto";
// ... after fs.writeFile(filePath, buffer) ...
const hash = `${safeName.replace(/\.[^.]+$/, "")}_${crypto.randomBytes(5).toString("hex")}`;
const now = Date.now(); // ms epoch — matches production convention
const fileRow = await db.file.create({
  data: {
    name: file.name,
    hash,
    ext: sanitizedExt,
    mime: mimeType,
    size: file.size / 1024, // KB — matches production
    url: `/uploads/${hash}${sanitizedExt}`,
    provider: "local",
    folderPath: "/",
    createdAt: new Date(now),
    updatedAt: new Date(now),
    publishedAt: new Date(now + 1),
    documentId: crypto.randomBytes(16).toString("hex"), // nanoid-like
    // width/height only for images — set via image-size probe
  },
});
```
2. Persist the `file.id` in the sidecar JSON so DELETE can also remove the `files` row.
3. Update the corresponding `applicants.*_path` column based on the document category (e.g. `pds_path` for category=PDS, `image_path` for PROFILE_PICTURE, `curriculum_vitae_path` for RESUME, etc.).

This requires no schema change (all columns already exist). It just makes the upload route use the production tables.

---

## 5. Warnings (⚠️)

### ⚠️ W1. No deduplication — re-uploads create duplicate child rows

**File:** `src/app/api/applicant/profile/auto-apply/route.ts` lines 190-395

The route's header comment explicitly states: *"List entries: always create (user can delete duplicates via the Profile UI)"*. There is NO check for existing records before inserting education, work, training, eligibility, or award rows.

In a government recruitment system, applicants WILL re-upload their PDS multiple times (correcting typos, after expiration, re-applying for a different position). Each re-upload creates duplicate rows in all 5 child tables.

**Impact:**
- Profile pollution (same education entry appears 3× after 3 uploads).
- Downstream evaluation logic that aggregates education/training could double-count, inflating the applicant's score.
- Manual cleanup burden on the applicant.

**Recommended fix:** Before inserting, check for an existing row linked to this applicant with the same key fields (e.g. `schoolName + yearGraduated` for education, `positionTitle + employerName + inclusiveDateFrom` for work, `titleOfTraining + inclusiveDateFrom` for training, `licenseNumber` for eligibility, `recognitionDetails + dateGranted` for awards). Skip if found.

### ⚠️ W2. Low-confidence values ARE written (contrary to worklog claim)

**File:** `src/app/api/applicant/profile/auto-apply/route.ts` lines 60-68 (`hasValue`)

The worklog tail states: *"skips low-confidence/empty values"*. This is **inaccurate**. The `hasValue()` helper only rejects `confidence === "none"`:
```js
if (f.confidence === "none") return false;
```
Values with `confidence: "low"` ARE written to the DB.

**Impact:** Low-confidence VLM guesses (e.g. a barely-legible salary figure, an ambiguous date) get persisted as if they were factual. For a government system, this is risky — the applicant might not notice the auto-filled value is wrong.

**Recommended fix:** Add a `MIN_CONFIDENCE` threshold. Either:
- Skip `confidence === "low"` for personal info (keep for list entries where the user reviews them inline), OR
- Add a `__lowConfidence: true` flag on the inserted row so the UI can highlight it for review.

### ⚠️ W3. Non-transactional — partial failure leaves orphan rows

**File:** `src/app/api/applicant/profile/auto-apply/route.ts` (entire POST handler)

The auto-apply route performs 1 + N + M + ... sequential `db.*.create()` calls (1 applicant update, then for each list entry: 1 child insert + 1 link insert, optionally + 1 category-link insert for eligibility). These are **not wrapped in a transaction**.

If any create fails (e.g. Prisma validation error on a single work-experience row), the previously-created rows (personal update, earlier education rows, etc.) are **already committed**. The applicant is left with a partial profile.

**Impact:** Inconsistent state. E.g. personal info updated + 2 of 3 education rows created, then the 3rd education row fails → the user sees "Processing Failed" but 2 education entries were actually created. Re-uploading creates more duplicates (see W1).

**Recommended fix:** Wrap the entire handler body in `await db.$transaction([...])` (Prisma interactive transaction):
```js
await db.$transaction(async (tx) => {
  // all creates/updates use `tx` instead of `db`
});
```
If any step throws, the entire transaction rolls back.

### ⚠️ W4. Eligibility title lookup is fragile (exact-match, case-sensitive)

**File:** `src/app/api/applicant/profile/auto-apply/route.ts` lines 346-353

```js
const match = await db.eligibility.findFirst({
  where: { name: eligibilityTitle },
});
```

This is an exact, case-sensitive match against the master `eligibilities.name` column.

The production master table contains names like `"Career Service Professional"`, `"Career Service Sub-Professional"`, `"None Required"`. If the VLM extracts `"Civil Service Professional"` (common alternate phrasing), `"career service professional"` (lowercase), or `"CSE Professional"`, the lookup returns null and the title is **silently dropped** — the `applicant_eligibility` row is created but with no category link, so the UI shows it with no title.

**Recommended fix:** Use case-insensitive contains + take the closest match:
```js
const match = await db.eligibility.findFirst({
  where: { name: { contains: eligibilityTitle, mode: "insensitive" } },
});
```
Or, if SQLite + Prisma's `insensitive` mode is unreliable, do a `findMany` of all eligibilities and pick the best fuzzy match (Levenshtein or simple substring). If no match, still persist `eligibilityTitle` somewhere — but the `applicant_eligibilities` table has no title column, so this would require either a schema change (forbidden) or storing it in `hr_remarks` as a fallback.

### ⚠️ W5. `numberHours` type mismatch — INTEGER column may receive float

**File:** `src/app/api/applicant/profile/auto-apply/route.ts` line 293

`applicant_trainings.number_hours` is `INTEGER` in DB and `Int?` in Prisma. The auto-apply route uses `toNumber()`:
```js
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return isNaN(value) ? null : value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[^0-9.\-]/g, ""));
    return isNaN(n) ? null : n;
  }
  return null;
}
```
This returns a `number` which can be fractional (e.g. `8.5` from `"8.5 hours"`). SQLite is typeless so it'll store as REAL, but:
- Prisma's `Int?` field type may reject the fractional value (Prisma validates the JS type, not just the DB column).
- Downstream code expecting an integer hour count could misbehave.

The regular training create route (`src/app/api/applicant/trainings/route.ts`) uses `trainingSchema` which enforces `z.number().int().min(0).max(10000)` — but **auto-apply bypasses `trainingSchema`** and uses its own looser zod (`z.record(z.string(), extractedFieldSchema)` with `value: z.union([z.string(), z.number(), z.boolean(), z.null()])` — no integer constraint).

**Recommended fix:** In auto-apply, wrap `numberHours` with `Math.trunc(toNumber(...) ?? 0)` before passing to Prisma, or use `Math.round`.

### ⚠️ W6. Personal-update count has an off-by-one edge case (writes `updatedAt` even with no fields)

**File:** `src/app/api/applicant/profile/auto-apply/route.ts` lines 180-187

```js
if (Object.keys(personalUpdate).length > 0) {
  personalUpdate.updatedAt = new Date();
  await db.applicant.update({ ... });
  applied.personal = Object.keys(personalUpdate).length - 1; // exclude updatedAt
}
```

If `personalUpdate` is empty (no extractable personal fields), the `if` block is skipped — correct. But the `if` condition is `> 0`, and the only way `personalUpdate` has keys at this point is if at least one field was added in the loop above. So actually the edge case doesn't trigger. **HOWEVER**, the `applied.personal = Object.keys(personalUpdate).length - 1` subtraction is fragile — if someone later adds another meta key (e.g. `publishedAt`), the count silently drops. 

**Recommended fix:** Track the count explicitly:
```js
let personalCount = 0;
for (...) { ... personalUpdate[profileKey] = v; personalCount++; }
if (personalCount > 0) {
  personalUpdate.updatedAt = new Date();
  await db.applicant.update({ ... });
  applied.personal = personalCount;
}
```

### ⚠️ W7. Three copies of the extraction-result types are out of sync

**Files:**
- `src/lib/extraction.ts` lines 27-116 — canonical types, generic `ExtractedField<T>` (T defaults to string; specialized as `ExtractedField<number | null>` for monthlySalary/numberHours, `ExtractedField<boolean | null>` for isGovtService)
- `src/components/views/profile/types.ts` lines 22-37 — `ExtractedField.value: string | null` (no number/boolean support)
- `src/components/views/upload-pds-card.tsx` lines 44-57 — `ExtractedField.value: string | number | boolean | null`

The frontend `types.ts` is too restrictive (`string | null`) — at runtime it receives numbers and booleans from the VLM. This is a type-only inconsistency (TypeScript doesn't enforce at the network boundary), but it means the review-dialog code that does `field.value` will render `50000` and `true` fine, while TypeScript thinks it's always a string. No runtime bug today, but a maintenance trap.

**Recommended fix:** Delete the duplicate types in `types.ts` and `upload-pds-card.tsx`; import from `src/lib/extraction.ts` (the canonical source). For the frontend, you may need to keep a separate type that's a subset, but make it structurally compatible.

---

## 6. Prisma Schema vs. Actual DB Verification

A programmatic diff was run for all 12 audited tables (see audit work log). Result:

| Table | Prisma model | DB columns | Prisma columns | Match |
|---|---|---:|---:|:---:|
| applicants | Applicant | 90 | 90 | ✅ |
| applicant_educations | ApplicantEducation | 22 | 22 | ✅ |
| applicant_educations_applicant_id_lnk | ApplicantEducationLink | 4 | 4 | ✅ |
| applicant_work_experiences | ApplicantWorkExperience | 26 | 26 | ✅ |
| applicant_work_experiences_applicant_id_lnk | ApplicantWorkExperienceLink | 4 | 4 | ✅ |
| applicant_trainings | ApplicantTraining | 18 | 18 | ✅ |
| applicant_trainings_applicant_id_lnk | ApplicantTrainingLink | 4 | 4 | ✅ |
| applicant_eligibilities | ApplicantEligibility | 14 | 14 | ✅ |
| applicant_eligibilities_applicant_lnk | ApplicantEligibilityLink | 4 | 4 | ✅ |
| applicant_awards | ApplicantAward | 19 | 19 | ✅ |
| applicant_awards_applicant_lnk | ApplicantAwardLink | 4 | 4 | ✅ |
| files | File | 23 | 23 | ✅ |

**All Prisma models match the production DB columns 1:1.** No schema drift. Notable type decisions in Prisma:
- `applicants.birthDate` is `String?` (NOT `DateTime?`) — matches the DB's `date` column which is actually stored as TEXT in the format "YYYY-MM-DD". ✓
- `applicant_educations.yearFrom` / `yearTo` are `String?` with comments "DO NOT change to DateTime" — matches production convention. ✓
- `applicant_awards.dateGranted` is `String?` — same rationale. ✓
- `applicants.mobileNumber` is `BigInt?` — matches `bigint` DB column. ✓ (But see C2 for the write-side issue.)
- `files.formats` and `files.providerMetadata` are `Unsupported("json")?` — Prisma can't write these via the normal client; raw SQL needed if you want to populate them. (Not blocking for C3 fix — leave them NULL.)

---

## 7. Production Data Observations

These are not bugs in the audited code, but inform the recommendations:

- **Orphan child rows already exist in production**: `applicant_educations` has 30 rows but only 26 link rows (4 orphans). `applicant_eligibilities` has 24 rows but only 22 link rows (2 orphans). This proves the link tables ARE load-bearing — auto-apply correctly writes them, so new rows won't be orphans. ✅
- **`mobile_number` storage**: only 2 of ~21 applicants have a non-null value. Format is integer (e.g. `9977583493` — 10 digits, no leading zero). New auto-apply writes should match this convention.
- **`files` table**: 60 existing rows from the original Strapi system. Format: `created_at` as ms-epoch integer (e.g. `1739331359553`), `size` in KB (e.g. `5.53`), `hash` as `<sanitized_name>_<random_hex>`, `url` as `/uploads/<hash>.<ext>`, `provider="local"`, `folder_path="/"`. New writes should match.
- **`eligibilities` master has duplicates**: "Career Service Professional" at id=7 AND id=8. `findFirst` returns an arbitrary one.
- **`applicant_educations.year_from` / `year_to`**: all existing rows have these as NULL; only `year_graduated` is populated. Confirms auto-apply's choice to not extract year_from/year_to matches production convention.
- **`applicant_trainings.number_hours` == `hour_decimal`** in all sampled rows. Confirms auto-apply's `hourDecimal: numberHours ?? 0` matches the existing convention.

---

## 8. Recommendations (Prioritized)

### P0 — Critical, fix before next prod use

1. **Fix the `source` field type mismatch** (C1). Either:
   - Change prompt templates in `src/lib/extraction.ts` lines 300, 301, 316, 318, 326 to use `"source": ""` instead of `0` / `false`, OR
   - Relax the auto-apply zod schema's `source` to `z.union([z.string(), z.number(), z.boolean(), z.null()]).optional()`, OR
   - Strip `source` from the auto-apply payload entirely (it's unused).
   The simplest robust fix is the third — drop `source` from the zod schema entirely since the auto-apply route never reads it.

2. **Sanitize `mobileNumber` before writing** (C2). Add a `toDigits()` helper in `src/app/api/applicant/profile/auto-apply/route.ts` and a `BIGINT_FIELDS` set, mirroring `TEXT_DATE_FIELDS`. Skip the field (rather than crash) if it can't be parsed to a valid integer.

3. **Wrap auto-apply in a transaction** (W3). Replace all `db.*.create()` / `db.*.update()` calls in the handler with `tx.*.create()` inside `await db.$transaction(async (tx) => { ... })`. This also bounds the partial-failure risk of C1/C2.

### P1 — High priority, fix soon

4. **Add deduplication** (W1). For each list type, define a composite key (e.g. education = `schoolName + yearGraduated + course`), query existing applicant-linked rows, skip inserts that match.

5. **Write uploaded files to the production `files` table** (C3). After the binary write in `POST /api/applicant/documents`, also insert a `files` row using the production conventions (ms-epoch `created_at`, KB `size`, `provider="local"`, `folder_path="/"`, `hash=<name>_<randhex>`). Persist the new `file.id` in the sidecar JSON so DELETE can clean it up. Optionally also update `applicants.pds_path` (etc.) based on category.

6. **Filter low-confidence values for personal info** (W2). Change `hasValue()` to also reject `confidence === "low"` for personal fields (keep accepting low for list entries, where the user reviews them inline). Or add a `__lowConfidence` flag.

### P2 — Medium priority, fix when convenient

7. **Make eligibility title lookup fuzzy** (W4). Use `mode: "insensitive"` + `contains`, or load all master rows and pick the closest Levenshtein match.

8. **Truncate `numberHours` to integer** (W5). Wrap with `Math.trunc()` before passing to Prisma.

9. **Track personal count explicitly** (W6). Don't rely on `Object.keys(...).length - 1`.

10. **Consolidate the three ExtractionResult type copies** (W7). Single source of truth in `src/lib/extraction.ts`.

### P3 — Documentation / awareness

11. Document that `birth_place` and `place_of_birth` are duplicate columns in the production DB (Strapi schema evolution artifact). Auto-apply writes `birth_place` only. No action needed.

12. Document that `eligibilities` master table has duplicate names. Consider deduplicating in a future data-migration (out of scope for this audit — schema must not change).

---

## 9. Audit Work Log (verification steps performed)

1. **Read context files**: worklog.md tail (last 200 lines), `/tmp/db-schema.txt` (full 1066 lines), `prisma/schema.prisma` (relevant models at lines 176-515, 1351-1400).
2. **Read all in-scope source files**:
   - `src/components/views/upload-pds-card.tsx` (517 lines, full)
   - `src/components/views/profile/documents-section.tsx` (432 lines, full)
   - `src/components/views/profile/extraction-review-dialog.tsx` (321 lines, full)
   - `src/components/views/profile/types.ts` (318 lines, full)
   - `src/app/api/applicant/documents/route.ts` (195 lines, full)
   - `src/app/api/applicant/documents/[id]/route.ts` (41 lines, full)
   - `src/app/api/applicant/documents/extract/route.ts` (120 lines, full)
   - `src/app/api/applicant/profile/auto-apply/route.ts` (411 lines, full)
   - `src/app/api/applicant/profile/route.ts` (lines 60-125, the PUT handler)
   - `src/app/api/applicant/educations/route.ts` (57 lines, for comparison)
   - `src/lib/extraction.ts` (521 lines, full)
   - `src/lib/applicant-data.ts` (428 lines, full)
   - `src/lib/file-types.ts` (64 lines, full)
   - `src/lib/api.ts` (75 lines, full)
   - `src/lib/validation.ts` (216 lines, full)
   - `src/lib/db.ts` (41 lines, full)
3. **Verified DB schema live** via `better-sqlite3` (readonly mode):
   - `PRAGMA table_info()` for all 12 target tables + `eligibilities` + `eligibilities_user_lnk`.
   - Confirmed every column name and type matches `/tmp/db-schema.txt`.
4. **Inspected production data patterns**:
   - 5 sample `applicants` rows (mobile_number as integer, birth_date as "YYYY-MM-DD" text).
   - Counted non-null mobile_number (2 of ~21) and birth_date (12 of ~21).
   - Link-table counts vs child-table counts: confirmed 4 education orphans + 2 eligibility orphans exist (proving link tables are load-bearing).
   - 3 sample `files` rows (ms-epoch created_at, KB size, hash format, url format, provider="local").
   - 5 sample `files_related_mph` rows (polymorphic relation format).
   - 6 sample `eligibilities` rows (confirmed duplicate names exist).
   - 5 sample `applicant_educations` rows (year_from/year_to all NULL; year_graduated populated).
   - 5 sample `applicant_trainings` rows (number_hours == hour_decimal).
   - 5 sample `applicant_awards` rows (date_granted as "YYYY-MM-DD", recognition_type defaults to "Award").
5. **Programmatic Prisma-vs-DB column diff** for all 12 tables — every column matched 1:1 (§6 table above).
6. **Live zod reproduction of C1**: extracted the auto-apply route's zod schema into a standalone Node script, fed it a simulated VLM response with `source: 0` for monthlySalary → confirmed `ZOD REJECTED` with `"Invalid input: expected string, received number"`.
7. **Confirmed `handleApi` wraps Prisma errors** into generic HTTP 500 (so C2's BigInt crash surfaces as a generic "unexpected error" to the user, with the real error only in server logs).
8. **Cross-referenced the worklog's prior test claims**: worklog says auto-apply was tested with realistic payloads and returned `applied:{personal:1,education:1,work:1,training:1,eligibility:0,awards:1}`. This means in those tests the VLM happened to return string `source` values. The C1 bug is non-deterministic and the prior tests did not exercise the failure mode.

---

## 10. Summary

The pipeline's **architecture is sound** (3-phase upload→extract→apply, link tables are written, personal-info overwrite-protection works, Prisma schema matches DB exactly). The pipeline's **implementation has three critical bugs** that can silently corrupt data or hard-crash on realistic VLM output:

- **C1** (zod vs. prompt `source` type) — non-deterministic, can reject the entire payload.
- **C2** (`mobile_number` BigInt crash) — deterministic, crashes on any formatted phone number.
- **C3** (`files` table not written) — known limitation, breaks Strapi integration and leaves `applicants.pds_path` etc. NULL.

Plus **7 warnings** covering no-dedup, low-confidence writes, non-transactional partial-failure, fragile eligibility lookup, INTEGER/float mismatch, off-by-one count, and type-copy drift.

**Recommended immediate action:** Apply the P0 fixes (C1, C2, transaction-wrap) before the next production use. The P0 fixes are localized (≤30 lines each in `auto-apply/route.ts` and `extraction.ts`) and require no schema change.
