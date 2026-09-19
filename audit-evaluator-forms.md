# AUDIT-EVALUATOR-FORMS-4 — Evaluator Forms vs Production DB Audit Report

**Date:** 2026-01-20
**Agent:** Audit (general-purpose sub-agent)
**Scope:** All EVALUATOR form components and their API routes in the RMIS (DOST-MIRDC) Next.js + Prisma (SQLite) recruitment system, cross-checked against the live production Strapi v5 SQLite database.

---

## 1. Executive Summary

**Overall status:** ❌ **NOT PRODUCTION-READY.** The evaluator forms compile and run, but contain multiple critical data-integrity defects that would (a) lose assessment data when evaluators re-open drafts, (b) display empty fields in every frozen snapshot tab, and (c) write incomplete link tables for new assessments. The assessment scoring framework (`evaluation_criterias` + `components_evaluation_*`) defined in the production DB is bypassed entirely.

**Issue counts by severity:**

| Severity | Count | Impact |
|---|---|---|
| ❌ Critical | 5 | Data loss / data integrity / evaluator workflow completely broken |
| ⚠️ Warning | 10 | Feature gaps, inconsistencies, audit trail loss |
| ℹ️ Minor / missing fields | 3 | Cosmetic or low-impact |
| **Total** | **18** | |

**Critical issues at a glance:**
1. Snapshot rendering uses camelCase keys but production JSON stores snake_case → all 7 snapshot tabs render empty.
2. Assessment form loses previously-saved 11-dimension ratings on re-open.
3. New assessments never write `assessmentPositionLink` (production Strapi always wrote it).
4. Queue status-filter buttons use UPPER_CASE values that don't match production DB's Title-Case values → filter tabs always empty.
5. Overall-rating and Type-of-Application dropdowns can't display production-saved values → re-opened assessments show empty dropdowns.

---

## 2. Production DB Verification Summary

Verified against `/home/z/my-project/db/production-data.db` (readonly):

| Table | Rows | Notes |
|---|---|---|
| `applications` | 2 | Both have `application_status = 'Applied'` (Title Case) |
| `applicant_interview_assessments` | 2 | `overall_assessment_rating='Outstanding'`, `type_of_application='Internal'`, `year='2025'` (Title Case) |
| `applicant_interview_assessments_applicants_lnk` | 2 | Links exist |
| `applicant_interview_assessments_interviewers_lnk` | 2 | Links exist |
| `applicant_interview_assessments_positions_lnk` | 2 | **Links exist** (positions 1710 and 2227) |
| `evaluation_criterias` | 6 | 3 published + 3 draft pairs; types: 'Education', 'Training', 'Work Experience' |
| `components_evaluation_educations` | 18 | attainment_level rows (e.g. "High School Graduate", "BS Graduate") |
| `components_evaluation_trainings` | 2 | Mostly null |
| `components_evaluation_work_experiences` | 2 | source: 'Government' |
| `interviewers` | 4 | 2 people × 2 rows each (Strapi draft + published duplicates) |
| `files` | 60 | Real uploaded files (PDFs, JPGs, DOCXs) |
| `files_related_mph` | 82 | Polymorphic file links, 58 of them `api::applicant.applicant` |

**Prisma ↔ DB column mapping:** Faithful. The Prisma schema's `@@map("table_name")` + `@map("column_name")` correctly maps every column. The `DateTime?` fields correctly decode Strapi's epoch-millisecond INTEGER storage (verified via `prisma.application.findFirst()` returning valid Date objects).

---

## 3. Per-Area Findings

### A) Evaluator Queue — `evaluator-queue.tsx` + `/api/evaluator/queue/route.ts`

#### A.1 ❌ CRITICAL — Status filter buttons never match production data

**Location:** `src/components/views/evaluator-queue.tsx` line 54 + `src/app/api/evaluator/queue/route.ts` lines 35-44.

**Form/UI:**
```ts
type Filter = "ALL" | "FOR_EVALUATION" | "UNDER_REVIEW" | "SHORTLISTED";
```

**API behavior:**
```ts
const where = status && (VALID_STATUSES as readonly string[]).includes(status)
  ? { applicationStatus: status }       // exact match → "FOR_EVALUATION"
  : { applicationStatus: { in: [...] } }; // default: includes both case forms
```

**Production DB:** `application_status = 'Applied'` (Title Case). Strapi uses 'Under Review', 'For Evaluation', 'Shortlisted', 'Evaluated', 'Approved', 'Rejected', 'Declined', 'Needs Correction' — all Title Case with spaces.

**Impact:** When an evaluator clicks the "For Evaluation" / "Under Review" / "Shortlisted" filter tabs, the API runs `{ applicationStatus: "FOR_EVALUATION" }` (UPPER_CASE) — exact match against production data's `"For Evaluation"` (Title Case) → never matches → tab appears empty. Only "All" tab shows applications.

