"use client";

// ============================================================================
// 01. POSITIONS — THE frontpage body. Jobs-first with an editorial frame:
//
//   1. LANDING HERO — asymmetric 7/5 split: gold kicker → display headline
//      (the RMIS tagline) → standfirst → CTA pair (scroll-to-grid + how-to-
//      apply) on the left; a LIVE SNAPSHOT panel on the right computing real
//      figures from the jobs payload (open positions, hiring divisions,
//      closing soonest, salary-grade range). Panel = flat block-surface slab
//      with the 2px momentum rule at rest.
//   2. GOLD TICKER — slim MarqueeDivider band (reduced-motion aware).
//   3. OPEN POSITIONS — the JobsCarousel grid (first 12 · filter chips ·
//      view-all redirect to the full board).
//   4. HOW TO APPLY — 3-step band with account CTAs (how-to-apply.tsx).
//
// RMIS × Accenture: token canvas, sharp 0px corners, depth = colour-blocking,
// never shadows; electric blue #1591DC rationed to CTA / links / rules.
//
// States (the old section rendered nothing until the fetch resolved — that
// would leave a blank frontpage, so all three states are handled here):
//   loading → hero stats skeleton + JobsSkeleton grid
//   empty   → hero (zeros) + sharp EmptyResult ("no open positions")
//   ready   → hero (live figures) + JobsCarousel
// ============================================================================

import { useNav } from "@/components/nav-provider";
import { apiFetch } from "@/lib/client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { JobsCarousel } from "@/components/workspaces/public/jobs-carousel";
import { HowToApply } from "@/components/workspaces/public/sections/how-to-apply";
import { MarqueeDivider } from "@/components/workspaces/public/sections/marquee-divider";
import EmptyResult from "@/components/ui/empty-result";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, SearchX } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import type { Job } from "@/lib/wire";

// ----------------------------------------------------------------------------
// Live-snapshot figures — computed from the same payload the grid renders, so
// the hero can never disagree with the list below it.
// ----------------------------------------------------------------------------
type LandingStats = {
  total: number;
  divisions: number;
  soonest: string;
  grades: string;
};

const EMPTY_STATS: LandingStats = {
  total: 0,
  divisions: 0,
  soonest: "—",
  grades: "—",
};

function computeStats(jobs: Job[]): LandingStats {
  const total = jobs.length;
  const divisions = new Set(
    jobs.map((j) => j.position?.division).filter(Boolean)
  ).size;

  const now = Date.now();
  const futureDeadlines = jobs
    .map((j) => j.deadlineDate)
    .filter(Boolean)
    .map((d) => new Date(d as string).getTime())
    .filter((t) => !Number.isNaN(t) && t >= now);
  const soonest = futureDeadlines.length
    ? new Date(Math.min(...futureDeadlines)).toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
      })
    : "—";

  const grades = jobs
    .map((j) => Number(j.position?.salaryGrade))
    .filter((g) => Number.isFinite(g) && g > 0);
  const gradeRange = grades.length
    ? `SG-${Math.min(...grades)}–SG-${Math.max(...grades)}`
    : "—";

  return { total, divisions, soonest, grades: gradeRange };
}

export function PositionsSection() {
  const { navigate } = useNav();
  const reduced = useReducedMotion();
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

  const stats = useMemo(() => computeStats(jobs ?? []), [jobs]);

  // Anchor scrolls — the hero CTAs stay on-page (the grid IS the showcase);
  // "Browse all" hands off to the full Job Opportunities board.
  const scrollToId = (id: string) =>
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });

  return (
    <>
      {/* ===== HERO — agency identity + live snapshot ===== */}
      <section className="border-b border-border bg-background">
        {/* 2px electric-blue rule — Accenture colour-blocking accent, used once */}
        <div aria-hidden className="h-0.5 w-full bg-primary" />

        <div className="mx-auto w-full max-w-[1400px] 2xl:max-w-[1680px] px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 py-10 sm:py-14 lg:grid-cols-12 lg:gap-12 lg:py-20">
            <HeroLead
              onBrowse={() => scrollToId("open-positions")}
              onHow={() => scrollToId("how-to-apply")}
            />
            <SnapshotPanel
              stats={stats}
              loading={jobs === null}
              onBrowseAll={() => navigate("jobs")}
            />
          </div>
        </div>
      </section>

      {/* ===== GOLD TICKER — slim rhythm band between hero and grid ===== */}
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

      {/* ===== HOW TO APPLY — 3-step band + account CTAs ===== */}
      <HowToApply
        onSignUp={() => navigate("signup")}
        onSignIn={() => navigate("signin")}
      />
    </>
  );
}

