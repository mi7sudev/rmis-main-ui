"use client";

// ============================================================================
// Atlas — Review Queue (evaluator home #/review-queue, admin secondary).
//
// Behavior parity with the legacy evaluator workspace, presentation from the
// Atlas kit:
//   · Data: GET /api/evaluator/queue → { data: QueueItem[] }; 15s silent poll
//     + tab-focus refetch (useRefetchOnFocus). A silent failure never clears
//     good data.
//   · Pipeline (default): the four-stage board — Applied / Under Review /
//     Shortlisted / Rejected — tinted columns, floating cards (monogram,
//     match %, position, place · applied-relative, ≤2 credential tags),
//     "+ N more" expander per column. Card click → #/candidate?id=.
//   · List: the ledger sheet with stage filter tabs (counts), per-row
//     Review / View Decision (opens the review modal) + Profile
//     (→ #/candidate?id=), and the bulk regret batch on the Rejected tab
//     (confirm gate → POST /api/evaluator/applications/regrets).
//   · The analytics band (Pipeline Overview / Requirements Match / Time in
//     Pipeline) moved to views/analytics.tsx — the dedicated Analytics
//     sidebar page (#/analytics). This view stays a pure work surface.
//   · Qualified-only lens: restricts BOTH views to match.verdict === "ALL_MET"
//     ("Meets the minimum requirements").
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, BadgeCheck, Loader2, MailWarning, RefreshCw, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Monogram, PageHeader, PageShell, ViewTabs, fmtDate } from "@/components/dash/kit";
import {
  MatchScoreChip,
  MidDot,
  PipelineBoard,
  QueueEmptyState,
  QueueErrorState,
  QueueSkeleton,
  StatusPill,
  queueInitials,
  queueName,
  queuePosition,
  type QueueItem,
} from "@/components/dash/views/queue-bits";
import { ReviewModal } from "@/components/dash/views/review";
import { useNav } from "@/components/nav-provider";
import { apiFetch } from "@/lib/client";
import { humanizeName, humanizeTitle } from "@/lib/humanize";
import { stageForStatus } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";

// Per-tab filter — groups by pipeline stage, not raw status spelling.
type Filter = "ALL" | "Applied" | "Under Review" | "Shortlisted" | "Rejected";
type ViewMode = "kanban" | "list";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "Applied", label: "Applied" },
  { value: "Under Review", label: "Under Review" },
  { value: "Shortlisted", label: "Shortlisted" },
  { value: "Rejected", label: "Rejected" },
];

// ============================================================================
// QueueView
// ============================================================================

