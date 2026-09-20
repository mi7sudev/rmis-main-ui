"use client";

// ============================================================================
// RMIS — Job Postings (RMIS × Accenture language)
// Rebuilt from scratch. No master-detail split. Single-column sharp cards.
// Click a card → in-flow detail page inside the shell (single document
// scrollbar → Lenis smooth scrolling works everywhere).
// Mode-aware canvas (light :root / dark .dark token sheets) · electric blue
// #1591DC · gold kickers only · light colour-block job cards · sharp 0px
// corners · no shadows. Ink + status colours come from the token sheet.
// ============================================================================

import { Fragment, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { apiFetch, formatCurrency, formatDate } from "@/lib/client";
import { useNav } from "@/components/nav-provider";
import { useSession } from "@/components/session-provider";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Briefcase, MapPin, Calendar, Clock, Users, CheckCircle2, FileText,
  Building2, Banknote, GraduationCap, Award, BadgeCheck, Loader2, AlertCircle,
  XCircle, ArrowRight, ArrowLeft, ClipboardCheck, Trash2, X, Plus, Minus,
  Check, Search, RotateCcw, SlidersHorizontal, ChevronDown, ChevronUp,
} from "lucide-react";
import { SafeHtml } from "@/components/common/safe-html";
import { FastTrackApplyDialog } from "@/components/views/fast-track-apply-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { Reveal } from "@/components/ui/motion/reveal";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";
import { instantScrollTo } from "@/lib/scroll";
import { type Job as WireJob, type JobPosition as WireJobPosition } from "@/lib/wire";
import { divisionLabel } from "@/lib/divisions";
import { humanizeTitle } from "@/lib/humanize";
import {
  SummaryCell,
  DateCell,
  // The posting-body block is named DetailSection in the shared primitives
  // module (applicants' application-detail modal renders the same blocks);
  // aliased to the view's local register name.
  DetailSection as Section,
  ReqRow,
} from "@/components/primitives/job-detail-bits";

// Wire job (GET /api/jobs) + the two legacy optional reads this view still
// performs that the jobs route never fills: `position.placeOfAssignment`
// (the place is a JOB-level wire field) and `position.salaryStep` (the DB
// column is `positionSalaryStep`). Both stay optional so the existing
// fallback rendering paths behave exactly as before.
type JobView = Omit<WireJob, "position"> & {
  position: (WireJobPosition & {
    placeOfAssignment?: { name: string | null } | null;
    salaryStep?: string | null;
  }) | null;
};

export type JobDetailData = Pick<
  JobView,
  | "id" | "title" | "positionType" | "briefDescription" | "briefDescriptionHtml"
  | "dutiesResponsibilitiesHtml" | "compensationPackageHtml" | "otherQualificationsHtml"
  | "numberOfVacancy" | "publishDate" | "deadlineDate" | "processingDate"
  | "position" | "applications"
>;

const MQR_LABELS: Record<string, string> = {
  education: "Education",
  workExperience: "Work Experience",
  training: "Training",
  eligibility: "Eligibility",
};

// ============================================================================
// Job-search controls — the Accenture careers pattern: a sticky filter rail
// (Position search + Division facets with counts + Clear filters), a results
// toolbar ("N Results | Sort by …"), discrete sharp job cards with a square
// primary "+" quick-view button, and numbered pagination.
// Mobile grid uses grid-cols-[minmax(0,1fr)] — an implicit `auto` column
// lets long facet labels stretch the rail past the viewport (doc overflow).
// ============================================================================
type SortKey = "newest" | "deadline" | "salary";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "deadline", label: "Deadline" },
  { value: "salary", label: "Salary" },
];

const PAGE_SIZE = 8;

const PLACE_FALLBACK = "DOST Compound, Taguig";

/** Display + search share ONE place string, so the filter matches exactly what
 *  the card shows. Jobs without a place record resolve to the agency address. */
function jobPlace(job: JobView): string {
  return job.placeOfAssignment?.name ?? job.position?.placeOfAssignment?.name ?? PLACE_FALLBACK;
}

function jobDivision(job: JobView): string | null {
  return job.position?.division ?? null;
}

/** Compact pagination window — all pages when ≤7, else 1 … cur±1 … total. */
function pageWindow(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>(
    [1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total),
  );
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "ellipsis")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("ellipsis");
    out.push(p);
    prev = p;
  }
  return out;
}

// ============================================================================
// FilterGroup — collapsible facet group in the search rail. The brand-tone
// hairline under the group title is the Accenture divider (their purple
// rules, our #1591DC). ±/＋ icon marks the open state.
// ============================================================================
function FilterGroup({
  title, open, onToggle, children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="pt-7">
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between text-left">
        <span className="text-xl font-medium tracking-[-0.01em] text-foreground">{title}</span>
        <span className="grid size-7 place-items-center text-muted-foreground transition-colors hover:text-foreground">
          {open ? <Minus className="size-5" strokeWidth={2} /> : <Plus className="size-5" strokeWidth={2} />}
        </span>
      </button>
      <div aria-hidden className="mt-3.5 h-[2px] bg-primary/50" />
      {open && <div className="pt-5">{children}</div>}
    </div>
  );
}

