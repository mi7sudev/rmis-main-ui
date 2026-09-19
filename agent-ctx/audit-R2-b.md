# R2-b — Shell + Nav Responsiveness Audit (READ-ONLY)

Auditor: R2-b · Scope: shell components, nav rail/drawer, workspace header, command menu, notifications, theme toggle, layout/globals hazards, ui sheet/drawer/sidebar usage.
Viewport sweep: 320 / 375 / 414 / 768 / 1024 / 1280 / 1440 / 1920, both modes. Zero source files modified.

Design-system guardrails respected: primary #1591DC, radius 0 (all radius tokens collapse to 0 in globals.css:108-112), no shadows, token-driven dual mode.

**Note:** `src/lib/navigation.ts` does not exist; nav config is `src/config/navigation.ts` (read for context only). Longest labels: "Command Center" (14), "My Applications" (15), role label "Administrator". Nothing width-hostile there.
**Note:** `src/components/ui/sidebar.tsx` is imported nowhere (`grep components/ui/sidebar` → 0 matches). Dead file; no usage concerns.

---

## Findings

### [HIGH] src/components/shell/nav-rail.tsx:96 — `h-screen` sticky rail hides bottom user/logout row on iPad Safari (≥768px)
- Issue: The rail is `sticky top-0 h-screen`. On iOS/tablet Safari, `100vh` = the *large* viewport (toolbars collapsed). When toolbars are visible the visible height is ~60–100px shorter, so the rail's bottom rows — `ThemeToggle` (line 109) and `RailUserButton` (line 110, the **only** sign-out/account affordance at ≥768px since the drawer trigger is `md:hidden`) — sit below the fold of a sticky, non-scrolling element and are unreachable. Reproduces on any 768px+ iPad Safari and Android tablets where dvh < vh.
- Evidence:
  ```tsx
  <aside className="hidden md:flex sticky top-0 z-30 h-screen w-16 shrink-0 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar py-3">
  ```
- Fix: `h-screen` → `h-dvh` (Tailwind v4 core utility). Desktop (no dynamic chrome) renders identically; only short-viewport tablet/mobile browsers change, which is the fix. Optionally add `min-h-0` — not required.

### [MED] src/components/shell/notifications.tsx:71 — `w-80` panel is edge-to-edge flush at 320px
- Issue: `w-80` = 320px — exactly the 320px viewport. `align="end"` + trigger near the right edge means the panel fills the full screen width with 0px breathing room on both sides and relies entirely on Radix's shift middleware (collisionPadding 0) not to overflow; any browser zoom, sub-320px window, or future padding change overflows.
- Evidence:
  ```tsx
  <DropdownMenuContent align="end" className="w-80 p-1">
  ```
- Fix: `className="w-80 max-w-[calc(100vw-1rem)] p-1"` — purely additive; desktop unaffected (viewport − 1rem > 320px at all desktop widths). Scroll is already safe: outer content has `max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto` (ui/dropdown-menu.tsx:45) and the inner list caps at `max-h-96 overflow-y-auto` (notifications.tsx:90).

### [MED] src/components/views/profile-view.tsx:247 — sticky sidebar offset (56px) mismatches the 64px sticky WorkspaceHeader *(adjacent file — flagged for owner, not in R2-b list)*
- Issue: Inside AuthedShell, `WorkspaceHeader` is `sticky top-0 h-16` (64px) — workspace-header.tsx:65. profile-view's settings nav uses `lg:sticky lg:top-[56px] lg:max-h-[calc(100vh-72px)]`, so on lg+ it tucks 8px underneath the blurred header, and its bottom offset math (72px) disagrees with both the 56px top and the header's real 64px. Contrast: review-workspace.tsx:211 correctly uses `lg:sticky lg:top-16`.
- Evidence:
  ```tsx
  <nav className="h-fit rounded-none border border-border bg-card p-2 lg:sticky lg:top-[56px] lg:max-h-[calc(100vh-72px)] lg:overflow-y-auto">
  ```
- Fix: `lg:top-[56px]` → `lg:top-16` and `lg:max-h-[calc(100vh-72px)]` → `lg:max-h-[calc(100dvh-80px)]` (64px header + 16px gap). Visual change on lg+ only (8px reposition), matching the pattern already used by the evaluator workspace.

