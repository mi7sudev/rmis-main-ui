"use client";

// ============================================================================
// SpotlightCard — radial gradient that follows the cursor.
//
// This is the premium hover effect used by Linear, Vercel, GitHub, and Stripe
// on their feature/product cards. A soft radial glow tracks the cursor position,
// subtly illuminating the card. It's far more refined than a 3D tilt:
//   - No content distortion (text stays flat and readable)
//   - No motion sickness (the card itself doesn't move)
//   - Reads as "light hitting the surface" — premium, physical, calm
//
// Implementation:
//   - A radial-gradient overlay whose center follows the cursor via CSS custom
//     properties (--mx, --my), updated on mousemove. No React re-render → 60fps.
//   - The overlay is opacity-0 by default and fades in on hover.
//   - An optional border-glow that brightens on hover.
//   - Reduced-motion: overlay stays hidden, card is fully static.
// ============================================================================

import * as React from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

type SpotlightCardProps = {
  children: React.ReactNode;
  className?: string;
  /** spotlight color (rgba). Default: gold rgba(232,163,23,0.18) */
  glowColor?: string;
  /** border glow color on hover. Default: rgba(232,163,23,0.4) */
  borderColor?: string;
  /** spotlight radius in px. Default: 320 */
  radius?: number;
} & React.HTMLAttributes<HTMLDivElement>;

export function SpotlightCard({
  children,
  className,
  glowColor = "rgba(232, 163, 23, 0.18)",
  borderColor = "rgba(232, 163, 23, 0.45)",
  radius = 320,
  ...rest
}: SpotlightCardProps) {
  const reduced = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);

  function handleMove(e: React.MouseEvent) {
    if (reduced || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    // Set CSS custom properties — the radial-gradient reads these directly.
    ref.current.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    ref.current.style.setProperty("--my", `${e.clientY - rect.top}px`);
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      className={`group/spotlight relative overflow-hidden ${className ?? ""}`}
      {...rest}
    >
      {/* Spotlight overlay — radial gradient centered on cursor.
          Hidden for reduced-motion users (opacity stays 0). */}
      {!reduced && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 opacity-0 transition-opacity duration-300 group-hover/spotlight:opacity-100"
          style={{
            background: `radial-gradient(${radius}px circle at var(--mx, 50%) var(--my, 50%), ${glowColor}, transparent 70%)`,
          }}
        />
      )}
      {/* Border glow — a thin ring that brightens on hover.
          Implemented as an inset box-shadow so it doesn't affect layout. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-30 transition-shadow duration-300"
        style={{
          boxShadow: `inset 0 0 0 1px transparent`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-30 transition-opacity duration-300 group-hover/spotlight:opacity-100"
        style={{
          opacity: 0,
          boxShadow: `inset 0 0 0 1px ${borderColor}`,
        }}
      />
      {children}
    </div>
  );
}
