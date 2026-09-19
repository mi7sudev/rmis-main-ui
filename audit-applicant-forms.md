# AUDIT REPORT — Applicant Profile Forms vs Production DB Schema

**Task ID:** AUDIT-APPLICANT-FORMS-1
**System:** RMIS — Recruitment Management & Information System (DOST-MIRDC)
**Stack:** Next.js 16 + Prisma 6.11.1 + SQLite (Strapi v5 production DB)
**Scope:** Personal Info, Education, Work Experience, Training, Eligibility, Awards, Extraction review
**DB verified:** `/home/z/my-project/db/production-data.db` (read-only)
**Source of truth for schema:** `/tmp/db-schema.txt` (95 tables, real production columns)

---

## 1. Executive Summary

**Overall status: ❌ NOT COMPATIBLE — must be fixed before swapping in the real production DB.**

The Prisma schema faithfully maps every production column (verified field-by-field for all in-scope tables). However, the **form ↔ API ↔ DB round-trip is broken in 5 critical ways** that will cause HTTP 500 errors, silent data loss, or HTTP 400 validation failures in normal applicant usage.

| Severity | Count | Examples |
|---|---|---|
| ❌ Critical (production-breaking) | **5** | `mobileNumber` BigInt JSON-serialization crash, `isPWD`↔`isPwd` key mismatch, Zod `.datetime()` rejecting HTML `<input type="date">` values across 4 forms |
| ⚠️ Warning (fragile / data-quality) | **9** | BigInt phone loses leading `0`/`+`, eligibility title invisible for existing prod data, missing link-table writes, enum-set drift |
| 🕳️ Missing form fields (DB column has no UI) | **30+** | nickname, height, weight, blood_type, all govt-ID fields, all permanent-address fields, supervisor_name/office/reason_for_leaving, specify_training, award_type, recognition_subcategory, etc. |
| ✅ Prisma schema vs DB schema | **100% match** | Every column in `applicants`, `applicant_educations`, `applicant_work_experiences`, `applicant_trainings`, `applicant_eligibilities`, `applicant_awards` is mapped 1:1 via `@map`/`@@map`. |

### Top 5 critical issues (must-fix before swap)

