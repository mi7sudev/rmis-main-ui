"use client";

// ============================================================================
// 02. METHOD — How It Works (delivery-style progress line).
// A single horizontal progress track with 6 rounded checkpoint dots — like a
// package delivery tracker. Stage name only. No descriptions, no durations.
// Very compact. Stages mirror PIPELINE_STAGES in lib/status.ts.
// The progress-line ref + scroll scrub live HERE — nothing else consumes them.
// NOTE: the 4-argument useTransform below is carried over verbatim from the
// pre-carve file (it is the file's pre-existing TS2769); do not "fix" it in a
// carve — changing it to the array form would change runtime behavior.
// ============================================================================

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";

export function MethodSection() {
  // Method section — the "How It Works" progress line is SCRUBBED to the
  // section's scroll progress (not a one-shot draw). As you scroll through the
  // section the gold line draws left→right; scroll back up and it retracts.
  // This is the signature premium interaction (Linear, Stripe, Apple).
  const methodRef = useRef<HTMLElement>(null);
  const { scrollYProgress: methodProgress } = useScroll({
    target: methodRef,
    offset: ["start 80%", "end 60%"],
  });
  const lineScale = useTransform(methodProgress, [0, 1], [0, 1]);

  return (
    <section ref={methodRef} className="border-b border-white/10 bg-[#112E81] text-white">
      <div className="mx-auto max-w-[1400px] 2xl:max-w-[1680px] px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-24">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mb-12 flex flex-wrap items-end justify-between gap-6 border-b border-white/15 pb-8 sm:mb-16"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E8A317]">Method</p>
            <h2 className="mt-3 text-4xl font-medium tracking-tight sm:text-5xl lg:text-6xl">
              How it works
            </h2>
          </div>
          <p className="hidden max-w-xs text-right text-sm leading-relaxed text-white/70 sm:block">
            Four stages from submission to the face-to-face process
          </p>
        </motion.div>

        {/* Progress line — delivery tracker style */}
        <div className="relative px-2 sm:px-4">
          {/* Faint base track — the full-width rail */}
          <div className="absolute left-2 right-2 top-3.5 h-0.5 bg-white/15 sm:left-4 sm:right-4 sm:top-5" />
          {/* Scroll-scrubbed gold fill — draws left→right as the section
               scrolls through the viewport, retracts on scroll-up.
               This replaces the old one-shot `whileInView` draw. */}
          <motion.div
            style={{ scaleX: lineScale }}
            className="absolute left-2 right-2 top-3.5 h-0.5 origin-left bg-[#E8A317] sm:left-4 sm:right-4 sm:top-5"
          />

          {/* Checkpoints */}
          <div className="relative grid grid-cols-4 gap-1 sm:gap-2">
            {[
              { num: "01", stage: "Submit" },
              { num: "02", stage: "Credential Review" },
              { num: "03", stage: "Shortlisted — Email Notice" },
              { num: "04", stage: "Face-to-Face Process" },
            ].map((step, i) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, scale: 0.4 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.4, delay: 0.3 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                className="group flex flex-col items-center text-center"
              >
                {/* Dot on the line — solid rounded chip covers the track behind it */}
                <div className="relative z-10 flex size-7 items-center justify-center rounded-full border border-[#E8A317] bg-[#112E81] transition-all duration-300 group-hover:scale-125 group-hover:bg-[#E8A317] sm:size-10">
                  <span className="text-[10px] font-medium tabular-nums tracking-[-0.02em] text-[#E8A317] transition-colors group-hover:text-[#112E81] sm:text-xs">
                    {step.num}
                  </span>
                </div>
                {/* Stage name */}
                <div className="mt-2 sm:mt-4">
                  <p className="text-[10px] font-semibold leading-tight text-white sm:text-sm">
                    {step.stage}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
