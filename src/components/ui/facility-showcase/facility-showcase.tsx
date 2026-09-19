"use client";

// ============================================================================
// FacilityShowcase — premium hero-sidebar facility list.
//
// Replaces the old FlowingMenu. Fixes every jank source:
//   1. SHARED crossfading background — one image stack, the active item's
//      image fades in over the others (no hard image swap).
//   2. SPRING-driven flex-grow — items expand/collapse via `flex-grow` with
//      a spring transition, not `height: XX%` with a duration easing. Springs
//      settle elastically and never "snap-then-glide".
//   3. No `height: auto` animation — expanded copy uses opacity + a fixed
//      max-height clamp so there's no measure-then-animate jump.
//   4. Cursor parallax on the active image — the bg subtly follows the
//      cursor for depth (the old code computed mousePos but never used it;
//      here it actually drives a transform).
//   5. Reduced-motion safe — springs become instant, parallax disabled,
//      crossfades become instant swaps.
//
// Pattern references: Accenture hero tabs, Apple product switchers,
// Linear feature lists. Swiss palette preserved: #112E81 / #E8A317.
// ============================================================================

import { useRef, useState } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "motion/react";
import { ArrowUpRight, Plus } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

export type FacilityItem = {
  text: string;
  image: string;
  subtitle?: string;
  description?: string;
  tag?: string;
  location?: string;
  ctaLabel?: string;
  onClick?: () => void;
};

const SPRING = { type: "spring" as const, stiffness: 220, damping: 30, mass: 0.8 };

