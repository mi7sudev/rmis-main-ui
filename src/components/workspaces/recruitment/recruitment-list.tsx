"use client";

// ============================================================================
// RMIS 2.0 — Recruitment Workspace (List)
// The jobs board for admin + evaluator: compact header, hairline filter bar,
// and a plain fixed-height ledger table (client-side pagination) with an
// inline create/edit dialog that preserves the exact API contract
// (textToHtml companions, etc.).
//
// DESIGN LANGUAGE — quiet, tool-first (no editorial hero type, no gold
// kickers, no momentum sweeps, no staggered entrance animations): flat
// bordered surfaces, token colours only, 150ms colour-only transitions.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNav } from "@/components/nav-provider";
import {
  useJobs,
  isJobActive,
  appCount,
  type JobRow,
} from "@/lib/hooks/use-admin-data";
import { apiFetch, formatCurrency, formatDate } from "@/lib/client";
import {
  CSC_EDUCATION_REQUIREMENTS,
  CSC_ELIGIBILITY_OPTIONS,
  MC07_HINT,
  getEligibilityDescription,
} from "@/lib/csc-requirements";
import {
  StatusIndicator,
  EmptyState,
  ErrorState,
  FilterBar,
} from "@/components/primitives/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Briefcase,
  Plus,
  RefreshCw,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  type Position,
  POSITION_TYPES,
  toDateInput,
} from "@/components/views/admin/types";
import { DIVISION_LABEL, divisionLabel } from "@/lib/divisions";
import type { Paginated } from "@/lib/validation";
import {
  CreatableCombobox,
  type ComboOption,
} from "@/components/workspaces/recruitment/creatable-combobox";

// ---------- Constants ----------
const PAGE_SIZE = 10;
const POSITION_PAGE_SIZE = 50;

type StatusFilter = "all" | "open" | "closed";
type SortKey = "recent" | "deadline" | "applications";

