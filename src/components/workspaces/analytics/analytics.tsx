"use client";

// ============================================================================
// RMIS 2.0 — Analytics Workspace
// A recruitment analytics PRODUCT — not "four metric cards + a pie chart".
//
// Sections:
//   1. Pipeline conversion — interactive ledger of stage rows (click → drill).
//   2. Application volume over time — recharts LineChart (var(--chart-1)).
//   3. Status distribution — recharts horizontal BarChart of stats.byStatus.
//   4. Drill-down candidate list — when a stage filter is set, list candidates
//      in that stage (from queue). The key "metrics lead back to records".
//   5. Recent activity feed — /api/admin/audit-logs ledger.
//
// All metrics lead back to records: click a funnel stage → drills into the
// candidate list below; click a candidate row → navigate("candidate", { id }).
//
// Visual register (minimalist staff surfaces): quiet, tool-first — compact
// header, flat bordered stat tiles (all numbers plain text-foreground), flat
// bordered chart cards with plain titles, hairline ledgers (divide-border)
// with 150ms colour-only hovers. No editorial hero type, no gold kickers, no
// ghost numerals, no momentum sweeps, no staggered entrances. Chart configs
// and the drill-down wiring are untouched.
//
// API contracts preserved EXACTLY:
//   - GET /api/admin/stats         → useAdminStats (byStatus + recent + totals)
//   - GET /api/evaluator/queue      → Paginated<QueueItem> (funnel + volume + drill-down)
//   - GET /api/admin/audit-logs     → { data, total, actions, summary } (timeline)
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNav } from "@/components/nav-provider";
import { useAdminStats } from "@/lib/hooks/use-admin-data";
import { apiFetch, formatDate, formatDateTime, fullName } from "@/lib/client";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";
import { humanizeTitle, humanizeName } from "@/lib/humanize";
import {
  StatusIndicator,
  EmptyState,
  ErrorState,
} from "@/components/primitives/workspace";
import { stageForStatus } from "@/lib/status";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import {
  RefreshCw,
  TrendingUp,
  Activity as ActivityIcon,
  Filter,
  ArrowUpRight,
  Users,
} from "lucide-react";
import type { Paginated } from "@/lib/validation";

