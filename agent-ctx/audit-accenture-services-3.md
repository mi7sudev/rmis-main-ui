# Accenture Audit — Emerging Technology

- URL: https://www.accenture.com/en/services/emerging-technology
- Audited at viewport: 1440×900 (per capture notes; actual innerHeight 757, page height 6,480px)
- Page purpose: Marketing hub for Accenture's emerging-technology line — quantum security, bioinnovation, space tech, material science, blockchain & web3, spatial computing, robotics — pairing an exec-belief stat band with an 8-tile capability mosaic, an innovation-models tab list, trending research, a single award, a single leader and a careers band.

## Section inventory (top→bottom)
| # | Section | Layout pattern | Key components | Notes |
|---|---------|----------------|----------------|-------|
| 1 | Skip links + global nav | Static full-bleed bar over black hero | "Skip to main content/footer"; logo; What we do / What we think / Who we are / Careers; Search; "Hong Kong SAR China" selector | Static (not sticky in DOM test); nav computed at 16px/400; transparent over dark hero |
| 2 | Anchor sub-nav (`rad-subnav-bar`) | Full-width band, padding 0 80px | Breadcrumb link "Emerging Technology" + Page nav: What to do · What's trending · Leaders · Careers | Anchor jumps as the persistent wayfinding surface |
| 3 | Hero | Full-bleed black, left-aligned text stack | H1 "Emerging technology solutions" + serif H2 standfirst ("In a rapidly changing world, embrace emerging technology to transform…") | Headline + thesis only, no hero CTA |
| 4 | "Emerging technology now" stats band (`rad-absorb-stats`) | 4-up numeral-over-sentence row under H3 title | 96% / 95% / 93% / 83% with sentence captions (digital-physical convergence, next-gen computing, innovate with purpose, science tech for health) | Stats reuse the section-H2 display recipe |
| 5 | "Reinvent with emerging technology" mosaic (`rad-mosaic-2--8-card`) | 2-up card grid, 624px-wide `#202020` cards | 8 whole-card links — kickers QUANTUM SECURITY / BIOINNOVATION / SPACE TECH / MATERIAL SCIENCE / BLOCKCHAIN & WEB3 / INDUSTRIAL SPATIAL COMPUTING / ROBOTICS / CONSUMER SPATIAL COMPUTING + H3 + body + "Learn more" | 3 cards embed inline stats: 76% of CEOs (citizens trust), 68% (robotics spend), 71% of AR shoppers |
| 6 | "How to innovate" | Tab list (8 `role=tab`) | Research and development (selected, panel open: "Disruption is the new normal and innovation is the answer") · Incubation services · Delivery · Consulting services | 4 labeled tabs + 4 unlabeled panel tabs in the a11y tree |
| 7 | "What's trending with emerging technology" | Flickity carousel of content-grid cards + header link "View all work: Stay ahead of change" | 8 genre-typed items (5 RESEARCH REPORT / 2 PERSPECTIVE / 1 CASE STUDY), each with an Expand link; Previous (disabled at start) / Next | Square 48×48 pager chips |
| 8 | "Awards & recognition" | Single accordion row (aria-expanded button) | "Accenture named a Leader in Innovation Consulting by Forrester, Q2 2024" | Quietest awards tier in the group |
| 9 | "Our leader" | Single-leader feature | Adam Burden, Global Innovation Lead + "LinkedIn of Adam Burden" link | Singular, not a grid |
| 10 | Technology careers CTA | Slim band | H3 "Technology careers" + sentence ("Be part of shaping the future…") + "Search open roles" button (aria-label "Search open roles: Technology careers") | |
| 11 | Footer | Link lists on black | Logo; Preference Center / Careers / About Us / Contact Us / Locations / Sitemap; legal row (Privacy Statement, Terms & Conditions, Cookie Policy & Settings, Accessibility Statement); "© 2026 Accenture. All rights reserved." | Same mega-footer as sibling pages |

