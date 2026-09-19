# Task ID: 2-candidates
# Agent: main (Z.ai Code)
# Task: Build the three RMIS 2.0 candidate workspace files

## Files Created
1. `/home/z/my-project/src/components/workspaces/candidates/candidate-drawer.tsx` — exports `CandidateDrawer`
2. `/home/z/my-project/src/components/workspaces/candidates/candidate-workspace.tsx` — exports `CandidateWorkspace`
3. `/home/z/my-project/src/components/workspaces/candidates/candidate-detail.tsx` — exports `CandidateDetail`

## Work Log

### Setup
- Read `/home/z/my-project/worklog.md` (Task 1 setup + Task 2-recruitment precedent).
- Read existing infrastructure:
  - `src/components/primitives/workspace.tsx` — WorkspaceTitle, StatusIndicator, EmptyState, LoadingState, ErrorState, Eyebrow, FilterBar, Metric, SectionLabel, Skeleton.
  - `src/components/nav-provider.tsx` — useNav → { view, params, navigate }. Views include: `candidates`, `candidate`, `evaluator-review`.
  - `src/lib/client.ts` — apiFetch, formatDate, formatDateTime, formatCurrency, fullName.
  - `src/lib/design-tokens.ts` — stageForStatus, PIPELINE_STAGES, getStatusMeta, TONE_CLASSES, normalizeStatusKey, Tone type.
  - `src/components/views/evaluator/types.tsx` — renderEducation, renderExperience, renderTraining, renderEligibility, renderAward (shared snapshot renderers returning FieldRow arrays).
  - `src/components/views/profile/types.ts` — CATEGORY_LABEL, DOC_STATUS_META, formatFileSize, CharacterReference type.
  - `src/components/views/shared.tsx` — FieldRow (modern dl/dt/dd renderer).
  - `src/components/views/applicant-details-view.tsx` — reference for ApplicantDetail shape (id, name fields, contact, demographics, address, isProfileComplete, educations[], workExperiences[], trainings[], eligibilities[], awards[], characterReferences[]|null, documents[], applications[]).
- Read API routes:
  - `src/app/api/admin/applicants/route.ts` — paginated list contract (`?page=&pageSize=&search=&status=&hasAccount=` → `{ data: ApplicantRow[], total, page, pageSize, hasMore }`).
  - `src/app/api/admin/applicants/[id]/route.ts` — full ApplicantDetail response shape.
  - `src/app/api/evaluator/queue/route.ts` — QueueItem shape (id, status, dateApplied, applicant, job, assessments).
- Read pattern precedent:
  - `src/components/workspaces/recruitment/recruitment-list.tsx` — debounced search, segmented control pattern, FilterBar usage, pagination footer.
  - `src/components/workspaces/admin/command-center.tsx` — queue unwrap pattern (`Array.isArray(r) ? r : r.data ?? []`).
  - `src/lib/hooks/use-admin-data.ts` — `useJobs` async `load` pattern that satisfies `react-hooks/set-state-in-effect` rule.

## candidate-drawer.tsx
- **Dual-variant shell**: `variant?: "sheet" | "panel"` (default `"sheet"`). 
  - Sheet: renders via `<Sheet>` + `<SheetContent side="right" className="w-full flex-col gap-0 p-0 sm:max-w-[440px]">`. Honours `open`/`onOpenChange`.
  - Panel: renders as a static `<aside className="hidden h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-card lg:flex">`. Always visible on desktop; CSS-hidden on mobile.
- **Props**: `{ applicantId: number | null, open: boolean, onOpenChange: (v:boolean)=>void, variant? }`.
- **Data fetching**: `DrawerBody` is the shared inner component (rendered inside both variants). Uses an `async run()` IIFE pattern with `cancelled` guard to satisfy `react-hooks/set-state-in-effect`. Fetches `GET /api/admin/applicants/:id` when:
  - `applicantId` is non-null, AND
  - we haven't already loaded this applicant (`loadedId !== applicantId || !data`), AND
  - (for `sheet` variant only) `open === true` (panel variant always fetches when applicantId is set).
