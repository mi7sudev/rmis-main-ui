"use client";

// ============================================================================
// RMIS — Public Landing (jobs-first + editorial frame)
// RMIS × Accenture design language: token canvas, white/charcoal ink blocks,
// sharp 0px corners, electric blue #1591DC as the only interactive accent,
// royal gold reserved for heritage kickers. Depth = colour-blocking, never
// shadows.
//
// COMPOSITION (top → bottom):
//   1. SiteHeader          — unified topbar (logo + Positions + Sign In)
//   2. PositionsSection    — hero band (agency identity + live snapshot
//                            panel) → gold ticker → jobs showcase →
//                            how-to-apply band
//   3. PublicFooter        — deep-moss institutional footer
// ============================================================================

import { SiteHeader } from "@/components/site-header";
import { PositionsSection } from "@/components/workspaces/public/sections/positions";
import { PublicFooter } from "@/components/workspaces/public/sections/footer";

export function PublicLanding() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {/* ===== HEADER — unified SiteHeader (same as jobs board + auth) ===== */}
      <SiteHeader />

      {/* ===== BODY — hero + ticker + positions + how-to-apply ===== */}
      <main className="flex flex-1 flex-col">
        <PositionsSection />
      </main>

      {/* ===== FOOTER — institutional moss block (mt-auto pins it on short pages) ===== */}
      <PublicFooter />
    </div>
  );
}
