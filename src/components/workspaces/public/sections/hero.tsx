"use client";

// ============================================================================
// 01. HERO — asymmetric 8/4, agency header + RMIS.
// Accenture-inspired editorial header:
// - Eyebrow: "01 · Recruitment platform" (gold-tint ink)
// - Agency block (3 lines, fits the 8-col lead):
//     · "Republic of the Philippines" (small, muted)
//     · "Metals Industry Research and Development Center" (BOLD)
//     · "Department of Science and Technology" (small, muted)
// - H1: "RMIS" (navy accent)
// - Subtitle: "Build a career that moves the nation forward."
// - Primary CTA (navy pill)
// Lead column: soft gradient wash + PixelSwap description card.
// Sidebar column (4): FacilityShowcase + full-width showcase image.
// ============================================================================

import { useNav } from "@/components/nav-provider";
import { useSession } from "@/components/session-provider";
import { useRef } from "react";
import { ArrowRight } from "lucide-react";
import { motion, useScroll, useTransform } from "motion/react";
import { FacilityShowcase } from "@/components/ui/facility-showcase/facility-showcase";
import PixelSwap from "@/components/ui/pixel-swap/pixel-swap";
import { SplitText } from "@/components/ui/motion/split-text";
import { MagneticButton } from "@/components/ui/motion/magnetic-button";
import { FadeImage } from "@/components/ui/motion/fade-image";

