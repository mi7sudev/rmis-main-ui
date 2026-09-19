# Audit R2-c — Applicant Surface Responsiveness

- **Scope:** applicant-home.tsx, my-applications.tsx, profile-view.tsx, upload-pds-card.tsx, profile/{personal-info,education,work-experience,eligibility,training,awards,documents}-section.tsx, extraction-review-dialog.tsx, form-fields.tsx, use-profile-data.ts
- **Method:** every assigned file read end-to-end; mentally rendered at 320 / 375 / 414 / 768 / 1024 / 1280 / 1440 / 1920, dark + light (all colors audited are already token-based per Task 5-b — no color findings). Foundation files (ui/dialog, ui/button, ui/input, ui/checkbox, globals.css) read for verification only, not modified.
- **Key verified fact (root cause of the CRIT/HIGH dialog findings):** `DialogContent` (ui/dialog.tsx:65–68) carries both `grid` and `flex flex-col`. In the **compiled CSS served by the dev server** (chunk `[root-of-the-server]__99b26cbe._.css`), `.grid { display:grid }` is emitted at offset 44455, **after** `.flex { display:flex }` at 44421 → equal specificity, later wins → **every DialogContent actually renders as CSS grid**. Consequently `flex flex-col` on the panel and `shrink-0` / `flex-1` / `min-h-0` on its children are inert, and the `max-h-[calc(100vh-2rem)] overflow-hidden` safety net **clips** (not scrolls) any content taller than the viewport — the bottom-clipped element is always the DialogFooter (Cancel / Save). No source file was modified for this audit; the finding is per-file fixable inside my scope without touching the foundation.

---

## Findings

### [CRIT] src/components/views/profile/extraction-review-dialog.tsx:84 — Dialog renders as grid; review body never scrolls, footer clipped
- Issue: With a real PDS extraction (personal rows + 5 item-card groups ≈ 1,300–1,700px content), the dialog content exceeds `max-h-[calc(100vh-2rem)]`. Because the panel lays out as **grid** (see root-cause note), the body's `overflow-y-auto flex-1 min-h-0` (line 118) never engages and the `DialogFooter` (Cancel / **Apply to Profile**, lines 232–241) is clipped off-screen with no way to reach it — on every phone portrait and short desktop windows. This dialog is the AI-extraction centerpiece of the applicant flow.
- Evidence:
  ```tsx
  <DialogContent className="sm:max-w-[680px]">          // line 84 — "grid … flex flex-col" inside the component resolves to grid
    <DialogHeader className="shrink-0">                 // inert under grid
    ...
    <div className="overflow-y-auto flex-1 min-h-0 -mx-1 px-1 space-y-4 py-2">   // line 118 — never scrolls
    <DialogFooter className="shrink-0 border-t border-border pt-4">              // line 232 — clipped
  ```
- Fix (surgical, per-file, zero change when content fits):
  `className="sm:max-w-[680px] flex! flex-col!"` on DialogContent (Tailwind v4 trailing-`!`). The existing body classes then work as designed; no other change.

### [CRIT] src/components/views/profile/work-experience-section.tsx:193 — Add/Edit Work dialog: Save/Cancel unreachable (clips even on tall phones)
- Issue: 10 stacked fields at 1-col (`md:grid-cols-2` only ≥768px) incl. a `min-h-[80px]` textarea → body ≈ 930px; + header/footer/padding ≈ **1,050px** vs max-h 812px at 390×844 → footer (Save Changes / Cancel, lines 291–302) and the duties textarea are clipped, no internal scroll. Also clips on short desktop windows at the 2-col layout (≈900px total vs ~700–740px viewport on 768–800px-tall laptops).
- Evidence:
  ```tsx
  <DialogContent className="sm:max-w-[560px]">                 // line 193
    <DialogHeader className="shrink-0"> ... </DialogHeader>
    <div className="grid grid-cols-1 gap-4 py-2 pr-1 md:grid-cols-2">   // line 202 — no scroll, cannot shrink (grid row = min-content)
  ```
