# RAW AUDIT NOTES — Task 15-d (Accenture services group 3)
Session: agent-browser --session audit-d | viewport set 1440x900, actual innerWidth/innerHeight 1440x757
Environment note: 4GB box, 4 parallel browser sessions; heavy pages crash renderers → used `network route **/* --abort --resource-type media` to block videos and retried loads until stable.

## PAGE 1 — Emerging Technology (https://www.accenture.com/en/services/emerging-technology)
Consent: OneTrust banner present → clicked #onetrust-accept-btn-handler once. docHeight 6480px. Dark theme page.
Screenshots: audit-svc3-emerging-technology-1-top.png, -2-intro-stats, -3-reinvent, -4-trending, -5-awards, -6-leader, -7-footer (7 shots)

Section inventory (top→bottom):
1. Header nav (transparent over black hero; white text; static, not sticky in DOM test) + rad-subnav-bar 0 80px pad
2. Hero: black bg, H1 "Emerging technology solutions" white
3. Serif intro statement: H2 GT Sectra Fine 24px/300 "In a rapidly changing world, embrace emerging technology to transform..."
4. Stats band (rad-absorb-stats): 4 stats 96% / 95% / 93% / 83% + captions ("of executives agree that the convergence of digital and physical worlds…")
5. "Reinvent with emerging technology" — 8-card mosaic (rad-mosaic-2--8-card, 2-up 624px cards): kicker + H3 + body + Learn more; some cards embed stat (76% of CEOs…, 68% robotics, 71% AR shoppers)
   Kickers: QUANTUM SECURITY, BIOINNOVATION, SPACE TECH, MATERIAL SCIENCE, BLOCKCHAIN & WEB3, INDUSTRIAL SPATIAL COMPUTING, ROBOTICS, CONSUMER SPATIAL COMPUTING
6. "How to innovate" — tab list (8 role=tab): Research and development (expanded w/ body), Incubation services, Delivery, Consulting services
7. "What's trending with emerging technology" + "View all work" — flickity carousel of content-grid-cards, eyebrow (RESEARCH REPORT / PERSPECTIVE / CASE STUDY), title, body, "Expand" front-toggle (card flip/expand), Previous/Next square chips 48x48 radius 0
8. Awards & recognition — "Accenture named a Leader in Innovation Consulting by Forrester, Q2 2024"
9. Our leader — Adam Burden, Global Innovation Lead, LinkedIn link
10. Technology careers CTA — "Be part of shaping the future…" + "Search open roles"
11. Footer: black bg

Typography (computed):
- H1: Graphik, Arial, Helvetica, sans-serif | 60px | 500 | 69px (1.15) | -1.8px
- H2 (section): Graphik | 48px | 500 | 57.6px | -1.44px
- H2 (serif intro): "GT Sectra Fine", Palatino | 24px | 300 | 30px | normal
- H3 (card): Graphik | 32px | 500 | 38.4px | -0.64px
- Body: Graphik | 16px | 400 | 16px
- Nav link: Graphik | 16px | 400 | normal
- Eyebrow/kicker: 14px | 500 | 0.28px letter-spacing | uppercase | white
- Stats: 48px | 500 | 57.6px | -1.44px (same scale as H2)

Colors: page black #000; card surface rgb(32,32,32) #202020; text white #fff; muted gray rgb(97,97,96) #616160 (inactive tabs); footer #000.

Layout: main full-bleed 1440px; sections pad 60px 80px; card content pad 40px 40px 24px; cards 624px wide (2-col).

Components/CTAs: NO bordered buttons on this page — all CTAs are plain text links ("Learn more", "View all work", "Search open roles", "Expand", "LinkedIn"); border-radius 0 everywhere sampled; 1px transparent borders only. Carousel chips = square 48x48 transparent w/ icon.
Interactions: flickity carousel (Previous/Next), card Expand toggles (aria-expanded, 17 elements), tab list (8 tabs), hover states via CSS transitions, static header (transparent over dark hero).
Copy: lowercase-voiced H1; declarative serif intro; stat % bands + per-card inline stats with small captions; eyebrow taxonomy RESEARCH REPORT / PERSPECTIVE / CASE STUDY; CTA labels: Learn more, View all work, Expand, Search open roles.

