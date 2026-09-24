"use client";

// ============================================================================
// RMIS 2.0 — Review Modal (Evaluator + Administrator)
// The ENTIRE credential-review experience presented as a large, app-like
// centered modal instead of a standalone page.
//
// WHY A MODAL — the evaluator never loses queue context: rows stay behind
// the dimmed canvas, filter tabs and scroll positions persist, and the
// review closes straight back into the queue. Deep links (candidate detail,
// notifications) open the same modal via the thin ReviewWorkspace wrapper.
//
// DESIGN LANGUAGE — quiet, tool-first (no display type, no gold kickers, no
// ghost numerals, no momentum sweeps, no entrance animations): compact
// header, flat bordered cards, token colours only, 150ms colour-only
// transitions. Status pills stay — they are data.
//
// LAYOUT:
//   HEADER  — muted overline ("02 · Review Workspace") + status pill,
//             semibold name, vitals line (position · place · applied).
//   BODY    — two-pane grid lg:[1fr_380px]:
//     LEFT  — the APPLICANT: quiet underline tabs (Profile · Education ·
//             Experience · Documents) over flat bordered ledger cards.
//     RIGHT — the DECISION: credentials-on-file grid, MQR results, CSC
//             qualification standards, state banner, decision card (+ revise).
//             Everything the decision rests on, in one rail.
//
// API contract (unchanged): GET/PATCH /api/evaluator/applications/:id.
// The decision flow — Start Review / Shortlist / Not Qualified (+ remarks,
// confirm dialog, email notices) — is preserved 1:1 from the page version.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useNav } from "@/components/nav-provider";
import { apiFetch, formatDate, fullName } from "@/lib/client";
import { humanizeTitle, humanizeName } from "@/lib/humanize";
import {
  StatusIndicator,
  EmptyState,
  ErrorState,
} from "@/components/primitives/workspace";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldRow } from "@/components/views/shared";
import { isInReviewStatus } from "@/lib/status";
import { toast } from "sonner";
import {
  ArrowUpRight,
  XCircle,
  FileCheck2,
  FileSearch,
  FileText,
  Loader2,
  Mail,
  MailCheck,
  MailWarning,
  CalendarClock,
  ClipboardList,
  Paperclip,
  Send,
  Undo2,
  X,
} from "lucide-react";
import type { ApplicationDetail } from "@/components/views/evaluator/types";
import {
  getEligibilityFieldSpec,
  isCustomEligibilityTitle,
} from "@/lib/csc-requirements";
import { RequirementsMatchPanel } from "@/components/workspaces/evaluator/requirements-match";

// ============================================================================
// Types
// ============================================================================

export type ReviewModalProps = {
  applicationId: number | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Called after a decision is recorded — lets the queue refresh its rows. */
  onDecided?: () => void;
};

type Decision = "Shortlisted" | "Rejected" | "Under Review";

// ============================================================================
// Main component
// ============================================================================

export function ReviewModal({
  applicationId,
  open,
  onOpenChange,
  onDecided,
}: ReviewModalProps) {
  const { navigate } = useNav();
  const [app, setApp] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (applicationId == null) {
      setError("No application ID provided.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ApplicationDetail>(
        `/api/evaluator/applications/${applicationId}`
      );
      setApp(data);
      setLoadedId(applicationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load application");
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    if (!open || applicationId == null) return;
    // Re-fetch whenever the target changes, or when reopened after a
    // decision taken elsewhere (the queue may have reloaded rows).
    if (loadedId === applicationId && app) return;
    load();
  }, [open, applicationId, loadedId, app, load]);

  // Hard-reload the detail (used after a decision is recorded).
  const reload = useCallback(() => {
    load();
    onDecided?.();
  }, [load, onDecided]);

  const viewFullProfile = app
    ? () => {
        onOpenChange(false);
        navigate("candidate", { id: String(app.applicant.id) });
      }
    : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* App-like shell: near-fullscreen width, viewport-capped height,
          flush padding — header / body manage their own rhythm. */}
      <DialogContent className="h-[calc(100vh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-[1200px] lg:max-w-[1360px]">
        <DialogHeader className="sr-only">
          <DialogTitle>
            {app ? `Review — ${humanizeName(fullName(app.applicant))}` : "Review"}
          </DialogTitle>
          <DialogDescription>
            Evaluator credential review and shortlist decision.
          </DialogDescription>
        </DialogHeader>

        {loading && !app ? (
          <ReviewSkeleton />
        ) : error && !app ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="w-full max-w-md">
              <ErrorState message={error} onRetry={load} />
            </div>
          </div>
        ) : !app ? (
          applicationId == null ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="w-full max-w-md">
                <EmptyState
                  icon={<FileText className="size-10" />}
                  title="No application selected"
                  description="Open a candidate from the review queue to start."
                />
              </div>
            </div>
          ) : null
        ) : (
          <ReviewModalBody app={app} onDecided={reload} onFullProfile={viewFullProfile} />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Body — header band + dossier / decision two-pane grid
// ============================================================================

function ReviewModalBody({
  app,
  onDecided,
  onFullProfile,
}: {
  app: ApplicationDetail;
  onDecided: () => void;
  onFullProfile?: () => void;
}) {
  const a = app.applicant;
  const pos = app.job.position;
  const positionTitle = pos?.positionTitle || app.job.title;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ===== HEADER BAND — quiet overline + status pill → semibold name
          → vitals. Compact tool header: no display type, no gold kicker. ===== */}
      {/* pr-14 on mobile reserves the absolute close button's zone */}
      <header className="shrink-0 border-b border-border pr-14 pb-5 pl-5 pt-5 sm:px-6 sm:pb-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Review Workspace
          </p>
          <StatusIndicator status={app.status} size="sm" />
        </div>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
              {humanizeName(fullName(a))}
            </h1>
            {/* One quiet vitals line — position · place · applied */}
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {positionTitle ? humanizeTitle(positionTitle) : null}
              </span>
              {pos?.placeOfAssignment?.name && (
                <>
                  <Dot />
                  <span className="min-w-0">{pos.placeOfAssignment.name}</span>
                </>
              )}
              <Dot />
              <span className="shrink-0 tabular-nums">
                Applied {formatDate(app.dateApplied)}
              </span>
            </div>
          </div>
          {onFullProfile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onFullProfile}
              className="shrink-0"
            >
              <span className="hidden sm:inline">View full profile</span>
              <ArrowUpRight className="size-4" />
            </Button>
          )}
        </div>
      </header>

      {/* ===== BODY — dossier (left) / decision rail (right) ===== */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* LEFT — the applicant dossier */}
        <div className="min-h-0 overflow-y-auto">
          <CandidateDossier app={app} />
        </div>

        {/* RIGHT — the decision rail (own scroll; stacks below on mobile) */}
        <div className="min-h-0 overflow-y-auto border-t border-border bg-secondary/30 lg:border-l lg:border-t-0">
          <DecisionRail app={app} onDecided={onDecided} />
        </div>
      </div>
    </div>
  );
}

