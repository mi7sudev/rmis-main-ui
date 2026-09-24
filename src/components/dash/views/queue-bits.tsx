"use client";

// ============================================================================
// Atlas queue bits — presentation subcomponents for the Review Queue view.
//
// Behavior contracts live in views/queue.tsx (endpoints, cadences, gates);
// everything here is pure presentation composed from @/components/dash/kit.
// The analytics figures mirror the legacy client-side math EXACTLY (stage
// distribution, average match %, verdict mix, time-in-pipeline, 14-day
// volume buckets) — computed from the same /api/evaluator/queue payload.
// ============================================================================

import { useMemo, useState } from "react";
import {
  Briefcase,
  ChevronDown,
  Clock,
  Hourglass,
  Inbox,
  MapPin,
  RefreshCw,
  Target,
  TriangleAlert,
  Users,
} from "lucide-react";
import {
  Donut,
  Dot,
  EmptyState,
  Monogram,
  Pill,
  ScoreChip,
  SkBoard,
  SkLedger,
  Sparkline,
  StageMeters,
  relDays,
} from "@/components/dash/kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fullName } from "@/lib/client";
import { humanizeName, humanizeTitle } from "@/lib/humanize";
import {
  PIPELINE_STAGES,
  stageForStatus,
  getStatusMeta,
  type StageKey,
  type Tone,
} from "@/lib/status";

// ============================================================================
// Types — /api/evaluator/queue contract (shape mirrored from the endpoint)
// ============================================================================

/** Compact requirements-match verdict carried by every queue row. */
export type QueueMatchSummary = {
  verdict: "ALL_MET" | "PARTIAL" | "NONE_MET" | "NEEDS_REVIEW" | "NO_REQUIREMENTS";
  metCount: number;
  requiredCount: number;
} | null;

export type QueueItem = {
  id: number | string;
  status: string;
  dateApplied: string;
  applicant: {
    id: number;
    firstName: string | null;
    lastName: string | null;
    emailAddress: string | null;
    contactNumber: string | null;
    gender: string | null;
    isProfileComplete: boolean;
  } | null;
  job: {
    id: number;
    title: string;
    position: {
      positionTitle: string | null;
      placeOfAssignment: { name: string | null } | null;
    } | null;
  } | null;
  match: QueueMatchSummary;
  /** Up to two credential tags (education + eligibility) for the card. */
  tags?: string[];
};

// ============================================================================
// Small helpers
// ============================================================================

export function queueName(item: QueueItem): string {
  return item.applicant ? fullName(item.applicant) : "Unnamed applicant";
}

/** Legacy initials rule: first name's first letter + last name's first letter. */
export function queueInitials(item: QueueItem): string {
  const a = item.applicant;
  if (!a) return "?";
  return ((a.firstName?.[0] || "U") + (a.lastName?.[0] || "")).toUpperCase() || "?";
}

export function queuePosition(item: QueueItem): string {
  return item.job?.position?.positionTitle || item.job?.title || "Untitled Position";
}

/** Match percent for the card pill (null → no pill). */
export function matchPercent(item: QueueItem): { pct: number; tone: Tone } | null {
  const m = item.match;
  if (!m || m.requiredCount <= 0) return null;
  const pct = Math.round((m.metCount / m.requiredCount) * 100);
  const tone: Tone =
    m.verdict === "ALL_MET"
      ? "success"
      : m.verdict === "PARTIAL"
        ? "warning"
        : m.verdict === "NONE_MET"
          ? "danger"
          : "neutral";
  return { pct, tone };
}

/**
 * Requirements-match chip — the kit ScoreChip carrying the verdict tone.
 * ScoreChip bands by score, so verdict-driven danger (NONE_MET) and the
 * neutral needs-review case pass an explicit className to keep semantics.
 */
