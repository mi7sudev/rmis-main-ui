"use client";

import { useState, useSyncExternalStore } from "react";
import { useSession } from "@/components/session-provider";
import { NavRail, MobileNav } from "@/components/shell/nav-rail";
import { WorkspaceHeader } from "@/components/shell/workspace-header";
import { Footer } from "@/components/footer";
import { useNav } from "@/components/nav-provider";

// ---- Unified public header (shared with landing / jobs / signin) ---------
// The SiteHeader component (in src/components/site-header.tsx) renders the
// same topbar used on the frontpage — logos + animated Positions hover +
// Sign In / Dashboard CTA. On the jobs board the Positions link is hidden
// so there's no duplicate "Browse Positions" button.
import { SiteHeader } from "@/components/site-header";

function AuthedShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex min-h-dvh bg-background">
      <NavRail />
      <MobileNav open={mobileOpen} onOpenChange={setMobileOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <WorkspaceHeader onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </div>
  );
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

// Routes that render bare (full-bleed, no shell chrome) — the landing page
// has its own header/footer, and auth views are self-contained.

/**
 * AppShell — compact nav rail workspace (authed) or public shell (logged out).
 * - The public landing page is fully self-contained (own header/footer).
 * - Auth views (signin/signup) render bare — they include their own SiteHeader.
 * - Other logged-out pages (jobs board) get the public shell with SiteHeader.
 * - Authenticated users get the full workspace shell (nav rail + workspace header).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  const { view } = useNav();
  // Defer view-dependent branching until after mount to avoid hydration
  // mismatches (the server can't read window.location.hash). Uses
  // useSyncExternalStore — the server snapshot is `false` (not mounted), so
  // the first client render matches the server render; the real client value
  // (`true`) is used on the next render.
  const mounted = useSyncExternalStore(noopSubscribe, getTrue, getFalse);

  // Before mount (SSR + first client render), render a neutral shell.
  if (loading || !mounted) {
    return <PublicShell>{children}</PublicShell>;
  }

  // The public landing page is fully self-contained — render bare full-bleed
  if (!user && view === "home") {
    return <div className="min-h-dvh bg-background">{children}</div>;
  }

  // Auth views render bare (they include their own SiteHeader)
  if (!user && (view === "signin" || view === "signup")) {
    return <div className="min-h-dvh bg-background">{children}</div>;
  }

  // Jobs board gets the public shell with SiteHeader
  if (!user && view === "jobs") {
    return <PublicShell>{children}</PublicShell>;
  }

  // Every OTHER logged-out deep link (e.g. #/job?id=4, #/recruitment) renders
  // the self-contained PublicLanding via the Router's fallback — wrapping it
  // in PublicShell too would stack a SECOND SiteHeader above the landing's
  // own chrome. Bare wrapper keeps a single header.
  if (!user) {
    return <div className="min-h-dvh bg-background">{children}</div>;
  }

  // Authenticated users get the full workspace shell
  return <AuthedShell>{children}</AuthedShell>;
}

// Stable helpers for the mounted flag (must be stable references to avoid
// re-subscribing on every render).
const noopSubscribe = () => () => {};
const getTrue = () => true;
const getFalse = () => false;
