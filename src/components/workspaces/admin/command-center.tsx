"use client";

import { useNav } from "@/components/nav-provider";
import { useAdminStats, useJobs, isJobActive, appCount, type JobRow } from "@/lib/hooks/use-admin-data";
import { apiFetch, formatDate, fullName } from "@/lib/client";
import { humanizeTitle, humanizeName } from "@/lib/humanize";
import { StatusIndicator, EmptyState, ErrorState } from "@/components/primitives/workspace";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useState } from "react";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";
import { ArrowRight, Briefcase, RefreshCw, TrendingUp } from "lucide-react";

// ============================================================================
// Admin Operations Command Center — MINIMALIST STAFF VIEW.
// Answers: "What is happening in recruitment?" + "What requires my attention?"
// Composition: needs attention → active recruitment processes → activity feed.
//
// DESIGN LANGUAGE — quiet, tool-first (no editorial hero type, no gold
// kickers, no momentum sweeps, no staggered Reveal entrances, no ghost
// numerals): compact header, flat bordered stat tiles with plain foreground
// numbers, ONE hairline ledger surface per list (divide-y, single 150ms
// colour-only hover tint), token colours only.
// ============================================================================

type QueueItem = {
  id: string;
  status: string;
  dateApplied: string;
  applicant: { id: number; firstName: string | null; lastName: string | null; emailAddress: string | null };
  job: { id: number; title: string | null; position: { positionTitle: string | null } | null } | null;
};

// Typographic middot between row vitals — quiet punctuation, no icons.
function Dot() {
  return <span aria-hidden className="select-none text-foreground/25">·</span>;
}