- Fix: DialogContent → `className="sm:max-w-[560px] flex! flex-col!"`; body div → `"grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto py-2 pr-1 md:grid-cols-2"`. Footer stays pinned and visible; desktop layout identical when content fits.

### [HIGH] src/components/views/profile/education-section.tsx:162 — Education dialog footer clipped on ≤667px-tall viewports
- Issue: 6 stacked fields ≈ 540px body + header/footer ≈ 706px total. Fits 812px (iPhone 12+) but **clips Save/Cancel on 667px devices** (iPhone SE 2/3, iPhone 8 — still common) and 568px (SE 1). No internal scroll (grid root cause).
- Evidence: line 162 `<DialogContent className="sm:max-w-[520px]">`; line 171 body `<div className="grid grid-cols-1 gap-4 py-2 pr-1 md:grid-cols-2">`; footer lines 217–228 `shrink-0` (inert).
- Fix: same one-line pattern — DialogContent `sm:max-w-[520px] flex! flex-col!`; body add `min-h-0 flex-1 overflow-y-auto`.

### [HIGH] src/components/views/profile/eligibility-section.tsx:198 — Eligibility dialog footer clipped on ≤667px-tall viewports
- Issue: title block (label+select ≈70px) + 5 fields ≈ 536px body → ~700px total; identical clip math to education. (The `SelectContent max-h-72` at line 223 is fine.)
- Evidence: line 198 `<DialogContent className="sm:max-w-[520px]">`; line 207 body grid without scroll; footer lines 289–300.
- Fix: same pattern — DialogContent `sm:max-w-[520px] flex! flex-col!`; body add `min-h-0 flex-1 overflow-y-auto`.

### [HIGH] src/components/views/profile/awards-section.tsx:173 — Awards dialog footer clipped on ≤667px-tall viewports
- Issue: 6 fields (details is col-span-2) ≈ 540px body → ~706px total; clips footer on 667px/568px devices, no internal scroll.
- Evidence: line 173 `<DialogContent className="sm:max-w-[520px]">`; line 182 body grid; footer lines 224–235.
- Fix: same pattern — DialogContent `sm:max-w-[520px] flex! flex-col!`; body add `min-h-0 flex-1 overflow-y-auto`.

### [HIGH] src/components/views/profile/extraction-review-dialog.tsx:282 — Fixed `w-40 shrink-0` field-label column squeezes values to 32–126px on phones
- Issue: `ExtractedFieldRow` is `flex items-center gap-3` with the label at fixed `w-40 shrink-0` (160px). Inside the 320px dialog (288px panel − 48px padding − 16px row padding − 8px dot − 2×12px gaps) the value column gets **~32px** — `break-words` then wraps values 2–3 characters per line (unreadable). At 375px → ~87px; at 414px → ~126px. Affects both the Personal group and every ExtractedItemCard row. All phones < ~500px are affected; this is the review surface applicants must read.
- Evidence:
  ```tsx
  <div className="flex items-center gap-3 rounded-none px-2 py-1.5 transition-colors hover:bg-secondary/60">
    <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} title={meta.label} />
    <span className="w-40 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>   // line 282
  ```
- Fix (desktop byte-identical; stacks on mobile):
  row → `"flex flex-col gap-0.5 rounded-none px-2 py-1.5 transition-colors hover:bg-secondary/60 sm:flex-row sm:items-center sm:gap-3"`;
  label span → `"sm:w-40 sm:shrink-0 text-xs font-medium text-muted-foreground"`. (Value spans already `flex-1 break-words`.)

