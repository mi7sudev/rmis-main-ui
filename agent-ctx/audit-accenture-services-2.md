# Accenture Audit — Cybersecurity Services

- URL: https://www.accenture.com/en/services/cybersecurity
- Audited at viewport: 1280 × 577 (innerWidth/innerHeight, agent-browser default)
- Page purpose: Marketing hub for Accenture's cybersecurity consulting line — positions the offer ("De-risk tomorrow by boosting cybersecurity today"), routes into sub-services (strategy, resilience, quantum security), thought leadership, partner ecosystem, analyst awards, leaders and careers.

## Section inventory (top→bottom)
| # | Section | Layout pattern | Key components | Notes |
|---|---------|----------------|----------------|-------|
| 1 | Skip links + global nav | Full-bleed black bar, h=72px, static (scrolls away) | Logo, "What we do / What we think / Who we are / Careers" (mix of buttons + plain link), Search, country selector | Nav links 14px, ghost buttons pad 0 8px |
| 2 | Sticky page sub-nav | Fixed bar, h=52px, bg `rgb(70,0,115)` (deep purple #460073) | Breadcrumb chip "Cybersecurity" + inline anchor links: What to do · What's trending · Awards · Leaders · Careers | This bar PINS to top when the black global nav scrolls away — anchor navigation with active tracking |
| 3 | Hero | Full-bleed black, left-aligned text block | H1 "Cybersecurity consulting" + serif H2 subtitle (2 sentences) | No CTA in hero; headline+standfirst only |
| 4 | Hero media carousel | Full-width video stage with overlaid text card | H2 "Accenture at CrowdStrike Fal.Con 2026", paragraph, "Learn more" primary button, "Pause" control, disabled video fallback | Auto-rotating campaign slot inside hero |
| 5 | "Cybersecurity now" stats band | Stat row above first section (class `rad-absorb-stats`) | 3 stats: $10.5T / 86% / 200% with 16px captions | H3 kicker-style 32px title; stats in huge-medium-tight display type |
| 6 | "Reinvent with cybersecurity" mosaic | Card grid (2-3 cols), dark `rgb(32,32,32)` cards, radius 0 | 7 service cards; each = uppercase eyebrow (CYBER STRATEGY / CYBER RESILIENCE / QUANTUM SECURITY…) + H3 + body + "Learn more" tertiary CTA; some cards carry an inline stat ("74% of CEOs worry…", "75% of encryption…") | Whole card is one `<a>`; eyebrow class `rad-mosaic-2__card-eyebrow` |
| 7 | "What's trending with cybersecurity" | Flickity carousel, 1-up large cards | 8 items typed by format (Research Report / Blog / Case Study) + "Expand" reveal + Previous/Next | Header row has "View all work: Stay ahead of change" link-out |
| 8 | "Partners in change" | Logo strip (one link, logo images) | AWS, Cloudflare, CrowdStrike, CyberArk, Fortinet, Google, OpenText, Microsoft, Nozomi | Quiet partner proof, no copy |
| 9 | "Awards and recognition" | Accordion rows (aria-expanded buttons) | 6 analyst-award rows (Everest PEAK Matrix, IDC MarketScape, Gartner) | Rows expand on click to reveal detail |
| 10 | "Our leaders" | Row of person cards | 5 leaders (Harpreet Sidhu, David Fitch, John Paitaridis, Daisuke Fujii, Giovanni Cozzolino) + LinkedIn icon links | H3 names under photos |
| 11 | Careers strip | Slim banner | H3 "Cybersecurity careers" + button "Search open roles: security" | Single-CTA recruiting band |
| 12 | Footer | Full-bleed black on `html { background: rgb(0,0,0) }` | Logo, Preference Center, Careers, About Us, Contact Us, Locations, Sitemap, Privacy, Terms, Cookies, Accessibility | Text links white on black |

## Typography tokens (computed)
| Element | Family | Size (px) | Weight | Line-height | Tracking | Notes |
|---------|--------|-----------|--------|-------------|----------|-------|
| H1 hero (`rad-hero-image__headline`) | Graphik | 60 | 500 | 69px (1.15) | −1.8px (−0.03em) | Huge-MEDIUM display, not bold |
| Hero standfirst H2 | GT Sectra Fine (serif), Palatino fallback | 24 | 300 | 30px | normal | Editorial serif counter-voice to the sans H1 |
| Section H2 (Reinvent / Trending / Partners / Awards) | Graphik | 48 | 500 | 57.6px (1.2) | −1.44px (−0.03em) | Same display recipe as H1, one step down |
| Sub-feature H2 (video overlay card) | Graphik | 40 | 500 | 48px | −1.2px | Mid-tier display |
| Section H3 / stat title (`rad-absorb-stats__title`) | Graphik | 32 | 500 | 38.4px | −0.64px (−0.02em) | |
| Card H3 (mosaic) | Graphik | ~24 | 500 | — | −0.02em | Card-level display |
| Eyebrow/kicker (`rad-mosaic-2__card-eyebrow`) | Graphik | 14 | 500 | 16.8px | +0.28px (+0.02em) | UPPERCASE white — the "kicker" voice |
| Body | Graphik | 16 | 400 | 16px→1.5 in copy blocks | normal | |
| Stat numerals | Graphik | 48 | 500 | 57.6px | −1.44px | Numbers get the display treatment |
| Nav / sub-nav links | Graphik | 14 | 400–500 | — | — | |

## Color & surface tokens
| Role | Value (hex/rgb) | Where used |
|------|-----------------|------------|
| Page canvas | `rgb(0,0,0)` #000 | Hero band, page background (set on `html`) |
| Card surface | `rgb(32,32,32)` #202020 | Mosaic service cards, menu back-button bg |
| Deep purple | `rgb(70,0,115)` #460073 | Sticky page sub-nav bar (the single strongest brand block) |
| Text on dark | `rgb(255,255,255)` | All headings, body, links, buttons |
| Accent purple #A100FF | not present in main text scan | Brand purple used sparingly (menus/hovers), not as body accent |
| Buttons/CTAs | transparent bg, white text | All variants sampled transparent on dark surfaces |

## Component patterns
- Buttons are all SQUARE: `border-radius: 0` across primary/tertiary/ghost/icon-button.
- Primary button (`rad-button--primary`): pad `0 24px`, box 135×52 (min-height 52), transparent bg, white 16px/500 label, no border — dark canvas does the work.
- Tertiary CTA: pad `0`, pure text + arrow; ghost nav buttons pad `0 8px`.
- Carousel prev/next: 48×48 square `rad-icon-button--grey` (Flickity), transparent, no border.
- Accordion rows: 216px tall award cards, aria-expanded buttons, transparent with hairline-level structure (border colors transparent until hover).
- Mosaic card: bg #202020, radius 0, no padding on card shell (inner elements carry spacing); card eyebrow → H3 → copy → CTA stack.
- Motion: shared easing `cubic-bezier(0.85, 0, 0, 1)` — background-color transitions 0.55s on cards/buttons (slow, deliberate); nav links 0.05s (snappy).

## Interaction patterns
- Sticky sub-nav: black global nav scrolls away; the 52px purple anchor bar fixes to top (ancestor `.rad-subnav--anchors` `position: fixed`) and tracks section scroll.
- Flickity carousel: Previous/Next 48px square chips; "Previous" disabled at start (`aria-disabled`), infinite forward paging.
- Expanders: "What's trending" cards have Expand buttons/links per card (reveal more copy in place); Awards accordion rows toggle (`aria-expanded`) — verified by clicking "Everest Group Cloud Security…" row.
- Video carousel in hero: auto-rotates, "Pause" button exposed (a11y-friendly motion control).
- Hover: slow 0.55s background-color fill on cards/buttons (exact-brand easing), quick 0.05s on nav links.

## Copy & content strategy
- Kickers: UPPERCASE short service tags — "CYBER STRATEGY", "CYBER RESILIENCE", "QUANTUM SECURITY" — 14px/500/+2% tracking.
- Heading voice: imperative + outcome-led — "Reinvent with cybersecurity", "De-risk tomorrow by boosting cybersecurity today"; card H3s are full-sentence promises ("Shield your data for a quantum-safe future").
- CTA labels: verb-first, mostly "Learn more" (repeated with differing context via aria-label "Learn more: …"), plus "Search open roles: security", "View all work: Stay ahead of change".
- Stats treatment: numbers get display type ($10.5T / 86% / 200% at 48px/500/−1.44px) with 16px sentence captions; in-card stats ("74% of CEOs worry…", "75% of encryption…") woven into body copy.
- Format-typing: every trend item declares its genre (Research Report / Blog / Case Study) before its title — taxonomy as copy.

## Premium moves (what makes it feel billion-dollar)
- The huge-medium-tight display register: 60px H1 at weight 500 with −3% tracking — luxury weight, never bold.
- A serif (GT Sectra Fine) standfirst under the sans H1 — instant editorial contrast.
- Squared everything: radius 0 on buttons, cards, carousel chips — motif-level consistency.
- The single purple block (#460073 sticky sub-nav) against an all-black page — one strong color moment per viewport.
- Numbers treated as display typography, not table data.
- Uppercase micro-kickers (+0.02em) naming each capability before the sentence-headline sells it.
- Slow, heavy hover fills (0.55s, custom cubic-bezier) that make the interface feel weighted.
- Whole-card-is-a-link mosaics with layered eyebrow/H3/stat copy density.
- Anchor sub-nav that pins and tracks — wayfinding as a brand surface.
- Motion control (Pause) on the hero — restraint signals confidence.

## Translations for RMIS (recruitment app)
- Use the 60px→48px→32px Graphik-style scale (weight 500, tracking −0.03em/−0.02em) for our evaluator/admin display headings; never bold.
- Add a serif standfirst line under key page H1s (candidate detail header, dashboard hero) mirroring the GT Sectra counter-voice.
- Keep our square motif: radius 0 on all buttons/chips; primary CTAs as transparent-fill white-label with 52px min-height and 24px horizontal padding.
- Promote stat tiles (pipeline counts, fill rates) to 48px/500 numerals with 16px captions — the "Cybersecurity now" pattern.
- Adopt uppercase 14px/500/+0.02em kickers ("01 · REVIEW QUEUE" style) exactly as Accenture's card eyebrows.
- Sticky purple (or kicker-gold) anchor bar per workspace page for section wayfinding (Overview / Documents / Decisions).
- Standardize hover fill at 0.55s cubic-bezier(0.85,0,0,1) on rows/buttons for the weighted feel.
- Type every list item with a genre kicker (e.g., "APPLICATION · #574" before the name) like Research Report/Blog/Case Study typing.

---
# Accenture Audit — Digital Engineering & Manufacturing
- URL: https://www.accenture.com/en/services/digital-engineering-manufacturing
- Audited at viewport: 1280×577 (page height 8,391px)
- Page purpose: Sells Industry X / digital engineering & manufacturing services — automating operations, infrastructure & capital projects, R&D, smart connected products, asset management, robotics, aftermarket — by digitizing "what you make and how you make it."

## Section inventory (top→bottom)
| # | Section | Layout pattern | Key components | Notes |
|---|---------|----------------|----------------|-------|
| 1 | Global nav | Static banner, left logo / center toolbar items / right Search + locale | "What we do / What we think / Who we are / Careers" buttons, Search, "Hong Kong SAR China" selector | position:static — scrolls away (verified) |
| 2 | Anchor sub-nav | Purple #460073 band, 52px tall, inline anchor links | "What to do / What's trending / Awards / Leaders / Careers"; current-section anchor highlighted #7500C0 | rad-subnav--anchors; wayfinding surface |
| 3 | Hero | Full-bleed black, left-aligned stack | H1 "Digital engineering and manufacturing" (noun-pair) + serif standfirst sentence | 60px Graphik + 24px GT Sectra |
| 4 | "Digital engineering & manufacturing now" | 4-up typographic stat band, numeral over sentence | $1B, 68%, 78%, $1.6T | numerals 48/500/−1.44 with 16px captions |
| 5 | "Reinvent with digital engineering & manufacturing" | Dark mosaic grid of 7 capability tiles | DIGITAL PRODUCTION & OPERATIONS / INFRASTRUCTURE & CAPITAL PROJECTS / DIGITAL ENGINEERING AND R&D / SMART CONNECTED PRODUCTS & SERVICES / INTELLIGENT ASSET MANAGEMENT / ADVANCED AUTOMATION & ROBOTICS / AFTERMARKET SERVICES | whole-tile links: uppercase eyebrow + H3 question + body + "Learn more"; photo-backed |
| 6 | "Areas we support" | Tabbed switcher | Supply Chain / Software Defined Vehicles / +1 tabs (tablist, selected state) | 28px/300 serif-weight description copy |
| 7 | "Orchestrating the ecosystem" | Spotlight feature + CTA | H2 + H3 thesis + "Read more" button | editorial interlude between grids |
| 8 | "What's trending with…" | 9-card horizontal carousel | RESEARCH REPORT / PERSPECTIVE / CASE STUDY / BLOG typed cards, each with Expand link; "View all work" CTA | Prev/Next 48×48 square chips; genre-kicker-first copy |
| 9 | "Partners in change" | Logo carousel | AVEVA, AWS, Dassault, Microsoft, NVIDIA, SAP, Siemens logos + one-liners | square Prev/Next chips |
| 10 | "Awards and recognition" | 4 disclosure cards | "market shaper in Physical AI Services", "leader in smart manufacturing", "Generative AI Engineering Services", "Connected Product Engineering" | rad-awards-card; at least one --purple variant |
| 11 | "We're expanding our capabilities through strategic acquisitions" | 4-card carousel | SYSTEMA, AOX, BOSLAN, Soben — logo + H3 + para + Learn more | acquisitions as proof-of-investment |
| 12 | "Our leaders" | 4-up people grid | Tracey Countryman, Fay Cranmer, Prasad Satyavolu, Götz Erhardt + titles + LinkedIn links | |
| 13 | Careers banner | Full-width band | H3 "Engineering careers" + sentence + "Search open roles" CTA | CTA 52px, pad 0 24px, r0, transparent |
| 14 | Footer | Link lists on black | logo, Preference Center/Careers/About Us/Contact Us/Locations/Sitemap, legal, © 2026 | transparent on page black |

## Typography tokens (computed)
| Element | Family | Size (px) | Weight | Line-height | Tracking | Notes |
|---|---|---|---|---|---|---|
| H1 | Graphik | 60 | 500 | 69 (1.15) | −1.8px | white, noun-pair |
| Serif standfirst (hero H2) | GT Sectra Fine | 24 | 300 | 30 | normal | full-sentence thesis |
| Section H2 ("Reinvent with…", "What's trending…") | Graphik | 48 | 500 | 57.6 | −1.44px | |
| H3 card headline | Graphik | 32 | 500 | 38.4 | −0.64px | questions/promises |
| Stat numeral | Graphik | 48 | 500 | 57.6 | −1.44px | $1B / 68% / 78% / $1.6T |
| Tile description | Graphik (serif-weight slot) | 28 | 300 | 35 | normal | "Areas we support" panel copy |
| Eyebrow/kicker | Graphik | 14 | 500 | — | +0.28px | UPPERCASE, white |
| Body | Graphik | 16 | 400 | 24 | normal | |
| Button label | Graphik | 16 | 500 | — | normal | "Search open roles" |

## Color & surface tokens
| Role | Value (hex/rgb) | Where used |
|---|---|---|
| Page canvas | #000 (black) | whole page |
| Text | rgb(255,255,255) | all type |
| Sub-nav band | rgb(70,0,115) #460073 | anchor rail background |
| Active anchor / accent | rgb(117,0,192) #7500C0 | current-section sub-nav link; purple award card |
| Tile/card bg | photo-backed + dark scrim | mosaic tiles (no flat gray seen here, unlike ai-data) |
| Footer | transparent on #000 | |

## Component patterns
- Careers CTA: 52px tall, 185px wide, padding 0 24px, radius 0, transparent bg, white 16/500 label.
- Carousel chips: 48×48, radius 0, transparent, square. Prev disabled state on load (left-aligned carousels).
- Mosaic tiles: whole-tile anchors — uppercase eyebrow (14/500) + 32/500 H3 + body + "Learn more", expandable.
- Sub-nav: #460073 band, 52px, uppercase-free anchor links tracking scroll position.
- Awards: rad-awards-card disclosure buttons; --purple variant uses the #460073 surface.
- Tab strip ("Areas we support", "Explore our network"): radius-0 tabs, 24/500 on page 2's A–Z index.

## Interaction patterns
- Anchor sub-nav tracks scroll (current-section link flips to #7500C0).
- 3 carousels (trending, partners, acquisitions) with 48×48 square prev/next; Prev disabled at start.
- 7 expandable mosaic tiles + 4 award disclosures (aria-expanded toggles, × close chips).
- "Areas we support" tablist switcher.
- Header static (verified: position static) — only the purple sub-nav provides persistent wayfinding.

## Copy & content strategy
- H1 is a plain noun-pair ("Digital engineering and manufacturing"); the serif standfirst carries the outcome sentence ("Digitize what you make, revolutionize how you make it…").
- Stats band titled "<Domain> now"; numerals mixed currency/percent ($1B, $1.6T, 68%, 78%) each with a full-sentence caption.
- Card H3s are questions or outcome promises ("What will you gain by automating your operations?", "How to design products customers actually love").
- Uppercase capability kickers name the discipline before the sentence sells it (INTELLIGENT ASSET MANAGEMENT…).
- Genre-typed carousel items (RESEARCH REPORT / PERSPECTIVE / CASE STUDY / BLOG) with in-card stats ("73% of customers…", "80% of customers valuing experience…").
- CTA labels: "Learn more" (aria-label disambiguates), "View all work", "Read more", "Search open roles".
- Acquisitions section signals scale ("We're expanding our capabilities through strategic acquisitions").

## Premium moves (what makes it feel billion-dollar)
- 60px/500 Graphik H1 with −3% tracking — luxury weight, never bold.
- GT Sectra 24/300 serif standfirst as the single counter-voice.
- One purple moment per viewport: #460073 sub-nav (and a matching purple award card).
- Numbers as display typography: 48/500/−1.44px stats with sentence captions.
- Radius 0 on every surface: CTAs, chips, tabs, cards.
- Whole-tile-is-a-link mosaic with layered eyebrow/H3/body density.
- Square 48×48 pager chips with honest disabled states.
- Genre-typing on every content card (taxonomy as copy).

## Translations for RMIS (recruitment app)
- 4-up "…now" stat band (48/500 numeral + 16px sentence) → Analytics/pipeline overview ("$1B" → "312 open roles").
- Purple #460073 anchor sub-nav (52px, current-section #7500C0) → workspace wayfinding (Overview / Documents / Decisions).
- Whole-tile expandable mosaic with uppercase eyebrow + question H3 → job/candidate capability groupings.
- Genre-typed carousel cards (APPLICATION · INTERVIEW · OFFER) with Expand affordance → activity feeds.
- Square 48×48 pager chips + 52px pad-0-24px radius-0 primary CTA → pagination and "Start review".
- Leaders 4-up grid with LinkedIn links → interviewer/hiring-team profiles.

# Accenture Audit — Ecosystem Partners
- URL: https://www.accenture.com/en/services/ecosystem-partners
- Audited at viewport: 1280×577 (page height 8,191px)
- Page purpose: Showcases Accenture's technology alliance ecosystem — 19 strategic "key partners" with co-developed offerings plus an A–Z directory of hundreds — and argues interoperability ("Reinvention doesn't happen in a silo").

## Section inventory (top→bottom)
| # | Section | Layout pattern | Key components | Notes |
|---|---------|----------------|----------------|-------|
| 1 | Global nav | Static banner | same toolbar (What we do/What we think/Who we are/Careers) + Search + locale | identical chrome |
| 2 | Anchor sub-nav | Purple #460073 band, 52px | "Key partners / All partners / Careers / Related capabilities" | same rail system |
| 3 | Hero | Black, left stack | H1 "Ecosystem partners" + serif standfirst ("Reinvention doesn't happen in a silo…") | noun-pair H1 + GT Sectra thesis |
| 4 | "Upcoming events" | Auto-playing promo carousel (1 of 3) | Dreamforce 2026 slide: H3 + date/venue + "Register" CTA | "pause automatic slide show" control — motion restraint |
| 5 | "Why you need integrated partners" | 4-up stat band | 2/3, 6x, 2x, 99% numerals + sentence captions | "X now" pattern without the "now" title |
| 6 | "Why work with us" | Single wide intro paragraph | H2 + one long 16/400 paragraph | editorial breather |
| 7 | "Who we partner with" | Logo card grid, ~19 cards | Adobe, Anthropic, AWS, BlueYonder, CyberArk, Databricks, Google, Microsoft, NVIDIA, OpenAI, Oracle, Palantir, Palo Alto, SailPoint, Salesforce, SAP, ServiceNow, Snowflake, Workday | logo + one-liner + "Learn more: Accenture + <Partner>" |
| 8 | "Explore our network" | A–Z alphabetical tablist (8 tabs) + dense link columns | A-C / D-F / G-I / J-L / M-O / P-R / S-U / V-Z panels; ~50 links per panel | directory-as-typography, radius-0 tabs 24/500 |
| 9 | "Accenture in the news" | News carousel | 5 dated items (June 16 → March 17, 2026) with H3 headlines; Play/Previous/Next | kicker "Accenture in the news"; Play/Pause motion control |
| 10 | Careers banner | Full-width band | H2 "Careers" + "Join our team of over 10,000 platform engineers…" + "Search open roles" CTA | stat woven into sentence |
| 11 | "Related capabilities" | Simple link list | Cloud / Data and AI / Managed Services / Technology transformation | |
| 12 | "Ecosystem partner FAQs" | Accordion | "What's the difference between an ecosystem partner and a vendor / supplier?" + more | 16/400 expander buttons, hairline border rgb(162,162,160) |
| 13 | Footer | Link lists on black | logo, Preference Center/Careers/About Us/Contact Us/Locations/Sitemap, legal row, © 2026 | identical mega-footer |

## Typography tokens (computed)
| Element | Family | Size (px) | Weight | Line-height | Tracking | Notes |
|---|---|---|---|---|---|---|
| H1 | Graphik | 60 | 500 | 69 | −1.8px | white |
| Serif standfirst (hero H2) | GT Sectra Fine | 24 | 300 | 30 | normal | |
| Section H2 ("Why you need…", "Who we partner with") | Graphik | 48 | 500 | 57.6 | −1.44px | |
| H3 (card/news/FAQ headlines) | Graphik | 24 | 500 | 31.2 | −0.48px | smaller card tier than DEM page |
| Stat numeral | Graphik | 48 | 500 | — | −1.44px | 2/3, 6x, 2x, 99% |
| Body | Graphik | 16 | 400 | 24 | normal | white |
| A–Z tab | Graphik | 24 | 500 | — | normal | radius 0 |
| Button label | Graphik | 16 | 500 | — | normal | |

## Color & surface tokens
| Role | Value (hex/rgb) | Where used |
|---|---|---|
| Page canvas | #000 | whole page |
| Text | rgb(255,255,255) | all type |
| Sub-nav band | rgb(70,0,115) #460073 | anchor rail |
| Hairline border | rgb(162,162,160) | FAQ expander buttons |
| Card surfaces | transparent / logo-on-black | partner cards carry no tile fill |

## Component patterns
- Careers CTA: 52px tall, padding 0 24px, radius 0, transparent, white 16/500 "Search open roles".
- Carousel chips: 48×48, radius 0 (news Previous/Next); event carousel adds pause + prev/next.
- Partner card: logo + 16px one-liner + quiet "Learn more: Accenture + <Partner>" link; no border, no fill.
- A–Z tablist: 8 radius-0 tabs, 24/500, selected state, dense multi-column link panels.
- FAQ accordion: 16/400 full-width buttons with 1px gray hairline, aria-expanded.
- Purple sub-nav identical to sibling pages (52px, #460073).

## Interaction patterns
- Auto-advancing "Upcoming events" carousel with pause/prev/next (motion control exposed).
- News carousel with Play/Pause + 48×48 square chips.
- A–Z tab panels swap the directory listing in place.
- FAQ accordions toggle (aria-expanded).
- Header static; only the purple anchor rail persists (Key partners / All partners / Careers / Related capabilities).

## Copy & content strategy
- H1 noun-pair; serif standfirst carries the thesis: "Reinvention doesn't happen in a silo."
- Stats are multipliers, not dollars: 2/3, 6x, 2x, 99% — the ecosystem-as-leverage story.
- Partner blurbs are single-sentence value propositions; CTA aria-labels pair the brands ("Accenture + NVIDIA").
- Careers copy embeds the stat: "Join our team of over 10,000 platform engineers and experts."
- FAQ pre-empts taxonomy objections (partner vs vendor/supplier) — content strategy answering sales questions.
- Kicker "Accenture in the news" types the section before items appear; news items dated June→March 2026, partner-led headlines.

## Premium moves (what makes it feel billion-dollar)
- Same invariant token set as every service page — H1 60/500/−1.8, H2 48/500/−1.44, GT Sectra 24/300 — proving a real design system, not page-level styling.
- An A–Z directory rendered as pure typography on black: hundreds of links, zero boxes, zero borders.
- Auto-playing event carousel with a visible Pause — restraint as a control surface.
- Multiplier stats (6x, 2x, 99%) instead of vanity numbers.
- Brand-pair CTA labeling ("Accenture + NVIDIA") — partnership grammar inside the aria-label.
- Hairline-only FAQ affordance (1px rgb(162,162,160)) — quietest possible expander.
- Careers stat woven into prose ("over 10,000 platform engineers"), never a stat tile.
- Radius 0 everywhere, including the 8-tab index.

## Translations for RMIS (recruitment app)
- A–Z radius-0 tablist → alphabetical directories (positions, departments, client accounts).
- Auto-playing/pausable promo carousel → announcement rail for hiring events and open houses.
- "Accenture in the news" dated headline carousel → hiring updates/activity feed with genre kicker.
- Brand-pair link grammar ("Accenture + NVIDIA") → pairing labels for roles+teams ("RMIS + Engineering").
- Hairline FAQ accordion → candidate FAQ / policy expanders.
- Careers band with embedded headcount stat → "Join 10,000+ platform engineers"-style hiring CTA on every page.
