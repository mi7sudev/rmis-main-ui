# Task 5-b — Applicant Profile + Document Intelligence

**Agent**: full-stack-developer
**Date**: 2025-01
**Status**: ✅ Complete

## What was built

Single-file React client component at `/home/z/my-project/src/components/views/profile-view.tsx` (~3,847 lines), exporting `ProfileView` (named export, matches `src/app/page.tsx` import).

## Architecture

- One `"use client"` file, no helper files needed.
- State lifted to top-level `ProfileView` so the Documents section's "Apply to Profile" action can pre-fill personal info form + push pending entries into sub-entity arrays.
- Sub-components (all in same file):
  - `PersonalInfoSection` — Identity / Address / Legal cards + Character References (repeatable 1–5)
  - `EducationSection`, `WorkExperienceSection`, `TrainingSection`, `EligibilitySection`, `AwardsSection` — list + Add/Edit/Delete dialogs
  - `DocumentsSection` — drag-drop upload, AI extract, document list, status badges
  - `ExtractionReviewDialog` — grouped extracted data with confidence indicators + Apply-to-Profile
  - `EntityCard`, `FieldWithExtraction`, `FormField`, `SelectField`, `RefInput`, `StatTile`, `SectionHeader` — shared UI primitives

## API contracts used

- `GET /api/applicant/profile` (loads full profile + nested entities + documents)
- `PUT /api/applicant/profile` (saves personal info, isProfileComplete flag)
- `GET /api/reference` (eligibilities, courses, placesOfAssignment)
- `POST/DELETE /api/applicant/documents` + `/[id]` (multipart upload via plain fetch)
- `POST /api/applicant/documents/extract` (returns `{results, merged}`)
- `POST/DELETE /api/applicant/{educations,work-experiences,trainings,eligibilities,awards}` (no PUT — edit = delete + create)

## Key design decisions

1. **No auto-save of extracted data** — extracted personal fields populate local form state with `personalFromExtraction: Set<string>` tracking; pending sub-entity items get `__fromExtraction: true` flag with `pending-` ID prefix. User must click "Save Changes" on each section to persist.
2. **Visual highlighting** — teal ring + "from doc" badge on extracted personal fields; "From document — verify" badge on pending sub-entity cards.
3. **Confidence indicators** — green (high) / amber (medium) / orange (low) / gray (none) dots in the review dialog; "Not found" shown in italic gray for null values.
4. **Edit flow** — since API has no PUT for sub-entities, edit = DELETE old + POST new. For pending items (extraction), edit = POST new + remove pending from local state.
5. **Mark Profile Complete** — gated on `firstName && lastName && emailAddress && educations.length > 0 && workExperiences.length > 0`. Confirmation AlertDialog.
6. **File upload** — uses plain `fetch` with `FormData` (not `apiFetch`) because `apiFetch` forces `Content-Type: application/json`.

## Lint status

`bun run lint` passes for profile-view.tsx (the only remaining error is a pre-existing `set-state-in-effect` warning in `nav-provider.tsx` which is NOT my code).

## Page render

`curl http://localhost:3000/` returns HTTP 200; dev.log shows clean recompiles. Pre-existing API errors (`headers called outside a request scope`) in unrelated routes are NOT caused by this task.
