"use client";

// ============================================================================
// RMIS 2.0 — Job Workspace
// A job posting becomes a full WORKSPACE (not a record). Compact contextual
// header with Edit + Back actions, and four contextual tabs:
//   Overview · Pipeline · Candidates · Activity
// Pipeline / Candidates / Activity all reuse the evaluator queue filtered to
// THIS job's applications.
//
// DESIGN LANGUAGE — quiet, tool-first (no editorial hero type, no gold
// kickers, no momentum sweeps, no staggered entrance animations): flat
// bordered cards, token colours only, 150ms colour-only transitions. The
// Pipeline tab mirrors the Review Queue's kanban grammar (muted column
// panels, stage-dot headers with quiet counts, bordered cards).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNav } from "@/components/nav-provider";
import {
  useJobs,
  isJobActive,
  type JobRow,
} from "@/lib/hooks/use-admin-data";
import { apiFetch, formatCurrency, formatDate, fullName } from "@/lib/client";
import { DIVISION_LABEL, divisionLabel } from "@/lib/divisions";
import {
  CSC_EDUCATION_REQUIREMENTS,
  CSC_ELIGIBILITY_OPTIONS,
  MC07_HINT,
  getEligibilityDescription,
} from "@/lib/csc-requirements";
import {
  StatusIndicator,
  EmptyState,
  Skeleton,
  ErrorState,
  SectionLabel,
  Metric,
} from "@/components/primitives/workspace";
import { SafeHtml } from "@/components/common/safe-html";
import {
  stageForStatus,
  PIPELINE_STAGES,
  type StageKey,
} from "@/lib/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Pencil,
  Users,
  Banknote,
  Calendar,
  Briefcase,
  ClipboardList,
  Clock,
  Loader2,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  type Position,
  POSITION_TYPES,
  toDateInput,
} from "@/components/views/admin/types";
import type { Paginated } from "@/lib/validation";
import {
  CreatableCombobox,
  type ComboOption,
} from "@/components/workspaces/recruitment/creatable-combobox";
import { JobDeleteDialog } from "@/components/workspaces/recruitment/job-delete-dialog";

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

// ============================================================================
// Stage dots — the ONLY colour cue for pipeline stages (same grammar as the
// Review Queue's kanban headers): info ink = fresh Applied (awaiting
// pick-up), primary = Under Review (evaluator has it), success = shortlisted,
// destructive = rejected. Shared by the Overview tab's mini-pipeline rows and
// the Pipeline tab's column headers.
// ============================================================================
const STAGE_DOTS: Record<StageKey, string> = {
  Applied: "bg-info-ink",
  "Under Review": "bg-primary",
  Shortlisted: "bg-success",
  Rejected: "bg-destructive",
};

