"use client";

// ============================================================================
// Atlas — Analytics (sidebar page; #/analytics).
//
// The Pipeline Overview band that used to live under the Review Queue board,
// promoted to its own sidebar page for both evaluators and admins:
//   · Pipeline Overview — donut + legend (Applied / Under Review / Shortlisted
//     / Rejected with counts + % of pipeline).
//   · Requirements Match — average match score out of 100 + verdict meters
//     (fully qualified / partial / unmet / to verify).
//   · Time in Pipeline — average days awaiting decision + 14-day application
//     volume sparkline.
//
//   · Data: GET /api/evaluator/queue (EVALUATOR + ADMIN) → { data: QueueItem[] };
//     15s silent poll + tab-focus refetch (useRefetchOnFocus). A silent
//     failure never clears good data. All figures are client-computed from
//     the same payload the Review Queue uses — page truth, not tab-filtered.
//   · The Review Queue no longer renders this band — the queue stays a work
//     surface; this page is the read-only health view.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Hourglass, RefreshCw, Target, Users } from "lucide-react";
import {
  Donut,
  EmptyState,
  PageHeader,
  PageShell,
  Sparkline,
  StageMeters,
  Dot,
} from "@/components/dash/kit";
import {
  STAGE_TONE,
  QueueErrorState,
  type QueueItem,
} from "@/components/dash/views/queue-bits";
import { useNav } from "@/components/nav-provider";
import { apiFetch } from "@/lib/client";
import { PIPELINE_STAGES, stageForStatus } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";

// ============================================================================
// PipelineOverview — the three analytics panels. Exported so future views
// (e.g. per-job analytics) can reuse the exact figures.
// ============================================================================