## Typography tokens (computed)
| Element | Family | Size (px) | Weight | Line-height | Tracking | Notes |
|---|---|---|---|---|---|---|
| H1 | Graphik, Arial, Helvetica, sans-serif | 60 | 500 | 69px (1.15) | −1.8px | White; huge-medium-tight display |
| Serif intro H2 | "GT Sectra Fine", Palatino | 24 | 300 | 30px | normal | Editorial serif counter-voice |
| Section H2 | Graphik | 48 | 500 | 57.6px | −1.44px | "Reinvent with…" / "What's trending…" |
| Card H3 | Graphik | 32 | 500 | 38.4px | −0.64px | Mosaic headline tier |
| Stat numerals | Graphik | 48 | 500 | 57.6px | −1.44px | Same scale as section H2 |
| Eyebrow/kicker | Graphik | 14 | 500 | — | +0.28px | UPPERCASE, white |
| Body | Graphik | 16 | 400 | 16px | normal | |
| Nav link | Graphik | 16 | 400 | normal | — | Global nav |

## Color & surface tokens
| Role | Value (hex/rgb) | Where used |
|---|---|---|
| Page canvas | `#000` | Whole page (dark theme) |
| Card surface | `rgb(32,32,32)` #202020 | Mosaic cards |
| Text | `#fff` | All headings, body, links |
| Muted gray | `rgb(97,97,96)` #616160 | Inactive tabs |
| Footer | `#000` | Footer band |
| CTA fill | transparent (1px transparent borders) | All text-link CTAs |

## Component patterns
- Sections pad 60px 80px; mosaic card content pads 40px 40px 24px; cards fixed 624px wide (2-col); sub-nav pads 0 80px; main full-bleed 1440px.
- NO bordered buttons on this page — every CTA is a plain text link ("Learn more", "View all work", "Search open roles", "Expand", "LinkedIn").
- border-radius 0 everywhere sampled; borders are 1px transparent until states change them.
- Carousel chips: square 48×48 transparent, icon-only.
- Mosaic card stack: uppercase eyebrow → 32/500 H3 → body → quiet "Learn more".

## Interaction patterns
- Flickity carousel: Previous/Next; "Previous" disabled on load (aria-disabled), forward paging only.
- Card Expand toggles: aria-expanded, 17 elements on the page.
- "How to innovate" tab list: 8 tabs, one selected with visible panel (a11y snapshot verified).
- Hover states via CSS transitions; header static — scrolls away; only the anchor sub-nav persists as wayfinding.
- OneTrust consent accepted once (accept-btn handler) before capture.

## Copy & content strategy
- H1 is a lowercase-voiced noun phrase ("Emerging technology solutions"); the serif standfirst carries the thesis sentence.
- Stats band titled "<Domain> now": four exec-belief percentages, each with a full-sentence caption; per-card stats woven into mosaic bodies (76% of CEOs say citizens trust…, 68% of organizations expect to increase robotics spend…, 71% of AR shoppers…).
- Card H3s are promises/imperatives ("Shield your data for a quantum-safe future", "Harness space tech for a $1 trillion breakthrough").
- Eyebrow taxonomy types every trend card before its title: RESEARCH REPORT / PERSPECTIVE / CASE STUDY.
- CTA labels: "Learn more", "View all work", "Expand", "Search open roles", "LinkedIn".

## Premium moves (what makes it feel billion-dollar)
- 60px/500 Graphik H1 at −1.8px tracking — huge-medium-tight, never bold.
- GT Sectra Fine 24/300 serif standfirst as the single editorial counter-voice.
- 8-tile 624px mosaic: capability kickers name the discipline before sentence-headlines sell it.
- Stats as display typography: 48/500/−1.44px numerals over sentence captions.
- A zero-button page: text-link CTA economy only, radius 0 everywhere.
- Square 48×48 pager chips with an honest disabled "Previous".
- Muted #616160 inactive tabs — selection contrast without borders or fills.
- Single-leader feature (Adam Burden) instead of a padded grid — content decides density.

## Translations for RMIS (recruitment app)
- 4-up "…now" stat band (48/500 numeral + sentence caption) → pipeline overview exec stats.
- 624px 2-up mosaic with uppercase kickers → capability groupings (Jobs / Candidates / Workspaces).
- "How to innovate" 8-tab list → process tabs (Review / Interview / Offer) with one open panel.
- Genre-typed carousel cards (APPLICATION · INTERVIEW · OFFER + Expand) → activity feeds.
- Text-link-only CTA economy → quiet row actions in tables; reserve filled CTAs for primary decisions.
- Single-leader feature + LinkedIn → hiring-team spotlight on workspace pages.