export function HeroSection() {
  const { navigate } = useNav();
  const { user } = useSession();

  // Hero parallax — the grid-pattern bg drifts down at 0.4x scroll rate while
  // the agency block drifts up at 0.15x, producing layered depth as the hero
  // leaves the viewport. Targeted on the hero <section> ref so it only moves
  // while the hero is actually on screen.
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const bgY = useTransform(heroProgress, [0, 1], ["0%", "40%"]);
  const contentY = useTransform(heroProgress, [0, 1], ["0%", "-15%"]);
  const contentOpacity = useTransform(heroProgress, [0, 0.8], [1, 0]);

  return (
    <section ref={heroRef} className="border-b border-border">
      <div className="mx-auto max-w-[1400px] 2xl:max-w-[1680px]">
        <div className="grid lg:grid-cols-12">
          {/* Lead column (8) — with soft gradient wash */}
          <div className="relative overflow-hidden lg:col-span-8 lg:border-r lg:border-border">
            {/* Parallax wash layer — drifts DOWN as the hero scrolls away,
                 giving the lead column real depth behind the content. */}
            <motion.div
              aria-hidden
              style={{ y: bgY }}
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-secondary/70 via-transparent to-transparent opacity-70"
            />
            <motion.div
              style={{ y: contentY, opacity: contentOpacity }}
              className="relative z-10 px-4 py-10 sm:px-8 sm:py-14 lg:px-12 lg:py-16"
            >
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-[#8A6210]"
              >
                Recruitment platform
              </motion.p>

              {/* Agency block — masked word-by-word reveal (premium) */}
              <div className="flex flex-col">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:text-sm lg:text-base">
                  Republic of the Philippines
                </p>
                {/* Masked reveal — each word slides up from behind a clip mask */}
                <h1 className="mt-1 text-2xl font-medium leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                  <SplitText
                    as="span"
                    delay={0.15}
                    stagger={0.07}
                    margin="-40px"
                  >
                    Metals Industry Research and Development Center
                  </SplitText>
                </h1>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:text-sm lg:text-base">
                  Department of Science and Technology
                </p>
              </div>

              {/* H2 — RMIS, navy accent. Single huge word with a masked reveal. */}
              <div className="mt-5 overflow-hidden">
                <motion.h2
                  initial={{ y: "110%" }}
                  animate={{ y: "0%" }}
                  transition={{ duration: 0.9, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="text-6xl font-medium leading-[0.9] tracking-tight text-[#112E81] sm:text-7xl lg:text-[6.5rem]"
                >
                  RMIS
                </motion.h2>
              </div>

              {/* Subtitle — masked reveal */}
              <h3 className="mt-6 text-lg font-medium leading-snug tracking-tight text-[#112E81] sm:text-2xl lg:text-3xl">
                <SplitText as="span" delay={0.7} stagger={0.05} margin="-40px">
                  Build a career that moves the nation forward.
                </SplitText>
              </h3>

              {/* Primary CTA — magnetic pull toward cursor */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.9, ease: [0.22, 1, 0.36, 1] }}
                className="mt-8"
              >
                <MagneticButton strength={0.25}>
                  <button
                    onClick={() => navigate(user ? "jobs" : "signin")}
                    className="group inline-flex h-12 items-center justify-between gap-3 rounded-none bg-[#112E81] px-6 text-sm font-medium text-white transition-colors hover:bg-[#0D2468] sm:px-8"
                  >
                    {user ? "Browse positions" : "Find opportunities"}
                    <ArrowRight className="size-5 transition-transform duration-200 group-hover:translate-x-1" />
                  </button>
                </MagneticButton>
              </motion.div>

              {/* PixelSwap description — Accenture editorial × React Bits.
                   Hover to pixelate-swap between the RMIS description and a
                   premium reveal. Navy canvas, white ink, gold accent. */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 1.05, ease: [0.22, 1, 0.36, 1] }}
                className="mt-8"
              >
                <PixelSwap
                  firstContent={
                    <div className="flex h-full w-full flex-col justify-center bg-[#112E81] px-5 py-6 sm:px-8 sm:py-8">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E8A317]">
                        About RMIS
                      </p>
                      <p className="mt-3 text-xs font-medium leading-relaxed text-white/85 sm:text-sm lg:text-base">
                        RMIS connects talented professionals with opportunities at the
                        Metals Industry Research and Development Center. Apply for
                        positions, track your application, and join a team advancing
                        Philippine industry.
                      </p>
                    </div>
                  }
                  secondContent={
                    <div className="flex h-full w-full flex-col justify-center bg-[#E8A317] px-5 py-6 sm:px-8 sm:py-8">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#112E81]">
                        Recruitment Management
                      </p>
                      <p className="mt-3 text-lg font-medium leading-tight tracking-tight text-[#112E81] sm:text-2xl lg:text-3xl">
                        Apply.<br />Track.<br />Advance.
                      </p>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#112E81]/90">
                        & Information System
                      </p>
                    </div>
                  }
                  pixelSize={64}
                  gap={0}
                  pixelRadius={0}
                  pixelSpin={0}
                  pixelScale={0.35}
                  duration={1400}
                  pixelDuration={450}
                  pattern="random"
                  randomness={0}
                  fade
                  trigger="hover"
                  aspectRatio="16 / 5"
                  className="overflow-hidden rounded-none border border-border"
                />
              </motion.div>
            </motion.div>
          </div>
          {/* Sidebar column (4) — FlowingMenu facility showcase + image */}
          <aside className="flex flex-col bg-[#F8FAFC] lg:col-span-4">
            <div className="px-4 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#8A6210]">
                Explore facilities
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                DOST-MIRDC operates world-class research and manufacturing centers across the Philippines.
              </p>
            </div>
            {/* FacilityShowcase — premium hero sidebar.
                 Shared crossfading background + spring flex-grow list +
                 cursor parallax. Replaces FlowingMenu for smoothness. */}
            <div className="flex-1 border-t border-border">
              <FacilityShowcase items={[
                {
                  text: "AMERIAL",
                  subtitle: "Robotics & Automation",
                  description: "The Philippines' premier facility for advancing Industry 4.0 technologies — empowering local industries, MSMEs, and academia through digital transformation.",
                  tag: "Lab",
                  location: "DOST Compound, Taguig",
                  ctaLabel: "Discover the lab",
                  image: "/hero-sidebar-image1.jpg",
                },
                {
                  text: "AMCEN",
                  subtitle: "Advanced Manufacturing",
                  description: "The first Advanced Manufacturing Center in the Philippines — increasing the country's technical readiness and innovation rating through emerging technologies.",
                  tag: "Center",
                  location: "DOST Compound, Taguig",
                  ctaLabel: "Tour the center",
                  image: "/hero-sidebar-image2.jpg",
                },
                {
                  text: "MTSC",
                  subtitle: "Mold & Die Technology",
                  description: "A cutting-edge facility in General Trias, Cavite — bolstering die and mold technologies and equipping local manufacturers with advanced capabilities.",
                  tag: "Center",
                  location: "General Trias, Cavite",
                  ctaLabel: "Explore capabilities",
                  image: "/hero-sidebar-image3.jpg",
                },
                {
                  text: "R&D DIVISIONS",
                  subtitle: "Metals, Materials & Processing",
                  description: "Metals Processing, Materials Science, and Engineering R&D divisions drive applied research, standards development, and technology transfer to Philippine industry.",
                  tag: "Division",
                  location: "Multiple sites",
                  ctaLabel: "Meet the divisions",
                  image: "/rmis-image2.jpg",
                },
              ]} />
            </div>
            {/* DOST-MIRDC showcase image — full sidebar width.
                FadeImage: dissolves in on decode + reserves 1640×856
                layout space (zero CLS → zero scroll jump). */}
            <div className="overflow-hidden border-t border-border">
              <FadeImage
                src="/rmis-image1.jpg"
                alt="DOST-MIRDC facilities showcase"
                width={1640}
                height={856}
                fetchPriority="high"
                loading="eager"
                className="h-auto w-full object-contain"
              />
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
