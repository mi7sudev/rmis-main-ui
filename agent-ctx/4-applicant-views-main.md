# Task 4 — Applicant Views → Civic Enterprise Design System Refactor

**Agent**: main (Z.ai Code)
**Task**: Refactor the 14 Applicant-view files to the new "Civic Enterprise" design system — purely visual (style, layout, class names, JSX structure). No backend/API/business-logic changes.

## Files Edited (in place)
1. `src/components/views/applicant-home.tsx`
2. `src/components/views/jobs-view.tsx`
3. `src/components/views/my-applications.tsx`
4. `src/components/views/profile-view.tsx`
5. `src/components/views/upload-pds-card.tsx`
6. `src/components/views/profile/personal-info-section.tsx`
7. `src/components/views/profile/education-section.tsx`
8. `src/components/views/profile/work-experience-section.tsx`
9. `src/components/views/profile/training-section.tsx`
10. `src/components/views/profile/eligibility-section.tsx`
11. `src/components/views/profile/awards-section.tsx`
12. `src/components/views/profile/documents-section.tsx`
13. `src/components/views/profile/extraction-review-dialog.tsx`
14. `src/components/views/profile/form-fields.tsx`

## Key transformations applied (across all 14 files)
- Removed **every** `rounded-none` (verified with `rg "rounded-none"` → 0 matches).
- Removed every forbidden raw hex (`#003876`, `#002a5c`, `#262652`, `#3a3a6e`, `#FCD116`, `#e6eeF6`, `#fef9e7`, `#8B6914`, `#D1FAE5`, `#065F46`, `#0B6E4F`, `#ecfdf5`, `#FEE2E2`, `#CE1126`, `#1a1a1a`, `#7f1d1d`) and replaced with semantic tokens.
- Removed every `border-slate-200`/`border-slate-300`, `bg-slate-50/100/200`, `text-slate-*`, raw `bg-white`/`text-white` navy-banner pattern, `text-blue-200`, `bg-white/10`/`/15`/`/20`, and `text-red-500` (replaced with `text-destructive`).
- Replaced with semantic tokens: `bg-card`, `bg-secondary`, `bg-secondary/60`, `border-border`, `text-foreground`, `text-muted-foreground`, `bg-accent`, `text-primary`, `bg-primary`, `text-primary-foreground`, `text-destructive`, `bg-destructive`, `text-destructive-foreground`, the design-system emerald/amber/red soft-pill tones (`bg-emerald-50 text-emerald-700 border-emerald-200`, `bg-amber-50 text-amber-700 border-amber-200`, `bg-red-50 text-red-700 border-red-200`), and `var(--gold)` (only for extraction-accent rings/highlights — never a dominant fill).
- All Inputs/Selects/Textareas/Buttons/Dialogs now use modern default radii (`rounded-md`/`rounded-lg`/`rounded-xl`); only `rounded-full` retained for avatars, timeline dots, confidence-dots.

