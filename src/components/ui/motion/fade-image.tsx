"use client";

// ============================================================================
// FadeImage — media polish primitive that closes the last "smoothness" gap
// vs Samsung/Apple/Sony-tier sites.
//
// The #1 perceived-jank killer on premium sites is NOT animation — it is
// images that "pop" into layout: layout shift (CLS) when they load, and an
// abrupt appearance mid-scroll. Top-tier sites never pop; every image
// dissolves in.
//
// FadeImage:
//  - Renders the image at opacity-0 (+ subtle 1.04 scale) and transitions to
//    opacity-1 / scale-1 with the house easing once the browser has decoded
//    it (`onLoad`, plus a `complete` check for cached images).
//  - Reserves exact layout via width/height (kills CLS → no scroll jump =
//    smoother Lenis glide over image sections).
//  - Forwards fetchPriority / loading / decoding so above-fold banners can
//    be prioritized and everything else lazy-decodes off the main thread.
//  - `scrubTarget` mode: image scales 1.18 → 1.00 tied to that element's
//    scroll progress — the signature Apple/Samsung full-bleed banner
//    treatment — while STILL dissolving in on decode.
//  - Reduced motion: no fade, no scrub scale (instant, static).
// ============================================================================

import * as React from "react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

type FadeImageProps = {
  src: string;
  alt: string;
  /** intrinsic dimensions — reserve layout space, kill CLS */
  width?: number;
  height?: number;
  className?: string;
  /** "high" for above-the-fold banners, otherwise lazy */
  fetchPriority?: "high" | "low" | "auto";
  loading?: "lazy" | "eager";
  /** element scrolled relative to — pass a RefObject<HTMLElement> */
  scrubTarget?: React.RefObject<HTMLElement | null>;
  style?: React.CSSProperties;
};

export function FadeImage({
  src,
  alt,
  width,
  height,
  className,
  fetchPriority = "auto",
  loading = "lazy",
  scrubTarget,
  style,
}: FadeImageProps) {
  const reduced = useReducedMotion();
  const [loaded, setLoaded] = React.useState(false);
  const imgRef = React.useRef<HTMLImageElement>(null);

  // Cached images can finish decoding before React attaches onLoad.
  React.useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
  }, []);

  // Scrub progress across the target element: 0 as it enters the viewport
  // bottom, 1 as its TOP reaches the viewport top — i.e. the zoom-out
  // COMPLETES while the element is still fully in view, so it rests at
  // scale 1.0 (the complete, uncropped image) for as long as the user is
  // actually looking at it. (["start end", "end start"] was wrong: the zoom
  // only finished as the element EXITED, so it never showed the complete
  // image while visible.)
  const { scrollYProgress } = useScroll({
    target: scrubTarget ?? undefined,
    offset: ["start end", "center center"],
  });
  const scale = useTransform(scrollYProgress, [0, 1], [1.18, 1]);

  const common = {
    src,
    alt,
    width,
    height,
    loading,
    fetchPriority,
    decoding: "async" as const,
    draggable: false,
    onLoad: () => setLoaded(true),
    className,
  };

  // Reduced motion → plain static image, instant.
  if (reduced) {
    return <img ref={imgRef} {...common} alt={alt} style={style} />;
  }

  return (
    <motion.img
      ref={imgRef}
      {...common}
      style={{
        ...style,
        opacity: loaded ? 1 : 0,
        scale: scrubTarget ? scale : loaded ? 1 : 1.04,
        transition: "opacity 0.9s cubic-bezier(0.22,1,0.36,1)",
        willChange: "opacity, transform",
      }}
    />
  );
}