// ---------- Types ----------
type QueueItem = {
  id: string;
  status: string;
  dateApplied: string;
  applicant: {
    id: number;
    firstName: string | null;
    lastName: string | null;
    emailAddress: string | null;
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

type AuditLogRow = {
  id: number;
  timestamp: string;
  user_id: string | null;
  user_label: string | null;
  user_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string | null;
  ip_address: string | null;
};

type AuditResponse = {
  data: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  actions: string[];
  summary: {
    totalEvents: number;
    onPage: number;
    topActions: { action: string; count: number }[];
    byRole: { role: string; count: number }[];
  };
};

// Stage filter values exposed in the "drill into stage" Select.
type StageFilter =
  | "all"
  | "Applied"
  | "Under Review"
  | "Shortlisted"
  | "Rejected";

// Map a stage filter value to the matching PIPELINE_STAGES key.
function stageFilterToKey(stage: StageFilter): string | null {
  switch (stage) {
    case "all":
      return null;
    case "Applied":
      return "Applied";
    case "Under Review":
      return "Under Review";
    case "Shortlisted":
      return "Shortlisted";
    case "Rejected":
      return "Rejected";
    default:
      return null;
  }
}

// Inverse: stage key → filter value (used when clicking a funnel bar).
function stageKeyToFilter(stageKey: string): StageFilter {
  switch (stageKey) {
    case "Applied":
      return "Applied";
    case "Under Review":
      return "Under Review";
    case "Shortlisted":
      return "Shortlisted";
    case "Rejected":
      return "Rejected";
    default:
      return "all";
  }
}

function stageFilterLabel(s: StageFilter): string {
  if (s === "all") return "All stages";
  return s;
}

// Friendly label for each stage in the conversion funnel.
function funnelLabel(stageKey: string): string {
  switch (stageKey) {
    case "Applied":
      return "Applied";
    case "Under Review":
      return "Under Review";
    case "Shortlisted":
      return "Shortlisted";
    case "Rejected":
      return "Rejected";
    default:
      return stageKey;
  }
}

// Format a status label: replace _ with space, Title Case.
function formatStatusLabel(status: string): string {
  return status
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// Convert an ISO date string to a YYYY-MM-DD key (for grouping by day).
function dayKey(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

// Typographic middot between row vitals — quiet punctuation, no icons.
function Dot() {
  return <span aria-hidden className="select-none text-foreground/25">·</span>;
}

export function AnalyticsWorkspace() {
  const { navigate } = useNav();
  const { stats, loading, error, reload: reloadStats } = useAdminStats();

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);

  const [audit, setAudit] = useState<AuditLogRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);

  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [reloadKey, setReloadKey] = useState(0);

  // ---- Fetch /api/evaluator/queue (admin-allowed) ----
  const loadQueue = useCallback(async (silent?: boolean) => {
    const isSilent = silent === true;
    if (!isSilent) {
      setQueueLoading(true);
      setQueueError(null);
    }
    try {
      const r = await apiFetch<Paginated<QueueItem> | QueueItem[]>(
        "/api/evaluator/queue?page=1&pageSize=100",
      );
      setQueue(Array.isArray(r) ? r : r.data ?? []);
    } catch (e) {
      // Silent refresh keeps the last good data on a transient failure.
      if (!isSilent) {
        setQueueError(
          e instanceof Error ? e.message : "Failed to load applications",
        );
      }
    } finally {
      setQueueLoading(false);
    }
  }, []);

  // ---- Fetch /api/admin/audit-logs ----
  const loadAudit = useCallback(async (silent?: boolean) => {
    const isSilent = silent === true;
    if (!isSilent) {
      setAuditLoading(true);
      setAuditError(null);
    }
    try {
      const r = await apiFetch<AuditResponse>(
        "/api/admin/audit-logs?page=1&pageSize=20",
      );
      setAudit(r.data ?? []);
    } catch (e) {
      if (!isSilent) {
        setAuditError(
          e instanceof Error ? e.message : "Failed to load activity feed",
        );
      }
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
    loadAudit();
  }, [loadQueue, loadAudit, reloadKey]);

  // Realtime-lite: new applications and audit entries recorded elsewhere
  // (evaluator decisions, sign-ins) stream in without a manual reload.
  // Stats refresh themselves via useAdminStats' internal realtime wiring.
  useRefetchOnFocus(() => { void loadQueue(true); void loadAudit(true); }, { pollMs: 30_000 });

  const reload = useCallback(() => {
    reloadStats();
    setReloadKey((k) => k + 1);
  }, [reloadStats]);

  // ---- SECTION 1: pipeline funnel (4 stages — Applied · Under Review ·
  // Shortlisted · Rejected; the offline hand-off after the decision means
  // the funnel ends there) ----
  const funnel = useMemo(() => {
    const FUNNEL_STAGES = [
      "Applied",
      "Under Review",
      "Shortlisted",
      "Rejected",
    ];
    const counts = FUNNEL_STAGES.map((key) => ({
      key,
      label: funnelLabel(key),
      count: queue.filter((q) => stageForStatus(q.status) === key).length,
    }));
    const max = Math.max(1, ...counts.map((c) => c.count));
    return { counts, max };
  }, [queue]);

  // ---- SECTION 2: application volume (last 30 days) ----
  const volumeData = useMemo(() => {
    const now = Date.now();
    const days: { date: string; label: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      days.push({
        date: key,
        label: d.toLocaleDateString("en-PH", {
          month: "short",
          day: "numeric",
        }),
        count: 0,
      });
    }
    const byDate = new Map(days.map((d) => [d.date, d]));
    for (const q of queue) {
      const key = dayKey(q.dateApplied);
      const entry = byDate.get(key);
      if (entry) entry.count += 1;
    }
    return days;
  }, [queue]);

  // ---- SECTION 3: status distribution (from stats.byStatus) ----
  const statusData = useMemo(() => {
    if (!stats?.byStatus) return [];
    return stats.byStatus
      .filter((s) => s.count > 0)
      .map((s) => ({
        status: formatStatusLabel(s.status),
        count: s.count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [stats]);

  // ---- SECTION 4: drill-down candidate list (filtered by stage) ----
  const drillDownItems = useMemo(() => {
    const key = stageFilterToKey(stageFilter);
    if (!key) return [];
    return queue
      .filter((q) => stageForStatus(q.status) === key)
      .sort(
        (a, b) =>
          new Date(b.dateApplied).getTime() -
          new Date(a.dateApplied).getTime(),
      );
  }, [queue, stageFilter]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1400px] 2xl:max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8">
        <AnalyticsSkeleton />
      </div>
    );
  }

  // Headline metrics (stat tiles + toolbar count)
  const totalApps = queue.length;
  const totalShortlisted = queue.filter((q) => /shortlisted/i.test(q.status)).length;

  return (
    <div className="mx-auto w-full max-w-[1400px] 2xl:max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8">
      {/* ===== Compact header — quiet overline + semibold title. The Refresh
          action sits flush right on sm+, stacks under on mobile. No display
          type, no gold kicker, no standfirst — the stat tiles below carry the
          headline totals. ===== */}
      <header className="mb-6 border-b border-border pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Insights
            </p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">
              Reports
            </h1>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw className="size-4" /> Refresh
            </Button>
          </div>
        </div>
      </header>

      {error && <ErrorState message={error} onRetry={reload} />}

      {/* ===== Stat tiles — headline totals as flat bordered cells (guide
          pattern: uppercase micro-label + tabular figure). All numbers are
          plain text-foreground — no tone-tuned numerals, no ghost indexes. ===== */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Applications
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {stats?.totalApplications ?? totalApps}
          </p>
        </div>
        <div className="border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Applicants
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {stats?.applicants ?? 0}
          </p>
        </div>
        <div className="border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Active jobs
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {stats?.activeJobs ?? 0}
          </p>
        </div>
        <div className="border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Shortlisted
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {stats?.shortlisted ?? totalShortlisted}
          </p>
        </div>
      </div>

      {/* ===== Hairline toolbar — N applications count + filter selects.
          Stacks vertically on mobile. ===== */}
      <div className="mt-6 flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium tabular-nums text-muted-foreground">
          {totalApps} {totalApps === 1 ? "application" : "applications"} in pipeline
        </p>
        <div className="-mx-4 flex flex-wrap items-center gap-2 px-4 sm:mx-0 sm:px-0">
          <Select value="all-time" onValueChange={() => {}}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Recruitment cycle">
              <SelectValue placeholder="Cycle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-time">All time</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={stageFilter}
            onValueChange={(v) => setStageFilter(v as StageFilter)}
          >
            <SelectTrigger className="w-full sm:w-52" aria-label="Drill into stage">
              <SelectValue placeholder="Drill into stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              <SelectItem value="Applied">Applied</SelectItem>
              <SelectItem value="Under Review">Under Review</SelectItem>
              <SelectItem value="Shortlisted">Shortlisted</SelectItem>
              <SelectItem value="Rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* SECTION 1: Pipeline conversion — flat bordered card holding one
          quiet ledger of stage rows; clicking a row drills the candidate
          list below into that stage. */}
      <section className="mt-6">
        <div className="border border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
            <h2 className="text-sm font-semibold text-foreground">
              Pipeline conversion
            </h2>
            <p className="text-xs tabular-nums text-muted-foreground">
              {funnel.counts.length} stages
            </p>
          </div>
          {queueLoading ? (
            <div className="p-5">
              <div className="h-40 w-full animate-pulse bg-muted" />
            </div>
          ) : funnel.counts.every((c) => c.count === 0) ? (
            <EmptyState
              icon={<TrendingUp className="size-8" />}
              title="No applications yet"
              description="Applications will appear here as candidates apply."
            />
          ) : (
            <div className="divide-y divide-border">
              {funnel.counts.map((stage, i) => {
                const prev = i > 0 ? funnel.counts[i - 1] : null;
                const conversion =
                  prev && prev.count > 0
                    ? Math.round((stage.count / prev.count) * 100)
                    : null;
                const widthPct = (stage.count / funnel.max) * 100;
                return (
                  <button
                    key={stage.key}
                    type="button"
                    onClick={() =>
                      setStageFilter(stageKeyToFilter(stage.key))
                    }
                    className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors duration-150 hover:bg-accent/40 sm:px-5"
                  >
                    {/* Stage label + quiet conversion note */}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">
                        {stage.label}
                      </span>
                      {conversion != null && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {prev?.label} →{" "}
                          <span className="font-medium tabular-nums text-foreground">
                            {conversion}%
                          </span>
                        </span>
                      )}
                    </span>
                    {/* Stage count — plain figure, right-aligned */}
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {stage.count}
                    </span>
                    {/* Share-of-pipeline bar — chart token fill */}
                    <span className="h-1.5 w-16 shrink-0 overflow-hidden bg-muted sm:w-40">
                      <span
                        className="block h-full"
                        style={{
                          width: `${Math.max(2, widthPct)}%`,
                          backgroundColor: "var(--chart-1)",
                        }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* SECTIONS 2 & 3: chart cards side by side — plain titles inside each
          flat bordered card; recharts configs untouched. */}
      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Section 2: Application volume over time */}
        <div className="border border-border bg-card p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">
              Application volume
            </h2>
            <p className="text-xs text-muted-foreground">Last 30 days</p>
          </div>
          <div className="mt-4">
            {queueLoading ? (
              <div className="h-56 w-full animate-pulse bg-muted" />
            ) : volumeData.every((d) => d.count === 0) ? (
              <EmptyState
                icon={<TrendingUp className="size-8" />}
                title="No applications in the last 30 days"
              />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart
                  data={volumeData}
                  margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    interval={4}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={28}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "0px",
                      fontSize: "12px",
                    }}
                    labelStyle={{ color: "var(--foreground)" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={false}
                    name="Applications"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Section 3: Status distribution */}
        <div className="border border-border bg-card p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">
              Status distribution
            </h2>
            <p className="text-xs tabular-nums text-muted-foreground">
              {statusData.length} {statusData.length === 1 ? "status" : "statuses"}
            </p>
          </div>
          <div className="mt-4">
            {!stats?.byStatus || statusData.length === 0 ? (
              <EmptyState
                icon={<ActivityIcon className="size-8" />}
                title="No status data available"
              />
            ) : (
              <div className="max-h-[280px] overflow-y-auto">
              <ResponsiveContainer
                width="100%"
                height={Math.max(180, statusData.length * 32 + 24)}
              >
                <BarChart
                  data={statusData}
                  layout="vertical"
                  margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="status"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "0px",
                      fontSize: "12px",
                    }}
                    labelStyle={{ color: "var(--foreground)" }}
                  />
                  <Bar
                    dataKey="count"
                    fill="var(--chart-1)"
                    radius={0}
                    name="Applications"
                  />
                </BarChart>
              </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* SECTIONS 4 & 5: drill-down candidate list + recent activity ledger */}
      <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Section 4: Drill-down candidate list — flat bordered card; rows
            keep the navigate("candidate") interaction. */}
        <div className="flex max-h-[60vh] flex-col border border-border bg-card lg:h-[65vh] lg:max-h-[65vh]">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
            <h2 className="text-sm font-semibold text-foreground">
              {stageFilter === "all"
                ? "Drill-down candidates"
                : `Candidates · ${stageFilterLabel(stageFilter)}`}
            </h2>
            <p className="text-xs tabular-nums text-muted-foreground">
              {stageFilter === "all"
                ? "Select a stage"
                : `${drillDownItems.length} ${drillDownItems.length === 1 ? "candidate" : "candidates"}`}
            </p>
          </div>
          {queueLoading ? (
            <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                  <div className="size-9 shrink-0 animate-pulse bg-muted" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="h-3.5 w-40 animate-pulse bg-muted" />
                    <div className="h-3 w-56 animate-pulse bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : stageFilter === "all" ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon={<Filter className="size-8" />}
                title="Select a stage to drill in"
                description="Click a stage in the funnel above, or pick a stage from the filter, to see the candidates in that stage."
              />
            </div>
          ) : drillDownItems.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon={<Users className="size-8" />}
                title={`No candidates in ${stageFilterLabel(stageFilter)}`}
              />
            </div>
          ) : (
            <ol className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
              {drillDownItems.map((q) => (
                <li key={q.id}>
                  <button
                    onClick={() =>
                      q.applicant &&
                      navigate("candidate", {
                        id: String(q.applicant.id),
                      })
                    }
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 hover:bg-accent/40 sm:px-5"
                  >
                    <span className="grid size-9 shrink-0 place-items-center bg-muted text-xs font-semibold text-foreground/70">
                      {applicantInitials(q.applicant)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {humanizeName(applicantName(q.applicant))}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {humanizeTitle(
                          q.job?.title ||
                            q.job?.position?.positionTitle ||
                            "Untitled position",
                        )}{" "}
                        <Dot />{" "}
                        <span className="tabular-nums">
                          Applied {formatDate(q.dateApplied)}
                        </span>
                      </span>
                    </span>
                    <StatusIndicator status={q.status} size="sm" />
                    <ArrowUpRight className="size-4 shrink-0 text-foreground/30" />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Section 5: Recent activity — flat bordered ledger card */}
        <div className="flex max-h-[60vh] flex-col border border-border bg-card lg:h-[65vh] lg:max-h-[65vh]">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
            <h2 className="text-sm font-semibold text-foreground">
              Recent activity
            </h2>
            <p className="text-xs tabular-nums text-muted-foreground">
              {audit.length} {audit.length === 1 ? "event" : "events"}
            </p>
          </div>
          {auditLoading ? (
            <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-4 py-3.5 sm:px-5">
                  <div className="h-3.5 w-40 animate-pulse bg-muted" />
                  <div className="mt-2 h-3 w-24 animate-pulse bg-muted" />
                </div>
              ))}
            </div>
          ) : auditError ? (
            <div className="flex min-h-[120px] flex-1 items-center justify-center p-5">
              <p className="text-sm text-muted-foreground">{auditError}</p>
            </div>
          ) : audit.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon={<ActivityIcon className="size-8" />}
                title="No recent activity"
              />
            </div>
          ) : (
            <ol className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
              {audit.map((log) => {
                // user_label is stored as "username (email)" — split it so the
                // actor reads on TWO stacked lines (name over email + time)
                // instead of one truncated line in the narrow rail. Display
                // parse only; the audit data and feed wiring are untouched.
                const actor = splitUserLabel(log.user_label || "System");
                return (
                  <li key={log.id} className="px-4 py-3.5 sm:px-5">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {humanizeName(actor.name)}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {actor.email && (
                        <>
                          {actor.email} <Dot />{" "}
                        </>
                      )}
                      <span className="tabular-nums">
                        {formatDateTime(log.timestamp)}
                      </span>
                    </span>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Badge
                        variant="secondary"
                        className="font-mono text-xs"
                      >
                        {log.action}
                      </Badge>
                      {log.user_role && (
                        <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                          {log.user_role}
                        </span>
                      )}
                    </div>
                    {log.description && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {log.description}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}

// ---- Helpers --------------------------------------------------------------
// The audit DB stores user_label as "username (email)" (see src/lib/audit-db.ts)
// for quick display. Split into name + email for the stacked activity rows;
// strings without a "… (…)" tail pass through untouched.
function splitUserLabel(label: string): { name: string; email: string | null } {
  const m = label.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!m || !m[1].trim()) return { name: label.trim(), email: null };
  return { name: m[1].trim(), email: m[2].trim() || null };
}

function applicantName(a: QueueItem["applicant"]): string {
  if (!a) return "Unknown applicant";
  return (
    fullName({ firstName: a.firstName, lastName: a.lastName }) || "Unnamed"
  );
}

function applicantInitials(a: QueueItem["applicant"]): string {
  if (!a) return "?";
  const f = (a.firstName || "").trim().charAt(0);
  const l = (a.lastName || "").trim().charAt(0);
  return (f + l).toUpperCase() || "?";
}

// ---- Skeleton (raw bg-muted pulse divs) — mirrors the quiet layout:
// compact header + stat tile row + hairline toolbar + funnel card +
// chart cards + drill-down / activity ledger cards. -----------------------
function AnalyticsSkeleton() {
  return (
    <>
      {/* Compact header skeleton */}
      <div className="mb-6 border-b border-border pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="h-3 w-24 animate-pulse bg-muted" />
            <div className="h-5 w-40 animate-pulse bg-muted" />
          </div>
          <div className="h-8 w-24 shrink-0 animate-pulse bg-muted" />
        </div>
      </div>
      {/* Stat tiles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border border-border bg-card p-4">
            <div className="h-3 w-24 animate-pulse bg-muted" />
            <div className="mt-2 h-6 w-14 animate-pulse bg-muted" />
          </div>
        ))}
      </div>
      {/* Hairline toolbar */}
      <div className="mt-6 flex items-baseline justify-between border-b border-border pb-3">
        <div className="h-4 w-44 animate-pulse bg-muted" />
        <div className="h-8 w-32 animate-pulse bg-muted" />
      </div>
      {/* Funnel card */}
      <div className="mt-6 border border-border bg-card">
        <div className="border-b border-border px-4 py-3.5 sm:px-5">
          <div className="h-3.5 w-36 animate-pulse bg-muted" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-b-0 sm:px-5"
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-3.5 w-28 animate-pulse bg-muted" />
              <div className="h-3 w-20 animate-pulse bg-muted" />
            </div>
            <div className="h-1.5 w-16 shrink-0 animate-pulse bg-muted sm:w-40" />
          </div>
        ))}
      </div>
      {/* Chart cards */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="border border-border bg-card p-4 sm:p-6">
          <div className="h-4 w-36 animate-pulse bg-muted" />
          <div className="mt-4 h-56 w-full animate-pulse bg-muted" />
        </div>
        <div className="border border-border bg-card p-4 sm:p-6">
          <div className="h-4 w-36 animate-pulse bg-muted" />
          <div className="mt-4 h-56 w-full animate-pulse bg-muted" />
        </div>
      </div>
      {/* Drill-down card + activity card */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="border border-border bg-card">
          <div className="border-b border-border px-4 py-3.5 sm:px-5">
            <div className="h-3.5 w-40 animate-pulse bg-muted" />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-border px-4 py-3.5 last:border-b-0 sm:px-5"
            >
              <div className="size-9 shrink-0 animate-pulse bg-muted" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="h-3.5 w-40 animate-pulse bg-muted" />
                <div className="h-3 w-56 animate-pulse bg-muted" />
              </div>
            </div>
          ))}
        </div>
        <div className="border border-border bg-card">
          <div className="border-b border-border px-4 py-3.5 sm:px-5">
            <div className="h-3.5 w-28 animate-pulse bg-muted" />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="border-b border-border px-4 py-3.5 last:border-b-0 sm:px-5"
            >
              <div className="h-3.5 w-40 animate-pulse bg-muted" />
              <div className="mt-2 h-3 w-24 animate-pulse bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
