# Accenture Audit — Services · AI and Data

- URL: https://www.accenture.com/en/services/ai-data
- Audited at viewport: 1280 × 577 (innerWidth/innerHeight), page height 6980px
- Page purpose: Flagship "AI and data" service-line page — positions generative AI + data readiness as the #1 driver of business reinvention, then routes into the capability mosaic, thought leadership, partners, awards, leaders and careers.

## Section inventory (top→bottom)
| # | Section | Layout pattern | Key components | Notes |
|---|---------|----------------|----------------|-------|
| 1 | Global header (banner/nav) | Transparent bar over black hero | Logo · "What we do / What we think / Who we are / Careers" · Search icon · Country selector ("Hong Kong SAR China") | `position: static` — scrolls away with the page, never sticky |
| 2 | Subnavigation (anchor rail) | Left kicker link + horizontal anchor pills | Kicker "Artificial Intelligence and Data" + anchors "What to do / What's trending / Partners / Leaders / Careers" | 52px bottom padding; purple active/hover pill |
| 3 | Hero | Full-bleed black, left-aligned stack | H1 "AI and data" + serif editorial H2 intro ("In the last 30 years, no technology has promised to change everything…") | H1 60px, intro in GT Sectra serif — the page's single serif moment |
| 4 | "AI and data now" (stats band) | 4-up typographic stat columns, hairline separated | 97% / 67% / 75% / 10-15% + one-sentence support each | Pure type, no charts, numerals at section-heading scale |
| 5 | "Reinvent with AI and data" (mosaic) | Irregular bento grid of dark expandable tiles | 8 cards: INDUSTRIAL AI, DATA SERVICES, GENERATIVE AI, AI Strategy and Value, Responsible AI, Scale AI across the enterprise, Technology Sovereignty, workforce readiness | Tiles #202020 on #000; uppercase eyebrow + H3 + sentence + "Learn more"; × close buttons = expanders |
| 6 | "What's trending with AI and data" | Card carousel with square prev/next chips | 6 tiles (Research Report: AI-ready data; Perspective: digital→intelligent enterprise; agentic AI platform strategy; Sovereign AI; Case Study; Blog) | Previous/Next 48×48 square chips; Previous disabled at start |
| 7 | "Partners in change" | Card carousel | Gartner Inaugural Emerging Tech; Everest Group Leader & Star Performer; Databricks partner of the year – 6th year; Snowflake partner of the year – 2nd year | Analyst-firm badges as floating cards |
| 8 | "Awards and recognition" | Floating-card row | Award cards (carousel) | Same 48px H2 rhythm |
| 9 | "In the news" | 8-item headline grid/list | Trusted Agent Huddle; Tokenomics launch; NATO contract; CMU partnership; Keepler acquisition; Mistral AI; L'Oréal-backed Noli | Date-less headline-first items |
| 10 | "Our leaders" | 2-up portrait cards | Lan Guan; Arnab Chakraborty | Name at card-title scale + role line |
| 11 | "Data careers" banner | Split banner: H2 + H3 + CTA | "Data careers" + "Unlock the power of AI and data…" + "Search open roles" | CTA square (radius 0), pad 0 24px, transparent |
| 12 | Footer | Black, multi-column link matrix + legal row | Careers / About Us / Contact Us / Locations / Preference Center / socials / country-language | 16px white links on black; transparency ≈ flat black |

## Typography tokens (computed)
| Element | Family | Size (px) | Weight | Line-height | Tracking | Notes |
|---------|--------|-----------|--------|-------------|----------|-------|
| H1 hero | Graphik | 60 | 500 | 69 (1.15) | −1.8px (−0.03em) | Huge-MEDIUM-tight; white on black |
| H2 section | Graphik | 48 | 500 | 57.6 (1.2) | −1.44px (−0.03em) | Every terminal section heading identical |
| H2 editorial intro | GT Sectra Fine | 24 | 300 | 30 | normal | Serif light — used exactly once, under the H1 |
| H3 card title | Graphik | 32 | 500 | 38.4 (1.2) | −0.64px (−0.02em) | Mosaic tile titles |
| Stat numeral | Graphik | 48 | 500 | 57.6 | −1.44px | Same scale as section H2 |
| Eyebrow/kicker | Graphik | 14 | 500 | 21 | +0.28px (+0.02em) | UPPERCASE (text-transform) — wide-tracked opposite pole of the system |
| Nav link | Graphik | 16 | 400 | 16 | normal | White |
| Body | Graphik | 16 | 400 | — | normal | White on black |

