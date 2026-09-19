# Task R5-b — Decompose evaluator-review.tsx into focused modules

## Agent
full-stack-developer

## Summary
Split the 1,435-line `src/components/views/evaluator-review.tsx` into focused modules under a new `src/components/views/evaluator/` directory, keeping the public `EvaluatorReviewView` export at the original path.

## Files Created
- `src/components/views/evaluator/types.tsx` — 254 lines
  - All shared types: `Applicant`, `Position`, `Job`, `StatusChange`, `Document`, `Assessment`, `ApplicationDetail`, `Dimension`
  - All shared constants: `DIMENSION_GROUPS`, `ALL_DIMENSIONS`, `STATUS_OPTIONS`, `OVERALL_OPTIONS`, `TYPE_OPTIONS`
  - Snapshot render helpers: `renderEducation`, `renderExperience`, `renderTraining`, `renderEligibility`, `renderAward`
  - Used `.tsx` extension (not `.ts`) because the render helpers return JSX `<FieldRow>` elements; added `"use client"` per project rule for files containing JSX.
- `src/components/views/evaluator/applicant-info-panel.tsx` — 444 lines
  - `ApplicantHeader`, `ApplicationMeta`, `SnapshotsPanel`, `ProfileSnapshot`, `ListSnapshot`, `DocumentsSnapshot`, `StatusTimeline` (entire left column).
  - `ListSnapshot`'s render-prop typed as `ReactNode` (imported from `"react"`) instead of the original `React.ReactNode` to avoid relying on a global React namespace.
- `src/components/views/evaluator/documents-panel.tsx` — 51 lines
  - `DocumentsPanel` (live documents list with view links).
- `src/components/views/evaluator/assessment-form.tsx` — 601 lines
  - `AssessmentForm`, `AssessmentFormBody`, `DimensionInput`, `FormActions`, `ConfirmDialog`, `StatusControls` (entire right column).
  - Slightly over the soft ~500-line guideline because the spec explicitly groups all right-column components in this single file.

## Files Rewritten
- `src/components/views/evaluator-review.tsx` — 1,435 → 123 lines
  - Thin orchestrator that imports the panels and composes the two-column layout.
  - Public export `EvaluatorReviewView` preserved at the same path. Consumed unchanged by `src/app/page.tsx`.
  - Dropped the unused `useMemo` import that was in the original file.

## Verification
- Ran `bun run lint`. The only error reported is a pre-existing issue in `src/components/nav-provider.tsx:66:5` (`react-hooks/set-state-in-effect`), confirmed pre-existing by stashing all changes and re-running lint.
- No lint errors in any of the new/modified evaluator files.
- `dev.log` shows Next.js compiling successfully on the latest run.

## Constraints Honored
- Pure mechanical refactor — no behavior, styling, props, API calls, or data shapes changed.
- `"use client"` added to every module file that contains JSX/components.
- Each file imports only what it uses.
- No new page routes created.
- `EvaluatorReviewView` remains at `src/components/views/evaluator-review.tsx`.
- `evaluator-review.tsx` final size (123 lines) is well under the ~200-line target.
