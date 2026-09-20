"use client";

// ============================================================================
// 05. FACILITIES — Our Centers (premium showcase).
// Soft-card treatment:
// - Scroll-in: image clip-path curtain reveal (bottom→top) + staggered text fade/slide
// - Hover: image scale + gold shine sweep + square card
// - Mobile: compact HORIZONTAL layout (image left, text right) to save vertical space
// - Desktop: vertical layout (image top, text bottom)
// The FACILITIES data, the activeFacility single-open state and the global
// Escape effect live HERE — only this section consumes them.
// ============================================================================

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { motion } from "motion/react";

// The three flagship centers. `descriptionImage` is the full infographic
// shown by the in-card slide-up panel when a card is clicked.
const FACILITIES = [
  {
    num: "01",
    name: "AMCEN",
    title: "Advanced Manufacturing Center",
    tag: "Center",
    welcome: "The first Advanced Manufacturing Center in the Philippines.",
    desc: "Driving technical readiness, business sophistication, and innovation through emerging technologies.",
    image: "/hero-sidebar-image2.jpg",
    descriptionImage: "/rmis-sidebar-image2-description.png",
  },
  {
    num: "02",
    name: "AMERIAL",
    title: "Advanced Mechatronics, Robotics & Industrial Automation Laboratory",
    tag: "Laboratory",
    welcome: "The country\u2019s premier Industry 4.0 facility of DOST-MIRDC.",
    desc: "Empowering industries, MSMEs, and academe with mechatronics, robotics, and automation solutions.",
    image: "/hero-sidebar-image1.jpg",
    descriptionImage: "/rmis-sidebar-image1-description.png",
  },
  {
    num: "03",
    name: "MTSC",
    title: "Mold Technology Support Center",
    tag: "Center",
    welcome: "A cutting-edge facility in General Trias, Cavite.",
    desc: "Bolstering die and mold technologies and equipping local manufacturers for global competitiveness.",
    image: "/hero-sidebar-image3.jpg",
    descriptionImage: "/rmis-sidebar-image3-description.png",
  },
];

