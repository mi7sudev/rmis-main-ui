"use client";

// ============================================================================
// Atlas dash rebuild — §3.4 Candidate Registry (#/candidates).
//
// Rebuilt from scratch against DASH-REBUILD-SPEC.md; behavior contract copied
// from the legacy candidate workspace + quick-view modal (reference only):
//
//   • GET /api/admin/applicants?page=&pageSize=25[&search=&status=&hasAccount=]
//     — server-paginated registry (PAGE_SIZE = 25).
//   • 20s silent poll + focus refresh (useRefetchOnFocus) + manual Refresh.
//   • Deep link #/candidates?status=incomplete|complete preselects the
//     profile-completion filter (Operations attention tile) — and the filter
//     writes back to the hash via navigate so the view stays shareable.
//   • List = the registry ledger; a row opens the QUICK-VIEW modal (dialog).
//   • Kanban = GET /api/evaluator/queue?page=1&pageSize=100 applications
//     grouped by pipeline stage (Applied / Under Review / Shortlisted /
//     Rejected); a card navigates to the candidate dossier.
//   • "View full profile" in the quick view → #/candidate?id=<applicantId>.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNav } from "@/components/nav-provider";
import { apiFetch, fullName } from "@/lib/client";
import { humanizeName, humanizeTitle } from "@/lib/humanize";
import {
  isRejectedStatus,
  isInReviewStatus,
  stageForStatus,
  PIPELINE_STAGES,
  type Tone,
} from "@/lib/status";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";
import {
  Button,
} from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  ArrowUpRight,
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  LayoutGrid,
  List as ListIcon,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import {
  Dot,
  EmptyState,
  KpiTile,
  Monogram,
  PageHeader,
  PageShell,
  Panel,
  Pill,
  ScoreChip,
  SkBoard,
  SkLedger,
  ViewTabs,
  fmtDate,
  initials,
  relDays,
  useDebounced,
} from "@/components/dash/kit";
import {
  DocumentRow,
  LoadError,
  MicroLabel,
  stageTone,
  type ApplicantDetail,
  type ApplicantRow,
  type QueueItem,
  renderEducation,
  humanizeRecord,
} from "@/components/dash/views/candidate-bits";

type ViewMode = "list" | "kanban";
type StatusFilter = "all" | "complete" | "incomplete";
type AccountFilter = "all" | "yes" | "no";

const PAGE_SIZE = 25;

/** Requirements match percent for the card's ScoreChip (null → no badge). */
function matchPercent(item: QueueItem): number | null {
  const m = item.match;
  if (!m || m.requiredCount <= 0) return null;
  return Math.round((m.metCount / m.requiredCount) * 100);
}

// ============================================================================
// CandidatesView — the registry page
// ============================================================================

