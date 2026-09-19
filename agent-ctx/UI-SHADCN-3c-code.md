# UI-SHADCN-3c — Applicant-facing views sharp corners + ScrollArea

**Task ID:** UI-SHADCN-3c
**Agent:** Code
**Scope:** Update 5 applicant-facing view files for full sharp-corner consistency + ScrollArea wrap on applications list.

## Files Modified
1. `src/components/views/applicant-home.tsx` — all `rounded-sm` → `rounded-none` (welcome card, stat cards, app rows, job cards, buttons, notice box).
2. `src/components/views/my-applications.tsx` — all `rounded-sm` + the timeline `rounded-full` → `rounded-none`; wrapped populated list in `<ScrollArea className="max-h-[70vh] pr-2">`; added ScrollArea import.
3. `src/components/views/jobs-view.tsx` — `rounded-sm`/`rounded-t-lg`/`rounded-full`/standalone `rounded` → `rounded-none` on job list, JobDetail (exported), both mobile Drawers + close button; added `rounded-none` to Badge "Applied" and outline "My Applications" Button.
4. `src/components/views/signin-view.tsx` — all `rounded-sm` → `rounded-none` (card, inputs, button, privacy notice, test-accounts box).
5. `src/components/views/signup-view.tsx` — all `rounded-sm` → `rounded-none` (card, 5 inputs, custom checkbox, privacy notice + consent label, submit button).

## Verification
- ripgrep'd all 5 files for `rounded-(lg|md|xl|2xl|sm|full|t-lg|t-md|t-xl|t-sm|b-lg|b-md|b-xl|b-sm|tl|tr|bl|br)` and standalone `rounded` (non-suffixed, word-boundary): **0 matches** in every file.
- `bun run lint` → **zero errors, zero warnings**.
- dev.log → all "Compiled in Xms" entries, no errors.

## Preserved (No Changes)
- All business logic, API calls, state, props, imports (except the added ScrollArea import in my-applications.tsx).
- Topbar (src/components/topbar.tsx) — preserved per instructions.
- jobs-view two-column layout + mobile Drawer bottom-sheet pattern.
- my-applications timeline `overflow-x-auto` (native, globally styled to match shadcn ScrollArea per globals.css UI-SHADCN-1).
- jobs-view left-column existing `<ScrollArea className="lg:max-h-[calc(100vh-220px)] lg:pr-2">`.
- SuccessResult component (imported from ui — shadcn-style, left untouched).

## Notes for Next Agent
- The only `rounded` strings remaining in these 5 files are all `rounded-none`.
- No genuine avatar circles exist in these 5 files (signin/signup use static `<img>` logos, not avatars), so no `rounded-full` was preserved here.
- my-applications.tsx timeline step indicators (h-8 w-8) are now sharp squares with `border-2` — per explicit user instruction "make them square with a border".
- The full worklog entry is in `/home/z/my-project/worklog.md` under Task ID `UI-SHADCN-3c`.
