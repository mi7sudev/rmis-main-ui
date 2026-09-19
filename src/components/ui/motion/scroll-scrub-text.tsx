"use client";

// ============================================================================
// ScrollScrubText — word-by-word reveal TIED TO SCROLL POSITION (not one-shot).
//
// This is the Apple/Samsung pattern: each word illuminates as you scroll,
// and de-illuminates when you scroll back up. The text is always fully
// present (for accessibility), but each word's opacity + y is driven by
// scrollYProgress through the section — so reading the headline IS the
// scroll experience.
//
// Difference from SplitText: SplitText fires once on whileInView (a one-shot
// animation). ScrollScrubText is continuously tied to scroll — scrub forward
// and back, the words follow. This is what makes it feel "choreographed."
//
// Reduced-motion: renders plain text (fully visible, no scrubbing).
// ============================================================================

import * as React from "react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

type ScrollScrubTextProps = {
  children: string;
  as?: React.ElementType;
  className?: string;
  /** the scroll target ref — should be the section this headline lives in */
  targetRef: React.RefObject<HTMLElement>;
  /** scroll offset for the trigger */
  offset?: ["start end", "end start"] | ["start start", "end end"] | readonly [string, string];
};

const EASE = [0.22, 1, 0.36, 1] as const;

export function ScrollScrubText({
  children,
  as: Tag = "span",
  className,
  targetRef,
  offset = ["start end", "end start"],
}: ScrollScrubTextProps) {
  const reduced = useReducedMotion();
  // The component accepts a broad offset tuple (e.g. ["start 80%", "end 60%"]);
  // motion's ScrollOffset type is a narrower union TS can't prove these strings
  // satisfy, so cast at the boundary. Runtime accepts arbitrary offsets.
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: offset as unknown as ["start end", "end start"],
  });

  const words = children.split(/(\s+)/).filter((w) => w.length > 0);

  if (reduced) {
    return <Tag className={className}>{children}</Tag>;
  }

  return (
    <Tag className={className} style={{ display: "inline" }}>
      {words.map((w, i) => {
        if (/^\s+$/.test(w)) return <span key={i}>{w}</span>;
        // Each word illuminates across its own band of scroll progress.
        const wordCount = words.filter((x) => !/^\s+$/.test(x)).length;
        const realIndex = words.slice(0, i).filter((x) => !/^\s+$/.test(x)).length;
        const band = 1 / wordCount;
        const start = realIndex * band;
        const end = start + band;
        return (
          <Word
            key={i}
            word={w}
            scrollYProgress={scrollYProgress}
            start={start}
            end={end}
          />
        );
      })}
    </Tag>
  );
}

function Word({
  word,
  scrollYProgress,
  start,
  end,
}: {
  word: string;
  scrollYProgress: MotionValue<number>;
  start: number;
  end: number;
}) {
  // Opacity: 0.15 (dim) → 1 (lit) across the word's band.
  const opacity = useTransform(scrollYProgress, [start, start + (end - start) * 0.5, end], [0.15, 1, 1]);
  // Y: 8px → 0 as the word illuminates.
  const y = useTransform(scrollYProgress, [start, end], ["8px", "0px"]);

  return (
    <span
      style={{
        display: "inline-block",
        overflow: "hidden",
        verticalAlign: "top",
        paddingBottom: "0.12em",
        marginBottom: "-0.12em",
      }}
    >
      <motion.span
        style={{
          display: "inline-block",
          opacity,
          y,
          willChange: "opacity, transform",
        }}
      >
        {word}
      </motion.span>
    </span>
  );
}
