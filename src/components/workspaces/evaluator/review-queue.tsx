"use client";

// ============================================================================
// RMIS 2.0 — Review Queue (Evaluator + Administrator workspace)
// MINIMALIST STAFF VIEW. Two view modes behind a segmented control —
//
//   KANBAN (DEFAULT) — a leading "Applicants" roster column with EVERY
//       registered applicant WHO HAS NOT APPLIED YET (people, not
//       applications — from /api/admin/applicants where applicationCount = 0),
//       followed by the decision pipeline grouped by stageForStatus:
//       Applied → Under Review → Shortlisted → Rejected. The five columns
//       partition the universe — nobody appears twice: roster = waiting-to-apply
//       people, the pipeline columns = their applications. One glance shows
//       both the talent pool and every applicant's position in the decision
//       pipeline; clicking a pipeline card opens the same review modal as
//       the list, clicking a roster card opens the candidate profile (there
//       is no application to review yet), and a recorded decision re-renders
//       the board (the card migrates columns on refresh). Columns are equal
//       fractions of the full row width (they fill the table edge to edge).
//       The pipeline columns are the filter (the roster column is
//       overview-only). Plain-typography headers carry the counts — no
//       dots, no match badges; every pipeline card and list row carries its
//       STATUS TAG (Tag icon + label) right beside the applied date — so
//       there is NO separate KPI band.
//   LIST             — the ledger sheet, in the same fixed-height frame.
//
// DESIGN LANGUAGE — quiet, tool-first (no editorial hero type, no gold
// kickers, no momentum sweeps, no staggered entrance animations): compact
// header, flat hairline borders, token colours only, 150ms colour-only
// transitions. Both views are FIXED-HEIGHT (65vh frame on lg+, 60vh cap on
// mobile): rows/columns scroll inside the frame so the page never runs away.
//
// The filter tabs are LIST-ONLY (hidden while the board is up — the column
// headers already group by stage). Switching to the board resets the active
// tab to All, so returning to the list never hides rows unexpectedly.
//
// LABEL VOCABULARY — statuses.ts renders every in-review spelling (the
// explicit Review action AND the legacy For Evaluation / Screening / …
// family) as the single label "Under Review"; fresh submissions are
// "Applied". The queue's pipeline bucket for that whole group — everything
// still waiting to be reviewed or still being reviewed — is the kanban
// column / list tab named "Applied".
//
// REVIEW FLOW — clicking "Review" / "View Decision" (list) or a kanban
// card opens the application in the Review MODAL (review-modal.tsx): the
// applicant dossier (Profile · Education · Experience · Documents) on the
// left and the decision rail on the right. The queue stays mounted behind
// the dimmed canvas — view mode, filter tab and scroll position survive
// the review, and the board/list refreshes after a decision.
//
// API contract:
//   GET /api/evaluator/queue → { data: QueueItem[] }
//
// The queue endpoint always fetches the full set; per-tab filtering is
// client-side so every tab's count stays accurate across all tabs.
// Tabs group by PIPELINE stage (stageForStatus), so every legacy status
// spelling (For Evaluation / Screening / Under Review / …) lands in the
// "Under Review" bucket automatically.
//
// The "Applicants" roster column is fed by GET /api/admin/applicants
// (EVALUATOR + ADMIN allowed), filtered client-side to applicationCount = 0
// — registered applicants who have not applied to any posting yet. Everyone
// who DID apply appears exactly once in a pipeline column, so the board
// never shows the same application twice.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNav } from "@/components/nav-provider";
import { apiFetch, formatDate, fullName } from "@/lib/client";
import { humanizeTitle, humanizeName } from "@/lib/humanize";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";
import {
  EmptyState,
  ErrorState,
  StatusIndicator,
} from "@/components/primitives/workspace";
import { stageForStatus, PIPELINE_STAGES, type StageKey } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Inbox,
  RefreshCw,
  ArrowUpRight,
  UserRound,
  List as ListIcon,
  LayoutGrid,
  MailWarning,
  Loader2,
  BadgeCheck,
} from "lucide-react";
import { toast } from "sonner";
import { ReviewModal } from "@/components/workspaces/evaluator/review-modal";
import { type MatchSummary } from "@/components/workspaces/evaluator/requirements-match";