### [MED] src/components/views/profile/training-section.tsx:164 — Training dialog footer clipped only on ≤568px viewports
- Issue: 5 fields ≈ 450px body → ~616px total: fits 667px, clips 568px (iPhone SE 1) with no internal scroll (grid root cause).
- Evidence: line 164 `<DialogContent className="sm:max-w-[520px]">`; line 173 body grid; footer lines 212–223.
- Fix: same pattern — DialogContent `sm:max-w-[520px] flex! flex-col!`; body add `min-h-0 flex-1 overflow-y-auto`.

### [MED] src/components/views/profile/documents-section.tsx:335 — Category chip (shrink-0, ~145px) collides with file name / action buttons at ≤414px
- Issue: In `DocumentRow`, the name+chip row is `flex items-center gap-2`. The chip ("PERFORMANCE EVALUATION" ≈ 145px at 10px uppercase + tracking) is `shrink-0`; at 320px the `min-w-0 flex-1` middle column is only ~82px, so the chip paints over the extract/delete buttons (row container has no overflow-x relief inside the `overflow-y-auto` list, whose overflow-x computes to auto → stray horizontal scrollbar). Verified geometry: row inner ≈238px; checkbox 16 + thumb 36 + buttons 68 + gaps ≈ 80px.
- Evidence:
  ```tsx
  <div className="flex items-center gap-2">                                    // line 335
    <p className="truncate text-sm font-medium text-foreground">{doc.originalName}</p>
    <span className="inline-flex shrink-0 items-center rounded-none bg-secondary px-2 py-0.5 text-[10px] ...">
  ```
- Fix: row → `"flex flex-wrap items-center gap-2"` — when tight, the chip wraps under the name; desktop rows (plenty of width) render unchanged.

### [MED] src/components/views/profile/documents-section.tsx:318 — 16px checkbox + 32px icon buttons: touch targets far below 44px on the primary document list
- Issue: Row checkbox is the default `size-4` (16px) — the only way to multi-select documents; extract (line 374) and delete (line 385) ghost buttons are `size-8` (32px). All < 44px mobile minimum; delete is a destructive action.
- Evidence:
  ```tsx
  <Checkbox ... className="shrink-0 data-[state=checked]:border-primary ..." />        // line 315–320, 16px
  <Button size="icon" ... className="size-8 rounded-none ... hover:text-danger-ink" /> // line 380–393, 32px
  ```
- Fix: checkbox — add invisible hit-area `"relative before:absolute before:-inset-2.5 before:content-['']"` (40px+ target, zero visual change); buttons — `"size-11 sm:size-8 rounded-none ..."` (44px on mobile, unchanged ≥sm).

### [MED] src/components/views/profile/form-fields.tsx:159 — EntityCard edit/delete icon buttons are 32px (used by 5 sections)
- Issue: `size-8` (32px) ghost icon buttons on every Education / Work / Training / Eligibility / Awards entry card — below the 44px touch minimum; delete is destructive.
- Evidence:
  ```tsx
  <Button ... className="size-8 rounded-none text-muted-foreground hover:bg-primary/10 hover:text-primary" />            // line 155–163 (Edit)
  <Button ... className="size-8 rounded-none text-muted-foreground hover:bg-destructive/10 hover:text-danger-ink" />     // line 164–177 (Delete)
  ```
- Fix: both → `"size-11 sm:size-8 rounded-none ..."` (mobile 44px, desktop pixel-identical).

### [MED] src/components/views/profile/personal-info-section.tsx:373 — Remove-reference button is 32px inside the 480px scroll list
- Issue: Character-reference remove button `size-8` (32px) — destructive, sits at the top-right of each reference card, adjacent to nothing else (mis-taps likely at 320px).
- Evidence: lines 369–377 `variant="ghost" size="icon" className="size-8 rounded-none text-muted-foreground hover:bg-destructive/10 hover:text-danger-ink"`.
- Fix: → `"size-11 sm:size-8 rounded-none ..."`.

