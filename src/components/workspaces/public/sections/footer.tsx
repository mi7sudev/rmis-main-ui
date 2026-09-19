"use client";

// ============================================================================
// FOOTER — premium animated (Accenture-inspired navy canvas).
// - Top: infinite gold marquee divider (matches section rhythm, via the
//   shared MarqueeDivider)
// - Columns: staggered whileInView reveal (opacity + y)
// - Seals: scale-in on scroll-into-view
// - Bottom row: fade-up
// ============================================================================

import { useNav } from "@/components/nav-provider";
import Image from "next/image";
import { motion } from "motion/react";
import { MarqueeDivider } from "@/components/workspaces/public/sections/marquee-divider";

export function PublicFooter() {
  const { navigate } = useNav();

  return (
    <footer className="relative overflow-hidden bg-[#112E81] text-white">
      {/* Top marquee — gold ticker, same rhythm as the section dividers */}
      <MarqueeDivider
        items={["Recruitment Management & Information System", "DOST-MIRDC", "Build a career that moves the nation forward", "Protected under RA 10173"]}
        separator="✦"
        speed={48}
        inkClassName="text-[#E8A317]"
        itemClassName="text-[10px] font-semibold uppercase tracking-[0.2em] sm:text-xs"
        className="border-b border-white/15 py-3"
      />
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
        }}
        className="relative z-10 mx-auto max-w-[1400px] 2xl:max-w-[1680px] px-4 py-10 sm:px-6 sm:py-12 lg:px-8"
      >
        {/* Top row — compressed: brand (5) | Links (3) | Contact + seals (4) */}
        <div className="grid gap-6 sm:grid-cols-12 sm:gap-8">
          {/* First column — logos + description. GovPH seal watermark sits
              BEHIND this text block, pulled lower to peek below the text. */}
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
            }}
            className="relative sm:col-span-5"
          >
            {/* GovPH seal — watermark behind the description text.
                Pulled lower (-bottom-20 sm:-bottom-24) so it peeks further
                below the "DOST Compound" line as requested. */}
            <div className="pointer-events-none absolute -bottom-20 left-0 z-0 opacity-[0.10] sm:-bottom-24">
              <Image
                src="/govph-seal-mono-footer.jpg"
                alt=""
                width={400}
                height={400}
                className="h-48 w-48 object-contain sm:h-56 sm:w-56 lg:h-64 lg:w-64"
                aria-hidden
              />
            </div>
            {/* Content — z-10 so it sits above the watermark */}
            <div className="relative z-10">
              <div className="flex items-center gap-3">
                <img src="/MIRDC.png" alt="MIRDC" className="h-9 w-auto object-contain sm:h-12" />
                <img src="/RMIS.png" alt="RMIS" className="w-11 h-auto object-contain sm:w-12 sm:h-12" />
              </div>
              <p className="mt-3 max-w-sm text-xs leading-relaxed text-white/60 sm:mt-4 sm:text-sm">
                Recruitment Management & Information System. DOST-Metals
                Industry Research and Development Center.
              </p>
              <p className="mt-1.5 text-xs text-white/50 sm:mt-2 sm:text-sm">
                DOST Compound, Bicutan, Taguig City
              </p>
            </div>
          </motion.div>
          {/* Links column */}
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
            }}
            className="sm:col-span-3 sm:border-l sm:border-white/15 sm:pl-8"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">Links</p>
            <ul className="mt-3 space-y-2 sm:mt-4 sm:space-y-3">
              <li><button onClick={() => navigate("jobs")} className="group relative text-sm font-medium text-white transition-colors hover:text-[#E8A317]"><span className="relative">Browse positions<span className="absolute -bottom-0.5 left-0 h-px w-0 bg-[#E8A317] transition-all duration-300 group-hover:w-full" /></span></button></li>
              <li><button onClick={() => navigate("signin")} className="group relative text-sm font-medium text-white transition-colors hover:text-[#E8A317]"><span className="relative">Sign in<span className="absolute -bottom-0.5 left-0 h-px w-0 bg-[#E8A317] transition-all duration-300 group-hover:w-full" /></span></button></li>
              <li><button onClick={() => navigate("signup")} className="group relative text-sm font-medium text-white transition-colors hover:text-[#E8A317]"><span className="relative">Create account<span className="absolute -bottom-0.5 left-0 h-px w-0 bg-[#E8A317] transition-all duration-300 group-hover:w-full" /></span></button></li>
            </ul>
          </motion.div>
          {/* Contact column + seals — seals sit to the right of Contact */}
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
            }}
            className="flex items-start justify-between gap-4 sm:col-span-4 sm:border-l sm:border-white/15 sm:pl-8"
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">Contact</p>
              <ul className="mt-3 space-y-2 text-sm font-medium text-white/60 sm:mt-4 sm:space-y-3">
                <li>(02) 8837-0431</li>
                <li>mirdc@dost.gov.ph</li>
                <li>Mon–Fri, 8AM–5PM</li>
              </ul>
            </div>
            {/* Certification & compliance seals — scale-in on reveal */}
            <motion.div
              variants={{
                hidden: { opacity: 0, scale: 0.6 },
                visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
              }}
              className="flex flex-shrink-0 items-center gap-2 sm:gap-3"
            >
              {/* CIP-ISO seal gets a white box bg so its transparent areas read clearly */}
              <img src="/CIP-ISO-seal.png" alt="CIP ISO Seal" className="size-12 bg-white object-contain p-0.5 sm:size-16" />
              <img src="/TPS-seal.png" alt="TPS Seal" className="size-12 w-auto object-contain sm:h-16 sm:w-auto" />
              <img src="/DOST-DPO-seal.png" alt="DOST Data Privacy Office Seal" className="size-12 w-auto object-contain sm:h-16 sm:w-auto" />
            </motion.div>
          </motion.div>
        </div>
        {/* Bottom row — copyright + RA 10173 only (seals moved up to Contact row) */}
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 16 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
          }}
          className="mt-8 flex flex-col items-start gap-3 border-t border-white/15 pt-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        >
          <p className="text-xs font-medium text-white/50">
            © {new Date().getFullYear()} DOST-MIRDC. All rights reserved.
          </p>
          <p className="text-xs font-medium text-white/40">
            Protected under RA 10173
          </p>
        </motion.div>
      </motion.div>
    </footer>
  );
}