export function FacilitiesSection() {
  // Which card's description panel is slid open. The reveal happens IN-CARD
  // (Accenture-front-page slide-up): the description appears exactly where the
  // card sits. Click the card again or press Escape anywhere to slide the
  // panel back down.
  const [activeFacility, setActiveFacility] = useState<string | null>(null);

  // Global Escape closes the open panel. No page freeze — the reveal is
  // in-card, so the rest of the page stays live and scrollable.
  useEffect(() => {
    if (!activeFacility) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveFacility(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeFacility]);

  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto max-w-[1400px] 2xl:max-w-[1680px] px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-24">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6 border-b border-border pb-8 sm:mb-12">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Facilities</p>
            <h2 className="mt-3 text-4xl font-medium tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Our centers
            </h2>
          </div>
          <p className="hidden max-w-xs text-right text-sm leading-relaxed text-muted-foreground sm:block">
            Three flagship facilities driving Philippine industry forward — click a card for the full description
          </p>
        </div>
        {/* Facility cards — click a card and a white description panel
            SLIDES UP over it in place (Accenture-front-page treatment):
            gold leading strip → navy identity strip → full-width
            description infographic. Click the card again / Escape to
            slide it back down — no close button needed. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          {FACILITIES.map((facility, i) => {
            const isOpen = activeFacility === facility.name;
            return (
            <motion.article
              key={facility.name}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.12, delayChildren: i * 0.12 } },
              }}
              whileHover="hovered"
              onClick={() => setActiveFacility(isOpen ? null : facility.name)}
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              aria-label={
                isOpen
                  ? `Collapse ${facility.name} — hide facility description`
                  : `${facility.name} — ${facility.title}. View facility description.`
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActiveFacility(isOpen ? null : facility.name);
                }
              }}
              /* soft card that grows in sync with the panel slide (same 700ms
                 house easing) so card + panel move as ONE assembly on <lg;
                 desktop cards are already tall enough. */
              className={`group relative flex cursor-pointer flex-row overflow-hidden rounded-none border border-border bg-card [transition:min-height_700ms_cubic-bezier(0.22,1,0.36,1),border-color_300ms_ease] hover:border-primary/30 motion-reduce:[transition:none] lg:flex-col ${
                isOpen ? "max-lg:min-h-[26rem]" : ""
              }`}
            >
              {/* Image — compact on mobile (left, 40% width), full-width on desktop (top). */}
              <motion.div
                variants={{
                  hidden: { clipPath: "inset(100% 0 0 0)" },
                  visible: {
                    clipPath: "inset(0% 0 0 0)",
                    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
                  },
                }}
                className="relative w-2/5 flex-shrink-0 overflow-hidden lg:w-full lg:aspect-[4/3]"
              >
                <motion.img
                  src={facility.image}
                  alt={facility.name}
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{ filter: "grayscale(15%)" }}
                  variants={{ hidden: { scale: 1 }, visible: { scale: 1 }, hovered: { scale: 1.1 } }}
                  transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                />
                {/* Dark gradient overlay for badge legibility */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/20" />
                {/* Number badge */}
                <span className="absolute left-2 top-2 z-10 rounded-none bg-moss/90 px-2.5 py-1 text-[10px] font-medium text-parchment backdrop-blur-sm sm:left-4 sm:top-4 sm:px-3 sm:text-xs">
                  {facility.num}
                </span>
                {/* Tag chip */}
                <span className="absolute right-2 top-2 z-10 rounded-none border border-[#c9903d]/50 bg-moss/85 px-2.5 py-1 text-[10px] font-medium text-[#c9903d] backdrop-blur-sm sm:right-4 sm:top-4 sm:text-[11px]">
                  {facility.tag}
                </span>
                {/* Expansion affordance — gold DETAILS chip */}
                <span className="absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-[4px] bg-[#c9903d] px-2.5 py-1 text-[10px] font-medium text-obsidian sm:bottom-4 sm:right-4 sm:text-[11px]">
                  Details
                  <Plus className="h-3 w-3" strokeWidth={3} />
                </span>
              </motion.div>

              {/* Text content — always visible, compact on mobile */}
              <motion.div
                variants={{
                  hidden: { opacity: 0, y: 16 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
                }}
                className="flex flex-1 flex-col p-3 sm:p-5 lg:p-8"
              >
                <h3 className="text-lg font-medium tracking-tight text-foreground sm:text-2xl">
                  {facility.name}
                </h3>
                <p className="mt-1 text-xs font-medium leading-snug text-muted-foreground sm:text-sm">
                  {facility.title}
                </p>
                {/* Gold underline — draws in on scroll, grows on hover */}
                <motion.div
                  variants={{
                    hidden: { scaleX: 0 },
                    visible: { scaleX: 1, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
                    hovered: { width: "100%" },
                  }}
                  className="mt-2 h-0.5 w-10 origin-left rounded-full bg-[#c9903d] sm:mt-4 sm:w-12"
                />
                {/* Welcome tagline (gold-tint ink) */}
                <p className="mt-2 text-xs font-semibold leading-snug text-gold sm:mt-4 sm:text-sm">
                  {facility.welcome}
                </p>
                {/* Short description */}
                <p className="mt-1.5 text-xs leading-relaxed text-foreground/80 sm:mt-3 sm:text-sm">
                  {facility.desc}
                </p>
              </motion.div>

              {/* SLIDE-UP REVEAL — Accenture-front-page treatment. A white
                   description panel rises over the card behind a gold leading
                   strip: navy identity strip → full-width description
                   infographic. Click again / Escape slides it back down. */}
              <div
                aria-hidden={!isOpen}
                className={`absolute inset-0 z-20 flex flex-col bg-card transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                  isOpen ? "translate-y-0" : "translate-y-full"
                }`}
              >
                {/* Gold leading strip */}
                <div className="h-1 w-full shrink-0 bg-[#c9903d]" />
                {/* Navy identity strip */}
                <div
                  className={`shrink-0 bg-moss px-4 py-3 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:px-6 sm:py-4 ${
                    isOpen ? "translate-y-0 opacity-100 delay-150" : "translate-y-3 opacity-0"
                  }`}
                >
                  <p className="text-sm font-medium leading-none tracking-tight text-parchment sm:text-base">
                    {facility.name}
                  </p>
                  <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#c9903d] sm:text-[11px]">
                    {facility.title}
                  </p>
                </div>
                {/* Description infographic — full card width (never boxed
                     small); scrolls only if taller than the card. */}
                <div
                  className="min-h-0 flex-1 overflow-y-auto bg-card [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-parchment/25 [&::-webkit-scrollbar-track]:bg-transparent"
                  data-lenis-prevent
                >
                  <img
                    src={facility.descriptionImage}
                    alt={`${facility.name} — full facility description`}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className={`h-auto w-full select-none transition-opacity duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                      isOpen ? "opacity-100 delay-300" : "opacity-0"
                    }`}
                  />
                </div>
              </div>

              {/* Premium gold shine sweep — passes across card on hover.
                   Driven by the parent article's `whileHover="hovered"` variant. */}
              <motion.div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-30 bg-gradient-to-r from-transparent via-[#c9903d]/25 to-transparent"
                variants={{
                  hidden: { x: "-100%" },
                  visible: { x: "-100%" },
                  hovered: { x: "100%" },
                }}
                transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
              />
            </motion.article>
            );
          })}
        </div>

      </div>
    </section>
  );
}
