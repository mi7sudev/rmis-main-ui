"use client";

// ============================================================================
// PageLoader — branded one-time preloader + orchestrated reveal.
//
// This is the "page-load orchestration" premium sites do (Linear, Vercel,
// Stripe, Apple): a brief branded intro covers the viewport, a progress line
// fills, then the curtain slides up to reveal the already-assembled hero.
//
// Behavior:
//   - Shows ONCE per browser session (sessionStorage). Returning visitors who
//     navigate back to the landing within the same tab session skip it —
//     premium sites never annoy you with the intro twice.
//   - Duration ~1.5s: logo fades in, gold line fills 0→100%, then the whole
//     overlay slides up (y:-100%) over 0.6s to reveal the hero.
//   - Reduced-motion: renders nothing — the hero's own mount animations play
//     directly (WCAG 2.3.3 compliant; no content is delayed).
//   - Only mounted by PublicLanding, so logged-in dashboards never see it.
// ============================================================================

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

const SESSION_KEY = "rmis_loader_seen";
const DURATION = 1500; // ms before the curtain starts sliding up

export function PageLoader() {
  const reduced = useReducedMotion();
  const [done, setDone] = React.useState(false);
  const [shouldShow, setShouldShow] = React.useState(false);

  React.useEffect(() => {
    // Reduced-motion users never see the loader.
    if (reduced) {
      setDone(true);
      return;
    }
    // Only show once per browser session.
    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") {
        setDone(true);
        return;
      }
    } catch {
      // sessionStorage may be unavailable (private mode) — fall through to show.
    }
    setShouldShow(true);

    const t = window.setTimeout(() => {
      setDone(true);
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // ignore
      }
    }, DURATION);
    return () => window.clearTimeout(t);
  }, [reduced]);

  // Once `done` flips true, the overlay slides up and unmounts after exit.
  return (
    <AnimatePresence>
      {!done && shouldShow && (
        <motion.div
          key="page-loader"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#112E81]"
          initial={{ y: "0%" }}
          exit={{ y: "-100%" }}
          transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
        >
          {/* Center stack: logos + progress line */}
          <div className="flex flex-col items-center gap-6 px-6">
            {/* Logos — fade + slight rise in */}
            <motion.div
              className="flex items-center gap-3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <img src="/MIRDC.png" alt="MIRDC" className="h-12 w-auto object-contain sm:h-16" />
              <img src="/RMIS.png" alt="RMIS" className="h-12 w-auto object-contain sm:h-16" />
            </motion.div>

            {/* Wordmark — masked slide up */}
            <div className="overflow-hidden">
              <motion.h1
                className="text-3xl font-black uppercase tracking-[0.3em] text-white sm:text-5xl"
                initial={{ y: "110%" }}
                animate={{ y: "0%" }}
                transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
              >
                RMIS
              </motion.h1>
            </div>

            {/* Progress track + fill */}
            <div className="relative mt-2 h-[2px] w-48 overflow-hidden bg-white/15 sm:w-64">
              <motion.div
                className="absolute inset-y-0 left-0 bg-[#E8A317]"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 1.2, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                style={{ transformOrigin: "left" }}
              />
            </div>

            {/* Kicker — "Recruitment Management & Information System" */}
            <motion.p
              className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#E8A317] sm:text-xs"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              DOST-MIRDC
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
