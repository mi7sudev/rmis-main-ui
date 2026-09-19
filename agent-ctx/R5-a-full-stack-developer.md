# Task R5-a — Decompose profile-view.tsx

**Agent:** full-stack-developer
**Task:** Decompose `src/components/views/profile-view.tsx` (3,847 lines) into focused modules under `src/components/views/profile/`, with a thin `profile-view.tsx` orchestrator.

## Context
- Read `/home/z/my-project/worklog.md` for project context (RMIS — DOST-MIRDC applicant profile system with VLM document extraction).
- Read the full 3,847-line `profile-view.tsx` to understand structure: types, constants, helpers, main `ProfileView` orchestrator, 7 section components, document sub-components, extraction-review sub-components, shared form primitives.
- Reviewed prior agent records: `5-b-full-stack-developer.md` (the original implementation), `6-evaluator-workflow.md`, `7-admin-views.md`.

## Approach
Pure mechanical refactor — moved code between files and added imports/exports. No behavior, styling, props, or logic changes.

To hit the "under ~250 lines" target for `profile-view.tsx` while preserving the orchestrator's exact logic, I extracted all state + handlers (loadAll, savePersonal, createSubEntity, deleteSubEntity, applyExtractionToProfile, handleMarkComplete, reloadDocuments, and the section-specific onCreate/onUpdate/onDelete bundles) into a `useProfileData()` custom hook. The hook returns prepared handler bundles (e.g., `educationHandlers`, `documentsHandlers`) that the view spreads directly into the section components — same JSX, same behavior, just hoisted out of the render function.

## Files created
- `src/components/views/profile/types.ts` (317 lines) — all types + constants + helpers (Confidence, ExtractedField, ExtractionResult, DocumentItem, CharacterReference, Profile, EducationItem, WorkItem, TrainingItem, EligibilityItem, AwardItem, ReferenceData, SectionId; SECTIONS, CATEGORIES, CATEGORY_LABEL, DOC_STATUS_META, CONFIDENCE_META, EXTRACTABLE_PERSONAL; toISODate, formatFileSize, parseCharRefs, serializeCharRefs, emptyCharacterReference, formatFieldName).
- `src/components/views/profile/form-fields.tsx` (344 lines) — SectionHeader, EntityCard, FieldWithExtraction, FormField, SelectField, RefInput, StatTile.
- `src/components/views/profile/personal-info-section.tsx` (420 lines) — PersonalInfoSection + character references repeater logic.
- `src/components/views/profile/education-section.tsx` (234 lines) — EducationSection.
- `src/components/views/profile/work-experience-section.tsx` (308 lines) — WorkExperienceSection.
- `src/components/views/profile/training-section.tsx` (229 lines) — TrainingSection.
- `src/components/views/profile/eligibility-section.tsx` (271 lines) — EligibilitySection.
- `src/components/views/profile/awards-section.tsx` (241 lines) — AwardsSection.
- `src/components/views/profile/documents-section.tsx` (431 lines) — DocumentsSection + DocumentRow.
- `src/components/views/profile/extraction-review-dialog.tsx` (320 lines) — ExtractionReviewDialog + ExtractionGroup + ExtractedFieldRow + ExtractedItemCard.
- `src/components/views/profile/use-profile-data.ts` (747 lines) — `useProfileData()` hook with all state + handlers + pre-built section handler bundles.

## Files rewritten
- `src/components/views/profile-view.tsx` (3,847 → 361 lines) — thin orchestrator: imports the hook + 7 section components + ExtractionReviewDialog, renders PageHeader + progress card + left nav + right content + complete-dialog. Public `ProfileView` export unchanged (router still imports from `@/components/views/profile-view`).

## Verification
- `bun run lint`: 0 errors in new files (only pre-existing error in unrelated `nav-provider.tsx`).
- `npx tsc --noEmit --skipLibCheck`: 1 error in `use-profile-data.ts:293` — pre-existing in the original `profile-view.tsx:656` (`w.isGovtService?.value === true` comparison; `value` is `string | null` so `=== true` is dead code but harmless). Verified via `git show HEAD:src/components/views/profile-view.tsx` that the identical line existed before this refactor. Behavior preserved.
- All section components correctly import their dependencies (lucide-react icons, shadcn/ui, sonner toast, apiFetch, formatDate/formatDateTime, types, form primitives).
- `ProfileView` still exported from `src/components/views/profile-view.tsx`; `src/app/page.tsx` import unchanged.

## Notes for downstream agents
- The `useProfileData()` hook is the single source of truth for profile state. If you need to add a new section, follow this pattern: (1) add the section's state to the hook, (2) add a `xxxHandlers` bundle to the hook return, (3) import the section component in `profile-view.tsx` and spread the handlers, (4) add the section to `SECTIONS` in `types.ts` if it's a top-level nav item.
- All shared form primitives (SectionHeader, EntityCard, FormField, SelectField, etc.) live in `form-fields.tsx` — reuse them, don't reinvent.
- All shared types/constants/helpers live in `types.ts`.
