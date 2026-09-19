# Task ID: 2-recruitment
# Agent: main (Z.ai Code)
# Task: Build the two RMIS 2.0 recruitment workspace files

## Files Created
1. `/home/z/my-project/src/components/workspaces/recruitment/recruitment-list.tsx` — exports `RecruitmentList`
2. `/home/z/my-project/src/components/workspaces/recruitment/job-workspace.tsx` — exports `JobWorkspace`

## Work Log

### Setup
- Read `/home/z/my-project/worklog.md` (prior Task 1 + admin-civic-enterprise refactor context).
- Read existing infrastructure:
  - `src/components/primitives/workspace.tsx` (WorkspaceTitle, StatusIndicator, EmptyState, LoadingState, ErrorState, Eyebrow, FilterBar, Metric, SectionLabel, Skeleton).
  - `src/components/nav-provider.tsx` (useNav → { view, params, navigate }).
  - `src/lib/hooks/use-admin-data.ts` (useJobs, isJobActive, appCount, type JobRow).
  - `src/lib/client.ts` (apiFetch, formatDate, formatCurrency, fullName).
  - `src/lib/design-tokens.ts` (stageForStatus, PIPELINE_STAGES, TONE_CLASSES, getStatusMeta).
  - `src/components/views/admin/types.ts` (type Position, POSITION_TYPES, toDateInput).
  - `src/components/views/admin/jobs-tab.tsx` (the legacy JobsTab — used as the source of truth for the textToHtml helper + JobFormDialog body construction).
  - `src/components/common/safe-html.tsx` (SafeHtml exists → use it for rendering `*Html` fields).
  - `src/app/api/evaluator/queue/route.ts` (queue shape: `{ id, status, dateApplied, applicant: { id, firstName, lastName, emailAddress, ... }, job: { id, title, position: { positionTitle, placeOfAssignment: { name } } } }`).
  - `src/lib/auth.ts` — confirmed `requireEvaluatorFromReq` accepts both EVALUATOR and ADMIN roles, so admin-side fetching of `/api/evaluator/queue` works.
  - `src/components/workspaces/admin/command-center.tsx` — already-built workspace showing the queue unwrap pattern (`Array.isArray(r) ? r : r.data ?? []`).

### recruitment-list.tsx
- **Composition**: WorkspaceTitle (with Refresh + Create Job actions) → FilterBar (debounced search + status Select + sort Select) → rich list of wide clickable JobRowCard rows → client-side pagination footer.
- **Search**: 350ms debounce via `setTimeout` ref; matches against title, itemNumber, and place of assignment.
- **Status filter**: All / Open / Closed — uses `isJobActive(job)` for the open/closed derivation (preserves the business rule `isActive && (!deadlineDate || deadline >= now)`).
- **Sort**: Recently posted (publishDate desc) / Deadline (asc, with nulls at the end via `Infinity`) / Applications (count desc, via `appCount`).
- **JobRowCard**: `<button>` with flex layout — LEFT (title + positionType + Item No. + place with MapPin), MIDDLE (vacancy count with Users + monthly salary with Banknote via `formatCurrency(job.position?.salaryAmount)`), RIGHT (application count with ClipboardList + deadline with Calendar — `text-destructive` when overdue — + StatusIndicator OPEN/CLOSED). Click → `navigate("job", { id: String(job.id) })`.
- **Empty state**: `EmptyState` with Briefcase icon, "No job postings" title, "Create a job posting to start recruiting." description, and a Create Job button.
- **Loading**: 5 × `Skeleton h-20 w-full rounded-lg` rows.
- **Error**: `ErrorState` with retry → `reload()`.
- **Pagination**: PAGE_SIZE=10, slice locally. Showing X–Y of N jobs. Prev/Next + "Page X of Y" indicator.
- **JobFormDialog** (inline create/edit): `sm:max-w-2xl`, position Select (from `/api/admin/positions?page=1&pageSize=50`, "none" placeholder for unlinked), positionType Select (POSITION_TYPES), numberOfVacancy Input (number min=1), title Input (required), briefDescription/duties/compensation/otherQual Textareas, publishDate/deadlineDate/processingDate date inputs. `formValid = title.trim() && parseInt(numberOfVacancy) > 0`. On submit → POST /api/jobs (create) or PATCH /api/jobs/:id (edit), with `textToHtml()` companions for the four text fields (`briefDescriptionHtml`, `dutiesResponsibilitiesHtml`, `compensationPackageHtml`, `otherQualificationsHtml` — all `null` when empty). Toast on success/error.
- **textToHtml** helper: split on `\n\s*\n` (blank-line paragraphs), escape `&<>`, convert `\n`→`<br/>`, wrap each in `<p>`, return `null` when empty. Mirrors the legacy `jobs-tab.tsx` implementation byte-for-byte.
- **Position loading** uses an inline `useEffect` with `.then()`/`.catch()` (NOT a `useCallback` indirection) to satisfy the `react-hooks/set-state-in-effect` lint rule.