## Color & surface tokens
| Role | Value (hex/rgb) | Where used |
|------|-----------------|------------|
| Page canvas | rgb(0,0,0) #000 | Document root — whole page is true black |
| Primary text | rgb(255,255,255) #FFF | H1–H3, body, nav, footer links |
| Card surface | rgb(32,32,32) #202020 | Mosaic tiles (anchor cards), on-black elevation |
| Accent purple | rgb(117,0,192) #7500C0 | Sub-nav anchor pills ("Partners", "Leaders"…) |
| Header background | transparent (over black) | Global nav |
| Footer background | transparent (≈ page black) | Footer |
| Disabled state | white at reduced emphasis | "Previous" carousel chip at scroll origin |

## Component patterns
- Radius = 0 EVERYWHERE: cards, purple pills, carousel chips, career CTA — square geometry is the signature.
- Sub-nav anchor pill: pad 0 20px, font 14px, ~52px tall, square, transparent → purple #7500C0 fill.
- Carousel chip: 48×48 square, transparent bg, no border; text-only Previous/Next, disabled state on ends.
- Mosaic tile: #202020 full-bleed dark card, 14/500 uppercase eyebrow (+0.02em), 32/500 title, 16px body, quiet "Learn more" — expandable with × icon close.
- Careers CTA: "Search open roles", pad 0 24px, radius 0, transparent bg, 16px white — geometry carries the weight, not fill.
- Section vertical rhythm: consistent ~60px section paddings (e.g. icon-text carousel & news sections: 60px 0); hero→content separated by 52px sub-nav pad.
- Main container: full document width (main 1280 = clientWidth) — edge-to-edge dark canvas, content inset internally.