1. **`mobileNumber` BigInt crashes JSON response** — Any applicant whose `mobile_number` column is non-null (today: applicants #369 and #555 — Aldwin Jara) causes `GET /api/applicant/profile` to throw `TypeError: Do not know how to serialize a BigInt` because `NextResponse.json` calls `JSON.stringify`. The `handleApi` wrapper converts this to an HTTP 500 and the user is permanently locked out of the Profile page. Saving a mobile number from the form also crashes the PUT response for the same reason.
2. **`isPWD` (frontend) vs `isPwd` (Prisma/DB)** — The form state key, the Profile type, and the API request body all use `isPWD` (capital D). The Prisma field and the API whitelist use `isPwd` (lowercase d, matching DB column `is_pwd`). The whitelist guard `if (k in data)` fails for `isPwd` because the data has `isPWD`. PWD status is **never saved** and **never loaded** (the GET response uses Prisma's `isPwd` key, but the form reads `profileData.isPWD` which is `undefined`, so it always defaults to `false`).
3. **Zod `.datetime()` rejects HTML `<input type="date">` values** — `z.string().datetime()` (used in `educationSchema.yearFrom/yearTo`, `workExperienceSchema.inclusiveDateFrom/To`, `trainingSchema.inclusiveDateFrom/To`, `eligibilitySchema.examDate/licenseValidity`, `awardSchema.dateGranted`, and the inline `eligibilityInputSchema` in the eligibilities route) only accepts strings matching `YYYY-MM-DDTHH:mm:ss[.sss]Z` (UTC mandatory, no offsets). HTML date inputs produce `"2025-12-31"`, which fails validation with `"Invalid ISO datetime"`. Verified empirically. Every date the applicant enters in Work, Training, Eligibility, or Awards forms returns HTTP 400 `"Invalid input"`.
4. **`mobile_number` (bigint) silently corrupts phone numbers** — The form accepts free-text `"09XXXXXXXXX"` or `"+63…"`. Prisma coerces these to BigInt (`9XXXXXXXXX` or `63…`), dropping leading `0` and `+`. Verified by writing `"09123456789"` to the DB and reading back `9123456789n`. Non-numeric strings throw a Prisma error → HTTP 500.
5. **Existing production eligibility titles are invisible** — Production stores the eligibility-title link in `specific_eligibilities_applicant_eligibility_lnk` (12 rows). The loader (`loadApplicantEligibilities`) and the form/API only read/write `applicant_eligibilities_eligibility_category_lnk` (0 rows in production). Existing eligibility entries loaded from the production DB show `eligibilityTitle: null` in the UI — every existing eligibility appears with a blank title.

---

## 2. Per-Section Findings

Legend: ✅ compatible · ⚠️ fragile · ❌ broken

### A) Personal Info — `applicants` table

Form: `src/components/views/profile/personal-info-section.tsx`
Hook: `src/components/views/profile/use-profile-data.ts` (savePersonal, lines 148-196)
API: `src/app/api/applicant/profile/route.ts` (GET, PUT)
Auto-apply: `src/app/api/applicant/profile/auto-apply/route.ts`

| Form field (form key) | DB column | DB type | Prisma field | Status |
|---|---|---|---|---|
| firstName | first_name | varchar(255) | firstName | ✅ |
| middleName | middle_name | varchar(255) | middleName | ✅ |
| lastName | last_name | varchar(255) | lastName | ✅ |
| extensionName | extension_name | varchar(255) | extensionName | ✅ |
| emailAddress | email_address | varchar(255) | emailAddress | ✅ |
| mobileNumber | mobile_number | **bigint** | mobileNumber: BigInt? | ❌ see #1, #4 below |
| contactNumber | contact_number | varchar(255) | contactNumber | ✅ |
| birthDate | birth_date | date (TEXT) | birthDate: String? | ✅ form sends "YYYY-MM-DD", API keeps as string |
| birthPlace | birth_place | TEXT | birthPlace | ✅ |
| gender | gender | varchar(255) | gender | ✅ "Male"/"Female" match production distinct values |
| civilStatus | civil_status | varchar(255) | civilStatus | ✅ Single/Married/Widowed/Separated/Divorced all acceptable (production has only Single/Married today) |
| citizenship | citizenship | varchar(255) | citizenship | ✅ |
| religion | religion | varchar(255) | religion | ✅ |
| **isPWD** (uppercase D) | is_pwd | boolean | **isPwd** (lowercase d) | ❌ see #2 below — key mismatch breaks both load and save |
| ethnicity | ethnicity | varchar(255) | ethnicity | ✅ |
| presentAddress | present_address | varchar(255) | presentAddress | ✅ |
| city | city | varchar(255) | city | ✅ |
| province | province | varchar(255) | province | ✅ |
| country | country | varchar(255) | country | ✅ |
| zipCode | zip_code | TEXT | zipCode | ✅ |
| adminCase | admin_case | boolean | adminCase | ✅ |
| adminCaseDetails | admin_case_details | varchar(255) | adminCaseDetails | ✅ |
| crimeCharge | crime_charge | boolean | crimeCharge | ✅ |
| crimeDate | crime_date | date (TEXT) | crimeDate: String? | ✅ form sends "YYYY-MM-DD", API keeps as string |
| crimeCaseStatus | crime_case_status | varchar(255) | crimeCaseStatus | ✅ |
| characterReferences (JSON string) | character_reference | json | characterReference: Unsupported("json")? | ⚠️ see #6 below — written via raw SQL, no schema validation on inner shape |

#### Critical issues for Personal Info

1. **❌ `mobileNumber` BigInt JSON-serialization crash.**
   - File: `src/app/api/applicant/profile/route.ts` line 49 (GET) and line 124 (PUT).
   - Cause: `NextResponse.json({...applicant, ...})` calls `JSON.stringify`. BigInt values throw `TypeError: Do not know how to serialize a BigInt`. Verified by direct test.
   - Impact today: applicants #369 and #555 (Aldwin Jara) cannot load their profile page. After any user saves a mobile number, they cannot reload their profile (permanent lockout, HTTP 500).
   - Fix: Convert `mobileNumber` to a string before responding. Either:
     - Add `BigInt.prototype.toJSON = function() { return this.toString() }` polyfill in `src/lib/db.ts` (global, simplest), OR
     - In the GET/PUT handlers, return `mobileNumber: applicant.mobileNumber?.toString() ?? null` explicitly, OR
     - Change the Prisma field type from `BigInt?` to `String?` (NOT RECOMMENDED — would alter schema, breaks the `bigint` SQLite affinity).

2. **❌ `isPWD` ↔ `isPwd` key mismatch.**
   - Files: `src/components/views/profile/types.ts` line 80 (`isPWD: boolean`); `src/components/views/profile/use-profile-data.ts` line 88 (`isPWD: profileData.isPWD ?? false`) and line 165 (`isPWD: !!personalForm.isPWD`); `src/components/views/profile/personal-info-section.tsx` lines 217, 219 (`form.isPWD`, `onChange("isPWD", ...)`); `src/app/api/applicant/profile/route.ts` line 79 (whitelist contains `"isPwd"` lowercase).
   - Cause: The DB column is `is_pwd` (snake_case); Prisma generates `isPwd` (camelCase). The form author used `isPWD` (treating PWD as an acronym). The API whitelist iterates `isPwd` and checks `if (k in data)` — but `data` contains `isPWD`, so the check fails and the field is silently dropped from the update. On load, the API response uses Prisma's `isPwd` key, but the Profile type expects `isPWD`, so `profileData.isPWD` is `undefined` and the form initializes to `false`.
   - Impact: PWD status is **never persisted** and **never loaded**. For a government system, this is a regulatory/data-integrity failure (PWD applicants get no PWD benefits tracking).
   - Fix: Standardize on `isPwd` (matching Prisma/DB). Change `src/components/views/profile/types.ts` line 80, `src/components/views/profile/use-profile-data.ts` lines 88 & 165, `src/components/views/profile/personal-info-section.tsx` lines 217 & 219 to use `isPwd` everywhere.

3. **❌ `mobile_number` BigInt loses leading `0` and `+`.**
   - File: `src/components/views/profile/use-profile-data.ts` line 157 (`mobileNumber: personalForm.mobileNumber || null` — sends string); `src/app/api/applicant/profile/route.ts` lines 95-101 (passes string through to Prisma); auto-apply route line 178 (passes VLM-extracted string through).
   - Cause: DB column type is `bigint` (SQLite INTEGER affinity). Prisma converts strings via `BigInt(...)` which silently drops leading zeros and the `+` prefix. Verified: `"09123456789"` → `9123456789n`; `"+639171234567"` → `639171234567n`; `"not-a-number"` → Prisma error `invalid digit found in string` (HTTP 500).
   - Impact: PDS mobile numbers in the Philippines universally start with `0` (e.g., `0917XXX`). Storing as BigInt loses the `0`. This also makes the stored value inconsistent with `contact_number` (varchar) which preserves the `0`.
   - Fix (lowest-risk): In the PUT route, coerce `mobileNumber` to `BigInt` server-side after stripping non-digits: `if (typeof v === "string" && k === "mobileNumber") v = v.replace(/[^0-9]/g, "") || null;` — but this STILL loses leading zero. **Better:** propose treating the column as TEXT in Prisma (`mobileNumber String? @map("mobile_number")`) — Prisma will still read/write the SQLite INTEGER column as a string. (This requires no DB migration; SQLite type affinity allows it.) **Or:** store the full E.164 string in `contact_number` (already TEXT) and stop writing `mobile_number` from the form.
   - Recommended immediate fix: Document the limitation, store the digit-only value in `mobile_number` (BigInt) AND store the human-readable `"0917XXX"` in `contact_number` (TEXT) — which is what production already does (see applicant 369: `mobile_number=9977583493`, `contact_number="09977583493"`).

#### Warnings for Personal Info

4. **⚠️ Form lacks PDS fields the production DB stores.** The DB has 30+ optional personal columns the form does not collect (nickname, telephone_number, contact_number_secondary, height, weight, blood_type, naturalized, publication, pagibig, gsis, philhealth, tin, sss, govt_issued_id, govt_id_issued_number, govt_id_issued_place, govt_id_date_issued, govt_id_valid_until, house_number, street, subdivision, barangay, permanent_house_number, permanent_street, permanent_subdivision, permanent_barangay, permanent_city, permanent_province, permanent_country, permanent_telephone_number, permanent_zip_code, place_of_birth, respondent_to, specify_referral, pending_cases). The API whitelist (route.ts lines 74-91) correctly allows these, so the form could send them — but no UI exists. None are NOT NULL, so no DB errors. Recommend: add a "Complete PDS" expandable section for full PDS data.

5. **⚠️ `birth_place` vs `place_of_birth` — production has both, form uses only `birth_place`.**
   - DB has `birth_place TEXT` AND `place_of_birth TEXT`. Production data: 12 rows have `birth_place`, 2 rows have `place_of_birth` (1 row has both). The form populates only `birth_place`. Strapi likely renamed the column at some point and kept both. Prisma models both.
   - Recommendation: Acceptable as-is (form uses the more-populated column). Document the duplicate.

6. **⚠️ `character_reference` JSON written via raw SQL with no inner-shape validation.**
   - File: `src/app/api/applicant/profile/route.ts` lines 106-110.
   - The form serializes the `CharacterReference[]` array via `JSON.stringify` and sends it as a string. The API re-stringifies and writes via `db.$executeRaw`. The DB column is `json` (SQLite). Prisma cannot read it back as a typed field, so the GET route uses `getApplicantCharacterReference` (raw-json helper) and `JSON.parse`.
   - Risk: any malformed JSON sent by a buggy client will be stored as-is and crash the GET route's `JSON.parse` (which is wrapped in try/catch — line 42-46 — so it degrades gracefully to `null`).
   - Production data verified: the format matches (array of `{name, title, company, companyAddress, email, contact}` objects). ✅ compatible.

---

### B) Education — `applicant_educations` + `courses` + `courses_applicant_education_lnk`

Form: `src/components/views/profile/education-section.tsx`
API: `src/app/api/applicant/educations/route.ts`, `[id]/route.ts`
API validation: `src/lib/validation.ts` → `educationSchema`

| Form field | DB column | DB type | Prisma field | Status |
|---|---|---|---|---|
| educationLevel | education_level | TEXT | educationLevel | ⚠️ form option "Vocational/Trade Course" not in production distinct values (Elementary/College/Post-Graduate/High School) — would introduce a new value, breaking filters |
| course (label "Course / Degree") | course | TEXT | course | ✅ free-text; production has values like "Bachelor of Science in Information Technology" |
| (none — `degree` not in form) | degree | TEXT | degree | 🕳️ Missing form field. DB column exists; form's `course` field is labeled "Course / Degree" but only writes `course`. The API does write `degree: d.degree || null` (line 35), but the form never sends `degree`. |
| schoolName | school_name | TEXT | schoolName | ✅ |
| yearGraduated | year_graduated | TEXT | yearGraduated | ✅ form sends free-text year like "2023"; production has "2006", "2014", "2020" — match |
| unitsEarned | units_earned | TEXT | unitsEarned | ✅ |
| awards | awards | TEXT | awards | ✅ |
| (none) | specify_others | TEXT | specifyOthers | 🕳️ Missing form field. API writes it (line 37) but form doesn't send. |
| (none) | ongoing | boolean | ongoing | 🕳️ Missing form field. API defaults to `false` (line 39). |
| (none) | is_highest_education | boolean | isHighestEducation | 🕳️ Missing form field. API defaults to `false` (line 40). |
| (none) | highest_level | TEXT | highestLevel | 🕳️ Missing form field. |
| (none) | year_from | date | yearFrom | 🕳️ Missing form field. Production has 0 non-null rows (unused). Zod schema declares `z.string().datetime()` for it — would fail validation if anyone tried to send an HTML date. |
| (none) | year_to | date | yearTo | 🕳️ Missing form field. Same as yearFrom. |
| (none) | hrRemarks | TEXT | hrRemarks | 🕳️ Missing form field (admin/HR only). API writes it. |

#### Critical issues for Education

None — the education form round-trips correctly for the fields it covers.

#### Warnings for Education

7. **⚠️ Link table `courses_applicant_education_lnk` is NOT written by the API.**
   - File: `src/app/api/applicant/educations/route.ts` lines 32-54.
   - Production data: 12 rows in `courses_applicant_education_lnk` linking educations to the `courses` reference table (488 rows). Production uses this link to power course-category analytics.
   - Form: free-text `course` field (no dropdown), so no `courseId` to link.
   - API: only writes `applicant_educations_applicant_id_lnk` (the applicant→education link), never the course link.
   - Impact: form-created education records cannot be filtered/grouped by reference course. Existing production records DO have the link (so they'll show alongside new records but the new ones won't be in the same join).
   - Recommendation: Add an optional course dropdown (populated from `/api/reference` → `courses`) to the form. When `courseId` is provided, write to `courses_applicant_education_lnk` after creating the education.

8. **⚠️ `education_level` enum drift — form adds "Vocational/Trade Course" not seen in production.**
   - File: `src/components/views/profile/education-section.tsx` line 188.
   - Production distinct values: Elementary, College, Post-Graduate, High School. Form adds "Vocational/Trade Course". This will create a new value not in existing reports/dashboards.
   - Recommendation: Either drop the option, or confirm with HR that Vocational is a valid new level.

---

### C) Work Experience — `applicant_work_experiences`

Form: `src/components/views/profile/work-experience-section.tsx`
API: `src/app/api/applicant/work-experiences/route.ts`, `[id]/route.ts`
API validation: `src/lib/validation.ts` → `workExperienceSchema`

| Form field | DB column | DB type | Prisma field | Status |
|---|---|---|---|---|
| positionTitle | position_title | TEXT | positionTitle | ✅ |
| employerName | employer_name | TEXT | employerName | ✅ |
| employerAddress | employer_address | TEXT | employerAddress | ✅ |
| inclusiveDateFrom | inclusive_date_from | datetime (epoch ms) | inclusiveDateFrom: DateTime? | ❌ Zod `.datetime()` rejects HTML date "2025-12-31" → HTTP 400 |
| inclusiveDateTo | inclusive_date_to | datetime (epoch ms) | inclusiveDateTo: DateTime? | ❌ same as above |
| isPresentWork | is_present_work | boolean | isPresentWork | ✅ form sends "Yes"/"No" → API converts to boolean |
| statusOfEmployment | status_of_employment | TEXT | statusOfEmployment | ⚠️ form has 6 options, production has 2 (Contract of Service, Regular). New values will be created. |
| monthlySalary | monthly_salary | float | monthlySalary: Float? | ✅ form sends Number(...) → API accepts number |
| isGovtService | is_govt_service | boolean | isGovtService | ✅ |
| actualDuties | actual_duties | TEXT | actualDuties | ✅ |
| (none) | supervisor_name | varchar(255) | supervisorName | 🕳️ Missing form field. API writes it (line 62) but form doesn't send. PDS requires this field. |
| (none) | supervisor_position | TEXT | supervisorPosition | 🕳️ Missing form field. |
| (none) | office | TEXT | office | 🕳️ Missing form field. |
| (none) | reason_for_leaving | TEXT | reasonForLeaving | 🕳️ Missing form field. |
| (none) | accomplishment | TEXT | accomplishment | 🕳️ Missing form field. |
| (none) | hrRemarks | TEXT | hrRemarks | 🕳️ Missing form field (admin/HR only). |
| (computed by API) | year_decimal | float | yearDecimal | ✅ API computes from inclusiveDateFrom/To (line 51) |

#### Critical issues for Work Experience

9. **❌ Zod `.datetime()` rejects HTML date inputs for `inclusiveDateFrom`/`inclusiveDateTo`.**
   - File: `src/lib/validation.ts` lines 53-54 (`inclusiveDateFrom: z.string().datetime().optional().nullable()`).
   - Cause: HTML `<input type="date">` produces `"2025-12-31"` (date-only). `z.string().datetime()` requires `YYYY-MM-DDTHH:mm:ss[.sss]Z` (UTC mandatory, no offsets accepted in Zod 4). Verified: `z.string().datetime().safeParse("2025-12-31")` returns `{success: false, ...}`.
   - Impact: every Work Experience submission with a date entered returns HTTP 400 `"Invalid input"` with the Zod error details. The applicant cannot save any work experience entry with a date.
   - Fix: Change the Zod schema to accept HTML date strings:
     ```ts
     inclusiveDateFrom: z.union([z.string().datetime(), z.string().date()]).optional().nullable(),
     inclusiveDateTo:   z.union([z.string().datetime(), z.string().date()]).optional().nullable(),
     ```
     Or use `z.coerce.date().optional().nullable()` and let Prisma accept Date objects. Or convert the form's date strings to ISO datetime on the client before sending.

#### Warnings for Work Experience

10. **⚠️ `status_of_employment` enum drift.** Form has 6 options (Regular, Temporary, Contract of Service, Contractual, Job Order, Government Internship Program); production has 2 (Regular, Contract of Service). New values will be created. Recommendation: align with CSC-recognized employment types or confirm with HR.

11. **⚠️ Missing PDS work-experience fields.** `supervisor_name`, `supervisor_position`, `office`, `reason_for_leaving`, `accomplishment` are all part of CSC Form 212's work-experience section. The DB columns exist and the API accepts them, but the form has no UI. Recommend adding these fields to the work-experience dialog.

---

### D) Training — `applicant_trainings`

Form: `src/components/views/profile/training-section.tsx`
API: `src/app/api/applicant/trainings/route.ts`, `[id]/route.ts`
API validation: `src/lib/validation.ts` → `trainingSchema`

| Form field | DB column | DB type | Prisma field | Status |
|---|---|---|---|---|
| titleOfTraining | title_of_training | TEXT | titleOfTraining | ✅ |
| typeOfTraining | type_of_training | TEXT | typeOfTraining | ⚠️ form has 4 options (Technical, Managerial/Supervisory, Orientation, Other); production has 2 (Technical, Managerial/Supervisory). New values will be created. |
| inclusiveDateFrom | inclusive_date_from | datetime (epoch ms) | inclusiveDateFrom: DateTime? | ❌ Zod `.datetime()` rejects HTML date — HTTP 400 |
| inclusiveDateTo | inclusive_date_to | datetime (epoch ms) | inclusiveDateTo: DateTime? | ❌ same |
| numberHours | number_hours | INTEGER | numberHours: Int? | ✅ form sends Number(...) → API accepts |
| (none) | is_present_work | boolean | isPresentWork | 🕳️ Missing form field. API defaults to `false` (line 38). |
| (none) | is_govt_service | boolean | isGovtService | 🕳️ Missing form field. API defaults to `false` (line 39). |
| (none) | specify_training | TEXT | specifyTraining | 🕳️ Missing form field. API writes it (line 41) but form doesn't send. |
| (none) | hrRemarks | TEXT | hrRemarks | 🕳️ Missing form field (admin/HR only). |
| (computed by API) | hour_decimal | float | hourDecimal | ✅ API defaults to `numberHours` value (line 43) |

#### Critical issues for Training

12. **❌ Zod `.datetime()` rejects HTML date inputs for `inclusiveDateFrom`/`inclusiveDateTo`.**
    - File: `src/lib/validation.ts` lines 66-67.
    - Same root cause and impact as Work Experience issue #9.
    - Fix: Same as #9.

#### Warnings for Training

13. **⚠️ `type_of_training` enum drift.** Form has 4 options; production has 2. Recommendation: align.

14. **⚠️ Missing `is_present_work` and `is_govt_service` form fields.** These are PDS-required boolean flags. The DB has the columns; the API accepts them with `false` defaults. The work-experience form HAS these fields, but the training form does not. Inconsistent UX.

---

### E) Eligibility — `applicant_eligibilities` + `eligibilities` + `specific_eligibilities` + 3 link tables

Form: `src/components/views/profile/eligibility-section.tsx`
API: `src/app/api/applicant/eligibilities/route.ts` (custom inline `eligibilityInputSchema`), `[id]/route.ts`

| Form field | DB column | DB type | Prisma field | Status |
|---|---|---|---|---|
| eligibilityTitle | (no column) — derived from linked `eligibilities.name` | — | (computed) | ❌ see #15 below — broken for existing production data |
| (none) | (linked via `applicant_eligibilities_eligibility_category_lnk`) | link table | (no DB column) | ❌ production uses `specific_eligibilities_applicant_eligibility_lnk` instead — see #15 |
| rating | rating | TEXT | rating | ✅ |
| examDate | exam_date | datetime (epoch ms) | examDate: DateTime? | ❌ Zod `.datetime()` rejects HTML date — HTTP 400 |
| examPlace | exam_place | TEXT | examPlace | ✅ |
| licenseNumber | license_number | TEXT | licenseNumber | ✅ |
| licenseValidity | license_validity | datetime (epoch ms) | licenseValidity: DateTime? | ❌ Zod `.datetime()` rejects HTML date — HTTP 400 |
| (none) | hrRemarks | TEXT | hrRemarks | 🕳️ Missing form field (admin/HR only). |

#### Critical issues for Eligibility

15. **❌ Existing production eligibility entries show blank titles.**
    - Files: `src/lib/applicant-data.ts` lines 62-101 (`loadApplicantEligibilities`); `src/app/api/applicant/eligibilities/route.ts` lines 68-78 (linking logic).
    - Cause: Production stores the eligibility-title link in `specific_eligibilities_applicant_eligibility_lnk` (verified: 12+ rows). The loader queries only `applicant_eligibilities_eligibility_category_lnk` (verified: 0 rows). The loader sets `eligibilityTitle = catById.get(catId) ?? null` — but `catId` is `null` for all production rows because their links are in the other table. So every existing eligibility returns `eligibilityTitle: null`.
    - Impact: applicants who already have eligibility records (from the old Strapi system) see blank titles for all of them in the Profile UI.
    - Fix: Update `loadApplicantEligibilities` to ALSO query `specific_eligibilities_applicant_eligibility_lnk` + `specific_eligibilities` (the production link path) and merge the title. Specifically, after the existing category-link lookup, query `db.specificEligibilityApplicantEligibilityLink.findMany({ where: { applicantEligibilityId: { in: ids } } })` + `db.specificEligibility.findMany(...)` and fall back to that title when the category-link title is null.

16. **❌ Zod `.datetime()` rejects HTML date inputs for `examDate`/`licenseValidity`.**
    - File: `src/app/api/applicant/eligibilities/route.ts` lines 23-24 (inline `eligibilityInputSchema`).
    - Same root cause and impact as #9.
    - Fix: Same as #9. Also: the inline schema duplicates `eligibilitySchema` from `validation.ts` — consolidate.

17. **❌ Form never sends `eligibilityId` — title-link is fragile name-based lookup.**
    - File: `src/components/views/profile/eligibility-section.tsx` lines 90-97 (submit payload — only `eligibilityTitle`); API `src/app/api/applicant/eligibilities/route.ts` lines 71-78.
    - Cause: The form's dropdown sends the eligibility NAME as `eligibilityTitle`, not the eligibility ID. The API tries `db.eligibility.findFirst({ where: { name: d.eligibilityTitle } })` to find the matching row — but `eligibilities.name` has duplicates (verified: "Career Service Professional" exists as id=7 AND id=8; "None Required" exists as id=1 AND id=9). `findFirst` returns whichever row Prisma picks first, which may not match the user's intent.
    - Impact: Form submissions create category links to arbitrary duplicate `eligibilities` rows. Also, if the user types a custom title that doesn't match any row, NO link is created and the title is silently lost (the response returns `d.eligibilityTitle ?? null`, but nothing is persisted).
    - Fix: Add `eligibilityId` to the form payload (send the selected dropdown's `id`). Use `eligibilityId` directly for the category link; only fall back to name lookup if `eligibilityId` is missing.

#### Warnings for Eligibility

18. **⚠️ Form doesn't write to `specific_eligibilities_applicant_eligibility_lnk`.**
    - Same root cause as #15 but in the write direction. New eligibility records created by the form link via the wrong (empty) link table. New records will show their title correctly (because the loader reads `eligibilities.name` from `applicant_eligibilities_eligibility_category_lnk`), but they will be inconsistent with existing production data which uses `specific_eligibilities`.
    - Recommendation: Either (a) write to BOTH link tables (compatibility with both old and new data), or (b) decide on one canonical link table and migrate production data to it (NOT RECOMMENDED — DB is read-only).

---

### F) Awards — `applicant_awards` (+ `applicant_accomplishments` unused)

Form: `src/components/views/profile/awards-section.tsx`
API: `src/app/api/applicant/awards/route.ts`, `[id]/route.ts`
API validation: `src/lib/validation.ts` → `awardSchema`

| Form field | DB column | DB type | Prisma field | Status |
|---|---|---|---|---|
| recognitionType | recognition_type | varchar(255) | recognitionType | ✅ "Award"/"Accomplishment" match production distinct values |
| recognitionDetails | recognition_details | varchar(255) | recognitionDetails | ✅ |
| recognitionScope | recognition_scope | varchar(255) | recognitionScope | ⚠️ form shows "Individual/Group" for Award, "Local/Foreign/International" for Accomplishment. Production: Award→Individual (6 rows), Accomplishment→International (2 rows). The form's "Group" option for Award is not in production. |
| recognitionCategory | recognition_category | varchar(255) | recognitionCategory | ✅ free-text; production has "Model Employee", "Other awards", "Publication/papers" |
| recognitionProvider | recognition_provider | varchar(255) | recognitionProvider | ✅ |
| dateGranted | date_granted | date (TEXT "YYYY-MM-DD") | dateGranted: String? | ❌ Zod `.datetime()` rejects HTML date "2025-09-15" — HTTP 400 (validation.ts line 90). Even though the API stores it as TEXT, the validation step fails first. |
| (none) | award_type | varchar(255) | awardType | 🕳️ Missing form field. Production value: "Internal". API writes `awardType: d.awardType || null` (line 40) but form never sends it. |
| (none) | recognition_subcategory | varchar(255) | recognitionSubcategory | 🕳️ Missing form field. Production value: "Multi-authorship 3rd or more". API writes it (line 43) but form doesn't send. |
| (none) | points | INTEGER | points | 🕳️ Missing form field (admin/HR sets points). Production values: 10, 20. API defaults to `0` (line 46). |
| (none) | number | INTEGER | number | 🕳️ Missing form field. Production: null. |
| (none) | hrRemarks | TEXT | hrRemarks | 🕳️ Missing form field (admin/HR only). |

#### Critical issues for Awards

19. **❌ Zod `.datetime()` rejects HTML date input for `dateGranted`.**
    - File: `src/lib/validation.ts` line 90 (`dateGranted: z.string().datetime().optional().nullable()`).
    - Note: The DB column is TEXT (production stores `"2025-09-15"`). The API keeps it as a string (`dateGranted: d.dateGranted || null`, line 48). The Prisma schema correctly models it as `String?`. So this is a Zod-schema-only bug — the underlying storage is fine.
    - Same root cause as #9, #12, #16.
    - Fix: Change Zod to `z.union([z.string().datetime(), z.string().date()]).optional().nullable()` or simply `z.string().max(20).optional().nullable()`.

#### Warnings for Awards

20. **⚠️ `applicant_accomplishments` table is unused by the form.**
    - The form treats "Award" and "Accomplishment" as two values of `recognition_type` in `applicant_awards` (which is consistent with how production stores them — production has 8 rows in `applicant_awards` with `recognition_type IN ('Award','Accomplishment')`).
    - The DB also has a separate `applicant_accomplishments` table (2 orphan rows, no applicant links) with different columns (`title`, `category`, `type`, `points`, `hr_remarks`, `date_granted`). This table is unused by the form/API.
    - Recommendation: Document that `applicant_accomplishments` is a legacy Strapi table not used by the new system. Do NOT write to it.

21. **⚠️ Form missing `award_type` field.** Production has `award_type='Internal'` on awards. The form has `recognitionScope='Individual'` for the same row. These are distinct concepts (Internal = within MIRDC vs External; Individual = solo vs Group). The form should have a separate `awardType` dropdown.

---

### G) Extraction review — `extraction-review-dialog.tsx` + `upload-pds-card.tsx`

Components: `src/components/views/profile/extraction-review-dialog.tsx`, `src/components/views/upload-pds-card.tsx`
Backend: `src/app/api/applicant/profile/auto-apply/route.ts`, `src/lib/extraction.ts`

#### Verification: field keys in extraction result vs DB columns the auto-apply writes to

The extraction result has 6 sections (`personalInfo`, `educations`, `workExperiences`, `trainings`, `eligibilities`, `awards`). Each is an array (or object for personalInfo) of `{ value, confidence, source }` records keyed by field name. The auto-apply route (`auto-apply/route.ts`) maps these to Prisma fields via:

- `PERSONAL_FIELD_MAP` (lines 108-127) — 18 keys, all match `ExtractedPersonalInfo` type from `extraction.ts` lines 33-52. ✅
- Education: writes `educationLevel, degree, course, schoolName, unitsEarned, yearGraduated, awards` (lines 210-221). All exist as DB columns. ✅
- Work Experience: writes `positionTitle, employerName, employerAddress, inclusiveDateFrom, inclusiveDateTo, statusOfEmployment, monthlySalary, isGovtService, actualDuties, isPresentWork, yearDecimal` (lines 260-275). All exist. ✅
- Training: writes `titleOfTraining, typeOfTraining, inclusiveDateFrom, inclusiveDateTo, numberHours, hourDecimal` (lines 297-307). All exist. ✅
- Eligibility: writes `rating, examPlace, licenseNumber, examDate, licenseValidity` (lines 332-341) + links to `eligibilities` table by name lookup. All exist. ✅
- Awards: writes `recognitionType, recognitionDetails, recognitionScope, recognitionCategory, recognitionProvider, dateGranted` (lines 380-390). All exist. ✅

#### Critical issues for Extraction review

22. **❌ Auto-apply inherits the `mobileNumber` BigInt issue.**
    - File: `src/app/api/applicant/profile/auto-apply/route.ts` lines 161-188.
    - When the VLM extracts a `mobileNumber` string like `"09171234567"`, the auto-apply route passes it through as `personalUpdate.mobileNumber = "09171234567"`. Prisma coerces to BigInt `9171234567n` (loses leading zero) and stores it. The next GET /api/applicant/profile call will then crash on JSON serialization (issue #1).
    - Fix: same as #1 and #3.

23. **❌ Auto-apply inherits the eligibility-link issue.**
    - File: `src/app/api/applicant/profile/auto-apply/route.ts` lines 345-353.
    - Same as #15 and #17 — links via `applicant_eligibilities_eligibility_category_lnk` (empty in production) by name lookup, never via `specific_eligibilities_applicant_eligibility_lnk`.

#### Warnings for Extraction review

24. **⚠️ Extraction field keys are not validated against the DB.**
    - The Zod schema in `auto-apply/route.ts` (lines 37-50) uses `z.record(z.string(), extractedFieldSchema)` — accepts ANY string keys. If the VLM returns a key like `mobileNumber` (correct) or `mobile_number` (incorrect, snake_case), the auto-apply's `PERSONAL_FIELD_MAP` lookup silently ignores unknown keys.
    - Recommendation: log unknown keys for debugging.

25. **⚠️ `EXTRACTABLE_PERSONAL` doesn't include `isPwd`, `adminCase`, `crimeCharge`, `crimeDate`, `characterReferences`.**
    - File: `src/components/views/profile/types.ts` lines 292-311.
    - These legal-declaration fields are not in the extraction map, so the VLM cannot auto-fill them. This is intentional (legal declarations should be entered manually by the applicant, not auto-extracted from documents). ✅ Acceptable.

---

## 3. Critical Issues Summary (❌ — must-fix before production swap)

| # | Issue | Files | One-line fix |
|---|---|---|---|
| 1 | `mobileNumber` BigInt crashes `NextResponse.json` | `src/app/api/applicant/profile/route.ts` (GET line 49, PUT line 124) | Add `BigInt.prototype.toJSON` polyfill OR explicitly convert `mobileNumber` to string in response |
| 2 | `isPWD` (form) vs `isPwd` (Prisma/DB) — never saved/loaded | `types.ts:80`, `use-profile-data.ts:88,165`, `personal-info-section.tsx:217,219` | Rename `isPWD` → `isPwd` everywhere in the form/types/hook |
| 3 | `mobile_number` (bigint) loses leading `0` and `+` | `use-profile-data.ts:157`, `route.ts:95-101`, `auto-apply/route.ts:178` | Store digit-only string in `mobile_number` AND preserve full format in `contact_number` (matches production pattern) |
| 4 | Zod `.datetime()` rejects HTML `<input type="date">` values | `validation.ts:34,35,53,54,66,67,76,77,90`; `eligibilities/route.ts:23,24` | Change to `z.union([z.string().datetime(), z.string().date()]).optional().nullable()` |
| 5 | Existing production eligibility titles invisible | `src/lib/applicant-data.ts:62-101` | Also query `specific_eligibilities_applicant_eligibility_lnk` + `specific_eligibilities` table |
| (also) | Auto-apply inherits #1, #3 | `src/app/api/applicant/profile/auto-apply/route.ts:161-188, 345-353` | Same fixes as #1, #3, #5 |

Additional ❌ found per-section:
- #15 = same as #5
- #9, #12, #16, #19 = same as #4 (Zod datetime)
- #17 = eligibility title-link fragility (send `eligibilityId` from form)

---

## 4. Warnings Summary (⚠️ — work now but fragile)

| # | Issue | Risk |
|---|---|---|
| 6 | `character_reference` JSON written via raw SQL with no inner-shape validation | Malformed JSON degrades to null (acceptable) |
| 7 | `courses_applicant_education_lnk` link table not written by education API | New educations can't be filtered by reference course |
| 8 | `education_level` enum has "Vocational/Trade Course" not in production | New value breaks existing filters |
| 10 | `status_of_employment` enum has 6 options, production has 2 | New values created |
| 11 | Work-exp form missing `supervisor_name/position`, `office`, `reason_for_leaving`, `accomplishment` | PDS-incomplete profile |
| 13 | `type_of_training` enum has 4 options, production has 2 | New values created |
| 14 | Training form missing `is_present_work`, `is_govt_service`, `specify_training` | PDS-incomplete profile |
| 18 | New eligibility records don't write to `specific_eligibilities_applicant_eligibility_lnk` | Inconsistent with existing production data |
| 20 | `applicant_accomplishments` table unused | Legacy Strapi table; document as unused |
| 21 | Awards form missing `award_type` field | Distinct from `recognition_scope`; production uses both |
| 24 | Extraction field keys not validated | Unknown keys silently ignored |
| 25 | `EXTRACTABLE_PERSONAL` excludes legal declarations | Intentional — manual entry required |

---

## 5. Missing Fields Summary

### DB columns that exist but the form does NOT collect

**Personal Info** (33 missing fields):
`nickname, telephone_number, contact_number_secondary, publication, naturalized, height, weight, blood_type, pagibig, gsis, philhealth, tin, sss, govt_issued_id, govt_id_issued_number, govt_id_issued_place, govt_id_date_issued, govt_id_valid_until, house_number, street, subdivision, barangay, permanent_house_number, permanent_street, permanent_subdivision, permanent_barangay, permanent_city, permanent_province, permanent_country, permanent_telephone_number, permanent_zip_code, place_of_birth, respondent_to, specify_referral, pending_cases, remarks`

**Education** (7 missing fields):
`degree` (form combines Course/Degree but only writes `course`), `specify_others, ongoing, is_highest_education, highest_level, year_from, year_to`

**Work Experience** (5 missing fields):
`supervisor_name, supervisor_position, office, reason_for_leaving, accomplishment`

**Training** (3 missing fields):
`is_present_work, is_govt_service, specify_training`

**Eligibility** (1 missing field):
`hrRemarks` (admin only — acceptable)

**Awards** (4 missing fields):
`award_type, recognition_subcategory, points, number` (points/number are admin-set; award_type and recognition_subcategory should be in form)

### Form fields that exist but no DB column stores them

None found. Every form field maps to a real DB column (directly or via explicit rename like `eligibilityTitle` → joined from `eligibilities.name`).

---

## 6. Recommendations (concrete fixes)

### Priority 1 — Block production swap (fix these first)

**Fix 1 — BigInt JSON serialization** (`src/lib/db.ts` or `src/app/api/applicant/profile/route.ts`):
```ts
// In src/lib/db.ts (top of file, after Prisma client init):
(BigInt.prototype as any).toJSON = function () { return this.toString(); };
```
This is the lowest-risk global fix. It makes `JSON.stringify` emit BigInt as a string. The frontend already treats `mobileNumber` as a string (the form input is a text field), so no frontend changes needed. Verify the auto-apply route's name lookup still works.

**Fix 2 — Rename `isPWD` → `isPwd`** (4 files):
- `src/components/views/profile/types.ts` line 80: `isPWD: boolean` → `isPwd: boolean`
- `src/components/views/profile/use-profile-data.ts` line 88: `isPWD: profileData.isPWD ?? false` → `isPwd: profileData.isPwd ?? false`
- `src/components/views/profile/use-profile-data.ts` line 165: `isPWD: !!personalForm.isPWD` → `isPwd: !!personalForm.isPwd`
- `src/components/views/profile/personal-info-section.tsx` lines 217, 219: `form.isPWD` → `form.isPwd`; `onChange("isPWD", ...)` → `onChange("isPwd", ...)`

**Fix 3 — Zod `.datetime()` accepts HTML date strings** (`src/lib/validation.ts`):
Replace 9 occurrences of `z.string().datetime().optional().nullable()` with:
```ts
z.union([z.string().datetime(), z.string().date()]).optional().nullable()
```
Specifically in: `educationSchema.yearFrom`, `educationSchema.yearTo`, `workExperienceSchema.inclusiveDateFrom`, `workExperienceSchema.inclusiveDateTo`, `trainingSchema.inclusiveDateFrom`, `trainingSchema.inclusiveDateTo`, `eligibilitySchema.examDate`, `eligibilitySchema.licenseValidity`, `awardSchema.dateGranted`.

Also update the inline `eligibilityInputSchema` in `src/app/api/applicant/eligibilities/route.ts` lines 23-24 — or better, replace it with the shared `eligibilitySchema` from `validation.ts` and add `eligibilityId` to that schema.

**Fix 4 — Eligibility title lookup uses both link tables** (`src/lib/applicant-data.ts` lines 62-101):
After the existing `applicantEligibilityCategoryLink` lookup, add a parallel lookup via `specificEligibilityApplicantEligibilityLink` + `specificEligibility`:
```ts
const [specificLinks, specificRows] = await Promise.all([
  db.specificEligibilityApplicantEligibilityLink.findMany({
    where: { applicantEligibilityId: { in: ids } },
  }),
  // ...lookup specific_eligibilities rows by id...
]);
// Build a fallback title map; use it when cat-link title is null.
```

**Fix 5 — Eligibility form sends `eligibilityId`** (`src/components/views/profile/eligibility-section.tsx`):
Change the dropdown to capture both name and id. When the user selects an eligibility from the dropdown, send `eligibilityId` in the payload alongside `eligibilityTitle`. The API already accepts `eligibilityId` (line 18 of `eligibilities/route.ts`).

### Priority 2 — Data integrity improvements

**Fix 6 — `mobile_number` BigInt loses leading zero** (`src/app/api/applicant/profile/route.ts` lines 95-101):
In the PUT route's whitelist loop, add a special case:
```ts
if (k === "mobileNumber" && typeof v === "string") {
  v = v.replace(/[^0-9]/g, "") || null; // strip + and leading 0
}
```
This is consistent with how production already stores `mobile_number=9977583493` (10 digits, no leading 0) alongside `contact_number="09977583493"` (full format). The form already collects `contactNumber` separately, so the full-format number is preserved there. Document this behavior in the route's comments.

**Fix 7 — Write to `courses_applicant_education_lnk`** (`src/app/api/applicant/educations/route.ts`):
Add an optional `courseId` to the form's payload. After creating the education, link it:
```ts
if (d.courseId) {
  await db.courseApplicantEducationLink.create({
    data: { courseId: d.courseId, applicantEducationId: item.id, courseOrd: 0 },
  });
}
```
Update the education form to add a course dropdown (populated from `/api/reference` → `courses`) alongside the existing free-text `course` field. Use the dropdown when the user picks a known course; fall back to free-text for "Others".

### Priority 3 — UX completeness (PDS fields)

Add the following fields to the respective forms to make the profile PDS-complete:

- **Personal Info**: add expandable "Government IDs & Memberships" section with pagibig, gsis, philhealth, tin, sss, govt_issued_id, govt_id_issued_number/place/date_issued/valid_until. Add "Permanent Address" section (8 fields). Add height, weight, blood_type.
- **Work Experience**: add supervisor_name, supervisor_position, office, reason_for_leaving, accomplishment fields to the dialog.
- **Training**: add is_present_work, is_govt_service, specify_training fields.
- **Awards**: add award_type (Internal/External) and recognition_subcategory fields.

### Priority 4 — Cleanup

- Remove the inline `eligibilityInputSchema` in `eligibilities/route.ts` and use the shared `eligibilitySchema` from `validation.ts` (after extending it with `eligibilityId`).
- Document `applicant_accomplishments` and `merged_awards_accomplishments_*` tables as legacy/unused.
- Document the `birth_place` vs `place_of_birth` duplicate (form uses `birth_place`, the more-populated column).

---

## 7. Methodology & Verification

### Files audited (read in full)

- `src/components/views/profile/personal-info-section.tsx` (425 lines)
- `src/components/views/profile/form-fields.tsx` (344 lines)
- `src/components/views/profile/types.ts` (318 lines)
- `src/components/views/profile/use-profile-data.ts` (863 lines)
- `src/components/views/profile/education-section.tsx` (241 lines)
- `src/components/views/profile/work-experience-section.tsx` (315 lines)
- `src/components/views/profile/training-section.tsx` (236 lines)
- `src/components/views/profile/eligibility-section.tsx` (278 lines)
- `src/components/views/profile/awards-section.tsx` (248 lines)
- `src/components/views/profile/extraction-review-dialog.tsx` (320 lines)
- `src/components/views/upload-pds-card.tsx` (516 lines)
- `src/app/api/applicant/profile/route.ts` (125 lines)
- `src/app/api/applicant/profile/auto-apply/route.ts` (410 lines)
- `src/app/api/applicant/educations/route.ts` (56 lines)
- `src/app/api/applicant/educations/[id]/route.ts` (27 lines)
- `src/app/api/applicant/work-experiences/route.ts` (79 lines)
- `src/app/api/applicant/work-experiences/[id]/route.ts` (26 lines)
- `src/app/api/applicant/trainings/route.ts` (54 lines)
- `src/app/api/applicant/trainings/[id]/route.ts` (26 lines)
- `src/app/api/applicant/eligibilities/route.ts` (85 lines)
- `src/app/api/applicant/eligibilities/[id]/route.ts` (30 lines)
- `src/app/api/applicant/awards/route.ts` (56 lines)
- `src/app/api/applicant/awards/[id]/route.ts` (29 lines)
- `src/lib/validation.ts` (216 lines)
- `src/lib/applicant-data.ts` (428 lines)
- `src/lib/extraction.ts` (520 lines)
- `src/lib/api.ts` (74 lines)
- `prisma/schema.prisma` (1460 lines)

### Database queries run for verification

- `SELECT DISTINCT gender FROM applicants` → Male, Female, null (matches form options)
- `SELECT DISTINCT civil_status FROM applicants` → Single, Married, null (form has more options, all valid)
- `SELECT DISTINCT citizenship FROM applicants` → Filipino, null
- `SELECT DISTINCT blood_type FROM applicants` → null only (column exists, no data)
- `SELECT id, mobile_number, contact_number FROM applicants LIMIT 10` → confirmed BigInt storage and leading-zero pattern
- `SELECT id, birth_date, typeof(birth_date) FROM applicants` → confirmed TEXT storage "1993-07-25"
- `SELECT id, is_pwd FROM applicants` → confirmed boolean (0/null)
- `SELECT * FROM applicant_educations LIMIT 3` → confirmed TEXT year_graduated, null year_from/year_to
- `SELECT * FROM applicant_work_experiences LIMIT 2` → confirmed epoch-ms inclusive_date_from, status_of_employment='Contract of Service'
- `SELECT * FROM applicant_trainings LIMIT 2` → confirmed epoch-ms dates, type_of_training='Technical'
- `SELECT * FROM applicant_eligibilities LIMIT 2` → confirmed epoch-ms exam_date
- `SELECT * FROM applicant_awards LIMIT 2` → confirmed TEXT date_granted "2025-09-15", award_type='Internal', recognition_scope='Individual'
- `SELECT * FROM applicant_eligibilities_eligibility_category_lnk LIMIT 5` → 0 rows (production uses other link table)
- `SELECT * FROM specific_eligibilities_applicant_eligibility_lnk LIMIT 5` → 5 rows (production's actual link table)
- `SELECT * FROM courses_applicant_education_lnk LIMIT 3` → 12 rows (production links educations to courses)
- `SELECT character_reference FROM applicants WHERE character_reference IS NOT NULL` → confirmed JSON shape matches form

### Empirical tests run

- **Zod `.datetime()` rejection**: Tested `z.string().datetime().safeParse("2025-12-31")` → returns `{success: false, error: ZodError: "Invalid ISO datetime"}`. Also tested offset variant `"2025-12-31T00:00:00+08:00"` → also fails (Zod 4 requires `Z` suffix).
- **Prisma BigInt string coercion**: Tested `prisma.applicant.update({ data: { mobileNumber: "09123456789" } })` → stored as `9123456789n` (leading zero lost). Tested `"+639171234567"` → `639171234567n` (`+` lost). Tested `"not-a-number"` → Prisma error.
- **NextResponse.json BigInt crash**: Tested `NextResponse.json({ mobile: 9977583493n })` → throws `TypeError: Do not know how to serialize a BigInt`.

### Prisma schema vs DB schema — column-by-column match

Verified by comparing each `@@map("table_name")` model in `prisma/schema.prisma` against the corresponding `=== table_name ===` section in `/tmp/db-schema.txt`:
- `applicants` (92 columns) → ✅ 1:1 match
- `applicant_educations` (22 columns) → ✅ 1:1 match
- `applicant_educations_applicant_id_lnk` (4 columns) → ✅ 1:1 match
- `applicant_work_experiences` (25 columns) → ✅ 1:1 match
- `applicant_work_experiences_applicant_id_lnk` (4 columns) → ✅ 1:1 match
- `applicant_trainings` (18 columns) → ✅ 1:1 match
- `applicant_trainings_applicant_id_lnk` (4 columns) → ✅ 1:1 match
- `applicant_eligibilities` (14 columns) → ✅ 1:1 match
- `applicant_eligibilities_applicant_lnk` (4 columns) → ✅ 1:1 match
- `applicant_eligibilities_eligibility_category_lnk` (5 columns) → ✅ 1:1 match
- `applicant_awards` (19 columns) → ✅ 1:1 match
- `applicant_awards_applicant_lnk` (4 columns) → ✅ 1:1 match
- `applicant_accomplishments` (12 columns) → ✅ 1:1 match
- `applicant_accomplishments_applicant_lnk` (4 columns) → ✅ 1:1 match
- `eligibilities` (9 columns) → ✅ 1:1 match
- `specific_eligibilities` (10 columns) → ✅ 1:1 match
- `specific_eligibilities_applicant_eligibility_lnk` (4 columns) → ✅ 1:1 match
- `courses` (11 columns) → ✅ 1:1 match
- `courses_applicant_education_lnk` (4 columns) → ✅ 1:1 match

**No Prisma field is missing from the DB. No DB column is missing from Prisma.** All `@map`/`@@map` annotations are correct.

---

## 8. Final Verdict

The Prisma schema layer is **production-ready**. The form/API layer has **5 critical bugs** that will break normal applicant usage of the system. The most severe is the BigInt JSON-serialization crash, which today already prevents applicant #369 from loading their profile, and will affect every user who saves a mobile number. The Zod datetime validation bug prevents saving ANY date in Work/Training/Eligibility/Awards forms — making 4 of the 6 profile sections non-functional for normal use.

**Recommendation: Do NOT swap in the real production DB until Fixes 1-5 are implemented and verified.** After those fixes, the system should be re-tested end-to-end (load profile, save personal info with mobile number, save a work experience with dates, save an eligibility, save an award) to confirm the round-trip works.
