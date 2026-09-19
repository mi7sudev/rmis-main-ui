"use client";

// ============================================================================
// TiltCard — 3D perspective tilt toward the cursor.
//
// A premium micro-interaction used on enterprise job cards (Linear careers,
// Vercel, Stripe). The card subtly rotates in 3D space following the cursor,
// spring-smoothed, with optional glare + lift.
//
// - `max` degrees of rotation (default 8°).
// - Spring smoothed for the elastic settle.
// - Wraps children in a perspective container so the tilt reads as depth.
// - Respects reduced motion (no tilt, static).
// ============================================================================

import * as React from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

type TiltCardProps = {
  children: React.ReactNode;
  className?: string;
  /** max degrees of rotation on each axis */
  max?: number;
  /** spring stiffness */
  stiffness?: number;
  /** spring damping */
  damping?: number;
  /** translateZ lift on hover (px). 0 disables. */
  lift?: number;
} & Omit<React.ComponentProps<typeof motion.div>, "ref" | "style">;

export function TiltCard({
  children,
  className,
  max = 8,
  stiffness = 200,
  damping = 18,
  lift = 0,
  ...rest
}: TiltCardProps) {
  const reduced = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);

  // Raw cursor position as -0.5..0.5 within the card.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness, damping, mass: 0.4 });
  const sy = useSpring(py, { stiffness, damping, mass: 0.4 });

  // Map -0.5..0.5 → -max..max degrees.
  const rotateX = useTransform(sy, [-0.5, 0.5], [max, -max]);
  const rotateY = useTransform(sx, [-0.5, 0.5], [-max, max]);

  const [hovered, setHovered] = React.useState(false);

  function handleMove(e: React.MouseEvent) {
    if (reduced || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    px.set((e.clientX - rect.left) / rect.width - 0.5);
    py.set((e.clientY - rect.top) / rect.height - 0.5);
  }

  function reset() {
    px.set(0);
    py.set(0);
    setHovered(false);
  }

  if (reduced) {
    return (
      <div className={className} {...(rest as React.HTMLAttributes<HTMLDivElement>)}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{
        rotateX,
        rotateY,
        transformPerspective: 800,
        translateZ: hovered && lift ? lift : 0,
        transformStyle: "preserve-3d",
      }}
      onMouseMove={handleMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={reset}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