export function QueueView() {
  const { navigate } = useNav();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The application currently open in the review modal (null = closed).
  const [reviewId, setReviewId] = useState<number | null>(null);
  // PIPELINE (default) is the board; the ledger LIST stays one tab away.
  const [view, setView] = useState<ViewMode>("kanban");
  // "Qualified" lens: match.verdict === "ALL_MET" only. Works in both views.
  const [qualifiedOnly, setQualifiedOnly] = useState(false);
  // Bulk automated regret letters for the rejected batch (list view only).
  const [bulkRegretOpen, setBulkRegretOpen] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);

  const load = useCallback(async (silent?: boolean) => {
    // Silent (focus/poll) refresh keeps the board in place — no skeleton
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
        setError(e instanceof Error ? e.message : "Failed to load review queue");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime-lite: silent refetch on tab focus + 15s poll while visible —
  // decisions recorded by admins/other evaluators move cards across the
  // board without a manual reload.
  useRefetchOnFocus(() => load(true), { pollMs: 15_000 });

  // ----- Per-tab visible items (client-side filter by pipeline stage) -----
  const visibleItems = useMemo(() => {
    let out = items;
    if (filter !== "ALL") out = out.filter((i) => stageForStatus(i.status || "") === filter);
    if (qualifiedOnly) out = out.filter((i) => i.match?.verdict === "ALL_MET");
    return out;
  }, [items, filter, qualifiedOnly]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      ALL: items.length,
      Applied: 0,
      "Under Review": 0,
      Shortlisted: 0,
      Rejected: 0,
    };
    for (const i of items) c[stageForStatus(i.status || "")]++;
    return c;
  }, [items]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="My Work"
        title="Review Queue"
        chip={
          <>
            <span aria-hidden className="size-1.5 rounded-full bg-success" />
            Live pipeline
          </>
        }
        chipTone="success"
        sub={`${counts.ALL} ${counts.ALL === 1 ? "application" : "applications"} across the recruitment pipeline`}
        actions={
          <>
            {/* Qualified-only lens — switches BOTH views to ALL_MET rows */}
            <label
              htmlFor="queue-qualified-only"
              className={cn(
                "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
                qualifiedOnly
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              <BadgeCheck className="size-3.5" aria-hidden />
              Qualified only
              <Switch
                id="queue-qualified-only"
                checked={qualifiedOnly}
                onCheckedChange={setQualifiedOnly}
                aria-label="Show fully qualified applicants only"
                className="ml-0.5"
              />
            </label>
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
          </>
        }
      />

      {/* View tabs — Pipeline (board, default) | List (ledger) */}
      <ViewTabs
        value={view}
        onChange={(v) => {
          setView(v);
          // Tabs are list-only — reset so a tab narrowed in the list never
          // comes back to a narrowed (tab-less) board.
          if (v === "kanban") setFilter("ALL");
        }}
        tabs={[
          { value: "kanban", label: "Pipeline" },
          { value: "list", label: "List" },
        ]}
        className="mb-4"
      />

      {/* Hairline toolbar — LIST ONLY: item count + bulk regret + stage tabs */}
      {view === "list" && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium tabular-nums text-muted-foreground">
              {visibleItems.length} {visibleItems.length === 1 ? "item" : "items"}
            </p>
            {filter === "Rejected" && visibleItems.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setBulkRegretOpen(true)}
                disabled={bulkSending}
              >
                <MailWarning className="size-4" aria-hidden />
                Send regret letters ({visibleItems.length})
              </Button>
            )}
          </div>
          {/* Stage filter tabs with counts (client-side, from the full queue) */}
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="inline-flex w-auto min-w-max gap-1 rounded-lg bg-secondary p-1" role="tablist" aria-label="Filter by stage">
              {FILTERS.map((f) => {
                const active = filter === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(f.value)}
                    disabled={loading && filter !== f.value}
                    className={cn(
                      "relative inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {f.label}
                    <span
                      className={cn(
                        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                        active ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"
                      )}
                    >
                      {counts[f.value]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Body — board (default) or ledger */}
      <div className="min-w-0">
        {loading ? (
          <QueueSkeleton view={view} />
        ) : error ? (
          <QueueErrorState message={error} onRetry={() => void load()} />
        ) : visibleItems.length === 0 ? (
          <QueueEmptyState
            filter={filter}
            qualifiedOnly={qualifiedOnly}
            onViewAll={() => {
              setFilter("ALL");
              setQualifiedOnly(false);
            }}
          />
        ) : view === "kanban" ? (
          <PipelineBoard
            items={visibleItems}
            onOpenCandidate={(item) =>
              item.applicant && navigate("candidate", { id: String(item.applicant.id) })
            }
          />
        ) : (
          /* Fixed-height ledger sheet — the frame stays put and the rows
             scroll inside it, so a long queue never runs the page down. */
          <div className="max-h-[60vh] overflow-hidden rounded-2xl border border-border bg-card shadow-xs lg:h-[65vh] lg:max-h-[65vh]">
            <ul className="divide-y divide-border overflow-y-auto [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5 lg:h-[calc(65vh-1px)]">
              {visibleItems.map((item, i) => {
                const a = item.applicant;
                const decided = item.status === "Shortlisted" || item.status === "Rejected";
                const place = item.job?.position?.placeOfAssignment?.name;
                return (
                  <li
                    key={item.id}
                    className="group flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-accent/40 sm:flex-row sm:items-center sm:gap-4"
                  >
                    {/* Row index — quiet, desktop only */}
                    <span aria-hidden className="hidden shrink-0 text-xs tabular-nums text-muted-foreground/60 sm:inline">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {/* Identity */}
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Monogram label={queueInitials(item)} size="sm" className="size-9 text-[13px]" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="min-w-0 truncate text-sm font-semibold text-foreground">{humanizeName(queueName(item))}</p>
                          <MatchScoreChip item={item} className="ml-auto" />
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="truncate">{humanizeTitle(queuePosition(item))}</span>
                          {place && (
                            <>
                              <MidDot />
                              <span className="truncate">{place}</span>
                            </>
                          )}
                          {a && (a.emailAddress || a.contactNumber) && (
                            <>
                              <span className="hidden lg:inline"><MidDot /></span>
                              <span className="hidden truncate lg:inline">{a.emailAddress || a.contactNumber}</span>
                            </>
                          )}
                          <MidDot />
                          <span className="shrink-0 tabular-nums">Applied {fmtDate(item.dateApplied)}</span>
                          <StatusPill status={item.status ?? ""} />
                        </div>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-2 sm:shrink-0">
                      <Button size="sm" className="w-[11em]" onClick={() => setReviewId(Number(item.id))}>
                        {decided ? "View Decision" : "Review"}
                        <ArrowUpRight className="size-4" aria-hidden />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => a && navigate("candidate", { id: String(a.id) })}
                        disabled={!a}
                        aria-label={`View ${humanizeName(queueName(item))}'s full profile`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <UserRound className="size-4" aria-hidden />
                        <span className="hidden sm:inline">Profile</span>
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Review modal — opens from list rows ("Review" / "View Decision").
          onDecided refreshes the rows so status pills and counts update the
          moment a decision is recorded. */}
      <ReviewModal
        applicationId={reviewId}
        open={reviewId != null}
        onOpenChange={(v) => {
          if (!v) setReviewId(null);
        }}
        onDecided={() => load(true)}
      />

      {/* Bulk regret confirmation. Shortlisted applications are hard-skipped
          server-side and already-notified applicants are deduped, so re-running
          the batch never double-sends. */}
      <AlertDialog open={bulkRegretOpen} onOpenChange={setBulkRegretOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Send regret letters?</AlertDialogTitle>
            <AlertDialogDescription>
              The automated regret letter will be emailed to each rejected
              applicant in the current view ({visibleItems.length}). Shortlisted
              applications are skipped, and applicants who already received a
              letter are not emailed twice.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkSending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive font-semibold text-white hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault(); // keep the dialog open while sending
                setBulkSending(true);
                try {
                  const ids = visibleItems.map((i) => Number(i.id));
                  const res = await apiFetch<{
                    summary: { sent: number; alreadySent: number; shortlisted: number; failed: number; total: number };
                  }>("/api/evaluator/applications/regrets", {
                    method: "POST",
                    body: JSON.stringify({ applicationIds: ids }),
                  });
                  toast.success(
                    `Regret letters sent to ${res.summary.sent} of ${res.summary.total} applicants.`,
                    {
                      description: [
                        res.summary.alreadySent ? `${res.summary.alreadySent} already had a letter.` : null,
                        res.summary.failed ? `${res.summary.failed} failed — retry the batch.` : null,
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined,
                    }
                  );
                  setBulkRegretOpen(false);
                } catch (e2) {
                  toast.error(e2 instanceof Error ? e2.message : "Failed to send regret letters");
                } finally {
                  setBulkSending(false);
                }
              }}
              disabled={bulkSending || visibleItems.length === 0}
            >
              {bulkSending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
              Send to {visibleItems.length} applicant{visibleItems.length === 1 ? "" : "s"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