---

# Accenture Audit — Finance & Risk

- URL: https://www.accenture.com/en/services/finance-risk
- Audited at viewport: 1440×900 (per capture notes; actual innerHeight 757, page height 5,353px)
- Page purpose: Sells Accenture's finance consulting and risk management offer — enterprise performance management, finance platform transformation, finance managed services — through an outcome-stat mosaic, a partner-blurb carousel, analyst awards, four leaders and a dual careers CTA.

## Section inventory (top→bottom)
| # | Section | Layout pattern | Key components | Notes |
|---|---------|----------------|----------------|-------|
| 1 | Anchor sub-nav (`rad-subnav-bar`) | Full-width band, padding 0 80px | "Finance and Risk Management" (16/500) + jump links What to do · What's trending · Partners · Leaders · Careers (14/400) | Page opens directly with the wayfinding rail |
| 2 | Hero | Black, left-aligned stack | H1 "Finance consulting" | Noun-pair H1 |
| 3 | Serif intro | Single editorial line | GT Sectra 24/300 standfirst | Same counter-voice slot as siblings |
| 4 | "…now" stats band (`rad-absorb-stats`) | 4-up numeral-over-sentence row | 93% / 90% / 83% / 72% at 48/500 with captions | All-percent band |
| 5 | "How to reinvent finance and risk management" mosaic (`rad-mosaic-2--3-card`) | 3-card `#202020` grid | Kickers ENTERPRISE PERFORMANCE MANAGEMENT / FINANCE PLATFORM TRANSFORMATION / FINANCE MANAGED SERVICES; each card embeds an outcome stat: "up to 95% reporting quality", "cut data gathering 57%", "up to 50% cost" | Capability + proof in one tile |
| 6 | Trending carousel | Flickity carousel of typed cards | Eyebrows RESEARCH REPORT / CASE STUDY + Expand toggles; Prev/Next | Square chips |
| 7 | "Partners in change" | Partner carousel | 5 partner blurbs + "Learn more" links; Prev/Next | Partners as content, not a logo strip |
| 8 | Awards and recognition | Award rows/cards | IDC MarketScape, Gartner MQ | Analyst-proof tier |
| 9 | "Our leaders" | 4-up people grid | Jason Dess, Craig Richey, Paul Prendergast, Paul Zanker + LinkedIn links | |
| 10 | Careers CTA ×2 | Dual career bands | "Finance consulting open roles" + "Risk management open roles" | CTAs typed by service line |
| 11 | Footer | Link lists on black | Standard mega-footer | `#000` |

## Typography tokens (computed)
| Element | Family | Size (px) | Weight | Line-height | Tracking | Notes |
|---|---|---|---|---|---|---|
| H1 | Graphik | 60 | 500 | 69 | −1.8px | White |
| Serif intro H2 | GT Sectra Fine | 24 | 300 | 30 | normal | |
| Section H2 | Graphik | 48 | 500 | 57.6 | −1.44px | |
| H3 (card) | Graphik | 32 | 500 | 38.4 | −0.64px | |
| H3 sub-variant | Graphik | 24 | 500 | — | −0.48px | Smaller card tier |
| Stat numerals | Graphik | 48 | 500 | — | — | Same scale as H2 (57.6 per system) |
| Eyebrow/kicker | Graphik | 14 | 500 | — | +0.28px | UPPERCASE |
| Body | Graphik | 16 | 400 | 16 | normal | |
| Sub-nav title / jump links | Graphik | 16 / 14 | 500 / 400 | — | — | "Finance and Risk Management" + anchors |

## Color & surface tokens
| Role | Value (hex/rgb) | Where used |
|---|---|---|
| Page canvas / body bg | `#000` | Whole page |
| Card surface | `#202020` | Mosaic cards |
| Text | `#fff` | All type |
| Footer | `#000` | Footer band |
| Accent color | not captured | No purple/muted token sampled on this page |

