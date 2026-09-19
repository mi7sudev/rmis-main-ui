# Accenture Design Strategy — Unified Extraction (11 pages audited)

Sources (all audited live via agent-browser, computed-token extraction):
`/en` (home) · `/services/ai-data` · `/services/cloud` · `/services/customer-service` ·
`/services/cybersecurity` · `/services/digital-engineering-manufacturing` ·
`/services/ecosystem-partners` · `/services/emerging-technology` · `/services/finance-risk` ·
`/services/infrastructure-capital-projects` · `/services/learning`
Plus the two Task-14 audits: `/ph-en/careers/jobsearch`, `/en/insights`.
Per-page detail: `audit-accenture-home.md`, `audit-accenture-services-1.md`,
`audit-accenture-services-2.md`, `audit-accenture-services-3.md`.

---

## 1. The invariant token system (identical on every page — it is a system, not page styling)

### Typography
| Tier | Spec (computed) | Usage |
|---|---|---|
| Display XXL | **100px / 500 / 1.1 / −0.03em** | Home awards stage ("Global recognition and awards") — the ceiling |
| H1 hero | **60px / 500 / 1.15 / −1.8px (−0.03em)** | Every page hero — noun-pair OR outcome-sentence |
| H2 section | **48px / 500 / 1.2 / −1.44px (−0.03em)** | Every terminal section heading, app-wide identical |
| Mid display | **40px / 500 / −1.2px** | Occasional sub-feature tier |
| H3 card | **32px / 500 / 1.2 / −0.64px (−0.02em)** | Mosaic/tile titles (24px variant on shorter pages) |
| Serif standfirst | **GT Sectra Fine 24px / 300 / 1.25 / normal** | Exactly ONE editorial serif moment per page, directly under H1 |
| Stat numeral | **48px / 500 / −1.44px** — same recipe as H2 | "…now" stat bands; numbers ARE display type |
| Card title | 20–24px / 500 | Content cards, news |
| Body / nav | **16px / 400** | All prose, links |
| Kicker / eyebrow | **14px / 500 / UPPERCASE / +0.28px (+0.02em) / lh 1.2** | The only uppercase voice; types sections and cards |
| Meta (dates) | 14px / 500 | News dates, captions |

**The law: weight 500 everywhere in display type — "huge-medium-tight", never bold.** Hierarchy comes from the 14↔100 scale jump (≈7:1), never from weight, boxes or borders. Serif (300) appears exactly once per page as counter-voice.

### Color & surface
| Role | Value |
|---|---|
| Page canvas | **#000 true black** (dark pages) / white canvas on light variants — never gray wash |
| Tile surface | **#202020** — the ONLY elevation step on dark |
| Ink | #FFFFFF on black; #000 on light |
| Muted | #616160 (inactive tabs) |
| Hairline | rgb(162,162,160) 1px (quietest affordance: FAQ expanders) |
| Chromatic accent | **#7500C0 active pills, #460073 sub-nav band, rgb(49,0,81) stat surface, rgb(161,0,255) icon** — used so sparingly there is ONE chromatic moment per viewport |
| Buttons | transparent fills — geometry carries the weight, not paint |

### Geometry
- **border-radius: 0 — absolute.** Cards, CTAs, chips, pills, tabs, panels. "Geometry itself is the logo."
- Carousel/pager chips: **48×48 square**, transparent, honest disabled states.
- Primary CTA: **min-height 52px, padding 0 24px, radius 0, transparent** (88×48 "Join us" on home).
- Anchor pill: pad 0 20px, 14px, 52px tall, square.
- Content grid: 1248px @1280 (16px side margins), 4 cols × 276px, **48px gap**.

### Spacing & motion
- Named rhythm: **40 / 60 / 80px** (`rad-component-spacing-*`); sections pad **60px 80px**; sub-nav pads 0 80px.
- Motion: **0.55s cubic-bezier(0.85, 0, 0, 1)** (slow decelerating) on surfaces/cards; **0.05s** on nav links (snappy chrome vs weighted surfaces).
- Header is **static** (scrolls away); the **sticky anchor sub-nav** (52px tinted band) is the persistent wayfinding surface.

