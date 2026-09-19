"use client";

// ============================================================================
// JobsCarousel — frontpage OPEN POSITIONS GRID.
//
// RMIS × Accenture language (token canvas · white/light ink · electric blue
// #1591DC · royal-gold kickers · sharp 0px corners · no shadows):
//   - A 4-COLUMN editorial grid (component name kept for call-site stability):
//     the first 12 positions render above the fold on desktop (3 rows × 4
//     columns) — no horizontal clipping, no scroll arrows.
//   - "View all N positions" LEAVES the frontpage for the full Job
//     Opportunities board (02. Open Positions) — the frontpage is a showcase
//     of the first 12, never an in-place expansion of the whole list.
//   - PREMIUM CARD anatomy (light .block-surface block, black ink in light
//     mode / charcoal block with white ink in dark mode):
//       1. momentum rule — a 2px electric-blue top bar that sweeps in from
//          the left on hover (Accenture's ">" motion language, colour only)
//       2. urgency countdown chip + ghost index numeral (01…12)
//       3. gold heritage division kicker (single line, ellipsed)
//       4. bold clamped position title on a fixed 2-line measure — salary
//          rows stay aligned across the grid row
//       5. hero salary in tabular figures + sharp SG-grade tag
//       6. meta rows — place of assignment, employment type/status, vacancies
//       7. hairline-divided footer: "View position" link-arrow + sliding
//          arrow affordance
//   - Hover = flat colour shift to background + hairline border (NO elevation),
//     so the card keeps its shape on the white LIGHT canvas too.
//   - Sharp filter chips by division (All / official division names).
// ============================================================================

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Clock, MapPin, Briefcase, Users } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { type Job as WireJob, type JobPosition as WireJobPosition } from "@/lib/wire";
import { divisionLabel } from "@/lib/divisions";

// Wire job (GET /api/jobs) narrowed to the card's fields. `position.placeOfAssignment`
// is a legacy optional read — the jobs route keeps the place at JOB level —
// so the "DOST Compound, Taguig" fallback below renders exactly as before.
type CarouselJob = Pick<
  WireJob,
  "id" | "title" | "positionType" | "numberOfVacancy" | "deadlineDate"
> & {
  position: (WireJobPosition & {
    placeOfAssignment?: { name: string | null } | null;
  }) | null;
};

// Positions shown before the "View all" expansion (3 rows × 4 columns).
const INITIAL_VISIBLE = 12;

// Full division names resolve through the shared official registry
// (@/lib/divisions) — sourced from the reference job bulletins.