## Component patterns
- Sections pad 60px 80px; sub-nav pads 0 80px; mosaic is the 3-card variant (`rad-mosaic-2--3-card`).
- Carousel chips: 48×48, radius 0, transparent — 4 flickity buttons total (Prev/Next ×2 carousels).
- 11 Expand / aria-expanded toggles across trending cards.
- Text-link CTA economy (Learn more / open-roles labels); radius 0 everywhere.
- Anchor sub-nav carries a 16/500 page title plus 14/400 jump links.

## Interaction patterns
- 2 carousels (trending + partners) with Prev/Next square chips.
- 11 Expand/aria-expanded card toggles.
- Anchor sub-nav jump links for section wayfinding.
- Header static per system; consent carried over from prior page (none shown).

## Copy & content strategy
- Same eyebrow taxonomy (RESEARCH REPORT / CASE STUDY); CTA labels Learn more / Expand / open-roles variants.
- Stat-heavy mosaic: every capability card embeds an outcome stat ("up to 95% reporting quality", "cut data gathering 57%", "up to 50% cost").
- All-percent 4-up stat band (93/90/83/72) with sentence captions.
- Dual careers CTAs typed by sub-offering ("Finance consulting open roles" / "Risk management open roles").
- Awards copy is analyst-proof-led (IDC MarketScape, Gartner MQ).

## Premium moves (what makes it feel billion-dollar)
- Identical token set to Emerging Technology (60/48/32/24/16/14, all-500, −0.03em) — proof of a system, not page styling.
- 3-card mosaic where every tile carries capability kicker + outcome stat — one-tile proof.
- 5-partner carousel with blurbs and "Learn more" — partners as editorial content.
- Dual typed careers CTAs — one band per audience.
- Analyst awards (IDC MarketScape, Gartner MQ) as the credibility tier.
- Text-link-only CTAs and radius 0 throughout.

## Translations for RMIS (recruitment app)
- 3-card outcome-stat mosaic → service-line cards with proof metrics ("up to 95% reporting quality" → "cut screening time 57%").
- Dual typed careers CTAs → audience-split entrances (Applicant / Evaluator).
- All-percent 4-up stat band → funnel-health stats (pass rates, fill rates).
- Partner-blurb carousel → integrated-tools carousel with one-line value props.
- Anchor sub-nav (16/500 title + 14/400 jumps) → long admin pages wayfinding.

---

# Accenture Audit — Infrastructure & Capital Projects

- URL: https://www.accenture.com/en/services/infrastructure-capital-projects
- Audited at viewport: 1440×900 (per capture notes; actual innerHeight 757, page height 11,136px — longest of the group)
- Page purpose: Sells infrastructure & capital-projects transformation across data centers, cities/transport, engineering-construction-real-estate and utilities — a "9 of 10" stat accordion, a 7-trigger mega-accordion of capabilities, an 8-outcome carousel, vertical tabs, productized platforms, acquisitions, five leaders and a careers band.

