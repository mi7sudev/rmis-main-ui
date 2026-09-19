"use client";

// ============================================================================
// RequirementsMatchPanel — the requirements verdict for ONE application.
//
// Does the applicant's snapshotted credentials satisfy the specific job's
// CSC qualification standards? Computed server-side (/api/evaluator/
// applications/:id → requirements) and rendered here as a quiet, comparable
// ledger: each standard sits in a REQUIRED line with the applicant's actual
// evidence beside it under an APPLICANT label — the reviewer reads the gap,
// not a wall of raw snapshot data.
//
// LAYOUT NOTE — the panel lives in the narrow decision rail (~380-420px), so
// rows use a STACKED label-gutter ledger (label in a fixed 72px gutter,
// value full-width) instead of a side-by-side REQUIRED|APPLICANT grid:
// side-by-side cells are ~160px wide each, so long standards/evidence wrap
// into 6-8 lines and rows stretch into a tall wall. The gutter layout keeps
// every value on ~1-2 lines, bounds row height, and still reads A-vs-B.
//
// DESIGN LANGUAGE — premium SaaS, tool-first: hairline borders, token
// colours only, uppercase micro-labels, tabular numbers, 150ms colour-only
// transitions. Semantic colour is data (met/not-met), never decoration.
// ============================================================================

import { useState } from "react";
import { Check, Minus, CircleHelp, ChevronDown, X } from "lucide-react";
import type { RequirementCheck, RequirementsReport } from "@/lib/requirements";

// ============================================================================
// Verdict chip — the one-glance answer
// ============================================================================

const VERDICT_META: Record<
  RequirementsReport["verdict"],
  { label: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  // MOM (2026-09-03) vocabulary — the overall verdict uses the exact HR
  // wording; per-check rows below keep the granular met/unmet detail.
  ALL_MET: { label: "Meets the minimum requirements", tone: "success" },
  PARTIAL: { label: "Partially met", tone: "warning" },
  NONE_MET: { label: "Does not meet the minimum requirements", tone: "danger" },
  NEEDS_REVIEW: { label: "Needs manual review", tone: "neutral" },
  NO_REQUIREMENTS: { label: "No declared standards", tone: "neutral" },
};

const TONE_CHIP: Record<string, string> = {
  success: "border-success/40 bg-success/10 text-success-ink",
  warning: "border-warning/40 bg-warning/10 text-warning-ink",
  danger: "border-destructive/40 bg-destructive/10 text-danger-ink",
  neutral: "border-border bg-muted text-muted-foreground",
};