## PAGE 2 — Finance & Risk (https://www.accenture.com/en/services/finance-risk)
Consent: none shown (carried over). Dark theme again (bodyBg #000, footer #000, card #202020). docHeight 5353.
Screenshots: audit-svc3-finance-risk-1-top … -6-footer (6 shots)
Sections: 1 subnav (rad-subnav-bar: "Finance and Risk Management" 16/500 + jump links What to do/What's trending/Partners/Leaders/Careers 14/400) | 2 hero h1 "Finance consulting" | 3 serif intro GT Sectra 24/300 | 4 absorb-stats ×4 (93%, 90%, 83%, 72% @48/500 + captions) | 5 "How to reinvent finance and risk management" mosaic 3-card (kickers ENTERPRISE PERFORMANCE MANAGEMENT / FINANCE PLATFORM TRANSFORMATION / FINANCE MANAGED SERVICES; each card embeds outcome stats: "up to 95% reporting quality", "cut data gathering 57%", "up to 50% cost") | 6 trending carousel (eyebrows RESEARCH REPORT/CASE STUDY + Expand toggles, Prev/Next) | 7 "Partners in change" partner carousel (5 partner blurbs + Learn more, Prev/Next) | 8 Awards (IDC MarketScape, Gartner MQ) | 9 "Our leaders" 4 leaders (Jason Dess, Craig Richey, Paul Prendergast, Paul Zanker + LinkedIn) | 10 careers CTA ×2 ("Finance consulting open roles", "Risk management open roles") | 11 footer black.
Typography identical to page 1: h1 60/500/69/-1.8; h2 section 48/500/57.6/-1.44; serif h2 24/300; h3 32/500/-0.64 (+24/500/-0.48 sub-variant); body 16/400/16; stats 48/500.
Layout: same full-bleed sections pad 60px 80px; subnav 0 80px; mosaic-2--3-card.
Interactions: 2 carousels (4 flickity buttons = Prev/Next ×2), 11 Expand/aria-expanded toggles, anchor subnav.
Copy: same eyebrow taxonomy; CTA labels Learn more / Expand / open roles; stat-heavy cards.

## PAGE 3 — Infrastructure & Capital Projects (https://www.accenture.com/en/services/infrastructure-capital-projects)
Consent: OneTrust reappeared → accepted once. Dark theme (body #000, footer #000). docHeight 11136 (longest).
Screenshots: audit-svc3-infrastructure-capital-projects-1-top … -9-footer (9 shots)
Sections: 1 subnav (What's changing/What you can do/What you'll achieve/What's trending) | 2 hero h1 "Infrastructure and Capital Projects" | 3 serif intro 24/300 | 4 "Why reinvent capital projects?" + rad-stat-helper: "DATA" label, accordion with big stat "9 of 10" (construction projects have cost overruns…) | 5 "How AI is changing infrastructure…" banner-image-and-text | 6 "What you can do" rad-mega-accordion (7 triggers: Align and manage capital project portfolios… / Develop and optimize… / Deliver higher-performing… / Prepare for a smooth transition… / Design a strategy and operating model… / Use data, digital and AI… / Integrate sustainability…) | 7 "What you'll achieve" carousel of 8 outcome cards (Projects delivered with desired outcomes / A safer, more efficient worksite / Stronger synergy with contractors / A supply chain that works for you / Decreased carbon / Stakeholder alignment / Cost control / Smarter assets) | 8 "Areas we support" rad-vertical-tabs (Data Centers selected, 200px tab col, white active text; Cities Transport & Infrastructure / Engineering construction & real estate / Utilities / Capital Projects Engineering Services) | 9 Awards (ENR #6 Top 50 Program Management, BD+C #4, ReNew Canada Platinum) | 10 trending carousel (eyebrows PERSPECTIVE/ANNOUNCEMENT/BLOG/RESEARCH REPORT + Expand) | 11 "Accelerate your journey" platform carousel (Connected Construction / Capital Projects Control Tower / Engineering Data Digitization / Generative Design and Planning / 3D Continuum Engine / Maturity Assessment / Process value analyzer) | 12 "Generative AI Agents" section — inline stat "92% of capital projects miss their targets…", "440+ criteria" | 13 partners/acquisitions carousel (Anser Advisory, BOSLAN, Comtech, IQT, ORLADE, Partners in Performance, Soben, Verum) | 14 careers CTA "Grow your careers at the heart of change / Join us" | 15 Related capabilities | 16 Our leaders ×5 (Andy Webster, Jonas Kampik, Adam Shaw, Des Bell, Mark Hilton) | footer.
Typography: identical core (h1 60/500/69/-1.8; section h2 48/500/-1.44; serif 24/300; body 16/400) + NEW 40px/500/-1.2px capability-h2 tier. Accordion triggers 16px white radius 0.
Colors: black page; PURPLE ACCENT rgb(161,0,255) (rad-icon) + dark purple surface rgb(49,0,81) (rad-stat-helper container); footer #000.
Layout: full-bleed, 60px 80px section pad, subnav 0 80px, vertical-tabs tab col 200px.
Interactions: 4 carousels (8 flickity buttons), mega-accordion (18 aria-expanded), vertical tabs (10 role=tab), stat accordion ("Toggle accordion"), Expand card toggles.
Copy: eyebrow taxonomy + ANNOUNCEMENT/BLOG variants; big-fraction stat "9 of 10"; platform product naming (Control Tower, 3D Continuum Engine); CTA Learn more / Join us.

## PAGE 4 — Learning / LearnVantage (https://www.accenture.com/en/services/learning)
Consent: none. Dark theme (body #000, cards #202020, footer #000). docHeight 6996.
Screenshots: audit-svc3-learning-1-top … -6-footer (6 shots)
Sections: 1 subnav (Our vision / What you need to do / What's trending / Careers) | 2 hero h1 "Digital learning solutions" (LearnVantage brand) + video hero w/ Pause control | 3 serif intro 24/300 "Become a talent creator…" | 4 "Enable people resilience" Read more | 5 "Why reinvent learning?" absorb-stats ×4 ($10.3T economic value / 61% retraining by 2027 / 94% ready to learn / 5% reskilling at scale) | 6 "How to reinvent learning" mosaic-2 5-card (kickers TALENT TRANSFORMATION & SKILLING / LEARNING MANAGED SERVICES / LEARNVANTAGE ACADEMIES / LEARNVANTAGE PLATFORM / CERTIFICATIONS) | 7 trending carousel (CASE STUDY / RESEARCH REPORT + Expand, Prev/Next, "View all work") | 8 "Partners in change" acquisitions carousel (Ascendient Learning, TalentSprint, Award Solutions, Udacity) | 9 "Accenture news" dated list (Oct 15 2025 … Feb 12 2025) with Play control + carousel | 10 "Our leaders" ×4 (Kishore Durg, Kai Roemmelt, Majd Sakr, Swati Sharma + LinkedIn) | 11 careers CTA "Search open roles" | footer.
Typography: identical core system (h1 60/500/69/-1.8; h2 48/500/57.6/-1.44; serif 24/300; h3 32/500/-0.64 + 24/500/-0.48; body 16/400; stats 48/500).
Header nav: mega-menu (What we do → 18 services), 14px top-level, 16px items, radius 0 everywhere, hover transition 0.05s background-color.
Interactions: video hero Pause, 3 carousels (6 flickity buttons), 12 Expand toggles, mega-menu.
Copy: eyebrow taxonomy CASE STUDY/RESEARCH REPORT; stat band incl. $10.3T big-fraction; dated news list; CTA Learn more / Read more / Expand / View all work / Search open roles / Join us.

## CROSS-PAGE PATTERNS
- One design system ("rad") across all 4 pages: identical type scale, 60/80 section padding, 0 border-radius, black theme.
- Type scale: 60/48/40/32/24/16/14; weight 500 display (medium, not bold); serif GT Sectra Fine 24/300 for intro statements; tracking -1.8/-1.44/-1.2/-0.64/-0.48/-0.28px.
- Page formula: subnav(anchor jumps) → hero h1 → serif intro → stat band (3-4 stats) → capability mosaic w/ kickers → carousel(s) of insights w/ Expand → partners/acquisitions → awards → leaders + LinkedIn → careers CTA → black footer.
- Eyebrow taxonomy: RESEARCH REPORT / CASE STUDY / PERSPECTIVE / BLOG / ANNOUNCEMENT + service kickers.
- Stats: 48px medium, tight tracking, one per card or 4-up band; big fractions ("9 of 10", "$10.3T").
- Interactions: flickity carousels w/ 48×48 square Prev/Next chips; card Expand flip/expand; mega-accordion; vertical tabs; mega-menu.
- Color: 99% monochrome black/white (#000, #202020 surfaces, #616160 muted); single purple accent rgb(161,0,255) + rgb(49,0,81) tint on page 3.
- No bordered/filled buttons: text-link CTAs (Learn more / Expand / Search open roles); radius 0 everywhere sampled.