**Fix:** Either (a) normalize at the API: `applicationStatus: { in: [status, titleCase(status.replace(/_/g, ' '))] }`, OR (b) make the queue API filter case-insensitive via raw SQL. Recommended: store filter values in BOTH forms in `VALID_STATUSES` already done — extend the `where` clause to include the Title Case form when an UPPER_CASE form is passed.

#### A.2 ⚠️ WARNING — Queue API returns `assessments: []` hardcoded

**Location:** `src/app/api/evaluator/queue/route.ts` line 111.

```ts
data.push({ ...app, status: app.applicationStatus, applicant, job, assessments: [] });
```

**Frontend:** `evaluator-queue.tsx` lines 219-291 compute the "Pending / Draft / Submitted" badge and top accent color from `item.assessments`. With `assessments: []`, the badge is always "Pending" (gray) and the accent line always `bg-slate-200`.

**Impact:** Evaluator opens the queue and sees every application as "Pending" — even ones they have already drafted or submitted. They cannot tell which applications they've already worked on without clicking each one.

**Fix:** In the queue API, after loading each application's `applicantId` via `findApplicationApplicantId`, look up the evaluator's `assessmentApplicantLink` + `assessmentInterviewerLink` + `assessment` rows (mirror the logic in `/api/evaluator/applications/[id]/route.ts` lines 89-104). Return at minimum `{ id, overallAssessmentRating, updatedAt }` per assessment.

#### A.3 ✅ Junction-table joins are correct

- `applications_applicant_lnk` → `findApplicationApplicantId(app.id)` ✓
- `applications_job_lnk` → `findApplicationJobId(app.id)` ✓
- `jobpostings_postions_lnk` → `loadJobPostingPosition(jobId)` ✓
- `postions_place_of_assignment_lnk` → `loadPositionPlaceOfAssignment(position.id)` ✓

All four junctions verified against production data — both test applications (id 220, 221) correctly resolve to applicants 148/567 and jobpostings 252/273.

---

### B) Application Review — `evaluator-review.tsx` + `applicant-info-panel.tsx` + `documents-panel.tsx` + `types.tsx` + `/api/evaluator/applications/[id]/route.ts`

#### B.1 ❌ CRITICAL — Snapshot renderers use camelCase, production JSON uses snake_case

**Location:** `src/components/views/evaluator/types.tsx` lines 184-254 (`renderEducation`, `renderExperience`, `renderTraining`, `renderEligibility`, `renderAward`) and `src/components/views/evaluator/applicant-info-panel.tsx` lines 309-326 (`ProfileSnapshot`).

**Form/UI reads (camelCase):**
```ts
// ProfileSnapshot
["First Name", profile.firstName]
["Birth Date", profile.birthDate ? formatDate(profile.birthDate) : null]
["Email", profile.emailAddress]
["Mobile Number", profile.mobileNumber]

// renderEducation
["Level", e.educationLevel]
["School", e.schoolName]
["Year Graduated", e.yearGraduated]
["Specify Others", e.specifyOthers]

// renderExperience — ALL FIELDS MISMATCHED
["Position", e.positionTitle]    // DB: position_title
["Employer", e.employerName]     // DB: employer_name
["From", e.inclusiveDateFrom]    // DB: inclusive_date_from
["To", e.inclusiveDateTo]        // DB: inclusive_date_to
// ... 7 more, all camelCase

// renderTraining — ALL FIELDS MISMATCHED
["Title", t.titleOfTraining]     // DB: title_of_training
["Hours", t.numberHours]         // DB: number_hours

// renderEligibility — only `rating` matches
["Title", el.eligibilityTitle]   // NOT in JSON at all
["Exam Date", el.examDate]       // DB: exam_date

// renderAward — only `points` matches
["Type", a.recognitionType]      // DB: recognition_type
["Date Granted", a.dateGranted]  // DB: date_granted
```

**Production JSON (verified by reading `snapshot_profile` for app 220):**
```json
{
  "first_name": "Ralph Lawrence",
  "middle_name": "B",
  "last_name": "Olaguer",
  "email_address": "ralpholaguer@gmail.com",
  "contact_number": "09272241752",
  "birth_date": ...,
  ...
}
```

Same pattern for ALL snapshot columns — they store the raw DB row serialized with snake_case column names.

**Impact:** Every snapshot tab (Personal, Education, Experience, Training, Eligibility, Awards) will display EMPTY rows for almost every field. Only a handful of fields that happen to be single words (`degree`, `course`, `rating`, `points`, `ongoing`) will display. Evaluators see frozen-data tabs that look blank — defeats the entire purpose of the snapshot panel.

**Fix:** Two options:
1. **Convert keys at the API boundary** (recommended). In `/api/evaluator/applications/[id]/route.ts`, after `safeJson(raw.profile)`, run a snakeCase→camelCase key transformer on each snapshot. (~15 lines.)
2. **Update the render functions** to use snake_case keys. (More invasive; harder to maintain.)