export function MatchVerdictChip({ report }: { report: RequirementsReport }) {
  const meta = VERDICT_META[report.verdict];
  const countable = report.verdict !== "NO_REQUIREMENTS";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 border px-2 py-0.5 text-[11px] font-medium ${TONE_CHIP[meta.tone]}`}
    >
      {countable && (
        <span className="tabular-nums">
          {report.metCount}/{report.requiredCount}
        </span>
      )}
      {meta.label}
    </span>
  );
}

// ============================================================================
// Per-check status icon + word
// ============================================================================

function StatusIcon({ status }: { status: RequirementCheck["status"] }) {
  if (status === "MET") {
    return (
      <span
        aria-hidden
        className="grid size-5 shrink-0 place-items-center bg-success/12 text-success-ink"
      >
        <Check className="size-3" strokeWidth={3} />
      </span>
    );
  }
  if (status === "NOT_MET") {
    return (
      <span
        aria-hidden
        className="grid size-5 shrink-0 place-items-center bg-destructive/10 text-danger-ink"
      >
        <X className="size-3" strokeWidth={3} />
      </span>
    );
  }
  if (status === "REVIEW") {
    return (
      <span
        aria-hidden
        className="grid size-5 shrink-0 place-items-center bg-muted text-muted-foreground"
      >
        <CircleHelp className="size-3" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="grid size-5 shrink-0 place-items-center bg-muted/60 text-muted-foreground/70"
    >
      <Minus className="size-3" strokeWidth={2.5} />
    </span>
  );
}

const STATUS_WORD: Record<RequirementCheck["status"], { label: string; className: string }> = {
  MET: { label: "Met", className: "text-success-ink" },
  NOT_MET: { label: "Not met", className: "text-danger-ink" },
  REVIEW: { label: "Verify manually", className: "text-muted-foreground" },
  NOT_REQUIRED: { label: "Not required", className: "text-muted-foreground/70" },
};

// ============================================================================
// Field — one label-gutter ledger line ("Required / Applicant / Evidence")
// ============================================================================

const GUTTER = "grid grid-cols-[72px_minmax(0,1fr)] gap-x-3";

function Field({
  label,
  children,
  emphasized = false,
}: {
  label: string;
  children: React.ReactNode;
  emphasized?: boolean;
}) {
  return (
    <div className={GUTTER}>
      <dt className="pt-px text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`min-w-0 text-xs leading-relaxed ${
          emphasized ? "font-medium text-foreground" : "text-muted-foreground"
        }`}
      >
        {children}
      </dd>
    </div>
  );
}

// ============================================================================
// CheckRow — REQUIRED → APPLICANT → EVIDENCE, one bounded ledger block
// ============================================================================

const VISIBLE_EVIDENCE = 2;

function Evidence({ lines }: { lines: string[] }) {
  const [expanded, setExpanded] = useState(false);
  if (lines.length === 0) return null;
  const visible = expanded ? lines : lines.slice(0, VISIBLE_EVIDENCE);
  const hidden = lines.length - visible.length;
  return (
    <div className={GUTTER}>
      <dt className="pt-px text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Evidence
      </dt>
      <dd className="min-w-0">
        <ul className="space-y-1">
          {visible.map((line, i) => (
            <li
              key={i}
              title={line}
              className="flex items-start gap-1.5 text-xs leading-relaxed text-foreground/80"
            >
              <span
                aria-hidden
                className="mt-[7px] size-1 shrink-0 rounded-full bg-foreground/30"
              />
              <span className="min-w-0 break-words line-clamp-2">{line}</span>
            </li>
          ))}
        </ul>
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-1 text-[11px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            +{hidden} more
          </button>
        )}
        {expanded && lines.length > VISIBLE_EVIDENCE && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="mt-1 text-[11px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            Show less
          </button>
        )}
      </dd>
    </div>
  );
}

function CheckRow({ check }: { check: RequirementCheck }) {
  const word = STATUS_WORD[check.status];

  // NOT REQUIRED rows stay one quiet line — a full Required/Applicant
  // ledger for a dimension the job doesn't ask for is pure noise.
  if (check.status === "NOT_REQUIRED") {
    const summary = check.applicantSummary || "—";
    return (
      <div className="px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <StatusIcon status={check.status} />
          <h3 className="text-sm font-medium text-foreground/70">{check.label}</h3>
          <span className="ml-auto text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70">
            Not required
          </span>
        </div>
        <p className="mt-1.5 pl-[30px] text-xs leading-relaxed text-muted-foreground">
          {summary}
        </p>
      </div>
    );
  }

  // The summary IS the best entry for most dimensions — repeating the same
  // line as evidence adds nothing, so drop exact duplicates.
  const evidence = check.evidence.filter((l) => l !== check.applicantSummary);

  return (
    <div className="px-4 py-3.5 sm:px-5">
      {/* Head — status icon · dimension label · status word (right) */}
      <div className="flex items-center gap-2.5">
        <StatusIcon status={check.status} />
        <h3 className="text-sm font-medium text-foreground">{check.label}</h3>
        <span
          className={`ml-auto text-[11px] font-semibold uppercase tracking-[0.06em] ${word.className}`}
        >
          {word.label}
        </span>
      </div>

      {/* Ledger — Required / Applicant / Evidence, aligned on a label gutter */}
      <dl className="mt-2.5 space-y-2">
        <Field label="Required">{check.requirement ?? "—"}</Field>
        <Field label="Applicant" emphasized>
          {check.applicantSummary}
        </Field>
        {evidence.length > 0 && <Evidence lines={evidence} />}
      </dl>

      {/* Gap line — the actionable bit for the reviewer */}
      {check.status === "NOT_MET" && check.shortfall && (
        <p className="mt-2.5 border-l-2 border-destructive/50 pl-2.5 text-xs font-medium leading-relaxed text-danger-ink">
          {check.shortfall}
        </p>
      )}
      {check.status === "REVIEW" && (
        <p className="mt-2.5 border-l-2 border-border pl-2.5 text-xs leading-relaxed text-muted-foreground">
          The recorded standard is ambiguous — confirm against the attached
          credentials before deciding.
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Panel — collapsible header (verdict always visible) + check rows
// ============================================================================

export function RequirementsMatchPanel({
  report,
  positionTitle,
}: {
  report: RequirementsReport | null;
  positionTitle?: string | null;
}) {
  const [open, setOpen] = useState(true);

  if (!report) return null;

  return (
    <section className="border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-3 text-left transition-colors duration-150 hover:bg-accent/40 sm:px-5"
      >
        <div className="min-w-0">
          <h2 className="text-sm font-medium tracking-tight text-foreground">
            Requirements Match
          </h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {positionTitle
              ? `CSC standards · ${positionTitle}`
              : "Applicant credentials vs CSC standards"}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          <MatchVerdictChip report={report} />
          <ChevronDown
            aria-hidden
            className={`size-4 text-muted-foreground transition-transform duration-150 ${
              open ? "" : "-rotate-90"
            }`}
          />
        </span>
      </button>

      {open && (
        <div className="divide-y divide-border">
          {report.checks.map((check) => (
            <CheckRow key={check.key} check={check} />
          ))}
        </div>
      )}
    </section>
  );
}

// ============================================================================
// MatchBadge — compact queue badge (kanban card / list row)
// ============================================================================

export type MatchSummary = {
  verdict: RequirementsReport["verdict"];
  metCount: number;
  requiredCount: number;
} | null;

const DOT_TONE: Record<RequirementsReport["verdict"], string> = {
  ALL_MET: "bg-success",
  PARTIAL: "bg-warning",
  NONE_MET: "bg-destructive",
  NEEDS_REVIEW: "bg-muted-foreground/50",
  NO_REQUIREMENTS: "bg-muted-foreground/30",
};

export function MatchBadge({ match }: { match: MatchSummary }) {
  if (!match || match.verdict === "NO_REQUIREMENTS" || match.requiredCount === 0) {
    return null;
  }
  const label =
    match.verdict === "NEEDS_REVIEW"
      ? "Review"
      : `${match.metCount}/${match.requiredCount}`;
  const tooltip =
    match.verdict === "ALL_MET"
      ? `Meets all ${match.requiredCount} job requirements`
      : match.verdict === "NEEDS_REVIEW"
      ? "Requirements need manual verification"
      : `Meets ${match.metCount} of ${match.requiredCount} job requirements`;
  return (
    <span
      title={tooltip}
      className="inline-flex shrink-0 items-center gap-1.5 border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground"
    >
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${DOT_TONE[match.verdict]}`} />
      {label}
    </span>
  );
}
