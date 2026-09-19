# Task ID: 2-pipeline-analytics
**Agent**: main (Z.ai Code)
**Task**: Build the two RMIS 2.0 analytics/pipeline workspace files (`PipelineBoard` and `AnalyticsWorkspace`) — new premium workspace components for the administrator role. Frontend only; preserve all API contracts, business logic, and navigation view names.

## Files Created
1. `/home/z/my-project/src/components/workspaces/admin/pipeline-board.tsx` — exports `PipelineBoard`
2. `/home/z/my-project/src/components/workspaces/analytics/analytics.tsx` — exports `AnalyticsWorkspace`

## Work Log

### Context reviewed
- Read prior worklog context (Task 1 + Task 2 admin Civic Enterprise refactor + Task 2-recruitment).
- Read the already-built infrastructure: `primitives/workspace.tsx` (`WorkspaceTitle`, `StatusIndicator`, `EmptyState`, `LoadingState`, `ErrorState`, `Eyebrow`, `FilterBar`, `Metric`, `SectionLabel`, `Skeleton`), `nav-provider.tsx` (`useNav()` → `{ navigate, params }`), `lib/hooks/use-admin-data.ts` (`useAdminStats` shape), `lib/client.ts` (`apiFetch`, `formatDate`, `formatDateTime`, `formatCurrency`, `fullName`), `lib/design-tokens.ts` (`stageForStatus`, `PIPELINE_STAGES`, `getStatusMeta`, `TONE_CLASSES`, type `Tone`).
- Read the existing `workspaces/recruitment/job-workspace.tsx` `PipelineTab` as the canonical pattern for horizontal stage columns + `applicantInitials`/`statusDot` helpers + queue unwrap (`Array.isArray(r) ? r : r.data ?? []`).
- Read `app/api/admin/audit-logs/route.ts` and `lib/audit-db.ts` to confirm the exact `AuditLogRow` shape and the `{ data, total, page, pageSize, hasMore, actions, summary }` envelope returned by `GET /api/admin/audit-logs`.
- Read `app/api/evaluator/queue/route.ts` to confirm the queue returns `Paginated<QueueItem>` and that admins are allowed (the route handler uses `requireEvaluatorFromReq` which accepts ADMIN — same pattern `job-workspace.tsx` and `command-center.tsx` already rely on).
- Confirmed `recharts` is installed and used in `views/admin-dashboard.tsx`.

### pipeline-board.tsx — design choices
- `WorkspaceTitle title="Pipeline" description="Cross-job recruitment pipeline — drill into any stage." actions={Refresh Button}`.
- Fetches `GET /api/evaluator/queue?page=1&pageSize=500` once on mount, defends against both `QueueItem[]` and `Paginated<QueueItem>` envelopes.
- Groups applications by `stageForStatus(status)` into 7 columns derived from `PIPELINE_STAGES` (Applied → Screening → For Evaluation → Shortlisted → Final Review → Selected → Rejected). Within each column items are sorted by `dateApplied` desc.
- Column header label uses the design-spec names exactly: New / Screening / Evaluation / Interview / Final Review / Selected / Rejected (`columnHeaderLabel` helper overrides the `PIPELINE_STAGES.label` field where the spec differs: Applied→"New", For Evaluation→"Evaluation", Shortlisted→"Interview").
- Each column: top accent bar (`h-1`) tinted by `stageAccentTone(stageKey)` (info / primary / info / success / warning / success / danger — derived from `TONE_CLASSES[tone].dot`), header with stage label + count badge (`bg-muted`, `tabular-nums`) + (if `staleCount > 0`) an amber "needs attention" hint computed as candidates whose `dateApplied` is older than `STALE_MS = 7 * 24 * 60 * 60 * 1000`, and a column body with `max-h-[60vh] overflow-y-auto` listing compact candidate cards.
- Each candidate card: avatar initials (`size-8` circular `bg-accent text-primary`), name (`truncate text-sm font-medium`), position (`truncate text-xs text-muted-foreground`, falling back to `q.job?.title` → `positionTitle` → "Untitled"), applied date (`text-[11px]`, via `formatDate`), and a status dot (color from `getStatusMeta(status).tone` via `TONE_CLASSES[tone].dot`). Click → `navigate("candidate", { id: String(q.applicant.id) })` — preserves the canonical candidate-detail deep-link contract.
- Layout: `flex flex-col lg:flex-row lg:overflow-x-auto` — vertical stack on mobile, horizontal scroll on desktop. Each column is `w-full lg:w-[260px] lg:shrink-0`.
- Below the board: a **Stage health** summary section (`Eyebrow` + `bg-card` panel) — a horizontal bar (`flex h-3 w-full overflow-hidden rounded-md`) with one segment per stage, segment width proportional to `count / total * 100`, segment color = `TONE_CLASSES[stage.tone].dot`, plus a legend grid (`grid-cols-2 sm:grid-cols-4 lg:grid-cols-7`) with dot + label + count per stage.
- States: error → `ErrorState` with retry; loading → `PipelineBoardSkeleton` (7 column skeletons matching the real layout, each with accent bar + header + 4 card skeletons); empty queue → `EmptyState` with `Inbox` icon.

