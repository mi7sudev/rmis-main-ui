# Accenture Audit — Homepage (accenture.com/en)
- URL: https://www.accenture.com/en
- Audited at viewport: 1280 × 577 (browser default; measured via eval `innerWidth/innerHeight` — not our 1440 default, so fluid values noted at 1280)
- Page purpose: Accenture's global brand homepage — a black, monochrome, editorial marketing surface whose entire job is to sell "Reinvention" as an idea and route visitors into capabilities, research reports, client stories and careers.

> Access note: accenture.com is fronted by Akamai bot protection. First ~6 loads returned the "Page Cannot Process" interstitial (title literally "Page Cannot Process"); after a cooldown + clean relaunch the real page loaded (title "Reinvented with Accenture"). A cookie/consent dialog ("Privacy" dialog: Cookies Settings / Reject All / Accept All Cookies) appeared on load — **Accept All Cookies** was clicked (ref e30) before auditing.

## Section inventory (top→bottom)
Live offsets measured at 1280w; page body height ≈ 6,971px.

| # | Section | Layout pattern | Key components | Notes |
|---|---------|----------------|----------------|-------|
| 1 | Skip links | two quiet links before banner | "Skip to main content", "Skip to footer" | a11y-first affordance, visually quiet |
| 2 | Global nav (banner, h=72px, **static**) | single bar: logo left, menu center, utilities right | "What we do" (disclosure), "What we think" (link), "Who we are" (disclosure), "Careers" (disclosure), Search, locale selector "Hong Kong SAR China" | transparent over black hero; **not sticky** — at scrollY 3000 header rect.top = −3000 (scrolls away, no fixed clone) |
| 3 | Hero video (y72, h≈400) | full-bleed background video + floating text card | visually-hidden h1 "Together We Reinvented"; card: h2 "Shaping tomorrow, today" (18.31px/700 fluid), para (13.2px), CTA "See what we do"; "Pause background video" square button | the only place a video leads; text card floats over motion |
| 4 | Research Report content grid (y472, h≈1064) | `rad-card-grid`: 1248px content (16px side margins), 4 cols × 276px, **48px gap**, 2 rows | 8 cards, each a whole-card BUTTON (aria-expanded): kicker "RESEARCH REPORT" (14px/500/+0.28px/uppercase), title 20px/500/24px, body para, "Expand" link; dark card variant `--research-report-dark`, 276×424, **0px radius, no border**; has `__close-button` variant | this is the live equivalent of the "Reinvention topics / Perspective" carousel group in the older checklist text — Expand affordances confirmed |
| 5 | Executive quote (y1536, h≈389; pad 40px 0) | single centered editorial moment on black | Graphik 24px/500/31.2px/−0.48px quote ("…human in the lead, not human in the loop.") + name-only attribution "Julie Sweet" | quiet interstitial between heavy grids |
| 6 | Client spotlight (y1925, h≈906; pad 80px 0 0) | two-part: video feature + case-study ticker | h2 "Client spotlight", Vidyard player ("A Reinvention Conversation with McDonald's") with square Play button; h4 "Reinvented with Accenture" + para + "Learn more"; 4 ticker rows (McDonald's, Bristol Myers Squibb, Commonwealth Bank, UNICEF) each with "Explore" link | client logos replaced by named stories |
| 7 | Awards stage (y2831, h≈2343, `floatingcardblock`) | **sticky scrollytelling stage** (`rad-awards__stage`, position:sticky, top:0, h=100vh/577px) | display heading "Global recognition and awards" at **100px/500/110px/−3px**; 3 large disclosure panels (buttons, aria-expanded): "A Leader in Reinvention" (515×343 collapsed), "A Great Place To Work", "A Trusted Industry Leader" | the page's biggest type moment; panels pin while you scroll through them |
| 8 | Careers band (inside floating block) | full-width black band with kicker-led copy | kicker "CAREERS", h3 "Build a career that's as exciting as the world we're shaping", para, square CTA link "Join us" (88×48, radius 0) | recruitment routed as one quiet band — directly relevant to RMIS |
| 9 | Accenture news (y5992, h≈576; pad 60px 0, `rad-news`) | horizontal auto-advancing carousel | kicker "Accenture news"; track scrollWidth 1664 vs 1280 viewport; items = date (14px/500) + h3 headline links ("Accenture to Acquire McCoy" etc.); controls: Play/Pause + **Previous/Next 48×48 square chips (radius 0)**; advance = translateX −832px step (matrix transform, not scrollTop) | the live analog of the checklist's "Previous/Next square chips" |
| 10 | Footer (contentinfo) | single black footer, logo + flat link lists | "Preference Center / Careers / About Us / Contact Us / Locations / Sitemap", legal row "Privacy Statement / Terms & Conditions / Cookie Policy & Settings / Accessibility Statement", "© 2026 Accenture. All rights reserved." | transparent bg on black base (`rad-footer__links-container`), white 16px links, no border-top |
| 11 | Cookie banner (overlay) | fixed bottom "Privacy" dialog | Cookies Settings / Reject All / Accept All Cookies | dismissed via Accept All at audit start |

**Checklist deltas (important for consistency):** the current live /en homepage does NOT contain the older "Reinvention topics" topic chips (Enterprise / Digital Core / Talent / Supply Chain & Engineering / Customer / Cybersecurity / Finance), a "Perspective" label, or an "Industry" section as served to this locale/session. What persists brand-wide and is confirmed here: kicker-led uppercase labels (RESEARCH REPORT / CAREERS / Accenture news), square Previous/Next chips, Expand affordances, huge-medium-tight display type, square 0-radius cards, © 2026 mega-footer. Strategy extraction should treat the jobsearch/insights audits as the source for topic-chips/Industry; this page confirms the shared premium register.

## Typography tokens (computed)
All measured live at 1280w via `getComputedStyle`.

| Element | Family | Size (px) | Weight | Line-height | Tracking | Notes |
|---------|--------|-----------|--------|-------------|----------|-------|
| Display XL — "Global recognition and awards" | Graphik | **100** | **500** | 110px (1.1) | **−3px (−0.03em)** | the huge-medium-tight signature; never bold |
| h1 "Together We Reinvented" | Graphik | 60 | 500 | 69px (1.15) | −1.8px | white; visually hidden (w=0) — SEO/a11y title |
| Awards accordion titles (h3) | **"GT Sectra Fine", Palatino** (serif) | 28 | **300** | 35px | normal | serif counterpoint inside the sans system |
| Executive quote (h4) | Graphik | 24 | 500 | 31.2px (1.3) | −0.48px | name-only attribution below |
| Research card title | Graphik | 20 | 500 | 24px (1.2) | normal | medium weight everywhere — no 700 in displays |
| Hero card h2 "Shaping tomorrow, today" | Graphik | 18.31 (fluid vw-based) | 700 | 27.47px | normal | the one heavy weight, on the small hero card |
| Body / nav links | Graphik | 16 | 400 | 16px base | normal | white on black |
| CTA labels ("Join us", "Explore", "Expand", "Learn more") | Graphik | 16 | **500** | — | normal | text-CTAs, medium weight |
| Kickers ("RESEARCH REPORT", "CAREERS", "Accenture news") | Graphik | **14** | **500** | 16.8px (1.2) | **+0.28px (0.02em)** | **uppercase**, BEM `__label` |
| News dates | Graphik | 14 | 500 | — | — | plain inline date before headline |
| Hero card paragraph | Graphik | 13.21 (fluid) | 400 | — | — | smallest marketing text |

Pattern: a **two-size economy** — 14/16px quiet chrome vs 60–100px medium-tight display; serif (GT Sectra 300) reserved for a single editorial moment.

## Color & surface tokens
The page is deliberately near-monochrome (computationally sampled):

| Role | Value (hex/rgb) | Where used |
|------|-----------------|------------|
| Page base | `rgb(0,0,0)` (#000) | `cmp-container` wraps the whole main — the page IS black |
| Header surface | transparent over black | nav links `rgb(255,255,255)` |
| Hero | background video, white text overlay | "Pause background video" control |
| Research cards | `rgb(0,0,0)` faces (`--research-report-dark`), text white; light card variant exists (kicker `rgb(0,0,0)` on light face) | 8-card grid |
| Body text | `rgb(255,255,255)` on black; black on light faces | all sections |
| Kickers | white (dark cards) / black (light faces) | 14px uppercase labels |
| CTA/links | `rgb(255,255,255)`, no accent color on CTAs | "Join us", "Explore", "Expand", "Learn more" |
| Awards panels | transparent on black, 1px border declared but `rgba(0,0,0,0)` (hairline affordance, filled on state) | 3 disclosure panels |
| Footer | transparent (inherits black base), white 16px links, no border-top | `rad-footer__links-container` |
| Accent | none sampled — no gold/blue/green anywhere in chrome | imagery/video carries all color |

Takeaway for RMIS: Accenture's homepage accent is **contrast and scale, not hue** — our kicker-gold remains an RMIS-proprietary accent layered on the same monochrome discipline.

## Component patterns
- **Nav bar**: 72px tall, static, transparent; 4 top-level items (disclosures vs plain links), Search + locale selector as utilities; no CTA button in header.
- **Card grid** (`rad-card-grid__cards-container`): content width 1248px @1280 (16px side margins), 4 columns of 276px, **48px column gap**; cards 276×424, **border-radius 0**, no visible border; whole card is a `<button aria-expanded>`.
- **Square motif is absolute**: research cards r0; "Join us" CTA 88×48 r0; carousel chips **48×48 r0**; awards panels r0; close-button variant `rad-content-grid-card__close-button` — every interactive geometry is a square.
- **Whole-card-as-button disclosure**: click card → aria-expanded=true, in-place expansion with close chip (no route change); "Expand" text link mirrors the affordance.
- **Buttons/CTAs**: no filled buttons on the page — text CTAs 16px/500 white (or black on light), transparent background, square, ≥48px hit height; `transition: all`.
- **Accordion/awards**: three large disclosure panels (515×343 collapsed) toggling via aria-expanded; serif titles inside; container is a sticky 100vh "stage".
- **Carousel**: transform-driven track (translateX −832px per step = 784px item + 48px gap), overflow hidden, Play/Pause + Previous/Next square 48px chips.
- **Spacing scale** (from `rad-` classes): `component-spacing-top-medium` = 40px, `component-spacing-top-large` = 80px, `spacing-vertical-md` = 60px — a published, named rhythm.
- **Footer**: flat link lists (not multi-column mega-grid), 16px white links, legal row, © line; bottom padding 23px on links container.

## Interaction patterns
- **Cookie consent**: "Privacy" dialog on load; three actions (Cookies Settings / Reject All / Accept All Cookies); accepted at audit start.
- **Card expand**: trigger = click anywhere on the research card (button, aria-expanded); behavior = in-place expansion on the black grid, close via square close chip; secondary "Expand" text link.
- **Awards disclosure**: trigger = click panel title button; behavior = aria-expanded toggle on 515×343 panels; panels live inside `rad-awards__stage` (sticky, top:0, 100vh) so the section pins while panels cycle — scrollytelling.
- **News carousel**: trigger = Play/Pause (autoplay) and Previous/Next chips; behavior = inner list translates −832px per step (matrix(1,0,0,1,−832,0) observed), looping dated headlines.
- **Nav**: static — scrolls away with the page (header top = −3000 at scrollY 3000; no fixed header or scroll-up reveal on this page).
- **Hover/motion**: research card `transition: scale 0.55s cubic-bezier(0.85, 0, 0, 1)` — a slow, decelerating scale; CTAs `transition: all`; video hero exposes an explicit Pause control.

## Copy & content strategy
- **Kickers/eyebrows**: terse uppercase category labels — "RESEARCH REPORT" (on all 8 cards), "CAREERS", "Accenture news"; they name the asset type, not the topic.
- **Heading voice**: aphoristic, sentence-case, human-scale — "Shaping tomorrow, today", "Global recognition and awards", "Client spotlight", "Build a career that's as exciting as the world we're shaping". One CEO quote carries the manifesto ("It is human in the lead, not human in the loop.").
- **CTA labels**: verb-first and minimal — "See what we do", "Expand", "Learn more", "Explore", "Join us"; player verbs "Play/Pause/Previous/Next". No arrows in labels sampled; no exclamation marks.
- **Stat treatment**: numbers live **inside sentences**, never in stat tiles — "…consume as much electricity as Canada and more water than the UK… 3.4% of global emissions, an 11-fold increase in a decade", "By 2030…". Stats are evidence inside narrative copy.
- **Section rhythm**: evidence grid (8 reports) → human voice (quote) → proof (client stories) → credibility (awards) → invitation (careers) → freshness (news). Classic credibility ladder.
- **Named-client storytelling**: case studies are one-line + "Explore" (McDonald's, Bristol Myers Squibb, Commonwealth Bank, UNICEF) — outcomes, not features.

## Premium moves (what makes it feel billion-dollar)
- **100px Graphik at weight 500 with −0.03em tracking** — huge display that never screams; medium weight + tight tracking IS the brand.
- **Zero-radius everywhere** — cards, CTAs, chips, panels are all sharp squares; geometry itself is the logo.
- **A published spacing vocabulary** (`rad-component-spacing-*`: 40/60/80px) — rhythm you can feel but never notice.
- **48px square pager chips** with Play/Pause — motion controls given real, symmetric, touchable geometry.
- **Whole-card disclosure with in-place expansion** — content density without navigation; a close chip instead of a back button.
- **Sticky 100vh awards stage** — scrollytelling that pins the section while cycling proof points.
- **Serif counterpoint (GT Sectra Fine 300)** dropped into one moment of an all-sans system — editorial confidence.
- **0.55s cubic-bezier(0.85,0,0,1) scale motion** — slow-decelerating easing reads as expensive; nothing snaps.
- **Monochrome discipline** — a fully black page where the only color comes from imagery/video; chrome never competes.
- **Quiet 14px uppercase kickers vs 100px displays** — a 7:1 scale jump that creates hierarchy without boxes, borders or backgrounds.

## Translations for RMIS (recruitment app)
1. **Push our display ceiling to the Accenture top**: our fluid display type should reach a ~76→100px clamp at weight 500 with −0.03em tracking for landing/admin section titles ("Candidate Registry", "Review Queue") — we already have the curve; extend the top end and keep medium (never bold) weight.
2. **Formalize the square chip at 48px**: our square expand chips are validated — adopt a uniform 48×48, radius-0 square for ALL pager/carousel controls and modal close buttons (accenture uses a dedicated `__close-button` square inside expanded cards).
3. **Whole-card-as-button disclosure**: make job cards / queue cards a single `aria-expanded` button that expands in place (with an "Expand" label + square close chip) instead of navigating — mirrors the research-card pattern and our expand-chip register.
4. **Kicker discipline**: codify 14px / 500 / uppercase / +0.02em as our eyebrow spec (our kicker-gold already matches; lock the metrics so every page is identical — this was the inconsistency the user flagged).
5. **One serif moment**: add a single editorial serif (GT Sectra-like, weight 300) counterpoint — e.g., the mission statement on the landing page or a quote in the admin dashboard hero — against our Graphik-like sans.
6. **Stat-in-sentence copy**: in evaluator/admin summaries, weave numbers into sentence copy ("3 of 14 candidates awaiting review, 2 interviews scheduled this week") rather than relying only on KPI tiles.
7. **Decelerating motion signature**: apply `0.5–0.55s cubic-bezier(0.85, 0, 0, 1)` scale/expand easing to modals (review modal, candidate modal) and card expansions; it reads materially more expensive than the default 150ms.
8. **Named spacing scale**: adopt named 40/60/80px section paddings (our `rad-` equivalent as Tailwind tokens) so vertical rhythm is identical across workspaces — the consistency gap the audits are meant to close.