function daysUntilDeadline(deadline: string | null): number | null {
  if (!deadline) return null;
  const now = new Date();
  const dl = new Date(deadline);
  const diff = dl.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function urgencyLabel(days: number | null): { text: string; tone: "urgent" | "warning" | "normal" | "closed" } {
  if (days === null) return { text: "Open", tone: "normal" };
  if (days < 0) return { text: "Closed", tone: "closed" };
  if (days === 0) return { text: "Closing today", tone: "urgent" };
  if (days <= 7) return { text: `Closing in ${days} day${days === 1 ? "" : "s"}`, tone: "urgent" };
  if (days <= 30) return { text: `${days} days left`, tone: "warning" };
  return { text: `${days} days left`, tone: "normal" };
}

// Urgency + employment-type chips INSIDE the light block-surface cards —
// sharp, dark-on-light chips (colour-blocking, not tinted pills). Tokens invert
// in dark mode so the chip stays readable on the charcoal block.
const TONE_STYLES: Record<string, string> = {
  urgent: "bg-[#E2062E] text-white",
  warning: "bg-foreground/10 text-foreground",
  normal: "bg-foreground/5 text-foreground/70",
  closed: "bg-foreground text-white/70",
};

function formatSalary(amount: number | null): string {
  if (!amount) return "Competitive";
  return `₱${amount.toLocaleString()}/mo`;
}

export function JobsCarousel({
  jobs,
  onNavigateJob,
  onViewAll,
}: {
  jobs: CarouselJob[];
  onNavigateJob: (id: number) => void;
  onViewAll: () => void;
}) {
  const reduced = useReducedMotion();

  // Filter state — "ALL" or a division code (frontpage facet showcase).
  const [filter, setFilter] = useState<string>("ALL");

  // Unique divisions present in the job list (for filter chips).
  const divisions = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach((j) => {
      const d = j.position?.division;
      if (d) set.add(d);
    });
    return Array.from(set).sort();
  }, [jobs]);

  // Filtered jobs.
  const visibleJobs = useMemo(() => {
    if (filter === "ALL") return jobs;
    return jobs.filter((j) => j.position?.division === filter);
  }, [jobs, filter]);

  const changeFilter = useCallback((next: string) => {
    setFilter(next);
  }, []);

  // The canonical first-12 view. The FULL list lives on the Job Opportunities
  // board — "View all N positions" navigates there instead of expanding here.
  const shownJobs = useMemo(
    () => visibleJobs.slice(0, INITIAL_VISIBLE),
    [visibleJobs]
  );

  return (
    <div>
      {/* Header row — gold kicker → display-xl headline → support sentence */}
      <div className="mb-10 border-b border-border pb-8 sm:mb-12">
        <div className="max-w-2xl">
          <p className="kicker kicker-gold">Open positions</p>
          <h2 className="display-xl mt-3 text-foreground">Open now</h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {jobs.length} active {jobs.length === 1 ? "position" : "positions"} · Apply before the deadline
          </p>
        </div>
      </div>

      {/* Filter chips — sharp tabs (active = primary block, NOT a pill).
          MOBILE: the official division names are long (registry mandates the
          full wording), so the chips form a single-line horizontally
          scrollable rail with edge-to-edge bleed instead of stacking into
          seven ~48px rows on a 390px screen. sm+ returns to a wrapped row. */}
      <div
        role="group"
        aria-label="Filter positions by division"
        className="-mx-4 mb-6 flex flex-nowrap gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:overflow-x-visible sm:px-0 sm:pb-0"
      >
        <FilterChip
          label="All Positions"
          count={jobs.length}
          active={filter === "ALL"}
          onClick={() => changeFilter("ALL")}
        />
        {divisions.map((d) => {
          const count = jobs.filter((j) => j.position?.division === d).length;
          return (
            <FilterChip
              key={d}
              label={divisionLabel(d) ?? d}
              count={count}
              active={filter === d}
              onClick={() => changeFilter(d)}
            />
          );
        })}
      </div>

      {/* Positions grid — 4 across on desktop (12 above the fold = 3 rows × 4 cols), 3/2/1 below */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <AnimatePresence mode="popLayout">
          {shownJobs.map((job, i) => (
            <motion.div
              key={job.id}
              layout
              initial={reduced ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
              transition={{ duration: 0.4, delay: Math.min(i, 8) * 0.05, ease: [0.22, 1, 0.36, 1] }}
              className="min-w-0"
            >
              <PositionCard job={job} index={i} onNavigate={() => onNavigateJob(job.id)} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* View-all — navigates to the full Job Opportunities board (02. Open
          Positions). The frontpage never unfolds the entire list in place. */}
      {visibleJobs.length > INITIAL_VISIBLE && (
        <div className="mt-10 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={onViewAll}
            className="group inline-flex h-12 items-center gap-2.5 border border-input px-8 text-sm font-semibold text-foreground transition-colors duration-200 hover:border-primary hover:bg-primary hover:text-white"
          >
            View all {visibleJobs.length} positions
            <ArrowRight
              className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
              strokeWidth={2.5}
            />
          </button>
          <p className="text-xs font-medium text-muted-foreground">
            Showing {INITIAL_VISIBLE} of {visibleJobs.length} open positions
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PositionCard — premium flat tile: momentum rule · ghost index · gold
// division kicker · clamped title on a fixed measure · hero salary ·
// meta rows · accent footer.
// ============================================================================
function PositionCard({
  job,
  index,
  onNavigate,
}: {
  job: CarouselJob;
  index: number;
  onNavigate: () => void;
}) {
  const days = daysUntilDeadline(job.deadlineDate);
  const urgency = urgencyLabel(days);
  const divLabel = divisionLabel(job.position?.division);
  const title = job.title || job.position?.positionTitle || "Position Title Unavailable";
  const salaryGrade = job.position?.salaryGrade ?? null;
  const employment = job.position?.positionStatus
    ? `${job.positionType || "Permanent"} · ${job.position.positionStatus}`
    : job.positionType || "Permanent";
  const vacancies = job.numberOfVacancy ?? null;

  return (
    <button
      type="button"
      onClick={onNavigate}
      aria-label={`View position: ${title}`}
      className="group/card block-surface relative flex h-full w-full cursor-pointer flex-col overflow-hidden border border-transparent p-6 text-left transition-colors duration-200 hover:border-border hover:bg-background"
    >
      {/* Momentum rule — 2px electric-blue sweep on hover (flat, no shadow) */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-primary transition-transform duration-300 ease-out group-hover/card:scale-x-100"
      />

      {/* Top row — urgency countdown chip + ghost index numeral */}
      <div className="flex items-start justify-between gap-3">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold ${TONE_STYLES[urgency.tone]}`}
        >
          <Clock className="size-3.5" strokeWidth={2.5} />
          {urgency.text}
        </span>
        <span aria-hidden className="text-sm stat-numeral text-foreground/20">
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>

      {/* Division label — heritage gold kicker, one line */}
      {divLabel && <p className="kicker kicker-gold mt-5 max-w-full truncate">{divLabel}</p>}

      {/* Job title — clamped on an em-based 2-line measure so grid rows align
          at every viewport width while the fluid text-lg title scales.
          Brand-blue underline (#1591DC via decoration-primary). */}
      <h3 className="mt-2 line-clamp-2 min-h-[2.75em] text-lg font-medium leading-snug tracking-[-0.01em] text-foreground underline decoration-primary decoration-2 underline-offset-4">
        {title}
      </h3>

      {/* Hero salary + sharp SG-grade tag */}
      <div className="mt-4 flex items-end justify-between gap-3">
        <span className="text-2xl stat-numeral text-foreground">
          {formatSalary(job.position?.salaryAmount ?? null)}
        </span>
        {salaryGrade && (
          <span className="border border-foreground/15 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
            SG-{salaryGrade}
          </span>
        )}
      </div>

      {/* Meta rows — place · employment · vacancies */}
      <div className="mt-3 space-y-1.5 text-sm font-medium text-foreground/60">
        <p className="flex min-w-0 items-center gap-1.5">
          <MapPin className="size-3.5 shrink-0" strokeWidth={2.5} />
          <span className="truncate">{job.position?.placeOfAssignment?.name || "DOST Compound, Taguig"}</span>
        </p>
        <p className="flex items-center gap-1.5">
          <Briefcase className="size-3.5 shrink-0" strokeWidth={2.5} />
          <span className="truncate">{employment}</span>
        </p>
        {vacancies !== null && (
          <p className="flex items-center gap-1.5">
            <Users className="size-3.5 shrink-0" strokeWidth={2.5} />
            <span>{vacancies} {vacancies === 1 ? "vacancy" : "vacancies"}</span>
          </p>
        )}
      </div>

      {/* Footer — hairline divider · momentum link · sliding arrow */}
      <div className="mt-auto pt-6">
        <div className="flex items-center justify-between border-t border-foreground/10 pt-4">
          <span className="link-arrow text-sm text-brand-light">View position</span>
          <ArrowRight className="size-4 text-foreground/30 transition-all duration-200 group-hover/card:translate-x-1 group-hover/card:text-brand-light" />
        </div>
      </div>
    </button>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex min-h-12 shrink-0 items-center gap-2 border px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-primary bg-primary text-white"
          : "border-input text-muted-foreground hover:border-input-hover hover:text-foreground"
      }`}
    >
      {/* Full official division names — visually capped so the chip row
          stays compact (the registry mandates the full wording itself).
          Mobile caps tighter so two chips peek per screen and the rail's
          scroll affordance is obvious. */}
      <span className="max-w-[10.5rem] truncate sm:max-w-[15rem]">{label}</span>
      <span className={`text-xs tabular-nums ${active ? "text-white/70" : "text-muted-foreground"}`}>
        {count}
      </span>
    </button>
  );
}