export function MatchScoreChip({ item, className }: { item: QueueItem; className?: string }) {
  const badge = matchPercent(item);
  if (!badge) return null;
  return (
    <span title={`Requirements match: ${badge.pct}%`} className={cn("inline-flex shrink-0", className)}>
      <ScoreChip
        score={badge.pct}
        className={cn(
          badge.tone === "danger" && "border-destructive/40 bg-destructive/10 text-danger-ink",
          badge.tone === "neutral" && "border-input bg-muted text-muted-foreground"
        )}
      />
    </span>
  );
}

/** Stage → kit tone (Applied primary · Under Review warning · decisions resolve). */
export const STAGE_TONE: Record<StageKey, Tone> = {
  Applied: "primary",
  "Under Review": "warning",
  Shortlisted: "success",
  Rejected: "danger",
};

// ============================================================================
// QueueCard — one floating applicant card inside a pipeline column
// ============================================================================

export function QueueCard({ item, onOpen }: { item: QueueItem; onOpen: () => void }) {
  const place = item.job?.position?.placeOfAssignment?.name;
  const tags = (item.tags ?? []).slice(0, 2);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${humanizeName(queueName(item))}'s candidate detail`}
      className="w-full rounded-[16px] border border-border/70 bg-card p-3.5 text-left shadow-xs transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-2.5">
        <Monogram label={queueInitials(item)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="min-w-0 truncate text-sm font-semibold text-foreground" title={humanizeName(queueName(item))}>
              {humanizeName(queueName(item))}
            </span>
            <MatchScoreChip item={item} className="ml-auto" />
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground" title={humanizeTitle(queuePosition(item))}>
            <Briefcase className="size-3 shrink-0 text-muted-foreground/70" aria-hidden />
            <span className="min-w-0 truncate">{humanizeTitle(queuePosition(item))}</span>
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
            {place && (
              <>
                <MapPin className="size-3 shrink-0 text-muted-foreground/60" aria-hidden />
                <span className="min-w-0 truncate">{place}</span>
                <span aria-hidden className="text-foreground/20">·</span>
              </>
            )}
            <Clock className="size-3 shrink-0 text-muted-foreground/60" aria-hidden />
            <span className="shrink-0 tabular-nums">Applied {relDays(item.dateApplied)}</span>
          </p>
        </div>
      </div>
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/60 pt-2.5">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground/70"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// ============================================================================
// PipelineBoard — tinted stage columns (md 2-up, xl 4-up); on phones the
// columns scroll horizontally INSIDE the band, never the page. First
// CARDS_PREVIEW cards per column, then a "+ N more" expander.
// ============================================================================

const CARDS_PREVIEW = 4;

export function PipelineBoard({
  items,
  onOpenCandidate,
}: {
  items: QueueItem[];
  onOpenCandidate: (item: QueueItem) => void;
}) {
  const [expandedCols, setExpandedCols] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const map = new Map<StageKey, QueueItem[]>();
    for (const stage of PIPELINE_STAGES) map.set(stage.key, []);
    for (const item of items) {
      const arr = map.get(stageForStatus(item.status || ""));
      if (arr) arr.push(item);
    }
    return map;
  }, [items]);

  const toggleColumn = (key: string) => {
    setExpandedCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="-mx-4 px-4 sm:mx-0 sm:px-0">
      <div className="flex snap-x gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-2 md:overflow-visible md:pb-0 xl:grid-cols-4">
        {PIPELINE_STAGES.map((stage) => {
          const colItems = grouped.get(stage.key) ?? [];
          const tone = STAGE_TONE[stage.key];
          const expanded = expandedCols.has(stage.key);
          const shown = expanded ? colItems : colItems.slice(0, CARDS_PREVIEW);
          const hidden = colItems.length - shown.length;
          return (
            <div
              key={stage.key}
              className="flex w-[min(320px,85vw)] shrink-0 snap-start flex-col rounded-[20px] border border-border/70 bg-secondary/40 md:w-auto md:shrink"
            >
              {/* Column header — stage dot + label + count chip */}
              <div className="flex items-center gap-2 px-3.5 pb-2 pt-3.5">
                <Dot tone={tone} />
                <span className="truncate text-sm font-semibold text-foreground">{stage.label}</span>
                <span className="ml-auto inline-flex shrink-0 items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                  {colItems.length}
                </span>
              </div>
              {/* Cards — floating white panels on the tinted column */}
              <div className="flex flex-1 flex-col gap-2 px-2.5 pb-3">
                {colItems.length === 0 ? (
                  <div className="flex min-h-28 flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border/70">
                    <Inbox className="size-5 text-muted-foreground/40" aria-hidden />
                    <span className="text-xs text-muted-foreground/60">No applications</span>
                  </div>
                ) : (
                  <>
                    {shown.map((item) => (
                      <QueueCard
                        key={item.id}
                        item={item}
                        onOpen={() => onOpenCandidate(item)}
                      />
                    ))}
                    {hidden > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleColumn(stage.key)}
                        aria-expanded={expanded}
                        className="flex w-full items-center justify-center rounded-lg border border-dashed border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        + {hidden} more
                      </button>
                    )}
                    {expanded && colItems.length > CARDS_PREVIEW && (
                      <button
                        type="button"
                        onClick={() => toggleColumn(stage.key)}
                        aria-expanded={expanded}
                        className="flex w-full items-center justify-center rounded-lg py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Show less
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// PipelineStats — the analytics band under the board. Three panels, every
// figure computed client-side from the FULL queue payload (not the tab
// filter), exactly like the legacy math.
// ============================================================================

export function PipelineStats({ items }: { items: QueueItem[] }) {
  // 1 — stage distribution
  const stageCounts = useMemo(() => {
    const c: Record<StageKey, number> = {
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
    <div className="mt-4 grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-3">
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
// States — empty / error / skeletons (Atlas shapes)
// ============================================================================

const EMPTY_TITLES: Record<string, string> = {
  ALL: "No applications to review",
  Applied: "No applications waiting for review",
  "Under Review": "No applications under review",
  Shortlisted: "No shortlisted applications",
  Rejected: "No rejected applications",
};

export function QueueEmptyState({
  filter,
  qualifiedOnly,
  onViewAll,
}: {
  filter: string;
  qualifiedOnly: boolean;
  onViewAll: () => void;
}) {
  return (
    <EmptyState
      icon={Inbox}
      title={
        qualifiedOnly && filter === "ALL"
          ? "No fully qualified applicants"
          : EMPTY_TITLES[filter] ?? EMPTY_TITLES.ALL
      }
      sub="When applications are submitted, they will appear here for credential review."
      action={
        filter !== "ALL" || qualifiedOnly ? (
          <Button variant="outline" size="sm" onClick={onViewAll}>
            View all
          </Button>
        ) : undefined
      }
    />
  );
}

export function QueueErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <EmptyState
      icon={TriangleAlert}
      title="Couldn't load the review queue"
      sub={message}
      action={
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="size-4" />
          Retry
        </Button>
      }
    />
  );
}

export function QueueSkeleton({ view }: { view: "kanban" | "list" }) {
  return view === "kanban" ? <SkBoard cols={4} /> : <SkLedger rows={6} />;
}

// Quiet status pill for list rows — stage tone from the status vocabulary.
export function StatusPill({ status }: { status: string }) {
  const meta = getStatusMeta(status);
  return <Pill tone={meta.tone}>{meta.label}</Pill>;
}

// Typographic middot between row vitals — quiet punctuation, no icons.
export function MidDot() {
  return <span aria-hidden className="select-none text-foreground/25">·</span>;
}

// Chevron used by collapsible panels (kept local so queue/review bits share it).
export function Chevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <ChevronDown
      aria-hidden
      className={cn("size-4 text-muted-foreground transition-transform duration-150", open ? "" : "-rotate-90", className)}
    />
  );
}
