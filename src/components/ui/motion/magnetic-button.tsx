"use client"

// ============================================================================
// MagneticButton — wraps a button so it *pulls* toward the cursor on hover.
//
// This is a signature micro-interaction on premium enterprise sites (Apple,
// Stripe, Accenture's hero CTAs). The element translates a fraction of the
// cursor's offset from its center, springy on enter, snaps back on leave.
//
// - Renders the child button; listens to mousemove on its own bounding box.
// - `strength` (0–1) — how far it follows (0.3 = 30% of cursor offset).
// - Respects reduced motion (no transform).
// ============================================================================

import * as React from "react"
import { motion, useMotionValue, useSpring } from "motion/react"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

type MagneticButtonProps = {
  children: React.ReactNode
  className?: string
  strength?: number
  /** spring stiffness for the follow */
  stiffness?: number
  /** spring damping */
  damping?: number
} & Omit<React.ComponentProps<typeof motion.div>, "ref"> // passthrough id/style etc.

export function MagneticButton({
  children,
  className,
  strength = 0.3,
  stiffness = 200,
  damping = 18,
  ...rest
}: MagneticButtonProps) {
  const reduced = useReducedMotion()
  const ref = React.useRef<HTMLDivElement>(null)

  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useSpring(x, { stiffness, damping, mass: 0.4 })
  const sy = useSpring(y, { stiffness, damping, mass: 0.4 })

  function handleMove(e: React.MouseEvent) {
    if (reduced || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const relX = e.clientX - (rect.left + rect.width / 2)
    const relY = e.clientY - (rect.top + rect.height / 2)
    x.set(relX * strength)
    y.set(relY * strength)
  }

  function reset() {
    x.set(0)
    y.set(0)
  }

  if (reduced) {
    return (
      // Reduced-motion fallback: plain div. The passthrough props are typed
      // as motion.div props (they may carry MotionValue `style`), so cast to
      // the plain-DOM attribute set for this static branch.
      <div className={className} {...(rest as unknown as React.HTMLAttributes<HTMLDivElement>)}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ x: sx, y: sy, display: "inline-block" }}
      onMouseMove={handleMove}
      onMouseLeave={reset}
      {...rest}
    >
      {children}
    </motion.div>
  )
}