Option 1 is preferred because it centralizes the conversion. Add a helper:
```ts
function camelKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(camelKeys);
  if (obj && typeof obj === "object") {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [
      k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
      camelKeys(v),
    ]));
  }
  return obj;
}
```

#### B.2 ⚠️ WARNING — `snapshot_attachment` misinterpreted as MQR results

**Location:** `src/app/api/evaluator/applications/[id]/route.ts` line 86.

```ts
mqrResults: raw.attachment ? safeJson(raw.attachment) : null,
```

**Production JSON for `snapshot_attachment` (app 220):**
```json
{
  "id": 42,
  "documentId": "de7hcg9qixvol9qs7q83c0zb",
  "createdAt": "2025-09-17T05:26:27.981Z",
  "updatedAt": "2025-09-17T05:26:27.981Z",
  "publishedAt": "2025-09-17T05:26:27.981Z",
  "attachment": null
}
```

This is **Strapi component/file metadata**, not MQR results. There is no `mqr_results` column in the `applications` table — MQR results are not persisted in the DB at all.

**Frontend:** `applicant-info-panel.tsx` lines 154-198 expects `mqr` to be `Record<string, string>` with keys `["education", "eligibility", "workExperience", "training"]`. The actual JSON has none of those keys → the MQR panel renders `—` for all 4 rows.

**Impact:** MQR (Minimum Qualification Requirements) panel always shows empty/dash. Evaluators can't see whether the applicant meets minimum requirements.

