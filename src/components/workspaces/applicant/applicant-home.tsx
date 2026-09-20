"use client";

// ============================================================================
// RMIS — Applicant Home (premium scope)
// The dashboard speaks the SAME premium language as the profile: soft rounded
// cards (pui-card), layered elevation, ambient canvas wash, pill badges and
// rounded controls via the .premium data-slot hooks. Two-pane workspace: Open
// Positions (left, the scrollable browsing pane in the board job-card register)
// beside Your Applications (right, a sticky rail with its own overflow scroll).
// Clicking a rail card opens the Application Detail Modal — the complete
// posting with the Cancel Application action.
// ============================================================================

import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNav } from "@/components/nav-provider";
import { useSession } from "@/components/session-provider";
import { Reveal } from "@/components/ui/motion/reveal";
import { MagneticButton } from "@/components/ui/motion/magnetic-button";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { apiFetch, formatDate, formatCurrency } from "@/lib/client";
import {
  stageForStatus,
  isRejectedStatus,
  isInReviewStatus,
  currentStageLabel,
} from "@/lib/status";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";
import {
  TrackingTimeline,
  journeyTrackingSteps,
} from "@/components/primitives/tracking-timeline";
import {
  type Application as WireApplication,
  type Job as WireJob,
  type JobPosition as WireJobPosition,
} from "@/lib/wire";
import { humanizeTitle } from "@/lib/humanize";
import {
  FileText,
  MapPin,
  Clock,
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Plus,
  Minus,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import {
  Eyebrow,
  WorkspaceTitle,
  StatusIndicator,
  ErrorState,
  Skeleton,
} from "@/components/primitives/workspace";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApplicationDetailModal } from "./application-detail-modal";

// ---------- House motion ---------------------------------------------------
// Shared easing (matches /components/ui/motion primitives). Durations 0.4–0.9s,
// transform/opacity only, black canvas + electric-blue #1591DC palette.
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

