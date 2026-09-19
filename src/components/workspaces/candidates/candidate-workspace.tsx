"use client";

// ============================================================================
// RMIS 2.0 — Candidate Workspace
// The quiet, tool-first "Candidates" workspace for browsing applicant records.
//
// Two view modes (segmented control):
//   LIST    (default) — a full-width candidate registry ledger. Clicking a
//                       row opens the candidate quick-view in a centered
//                       MODAL (CandidateModal) on ALL viewports.
//   KANBAN           — fetches /api/evaluator/queue and groups applications by
//                       pipeline stage into horizontal columns (scroll on
//                       desktop, stacked on mobile). Clicking a card navigates
//                       to the candidate detail workspace.
//
// DESIGN LANGUAGE — minimalist staff surface (mirrors review-queue): compact
// header, flat hairline borders, token colours only, 150ms colour-only
// transitions. No editorial hero type, no gold kickers, no momentum sweeps,
// no staggered entrance animations, no ghost numerals. Both views use the
// fixed-height 65vh frame (60vh cap on mobile) so rows/columns scroll inside
// the frame.
//
// Deep-link: read params.status (e.g. "incomplete") to initialize the
// profile-completion filter — wired to the Command Center's "Incomplete
// profiles" attention card.
//
// Server-side pagination: PAGE_SIZE=25.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNav } from "@/components/nav-provider";
import { apiFetch, formatDate, fullName } from "@/lib/client";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";
import { FilterBar, EmptyState, ErrorState } from "@/components/primitives/workspace";
import {
  stageForStatus,
  PIPELINE_STAGES,
} from "@/lib/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  RefreshCw,
  List as ListIcon,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Users,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
} from "lucide-react";
import { humanizeName, humanizeTitle } from "@/lib/humanize";
import { CandidateModal } from "@/components/workspaces/candidates/candidate-modal";

// ============================================================================
// Types — list endpoint contract
// ============================================================================
type ApplicantRow = {
  id: number;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  extensionName: string | null;
  emailAddress: string | null;
  contactNumber: string | null;
  mobileNumber: string | null;
  gender: string | null;
  civilStatus: string | null;
  citizenship: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  presentAddress: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  isProfileComplete: boolean;
  qualified: boolean | null;
  statusOfEmployment: string | null;
  employeeNumber: string | null;
  submittedDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  hasAccount: boolean;
  user: {
    id: number;
    username: string | null;
    email: string | null;
    isAdmin: boolean;
    isApplicant: boolean;
    blocked: boolean;
  } | null;
  applicationCount: number;
};

type QueueItem = {
  id: string;
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
    title: string | null;
    position: {
      positionTitle: string | null;
      placeOfAssignment: { name: string | null } | null;
    } | null;
  } | null;
};

type ViewMode = "list" | "kanban";
type StatusFilter = "all" | "complete" | "incomplete";
type AccountFilter = "all" | "yes" | "no";

const PAGE_SIZE = 25;

// Typographic middot between row vitals — quiet punctuation, no icons.
function Dot() {
  return <span aria-hidden className="select-none text-foreground/25">·</span>;
}