### job-workspace.tsx
- **Entry**: reads `params.id` from `useNav()`, finds the job from `useJobs()` (memoized). If `jobsLoading && !job` → LoadingState. If `jobsError && !job` → ErrorState with retry. If `!job` → EmptyState "Job not found" with a Back to Recruitment button.
- **Contextual header**: ghost "Recruitment" breadcrumb button, then `h1` text-2xl font-semibold + StatusIndicator (OPEN/CLOSED via `isJobActive`), then meta line (positionType · Item No. · place with MapPin · Deadline with Calendar). Primary actions: "Back to Recruitment" outline button + "Edit" primary button (opens JobEditDialog).
- **Tabs** (shadcn Tabs): Overview · Pipeline · Candidates · Activity. The Pipeline tab shows a `Badge` with `jobQueue.length` when > 0.
- **Queue data**: fetches `/api/evaluator/queue?page=1&pageSize=500` once on mount (admin can call it — `requireEvaluatorFromReq` accepts ADMIN role). Unwraps `Paginated` envelope (`Array.isArray(r) ? r : r.data ?? []`). Memoized `jobQueue` filters `q.job?.id === Number(params.id)`.
- **OverviewTab**: two-column split `grid lg:grid-cols-[1fr_320px] gap-6`.
  - LEFT: four `SectionLabel`-divided sections (Brief Description / Duties & Responsibilities / Compensation Package / Other Qualifications). Each renders `<SafeHtml>` if `*Html` exists, else plain `<p>` with the raw text, else a muted italic "Not specified." fallback.
  - RIGHT (sticky `lg:sticky lg:top-6`): Summary card with Metric grid (Vacancies + Monthly Salary + Salary Grade + Applications) + DateRow list (Published / Deadline — destructive when overdue / Processing). Below it: a Pipeline card with a 5-dot mini-pipeline visualization (Applied → Screening → For Evaluation → Shortlisted → Final Review) — each dot shows the count, colored `bg-primary text-primary-foreground` when count > 0 else muted. Plus a 2-column footer for Selected (emerald) + Rejected (destructive) counts.
