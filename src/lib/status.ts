// ============================================================================
// status.ts — THE application-status vocabulary module (single source of truth).
//
// DEEP MODULE: a lot of behavior behind a small interface. Everything that
// knows what an application status IS lives here — labels, tones, pipeline
// stages, normalization (the DB stores mixed forms: Title Case from the
// production DB + legacy UPPER_CASE values), settable/queriable
// whitelists. Views and routes consume this interface and nothing else.
//
// Why one home: this logic previously existed as 4 drifted copies (a stale
// palette object here, a dead rainbow STATUS_META in lib/client.ts, and an
// inline normalizer+tone map in the recruitment workspace) — fixing a status
// meant hunting every map. Now: fix once, fixed everywhere (locality).
//
// Interface (everything a caller needs):
//   getStatusMeta(status)      → { label, tone }        — display vocabulary
//   stageForStatus(status)     → StageKey               — pipeline grouping
//   isRejectedStatus(status)   → boolean                — negative terminal check
//   TONE_CLASSES[tone]         → { dot, pill, solid }   — rendering classes
//   PIPELINE_STAGES / StageKey                          — canonical pipeline order
//   SETTABLE_STATUSES                                   — writable via API (zod)
//   QUERYABLE_STATUSES                                  — filterable via API (?status=)
// ============================================================================

// ---- Tone — the rendering vocabulary (text + tone, never color-only) ------

export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

export const TONE_CLASSES: Record<Tone, { dot: string; pill: string; solid: string }> = {
  neutral: {
    dot: "bg-muted-foreground",
    pill: "bg-muted text-muted-foreground border-input",
    solid: "bg-accent text-accent-foreground",
  },
  primary: {
    dot: "bg-primary",
    pill: "bg-primary/10 text-info-ink border-primary/40",
    solid: "bg-primary text-white",
  },
  success: {
    dot: "bg-success",
    pill: "bg-success/10 text-success-ink border-success/40",
    solid: "bg-success text-success-foreground",
  },
  warning: {
    dot: "bg-warning",
    pill: "bg-warning/10 text-warning-ink border-warning/40",
    solid: "bg-warning text-warning-foreground",
  },
  danger: {
    dot: "bg-destructive",
    pill: "bg-destructive/10 text-danger-ink border-destructive/40",
    solid: "bg-destructive text-white",
  },
  // Functional info tone — the Accenture bright-blue accent block (--info
  // #0041F0). Distinct from the electric-blue primary: info reads indigo-leaning.
  info: {
    dot: "bg-info-ink",
    pill: "bg-info/10 text-info-ink border-info/50",
    solid: "bg-info text-white",
  },
};

// ---- Implementation: normalization + the label/tone table -----------------

/** Every status this system has ever stored (both stored spellings). */
const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  APPLIED: { label: "Applied", tone: "info" },
  PENDING: { label: "Pending", tone: "warning" },
  // "Under Review" is the ONE in-review label: the EXPLICIT evaluator Review
  // action AND every legacy mid-process spelling (For Evaluation / Screening /
  // Evaluation / Final Review / Evaluated) render under it — distinct from
  // "Applied" (just submitted — no evaluator has picked it up). Unifying the
  // family under a single label+tone keeps HR surfaces unambiguous (there is
  // no user-visible difference between the legacy spellings and the explicit
  // state: both mean an evaluator has the application in review).
  UNDER_REVIEW: { label: "Under Review", tone: "primary" },
  FOR_EVALUATION: { label: "Under Review", tone: "primary" },
  SCREENING: { label: "Under Review", tone: "primary" },
  EVALUATION: { label: "Under Review", tone: "primary" },
  INTERVIEW: { label: "Interview (face-to-face)", tone: "primary" },
  FINAL_REVIEW: { label: "Under Review", tone: "primary" },
  SHORTLISTED: { label: "Shortlisted", tone: "success" },
  SELECTED: { label: "Selected", tone: "success" },
  EVALUATED: { label: "Under Review", tone: "primary" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  DECLINED: { label: "Declined", tone: "danger" },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
  NEEDS_CORRECTION: { label: "Needs Correction", tone: "warning" },
  OPEN: { label: "Open", tone: "success" },
  CLOSED: { label: "Closed", tone: "neutral" },
};

function normalizeStatusKey(status: string): string {
  return String(status ?? "").trim().replace(/\s+/g, "_").toUpperCase();
}

/** Display vocabulary for ANY stored/historical status spelling. */
export function getStatusMeta(status: string): { label: string; tone: Tone } {
  return STATUS_MAP[normalizeStatusKey(status)] ?? { label: status || "Unknown", tone: "neutral" as Tone };
}

/** Negative-terminal check (rejected family). Unknown/withdrawn → false. */
export function isRejectedStatus(status: string | null | undefined): boolean {
  return getStatusMeta(status ?? "").tone === "danger";
}

/**
 * Has the review ACTUALLY been taken up? "Applied"/"Pending"/"Draft" (and
 * empty) mean the application was merely SUBMITTED — no evaluator has started
 * reviewing it, so both portals must show it as "awaiting review", NOT "in
 * review". Exactly the statuses that map to the "Under Review" stage (the
 * explicit pick-up plus the legacy mid-process family) count as in review.
 */
