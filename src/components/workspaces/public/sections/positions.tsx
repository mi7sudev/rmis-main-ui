"use client";

// ============================================================================
// 01. POSITIONS — THE frontpage body. Jobs-first:
//
//   1. GOLD TICKER — slim MarqueeDivider band (reduced-motion aware).
//   2. OPEN POSITIONS — the JobsCarousel grid (first 12 · filter chips ·
//      view-all redirect to the full board).
//
// RMIS × Accenture: token canvas, sharp 0px corners, depth = colour-blocking,
// never shadows; electric blue #1591DC rationed to CTA / links / rules.
//
// States (the section renders nothing until the fetch resolves — that would
// leave a blank frontpage, so all three states are handled here):
//   loading → JobsSkeleton grid
//   empty   → sharp EmptyResult ("no open positions")
//   ready   → JobsCarousel
// ============================================================================

import { useNav } from "@/components/nav-provider";
import { apiFetch } from "@/lib/client";
import { useEffect, useState } from "react";
import { JobsCarousel } from "@/components/workspaces/public/jobs-carousel";
import { MarqueeDivider } from "@/components/workspaces/public/sections/marquee-divider";
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
    <>
      {/* ===== GOLD TICKER — slim rhythm band above the grid ===== */}
      <div aria-hidden className="border-b border-border bg-background py-3">
        <MarqueeDivider
          items={[
            "Apply",
            "Track",
            "Advance",
            "DOST-MIRDC",
            "Recruitment Management & Information System",
            "Build a career that moves the nation forward",
          ]}
          separator="✦"
          speed={48}
          inkClassName="text-gold"
          itemClassName="text-[10px] font-semibold uppercase tracking-[0.2em] sm:text-xs"
        />
      </div>

      {/* ===== OPEN POSITIONS — the jobs showcase ===== */}
      <section
        id="open-positions"
        className="scroll-mt-24 flex flex-1 flex-col border-b border-border bg-background"
      >
        <div className="mx-auto w-full max-w-[1400px] 2xl:max-w-[1680px] flex-1 px-4 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-12 lg:px-8 lg:pb-20">
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

    </>
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
          <Skeleton className="mt-4 h-10 w-56 max-w-full sm:h-12" />
          <Skeleton className="mt-4 h-3 w-52 max-w-full" />
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