### [MED] src/components/views/my-applications.tsx:310 — DetailField tiles: `truncate` values can force grid-track overflow at 320px (tile pokes past card edge)
- Issue: `<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">` (line 228) + `DetailField` whose value is `truncate` — but the tile root (grid item) has `min-width:auto`, so a no-wrap value wider than its track ("Monthly Salary" ₱1,234,567.00 ≈ 100px vs ~85px available; long deadline strings) expands the track; the card is `overflow-hidden` (line 201) so the tile is clipped mid-value instead of ellipsizing.
- Evidence:
  ```tsx
  function DetailField(...) {
    return (
      <div className="rounded-none bg-secondary/60 p-3.5">          // line 312 — no min-w-0
        ...
        <div className="mt-1.5 truncate text-sm font-bold ...">{value}</div>  // line 317
  ```
- Fix: line 312 → `"min-w-0 rounded-none bg-secondary/60 p-3.5"` (grid track stays 1fr; truncate then engages). Additive, no visual change for fitting values.

### [MED] src/components/workspaces/applicant/applicant-home.tsx:452 — 4-step journey row is at its limit at 320px; "Face-to-Face" wraps unevenly
- Issue: `ApplicationJourneyCard` (p-6) leaves ~238px for the `<ol>`; labels are capped `max-w-[60px] text-[10px]` → 4×60=240px nominal. "Face-to-Face" (12 chars ≈ 62px) wraps to 2 lines at **every** width while the other three stay 1-line — at 320px the row is fully saturated (labels nearly touch), and the mixed 1-line/2-line labels sit unevenly around the connector. This stepper encodes the new Submitted → Review → Shortlisted → Face-to-Face workflow.
- Evidence: lines 452–491 (`justify-between` ol, connector at `top-1/2`), label span line 478: `"max-w-[60px] text-center text-[10px] font-semibold leading-tight"`.
- Fix (mobile-only visual): card padding `"p-6"` → `"p-4 sm:p-6"` (frees 32px at 320px) and label span → `"max-w-[60px] text-center text-[9px] sm:text-[10px] font-semibold leading-tight"` ("Face-to-Face" ≈ 57px → one line on phones). Desktop unchanged.

### [MED] src/components/views/upload-pds-card.tsx:296 — Unbroken file names clip at card edge in "done" and "error" states
- Issue: `fileName` is echoed in the success summary (line 296) and error "File:" line (line 353) with no `break-words`. Uploads commonly have space-free names (e.g. `e7d4e775-5fe8-4eb6-841a-a2d738d406ba.xlsx`, `PDS_2025_final(1).pdf`); an unbreakable token overflows the `min-w-0` column and is clipped by the card's `overflow-hidden` (line 193) — the applicant can't confirm which file was processed. (Contrast: the error message itself at line 352 already has `break-words`.)
- Evidence:
  ```tsx
  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
    {totalFilled} field{...} updated from{" "}
    <span className="font-semibold text-foreground">{fileName}</span>.      // line 294–296
  ...
  {fileName && <p className="mt-1 text-[11px] text-muted-foreground/80">File: {fileName}</p>}   // line 353
  ```