// Typographic middot between row vitals — quiet punctuation, no icons.
function Dot() {
  return <span aria-hidden className="select-none text-foreground/25">·</span>;
}

// ============================================================================
// CandidateDossier — LEFT pane. Quiet underline tabs (muted labels, 2px
// foreground rule on active) + flat bordered ledger panels.
// ============================================================================

const DOSSIER_TABS = [
  { key: "profile", label: "Profile" },
  { key: "education", label: "Education" },
  { key: "experience", label: "Experience" },
  { key: "documents", label: "Documents" },
] as const;

type DossierTab = (typeof DOSSIER_TABS)[number]["key"];

function CandidateDossier({ app }: { app: ApplicationDetail }) {
  const [tab, setTab] = useState<DossierTab>("profile");

  return (
    <div>
      {/* Tab bar — sticky within the dossier scroll; quiet underline tabs */}
      <div className="sticky top-0 z-10 border-b border-border bg-card px-5 sm:px-6">
        <nav className="flex gap-5 overflow-x-auto sm:gap-7" aria-label="Candidate sections">
          {DOSSIER_TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                aria-current={active ? "page" : undefined}
                className={`-mb-px shrink-0 border-b-2 py-3 text-sm font-medium transition-colors duration-150 ${
                  active
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Panels — generous padding; the dossier scroll owns pagination */}
      <div className="px-5 py-6 sm:px-6">
        {tab === "profile" && (
          <TabPanel key="profile">
            <ProfileSection profile={app.snapshots.profile} applicant={app.applicant} />
          </TabPanel>
        )}
        {tab === "education" && (
          <TabPanel key="education">
            <SectionHeading label="Education" count={app.snapshots.educations.length} />
            <SnapshotList
              items={app.snapshots.educations}
              fields={educationFields}
              emptyLabel="No education records in snapshot"
            />
          </TabPanel>
        )}
        {tab === "experience" && (
          <TabPanel key="experience">
            <SectionHeading label="Work Experience" count={app.snapshots.experiences.length} />
            <SnapshotList
              items={app.snapshots.experiences}
              fields={experienceFields}
              emptyLabel="No work experience records in snapshot"
            />
          </TabPanel>
        )}
        {tab === "documents" && (
          <TabPanel key="documents">
            <DocumentsSection documents={app.documents} />
          </TabPanel>
        )}

        {/* Trainings / Eligibilities / Awards — the rest of the credential
            snapshot, surfaced under the primary four tabs so nothing the
            decision needs lives outside the modal. */}
        {(app.snapshots.trainings.length > 0 ||
          app.snapshots.eligibilities.length > 0 ||
          app.snapshots.awards.length > 0) && (
          <div className="mt-10 space-y-10 border-t border-border pt-8">
            {app.snapshots.trainings.length > 0 && (
              <div>
                <SectionHeading label="Trainings" count={app.snapshots.trainings.length} />
                <SnapshotList
                  items={app.snapshots.trainings}
                  fields={trainingFields}
                  emptyLabel=""
                />
              </div>
            )}
            {app.snapshots.eligibilities.length > 0 && (
              <div>
                <SectionHeading label="Eligibilities" count={app.snapshots.eligibilities.length} />
                <SnapshotList
                  items={app.snapshots.eligibilities}
                  fields={eligibilityFields}
                  emptyLabel=""
                />
              </div>
            )}
            {app.snapshots.awards.length > 0 && (
              <div>
                <SectionHeading label="Awards" count={app.snapshots.awards.length} />
                <SnapshotList
                  items={app.snapshots.awards}
                  fields={awardFields}
                  emptyLabel=""
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Tab-panel wrapper
function TabPanel({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

// Quiet section heading — medium label + count (hairline rhythm)
function SectionHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-4 flex items-baseline justify-between border-b border-border pb-2.5">
      <h2 className="text-sm font-medium text-foreground">{label}</h2>
      <span className="text-xs tabular-nums text-muted-foreground">
        {count} {count === 1 ? "entry" : "entries"}
      </span>
    </div>
  );
}

// ============================================================================
// Profile section — key fields from snapshot + applicant, 2-up on xl
// (the modal's width lets the ledger breathe — bigger contents, as asked).
// ============================================================================

function ProfileSection({
  profile,
  applicant,
}: {
  profile: Record<string, unknown> | null;
  applicant: ApplicationDetail["applicant"];
}) {
  const p = profile || {};
  const rows: { label: string; value: unknown }[] = [
    { label: "First Name", value: p.firstName ?? applicant.firstName },
    { label: "Last Name", value: p.lastName ?? applicant.lastName },
    { label: "Gender", value: p.gender ?? applicant.gender },
    { label: "Civil Status", value: p.civilStatus ?? applicant.civilStatus },
    { label: "Citizenship", value: p.citizenship ?? applicant.citizenship },
    {
      label: "Birth Date",
      value: p.birthDate ? formatDate(p.birthDate as string) : null,
    },
    { label: "Email", value: p.emailAddress ?? applicant.emailAddress },
    { label: "Contact Number", value: p.contactNumber ?? applicant.contactNumber },
    { label: "Address", value: p.presentAddress },
    {
      label: "City / Province",
      value: [p.city, p.province].filter(Boolean).join(", ") || null,
    },
    { label: "Country", value: p.country },
  ];
  // FieldRow self-separates (border-b + last:border-0) — no divide-y wrapper,
  // which would double the hairlines between rows.
  return (
    <div className="grid grid-cols-1 gap-x-10 xl:grid-cols-2">
      {rows.map((r) => (
        <FieldRow key={r.label} label={r.label} value={r.value as string} />
      ))}
    </div>
  );
}

// ============================================================================
// SnapshotList — ONE hairline ledger card; entries at full dossier width.
// Field extractors mirror views/evaluator/types.tsx 1:1 (same labels, same
// order) on the bordered bg-card sheet.
// ============================================================================

// Humanize a text vital — ALL-CAPS DB strings render in display case;
// mixed-case input passes through untouched.
function titleCase(v: unknown): string | null {
  return v == null || v === "" ? null : humanizeTitle(String(v));
}

function educationFields(e: Record<string, unknown>): [string, unknown][] {
  return [
    ["Level", e.educationLevel],
    ["Degree", titleCase(e.degree)],
    ["Course", titleCase(e.course)],
    ["Specify Others", titleCase(e.specifyOthers)],
    ["School", titleCase(e.schoolName)],
    ["Year Graduated", e.yearGraduated],
    ["Units Earned", e.unitsEarned],
    ["Ongoing", e.ongoing ? "Yes" : null],
    ["Highest", e.isHighestEducation ? "Yes" : null],
  ];
}

function experienceFields(e: Record<string, unknown>): [string, unknown][] {
  return [
    ["Position", titleCase(e.positionTitle)],
    ["Employer", titleCase(e.employerName)],
    ["Employer Address", titleCase(e.employerAddress)],
    ["Status", titleCase(e.statusOfEmployment)],
    ["From", e.inclusiveDateFrom ? formatDate(e.inclusiveDateFrom as string) : null],
    ["To", e.inclusiveDateTo ? formatDate(e.inclusiveDateTo as string) : null],
    ["Present Work", e.isPresentWork ? "Yes" : null],
    ["Govt Service", e.isGovtService ? "Yes" : "No"],
    ["Monthly Salary", e.monthlySalary ? `₱${Number(e.monthlySalary).toLocaleString()}` : null],
    ["Years", e.yearDecimal ? `${e.yearDecimal} yrs` : null],
    ["Reason for Leaving", e.reasonForLeaving],
  ];
}

function trainingFields(t: Record<string, unknown>): [string, unknown][] {
  return [
    ["Title", titleCase(t.titleOfTraining)],
    ["Type", titleCase(t.typeOfTraining)],
    ["Specify", titleCase(t.specifyTraining)],
    ["From", t.inclusiveDateFrom ? formatDate(t.inclusiveDateFrom as string) : null],
    ["To", t.inclusiveDateTo ? formatDate(t.inclusiveDateTo as string) : null],
    ["Hours", t.numberHours ? `${t.numberHours} hrs` : null],
    ["Decimal Hours", t.hourDecimal ? `${t.hourDecimal} hrs` : null],
  ];
}

function eligibilityFields(el: Record<string, unknown>): [string, unknown][] {
  // Per-type field labels — same spec the applicant form uses. Non-applicable
  // fields are hidden instead of rendering as "—". Free-text "Others" entries
  // (custom titles) show the title verbatim (no titleCase mangling) plus only
  // detail fields that actually carry a value (legacy data).
  const custom = isCustomEligibilityTitle(el.eligibilityTitle as string);
  const spec = getEligibilityFieldSpec(el.eligibilityTitle as string);
  const keep = (v: unknown) => (custom ? v != null && v !== "" : true);
  const rows: [string, unknown][] = [
    ["Title", custom ? el.eligibilityTitle : titleCase(el.eligibilityTitle)],
  ];
  if (spec.rating && keep(el.rating)) rows.push([spec.rating.label, el.rating]);
  if (spec.examDate && keep(el.examDate))
    rows.push([
      spec.examDate.label,
      el.examDate ? formatDate(el.examDate as string) : null,
    ]);
  if (spec.examPlace && keep(el.examPlace))
    rows.push([spec.examPlace.label, titleCase(el.examPlace)]);
  if (spec.licenseNumber && keep(el.licenseNumber))
    rows.push([spec.licenseNumber.label, el.licenseNumber]);
  if (spec.licenseValidity && keep(el.licenseValidity))
    rows.push([
      spec.licenseValidity.label,
      el.licenseValidity ? formatDate(el.licenseValidity as string) : null,
    ]);
  return rows;
}

function awardFields(a: Record<string, unknown>): [string, unknown][] {
  return [
    ["Type", titleCase(a.recognitionType)],
    ["Award Type", titleCase(a.awardType)],
    ["Scope", titleCase(a.recognitionScope)],
    ["Category", titleCase(a.recognitionCategory)],
    ["Subcategory", titleCase(a.recognitionSubcategory)],
    ["Details", a.recognitionDetails],
    ["Provider", titleCase(a.recognitionProvider)],
    ["Date Granted", a.dateGranted ? formatDate(a.dateGranted as string) : null],
    ["Points", a.points],
  ];
}

function SnapshotList({
  items,
  fields,
  emptyLabel,
}: {
  items: Record<string, unknown>[];
  fields: (item: Record<string, unknown>) => [string, unknown][];
  emptyLabel: string;
}) {
  if (!items || items.length === 0) {
    return (
      <p className="text-sm italic text-muted-foreground">{emptyLabel}</p>
    );
  }
  return (
    <div className="divide-y divide-border border border-border bg-card">
      {items.map((item, idx) => (
        <div key={idx} className="px-4 py-4 sm:px-5">
          <div className="mb-2.5">
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Entry {String(idx + 1).padStart(2, "0")}
            </span>
          </div>
          <dl className="grid grid-cols-1 gap-x-10 xl:grid-cols-2">
            {fields(item).map(([label, value]) => (
              <SnapshotField key={label} label={label} value={value} />
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

// One label/value pair inside a snapshot ledger row — muted label, ink value.
function SnapshotField({ label, value }: { label: string; value: unknown }) {
  const empty = value == null || value === "";
  return (
    <div className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:items-start sm:gap-4">
      <dt className="shrink-0 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground sm:w-40">
        {label}
      </dt>
      <dd className="break-words text-sm font-medium tabular-nums text-foreground">
        {empty ? <span className="text-muted-foreground/50">—</span> : String(value)}
      </dd>
    </div>
  );
}

// ============================================================================
// Documents section — full-width ledger rows with a single hover tint
// ============================================================================

function DocumentsSection({
  documents,
}: {
  documents: ApplicationDetail["documents"];
}) {
  if (!documents || documents.length === 0) {
    return (
      <p className="text-sm italic text-muted-foreground">
        No documents uploaded by the applicant
      </p>
    );
  }
  return (
    <div>
      <SectionHeading label="Documents" count={documents.length} />
      <ul className="divide-y divide-border border border-border bg-card">
        {documents.map((d) => {
          const ext = d.originalName.split(".").pop()?.toUpperCase() || "FILE";
          const kb = d.size > 0 ? Math.max(1, Math.round(d.size / 1024)) : null;
          return (
            <li key={d.id}>
              <a
                href={`/api/files/${d.filePath}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-accent/40 sm:px-5"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {/* Square ext chip — quiet monogram */}
                  <span className="grid size-9 shrink-0 place-items-center bg-muted text-[10px] font-semibold text-foreground/70">
                    {ext}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {d.originalName}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="truncate">{humanizeTitle(d.category)}</span>
                      {kb ? (
                        <>
                          <Dot />
                          <span className="shrink-0 tabular-nums">{kb} KB</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ============================================================================
// DecisionRail — RIGHT pane. Everything the decision rests on:
// requirements match → credentials-on-file grid → state banner → decision
// card (+ revise). Decision payloads and notices are unchanged.
// ============================================================================

function DecisionRail({
  app,
  onDecided,
}: {
  app: ApplicationDetail;
  onDecided: () => void;
}) {
  const [remarks, setRemarks] = useState("");
  const [pendingDecision, setPendingDecision] = useState<Decision | null>(null);
  // Last decision shown in the confirm dialog. Closing nulls `pendingDecision`
  // immediately while the dialog's exit animation is still playing — branching
  // off the nulled state would flip the content to the "Mark as not
  // qualified?" fallback for those frames (the wrong modal flashing on close).
  // The dialog keeps rendering this value through the exit instead.
  const [lastDecision, setLastDecision] = useState<Decision | null>(null);
  const [updating, setUpdating] = useState(false);

  const openConfirm = (d: Decision) => {
    setLastDecision(d);
    setPendingDecision(d);
  };

  const status = app.status ?? "";
  const isShortlisted = status.toUpperCase() === "SHORTLISTED";
  const isRejected = status.toUpperCase() === "REJECTED";
  // "In review" is a STATE the evaluator sets explicitly (the Review action —
  // which emails the applicant). A freshly submitted application is merely
  // "Awaiting Review" on both portals until the evaluator starts it.
  const isUnderReview = !isShortlisted && !isRejected && isInReviewStatus(status);
  const decided = isShortlisted || isRejected;

  const positionTitle =
    app.job.position?.positionTitle || app.job.title || null;

  // Credential checklist — what the reviewer looked at (read-only counts)
  const checklist: { label: string; count: number }[] = [
    { label: "Personal", count: app.snapshots.profile ? 1 : 0 },
    { label: "Education", count: app.snapshots.educations.length },
    { label: "Work", count: app.snapshots.experiences.length },
    { label: "Training", count: app.snapshots.trainings.length },
    { label: "Eligibility", count: app.snapshots.eligibilities.length },
    { label: "Awards", count: app.snapshots.awards.length },
    { label: "Supporting", count: app.snapshots.documents.length },
  ];
  const emailOnFile = !!app.applicant.emailAddress;

  async function applyDecision(decision: Decision) {
    setUpdating(true);
    try {
      await apiFetch(`/api/evaluator/applications/${app.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: decision,
          reason: remarks || undefined,
        }),
      });
      toast.success(
        decision === "Shortlisted"
          ? "Applicant shortlisted"
          : decision === "Rejected"
          ? "Marked as not qualified"
          : "Application is now under review",
        {
          description:
            decision === "Shortlisted"
              ? emailOnFile
                ? "Shortlist email sent to the applicant."
                : "Applicant has no email on record — HR will contact them directly."
              : decision === "Rejected"
              ? "Status notice sent to the applicant."
              : emailOnFile
              ? "Under-review notice sent to the applicant."
              : "Applicant has no email on record — HR will contact them directly.",
        }
      );
      setPendingDecision(null);
      setRemarks("");
      onDecided();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to record decision");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="space-y-5 p-5 sm:p-6">
      {/* REQUIREMENTS MATCH — the verdict the whole review rests on: the
          specific job's CSC standards vs the applicant's snapshotted
          credentials, side by side. Leads the rail so the reviewer sees
          the gap before anything else. */}
      <RequirementsMatchPanel
        report={app.requirements}
        positionTitle={positionTitle}
      />

      {/* Credential checklist — what this decision is based on */}
      <section className="border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium tracking-tight text-foreground">
            Credentials on File
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            What the decision is based on
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4 lg:grid-cols-2">
          {checklist.map((c) => (
            <li key={c.label} className="bg-card px-3 py-3 text-center">
              <div className="text-lg font-semibold tabular-nums text-foreground">
                {c.count}
              </div>
              <div className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {c.label}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Decision states — semantic status panels (data, kept) */}
      {isShortlisted ? (
        <div className="border border-success/40 bg-success/10 p-4">
          <div className="flex items-start gap-2.5">
            <MailCheck className="mt-0.5 size-4 shrink-0 text-success-ink" />
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-success-ink">
                Shortlisted
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-success-ink/90">
                {emailOnFile
                  ? "Applicant notified."
                  : "No email on record — HR will contact the applicant directly."}
              </p>
            </div>
          </div>
        </div>
      ) : isRejected ? (
        <div className="border border-destructive/40 bg-destructive/10 p-4">
          <div className="flex items-start gap-2.5">
            <XCircle className="mt-0.5 size-4 shrink-0 text-danger-ink" />
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-danger-ink">
                Not Qualified
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-danger-ink/90">
                Applicant notified. The decision can be revised below.
              </p>
            </div>
          </div>
        </div>
      ) : isUnderReview ? (
        <div className="border border-primary/40 bg-primary/10 p-4">
          <div className="flex items-start gap-2.5">
            <FileSearch className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-primary">
                Under Review
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-foreground/80">
                Applicant notified.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="border border-border bg-secondary/60 p-4">
          <div className="flex items-start gap-2.5">
            <FileSearch className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-foreground">
                Awaiting Review
              </h3>
            </div>
          </div>
        </div>
      )}

      {/* MOM (2026-09-03) steps 4 & 5 — post-decision notices. Once a
          decision exists, HR can send the matching notice: regret letter
          (rejected) or interview invitation / skills-exam notice
          (shortlisted). The pipeline ends at notification — everything after
          is face-to-face. */}
      {decided && <NoticesCard appId={app.id} status={status} hasEmail={emailOnFile} />}

      {/* Direct email — free-form follow-up from the recruitment team.
          Available at ANY stage: document requests before review, schedule
          clarifications after shortlisting, anything HR needs to convey. */}
      <DirectEmailCard
        appId={app.id}
        email={app.applicant.emailAddress}
        hasEmail={emailOnFile}
      />

      {/* Decision card — record the decision after reviewing credentials */}
      {!isShortlisted && !isRejected && (
        <section className="border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-medium tracking-tight text-foreground">
              Decision
            </h2>
          </div>
          <div className="space-y-3 p-4">
            <div>
              <Label
                htmlFor="decision-remarks"
                className="text-sm font-semibold text-foreground"
              >
                Remarks{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Textarea
                id="decision-remarks"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Optional note kept with the decision record…"
                className="mt-1.5 min-h-16 text-sm"
              />
            </div>
            {/* Review is an explicit SETTABLE state (like Shortlisted) —
                starting it emails the applicant. Already in review → done. */}
            {!isUnderReview && (
              <Button
                onClick={() => openConfirm("Under Review")}
                disabled={updating}
                className="w-full font-semibold"
              >
                <FileSearch className="mr-2 size-4" />
                Start Review
              </Button>
            )}
            <Button
              onClick={() => openConfirm("Shortlisted")}
              variant={isUnderReview ? "default" : "outline"}
              disabled={updating}
              className={isUnderReview ? "w-full font-semibold" : "w-full"}
            >
              <MailCheck className="mr-2 size-4" />
              Shortlist
            </Button>
            <Button
              variant="outline"
              onClick={() => openConfirm("Rejected")}
              disabled={updating}
              className="w-full"
            >
              <X className="mr-2 size-4" />
              Not Qualified
            </Button>
          </div>
        </section>
      )}

      {/* Revise an existing decision */}
      {decided && (
        <section className="border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-medium tracking-tight text-foreground">
              Revise Decision
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Changing the decision notifies the applicant
            </p>
          </div>
          <div className="flex flex-col gap-2 p-4 sm:flex-row">
            {isShortlisted ? (
              <Button
                variant="outline"
                onClick={() => openConfirm("Rejected")}
                disabled={updating}
                className="w-full sm:flex-1"
              >
                <X className="mr-2 size-4" />
                Mark as Not Qualified
              </Button>
            ) : (
              <Button
                onClick={() => openConfirm("Shortlisted")}
                disabled={updating}
                className="w-full font-semibold sm:flex-1"
              >
                <MailCheck className="mr-2 size-4" />
                Shortlist
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => openConfirm("Under Review")}
              disabled={updating}
              className="w-full sm:w-auto"
            >
              <Undo2 className="mr-2 size-4" />
              Return to Review
            </Button>
          </div>
        </section>
      )}

      {/* Decision confirmation (nested dialog) */}
      <ConfirmDecisionDialog
        decision={pendingDecision}
        lastDecision={lastDecision}
        email={app.applicant.emailAddress}
        hasEmail={emailOnFile}
        remarks={remarks}
        wasDecided={decided}
        updating={updating}
        onOpenChange={(open) => !open && setPendingDecision(null)}
        onConfirm={() => pendingDecision && applyDecision(pendingDecision)}
      />
    </div>
  );
}

// ============================================================================
// ConfirmDecisionDialog — record-decision confirmation (unchanged payloads)
// ============================================================================

function ConfirmDecisionDialog({
  decision,
  lastDecision,
  email,
  hasEmail,
  remarks,
  wasDecided,
  updating,
  onOpenChange,
  onConfirm,
}: {
  decision: Decision | null;
  /** Last non-null decision — keeps content stable through the exit animation
      after the parent has already nulled `decision` on close. */
  lastDecision: Decision | null;
  email: string | null;
  hasEmail: boolean;
  remarks: string;
  /** true when revising an existing Shortlisted/Rejected decision */
  wasDecided: boolean;
  updating: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
}) {
  const shown = decision ?? lastDecision;
  const isShortlist = shown === "Shortlisted";
  const isReview = shown === "Under Review";
  return (
    <Dialog open={!!decision} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {isShortlist
              ? "Shortlist this applicant?"
              : isReview
              ? wasDecided
                ? "Return to review?"
                : "Start the review?"
              : "Mark as not qualified?"}
          </DialogTitle>
          <DialogDescription>
            {isShortlist ? (
              hasEmail ? (
                <>
                  A notification will be sent to{" "}
                  <span className="font-medium text-foreground">{email}</span>.
                </>
              ) : (
                <>
                  No email on record — HR will contact the applicant directly.
                </>
              )
            ) : isReview ? (
              hasEmail ? (
                <>
                  The applicant will be notified that their application is
                  under review.
                </>
              ) : (
                <>
                  No email on record — HR will contact the applicant directly.
                </>
              )
            ) : (
              <>
                A status notice will be sent to the applicant. You can still
                revise this decision later.
              </>
            )}
            {remarks && !isReview && (
              <span className="mt-1.5 block text-xs text-muted-foreground italic">
                Remarks: “{remarks}”
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="shrink-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updating}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={updating}
            className="font-semibold"
          >
            {updating ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : isShortlist ? (
              <MailCheck className="mr-2 size-4" />
            ) : isReview ? (
              wasDecided ? (
                <Undo2 className="mr-2 size-4" />
              ) : (
                <FileSearch className="mr-2 size-4" />
              )
            ) : (
              <FileCheck2 className="mr-2 size-4" />
            )}
            {isShortlist
              ? "Shortlist"
              : isReview
              ? wasDecided
                ? "Return to Review"
                : "Start Review"
              : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// ReviewSkeleton — mirrors the modal shell: header band + dossier / rail
// ============================================================================

function ReviewSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header band — mirrors the compact quiet header */}
      <div className="shrink-0 space-y-2.5 border-b border-border px-6 pb-5 pt-5">
        <div className="h-3 w-40 animate-pulse bg-muted" />
        <div className="h-5 w-64 animate-pulse bg-muted" />
        <div className="h-4 w-80 animate-pulse bg-muted" />
      </div>
      {/* Two-pane skeleton */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* Left — tabs + ledger rows */}
        <div className="min-h-0 overflow-hidden">
          <div className="flex gap-6 border-b border-border px-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-9 w-20 animate-pulse bg-muted" />
            ))}
          </div>
          <div className="space-y-3 p-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex items-start justify-between gap-6 border-b border-border pb-3">
                <div className="h-3 w-28 animate-pulse bg-muted" />
                <div className="h-4 w-48 animate-pulse bg-muted" />
              </div>
            ))}
          </div>
        </div>
        {/* Right — rail cards */}
        <div className="min-h-0 space-y-4 overflow-hidden border-t border-border bg-secondary/30 p-6 lg:border-l lg:border-t-0">
          <div className="h-36 w-full animate-pulse bg-muted" />
          <div className="h-44 w-full animate-pulse bg-muted" />
          <div className="h-20 w-full animate-pulse bg-muted" />
          <div className="h-52 w-full animate-pulse bg-muted" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// NoticesCard — MOM (2026-09-03) steps 4 & 5. The automated notices HR sends
// after a decision: REGRET LETTER (rejected) or INTERVIEW INVITATION /
// SKILLS-EXAM NOTICE (shortlisted). Each send fans out to email + an
// in-app record; email_logs is the audit source rendered back as sent chips.
// The system's involvement ENDS at the send — succeeding steps are
// face-to-face, coordinated offline by HR.
// ============================================================================

type NoticeType = "regret" | "interview" | "skills_exam";

type SentNotice = {
  id: number;
  type: NoticeType;
  subject: string;
  status: string;
  to: string;
  sentAt: string;
};

const NOTICE_META: Record<NoticeType, { label: string }> = {
  regret: { label: "Regret letter" },
  interview: { label: "Interview invitation" },
  skills_exam: { label: "Skills-exam notice" },
};

function NoticesCard({
  appId,
  status,
  hasEmail,
}: {
  appId: number;
  status: string;
  hasEmail: boolean;
}) {
  const isShortlisted = status.toUpperCase() === "SHORTLISTED";
  const [notices, setNotices] = useState<SentNotice[] | null>(null);
  const [sending, setSending] = useState<NoticeType | null>(null);
  // Which notice dialog is open — schedule form for interview/skills_exam,
  // simple confirmation for regret.
  const [openNotice, setOpenNotice] = useState<Exclude<NoticeType, "regret"> | null>(null);
  const [confirmRegret, setConfirmRegret] = useState(false);
  const [form, setForm] = useState({ date: "", time: "", venue: "", contact: "", notes: "", examType: "" });

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ notices: SentNotice[] }>(
        `/api/evaluator/applications/${appId}/notice`
      );
      setNotices(data.notices ?? []);
    } catch {
      setNotices([]);
    }
  }, [appId]);

  useEffect(() => {
    if (appId) load();
  }, [appId, load]);

  async function sendNotice(type: NoticeType) {
    setSending(type);
    try {
      const body =
        type === "regret"
          ? { type }
          : {
              type,
              date: form.date,
              time: form.time,
              venue: form.venue,
              contact: form.contact || undefined,
              notes: form.notes || undefined,
              examType: form.examType || undefined,
            };
      const res = await apiFetch<{ email: { status: string } }>(
        `/api/evaluator/applications/${appId}/notice`,
        { method: "POST", body: JSON.stringify(body) }
      );
      toast.success(
        type === "regret"
          ? "Regret letter sent to the applicant."
          : type === "interview"
          ? "Interview invitation sent to the applicant."
          : "Skills-examination notice sent to the applicant.",
        {
          description:
            res.email.status === "mock"
              ? "Development mode: the email was logged, not delivered."
              : res.email.status === "sent"
              ? `Delivered to ${hasEmail ? "the applicant's email on record" : "email"}.`
              : res.email.status === "skipped"
              ? "No valid email on record — the attempt was logged."
              : "Email provider reported a failure — see the Email log.",
        }
      );
      setOpenNotice(null);
      setConfirmRegret(false);
      setForm({ date: "", time: "", venue: "", contact: "", notes: "", examType: "" });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send notice");
    } finally {
      setSending(null);
    }
  }

  const scheduleInvalid =
    !form.date.trim() || !form.time.trim() || !form.venue.trim();

  return (
    <section className="border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium tracking-tight text-foreground">
          Notices
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {isShortlisted
            ? "Steps 5 — invite the shortlisted applicant; the rest is face-to-face"
            : "Step 4 — automated regret letter for declined / not-shortlisted applicants"}
        </p>
      </div>
      <div className="space-y-3 p-4">
        {/* Already-sent chips (audit-backed, from email_logs) */}
        {notices && notices.length > 0 && (
          <ul className="space-y-1.5">
            {notices.map((n) => (
              <li
                key={n.id}
                className="flex items-center gap-2 border border-border bg-secondary/60 px-3 py-2 text-xs"
              >
                <Send className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="font-medium text-foreground">
                  {NOTICE_META[n.type].label}
                </span>
                <span
                  className={`ml-auto shrink-0 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    n.status === "sent" || n.status === "mock"
                      ? "bg-success/10 text-success-ink"
                      : "bg-destructive/10 text-danger-ink"
                  }`}
                >
                  {n.status}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {formatDate(n.sentAt)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {isShortlisted ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              onClick={() => setOpenNotice("interview")}
              disabled={sending !== null}
              className="w-full"
            >
              <CalendarClock className="mr-2 size-4" />
              Send Interview Invitation
            </Button>
            <Button
              variant="outline"
              onClick={() => setOpenNotice("skills_exam")}
              disabled={sending !== null}
              className="w-full"
            >
              <ClipboardList className="mr-2 size-4" />
              Send Skills-Exam Notice
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={() => setConfirmRegret(true)}
            disabled={sending !== null}
            className="w-full"
          >
            <MailWarning className="mr-2 size-4" />
            Send Regret Letter
          </Button>
        )}
        {!hasEmail && (
          <p className="text-xs text-muted-foreground">
            No email on record — the send attempt is logged and HR follows up
            directly.
          </p>
        )}
      </div>

      {/* Schedule dialog — interview / skills-exam */}
      <Dialog open={openNotice !== null} onOpenChange={(v) => !v && setOpenNotice(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {openNotice === "interview" ? "Interview invitation" : "Skills-examination notice"}
            </DialogTitle>
            <DialogDescription>
              The applicant is emailed the schedule below and it is recorded on
              the application. Nothing is scheduled in-system — the session
              itself is face-to-face.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            {openNotice === "skills_exam" && (
              <div>
                <Label htmlFor="notice-exam" className="text-sm font-semibold text-foreground">
                  Examination type
                </Label>
                <Input
                  id="notice-exam"
                  value={form.examType}
                  onChange={(e) => setForm((p) => ({ ...p, examType: e.target.value }))}
                  placeholder="e.g. Trade/skills test, encoding exam…"
                  className="mt-1.5 text-sm"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="notice-date" className="text-sm font-semibold text-foreground">
                  Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="notice-date"
                  value={form.date}
                  onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                  placeholder="September 15, 2026"
                  className="mt-1.5 text-sm"
                />
              </div>
              <div>
                <Label htmlFor="notice-time" className="text-sm font-semibold text-foreground">
                  Time <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="notice-time"
                  value={form.time}
                  onChange={(e) => setForm((p) => ({ ...p, time: e.target.value }))}
                  placeholder="10:00 AM"
                  className="mt-1.5 text-sm"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="notice-venue" className="text-sm font-semibold text-foreground">
                Venue <span className="text-destructive">*</span>
              </Label>
              <Input
                id="notice-venue"
                value={form.venue}
                onChange={(e) => setForm((p) => ({ ...p, venue: e.target.value }))}
                placeholder="MIRDC Building, Gen. Santos Ave., Bicutan, Taguig"
                className="mt-1.5 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="notice-contact" className="text-sm font-semibold text-foreground">
                HR contact <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="notice-contact"
                value={form.contact}
                onChange={(e) => setForm((p) => ({ ...p, contact: e.target.value }))}
                placeholder="Name / phone for questions or rescheduling"
                className="mt-1.5 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="notice-notes" className="text-sm font-semibold text-foreground">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="notice-notes"
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Anything else the applicant should prepare…"
                className="mt-1.5 min-h-16 text-sm"
              />
            </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="ghost" onClick={() => setOpenNotice(null)} disabled={sending !== null}>
              Cancel
            </Button>
            <Button
              onClick={() => openNotice && sendNotice(openNotice)}
              disabled={sending !== null || scheduleInvalid}
              className="font-semibold"
            >
              {sending !== null && <Loader2 className="mr-2 size-4 animate-spin" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regret-letter confirmation */}
      <Dialog open={confirmRegret} onOpenChange={setConfirmRegret}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="shrink-0">
            <DialogTitle>Send the regret letter?</DialogTitle>
            <DialogDescription>
              The automated regret letter is emailed to the applicant and the
              send is logged. Re-running it is blocked after a successful send.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="shrink-0">
            <Button variant="ghost" onClick={() => setConfirmRegret(false)} disabled={sending !== null}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => sendNotice("regret")}
              disabled={sending !== null}
              className="font-semibold"
            >
              {sending !== null && <Loader2 className="mr-2 size-4 animate-spin" />}
              Send regret letter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ============================================================================
// DirectEmailCard — free-form follow-up email composed by HR/evaluator and
// addressed to the applicant on record. Unlike the automated MOM notices this
// is NOT tied to a decision or stage: document requests, clarifications,
// follow-up details — anything the recruitment team needs to convey. The
// recipient is always the server-resolved applicant address; every send is
// logged to email_logs (relatedType "application-direct") and audited.
// ============================================================================

type DirectEmailRow = {
  id: number;
  subject: string;
  status: string;
  to: string;
  createdAt: string;
  /** JSON metadata from email_logs: [{ name, bytes }] — or null. */
  attachments?: string | null;
};

// Attachment policy — mirrors the server's validation exactly.
const MAX_FILES = 3;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB per file
const MAX_TOTAL_BYTES = 10 * 1024 * 1024; // 10 MB per email
const ALLOWED_EXT = [
  "pdf", "doc", "docx", "xls", "xlsx", "csv", "txt",
  "png", "jpg", "jpeg", "webp",
];
const ACCEPT_ATTR = ALLOWED_EXT.map((e) => `.${e}`).join(",");

function attachmentCount(meta?: string | null): number {
  if (!meta) return 0;
  try {
    const v = JSON.parse(meta);
    return Array.isArray(v) ? v.length : 0;
  } catch {
    return 0;
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function DirectEmailCard({
  appId,
  email,
  hasEmail,
}: {
  appId: number;
  email: string | null;
  hasEmail: boolean;
}) {
  const [rows, setRows] = useState<DirectEmailRow[] | null>(null);
  const [composing, setComposing] = useState(false);
  const [sending, setSending] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ directEmails: DirectEmailRow[] }>(
        `/api/evaluator/applications/${appId}/email`
      );
      setRows(data.directEmails ?? []);
    } catch {
      setRows([]);
    }
  }, [appId]);

  useEffect(() => {
    if (appId) load();
  }, [appId, load]);

  const messageInvalid = !message.trim();

  function addFiles(incoming: FileList | null) {
    if (!incoming || incoming.length === 0) return;
    const next = [...files];
    const errs: string[] = [];
    for (const f of Array.from(incoming)) {
      if (next.length >= MAX_FILES) {
        errs.push(`Maximum ${MAX_FILES} attachments per email.`);
        break;
      }
      const ext = f.name.includes(".") ? (f.name.split(".").pop() ?? "").toLowerCase() : "";
      if (!ext || !ALLOWED_EXT.includes(ext)) {
        errs.push(`"${f.name}" — file type not allowed.`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        errs.push(`"${f.name}" is over 5 MB.`);
        continue;
      }
      const total = next.reduce((s, x) => s + x.size, 0) + f.size;
      if (total > MAX_TOTAL_BYTES) {
        errs.push("Attachments exceed the 10 MB total per email.");
        continue;
      }
      next.push(f);
    }
    setFiles(next);
    setFileError(errs.length ? errs[0] : null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setFileError(null);
  }

  async function sendDirectEmail() {
    setSending(true);
    try {
      // Always multipart — one code path for text-only and attached sends.
      const fd = new FormData();
      if (subject.trim()) fd.append("subject", subject.trim());
      fd.append("message", message.trim());
      for (const f of files) fd.append("attachments", f, f.name);

      const res = await apiFetch<{ email: { status: string; to?: string; error?: string } }>(
        `/api/evaluator/applications/${appId}/email`,
        { method: "POST", body: fd }
      );
      toast.success("Email sent to the applicant.", {
        description:
          res.email.status === "sent"
            ? `Delivered to ${res.email.to ?? "the applicant's email on record"}${files.length ? ` with ${files.length} attachment${files.length === 1 ? "" : "s"}` : ""}.`
            : res.email.status === "mock"
            ? "Development mode: the email was logged, not delivered."
            : res.email.status === "skipped"
            ? "No valid email on record — the attempt was logged."
            : "Email provider reported a failure — see the Email log.",
      });
      setComposing(false);
      setSubject("");
      setMessage("");
      setFiles([]);
      setFileError(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send email");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium tracking-tight text-foreground">
          Direct Email
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Compose a follow-up to the applicant as the recruitment team — any
          stage, logged on this application
        </p>
      </div>
      <div className="space-y-3 p-4">
        {/* Already-sent chips (audit-backed, from email_logs) */}
        {rows && rows.length > 0 && (
          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-2 border border-border bg-secondary/60 px-3 py-2 text-xs"
              >
                <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground" title={r.subject}>
                  {r.subject}
                </span>
                {attachmentCount(r.attachments) > 0 && (
                  <span
                    className="flex shrink-0 items-center gap-0.5 text-muted-foreground"
                    title={`${attachmentCount(r.attachments)} attachment${attachmentCount(r.attachments) === 1 ? "" : "s"}`}
                  >
                    <Paperclip className="size-3" />
                    {attachmentCount(r.attachments)}
                  </span>
                )}
                <span
                  className={`ml-auto shrink-0 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    r.status === "sent" || r.status === "mock"
                      ? "bg-success/10 text-success-ink"
                      : "bg-destructive/10 text-danger-ink"
                  }`}
                >
                  {r.status}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {formatDate(r.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <Button
          variant="outline"
          onClick={() => setComposing(true)}
          disabled={sending}
          className="w-full"
        >
          <Mail className="mr-2 size-4" />
          Compose Email
        </Button>
        {!hasEmail && (
          <p className="text-xs text-muted-foreground">
            No email on record — the send attempt is logged and HR follows up
            directly.
          </p>
        )}
      </div>

      {/* Compose dialog */}
      <Dialog open={composing} onOpenChange={(v) => !v && !sending && setComposing(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="shrink-0">
            <DialogTitle>Direct email to the applicant</DialogTitle>
            <DialogDescription>
              Sent from the recruitment team and logged on this application.
              The recipient is the applicant&apos;s email on record
              {hasEmail && email ? (
                <>
                  {" — "}
                  <span className="font-medium text-foreground">{email}</span>
                </>
              ) : (
                " (none found — the attempt will be logged only)"
              )}
              .
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div>
              <Label htmlFor="direct-subject" className="text-sm font-semibold text-foreground">
                Subject{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="direct-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Defaults to “Update on your application”…"
                maxLength={200}
                className="mt-1.5 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="direct-message" className="text-sm font-semibold text-foreground">
                Message <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="direct-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. Kindly bring an original copy of your training certificate when you come in…"
                maxLength={5000}
                rows={6}
                className="mt-1.5 min-h-32 text-sm"
              />
              <p className="mt-1 text-right text-xs tabular-nums text-muted-foreground">
                {message.length}/5000
              </p>
            </div>
            {/* Optional attachments — validated client-side, re-validated
                server-side. Only metadata reaches email_logs. */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPT_ATTR}
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
                aria-label="Attach files"
              />
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || files.length >= MAX_FILES}
                  className="h-8"
                >
                  <Paperclip className="mr-1.5 size-3.5" />
                  Attach files
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  optional · max {MAX_FILES} files · 5 MB each · 10 MB total
                </span>
              </div>
              {fileError && (
                <p className="mt-1.5 text-xs font-medium text-danger-ink" role="alert">
                  {fileError}
                </p>
              )}
              {files.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {files.map((f, i) => (
                    <li
                      key={`${f.name}-${i}`}
                      className="flex items-center gap-2 border border-border bg-secondary/60 px-2.5 py-1.5 text-xs"
                    >
                      <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground" title={f.name}>
                        {f.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatBytes(f.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        disabled={sending}
                        aria-label={`Remove ${f.name}`}
                        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Allowed: PDF, Word, Excel, CSV, TXT, PNG/JPG/WebP images.
              </p>
            </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button
              variant="ghost"
              onClick={() => setComposing(false)}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button
              onClick={sendDirectEmail}
              disabled={sending || messageInvalid || !!fileError}
              className="font-semibold"
            >
              {sending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
