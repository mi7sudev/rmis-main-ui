---
Task ID: UI-SHADCN-3a
Agent: Code (admin views — sharp corners + ScrollableTableCard + client-side pagination)
Task: Update 4 admin view files (jobs-tab.tsx, positions-tab.tsx, admin-users.tsx, admin-dashboard.tsx) to use the ScrollableTableCard helper from shared.tsx (with proper max-height + pagination), and replace all rounded-lg/md/xl/full/sm with rounded-none (sharp corners) on Cards, Buttons, Badges, Inputs, Labels, Textareas, Selects, DialogContent, AlertDialogContent. Keep rounded-full only on tiny status dots (none existed in these files).

Work Log:
- Read worklog.md UI-SHADCN-1 + UI-SHADCN-2a + UI-SHADCN-2b entries; read shared.tsx (ScrollableTableCard helper confirmed); read all 4 target files fully; checked ui/table.tsx, ui/card.tsx, ui/dialog.tsx rounded defaults.

src/components/views/admin/jobs-tab.tsx:
- Removed the now-unused `import { ScrollArea } from "@/components/ui/scroll-area"` line.
- Added `ScrollableTableCard` to the imports from `@/components/views/shared`.
- JobsTab: added `const PAGE_SIZE = 10; const [page, setPage] = useState(1);` for CLIENT-SIDE pagination (since /api/jobs returns a plain Job[]).
- Added `setPage(1)` inside `load()` to reset to page 1 whenever jobs are refetched (covers edit/create/refresh).
- Computed `const total = jobs.length; const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE)); const pagedJobs = jobs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);`
- Refactored the return JSX: split loading/error/empty into 3 separate `<Card className="border-slate-200 shadow-sm rounded-none">` blocks (since the populated state now uses ScrollableTableCard instead of a wrapping Card).
- Populated state: replaced `<Card>...<ScrollArea className="w-full"><Table>...</Table></ScrollArea></Card>` with `<ScrollableTableCard page={page} totalPages={totalPages} onPageChange={setPage} total={total} pageSize={PAGE_SIZE} countLabel="jobs"><Table>...</Table></ScrollableTableCard>`.
- The Table now maps over `pagedJobs` instead of `jobs`.
- Sharp corners: added `rounded-none` to the header Create Job button, empty-state Create Job button, all Badges (Active/Closed), all action ghost Buttons (Preview, Edit). ScrollableTableCard already renders rounded-none internally.
- JobFormDialog: added `rounded-none` to DialogContent; added `rounded-none` to all 8 Inputs (vacancy, title, publish, deadline, processing, brief/comp/other textareas — actually 4 Textareas: brief, duties, comp, other), both SelectTriggers (position, type), and the footer Cancel + Create Job Buttons.
- JobPreviewDialog: added `rounded-none` to DialogContent. The JobDetail child component (from ../jobs-view) was NOT modified (another agent handles that file).
- Verified zero `rounded-(lg|md|xl|2xl|sm|full)` and zero `ScrollArea`/`TablePagination` references remain.

src/components/views/admin/positions-tab.tsx:
- Removed the unused `import { ScrollArea } from "@/components/ui/scroll-area"` line.
- Replaced `TablePagination` with `ScrollableTableCard` in the shared imports.
- PositionsTab: kept the existing server-side pagination (PAGE_SIZE=50, page state, total state). Removed the manual `<Card>...<><ScrollArea className="w-full max-h-[60vh]"><Table>...</Table></ScrollArea>{pagination div with TablePagination}</></Card>` pattern.
- Split loading/error/empty into 3 separate `<Card className="border-slate-200 shadow-sm rounded-none">` blocks.
- Populated state: `<ScrollableTableCard page={page} totalPages={totalPages} onPageChange={setPage} total={total} pageSize={PAGE_SIZE} countLabel="positions" maxHeight="60vh"><Table>...</Table></ScrollableTableCard>`. Removed the manual pagination div (ScrollableTableCard renders it).
- Sharp corners: added `rounded-none` to header Create Position button, empty-state Create Position button, both Badges (positionType secondary, jobs-count outline), the View ghost button.
- PositionFormDialog: added `rounded-none` to DialogContent; added `rounded-none` to ALL 11 Inputs (item, title, status, level, sg, step, salary, division, section, class, elig, elig-group, skill — actually 13 Inputs), both SelectTriggers (type, place), ALL 5 Textareas (edu, work, train, pref, comp), and the footer Cancel + Create Position Buttons.
- PositionViewDialog: added `rounded-none` to DialogContent, the Close outline Button.
- FactCell helper: changed `rounded-lg` -> `rounded-none` on the bg-slate-50 container.
- Verified zero remaining `rounded-(lg|md|xl|2xl|sm|full)` and zero `ScrollArea`/`TablePagination` references.