### analytics.tsx — design choices
- `WorkspaceTitle title="Analytics" description="Recruitment performance and pipeline conversion." actions={Refresh Button}`.
- Refresh button calls `reloadStats()` (from `useAdminStats`) + bumps a `reloadKey` that retriggers the queue + audit fetches in a single `useEffect`.
- `useAdminStats()` for `stats.byStatus` + `stats.recent` + totals; separate `loadQueue()` fetches `GET /api/evaluator/queue?page=1&pageSize=500`; separate `loadAudit()` fetches `GET /api/admin/audit-logs?page=1&pageSize=20`. All three run in parallel on mount.
- **FilterBar**: a small "Filters" eyebrow + spacer + Recruitment-cycle Select (single placeholder option "All time" — controlled with `value="all-time"` and no-op `onValueChange`, since there is no real cycle endpoint) + "Drill into stage" Select with options All / New / Screening / Evaluation / Interview / Final review / Selected / Rejected. The stage Select drives Section 4.
- **Section 1 — Pipeline conversion funnel**: a vertical list of 6 horizontal bars (Applications → Screening → Evaluation → Interview → Final Review → Selected). Each bar's `width` is `Math.max(2, count / max * 100)%` (min 2% so a non-zero count is always visible), `backgroundColor: var(--chart-1)`. Below each bar: stage label (left), conversion `%` (only for stages 2-6, computed as `Math.round(stage.count / prev.count * 100)` with `null` when `prev.count === 0`), and the count (right). Clicking a stage calls `setStageFilter(stageKeyToFilter(stage.key))` — the metrics lead back to records (drills into Section 4).
- **Section 2 — Application volume over time**: recharts `LineChart` of the last 30 days. Volume is computed from the queue's `dateApplied` grouped by `YYYY-MM-DD` (full 30-day window is pre-seeded with zero counts so empty days still appear on the X axis). Calm styling: `CartesianGrid` with `var(--border)`, `XAxis`/`YAxis` with `var(--muted-foreground)`, `Line` with `stroke="var(--chart-1)"` `strokeWidth={2}` `dot={false}`. Tooltip uses `var(--card)` background + `var(--border)` border.
- **Section 3 — Status distribution**: recharts horizontal `BarChart` (`layout="vertical"`) of `stats.byStatus`. Y axis = status label formatted via `formatStatusLabel` (replace `_` with space, Title Case — e.g. `FOR_EVALUATION` → "For Evaluation"). X axis = count. All bars use `fill="var(--chart-1)"` (calm monochrome per spec). Chart height grows with the number of statuses: `Math.max(180, statusData.length * 32 + 24)`.
- **Section 4 — Drill-down candidate list**: a `divide-y` `<ol>` of candidates in the selected stage (`stageFilterToKey(stageFilter)` → `queue.filter(q => stageForStatus(q.status) === key)`, sorted by `dateApplied` desc). Each row: avatar (`size-9` circular `bg-accent text-primary`) + name + position + applied date + `StatusIndicator` + `ChevronRight`. Click → `navigate("candidate", { id: String(q.applicant.id) })`. When `stageFilter === "all"` shows an `EmptyState` ("Select a stage to drill in"). When filter is set but no candidates match, shows an `EmptyState` ("No candidates in {stage}"). When queue is loading, shows 5 row `Skeleton`s.
- **Section 5 — Recent activity feed**: a vertical timeline `<ol>` with `border-l-2 border-border`. Each `<li>` has a marker (`absolute -left-[7px] size-3 rounded-full border-2 border-border bg-card`) centered on the border. Each entry: top line with `user_label` (or "System") + `formatDateTime(timestamp)` (right-aligned); a second line with `Badge variant="secondary"` showing `log.action` (mono font) + `log.user_role` (uppercase, muted); and `log.description` if present. Built from `GET /api/admin/audit-logs?pageSize=20`.
- Sections 2 & 3 are in a `lg:grid-cols-2` side-by-side grid. Sections 4 & 5 are in a `lg:grid-cols-[1fr_360px]` grid (drill-down on the main column, activity feed in the rail).
- States: stats-loading → full-page `AnalyticsSkeleton`; stats-error → inline `ErrorState` above the FilterBar (rest of the page still renders); per-section skeletons (`Skeleton` for funnel, charts, drill-down list, audit timeline); per-section empty states.