- **Loaded content** (`DrawerLoaded`):
  - Header: size-12 circular avatar (`Avatar` + `AvatarFallback` with `bg-primary text-primary-foreground`) + name (via `fullName`) + "Applicant #ID" muted + close X button (top-right).
  - Profile complete chip: emerald (`border-emerald-200 bg-emerald-50 text-emerald-700` + `CheckCircle2`) or amber (`border-amber-200 bg-amber-50 text-amber-700` + `AlertCircle`).
  - Contact: `Eyebrow` "Contact" header + mailto email link + phone (with `Mail`/`Phone` icons).
  - Mini horizontal dot timeline: 5 stages (Submitted → Screening → Evaluation → Interview → Final) mapped from canonical `PIPELINE_STAGES` keys. `computeHighestStage(applications)` returns the highest index reached; terminal Selected/Rejected fill the entire timeline. Each stage shows a filled/unfilled dot with `CheckCircle2` glyph + label. Empty-state "No applications yet" when none.
  - Education section: `renderEducation` over the first 2 entries (each wrapped in a bordered `rounded-md` card with "Entry N" eyebrow), "+N more entries — view full profile" hint when > 2.
  - Documents section: list of `detail.documents` — each row links to `/api/files/${filePath}` (new tab), shows `FileText` icon + filename + category label (CATEGORY_LABEL) + size (`formatFileSize`) + status badge (DOC_STATUS_META color/bg).
  - Footer: "View full profile" button → `navigate("candidate", { id: String(data.id) })`.
- **States**: Loading skeleton (avatar + name + chip + 3 sections + footer); error state ("Unable to load profile" with AlertCircle icon); empty placeholder when no applicant is selected ("Select a candidate to preview" with Mail icon).

## candidate-workspace.tsx
- **Composition**: `WorkspaceTitle` (title="Candidates", description="Browse and manage all applicant records", Refresh button) → `FilterBar` → body.
- **FilterBar contents**:
  - Search Input with `Search` icon (350ms debounced via `setTimeout` ref → `setSearch` + `setPage(1)`).
  - Profile-completion Select (All / Complete / Incomplete) — initial value derived from `params.status` deep-link (Command Center "Incomplete profiles" attention card).
  - Account Select (All / Has login / No login).
  - Segmented control (LIST | KANBAN) — built as a custom inline-flex with two `SegmentedButton` components (active state via `bg-primary text-primary-foreground`).
- **LIST view** (default): two-column `grid lg:grid-cols-[1fr_440px]`.
  - LEFT: bordered `rounded-lg bg-card` container with `ScrollArea max-h-[70vh]` of candidate rows (`<ul className="divide-y divide-border">`). Each `CandidateListRow` is a `<button>` showing: size-10 avatar (initials) + name (font-semibold) + profile-complete chip + email (with Mail icon) + application count badge (ClipboardList icon) + "No login" hint when applicable. Row click → `handleRowClick(id)` which sets `selectedId` and (mobile only) opens the Sheet via `setDrawerOpen(true)`.
  - Pagination footer: "Showing X–Y of N candidates" + Prev/Next buttons + "Page X of Y" indicator.
  - RIGHT: `<CandidateDrawer variant="panel">` rendered conditionally via `renderPanel={isDesktop}` (avoid duplicate fetches on mobile where the sheet already fetches).
- **KANBAN view**: fetches `/api/evaluator/queue?page=1&pageSize=500`, unwraps via `Array.isArray(r) ? r : r.data ?? []`, groups by `stageForStatus(item.status)` into 7 `PIPELINE_STAGES` columns (Applied/Screening/For Evaluation/Shortlisted/Final Review/Selected/Rejected).
  - Each column: header (tone-colored dot via `stageDotClass(stageKey)` + short label + count badge) + `ScrollArea max-h-[60vh] lg:max-h-[65vh]` of compact `KanbanCard`s.
  - Each card: size-8 avatar + name (truncate) + position/place (truncate, title attribute) + status dot (via `TONE_CLASSES[meta.tone].dot` from `getStatusMeta`) + "Applied {date}" via `formatDate`.
  - Click → `navigate("candidate", { id: String(applicant.id) })`.
  - Layout: `grid gap-3 lg:grid-flow-col lg:auto-cols-[280px] lg:overflow-x-auto lg:pb-2` (horizontal scroll desktop, stacked mobile).
- **Mobile/Desktop detection**: `useIsDesktop` hook with `matchMedia("(min-width: 1024px)")` + `queueMicrotask` for initial read (satisfies `react-hooks/set-state-in-effect`).
- **States**: ListSkeleton (8 row skeletons), KanbanView skeleton columns, ErrorState with retry, EmptyState ("No candidates found" / "No applications in the pipeline").
- **Deep-link**: `params.status === "incomplete"` → `initialStatus = "incomplete"`. (Future: "complete" also supported.)

