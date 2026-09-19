# Task 7 — Administrator Workflow

**Agent**: full-stack-developer
**Task**: Build admin dashboard, users, and jobs views for RMIS

## Context Read
- `worklog.md` (AUDIT-FRONTEND + ARCH-PLAN entries)
- `src/lib/client.ts` — `apiFetch`, `formatDate`, `formatDateTime`, `formatCurrency`, `fullName`, `STATUS_META`
- `src/components/views/shared.tsx` — `PageHeader`, `LoadingState`, `EmptyState`, `ErrorState`, `SectionCard`, `RoleBadge`, `StatusBadge`, `FieldRow`
- `src/components/views/jobs-view.tsx` — Job type + detail UI patterns (brand colors, layout)
- `src/app/page.tsx` — Router already wires `admin-dashboard`, `admin-users`, `admin-jobs` views
- `src/components/nav-provider.tsx` — `useNav` hook + `View` type includes admin-* targets
- `prisma/schema.prisma` — User / Applicant / Position / JobPosting / PlaceOfAssignment models
- Existing API routes: `/api/admin/stats`, `/api/admin/users`, `/api/admin/users/[id]`, `/api/admin/positions`, `/api/jobs`, `/api/reference`

## Files Created
1. `src/components/views/admin-dashboard.tsx` — `AdminDashboardView`
2. `src/components/views/admin-users.tsx` — `AdminUsersView`
3. `src/components/views/admin-jobs.tsx` — `AdminJobsView`

## Work Log
- Read all shared utilities, the existing jobs-view, page.tsx router, and all relevant API route handlers + Prisma schema to lock down the exact data shapes and contract.
- Confirmed existing admin API endpoints (stats, users, users/[id], positions) and reused the public `/api/jobs` POST (admin-guarded server-side) + `/api/reference` for the places-of-assignment select.
- **AdminDashboardView**: pulled `/api/admin/stats`, rendered two stat-card rows (Users: total/applicants/evaluators/admins/activeJobs; Applications: total/for-eval/evaluated/approved/rejected), a 3-up Quick Actions card row (Manage Users / Manage Jobs / View Positions), a `recharts` BarChart of `byStatus` (rotating brand palette), and a scrollable "Recent Applications" list with `StatusBadge` + `formatDate`. Full loading skeleton + `ErrorState` retry.
- **AdminUsersView**: built a debounced search input (350 ms) + role filter Select, responsive shadcn Table (Name / Email / Username / Role / Status / Profile / Created / Actions) with "Load more" pagination (page size 15). Create dialog validates email regex + username ≥3 chars + password ≥6 chars; auto-creates applicant profile via existing POST. Edit dialog exposes role, names, email, isActive Switch, and an optional password-reset Switch. Disable = `DELETE` (soft) with an `AlertDialog` confirmation; re-enable = `PATCH { isActive: true }`. Toast feedback via sonner on every mutation.
- **AdminJobsView**: two-tab Tabs layout. **Job Postings tab** — table with Title / Position / Vacancies / Published / Deadline / Status (Active/Closed auto-derived from `isActive` + deadline) / Applications count / Actions (View → public jobs route, Edit). Create/Edit dialog has position Select (loaded from `/api/admin/positions`), positionType, vacancy, three date inputs, and 5 HTML textarea fields (briefDescription, briefDescriptionHtml, duties, compensation, otherQualifications) — all wired to the `/api/jobs` POST contract. Noted existing API has no PATCH for jobs (toast.info on edit attempt; create is fully functional). **Positions tab** — table of positions with itemNumber / title / type / salary grade / salary / place / linked-job count / view action. Create dialog uses an Accordion to keep the form compact: basic info + salary + org + collapsible CSC Qualification Standards (Education/Eligibility/EligibilityGroup/WorkExperience/Training) + collapsible Preferred & Competencies. View dialog shows all CSC standards + preferred qualifications in a read-only layout. PlaceOfAssignment select populated from `/api/reference`.
- All three views are `"use client"` with named exports, fully responsive (mobile-first, tables scroll horizontally via shadcn Table wrapper), respect brand colors (#262652 navy / #46D9D1 teal palette + slate neutrals, NO indigo/blue), include loading skeletons + empty + error states, and use sonner toast for all mutations.
- Ran `bun run lint` and `bunx tsc --noEmit` on the three new files — zero errors / warnings in my files. (One pre-existing lint error remains in `nav-provider.tsx` and pre-existing TS errors in `.next/dev/types/validator.ts` for API route signatures; both are outside this task's scope.)

## Stage Summary
Three production-ready admin views landed and wired into the existing router (no `page.tsx` changes needed):
- **AdminDashboardView** — stats grid (10 KPIs), by-status bar chart, recent-applications feed, quick-action nav cards
- **AdminUsersView** — searchable/filterable user table with create/edit/disable/enable dialogs, validation, pagination
- **AdminJobsView** — Tabs-based job-postings + positions management with full create dialogs (rich HTML job content, complete Position record incl. CSC qualification standards)

All views honor the RMIS design system (navy #262652 / teal #46D9D1, shadcn/ui New York style, lucide icons, sonner toasts), reuse `apiFetch` + shared view components, and gracefully degrade across loading / error / empty states.
