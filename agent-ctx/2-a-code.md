# Task 2-a — Jobs View Motion Upgrade (agent: code)

Task ID: 2-a
Agent: code (Z.ai Code motion-upgrade agent)
File touched: `src/components/views/jobs-view.tsx` ONLY (presentation layer; no logic/state/data-fetching/API changes)

## What was done
Upgraded the public job board (`JobsView`) to the shared motion spec so it matches the frontpage tier, using the house primitives under `src/components/ui/motion/`.

### Edits (by area, pre-edit line refs)
1. **Imports** (after `toast` import, ~L31): added `motion` from `motion/react`, `PageIntro`, `Reveal`, `MagneticButton`.
2. **Loading branch** (~L195–209): skeleton kept; container wrapped in `motion.div` opacity 0→1 fade (0.4s, house ease `[0.22,1,0.36,1]`); skeleton eyebrow synced to `02. Open Positions`.
3. **Error branch** (~L212–229): static eyebrow + `h1` replaced with `<PageIntro eyebrow="02. Open Positions" title="Job Opportunities" />`; `Try Again` wrapped in `<MagneticButton strength={0.25} className="mt-6">`; got `transition-colors duration-200`.
4. **Main header** (~L236–257): replaced with `<PageIntro eyebrow="02. Open Positions" title="Job Opportunities" description="{n} open position(s) at DOST-MIRDC" />`; applicant-only `My Applications` button kept in its original top-right spot, wrapped in `<MagneticButton strength={0.25} className="shrink-0">` (button keeps its own `hidden sm:flex`, so mobile layout is unchanged — no empty actions-slot gap).
5. **Job cards** (~L277–320): each card wrapped in `<Reveal key={job.id} delay={i * 0.05} y={20}>`; hover upgraded to `transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_40px_-16px_rgba(28,7,112,0.35)]` (navy #1C0770 shadow per palette); row divider switched from `last:border-b-0` to index-conditional `${i < jobs.length - 1 ? "border-b-2 border-[#1C0770]/20" : ""}`.
6. **Detail overlay top bar** (~L480, L484): `Back to Positions` and `X` close buttons got `transition-colors duration-200` (transition-gap fills).

## Deliberate deviations (spec conflicts, reasoned)
- **Reveal stagger mode rejected for the card container** → used the spec-sanctioned per-card `delay={i * 0.05}` fallback. Reason: stagger mode wraps children in `display:contents` divs; then every button becomes the sole/last child of its own wrapper, so the card list's `last:border-b-0` matches on ALL rows and every divider disappears. Index-conditional divider renders identically in both normal and reduced-motion Reveal paths.
- **SpotlightCard not applied to cards.** Cards are full-row `<button>`s with a full navy-invert hover; a clean SpotlightCard wrap would require restructuring the button's flex internals on the most important applicant page. CSS lift + navy shadow delivers the spec'd hover tier with zero layout risk.
- **`Submit Application` (full-width detail-overlay CTA) not magnetized.** At strength 0.25 a ~1200px-wide bar pulls up to ~150px toward the cursor (frontpage applies 0.25 only to compact CTAs, max pull ≈30px) — would read as broken. The page's compact CTAs (`My Applications`, `Try Again`) received the magnetic treatment instead.
- **Point 4 (filter chips / search input) N/A** — this file has no chips or search input (they live in `jobs-carousel` on the landing page); applied the `transition-colors duration-200` gap-fills where hover transitions were missing.
- **Eyebrow numbering** follows the spec example (`02. Open Positions`) rather than the file's legacy `01. Positions`, per instruction to use the spec's eyebrow.

## Verification
- `bun run lint` → **clean (0 errors, 0 warnings)**.
- `bunx tsc --noEmit` → no NEW errors from this task; the 2 nearby errors (`jobs-view.tsx:453` FastTrackApplyDialog `Job | null` vs `FastTrackJob | null`; `magnetic-button.tsx:61` rest-passthrough) are **pre-existing** — confirmed identical with the changes git-stashed.
- All animations are transform/opacity only; house ease `[0.22, 1, 0.36, 1]`; durations 0.4s (entrances) / 200–300ms (hover micro); primitives handle reduced-motion automatically.
- No browser/dev-server sessions started, per task instructions.
