"use client";

// ============================================================================
// RMIS — Public Landing (jobs-first)
// RMIS × Accenture design language: token canvas, white/charcoal ink blocks,
// sharp 0px corners, electric blue #1591DC as the only interactive accent,
// royal gold reserved for heritage kickers. Depth = colour-blocking, never
// shadows.
//
// COMPOSITION (top → bottom):
//   1. SiteHeader          — unified topbar (logo + Positions + Sign In)
//   2. PositionsSection    — gold ticker → jobs showcase grid
//   3. Footer              — app-wide footer (same as every other page)
// ============================================================================

import { SiteHeader } from "@/components/site-header";
import { PositionsSection } from "@/components/workspaces/public/sections/positions";
import { Footer } from "@/components/footer";

export function PublicLanding() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {/* ===== HEADER — unified SiteHeader (same as jobs board + auth) ===== */}
      <SiteHeader />

      {/* ===== BODY — ticker + positions grid ===== */}
      <main className="flex flex-1 flex-col">
        <PositionsSection />
      </main>

      {/* ===== FOOTER — app-wide footer (mt-auto pins it on short pages) ===== */}
      <Footer />
    </div>
  );
}