// ============================================================================
// Main component
// ============================================================================
export function CandidateWorkspace() {
  const { params } = useNav();

  // Deep-link: ?status=incomplete initializes the profile-completion filter
  // (from the Command Center "Incomplete profiles" attention card).
  const initialStatus: StatusFilter =
    params.status === "incomplete"
      ? "incomplete"
      : params.status === "complete"
        ? "complete"
        : "all";

  const [view, setView] = useState<ViewMode>("list");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus);
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ApplicantRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Quick-view modal state — the currently previewed applicant + open/closed.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 350ms debounced search input → applied search term + reset page.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // Server-side paginated list fetch.
  const load = useCallback(async (silent?: boolean) => {
    // Silent (focus/poll) refresh keeps list + scroll position in place.
    const isSilent = silent === true;
    if (!isSilent) {
      setLoading(true);
      setError(null);
    }
    const qs = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (search) qs.set("search", search);
    if (statusFilter !== "all") qs.set("status", statusFilter);
    if (accountFilter !== "all") qs.set("hasAccount", accountFilter);
    try {
      const res = await apiFetch<{
        data: ApplicantRow[];
        total: number;
        page?: number;
        pageSize?: number;
        hasMore?: boolean;
      }>(`/api/admin/applicants?${qs.toString()}`);
      setRows(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch (e: unknown) {
      // Silent refresh keeps the last good page on a transient failure.
      if (!isSilent) setError(e instanceof Error ? e.message : "Failed to load applicants");
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, accountFilter]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Realtime-lite: profile completions / account changes made elsewhere
  // (another admin, another tab) surface without a manual reload.
  useRefetchOnFocus(() => load(true), { pollMs: 20_000 });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rangeStart = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, total);

  // KPI tile figures — registry total + page-computed breakdown. The quiet
  // grid carries the four headline figures (Total on file / Showing /
  // Complete / Has login) as flat bordered bg-card tiles — micro-label over
  // a tabular figure, all numbers text-foreground.
  const pageComplete = rows.filter((r) => r.isProfileComplete).length;
  const pageHasLogin = rows.filter((r) => r.hasAccount).length;

  const handleRowClick = useCallback((id: number) => {
    setSelectedId(id);
    // Open the quick-view modal (centered dialog) on ALL viewports.
    setModalOpen(true);
  }, []);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <div className="mx-auto w-full max-w-[1400px] 2xl:max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8">
      {/* ===== Compact header — quiet overline + semibold title. The Refresh
          action sits flush right on sm+, stacks under on mobile. No display
          type, no gold kicker; counts live in the tiles + pagination. ===== */}
      <header className="mb-6 border-b border-border pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Candidate Registry
            </p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">
              Candidates
            </h1>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={reload}>
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>
      </header>

      {/* ===== KPI tiles — Total on file / Showing / Complete / Has login.
          Flat bordered bg-card cells: quiet uppercase micro-label + tabular
          figure (all numbers text-foreground — no ghost numerals, no icons,
          no colored figures). "Total on file" uses the registry `total`;
          the rest are computed from the current page rows (the registry
          breakdown is not part of the existing API contract). ===== */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* 01 — Total on file */}
        <div className="border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Total on file
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {total}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            All candidates in the registry
          </p>
        </div>
        {/* 02 — Showing (page) */}
        <div className="border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Showing on page
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {rows.length}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="tabular-nums">{rangeStart}–{rangeEnd}</span> of{" "}
            <span className="tabular-nums">{total}</span>
          </p>
        </div>
        {/* 03 — Complete profiles (page) */}
        <div className="border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Complete profiles
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {pageComplete}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            On this page · finished intake
          </p>
        </div>
        {/* 04 — Has login (page) */}
        <div className="border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Has login
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {pageHasLogin}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            On this page · linked to an account
          </p>
        </div>
      </div>

      {/* Filter bar — search + profile completion + account */}
      <FilterBar>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, email, contact, or employee no..."
            className="pl-9"
            aria-label="Search candidates"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as StatusFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter by profile completion">
            <SelectValue placeholder="Profile" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All profiles</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
            <SelectItem value="incomplete">Incomplete</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={accountFilter}
          onValueChange={(v) => {
            setAccountFilter(v as AccountFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter by account">
            <SelectValue placeholder="Account" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            <SelectItem value="yes">Has login</SelectItem>
            <SelectItem value="no">No login</SelectItem>
          </SelectContent>
        </Select>
        {/* Segmented control — LIST / KANBAN */}
        <div className="inline-flex shrink-0 items-center border border-border bg-card p-0.5">
          <SegmentedButton
            active={view === "list"}
            onClick={() => setView("list")}
            icon={<ListIcon className="size-3.5" />}
            label="List"
          />
          <SegmentedButton
            active={view === "kanban"}
            onClick={() => setView("kanban")}
            icon={<LayoutGrid className="size-3.5" />}
            label="Kanban"
          />
        </div>
      </FilterBar>

      {/* Body */}
      <div className="mt-4">
        {view === "list" ? (
          <ListView
            rows={rows}
            loading={loading}
            error={error}
            onRetry={reload}
            page={safePage}
            totalPages={totalPages}
            total={total}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onPageChange={setPage}
            onRowClick={handleRowClick}
          />
        ) : (
          <KanbanView />
        )}
      </div>

      {/* Quick-view modal — centered dialog, ALL viewports. Opens when a
          registry row is clicked; wider than the default dialog so the
          content fits comfortably. */}
      <CandidateModal
        applicantId={selectedId}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}

// ============================================================================
// LIST VIEW — full-width candidate registry ledger (rows open the modal)
// ============================================================================
function ListView({
  rows,
  loading,
  error,
  onRetry,
  page,
  totalPages,
  total,
  rangeStart,
  rangeEnd,
  onPageChange,
  onRowClick,
}: {
  rows: ApplicantRow[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  page: number;
  totalPages: number;
  total: number;
  rangeStart: number;
  rangeEnd: number;
  onPageChange: (p: number) => void;
  onRowClick: (id: number) => void;
}) {
  return (
    <div className="flex flex-col">
        {/* Hairline toolbar — quiet label (left) + "N records" count (right).
            border-b + pb-3 gives the hairline rhythm. */}
        <div className="flex items-baseline justify-between border-b border-border pb-3">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Candidate registry
          </p>
          {!loading && !error && (
            <p className="text-sm font-medium tabular-nums text-muted-foreground">
              {total} {total === 1 ? "record" : "records"}
            </p>
          )}
        </div>
        {loading ? (
          <div className="mt-3">
            <ListSkeleton />
          </div>
        ) : error ? (
          <div className="mt-3">
            <ErrorState message={error} onRetry={onRetry} />
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-3 border border-border bg-card">
            <EmptyState
              icon={<Users className="size-10" />}
              title="No candidates found"
              description="Try adjusting your search or filters."
            />
          </div>
        ) : (
          <>
            {/* Fixed-height registry sheet — same 65vh frame as the kanban
                columns (60vh cap on mobile): rows scroll inside the frame so
                the page never runs away downward. */}
            <ScrollArea className="mt-3 max-h-[60vh] lg:h-[65vh] lg:max-h-[65vh] border border-border [&_[data-slot=scroll-area-viewport]>div]:block!">
              <div className="divide-y divide-border bg-card">
                {rows.map((row, i) => (
                  <CandidateListRow
                    key={row.id}
                    row={row}
                    index={i}
                    onClick={() => onRowClick(row.id)}
                  />
                ))}
              </div>
            </ScrollArea>
            {/* Pagination footer — a distinct quiet strip below the sheet */}
            <div className="mt-3 flex flex-col items-center justify-between gap-2 border border-border bg-card px-4 py-3 sm:flex-row">
              <p className="text-xs text-muted-foreground">
                Showing{" "}
                <span className="font-medium text-foreground">
                  {rangeStart}–{rangeEnd}
                </span>{" "}
                of{" "}
                <span className="font-medium text-foreground">{total}</span>{" "}
                candidates
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => onPageChange(page - 1)}
                >
                  <ChevronLeft className="size-4" /> Prev
                </Button>
                <span className="text-xs tabular-nums text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => onPageChange(page + 1)}
                >
                  Next <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </>
        )}
    </div>
  );
}

function CandidateListRow({
  row,
  index,
  onClick,
}: {
  row: ApplicantRow;
  index: number;
  onClick: () => void;
}) {
  const name = humanizeName(fullName(row) || "Unnamed Applicant");
  const initials =
    ((row.firstName?.[0] || "") + (row.lastName?.[0] || "")).toUpperCase() || "?";
  const email = row.emailAddress;
  const complete = row.isProfileComplete;
  const appCount = row.applicationCount ?? 0;
  const hasAccount = row.hasAccount;

  // Ledger row — one quiet identity line + one vitals line on the sheet.
  // The whole row is the click target (opens the quick-view modal).
  // Minimalist grammar (mirrors review-queue ReviewRow): no momentum sweep,
  // no ghost numeral, quiet muted index, bg-muted monogram, plain name —
  // a single hover tint is the whole affordance.
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/40"
    >
      {/* Row index — quiet, desktop only */}
      <span
        aria-hidden
        className="hidden shrink-0 text-xs tabular-nums text-muted-foreground/60 sm:inline"
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="grid size-9 shrink-0 place-items-center bg-muted text-xs font-semibold text-foreground/70">
        {initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {name}
          </span>
          {complete ? (
            <span className="inline-flex shrink-0 items-center gap-1 border border-success/40 bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success-ink">
              <CheckCircle2 className="size-2.5" /> Complete
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-danger-ink">
              <AlertCircle className="size-2.5" /> Incomplete
            </span>
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-x-2 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">
            {email || "No email on file"}
          </span>
          <Dot />
          <span className="shrink-0 tabular-nums">
            {appCount} {appCount === 1 ? "application" : "applications"}
          </span>
          <Dot />
          <span className="shrink-0">{hasAccount ? "Has login" : "No login"}</span>
        </span>
      </span>
      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/40" />
    </button>
  );
}

function ListSkeleton() {
  // Mirrors the quiet ledger — ONE bg-card sheet, hairline rows. Raw bg-muted
  // pulse divs (guide-approved skeleton treatment). Each row mirrors the real
  // layout: quiet index + size-9 monogram + 2 stacked text bars + arrow.
  return (
    <div className="divide-y divide-border border border-border bg-card">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          {/* Index skeleton (desktop only) */}
          <div className="hidden h-3 w-5 shrink-0 animate-pulse bg-muted sm:block" />
          <div className="size-9 shrink-0 animate-pulse bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-40 animate-pulse bg-muted" />
            <div className="h-3 w-56 animate-pulse bg-muted" />
          </div>
          <div className="size-4 shrink-0 animate-pulse bg-muted" />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// KANBAN VIEW — pipeline columns from /api/evaluator/queue
// ============================================================================
function KanbanView() {
  const { navigate } = useNav();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadQueue = useCallback(async (silent?: boolean) => {
    const isSilent = silent === true;
    if (!isSilent) {
      setLoading(true);
    }
    try {
      const r = await apiFetch<{ data: QueueItem[] } | QueueItem[]>(
        `/api/evaluator/queue?page=1&pageSize=100`,
      );
      const list = Array.isArray(r) ? r : r.data ?? [];
      setQueue(list);
    } catch (e: unknown) {
      if (!isSilent) setError(e instanceof Error ? e.message : "Failed to load pipeline");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue, refreshKey]);

  // Realtime-lite: decisions recorded anywhere move cards across the
  // pipeline without a manual reload.
  useRefetchOnFocus(() => loadQueue(true), { pollMs: 20_000 });

  // Group queue items by stageForStatus(status).
  const grouped = useMemo(() => {
    const map = new Map<string, QueueItem[]>();
    for (const stage of PIPELINE_STAGES) map.set(stage.key, []);
    for (const item of queue) {
      const key = stageForStatus(item.status || "");
      const arr = map.get(key);
      if (arr) arr.push(item);
    }
    return map;
  }, [queue]);

  if (loading) {
    return (
      <>
        {/* Hairline toolbar skeleton */}
        <div className="flex items-baseline justify-between border-b border-border pb-3">
          <div className="h-3 w-24 animate-pulse bg-muted" />
          <div className="h-4 w-32 animate-pulse bg-muted" />
        </div>
        <div className="mt-3 grid gap-3 lg:grid-flow-col lg:auto-cols-[280px] lg:overflow-x-auto lg:pb-2">
          {PIPELINE_STAGES.map((stage) => (
            <div
              key={stage.key}
              className="flex flex-col border border-border bg-secondary/40"
            >
              {/* Column header skeleton — dot bar + label bar + count bar */}
              <div className="flex items-center gap-2 px-3 py-2.5">
                <div className="size-1.5 shrink-0 animate-pulse rounded-full bg-muted" />
                <div className="h-3.5 w-24 animate-pulse bg-muted" />
                <div className="ml-auto h-3.5 w-5 animate-pulse bg-muted" />
              </div>
              {/* Column body — bordered card rows on the muted panel (raw
                  bg-muted pulses, guide-approved skeleton treatment). */}
              <div className="flex flex-col gap-2 px-2 pb-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="border border-border bg-card px-3 py-3">
                    <div className="flex items-start gap-2.5">
                      <div className="size-7 shrink-0 animate-pulse bg-muted" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="h-3.5 w-28 animate-pulse bg-muted" />
                        <div className="h-3 w-32 animate-pulse bg-muted" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={() => setRefreshKey((k) => k + 1)}
      />
    );
  }

  if (queue.length === 0) {
    return (
      <EmptyState
        icon={<LayoutGrid className="size-10" />}
        title="No applications in the pipeline"
        description="Applications will appear here once applicants submit them."
      />
    );
  }

  // Total across all stage columns (for the hairline toolbar count).
  const totalKanban = queue.length;

  return (
    <>
      {/* Hairline toolbar — quiet label + N applications across the stages. */}
      <div className="flex items-baseline justify-between border-b border-border pb-3">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Pipeline stages
        </p>
        <p className="text-sm font-medium tabular-nums text-muted-foreground">
          {totalKanban} {totalKanban === 1 ? "candidate" : "candidates"} · {PIPELINE_STAGES.length} stages
        </p>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-flow-col lg:auto-cols-[280px] lg:overflow-x-auto lg:pb-2">
        {PIPELINE_STAGES.map((stage) => {
          const items = grouped.get(stage.key) ?? [];
          return (
            <div
              key={stage.key}
              className="flex flex-col border border-border bg-secondary/40"
            >
              {/* Column header — stage dot + plain (normal-case) label +
                  quiet count. No boxed badge, no uppercase wide-tracked
                  eyebrow, no header band. */}
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span
                  aria-hidden
                  className={`size-1.5 shrink-0 rounded-full ${stageDotClass(stage.key)}`}
                />
                <span className="truncate text-[13px] font-medium text-foreground/80">
                  {stage.short}
                </span>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {items.length}
                </span>
              </div>
              {/* Column body — bordered cards floating on the muted panel.
                  [&_…>div]:block! pins Radix's inner scroll-content wrapper
                  (inline display:table) to display:block — nowrap card text
                  would otherwise inflate the content past the 280px column
                  edge instead of truncating; these panels scroll vertically
                  only. lg+ pins ALL columns to the same fixed 65vh frame;
                  mobile keeps the 60vh cap. The h-full twin lets an EMPTY
                  column center its dash. */}
              <ScrollArea className="max-h-[60vh] lg:h-[65vh] lg:max-h-[65vh] [&_[data-slot=scroll-area-viewport]>div]:block! [&_[data-slot=scroll-area-viewport]>div]:h-full">
                {items.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <span className="text-xs text-muted-foreground/60">—</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 px-2 pb-2">
                    {items.map((item) => (
                      <KanbanCard
                        key={item.id}
                        item={item}
                        onClick={() => {
                          const id = item.applicant?.id;
                          if (id != null) {
                            navigate("candidate", { id: String(id) });
                          }
                        }}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          );
        })}
      </div>
    </>
  );
}

function KanbanCard({
  item,
  onClick,
}: {
  item: QueueItem;
  onClick: () => void;
}) {
  const a = item.applicant;
  const name = a ? humanizeName(fullName(a)) : "Unknown applicant";
  const initials =
    a && ((a.firstName?.[0] || "") + (a.lastName?.[0] || "")).toUpperCase()
      ? ((a.firstName?.[0] || "") + (a.lastName?.[0] || "")).toUpperCase()
      : "?";
  const position =
    item.job?.position?.positionTitle ||
    item.job?.title ||
    "Untitled position";
  const place = item.job?.position?.placeOfAssignment?.name;

  // Bordered card on the muted panel — monogram + name + position · place +
  // applied date. NO status pill inside the card: the column header already
  // IS the stage. No momentum sweep, no entrance animation — a single 150ms
  // border tint on hover is the whole affordance (mirrors review-queue).
  return (
    <button
      onClick={onClick}
      className="flex w-full items-start gap-2.5 border border-border bg-card p-3 text-left transition-colors duration-150 hover:border-foreground/25"
    >
      <span className="grid size-7 shrink-0 place-items-center bg-muted text-[10px] font-semibold text-foreground/70">
        {initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {name}
        </span>
        <span
          className="mt-0.5 block truncate text-xs text-muted-foreground"
          title={position}
        >
          {humanizeTitle(position)}
          {place && (
            <>
              {" "}
              <Dot /> {place}
            </>
          )}
        </span>
        <span className="mt-1 block text-[11px] tabular-nums text-muted-foreground/80">
          Applied {formatDate(item.dateApplied)}
        </span>
      </span>
    </button>
  );
}

// ============================================================================
// Segmented control button + helpers
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

// Color the column header dot by stage tone (mirrors TONE_CLASSES —
// mode-tuned: info-ink, success, destructive, neutral muted-foreground).
function stageDotClass(stageKey: string): string {
  switch (stageKey) {
    case "Applied":
      return "bg-info-ink";
    case "Under Review":
      return "bg-primary";
    case "Shortlisted":
      return "bg-success";
    case "Rejected":
      return "bg-destructive";
    default:
      return "bg-muted-foreground";
  }
}
