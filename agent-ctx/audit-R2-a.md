# Audit R2-a — Public landing + Auth + Jobs board responsiveness (read-only)

Agent: R2-a responsive-design auditor · Date: 2026 audit pass
Scope audited line-by-line: `src/app/page.tsx`, `src/app/layout.tsx`, `src/components/workspaces/public/public-landing.tsx`, `src/components/workspaces/public/jobs-carousel.tsx`, `src/components/workspaces/public/sections/*`, `src/components/views/{signin-view,signup-view,fast-track-apply-dialog,jobs-view}.tsx`. Design system respected (Accenture: #1591DC primary, 0px radius, no shadows, dual-mode tokens). NO source files were modified.

Method: full read of every assigned file + live measurements on the running dev server with agent-browser at 320×568, 375×667, 414×800, 768×900, 1024×768, 1440×900, 1920×1080, in BOTH dark and light mode (token spot-checks via computed styles). Numbers cited below are measured, not estimated.

Dead files (confirmed unimported, per public-landing.tsx header + grep): `sections/hero.tsx`, `sections/showcase-banner.tsx`, `sections/marquee-divider.tsx` (only imported by dead footer), `sections/method.tsx`, `sections/life.tsx`, `sections/facilities.tsx`, `sections/footer.tsx`. ONLY `sections/positions.tsx` is used. `views/shared.tsx` is NOT imported by any assigned file (only evaluator/candidate files) — out of scope.

---

### [HIGH] src/components/site-header.tsx:42-70 — Brand logo chip crushed to 51px at 320px (renders ~31×18px)
- Issue: On every public/auth page (SiteHeader is imported by public-landing, signin, signup; visible on jobs board too), the header's white logo chip has no `shrink-0` and the images have no min-width, so `justify-between` flex squeezes the chip instead of the nav. Measured at 320px: chip = 51×52px (wants ~194px), MIRDC img forced to 31×40 box where object-contain draws the 898×529 logo at ≈31×18px — an illegible sliver; RMIS img crushed 48→31px. Recovers by ~375px (chip 106px) and is correct at ≥390px. No horizontal scroll occurs (measured docOverflow=false), so this is a brand-legibility defect, not an overflow trap.
- Evidence: measured rects at 320px: `chip=16..67 w51`, `mirdc w31 h40`, `rmis w31`, `nav w237 right=304`; at 390px `chip w121 mirdc w68` (correct).
  ```tsx
  // line 60 — chip span (no shrink-0)
  <span className="flex items-center gap-2.5 rounded-none bg-white px-2.5 py-1.5 sm:px-3 sm:py-2">
    <img src="/MIRDC.png" alt="MIRDC" className={`${logoH} w-auto object-contain ...`} />
    <img src="/RMIS.png" alt="RMIS" className={`${rmisW} h-auto object-contain ...`} />
  ```
- Fix: give the chip `shrink-0` and absorb the squeeze in the nav at base: hide the "Positions" text link on mobile (redundant — the landing IS the positions page; jobs board already hides it via `onJobs`) and hide the RMIS wordmark below sm:
  `line 60: span → "flex shrink-0 items-center gap-2.5 …"`, `line 66-70: RMIS img → className="hidden sm:block …"`, `line 76-83: Positions button → className="group relative hidden overflow-hidden px-3 py-2.5 … sm:block"` wrapper gets `hidden sm:block`. Then 320px budget: chip(MIRDC-only)≈88 + toggle 44 + Sign in 99 + gaps ≈ 247 ≤ 288 ✓. Note: shared component — coordinate with other R2 agents before editing.

### [MED] src/components/views/jobs-view.tsx:531 — Sticky detail back-bar magic offsets (42/50px) are ~11-15px smaller than the real condensed SiteHeader (53/65px, measured)
- Issue: The job-detail "Back to Positions" bar docks with its top 11px (mobile) / 15px (sm+, measured at 768px) hidden behind the sticky header (header z-50 > bar z-30). At sm+ the h-11 back button's top 3px are occluded, leaving a 41px visible touch target; the bar's top border + padding are clipped under the blurred header edge at all widths. Header was measured: condensed = 53px @320, 65px @768 (class math: chip py-1.5/py-2 + img h-9/h-11 + header py-0.5 + 1px border).
- Evidence: measured scrolled state @768: `headerBottom:65, barTop:50, overlapPx:15, btnClearsHeader:false`.
  ```tsx
  <div className="sticky top-[42px] z-30 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:top-[50px] sm:px-6">
  ```
- Fix: change offsets to the measured condensed header heights: `top-[42px]` → `top-[53px]`, `sm:top-[50px]` → `sm:top-[65px]`. (Purely additive correction; no desktop/mobile look change other than removing the occlusion.) Longer term: export a `--site-header-h` CSS var from site-header so these magic numbers can't drift again.

### [MED] src/components/views/signup-view.tsx:211-223 — Consent checkbox: 20×20 touch target and tapping the label text does nothing
- Issue: The privacy-consent gate (required to sign up) is a `role="checkbox"` **button** at 20×20px (`size-5`). A `<label>`'s click-forwarding only works for labelable elements (input/select/textarea…), NOT `<button>`, so tapping the long consent sentence is a dead tap. Measured at 320px: `size:"20x20", before:"false", afterTextClick:"false"` — after clicking the label text, aria-checked is unchanged. On mobile the only way to consent is hitting the exact 20px square — half the recommended 44px minimum.
- Evidence:
  ```tsx
  <label className="flex cursor-pointer items-start gap-3 border border-border p-4 …">
    <button type="button" role="checkbox" aria-checked={agreed} onClick={() => setAgreed(!agreed)}
      className={`mt-0.5 flex size-5 shrink-0 …`}> {agreed && <Check …/>} </button>
    <span className="text-sm …">I have read and understand the Privacy Notice…</span>
  </label>
  ```
- Fix (surgical, keeps the sharp-square look): make the label's click actually toggle and enlarge the hit area — either (a) replace the button with a visually-hidden native checkbox `<input type="checkbox" className="sr-only" checked={agreed} onChange={…} />` keeping the styled square as the visual (then the whole label works, matching fast-track-apply-dialog.tsx:564-571 which already does it correctly), or (b) minimal: move `onClick={() => setAgreed(!agreed)}` onto the `<label>` and add `min size-6` + padding to the square. Option (a) is the in-repo precedent.

### [MED] src/components/views/jobs-view.tsx:669 — `truncate` clips the government Item No. reference code in the 2-col mobile summary grid
- Issue: SummaryCell value uses `truncate`; at 320px the detail summary grid is `grid-cols-2` (jobs-view.tsx:577), each cell 138px with ~108px value box. Measured: "MIRDCB-MTEK2-6-1998" (19 chars) has `scrollWidth > clientWidth` → silently clipped with no title/tooltip and no way to read the full item number (the reference applicants quote in applications). Salary/Vacancies values measured fit fine.
- Evidence:
  ```tsx
  // line 578 — first cell uses Item No.
  <SummaryCell icon={…} label="Item No." value={pos?.itemNumber || "—"} />
  // line 669
  <div className="mt-1.5 truncate text-sm font-semibold tracking-[-0.01em] text-foreground">{value}</div>
  ```
- Fix: on line 669 replace `truncate` with `break-all` (reference codes have no spaces; money/SG values stay one line since they fit). Zero effect at ≥414px where values fit.

### [LOW] src/components/views/jobs-view.tsx:594,615,621,627 — `prose prose-sm prose-invert` classes are inert (no typography plugin) and rich HTML has no overflow guard
- Issue: `@tailwindcss/typography` is not installed (package.json + globals.css + tailwind.config.ts checked) and Tailwind v4 loads no `@plugin` for it, so the four `prose … prose-invert` class strings do nothing — importantly this is NOT a light-mode hazard (wrapper `text-foreground/90` governs color; verified readable in light mode). But because SafeHtml's sanitizer explicitly allowlists `<table>` (lib/sanitize.ts:12) and the SafeHtml wrapper div has no `overflow-x-auto`, any admin-authored table in Brief/Duties/Compensation HTML will force page-level horizontal scroll at ≤414px (currently latent — seeded jobs contain no `<table>` and no ≥60-char unbreakable tokens; verified via API sweep of all 5 jobs).
- Evidence:
  ```tsx
  <SafeHtml html={job.dutiesResponsibilitiesHtml} className="prose prose-sm prose-invert max-w-none text-foreground/90" />
  ```
- Fix: remove the dead `prose prose-sm prose-invert` classes (or install the plugin if editorial styling is wanted) and add `overflow-x-auto` to the same className so sanitized tables can't break the mobile page: `className="max-w-none text-foreground/90 overflow-x-auto"`.

### [LOW] src/components/workspaces/public/sections/positions.tsx:120 — Loading skeleton cards wider than the 320px viewport, clipped with no scroll
- Issue: `JobsSkeleton` mirrors the carousel with fixed `w-[300px]` cards inside `overflow-hidden` (line 116). At 320px the padded container is 288px, so the first skeleton card is permanently clipped ~12px on the right and cards 2-3 are invisible during the entire load state. Cosmetic (real carousel is overflow-x-auto and works — measured scrollable, 1564px content).
- Evidence:
  ```tsx
  <div className="flex gap-4 overflow-hidden pb-4">
    {[0, 1, 2].map((i) => (
      <div key={i} className="h-[440px] w-[300px] shrink-0 overflow-hidden border border-border sm:w-[340px]">
  ```
- Fix: `w-[300px]` → `w-[280px]` (or `w-[88vw] max-w-[300px]`) so the first skeleton fits 288px containers; desktop unchanged (`sm:w-[340px]` stays).

### [LOW] src/app/layout.tsx (app-wide; seen at public-landing.tsx:32, signin-view.tsx:69, signup-view.tsx:89, jobs-view.tsx:224/247/268) — `min-h-screen` (100vh) instead of `min-h-dvh`
- Issue: All audited page wrappers use `min-h-screen`. On iOS Safari ≤15.4 / Android with dynamic URL bars, 100vh exceeds the visible viewport, so the page bottom (e.g. signin's footer line "© DOST-MIRDC · RA 10173") sits below the fold behind browser chrome. Not a layout break (min-h never clips), but dvh is the correct modern value.
- Evidence: `<div className="flex min-h-screen flex-col bg-background text-foreground">` (public-landing.tsx:32, signin-view.tsx:69, signup-view.tsx:89, jobs-view.tsx:224,247,268).
- Fix: `min-h-screen` → `min-h-dvh` in those wrappers (Tailwind v4 supports `min-h-dvh`). Zero visual change on desktop.

---

## Verified clean (no findings)
- **jobs-carousel.tsx** — model citizen: cards `w-[300px] sm:w-[340px]` inside `overflow-x-auto` scroll-snap row (measured scrollable at 320, body overflow false); header row `flex-wrap`; filter chips wrap with `min-h-11` (44px); card chips sit on the fixed-light `.block-surface` so `bg-black/5`/`bg-[#E2062E] text-white` inks are correct in BOTH modes; title/meta wrap; mobile swipe hint present (`sm:hidden`); arrows correctly desktop-only.
- **positions.tsx (ready/empty states)** — `max-w-screen-xl mx-auto` centering at all widths; `display-hero` clamp floors at 44px and wraps (measured h1 288/288 no clip); `text-foreground`, `text-foreground/60` tokens correct in both modes (the old `text-white/60` is gone).
- **fast-track-apply-dialog.tsx** — Dialog base (ui/dialog.tsx:65) is mobile-safe `w-full max-w-[calc(100%-2rem)]` + `max-h-[calc(100vh-2rem)]`; body adds `max-h-[65vh] overflow-y-auto`; summary grid `grid-cols-2 sm:grid-cols-3`; footer button rows `flex-col sm:flex-row`; step rail `flex-wrap`; filename `truncate min-w-0`; error text `break-words`; certification uses a real `<input type=checkbox>` inside the label (tap-safe). No findings.
- **jobs-view.tsx dialogs** — all three AlertDialogs measured 288px wide, x=16, h=354 at 320×568, fits vertically; footer stacks (`flex-col-reverse`); MQR list is `flex-1 overflow-y-auto` under the ui max-h cap. No findings.
- **signin-view.tsx** — single column < lg, `lg:w-[520px]` split verified at 1024 (left 534/right 520); form panel 288px at 320; demo chips measured 44px tall with flex-wrap; password toggle 48px; no overflow.
- **page.tsx / layout.tsx** — router has no width-sensitive markup; Next injects the default `width=device-width` viewport meta; fonts use `display:swap` (no CLS hazard class). Sonner toaster top-right clamps to viewport.
- **Light mode sweep** — toggled live: canvas white/black ink tokens resolve on landing, jobs list, job detail, auth pages; all hardcoded hexes found in assigned files (`bg-[#E2062E] text-white`, `bg-black/5 text-black/70`, `text-[#0E7ABF]`, `#1A1A1A` skeletons) sit exclusively on fixed-light surfaces that are identical in both modes. Zero contrast breaks found.

## Summary

| Severity | Count |
|----------|-------|
| CRIT     | 0     |
| HIGH     | 1     |
| MED      | 3     |
| LOW      | 3     |
| **Total**| **7** |

## Safe fixes (pure additive/corrective, zero visual change at desktop)
1. jobs-view.tsx:531 `top-[42px]`→`top-[53px]`, `sm:top-[50px]`→`sm:top-[65px]` (removes occlusion only).
2. jobs-view.tsx:669 `truncate`→`break-all` (no effect where values fit; un-clips Item No. on mobile).
3. jobs-view.tsx:594/615/621/627 add `overflow-x-auto`, drop inert `prose` classes (no rendered change today).
4. min-h-screen→min-h-dvh ×6 wrappers (desktop unaffected).
5. positions.tsx:120 `w-[300px]`→`w-[280px]` (skeleton only; sm unchanged).

## Visual changes (alter current look — need owner sign-off)
1. site-header.tsx logo-chip squeeze fix (chip shrink-0 + hide Positions link & RMIS wordmark below sm) — changes mobile header composition; shared component, coordinate first.
2. signup-view.tsx consent control rework to a labelable checkbox (same sharp-square skin, but the square grows to a ≥24px hit area / sr-only input pattern).

## Process notes
- Read-only audit: no source file touched; only this report written. Dev server at :3000 (pre-existing) was used for measurement; a duplicate instance attempt on :3111 exited cleanly on the .next lock (no state disturbed).