### [LOW] src/components/shell/app-shell.tsx:20,34 — `min-h-screen` instead of `min-h-dvh` on shell roots
- Issue: On iOS the URL bar means `100vh` > initial visible height; background fill is token-colored so there is no visible seam today, but any future full-height child inside these roots (e.g. a `h-full` hero) inherits the wrong reference height. Same pattern at lines 69/74 for bare routes.
- Evidence: `<div className="flex min-h-screen bg-background">` (line 20); `<div className="flex min-h-screen flex-col bg-background">` (line 34).
- Fix: `min-h-screen` → `min-h-dvh` in all four spots. Zero desktop change.

### [LOW] src/app/layout.tsx:43-55 + src/components/shell/nav-rail.tsx:226-250 — no viewport-fit/safe-area handling for the fixed-height drawer bottom
- Issue: No `export const viewport` in layout.tsx, so `viewport-fit` defaults to non-cover and `env(safe-area-inset-bottom)` is always 0; the mobile drawer's sign-out block (drawer bottom, `border-t bg-secondary/60 px-2 py-3`) currently relies on Safari's automatic inset behavior. On devices/apps that opt into cover (or once anyone adds safe-area support), the sign-out button can sit under the home indicator.
- Evidence (layout.tsx): `<body className={...}>` with no `export const viewport`; (nav-rail.tsx:226) `<div className="border-t border-border bg-secondary/60 px-2 py-3">`.
- Fix (additive): add to layout.tsx
  ```ts
  export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };
  ```
  and to the drawer account block: `pb-[max(0.75rem,env(safe-area-inset-bottom))]` → `className="border-t border-border bg-secondary/60 px-2 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"`.

### [LOW] src/components/ui/sheet.tsx:75 (used by shell nav-rail.tsx:179) — drawer close button 32px touch target
- Issue: The built-in Sheet close is `size-8` (32×32), under the 44px minimum; it floats at `top-4 right-4` over the drawer header whitespace. All other shell targets are 44–48px (rail items `size-11`, drawer rows `min-h-11`, header buttons `size-12`), so this is the outlier.
- Evidence: `<SheetPrimitive.Close className="... absolute top-4 right-4 grid size-8 place-items-center rounded-none ...">`.
- Fix: `size-8` → `size-10` (still sharp, no other change) — visual change of +8px hotspot on every sheet.

### [LOW] src/components/shell/workspace-header.tsx:86 — search button `h-10` (40px) on touch tablets 640–1023px
- Issue: The bordered "Search ⌘K" button is the only search trigger from `sm` (640px) up to the point the dialog opens; between 640–1023px that's touch hardware, and 40px < 44px target minimum.
- Evidence: `className="hidden h-10 gap-2 rounded-none border border-border bg-transparent px-3.5 text-muted-foreground hover:bg-accent hover:text-foreground sm:flex"`.
- Fix: `h-10` → `h-11`. 4px taller on desktop too (visual change, minor).

### [LOW] src/components/ui/command.tsx:93 (via shell command-menu.tsx:66-68) — CommandList fixed 300px cap clips on short landscape phones
- Issue: Dialog is capped `max-h-[calc(100vh-2rem)]` (ui/dialog.tsx:68) with `overflow-hidden`; input row is 48px. On a ~375px-tall landscape phone the cap is ~343px, so the 48px input + 300px list overflows by ~5px and the list's last pixels are clipped by `overflow-hidden` (scroll still works; scrollbar/last row edge cut).
- Evidence: `"max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto"` (CommandList).
- Fix: `max-h-[300px]` → `max-h-[min(300px,calc(100dvh-9rem))]` — desktop unaffected (300px < cap on any ≥640px-tall desktop window); only short viewports shrink the list.

### [LOW] src/components/shell/nav-rail.tsx:96 + workspace-header.tsx:66 — breakpoint is md (768px), not lg (1024px) as briefed — confirmation, no action
- Issue: Task brief described the rail as `lg:`; the code switches at `md` (`hidden md:flex` rail, `md:hidden` drawer trigger). Verified at exactly 768px: rail 64px + content 704px is comfortable, and at exactly lg=1024px content gets 960px. No overlap, no cramped state in dark or light. Record-only; if 1024px is the intended switch, change both `md:` occurrences in the same commit.
- Evidence: `hidden md:flex sticky top-0 ... w-16` (nav-rail.tsx:96); `<Button ... className="md:hidden" ...>` (workspace-header.tsx:66).