src/components/views/admin-users.tsx:
- Removed the unused `import { ScrollArea } from "@/components/ui/scroll-area"` line.
- Replaced `TablePagination` with `ScrollableTableCard` in the shared imports.
- AdminUsersView: kept existing server-side pagination (PAGE_SIZE=15, page state, total state). Removed the manual `<Card>...<><ScrollArea className="w-full max-h-[60vh]"><Table>...</Table></ScrollArea>{pagination div with TablePagination}</></Card>` pattern.
- Split loading/error/empty into 3 separate `<Card className="border-slate-200 shadow-sm rounded-none">` blocks.
- Populated state: `<ScrollableTableCard page={page} totalPages={totalPages} onPageChange={setPage} total={total} pageSize={PAGE_SIZE} countLabel="users" maxHeight="60vh"><Table>...</Table></ScrollableTableCard>`.
- Sharp corners: added `rounded-none` to PageHeader Create User button, Filter Bar Card + Input + SelectTrigger, empty-state Create User button, all 3 action ghost Buttons (Edit, Disable, Enable).
- AlertDialog (disable confirm): added `rounded-none` to AlertDialogContent, AlertDialogCancel, AlertDialogAction.
- CreateUserDialog: added `rounded-none` to DialogContent, all 5 Inputs (email, username, password, first, last), SelectTrigger (role), footer Cancel + Create User Buttons.
- EditUserDialog: added `rounded-none` to DialogContent, all 5 Inputs (email, first, last, password), SelectTrigger (role), the Active Toggle div (rounded-lg -> rounded-none), the Password Reset div (rounded-lg -> rounded-none), footer Cancel + Save Changes Buttons.
- Verified zero remaining `rounded-(lg|md|xl|2xl|sm|full)` and zero `ScrollArea`/`TablePagination` references.

src/components/views/admin-dashboard.tsx:
- Sharp corners applied throughout (no pagination/ScrollArea changes needed — Recent Apps already uses ScrollArea max-h-96 pr-2 which is correct):
  * PageHeader Refresh outline button -> rounded-none.
  * StatCard: Card -> rounded-none; icon container `rounded-lg` -> rounded-none.
  * QuickActionCard: button container `rounded-sm` -> rounded-none; icon container `rounded-lg` -> rounded-none.
  * Recharts Tooltip `contentStyle.borderRadius: "8px"` -> `"0"` (sharp tooltip).
  * Recharts Bar `radius={[4,4,0,0]}` -> `radius={[0,0,0,0]}` (sharp bar tops).
  * Recent-applications item container `rounded-lg` -> rounded-none.
  * SectionCard (from shared.tsx) already sharp.
- Kept the existing `ScrollArea className="max-h-96 pr-2"` on Recent Applications — native overflow is globally styled to match shadcn's ScrollArea look per globals.css UI-SHADCN-1.
- Verified zero remaining `rounded-(lg|md|xl|2xl|sm|full)` references.

Verification:
- ripgrep'd all 4 files for `rounded-(lg|md|xl|2xl|sm|full)` -> 0 matches in all 4.
- ripgrep'd all 4 files for `ScrollArea` and `TablePagination` -> 0 matches (all removed).
- `bun run lint` -> zero errors, zero warnings.
- dev.log: all "Compiled in Xms" entries, no errors; GET /api/admin/* endpoints returning 200.

Stage Summary:
- All 4 admin view files now use the ScrollableTableCard helper for their populated tables (jobs, positions, users), giving them a proper shadcn-style scrollbar with max-height 60vh (or default 60vh) instead of growing the page indefinitely, plus numbered shadcn Pagination with ellipsis.
- Jobs tab gained CLIENT-SIDE pagination (PAGE_SIZE=10) because /api/jobs returns a plain array — page resets to 1 on each load (create/edit/refresh).
- Positions and Users tabs kept their existing SERVER-SIDE pagination (PAGE_SIZE=50 and 15 respectively); the manual pagination div was removed since ScrollableTableCard renders it.
- Admin dashboard's Recent Applications list kept its existing ScrollArea (max-h-96 pr-2); only sharp-corner CSS was applied there.
- All corners in all 4 files are sharp (rounded-none on Cards, Buttons, Badges, Inputs, Labels, Textareas, SelectTriggers, DialogContent, AlertDialogContent, FactCell containers, StatCard icon containers, QuickActionCard button + icon containers, recharts Tooltip + Bar radii, recent-app item containers). No rounded-full dots existed in these files.
- No business logic, API calls, state management structure, props, or imports (beyond removing ScrollArea / swapping TablePagination for ScrollableTableCard) were changed. The JobDetail child component (from ../jobs-view) was NOT modified — only the wrapping DialogContent.
- `bun run lint` passes with zero errors. Dev server compiles cleanly.