## Section inventory (top→bottom)
| # | Section | Layout pattern | Key components | Notes |
|---|---------|----------------|----------------|-------|
| 1 | Anchor sub-nav (`rad-subnav-bar`) | Full-width band, padding 0 80px | Jump links: What's changing · What you can do · What you'll achieve · What's trending | Same wayfinding rail |
| 2 | Hero | Black, left-aligned stack | H1 "Infrastructure and Capital Projects" + serif intro 24/300 | Noun-pair + thesis |
| 3 | "Why reinvent capital projects?" | `rad-stat-helper`: "DATA" label + accordion | Big-fraction stat "9 of 10" (construction projects have cost overruns…) inside a dark-purple `rgb(49,0,81)` container | Fraction-as-stat reveal |
| 4 | "How AI is changing infrastructure…" | Banner image-and-text | Editorial interlude | |
| 5 | "What you can do" | `rad-mega-accordion`, 7 triggers | Align and manage capital project portfolios… / Develop and optimize… / Deliver higher-performing… / Prepare for a smooth transition… / Design a strategy and operating model… / Use data, digital and AI… / Integrate sustainability… | Long-form capability content without page bloat |
| 6 | "What you'll achieve" | Carousel of 8 outcome cards | Projects delivered with desired outcomes / A safer, more efficient worksite / Stronger synergy with contractors / A supply chain that works for you / Decreased carbon / Stakeholder alignment / Cost control / Smarter assets | Payoff row |
| 7 | "Areas we support" | `rad-vertical-tabs`, 200px tab column | Data Centers (selected, white active text) · Cities Transport & Infrastructure · Engineering construction & real estate · Utilities · Capital Projects Engineering Services | Left wayfinding column |
| 8 | Awards | Award disclosures | ENR #6 Top 50 Program Management, BD+C #4, ReNew Canada Platinum | Industry-rank proof |
| 9 | Trending carousel | Flickity carousel of typed cards | Eyebrows PERSPECTIVE / ANNOUNCEMENT / BLOG / RESEARCH REPORT + Expand | Widest taxonomy in the group |
| 10 | "Accelerate your journey" | Platform carousel | Connected Construction / Capital Projects Control Tower / Engineering Data Digitization / Generative Design and Planning / 3D Continuum Engine / Maturity Assessment / Process value analyzer | Product-named offers |
| 11 | "Generative AI Agents" | Editorial + inline stats | "92% of capital projects miss their targets…", "440+ criteria" | Stats woven into prose |
| 12 | Partners / acquisitions carousel | Logo carousel | Anser Advisory, BOSLAN, Comtech, IQT, ORLADE, Partners in Performance, Soben, Verum | 8 acquisitions as investment proof |
| 13 | Careers CTA + Related capabilities | Band + link list | "Grow your careers at the heart of change" + "Join us"; related-capability links | |
| 14 | "Our leaders" + footer | 5-up people grid + black footer | Andy Webster, Jonas Kampik, Adam Shaw, Des Bell, Mark Hilton + LinkedIn; standard mega-footer | Density scales with page depth |

## Typography tokens (computed)
| Element | Family | Size (px) | Weight | Line-height | Tracking | Notes |
|---|---|---|---|---|---|---|
| H1 | Graphik | 60 | 500 | 69 | −1.8px | White |
| Serif intro H2 | GT Sectra Fine | 24 | 300 | 30 | normal | |
| Section H2 | Graphik | 48 | 500 | 57.6 | −1.44px | |
| Capability H2 (NEW tier) | Graphik | 40 | 500 | not captured | −1.2px | Mid-tier display unique to this page |
| H3 (card) | Graphik | 32 | 500 | 38.4 | −0.64px | Core system tier |
| Stat numerals | Graphik | 48 | 500 | 57.6 | −1.44px | "9 of 10" big-fraction treatment |
| Accordion triggers | Graphik | 16 | not captured | — | — | White, radius 0 |
| Eyebrow/kicker | Graphik | 14 | 500 | — | +0.28px | UPPERCASE |
| Body | Graphik | 16 | 400 | 16 | normal | |

## Color & surface tokens
| Role | Value (hex/rgb) | Where used |
|---|---|---|
| Page canvas | `#000` | Whole page |
| Text | `#fff` | All type |
| Purple accent | `rgb(161,0,255)` | `rad-icon` accent — the group's only chromatic moment |
| Dark purple surface | `rgb(49,0,81)` | `rad-stat-helper` container ("9 of 10" block) |
| Tile surface | `#202020` | System-default card fill (per cross-page notes) |
| Footer | `#000` | Footer band |

## Component patterns
- Full-bleed sections pad 60px 80px; sub-nav pads 0 80px; vertical-tabs tab column fixed 200px.
- 4 carousels → 8 flickity Prev/Next buttons, 48×48 square chips.
- Mega-accordion: 7 triggers, 18 aria-expanded elements on the page.
- Vertical tabs: 10 `role=tab` elements, white active text, radius 0.
- Stat accordion ("Toggle accordion") reveals the big-fraction stat.
- Accordion triggers 16px white, radius 0; radius 0 everywhere sampled.

## Interaction patterns
- 4 carousels with 48×48 square Prev/Next chips.
- `rad-mega-accordion` — 7 capability triggers expand long-form panels (18 aria-expanded toggles).
- `rad-vertical-tabs` swap "Areas we support" panels in place (Data Centers selected on load).
- Stat accordion ("Toggle accordion") reveals "9 of 10".
- Expand toggles on trending cards.
- OneTrust consent reappeared → accepted once.