## Verified
- `bun run lint` — **clean (0 errors, 0 warnings)**.
- `npx tsc --noEmit` — no errors in either of my files (the remaining errors are in `examples/websocket/*` and `prisma/seed.ts`, both outside my scope).
- Dev server (`dev.log`) — the only remaining "Module not found" is for `@/components/workspaces/settings/settings` (another agent's task; not in my scope). My two files are correctly resolved by `src/app/page.tsx` and produce no compile errors.

## API Contracts Preserved
- `GET /api/admin/stats` (via `useAdminStats()`) — `byStatus: {status,count}[]`, `recent[]`, `totalApplications`, etc. — used as-is.
- `GET /api/evaluator/queue?page=1&pageSize=500` → `Paginated<QueueItem>`, unwrapped via `Array.isArray(r) ? r : r.data ?? []` (same pattern as `job-workspace.tsx` and `command-center.tsx`). `QueueItem` shape preserved: `{ id, status, dateApplied, applicant:{id,firstName,lastName,emailAddress}, job:{id,title,position:{positionTitle,placeOfAssignment:{name}}}, assessments:[] }`.
- `GET /api/admin/audit-logs?page=1&pageSize=20` → `{ data: AuditLogRow[], total, page, pageSize, hasMore, actions: string[], summary: { totalEvents, onPage, topActions, byRole } }`. Only `data` (the `AuditLogRow[]`) is consumed for the activity timeline; `AuditLogRow` shape preserved exactly (`{ id, timestamp, user_id, user_label, user_role, action, entity_type, entity_id, description, ip_address }`).
- `navigate("candidate", { id: String(applicant.id) })` — preserved. (The only navigation call used by both files.)
- `stageForStatus(status)`, `PIPELINE_STAGES`, `getStatusMeta(status)`, `TONE_CLASSES[tone]`, `Tone` — used as-is from `@/lib/design-tokens`.
- `apiFetch`, `formatDate`, `formatDateTime`, `fullName` — used as-is from `@/lib/client`.
- All View strings match the `View` union in `nav-provider.tsx` (`"candidate"`, `"pipeline"`, `"analytics"`).

## Design System Compliance
- All colors are semantic tokens: `bg-card`, `bg-background`, `bg-accent`, `bg-muted`, `bg-secondary`, `border-border`, `text-foreground`, `text-muted-foreground`, `text-primary`, `text-primary-foreground`, `text-amber-700` (for the stale hint), `text-destructive`/`bg-destructive` (none in my code, but available).
- Chart colors use CSS variables: `var(--chart-1)`, `var(--border)`, `var(--muted-foreground)`, `var(--card)`, `var(--foreground)`. **No raw hex values anywhere in either file.**
- **No `rounded-none` anywhere** — every interactive element uses the default `rounded-md`/`rounded-lg` from shadcn/ui defaults and Tailwind's `rounded-md`/`rounded-full`/`rounded-lg` for custom elements.
- Tone classes are sourced from `TONE_CLASSES` (never inlined) — `TONE_CLASSES[tone].dot` for the dot/accent colors.
- Responsive: pipeline board is `flex flex-col lg:flex-row` (stacked on mobile, horizontal scroll on desktop, columns `w-full lg:w-[260px]`). Analytics uses `lg:grid-cols-2` (charts) and `lg:grid-cols-[1fr_360px]` (drill-down + activity).
- All clickable candidate cards have hover feedback (`hover:border-primary/40 hover:bg-accent/40`, `group-hover:text-primary`).
- Loading states use `Skeleton` from `@/components/primitives/workspace` (the project's canonical skeleton primitive).
- Empty states use `EmptyState` with semantic icon (`Inbox`, `TrendingUp`, `ActivityIcon`, `Filter`, `Users`) + title + description.
- Accessibility: every `Select` has an `aria-label`; every status dot has `aria-hidden`; the stage-health segments have `role="img"` + `aria-label`; the audit timeline marker has `aria-hidden`.

## Stage Summary
Two production-ready analytics/pipeline workspace files added. `PipelineBoard` is a TRUE workflow visualization — 7 stage columns with live candidate cards, top accent bars tinted by stage tone, "needs attention" hints for stale candidates (>7 days), and a funnel-like stage-health summary bar. `AnalyticsWorkspace` is a real recruitment analytics product — pipeline conversion funnel with click-to-drill, recharts line + horizontal bar charts (calm monochrome via `var(--chart-1)`), a stage-filtered drill-down candidate list (metrics lead back to records), and an audit-log activity timeline. All API contracts (`/api/admin/stats`, `/api/evaluator/queue`, `/api/admin/audit-logs`), navigation calls (`navigate("candidate", { id })`), view strings, and design tokens are preserved. `bun run lint` is clean. `npx tsc --noEmit` is clean for both files.
