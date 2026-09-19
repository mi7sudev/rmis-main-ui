"use client";

// ============================================================================
// RMIS 2.0 — Candidate Quick-View Modal
// A quiet centered modal that opens when a candidate row is clicked in the
// Candidate Registry ("03 · Candidates"). Replaces the former right-side
// preview panel / edge sheet with a single dialog experience on ALL viewports.
//
// Shell: shadcn Dialog (flat panel, hairline border), deliberately WIDER than
// the default (sm:max-w-2xl) so the quick-view sections breathe — Contact +
// Pipeline sit side-by-side on sm+, and the education / document ledgers
// render at full width. Minimalist staff treatment: micro-label section
// headings, flat hairline ledgers, token colours only — no gold kickers, no
// momentum sweeps, no staggered entrances.
//
// Fetches `GET /api/admin/applicants/:id` when an applicantId is provided.
// Shows: identity header (monogram avatar + name + #ID + profile-complete
// chip), contact links, a horizontal mini-pipeline dot timeline derived from
// the applicant's applications[], the first 2 education entries, and a
// document list. Footer button → full candidate detail view.
// ============================================================================

import { useEffect, useState } from "react";
import { useNav } from "@/components/nav-provider";
import { apiFetch, fullName } from "@/lib/client";
import { humanizeName, humanizeTitle } from "@/lib/humanize";
import { Skeleton } from "@/components/primitives/workspace";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Mail,
  Phone,
  FileText,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
} from "lucide-react";
import { stageForStatus, isInReviewStatus } from "@/lib/status";
import { renderEducation } from "@/components/views/evaluator/types";
import {
  CATEGORY_LABEL,
  DOC_STATUS_META,
  formatFileSize,
  type CharacterReference,
} from "@/components/views/profile/types";

// ---------- Types — shape returned by GET /api/admin/applicants/:id ----------
type ApplicantDocument = {
  id: string;
  originalName: string;
  fileName: string;
  filePath: string;
  category: string;
  status: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

type ApplicationHistoryItem = {
  id: number;
  status: string | null;
  dateApplied: Date | null;
  jobId: number | null;
  positionTitle: string | null;
};

// Humanize ALL-CAPS DB strings inside a record before the shared snapshot
// renderer displays them (degrees, schools…). humanizeTitle passes
// mixed-case through; short codes (N/A, PRC, II) and letter-less date
// strings stay exactly as stored.
function humanizeRecord(rec: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    out[k] =
      typeof v === "string" && v.length >= 4 && /[A-Za-z]/.test(v)
        ? humanizeTitle(v)
        : v;
  }
  return out;
}

type ApplicantDetail = {
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
  zipCode: string | null;
  isProfileComplete: boolean;
  educations: Record<string, unknown>[];
  workExperiences: Record<string, unknown>[];
  trainings: Record<string, unknown>[];
  eligibilities: Record<string, unknown>[];
  awards: Record<string, unknown>[];
  characterReferences: CharacterReference[] | null;
  documents: ApplicantDocument[];
  applications: ApplicationHistoryItem[];
};

