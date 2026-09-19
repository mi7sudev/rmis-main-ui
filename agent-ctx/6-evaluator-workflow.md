# Task ID: 6 — Evaluator Workflow (Queue + Review)

**Agent**: full-stack-developer
**Files created**:
- `src/components/views/evaluator-queue.tsx` — exports `EvaluatorQueueView`
- `src/components/views/evaluator-review.tsx` — exports `EvaluatorReviewView`

## What was built

### EvaluatorQueueView
- PageHeader "Evaluation Queue" with subtitle showing item count + submitted-assessment count
- Refresh action button (border-[#262652] outline style)
- Filter tabs: All / For Evaluation / Under Review / Shortlisted — pill bar with active state in brand navy + per-filter counts
- Card grid (sm:2 cols, xl:3 cols) for queue items
- Each card shows: applicant name, email, position applied + place of assignment, applied date, status badge, assessment state (Submitted / Draft / Pending), Review button
- Top accent strip color-coded by assessment state (emerald=submitted, amber=draft, slate=pending)
- Loading skeleton (6 cards), empty state, error state with retry
- Server-side filtering via `?status=` query (only fetches relevant subset)

### EvaluatorReviewView
- Two-column desktop layout (`lg:grid-cols-[1fr_440px]`), stacked on mobile
- Right column is sticky with its own scroll on desktop

**Left column**:
1. **ApplicantHeader** — avatar circle with initials, full name, email (mailto link), contact number, profile-complete badge, FieldRows for gender/civilStatus/citizenship
2. **ApplicationMeta** — position, item no., place of assignment, salary grade, date applied, current status badge; MQR results grid (4 categories with pass/fail icons + text); CSC Qualification Standards section
3. **SnapshotsPanel** — Tabs component with 7 tabs (Personal / Education / Experience / Training / Eligibility / Awards / Documents) each showing count; profile snapshot rendered with FieldRow entries; arrays rendered as numbered entries with FieldRows; documents list with category + status
4. **DocumentsPanel** — live documents list (max-h-72 scrollable) with file links `/{filePath}` opening in new tab
5. **StatusTimeline** — vertical timeline with status badges, datetime, changedBy name, optional reason callout

**Right column**:
1. **AssessmentForm** — 11 rating dimensions grouped into 3 sections (Qualifications / Skills & Competencies / Growth & Engagement); each dimension has:
   - Label + colored rating badge (emerald ≥8, amber ≥5, red <5)
   - Number input (1-10) + Slider side-by-side
   - Textarea for comments (compact min-h-12)
   - Overall Assessment Rating (Select with 4 enum values)
   - Type of Application (Select: Internal / Government / Non-Government)
   - Year (text input, defaults to current year)
   - Comment and Recommendation (Textarea min-h-24)
   - Save Draft button (POSTs without overallAssessmentRating) + Submit Assessment button (teal #46D9D1 with brand navy text)
   - Submit opens a confirmation Dialog showing selected rating label + warning that status will auto-update to EVALUATED
   - If already submitted: badge shows current rating, button label changes to "Re-submit Assessment"
2. **StatusControls** — Select dropdown for new status + reason textarea + Apply button (only enabled when status differs); creates audit entry via PATCH /api/evaluator/applications/[id]

## API endpoints used
- `GET /api/evaluator/queue?status=FOR_EVALUATION` — list with applicant + job + assessments (filtered to current evaluator)
- `GET /api/evaluator/applications/[id]` — full application with parsed snapshots + live documents + statusChanges
- `GET /api/evaluator/assessments/[applicationId]` — handled via assessments[] already in app detail response
- `POST /api/evaluator/assessments/[applicationId]` — upsert assessment (without overallAssessmentRating = draft, with = submit which also auto-flips status to EVALUATED)
- `PATCH /api/evaluator/applications/[id]` — body `{ status, reason? }` to manually change status

## Design system adherence
- Brand navy `#262652` for primary buttons, active states, status timeline markers
- Teal `#46D9D1` for Submit Assessment CTA (with navy text for contrast)
- shadcn/ui components used: Button, Input, Label, Skeleton, Slider, Textarea, Select, Tabs, Dialog, Accordion (imported but used Tabs instead for snapshot navigation)
- Shared components: PageHeader, ErrorState, StatusBadge, SectionCard, FieldRow
- lucide-react icons throughout
- sonner toast for feedback
- All states handled: loading (skeletons), error (ErrorState with retry), empty (EmptyState with action)
- Mobile-first responsive — single column on mobile, two columns on desktop, sticky right column on lg

## Lint status
- `bun run lint`: clean for both new files (only pre-existing error in nav-provider.tsx, unrelated)
- `tsc --noEmit`: 0 errors in evaluator-queue.tsx and evaluator-review.tsx

## Notes for downstream agents
- The assessment form is keyed off `existing?.id` to re-initialize when switching applications — be careful not to re-init on every keystroke (would clobber user input)
- The "Submit Assessment" flow trusts the backend to update application status to EVALUATED (it does — see `/api/evaluator/assessments/[applicationId]/route.ts` line 60-74)
- Status timeline renders below DocumentsPanel — if many status changes exist, the left column will grow long; the right column is sticky so the form stays accessible
- The queue's "Assessed" indicator uses `assessments.length > 0` (per task spec) — finer-grained Submitted vs Draft distinction is exposed via `overallAssessmentRating !== null`
