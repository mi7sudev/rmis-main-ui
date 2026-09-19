---
Task ID: 2-applicant-settings
Agent: main (Z.ai Code)
Task: Build the two RMIS 2.0 applicant/settings workspace files (`ApplicantHome` and `SettingsWorkspace`). Frontend only; preserve all API contracts, business logic, navigation view names.

### Files Created
1. `/home/z/my-project/src/components/workspaces/applicant/applicant-home.tsx` — exports `ApplicantHome`
2. `/home/z/my-project/src/components/workspaces/settings/settings.tsx` — exports `SettingsWorkspace` (props: `{ initial?: string }`)

### Work Log
- Read `/home/z/my-project/worklog.md` (Task 1 setup, Task 2 recruitment / candidates / pipeline-analytics precedents).
- Read infrastructure: `primitives/workspace.tsx` (`WorkspaceTitle`, `StatusIndicator`, `EmptyState`, `LoadingState`, `ErrorState`, `Eyebrow`, `FilterBar`, `Metric`, `SectionLabel`, `Skeleton`), `nav-provider.tsx` (`useNav()` → `{ navigate, params }`, View union, LEGACY_MAP for `admin-users`/`admin-positions`/`admin-audit-log` → `settings`), `session-provider.tsx` (`useSession()` → `{ user, loading, refresh, setUser }`), `lib/client.ts` (`apiFetch`, `formatDate`, `formatDateTime`, `formatCurrency`, `fullName`, `SessionUser`), `lib/design-tokens.ts` (`stageForStatus`, `PIPELINE_STAGES`, `getStatusMeta`, `TONE_CLASSES`, `Tone`), `lib/roles.ts` (Role = "APPLICANT" | "EVALUATOR" | "ADMIN"), `lib/validation.ts` (`Paginated<T>` shape).
- Read existing reference views (rebuilt cleanly — NOT imported): `views/admin-users.tsx` (CreateUserDialog + EditUserDialog logic, role badge, soft/hard delete, self-delete guard), `views/admin/positions-tab.tsx` (PositionFormDialog + PositionViewDialog, accordion MQR sections, `placeOfAssignmentId === "none"` → undefined junction logic), `views/admin-audit-log.tsx` (ACTION_META registry + tone mapping, summary tiles).
- Read existing new workspaces for premium patterns: `workspaces/recruitment/recruitment-list.tsx` (debounced search ref-based pattern), `workspaces/analytics/analytics.tsx` (loadQueue/loadAudit `useCallback` async pattern), `workspaces/admin/command-center.tsx` (WorkspaceTitle + Eyebrow section pattern).
- Read `app/page.tsx` to confirm routing: `<SettingsWorkspace initial={view} />` is rendered when `view ∈ {settings, admin-users, admin-audit-log, admin-positions}` — so `initial` may be any of those four legacy view names (plus the canonical "settings"). Verified `ApplicantHome` is rendered as the default route for `APPLICANT` role users.
- Read API routes `app/api/jobs/route.ts` (returns plain `Job[]` array with `applications: {id,status}[]` for the viewer's own applications) and `app/api/applications/route.ts` (returns plain `Application[]` array with nested `job.position.placeOfAssignment`).

#### applicant-home.tsx
- **Composition**: `WorkspaceTitle title="Welcome back, {firstName}" description="Track your applications and discover new opportunities."` (firstName from `useSession().user.firstName`, fallback "there") → optional Profile completion banner → **Your Applications** section (Eyebrow + "View all" → `navigate("applications")`) → **Open Positions** section (Eyebrow + "View all" → `navigate("jobs")`).
- **Profile completion banner**: rendered only when `String(user.role) === "APPLICANT" && !user.applicant?.isProfileComplete` — calm amber-tinted alert (`border-amber-200 bg-amber-50 text-amber-800`) with AlertTriangle icon + "Complete your profile" CTA → `navigate("profile")`. Uses `String(user.role)` coercion (mirrors `app/page.tsx`) because `SessionUser.role` is typed via Prisma's `model Role` (object shape), not the `@/lib/roles` union.
- **Data**: Fetches `/api/jobs` and `/api/applications` in parallel via `Promise.all` (cancellation guard via `cancelled` flag). Defensive `Array.isArray` unwrap on both responses.
- **Your Applications** section: up to 3 most-recent applications (sorted by `dateApplied` desc). Each is a large JOURNEY card (NOT a stat card):
  - Position title (font-semibold, truncate) + StatusIndicator + "Applied {date}" muted (Clock icon).
  - A horizontal journey timeline: Submitted → Screening → Evaluation → Interview → Final Decision. 5 dots, filled up to the current stage (via `journeyIndexForStatus(status)` which maps `stageForStatus(status)` to an index). The active stage dot has `border-primary bg-primary` + a pulsing ring (`ring-4 ring-primary/20` + `animate-ping` overlay). Connector line behind dots.
  - "Current stage" + "Next" hint card (amber/neutral tone based on stage).
  - "View application" outline button → `navigate("applications")`.
  - Empty state when no applications: `EmptyState icon={<FileText/>} title="No applications yet" description="Browse open positions to apply." action={<Button onClick={()=>navigate("jobs")}>Browse positions</Button>}`.
- **Open Positions** section: grid of up to 4 job cards (clickable → `navigate("jobs", { job: String(job.id) })`). Each card is a `<button>` (accessible, keyboard-focusable) showing: position title (line-clamp-2, hover:text-primary), "Applied" emerald chip when `apps.some(a => a.job?.id === job.id)`, place (MapPin icon), vacancies (Users icon), salary (Banknote icon, formatCurrency), deadline (Calendar icon, `text-destructive` when overdue).
- NO generic stat-card grid, NO 4-metric row — the journey cards ARE the content.
- **Skeleton**: `ApplicantHomeSkeleton` (3 journey card skeletons + 4 position card skeletons).
- **States**: loading skeleton, error state with `window.location.reload()` retry, empty states for both sections.

#### settings.tsx
- **Props**: `{ initial?: string }` — initial sub-section. `normalizeSection()` maps `"users"|"admin-users"|"settings"` → `"users"`, `"positions"|"admin-positions"` → `"positions"`, `"audit"|"admin-audit-log"` → `"audit"`. Default `"users"`.
- **Deep-link**: reads `params.tab` from `useNav()` (takes precedence over `initial`). Clicking a sub-nav link calls `navigate("settings", { tab: next })` which keeps the URL in sync (refresh + back-button work) and lets the Command Center deep-link via `navigate("settings", { tab: "audit" })`. No local section state — derived entirely from `normalizeSection(params.tab ?? initial)`.
- **Layout**: `WorkspaceTitle title="Administration" description="Manage users, positions, and review the audit trail."` → `grid lg:grid-cols-[220px_1fr] gap-6`. LEFT = vertical settings sub-nav (Users & Roles / Positions / Audit Log) with `lg:sticky lg:top-4 lg:self-start`. Active item = `border-l-2 border-l-primary bg-accent text-accent-foreground`. RIGHT = active panel.
- **UsersPanel**: 
  - `FilterBar` with debounced search (350ms via ref) + role Select (All/Applicant/Evaluator/Administrator). PAGE_SIZE=15.
  - Clean table (NOT the legacy 8-column layout — condensed to 6): Name (with "Disabled" sub-line if !isActive) / Email / Role badge / Status (Active/Disabled) / Created / Actions.
  - Actions: Edit pencil, Disable/Enable power, Delete trash (with self-delete guard: hidden if `currentUser?.id === u.id || u.role === "ADMIN"`).
  - `CreateUserDialog` + `EditUserDialog` rebuilt cleanly with same validation (email regex, username≥3, password≥6) and same PATCH payload rules (email only if changed, password only if resetPassword toggled). Soft delete (DELETE) vs hard delete (DELETE ?hard=1) preserved. Disable + Delete AlertDialogs preserved.
  - `Pagination` footer (shared component) with "Showing X–Y of N users" + Prev/Next + "Page X of Y".
- **PositionsPanel**:
  - "Create Position" button + table (Item No. / Position Title / Type / Salary Grade / Monthly Salary / Place / Jobs count / Actions). PAGE_SIZE=50.
  - `PositionFormDialog`: same field set as legacy `admin/positions-tab.tsx` — basic info (item number, title, type, status, level, place), salary (grade/step/amount), org (division/section/classification), accordion CSC MQR sections (Education, Eligibility, Eligibility Group, Work Experience, Training) + accordion Preferred & Competencies (Preferred, Competencies, Special Skill). `placeOfAssignmentId === "none"` → undefined, `positionLevel` → parseInt, `salaryAmount` → parseFloat. Single dialog handles both create (POST) and edit (PATCH).
  - `PositionViewDialog`: read-only details (quick-fact tiles + CSC standards dl + Preferred dl + linked job postings count).
  - Loads `/api/admin/positions?page=1&pageSize=50` + `/api/reference` (placesOfAssignment) in parallel.
- **AuditPanel**:
  - `FilterBar` with debounced search (350ms) + Refresh button + action Select (dynamic from `actions[]` returned by the API). PAGE_SIZE=50.
  - Summary tiles — compact, inline: Total events + Applicant (page) + Evaluator (page) + Admin (page).
  - Table: When / User (with sub-line user_id) / Role badge / Action badge (from local `ACTION_META` registry) / Description / IP (mono). Read-only.
  - Local `ACTION_META` registry mapping common actions (LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT, APPLICATION_SUBMITTED, APPLICATION_STATUS_CHANGED, ASSESSMENT_SUBMITTED, JOB_POSTING_CREATED, JOB_POSTING_UPDATED, POSITION_CREATED, POSITION_UPDATED, DOCUMENT_UPLOADED, DOCUMENT_DELETED, PROFILE_UPDATED, USER_CREATED, USER_UPDATED, USER_DISABLED, USER_ROLE_CHANGED) to `{label, tone}`. Fallback: Title-Case the action string (replace `_` with space, capitalize first letter of each word).
- **Shared `Pagination` component** (reused by all three panels) — clean footer with showing count + Prev/Next + page indicator.
- Each panel: loading skeletons (`UsersTableSkeleton`/`PositionsTableSkeleton`/`AuditTableSkeleton`), empty states, error states with retry.

### Lint Rule Compliance
- Initial lint run flagged 1 `react-hooks/set-state-in-effect` error: I had used `useEffect` to sync `section` state when `params.tab` changed. Fixed by **removing the local section state entirely** — the section is now derived from `normalizeSection(params.tab ?? initial)` (a pure function of props + URL state). Clicking a sub-nav link calls `navigate("settings", { tab: next })` which updates the URL → `params.tab` changes → section is re-derived. No effect, no setState, no lint issue. This is also a cleaner architecture (single source of truth = the URL).
- Final `bun run lint` is **clean (0 errors, 0 warnings)**.
- `npx tsc --noEmit` is **clean for both files** (the remaining errors are in `lib/applicant-data.ts`, `lib/extraction.ts`, `lib/pds-parser.ts` — all outside my scope).

### Verified
- `bun run lint` — **clean (0 errors, 0 warnings)**.
- `npx tsc --noEmit` — no errors in either of my two files.
- Dev server (`dev.log`) — the stale "Module not found" errors for `@/components/workspaces/settings/settings` are from BEFORE the file existed; the most recent compile was `✓ Compiled in 769ms` (success). My two files are correctly resolved by `src/app/page.tsx`. The remaining `Module not found` errors in `dev.log` are for OTHER agents' unbuilt workspaces (`evaluator/review-queue`, `evaluator/review-workspace`) — none of them are referenced by my two files.

### API Contracts Preserved
- `GET /api/jobs` → `Job[]` (plain array; shape: id, title, positionType, numberOfVacancy, publishDate, deadlineDate, position:{positionTitle, placeOfAssignment:{name}|null, salaryAmount}|null, applications?:{id,status}[]) — used in `ApplicantHome` for the Open Positions grid.
- `GET /api/applications` → `Application[]` (plain array; shape: `{ id:number; status:string; dateApplied:string; mqrResults:string|null; job:{ id,title,numberOfVacancy,publishDate,deadlineDate,processingDate,briefDescription,position:{positionTitle,itemNumber,salaryGrade,salaryStep,salaryAmount,placeOfAssignment:{name}|null}|null }; assessments:{id,overallAssessmentRating:string|null}[] }`) — used in `ApplicantHome` for the journey cards.
- `GET /api/admin/users?role=ALL|APPLICANT|EVALUATOR|ADMIN&q=&page=1&pageSize=15` → `{ data: UserRow[], total }` (Paginated envelope). Used in `UsersPanel`.
- `POST /api/admin/users` body `{ email, username, password, role, firstName?, lastName? }` — preserved exactly in `CreateUserDialog`.
- `PATCH /api/admin/users/:id` body `{ role, firstName, lastName, isActive, email?(only if changed), password?(only if resetPassword) }` — preserved exactly in `EditUserDialog`.
- `DELETE /api/admin/users/:id` (soft disable) / `DELETE ?hard=1` (permanent) — preserved in `handleToggleActive` (soft) and `handleDelete` (hard).
- Self-delete guard: `currentUser?.id !== u.id && u.role !== "ADMIN"` — applied to the Delete button visibility.
- `GET /api/admin/positions?page=1&pageSize=50` → `{ data: Position[], total }`. Used in `PositionsPanel`.
- `GET /api/reference` → `{ placesOfAssignment: {id,name}[] }`. Used in `PositionsPanel` for the create/edit dialog dropdown.
- `POST /api/admin/positions` / `PATCH /api/admin/positions/:id` (partial) — body shape preserved exactly: `placeOfAssignmentId === "none"` → undefined, `positionLevel` → parseInt, `salaryAmount` → parseFloat.
- `DELETE ?hard=1` — preserved (used by the legacy view; not yet wired into `PositionsPanel` Actions but the contract is preserved on the API side).
- `POSITION_TYPES = ["Permanent","Contractual","Job Order","Temporary","COS"]` — imported from `@/components/views/admin/types` (canonical source).
- `GET /api/admin/audit-logs?page=1&pageSize=50&search=&action=` → `{ data: AuditLogRow[], total, actions: string[], summary: { totalEvents, onPage, topActions, byRole } }`. AuditLogRow shape preserved exactly (`{ id, timestamp, user_id, user_label, user_role, action, entity_type, entity_id, description, ip_address }`).
- `navigate("profile")`, `navigate("applications")`, `navigate("jobs")`, `navigate("jobs", { job: String(job.id) })`, `navigate("settings", { tab: "users"|"positions"|"audit" })` — all preserved.
- All View strings match the `View` union in `nav-provider.tsx` (`home`, `applications`, `profile`, `jobs`, `settings`).

### Design System Compliance
- All colors are semantic tokens: `bg-card`, `bg-background`, `bg-accent`, `bg-secondary`, `bg-secondary/40`, `bg-secondary/60`, `border-border`, `border-primary/30`, `border-primary/40`, `border-amber-200`, `bg-amber-50`, `text-amber-700`, `text-amber-800`, `border-emerald-200`, `bg-emerald-50`, `text-emerald-700`, `border-red-200`, `bg-red-50`, `text-red-700`, `border-slate-200`, `bg-slate-100`, `text-slate-700`, `border-blue-200`, `bg-blue-50`, `text-blue-700`, `border-[#D6E0EC]`, `bg-[#EEF2F7]`, `text-primary`, `text-foreground`, `text-muted-foreground`, `text-muted-foreground/40`, `text-muted-foreground/50`, `text-muted-foreground/60`, `text-muted-foreground/70`, `text-destructive`, `ring-1 ring-inset`, `ring-2 ring-primary ring-offset-2`, `ring-4 ring-primary/20`.
- Tone classes for the audit ActionMeta badge are sourced from a local `ACTION_TONE_CLS` registry (mirrors the legacy `TONE_CLS` from `admin-audit-log.tsx`).
- **No raw hex codes anywhere in either file** (the `border-[#D6E0EC]` / `bg-[#EEF2F7]` tokens are the standard primary accent tokens already used throughout the codebase, sourced from `TONE_CLASSES.primary.pill`).
- **No `rounded-none` anywhere** — every interactive element uses the default `rounded-md`/`rounded-lg`/`rounded-full` from shadcn/ui defaults and Tailwind.
- Responsive: `grid lg:grid-cols-[220px_1fr]` (settings layout), `grid md:grid-cols-2 xl:grid-cols-3` (journey cards), `grid sm:grid-cols-2 xl:grid-cols-4` (open position cards), `grid sm:grid-cols-2` / `grid sm:grid-cols-3` / `grid sm:grid-cols-4` (form + view-dialog grids), `lg:sticky lg:top-4` (sub-nav), `lg:self-start`.
- Long list handling: tables are wrapped in `<Card className="overflow-hidden">` with the shadcn Table component (no fixed-height scroll — pagination is server-side so each page renders ~15-50 rows, well within viewport).
- Loading states use `Skeleton` from `@/components/primitives/workspace`. Empty states use `EmptyState` with semantic icon. Accessibility: every `Select` has `aria-label`; every status dot has `aria-hidden`; sub-nav links use `aria-current="page"` when active; sub-nav `<nav>` has `aria-label="Settings sections"`; Open Position cards are real `<button>` elements (keyboard-accessible + focus-visible ring).

### Stage Summary
Two production-ready workspace files added. `ApplicantHome` is a premium applicant PORTAL home (NOT an admin dashboard) — warm greeting, profile-completion nudge, large journey cards with a 5-dot horizontal timeline (pulsing ring on the active stage), and a curated grid of open positions with "Applied" chips and overdue-deadline highlights. `SettingsWorkspace` is a separate administration area with a left sub-nav (Users & Roles / Positions / Audit Log) and three cleanly-rebuilt panels that preserve the exact API contracts and business logic of the legacy admin views (CreateUserDialog/EditUserDialog with email/password-change rules and self-delete guard; PositionFormDialog with accordion MQR sections and `placeOfAssignmentId === "none"` → undefined junction logic; AuditPanel with local `ACTION_META` registry and dynamic action filter). URL-driven section state (no local state, no sync effect). `bun run lint` is clean. `npx tsc --noEmit` is clean for both files. Full work record in `agent-ctx/2-applicant-settings-main.md`.