## Per-file summary
- **profile/form-fields.tsx** — refactored first since every section uses these. `SectionHeader` icon chip is now `rounded-md bg-accent text-primary border-border`; title uses `ce-section-title`. `EntityCard` uses `Card border-border shadow-xs` + `ring-2 ring-[var(--gold)]/40 border-[var(--gold)]/40` when fromExtraction. "From document — verify" badge uses the amber tone. Edit/Delete ghost-icon buttons use `size-7 text-muted-foreground hover:text-primary` / `hover:text-destructive`. `FieldWithExtraction`/`SelectField` extraction rings use `ring-[var(--gold)]/40`. Required markers use `text-destructive`. `StatTile` uses `rounded-lg` shell + `rounded-md` icon chip.
- **upload-pds-card.tsx** — header strip is now `bg-secondary/60 border-b border-border` with `bg-accent text-primary border-border` icon chip (was navy `bg-[#003876]` banner). Idle drag zone uses `rounded-lg border-2 border-dashed border-border hover:border-[var(--gold)]/60 hover:bg-secondary/40`; dragging state uses `border-[var(--gold)] bg-accent`. Uploading/extracting/applying phases: Loader2 + `bg-secondary [&>div]:bg-primary` Progress + 3-step indicator with `bg-emerald-500`/`bg-primary`/`bg-muted-foreground/30` dots. Done phase: emerald success chip + section-summary chips with emerald/secondary tones. Error phase: red chip + plain Try-Again button.
- **applicant-home.tsx** — PageHeader title is now `Welcome back, {firstName}`. Profile summary card uses `ce-surface border-l-4 border-l-primary` with circular `rounded-full bg-accent text-primary` avatar; profile-status chip uses emerald/amber tones; "Complete Profile" CTA is a plain `<Button>`. Stats are 4 calm tiles with `bg-accent text-primary` icon chips + `text-foreground tabular-nums` numbers. My Applications & Available Positions sections use `ce-eyebrow` headers + clean cards. Privacy notice uses `bg-secondary/50 border-l-4 border-l-primary`.
- **jobs-view.tsx** — master/detail list cards: selected=`border-primary bg-accent/40 shadow-xs`, default=`border-border bg-card hover:border-primary/40`. JobDetail panel is now a clean `ce-surface` (NOT navy header); header strip uses `bg-secondary/60 border-b border-border`. SummaryCard uses `bg-secondary/60 border-border rounded-md`. Apply area uses emerald success strip + `text-destructive` Cancel button. All 3 AlertDialogs (Apply / Cancel / MQR failure) use `rounded-xl` content + `text-foreground` titles + `bg-destructive` destructive action button. MQR per-row result cards use `border-emerald-200 bg-emerald-50` (met) / `border-red-200 bg-red-50` (not met).
- **my-applications.tsx** — ApplicationDetailCard is now `ce-surface` with `bg-secondary/60` header strip (NOT navy). DetailField uses `bg-secondary/60 border-border rounded-md`. MQR status block uses emerald/amber tones. Timeline nodes are `rounded-full` dots: navy (`bg-primary text-primary-foreground border-primary`) when done, destructive when rejected, muted (`bg-card border-border`) when pending. Connectors use `bg-primary` (done) / `bg-border` (pending).
- **profile-view.tsx** — Progress + summary card is now `ce-surface`. Profile status chips use emerald/amber tones. "Mark Profile Complete" button is plain `<Button>`. Progress bar uses `bg-secondary [&>div]:bg-primary`. 7-tile section grid uses emerald (filled) / muted (empty). Left nav active state uses `bg-accent text-accent-foreground border-l-2 border-l-primary`. Mark-Complete AlertDialog uses `text-foreground` title + plain `<Button>` action. Removed unused `Badge` + `Card` imports.
- **profile/personal-info-section.tsx** — Extraction banner uses `bg-amber-50 text-amber-700 border-amber-200` + `text-[var(--gold)]` icon. 4 Cards use `<Card border-border shadow-xs>` with `border-b border-border` headers. "Save Changes" + "Add Reference" + remove buttons use plain `<Button>` / `<Button variant="outline">` / ghost-icon patterns. Reference card background uses `bg-secondary/40`.
- **profile/education-section.tsx, work-experience-section.tsx, training-section.tsx, eligibility-section.tsx, awards-section.tsx** — all 5 list+dialog sections: list container is now `<div className="ce-surface">`; DialogContent uses defaults (no `rounded-none`); DialogTitle uses `text-foreground`; Cancel button uses `<Button variant="outline">`; Save button is a plain `<Button>`. Required markers use `text-destructive`.
- **profile/documents-section.tsx** — Upload-area Card uses `border-border shadow-xs`; drag zone uses `rounded-lg border-2 border-dashed border-border hover:border-[var(--gold)]/60 hover:bg-secondary/40`; dragging state uses `border-[var(--gold)] bg-accent`. DocumentRow uses `rounded-md` shell + `border-[var(--gold)] bg-accent` (selected) / `border-border hover:bg-accent/50` (default). Checkbox checked-state uses `bg-[var(--gold)] border-[var(--gold)] text-primary-foreground`. Extract + Delete action buttons are `variant="ghost" size="icon" size-7 text-muted-foreground hover:text-primary` / `hover:text-destructive`. Image previews still load via `/api/files/${doc.filePath}`.
- **profile/extraction-review-dialog.tsx** — DialogContent uses defaults (no `rounded-none`); DialogTitle uses `text-foreground` + `text-[var(--gold)]` FileSearch icon. Confidence legend uses `ce-eyebrow`. ExtractionGroup header icon uses `text-primary`. ExtractedFieldRow uses `rounded-md hover:bg-secondary/60`. ExtractedItemCard uses `border border-border rounded-md p-3 bg-card`. Apply-to-Profile button uses `bg-[var(--gold)] hover:bg-[var(--gold)]/90 text-primary`.

