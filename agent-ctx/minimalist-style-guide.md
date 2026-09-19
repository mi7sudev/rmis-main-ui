# RMIS Staff-Surface Minimalist Style Guide

Reference implementation: `src/components/workspaces/evaluator/review-queue.tsx` (read it first).
Goal: admin + evaluator pages become quiet, tool-first, "modern minimalist" — easy applicant
review with zero decoration. APPLICANT-FACING PAGES MUST NOT CHANGE.

## Hard constraints

1. ONLY edit the files in your assignment. NEVER touch: `globals.css`, `src/components/primitives/*`,
   `src/components/ui/*`, `src/components/shell/*`, `src/components/workspaces/public/*`,
   `src/components/workspaces/applicant/*`, `src/components/views/*`, `src/components/site-header.tsx`,
   `src/components/footer.tsx`, `src/app/**`, tracking primitives.
   (`primitives/workspace.tsx` exports EmptyState/ErrorState/StatusIndicator — USE them, never edit.)
2. Styling-only change: keep ALL logic, state, API calls, forms, a11y (aria-labels/roles), keyboard
   behavior, responsive breakpoints, and fixed-height scroll frames (the `max-h-[60vh] lg:h-[65vh]
   lg:max-h-[65vh]` pattern) exactly as they are.
3. Dark mode must keep working — use semantic tokens only (bg-background, bg-card, bg-muted,
   bg-secondary, bg-accent, border-border, text-foreground, text-muted-foreground, bg-primary,
   text-primary, bg-destructive, status dots bg-info-ink/bg-success/bg-destructive).
4. Run `bunx eslint <your files>` until exit 0. Do not run the dev server; the orchestrator verifies.

## Remove everywhere (the "fancy" layer)

- `kicker kicker-gold` gold eyebrow + `display-xl/-lg/-hero` editorial headlines.
- Separate KPI/stat tile bands whose numbers duplicate kanban column counts or tab counts
  (the Review Queue removed its KPI band for this reason — counts live in column headers/tabs).
- `Reveal` (staggered entrance) wrappers and ALL per-card animation delays on staff pages.
- "Momentum rule" hover sweeps (`h-0.5 origin-left scale-x-0 ... group-hover:scale-x-100`
  accent bars) — replace with a plain `hover:` color change.
- Decorative ghost index numerals, ghost watermark numerals, uppercase wide-tracked column
  headers (`tracking-[0.18em]`-style), boxed count badges, gold/accent color blocks
  (`block-gold`, `block-accent`, `block-red`, `block-deep`, `text-gold`, `kicker-gold`).
- `group-hover:text-primary` name colorization, `transition-all`/long cubic-bezier eases.
  Only `transition-colors duration-150` (or default) hovers remain.

## Apply everywhere

### Page header (staff pages)
```tsx
<header className="mb-6 border-b border-border pb-4">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">NN · Page Name</p>
      <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">Page title</h1>
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-2">{/* controls */}</div>
  </div>
</header>
```
Keep the existing "NN ·" numbering if the page already has one (01 Command Center, 02 Review
Queue, …); otherwise just use the page name as the overline.

### KPI / stat tiles (only where the number is NOT already shown in a column/tab)
```tsx
<div className="border border-border bg-card p-4">
  <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Label</p>
  <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">12</p>
</div>
```
All numbers `text-foreground` — NO colored numerals. Clickable tiles add
`text-left transition-colors hover:border-foreground/25`.

### Kanban columns
Column panel `border border-border bg-secondary/40`; header `flex items-center gap-2 px-3 py-2.5`
with `size-1.5 rounded-full` stage dot + `text-[13px] font-medium text-foreground/80` label
(normal case) + `ml-auto text-xs tabular-nums text-muted-foreground` count.
Cards float in `flex flex-col gap-2 px-2 pb-2`, each `border border-border bg-card p-3
transition-colors duration-150 hover:border-foreground/25`. NO status pill inside a card when
the column already conveys the stage.

### Tables / ledger rows
One `bg-card` sheet with `divide-y divide-border`; rows `px-4 py-3.5 transition-colors
hover:bg-accent/40`; monogram `grid size-9 place-items-center bg-muted text-xs font-semibold
text-foreground/70` (no border, no primary text); names `text-sm font-medium text-foreground`
(no hover colorization); secondary lines `text-xs text-muted-foreground`.

### Status pills
Keep `StatusIndicator` where status is DATA (list columns, detail headers, modals). Keep stage
dots (size-1.5 rounded-full, bg-info-ink/bg-success/bg-destructive) as the only color cue.

### Typography
Page title `text-xl font-semibold tracking-tight`. Section headings inside pages: `text-base
font-semibold` or card titles `text-sm font-medium`. Micro labels `text-xs font-medium uppercase
tracking-[0.08em] text-muted-foreground`. Numbers keep `tabular-nums`. No serif/standfirst/display
classes on staff pages.

### Skeletons & empty states
Update skeletons to mirror the new quiet layout (raw `bg-muted` pulse divs are fine). Keep
EmptyState/ErrorState primitives as-is.