export function PipelineOverview({ items }: { items: QueueItem[] }) {
  // 1 — stage distribution
  const stageCounts = useMemo(() => {
    const c: Record<"Applied" | "Under Review" | "Shortlisted" | "Rejected", number> = {
      Applied: 0,
      "Under Review": 0,
      Shortlisted: 0,
      Rejected: 0,
    };
    for (const i of items) c[stageForStatus(i.status || "")]++;
    return c;
  }, [items]);

  // 2 — average requirements match + verdict mix
  const matchStats = useMemo(() => {
    let sum = 0;
    let n = 0;
    const verdicts = { met: 0, partial: 0, unmet: 0, review: 0 };
    for (const i of items) {
      const m = i.match;
      if (!m || m.requiredCount <= 0) continue;
      sum += (m.metCount / m.requiredCount) * 100;
      n += 1;
      if (m.verdict === "ALL_MET") verdicts.met += 1;
      else if (m.verdict === "PARTIAL") verdicts.partial += 1;
      else if (m.verdict === "NONE_MET") verdicts.unmet += 1;
      else verdicts.review += 1;
    }
    return { avg: n ? Math.round(sum / n) : null, n, verdicts };
  }, [items]);

  // 3 — average days awaiting decision (undecided stages only) + 14-day volume
  const pipelineTime = useMemo(() => {
    let sum = 0;
    let n = 0;
    for (const i of items) {
      const stage = stageForStatus(i.status || "");
      if (stage !== "Applied" && stage !== "Under Review") continue;
      const d = i.dateApplied ? new Date(i.dateApplied).getTime() : NaN;
      if (Number.isNaN(d)) continue;
      sum += Math.max(0, (Date.now() - d) / 86_400_000);
      n += 1;
    }
    return { avg: n ? Math.round(sum / n) : null, n };
  }, [items]);

  const volume = useMemo(() => {
    const days = 14;
    const out = new Array<number>(days).fill(0);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    for (const i of items) {
      if (!i.dateApplied) continue;
      const d = new Date(i.dateApplied);
      if (Number.isNaN(d.getTime())) continue;
      d.setHours(0, 0, 0, 0);
      const diff = Math.round((startOfToday.getTime() - d.getTime()) / 86_400_000);
      if (diff >= 0 && diff < days) out[days - 1 - diff] += 1;
    }
    return out;
  }, [items]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-3">
      {/* Pipeline Overview — donut + legend */}
      <section className="rounded-[20px] border border-border/70 bg-card p-4 shadow-xs sm:p-5">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Users className="size-4 text-primary" aria-hidden />
          Pipeline Overview
        </p>
        <div className="mt-3 flex items-center gap-5">
          <Donut
            size={116}
            thickness={14}
            className="shrink-0"
            segments={[
              { value: stageCounts.Applied, className: "stroke-primary" },
              { value: stageCounts["Under Review"], className: "stroke-warning" },
              { value: stageCounts.Shortlisted, className: "stroke-success" },
              { value: stageCounts.Rejected, className: "stroke-destructive" },
            ]}
          >
            <div className="text-center leading-tight">
              <p className="text-[28px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-foreground">{items.length}</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Candidates</p>
            </div>
          </Donut>
          <ul className="min-w-0 flex-1 space-y-1.5">
            {PIPELINE_STAGES.map((s) => {
              const n = stageCounts[s.key];
              const pct = items.length ? Math.round((n / items.length) * 1000) / 10 : 0;
              return (
                <li key={s.key} className="flex items-center gap-2 text-xs">
                  <Dot tone={STAGE_TONE[s.key]} />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.label}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-foreground">{n}</span>
                  <span className="w-11 shrink-0 text-right tabular-nums text-muted-foreground/70">({pct}%)</span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Requirements Match — average % + verdict distribution bar */}
      <section className="flex flex-col rounded-[20px] border border-border/70 bg-card p-4 shadow-xs sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Target className="size-4 text-primary" aria-hidden />
            Requirements Match
          </p>
          <p className="text-xs font-medium tabular-nums text-muted-foreground">
            {matchStats.n} {matchStats.n === 1 ? "application" : "applications"}
          </p>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-[40px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-foreground">
            {matchStats.avg ?? "—"}
          </span>
          <span className="text-sm font-medium text-muted-foreground">Out of 100</span>
        </div>
        {matchStats.n > 0 ? (
          <>
            <div
              className="mt-4"
              role="img"
              aria-label={`${matchStats.verdicts.met} fully qualified, ${matchStats.verdicts.partial} partially met, ${matchStats.verdicts.unmet} unmet, ${matchStats.verdicts.review} need review`}
            >
              <StageMeters
                counts={[
                  { tone: "success", value: matchStats.verdicts.met },
                  { tone: "warning", value: matchStats.verdicts.partial },
                  { tone: "danger", value: matchStats.verdicts.unmet },
                ]}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {matchStats.verdicts.met} fully qualified
              {matchStats.verdicts.partial > 0 && <> · {matchStats.verdicts.partial} partial</>}
              {matchStats.verdicts.unmet > 0 && <> · {matchStats.verdicts.unmet} unmet</>}
              {matchStats.verdicts.review > 0 && <> · {matchStats.verdicts.review} to verify</>}
            </p>
          </>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">No requirements data yet</p>
        )}
      </section>

      {/* Time in Pipeline — avg days awaiting decision + 14-day volume */}
      <section className="flex flex-col rounded-[20px] border border-border/70 bg-card p-4 shadow-xs sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Hourglass className="size-4 text-primary" aria-hidden />
            Time in Pipeline
          </p>
          <p className="text-xs font-medium tabular-nums text-muted-foreground">
            {pipelineTime.n} awaiting decision
          </p>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-[40px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-foreground">
            {pipelineTime.avg ?? "—"}
          </span>
          <span className="text-sm text-muted-foreground">Days</span>
        </div>
        <div className="mt-auto pt-3">
          <Sparkline points={volume} />
          <p className="mt-1 text-[11px] text-muted-foreground/70">
            Applications received · last 14 days
          </p>
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// Loading skeleton — mirrors the three-panel grid shape.
// ============================================================================

function AnalyticsSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading analytics"
      className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-3"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex flex-col rounded-[20px] border border-border/70 bg-card p-4 shadow-xs sm:p-5"
        >
          <div className="flex items-center gap-2">
            <Skeleton className="size-4 rounded-md" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="mt-4 flex items-center gap-5">
            <Skeleton className="size-[116px] shrink-0 rounded-full" />
            <div className="flex-1 space-y-2.5">
              {[0, 1, 2, 3].map((r) => (
                <Skeleton key={r} className="h-3 w-full" />
              ))}
            </div>
          </div>
          <Skeleton className="mt-5 h-8 w-full" />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// AnalyticsView — the sidebar page.
// ============================================================================

export function AnalyticsView() {
  const { navigate } = useNav();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent?: boolean) => {
    // Silent (focus/poll) refresh keeps the figures in place — no skeleton
    // flash, and a transient failure never clears good data.
    const isSilent = silent === true;
    if (!isSilent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await apiFetch<{ data: QueueItem[] }>("/api/evaluator/queue");
      setItems(res.data ?? []);
    } catch (e) {
      if (!isSilent) {
        setError(e instanceof Error ? e.message : "Failed to load analytics");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime-lite: silent refetch on tab focus + 15s poll while visible —
  // the figures track decisions recorded by admins/other evaluators.
  useRefetchOnFocus(() => load(true), { pollMs: 15_000 });

  const undecided = useMemo(
    () =>
      items.filter((i) => {
        const s = stageForStatus(i.status || "");
        return s === "Applied" || s === "Under Review";
      }).length,
    [items]
  );

  return (
    <PageShell>
      <PageHeader
        eyebrow="Insights"
        title="Analytics"
        chip={
          <>
            <span aria-hidden className="size-1.5 rounded-full bg-success" />
            Live pipeline
          </>
        }
        chipTone="success"
        sub={`${items.length} ${items.length === 1 ? "application" : "applications"} across the recruitment pipeline`}
        actions={
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-lg text-xs"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} aria-hidden />
            Refresh
          </Button>
        }
      />

      <div className="min-w-0">
        {loading ? (
          <AnalyticsSkeleton />
        ) : error ? (
          <QueueErrorState message={error} onRetry={() => void load()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No pipeline data yet"
            sub="When applications are submitted, pipeline health, requirements match and time-in-pipeline figures will appear here."
            action={
              <Button variant="outline" size="sm" onClick={() => navigate("review-queue")}>
                Go to Review Queue
              </Button>
            }
          />
        ) : (
          <>
            <PipelineOverview items={items} />
            {/* Reading aid — quiet footnote tying the figures to the work surface */}
            <p className="mt-4 text-xs text-muted-foreground/70">
              {undecided} {undecided === 1 ? "application" : "applications"} awaiting a decision · figures cover the whole pipeline, updated live
            </p>
          </>
        )}
      </div>
    </PageShell>
  );
}
