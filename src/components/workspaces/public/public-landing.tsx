"use client";

// ============================================================================
// RMIS — Public Landing (JOBS-FIRST refactor)
// RMIS × Accenture design language: black #000000 canvas, white ink, sharp
// 0px corners, electric blue #1591DC as the only interactive accent, royal
// gold #E8A317 reserved for tiny heritage kickers. Depth = colour-blocking,
// never shadows.
//
// The frontpage now showcases ONLY the open positions. All former editorial
// sections were removed per the jobs-first redesign:
//   ✗ Hero (sections/hero.tsx)
//   ✗ ShowcaseBanner (sections/showcase-banner.tsx)
//   ✗ Marquee dividers (sections/marquee-divider.tsx)
//   ✗ Method (sections/method.tsx)
//   ✗ Life (sections/life.tsx)
//   ✗ CinematicShowcase (ui/motion/cinematic-showcase.tsx)
//   ✗ Facilities (sections/facilities.tsx)
//   ✗ PublicFooter (sections/footer.tsx)
//   ✗ PageLoader branded preloader
//
// COMPOSITION (top → bottom):
//   1. SiteHeader          — unified topbar (logo + Positions + Sign In)
//   2. PositionsSection    — the jobs showcase (hero band + carousel)
// ============================================================================

import { SiteHeader } from "@/components/site-header";
import { PositionsSection } from "@/components/workspaces/public/sections/positions";

export function PublicLanding() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {/* ===== HEADER — unified SiteHeader (same as jobs board + auth) ===== */}
      <SiteHeader />

      {/* ===== JOBS — the entire page body, starting directly under the header ===== */}
      <main className="flex flex-1 flex-col">
        <PositionsSection />
      </main>
    </div>
  );
}
