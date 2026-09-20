"use client";

// ============================================================================
// PUBLIC FOOTER — the landing's institutional anchor. A deep-moss block
// (#0E352C Midnight Moss — the canonical wash, identical in both modes) that
// closes the page with colour-blocking weight: brand + agency identity, quick
// links, contact, certification seals, and the RA 10173 line.
//
// - GovPH seal watermark: /govph-seal-mono.png (parchment-tinted transparent
//   knockout) sits BEHIND the brand column at whisper opacity.
// - `mt-auto` is REQUIRED — the landing shell is a min-h-dvh flex column, so
//   this footer pins to the viewport bottom on short pages and pushes down
//   naturally when content overflows.
// - whileInView reveals, instant under reduced motion.
// ============================================================================

import { useNav } from "@/components/nav-provider";
import { motion } from "motion/react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

export function PublicFooter() {
  const { navigate } = useNav();
  const reduced = useReducedMotion();

  const reveal = (delay = 0) => ({
    initial: reduced ? false : ({ opacity: 0, y: 18 } as const),
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-60px" } as const,
    transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] as const },
  });

  return (
    <footer className="relative mt-auto overflow-hidden bg-moss text-parchment">
      {/* GovPH seal — parchment watermark behind the brand column */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-16 left-0 z-0 opacity-[0.08]"
      >
        <img
          src="/govph-seal-mono.png"
          alt=""
          className="h-48 w-48 object-contain sm:h-64 sm:w-64"
        />
      </div>

      <motion.div
        initial={reduced ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 mx-auto w-full max-w-[1400px] 2xl:max-w-[1680px] px-4 py-10 sm:px-6 sm:py-14 lg:px-8"
      >
        <div className="grid gap-8 sm:grid-cols-12 sm:gap-6">
          {/* Brand column — emblem lockup + agency line + address */}
          <motion.div {...reveal(0)} className="sm:col-span-5">
            <div className="flex items-center gap-3">
              <img
                src="/MIRDC-mark.png"
                alt="MIRDC"
                className="h-10 w-auto object-contain sm:h-12"
              />
              <img
                src="/RMIS-white.png"
                alt="RMIS"
                className="h-9 w-auto object-contain sm:h-10"
              />
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-parchment/70">
              Recruitment Management &amp; Information System of the DOST —
              Metals Industry Research and Development Center.
            </p>
            <p className="mt-2 text-sm text-parchment/50">
              DOST Compound, Bicutan, Taguig City
            </p>
          </motion.div>

          {/* Links column */}
          <motion.div
            {...reveal(0.08)}
            className="sm:col-span-3 sm:border-l sm:border-white/15 sm:pl-8"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-parchment/60">
              Links
            </p>
            <ul className="mt-4 space-y-3">
              {(
                [
                  ["Browse positions", () => navigate("jobs")],
                  ["Sign in", () => navigate("signin")],
                  ["Create account", () => navigate("signup")],
                ] as const
              ).map(([label, onClick]) => (
                <li key={label}>
                  <button
                    type="button"
                    onClick={onClick}
                    className="group relative text-sm font-medium text-white transition-colors hover:text-[#c9903d]"
                  >
                    <span className="relative">
                      {label}
                      <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-[#c9903d] transition-all duration-300 group-hover:w-full" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Contact + certification seals column */}
          <motion.div
            {...reveal(0.16)}
            className="sm:col-span-4 sm:border-l sm:border-white/15 sm:pl-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-parchment/60">
                  Contact
                </p>
                <ul className="mt-4 space-y-3 text-sm font-medium text-parchment/70">
                  <li>(02) 8837-0431</li>
                  <li>mirdc@dost.gov.ph</li>
                  <li>Mon–Fri, 8AM–5PM</li>
                </ul>
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                {/* CIP-ISO seal gets a white box bg so its transparent areas read clearly */}
                <img
                  src="/CIP-ISO-seal.png"
                  alt="CIP ISO Seal"
                  className="size-12 bg-white object-contain p-0.5 sm:size-14"
                />
                <img
                  src="/TPS-seal.png"
                  alt="TPS Seal"
                  className="size-12 w-auto object-contain sm:h-14 sm:w-auto"
                />
                <img
                  src="/DOST-DPO-seal.png"
                  alt="DOST Data Privacy Office Seal"
                  className="size-12 w-auto object-contain sm:h-14 sm:w-auto"
                />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Bottom bar — copyright + data privacy line */}
        <div className="mt-10 flex flex-col items-start gap-2 border-t border-white/15 pt-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p className="text-xs font-medium text-parchment/50">
            © {new Date().getFullYear()} DOST-MIRDC. All rights reserved.
          </p>
          <p className="text-xs font-medium text-parchment/40">
            Protected under RA 10173
          </p>
        </div>
      </motion.div>
    </footer>
  );
}
