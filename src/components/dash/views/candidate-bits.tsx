"use client";

// ============================================================================
// Atlas dash rebuild — shared bits for the candidate surfaces (5-c).
//
// Consumed by views/candidates.tsx (registry + quick-view modal) and
// views/candidate.tsx (dossier). Self-contained by design: endpoint payload
// shapes, snapshot renderers and doc-status metadata are COPIED from the
// legacy candidates workspace (behavior reference only — never imported).
// Presentation is composed from the kit primitives + tokens only.
// ============================================================================

import * as React from "react";
import { ExternalLink, FileText, TriangleAlert, RotateCcw } from "lucide-react";
import { formatDate } from "@/lib/client";
import { humanizeTitle } from "@/lib/humanize";
import {
  getEligibilityFieldSpec,
  isCustomEligibilityTitle,
} from "@/lib/csc-requirements";
import type { RequirementsReport } from "@/lib/requirements";
import type { Tone } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { EmptyState, Pill } from "@/components/dash/kit";
import { cn } from "@/lib/utils";

// ============================================================================
// Types — endpoint payload contracts (copied from the legacy surfaces)
// ============================================================================

/** Row of GET /api/admin/applicants (server-paginated registry). */
export type ApplicantRow = {
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

/** Item of GET /api/evaluator/queue (kanban board source). */
export type QueueItem = {
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
  /** Compact requirements-match verdict from the queue endpoint. */
  match?: { verdict: string; metCount: number; requiredCount: number } | null;
  /** Up to two credential tags (education + eligibility) for the card. */
  tags?: string[];
};

export type ApplicantDocument = {
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

export type ApplicationHistoryItem = {
  id: number;
  status: string | null;
  dateApplied: Date | string | null;
  jobId: number | null;
  positionTitle: string | null;
};

export type CharacterReference = {
  name: string;
  title: string;
  company: string;
  companyAddress: string;
  email: string;
  contact: string;
};

/** Shape returned by GET /api/admin/applicants/:id (live profile). */
export type ApplicantDetail = {
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

/** The slices of GET /api/evaluator/applications/:id the dossier consumes. */
export type ApplicationExtras = {
  requirements: RequirementsReport | null;
  statusChanges: { id: string; toStatus: string | null; createdAt: string }[];
};

// ============================================================================
// Small shared helpers
// ============================================================================

/** Atlas pipeline-stage tone: Applied=primary · Under Review=warning ·
 *  Shortlisted=success · Rejected=danger (the DASH-REBUILD-SPEC tone table). */
export function stageTone(stage: string): Tone {
  switch (stage) {
    case "Under Review":
      return "warning";
    case "Shortlisted":
      return "success";
    case "Rejected":
      return "danger";
    default:
      return "primary";
  }
}

/** Humanize ALL-CAPS DB strings inside a snapshot record before the shared
 *  renderers display them (degrees, schools, employers…). humanizeTitle
 *  passes mixed-case through; short codes (N/A, PRC, II) and letter-less
 *  date strings stay exactly as stored. */
export function humanizeRecord(rec: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    out[k] =
      typeof v === "string" && v.length >= 4 && /[A-Za-z]/.test(v)
        ? humanizeTitle(v)
        : v;
  }
  return out;
}

/** "Aug 24" — the stepper's short sub-labels. */
export function shortDate(date: string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Whole days elapsed since an ISO timestamp (null when unusable). */
export function daysSince(date: string | null | undefined): number | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}

// ---- Document metadata (copied contract from the profile surface) ----------

export const CATEGORY_LABEL: Record<string, string> = {
  PDS: "PDS (Personal Data Sheet)",
  PROFILE_PICTURE: "Profile Picture (1×1)",
  RESUME: "Resume / CV",
  EDUCATION: "Education Certificate",
  WORK_EXPERIENCE: "Work Experience Cert",
  TRAINING: "Training Certificate",
  ELIGIBILITY: "Eligibility Certificate",
  AWARD: "Award / Recognition",
  COE: "Certificate of Employment",
  PERFORMANCE_EVALUATION: "Performance Evaluation",
  SUPPORTING: "Other Supporting Doc",
};

export const DOC_STATUS_META: Record<string, { label: string }> = {
  UPLOADED: { label: "Uploaded" },
  PROCESSING: { label: "Processing" },
  EXTRACTED: { label: "Extracted" },
  PARTIALLY_EXTRACTED: { label: "Partially Extracted" },
  FAILED: { label: "Failed" },
  NEEDS_REVIEW: { label: "Needs Review" },
};

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Doc-status chip tone (mode-tuned; label still from DOC_STATUS_META). */
export function docStatusTone(status: string): Tone {
  const s = String(status || "").toUpperCase();
  if (s === "FAILED") return "danger";
  if (s === "EXTRACTED") return "success";
  if (s === "PROCESSING" || s === "PARTIALLY_EXTRACTED" || s === "NEEDS_REVIEW")
    return "warning";
  return "neutral";
}

// ============================================================================
// Atlas FieldRow — one label/value row of a snapshot ledger
// ============================================================================

export function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="-mx-2 flex flex-col gap-0.5 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/30 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:w-44">
        {label}
      </dt>
      <dd className="min-w-0 whitespace-pre-line break-words text-sm font-medium text-foreground">
        {value ? (
          value
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </dd>
    </div>
  );
}

// ============================================================================
// Snapshot renderers — the read-only PDS record layouts (copied field specs
// from the legacy evaluator types; rendered through the Atlas FieldRow)
// ============================================================================

export function renderEducation(e: Record<string, unknown>) {
  const rows: [string, unknown][] = [
    ["Level", e.educationLevel],
    ["Degree", e.degree],
    ["Course", e.course],
    ["Specify Others", e.specifyOthers],
    ["School", e.schoolName],
    ["Year Graduated", e.yearGraduated],
    ["Units Earned", e.unitsEarned],
    ["Ongoing", e.ongoing ? "Yes" : null],
    ["Highest", e.isHighestEducation ? "Yes" : null],
  ];
  return rows.map(([l, v]) => <FieldRow key={l} label={l} value={v as string} />);
}

export function renderExperience(e: Record<string, unknown>) {
  const rows: [string, unknown][] = [
    ["Position", e.positionTitle],
    ["Employer", e.employerName],
    ["Employer Address", e.employerAddress],
    ["Status", e.statusOfEmployment],
    ["From", e.inclusiveDateFrom ? formatDate(e.inclusiveDateFrom as string) : null],
    ["To", e.inclusiveDateTo ? formatDate(e.inclusiveDateTo as string) : null],
    ["Present Work", e.isPresentWork ? "Yes" : null],
    ["Govt Service", e.isGovtService ? "Yes" : "No"],
    ["Monthly Salary", e.monthlySalary ? `₱${Number(e.monthlySalary).toLocaleString()}` : null],
    ["Years", e.yearDecimal ? `${e.yearDecimal} yrs` : null],
    ["Reason for Leaving", e.reasonForLeaving],
  ];
  return rows.map(([l, v]) => <FieldRow key={l} label={l} value={v as string} />);
}

export function renderTraining(t: Record<string, unknown>) {
  const rows: [string, unknown][] = [
    ["Title", t.titleOfTraining],
    ["Type", t.typeOfTraining],
    ["Specify", t.specifyTraining],
    ["From", t.inclusiveDateFrom ? formatDate(t.inclusiveDateFrom as string) : null],
    ["To", t.inclusiveDateTo ? formatDate(t.inclusiveDateTo as string) : null],
    ["Hours", t.numberHours ? `${t.numberHours} hrs` : null],
    ["Decimal Hours", t.hourDecimal ? `${t.hourDecimal} hrs` : null],
  ];
  return rows.map(([l, v]) => <FieldRow key={l} label={l} value={v as string} />);
}

export function renderEligibility(el: Record<string, unknown>) {
  // Per-type field labels — same spec the applicant form uses (exam-based
  // types show Rating/Exam Date/Exam Place, Bar/Board adds license fields,
  // conferment types show Date/Place of Conferment). Non-applicable fields
  // are hidden entirely instead of rendering as "—". Free-text "Others"
  // entries (custom titles) show only the title plus detail fields that
  // actually carry a value (legacy data) — never empty placeholder rows.
  const custom = isCustomEligibilityTitle(el.eligibilityTitle as string);
  const spec = getEligibilityFieldSpec(el.eligibilityTitle as string);
  const keep = (v: unknown) => (custom ? v != null && v !== "" : true);
  const rows: [string, unknown][] = [["Title", el.eligibilityTitle]];
  if (spec.rating && keep(el.rating))
    rows.push([spec.rating.label, el.rating]);
  if (spec.examDate && keep(el.examDate))
    rows.push([
      spec.examDate.label,
      el.examDate ? formatDate(el.examDate as string) : null,
    ]);
  if (spec.examPlace && keep(el.examPlace))
    rows.push([spec.examPlace.label, el.examPlace]);
  if (spec.licenseNumber && keep(el.licenseNumber))
    rows.push([spec.licenseNumber.label, el.licenseNumber]);
  if (spec.licenseValidity && keep(el.licenseValidity))
    rows.push([
      spec.licenseValidity.label,
      el.licenseValidity ? formatDate(el.licenseValidity as string) : null,
    ]);
  return rows.map(([l, v]) => <FieldRow key={l} label={l} value={v as string} />);
}

export function renderAward(a: Record<string, unknown>) {
  const rows: [string, unknown][] = [
    ["Type", a.recognitionType],
    ["Award Type", a.awardType],
    ["Scope", a.recognitionScope],
    ["Category", a.recognitionCategory],
    ["Subcategory", a.recognitionSubcategory],
    ["Details", a.recognitionDetails],
    ["Provider", a.recognitionProvider],
    ["Date Granted", a.dateGranted ? formatDate(a.dateGranted as string) : null],
    ["Points", a.points],
  ];
  return rows.map(([l, v]) => <FieldRow key={l} label={l} value={v as string} />);
}

// ============================================================================
// DocumentRow — one hairline-ledger document row (quick-view + Documents tab)
// ============================================================================

export function DocumentRow({
  doc,
  showUploaded = false,
  index,
}: {
  doc: ApplicantDocument;
  showUploaded?: boolean;
  index?: number;
}) {
  const meta = DOC_STATUS_META[doc.status];
  const catLabel = CATEGORY_LABEL[doc.category] || doc.category;
  return (
    <li>
      <a
        href={`/api/files/${doc.filePath}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40 sm:px-5"
      >
        {typeof index === "number" ? (
          <span
            aria-hidden
            className="hidden shrink-0 text-xs tabular-nums text-muted-foreground/60 sm:inline"
          >
            {String(index + 1).padStart(2, "0")}
          </span>
        ) : null}
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-black/[0.04]">
          <FileText className="size-4" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">
            {doc.originalName}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">{catLabel}</span>
            <span aria-hidden className="select-none text-muted-foreground/50">·</span>
            <span className="shrink-0 tabular-nums">{formatFileSize(doc.size)}</span>
            {showUploaded ? (
              <>
                <span aria-hidden className="select-none text-muted-foreground/50">·</span>
                <span className="shrink-0">
                  Uploaded <span className="tabular-nums">{formatDate(doc.createdAt)}</span>
                </span>
              </>
            ) : null}
          </span>
        </span>
        <Pill tone={docStatusTone(doc.status)} className="shrink-0">
          {meta?.label ?? doc.status ?? "Unknown"}
        </Pill>
        <ExternalLink className="size-3.5 shrink-0 text-muted-foreground/60" />
      </a>
    </li>
  );
}

// ============================================================================
// LoadError — the shared error state (message + retry) for async surfaces
// ============================================================================

export function LoadError({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <EmptyState
      className={className}
      icon={TriangleAlert}
      title="Something went wrong"
      sub={message}
      action={
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw className="size-3.5" />
          Try again
        </Button>
      }
    />
  );
}

// ============================================================================
// MicroLabel — the kit eyebrow rhythm for in-panel section labels
// ============================================================================

export function MicroLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground", className)}>
      {children}
    </p>
  );
}
