"use client";

// ============================================================================
// Reveal — the single consistent scroll-reveal pattern for the whole site.
//
// Award-winning sites use ONE reveal language everywhere, not a mix of
// clip-paths, glitches, and particles. This is that language: a clean
// opacity (0→1) + y (24px→0) with the shared expo-out easing [0.22, 1, 0.36, 1]
// and optional stagger. Apply this to any block that should enter on scroll.
//
// - `delay` shifts the start (seconds).
// - `stagger` (children mode) staggers direct children by N seconds each.
// - `y` controls the rise distance (default 24px).
// - `once` (default true) — don't re-trigger on scroll-back.
// - Reduced-motion → children render immediately, no transform.
// ============================================================================

import * as React from "react";
import { motion, type Variants } from "motion/react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  /** delay before the reveal starts (seconds) */
  delay?: number;
  /** rise distance in px */
  y?: number;
  /** stagger direct children by this many seconds (enables stagger mode) */
  stagger?: number;
  once?: boolean;
  margin?: string;
  as?: React.ElementType;
};

export function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
  stagger,
  once = true,
  margin = "-60px",
  as: Tag = "div",
}: RevealProps) {
  const reduced = useReducedMotion();

  if (reduced) {
    return <Tag className={className}>{children}</Tag>;
  }

  // Stagger mode — orchestrate direct children.
  if (stagger !== undefined) {
    const container: Variants = {
      hidden: {},
      visible: { transition: { staggerChildren: stagger, delayChildren: delay } },
    };
    const item: Variants = {
      hidden: { opacity: 0, y },
      visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
    };
    return (
      <motion.div
        className={className}
        variants={container}
        initial="hidden"
        whileInView="visible"
        viewport={{ once, margin }}
      >
        {/* Wrap children so each gets the item variant. We use a helper that
            clones each child with the motion variant. */}
        {React.Children.map(children, (child) => {
          if (!React.isValidElement(child)) return child;
          return (
            <motion.div variants={item} style={{ display: "contents" }}>
              {child}
            </motion.div>
          );
        })}
      </motion.div>
    );
  }

  // Single-block reveal.
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin }}
      transition={{ duration: 0.6, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