**Fix:** Either (a) remove the MQR panel entirely (the data isn't in the DB), or (b) compute MQR results live from the applicant's snapshot vs the position's `csc_education`/`csc_work_experience`/`csc_training_requirements`/`csc_eligibility_group` fields (these ARE in the DB on the `postions` table).

#### B.3 ⚠️ WARNING — `app.documents` hardcoded `[]`; DocumentsPanel always empty

**Location:** `/api/evaluator/applications/[id]/route.ts` line 118 + `documents-panel.tsx`.

```ts
documents: [], // No DB documents table in production
```

**Production DB:** The `files` table has 60 rows. The `files_related_mph` polymorphic relation table has 58 rows linking files to `api::applicant.applicant` with field names like `eligibility_attachment`, `education_attachment`, `work_experience_attachment`, `training_attachment`, `award_attachment`. An additional 22 rows link files to `api::applicant-form.applicant-form` with fields like `coe`, `performance_evaluation`, `attachment`.

**Impact:** Evaluators can't see any applicant-uploaded supporting documents (PDS, TOR, COE, training certificates, etc.). The DocumentsPanel always shows "No documents uploaded by the applicant".

**Fix:** In the API, after loading `applicantId`, query:
```ts
const fileLinks = await db.fileRelatedLink.findMany({
  where: { relatedId: applicantId, relatedType: "api::applicant.applicant" },
});
const fileIds = fileLinks.map((l) => l.fileId).filter(...);
const files = await db.file.findMany({ where: { id: { in: fileIds } } });
// Map each file to { id, originalName: name, fileName: name, filePath: url, category: <field>, mimeType: mime, size }
```

#### B.4 ⚠️ WARNING — Status timeline always empty (`statusChanges: []` hardcoded)

**Location:** `/api/evaluator/applications/[id]/route.ts` line 117.

```ts
statusChanges: [],
```

**Frontend:** `applicant-info-panel.tsx` lines 412-452 (`StatusTimeline`) expects an array of `{ id, fromStatus, toStatus, reason, createdAt, changedBy }`.

**Production DB:** There is NO dedicated status-change audit table. Status changes are NOT logged anywhere in the production schema (the existing `notifications` table is being misused for this on PATCH, but it doesn't store from/to status).

**Impact:** The StatusTimeline component (`if (!changes || changes.length === 0) return null;`) never renders. Evaluators can't see the history of an application's status transitions.

**Fix:** Long-term, propose adding a `application_status_changes` table (with columns `application_id, from_status, to_status, reason, changed_by_id, created_at`). Short-term, the current PATCH endpoint logs to `notifications` — change the API GET to query `notifications WHERE name LIKE 'Application #% status: %'` and parse the free-text to reconstruct the timeline. (Fragile, but workable.)

#### B.5 ⚠️ WARNING — `findOrCreateInterviewerForUser` matches draft duplicates

**Location:** `/api/evaluator/assessments/[applicationId]/route.ts` lines 28-29.

```ts
const existing = await db.interviewer.findFirst({ where: { name: fullName } });
```

**Production DB:** Strapi v5 stores both draft (unpublished) and published versions of the same Interviewer row. Verified: "Eric B. Casila" appears twice (id=1 unpublished, id=4 published); "Francis Albert M. Ferrer" twice (id=5 unpublished, id=6 published).

`findFirst` returns whichever Prisma returns first (typically lowest id = the draft/unpublished version).

**Impact:** New assessments created via RMIS link to the unpublished version of the interviewer. Strapi admin UI filters by `published_at IS NOT NULL` and may miss these.

**Fix:** Filter by `publishedAt: { not: null }` in the `findFirst` query, falling back to creating with `publishedAt: now`.

---

### C) Assessment Form — `assessment-form.tsx` + `/api/evaluator/assessments/[applicationId]/route.ts`

#### C.1 ❌ CRITICAL — Assessment form loses previously-saved dimension ratings on re-open

**Location:** `/api/evaluator/applications/[id]/route.ts` lines 90-104 (GET endpoint that returns `app.assessments`).

```ts
let assessments: Array<{ id: number; overallAssessmentRating: string | null; updatedAt: Date | null }> = [];
if (applicantId != null) {
  const assessmentLinks = await db.assessmentApplicantLink.findMany({ where: { applicantId } });
  ...
  if (aIds.length) {
    assessments = await db.assessment.findMany({
      where: { id: { in: aIds } },
      select: { id: true, overallAssessmentRating: true, updatedAt: true },  // ← only 3 fields!
    });
  }
}
```

**Frontend:** `assessment-form.tsx` lines 66-91 (useEffect initializes form from `existing`):

```ts
for (const d of ALL_DIMENSIONS) {
  next[d.ratingField] = (existing[d.ratingField] as number) ?? 5;  // ← falls back to 5
  next[d.commentsField] = (existing[d.commentsField] as string) ?? "";
}
next.overallAssessmentRating = existing.overallAssessmentRating || "";
next.commentAndRecommendation = existing.commentAndRecommendation || "";
next.typeOfApplication = existing.typeOfApplication || "";
next.year = existing.year || String(new Date().getFullYear());
```

**Impact:** When an evaluator re-opens an existing draft or submitted assessment:
- All 11 dimension ratings reset to the default `5`.
- All 11 comments fields reset to empty string.
- `commentAndRecommendation`, `typeOfApplication` reset to empty.
- Only `overallAssessmentRating`, `year` survive.

If the evaluator clicks "Save Draft" or "Submit Assessment" without re-entering all ratings, the previous ratings are **overwritten with 5s and empty strings**. This is silent data loss on real hiring decisions.

There IS a separate GET endpoint (`/api/evaluator/assessments/[applicationId]`) that returns the full Assessment row — but the AssessmentForm component never calls it. It only reads `app.assessments[0]` from the applications endpoint.

**Fix:** Two options:
1. **Expand the GET endpoint's `select`** to include all 25 fields. (Recommended, smallest change.)
2. **Add a separate fetch in `AssessmentForm`** that calls `/api/evaluator/assessments/[applicationId]` to load the full assessment when `existing?.id` is present.

Option 1 example:
```ts
assessments = await db.assessment.findMany({
  where: { id: { in: aIds } },
  // remove the `select` — return all fields
});
```

#### C.2 ❌ CRITICAL — `assessmentPositionLink` not written on new assessment create

**Location:** `/api/evaluator/assessments/[applicationId]/route.ts` lines 148-164.

```ts
} else {
  assessment = await db.assessment.create({ data: { ...payload, createdAt: now, publishedAt: now } });
  // Link to applicant
  await db.assessmentApplicantLink.create({
    data: { applicantInterviewAssessmentId: assessment.id, applicantId },
  });
  // Link to interviewer
  await db.assessmentInterviewerLink.create({
    data: { applicantInterviewAssessmentId: assessment.id, interviewerId: interviewer.id },
  });
  // ❌ MISSING: db.assessmentPositionLink.create(...)
}
```

**Production DB verified:** `applicant_interview_assessments_positions_lnk` has 2 rows for the 2 existing assessments — Strapi always wrote the position link.

**The position ID is available** — the API already calls `findApplicationApplicantId(applicationId)`; adding `findApplicationJobId(applicationId)` + `loadJobPostingPosition(jobId)` returns the position ID.

**Impact:** New RMIS-created assessments lack the position link. Any report/query that joins assessment → position (e.g. "show all assessments for METALS TECHNOLOGIST III") will miss RMIS-created assessments. Strapi admin UI that filters assessments by position will also miss them.

**Fix:**
```ts
import { findApplicationJobId, loadJobPostingPosition } from "@/lib/applicant-data";
...
const jobId = await findApplicationJobId(applicationId);
let postionId: number | null = null;
if (jobId != null) {
  const position = await loadJobPostingPosition(jobId);
  postionId = position?.id ?? null;
}
...
// Inside the `else` branch (new assessment):
if (postionId != null) {
  await db.assessmentPositionLink.create({
    data: { applicantInterviewAssessmentId: assessment.id, postionId },
  });
}
```

#### C.3 ❌ CRITICAL — OVERALL rating & TYPE dropdowns can't display production values

**Location:** `src/components/views/evaluator/types.tsx` lines 167-178 + `assessment-form.tsx` lines 259-294.

```ts
export const OVERALL_OPTIONS = [
  { value: "OUTSTANDING", label: "Outstanding" },
  { value: "BETTER_THAN_REQUIRED", label: "Better than required" },
  { value: "MEETS_REQUIREMENT", label: "Meets requirement" },
  { value: "UNSATISFACTORY", label: "Unsatisfactory" },
];

export const TYPE_OPTIONS = [
  { value: "INTERNAL", label: "Internal" },
  { value: "GOVERNMENT", label: "Government" },
  { value: "NON_GOVERNMENT", label: "Non-Government" },
];
```

**Production DB values (verified):** `overall_assessment_rating='Outstanding'`, `type_of_application='Internal'` — Title Case, with spaces for multi-word values.

**AssessmentForm loading:** `next.overallAssessmentRating = existing.overallAssessmentRating || "";` sets the form value to `"Outstanding"` (production form).

**The Select:** `<Select value={"Outstanding"}>` has no matching `<SelectItem value="Outstanding">` — only `value="OUTSTANDING"` exists. Radix Select renders the trigger empty.

**Submit path:** The API converts `"OUTSTANDING"` → `"Outstanding"` (lines 105-110) before writing. So writes work. But reads don't — re-opened assessments show empty dropdowns.

**Impact:** Evaluators re-opening an assessment see both dropdowns empty. They must re-pick the overall rating (and risk changing it accidentally) and re-pick the type. The `ConfirmDialog` displays `ratingLabel = OVERALL_OPTIONS.find(o => o.value === rating)?.label || rating` — this fallback works (returns the raw "Outstanding"), so the dialog shows the correct label. But the form field itself is broken.

**Fix:** Either (a) normalize on read in `AssessmentForm`'s useEffect:
```ts
const rawOverall = existing.overallAssessmentRating || "";
const overallEnum = rawOverall.toUpperCase().replace(/ /g, "_");
next.overallAssessmentRating = (OVERALL_OPTIONS.find(o => o.value === overallEnum)?.value) || rawOverall;
```
Or (b) extend `OVERALL_OPTIONS` and `TYPE_OPTIONS` to include the Title Case values as alternative options. Recommended: option (a) — keeps the option list clean.

#### C.4 ⚠️ WARNING — Assessment form bypasses `evaluation_criterias` scoring framework

**Location:** `assessment-form.tsx` lines 335-396 (`DimensionInput`).

**Form behavior:** Each of the 11 dimensions is a hardcoded 1-10 slider. The evaluator subjectively picks a number.

**Production DB has a configured scoring framework:**
- `evaluation_criterias` (6 rows) — defines per-type criteria JSON:
  - `type='Education'` → `education_criteria` JSON maps attainment level → percentage (0.6, 1.2, 1.8, 2.4, 3)
  - `type='Training'` → `training_criteria` JSON maps training classification + hours → percentage (0.05, 0.1, 0.5)
  - `type='Work Experience'` → `work_exp_criteria` JSON maps years + sector (government/private) → percentage
- `components_evaluation_educations` (18 rows) — attainment levels per criteria
- `components_evaluation_trainings` (2 rows) — training classifications
- `components_evaluation_work_experiences` (2 rows) — experience sources
- `components_evaluation_education_percentages`, `components_evaluation_training_percentages`, `components_evaluation_work_experience_percentages` — percentage tables

The original Strapi RMIS used this framework to **compute objective scores** based on the applicant's actual education/training/experience records, not subjective 1-10 ratings.

**Impact:** Evaluator ratings are subjective and inconsistent with the original system. Hiring decisions made via RMIS cannot be cross-compared with decisions made via Strapi. The admin-configured scoring framework is wasted.

**Fix:** This is a design-level fix, not a one-line patch. Recommended approach:
1. Add an endpoint `GET /api/evaluator/criteria` that returns the active `evaluation_criterias` row + the `components_evaluation_*` lookup tables.
2. Modify the AssessmentForm to: (a) auto-compute the education/training/work-experience/eligibility scores from the applicant's snapshot + the criteria JSON, (b) let the evaluator override the computed score with a slider, (c) display the computed score next to the slider as a reference.

#### C.5 ⚠️ WARNING — Zod `assessmentSchema` allows rating=0 but UI forbids it

**Location:** `src/lib/validation.ts` line 157 (and all 11 rating fields) vs `assessment-form.tsx` line 369.

```ts
// validation.ts
educationRating: z.number().int().min(0).max(10).optional().nullable(),
//                                  ^^^^ 0 allowed

// assessment-form.tsx
<Input type="number" min={1} max={10} ... />
<Slider min={1} max={10} ... />
```

**Impact:** UI prevents 0, but a direct API POST with `educationRating: 0` would be accepted. Minor inconsistency — no real-world data corruption risk because the UI is the only entry point.

**Fix:** Change `min(0)` → `min(1)` in `assessmentSchema`.

#### C.6 ⚠️ WARNING — Status auto-transition to `"EVALUATED"` doesn't match production Title Case

**Location:** `/api/evaluator/assessments/[applicationId]/route.ts` lines 167-174.

```ts
if (data.overallAssessmentRating) {
  await db.application.update({
    where: { id: applicationId },
    data: { applicationStatus: "EVALUATED", updatedAt: now },
  });
}
```

**Production convention:** Application statuses are Title Case ("Applied", "Under Review", etc.). RMIS writes UPPER_CASE ("EVALUATED").

**Impact:** The DB ends up with mixed-case status values: Strapi-written rows have Title Case, RMIS-written rows have UPPER_CASE. Queue filter (issue A.1) and StatusBadge rendering may treat them inconsistently.

**Fix:** Use `"Evaluated"` (Title Case) to match production convention. Also update `STATUS_OPTIONS` in `types.tsx` and the `statusUpdateSchema` enum to accept both forms.

#### C.7 ⚠️ WARNING — `STATUS_OPTIONS` excludes `"APPLIED"` and `"Applied"`

**Location:** `src/components/views/evaluator/types.tsx` lines 155-165.

```ts
export const STATUS_OPTIONS = [
  "PENDING", "UNDER_REVIEW", "FOR_EVALUATION", "SHORTLISTED", "EVALUATED",
  "APPROVED", "REJECTED", "DECLINED", "NEEDS_CORRECTION",
];
```

**Impact:** When the current application status is "Applied" (production form), the StatusControls dropdown can't display it — renders empty. Evaluator can't revert an application back to "Applied" either.

**Fix:** Add `"APPLIED"` and `"Applied"` to `STATUS_OPTIONS`. Render with `s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())` for display.

#### C.8 ⚠️ WARNING — Status update PATCH logs to `notifications` table (semantic mismatch)

**Location:** `/api/evaluator/applications/[id]/route.ts` lines 159-172.

The code itself documents this is a workaround: "Production has NO dedicated status-change table. We'd need to store this somewhere — for now, log it via a notification record".

**Impact:** Audit trail of status changes is buried in the `notifications` table as free-text. No way to query "all status changes for application X by evaluator Y" without parsing strings.

**Fix:** See B.4 — propose a new `application_status_changes` table for long-term, or extend the notifications-based log to include structured JSON in `notification_description`.

#### C.9 ⚠️ WARNING — Assessment `documentId` not set on create

**Location:** `/api/evaluator/assessments/[applicationId]/route.ts` lines 149-155.

```ts
assessment = await db.assessment.create({
  data: { ...payload, createdAt: now, publishedAt: now },
  // ← no documentId
});
```

**Production convention:** Every Strapi row has a `document_id` (CUID-like string). RMIS-created assessments will have `document_id = NULL`.

**Impact:** Strapi endpoints that look up assessments by `document_id` will miss RMIS-created ones. Strapi's REST API `?documentId=...` filter returns nothing for these rows.

**Fix:** Generate a document_id on create: `documentId: require('crypto').randomBytes(12).toString('base64url')` (or use the `cuid` library if available). Same fix needed for the `interviewer.create` in `findOrCreateInterviewerForUser`.

---

### D) My Applications (cross-check) — `my-applications.tsx` + `/api/applications/route.ts`

#### D.1 ⚠️ WARNING — `app.mqrResults` never populated; MQR panel never renders

**Location:** `src/components/views/my-applications.tsx` line 166 + `/api/applications/route.ts` lines 63-83.

**Frontend:**
```ts
{app.mqrResults && (<div>...MQR panel...</div>)}
```

**API:** The response object spreads `...app` (DB row, which has `snapshotAttachment`, not `mqrResults`). No `mqrResults` field is set.

**Impact:** Applicants never see MQR status on their own applications page. Even if the field were populated, the actual `snapshot_attachment` JSON is Strapi file metadata (see B.2), not MQR results — so the panel would show `—` everywhere.

**Fix:** Same root cause as B.2. Remove the MQR panel from `my-applications.tsx`, OR compute MQR results live from the position's CSC qualification standards vs the applicant's snapshot.

#### D.2 ✅ Application list joins are correct

The `/api/applications/route.ts` correctly:
- Loads applications via `findApplicationsForApplicant(applicantId)` (which joins `applications_applicant_lnk`).
- Batch-loads `applicationJobLink` for all application IDs.
- Batch-loads `jobPosting` rows.
- Loads positions via `loadJobPostingPosition(jobId)`.
- Loads places of assignment via `loadPositionPlaceOfAssignment(pid)`.

The MyApplications card displays position title, place of assignment, item number, salary amount, deadline, processing date — all verified present on the `postions` and `jobpostings` tables.

#### D.3 ℹ️ MINOR — `assessments: []` hardcoded in `/api/applications/route.ts` line 81

The MyApplications card doesn't display assessment status, so this is harmless. Documented for completeness.

---

## 4. Critical Issues (❌) — Consolidated

| # | Issue | Location | Impact |
|---|---|---|---|
| 1 | Snapshot renderers use camelCase but JSON uses snake_case | `types.tsx` lines 184-254, `applicant-info-panel.tsx` lines 309-326 | All 7 snapshot tabs render empty for ~30 fields |
| 2 | Assessment GET endpoint returns only 3 of 25+ fields | `/api/evaluator/applications/[id]/route.ts` lines 99-102 | Re-opened assessments lose all 11 dimension ratings (silent data loss on next save) |
| 3 | `assessmentPositionLink` not written on create | `/api/evaluator/assessments/[applicationId]/route.ts` lines 148-164 | New assessments lack position link; production Strapi always wrote it |
| 4 | Queue filter buttons use UPPER_CASE, production uses Title Case | `evaluator-queue.tsx` line 54 + `route.ts` line 36 | All filter tabs except "All" appear empty |
| 5 | OVERALL/TYPE dropdowns can't display production-saved values | `types.tsx` lines 167-178 + `assessment-form.tsx` lines 259-294 | Re-opened assessments show empty dropdowns |

---

## 5. Warnings (⚠️) — Consolidated

| # | Issue | Location | Impact |
|---|---|---|---|
| 6 | Queue API returns `assessments: []` hardcoded | `queue/route.ts` line 111 | Queue cards always show "Pending" badge |
| 7 | `snapshot_attachment` misinterpreted as MQR results | `applications/[id]/route.ts` line 86 | MQR panel always empty |
| 8 | `findOrCreateInterviewerForUser` matches draft duplicates | `assessments/[applicationId]/route.ts` line 28 | Links to unpublished interviewer |
| 9 | `STATUS_OPTIONS` excludes "APPLIED"/"Applied" | `types.tsx` lines 155-165 | Can't revert to Applied; dropdown empty when status=Applied |
| 10 | `statusUpdateSchema` rejects most Title Case statuses | `validation.ts` lines 193-201 | Can't PATCH production-form status values |
| 11 | Status-change audit log written to `notifications` (semantic mismatch) | `applications/[id]/route.ts` lines 159-172 | Audit trail buried in free-text |
| 12 | My Applications page can't show MQR panel | `my-applications.tsx` line 166 + `applications/route.ts` | Applicants never see MQR status |
| 13 | `DocumentsPanel` always empty (`documents: []`) | `applications/[id]/route.ts` line 118 + `applications/route.ts` line 81 | Evaluators can't see applicant-uploaded files |
| 14 | Assessment form bypasses `evaluation_criterias` framework | `assessment-form.tsx` lines 335-396 | Subjective 1-10 ratings vs. objective computed scores |
| 15 | Status auto-transition writes `"EVALUATED"` (UPPER_CASE) | `assessments/[applicationId]/route.ts` line 171 | Inconsistent case with production Strapi |
| 16 | `assessmentSchema` Zod min=0 but UI min=1 | `validation.ts` line 157 vs `assessment-form.tsx` line 369 | Inconsistent validation |

---

## 6. Missing Fields / Coverage Gaps

| # | Gap | Notes |
|---|---|---|
| 17 | `Applicant` type only includes 8 of ~80 DB columns | Intentional minimalism for the live header card; full data is in the snapshot. Acceptable design choice. |
| 18 | `assessmentApplicantLink` / `assessmentInterviewerLink` `_ord` columns not set on create | Production Strapi sets `applicant_ord`, `interviewer_ord` to sequence numbers. RMIS leaves NULL. Minor — no functional impact. |
| 19 | `assessment.documentId` not generated on create | See warning C.9. Strapi's `?documentId=...` lookup will miss RMIS-created assessments. |

---

## 7. Recommendations — Concrete Fixes (Priority Order)

### P0 — Must-fix before any evaluator uses the system

1. **Fix the snapshot camelCase/snake_case mismatch (Critical #1).** Add a `camelKeys()` helper in `/api/evaluator/applications/[id]/route.ts` and apply it to all 7 snapshot JSON fields. Estimated 15 LOC + 7 call sites.

2. **Fix the assessment data-loss bug (Critical #2).** Remove the `select: { id: true, overallAssessmentRating: true, updatedAt: true }` clause in `/api/evaluator/applications/[id]/route.ts` line 101 — return the full Assessment row. Estimated 1 LOC change.

3. **Write `assessmentPositionLink` on new assessment create (Critical #3).** Add the lookup + create call in the POST endpoint's `else` branch. Estimated 8 LOC.

4. **Fix the OVERALL/TYPE dropdown load (Critical #5).** In `assessment-form.tsx`'s useEffect, normalize the loaded values back to the UPPER_CASE enum form before setting the form state. Estimated 6 LOC.

### P1 — Should-fix before production rollout

5. **Fix the queue status-filter mismatch (Critical #4).** In `queue/route.ts`, when the `status` query param is UPPER_CASE, also include the Title Case form in the `where.applicationStatus.in` array.

6. **Populate `assessments` in the queue API (Warning #6).** Reuse the assessment-link lookup logic from `applications/[id]/route.ts`. Estimated 12 LOC refactor.

7. **Populate `documents` from `files` + `files_related_mph` (Warning #13).** Estimated 15 LOC.

8. **Add `"APPLIED"` and `"Applied"` to `STATUS_OPTIONS` (Warning #9).** Estimated 2 LOC.

9. **Normalize status values: pick ONE convention (Title Case recommended) and use it everywhere (Warnings #10, #15).** Update `statusUpdateSchema`, `STATUS_OPTIONS`, the auto-transition `applicationStatus: "EVALUATED"` write, and the queue filter values.

### P2 — Long-term design improvements

10. **Integrate the `evaluation_criterias` scoring framework (Warning #14).** Add a `/api/evaluator/criteria` endpoint that returns the active criteria JSON. Modify `AssessmentForm` to (a) compute objective scores from the snapshot, (b) display them as reference, (c) allow evaluator override.

11. **Add a dedicated `application_status_changes` audit table (Warnings #11, B.4).** Propose a new Prisma model with `applicationId, fromStatus, toStatus, reason, changedById, createdAt`. Update the PATCH endpoint to write to this table instead of `notifications`. Update the GET endpoint to read from it for the StatusTimeline.

12. **Generate `documentId` on all creates (Missing field #19).** Add a `genDocumentId()` helper and use it in `assessment.create`, `interviewer.create`, and any other Strapi-style creates.

---

## 8. Methodology

**Files read in full:**
- `/tmp/db-schema.txt` (1067 lines, all 95 tables)
- `/home/z/my-project/prisma/schema.prisma` (1461 lines, all models)
- `src/components/views/evaluator-queue.tsx` (336 lines)
- `src/components/views/evaluator-review.tsx` (133 lines)
- `src/components/views/evaluator/types.tsx` (255 lines)
- `src/components/views/evaluator/applicant-info-panel.tsx` (453 lines)
- `src/components/views/evaluator/documents-panel.tsx` (55 lines)
- `src/components/views/evaluator/assessment-form.tsx` (603 lines)
- `src/components/views/my-applications.tsx` (233 lines)
- `src/app/api/evaluator/queue/route.ts` (124 lines)
- `src/app/api/evaluator/applications/[id]/route.ts` (184 lines)
- `src/app/api/evaluator/assessments/[applicationId]/route.ts` (187 lines)
- `src/app/api/applications/route.ts` (87 lines)
- `src/lib/validation.ts` (relevant excerpt)
- `src/lib/applicant-data.ts` (428 lines)
- `src/lib/raw-json.ts` (150 lines)
- `src/lib/db.ts` (41 lines)

**Production DB queries executed (readonly):**
- `PRAGMA table_info('applicant_interview_assessments')` — verified all 34 columns
- `SELECT DISTINCT application_status FROM applications` → `['Applied']`
- `SELECT DISTINCT overall_assessment_rating, type_of_application, year FROM applicant_interview_assessments` → `['Outstanding']`, `['Internal']`, `['2025']`
- `SELECT * FROM evaluation_criterias` — 6 rows, 3 types (Education, Training, Work Experience) with JSON criteria
- `SELECT * FROM components_evaluation_educations|trainings|work_experiences` — verified framework tables
- `SELECT * FROM components_evaluation_*_percentages` — verified percentage tables
- `SELECT * FROM applicant_interview_assessments_applicants_lnk|interviewers_lnk|positions_lnk` — verified all 3 link tables populated
- `SELECT * FROM applications_applicant_lnk|job_lnk` — verified application junctions
- `SELECT snapshot_profile, snapshot_educations, ... FROM applications WHERE id=220` — verified JSON keys are snake_case
- `SELECT * FROM files_related_mph WHERE related_type LIKE '%applicant%'` — 58 file links to applicants exist
- `SELECT document_id, COUNT(*) FROM interviewers GROUP BY document_id HAVING n>1` — verified Strapi draft+published duplicates
- Prisma client read tests — verified `DateTime?` correctly decodes Strapi epoch-ms INTEGER storage

**No DB writes performed.** All queries used `readonly: true`.

---

*End of audit report.*