## 2. The repeatable page grammar
`static header → kicker + anchor sub-nav → H1 hero + serif standfirst → "<Domain> now" stat band (4-up numeral + sentence, hairline-separated) → "Reinvent with X" expandable #202020 mosaic → genre-typed trending carousel (48×48 chips) → partners → awards → leaders → careers CTA band → black mega-footer`
- Shorter pages DROP tail tiers but never break the beat (compression without rhythm change).
- Expanders everywhere: whole-card-as-button `aria-expanded` disclosures with square × close chips — density without navigation.

## 3. Copy & content strategy
- Kickers NAME THE ASSET TYPE: "RESEARCH REPORT / PERSPECTIVE / CASE STUDY / BLOG / CAREERS" — taxonomy as copy; they tolerate 3–6 words.
- H1 flexes between noun-pair ("Cloud consulting services") and outcome-sentence ("Turn customer service… into a growth engine") — **tokens never flex**.
- Stats are **numeral + full sentence** ("97% of executives said…") or woven into prose; multipliers as credibility ("6x Gartner MQ"); macro-fractions as display objects ("9 of 10", "$10.3T").
- CTA verbs: quiet and repeated — "Learn more / Expand / Explore / View all work / Search open roles / Join us". No exclamation marks.
- Credibility ladder: evidence → human voice (one quote) → proof (clients) → credibility (awards) → invitation (careers).

## 4. The 12 premium moves (what makes it feel billion-dollar)
1. 100px at weight 500 with −0.03em — huge display that never screams.
2. Radius 0 on every surface — geometric discipline as brand.
3. Two-size type economy: 14px uppercase kickers vs 60–100px displays; nothing in between does the work.
4. One serif moment (GT Sectra 300) per page inside an all-sans system.
5. Numbers as display typography, evidence inside sentences.
6. #202020 tiles as the only elevation on the black canvas.
7. 48×48 square pager chips with honest disabled states; Play/Pause motion control = restraint as confidence.
8. Whole-card disclosures with in-place expansion — density without navigation.
9. Sticky tinted anchor sub-nav — wayfinding as a brand surface while the header scrolls away.
10. 0.55s cubic-bezier(0.85,0,0,1) motion — nothing snaps; slow-decelerating reads expensive.
11. Named 40/60/80 spacing rhythm — you feel it, never see it.
12. One chromatic moment per viewport; everything else monochrome.

## 5. RMIS application map (this repo)

Already in register (from Tasks 1–14): radius-0 token sheet, kicker-gold eyebrows, square chips/pagers, ghost numerals, fluid 1440→1920 type curve, hairlines, block-surface color-blocking, link-arrow ">", one serif moment on applicant-home/signup, review modal one-rail decision model.

**Divergences found by survey → the Task 15 retune (all applied in this task):**
| # | Divergence | Accenture law | Fix |
|---|---|---|---|
| 1 | `.display-hero/.display-xl/.display-lg` at weight 600 | 500, never bold | weights → 500 |
| 2 | `.kicker` 12px/600/+0.16em | 14px/500/+0.02em uppercase | retuned |
| 3 | Stat numerals `font-bold/extrabold` (Metric, tiles, ghost numerals) | numbers as 500/−0.03em display type | `.stat-numeral` utility + sweep |
| 4 | Two competing micro-label voices (10px bold vs 12px kicker) | one kicker voice | merged to `.kicker` |
| 5 | Bold sub-headings (review modal, applicant home, detail modal) | 500 + tight tracking | swept |
| 6 | Jobs board uses display-lg vs peers display-xl | H2 tier invariant | migrated |
| 7 | Chips at 44px (min-h-11 / size-11) | 48×48 square | size-12 |
| 8 | Serif idle after 2 uses | one standfirst per page hero | `.standfirst` + applied to workspace heroes |
| 9 | Default 150ms modal easing | 0.55s cubic-bezier(0.85,0,0,1) | `--ease-deliberate` on Dialog |
| 10 | Stale `rounded-2xl shadow-soft` classes | radius 0 honesty | cleaned |