// ============================================================================
// JobWorkspace
// ============================================================================
export function JobWorkspace() {
  const { params, navigate } = useNav();
  const { jobs, loading: jobsLoading, error: jobsError, reload } = useJobs();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const jobId = params.id ? Number(params.id) : NaN;

  // Find the job from already-loaded jobs (or wait for them to load)
  const job = useMemo(
    () => (Number.isFinite(jobId) ? jobs.find((j) => j.id === jobId) ?? null : null),
    [jobs, jobId],
  );

  // Distinct position types ever used on loaded jobs — the persistent half of
  // the scalable Position Type dropdown in the edit dialog.
  const knownTypes = useMemo(() => {
    const set = new Set<string>();
    for (const j of jobs) {
      const t = (j.positionType || "").trim();
      if (t) set.add(t);
    }
    return [...set];
  }, [jobs]);

  // Load evaluator queue once (used by Pipeline / Candidates / Activity tabs)
  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    setQueueError(null);
    try {
      const r = await apiFetch<
        Paginated<QueueItem> | QueueItem[]
      >("/api/evaluator/queue?page=1&pageSize=100");
      setQueue(Array.isArray(r) ? r : r.data ?? []);
    } catch (e) {
      setQueueError(e instanceof Error ? e.message : "Failed to load applications");
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Filter queue to THIS job's applications
  const jobQueue = useMemo(() => {
    if (!Number.isFinite(jobId)) return [];
    return queue.filter((q) => q.job?.id === jobId);
  }, [queue, jobId]);

  // Header / loading states ------------------------------------------------
  if (jobsLoading && !job) {
    // Skeleton mirrors the workspace shape: back link + title block, metric
    // strip, tab row, then a ledger table — no spinner flash.
    return (
      <div className="mx-auto w-full max-w-[1400px] 2xl:max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="space-y-6">
          <div className="space-y-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-72 max-w-full" />
            <Skeleton className="h-4 w-48 max-w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-24" />
            ))}
          </div>
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (jobsError && !job) {
    return (
      <div className="mx-auto w-full max-w-[1400px] 2xl:max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8">
        <ErrorState message={jobsError} onRetry={reload} />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="mx-auto w-full max-w-[1400px] 2xl:max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8">
        <EmptyState
          icon={<Briefcase className="size-10" />}
          title="Job not found"
          description="This job posting may have been removed."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("recruitment")}
            >
              <ArrowLeft className="size-4" /> Back to Recruitment
            </Button>
          }
        />
      </div>
    );
  }

  const active = isJobActive(job);
  const title = job.title || job.position?.positionTitle || "Untitled Position";

  return (
    <div className="mx-auto w-full max-w-[1400px] 2xl:max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8">
      {/* ===== Compact contextual header — back link, semibold title +
          status pill, quiet vitals line. Actions (Back / Delete / Edit) sit
          flush right on sm+, stack under on mobile. No display type. ===== */}
      <header className="mb-6 border-b border-border pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 mb-1 text-muted-foreground hover:text-foreground"
              onClick={() => navigate("recruitment")}
            >
              <ArrowLeft className="size-4" /> Recruitment
            </Button>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                {title}
              </h1>
              <StatusIndicator status={active ? "OPEN" : "CLOSED"} size="sm" />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              {job.positionType && <span>{job.positionType}</span>}
              {job.position?.itemNumber && (
                <>
                  <span aria-hidden className="text-muted-foreground/40">·</span>
                  <span>Item No. {job.position.itemNumber}</span>
                </>
              )}
              {job.position?.placeOfAssignment?.name && (
                <>
                  <span aria-hidden className="text-muted-foreground/40">·</span>
                  <span>{job.position.placeOfAssignment.name}</span>
                </>
              )}
              {job.deadlineDate && (
                <>
                  <span aria-hidden className="text-muted-foreground/40">·</span>
                  <span className="tabular-nums">
                    Deadline {formatDate(job.deadlineDate)}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("recruitment")}>
              <ArrowLeft className="size-4" /> Back to Recruitment
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-danger-ink hover:border-danger/40 hover:bg-danger/10 hover:text-danger-ink"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4" /> Delete
            </Button>
            <Button size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" /> Edit
            </Button>
          </div>
        </div>
      </header>

      {/* Contextual tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="mt-6"
      >
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="pipeline">
              Pipeline
              {jobQueue.length > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1.5 h-4 px-1 text-[10px] tabular-nums"
                >
                  {jobQueue.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="candidates">Candidates</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
        </div>

        {/* Overview */}
        <TabsContent value="overview" className="mt-6">
          <OverviewTab job={job} queue={jobQueue} />
        </TabsContent>

        {/* Pipeline */}
        <TabsContent value="pipeline" className="mt-6">
          <PipelineTab
            queue={jobQueue}
            loading={queueLoading}
            error={queueError}
            onRetry={loadQueue}
          />
        </TabsContent>

        {/* Candidates */}
        <TabsContent value="candidates" className="mt-6">
          <CandidatesTab
            queue={jobQueue}
            loading={queueLoading}
            error={queueError}
            onRetry={loadQueue}
          />
        </TabsContent>

        {/* Activity */}
        <TabsContent value="activity" className="mt-6">
          <ActivityTab queue={jobQueue} />
        </TabsContent>
      </Tabs>

      {/* Edit dialog (same fields/logic as the create dialog) */}
      <JobEditDialog
        open={editOpen}
        job={job}
        knownTypes={knownTypes}
        onOpenChange={setEditOpen}
        onSaved={() => {
          setEditOpen(false);
          reload();
        }}
      />

      {/* Delete confirmation — navigates back to the list once removed */}
      <JobDeleteDialog
        job={job}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => {
          reload();
          navigate("recruitment");
        }}
      />
    </div>
  );
}