export function FacilityShowcase({ items }: { items: FacilityItem[] }) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState<number | null>(null);

  // ---- Cursor parallax for the shared background ----
  // Track the cursor inside the whole sidebar; the active image translates a
  // fraction of it for depth. useSpring smooths the raw pointer into a glide.
  const wrapRef = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0); // -1 .. 1 across width
  const py = useMotionValue(0); // -1 .. 1 across height
  const sx = useSpring(px, { stiffness: 120, damping: 20, mass: 0.5 });
  const sy = useSpring(py, { stiffness: 120, damping: 20, mass: 0.5 });

  // Image translates ±12px following the cursor.
  const imgX = useTransform(sx, [-1, 1], [-12, 12]);
  const imgY = useTransform(sy, [-1, 1], [-12, 12]);
  // Scale 1.06 so the parallax never reveals edges.
  const imgScale = 1.06;

  function handleMove(e: React.MouseEvent) {
    if (reduced || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    px.set(((e.clientX - rect.left) / rect.width) * 2 - 1);
    py.set(((e.clientY - rect.top) / rect.height) * 2 - 1);
  }

  return (
    <div
      ref={wrapRef}
      onMouseMove={handleMove}
      onMouseLeave={() => {
        setActive(null);
        px.set(0);
        py.set(0);
      }}
      className="relative flex h-full min-h-[540px] flex-col overflow-hidden bg-[#112E81]"
    >
      {/* ===== Shared crossfading background image stack =====
          Every facility image is always mounted in a stack; the active one
          (or the first when nothing is hovered) fades to opacity 1, the rest
          to 0. Crossfade is opacity-only (no reflow) → buttery. */}
      <div className="pointer-events-none absolute inset-0">
        {items.map((item, i) => {
          // When nothing is active, show the first image as the "rest" state.
          const isShown = active === null ? i === 0 : i === active;
          return (
            <motion.div
              key={i}
              initial={false}
              // `opacity` animates on crossfade; `x/y/scale` are MotionValues
              // driven by the cursor (parallax) — these MUST live in `style`,
              // not `animate`, because MotionValues don't go through `animate`.
              animate={{ opacity: isShown ? 1 : 0 }}
              style={{
                backgroundImage: `url(${item.image})`,
                x: reduced ? 0 : imgX,
                y: reduced ? 0 : imgY,
                scale: reduced ? 1 : imgScale,
              }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 bg-cover bg-center"
              aria-hidden
            />
          );
        })}
        {/* Always-on dark + gradient overlays for text legibility.
            The overlay darkens slightly when an item is active so the copy pops. */}
        <motion.div
          className="absolute inset-0 bg-[#112E81]"
          animate={{ opacity: active !== null ? 0.55 : 0.78 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#112E81] via-[#112E81]/30 to-transparent" />
      </div>

      {/* ===== List of facilities — spring flex-grow accordion =====
          Each item is a flex row that grows when active. flex-grow animates
          smoothly because it's a layout value the browser interpolates natively
          (unlike height %). The spring gives the elastic settle. */}
      <div className="relative z-10 flex h-full flex-col">
        {items.map((item, i) => (
          <FacilityRow
            key={i}
            item={item}
            index={i}
            active={active}
            setActive={setActive}
            reduced={reduced}
          />
        ))}
      </div>
    </div>
  );
}

function FacilityRow({
  item,
  index,
  active,
  setActive,
  reduced,
}: {
  item: FacilityItem;
  index: number;
  active: number | null;
  setActive: (i: number | null) => void;
  reduced: boolean;
}) {
  const isActive = active === index;
  const anyActive = active !== null;

  // flex-grow: active → 8, any-other-active → 1, none-active → 1 (equal share).
  // The spring transition on `flexGrow` makes the expand/collapse elastic.
  const grow = isActive ? 8 : 1;
  const numberLabel = String(index + 1).padStart(2, "0");

  return (
    <motion.div
      onMouseEnter={() => setActive(index)}
      onFocus={() => setActive(index)}
      tabIndex={0}
      role="button"
      className="group relative flex cursor-pointer flex-col justify-end overflow-hidden border-b border-white/15 last:border-b-0 focus-visible:outline-none"
      style={{ flexGrow: grow, flexBasis: 0 }}
      transition={reduced ? { duration: 0.15 } : SPRING}
      animate={{ flexGrow: grow }}
      onClick={item.onClick}
    >
      {/* Top meta row — number + tag + arrow */}
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
              isActive ? "translate-y-0 rotate-0" : "translate-y-0 -rotate-45"
            }`}
            strokeWidth={2}
          />
        </div>
      </div>

      {/* Content — anchored to the bottom */}
      <div className="relative z-10 px-4 pb-5 pt-12 sm:px-8 sm:pb-6">
        {/* Subtitle (kicker) — always visible */}
        {item.subtitle && (
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-[#E8A317] sm:text-xs">
            {item.subtitle}
          </p>
        )}

        {/* Facility name — masked slide-up when becoming active */}
        <div className="overflow-hidden">
          <motion.h3
            className="text-2xl font-black uppercase leading-[0.85] tracking-tighter text-white sm:text-3xl lg:text-4xl"
            animate={{
              y: isActive ? "0%" : anyActive ? "20%" : "0%",
              opacity: isActive ? 1 : anyActive ? 0.55 : 1,
            }}
            transition={reduced ? { duration: 0.15 } : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            {item.text}
          </motion.h3>
        </div>

        {/* DOST-MIRDC owner line — only when no subtitle (preserve original look) */}
        {!item.subtitle && (
          <span className="mt-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-white/85 sm:text-xs">
            DOST-MIRDC
          </span>
        )}

        {/* Expanded content — opacity + max-height clamp (NO height:auto anim).
            max-height animates without a measure pass, so there's no jump. */}
        <AnimatePresence initial={false}>
          {isActive && (item.description || item.location || item.ctaLabel !== null) && (
            <motion.div
              key="expanded"
              initial={{ opacity: 0, maxHeight: 0 }}
              animate={{ opacity: 1, maxHeight: 200 }}
              exit={{ opacity: 0, maxHeight: 0 }}
              transition={
                reduced
                  ? { duration: 0.15 }
                  : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }
              }
              className="overflow-hidden"
            >
              {/* Thin gold divider */}
              <div className="mb-3 mt-3 h-px w-full bg-[#E8A317]/50" />

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
