"use client";

import Image from "next/image";
import { ShieldCheck } from "lucide-react";

// ============================================================================
// Footer — app-wide footer in the Accenture design language: electric-blue
// top rule, generous padding. Theme-aware canvas: soft off-white panel with
// grey ink in light mode, black canvas with white/grey ink in dark mode.
// Rendered as the last child of min-h-screen flex column shells — `mt-auto`
// keeps it pinned to the bottom on short pages. DO NOT remove mt-auto / relative.
// ============================================================================
export function Footer() {
  return (
    <footer className="relative mt-auto overflow-hidden border-t-2 border-primary bg-card dark:bg-[#101216]">
      {/* GovPH seal — bottom-left watermark behind text */}
      <div className="pointer-events-none absolute bottom-0 left-0 z-0 opacity-10">
        <Image
          src="/govph-seal-mono-footer.jpg"
          alt=""
          width={320}
          height={320}
          className="h-40 w-40 object-contain dark:invert sm:h-56 sm:w-56"
          aria-hidden
        />
      </div>

      {/* Footer content — z-10 so it sits above the seal */}
      <div className="relative z-10 mx-auto max-w-[1400px] 2xl:max-w-[1680px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex max-w-2xl items-start gap-3 text-xs leading-relaxed text-muted-foreground dark:text-[#A6A6A6]">
            {/* Icon chip — sharp square block */}
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-none border border-border bg-background text-gold dark:bg-secondary">
              <ShieldCheck className="size-4" />
            </span>
            <p>
              Protected under the Data Privacy Act of 2012 (RA 10173). Personal
              information is used solely for recruitment and is accessible only to
              authorized DOST-MIRDC personnel.
            </p>
          </div>
          <p className="shrink-0 text-xs font-semibold tracking-[0.08em] text-muted-foreground dark:text-[#A6A6A6] uppercase">
            © {new Date().getFullYear()} DOST-MIRDC · RMIS
          </p>
        </div>
      </div>
    </footer>
  );
}
