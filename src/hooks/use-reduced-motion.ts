import * as React from "react"

/**
 * useReducedMotion — returns true when the user has requested reduced motion
 * (OS-level "Reduce motion" setting / `prefers-reduced-motion: reduce`).
 *
 * Premium sites gate all non-essential animation behind this so the experience
 * stays accessible. Motion-heavy upgrades (Lenis smooth scroll, magnetic
 * buttons, scroll-scrubbed lines) should short-circuit to instant/linear when
 * this returns true.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState<boolean>(false)

  React.useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)")
    const onChange = () => setReduced(mql.matches)
    mql.addEventListener("change", onChange)
    setReduced(mql.matches)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return reduced
}