export function CandidatesView() {
  const { params, navigate } = useNav();

  // Deep-link: ?status=incomplete initializes the profile-completion filter
  // (from the Operations "Incomplete profiles" attention tile).
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
  const [kanbanKey, setKanbanKey] = useState(0);

  // Quick-view modal state — the currently previewed applicant + open/closed.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // 350ms debounced search input → applied search term + reset page.
  const debouncedSearch = useDebounced(searchInput, 350);
  useEffect(() => {
    setSearch(debouncedSearch.trim());
    setPage(1);
  }, [debouncedSearch]);

  // Server-side paginated list fetch.
  const load = useCallback(
    async (silent?: boolean) => {
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
    },
    [page, search, statusFilter, accountFilter]
  );

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

  // KPI tile figures — registry total + page-computed breakdown. "Total on
  // file" uses the registry `total`; the rest are computed from the current
  // page rows (the registry breakdown is not part of the existing API
  // contract).
  const pageComplete = rows.filter((r) => r.isProfileComplete).length;
  const pageHasLogin = rows.filter((r) => r.hasAccount).length;

  const handleRowClick = useCallback((id: number) => {
    setSelectedId(id);
    setModalOpen(true);
  }, []);

  const reload = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setKanbanKey((k) => k + 1);
  }, []);

  // Profile-completion filter — deep-link write-back keeps #/candidates?status=
  // shareable (the Operations tiles deep-link here with ?status=incomplete).
  const handleStatusChange = useCallback(
    (v: StatusFilter) => {
      setStatusFilter(v);
      setPage(1);
      navigate("candidates", v === "all" ? {} : { status: v });
    },
    [navigate]
  );

  return (
    <PageShell>
      {/* ===== Header — title + registry chip + count subline; the ViewTabs
          strip (List | Kanban) carries the manual Refresh flush right. ===== */}
      <PageHeader
        eyebrow="Talent"
        title="Candidates"
        chip={
          <>
            <span aria-hidden className="size-1.5 rounded-full bg-primary" />
            Candidate Registry
          </>
        }
        sub={
          <>
            {total} {total === 1 ? "candidate" : "candidates"} on file
          </>
        }
      />

      <div className="-mt-2 mb-5 flex flex-wrap items-stretch justify-between gap-x-6 gap-y-2 border-b border-border">
        <ViewTabs
          tabs={[
            { value: "list", label: <span className="inline-flex items-center gap-1.5"><ListIcon className="size-3.5" aria-hidden />List</span> },
            { value: "kanban", label: <span className="inline-flex items-center gap-1.5"><LayoutGrid className="size-3.5" aria-hidden />Kanban</span> },
          ]}
          value={view}
          onChange={(v) => setView(v)}
          className="border-b-0"
        />
        <div className="flex items-center pb-2.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-lg text-xs"
            onClick={reload}
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ===== KPI tiles — Total on file / Showing / Complete / Has logins. ===== */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={Users} tone="primary" label="Total on file" value={total} />
        <KpiTile
          icon={ListIcon}
          tone="info"
          label={
            <>
              Showing on page ·{" "}
              <span className="tabular-nums">
                {rangeStart}–{rangeEnd} of {total}
              </span>
            </>
          }
          value={rows.length}
        />
        <KpiTile icon={CheckCircle2} tone="success" label="Complete profiles · on this page" value={pageComplete} />
        <KpiTile icon={KeyRound} tone="warning" label="Has logins · on this page" value={pageHasLogin} />
      </div>

      {/* ===== Filter bar — debounced search + profile completion + account. ===== */}
      <Panel flush className="mt-4 flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3">
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
          onValueChange={(v) => handleStatusChange(v as StatusFilter)}
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
      </Panel>

      {/* ===== Body ===== */}
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
          <KanbanView refreshKey={kanbanKey} />
        )}
      </div>

      {/* ===== Quick-view modal — centered dialog on ALL viewports. ===== */}
      <QuickViewModal
        applicantId={selectedId}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </PageShell>
  );
}

