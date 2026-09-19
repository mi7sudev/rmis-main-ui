# R3-b — Responsive fixes (shell/nav/drawer/theme surfaces, batch B)

Agent: full-stack-developer · Based on agent-ctx/audit-R2-b.md findings.

## Applied fixes
| # | File:Line | Change | Severity |
|---|---|---|---|
| 1 | src/components/shell/nav-rail.tsx:96 | sticky desktop rail `h-screen` → `h-dvh` (ThemeToggle + user/sign-out row reachable on iPad Safari) | HIGH |
| 2 | src/components/shell/notifications.tsx:71 | `w-80 p-1` → `w-80 max-w-[calc(100vw-1rem)] p-1` | MED |
| 3 | src/components/views/profile-view.tsx:247 | `lg:top-[56px]` → `lg:top-16`; `lg:max-h-[calc(100vh-72px)]` → `lg:max-h-[calc(100dvh-80px)]` (only line touched in file) | MED |
| 4 | src/components/shell/app-shell.tsx:20,34,69,74 | `min-h-screen` → `min-h-dvh` ×4 | LOW |
| 5 | src/app/layout.tsx:1,41-45 | added `Viewport` type import + `export const viewport = { width:"device-width", initialScale:1, viewportFit:"cover" }` | LOW |
| 6 | src/components/shell/nav-rail.tsx:226 | drawer account block `py-3` → `py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]` (px-2 kept) | LOW |
| 7 | src/components/ui/command.tsx:93 | `max-h-[300px]` → `max-h-[min(300px,calc(100dvh-9rem))]` | LOW |
| 8 | src/app/globals.css:304 | body rule: added `overflow-x: clip;` inside @layer base | LOW |
| 9 | src/components/ui/sheet.tsx:75 | close button `size-8` → `size-10` | LOW |
| 10 | src/components/shell/workspace-header.tsx:86 | search button `h-10` → `h-11` | LOW |

## Skipped
- Rail breakpoint md→lg switch — audit finding #9 says current 768px behavior is correct/consistent; no action (record only).

## Verification
- `bun run lint` → exit 0.
- grep: no `h-screen`/`min-h-screen` remain under src/components/shell.
- No dev server run, no git commit, no db/prisma changes. No colors/visual language changed.
- Worklog appended (Task ID: R3-b).