- Fix: outer `<p>` line 294 → add `break-words`; line 353 → `"mt-1 break-words text-[11px] text-muted-foreground/80"`. (The uploading row's `truncate` at line 256 is correct as-is.)

### [LOW] src/components/views/profile-view.tsx:325 — Mark-Complete AlertDialog has the same latent grid root cause
- Issue: Today its content (~316px) fits any viewport, but its `shrink-0` header/footer classes are inert (grid) — any copy growth or 568px-device locale wrapping would clip the footer with no scroll. Same one-class hardening as the dialogs.
- Evidence: line 324–354 `<AlertDialogContent>` (ui/alert-dialog.tsx:57–60 has the identical `grid … flex flex-col max-h overflow-hidden` recipe) with `AlertDialogHeader className="shrink-0"` / `AlertDialogFooter className="shrink-0"`.
- Fix: `<AlertDialogContent className="flex! flex-col!">` — zero rendering change today, restores the intended flex semantics.

### [LOW] src/components/views/profile/extraction-review-dialog.tsx:85 — Absolute close ✕ overlaps the wrapped title at 320px
- Issue: DialogContent's close button is `absolute top-4 right-4 size-8`; the header has no right padding. At 320px the chip+title ("Review Extracted Information", text-lg) wraps and its first line runs beneath the ✕; the description line can also pass under it.
- Evidence: `<DialogHeader className="shrink-0">` (line 85) vs ui/dialog.tsx:77 close button.
- Fix: `className="shrink-0 pr-10"` — harmless at all widths (sm+ title is single-line).

### [LOW] src/components/views/profile/documents-section.tsx:360 — `line-clamp-1` hides extraction-error detail
- Issue: `doc.extractionError` (why AI extraction failed) is clamped to a single line (~40 chars at 320px) — the actionable part of the message is unreachable (no title/tooltip either). Info loss, not overflow.
- Evidence: `<p className="mt-0.5 line-clamp-1 text-[11px] text-danger-ink">⚠ {doc.extractionError}</p>`.
- Fix: → `line-clamp-2` (still bounded; or drop the clamp + add `break-words`). Slight visual change (one extra line) on all breakpoints.

### [LOW] src/components/views/profile/personal-info-section.tsx:334 — "Character References" header row hairline-tight at 320px
- Issue: `flex items-center justify-between` with title block (min-content "REFERENCES" ≈ 90px) + `shrink-0` "Add Reference" button (≈134px incl. icon) vs 246px available → 2–3px slack; any font/letter-spacing drift wraps the title awkwardly against the button.
- Evidence: lines 334–350 header row; Button size="sm" (h-10).
- Fix: → `"flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5"` (wraps only when needed; identical desktop rendering).

### [LOW] cross-cutting — `max-h-[480px] overflow-y-auto` entry lists create nested scroll traps on touch (7 locations)
- Issue: On mobile these 480px inner scrollers sit inside the page scroll — double scrollbars, wheel/touch capture, and list content hidden below the fold (an applicant with many entries may not realize the list scrolls).
- Evidence (same recipe in all): personal-info-section.tsx:357 (`max-h-[480px] overflow-y-auto pr-2`), education-section.tsx:138, work-experience-section.tsx:147, training-section.tsx:129, eligibility-section.tsx:166, awards-section.tsx:144 (`max-h-[480px] overflow-y-auto pr-1`), documents-section.tsx:260 (`max-h-[480px] overflow-y-auto p-3 pr-2`).
- Fix (mobile-only): change each to `sm:max-h-[480px] sm:overflow-y-auto` (+ keep `sm:pr-1`/`sm:pr-2`) so phones render the full natural-height list in page flow; desktop unchanged. If applied, apply to all 7 for consistency.

### [LOW] src/components/workspaces/applicant/applicant-home.tsx:563 — OpenPositionCard salary cell lacks `min-w-0` (marginal 320px overflow)
- Issue: Same min-width:auto mechanism as my-applications DetailField: col-2 track ≈113px; salary "₱1,234,567.00" (13 chars) + icon ≈ 115px → track expands past the card and clips. Rare (high-band positions), marginal.
- Evidence: lines 563–575 — grid item `<div className="flex items-center gap-1.5">` containing `<span className="truncate font-semibold text-foreground">{formatCurrency(salary)}</span>`.
- Fix: grid item → `"flex min-w-0 items-center gap-1.5"`. Additive.

### Checked and clean
- **use-profile-data.ts** — no UI-overflow risk in scope: all derived labels are counts/toast strings (sonner wraps); nothing fixed-width. No findings.
- Compliant patterns confirmed: every two/three-column field grid collapses to 1-col at <sm/md (personal-info, all 5 entity dialogs, EntityCard dl); date inputs are single fields per cell (no city/zip-style squeeze pairs anywhere); my-applications status stepper already has `overflow-x-auto` (line 267); dropzones are content-sized (no fixed heights that clip error text); status pill rows wrap (`flex-wrap` my-applications:211); badges/chips shrink-0 handled; inputs are `h-12 text-base` on mobile (48px targets, no iOS focus-zoom); no `whitespace-nowrap` on dynamic text; no hard-coded colors (Task 5-b token sweep holds in both modes); `truncate` on dynamic strings (school/employer/award/file names) is present in EntityCard (`break-words`), DocumentRow, extraction item titles.

---

## Severity summary

| Severity | Count | Findings |
|---|---|---|
| CRIT | 2 | extraction-review-dialog grid-clip (footer unreachable); work-experience dialog grid-clip (footer unreachable even at 390×844) |
| HIGH | 4 | education / eligibility / awards dialog grid-clip (≤667px devices); extraction dialog `w-40` label column (values 32–126px on phones) |
| MED | 8 | training dialog marginal clip; documents chip collision; documents touch targets (16px checkbox, 32px buttons); EntityCard 32px buttons; remove-ref 32px button; DetailField min-w-0 overflow; applicant-home journey row at 320px; upload-pds unbroken fileName clip |
| LOW | 6 | profile-view latent AlertDialog grid; extraction header ✕ overlap; line-clamp-1 error hiding; character-refs header wrap; 7× nested 480px scroll lists; OpenPositionCard salary min-w-0 |
| **Total** | **20** | |

## Safe fixes (additive className-only, zero desktop visual change)
1. All 6 dialog root-cause fixes: `flex! flex-col!` on DialogContent (+ `min-h-0 flex-1 overflow-y-auto` on the 5 form-dialog bodies; extraction dialog body already has them) — CRIT×2, HIGH×3, MED(training), LOW(profile-view latent).
2. `ExtractedFieldRow` mobile stacking (`sm:w-40 sm:shrink-0` + `flex-col sm:flex-row`) — HIGH.
3. `min-w-0` on DetailField (my-applications:312) and OpenPositionCard salary cell (applicant-home:563) — MED, LOW.
4. `break-words` on upload-pds-card lines 294/353 — MED.
5. `flex-wrap` on DocumentRow name/chip row (documents:335) — MED.
6. Checkbox invisible hit-area `before:-inset-2.5` (documents:318) — MED, invisible at every width.
7. `pr-10` on extraction DialogHeader — LOW.

## Visual changes (mobile-only unless noted)
1. Icon buttons `size-8` → `size-11 sm:size-8` (form-fields:159/169, personal-info:373, documents:374/385) — bigger touch targets on phones only.
2. Journey card `p-4 sm:p-6` + journey labels `text-[9px] sm:text-[10px]` (applicant-home:428/478) — 320px legibility.
3. Nested 480px lists → `sm:max-h-[480px] sm:overflow-y-auto` (7 locations) — mobile lists become natural page flow.
4. `line-clamp-1` → `line-clamp-2` on extraction error (documents:360) — one extra line on **all** breakpoints (only finding with a desktop delta).

## Next actions (for the fixing agent)
1. Apply the safe-fix block 1–2 first (unblocks Save/Apply buttons on phones — highest applicant impact, zero desktop risk).
2. Then touch-target + min-w-0/brake fixes; re-verify at 320×568, 375×812, 390×844, and a 768px-short-laptop window for the Work dialog.
3. Recommended (outside R2-c scope, one line for the foundation owner): in ui/dialog.tsx + ui/alert-dialog.tsx drop the dead `grid`/`flex` conflict (keep only `flex flex-col`) so every future dialog gets the intended scroll semantics; until then the per-file `flex! flex-col!` pattern above is mandatory for any new tall dialog.
4. No design-system violations introduced by any proposed fix: 0px radius, no shadows, token colors only.
