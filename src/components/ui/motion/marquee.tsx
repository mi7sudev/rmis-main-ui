"use client"

// ============================================================================
// Marquee — infinite horizontal ticker strip.
//
// A premium section-divider device (used by Accenture, Linear, Vercel): a
// repeating uppercase phrase that scrolls seamlessly forever. Here it's used
// as a gold-on-navy band between major sections to add rhythm + motion.
//
// - Duplicates the phrase enough times to overflow any viewport, then
//   translates the track -50% on an infinite linear loop (seamless because
//   the second half mirrors the first).
// - `reverse` flips direction; `speed` tunes duration (seconds per loop).
// - Reduced motion → static (no translate).
// ============================================================================

import * as React from "react"
import { motion } from "motion/react"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

type MarqueeProps = {
  /** phrase(s) joined into the repeating unit. e.g. ["Recruitment","Innovation","Industry"] */
  items: string[]
  /** separator rendered between items */
  separator?: string
  speed?: number
  reverse?: boolean
  className?: string
  itemClassName?: string
}

export function Marquee({
  items,
  separator = "•",
  speed = 32,
  reverse = false,
  className,
  itemClassName,
}: MarqueeProps) {
  const reduced = useReducedMotion()

  // Build the repeating unit once, then render it twice for the seamless loop.
  const unit = (
    <div className="flex shrink-0 items-center">
      {items.map((it, i) => (
        <React.Fragment key={i}>
          <span className={itemClassName}>{it}</span>
          <span className={itemClassName} aria-hidden style={{ opacity: 0.5, margin: "0 1.2em" }}>
            {separator}
          </span>
        </React.Fragment>
      ))}
    </div>
  )

  if (reduced) {
    return (
      <div className={`flex overflow-hidden ${className ?? ""}`}>
        {unit}
        {unit}
      </div>
    )
  }

  return (
    <div className={`flex overflow-hidden ${className ?? ""}`}>
      <motion.div
        className="flex shrink-0"
        animate={{ x: reverse ? "50%" : "-50%" }}
        transition={{ duration: speed, ease: "linear", repeat: Infinity }}
      >
        {unit}
        {unit}
      </motion.div>
    </div>
  )
}