## Copy & content strategy
- Eyebrow taxonomy extended: PERSPECTIVE / ANNOUNCEMENT / BLOG / RESEARCH REPORT.
- Big-fraction stat "9 of 10" inside a "DATA"-labeled accordion — the fraction is the display object.
- Platform carousel productizes offers: Capital Projects Control Tower, 3D Continuum Engine, Generative Design and Planning…
- Inline stats woven into prose: "92% of capital projects miss their targets…", "440+ criteria".
- 7 imperative "What you can do" accordion triggers ("Align and manage capital project portfolios…", "Integrate sustainability…").
- CTA labels: "Learn more" / "Join us".

## Premium moves (what makes it feel billion-dollar)
- The group's only chromatic moment: rgb(161,0,255) icon accent + rgb(49,0,81) stat-helper surface on an all-black page.
- Big-fraction stat "9 of 10" — a fraction as display typography, not a percentage.
- 200px vertical-tabs rail — left wayfinding column rendered as pure typography.
- 7-trigger mega-accordion carries deep capability content without page bloat.
- Product-named platform carousel (Control Tower, 3D Continuum Engine) — offers as named products.
- 8-outcome "What you'll achieve" carousel — payoff row before the sell.
- Acquisitions carousel (8 names) as investment proof.
- Five-leader grid on the deepest page — density scales with depth, tokens never move.

## Translations for RMIS (recruitment app)
- `rad-stat-helper` "9 of 10" accordion → headline stat reveal on landing ("9 of 10 applicants complete their profiles").
- 200px vertical tabs → category rail (Jobs / Candidates / Reports) on wide pages.
- 7-trigger mega-accordion → policy / MQR / CSC criteria expanders.
- Product-named platform carousel → internal-tool spotlight (Registry, Pipeline, Review Workspace).
- rgb(49,0,81)-style tinted stat surface → kicker-gold-tinted stat callout (keep one chromatic moment per page).
- 8-outcome "What you'll achieve" row → applicant outcome cards.

---

# Accenture Audit — Learning (LearnVantage)

- URL: https://www.accenture.com/en/services/learning
- Audited at viewport: 1440×900 (per capture notes; actual innerHeight 757, page height 6,996px)
- Page purpose: LearnVantage-branded digital learning solutions — talent transformation & skilling, learning managed services, academies, platform and certifications — the only page in the group with a video hero, backed by a $10.3T stat band, acquisitions carousel, dated news list, four leaders and a careers CTA.

## Section inventory (top→bottom)
| # | Section | Layout pattern | Key components | Notes |
|---|---------|----------------|----------------|-------|
| 1 | Anchor sub-nav (`rad-subnav-bar`) | Full-width band | Jump links: Our vision · What you need to do · What's trending · Careers | Same wayfinding rail |
| 2 | Hero | Video hero under H1 | H1 "Digital learning solutions" (LearnVantage brand) + video with Pause control | Only video hero in the group |
| 3 | Serif intro | Single editorial line | GT Sectra 24/300 "Become a talent creator…" | Standard counter-voice slot |
| 4 | "Enable people resilience" | Editorial block | H2 + "Read more" link | Quiet breather section |
| 5 | "Why reinvent learning?" stats band (`rad-absorb-stats`) | 4-up numeral-over-sentence row | $10.3T economic value / 61% retraining by 2027 / 94% ready to learn / 5% reskilling at scale | Big-fraction $10.3T leads |
| 6 | "How to reinvent learning" mosaic (`rad-mosaic-2`, 5-card) | `#202020` card grid | Kickers TALENT TRANSFORMATION & SKILLING / LEARNING MANAGED SERVICES / LEARNVANTAGE ACADEMIES / LEARNVANTAGE PLATFORM / CERTIFICATIONS | Sub-brands as product lines |
| 7 | Trending carousel | Flickity carousel of typed cards | Eyebrows CASE STUDY / RESEARCH REPORT + Expand; Prev/Next; "View all work" | Square chips |
| 8 | "Partners in change" | Acquisitions carousel | Ascendient Learning, TalentSprint, Award Solutions, Udacity | M&A as capability proof |
| 9 | "Accenture news" | Dated news carousel | Items dated Oct 15 2025 → Feb 12 2025 with Play control | Newsroom as content strategy |
| 10 | "Our leaders" | 4-up people grid | Kishore Durg, Kai Roemmelt, Majd Sakr, Swati Sharma + LinkedIn | |
| 11 | Careers CTA + footer | Band + black footer | "Search open roles" CTA; standard mega-footer | |