### [LOW] src/app/globals.css:299-307 — no horizontal-overflow guard on body
- Issue: No `overflow-x` rule exists anywhere (verified: the only @media-free stylesheet has no `overflow-x`, no `min-width` traps, no safe-area `env()`). The audited shell itself doesn't overflow 320px, but one long unbroken string in a future view would scroll the whole page sideways including the sticky rail.
- Evidence: `body { @apply bg-background text-foreground; font-feature-settings: ... }` (lines 299-307) — no overflow property.
- Fix (additive hardening): inside `@layer base`, add `body { overflow-x: clip; }` (clip, not hidden, to avoid creating a scroll container). Zero visual change when nothing overflows.

---

## Explicit passes (verified OK, no change)
- Mobile drawer at 320px: `w-[280px]` (nav-rail.tsx:179) + 40px overlay margin; tailwind-merge correctly drops the base `w-3/4 sm:max-w-sm`; header logo+title clear the absolute close button; nav is `flex-1 overflow-y-auto`; rows `min-h-11` with `truncate` labels.
- Drawer account block: name/role/email all `truncate` inside `min-w-0 flex-1` (nav-rail.tsx:233-240); desktop rail user dropdown `w-60` also truncates (nav-rail.tsx:145-151). Long names/emails/role labels safe.
- Workspace header at 320px: breadcrumb `min-w-0` + `truncate` on the dynamic label (workspace-header.tsx:71-79); action cluster is fixed 48px icon buttons (`size-12` via button.tsx:36) — no squeeze; long job titles can't reach the breadcrumb (it's nav-config-driven, static strings).
- Command dialog at 320px: `w-full max-w-[calc(100%-2rem)]` (dialog.tsx:65) → 288px; list scrolls; entity rows use `truncate` on title/name spans (command-menu.tsx:112,136).
- No hard-coded mode-breaking colors in shell: rail uses `sidebar-*` tokens (correct black/white flip), active item `bg-primary text-white` works in both modes; `bg-white` brand chip (nav-rail.tsx:50) is an intentional constant-logo block. Notification tone chips use token washes (`bg-primary/10`, `bg-[#B45309]/10` — the amber constant matches `--warning` family in dark; in light mode it sits on white with 10% wash — acceptable contrast for a 14px icon chip).
- Touch targets: rail items, user button, ThemeToggle (`size-11`), drawer rows/sign-out (`min-h-11`), header menu/search/bell (`size-12`) all ≥44px.
- No `whitespace-nowrap` on any dynamic label in the shell (grep clean); footer pinned via `mt-auto` works in both shells.

## Severity summary
| Severity | Count | Findings |
|---|---|---|
| CRIT | 0 | — |
| HIGH | 1 | nav-rail.tsx:96 h-screen rail clips logout row |
| MED | 2 | notifications.tsx:71 w-80 flush @320; profile-view.tsx:247 sticky offset (adjacent) |
| LOW | 7 | app-shell min-h-screen; layout viewport/safe-area; sheet close 32px; search h-10; CommandList 300px; md-vs-lg confirmation; body overflow-x guard |

## Safe fixes (additive, zero desktop visual change)
1. nav-rail.tsx:96 `h-screen` → `h-dvh` (HIGH — do first)
2. notifications.tsx:71 append `max-w-[calc(100vw-1rem)]` (MED)
3. app-shell.tsx:20,34,69,74 `min-h-screen` → `min-h-dvh` (LOW)
4. layout.tsx add `viewport` export + nav-rail.tsx:226 safe-area `pb-[max(0.75rem,env(safe-area-inset-bottom))]` (LOW)
5. command.tsx:93 `max-h-[min(300px,calc(100dvh-9rem))]` (LOW)
6. globals.css add `body { overflow-x: clip; }` (LOW)

## Visual changes (need a look, small)
1. profile-view.tsx:247 `lg:top-[56px]` → `lg:top-16`, `calc(100vh-72px)` → `calc(100dvh-80px)` (MED — 8px reposition on lg+)
2. sheet.tsx:75 close `size-8` → `size-10` (LOW — larger hotspot on all sheets)
3. workspace-header.tsx:86 `h-10` → `h-11` (LOW — search button 4px taller)
4. Optional decision: switch rail/drawer-trigger from `md` to `lg` if 1024px was the intended breakpoint (currently consistent at 768px; no bug as shipped)
