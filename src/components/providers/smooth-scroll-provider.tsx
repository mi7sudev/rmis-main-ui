"use client"

// ============================================================================
// SmoothScrollProvider — Lenis smooth scrolling + a top scroll-progress bar.
//
// This is the #1 "premium feel" upgrade that separates enterprise frontpages
// (Accenture, Stripe, Linear) from standard sites: the whole page *glides*
// instead of snapping on wheel/touch.
//
// - Lenis is mounted once at the app root. It drives a single rAF loop that
//   lerps the scroll position toward the target, producing buttery momentum.
// - A 3px gold bar at the very top of the viewport reflects scrollYProgress
//   (0 → 1 across the whole page), driven by Motion's useScroll so it stays
//   perfectly in sync with Lenis's smoothed position.
// - Respects prefers-reduced-motion: when the user has reduced motion on,
//   Lenis is NOT mounted and the progress bar is hidden — the page falls
//   back to native instant scrolling (WCAG 2.3.3 compliant).
// ============================================================================

import * as React from "react"
import Lenis from "lenis"
import { motion, useScroll, useSpring } from "motion/react"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

// The instance is also exposed as window.__lenis so non-React code (e.g.
// src/lib/scroll.ts instantScrollTo) can issue jumps that stay in sync.

export function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion()
  const lenisRef = React.useRef<Lenis | null>(null)

  // Whole-page scroll progress (0 at top → 1 at bottom), used for the top bar.
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    mass: 0.3,
  })

  React.useEffect(() => {
    if (reduced) return // native scroll for reduced-motion users

    const lenis = new Lenis({
      duration: 1.1,
      // expo-out curve — matches the [0.22, 1, 0.36, 1] easing used elsewhere.
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      // Yield wheel control to nested scrollable elements (Radix dialogs,
      // select dropdowns, scrollable lists): when the event
      // target sits inside an element that can actually scroll, Lenis gets out
      // of the way and native scrolling takes over. Without this, Lenis
      // hijacks the wheel and scrolls the page BEHIND fixed overlays instead
      // of their content.
      allowNestedScroll: true,
      // Keep touch native — Lenis touch smoothing can feel laggy on mobile.
      // (The old `smoothTouch` option was removed in Lenis 1.x; touch is
      // native unless `syncTouch` is explicitly enabled.)
      touchMultiplier: 1.5,
    })
    lenisRef.current = lenis
    window.__lenis = lenis

    let rafId = 0
    const raf = (time: number) => {
      lenis.raf(time)
      rafId = requestAnimationFrame(raf)
    }
    rafId = requestAnimationFrame(raf)

    return () => {
      cancelAnimationFrame(rafId)
      lenis.destroy()
      lenisRef.current = null
      window.__lenis = null
    }
  }, [reduced])

  return (
    <>
      {/* Scroll progress bar — 3px primary, anchored to viewport top, z-50 over header */}
      {!reduced && (
        <motion.div
          aria-hidden
          style={{ scaleX }}
          className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-primary"
        />
      )}
      {children}
    </>
  )
}