// FadeIn — gentle opacity entrance for loading/empty/error states.
function FadeIn({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

// ---------- Types ----------
// Wire application — GET /api/applications (see @/lib/wire).
type ApplicantApplication = WireApplication;

// Wire job (GET /api/jobs) — the exact slice the 02 board card register
// renders. Job-level `placeOfAssignment` is the canonical place;
// `position.placeOfAssignment` / `position.salaryStep` stay legacy optional
// reads (the jobs route keeps the place at JOB level and omits salaryStep
// from the wire), so the fallback paths behave exactly as on the board.
type JobListItem = Pick<
  WireJob,
  | "id"
  | "title"
  | "positionType"
  | "briefDescription"
  | "numberOfVacancy"
  | "publishDate"
  | "deadlineDate"
  | "placeOfAssignment"
> & {
  position: (WireJobPosition & {
    placeOfAssignment?: { name: string | null } | null;
    salaryStep?: string | null;
  }) | null;
};

const PLACE_FALLBACK = "DOST Compound, Taguig";

/** Display place — job-level record first, legacy nested read, then the
 *  agency address. ONE string, exactly like the 02 board card register. */
function jobPlace(job: JobListItem): string {
  return job.placeOfAssignment?.name ?? job.position?.placeOfAssignment?.name ?? PLACE_FALLBACK;
}

// ---------- Journey timeline ----------------------------------------------
// REVISED WORKFLOW: the in-system journey ENDS at the shortlist email —
// everything after (document verification, interview) is coordinated offline
// by HR and is deliberately NOT a step in the portal timeline. The card
// renders the canonical delivery-tracking checkpoints via journeyTrackingSteps.
// The applicant-facing stage label ("Submitted" / "In Review" / "Shortlisted" /
// "Not Selected") comes from the shared currentStageLabel in @/lib/status.

// Formal, production-grade status guidance — full sentences, addressed to the
// applicant, mirroring the tone of the automated email notices. Never dev
// shorthand ("HR will contact you" fragments, etc.): everything an applicant
// reads must stand on its own as official correspondence.
function nextStageHint(status: string | null): string {
  if (isRejectedStatus(status ?? "")) {
    return "Your application was not shortlisted for this position. You may still apply for other open positions.";
  }
  const stage = stageForStatus(status ?? "");
  if (stage === "Shortlisted") {
    return "A notice has been sent to your registered email address. The Human Resource Office will contact you regarding the next steps of the recruitment process.";
  }
  return isInReviewStatus(status ?? "")
    ? "The Human Resource Office is currently evaluating your application. You will be notified of the outcome."
    : "Your application has been received and is awaiting evaluation by the Human Resource Office.";
}

// QuickFact — one definition-list cell of the card quick view: micro-kicker
// label over a semibold tabular value. `tone="danger"` flags a passed deadline.
// Ported verbatim from the 02 board (jobs-view).
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

// ============================================================================
// ApplicantHome
// ============================================================================
export function ApplicantHome() {
  const { navigate } = useNav();
  const { user } = useSession();

  const [apps, setApps] = useState<ApplicantApplication[]>([]);
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Quick view — single-expand, exactly like the 02 board: opening one card
  // closes the previous one.
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // Application detail modal — the rail card the applicant clicked; renders
  // the complete posting (board detail register) with the Cancel action.
  const [detailApp, setDetailApp] = useState<ApplicantApplication | null>(null);

  const loadApps = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const [a, j] = await Promise.all([
        apiFetch<ApplicantApplication[]>("/api/applications"),
        apiFetch<JobListItem[]>("/api/jobs"),
      ]);
      setApps(Array.isArray(a) ? a : []);
      setJobs(Array.isArray(j) ? j : []);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Failed to load your portal.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { loadApps(); }, [loadApps]);
  // Realtime-lite: silent refetch on tab focus PLUS a gentle 15s poll while
  // the tab stays open — evaluator decisions (shortlist / return-to-review /
  // rejection) surface in the journey cards without any manual reload.
  useRefetchOnFocus(() => loadApps(true), { pollMs: 15_000 });

  const firstName = user?.firstName || "there";

  // Right rail — every application on record, newest first. The rail has its
  // own overflow scroll, so no cap is needed.
  const myApplications = [...apps]
    .sort((a, b) => {
      const ad = a.dateApplied ? new Date(a.dateApplied).getTime() : 0;
      const bd = b.dateApplied ? new Date(b.dateApplied).getTime() : 0;
      return bd - ad;
    });

  // Left pane — every open posting (deadline not passed), newest published
  // first. This pane is the browsing surface: the full list scrolls in place.
  const now = Date.now();
  const openJobs = jobs
    .filter((job) => {
      if (!job.deadlineDate) return true;
      const d = new Date(job.deadlineDate).getTime();
      return !isNaN(d) && d >= now;
    })
    .sort((a, b) => {
      const ad = a.publishDate ? new Date(a.publishDate).getTime() : 0;
      const bd = b.publishDate ? new Date(b.publishDate).getTime() : 0;
      return bd - ad;
    });

  const showProfileBanner = !!user && String(user.role) === "APPLICANT" && !user.applicant?.isProfileComplete;

  if (loading) return <ApplicantHomeSkeleton />;

  if (error) {
    return (
      <FadeIn className="mx-auto max-w-[1400px] 2xl:max-w-[1680px] px-4 py-12 sm:px-6 lg:px-8">
        <Eyebrow>Applicant Portal</Eyebrow>
        <div className="mt-3">
          <WorkspaceTitle title="Applicant Portal" />
        </div>
        <div className="pui-card mt-8">
          <ErrorState message={error} onRetry={() => window.location.reload()} />
        </div>
      </FadeIn>
    );
  }

  return (
    <div className="premium relative min-h-screen bg-background text-foreground">
      {/* Ambient brand wash — the same primary glow the profile page carries,
          so every applicant surface shares one canvas language. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{ backgroundImage: "var(--pui-canvas)" }}
      />
      <div className="relative z-10 mx-auto max-w-[1400px] 2xl:max-w-[1680px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        {/* ===== Header — greeting ===== */}
        <header className="border-b border-border pb-8">
          <Eyebrow>Applicant Portal</Eyebrow>
          <div className="mt-3">
            <WorkspaceTitle
              title={`Welcome Back, ${firstName}`}
              description="Track your applications and discover new opportunities at DOST-MIRDC."
            />
          </div>
          {/* The one editorial moment — serif italic welcome line */}
          <p className="display-serif mt-4 text-lg italic text-muted-foreground">
            Your recruitment journey, structured and transparent.
          </p>
        </header>

        {/* ===== Profile completion banner ===== */}
        {showProfileBanner && (
          <Reveal className="mt-8">
            <div className="flex flex-col items-start gap-4 rounded-[1.25rem] border border-warning/25 bg-warning/10 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="flex items-start gap-4">
                <div className="grid size-11 shrink-0 place-items-center rounded-[0.875rem] bg-warning/15 text-warning">
                  <AlertTriangle className="size-5" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-[-0.01em] text-foreground">Complete Your Profile</p>
                  <p className="mt-1 text-sm leading-relaxed text-warning-ink">
                    Finish your applicant profile to apply for positions and speed up processing.
                  </p>
                </div>
              </div>
              <MagneticButton strength={0.25}>
                <Button onClick={() => navigate("profile")}>
                  Complete Profile
                  <ArrowRight className="size-4" />
                </Button>
              </MagneticButton>
            </div>
          </Reveal>
        )}

        {/* ===== Two-pane workspace =======================================
             Left  · 03. Open Positions  — the scrollable browsing pane,
             rendered in the EXACT 02-board job-list card register (momentum
             rule · humanized title · pipe-separated vitals · square +/−
             quick-view toggle · in-place quick view with six QuickFacts).
             Right · 02. Your Applications — sticky rail with its own overflow
             scroll, so statuses stay in view while the applicant browses.
             Mobile: stacks Your Applications first, then Open Positions.
             ====================================================================== */}
        <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-8 2xl:gap-12">
          {/* ---- Right rail · 02. Your Applications (first on mobile) ---- */}
          <aside className="order-1 lg:order-2 lg:col-span-5 2xl:col-span-4">
            <div className="flex flex-col lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)]">
              {/* Rail header — pinned above the scrolling cards */}
              <Reveal className="flex shrink-0 items-end justify-between gap-2 border-b border-border pb-4">
                <div>
                  <Eyebrow>Your Applications</Eyebrow>
                  <h2 className="mt-2 text-2xl font-medium tracking-[-0.02em] text-foreground sm:text-3xl">
                    In Progress
                  </h2>
                </div>
              </Reveal>

              {/* Independently scrollable application cards */}
              <div className="mt-6 min-h-0 flex-1 lg:overflow-y-auto lg:pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border">
                {myApplications.length === 0 ? (
                  <FadeIn className="pui-card p-10 text-center">
                    <div
                      data-slot="empty-result-icon"
                      className="mx-auto grid size-14 place-items-center"
                    >
                      <FileText className="size-7" strokeWidth={1.5} />
                    </div>
                    <h3 className="mt-5 text-xl font-medium tracking-[-0.01em] text-foreground">No applications yet</h3>
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                      Browse open positions to start your application journey.
                    </p>
                    <Button onClick={() => navigate("jobs")} className="group mx-auto mt-5">
                      <Briefcase className="size-4" /> Browse Positions
                      <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
                    </Button>
                  </FadeIn>
                ) : (
                  <div className="space-y-4 pb-1">
                    {myApplications.map((app, i) => (
                      <Reveal key={app.id} delay={Math.min(i, 4) * 0.06} y={20}>
                        <ApplicationJourneyCard app={app} index={i} onOpen={() => setDetailApp(app)} />
                      </Reveal>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </aside>

          {/* ---- Left pane · 03. Open Positions (browsing surface) ---- */}
          <section className="order-2 lg:order-1 lg:col-span-7 2xl:col-span-8">
            <Reveal className="flex items-end justify-between border-b border-border pb-4">
              <div>
                <Eyebrow>Open Positions</Eyebrow>
                <h2 className="mt-2 text-2xl font-medium tracking-[-0.02em] text-foreground sm:text-3xl">
                  Apply Now
                </h2>
              </div>
              {openJobs.length > 0 && (
                <Button
                  onClick={() => navigate("jobs")}
                  variant="outline"
                  size="sm"
                  className="group hidden sm:inline-flex"
                >
                  View All
                  <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Button>
              )}
            </Reveal>

            <div className="mt-6">
              {openJobs.length === 0 ? (
                <FadeIn className="pui-card p-12 text-center">
                  <div
                    data-slot="empty-result-icon"
                    className="mx-auto grid size-14 place-items-center"
                  >
                    <Briefcase className="size-6" strokeWidth={1.5} />
                  </div>
                  <h3 className="mt-4 text-xl font-medium tracking-[-0.01em] text-foreground">No open positions</h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">New postings appear here as soon as they are published.</p>
                </FadeIn>
              ) : (
                <div className="space-y-4 sm:space-y-5">
                  {openJobs.map((job, i) => (
                    <Reveal key={job.id} delay={Math.min(i, 6) * 0.04} y={14}>
                      <JobListCard
                        job={job}
                        applied={apps.some((a) => a.job?.id === job.id)}
                        expanded={expandedId === job.id}
                        onToggle={() => setExpandedId(expandedId === job.id ? null : job.id)}
                        onOpen={() => navigate("jobs", { job: String(job.id) })}
                      />
                    </Reveal>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* ===== Application Detail Modal — the complete posting the applicant
             applied to (board detail register: hero · summary grid · dates ·
             document sections) with the Cancel Application action. Cancelling
             removes the application; a silent refetch updates both panes. ===== */}
      <ApplicationDetailModal
        app={detailApp}
        open={!!detailApp}
        onOpenChange={(open) => { if (!open) setDetailApp(null); }}
        onCancelled={() => { setDetailApp(null); void loadApps(true); }}
      />
    </div>
  );
}

// ============================================================================
// Application Journey Card — flat card with square journey rail. CLICKABLE:
// the whole card opens the Application Detail Modal (the complete posting in
// the board detail register + Cancel Application). The journey timeline +
// next-step guidance stay on the card (the standalone My Applications page
// was removed — the home rail is the single tracking surface).
// ============================================================================
function ApplicationJourneyCard({
  app,
  index,
  onOpen,
}: {
  app: ApplicantApplication;
  index: number;
  onOpen: () => void;
}) {
  const stageLabel = currentStageLabel(app.status);
  const nextHint = nextStageHint(app.status);
  const isRejected = isRejectedStatus(app.status);
  // Canonical delivery-tracking checkpoints.
  const journeySteps = journeyTrackingSteps(
    stageForStatus(app.status ?? ""),
    isRejected,
    isInReviewStatus(app.status ?? "")
  );

  const positionTitle = app.job?.position?.positionTitle || app.job?.title || "Position Title Unavailable";
  const place = app.job?.position?.placeOfAssignment?.name || null;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`View complete posting and application details — ${humanizeTitle(positionTitle)}`}
      className="pui-card pui-card-interactive group flex h-full w-full cursor-pointer flex-col p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:p-5"
    >
      {/* Header — the chevron is the whole-card affordance: the card opens
          the full posting in a modal (the board detail register, in-dialog). */}
      <div className="flex items-start justify-between gap-2">
        <span className="kicker text-muted-foreground">
          No. {String(index + 1).padStart(2, "0")}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {/* Rejected applications keep their danger tone even though the card
              shows the journey stage label ("Not Selected"). */}
          <StatusIndicator status={isRejected ? "Rejected" : stageLabel} size="sm" />
          <ChevronRight
            aria-hidden
            className="size-4 text-muted-foreground/60 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-primary"
            strokeWidth={2}
          />
        </span>
      </div>
      <h3 className="mt-3.5 text-lg font-medium leading-snug tracking-[-0.01em] text-foreground">
        {humanizeTitle(positionTitle)}
      </h3>
      {place && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-4" strokeWidth={1.5} /> {place}
        </p>
      )}
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="size-3.5" strokeWidth={1.5} /> Applied {formatDate(app.dateApplied)}
      </p>

      {/* Journey timeline — delivery-tracking rail (✓ done · ● current · dashed ahead) */}
      <TrackingTimeline
        steps={journeySteps}
        ariaLabel="Application journey"
        className="mt-6"
      />

      {/* Next hint — the card's closing block (the full posting lives one
          click away, in the application detail modal). */}
      {nextHint && (
        <div className="mt-6 border-t border-border pt-4">
          <p className="kicker text-muted-foreground">
            Next Step
          </p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">{nextHint}</p>
        </div>
      )}
    </button>
  );
}

// ============================================================================
// Job List Card — the 02 board card register, verbatim: momentum rule, humanized
// title + gold Applied badge, pipe-separated vitals, square blue "+/−" toggle
// and the in-place quick view (clamped description · six QuickFacts · actions).
// "Apply now" and "Read full description" both deep-link into the job's full
// posting on the 02 board, where the complete application flow (MQR check,
// confirmation, PDS fast-track) already lives — no duplicated apply logic.
// ============================================================================
function JobListCard({
  job,
  applied,
  expanded,
  onToggle,
  onOpen,
}: {
  job: JobListItem;
  applied: boolean;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const reduced = useReducedMotion();
  const pos = job.position;
  const title = pos?.positionTitle || job.title || "Position Title Unavailable";
  const place = jobPlace(job);
  const salary = pos?.salaryAmount;
  const deadline = job.deadlineDate;
  const overdue = deadline ? new Date(deadline).getTime() < Date.now() : false;

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
    <div className="pui-card pui-card-interactive group relative overflow-hidden">
      {/* Momentum rule — brand bar wipes in across the card on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 origin-left scale-x-0 bg-primary transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-x-100"
      />
      <div className="flex items-stretch">
        <button
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse — ${title}` : `Expand — ${title}`}
          className="min-w-0 flex-1 px-6 py-7 text-left sm:px-10 sm:py-8"
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h3 className="min-w-0 text-xl font-medium leading-snug tracking-[-0.01em] text-foreground sm:text-2xl">
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
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? `Hide quick view — ${title}` : `Quick view — ${title}`}
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-all duration-200 hover:bg-primary-hover active:scale-[0.97]"
          >
            {/* Rounded "+ / −" toggle — the quick-view affordance,
                softened to the premium control register. */}
            {expanded ? (
              <Minus className="size-5" strokeWidth={2.5} />
            ) : (
              <Plus className="size-5" strokeWidth={2.5} />
            )}
          </button>
        </div>
      </div>

      {/* Quick view — inline expansion, identical to the 02 board register:
          the clicked card opens IN PLACE with a clamped job description and
          the position's vital facts. SMOOTH HEIGHT GLIDE: AnimatePresence
          animates height 0 → auto (and back) over 0.34s with the Accenture
          house ease. Reduced-motion users get a plain opacity crossfade. */}
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
                  <Button onClick={onOpen} disabled={overdue}>
                    Apply now
                    <ArrowRight className="size-4" />
                  </Button>
                )}
                {/* Read full description — deep-links into the complete
                    posting on the 02 board (label + square chevron block). */}
                <button
                  onClick={onOpen}
                  className="group/link inline-flex min-h-12 items-center gap-3 text-sm font-medium text-foreground transition-colors hover:text-primary"
                >
                  Read full description
                  <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground transition-colors duration-200 group-hover/link:bg-primary-hover">
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
  );
}

// ============================================================================
// Skeleton
// ============================================================================
function ApplicantHomeSkeleton() {
  return (
    <FadeIn className="mx-auto max-w-[1400px] 2xl:max-w-[1680px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="border-b border-border pb-8">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-3 h-16 w-3/4" />
        <Skeleton className="mt-4 h-4 w-1/2" />
      </div>
      {/* Two-pane skeleton — positions (left, board-register rows) · applications (right) */}
      <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-8 2xl:gap-12">
        <div className="order-2 space-y-4 lg:order-1 lg:col-span-7 2xl:col-span-8">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-10 w-40" />
          <div className="space-y-4 sm:space-y-5">
            {[0, 1, 2, 3, 4].map((i) => (
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
        <div className="order-1 space-y-4 lg:order-2 lg:col-span-5 2xl:col-span-4">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-10 w-36" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    </FadeIn>
  );
}