// ============================================================================
// Types — queue endpoint contract
// ============================================================================

type QueueItem = {
  id: string;
  status: string;
  dateApplied: string;
  applicant: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    emailAddress: string | null;
    contactNumber: string | null;
    gender: string | null;
    isProfileComplete: boolean;
  } | null;
  job: {
    id: string;
    title: string;
    position: {
      positionTitle: string | null;
      placeOfAssignment: { name: string | null } | null;
    } | null;
  } | null;
  /** Compact requirements-match verdict from the queue endpoint. */
  match: MatchSummary;
};

/** Registered applicant (applicants master table) with NO application yet —
    the "Applicants" roster column. Shape returned by
    GET /api/admin/applicants (subset the board needs). */
type RosterApplicant = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  emailAddress: string | null;
  contactNumber: string | null;
  isProfileComplete: boolean;
  createdAt: string | null;
  applicationCount: number;
};

// ============================================================================
// Per-tab filter — groups by pipeline stage, not raw status spelling
// ============================================================================

type Filter = "ALL" | "Applied" | "Under Review" | "Shortlisted" | "Rejected";

// View modes — KANBAN (default) groups the queue into pipeline columns for
// at-a-glance status tracking; LIST is the ledger sheet.
type ViewMode = "kanban" | "list";

// Kanban column chrome per pipeline stage (mirrors the filter tabs).
// Canonical status format: "Applied" = fresh submissions still waiting for
// pick-up; "Under Review" = the explicit evaluator Review action (its OWN
// column); the decision resolves to "Shortlisted" or "Rejected". Grouping
// itself still runs through stageForStatus — the single pipeline authority
// in status.ts. Headers are plain type + count: no dots, no badges.
const STAGE_COLUMNS: Record<StageKey, { label: string }> = {
  Applied: { label: "Applied" },
  "Under Review": { label: "Under Review" },
  Shortlisted: { label: "Shortlisted" },
  Rejected: { label: "Rejected" },
};

const FILTERS: { value: Filter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "Applied", label: "Applied" },
  { value: "Under Review", label: "Under Review" },
  { value: "Shortlisted", label: "Shortlisted" },
  { value: "Rejected", label: "Rejected" },
];

// Empty-state headline per tab (grammatical per-bucket copy).
const EMPTY_TITLES: Record<Filter, string> = {
  ALL: "No applications to review",
  Applied: "No applications waiting for review",
  "Under Review": "No applications under review",
  Shortlisted: "No shortlisted applications",
  Rejected: "No rejected applications",
};

// ============================================================================
// Helpers
// ============================================================================

function getInitials(item: QueueItem): string {
  const a = item.applicant;
  if (!a) return "?";
  return ((a.firstName?.[0] || "U") + (a.lastName?.[0] || "")).toUpperCase();
}

// Typographic middot between row vitals — quiet punctuation, no icons.
function Dot() {
  return <span aria-hidden className="select-none text-foreground/25">·</span>;
}

// ============================================================================
// ReviewQueue — main component
// ============================================================================