- **PipelineTab**: horizontal scrollable board (7 columns from `PIPELINE_STAGES`). Each column has a header (dot + label + count badge) + scrollable list of compact candidate chips (initials avatar + name + applied date + status dot). Click a chip → `navigate("candidate", { id: String(q.applicant.id) })`. Empty cells render "—". Loading / Error / Empty states handled.
- **CandidatesTab**: compact shadcn Table. Columns: Name (initials avatar + name + email), Status (StatusIndicator), Applied date, Action (View → candidate). Sorted by dateApplied desc. Empty/loading/error states handled.
- **ActivityTab**: timeline list. Each entry: avatar + "Applied by {name}" + position + relative date (via `Intl.RelativeTimeFormat`) + StatusIndicator. Clickable → candidate.
- **JobEditDialog**: separate component (reuses the same fields/logic as recruitment-list's JobFormDialog, but pre-fills from the `job` prop and PATCHes on submit). Loads positions once when opened.

### Helpers (local)
- `applicantName`, `applicantInitials` — derive from queue's `applicant` object using `fullName`.
- `statusDot(status)` — maps application status to a tailwind dot color (blue/primary/emerald/amber/red/muted) for the pipeline column headers and chips.
- `relativeTime(iso)` — `Intl.RelativeTimeFormat("en", { numeric: "auto" })` for the Activity tab.
- `miniStageLabel(stage)` — short labels for the mini-pipeline (New/Screening/Eval/Interview/Final).
- `DateRow` — small inline row component for the metrics aside.

## Verified
- `bun run lint` — **clean (0 errors, 0 warnings)** after the `useCallback` cleanup (initial run flagged `react-hooks/set-state-in-effect` for the `loadPositions` indirection — fixed by inlining the `.then()` chain).
- Dev server (`/home/z/my-project/dev.log`) — the two recruitment files no longer appear in "Module not found" errors. The remaining errors (`candidates/candidate-workspace`, `candidates/candidate-detail`, `evaluator/review-queue`, `evaluator/review-workspace`, `settings/settings`, `admin/pipeline-board`, `analytics/analytics`) are all OTHER agents' files — none of them reference my recruitment files.

## API Contracts Preserved
- `GET /api/jobs` → consumed via `useJobs()` hook (plain `JobRow[]`).
- `GET /api/admin/positions?page=1&pageSize=50` → `{ data: Position[], total, ... }`, unwrapped via `Paginated<Position>`.
- `POST /api/jobs` body shape EXACTLY matches the spec: `{ title, positionId: null|"none"→null|string, positionType: null|string, numberOfVacancy: int, briefDescription, briefDescriptionHtml, dutiesResponsibilities, dutiesResponsibilitiesHtml, compensationPackage, compensationPackageHtml, otherQualifications, otherQualificationsHtml, publishDate, deadlineDate, processingDate }`. All date fields → `new Date(input).toISOString()` or `null`. All `*Html` fields → `textToHtml(text)` (null when empty).
- `PATCH /api/jobs/:id` — same body shape (partial). Used by JobEditDialog.
- `GET /api/evaluator/queue?page=1&pageSize=500` → `{ data: QueueItem[], total, ... }` Paginated envelope. Unwrapped via `Array.isArray(r) ? r : r.data ?? []` (defensive — supports both shapes).
- `navigate("job", { id: String(job.id) })` — preserved (RecruitmentList → job workspace).
- `navigate("candidate", { id: String(q.applicant.id) })` — preserved (Pipeline/Candidates/Activity tabs).
- `navigate("recruitment")` — preserved (Back to Recruitment).
- All View strings (`"job"`, `"candidate"`, `"recruitment"`) — match the View union in `nav-provider.tsx`.
- `positionId === "none"` → `null` in the POST/PATCH body (preserved rule from `positions-tab.tsx`).
- `positionType` empty string → `null` in the POST/PATCH body (preserved).
- `parseInt(numberOfVacancy, 10) || 1` — preserved (defensive against NaN).
- Toast messages via `import { toast } from "sonner"` — success and error variants preserved.

## Design Tokens Used
- Semantic tokens only: `bg-card`, `bg-background`, `bg-accent`, `bg-secondary/60`, `bg-primary`, `text-primary`, `text-primary-foreground`, `text-foreground`, `text-muted-foreground`, `text-muted-foreground/40` (separator dots), `text-muted-foreground/60` (italic fallbacks), `text-muted-foreground/70` (icon strokes), `border-border`, `border-primary/40` (hover borders), `hover:bg-accent/30`, `hover:bg-accent/40`, `hover:bg-accent/50`, `hover:text-primary`, `text-destructive`, `bg-destructive` (none directly — destructive text only), `bg-emerald-500/700`, `bg-amber-500`, `bg-blue-500`, `bg-red-500`, `bg-primary` for status dots (mirrors `TONE_CLASSES` in design-tokens.ts).
- No raw hex codes (`#003876`, `#123B63`, etc.) — the `bg-primary`/`text-primary` indirection is used throughout.
- No `rounded-none` — defaults to shadcn radii (8–12px).
- Responsive: `grid lg:grid-cols-[1fr_320px]`, `sm:flex-row`, `sm:grid-cols-2`, `sm:grid-cols-3`, `lg:sticky`, `lg:top-6`, `lg:self-start`, `max-w-[1400px] mx-auto`, `sm:w-40`, `sm:w-52`, `w-64 shrink-0` (pipeline columns).
- Long lists: pipeline columns have `max-h-[60vh] overflow-y-auto`.

## Stage Summary
Two production-ready recruitment workspace files added: `RecruitmentList` (rich list with filters, pagination, inline create/edit dialog) and `JobWorkspace` (contextual header + 4 tabs: Overview with sticky metrics aside and mini-pipeline, Pipeline board, Candidates table, Activity timeline). All API contracts, business logic, navigation view names, and the textToHtml helper are preserved byte-for-byte from the legacy `jobs-tab.tsx` reference. `bun run lint` is clean. The dev server compiles the two files without errors (the only remaining "Module not found" errors in dev.log are for other agents' unbuilt workspaces — settings/candidates/evaluator/analytics/pipeline-board — none of which my files depend on).
