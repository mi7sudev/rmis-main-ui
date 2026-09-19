# R2-d — Staff Surfaces Responsiveness Audit (read-only)

Task ID: R2-d · Scope: admin/evaluator/recruitment/candidates/analytics/settings staff surfaces ·
Design system: Accenture-inspired (#1591DC primary, 0px radius, no shadows, dual dark/light tokens).
Method: every assigned file read end-to-end; mentally rendered at 320 / 375 / 414 / 768 / 1024 / 1280 / 1440 / 1920, dark + light.
Shell geometry used for math: nav rail `w-16` (64px, hidden <md) → content ≈ W−32 (<md, px-4), W−64−48 (md, px-6), W−64−64 (lg+, px-8), capped by `max-w-[1400px]`.

Severity counts: **CRIT 2 · HIGH 6 · MED 6 · LOW 6** (20 findings)

---

## CRITICAL

### [CRIT] src/components/workspaces/settings/settings.tsx:1594-1945 — PositionFormDialog clips its own footer on standard laptops
- Issue: DialogContent is `max-h-[calc(100vh-2rem)] overflow-hidden flex flex-col` (ui/dialog.tsx:58-60), but the 20-field form (basic info ×6 + salary ×3 + org ×3 + two accordions) is a plain `space-y-4` flex child with **no internal scroll region**. Content ≈ 1400-1600px tall → on any viewport shorter than ~1500px (1366×768, 1440×900, 1024×768 tablets — the primary staff hardware) everything below ~740px is hard-clipped: the CSC accordion, preferred qualifications, and the **Save/Create button are unreachable**. No scroll, no way to submit. Compare the correct in-repo pattern one file over (recruitment-list.tsx:593-595 / job-workspace.tsx:959-961: `min-h-0 flex-1 … overflow-y-auto`).
- Evidence:
  ```tsx
  // settings.tsx:1605
  <form onSubmit={submit} className="space-y-4">
  ```
  vs the working pattern:
  ```tsx
  // job-workspace.tsx:959-961
  <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
  ```
- Fix: mirror the working pattern — form → `className="flex min-h-0 flex-1 flex-col overflow-hidden"`; wrap all fields (L1606-1928) in `<div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">…</div>`; add `shrink-0` to the DialogFooter at L1930 (`className="shrink-0 pt-2"`). Zero desktop visual change when the dialog fits.

### [CRIT] src/components/workspaces/recruitment/job-workspace.tsx:723 — CandidatesTab table clipped with no horizontal scroll at 320-414px
- Issue: the Name/Status/Applied/Action table (min-w-[200px] name + status pill ~110px + date ~90px + View action ~90px ≈ 480-520px natural width) sits in a `overflow-hidden` wrapper. Below ~560px of content width the table is **clipped without any scrollbar** — the Action ("View") column is unreachable at 320/375/414 (content 288/343/382px). The ui Table primitive provides no overflow container (ui/table.tsx container is just `relative w-full h-full`).
- Evidence:
  ```tsx
  // job-workspace.tsx:723-724
  <div className="overflow-hidden border border-border bg-card">
    <Table>
  ```
- Fix: surgical, additive — `overflow-hidden` → `overflow-x-auto` (desktop unchanged: the table already fits ≥560px). Optionally add `min-w-[560px]` on the `<Table>` for consistent column proportions while scrolling.

---

## HIGH

### [HIGH] src/components/workspaces/settings/settings.tsx:479-605 — Users table Actions column clipped at md–lg (all tablets)
- Issue: 6-column table inside `<Card className="overflow-hidden …">` (no overflow-x-auto). Column minimums: Name min-w-[200px] + Email min-w-[220px] + Role chip ~120px + Status badge ~90px + Created min-w-[110px] + 3 icon actions ~110px ≈ **850px**. Settings right panel = container − 220px sub-nav − 24px gap → ~656px at 768 (md, stacked), ~652px at 1024 (lg) → right side (Actions: edit/disable/delete) clipped, no scroll, on every portrait tablet and 1024 laptop.
- Evidence:
  ```tsx
  // settings.tsx:479-483
  <Card className="overflow-hidden border-border bg-card">
    <Table>
      <TableHeader>
        <TableRow className="bg-tablehead hover:bg-tablehead">
          <TableHead className="pl-4 min-w-[200px]">Name</TableHead>
  ```
- Fix: `overflow-hidden` → `overflow-x-auto` on the Card (additive; ≥1280 panels ~908px already fit). Keep the sticky `bg-tablehead` header — it already has an opaque band.

### [HIGH] src/components/workspaces/settings/settings.tsx:1274-1369 — Positions table clipped at md–lg
- Issue: same pattern; 8 columns (Item 120 + Title 220 + Type ~90 + SG ~60 + Salary ~90 + Place ~120 + Jobs ~60 + Actions ~90 ≈ **850px**) vs ~652px panel at 1024 → Place/Jobs/Actions clipped, unreachable edit/view buttons.
- Evidence: `<Card className="overflow-hidden border-border bg-card">` at L1274 wrapping the Table.
- Fix: `overflow-hidden` → `overflow-x-auto`.

### [HIGH] src/components/workspaces/settings/settings.tsx:2338-2426 — Audit Log table clipped at md–lg
- Issue: same pattern; min-widths When 150 + User 140 + Role ~80 + Action 150 + Description 260 + IP (whitespace-nowrap) ~120 ≈ **900px** vs 652px panel at 1024 → Description/IP columns (and anything right of Action) clipped on tablets and 1024 laptops.
- Evidence: `<Card className="overflow-hidden border-border bg-card">` at L2338; `whitespace-nowrap` cells at L2377/L2418 widen the floor.
- Fix: `overflow-hidden` → `overflow-x-auto`.

### [HIGH] src/components/workspaces/recruitment/job-workspace.tsx:261-276 — Contextual tabs strip overflows 320-414px (no scroll/wrap)
- Issue: 4 `TabsTrigger`s ("Overview", "Pipeline"+count badge, "Candidates", "Activity") in the default TabsList — `inline-flex w-fit`, triggers `whitespace-nowrap px-4 text-sm` ≈ **420-440px** total. Content width 288/343/382px at 320/375/414 → the strip overflows the page (no overflow container) causing body-level horizontal scroll with "Activity" half off-screen. The rest of the app already solves this (candidate-detail.tsx:220 uses `flex-wrap`; review-workspace.tsx:282 wraps TabsList in `overflow-x-auto`).
- Evidence:
  ```tsx
  // job-workspace.tsx:261
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="pipeline">Pipeline {jobQueue.length > 0 && (<Badge …>{jobQueue.length}</Badge>)}</TabsTrigger>
    <TabsTrigger value="candidates">Candidates</TabsTrigger>
    <TabsTrigger value="activity">Activity</TabsTrigger>
  </TabsList>
  ```
- Fix: wrap the TabsList in the review-workspace pattern:
  ```tsx
  <div className="-mx-4 px-4 overflow-x-auto">
    <TabsList>…</TabsList>
  </div>
  ```
  (negative-margin variant keeps the hairline rule full-bleed; plain `<div className="overflow-x-auto">` also works and is zero-visual-change on desktop).

### [HIGH] src/components/workspaces/settings/settings.tsx:1048-1195 — EditUserDialog can clip its footer at short viewport heights
- Issue: same missing-internal-scroll shape as the CRIT finding, shorter content (~680-760px incl. Account Status + Reset Password blocks). Fits at 768px-tall screens but the Save button clips on landscape phones / split-view heights (<~740px). Staff on tablets in landscape (1024×768 is exactly borderline) can lose the footer.
- Evidence: `<form onSubmit={submit} className="space-y-3">` at L1064 inside the `max-h … overflow-hidden` DialogContent.
- Fix: same surgical pattern — `flex min-h-0 flex-1 flex-col overflow-hidden` on the form, wrap fields in `min-h-0 flex-1 space-y-3 overflow-y-auto pr-1`, `shrink-0` on DialogFooter (L1178).

### [HIGH] src/components/workspaces/settings/settings.tsx:844-977 — CreateUserDialog: same footer-clip risk
- Issue: 6-field form (~620-680px) without internal scroll; clips below ~700px viewport heights (landscape phones, small tablets rotated).
- Evidence: `<form onSubmit={submit} className="space-y-3">` at L852.
- Fix: same pattern as above (`min-h-0 flex-1` + inner `overflow-y-auto`, `shrink-0` footer at L960).

---

## MEDIUM

### [MED] src/components/workspaces/candidates/candidate-detail.tsx:477-483 — Contact email has no break-all → long addresses overflow the card at 320-414
- Issue: the mailto anchor renders the raw email in a `text-sm` block inside ContactRow (`min-w-0` inner div but no wrapping utility). Emails contain no spaces → unbreakable; a long address (e.g. `juandelacruz.santos@example-company.com.ph`) overflows the bordered card at single-column widths (<sm). The same file already solves this for character references with `break-all` (L537).
- Evidence:
  ```tsx
  <a href={`mailto:${data.emailAddress}`} className="text-primary hover:underline">
    {data.emailAddress}
  </a>
  ```
- Fix: `className="break-all text-primary hover:underline"` (parity with L537; zero desktop change for normal-length emails).

### [MED] src/components/workspaces/recruitment/job-workspace.tsx:209-214 — Header h1 + status pill row lacks flex-wrap
- Issue: `flex items-center gap-3` puts the `display-lg` h1 (clamp ≥26px) beside the OPEN/CLOSED pill with no wrap and no min-w-0/truncate on the h1. Real titles are long ("ADMINISTRATIVE AIDE VI (DOST-MIRDC)"): at 320-414 the pill keeps its width and the h1 is squeezed into a ~200px column → 4-5 ragged wrapped lines beside a vertically-centered chip.
- Evidence:
  ```tsx
  <div className="flex items-center gap-3">
    <h1 className="display-lg text-foreground">{title}</h1>
    <StatusIndicator status={active ? "OPEN" : "CLOSED"} size="sm" />
  </div>
  ```
- Fix: add `flex-wrap` — `className="flex flex-wrap items-center gap-x-3 gap-y-1"`. Desktop titles that fit stay on one line (zero change); long titles push the pill to its own row on narrow screens.

### [MED] src/components/workspaces/recruitment/job-workspace.tsx:420-456 — Overview aside metrics: text-3xl currency collides in 2-col grid at 320
- Issue: the Summary aside's `grid grid-cols-2 gap-4` renders Metric values at `text-3xl` (30px). `₱25,000.00` ≈ 160px wide (no break opportunities inside the number) vs ~125px per cell at 320px → the value paints over the neighbouring cell. Same risk for "Monthly Salary"/"Salary Grade" pairs on 320-414.
- Evidence: `<div className="mt-4 grid grid-cols-2 gap-4">` (L420) with `<Metric label="Monthly Salary" value={…formatCurrency(…)} />` (L430-438).
- Fix: `className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"` — single column at 320-599 (full-width cells fix the collision), unchanged ≥640px and unchanged on desktop where the aside is the 320px lg column.

### [MED] src/components/workspaces/settings/settings.tsx:844-977 + recruitment-list.tsx:580-808 — JobFormDialog footer buttons rely on viewport ≥ ~700px
- Issue: recruitment-list JobFormDialog has the correct internal-scroll pattern, but on 320×568-style heights the `max-h-[calc(100vh-2rem)]` dialog leaves ~120px for header+footer; the form's 4 textareas (rows 2/4/3/3) still consume most of it and the footer sits flush — acceptable, but the two-row `grid sm:grid-cols-3` date inputs render cramped (~90px fields) at 320. Cosmetic-plus.
- Evidence: `<div className="grid gap-3 sm:grid-cols-3">` (recruitment-list.tsx:683, job-workspace.tsx:1049).
- Fix (optional): `grid gap-3 grid-cols-1 min-[480px]:grid-cols-3` on the dates row in both dialogs — keeps desktop 3-up, stacks date inputs on 320-414 so the native date pickers don't truncate.

### [MED] Touch targets 28-32px in dense staff tables (multiple files)
- Issue (noted per instructions, not overweighted — staff use pointers): `size-8` (32px) and `size-7` (28px) icon buttons below the 44px guideline: candidate-workspace.tsx:555 (`size-8` chevron), recruitment-list.tsx:438 (`size-8`), settings.tsx:542/549/565/582 (Users row icons), settings.tsx:1347/1358 (Positions row icons), candidate-drawer.tsx:432 (`size-7` close). Tablets with finger input are the stated usage.
- Evidence: `className="size-8 text-muted-foreground hover:text-primary"` (recurs ~7×).
- Fix (safe, additive): bump to `size-9` (36px) on table-row icon buttons where row height allows (rows are h~56px, so no layout shift), or add `p-2` hit-area via `before:absolute before:inset-[-6px]`. Keep `size-7` only inside the drawer header.

### [MED] src/components/workspaces/evaluator/review-queue.tsx:352-364 — Decision-chip group can exceed its fixed sm:w-56 box
- Issue: shortlisted rows render "Email notice sent" chip (~140px) + status pill (~90px) + `gap-3` ≈ 250px inside `sm:w-56` (224px) with both children `shrink-0` and no wrap → ~26px visual bleed toward the Review button at sm–lg widths.
- Evidence:
  ```tsx
  <div className="flex items-center gap-3 sm:w-56 sm:shrink-0">
  ```
- Fix: add `flex-wrap` and widen a notch: `className="flex flex-wrap items-center gap-2 sm:w-60 sm:shrink-0"` (or keep w-56 with `gap-2`; either stops the bleed).

---

## LOW

### [LOW] src/components/workspaces/candidates/candidate-drawer.tsx:428-438 — Duplicate overlapping close buttons in sheet variant
- Issue: ui/sheet.tsx always renders a built-in absolute `top-4 right-4` close (32px); DrawerShell renders a second custom close (`size-7`, inset 8px) → two overlapping X affordances in the mobile sheet (ambiguous hit area, double icon at 320-414).
- Evidence: SheetContent at L141-148 + DrawerShell close button L429-437.
- Fix: render the DrawerShell close only when `variant === "panel"` (thread the existing `variant` prop into DrawerShell), letting the built-in Sheet close own the sheet case.

### [LOW] src/components/workspaces/settings/sms-panel.tsx:248 — SMS outbox table relies on implicit horizontal overflow
- Issue: `max-h-96 overflow-y-auto` wrapper makes overflow-x compute to `auto` (CSS spec), so the nowrap "To" + "Message max-w-80" table does scroll — but no explicit wrapper means an invisible/unstyled scrollbar and no scroll affordance on touch; at 320px the message column shrinks to ~120px.
- Evidence: `<div className="max-h-96 overflow-y-auto">` at L248.
- Fix: `className="max-h-96 overflow-x-auto overflow-y-auto"` (additive; identical desktop rendering).

### [LOW] src/components/workspaces/settings/email-panel.tsx:266 — Email outbox table: same implicit overflow
- Issue/fix: identical to sms-panel — change L266 to `max-h-96 overflow-x-auto overflow-y-auto`. Truncation on To/Subject (max-w-44/max-w-80 + truncate) is already correct.

### [LOW] src/components/workspaces/analytics/analytics.tsx:420-436 — Funnel conversion label wraps awkwardly at 320
- Issue: `flex items-baseline justify-between gap-2` row holds stage label + "Applications → Shortlisted: 43%" + count; at 288px content the conversion span wraps mid-phrase without a controlled break.
- Evidence: right group `<div className="flex items-baseline gap-2 text-muted-foreground">` (L424).
- Fix: add `flex-wrap` to the outer row and `min-w-0` to the right group — `className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-xs"`. Desktop unchanged (single line still fits).

### [LOW] src/components/workspaces/analytics/analytics.tsx:542-550 — Status-distribution BarChart YAxis fixed 120px starves the plot on phones
- Issue: vertical bar chart's category axis is hard-coded `width={120}`; at 320px the plot area is ~130px, and long labels ("Partially Extracted") are clipped by recharts (no wrap).
- Evidence: `<YAxis type="category" … width={120} />` (L549).
- Fix (note-only, JS change): width `={typeof window !== "undefined" && window.innerWidth < 640 ? 88 : 120}` via the existing client component, or shorten labels with a formatter. Defer if not wanted.

### [LOW] Candidate workspace list panel: 440px fixed right panel squeezes the table at exactly 1024
- Issue: candidate-workspace.tsx:382 `lg:grid-cols-[1fr_440px]` leaves ~440px for the 5-column table at 1024 (email column visible ≥md, max-w-[220px]); name truncates hard. Functional, but cramped on the stated small-laptop tier. The email table cell's `max-w-[220px]` (L526) is the right lever.
- Fix (optional, visual change): `lg:grid-cols-[1fr_400px]` or `hidden min-[1100px]:table-cell` on Email. Defer — currently not broken.

---

## Verified-clean areas (no action)

- **admin/command-center.tsx** — attention grid `sm:grid-cols-2 lg:grid-cols-4`, split `lg:grid-cols-[1fr_320px]`, stage metrics `hidden sm:flex`, truncates + min-w-0 everywhere; skeleton widths fine.
- **admin/pipeline-board.tsx** — 3 kanban columns stack <lg, `lg:w-[260px] lg:shrink-0` + `lg:overflow-x-auto` ≥lg; `max-h-[60vh]` body scroll; health legend `grid-cols-2 sm:grid-cols-3`; `text-warning` is a registered token (globals.css:101).
- **candidates/candidate-workspace.tsx** — Sheet drawer `w-full sm:max-w-[440px]` (safe at 320); kanban `lg:grid-flow-col lg:auto-cols-[280px] lg:overflow-x-auto`; table hides email <md / login <sm; visible columns fit 288px; ScrollArea vertical-only is safe here.
- **evaluator/review-workspace.tsx** — split panes `grid-cols-1 lg:grid-cols-[45%_55%]`; left tabs pre-wrapped in `overflow-x-auto` (L282); candidate email already `break-all` (L263); ConfirmDecisionDialog is short + `sm:max-w-md` (DialogContent has `max-w-[calc(100%-2rem)]` floor at 320).
- **views/evaluator/types.tsx** — pure FieldRow renderers (break-words + stack <sm); no overflow-prone constants.
- **views/admin/types.ts** — POSITION_TYPES labels are short; no label can overflow.
- **Hardcoded color check** — `border-[#0041F0]/50 bg-[#0041F0]/10` in settings ACTION_TONE_CLS (L2143) is documented in worklog Task 3-c as the accent-1 brand hue, identical in both token sheets — light mode safe. All status inks use mode-tuned tokens (danger/success/warning/info-ink) across all 15 files; no dark-only hex found on mode-changing surfaces.

---

## Severity summary

| Severity | Count | Findings |
|---|---|---|
| CRIT | 2 | PositionFormDialog footer clipped on laptops (settings.tsx:1594); CandidatesTab table clipped 320-414 (job-workspace.tsx:723) |
| HIGH | 6 | Users table clipped md-lg (settings.tsx:479); Positions table clipped (settings.tsx:1274); Audit table clipped (settings.tsx:2338); Job tabs overflow 320-414 (job-workspace.tsx:261); EditUserDialog footer (settings.tsx:1048); CreateUserDialog footer (settings.tsx:844) |
| MED | 6 | Email no break-all (candidate-detail.tsx:477); header h1+pill no wrap (job-workspace.tsx:209); aside metric collision (job-workspace.tsx:420); date grids at 320 (recruitment-list.tsx:683); touch targets 28-32px (multiple); review-queue chip bleed (review-queue.tsx:352) |
| LOW | 6 | Drawer double close (candidate-drawer.tsx:428); SMS outbox implicit x-scroll (sms-panel.tsx:248); Email outbox same (email-panel.tsx:266); funnel wrap (analytics.tsx:420); BarChart YAxis 120px (analytics.tsx:549); 440px panel squeeze at 1024 (candidate-workspace.tsx:382) |

## Safe fixes (additive, zero desktop visual change) — do first
1. settings.tsx:479 / :1274 / :2338 — `overflow-hidden` → `overflow-x-auto` (3 one-class edits).
2. job-workspace.tsx:723 — `overflow-hidden` → `overflow-x-auto`.
3. job-workspace.tsx:261 — wrap TabsList in `overflow-x-auto` div.
4. settings.tsx:1605 (PositionFormDialog), :852 (CreateUser), :1064 (EditUser) — internal-scroll dialog pattern (matches existing job-workspace.tsx:959 pattern; renders identically when content fits).
5. candidate-detail.tsx:480 — add `break-all`.
6. review-queue.tsx:352 — add `flex-wrap`.
7. sms-panel.tsx:248 / email-panel.tsx:266 — explicit `overflow-x-auto`.
8. analytics.tsx:420 — `flex-wrap` on funnel row.

## Visual changes (need a look before applying)
1. job-workspace.tsx:209 — `flex-wrap` header (changes narrow layouts only, desktop identical for short titles).
2. job-workspace.tsx:420 — aside metrics `grid-cols-1 sm:grid-cols-2` (320-599 becomes single column).
3. recruitment-list.tsx:683 / job-workspace.tsx:1049 — date rows stack <480px.
4. Touch-target bumps `size-8 → size-9` in staff tables.
5. analytics.tsx:549 — responsive YAxis width (JS).
6. candidate-workspace.tsx:382 — panel width retune at 1024.