export function ReviewQueue() {
  const { navigate } = useNav();
  const [items, setItems] = useState<QueueItem[]>([]);
  // Registered applicants who have NOT applied yet — the "Applicants"
  // roster column (people, not applications; pipeline cards never repeat
  // them).
  const [roster, setRoster] = useState<RosterApplicant[]>([]);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The application currently open in the review modal (null = closed).
  const [reviewId, setReviewId] = useState<number | null>(null);
  // View mode — KANBAN is the default (fastest way to track applicant
  // status across the pipeline); the ledger LIST stays one click away.
  const [view, setView] = useState<ViewMode>("kanban");
  // MOM step 2/3 — "qualified" lens: restrict the board/list to applications
  // whose requirements-match verdict is ALL_MET ("Meets the minimum
  // requirements"). Works in both views, independent of the stage tabs.
  const [qualifiedOnly, setQualifiedOnly] = useState(false);
  // MOM step 4 — bulk automated regret letters for the rejected batch.
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
      // Applications pipeline + the not-yet-applied roster, in parallel.
      // The roster endpoint (admin/applicants, EVALUATOR + ADMIN allowed)
      // carries applicationCount per person — 0 = still waiting to apply.
      // If it ever fails the board still renders; the roster just empties.
      const [qRes, aRes] = await Promise.all([
        apiFetch<{ data: QueueItem[] }>(`/api/evaluator/queue`),
        apiFetch<{ data: RosterApplicant[] }>(
          `/api/admin/applicants?pageSize=100`,
        ).catch(() => null),
      ]);
      setItems(qRes.data ?? []);
      setRoster(
        dedupeRoster(
          (aRes?.data ?? []).filter((a) => (a.applicationCount ?? 0) === 0),
        ),
      );
    } catch (e) {
      if (!isSilent) {
        setError(
          e instanceof Error ? e.message : "Failed to load review queue"
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime-lite: silent refetch on tab focus + 15s poll while visible —
  // decisions recorded by admins/other evaluators (or in another tab) move
  // cards across the board without a manual reload.
  useRefetchOnFocus(() => load(true), { pollMs: 15_000 });

  // ----- Per-tab visible items (client-side filter by pipeline stage) -----
  const visibleItems = useMemo(() => {
    let out = items;
    if (filter !== "ALL") out = out.filter((i) => stageForStatus(i.status || "") === filter);
    if (qualifiedOnly) {
      out = out.filter((i) => i.match?.verdict === "ALL_MET");
    }
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
    <div className="mx-auto w-full max-w-[1400px] 2xl:max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8">
      {/* ===== Compact header — quiet overline + semibold title. Controls
          (view toggle + refresh) sit flush right on sm+, stack under on
          mobile. No display type, no gold kicker. ===== */}
      <header className="mb-6 border-b border-border pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Review Queue
            </p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">
              Review queue
            </h1>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* View mode segmented control — KANBAN (default) / LIST */}
            <div
              className="inline-flex items-center border border-border bg-card p-0.5"
              role="group"
              aria-label="Queue view mode"
            >
              <SegmentedButton
                active={view === "kanban"}
                onClick={() => {
                  setView("kanban");
                  // Tabs are list-only — reset so a tab narrowed in the list
                  // never comes back to a narrowed (tab-less) board.
                  setFilter("ALL");
                }}
                icon={<LayoutGrid className="size-3.5" />}
                label="Kanban"
              />
              <SegmentedButton
                active={view === "list"}
                onClick={() => setView("list")}
                icon={<ListIcon className="size-3.5" />}
                label="List"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      {/* ===== Hairline toolbar — "N items" count (left) + segmented filter
          control (right). Stacks vertically on mobile; the inner
          overflow-x-auto preserves mobile-safe horizontal scroll for the
          tabs. ===== */}
      <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm font-medium tabular-nums text-muted-foreground">
            {visibleItems.length} {visibleItems.length === 1 ? "item" : "items"}
          </p>
          {/* MOM step 2/3 — qualified lens: only applications whose snapshotted
              credentials meet ALL the position's minimum requirements. */}
          <button
            type="button"
            role="switch"
            aria-checked={qualifiedOnly}
            onClick={() => setQualifiedOnly((v) => !v)}
            className={`inline-flex min-h-9 items-center gap-2 border px-3 text-sm font-medium transition-colors ${
              qualifiedOnly
                ? "border-success/40 bg-success/10 text-success-ink"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <BadgeCheck className="size-3.5" />
            Qualified only
          </button>
        </div>
        {/* MOM step 4 — bulk regret for the rejected batch (list view, on the
            Rejected tab: record the decisions first, then send the letters). */}
        {view === "list" && filter === "Rejected" && visibleItems.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkRegretOpen(true)}
            disabled={bulkSending}
          >
            <MailWarning className="size-4" />
            Send regret letters ({visibleItems.length})
          </Button>
        )}
        {/* Filter tabs — LIST-ONLY. On the kanban board the columns already
            group by stage, so the tabs would be redundant; they render (and
            filter rows) only in the list view. */}
        {view === "list" && (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="inline-flex w-auto min-w-max gap-1 bg-secondary p-1">
              {FILTERS.map((f) => {
                const active = filter === f.value;
                const count = counts[f.value];
                return (
                  <button
                    key={f.value}
                    onClick={() => setFilter(f.value)}
                    disabled={loading && filter !== f.value}
                    className={`relative inline-flex min-h-9 items-center gap-2 px-3.5 py-1.5 text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? "bg-card text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f.label}
                    {!loading && (
                      <span
                        className={`inline-flex h-5 min-w-5 items-center justify-center px-1.5 text-[11px] font-semibold tabular-nums ${
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Body — KANBAN pipeline board (default) or the ledger LIST */}
      <div className="mt-4">
        {loading ? (
          view === "kanban" ? (
            <KanbanSkeleton />
          ) : (
            <QueueSkeleton />
          )
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : visibleItems.length === 0 ? (
          <EmptyState
            icon={<Inbox className="size-10" />}
            title={EMPTY_TITLES[filter]}
            description="When applications are submitted, they will appear here for credential review."
            action={
              filter !== "ALL" ? (
                <Button variant="outline" size="sm" onClick={() => setFilter("ALL")}>
                  View all
                </Button>
              ) : undefined
            }
          />
        ) : view === "kanban" ? (
          <KanbanBoard
            items={visibleItems}
            roster={roster}
            onReview={(item) => setReviewId(Number(item.id))}
            onProfile={(item) =>
              item.applicant &&
              navigate("candidate", { id: String(item.applicant.id) })
            }
            onRosterProfile={(person) =>
              navigate("candidate", { id: String(person.id) })
            }
          />
        ) : (
          /* Fixed-height ledger sheet — the frame stays put (same 65vh as
             the kanban columns on lg+; 60vh cap on mobile) and the rows
             scroll inside it, so a long queue never runs the page down. */
          <ScrollArea className="max-h-[60vh] lg:h-[65vh] lg:max-h-[65vh] border border-border [&_[data-slot=scroll-area-viewport]>div]:block!">
            <ul className="divide-y divide-border bg-card">
              {visibleItems.map((item, i) => (
                <ReviewRow
                  key={item.id}
                  item={item}
                  index={i}
                  onReview={() => setReviewId(Number(item.id))}
                  onProfile={() =>
                    item.applicant &&
                    navigate("candidate", { id: String(item.applicant.id) })
                  }
                />
              ))}
            </ul>
          </ScrollArea>
        )}
      </div>

      {/* Review modal — the Review Workspace. Opens in place over the queue;
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

      {/* MOM step 4 — bulk regret confirmation. Shortlisted applications are
          hard-skipped server-side and already-notified applicants are
          deduped, so re-running the batch never double-sends. */}
      <Dialog open={bulkRegretOpen} onOpenChange={setBulkRegretOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="shrink-0">
            <DialogTitle>Send regret letters?</DialogTitle>
            <DialogDescription>
              The automated regret letter will be emailed to each rejected
              applicant in the current view ({visibleItems.length}).
              Shortlisted applications are skipped, and applicants who already
              received a letter are not emailed twice.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="shrink-0">
            <Button variant="ghost" onClick={() => setBulkRegretOpen(false)} disabled={bulkSending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
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
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed to send regret letters");
                } finally {
                  setBulkSending(false);
                }
              }}
              disabled={bulkSending || visibleItems.length === 0}
              className="font-semibold"
            >
              {bulkSending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Send to {visibleItems.length} applicant{visibleItems.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// ReviewRow — a wide ledger row inside ONE continuous surface (no box of
// its own). Quiet identity, muted vitals, single-step hover tint.
// ============================================================================

function ReviewRow({
  item,
  index,
  onReview,
  onProfile,
}: {
  item: QueueItem;
  index: number;
  onReview: () => void;
  onProfile: () => void;
}) {
  const a = item.applicant;
  const decided = item.status === "Shortlisted" || item.status === "Rejected";

  const positionTitle =
    item.job?.position?.positionTitle || item.job?.title || "Untitled Position";
  const place = item.job?.position?.placeOfAssignment?.name;
  const name = a ? fullName(a) : "Unnamed applicant";

  return (
    <li className="group flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-accent/40 sm:flex-row sm:items-center sm:gap-4">
      {/* Row index — quiet, desktop only */}
      <span
        aria-hidden
        className="hidden shrink-0 text-xs tabular-nums text-muted-foreground/60 sm:inline"
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      {/* LEFT — avatar + identity */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center bg-muted text-xs font-semibold text-foreground/70">
          {getInitials(item)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {humanizeName(name)}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="truncate">{humanizeTitle(positionTitle)}</span>
            {place && (
              <>
                <Dot />
                <span className="truncate">{place}</span>
              </>
            )}
            <Dot />
            <span className="shrink-0 tabular-nums">Applied {formatDate(item.dateApplied)}</span>
            {/* STATUS TAG — the decision state lives right beside the date
                ("Applied Aug 31, 2026 · Shortlisted"), same as the kanban
                card footers — one consistent position across both views. */}
            <StatusIndicator status={item.status ?? ""} size="sm" />
          </div>
        </div>
      </div>

      {/* RIGHT — actions (equal fluid width for both labels so the action
          buttons align in a true column across all rows) */}
      <div className="flex items-center gap-2 sm:shrink-0">
        <Button size="sm" onClick={onReview} className="w-[11em]">
          {decided ? "View Decision" : "Review"}
          <ArrowUpRight className="size-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onProfile}
          disabled={!item.applicant}
          aria-label={`View ${name}'s full profile`}
          className="text-muted-foreground hover:text-foreground"
        >
          <UserRound className="size-4" />
          <span className="hidden sm:inline">Profile</span>
        </Button>
      </div>
    </li>
  );
}

// ============================================================================
// QueueSkeleton — mirrors the ledger sheet (ONE sheet, hairline rows).
// Raw bg-muted divs (NOT the Skeleton primitive, whose bg-muted can be
// invisible on tinted surfaces). Each row mirrors the real layout.
// ============================================================================

function QueueSkeleton() {
  return (
    <ul className="divide-y divide-border border border-border bg-card">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <li
          key={i}
          className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4"
        >
          <div className="hidden h-3 w-5 shrink-0 animate-pulse bg-muted sm:block" />
          {/* Avatar + identity bars (second line = vitals + status pill) */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="size-9 shrink-0 animate-pulse bg-muted" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-40 animate-pulse bg-muted" />
              <div className="flex items-center gap-2">
                <div className="h-3 w-44 animate-pulse bg-muted" />
                <div className="h-5 w-24 animate-pulse bg-muted" />
              </div>
            </div>
          </div>
          {/* Action buttons skeleton (primary bar mirrors w-[11em]) */}
          <div className="flex gap-2 sm:shrink-0">
            <div className="h-8 w-[11em] animate-pulse bg-muted" />
            <div className="h-8 w-24 animate-pulse bg-muted" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ============================================================================
// KANBAN VIEW (default) — a leading "Applicants" roster column (every
// registered applicant WHO HAS NOT APPLIED YET — people, from the applicants
// master table) followed by the pipeline columns grouped by stageForStatus,
// so every legacy status spelling (For Evaluation / Screening / Under
// Review / …) lands in the right column. Column format (user-specified):
// Applicants · Applied · Under Review · Shortlisted · Rejected. The five
// columns partition the universe — nobody appears twice: the roster is the
// waiting-to-apply pool, the pipeline columns hold everyone's applications.
// The board ALWAYS shows the full pipeline — the filter tabs are list-only,
// so the pipeline columns themselves are the filter (the roster is
// overview-only).
// MINIMALIST BOARD — quiet muted column panels, flat bordered cards, plain
// header text + count (no dots, no match badges). Each pipeline card's
// footer tags its exact status (StatusIndicator pill — Tag icon + label)
// beside the applied date. Roster cards jump straight to the candidate
// profile (there is no application to review yet). Pipeline cards open the
// same review modal as the list rows, so a decision recorded from the board
// refreshes columns + counts instantly (the card migrates columns on
// refresh).
// Layout: columns are EQUAL FRACTIONS of the full row width (grid-cols-5),
// so the board fills the table edge to edge on lg+; on mobile they stack.
// Each column body is a fixed-height ScrollArea — lg+ pins every column to
// the same 65vh frame (even empty ones), mobile caps at 60vh.
// ============================================================================

function KanbanBoard({
  items,
  roster,
  onReview,
  onProfile,
  onRosterProfile,
}: {
  items: QueueItem[];
  roster: RosterApplicant[];
  onReview: (item: QueueItem) => void;
  onProfile: (item: QueueItem) => void;
  onRosterProfile: (person: RosterApplicant) => void;
}) {
  // Group by pipeline stage (stable column order from PIPELINE_STAGES).
  const grouped = useMemo(() => {
    const map = new Map<StageKey, QueueItem[]>();
    for (const stage of PIPELINE_STAGES) map.set(stage.key, []);
    for (const item of items) {
      const key = stageForStatus(item.status || "");
      const arr = map.get(key);
      if (arr) arr.push(item);
    }
    return map;
  }, [items]);

  // Column order: the "Applicants" roster (registered applicants with NO
  // application yet — the waiting-to-apply pool) leads, then the full
  // pipeline (Applied · Under Review · Shortlisted · Rejected). Roster cards
  // render via RosterCard (profile jump — nothing to review yet); pipeline
  // cards reuse the same modal wiring as the list.
  const columns = [
    {
      key: "roster" as const,
      label: "Applicants",
      empty: "All applicants have applied",
      kind: "roster" as const,
    },
    ...PIPELINE_STAGES.map((stage) => ({
      key: stage.key,
      label: STAGE_COLUMNS[stage.key].label,
      empty: "No applications",
      kind: "stage" as const,
    })),
  ];
  // Per-column items: the roster column holds people; the stage columns
  // hold that stage's applications (stable order from PIPELINE_STAGES).
  const itemsFor = (col: (typeof columns)[number]) =>
    col.kind === "roster" ? roster : (grouped.get(col.key) ?? []);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-5 lg:pb-2">
      {columns.map((col) => {
        const colItems = itemsFor(col);
        return (
        <div key={col.key} className="flex flex-col border border-border bg-secondary/40">
          {/* Column header — plain label (one step larger than card text) +
              quiet count. No dots, no badges: the label IS the stage. */}
          <div className="flex items-center gap-2 px-3 py-3">
            <span className="truncate text-[15px] font-medium text-foreground">
              {col.label}
            </span>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {colItems.length}
            </span>
          </div>
          {/* Column body — bordered cards floating on the muted panel.
              [&_…>div]:block! pins Radix's inner scroll-content wrapper
              (inline display:table) to display:block — the table display
              exists for horizontal scrollables and lets nowrap card text
              inflate the content past the column edge instead of
              truncating; these panels scroll vertically only. lg+ pins
              ALL columns to the same fixed 65vh frame; mobile keeps the
              60vh cap. The h-full twin lets an EMPTY column center its
              placeholder in the frame. */}
          <ScrollArea className="max-h-[60vh] lg:h-[65vh] lg:max-h-[65vh] [&_[data-slot=scroll-area-viewport]>div]:block! [&_[data-slot=scroll-area-viewport]>div]:h-full">
            {colItems.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <span className="text-xs text-muted-foreground/60">{col.empty}</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2 px-2 pb-2">
                {col.kind === "roster"
                  ? colItems.map((person) => (
                      <RosterCard
                        key={person.id}
                        person={person}
                        onProfile={() => onRosterProfile(person)}
                      />
                    ))
                  : (colItems as QueueItem[]).map((item) => (
                      <QueueCard
                        key={item.id}
                        item={item}
                        onReview={() => onReview(item)}
                        onProfile={() => onProfile(item)}
                      />
                    ))}
              </div>
            )}
          </ScrollArea>
        </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// QueueCard — one applicant card inside a kanban column. The card BODY is
// the review trigger (opens the review modal — "Review" / "View Decision"
// depending on decision state) with the profile jump as a sibling button
// top-right; the hairline footer carries the applied date + status tag
// (StatusIndicator pill — Tag icon + label, sitting right beside the date:
// "Applied Aug 31, 2026 · Shortlisted"), wrapping whole (never truncated)
// when a column is too narrow for both on one line.
// Identity: monogram + name + the position · place line below. No hover
// sweeps or entrance animations — a single 150ms border tint on hover is
// the whole affordance.
// ============================================================================

function QueueCard({
  item,
  onReview,
  onProfile,
}: {
  item: QueueItem;
  onReview: () => void;
  onProfile: () => void;
}) {
  const a = item.applicant;
  const name = a ? fullName(a) : "Unnamed applicant";
  const initials = a
    ? ((a.firstName?.[0] || "U") + (a.lastName?.[0] || "")).toUpperCase()
    : "?";
  const positionTitle =
    item.job?.position?.positionTitle || item.job?.title || "Untitled Position";
  const place = item.job?.position?.placeOfAssignment?.name;
  const decided = item.status === "Shortlisted" || item.status === "Rejected";

  return (
    <div className="border border-border bg-card transition-colors duration-150 hover:border-foreground/25">
      {/* Body — review trigger (identity block) + profile jump (sibling
          button, top-right — keeps the footer free for date + status) */}
      <div className="flex items-start gap-2.5 px-3 pt-3">
        <button
          type="button"
          onClick={onReview}
          className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
          aria-label={`${decided ? "View decision for" : "Review"} ${humanizeName(name)}`}
        >
          <span className="grid size-7 shrink-0 place-items-center bg-muted text-[10px] font-semibold text-foreground/70">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span
              className="block truncate text-sm font-medium text-foreground"
              title={humanizeName(name)}
            >
              {humanizeName(name)}
            </span>
            <span
              className="mt-0.5 block truncate text-xs text-muted-foreground"
              title={humanizeTitle(positionTitle)}
            >
              {humanizeTitle(positionTitle)}
              {place && (
                <>
                  {" "}
                  <Dot /> {place}
                </>
              )}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={onProfile}
          disabled={!item.applicant}
          aria-label={`View ${humanizeName(name)}'s full profile`}
          className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center text-muted-foreground/70 transition-colors hover:text-foreground disabled:opacity-40"
        >
          <UserRound className="size-3.5" />
        </button>
      </div>
      {/* Footer — applied date + status tag, exactly as requested:
          "Applied Aug 31, 2026  ⤍ Shortlisted". flex-wrap is the narrow-
          column fallback — the pill drops to its own line WHOLE (never
          truncated) if a column ever gets tighter than date + pill. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pb-2 pt-0.5">
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/80">
          Applied {formatDate(item.dateApplied)}
        </span>
        <StatusIndicator status={item.status ?? ""} size="sm" />
      </div>
    </div>
  );
}

// ============================================================================
// Roster dedupe — production data double-registers people (same name + same
// email, distinct applicant ids). The roster is a PEOPLE list, so collapse
// those pairs: key by email+name (safest — same email with different names
// stays separate), name alone when there is no email, and never collapse
// records with neither. Keep the more complete profile, then the newer one.
// The raw un-collapsed list remains available in the Applicants page.
// ============================================================================

function dedupeRoster(list: RosterApplicant[]): RosterApplicant[] {
  const prefer = (a: RosterApplicant, b: RosterApplicant) => {
    if (a.isProfileComplete !== b.isProfileComplete)
      return a.isProfileComplete ? a : b;
    return (new Date(a.createdAt ?? 0).getTime() ?? 0) >=
      (new Date(b.createdAt ?? 0).getTime() ?? 0)
      ? a
      : b;
  };
  const seen = new Map<string, RosterApplicant>();
  for (const a of list) {
    const email = a.emailAddress?.trim().toLowerCase() || "";
    const name = [a.firstName, a.lastName]
      .filter(Boolean)
      .join(" ")
      .trim()
      .toLowerCase();
    const key = email
      ? name
        ? `${email}|${name}`
        : `email:${email}`
      : name
        ? `name:${name}`
        : `id:${a.id}`;
    const prev = seen.get(key);
    seen.set(key, prev ? prefer(prev, a) : a);
  }
  return Array.from(seen.values());
}

// ============================================================================
// RosterCard — one registered applicant in the "Applicants" column who
// has NOT applied yet (the waiting-to-apply talent pool). The WHOLE card is
// the profile jump — there is no application to review yet, so unlike
// QueueCard there is no review trigger and no status pill; the footer
// carries the registration date and a quiet "Not applied yet" hint in the
// slot where pipeline cards show their status tag. Same flat bordered card
// language + 150ms border tint.
// ============================================================================

function RosterCard({
  person,
  onProfile,
}: {
  person: RosterApplicant;
  onProfile: () => void;
}) {
  const name = fullName(person) || "Unnamed applicant";
  const initials =
    ((person.firstName?.[0] || "U") + (person.lastName?.[0] || "")).toUpperCase();
  // One quiet vital line: email, else contact number, else profile state.
  const vital =
    person.emailAddress ||
    person.contactNumber ||
    (person.isProfileComplete ? "Profile complete" : "Profile incomplete");

  return (
    <div className="border border-border bg-card transition-colors duration-150 hover:border-foreground/25">
      {/* Whole card = profile jump (single button, no nested actions) */}
      <button
        type="button"
        onClick={onProfile}
        aria-label={`View ${humanizeName(name)}'s full profile`}
        className="flex w-full items-start gap-2.5 px-3 pb-2 pt-3 text-left"
      >
        <span className="grid size-7 shrink-0 place-items-center bg-muted text-[10px] font-semibold text-foreground/70">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block truncate text-sm font-medium text-foreground"
            title={humanizeName(name)}
          >
            {humanizeName(name)}
          </span>
          <span
            className="mt-0.5 block truncate text-xs text-muted-foreground"
            title={vital ?? undefined}
          >
            {vital}
          </span>
        </span>
      </button>
      {/* Footer — registration date + quiet "not applied" hint (mirrors the
          date + status-tag slot of the pipeline cards) */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pb-2 pt-0.5">
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/80">
          Registered {formatDate(person.createdAt)}
        </span>
        <span className="text-[11px] text-muted-foreground/60">
          Not applied yet
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// KanbanSkeleton — mirrors the board: muted column panels with a header bar
// + bordered card rows (raw bg-muted divs, same rationale as QueueSkeleton).
// ============================================================================

function KanbanSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-5 lg:pb-2">
      {[0, 1, 2, 3, 4].map((col) => (
        <div
          key={col}
          className="flex flex-col overflow-hidden border border-border bg-secondary/40"
        >
          {/* Column header skeleton — mirrors the larger plain header */}
          <div className="flex items-center justify-between px-3 py-3">
            <div className="h-4 w-28 animate-pulse bg-muted" />
            <div className="h-3.5 w-5 animate-pulse bg-muted" />
          </div>
          {/* Card rows skeleton — name over position line */}
          <div className="flex flex-col gap-2 px-2 pb-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="border border-border bg-card px-3 py-3">
                <div className="flex items-start gap-2.5">
                  <div className="size-7 shrink-0 animate-pulse bg-muted" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="h-3.5 w-32 animate-pulse bg-muted" />
                    <div className="h-3 w-40 animate-pulse bg-muted" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// SegmentedButton — view-mode toggle chip (same pattern as the Candidates
// workspace list/kanban control).
// ============================================================================

function SegmentedButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-8 items-center gap-1.5 px-3 text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
