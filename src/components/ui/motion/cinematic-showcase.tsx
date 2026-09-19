"use client";

// ============================================================================
// CinematicShowcase — the Samsung/Sony/Accenture scroll-scrubbed section.
//
// This is THE "mindblowing on scroll" effect: a full-viewport section that
// pins (stays fixed) while you scroll through it. As you scroll, the
// background image crossfades through a sequence and the headline + stats
// transform — every visual property tied to exact scroll position.
//
// Scroll back up → everything reverses. This is what makes it feel
// "choreographed" rather than "animated."
//
// Reduced-motion: the section renders as a static stacked sequence (no pin,
// no scrub) — fully legible, just not choreographed.
// ============================================================================

import { useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

type Scene = {
  image: string;
  eyebrow: string;
  title: string;
  copy: string;
  stat: { value: string; label: string };
};

const SCENES: Scene[] = [
  {
    image: "/03-section-image14.jpg",
    eyebrow: "Innovation",
    title: "Where ideas become steel.",
    copy: "Advanced mechatronics, robotics, and automation labs drive Philippine industry into the fourth industrial revolution — empowering MSMEs and academia through digital transformation.",
    stat: { value: "04", label: "Flagship facilities nationwide" },
  },
  {
    image: "/03-section-image15.jpg",
    eyebrow: "Industry",
    title: "Where research becomes product.",
    copy: "Metals processing, materials science, and engineering R&D translate standards and technology transfer into measurable competitive advantage for local manufacturers.",
    stat: { value: "150+", label: "Industry partners served annually" },
  },
  {
    image: "/03-section-image8.jpg",
    eyebrow: "Impact",
    title: "Where careers become legacy.",
    copy: "A team of scientists, engineers, and craftspeople advancing the nation — building the metals industry, training the next generation, and shaping policy that lasts decades.",
    stat: { value: "60+", label: "Years serving DOST-MIRDC" },
  },
];

export function CinematicShowcase() {
  const reduced = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  // Scroll hint opacity — always called (top-level), value unused when reduced.
  const hintOpacity = useTransform(scrollYProgress, [0, 0.05], [1, 0]);

  return (
    <section
      ref={sectionRef}
      className="relative bg-[#112E81] text-white"
      style={{ height: reduced ? "auto" : `${SCENES.length * 100}vh` }}
    >
      <div className={reduced ? "relative" : "sticky top-0 h-screen overflow-hidden"}>
        {SCENES.map((scene, i) => (
          <SceneLayer
            key={i}
            scene={scene}
            index={i}
            total={SCENES.length}
            scrollYProgress={scrollYProgress}
            reduced={reduced}
          />
        ))}

        {/* Scroll hint — fades after the first scene */}
        {!reduced && (
          <motion.div
            className="absolute bottom-6 left-1/2 -translate-x-1/2"
            style={{ opacity: hintOpacity }}
          >
            <div className="flex flex-col items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/80">
                Scroll
              </span>
              <motion.div
                className="h-8 w-px bg-[#E8A317]"
                animate={{ scaleY: [0.3, 1, 0.3] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                style={{ transformOrigin: "top" }}
              />
            </div>
          </motion.div>
        )}
      </div>
    </section>
  );
}

// ============================================================================
// SceneLayer — one scene in the crossfading sequence.
// Extracted as its own component so the useTransform hooks are called at the
// top level (not inside a .map() callback, which would violate the Rules of
// Hooks).
// ============================================================================

function SceneLayer({
  scene,
  index,
  total,
  scrollYProgress,
  reduced,
}: {
  scene: Scene;
  index: number;
  total: number;
  scrollYProgress: MotionValue<number>;
  reduced: boolean;
}) {
  // Compute the scroll band for this scene (i/N → (i+1)/N) with crossfade.
  const start = index / total;
  const end = (index + 1) / total;
  const fade = 0.08;

  // Scene opacity: 0 → 1 (enter) → 1 (hold) → 0 (exit).
  const opacity = useTransform(
    scrollYProgress,
    [Math.max(0, start - fade), start + fade, end - fade, Math.min(1, end + fade)],
    [0, 1, 1, 0]
  );

  // Image parallax — drifts upward through the scene.
  const imageY = useTransform(
    scrollYProgress,
    [Math.max(0, start - fade), Math.min(1, end + fade)],
    ["8%", "-8%"]
  );
  const imageScale = useTransform(scrollYProgress, [0, 1], [1.05, 1.2]);

  // Text rises as the scene plays.
  const textY = useTransform(
    scrollYProgress,
    [Math.max(0, start - fade), start + fade, end - fade, Math.min(1, end + fade)],
    ["60px", "0px", "0px", "-60px"]
  );

  // Clip-path curtain reveal: wipes in from bottom→top on enter, out on exit.
  const clipPath = useTransform(
    scrollYProgress,
    [
      Math.max(0, start - fade),
      start + fade,
      end - fade,
      Math.min(1, end + fade),
    ],
    [
      "inset(100% 0 0 0)",  // fully clipped (hidden) before enter
      "inset(0% 0 0 0)",    // revealed during hold
      "inset(0% 0 0 0)",    // still revealed
      "inset(0% 0 100% 0)", // clipped out (top→bottom) on exit
    ]
  );

  if (reduced) {
    // Static stacked layout — each scene as a full-viewport section.
    return (
      <div className="relative h-screen overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${scene.image})` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#112E81] via-[#112E81]/60 to-[#112E81]/30" />
        <div className="absolute inset-0 flex items-end">
          <div className="mx-auto w-full max-w-[1400px] 2xl:max-w-[1680px] px-4 pb-16 sm:px-8 sm:pb-20 lg:px-12 lg:pb-24">
            <div className="max-w-2xl">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.3em] text-[#E8A317] sm:text-sm">{scene.eyebrow}</p>
              <h2 className="text-4xl font-black uppercase leading-[0.9] tracking-tighter text-white sm:text-6xl lg:text-7xl">{scene.title}</h2>
              <p className="mt-6 max-w-xl text-base font-medium leading-relaxed text-white/90 sm:text-lg">{scene.copy}</p>
              <div className="mt-8 flex items-end gap-4 border-t-2 border-[#E8A317]/40 pt-6">
                <span className="text-5xl font-black tabular-nums tracking-tighter text-[#E8A317] sm:text-7xl lg:text-8xl">{scene.stat.value}</span>
                <span className="mb-2 max-w-[12rem] text-xs font-bold uppercase tracking-widest text-white/90 sm:text-sm">{scene.stat.label}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div className="absolute inset-0" style={{ opacity }}>
      {/* Background image — full viewport, parallax + clip reveal */}
      <motion.div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${scene.image})`,
          scale: imageScale,
          y: imageY,
          clipPath,
          WebkitClipPath: clipPath,
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#112E81] via-[#112E81]/60 to-[#112E81]/30" />

      {/* Content */}
      <motion.div className="absolute inset-0 flex items-end" style={{ y: textY }}>
        <div className="mx-auto w-full max-w-[1400px] 2xl:max-w-[1680px] px-4 pb-16 sm:px-8 sm:pb-20 lg:px-12 lg:pb-24">
          <div className="max-w-2xl">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.3em] text-[#E8A317] sm:text-sm">{scene.eyebrow}</p>
            <h2 className="text-4xl font-black uppercase leading-[0.9] tracking-tighter text-white sm:text-6xl lg:text-7xl">{scene.title}</h2>
            <p className="mt-6 max-w-xl text-base font-medium leading-relaxed text-white/90 sm:text-lg">{scene.copy}</p>
            <div className="mt-8 flex items-end gap-4 border-t-2 border-[#E8A317]/40 pt-6">
              <span className="text-5xl font-black tabular-nums tracking-tighter text-[#E8A317] sm:text-7xl lg:text-8xl">{scene.stat.value}</span>
              <span className="mb-2 max-w-[12rem] text-xs font-bold uppercase tracking-widest text-white/90 sm:text-sm">{scene.stat.label}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Scene counter */}
      <div className="absolute right-4 top-6 sm:right-8 sm:top-10">
        <span className="font-mono text-xs font-bold tabular-nums text-white/80 sm:text-sm">
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
      </div>
    </motion.div>
  );
}