export function CommandCenter() {
  const { navigate } = useNav();
  const { stats, loading, error, reload } = useAdminStats();
  // useAdminStats + useJobs are realtime-lite internally (focus refetch +
  // 30s silent poll) — only the queue fetch below needs its own wiring.
  const { jobs, reload: reloadJobs } = useJobs();
  const [queue, setQueue] = useState<QueueItem[]>([]);

  // Initial mount load — cancel-guarded fetch (state updates only while the
  // view is still mounted). Realtime ticks go through useRefetchOnFocus.
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ data: QueueItem[] } | QueueItem[]>("/api/evaluator/queue")
      .then((r) => {
        if (!cancelled) setQueue(Array.isArray(r) ? r : r.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setQueue([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadQueue = useCallback(async (silent?: boolean) => {
    const isSilent = silent === true;
    try {
      const r = await apiFetch<{ data: QueueItem[] } | QueueItem[]>("/api/evaluator/queue");
      setQueue(Array.isArray(r) ? r : r.data ?? []);
    } catch {
      // Silent refresh keeps the last good queue on a transient failure;
      // manual reloads clear it (matches the original behavior).
      if (!isSilent) setQueue([]);
    }
  }, []);

  useRefetchOnFocus(() => loadQueue(true), { pollMs: 30_000 });

  // The header Refresh button refreshes EVERYTHING on the page — previously
  // it only reloaded stats, leaving jobs and the queue stale until remount.
  const reloadAll = useCallback(() => {
    reload();
    reloadJobs();
    void loadQueue();
  }, [reload, reloadJobs, loadQueue]);

  if (loading) return <CommandCenterSkeleton />;

  const activeJobs = jobs.filter(isJobActive);
  const attentionTotal =
    (stats?.pendingReview ?? 0) +
    (stats?.deadlinesThisWeek ?? 0) +
    (stats?.incompleteProfiles ?? 0) +
    (stats?.failedLogins24h ?? 0);

  return (
    <div className="mx-auto w-full max-w-[1400px] 2xl:max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8">
      {/* ===== Compact header — quiet overline + semibold title. The Refresh
          action sits flush right on sm+, stacks under on mobile. No display
          type, no gold kicker; the counts live in the tiles/sections below. ===== */}
      <header className="mb-6 border-b border-border pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Command Center
            </p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">
              Recruitment operations
            </h1>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={reloadAll}>
              <RefreshCw className="size-4" /> Refresh
            </Button>
          </div>
        </div>
      </header>

      {error && <ErrorState message={error} onRetry={reload} />}

      {/* NEEDS ATTENTION — quiet bordered stat tiles: micro-label + plain
          foreground figure + hint. Clickable tiles keep their onClick
          navigation + disabled state; hover is a single border tint. */}
      <section>
        <div className="flex items-baseline justify-between border-b border-border pb-3">
          <h2 className="text-base font-semibold tracking-tight text-foreground">Needs attention</h2>
          <p className="text-sm font-medium tabular-nums text-muted-foreground">
            {attentionTotal} {attentionTotal === 1 ? "item" : "items"} require action
          </p>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AttentionItem
            count={stats?.pendingReview ?? 0}
            label="Awaiting review"
            hint="Applications awaiting the shortlist decision"
            onClick={() => navigate("review-queue")}
          />
          <AttentionItem
            count={stats?.deadlinesThisWeek ?? 0}
            label="Deadlines this week"
            hint="Job postings closing soon"
            onClick={() => navigate("recruitment")}
          />
          <AttentionItem
            count={stats?.incompleteProfiles ?? 0}
            label="Incomplete profiles"
            hint="Applicants who haven't finished"
            onClick={() => navigate("candidates", { status: "incomplete" })}
          />
          <AttentionItem
            count={stats?.failedLogins24h ?? 0}
            label="Failed logins (24h)"
            hint="Possible brute-force attempts"
            onClick={() => navigate("settings", { tab: "audit" })}
          />
        </div>
      </section>

      {/* ACTIVE RECRUITMENT — hairline toolbar + ONE bordered ledger sheet. */}
      <section className="mt-8">
        <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold tracking-tight text-foreground">Active recruitment</h2>
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium tabular-nums text-muted-foreground">
              {activeJobs.length} {activeJobs.length === 1 ? "process" : "processes"}
            </p>
            <Button variant="ghost" size="sm" onClick={() => navigate("recruitment")} className="text-muted-foreground">
              View all <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </div>
        {activeJobs.length === 0 ? (
          <div className="mt-3 border border-border bg-card">
            <EmptyState
              icon={<Briefcase className="size-10" />}
              title="No active recruitment"
              description="There are no open job postings at the moment."
              action={<Button size="sm" onClick={() => navigate("recruitment")}>View all jobs</Button>}
            />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-border border border-border bg-card">
            {activeJobs.slice(0, 6).map((job, i) => (
              <ActiveRecruitmentRow key={job.id} job={job} queue={queue} index={i} />
            ))}
          </ul>
        )}
      </section>

      {/* RECENT ACTIVITY + OVERVIEW split */}
      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <div className="flex items-baseline justify-between border-b border-border pb-3">
            <h2 className="text-base font-semibold tracking-tight text-foreground">Recent activity</h2>
            <p className="text-sm font-medium tabular-nums text-muted-foreground">
              {stats?.recent.length ?? 0} {stats?.recent.length === 1 ? "entry" : "entries"}
            </p>
          </div>
          <div className="mt-3 border border-border bg-card">
            {stats?.recent.length === 0 ? (
              <EmptyState icon={<TrendingUp className="size-8" />} title="No recent applications" />
            ) : (
              <ul className="max-h-[400px] divide-y divide-border overflow-y-auto">
                {stats?.recent.map((r, i) => (
                  <ActivityRow
                    key={r.id}
                    name={r.applicant ? fullName(r.applicant) : "Unknown applicant"}
                    jobTitle={r.job?.title || "Untitled position"}
                    date={r.dateApplied}
                    status={r.status}
                    applicantId={r.applicantId}
                    index={i}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right rail — compact operational summary as quiet stat tiles */}
        <aside>
          <div className="flex items-baseline justify-between border-b border-border pb-3">
            <h2 className="text-base font-semibold tracking-tight text-foreground">Overview</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate("analytics")} className="-mr-2 text-muted-foreground">
              <TrendingUp className="size-3.5" /> Analytics
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <SummaryCell label="Applicants" value={stats?.applicants ?? 0} />
            <SummaryCell label="Active jobs" value={stats?.activeJobs ?? 0} />
            <SummaryCell label="Applications" value={stats?.totalApplications ?? 0} />
            <SummaryCell label="Shortlisted" value={stats?.shortlisted ?? 0} />
          </div>
        </aside>
      </section>
    </div>
  );
}

// ---- Activity row (quiet full-width button inside the ledger sheet) --------
function ActivityRow({
  name,
  jobTitle,
  date,
  status,
  applicantId,
  index,
}: {
  name: string;
  jobTitle: string;
  date: string;
  status?: string | null;
  applicantId?: number | null;
  index: number;
}) {
  const { navigate } = useNav();
  const initials = (name.split(" ").filter(Boolean)[0]?.[0] || "") + (name.split(" ").filter(Boolean).slice(-1)[0]?.[0] || "");
  return (
    <li>
      <button
        onClick={() => applicantId && navigate("candidate", { id: String(applicantId) })}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 hover:bg-accent/40"
      >
        {/* Row index — quiet, desktop only */}
        <span
          aria-hidden
          className="hidden shrink-0 text-xs tabular-nums text-muted-foreground/60 sm:inline"
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="grid size-9 shrink-0 place-items-center bg-muted text-xs font-semibold text-foreground/70">
          {initials || "?"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">
            {humanizeName(name)}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {humanizeTitle(jobTitle)} <Dot /> Applied {formatDate(date)}
          </span>
        </span>
        {status && <StatusIndicator status={status} size="sm" />}
      </button>
    </li>
  );
}

// ---- Active recruitment row (ledger row in the shared sheet) ---------------
function ActiveRecruitmentRow({ job, queue, index }: { job: JobRow; queue: QueueItem[]; index: number }) {
  const { navigate } = useNav();
  const count = appCount(job) ?? 0;
  const title = job.title || job.position?.positionTitle || "Untitled Position";
  const place = job.position?.placeOfAssignment?.name;

  // Match queue items to this job to compute stage breakdown.
  // REVISED WORKFLOW: there is no evaluation stage — applications are either
  // awaiting the shortlist decision, shortlisted (email sent, face-to-face
  // next), or not qualified.
  const jobApps = queue.filter((q) => q.job?.id === job.id);
  const inReview = jobApps.filter((a) =>
    /applied|pending|screening|under review|for evaluation|evaluation|evaluated|final review/i.test(a.status)
  ).length;
  const shortlisted = jobApps.filter((a) => /shortlisted/i.test(a.status)).length;
  const rejected = jobApps.filter((a) => /rejected|declined/i.test(a.status)).length;

  return (
    <li>
      <button
        onClick={() => navigate("job", { id: String(job.id) })}
        className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors duration-150 hover:bg-accent/40"
      >
        {/* Row index — quiet, desktop only */}
        <span
          aria-hidden
          className="hidden shrink-0 text-xs tabular-nums text-muted-foreground/60 sm:inline"
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-foreground">
            {humanizeTitle(title)}
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {job.positionType || "Permanent"} <Dot /> {place || "—"}
            {job.deadlineDate && (
              <>
                {" "}
                <Dot /> Closes {formatDate(job.deadlineDate)}
              </>
            )}
          </p>
        </div>
        {/* Stage breakdown — inline pipeline, plain foreground figures */}
        <div className="hidden items-center gap-5 sm:flex">
          <StageMetric label="Apps" value={count} />
          <StageMetric label="Review" value={inReview} />
          <StageMetric label="Shortlist" value={shortlisted} />
          <StageMetric label="Rejected" value={rejected} />
        </div>
      </button>
    </li>
  );
}

function StageMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex w-16 flex-col items-center gap-1">
      <span className="text-sm font-semibold tabular-nums leading-none text-foreground">{value}</span>
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
    </div>
  );
}

function AttentionItem({
  count,
  label,
  hint,
  onClick,
}: {
  count: number;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  const hasItems = count > 0;
  return (
    <button
      onClick={onClick}
      disabled={!hasItems}
      className={`border border-border bg-card p-4 text-left transition-colors duration-150 ${
        hasItems ? "hover:border-foreground/25" : "cursor-default opacity-60"
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{count}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </button>
  );
}

function SummaryCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

// ---- Skeleton (raw bg-muted pulse divs) — mirrors the quiet layout:
// compact header + bordered stat tiles + hairline ledger rows. ---------------
function CommandCenterSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1400px] 2xl:max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8">
      {/* Compact header skeleton */}
      <div className="mb-6 border-b border-border pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="h-3 w-32 animate-pulse bg-muted" />
            <div className="h-5 w-56 animate-pulse bg-muted" />
          </div>
          <div className="h-8 w-24 shrink-0 animate-pulse bg-muted" />
        </div>
      </div>
      {/* Needs attention — quiet stat tiles */}
      <div className="flex items-baseline justify-between border-b border-border pb-3">
        <div className="h-4 w-32 animate-pulse bg-muted" />
        <div className="h-4 w-28 animate-pulse bg-muted" />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border border-border bg-card p-4">
            <div className="h-3 w-24 animate-pulse bg-muted" />
            <div className="mt-2 h-7 w-12 animate-pulse bg-muted" />
            <div className="mt-2 h-3 w-32 animate-pulse bg-muted" />
          </div>
        ))}
      </div>
      {/* Active recruitment — hairline toolbar + ledger rows */}
      <div className="mt-8 flex items-baseline justify-between border-b border-border pb-3">
        <div className="h-4 w-40 animate-pulse bg-muted" />
        <div className="h-4 w-24 animate-pulse bg-muted" />
      </div>
      <div className="mt-3 divide-y divide-border border border-border bg-card">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <div className="hidden h-3 w-5 shrink-0 animate-pulse bg-muted sm:block" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-56 animate-pulse bg-muted" />
              <div className="h-3 w-72 animate-pulse bg-muted" />
            </div>
            <div className="hidden h-8 w-64 shrink-0 animate-pulse bg-muted sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