// ============================================================================
// RecruitmentList
// ============================================================================
export function RecruitmentList() {
  const { navigate } = useNav();
  const { jobs, loading, error, reload } = useJobs();

  const [positions, setPositions] = useState<Position[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<JobRow | null>(null);

  // Search (immediate input + debounced value)
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("recent");

  // Pagination
  const [page, setPage] = useState(1);

  // Load positions once (feeds the division suggestion extras in the
  // create/edit dialog's Division dropdown).
  // Inline the promise chain — the `react-hooks/set-state-in-effect` rule
  // allows setState inside async callbacks (microtask), but flags setState
  // reached through an indirect function call.
  useEffect(() => {
    apiFetch<Paginated<Position>>(
      `/api/admin/positions?page=1&pageSize=${POSITION_PAGE_SIZE}`,
    )
      .then((data) => setPositions(data.data ?? []))
      .catch(() => {
        /* silent — the dialog will just show the registry division list */
      });
  }, []);

  // Distinct position types ever used on loaded jobs — the persistent half of
  // the scalable Position Type dropdown (a type typed inline today reappears
  // here once a posting saved with it is loaded).
  const knownTypes = useMemo(() => {
    const set = new Set<string>();
    for (const j of jobs) {
      const t = (j.positionType || "").trim();
      if (t) set.add(t);
    }
    return [...set];
  }, [jobs]);

  // Debounce search input → 350ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput.trim().toLowerCase());
      setPage(1);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // Filter + sort (client-side)
  const filtered = useMemo(() => {
    const q = search;
    let list = jobs.filter((job) => {
      const title = (
        job.title ||
        job.position?.positionTitle ||
        ""
      ).toLowerCase();
      const itemNo = (job.position?.itemNumber || "").toLowerCase();
      const place = (
        job.position?.placeOfAssignment?.name ||
        ""
      ).toLowerCase();
      if (q && !title.includes(q) && !itemNo.includes(q) && !place.includes(q)) {
        return false;
      }
      const active = isJobActive(job);
      if (statusFilter === "open" && !active) return false;
      if (statusFilter === "closed" && active) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sortKey === "recent") {
        const ad = a.publishDate ? new Date(a.publishDate).getTime() : 0;
        const bd = b.publishDate ? new Date(b.publishDate).getTime() : 0;
        return bd - ad;
      }
      if (sortKey === "deadline") {
        const ad = a.deadlineDate ? new Date(a.deadlineDate).getTime() : Infinity;
        const bd = b.deadlineDate ? new Date(b.deadlineDate).getTime() : Infinity;
        return ad - bd;
      }
      // applications
      const ac = appCount(a) ?? 0;
      const bc = appCount(b) ?? 0;
      return bc - ac;
    });
    return list;
  }, [jobs, search, statusFilter, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedJobs = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  return (
    <div className="mx-auto w-full max-w-[1400px] 2xl:max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8">
      {/* ===== Compact header — quiet overline + semibold title. Actions
          (refresh + create) sit flush right on sm+, stack under on mobile.
          No display type, no gold kicker. ===== */}
      <header className="mb-6 border-b border-border pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Jobs
            </p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">
              Recruitment
            </h1>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={reload}>
              <RefreshCw className="size-4" /> Refresh
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Create Job
            </Button>
          </div>
        </div>
      </header>

      {/* Filter bar */}
      <FilterBar>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by title, item no., or place of assignment..."
            className="pl-9"
            aria-label="Search job postings"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as StatusFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-40" aria-label="Filter by status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={sortKey}
          onValueChange={(v) => setSortKey(v as SortKey)}
        >
          <SelectTrigger className="w-full sm:w-52" aria-label="Sort jobs">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Recently posted</SelectItem>
            <SelectItem value="deadline">Deadline</SelectItem>
            <SelectItem value="applications">Applications</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      {/* Body */}
      <div className="mt-4">
        {loading ? (
          <RecruitmentListSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Briefcase className="size-10" />}
            title="No job postings"
            description="Create a job posting to start recruiting."
            action={
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" /> Create Job
              </Button>
            }
          />
        ) : (
          <>
            {/* Fixed-height data table — 65vh frame on lg+ (60vh cap on
                mobile): rows scroll inside the frame so the page never runs
                away downward; the thead primitive is sticky (bg-tablehead,
                top-0) so the header band stays visible while scrolling. */}
            <div className="max-h-[60vh] lg:h-[65vh] lg:max-h-[65vh] overflow-auto border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4 min-w-[260px]">Position</TableHead>
                    <TableHead className="text-right">Vacancies</TableHead>
                    <TableHead className="text-right">Monthly Salary</TableHead>
                    <TableHead className="text-right">Applications</TableHead>
                    <TableHead className="text-right">Deadline</TableHead>
                    <TableHead className="pr-4 text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedJobs.map((job) => (
                    <JobTableRow
                      key={job.id}
                      job={job}
                      onClick={() => navigate("job", { id: String(job.id) })}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination footer */}
            <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
              <p className="text-xs text-muted-foreground">
                Showing{" "}
                <span className="font-medium text-foreground">
                  {(safePage - 1) * PAGE_SIZE + 1}–
                  {Math.min(safePage * PAGE_SIZE, filtered.length)}
                </span>{" "}
                of{" "}
                <span className="font-medium text-foreground">
                  {filtered.length}
                </span>{" "}
                jobs
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="size-4" /> Previous
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Page {safePage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Create / Edit dialog */}
      <JobFormDialog
        open={createOpen || !!editing}
        editing={editing}
        positions={positions}
        knownTypes={knownTypes}
        onOpenChange={(o) => {
          if (!o) {
            setCreateOpen(false);
            setEditing(null);
          }
        }}
        onSaved={() => {
          setCreateOpen(false);
          setEditing(null);
          reload();
        }}
      />

    </div>
  );
}

// ============================================================================
// JobTableRow — plain ledger row: single-step hover tint, quiet vitals,
// tabular numerals, no per-cell iconography (the sticky header labels the
// columns; the row stays ink-on-paper).
// ============================================================================
function JobTableRow({
  job,
  onClick,
}: {
  job: JobRow;
  onClick: () => void;
}) {
  const active = isJobActive(job);
  const title = job.title || job.position?.positionTitle || "Untitled Position";
  const itemNo = job.position?.itemNumber;
  const place = job.position?.placeOfAssignment?.name;
  const salary = job.position?.salaryAmount ?? null;
  const count = appCount(job);
  const overdue = !!job.deadlineDate && new Date(job.deadlineDate) < new Date();

  return (
    <TableRow onClick={onClick} className="cursor-pointer hover:bg-accent/40">
      {/* Position — title + type / item no. / place meta */}
      <TableCell className="pl-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {title}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {job.positionType && <span>{job.positionType}</span>}
            {itemNo && (
              <>
                <span aria-hidden className="text-muted-foreground/40">·</span>
                <span>Item No. {itemNo}</span>
              </>
            )}
            {place && (
              <>
                <span aria-hidden className="text-muted-foreground/40">·</span>
                <span>{place}</span>
              </>
            )}
          </div>
        </div>
      </TableCell>
      {/* Vacancies */}
      <TableCell className="text-right">
        <span className="text-sm font-medium tabular-nums text-foreground">
          {job.numberOfVacancy}
        </span>
      </TableCell>
      {/* Monthly salary */}
      <TableCell className="text-right">
        <span className="text-sm font-medium tabular-nums text-foreground">
          {formatCurrency(salary)}
        </span>
      </TableCell>
      {/* Applications */}
      <TableCell className="text-right">
        <span className="text-sm font-medium tabular-nums text-foreground">
          {count ?? 0}
        </span>
      </TableCell>
      {/* Deadline — danger-ink token when overdue */}
      <TableCell className="text-right">
        <span
          className={`text-sm font-medium tabular-nums ${
            overdue ? "text-danger-ink" : "text-foreground"
          }`}
        >
          {job.deadlineDate ? formatDate(job.deadlineDate) : "—"}
        </span>
      </TableCell>
      {/* Publish status + open action */}
      <TableCell className="pr-4 text-right">
        <div className="flex items-center justify-end gap-1">
          <StatusIndicator status={active ? "OPEN" : "CLOSED"} size="sm" />
          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-muted-foreground hover:text-foreground"
            aria-label={`Open ${title}`}
            title="Open job workspace"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ============================================================================
// RecruitmentListSkeleton — mirrors the ledger table: ONE bordered sheet with
// hairline rows (raw bg-muted pulse bars — same rationale as the Review
// Queue's skeletons: visible on tinted surfaces, no rounding).
// ============================================================================
function RecruitmentListSkeleton() {
  return (
    <ul className="divide-y divide-border border border-border bg-card">
      {Array.from({ length: 6 }).map((_, i) => (
        <li
          key={i}
          className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4"
        >
          {/* Position title + meta bars (mirrors the wide first column) */}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-48 animate-pulse bg-muted" />
            <div className="h-3 w-64 animate-pulse bg-muted" />
          </div>
          {/* Numeric + status column bars */}
          <div className="h-4 w-10 animate-pulse bg-muted" />
          <div className="h-4 w-24 animate-pulse bg-muted" />
          <div className="h-4 w-10 animate-pulse bg-muted" />
          <div className="h-4 w-20 animate-pulse bg-muted" />
          <div className="h-5 w-16 animate-pulse bg-muted" />
        </li>
      ))}
    </ul>
  );
}

// ============================================================================
// JobFormDialog — Create / Edit (preserves exact API contract)
// The Position Type / Division / Education / Eligibility dropdowns are
// "scalable": each is a CreatableCombobox with an inline add-new action
// inside the popover. There is NO position master selector — the posting
// form itself owns the qualification requirements (the API auto-creates and
// links the underlying position master row on save).
// ============================================================================
function JobFormDialog({
  open,
  editing,
  positions,
  knownTypes,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  editing: JobRow | null;
  positions: Position[];
  /** Distinct position types ever used on loaded jobs. */
  knownTypes: string[];
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [positionType, setPositionType] = useState<string>("");
  const [numberOfVacancy, setNumberOfVacancy] = useState<string>("1");
  // Poster qualification vitals — written through to the linked POSITION
  // master row on save (see POST/PATCH /api/jobs). Division holds the
  // official registry CODE; the other five map to the CSC MQR columns and
  // specialSkill that the public posting renders as requirements.
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

  // Session-scoped options added through the scalable dropdowns. Position
  // types and divisions are free-text on the job/position, so a typed-in
  // option joins the list immediately; anything ever saved on a job/position
  // also re-enters the list via the DB unions below.
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

  // Sync the qualification fields from the position master row already linked
  // to the posting being edited (the posting form owns these requirements —
  // the position row is their storage).
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

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title || "");
      setPositionType(editing.positionType || "");
      setNumberOfVacancy(String(editing.numberOfVacancy || 1));
      // Qualification vitals come from the linked position master row.
      syncQualificationsFromPosition(editing.position);
      setBriefDescription(editing.briefDescription || "");
      setDuties(editing.dutiesResponsibilities || "");
      setCompensation(editing.compensationPackage || "");
      setOtherQual(editing.otherQualifications || "");
      setPublishDate(editing.publishDate ? toDateInput(editing.publishDate) : "");
      setDeadlineDate(
        editing.deadlineDate ? toDateInput(editing.deadlineDate) : "",
      );
      setProcessingDate(
        editing.processingDate ? toDateInput(editing.processingDate) : "",
      );
    } else {
      // reset for create
      setTitle("");
      setPositionType("");
      setNumberOfVacancy("1");
      syncQualificationsFromPosition(null);
      setBriefDescription("");
      setDuties("");
      setCompensation("");
      setOtherQual("");
      setPublishDate(toDateInput(new Date().toISOString()));
      setDeadlineDate("");
      setProcessingDate("");
    }
  }, [editing, open]);

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
      if (editing) {
        await apiFetch(`/api/jobs/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        toast.success("Job posting updated successfully");
      } else {
        await apiFetch("/api/jobs", {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast.success("Job posting created successfully");
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save job");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Wide canvas (matches the applicant detail modal register): the job
          form packs a position/qualification block + four rich-text fields,
          which read far better at ~1000px than the old sm:max-w-2xl. */}
      <DialogContent className="sm:max-w-[980px] lg:max-w-[1080px]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="font-medium tracking-tight">
            {editing ? "Edit Job Posting" : "Create Job Posting"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Update job posting details."
              : "Post a new job opening for applicants to apply."}
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
                  htmlFor="jf-vacancy"
                  className="text-sm font-semibold text-foreground"
                >
                  Number of Vacancies
                </Label>
                <Input
                  id="jf-vacancy"
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
                htmlFor="jf-title"
                className="text-sm font-semibold text-foreground"
              >
                Job Title <span className="text-danger-ink">*</span>
              </Label>
              <Input
                id="jf-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Senior Research Specialist"
                required
              />
            </div>

            {/* Position type */}
            <div className="space-y-1.5">
              <Label
                htmlFor="jf-type"
                className="text-sm font-semibold text-foreground"
              >
                Position Type
              </Label>
              <CreatableCombobox
                id="jf-type"
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
                    htmlFor="jf-division"
                    className="text-sm font-semibold text-foreground"
                  >
                    Division / Department
                  </Label>
                  <CreatableCombobox
                    id="jf-division"
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
                    htmlFor="jf-education"
                    className="text-sm font-semibold text-foreground"
                  >
                    Education
                  </Label>
                  <CreatableCombobox
                    id="jf-education"
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
                    htmlFor="jf-experience"
                    className="text-sm font-semibold text-foreground"
                  >
                    Experience
                  </Label>
                  <Input
                    id="jf-experience"
                    value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                    placeholder="e.g., 2 years of relevant experience"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="jf-training"
                    className="text-sm font-semibold text-foreground"
                  >
                    Training
                  </Label>
                  <Input
                    id="jf-training"
                    value={training}
                    onChange={(e) => setTraining(e.target.value)}
                    placeholder="e.g., 8 hours of relevant training"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="jf-eligibility"
                    className="text-sm font-semibold text-foreground"
                  >
                    Eligibility
                  </Label>
                  <CreatableCombobox
                    id="jf-eligibility"
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
                    htmlFor="jf-license"
                    className="text-sm font-semibold text-foreground"
                  >
                    License / Certification
                  </Label>
                  <Input
                    id="jf-license"
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
                  htmlFor="jf-publish"
                  className="text-sm font-semibold text-foreground"
                >
                  Publish Date
                </Label>
                <Input
                  id="jf-publish"
                  type="date"
                  value={publishDate}
                  onChange={(e) => setPublishDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="jf-deadline"
                  className="text-sm font-semibold text-foreground"
                >
                  Deadline
                </Label>
                <Input
                  id="jf-deadline"
                  type="date"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="jf-processing"
                  className="text-sm font-semibold text-foreground"
                >
                  Processing Date
                </Label>
                <Input
                  id="jf-processing"
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
                  htmlFor="jf-brief"
                  className="text-sm font-semibold text-foreground"
                >
                  Brief Description
                </Label>
                <Textarea
                  id="jf-brief"
                  value={briefDescription}
                  onChange={(e) => setBriefDescription(e.target.value)}
                  placeholder="Summarize the role in one or two sentences"
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="jf-duties"
                  className="text-sm font-semibold text-foreground"
                >
                  Duties & Responsibilities
                </Label>
                <Textarea
                  id="jf-duties"
                  value={duties}
                  onChange={(e) => setDuties(e.target.value)}
                  placeholder="List the main duties and responsibilities of the position"
                  rows={4}
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="jf-comp"
                  className="text-sm font-semibold text-foreground"
                >
                  Compensation Package
                </Label>
                <Textarea
                  id="jf-comp"
                  value={compensation}
                  onChange={(e) => setCompensation(e.target.value)}
                  placeholder="Salary grade, benefits, allowances, and other compensation details"
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="jf-other"
                  className="text-sm font-semibold text-foreground"
                >
                  Other Qualifications
                </Label>
                <Textarea
                  id="jf-other"
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
              {editing ? "Save Changes" : "Create Job"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Convert plain-text admin input to safe, simple HTML paragraphs so the
 * public job detail page can render it as rich text (admins never see HTML).
 * Splits on blank-line paragraphs, escapes HTML entities, converts single
 * newlines to <br/>, wraps each paragraph in <p>. Returns null when empty.
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