// ============================================================================
// LIST VIEW — the candidate registry ledger (rows open the quick view)
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
      {loading ? (
        <SkLedger rows={8} />
      ) : error ? (
        <Panel flush>
          <LoadError message={error} onRetry={onRetry} />
        </Panel>
      ) : rows.length === 0 ? (
        <Panel flush>
          <EmptyState
            icon={Users}
            title="No candidates found"
            sub="Try adjusting your search or filters."
          />
        </Panel>
      ) : (
        <>
          {/* Registry sheet — fixed-height frame: rows scroll inside so the
              page never runs away downward (60vh cap on mobile, 65vh on lg). */}
          <Panel flush className="overflow-hidden">
            <div className="flex items-baseline justify-between border-b border-border px-4 py-3 sm:px-5">
              <MicroLabel>Candidate registry</MicroLabel>
              <p className="text-sm font-medium tabular-nums text-muted-foreground">
                {total} {total === 1 ? "record" : "records"}
              </p>
            </div>
            <div className="max-h-[60vh] divide-y divide-border overflow-y-auto lg:h-[65vh] lg:max-h-[65vh]">
              {rows.map((row, i) => (
                <CandidateListRow
                  key={row.id}
                  row={row}
                  index={i}
                  onClick={() => onRowClick(row.id)}
                />
              ))}
            </div>
          </Panel>

          {/* Pagination footer — a distinct quiet strip below the sheet. */}
          <Panel flush className="mt-3 flex flex-col items-center justify-between gap-2 px-4 py-3 sm:flex-row">
            <p className="text-xs text-muted-foreground">
              Showing{" "}
              <span className="font-medium text-foreground tabular-nums">
                {rangeStart}–{rangeEnd}
              </span>{" "}
              of{" "}
              <span className="font-medium text-foreground tabular-nums">{total}</span>{" "}
              candidates
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
              >
                <ChevronLeft className="size-4" /> Previous
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
          </Panel>
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
  const email = row.emailAddress;
  const complete = row.isProfileComplete;
  const appCount = row.applicationCount ?? 0;
  const hasAccount = row.hasAccount;
  const place = [row.city, row.province].filter(Boolean).join(", ");

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      {/* Row index — muted tabular numeral, desktop only */}
      <span
        aria-hidden
        className="hidden shrink-0 text-xs tabular-nums text-muted-foreground/60 sm:inline"
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      {/* Gradient monogram (registry payload carries no photo URL). */}
      <Monogram label={initials(fullName(row))} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground">{name}</span>
          {complete ? (
            <Pill tone="success" className="shrink-0">
              <CheckCircle2 className="size-2.5" aria-hidden /> Complete
            </Pill>
          ) : (
            <Pill tone="danger" className="shrink-0">
              <AlertCircle className="size-2.5" aria-hidden /> Incomplete
            </Pill>
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-x-2 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">{email || "No email on file"}</span>
          <span aria-hidden className="select-none text-foreground/25">·</span>
          <span className="shrink-0 tabular-nums">
            {appCount} {appCount === 1 ? "application" : "applications"}
          </span>
          <Pill tone={hasAccount ? "success" : "neutral"} className="hidden shrink-0 sm:inline-flex">
            {hasAccount ? "Has login" : "No login"}
          </Pill>
          {row.employeeNumber ? (
            <span className="hidden shrink-0 items-center gap-x-2 lg:flex">
              <span aria-hidden className="select-none text-foreground/25">·</span>
              <span className="shrink-0 tabular-nums">Emp. No. {row.employeeNumber}</span>
            </span>
          ) : null}
          {place ? (
            <span className="hidden min-w-0 items-center gap-x-2 lg:flex">
              <span aria-hidden className="select-none text-foreground/25">·</span>
              <span className="min-w-0 truncate">{place}</span>
            </span>
          ) : null}
          <span className="hidden shrink-0 items-center gap-x-2 lg:flex">
            <span aria-hidden className="select-none text-foreground/25">·</span>
            <span className="shrink-0">Registered {fmtDate(row.createdAt)}</span>
          </span>
        </span>
      </span>
      <span
        aria-hidden
        className="shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
      >
        <ChevronRight className="size-4 text-muted-foreground/40" />
      </span>
    </button>
  );
}

// ============================================================================
// KANBAN VIEW — pipeline columns from /api/evaluator/queue
// (applications only — the legacy kanban mounts no roster; mirrored.)
// ============================================================================

function KanbanView({ refreshKey }: { refreshKey: number }) {
  const { navigate } = useNav();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadQueue = useCallback(async (silent?: boolean) => {
    const isSilent = silent === true;
    if (!isSilent) {
      setLoading(true);
    }
    try {
      const r = await apiFetch<{ data: QueueItem[] } | QueueItem[]>(
        `/api/evaluator/queue?page=1&pageSize=100`
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

  // Group queue items by stageForStatus(status) into the canonical columns.
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
    return <SkBoard cols={4} />;
  }

  if (error) {
    return (
      <Panel flush>
        <LoadError message={error} onRetry={() => void loadQueue()} />
      </Panel>
    );
  }

  if (queue.length === 0) {
    return (
      <Panel flush>
        <EmptyState
          icon={LayoutGrid}
          title="No applications in the pipeline"
          sub="Applications will appear here once applicants submit them."
        />
      </Panel>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {PIPELINE_STAGES.map((stage) => {
        const items = grouped.get(stage.key) ?? [];
        return (
          <div
            key={stage.key}
            className="flex flex-col rounded-[20px] bg-secondary/40 p-3"
          >
            {/* Column header — stage dot + semibold label + count badge. */}
            <div className="flex items-center gap-2 px-1 pb-2.5 pt-0.5">
              <Dot tone={stageTone(stage.key)} />
              <span className="truncate text-sm font-semibold text-foreground">
                {stage.label}
              </span>
              <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-2 text-xs font-semibold tabular-nums text-foreground/70">
                {items.length}
              </span>
            </div>
            {/* Column body — floating cards on the tinted panel. Empty
                columns center their quiet dash. */}
            <div className="max-h-[60vh] overflow-y-auto lg:h-[65vh] lg:max-h-[65vh]">
              {items.length === 0 ? (
                <div className="flex h-full min-h-24 items-center justify-center pb-3">
                  <span className="text-xs text-muted-foreground/60">No applications</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2 pt-0.5">
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
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({ item, onClick }: { item: QueueItem; onClick: () => void }) {
  const a = item.applicant;
  const name = a ? humanizeName(fullName(a)) : "Unknown applicant";
  const position =
    item.job?.position?.positionTitle || item.job?.title || "Untitled position";
  const place = item.job?.position?.placeOfAssignment?.name;
  const badge = matchPercent(item);
  const tags = (item.tags ?? []).slice(0, 2);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-border bg-card p-3 text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-start gap-2.5">
        <Monogram label={initials(fullName(a))} className="size-9" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground" title={name}>
              {name}
            </span>
            {badge != null && (
              <span className="ml-auto shrink-0" title={`Requirements match: ${badge}%`}>
                <ScoreChip score={badge} />
              </span>
            )}
          </span>
          <span
            className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"
            title={humanizeTitle(position)}
          >
            <Briefcase className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{humanizeTitle(position)}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground/80">
            {place && (
              <>
                <MapPin className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{place}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <Calendar className="size-3 shrink-0" aria-hidden />
            <span className="shrink-0 tabular-nums">Applied {relDays(item.dateApplied)}</span>
          </span>
        </span>
      </span>
      {tags.length > 0 && (
        <span className="mt-2.5 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground/70"
            >
              {t}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

// ============================================================================
// QUICK-VIEW MODAL — rebuilt from the legacy candidate modal:
// identity header, Contact + Pipeline (two-up sm+), Education + Documents
// (two-up lg+), footer "View full profile" → #/candidate?id=.
// ============================================================================

// Mini-pipeline stage order (modal-specific): Submitted → Review →
// Shortlisted. Rejected applications stay pinned at "Submitted" — the status
// chip carries the negative tone.
const MODAL_STAGES = [
  { key: "Applied", label: "Submitted", tone: "primary" as Tone },
  { key: "Review", label: "Review", tone: "warning" as Tone },
  { key: "Shortlisted", label: "Shortlisted", tone: "success" as Tone },
];

/** Highest stage reached across the applicant's applications (-1 when none).
 *  Shortlisted-family statuses fill the whole timeline; rejected ones stay
 *  pinned at Submitted (index 0). */
function computePipeline(applications: { status: string | null }[]): {
  reached: number;
  anyRejected: boolean;
} {
  const anyRejected = applications.some((a) => isRejectedStatus(a.status ?? ""));
  if (applications.length === 0) return { reached: -1, anyRejected: false };
  let reached = 0;
  for (const app of applications) {
    const status = app.status ?? "";
    if (stageForStatus(status) === "Shortlisted") return { reached: 2, anyRejected };
    if (isInReviewStatus(status)) reached = Math.max(reached, 1);
  }
  return { reached, anyRejected };
}

/** Labeled mini-pipeline dots (Submitted → Review → Shortlisted) composed
 *  from the kit Dot — reached stages carry their tone, unreached ones stay
 *  muted. */
function PipelineDots({
  stages,
}: {
  stages: { key: string; label: string; tone: Tone; active: boolean }[];
}) {
  return (
    <ol className="mt-4 flex flex-wrap items-center gap-x-1 gap-y-1.5">
      {stages.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden className="mx-1 h-px w-3 bg-border" />}
          <Dot tone={s.active ? s.tone : "neutral"} className={s.active ? undefined : "opacity-40"} />
          <span
            className={`text-[11px] font-medium ${s.active ? "text-foreground" : "text-muted-foreground"}`}
          >
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function QuickViewModal({
  applicantId,
  open,
  onOpenChange,
}: {
  applicantId: number | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [data, setData] = useState<ApplicantDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<number | null>(null);

  useEffect(() => {
    // Skip when no applicantId is selected or the dialog is closed.
    if (applicantId == null || !open) return;
    // Skip fetching if we already have this applicant loaded.
    if (loadedId === applicantId && data) return;

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      setData(null);
      try {
        const res = await apiFetch<ApplicantDetail>(
          `/api/admin/applicants/${applicantId}`
        );
        if (cancelled) return;
        setData(res);
        setLoadedId(applicantId);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load applicant");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [applicantId, open, loadedId, data]);

  const { navigate } = useNav();

  const showSkeleton = loading && (!data || loadedId !== applicantId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Wider-than-default dialog so the quick-view sections breathe; flush
          p-0/gap-0 — header, scroll body and footer manage their own padding
          + hairlines. */}
      <DialogContent
        aria-describedby={undefined}
        className="gap-0 overflow-hidden p-0 sm:max-w-3xl lg:max-w-[960px] xl:max-w-[1040px]"
      >
        <div className="flex max-h-[calc(100vh-2rem)] min-h-0 flex-col overflow-hidden">
          {applicantId == null ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
              <Mail className="mb-3 size-8 text-muted-foreground/50" aria-hidden />
              <DialogTitle className="text-sm font-semibold tracking-tight text-foreground">
                Select a candidate to preview
              </DialogTitle>
            </div>
          ) : showSkeleton ? (
            <ModalSkeleton />
          ) : error || !data ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
              <AlertCircle className="mb-3 size-8 text-muted-foreground/50" aria-hidden />
              <DialogTitle className="text-sm font-semibold tracking-tight text-foreground">
                Unable to load profile
              </DialogTitle>
              <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
                {error || "Applicant not found"}
              </p>
            </div>
          ) : (
            <ModalLoaded
              data={data}
              onOpenProfile={(id) => {
                // Close the modal FIRST (legacy footer contract), then land
                // on the dossier.
                onOpenChange(false);
                navigate("candidate", { id: String(id) });
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModalLoaded({
  data,
  onOpenProfile,
}: {
  data: ApplicantDetail;
  onOpenProfile: (id: number) => void;
}) {
  const name = humanizeName(fullName(data) || "Unnamed Applicant");
  const phone = data.contactNumber || data.mobileNumber;
  const email = data.emailAddress;

  const { reached, anyRejected } = computePipeline(data.applications);
  const hasApplications = data.applications.length > 0;

  // First 2 educations; "+N more" note links to the full profile.
  const topEducations = data.educations.slice(0, 2);
  const moreEducationCount = Math.max(0, data.educations.length - 2);

  return (
    <>
      {/* Identity header — monogram, name, #ID, completeness pill. */}
      <div className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4">
        <Monogram label={initials(fullName(data))} className="size-12 text-sm" />
        <div className="min-w-0 flex-1 pr-8">
          <DialogTitle className="truncate text-base font-semibold tracking-tight text-foreground">
            {name}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">Applicant #{data.id}</p>
          <div className="mt-1.5">
            {data.isProfileComplete ? (
              <Pill tone="success">
                <CheckCircle2 className="size-3" aria-hidden /> Profile complete
              </Pill>
            ) : (
              <Pill tone="danger">
                <AlertCircle className="size-3" aria-hidden /> Incomplete
              </Pill>
            )}
          </div>
        </div>
      </div>

      {/* Body — tinted rounded section panels: Contact + Pipeline two-up on
          sm+, Education + Documents two-up on lg+. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-3 p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Contact */}
            <section className="rounded-xl border border-border bg-secondary/50 p-4">
              <MicroLabel>Contact</MicroLabel>
              <div className="mt-2 space-y-1.5">
                {email && (
                  <a
                    href={`mailto:${email}`}
                    className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-xs transition-colors hover:border-primary/40"
                  >
                    <Mail className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">{email}</span>
                  </a>
                )}
                {phone && (
                  <a
                    href={`tel:${phone}`}
                    className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-xs transition-colors hover:border-primary/40"
                  >
                    <Phone className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate tabular-nums">{phone}</span>
                  </a>
                )}
                {!email && !phone && (
                  <p className="text-xs italic text-muted-foreground">No contact details</p>
                )}
              </div>
            </section>
            {/* Pipeline progress — mini dots; rejected pinned at Submitted
                with a negative chip. */}
            <section className="rounded-xl border border-border bg-secondary/50 p-4">
              <div className="flex items-center justify-between gap-2">
                <MicroLabel>Pipeline progress</MicroLabel>
                {anyRejected && <Pill tone="danger">Rejected</Pill>}
              </div>
              <PipelineDots
                stages={MODAL_STAGES.map((s, i) => ({
                  key: s.key,
                  label: s.label,
                  tone: s.tone,
                  active: hasApplications && i <= reached,
                }))}
              />
              {!hasApplications && (
                <p className="mt-2 text-xs italic text-muted-foreground">No applications yet</p>
              )}
            </section>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {/* Education — first 2 entries + "+N more" note. */}
            <section className="rounded-xl border border-border bg-secondary/50 p-4">
              <div className="flex items-center justify-between">
                <MicroLabel>Education</MicroLabel>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {data.educations.length} entr{data.educations.length === 1 ? "y" : "ies"}
                </span>
              </div>
              {topEducations.length === 0 ? (
                <p className="mt-2 text-xs italic text-muted-foreground">
                  No education records
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {topEducations.map((edu, i) => (
                    <div key={i} className="rounded-lg border border-border bg-card p-3 shadow-xs">
                      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        Entry {i + 1}
                      </p>
                      <dl className="mt-1">{renderEducation(humanizeRecord(edu))}</dl>
                    </div>
                  ))}
                  {moreEducationCount > 0 && (
                    <p className="rounded-lg border border-dashed border-border py-2 text-center text-xs font-medium text-muted-foreground">
                      +{moreEducationCount} more entr{moreEducationCount === 1 ? "y" : "ies"} —
                      view full profile
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* Documents — one continuous hairline ledger. */}
            <section className="rounded-xl border border-border bg-secondary/50 p-4">
              <div className="flex items-center justify-between">
                <MicroLabel>Documents</MicroLabel>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {data.documents.length} file{data.documents.length === 1 ? "" : "s"}
                </span>
              </div>
              {data.documents.length === 0 ? (
                <p className="mt-2 text-xs italic text-muted-foreground">
                  No documents uploaded
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                  {data.documents.map((d) => (
                    <DocumentRow key={d.id} doc={d} />
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>

      {/* Footer — quiet hint (left) + primary action (right). Closing the
          modal FIRST mirrors the legacy footer contract, then the dossier
          navigation lands on a clean view. */}
      <div className="flex shrink-0 flex-col gap-2 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Quick view · open the full profile for evaluation tools
        </p>
        <Button size="sm" onClick={() => onOpenProfile(data.id)}>
          View full profile
          <ArrowUpRight className="size-4" />
        </Button>
      </div>
    </>
  );
}

function ModalSkeleton() {
  return (
    <>
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <span className="size-12 shrink-0 animate-pulse rounded-full bg-muted" />
        <div className="flex-1 space-y-2 pt-1">
          <span className="block h-4 w-32 animate-pulse bg-muted" />
          <span className="block h-3 w-20 animate-pulse bg-muted" />
          <span className="block h-5 w-28 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
      <div className="flex-1 space-y-3 p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-secondary/50 p-4">
              <span className="block h-3 w-16 animate-pulse bg-muted" />
              <div className="mt-2 space-y-1.5">
                <span className="block h-9 w-full animate-pulse rounded-lg bg-muted" />
                <span className="block h-9 w-3/4 animate-pulse rounded-lg bg-muted" />
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-secondary/50 p-4">
            <span className="block h-3 w-24 animate-pulse bg-muted" />
            <div className="mt-2 space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-3">
                  <span className="block h-2.5 w-16 animate-pulse bg-muted" />
                  <span className="mt-2 block h-3 w-3/4 animate-pulse bg-muted" />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-secondary/50 p-4">
            <span className="block h-3 w-20 animate-pulse bg-muted" />
            <div className="mt-2 divide-y divide-border rounded-lg border border-border bg-card">
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2.5 px-2.5 py-2.5">
                  <span className="size-8 shrink-0 animate-pulse rounded-md bg-muted" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <span className="block h-3.5 w-2/3 animate-pulse bg-muted" />
                    <span className="block h-3 w-1/3 animate-pulse bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-border p-4">
        <span className="block h-8 w-full animate-pulse rounded-lg bg-muted" />
      </div>
    </>
  );
}