## Typography tokens (computed)
| Element | Family | Size (px) | Weight | Line-height | Tracking | Notes |
|---|---|---|---|---|---|---|
| H1 | Graphik | 60 | 500 | 69 | −1.8px | White |
| Serif intro H2 | GT Sectra Fine | 24 | 300 | 30 | normal | |
| Section H2 | Graphik | 48 | 500 | 57.6 | −1.44px | |
| H3 (card) | Graphik | 32 | 500 | 38.4 | −0.64px | |
| H3 sub-variant | Graphik | 24 | 500 | — | −0.48px | |
| Stat numerals | Graphik | 48 | 500 | 57.6 | −1.44px | $10.3T / 61% / 94% / 5% |
| Eyebrow/kicker | Graphik | 14 | 500 | — | +0.28px | UPPERCASE |
| Body | Graphik | 16 | 400 | 16 | normal | |
| Mega-menu | Graphik | 14 top-level / 16 items | 400 | — | — | "What we do" → 18 services |

## Color & surface tokens
| Role | Value (hex/rgb) | Where used |
|---|---|---|
| Body background | `#000` | Whole page (dark theme) |
| Card surface | `#202020` | Mosaic cards |
| Text | `#fff` | All type |
| Footer | `#000` | Footer band |
| Accent color | not captured | No accent token sampled on this page |

## Component patterns
- Video hero with an exposed Pause control.
- 3 carousels → 6 flickity Prev/Next buttons, 48×48 square chips, radius 0.
- 12 Expand / aria-expanded card toggles.
- Mega-menu: "What we do" → 18 services at 14px top-level / 16px items, radius 0 everywhere, hover transition 0.05s background-color.
- Sections pad 60px 80px (system); text-link CTA economy.

## Interaction patterns
- Video hero Pause button — motion control exposed (a11y-friendly restraint).
- 3 carousels (trending, acquisitions, news) with square Prev/Next chips.
- 12 Expand toggles on trend cards.
- Mega-menu hover: 0.05s background-color transition (snappy chrome vs slow surfaces).

## Copy & content strategy
- Eyebrow taxonomy CASE STUDY / RESEARCH REPORT; "View all work" link-out.
- Stat band mixes macro and micro: $10.3T big-fraction economic value beside 61% / 94% / 5% percentages with sentence captions.
- Acquisitions named as capability proof (Ascendient Learning, TalentSprint, Award Solutions, Udacity).
- "Accenture news" items carry explicit dates (Oct 15 2025 → Feb 12 2025) — freshness as copy.
- CTA labels: Learn more / Read more / Expand / View all work / Search open roles / Join us.

## Premium moves (what makes it feel billion-dollar)
- Video hero with a visible Pause — motion with restraint, confidence as control.
- $10.3T big-fraction leading the stat band — macro-value framing.
- Acquisitions carousel (Udacity, TalentSprint…) — M&A rendered as editorial proof.
- Dated "Accenture news" list with Play control — the newsroom as a design tier.
- 5-card LearnVantage mosaic with sub-brand kickers (Academies / Platform / Certifications as product lines).
- Mega-menu breadth (18 services) hidden in quiet 14px chrome.
- Identical token set to the other three pages — one system, five surface variants.

## Translations for RMIS (recruitment app)
- Video hero + Pause → landing hero with motion control.
- $10.3T-style macro stat → "value created" framing on landing stats beside percentages.
- Acquisitions carousel → partner/integration proof row on the landing page.
- Dated news list + Play → release-notes / updates feed with explicit dates.
- 5-card sub-brand mosaic → RMIS module tiles (Registry / Pipeline / Tracking / Analytics).
- Mega-menu at 14px chrome → primary nav breadth without visual noise.
