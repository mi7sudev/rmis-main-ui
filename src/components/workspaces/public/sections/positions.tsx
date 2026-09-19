"use client";

// ============================================================================
// 01. POSITIONS — THE frontpage. Jobs-first: this is now the ONLY section on
// the public landing, rendered directly under the SiteHeader.
//
// RMIS × Accenture: token canvas (black sheet / light sheet), a 2px electric-
// blue top rule, gold heritage kicker, display-hero headline, then a PREMIUM
// 4-column grid of LIGHT colour-block job cards (.block-surface → #F1F1EF +
// black ink in light mode / charcoal + white ink in dark mode) — the first 12
// positions above the fold (3 rows × 4 columns), with "View all N
// positions" redirecting to the full Job Opportunities board (02. Open
// Positions) rather than expanding the list in place.
//
// States (the old section rendered nothing until the fetch resolved — that
// would leave a blank frontpage, so all three states are handled here):
//   loading → sharp bg-muted skeleton grid matching the cards layout
//   empty   → sharp EmptyResult ("no open positions")
//   ready   → JobsCarousel (first-12 grid · sharp filter chips · view-all
//             redirect)
// ============================================================================

import { useNav } from "@/components/nav-provider";
import { apiFetch } from "@/lib/client";
import { useEffect, useState } from "react";
import { JobsCarousel } from "@/components/workspaces/public/jobs-carousel";
import EmptyResult from "@/components/ui/empty-result";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchX } from "lucide-react";
import type { Job } from "@/lib/wire";

export function PositionsSection() {
  const { navigate } = useNav();
  const [jobs, setJobs] = useState<Job[] | null>(null); // null = still loading

  useEffect(() => {
    let alive = true;
    apiFetch<Job[]>("/api/jobs")
      .then((d) => {
        if (alive) setJobs(Array.isArray(d) ? d : []);
      })
      .catch(() => {
        if (alive) setJobs([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="flex flex-1 flex-col border-b border-border bg-background">
      {/* 2px electric-blue rule — Accenture colour-blocking accent, used once */}
      <div aria-hidden className="h-0.5 w-full bg-primary" />

      {/* ===== LEAD BAND — compact support line (hero band removed) ===== */}
      <div className="mx-auto w-full max-w-[1400px] 2xl:max-w-[1680px] px-4 pb-6 pt-8 sm:px-6 sm:pb-8 sm:pt-10 lg:px-8">
        {/* Visually-hidden page heading — keeps the document outline intact
            now that the display hero is gone. */}
        <h1 className="sr-only">Careers at MIRDC — find your future</h1>
        <p className="max-w-xl text-base leading-relaxed text-foreground/60 sm:text-lg">
          Open positions at the Metals Industry Research and Development Center
          (DOST-MIRDC). Browse the current vacancies and apply before the deadline.
        </p>
      </div>

      <div className="mx-auto w-full max-w-[1400px] 2xl:max-w-[1680px] flex-1 px-4 pb-12 pt-8 sm:px-6 sm:pb-16 sm:pt-10 lg:px-8 lg:pb-20">
        {jobs === null ? (
          <JobsSkeleton />
        ) : jobs.length === 0 ? (
          <EmptyResult
            title="No open positions right now"
            description="All current vacancies have closed. Please check back soon — new positions are posted as they open."
            className="py-16 sm:py-24"
          >
            <div className="mb-4 grid size-14 place-items-center border border-border bg-secondary text-primary">
              <SearchX className="size-6" strokeWidth={1.5} />
            </div>
          </EmptyResult>
        ) : (
          <JobsCarousel
            jobs={jobs}
            onNavigateJob={(id) => navigate("jobs", { job: String(id) })}
            onViewAll={() => navigate("jobs")}
          />
        )}
      </div>
    </section>
  );
}

// ============================================================================
// Loading skeleton — mirrors the grid layout (header row + sharp filter
// chips + the first three rows of colour-block cards) so the hand-off
// to the real content is seamless.
// ============================================================================
function JobsSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      {/* Header row */}
      <div className="mb-8 flex items-end justify-between border-b border-border pb-8 sm:mb-10">
        <div className="w-full max-w-md">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-4 h-14 w-72 max-w-full sm:h-20" />
          <Skeleton className="mt-4 h-3 w-52 max-w-full" />
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <Skeleton className="size-11" />
          <Skeleton className="size-11" />
          <Skeleton className="h-11 w-40" />
        </div>
      </div>

      {/* Filter chips — single-line rail on mobile, wrapped row on sm+ */}
      <div className="mb-6 flex flex-nowrap gap-2 overflow-hidden">
        <Skeleton className="h-12 w-32 shrink-0" />
        <Skeleton className="h-12 w-44 shrink-0" />
        <Skeleton className="h-12 w-40 shrink-0" />
      </div>

      {/* Cards — the canonical first-12 grid shape (3 rows × 4 columns on xl) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => (
          <div key={i} className="h-[320px] overflow-hidden border border-border">
            <Skeleton className="size-full" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading open positions…</span>
    </div>
  );
}