// ============================================================================
// Overview Tab — two-column split with sticky metrics aside
// ============================================================================
function OverviewTab({ job, queue }: { job: JobRow; queue: QueueItem[] }) {
  const overdue = !!job.deadlineDate && new Date(job.deadlineDate) < new Date();

  // Mini-pipeline breakdown for THIS job's applications (3 stages)
  const stageCounts = useMemo(() => {
    const counts = {
      Applied: 0,
      Shortlisted: 0,
      Rejected: 0,
    } as Record<string, number>;
    for (const q of queue) {
      const stage = stageForStatus(q.status);
      counts[stage] = (counts[stage] ?? 0) + 1;
    }
    return counts;
  }, [queue]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* LEFT — Job information */}
      <div className="min-w-0 space-y-6">
        <section>
          <SectionLabel>Brief Description</SectionLabel>
          <div className="mt-3 text-sm text-muted-foreground">
            {job.briefDescriptionHtml ? (
              <SafeHtml
                html={job.briefDescriptionHtml}
                className="prose-sm max-w-none text-muted-foreground"
              />
            ) : job.briefDescription ? (
              <p>{job.briefDescription}</p>
            ) : (
              <p className="text-muted-foreground/60 italic">No description provided.</p>
            )}
          </div>
        </section>

        <section>
          <SectionLabel>Duties & Responsibilities</SectionLabel>
          <div className="mt-3 text-sm text-muted-foreground">
            {job.dutiesResponsibilitiesHtml ? (
              <SafeHtml
                html={job.dutiesResponsibilitiesHtml}
                className="prose-sm max-w-none text-muted-foreground"
              />
            ) : job.dutiesResponsibilities ? (
              <p>{job.dutiesResponsibilities}</p>
            ) : (
              <p className="text-muted-foreground/60 italic">Not specified.</p>
            )}
          </div>
        </section>

        <section>
          <SectionLabel>Compensation Package</SectionLabel>
          <div className="mt-3 text-sm text-muted-foreground">
            {job.compensationPackageHtml ? (
              <SafeHtml
                html={job.compensationPackageHtml}
                className="prose-sm max-w-none text-muted-foreground"
              />
            ) : job.compensationPackage ? (
              <p>{job.compensationPackage}</p>
            ) : (
              <p className="text-muted-foreground/60 italic">Not specified.</p>
            )}
          </div>
        </section>

        <section>
          <SectionLabel>Other Qualifications</SectionLabel>
          <div className="mt-3 text-sm text-muted-foreground">
            {job.otherQualificationsHtml ? (
              <SafeHtml
                html={job.otherQualificationsHtml}
                className="prose-sm max-w-none text-muted-foreground"
              />
            ) : job.otherQualifications ? (
              <p>{job.otherQualifications}</p>
            ) : (
              <p className="text-muted-foreground/60 italic">Not specified.</p>
            )}
          </div>
        </section>
      </div>

      {/* RIGHT — sticky metrics aside */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="border border-border bg-card p-5">
          <SectionLabel>Summary</SectionLabel>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Metric
              label="Vacancies"
              value={
                <span className="inline-flex items-center gap-1">
                  <Users className="size-4 text-muted-foreground/70" />
                  {job.numberOfVacancy}
                </span>
              }
            />
            <Metric
              label="Monthly Salary"
              value={
                <span className="inline-flex items-center gap-1">
                  <Banknote className="size-4 text-muted-foreground/70" />
                  {formatCurrency(job.position?.salaryAmount ?? null)}
                </span>
              }
            />
            <Metric
              label="Salary Grade"
              value={
                job.position?.salaryGrade && job.position.salaryStep
                  ? `${job.position.salaryGrade}-${job.position.salaryStep}`
                  : (job.position?.salaryGrade ?? "—")
              }
            />
            <Metric
              label="Applications"
              value={
                <span className="inline-flex items-center gap-1">
                  <ClipboardList className="size-4 text-muted-foreground/70" />
                  {queue.length}
                </span>
              }
            />
          </div>

          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <DateRow
              icon={Calendar}
              label="Published"
              value={formatDate(job.publishDate)}
            />
            <DateRow
              icon={Calendar}
              label="Deadline"
              value={job.deadlineDate ? formatDate(job.deadlineDate) : "—"}
              tone={overdue ? "danger" : undefined}
            />
            <DateRow
              icon={Clock}
              label="Processing"
              value={job.processingDate ? formatDate(job.processingDate) : "—"}
            />
          </div>
        </div>

        {/* Mini-pipeline — quiet stage rows (stage dot + label + count), the
            same grammar as the Pipeline tab's column headers. Numbers stay
            text-foreground — the dots are the only colour cue. */}
        <div className="mt-3 border border-border bg-card p-5">
          <SectionLabel>Pipeline</SectionLabel>
          <div className="mt-4 space-y-2.5">
            {PIPELINE_STAGES.map((stage) => (
              <div key={stage.key} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`size-1.5 shrink-0 rounded-full ${STAGE_DOTS[stage.key]}`}
                />
                <span className="truncate text-[13px] font-medium text-foreground/80">
                  {stage.label}
                </span>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {stageCounts[stage.key] ?? 0}
                </span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function DateRow({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <span
        className={`font-medium tabular-nums ${
          tone === "danger" ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// ============================================================================
// Pipeline Tab — horizontal pipeline board for THIS job's applications.
// Quiet kanban grammar (mirrors the Review Queue): muted column panels,
// stage-dot headers with plain labels + quiet counts, and flat bordered
// cards (no status pill inside a card — the column IS the stage). Columns
// keep the fixed-height 65vh scroll frame (60vh cap on mobile).
// ============================================================================
function PipelineTab({
  queue,
  loading,
  error,
  onRetry,
}: {
  queue: QueueItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const { navigate } = useNav();

  const columns = useMemo(() => {
    const map = new Map<string, QueueItem[]>();
    for (const stage of PIPELINE_STAGES) {
      map.set(stage.key, []);
    }
    for (const q of queue) {
      const stage = stageForStatus(q.status);
      const bucket = map.get(stage);
      if (bucket) bucket.push(q);
    }
    return PIPELINE_STAGES.map((stage) => ({
      ...stage,
      items: map.get(stage.key) ?? [],
    }));
  }, [queue]);

  if (loading) {
    // Pipeline board skeleton: stage columns with stacked application cards.
    return (
      <div className="flex gap-3 overflow-hidden pb-2">
        {Array.from({ length: 4 }).map((_, col) => (
          <div key={col} className="w-64 shrink-0 space-y-2.5">
            <Skeleton className="h-8 w-full" />
            {Array.from({ length: col === 0 ? 4 : 2 }).map((_, row) => (
              <Skeleton key={row} className="h-24 w-full" />
            ))}
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return <ErrorState message={error} onRetry={onRetry} />;
  }
  if (queue.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList className="size-10" />}
        title="No applications yet"
        description="Applications to this job will appear here as candidates apply."
      />
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((col) => (
        <div
          key={col.key}
          className="flex w-64 shrink-0 flex-col border border-border bg-secondary/40"
        >
          {/* Column header — stage dot + plain label + quiet count */}
          <div className="flex items-center gap-2 px-3 py-2.5">
            <span
              aria-hidden
              className={`size-1.5 shrink-0 rounded-full ${STAGE_DOTS[col.key]}`}
            />
            <span className="truncate text-[13px] font-medium text-foreground/80">
              {col.label}
            </span>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {col.items.length}
            </span>
          </div>
          {/* Column body — bordered cards floating on the muted panel; the
              fixed-height frame (lg 65vh / mobile 60vh cap) scrolls its
              rows internally, and an EMPTY column centers its dash. */}
          <ul
            className={`flex flex-col gap-2 overflow-y-auto p-2 max-h-[60vh] lg:h-[65vh] lg:max-h-[65vh] ${
              col.items.length === 0
                ? "items-center justify-center"
                : ""
            }`}
          >
            {col.items.length === 0 ? (
              <li className="text-xs text-muted-foreground/60">—</li>
            ) : (
              col.items.map((q) => (
                <li key={q.id}>
                  <button
                    onClick={() =>
                      q.applicant &&
                      navigate("candidate", {
                        id: String(q.applicant.id),
                      })
                    }
                    className="flex w-full items-center gap-2.5 border border-border bg-card p-3 text-left transition-colors duration-150 hover:border-foreground/25"
                  >
                    <span className="grid size-7 shrink-0 place-items-center bg-muted text-[10px] font-semibold text-foreground/70">
                      {applicantInitials(q.applicant)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {applicantName(q.applicant)}
                      </span>
                      <span className="mt-0.5 block truncate text-xs tabular-nums text-muted-foreground">
                        {formatDate(q.dateApplied)}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Candidates Tab — compact ledger table (quiet monograms, status pills stay:
// status is DATA in the flat list)
// ============================================================================
function CandidatesTab({
  queue,
  loading,
  error,
  onRetry,
}: {
  queue: QueueItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const { navigate } = useNav();

  if (loading) {
    // Ledger skeleton: header row + application rows.
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }
  if (error) {
    return <ErrorState message={error} onRetry={onRetry} />;
  }
  if (queue.length === 0) {
    return (
      <EmptyState
        icon={<Users className="size-10" />}
        title="No candidates yet"
        description="Applicants to this job will appear here."
      />
    );
  }

  const sorted = [...queue].sort(
    (a, b) =>
      new Date(b.dateApplied).getTime() - new Date(a.dateApplied).getTime(),
  );

  return (
    <div className="max-h-[60vh] overflow-auto border border-border bg-card lg:h-[65vh] lg:max-h-[65vh]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4 min-w-[200px]">
              Name
            </TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Applied</TableHead>
            <TableHead className="pr-4 text-right">
              Action
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((q) => (
            <TableRow key={q.id}>
              <TableCell className="pl-4">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 shrink-0 place-items-center bg-muted text-[10px] font-semibold text-foreground/70">
                    {applicantInitials(q.applicant)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {applicantName(q.applicant)}
                    </p>
                    {q.applicant?.emailAddress && (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {q.applicant.emailAddress}
                      </p>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <StatusIndicator status={q.status} size="sm" />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground tabular-nums">
                {formatDate(q.dateApplied)}
              </TableCell>
              <TableCell className="pr-4 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!q.applicant}
                  onClick={() =>
                    q.applicant &&
                    navigate("candidate", { id: String(q.applicant.id) })
                  }
                  className="text-muted-foreground hover:text-foreground"
                >
                  View
                  <ChevronRight className="size-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ============================================================================
// Activity Tab — timeline of recent applications (sorted desc by dateApplied)
// ============================================================================
function ActivityTab({ queue }: { queue: QueueItem[] }) {
  const { navigate } = useNav();

  if (queue.length === 0) {
    return (
      <EmptyState
        icon={<Clock className="size-10" />}
        title="No recent activity"
        description="Application activity for this job will appear here."
      />
    );
  }

  const sorted = [...queue].sort(
    (a, b) =>
      new Date(b.dateApplied).getTime() - new Date(a.dateApplied).getTime(),
  );

  return (
    <div className="overflow-hidden border border-border bg-card">
      <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto lg:max-h-[65vh]">
        {sorted.map((q) => {
          const name = applicantName(q.applicant);
          return (
            <li key={q.id}>
              <button
                onClick={() =>
                  q.applicant &&
                  navigate("candidate", { id: String(q.applicant.id) })
                }
                disabled={!q.applicant}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40 disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span className="grid size-9 shrink-0 place-items-center bg-muted text-xs font-semibold text-foreground/70">
                  {applicantInitials(q.applicant)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    Applied by {name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {q.job?.position?.positionTitle || q.job?.title || "Position"}
                    {" · "}
                    {relativeTime(q.dateApplied)}
                  </p>
                </div>
                {q.status && <StatusIndicator status={q.status} size="sm" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ============================================================================
// JobEditDialog — reuses the same fields/logic as the create dialog
// ============================================================================
function JobEditDialog({
  open,
  job,
  knownTypes,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  job: JobRow;
  /** Distinct position types ever used on loaded jobs. */
  knownTypes: string[];
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [title, setTitle] = useState("");
  const [positionType, setPositionType] = useState<string>("");
  const [numberOfVacancy, setNumberOfVacancy] = useState<string>("1");
  // Poster qualification vitals — written through to the linked POSITION
  // master row on save (same contract as POST/PATCH /api/jobs).
  const [division, setDivision] = useState("");
  const [education, setEducation] = useState("");
  const [experience, setExperience] = useState("");
  const [training, setTraining] = useState("");
  const [eligibility, setEligibility] = useState("");
  const [license, setLicense] = useState("");
  const [briefDescription, setBriefDescription] = useState("");
  const [duties, setDuties] = useState("");
  const [compensation, setCompensation] = useState("");
  const [otherQual, setOtherQual] = useState("");
  const [publishDate, setPublishDate] = useState("");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [processingDate, setProcessingDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Session-scoped options added through the scalable dropdowns (same
  // mechanism as JobFormDialog in recruitment-list).
  const [customTypes, setCustomTypes] = useState<string[]>([]);
  const [customDivisions, setCustomDivisions] = useState<string[]>([]);

  // ---- Scalable dropdown option lists ----
  // Education — the CSC registry (MC 07, s. 2025 amended first level
  // requirements + standard second level+ options). Custom requirements can
  // still be typed inline (creatable combobox).
  const educationOptions: ComboOption[] = useMemo(
    () => [
      ...CSC_EDUCATION_REQUIREMENTS.firstLevel.map((e) => ({
        value: e,
        label: e,
        hint: MC07_HINT,
      })),
      ...CSC_EDUCATION_REQUIREMENTS.higherLevel.map((e) => ({
        value: e,
        label: e,
        hint: "Second level +",
      })),
    ],
    [],
  );

  // Eligibility — standard CSC eligibility categories, each with its
  // grant-rule description as the secondary hint line (same format as the
  // MC 07 education hints; custom text still allowed).
  const eligibilityOptions: ComboOption[] = useMemo(
    () =>
      CSC_ELIGIBILITY_OPTIONS.map((e) => ({
        value: e,
        label: e,
        hint: getEligibilityDescription(e),
      })),
    [],
  );

  const typeOptions: ComboOption[] = useMemo(() => {
    const extras = new Set<string>();
    for (const t of knownTypes) extras.add(t);
    for (const t of customTypes) extras.add(t);
    // Static registry first (stable order), extras alphabetical after.
    return [
      ...POSITION_TYPES.map((t) => ({ value: t, label: t })),
      ...[...extras]
        .filter((t) => !POSITION_TYPES.includes(t))
        .sort((a, b) => a.localeCompare(b))
        .map((t) => ({ value: t, label: t })),
    ];
  }, [knownTypes, customTypes]);

  const divisionOptions: ComboOption[] = useMemo(() => {
    const opts: ComboOption[] = Object.entries(DIVISION_LABEL).map(
      ([code, label]) => ({ value: code, label }),
    );
    const seen = new Set(Object.keys(DIVISION_LABEL));
    const extras: string[] = [];
    for (const p of positions) {
      const d = (p.division || "").trim();
      if (d && !seen.has(d)) {
        seen.add(d);
        extras.push(d);
      }
    }
    for (const d of customDivisions) {
      if (d && !seen.has(d)) {
        seen.add(d);
        extras.push(d);
      }
    }
    // Custom divisions store their own label as the value; divisionLabel
    // echoes unknown codes through untouched so display stays correct.
    return [
      ...opts,
      ...extras
        .sort((a, b) => a.localeCompare(b))
        .map((d) => ({ value: d, label: divisionLabel(d) || d })),
    ];
  }, [positions, customDivisions]);

  // ---- Inline-create handlers for the scalable dropdowns ----
  async function createEducation(label: string): Promise<string | null> {
    setEducation(label);
    return label;
  }

  async function createEligibility(label: string): Promise<string | null> {
    setEligibility(label);
    return label;
  }

  async function createType(label: string): Promise<string | null> {
    setCustomTypes((prev) => (prev.includes(label) ? prev : [...prev, label]));
    return label;
  }

  async function createDivision(label: string): Promise<string | null> {
    setCustomDivisions((prev) =>
      prev.includes(label) ? prev : [...prev, label],
    );
    return label;
  }

  // Sync the qualification fields from a position master row (the dropdown
  // pick, or the row already linked to this posting).
  function syncQualificationsFromPosition(pos: {
    division: string | null;
    cscEducation: string | null;
    cscWorkExperience: string | null;
    cscTrainingRequirements: string | null;
    cscEligibilityGroup: string | null;
    specialSkill: string | null;
  } | null | undefined) {
    setDivision(pos?.division ?? "");
    setEducation(pos?.cscEducation ?? "");
    setExperience(pos?.cscWorkExperience ?? "");
    setTraining(pos?.cscTrainingRequirements ?? "");
    setEligibility(pos?.cscEligibilityGroup ?? "");
    setLicense(pos?.specialSkill ?? "");
  }

  // Load positions once (feeds the division suggestion extras in the
  // Division dropdown)
  useEffect(() => {
    if (!open) return;
    apiFetch<Paginated<Position>>(
      "/api/admin/positions?page=1&pageSize=50",
    )
      .then((data) => setPositions(data.data ?? []))
      .catch(() => {
        /* silent — dropdown will be empty */
      });
  }, [open]);

  // Pre-fill from the job whenever opened
  useEffect(() => {
    if (!open) return;
    setTitle(job.title || "");
    setPositionType(job.positionType || "");
    setNumberOfVacancy(String(job.numberOfVacancy || 1));
    // Qualification vitals come from the linked position master row.
    syncQualificationsFromPosition(job.position);
    setBriefDescription(job.briefDescription || "");
    setDuties(job.dutiesResponsibilities || "");
    setCompensation(job.compensationPackage || "");
    setOtherQual(job.otherQualifications || "");
    setPublishDate(job.publishDate ? toDateInput(job.publishDate) : "");
    setDeadlineDate(job.deadlineDate ? toDateInput(job.deadlineDate) : "");
    setProcessingDate(
      job.processingDate ? toDateInput(job.processingDate) : "",
    );
  }, [open, job]);

  const formValid = title.trim().length > 0 && parseInt(numberOfVacancy, 10) > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!formValid) {
      toast.error("Please enter a title and at least 1 vacancy.");
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        title: title.trim(),
        positionType: positionType || null,
        numberOfVacancy: parseInt(numberOfVacancy, 10) || 1,
        division: division.trim() || null,
        education: education.trim() || null,
        experience: experience.trim() || null,
        training: training.trim() || null,
        eligibility: eligibility.trim() || null,
        license: license.trim() || null,
        briefDescription: briefDescription.trim() || null,
        briefDescriptionHtml: textToHtml(briefDescription),
        dutiesResponsibilities: duties.trim() || null,
        dutiesResponsibilitiesHtml: textToHtml(duties),
        compensationPackage: compensation.trim() || null,
        compensationPackageHtml: textToHtml(compensation),
        otherQualifications: otherQual.trim() || null,
        otherQualificationsHtml: textToHtml(otherQual),
        publishDate: publishDate ? new Date(publishDate).toISOString() : null,
        deadlineDate: deadlineDate ? new Date(deadlineDate).toISOString() : null,
        processingDate: processingDate
          ? new Date(processingDate).toISOString()
          : null,
      };
      await apiFetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      toast.success("Job posting updated successfully");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save job");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Wide canvas — same register as the create dialog in recruitment-list. */}
      <DialogContent className="sm:max-w-[980px] lg:max-w-[1080px]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="font-medium tracking-tight">Edit Job Posting</DialogTitle>
          <DialogDescription>
            Update the details of this job posting.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={submit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {/* Vacancy */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label
                  htmlFor="je-vacancy"
                  className="text-sm font-semibold text-foreground"
                >
                  Number of Vacancies
                </Label>
                <Input
                  id="je-vacancy"
                  type="number"
                  min={1}
                  value={numberOfVacancy}
                  onChange={(e) => setNumberOfVacancy(e.target.value)}
                />
              </div>
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <Label
                htmlFor="je-title"
                className="text-sm font-semibold text-foreground"
              >
                Job Title <span className="text-danger-ink">*</span>
              </Label>
              <Input
                id="je-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Senior Research Specialist"
                required
              />
            </div>

            {/* Position type */}
            <div className="space-y-1.5">
              <Label
                htmlFor="je-type"
                className="text-sm font-semibold text-foreground"
              >
                Position Type
              </Label>
              <CreatableCombobox
                id="je-type"
                options={typeOptions}
                value={positionType}
                onSelect={(v) => setPositionType(v)}
                onCreate={createType}
                noneLabel="— None —"
                placeholder="Select type (optional)"
                searchPlaceholder="Search types…"
                addLabel="Add new type"
                createTitle="New position type"
                createPlaceholder="e.g., Coterminous"
                maxLength={50}
              />
            </div>

            {/* Division & qualification requirements — written through to the
                linked position master row on save; the public posting renders
                them as the hero division line and the Minimum Qualification
                Requirements section. */}
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Division &amp; Qualification Requirements
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label
                    htmlFor="je-division"
                    className="text-sm font-semibold text-foreground"
                  >
                    Division / Department
                  </Label>
                  <CreatableCombobox
                    id="je-division"
                    options={divisionOptions}
                    value={division}
                    onSelect={(v) => setDivision(v)}
                    onCreate={createDivision}
                    noneLabel="— None —"
                    placeholder="Select division (optional)"
                    searchPlaceholder="Search divisions…"
                    addLabel="Add new division"
                    createTitle="New division / department"
                    createPlaceholder="e.g., Innovation and Strategy Office"
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label
                    htmlFor="je-education"
                    className="text-sm font-semibold text-foreground"
                  >
                    Education
                  </Label>
                  <CreatableCombobox
                    id="je-education"
                    options={educationOptions}
                    value={education}
                    onSelect={(v) => setEducation(v)}
                    onCreate={createEducation}
                    noneLabel="— None —"
                    placeholder="Select education requirement (CSC MC 07, s. 2025)"
                    searchPlaceholder="Search education requirements…"
                    addLabel="Add custom requirement"
                    createTitle="Custom education requirement"
                    createPlaceholder="e.g., Bachelor's degree in Engineering"
                    maxLength={300}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="je-experience"
                    className="text-sm font-semibold text-foreground"
                  >
                    Experience
                  </Label>
                  <Input
                    id="je-experience"
                    value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                    placeholder="e.g., 2 years of relevant experience"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="je-training"
                    className="text-sm font-semibold text-foreground"
                  >
                    Training
                  </Label>
                  <Input
                    id="je-training"
                    value={training}
                    onChange={(e) => setTraining(e.target.value)}
                    placeholder="e.g., 8 hours of relevant training"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="je-eligibility"
                    className="text-sm font-semibold text-foreground"
                  >
                    Eligibility
                  </Label>
                  <CreatableCombobox
                    id="je-eligibility"
                    options={eligibilityOptions}
                    value={eligibility}
                    onSelect={(v) => setEligibility(v)}
                    onCreate={createEligibility}
                    noneLabel="— None —"
                    placeholder="Select CSC eligibility (optional)"
                    searchPlaceholder="Search eligibilities…"
                    addLabel="Add custom eligibility"
                    createTitle="Custom eligibility"
                    createPlaceholder="e.g., Laboratory Technician, CSC MC 10"
                    maxLength={200}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="je-license"
                    className="text-sm font-semibold text-foreground"
                  >
                    License / Certification
                  </Label>
                  <Input
                    id="je-license"
                    value={license}
                    onChange={(e) => setLicense(e.target.value)}
                    placeholder="e.g., Licensed Chemical Technician"
                  />
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-3">
              <div className="space-y-1.5">
                <Label
                  htmlFor="je-publish"
                  className="text-sm font-semibold text-foreground"
                >
                  Publish Date
                </Label>
                <Input
                  id="je-publish"
                  type="date"
                  value={publishDate}
                  onChange={(e) => setPublishDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="je-deadline"
                  className="text-sm font-semibold text-foreground"
                >
                  Deadline
                </Label>
                <Input
                  id="je-deadline"
                  type="date"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="je-processing"
                  className="text-sm font-semibold text-foreground"
                >
                  Processing Date
                </Label>
                <Input
                  id="je-processing"
                  type="date"
                  value={processingDate}
                  onChange={(e) => setProcessingDate(e.target.value)}
                />
              </div>
            </div>

            {/* Rich text fields */}
            <div className="space-y-3 border-t border-border pt-4">
              <div className="space-y-1.5">
                <Label
                  htmlFor="je-brief"
                  className="text-sm font-semibold text-foreground"
                >
                  Brief Description
                </Label>
                <Textarea
                  id="je-brief"
                  value={briefDescription}
                  onChange={(e) => setBriefDescription(e.target.value)}
                  placeholder="Summarize the role in one or two sentences"
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="je-duties"
                  className="text-sm font-semibold text-foreground"
                >
                  Duties & Responsibilities
                </Label>
                <Textarea
                  id="je-duties"
                  value={duties}
                  onChange={(e) => setDuties(e.target.value)}
                  placeholder="List the main duties and responsibilities of the position"
                  rows={4}
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="je-comp"
                  className="text-sm font-semibold text-foreground"
                >
                  Compensation Package
                </Label>
                <Textarea
                  id="je-comp"
                  value={compensation}
                  onChange={(e) => setCompensation(e.target.value)}
                  placeholder="Salary grade, benefits, allowances, and other compensation details"
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="je-other"
                  className="text-sm font-semibold text-foreground"
                >
                  Other Qualifications
                </Label>
                <Textarea
                  id="je-other"
                  value={otherQual}
                  onChange={(e) => setOtherQual(e.target.value)}
                  placeholder="Preferred education, training, skills, and experience"
                  rows={3}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!formValid || submitting}>
              {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Helpers
// ============================================================================
function applicantName(a: QueueItem["applicant"]): string {
  if (!a) return "Unknown applicant";
  return fullName({ firstName: a.firstName, lastName: a.lastName }) || "Unnamed";
}

function applicantInitials(a: QueueItem["applicant"]): string {
  if (!a) return "?";
  const f = (a.firstName || "").trim().charAt(0);
  const l = (a.lastName || "").trim().charAt(0);
  return (f + l).toUpperCase() || "?";
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return formatDate(iso);
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;
  if (abs < hour) return rtf.format(Math.round(diff / minute), "minute");
  if (abs < day) return rtf.format(Math.round(diff / hour), "hour");
  if (abs < week) return rtf.format(Math.round(diff / day), "day");
  if (abs < month) return rtf.format(Math.round(diff / week), "week");
  if (abs < year) return rtf.format(Math.round(diff / month), "month");
  return rtf.format(Math.round(diff / year), "year");
}

/**
 * Convert plain-text admin input to safe, simple HTML paragraphs.
 * Mirrors the recruitment-list.tsx textToHtml helper.
 */
function textToHtml(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  return t
    .split(/\n\s*\n/)
    .map(
      (p) =>
        `<p>${p
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");
}