## Verified
- `bun run lint` — clean (0 errors, 0 warnings) after the refactor.
- `bunx tsc --noEmit` — no new TypeScript errors introduced in any of the 14 refactored files. Every error reported by tsc is in pre-existing files outside the edit scope (prisma/seed.ts, examples/, skills/, src/app/api/*, src/components/app-shell/*, and 3 admin files noted as pre-existing by the Task 2 prior agent).
- `rg "rounded-none"` across the 14 refactored files → 0 matches.
- `rg` for forbidden raw hex codes (`#003876`, `#002a5c`, `#262652`, `#3a3a6e`, `#FCD116`, `#e6eeF6`, `#fef9e7`, `#8B6914`, `#D1FAE5`, `#065F46`, `#0B6E4F`, `#ecfdf5`, `#FEE2E2`, `#CE1126`, `#1a1a1a`, `#7f1d1d`) across the 14 refactored files → 0 matches.
- `rg` for `text-slate-*`/`bg-slate-*`/`border-slate-*`/`text-red-500`/raw `bg-white`/`text-white`/`text-blue-200`/`bg-white/10/15/20` across the 14 refactored files → 0 matches. The only `text-slate-*`/`bg-slate-*`/`bg-orange-*` references remaining are inside `src/components/views/profile/types.ts` (NOT in my refactor scope), consumed as `${meta.color} ${meta.bg}` strings.
- Emerald/amber/red soft-pill tones (`bg-emerald-50 text-emerald-700 border-emerald-200`, `bg-amber-50 text-amber-700 border-amber-200`, `bg-red-50 text-red-700 border-red-200`) and the icon-tone variants (`text-emerald-600/800`, `text-amber-700`, `text-red-600/800`) match the design spec exactly. `text-emerald-600`/`text-red-600`/`text-red-800`/`text-emerald-800` for MQR-results icon/label colorations match the pattern the admin jobs-tab uses (preserved from the original code's MQR rendering).
- Gold accent (`var(--gold)`) is used ONLY for extraction-highlight rings/borders (`ring-[var(--gold)]/40`, `border-[var(--gold)]/40`, `border-[var(--gold)]`, `bg-[var(--gold)]`) — never as a dominant fill.
- Dev server (`/home/z/my-project/dev.log`) — every applicant/profile route compiles successfully on hot-reload. `GET /` returns HTTP 200. No runtime errors observed.

## Business Logic Preserved (confirmed)
- All `apiFetch(...)` URLs, methods, and bodies — unchanged.
- All `navigate(view, params)` calls — unchanged.
- All View strings — unchanged (`"applications"`, `"jobs"`, `"profile"`, `"signin"`).
- 3-phase PDS pipeline (upload → extract → auto-apply) + `onApplied` silent refresh + `onReview` switch-to-personal + scroll-into-view via `requestAnimationFrame(sectionsRef.current?.scrollIntoView(...))`.
- `applyExtractionToProfile` (local-state only) + ExtractionReviewDialog onApply fallback.
- `isPendingId` coercion (`String(id).startsWith("pending-")`).
- Char-ref save-time filtering (`serializeCharRefs` doesn't filter; `cleanCharRefs` filters at save time).
- MQR verify-before-apply (`POST /api/jobs/verify-mqr` first, then `POST /api/jobs/apply` if `allMet`).
- Cancel-application DELETE call (`DELETE /api/applications/${appId}` with `Number(appEntry.id)` coercion).
- `canMarkComplete` disabled guard + `completion.percent`/`filled`/`total`/`checks` derivations.
- Eligibility `__OTHERS__` sentinel + `knownNames.includes(item.eligibilityTitle)` isKnown check.
- Awards dynamic scope options + scope-clear-on-type-change.
- Work-experience `isPresentWork ? null : inclusiveDateTo` (Present nulls).
- Title-Case status-string arrays in my-applications timeline + `isRejected` derivation.
- `EXTRACTABLE_CATEGORIES` Set + per-row extract visibility + image previews via `/api/files/${doc.filePath}`.
- Deadline-urgency check (`new Date(job.deadlineDate).getTime() < Date.now() + 7 * 86400000`).
- `useProfileData()` hook usage + all section component prop signatures.
- Exported component signatures: `JobDetail` (`job, onApply, applying, applied, onCancel?, cancelling?, preview?`) — unchanged; `JobDetailData` type — unchanged; `Job` type — unchanged.
- `textToHtml`-rendered SafeHtml sections in JobDetail — preserved.
- All 4 AlertDialog flows (Apply confirmation, Cancel confirmation, MQR failure, Mark-Complete confirmation) — preserved.

## Stage Summary
All fourteen Applicant-view files now render in the new Civic Enterprise design language — calm light PageHeader (no navy banner), clean `ce-surface` cards with subtle borders, modern shadcn inputs/buttons/dialogs (defaults to `rounded-md` / `rounded-lg` / `rounded-xl`), `bg-secondary/60` header strips replacing the old navy `bg-[#003876]` banners, soft-pill status badges via the shared `StatusBadge`, `bg-destructive hover:bg-destructive/90` destructive AlertDialog actions, `text-foreground` DialogTitles, `text-destructive` required markers, and `var(--gold)`-accented extraction-highlight rings on EntityCards / FieldWithExtraction / drag zones / Apply-to-Profile button. Every raw hex color and every `rounded-none` instance has been purged. All APIs, navigation calls, view names, validation, payloads, deep-link initialization, and business-logic guards are byte-for-byte preserved. `bun run lint` is clean.
