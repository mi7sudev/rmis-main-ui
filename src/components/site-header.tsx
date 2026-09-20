"use client";

// ============================================================================
// SiteHeader — the unified topbar shared across the public landing, jobs
// board, and sign-in / sign-up pages. Accenture design language: black
// canvas bar, hairline border, sharp primary CTA — no glass shadow, no pill.
//
// Premium scroll behavior:
//   - On scroll > 40px the header CONDENSES: smaller padding, the logos
//     shrink slightly, the blur deepens. Depth comes from the hairline
//     border, never a drop shadow.
//   - The whole header is `sticky top-0` so it stays anchored.
//   - The "Positions" link keeps its text-swap hover (blue-tint ink); the
//     Sign in / Dashboard CTA is a sharp electric-blue block.
//   - Reduced motion → instant transition (no spring, no blur animation).
//
// Mobile responsiveness:
//   - Brand (logo), the theme toggle and the Sign in / Dashboard CTA stay
//     PINNED; the primary links row ("Positions", …) lives in its own
//     horizontally scrollable strip (min-w-0 + overflow-x-auto, scrollbar
//     hidden) so it can never blow out the page or hide behind sm:block.
//     Same pattern as the profile view's 01-07 section chips.
// ============================================================================

import { useNav } from "@/components/nav-provider";
import { useSession } from "@/components/session-provider";
import { homeViewForRole } from "@/config/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

export function SiteHeader() {
  const { navigate, view } = useNav();
  const { user } = useSession();
  const reduced = useReducedMotion();

  // On the jobs board, hide the Positions link — the user is already there.
  const onJobs = view === "jobs";

  // Condense-on-scroll state.
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => {
    setScrolled(y > 40);
  });

  const logoH = scrolled ? "h-9 sm:h-11" : "h-10 sm:h-14";

  return (
    <motion.header
      initial={reduced ? false : { y: "-100%" }}
      animate={{ y: "0%" }}
      transition={reduced ? { duration: 0 } : { duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={`sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-xl transition-[padding] duration-300 ${
        scrolled ? "py-0.5" : "py-1.5"
      }`}
    >
      <div className="mx-auto flex max-w-[1400px] 2xl:max-w-[1680px] items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate(user ? homeViewForRole(user.role) : "home")}
          className="flex items-center"
          aria-label="RMIS home"
        >
          <span className="flex shrink-0 items-center rounded-none bg-white px-2.5 py-1.5 sm:px-3 sm:py-2">
            <img
              src="/MIRDC.png"
              alt="MIRDC"
              className={`${logoH} w-auto object-contain transition-all duration-300`}
            />
          </span>
        </button>
        {/* Right cluster — pinned utilities + scrollable links + pinned CTA.
            min-w-0 lets the strip shrink instead of stretching the page. */}
        <div className="flex min-w-0 flex-nowrap items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <nav
            aria-label="Primary"
            className="flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {!onJobs && (
              <button
                onClick={() => navigate("jobs")}
                className="group relative inline-flex min-h-11 shrink-0 items-center overflow-hidden px-3 text-sm font-medium text-foreground/70 transition-colors hover:text-foreground"
              >
                <span className="block transition-transform duration-200 group-hover:-translate-y-full">Positions</span>
                <span className="absolute inset-0 flex items-center px-3 text-brand-light transition-transform duration-200 group-hover:translate-y-0">Positions</span>
              </button>
            )}
          </nav>
          {user ? (
            <button
              onClick={() => navigate(homeViewForRole(user.role))}
              className="group inline-flex h-11 shrink-0 items-center gap-1.5 rounded-none bg-primary px-5 text-sm font-medium text-white transition-colors hover:bg-[#0E7ABF] active:opacity-60"
            >
              Dashboard
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
          ) : (
            <button
              onClick={() => navigate("signin")}
              className="group inline-flex h-11 shrink-0 items-center gap-1.5 rounded-none bg-primary px-5 text-sm font-medium text-white transition-colors hover:bg-[#0E7ABF] active:opacity-60"
            >
              Sign in
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
          )}
        </div>
      </div>
    </motion.header>
  );
}
