"use client";

// ============================================================================
// PageIntro — the Swiss page-header entrance, shared by EVERY page.
//
// The frontpage opens with a choreographed entrance (eyebrow fades up →
// title slides out of a clip mask → description fades). This component
// gives every applicant-facing page that exact same opening beat, so
// navigating between pages feels like one continuous product instead of
// different pages glued together (cohesion = premium).
//
// Usage:
//   <PageIntro eyebrow="01. Open Positions" title="Find Your Future"
//              description="Browse plantilla positions..." />
//
// - Eyebrow: gold uppercase kicker, fades up first (0ms).
// - Title: masked slide-up (y 110% → 0 inside overflow-hidden), the
//   signature reveal from the hero.
// - Description: fades up last.
// - Plays ON MOUNT (page headers are above the fold — whileInView would
//   fire immediately anyway and adds a frame of invisible content).
// - Reduced motion → everything renders instantly.
// ============================================================================

import * as React from "react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

type PageIntroProps = {
  /** gold kicker line, e.g. "01. Open Positions" */
  eyebrow: string;
  /** main page title (rendered huge, bold sentence case, tight) */
  title: string;
  /** optional supporting line under the title */
  description?: string;
  /** right-side slot (counters, chips, actions) — revealed last */
  actions?: React.ReactNode;
  className?: string;
  /** start delay in seconds (use when something above plays first) */
  delay?: number;
};

export function PageIntro({
  eyebrow,
  title,
  description,
  actions,
  className,
  delay = 0,
}: PageIntroProps) {
  const reduced = useReducedMotion();

  const head = (
    <div>
      <motion.p
        initial={reduced ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay, ease: EASE }}
        className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E8A317]"
      >
        {eyebrow}
      </motion.p>

      {/* Masked title — the signature hero reveal */}
      <div className="mt-3 overflow-hidden">
        <motion.h1
          initial={reduced ? false : { y: "110%" }}
          animate={{ y: "0%" }}
          transition={{ duration: 0.8, delay: delay + 0.1, ease: EASE }}
          className="text-4xl font-extrabold leading-[1.02] tracking-tight text-[#112E81] sm:text-5xl lg:text-6xl"
        >
          {title}
        </motion.h1>
      </div>

      {description && (
        <motion.p
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: delay + 0.35, ease: EASE }}
          className="mt-4 max-w-2xl text-sm font-medium leading-relaxed text-[#112E81]/90 sm:text-base"
        >
          {description}
        </motion.p>
      )}
    </div>
  );

  return (
    <div className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${className ?? ""}`}>
      {head}
      {actions && (
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: delay + 0.45, ease: EASE }}
          className="flex-shrink-0"
        >
          {actions}
        </motion.div>
      )}
    </div>
  );
}