## Interaction patterns
- Carousels ×2–3 (trending / partners / awards): square 48×48 Previous/Next chips; Previous disabled at origin (state-aware chips).
- Mosaic expanders: tiles expand inline (× "Close" icon buttons per card) — dossier-style expansion without page change.
- Sub-nav anchor pills scroll to sections (What to do → mosaic; What's trending → carousel…).
- Header is NOT sticky (static, scrolls away); no persistent chrome once scrolled — content owns the screen.
- ~122 elements carry CSS transitions (fade/translate hovers on tiles, links, chips).

## Copy & content strategy
- Kicker/eyebrow: ALL-CAPS capability tags above every tile ("INDUSTRIAL AI", "DATA SERVICES", "GENERATIVE AI") — 14/500/+0.02em.
- Heading voice: two-word noun H1 ("AI and data"); long editorial serif intro does the storytelling in one breath; section H2s are short imperative/noun pairs ("Reinvent with AI and data", "What's trending…").
- CTA labels: quiet and repeated — "Learn more" on nearly every tile; "Search open roles" for careers; no exclamation, no fills.
- Stats: 48px numerals (97% / 67% / 75% / 10-15%) each followed by a full sentence ("of executives said generative AI will transform their company and industry") — number + narrative pair, never bare numbers.
- Awards/news: institution-first naming ("Gartner Inaugural Emerging Tech…", "Databricks partner of the year – 6th year in a row") — borrowed credibility as content.

## Premium moves (what makes it feel billion-dollar)
- True-black canvas with white Graphik — no gray wash, so every #202020 tile reads as a deliberate raised surface.
- One serif moment only (GT Sectra intro): the contrast against 60px Graphik is the entire "editorial luxury" trick.
- Strict all-medium (500) weight system with negative tracking at display sizes — huge but never heavy.
- Square radius-0 geometry everywhere, including the purple pills and 48×48 chips — geometric discipline as brand.
- Typographic stats band (no charts, no icons) — numbers are treated as display type.
- Repeatable 48px section rhythm with generous black space between — the page breathes in identical beats.
- Expandable dark mosaic gives depth (8 capabilities) without leaving the black canvas.
- Quiet, identical "Learn more" CTAs — restraint signals confidence.
- Institution-first award content (Gartner/Everest/Databricks/Snowflake) embedded as design objects, not badges.
- Careers tail ties the service story to jobs — recruitment is part of the brand page, not an afterthought.

## Translations for RMIS (recruitment app)
- Analytics page: adopt the 4-up typographic stat band — 48px-equivalent medium numerals (e.g. "94%" time-to-shortlist) + one-sentence support, hairline-separated, no chart chrome.
- Admin/evaluator workspace headers: single 48px-scale medium heading with −0.03em tracking + one serif/italic editorial intro line under it (once per page, hero only).
- Candidate registry / job board: convert uniform card grids into a #202020-style bento mosaic with kicker-gold uppercase eyebrow (14px/500/+0.02em) over each tile group (QUEUE / REGISTRY / PIPELINE).
- Replace round/outline carousel arrows and pager chips app-wide with 48×48 square radius-0 chips; disabled state = reduced opacity (review-queue pagination, registry pager).
- Landing page: tie the service story to careers like Accenture does — end every public-facing page with a square "Search open roles"-style CTA (pad 0 24px, radius 0).
- Mosaic expanders → make job-detail/candidate-group tiles expand inline with a square × close, keeping users on the black canvas instead of navigating away.

---

# Accenture Audit — Services · Cloud

- URL: https://www.accenture.com/en/services/cloud
- Audited at viewport: 1280 × 577 (innerWidth/innerHeight), page height 7047px
- Page purpose: Cloud consulting service-line page — "AI at scale depends on cloud at scale"; maps the same service-line template onto ~10 cloud capabilities, then trending research, partners, awards, leaders, careers.

## Section inventory (top→bottom)
| # | Section | Layout pattern | Key components | Notes |
|---|---------|----------------|----------------|-------|
| 1 | Global header (banner/nav) | Transparent bar over black hero | Logo · What we do / What we think / Who we are / Careers · Search · Country selector | Same static (non-sticky) header as ai-data |
| 2 | Subnavigation (anchor rail) | Kicker + anchor pills | "Cloud" kicker + "What to do / What's trending / Partners / Leaders / Careers" | Purple #7500C0 pills, radius 0 |
| 3 | Hero | Full-bleed black stack | H1 "Cloud consulting services" + serif intro "AI at scale depends on cloud at scale. Unlock cloud's…" | Identical type treatment to ai-data hero |
| 4 | "Cloud now" (stats band) | Typographic stat columns | 51% lead numeral + supporting sentences | Single-hero-stat variant of the band |
| 5 | "Reinvent with cloud" (mosaic) | Deep bento of dark expandable tiles | 10 cards: Update your cloud foundation to power AI; Become a world-class software organization; Craft a cloud strategy…; Technology Sovereignty; Transform your mainframe…; Protect data, applications & infrastructure…; Process data near its source…; Create AI-ready platform businesses…; Ignite next-level performance…; How to build a modern infrastructure… | Tiles #202020, uppercase eyebrows (e.g. MODERNIZATION SERVICES, APPLICATION TRANSFORMATION), 7 expander close-chips counted |
| 6 | "What's trending with cloud?" | Card carousel + square chips | Research/perspective tiles | Previous/Next 48×48, radius 0 |
| 7 | "Partners in change" | Card carousel | Partner/analyst floating cards | Same grammar as ai-data |
| 8 | "Awards and recognition" | Floating-card carousel | 6x Gartner MQ Public Cloud Optimization; IDC MarketScape Network C…; Forrester Wave Infrastructure Outs…; Everest Group Google Cloud PE…; 4x Gartner MQ Custom Software…; IDC MarketScape Hybrid IT | "Nx" multiplier naming is consistent |
| 9 | "Our leaders" | 5-up portrait grid | Andy Tay; Jefferson Wang; Max Furmanov; Rajive Wickramasinghe; Ram Ramalingam | Larger leader grid than ai-data (2) |
| 10 | "Cloud careers" banner | Split banner: H2 + CTA | "Cloud careers" + "Search open roles" | Square CTA, pad 0 24px, radius 0 |
| 11 | Footer | Black link matrix + legal | Same global footer | 16px white links |

## Typography tokens (computed)
| Element | Family | Size (px) | Weight | Line-height | Tracking | Notes |
|---------|--------|-----------|--------|-------------|----------|-------|
| H1 hero | Graphik | 60 | 500 | 69 (1.15) | −1.8px (−0.03em) | Identical to ai-data — tokenized system |
| H2 section | Graphik | 48 | 500 | 57.6 (1.2) | −1.44px (−0.03em) | "Reinvent with cloud", "What's trending with cloud?", "Partners in change", "Awards…", "Our leaders", "Cloud careers" |
| H2 editorial intro | GT Sectra Fine | 24 | 300 | 30 | normal | Single serif moment under H1 |
| H3 card title | Graphik | 32 | 500 | 38.4 (1.2) | −0.64px (−0.02em) | Mosaic tile titles |
| Stat numeral | Graphik | 48 | 500 | 57.6 | −1.44px | "51%" |
| Eyebrow/kicker | Graphik | 14 | 500 | 21 | +0.28px (+0.02em) | UPPERCASE tile tags (same component as ai-data) |
| Nav link | Graphik | 16 | 400 | 16 | normal | Header/sub-nav |
| Body | Graphik | 16 | 400 | — | normal | White on black |

## Color & surface tokens
| Role | Value (hex/rgb) | Where used |
|------|-----------------|------------|
| Page canvas | rgb(0,0,0) #000 | Document root |
| Primary text | rgb(255,255,255) #FFF | All headings/body/nav |
| Card surface | rgb(32,32,32) #202020 | Mosaic tiles (Modernization Services, Application Transformation…) |
| Accent purple | rgb(117,0,192) #7500C0 | Sub-nav anchor pills ("Leaders") |
| CTA surface | transparent (white text) | "Search open roles" careers CTA |
| Header/footer | transparent over black | Global chrome |

## Component patterns
- Same square system: every measured radius = 0 (pills, tiles, chips, CTA).
- Carousel chips: 48×48, transparent, square, text-only.
- Mosaic tile: #202020, eyebrow 14/500 uppercase, 32/500 title, 16px body, quiet "Learn more"; inline expander with × close.
- Careers CTA: pad 0 24px, radius 0, 16px white — identical geometry to ai-data.
- Anchor pill: pad 0 20px, 14px, square, purple on activation.

## Interaction patterns
- Carousels: two Previous/Next chip pairs detected (trending + partners/awards), identical 48×48 geometry.
- Mosaic expanders: 7 close-chips found — tiles expand inline.
- Anchor rail scroll behavior ("What to do / What's trending / Partners / Leaders / Careers" — duplicated list = desktop + mobile rails).
- Header static — scrolls away; no sticky chrome.
- Square-chip hover + tile fade transitions (same transition system, ~120+ elements).

## Copy & content strategy
- Eyebrows: uppercase capability tags ("MODERNIZATION SERVICES", "APPLICATION TRANSFORMATION…") above tile titles.
- Heading voice: noun-pair H1 ("Cloud consulting services"); connective serif thesis ("AI at scale depends on cloud at scale…"); H2s short ("Reinvent with cloud", "Cloud careers").
- CTAs: "Learn more" repeated on tiles; "Search open roles" banner CTA; labels stay under 3 words.
- Stats: numeral 48px + sentence; awards use multiplier form ("6x Gartner…", "4x Gartner…") — quantified credibility.
- Content depth signal: 10 mosaic tiles vs ai-data's 8 — the template absorbs capability breadth without changing grammar.

## Premium moves (what makes it feel billion-dollar)
- Exact token reuse across service lines (60/48/32/16/14 scale identical) — system, not pages.
- Deep 10-tile mosaic that still reads calm: uniform #202020 surfaces + one accent hue do all the hierarchy work.
- Serif thesis line "AI at scale depends on cloud at scale" — one sentence positions the whole portfolio.
- Multiplier award copy ("6x", "4x") rendered as floating design cards — proof scaled as typography.
- Five-leader grid: org scale as content, styled identically to 2-leader pages.
- Non-sticky header = maximal content immersion; trust the design system to navigate.
- Square geometry held perfectly across 7047px of page — discipline is the luxury.
- Careers banner closes the loop from capability → jobs with one square CTA.

## Translations for RMIS (recruitment app)
- Long admin pages (Operations, Analytics): add the kicker + anchor-pill sub-nav rail ("OVERVIEW / QUEUE / REGISTRY / PIPELINE") with square purple-on-active pills — anchors for 7000px-class pages.
- Job workspace capability tiles: 10-tile bento pattern for service groups/units; expand inline with square × chip instead of route change.
- Compliance/MQR cards: borrow the "Nx + institution" award form ("CSC-qualified · MQR met 3/3") as floating cards on the evaluator decision rail.
- Leaders grid → unit contacts: portrait + 24px name + 14px role on #202020 cards for MIRDC/division pages.
- "Cloud now" single-hero-stat variant → the admin dashboard's one KPI that matters each morning, at 48px-equivalent with a sentence under it.
- Keep CTA vocabulary to two verbs app-wide ("Learn more" → "Open"/"Review"; "Search open roles" → "Search positions") — quiet repetition over cleverness.

---

# Accenture Audit — Services · Customer Service

- URL: https://www.accenture.com/en/services/customer-service
- Audited at viewport: 1280 × 577 (innerWidth/innerHeight), page height 4803px
- Page purpose: Customer-service transformation page — turns "proactive support into a growth engine"; a compressed run of the same service-line template (no Awards/Leaders/News tiers).

## Section inventory (top→bottom)
| # | Section | Layout pattern | Key components | Notes |
|---|---------|----------------|----------------|-------|
| 1 | Global header (banner/nav) | Transparent bar over black hero | Logo · What we do / What we think / Who we are / Careers · Search · Country selector | Same static header |
| 2 | Subnavigation (anchor rail) | Kicker + anchor pills | "Customer service" kicker + section anchors | Purple pill system, radius 0 |
| 3 | Hero | Full-bleed black stack | H1 "Turn customer service and proactive support into a growth engine" + serif intro "Impersonal and inconsistent interactions are leavi…" | Sentence-outcome H1 (not noun-pair) |
| 4 | "Customer service now" (stats band) | 4-up typographic stat columns | 50% / 70% / 70% / 67% + sentences (B2C purchase-more; agents want automation; customers spend more with fluid personalized service) | H2 here sits at 32px (smaller tier) |
| 5 | "Deliver a support experience that can't be ignored" (mosaic) | 4-card dark bento | VISION, STRATEGY AND IMPLEMENTATION · PRODUCT AND SERVICE INNOVATION · TECHNOLOGY AND TALENT ENABLEMENT · DATA AND INSIGHTS | Tiles #202020, long multi-word uppercase eyebrows, H3 24px titles |
| 6 | "What's trending in customer service" | Card carousel + square chips | Research/perspective tiles | 48px H2 tier returns |
| 7 | "Partners in change" | Card carousel | Partner floating cards | No awards/leaders/news tiers on this page |
| 8 | "Customer service careers" banner | Split banner: H2 + CTA | "Customer service careers" + careers CTA | Same square CTA geometry |
| 9 | Footer | Black link matrix + legal | Global footer | Identical to siblings |

## Typography tokens (computed)
| Element | Family | Size (px) | Weight | Line-height | Tracking | Notes |
|---------|--------|-----------|--------|-------------|----------|-------|
| H1 hero | Graphik | 60 | 500 | 69 (1.15) | −1.8px (−0.03em) | Full outcome-sentence at display scale |
| H2 editorial intro | GT Sectra Fine | 24 | 300 | 30 | normal | Serif light, single moment |
| H2 "…now" band + mosaic | Graphik | 32 | 500 | 38.4 (1.2) | −0.64px (−0.02em) | This page uses the 32px tier for mid sections |
| H2 terminal sections | Graphik | 48 | 500 | 57.6 | −1.44px | "What's trending…", "Partners in change", "Customer service careers" |
| H3 card title | Graphik | 24 | 500 | 31.2 (1.3) | −0.48px (−0.02em) | Smaller tile titles than sibling pages |
| Stat numerals | Graphik | 48 | 500 | 57.6 | −1.44px | 50% / 70% / 70% / 67% |
| Eyebrow/kicker | Graphik | 14 | 500 | 21 | +0.28px (+0.02em) | Long uppercase tags (e.g. "TECHNOLOGY AND TALENT ENABLEMENT") |
| Nav/body | Graphik | 16 | 400 | — | normal | White on black |

## Color & surface tokens
| Role | Value (hex/rgb) | Where used |
|------|-----------------|------------|
| Page canvas | rgb(0,0,0) #000 | Document root |
| Primary text | rgb(255,255,255) #FFF | Headings, body, nav |
| Card surface | rgb(32,32,32) #202020 | 4 mosaic tiles |
| Accent purple | rgb(117,0,192) #7500C0 | "Careers" sub-nav pill (52px tall, 14px text, radius 0) |
| CTA surface | transparent (white text) | Careers banner CTA |
| Header/footer | transparent over black | Global chrome |

## Component patterns
- Square system intact: 0px radius on pills, tiles, chips, CTA.
- Carousel chips: 48×48 square, text-only Previous/Next.
- Mosaic tile: #202020; eyebrow + 24/500 title + body + "Learn more" — identical anatomy, smaller title tier on a shorter page.
- Purple anchor pill measured directly: height 52px, font 14px, pad 0 20px, radius 0.
- Stat band: numeral 48/500 + sentence, hairline-separated columns.

## Interaction patterns
- Carousels: Previous/Next 48×48 square chips (same two-pair setup).
- Mosaic: 4 tiles, same expander/close anatomy (no separate page nav for capabilities).
- Anchor rail with purple pill states for section jumps.
- Static header (scrolls away); hover fade/translate transitions throughout.

## Copy & content strategy
- Eyebrows: LONG uppercase capability phrases ("VISION, STRATEGY AND IMPLEMENTATION", "TECHNOLOGY AND TALENT ENABLEMENT", "DATA AND INSIGHTS") — proof the kicker tolerates 3-6 words.
- Heading voice: outcome-sentence H1 ("Turn X into a growth engine") vs sibling pages' noun pairs — H1 flexes to message, tokens never flex.
- Stats: 4 numerals each continuing into a sentence ("of customers spend more with companies that offer fluid, personalized and seamless…") — number + narrative, again.
- CTAs: single quiet "Learn more" label across tiles; careers CTA square and unfilled.
- Compression strategy: 4803px page keeps hero → stats → mosaic → trending → partners → careers grammar, drops awards/leaders/news entirely — the template scales down without breaking rhythm.

## Premium moves (what makes it feel billion-dollar)
- The H1 is a full strategy sentence at 60px — message ambition carried by type, not decoration.
- Token invariance: same 60/48/32/24/16/14 system, so a compressed page still feels like the flagships.
- Long uppercase eyebrows turn scannability into editorial rhythm (wide +0.02em tracking as counterpoint to tight display).
- 4-tile mosaic with zero imagery doing the work — surface, type and spacing only.
- Stat band reused verbatim in structure — trust built through repetition.
- Dropping tail sections entirely rather than padding them: restraint as systems thinking.
- Careers banner present even on the shortest page — every service page ends at jobs.

## Translations for RMIS (recruitment app)
- Workspace page titles: write outcome sentences instead of noun labels ("Turn a 3-checkpoint queue into a one-sitting decision") at the 48px-equivalent tier.
- Long kicker support: allow multi-word uppercase kickers ("EVALUATION · CREDENTIALS · DECISION") — the register holds at 4+ words with wide tracking.
- Compressed-page grammar for lightweight admin pages (Settings): hero → KPI band → 4-tile mosaic → activity — keep the beats, drop the tiers you can't fill.
- Stat band on evaluator home: 50%/70%-style pairs (e.g. "12 applications awaiting first action") — numeral 48px-equivalent + sentence, no icons.
- Purple anchor pill geometry (52px tall, 14px, radius 0, square) is the exact spec for RMIS sub-nav/filter pills on shared ledgers.
- End every public page with the square careers CTA ("Search open positions") — RMIS's recruitment funnel mirrors Accenture's service→careers loop.
