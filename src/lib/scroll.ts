// ============================================================================
// scroll.ts — tiny scroll utilities that cooperate with Lenis.
//
// SmoothScrollProvider mounts Lenis on the window scroller. A raw
// `window.scrollTo()` *usually* works (Lenis re-syncs on native scroll
// events), but if a smooth Lenis animation happens to be mid-flight the
// animation would override the jump. Routing through `lenis.scrollTo(top, {
// immediate: true })` moves Lenis's internal target FIRST, so the jump can
// never be fought. Falls back to native instant scroll when Lenis isn't
// mounted (reduced-motion users, SSR).
// ============================================================================

type LenisLike = {
  scrollTo: (target: number, options?: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    /** Mounted by SmoothScrollProvider — the active Lenis instance. */
    __lenis?: LenisLike | null;
  }
}

/** Jump instantly (no smoothing) to an absolute scroll offset. */
export function instantScrollTo(top: number) {
  if (typeof window === "undefined") return;
  const lenis = window.__lenis;
  if (lenis) {
    lenis.scrollTo(top, { immediate: true, force: true });
  } else {
    window.scrollTo({ top, behavior: "instant" });
  }
}