export function isInReviewStatus(status: string | null | undefined): boolean {
  return stageForStatus(status ?? "") === "Under Review";
}

// ---- Applicant-facing journey labels ---------------------------------------

/**
 * The four-word journey vocabulary the APPLICANT surfaces use (home rail,
 * application detail modal): "Submitted" → "In Review" → "Shortlisted", with
 * "Not Selected" for the rejected family. Distinct from getStatusMeta's HR
 * vocabulary — applicants read journey stages, not pipeline internals.
 */
export function currentStageLabel(status: string | null): string {
  if (isRejectedStatus(status ?? "")) return "Not Selected";
  const stage = stageForStatus(status ?? "");
  if (stage === "Shortlisted") return "Shortlisted";
  // "In Review" only once an evaluator has EXPLICITLY taken the application
  // up (Under Review) — a fresh submission is just "Submitted".
  return isInReviewStatus(status ?? "") ? "In Review" : "Submitted";
}

// ---- Recruitment pipeline (canonical order) -------------------------------

// CANONICAL STATUS FORMAT (user-specified): Applied → Under Review →
// Shortlisted or Rejected. "Under Review" (the explicit evaluator pick-up —
// the applicant is emailed at that moment) is its OWN pipeline stage, not a
// sub-state of Applied: fresh submissions wait in "Applied", picked-up
// applications move to "Under Review", and the decision resolves to
// "Shortlisted" or "Rejected".
//
// REVISED WORKFLOW (offline hand-off) still holds: the in-system pipeline
// ENDS at the shortlist/reject decision — every succeeding step happens
// FACE-TO-FACE (coordinated offline by HR). There is no in-system evaluation
// form, interview scheduling, or scoring: those stages do not exist.
export const PIPELINE_STAGES = [
  { key: "Applied", label: "Applied", short: "Applied" },
  { key: "Under Review", label: "Under Review", short: "Under Review" },
  { key: "Shortlisted", label: "Shortlisted", short: "Shortlisted" },
  { key: "Rejected", label: "Rejected", short: "Rejected" },
] as const;

export type StageKey = (typeof PIPELINE_STAGES)[number]["key"];

/** Map an application status (any spelling) to its pipeline stage column. */
export function stageForStatus(status: string): StageKey {
  const key = normalizeStatusKey(status);
  // FRESH SUBMISSION — nobody has picked the application up yet.
  if (
    key === "" ||
    key === "APPLIED" ||
    key === "PENDING" ||
    key === "DRAFT"
  ) {
    return "Applied";
  }
  // EXPLICITLY TAKEN UP — the evaluator Review action (Under Review) plus
  // every legacy mid-process spelling (For Evaluation / Screening / Final
  // Review / Evaluated…) live in their own "Under Review" stage column.
  if (
    key === "UNDER_REVIEW" ||
    key === "FOR_EVALUATION" ||
    key === "SCREENING" ||
    key === "EVALUATION" ||
    key === "EVALUATED" ||
    key === "FINAL_REVIEW"
  ) {
    return "Under Review";
  }
  // Positive outcomes — shortlisted or already past it (face-to-face phase).
  if (
    key === "SHORTLISTED" ||
    key === "INTERVIEW" ||
    key === "SELECTED" ||
    key === "APPROVED"
  ) {
    return "Shortlisted";
  }
  if (key === "REJECTED" || key === "DECLINED" || key === "WITHDRAWN") return "Rejected";
  return "Applied";
}

// ---- API-facing whitelists (what may be written / filtered) ---------------

// REVISED WORKFLOW: "Under Review" (the explicit evaluator Review action —
// emails the applicant) plus the decision (Shortlisted / Rejected) are
// writable. "For Evaluation" and every other legacy mid-process value can no
// longer be SET — legacy rows remain renderable via getStatusMeta (as "Under
// Review", the unified in-review label) and group into the "Under Review"
// pipeline stage, but the decisions a user can record are Under Review /
// Shortlisted / Rejected (reverting a decision sends the application back
// Under Review).
export const SETTABLE_STATUSES = [
  // Legacy UPPER_CASE values (kept for backward compatibility with old data)
  "APPLIED", "SHORTLISTED", "REJECTED", "UNDER_REVIEW",
  // Production values (Title Case — what the DB actually stores)
  "Applied", "Shortlisted", "Rejected", "Under Review",
] as const;

/** Accepted `?status=` filter values on the evaluator queue (both spellings). */
export const QUERYABLE_STATUSES = [
  "APPLIED", "PENDING", "UNDER_REVIEW", "FOR_EVALUATION",
  "SHORTLISTED", "EVALUATED", "APPROVED", "REJECTED",
  "DECLINED", "NEEDS_CORRECTION",
  // Production data uses capitalized labels — include both forms
  "Applied", "Pending", "Under Review", "For Evaluation",
  "Shortlisted", "Evaluated", "Approved", "Rejected",
  "Declined", "Needs Correction",
] as const;
