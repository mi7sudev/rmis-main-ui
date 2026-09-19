"use client";

// ============================================================================
// MARQUEE DIVIDER — shared section-divider band.
// One wrapper <div> + one Marquee ticker. The landing page renders this
// device THREE times with different props (gold-on-navy between hero and
// method, reverse navy-on-white before positions, gold-on-navy atop the
// footer), so the device lives in exactly one place.
// ============================================================================

import { Marquee } from "@/components/ui/motion/marquee";

type MarqueeDividerProps = {
  items: string[];
  separator?: string;
  speed?: number;
  reverse?: boolean;
  /** Ink color classes applied to the Marquee itself (e.g. text-[#E8A317]). */
  inkClassName?: string;
  itemClassName?: string;
  /** Wrapper band classes (borders, background, padding). */
  className?: string;
};

export function MarqueeDivider({
  items,
  separator,
  speed,
  reverse,
  inkClassName,
  itemClassName,
  className,
}: MarqueeDividerProps) {
  return (
    <div className={className}>
      <Marquee
        items={items}
        separator={separator}
        speed={speed}
        reverse={reverse}
        className={inkClassName}
        itemClassName={itemClassName}
      />
    </div>
  );
}
