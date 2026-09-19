"use client";

import { useRef, useState } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useAnimationFrame,
} from "motion/react";
import { ArrowUpRight, Plus } from "lucide-react";

// ============================================================================
// FlowingMenu — Swiss International adaptation
// A vertical menu where items expand on hover, revealing a background image.
// Adapted from React Bits FlowingMenu, restyled for Swiss design:
// dark blue #112E81, gold #E8A317, UPPERCASE Inter, zero radius.
//
// Each item now supports rich optional content:
//   - subtitle     : short kicker shown under the name (compact state)
//   - description  : longer copy revealed in the expanded (hover) state
//   - tag          : small uppercase chip on the right (e.g. "LAB", "CENTER")
//   - location     : small location line shown in the expanded state
//   - ctaLabel     : defaults to "Explore"
// All new fields are OPTIONAL — existing callers keep working unchanged.
// ============================================================================

export type FlowingMenuItem = {
  link: string;
  text: string;
  image: string;
  /** Short kicker shown beneath the name (compact + expanded). */
  subtitle?: string;
  /** Longer copy revealed when the item is expanded on hover. */
  description?: string;
  /** Small uppercase chip rendered on the right (e.g. "LAB", "CENTER"). */
  tag?: string;
  /** Optional location line shown in the expanded state. */
  location?: string;
  /** CTA label rendered in the expanded state. Defaults to "Explore". */
  ctaLabel?: string;
  onClick?: () => void;
};

export function FlowingMenu({ items }: { items: FlowingMenuItem[] }) {
  // Lift the hovered index up so siblings know to shrink when one expands.
  // Without this, each MenuItem only knew its own hover state and the height
  // formula couldn't shrink the siblings, breaking the "expand / collapse" effect.
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    // h-full so the column flex container inherits the parent wrapper's height;
    // otherwise flex-basis:0 on the items would collapse them to 0px.
    <div className="flex h-full flex-col">
      {items.map((item, idx) => (
        <MenuItem
          key={idx}
          item={item}
          index={idx}
          total={items.length}
          hoveredIndex={hoveredIndex}
          onHoverChange={setHoveredIndex}
        />
      ))}
    </div>
  );
}

function MenuItem({
  item,
  index,
  total,
  hoveredIndex,
  onHoverChange,
}: {
  item: FlowingMenuItem;
  index: number;
  total: number;
  hoveredIndex: number | null;
  onHoverChange: (idx: number | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mousePos = useMotionValue(0);
  const targetPos = useMotionValue(0);

  const hovered = hoveredIndex === index;
  const anyHovered = hoveredIndex !== null;

  useAnimationFrame(() => {
    const diff = targetPos.get() - mousePos.get();
    mousePos.set(mousePos.get() + diff * 0.075);
  });

  function handleMouseMove(e: React.MouseEvent) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    targetPos.set(e.clientY - rect.top);
  }

  // Height distribution: when nothing is hovered, all items share equally.
  // When one is hovered, it takes the lion's share and siblings shrink to a
  // fixed compact slice. The percentages always sum to exactly 100%:
  //   no hover  : N * (100/N)%                       = 100%
  //   hover     : hovered% + (N-1) * collapsed%       = 100%
  const basePct = 100 / total;
  const collapsedPct = 10; // each non-hovered sibling gets 10%
  const hoveredPct = 100 - (total - 1) * collapsedPct; // e.g. 4 items → 70%
  const heightPct = !anyHovered ? basePct : hovered ? hoveredPct : collapsedPct;

  const numberLabel = String(index + 1).padStart(2, "0");

  return (
    <motion.div
      ref={ref}
      onMouseEnter={() => onHoverChange(index)}
      onMouseLeave={() => onHoverChange(null)}
      onMouseMove={handleMouseMove}
      animate={{ height: `${heightPct}%` }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="relative cursor-pointer overflow-hidden border-b-2 border-[#112E81] last:border-b-0"
      onClick={item.onClick}
    >
      {/* Background image */}
      <motion.div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${item.image})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: hovered ? "grayscale(0%)" : "grayscale(100%)",
          transition: "filter 0.4s ease",
        }}
      >
        {/* Dark overlay */}
        <div
          className="absolute inset-0 bg-[#112E81] transition-opacity duration-500"
          style={{ opacity: hovered ? 0.35 : 0.85 }}
        />
        {/* Subtle gold tint that fades in on hover for depth */}
        <div
          className="absolute inset-0 bg-gradient-to-t from-[#112E81] via-[#112E81]/40 to-transparent transition-opacity duration-500"
          style={{ opacity: hovered ? 0.6 : 0.25 }}
        />
      </motion.div>

      {/* Top meta row — number badge (left) + tag chip (right) */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-3 sm:px-6">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#E8A317] sm:text-xs">
          {numberLabel}
        </span>
        <div className="flex items-center gap-2">
          {item.tag && (
            <span className="border border-[#E8A317]/70 bg-[#112E81]/60 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-[#E8A317] backdrop-blur-sm sm:text-[10px]">
              {item.tag}
            </span>
          )}
          <ArrowUpRight
            className={`size-3.5 text-white/90 transition-transform duration-300 sm:size-4 ${
              hovered ? "translate-y-0 rotate-0" : "translate-y-0 -rotate-45"
            }`}
            strokeWidth={2}
          />
        </div>
      </div>

      {/* Content — anchored to the bottom; top is clipped by overflow-hidden
          when the item is in its compact (sibling-hovered) state. */}
      <div className="relative z-10 flex h-full flex-col justify-end px-4 pb-5 pt-12 sm:px-8 sm:pb-6">
        {/* Subtitle (kicker) — always visible */}
        {item.subtitle && (
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-[#E8A317] sm:text-xs">
            {item.subtitle}
          </p>
        )}

        {/* Facility name — scales up on hover */}
        <h3
          className={`text-2xl font-black uppercase leading-[0.85] tracking-tighter text-white transition-all duration-500 sm:text-3xl lg:text-4xl ${
            hovered ? "lg:text-5xl" : ""
          }`}
        >
          {item.text}
        </h3>

        {/* DOST-MIRDC owner line — only when no subtitle (preserve original look) */}
        {!item.subtitle && (
          <span className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/85 sm:text-xs">
            DOST-MIRDC
          </span>
        )}

        {/* Expanded content — description + location + CTA, revealed on hover */}
        <AnimatePresence initial={false}>
          {hovered && (item.description || item.location || item.ctaLabel !== null) && (
            <motion.div
              key="expanded"
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: "auto", marginTop: 12 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              {/* Thin gold divider */}
              <div className="mb-3 h-px w-full bg-[#E8A317]/50" />

              {item.description && (
                <p className="max-w-md text-xs font-medium leading-relaxed text-white/85 sm:text-sm">
                  {item.description}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                {item.location && (
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/90 sm:text-xs">
                    <span className="text-[#E8A317]">▸</span> {item.location}
                  </span>
                )}
                <span className="group/cta flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#E8A317] sm:text-xs">
                  {item.ctaLabel ?? "Explore"}
                  <Plus
                    className="size-3 transition-transform duration-300 group-hover/cta:rotate-90"
                    strokeWidth={2.5}
                  />
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