// QuickFact — one definition-list cell of the card quick view: micro-kicker
// label over a semibold tabular value. `tone="danger"` flags a passed deadline.
function QuickFact({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div>
      <dt className="kicker text-muted-foreground">{label}</dt>
      <dd
        className={`mt-1.5 break-words text-base font-semibold tabular-nums tracking-[-0.01em] ${
          tone === "danger" ? "text-danger-ink" : "text-foreground"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export function JobsView() {
  const { navigate, params } = useNav();
  const { user, refresh: refreshSession } = useSession();
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<JobView | null>(null);
  const [applying, setApplying] = useState(false);
  const [appliedJobId, setAppliedJobId] = useState<number | null>(null);
  const [confirmApplyJob, setConfirmApplyJob] = useState<JobView | null>(null);
  const [cancelJob, setCancelJob] = useState<JobView | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [mqrFailure, setMqrFailure] = useState<{ jobTitle: string; results: Record<string, string> } | null>(null);
  // Fast-track "Apply with PDS" — opens when the applicant's profile is
  // incomplete so they can apply without manually filling the profile first.
  const [fastTrackJob, setFastTrackJob] = useState<JobView | null>(null);

  // ---- Accenture-style job search ----
  // Filter rail: division facet multi-select + position title search.
  // Toolbar: sort key. Cards: single expanded quick-view at a time.
  const [divisionFilter, setDivisionFilter] = useState<string[]>([]);
  const [positionQuery, setPositionQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [positionOpen, setPositionOpen] = useState(true);
  const [divisionOpen, setDivisionOpen] = useState(true);
  const resultsTopRef = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();

  // In-flow detail navigation: the detail page renders INSIDE the shell (no
  // fixed overlay), so the document — and therefore Lenis — owns scrolling.
  // One scrollbar, smooth scrolling everywhere. We remember the list's scroll
  // offset so "Back to Positions" restores exactly where the user came from.
  const returnScrollYRef = useRef(0);
  const prevActiveIdRef = useRef<number | null>(null);

  function openJob(job: JobView) {
    returnScrollYRef.current = window.scrollY;
    setActiveJob(job);
    setAppliedJobId(null);
  }

  function closeJob() {
    setActiveJob(null);
    setAppliedJobId(null);
  }

  // Scroll choreography, applied AFTER the DOM commit so the target page is
  // mounted when we jump:
  //   - opened / switched job → instant jump to the top of the detail page
  //   - closed → restore the exact list position the user came from
  // (instantScrollTo routes through Lenis, so the jump can never be fought
  // by a mid-flight smooth animation.)
  useEffect(() => {
    const id = activeJob?.id ?? null;
    const prev = prevActiveIdRef.current;
    prevActiveIdRef.current = id;
    if (id && id !== prev) {
      instantScrollTo(0);
    } else if (!id && prev != null) {
      instantScrollTo(returnScrollYRef.current);
    }
  }, [activeJob]);

  const load = useCallback(async (silent?: boolean) => {
    // Silent (focus/poll) refresh: no skeleton, no error clobber, and the
    // state swap only happens when the payload actually changed — keeping
    // references stable so dependent effects (deep-link ?job= matching)
    // never re-fire on a poll tick with unchanged data.
    const isSilent = silent === true;
    if (!isSilent) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await apiFetch<JobView[]>("/api/jobs");
      if (isSilent) {
        setJobs((prev) =>
          JSON.stringify(prev) === JSON.stringify(data) ? prev : data,
        );
      } else {
        setJobs(data);
        if (data.length && params.job) {
          const paramId = Number(params.job);
          if (Number.isFinite(paramId)) {
            const matched = data.find((j) => j.id === paramId);
            if (matched) setActiveJob(matched);
          }
        }
      }
    } catch (e) {
      if (!isSilent) setError(e instanceof Error ? e.message : "Failed to load jobs");
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [params.job]);

  useEffect(() => { load(); }, [load]);

  // Realtime-lite: newly published postings, deadline crossings and the
  // applicant's own application state stay fresh without a manual reload.
  useRefetchOnFocus(() => load(true), { pollMs: 20_000 });

  useEffect(() => {
    if (!params.job || !jobs.length) return;
    const paramId = Number(params.job);
    if (!Number.isFinite(paramId)) return;
    const matched = jobs.find((j) => j.id === paramId);
    if (matched) {
      setActiveJob(matched);
      setAppliedJobId(null);
    }
  }, [params.job, jobs]);

  // ---- Derived search state (pure, recomputed per render via memo) ----

  // Facet counts stay anchored to the FULL job list (Accenture behaviour:
  // counts describe the corpus, not the current slice).
  const divisionFacets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of jobs) {
      const d = jobDivision(j);
      if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const q = positionQuery.trim().toLowerCase();
    const selected = new Set(divisionFilter);
    const out = jobs.filter((j) => {
      if (selected.size && !selected.has(jobDivision(j) ?? "")) return false;
      if (q && !(j.position?.positionTitle || j.title || "").toLowerCase().includes(q)) return false;
      return true;
    });
    const ts = (s: string | null | undefined) => (s ? new Date(s).getTime() : NaN);
    out.sort((a, b) => {
      if (sortBy === "salary") {
        const av = a.position?.salaryAmount ?? null;
        const bv = b.position?.salaryAmount ?? null;
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return bv - av;
      }
      const key = sortBy === "deadline" ? "deadlineDate" : "publishDate";
      const at = ts(a[key]);
      const bt = ts(b[key]);
      if (Number.isNaN(at) && Number.isNaN(bt)) return 0;
      if (Number.isNaN(at)) return 1;
      if (Number.isNaN(bt)) return -1;
      return sortBy === "deadline" ? at - bt : bt - at;
    });
    return out;
  }, [jobs, divisionFilter, positionQuery, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedJobs = useMemo(
    () => filteredJobs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredJobs, safePage],
  );
  const activeFilterCount = divisionFilter.length + (positionQuery.trim() ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;

  // Any filter/sort change lands the user back on page 1.
  useEffect(() => {
    setPage(1);
  }, [divisionFilter, positionQuery, sortBy]);

  function toggleDivision(code: string) {
    setDivisionFilter((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  function clearFilters() {
    setDivisionFilter([]);
    setPositionQuery("");
    setPositionOpen(true);
    setDivisionOpen(true);
  }

  function goToPage(p: number) {
    setPage(p);
    setExpandedId(null);
    const el = resultsTopRef.current;
    if (el) instantScrollTo(el.getBoundingClientRect().top + window.scrollY - 96);
  }

  function requestApply(job: JobView) {
    if (!user) { toast.info("Please sign in to apply"); navigate("signin"); return; }
    if (String(user.role) !== "APPLICANT") { toast.error("Only applicants can apply for positions"); return; }
    // Government gate: applying requires a complete profile (enforced again
    // server-side). Incomplete applicants get the PDS fast-track — upload →
    // auto-fill → review & certify → apply — or can finish their profile
    // manually. Job browsing itself stays open to all.
    if (user.applicant && !user.applicant.isProfileComplete) {
      setFastTrackJob(job);
      return;
    }
    setConfirmApplyJob(job);
  }

  async function doApply(job: JobView) {
    // Safety net for a stale session: profile incomplete → fast-track.
    if (user?.applicant && !user.applicant.isProfileComplete) {
      setFastTrackJob(job);
      return;
    }
    setApplying(true);
    try {
      const mqr = await apiFetch<{ mqrResults: Record<string, string>; allMet: boolean }>(
        "/api/jobs/verify-mqr", { method: "POST", body: JSON.stringify({ jobId: job.id }) }
      );
      if (!mqr.allMet) {
        setMqrFailure({ jobTitle: job.position?.positionTitle || job.title || "this position", results: mqr.mqrResults });
        return;
      }
      await apiFetch("/api/jobs/apply", { method: "POST", body: JSON.stringify({ jobId: job.id }) });
      toast.success("Application submitted successfully!");
      setAppliedJobId(job.id);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to submit application.";
      // Fallback: the server still considers the profile incomplete → fast-track.
      if (/complete your profile/i.test(msg)) {
        setFastTrackJob(job);
        return;
      }
      toast.error(msg);
    } finally {
      setApplying(false);
    }
  }

  function requestCancel(job: JobView) { setCancelJob(job); }

  async function doCancel(job: JobView) {
    const appEntry = job.applications?.[0];
    const appId = appEntry ? Number(appEntry.id) : NaN;
    if (!Number.isFinite(appId)) { toast.error("Could not find the application to cancel."); return; }
    setCancelling(true);
    try {
      await apiFetch(`/api/applications/${appId}`, { method: "DELETE" });
      toast.success("Application cancelled successfully.");
      setAppliedJobId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel application.");
    } finally {
      setCancelling(false);
    }
  }

  // ---- Loading ----
  if (loading) {
    return (
      <div className="premium relative min-h-dvh bg-background text-foreground">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
          style={{ backgroundImage: "var(--pui-canvas)" }}
        />
        {/* Subtle fade-in while data loads (opacity only — house easing). */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 mx-auto max-w-[1400px] 2xl:max-w-[1680px] px-4 py-8 sm:px-6 lg:px-8"
        >
          <div className="border-b border-border pb-8">
            <p className="kicker kicker-gold">Open Positions</p>
            <div className="mt-3 h-12 w-72 animate-pulse bg-muted" />
          </div>
          {/* Skeleton mirrors the Accenture search layout: filter rail + toolbar + card stack */}
          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)] lg:gap-10 2xl:gap-14">
            <div className="hidden space-y-8 lg:block">
              <div className="flex items-center justify-between">
                <div className="h-8 w-20 animate-pulse bg-muted" />
                <div className="h-5 w-28 animate-pulse bg-muted" />
              </div>
              {[1, 2].map((g) => (
                <div key={g} className="space-y-4">
                  <div className="h-6 w-28 animate-pulse bg-muted" />
                  <div className="h-[2px] bg-primary/25" />
                  {g === 1 ? (
                    <div className="h-14 w-full animate-pulse bg-muted" />
                  ) : (
                    <div className="space-y-5">
                      {[1, 2, 3, 4, 5].map((r) => (
                        <div key={r} className="flex items-center gap-3.5">
                          <div className="size-5 shrink-0 animate-pulse bg-muted" />
                          <div className="h-5 flex-1 animate-pulse bg-muted" />
                          <div className="h-5 w-8 shrink-0 animate-pulse bg-muted" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div>
              <div className="flex items-center justify-between pb-6">
                <div className="h-8 w-28 animate-pulse bg-muted" />
                <div className="h-12 w-40 animate-pulse bg-muted" />
              </div>
              <div className="space-y-4 sm:space-y-5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-5 rounded-2xl border border-border bg-card px-6 py-7 sm:px-10">
                    <div className="min-w-0 flex-1 space-y-3.5">
                      <div className="h-7 w-3/4 animate-pulse rounded-md bg-muted" />
                      <div className="h-5 w-1/2 animate-pulse rounded-md bg-muted" />
                    </div>
                    <div className="size-11 shrink-0 animate-pulse rounded-xl bg-primary/20" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ---- Error ----
  if (error) {
    return (
      <div className="premium relative min-h-dvh bg-background text-foreground">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
          style={{ backgroundImage: "var(--pui-canvas)" }}
        />
        <div className="relative z-10 mx-auto max-w-[1400px] 2xl:max-w-[1680px] px-4 py-8 sm:px-6 lg:px-8">
          <div className="border-b border-border pb-8">
            <p className="kicker text-muted-foreground">Open Positions</p>
            <h1 className="display-xl mt-3 text-foreground">Job Opportunities</h1>
          </div>
          <div className="pui-card mt-8 p-12 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-[1rem] border border-destructive/40 bg-destructive/10 text-danger-ink">
              <AlertCircle className="size-6" strokeWidth={1.5} />
            </div>
            <h3 className="mt-4 text-xl font-medium tracking-[-0.01em]">Unable to load</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{error}</p>
            <Button onClick={() => void load()} className="mt-6">Try again</Button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Main ----
  return (
    <div className="premium relative min-h-dvh bg-background text-foreground">
      {/* Ambient brand wash — the same primary glow the profile and dashboard
          carry, so every applicant surface shares one canvas language. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{ backgroundImage: "var(--pui-canvas)" }}
      />
      {activeJob ? (
        /* ===== Job Detail — rendered IN-FLOW inside the shell (formerly a
           fixed inset-0 overlay with its own scrollbar — that duplicate
           scrollbar sat outside Lenis's window scroll, so smooth scrolling
           died on this page). Now the document scrolls: single scrollbar,
           Lenis glide throughout. ===== */
        <JobDetailView
          job={activeJob}
          applying={applying}
          applied={!!activeJob.applications?.length || appliedJobId === activeJob.id}
          onClose={closeJob}
          onApply={(j) => requestApply(j)}
          onCancel={(j) => requestCancel(j)}
          cancelling={cancelling}
        />
      ) : (
      <div className="relative z-10 mx-auto max-w-[1400px] 2xl:max-w-[1680px] px-4 py-8 sm:px-6 lg:px-8">
        {/* Hero header */}
        <header className="border-b border-border pb-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="kicker text-muted-foreground">Open Positions</p>
              <h1 className="display-xl mt-3 text-foreground">Job Opportunities</h1>
              <p className="mt-3 text-sm text-muted-foreground sm:text-base">
                {jobs.length} open {jobs.length === 1 ? "position" : "positions"} at DOST-MIRDC
              </p>
            </div>
          </div>
        </header>

        {/* ===== Job search — Accenture careers pattern: filter rail +
               results toolbar + sharp cards with square "+/−" toggle +
               numbered pagination. Clicking a job EXPANDS the card in place
               (clamped job description · vital facts · actions) — Accenture's
               careers-list behaviour — and "Read full description" inside the
               expansion opens the complete posting page. ===== */}
        <div ref={resultsTopRef} aria-hidden className="scroll-mt-24" />
        {jobs.length === 0 ? (
          <div className="pui-card mt-8 p-12 text-center">
            <div
              data-slot="empty-result-icon"
              className="mx-auto grid size-14 place-items-center"
            >
              <Briefcase className="size-6" strokeWidth={1.5} />
            </div>
            <h3 className="mt-4 text-xl font-medium tracking-[-0.01em]">No open positions</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">Check back later.</p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)] lg:gap-10 2xl:gap-14">
            {/* ---- Filter rail ---- */}
            <div>
              {/* Mobile — the rail collapses behind a toggle */}
              <button
                onClick={() => setMobileFiltersOpen((v) => !v)}
                aria-expanded={mobileFiltersOpen}
                className="pui-card flex h-14 w-full items-center justify-between px-5 lg:hidden"
              >
                <span className="flex items-center gap-3 text-base font-semibold text-foreground">
                  <SlidersHorizontal className="size-5" strokeWidth={1.5} />
                  Filters
                  {hasActiveFilters && (
                    <span className="grid size-6 place-items-center rounded-md bg-primary text-xs font-medium tabular-nums tracking-[-0.02em] text-primary-foreground">
                      {activeFilterCount}
                    </span>
                  )}
                </span>
                {mobileFiltersOpen ? (
                  <ChevronUp className="size-5 text-muted-foreground" strokeWidth={2} />
                ) : (
                  <ChevronDown className="size-5 text-muted-foreground" strokeWidth={2} />
                )}
              </button>

              <aside
                className={`mt-4 rounded-xl border border-border bg-card p-5 lg:sticky lg:top-[85px] lg:mt-0 lg:self-start lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 ${
                  mobileFiltersOpen ? "block" : "hidden lg:block"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold tracking-[-0.01em] text-foreground">Filters</h2>
                  <button
                    onClick={clearFilters}
                    disabled={!hasActiveFilters}
                    className="flex items-center gap-2 text-base text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  >
                    Clear filters
                    <RotateCcw className="size-4" strokeWidth={1.5} />
                  </button>
                </div>

                <FilterGroup title="Position" open={positionOpen} onToggle={() => setPositionOpen((v) => !v)}>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
                      strokeWidth={1.5}
                    />
                    <Input
                      value={positionQuery}
                      onChange={(e) => setPositionQuery(e.target.value)}
                      placeholder="Search positions"
                      aria-label="Search positions"
                      className="h-14 pl-12 text-base"
                    />
                  </div>
                </FilterGroup>

                <FilterGroup title="Division" open={divisionOpen} onToggle={() => setDivisionOpen((v) => !v)}>
                  <div className="space-y-1.5">
                    {divisionFacets.map(([code, count]) => {
                      const checked = divisionFilter.includes(code);
                      const label = divisionLabel(code) ?? code;
                      return (
                        <label key={code} className="group flex cursor-pointer items-center gap-3.5 py-2.5" title={label}>
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={checked}
                            onChange={() => toggleDivision(code)}
                          />
                          <span
                            aria-hidden
                            className={`flex size-5 shrink-0 items-center justify-center rounded-[0.375rem] border transition-colors ${
                              checked
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-muted-foreground/50 bg-transparent group-hover:border-foreground/60"
                            }`}
                          >
                            {checked && <Check className="size-3.5" strokeWidth={3} />}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-lg leading-snug text-foreground">{label}</span>
                          <span className="shrink-0 text-lg tabular-nums text-muted-foreground">{count}</span>
                        </label>
                      );
                    })}
                  </div>
                </FilterGroup>
              </aside>
            </div>

            {/* ---- Results ---- */}
            <div className="min-w-0">
              {/* Toolbar — "N Results | Sort by …" */}
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-border pb-5">
                <p className="text-2xl font-semibold tabular-nums tracking-[-0.01em] text-foreground">
                  {filteredJobs.length} {filteredJobs.length === 1 ? "Result" : "Results"}
                </p>
                <div className="flex items-center gap-4">
                  <span aria-hidden className="hidden h-6 w-px bg-border sm:block" />
                  <div className="flex items-center gap-3">
                    <span className="hidden text-base text-muted-foreground sm:inline">Sort by</span>
                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                      <SelectTrigger className="h-12 w-[160px] text-base font-semibold" aria-label="Sort results">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SORT_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {filteredJobs.length === 0 ? (
                <div className="pui-card mt-6 p-12 text-center">
                  <div
                    data-slot="empty-result-icon"
                    className="mx-auto grid size-14 place-items-center"
                  >
                    <Search className="size-6" strokeWidth={1.5} />
                  </div>
                  <h3 className="mt-4 text-2xl font-medium tracking-[-0.01em]">No positions match your filters</h3>
                  <p className="mx-auto mt-2 max-w-md text-base leading-relaxed text-muted-foreground">
                    Adjust the position search or division filters to see more results.
                  </p>
                  {hasActiveFilters && (
                    <Button variant="outline" onClick={clearFilters} className="mt-6">
                      <RotateCcw className="size-4" strokeWidth={1.5} />
                      Clear filters
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <div className="space-y-4 pt-7 sm:space-y-5">
                    {pagedJobs.map((job, i) => {
                      const applied = !!job.applications?.length;
                      const pos = job.position;
                      const title = pos?.positionTitle || job.title || "Position Title Unavailable";
                      const place = jobPlace(job);
                      const salary = pos?.salaryAmount;
                      const deadline = job.deadlineDate;
                      const overdue = deadline ? new Date(deadline).getTime() < Date.now() : false;
                      const expanded = expandedId === job.id;

                      // Meta — pipe-separated vitals, the Accenture card register
                      // (place | type | pay | closes); overdue flips the closer to red.
                      const meta: { label: string; className?: string }[] = [
                        { label: place },
                      ];
                      if (job.positionType) meta.push({ label: job.positionType });
                      if (salary != null) meta.push({ label: `${formatCurrency(salary)} monthly`, className: "tabular-nums" });
                      meta.push({
                        label: overdue ? "Closed" : deadline ? `Closes ${formatDate(deadline)}` : "Open until filled",
                        className: overdue ? "font-semibold text-danger-ink" : "tabular-nums",
                      });

                      return (
                        <Reveal key={job.id} delay={Math.min(i, 6) * 0.04} y={14}>
                          <div className="pui-card pui-card-interactive group relative overflow-hidden">
                            {/* Momentum rule — brand bar wipes in across the card on hover */}
                            <span
                              aria-hidden
                              className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 origin-left scale-x-0 bg-primary transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-x-100"
                            />
                            <div className="flex items-stretch">
                              <button
                                onClick={() => setExpandedId(expanded ? null : job.id)}
                                aria-expanded={expanded}
                                aria-label={expanded ? `Collapse — ${title}` : `Expand — ${title}`}
                                className="min-w-0 flex-1 px-6 py-7 text-left sm:px-10 sm:py-8"
                              >
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                  <h3 className="min-w-0 text-xl font-semibold leading-snug tracking-[-0.01em] text-foreground sm:text-2xl">
                                    {humanizeTitle(title)}
                                  </h3>
                                  {applied && <Badge variant="success" className="shrink-0">Applied</Badge>}
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-base text-muted-foreground">
                                  {meta.map((m, idx) => (
                                    <Fragment key={idx}>
                                      {idx > 0 && <span aria-hidden className="select-none text-muted-foreground/50">|</span>}
                                      <span className={m.className}>{m.label}</span>
                                    </Fragment>
                                  ))}
                                </div>
                              </button>
                              <div className="flex shrink-0 items-center pr-4 sm:pr-6">
                                <button
                                  onClick={() => setExpandedId(expanded ? null : job.id)}
                                  aria-expanded={expanded}
                                  aria-label={expanded ? `Hide quick view — ${title}` : `Quick view — ${title}`}
                                  className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-all duration-200 hover:bg-primary-hover active:scale-[0.97]"
                                >
                                  {/* Pill "+ / −" toggle — the quick-view
                                      affordance in the spec's pill control
                                      register (buttons are 0px or 9999px —
                                      nothing in between). */}
                                  {expanded ? (
                                    <Minus className="size-5" strokeWidth={2.5} />
                                  ) : (
                                    <Plus className="size-5" strokeWidth={2.5} />
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* Quick view — inline expansion. Accenture careers
                                register: the clicked card opens IN PLACE with a
                                clamped job description and the position's vital
                                facts; "Read full description" is the only door
                                through to the complete posting page.
                                SMOOTH HEIGHT GLIDE: AnimatePresence animates
                                height 0 → auto (and back) over 0.34s with the
                                Accenture house ease so the card body glides open
                                instead of snapping. Reduced-motion users get a
                                plain opacity crossfade (no height animation). */}
                            <AnimatePresence initial={false}>
                              {expanded && (
                                <motion.div
                                  key="quickview"
                                  initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                                  animate={reduced ? { opacity: 1 } : { height: "auto", opacity: 1 }}
                                  exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                                  transition={
                                    reduced
                                      ? { duration: 0.15, ease: "linear" }
                                      : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }
                                  }
                                  className="overflow-hidden"
                                >
                                  <div className="border-t border-border px-6 pb-8 pt-6 sm:px-10">
                                    {job.briefDescription && (
                                      <div>
                                        <h4 className="text-lg font-medium tracking-[-0.01em] text-foreground">
                                          Job description
                                        </h4>
                                        <p className="mt-2 line-clamp-5 text-base leading-relaxed text-muted-foreground">
                                          {job.briefDescription}
                                        </p>
                                      </div>
                                    )}
                                    <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3 xl:grid-cols-6">
                                      <QuickFact label="Item No." value={pos?.itemNumber || "—"} />
                                      <QuickFact label="Vacancies" value={job.numberOfVacancy != null ? String(job.numberOfVacancy) : "—"} />
                                      <QuickFact
                                        label="Salary Grade"
                                        value={pos?.salaryGrade ? `SG ${pos.salaryGrade}${pos.salaryStep ? `/${pos.salaryStep}` : ""}` : "—"}
                                      />
                                      <QuickFact label="Monthly Salary" value={salary != null ? formatCurrency(salary) : "—"} />
                                      <QuickFact label="Published" value={formatDate(job.publishDate)} />
                                      <QuickFact label="Deadline" value={formatDate(job.deadlineDate)} tone={overdue ? "danger" : undefined} />
                                    </dl>
                                    <div className="mt-7 flex flex-wrap items-center gap-3">
                                      {applied ? (
                                        <Badge variant="success">Applied — track it on your Home</Badge>
                                      ) : (
                                        <Button onClick={() => requestApply(job)} disabled={overdue}>
                                          Apply now
                                          <ArrowRight className="size-4" />
                                        </Button>
                                      )}
                                      {/* Read full description — redirects into the
                                          complete posting (Accenture: label + square
                                          chevron block). */}
                                      <button
                                        onClick={() => openJob(job)}
                                        className="group/link inline-flex min-h-11 items-center gap-3 text-sm font-medium text-foreground transition-colors hover:text-primary"
                                      >
                                        Read full description
                                        <span className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground transition-colors duration-200 group-hover/link:bg-primary-hover">
                                          <ArrowRight
                                            className="size-4 transition-transform duration-200 group-hover/link:translate-x-0.5"
                                            strokeWidth={2.5}
                                          />
                                        </span>
                                      </button>
                                      {overdue && !applied && (
                                        <span className="flex items-center gap-1.5 text-xs font-semibold text-danger-ink">
                                          <AlertCircle className="size-3.5" strokeWidth={1.5} />
                                          Deadline passed
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </Reveal>
                      );
                    })}
                  </div>

                  {totalPages > 1 && (
                    <nav className="mt-12 flex items-center justify-center gap-2 sm:gap-2.5" aria-label="Job list pages">
                      <button
                        onClick={() => goToPage(safePage - 1)}
                        disabled={safePage === 1}
                        aria-label="Previous page"
                        className="grid size-12 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                      >
                        <ArrowLeft className="size-5" strokeWidth={2} />
                      </button>
                      {pageWindow(safePage, totalPages).map((p, idx) =>
                        p === "ellipsis" ? (
                          <span key={`e${idx}`} className="grid size-12 place-items-center text-base text-muted-foreground">
                            …
                          </span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => goToPage(p)}
                            aria-current={p === safePage ? "page" : undefined}
                            className={`grid h-12 min-w-12 items-center justify-center rounded-full border px-2.5 text-base tabular-nums transition-colors ${
                              p === safePage
                                ? "border-primary/40 bg-primary/10 font-semibold text-primary"
                                : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
                            }`}
                          >
                            {p}
                          </button>
                        ),
                      )}
                      <button
                        onClick={() => goToPage(safePage + 1)}
                        disabled={safePage === totalPages}
                        aria-label="Next page"
                        className="grid size-12 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                      >
                        <ArrowRight className="size-5" strokeWidth={2} />
                      </button>
                    </nav>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
      )}

      {/* ===== Apply Confirmation ===== */}
      <AlertDialog open={!!confirmApplyJob} onOpenChange={(open) => { if (!open && !applying) setConfirmApplyJob(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader className="shrink-0">
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-secondary text-primary">
                <ClipboardCheck className="size-5" strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <AlertDialogTitle className="text-lg font-medium tracking-[-0.01em] text-foreground">Confirm Application</AlertDialogTitle>
                <AlertDialogDescription className="mt-1 leading-relaxed">You are about to submit your application. Please confirm to proceed.</AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          {confirmApplyJob && (
            <div className="space-y-1.5 rounded-xl border border-border bg-secondary px-4 py-3">
              <div className="flex items-center gap-2">
                <Briefcase className="size-4 shrink-0 text-foreground" strokeWidth={1.5} />
                <p className="truncate text-sm font-medium text-foreground">{confirmApplyJob.position?.positionTitle || confirmApplyJob.title || "Position Title Unavailable"}</p>
              </div>
              {confirmApplyJob.position?.itemNumber && <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="kicker">Item</span><span>{confirmApplyJob.position.itemNumber}</span></div>}
              {confirmApplyJob.position?.placeOfAssignment?.name && <div className="flex items-center gap-2 text-xs text-muted-foreground"><MapPin className="size-3.5" strokeWidth={1.5} /><span>{confirmApplyJob.position.placeOfAssignment.name}</span></div>}
            </div>
          )}
          <AlertDialogFooter className="shrink-0">
            <AlertDialogCancel disabled={applying}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmApplyJob) doApply(confirmApplyJob); setConfirmApplyJob(null); }} disabled={applying}>
              {applying && <Loader2 className="size-4 animate-spin" />}
              {applying ? "Submitting…" : "Yes, Submit"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== Cancel Confirmation ===== */}
      <AlertDialog open={!!cancelJob} onOpenChange={(open) => { if (!open && !cancelling) setCancelJob(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader className="shrink-0">
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-destructive/40 bg-destructive/10 text-danger-ink">
                <AlertCircle className="size-5" strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <AlertDialogTitle className="text-lg font-medium tracking-[-0.01em] text-foreground">Cancel Application?</AlertDialogTitle>
                <AlertDialogDescription className="mt-1 leading-relaxed">This action <strong className="text-danger-ink">cannot be undone</strong>. You will need to re-apply if you change your mind.</AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          {cancelJob && (
            <div className="space-y-1.5 rounded-xl border border-border bg-secondary px-4 py-3">
              <div className="flex items-center gap-2"><Briefcase className="size-4 shrink-0 text-foreground" strokeWidth={1.5} /><p className="truncate text-sm font-medium text-foreground">{cancelJob.position?.positionTitle || cancelJob.title || "Position Title Unavailable"}</p></div>
              {cancelJob.position?.itemNumber && <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="kicker">Item</span><span>{cancelJob.position.itemNumber}</span></div>}
            </div>
          )}
          <AlertDialogFooter className="shrink-0">
            <AlertDialogCancel disabled={cancelling}>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (cancelJob) doCancel(cancelJob); setCancelJob(null); }} disabled={cancelling}>
              {cancelling && <Loader2 className="size-4 animate-spin" />}
              {cancelling ? "Cancelling…" : "Yes, Cancel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== MQR Failure ===== */}
      <AlertDialog open={!!mqrFailure} onOpenChange={(open) => { if (!open) setMqrFailure(null); }}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader className="shrink-0">
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-destructive/40 bg-destructive/10 text-destructive"><AlertCircle className="size-5" strokeWidth={1.5} /></div>
              <div className="min-w-0 flex-1">
                <AlertDialogTitle className="text-lg font-medium tracking-[-0.01em] text-foreground">Requirements Not Met</AlertDialogTitle>
                <AlertDialogDescription className="mt-1 leading-relaxed">You don&apos;t yet meet the Minimum Qualification Requirements for <strong className="text-foreground">{mqrFailure?.jobTitle}</strong>. Please update your profile.</AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <div className="-mx-1 flex-1 overflow-y-auto px-1">
            <div className="space-y-2">
              {mqrFailure && Object.entries(mqrFailure.results).map(([key, value]) => {
                const isMet = value.includes("Meets");
                const label = MQR_LABELS[key] || key;
                const detail = isMet ? null : value.split(" — ")[1] || null;
                return (
                  <div key={key} className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 ${isMet ? "border-border bg-secondary" : "border-destructive/40 bg-destructive/10"}`}>
                    {isMet ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={1.5} /> : <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" strokeWidth={1.5} />}
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-semibold ${isMet ? "text-foreground" : "text-destructive"}`}>{label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{isMet ? "Meets the minimum requirements" : <>Does not meet the minimum requirements{detail && <span className="font-medium text-destructive"> — {detail}</span>}</>}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <AlertDialogFooter className="shrink-0">
            <AlertDialogCancel>Close</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setMqrFailure(null); navigate("profile"); }}>Update Profile <ArrowRight className="size-4" /></AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== Fast-Track Apply with PDS (incomplete profile) ===== */}
      <FastTrackApplyDialog
        job={fastTrackJob}
        open={!!fastTrackJob}
        onOpenChange={(open) => { if (!open) setFastTrackJob(null); }}
        onApplied={(j) => {
          setFastTrackJob(null);
          setAppliedJobId(Number(j.id));
          load();
          // The fast-track just completed the applicant's profile server-side.
          // Refresh the session so `user.applicant.isProfileComplete` is no
          // longer stale — otherwise the NEXT "Apply" would wrongly reopen
          // the fast-track dialog instead of the normal confirm flow.
          refreshSession();
        }}
      />
    </div>
  );
}

// ============================================================================
// JobDetailView — premium detail page, rendered IN-FLOW inside the shell.
// (Formerly a fixed inset-0 overlay with overflow-y-auto + data-lenis-prevent:
// that produced a second scrollbar outside Lenis's scroll ownership, so
// smooth scrolling never worked here. In-flow, the window is the only
// scroller — one scrollbar, Lenis glide — and the back bar docks below the
// condensed SiteHeader, 42px mobile / 50px sm.)
// ============================================================================
function JobDetailView({
  job, applying, applied, onClose, onApply, onCancel, cancelling,
}: {
  // The only caller passes the full wire JobView (an activeJob); the detail
  // view hands the same object back through onApply/onCancel.
  job: JobView;
  applying: boolean;
  applied: boolean;
  onClose: () => void;
  onApply: (j: JobView) => void;
  onCancel?: (j: JobView) => void;
  cancelling: boolean;
}) {
  const pos = job.position;
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="text-foreground"
    >
      {/* Top bar — sticky UNDER the condensed SiteHeader */}
      <div className="sticky top-[53px] z-30 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:top-[65px] sm:px-6">
        <button onClick={onClose} className="group flex h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <ArrowRight className="size-4 rotate-180 transition-transform duration-200 group-hover:translate-x-[-3px]" strokeWidth={2} />
          Back to Positions
        </button>
        <button onClick={onClose} className="grid size-11 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label="Close">
          <X className="size-4" strokeWidth={2} />
        </button>
      </div>

      {/* Hero — mode-aware canvas, muted kicker, primary accent rule */}
      <div className="border-b border-border px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-[1400px] 2xl:max-w-[1680px]">
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="kicker text-muted-foreground"
          >
            Position Details
          </motion.p>
          <motion.h1
            initial={reduced ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="display-xl mt-3 max-w-3xl text-foreground"
          >
            {pos?.positionTitle || job.title}
          </motion.h1>
          <div aria-hidden className="mt-8 h-0.5 w-16 bg-primary" />
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-semibold text-muted-foreground"
          >
            {pos?.placeOfAssignment && <span className="flex items-center gap-1.5"><MapPin className="size-4" strokeWidth={1.5} /> {pos.placeOfAssignment.name}</span>}
            {pos?.division && <span className="flex items-center gap-1.5"><Building2 className="size-4" strokeWidth={1.5} /> {divisionLabel(pos.division)}</span>}
            {job.positionType && <span className="rounded-full border border-input px-2.5 py-0.5 text-foreground">{job.positionType}</span>}
          </motion.div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-[1400px] 2xl:max-w-[1680px] px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        {/* Summary grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCell icon={<FileText className="size-4" strokeWidth={1.5} />} label="Item No." value={pos?.itemNumber || "—"} />
          <SummaryCell icon={<Users className="size-4" strokeWidth={1.5} />} label="Vacancies" value={job.numberOfVacancy != null ? String(job.numberOfVacancy) : "—"} />
          <SummaryCell icon={<Banknote className="size-4" strokeWidth={1.5} />} label="Salary Grade" value={pos?.salaryGrade ? `SG ${pos.salaryGrade}${pos.salaryStep ? `/${pos.salaryStep}` : ""}` : "—"} />
          <SummaryCell icon={<Banknote className="size-4" strokeWidth={1.5} />} label="Monthly Salary" value={pos?.salaryAmount ? formatCurrency(pos.salaryAmount) : "—"} />
        </div>

        {/* Dates */}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <DateCell icon={<Calendar className="size-4" strokeWidth={1.5} />} label="Published" value={formatDate(job.publishDate)} />
          <DateCell icon={<Clock className="size-4" strokeWidth={1.5} />} label="Deadline" value={formatDate(job.deadlineDate)} urgent={!!job.deadlineDate && new Date(job.deadlineDate).getTime() < Date.now() + 7 * 86400000} />
          <DateCell icon={<Calendar className="size-4" strokeWidth={1.5} />} label="Processing" value={formatDate(job.processingDate)} />
        </div>

        {/* Sections */}
        {job.briefDescriptionHtml ? (
          <Section title="Brief Description" icon={<FileText className="size-4" strokeWidth={1.5} />}>
            <SafeHtml html={job.briefDescriptionHtml} className="max-w-none overflow-x-auto text-foreground/90" />
          </Section>
        ) : job.briefDescription ? (
          <Section title="Brief Description" icon={<FileText className="size-4" strokeWidth={1.5} />}>
            <p className="text-sm font-medium text-foreground/90">{job.briefDescription}</p>
          </Section>
        ) : null}

        {pos && (pos.cscEducation || pos.cscWorkExperience || pos.cscTrainingRequirements || pos.cscEligibilityGroup || pos.specialSkill) && (
          <Section title="Minimum Qualification Requirements" icon={<GraduationCap className="size-4" strokeWidth={1.5} />}>
            <dl className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border">
              {pos.cscEducation && <ReqRow icon={<GraduationCap className="size-4" strokeWidth={1.5} />} label="Education" value={pos.cscEducation} />}
              {pos.cscWorkExperience && <ReqRow icon={<Briefcase className="size-4" strokeWidth={1.5} />} label="Work Experience" value={pos.cscWorkExperience} />}
              {pos.cscTrainingRequirements && <ReqRow icon={<Award className="size-4" strokeWidth={1.5} />} label="Training" value={pos.cscTrainingRequirements} />}
              {pos.cscEligibilityGroup && pos.cscEligibilityGroup !== "N/A" && <ReqRow icon={<CheckCircle2 className="size-4" strokeWidth={1.5} />} label="Eligibility" value={pos.cscEligibilityGroup} />}
              {pos.specialSkill && <ReqRow icon={<BadgeCheck className="size-4" strokeWidth={1.5} />} label="License / Certification" value={pos.specialSkill} />}
            </dl>
          </Section>
        )}

        {job.dutiesResponsibilitiesHtml && (
          <Section title="Duties & Responsibilities" icon={<FileText className="size-4" strokeWidth={1.5} />}>
            <SafeHtml html={job.dutiesResponsibilitiesHtml} className="max-w-none overflow-x-auto text-foreground/90" />
          </Section>
        )}

        {job.compensationPackageHtml && (
          <Section title="Compensation Package" icon={<Banknote className="size-4" strokeWidth={1.5} />}>
            <SafeHtml html={job.compensationPackageHtml} className="max-w-none overflow-x-auto text-foreground/90" />
          </Section>
        )}

        {job.otherQualificationsHtml && (
          <Section title="Other Qualifications" icon={<CheckCircle2 className="size-4" strokeWidth={1.5} />}>
            <SafeHtml html={job.otherQualificationsHtml} className="max-w-none overflow-x-auto text-foreground/90" />
          </Section>
        )}

        {/* Apply section */}
        <div className="mt-8 border-t border-border pt-6">
          {applied ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3.5">
                <CheckCircle2 className="size-6 text-success" strokeWidth={1.5} />
                <p className="text-sm font-semibold text-success">Successfully Applied</p>
              </div>
              {onCancel && (
                <button onClick={() => onCancel(job)} disabled={cancelling} className="group flex h-11 items-center gap-2 self-start rounded-lg border border-input px-5 text-sm font-medium text-foreground transition-colors hover:border-destructive/60 hover:bg-destructive/5 hover:text-danger-ink disabled:opacity-50">
                  {cancelling ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" strokeWidth={1.5} />}
                  {cancelling ? "Cancelling…" : "Cancel Application"}
                </button>
              )}
            </div>
          ) : (
            <Button onClick={() => onApply(job)} disabled={applying} size="lg" className="w-full">
              {applying ? <Loader2 className="size-5 animate-spin" /> : <Briefcase className="size-5" strokeWidth={1.5} />}
              {applying ? "Processing…" : "Submit Application"}
              {!applying && <ArrowRight className="size-5" />}
            </Button>
          )}
          {job.deadlineDate && new Date(job.deadlineDate) < new Date() && !applied && (
            <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-danger-ink">
              <AlertCircle className="size-4" strokeWidth={1.5} /> Deadline passed
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ---- Helper components ----
// SummaryCell / DateCell / Section / ReqRow now live in
// @/components/primitives/job-detail-bits (shared with the applicant home's
// application-detail modal so both surfaces render one register).