// ----------------------------------------------------------------------------
// HeroLead — left column. Kicker → display headline (established RMIS
// tagline) → standfirst naming the agency in full → CTA pair. Staggered
// fade-up on load, instant under reduced motion.
// ----------------------------------------------------------------------------
function HeroLead({
  onBrowse,
  onHow,
}: {
  onBrowse: () => void;
  onHow: () => void;
}) {
  const reduced = useReducedMotion();
  const rise = (delay: number) => ({
    initial: reduced ? false : ({ opacity: 0, y: 18 } as const),
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] as const },
  });

  return (
    <div className="lg:col-span-7">
      <motion.p {...rise(0)} className="kicker kicker-gold">
        DOST-MIRDC · Careers
      </motion.p>

      <motion.h1
        {...rise(0.08)}
        className="display-xl mt-4 max-w-[16ch] text-foreground"
      >
        Build a career that moves the nation forward.
      </motion.h1>

      <motion.p
        {...rise(0.16)}
        className="standfirst mt-5 max-w-xl text-lg text-muted-foreground"
      >
        The Metals Industry Research and Development Center (DOST-MIRDC) is
        hiring. Browse the current plantilla vacancies and submit your
        application before the posting deadline.
      </motion.p>

      <motion.div
        {...rise(0.24)}
        className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <button
          type="button"
          onClick={onBrowse}
          className="group inline-flex h-12 items-center justify-center gap-2.5 rounded-full bg-primary px-8 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          Browse open positions
          <ArrowRight
            className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
            strokeWidth={2.5}
          />
        </button>
        <button
          type="button"
          onClick={onHow}
          className="inline-flex h-12 items-center justify-center rounded-full border border-input px-8 text-sm font-medium text-foreground transition-colors hover:border-input-hover"
        >
          How to apply
        </button>
      </motion.div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// SnapshotPanel — right column. Flat block-surface slab (white on the light
// canvas / ember #242424 on obsidian) with the 2px momentum rule at rest and
// live figures computed from the jobs payload.
// ----------------------------------------------------------------------------
function SnapshotPanel({
  stats,
  loading,
  onBrowseAll,
}: {
  stats: LandingStats;
  loading: boolean;
  onBrowseAll: () => void;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.aside
      initial={reduced ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      aria-label="Live recruitment statistics"
      className="lg:col-span-5"
    >
      <div className="block-surface relative overflow-hidden border border-border">
        {/* Momentum rule at rest — same 2px device the cards sweep on hover */}
        <div aria-hidden className="h-0.5 w-full bg-primary" />

        <div className="p-6 sm:p-8">
          <p className="kicker kicker-gold">Live snapshot</p>

          {loading ? (
            <div className="mt-6 space-y-6" aria-live="polite">
              <div className="flex items-end gap-4">
                <Skeleton className="h-14 w-24" />
                <div className="space-y-2 pb-1">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6 border-t border-foreground/10 pt-6">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
              <span className="sr-only">Loading statistics…</span>
            </div>
          ) : (
            <>
              <div className="mt-6 flex items-end gap-4">
                <span className="stat-numeral text-6xl text-foreground sm:text-7xl">
                  {stats.total}
                </span>
                <div className="pb-1.5">
                  <p className="text-sm font-medium text-foreground">
                    {stats.total === 1 ? "position" : "positions"} open
                  </p>
                  <p className="text-sm text-muted-foreground">
                    across {stats.divisions} hiring{" "}
                    {stats.divisions === 1 ? "division" : "divisions"}
                  </p>
                </div>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-6 border-t border-foreground/10 pt-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    Closing soonest
                  </p>
                  <p className="mt-1.5 text-lg font-medium text-foreground">
                    {stats.soonest}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    Salary grades
                  </p>
                  <p className="mt-1.5 text-lg font-medium text-foreground">
                    {stats.grades}
                  </p>
                </div>
              </div>
            </>
          )}

          <div className="mt-8 border-t border-foreground/10 pt-5">
            <button
              type="button"
              onClick={onBrowseAll}
              className="link-arrow text-sm text-brand-light transition-colors hover:text-brand"
            >
              Browse all positions on the board
            </button>
          </div>
        </div>
      </div>
    </motion.aside>
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