## candidate-detail.tsx
- **Entry**: reads `params.id` from `useNav()`. Loading skeleton, error with retry, empty state if not found. `load` is `async` with try/await/catch/finally (matches `useJobs` pattern).
- **Contextual header** (`ContextualHeader`):
  - Breadcrumb row: ghost "← Candidates" button (ArrowLeft + ChevronRight + name) + spacer + "Back" outline button.
  - Identity row: size-14 avatar (initials `bg-primary text-primary-foreground`) + h1 name (text-2xl font-semibold tracking-tight) + profile-complete chip (emerald/amber) + StatusIndicator (from most-recent application's status, computed by sorting applications by dateApplied desc) + subtitle "Applied for {position}" when a latest application exists.
- **Tabs** (shadcn Tabs, custom `TabsList` with `bg-secondary border-border p-1` + `flex-wrap`): Overview · Education · Experience · Training · Eligibility · Awards · Documents · Applications. Each `DetailTabsTrigger` has an icon (UserIcon/GraduationCap/Briefcase/BookOpen/ShieldCheck/AwardIcon/FileStack/ClipboardList) + label + count badge (only shown when count > 0).
- **Overview tab**: 3 sections divided by `SectionLabel`:
  1. Personal Information — bordered `rounded-lg bg-card` with `<dl className="divide-y divide-border">` of `FieldRow` entries (Full Name, First/Middle/Last Name, Extension, Gender, Civil Status, Citizenship, Birth Date via formatDate, Birth Place).
  2. Contact Information — grid of 4 `ContactRow` cards (Email/Phone/Birth Date/Address), each with an icon badge (`bg-accent text-primary`).
  3. Character References — grid of 2-column ref cards with name, title, company, email, contact (Mail/Phone icons). Empty-state when no refs.
- **Education/Experience/Training/Eligibility/Awards tabs**: each renders an `EntityList` — read-only bordered `rounded-md` cards per entry with "Entry N" eyebrow (via `Eyebrow`), wrapped `<dl className="divide-y divide-border">` with the shared renderer (`renderEducation`/`renderExperience`/`renderTraining`/`renderEligibility`/`renderAward`). Empty state when no entries.
- **Documents tab**: grid of document `<a>` links (`/api/files/${filePath}` with `target="_blank"`). Each card: `FileText` icon + filename + category label (CATEGORY_LABEL) + size (`formatFileSize`) + "Uploaded {date}" + status badge (DOC_STATUS_META lookup).
- **Applications tab**: list of `detail.applications[]` — each `<button>` shows position title + StatusIndicator + "Applied {date}" + ChevronRight; click → `navigate("evaluator-review", { id: String(app.id) })` (String coercion preserved exactly).
- **States**: Loading skeleton (breadcrumb + avatar + h1 + tabs + content skeletons); ErrorState with retry; EmptyState per-tab when no entries.

## Lint Rule Compliance
- Initial lint run flagged 5 `react-hooks/set-state-in-effect` errors:
  1. `candidate-detail.tsx:152:5` — `load()` callback called from useEffect. Fixed by declaring `load` as `async` with try/await/catch/finally (matches `useJobs` pattern).
  2. `candidate-drawer.tsx:177:7` — synchronous `setData(null)/setError(null)/setLoadedId(null)` when applicantId is null. Fixed by replacing with a no-op return (render guards handle the placeholder).
  3. `candidate-workspace.tsx:209:5` — main `load()` callback. Fixed by declaring `load` as `async` with try/await/catch/finally.
  4. `candidate-workspace.tsx:545:5` — KanbanView's inline `setLoading(true)` + `.then()/.catch()/.finally()` chain. Fixed by extracting `loadQueue` as `async` useCallback.
  5. `candidate-workspace.tsx:756:5` — `useIsDesktop` synchronous `setIsDesktop(mq.matches)`. Fixed by wrapping in `queueMicrotask(...)`.
- Final `bun run lint` — **clean (0 errors, 0 warnings)**.

## Verified
- `bun run lint` — clean.
- Dev server (`/home/z/my-project/dev.log`) — the three candidate files no longer appear in "Module not found" errors. The remaining errors (`settings/settings`, `analytics/analytics`, `admin/pipeline-board`, `evaluator/review-queue`, `evaluator/review-workspace`) are all OTHER agents' files — none of them reference my candidate files.

## API Contracts Preserved
- `GET /api/admin/applicants?page=&pageSize=&search=&status=complete|incomplete&hasAccount=yes|no` → `{ data: ApplicantRow[], total, page, pageSize, hasMore }` (Paginated envelope). ApplicantRow fields preserved exactly as documented in the spec.
- `GET /api/admin/applicants/:id` → ApplicantDetail (full live profile with applications[], documents[], characterReferences[]|null, educations[], workExperiences[], trainings[], eligibilities[], awards[]).
- `GET /api/evaluator/queue?page=1&pageSize=500` → `{ data: QueueItem[] }` (Paginated envelope, defensively unwrapped via `Array.isArray(r) ? r : r.data ?? []`).
- `GET /api/files/:filePath` — document preview/download URL.
- `navigate("candidate", { id: String(id) })` — preserved (drawer footer + kanban card + mobile sheet footer).
- `navigate("candidates")` — preserved (detail header Back button + breadcrumb).
- `navigate("candidates", { status: "incomplete" })` — deep-link from Command Center attention card (read via `params.status`).
- `navigate("evaluator-review", { id: String(app.id) })` — preserved (detail Applications tab) with String() coercion.
- All View strings match the View union in `nav-provider.tsx` (`candidates`, `candidate`, `evaluator-review`).
- `stageForStatus(status)` from `@/lib/design-tokens` — used in the kanban column grouping and the drawer's mini-pipeline computation.
- `PIPELINE_STAGES` from `@/lib/design-tokens` — used as the kanban column source of truth (7 columns: Applied/Screening/For Evaluation/Shortlisted/Final Review/Selected/Rejected).
- `getStatusMeta` + `TONE_CLASSES` from `@/lib/design-tokens` — used for status dots in the kanban cards.
- Shared renderers `renderEducation`/`renderExperience`/`renderTraining`/`renderEligibility`/`renderAward` from `@/components/views/evaluator/types` — used in both drawer (education only) and detail (all five).
- `CATEGORY_LABEL`, `DOC_STATUS_META`, `formatFileSize` from `@/components/views/profile/types` — used for document display in both drawer and detail.
- `CharacterReference` type from `@/components/views/profile/types` — used as the type for `detail.characterReferences`.
- `FieldRow` from `@/components/views/shared` — used in the detail Overview tab's Personal Information dl.
- `fullName`, `formatDate` from `@/lib/client` — used throughout.

## Design Tokens Used
- Semantic tokens only: `bg-card`, `bg-background`, `bg-accent`, `bg-accent/30`, `bg-accent/40`, `bg-accent/50`, `bg-accent/60`, `bg-secondary`, `bg-primary`, `text-primary`, `text-primary-foreground`, `text-foreground`, `text-muted-foreground`, `text-muted-foreground/40`, `text-muted-foreground/50`, `text-muted-foreground/60`, `text-muted-foreground/70`, `text-muted-foreground/80`, `border-border`, `border-primary/30`, `border-primary/40`, `border-emerald-200`, `bg-emerald-50`, `text-emerald-700`, `border-amber-200`, `bg-amber-50`, `text-amber-700`, `bg-emerald-500/600`, `bg-amber-500`, `bg-blue-500`, `bg-sky-500`, `bg-red-500`, `bg-slate-400`, `ring-1 ring-inset ring-primary/30`, `ring-2 ring-primary/30 ring-offset-1`.
- No raw hex codes — uses Tailwind semantic classes and `bg-primary`/`text-primary` indirection throughout.
- No `rounded-none` — defaults to shadcn radii (`rounded-md`/`rounded-lg`/`rounded-full`).
- Responsive: `lg:grid-cols-[1fr_440px]`, `lg:grid-flow-col lg:auto-cols-[280px] lg:overflow-x-auto`, `sm:grid-cols-2`, `sm:max-w-[440px]`, `lg:hidden`, `hidden lg:block`, `hidden lg:flex`, `max-h-[70vh]`, `max-h-[60vh] lg:max-h-[65vh]`.
- Long list handling: `ScrollArea` with `max-h-[70vh]` for the candidate list, `max-h-[60vh]/65vh` for kanban columns, `overflow-y-auto` for drawer body.

## Stage Summary
Three production-ready candidate workspace files added. `CandidateDrawer` is a dual-variant (sheet/panel) quick-view panel with avatar header, contact links, 5-stage mini-pipeline timeline, education summary, document list, and "View full profile" footer. `CandidateWorkspace` is a list+kanban browse experience with debounced search, profile-completion and account filters, segmented view toggle, server-side pagination (PAGE_SIZE=25), deep-link support from the Command Center, and persistent inline drawer preview (desktop) / Sheet drawer (mobile). `CandidateDetail` is a deep-dive workspace with a contextual breadcrumb header, 8 tabs (Overview · Education · Experience · Training · Eligibility · Awards · Documents · Applications), shared snapshot renderers for read-only entity lists, and clickable application history that navigates to the evaluator review workspace. All API contracts, business logic, navigation view names, and the shared renderers are preserved. `bun run lint` is clean.
