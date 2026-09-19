"use client"

// ============================================================================
// SplitText — masked word-by-word reveal.
//
// Premium enterprise sites (Accenture, Stripe, Apple) never fade headings in
// with plain opacity+y. Instead each WORD slides up from behind a clip mask,
// staggered — so the headline "assembles itself" as you enter the section.
//
// This component wraps children text, splits it into words, and reveals each
// word with an overflow-hidden mask + translateY slide on whileInView.
//
// - `as` controls the wrapper element (h1/h2/p/span).
// - `delay` / `stagger` tune the orchestration.
// - `once` (default true) — reveal once, don't re-trigger on scroll-back.
// - Respects reduced motion (instant + visible).
// ============================================================================

import * as React from "react"
import { motion, type Variants } from "motion/react"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

type SplitTextProps = {
  children: string
  as?: React.ElementType
  className?: string
  /** base delay before the first word reveals (seconds) */
  delay?: number
  /** per-word stagger (seconds) */
  stagger?: number
  /** reveal once vs every time it enters the viewport */
  once?: boolean
  /** viewport margin for the trigger (e.g. "-80px") */
  margin?: string
}

const EASE = [0.22, 1, 0.36, 1] as const

export function SplitText({
  children,
  as: Tag = "span",
  className,
  delay = 0,
  stagger = 0.06,
  once = true,
  margin = "-60px",
}: SplitTextProps) {
  const reduced = useReducedMotion()
  // Preserve the caller's whitespace exactly (handles <br/> etc. via separate lines).
  // Split on whitespace but keep words; render each inside an overflow-hidden mask.
  const words = children.split(/(\s+)/).filter((w) => w.length > 0)

  if (reduced) {
    return <Tag className={className}>{children}</Tag>
  }

  const container: Variants = {
    hidden: {},
    visible: {
      transition: { staggerChildren: stagger, delayChildren: delay },
    },
  }

  const word: Variants = {
    hidden: { y: "110%" },
    visible: {
      y: "0%",
      transition: { duration: 0.7, ease: EASE },
    },
  }

  return (
    <motion.span
      // Render as inline so it sits inside headings naturally; the wrapper
      // itself carries the className via Tag below.
      className={className}
      variants={container}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin }}
      style={{ display: "inline" }}
    >
      <Tag style={{ display: "inline" }}>
        {words.map((w, i) => {
          // whitespace tokens render as-is (no mask) to keep spacing intact.
          if (/^\s+$/.test(w)) return <span key={i}>{w}</span>
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                overflow: "hidden",
                verticalAlign: "top",
                // descenders (g, y, p) get clipped without a little pad.
                paddingBottom: "0.12em",
                marginBottom: "-0.12em",
              }}
            >
              <motion.span
                variants={word}
                style={{ display: "inline-block", willChange: "transform" }}
              >
                {w}
              </motion.span>
            </span>
          )
        })}
      </Tag>
    </motion.span>
  )
}