export type CandidateModalProps = {
  applicantId: number | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

// ---------- Mini-pipeline stage order (modal-specific) -----------------------
// REVISED WORKFLOW: Submitted → Review → Shortlisted — mirrors the canonical
// applicant journey (tracking-timeline journeyTrackingSteps). "Review" is
// reached once an evaluator has EXPLICITLY taken the application up (status
// "Under Review" — the applicant is emailed at that moment); the shortlist
// decision is the FINAL in-system node, everything after it happens
// face-to-face (offline). Rejected applications stay pinned at "Submitted"
// — the status chip carries the negative tone.
const MODAL_STAGES: { key: string; label: string }[] = [
  { key: "Applied", label: "Submitted" },
  { key: "Review", label: "Review" },
  { key: "Shortlisted", label: "Shortlisted" },
];

export function CandidateModal({
  applicantId,
  open,
  onOpenChange,
}: CandidateModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Wider-than-default dialog (sm:max-w-3xl vs sm:max-w-lg) so the
          quick-view content fits comfortably; flush p-0/gap-0 — the header,
          scroll body and footer manage their own padding + hairlines. */}
      <DialogContent
        aria-describedby={undefined}
        className="gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <ModalBody
          applicantId={applicantId}
          open={open}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Modal body — handles data fetching and layout.
// ============================================================================
function ModalBody({
  applicantId,
  open,
  onClose,
}: {
  applicantId: number | null;
  open: boolean;
  onClose: () => void;
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
      try {
        const res = await apiFetch<ApplicantDetail>(
          `/api/admin/applicants/${applicantId}`,
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

  // Defensive: no applicant selected (shouldn't happen — modal opens on click).
  if (applicantId == null) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mb-3 grid size-12 place-items-center bg-muted text-muted-foreground">
          <Mail className="size-5" />
        </div>
        <DialogTitle className="text-sm font-semibold tracking-tight text-foreground">
          Select a candidate to preview
        </DialogTitle>
      </div>
    );
  }

  if (loading && !data) {
    return <ModalSkeleton />;
  }

  if (error || !data) {
    return (
      <ModalShell>
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
          <AlertCircle className="mb-3 size-8 text-muted-foreground/50" />
          <DialogTitle className="text-sm font-semibold tracking-tight text-foreground">
            Unable to load profile
          </DialogTitle>
          <DialogDescription className="mt-1 max-w-[16rem] text-xs">
            {error || "Applicant not found"}
          </DialogDescription>
        </div>
      </ModalShell>
    );
  }

  return <ModalLoaded data={data} onClose={onClose} />;
}

// ============================================================================
// Loaded modal content — the actual quick-view layout
// ============================================================================
function ModalLoaded({
  data,
  onClose,
}: {
  data: ApplicantDetail;
  onClose: () => void;
}) {
  const { navigate } = useNav();
  const name = humanizeName(fullName(data) || "Unnamed Applicant");
  const initials =
    ((data.firstName?.[0] || "") + (data.lastName?.[0] || "")).toUpperCase() ||
    "?";
  const phone = data.contactNumber || data.mobileNumber;
  const email = data.emailAddress;

  // Compute the highest stage reached across the applicant's applications.
  const reachedStageIndex = computeHighestStage(data.applications);

  // First 2 educations; "+N more" link to detail view.
  const topEducations = data.educations.slice(0, 2);
  const moreEducationCount = Math.max(0, data.educations.length - 2);

  return (
    <ModalShell>
      {/* Header — identity (quiet monogram, name, #ID, completeness chip) */}
      <div className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4">
        <Avatar className="size-12 shrink-0">
          <AvatarFallback className="bg-muted text-sm font-semibold text-foreground/70">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 pr-8">
          <DialogTitle className="truncate text-base font-medium tracking-tight text-foreground">
            {name}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">Applicant #{data.id}</p>
          <div className="mt-1.5">
            {data.isProfileComplete ? (
              <span className="inline-flex items-center gap-1 border border-success/40 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success-ink">
                <CheckCircle2 className="size-3" /> Profile complete
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-danger-ink">
                <AlertCircle className="size-3" /> Incomplete
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Body — scrollable. The wider shell lets Contact + Pipeline sit
          side-by-side on sm+ (stacked on mobile), with the education and
          document ledgers spanning the full width below. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Contact + Pipeline — two-up on sm+, hairline-parted */}
        <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x sm:divide-border">
          {/* Contact */}
          <div className="border-b border-border px-5 py-4 sm:border-b-0">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Contact
            </p>
            <div className="mt-2 space-y-1.5">
              {email && (
                <a
                  href={`mailto:${email}`}
                  className="flex items-center gap-2 text-sm text-foreground hover:underline underline-offset-2"
                >
                  <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{email}</span>
                </a>
              )}
              {phone && (
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <Phone className="size-3.5 shrink-0 text-muted-foreground" />
                  <span>{phone}</span>
                </div>
              )}
              {!email && !phone && (
                <p className="text-xs italic text-muted-foreground">
                  No contact details
                </p>
              )}
            </div>
          </div>
          {/* Mini pipeline */}
          <div className="px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Pipeline progress
            </p>
            <MiniPipeline
              reachedIndex={reachedStageIndex}
              applications={data.applications}
            />
          </div>
        </div>

        {/* Education */}
        <div className="border-t border-border px-5 py-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Education
            </p>
            <span className="text-xs tabular-nums text-muted-foreground">
              {data.educations.length} entr
              {data.educations.length === 1 ? "y" : "ies"}
            </span>
          </div>
          {topEducations.length === 0 ? (
            <p className="mt-2 text-xs italic text-muted-foreground">
              No education records
            </p>
          ) : (
            /* ONE continuous ledger container — hairline-parted entry rows,
               no per-entry boxes, no staggered entrances. */
            <div className="mt-2 divide-y divide-border border border-border">
              {topEducations.map((edu, i) => (
                <div key={i} className="px-3 py-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Entry {i + 1}
                  </p>
                  <dl className="mt-1">
                    {renderEducation(humanizeRecord(edu))}
                  </dl>
                </div>
              ))}
              {moreEducationCount > 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  +{moreEducationCount} more entr
                  {moreEducationCount === 1 ? "y" : "ies"} — view full profile
                </p>
              )}
            </div>
          )}
        </div>

        {/* Documents */}
        <div className="border-t border-border px-5 py-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Documents
            </p>
            <span className="text-xs tabular-nums text-muted-foreground">
              {data.documents.length} file
              {data.documents.length === 1 ? "" : "s"}
            </span>
          </div>
          {data.documents.length === 0 ? (
            <p className="mt-2 text-xs italic text-muted-foreground">
              No documents uploaded
            </p>
          ) : (
            /* ONE continuous ledger container — hairline-parted document rows. */
            <ul className="mt-2 divide-y divide-border border border-border">
              {data.documents.map((d) => (
                <DocumentRow key={d.id} doc={d} />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Footer — quiet hint (left) + primary action (right). */}
      <div className="flex shrink-0 flex-col gap-2 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Quick view · open the full profile for evaluation tools
        </p>
        <Button
          size="sm"
          onClick={() => {
            onClose();
            navigate("candidate", { id: String(data.id) });
          }}
        >
          View full profile
          <ArrowUpRight className="size-4" />
        </Button>
      </div>
    </ModalShell>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

// The modal content is a column: fixed header / scrollable body / fixed
// footer. DialogContent already clamps to max-h-[calc(100vh-2rem)].
function ModalShell({ children }: { children: React.ReactNode }) {
  return <div className="flex max-h-[calc(100vh-2rem)] min-h-0 flex-col overflow-hidden">{children}</div>;
}

function ModalSkeleton() {
  return (
    <ModalShell>
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <Skeleton className="size-12" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-28" />
        </div>
      </div>
      <div className="flex-1 space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <div className="divide-y divide-border border border-border">
            <div className="px-3 py-2.5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="mt-2 h-3 w-3/4" />
            </div>
            <div className="px-3 py-2.5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="mt-2 h-3 w-2/3" />
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <div className="divide-y divide-border border border-border">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2.5 px-2.5 py-2.5">
                <Skeleton className="size-8" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-border p-4">
        <Skeleton className="h-8 w-full" />
      </div>
    </ModalShell>
  );
}

// Mini horizontal dot timeline. 3 stages, fill up to reachedIndex.
function MiniPipeline({
  reachedIndex,
  applications,
}: {
  reachedIndex: number;
  applications: ApplicationHistoryItem[];
}) {
  // When the applicant has no applications, show all dots as muted.
  const hasApplications = applications.length > 0;

  return (
    <div className="mt-3">
      <ol className="flex items-center">
        {MODAL_STAGES.map((stage, i) => {
          const filled = hasApplications && i <= reachedIndex;
          return (
            <li
              key={stage.key}
              className="flex flex-1 flex-col items-center text-center"
            >
              <div className="flex w-full items-center">
                {/* Connector line — left half */}
                {i > 0 && (
                  <span
                    className={`h-px flex-1 ${
                      hasApplications && i <= reachedIndex
                        ? "bg-primary/40"
                        : "bg-border"
                    }`}
                  />
                )}
                {/* Step marker — square block, filled when reached */}
                <span
                  className={`grid size-5 shrink-0 place-items-center border ${
                    filled
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {filled && <CheckCircle2 className="size-3" />}
                </span>
                {/* Connector line — right half */}
                {i < MODAL_STAGES.length - 1 && (
                  <span
                    className={`h-px flex-1 ${
                      hasApplications && i < reachedIndex
                        ? "bg-primary/40"
                        : "bg-border"
                    }`}
                  />
                )}
              </div>
              <span
                className={`mt-1.5 text-[10px] leading-tight ${
                  filled ? "font-medium text-foreground" : "text-muted-foreground"
                }`}
              >
                {stage.label}
              </span>
            </li>
          );
        })}
      </ol>
      {applications.length === 0 && (
        <p className="mt-2 text-xs italic text-muted-foreground">
          No applications yet
        </p>
      )}
    </div>
  );
}

function DocumentRow({ doc }: { doc: ApplicantDocument }) {
  const statusMeta = DOC_STATUS_META[doc.status] || {
    label: doc.status || "Unknown",
    color: "text-muted-foreground",
    bg: "bg-secondary",
  };
  const catLabel = CATEGORY_LABEL[doc.category] || doc.category;
  return (
    <li>
      <a
        href={`/api/files/${doc.filePath}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2.5 px-2.5 py-2.5 transition-colors hover:bg-accent/40"
      >
        <span className="grid size-8 shrink-0 place-items-center bg-muted">
          <FileText className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">
            {doc.originalName}
          </span>
          <span className="mt-0.5 flex items-center gap-x-1.5 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">{catLabel}</span>
            <span aria-hidden className="select-none text-muted-foreground/50">
              ·
            </span>
            <span className="shrink-0 tabular-nums">{formatFileSize(doc.size)}</span>
          </span>
        </span>
        <span
          className={`inline-flex shrink-0 items-center border px-1.5 py-0.5 text-[10px] font-medium ${docStatusChipCls(doc.status)}`}
        >
          {statusMeta.label}
        </span>
        <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
      </a>
    </li>
  );
}

// ============================================================================
// Helpers
// ============================================================================

// ---- Local doc-status chip tone (mode-tuned; label still from DOC_STATUS_META)
function docStatusChipCls(status: string): string {
  const s = String(status || "").toUpperCase();
  if (s === "FAILED")
    return "border-destructive/40 bg-destructive/10 text-danger-ink";
  if (s === "EXTRACTED")
    return "border-success/40 bg-success/10 text-success-ink";
  if (s === "PROCESSING" || s === "PARTIALLY_EXTRACTED" || s === "NEEDS_REVIEW")
    return "border-warning/40 bg-warning/10 text-warning-ink";
  return "border-border bg-secondary text-muted-foreground";
}

// Compute the index of the highest stage reached across all of the
// applicant's applications. Returns -1 when there are no applications.
function computeHighestStage(applications: ApplicationHistoryItem[]): number {
  if (!applications || applications.length === 0) return -1;
  let max = -1;
  for (const app of applications) {
    if (!app.status) continue;
    const stageKey = stageForStatus(app.status);
    // Positive terminals (SHORTLISTED / SELECTED / APPROVED / INTERVIEW) all
    // map to the "Shortlisted" stage — the final node — so they fill the
    // entire timeline; rejected applications stay pinned at "Submitted".
    if (stageKey === "Shortlisted") {
      return MODAL_STAGES.length - 1;
    }
    if (stageKey === "Rejected") {
      continue;
    }
    // "Applied" stage bucket — distinguish merely-submitted (Applied /
    // Pending / Draft) from explicitly taken up for review (Under Review
    // plus the legacy mid-process family) via the shared vocabulary.
    const idx = isInReviewStatus(app.status) ? 1 : 0;
    if (idx > max) max = idx;
  }
  return max;
}
