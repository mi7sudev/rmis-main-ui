"use client";

// ============================================================================
// TrackingTimeline — delivery-tracking style status timeline (courier/parcel
// tracking metaphor: Shopee · J&T · Grab order tracking).
//
// A HORIZONTAL rail of square checkpoints connected by line segments:
//   ✓ done     → green node, check icon; its OUTGOING line is solid green
//                (the "package" has passed through this checkpoint)
//   ● current  → electric-blue node with ping halo; line after stays dashed
//   ○ upcoming → hairline hollow node, dim step number; dashed connector
//   ✕ failed   → destructive node, X icon (negative terminal, e.g. rejected)
//
// Accenture language: 0px radius, hairline borders, zero shadows. Each step
// is an equal flex-1 column — node anchored to its left edge, the connector
// stretches node-to-node across the row, and the copy sits under the node.
// No measuring needed: the connector is a plain flex child of the node row.
//
// Also ships `journeyTrackingSteps` — the canonical builder that maps an
// application pipeline stage (lib/status vocabulary) onto tracking states,
// so every surface that shows the application journey renders it the SAME
// way (applicant home journey cards).
// ============================================================================

import { Check, X } from "lucide-react";
import { type StageKey } from "@/lib/status";

export type TrackingStepState = "done" | "current" | "upcoming" | "failed";

export type TrackingStep = {
  key: string;
  label: string;
  desc: string;
  state: TrackingStepState;
};

// Node + ink vocabulary per state (mode-tuned tokens; dark-mode safe).
const NODE_CLASSES: Record<TrackingStepState, string> = {
  done: "bg-success text-success-foreground",
  current: "bg-primary text-white",
  upcoming: "border border-input bg-background text-muted-foreground",
  failed: "bg-destructive text-white",
};

const LABEL_CLASSES: Record<TrackingStepState, string> = {
  done: "text-foreground",
  current: "text-primary",
  upcoming: "text-muted-foreground",
  failed: "text-danger-ink",
};

const DESC_CLASSES: Record<TrackingStepState, string> = {
  done: "text-muted-foreground",
  current: "text-foreground/70",
  upcoming: "text-muted-foreground/60",
  failed: "text-muted-foreground",
};

export function TrackingTimeline({
  steps,
  className = "",
  ariaLabel,
}: {
  steps: TrackingStep[];
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <ol className={`flex w-full items-start ${className}`} aria-label={ariaLabel}>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        // The connector AFTER a node is solid only when progress has passed
        // THROUGH it — everything ahead of the current checkpoint is dashed.
        const traversed = step.state === "done";
        return (
          <li key={step.key} className="min-w-0 flex-1">
            {/* Node row — connector stretches to the next checkpoint */}
            <div className="flex items-center">
              {/* Checkpoint node */}
              <span
                className={`relative z-10 grid size-8 shrink-0 place-items-center ${NODE_CLASSES[step.state]}`}
              >
                {step.state === "done" && <Check className="size-4" strokeWidth={3} />}
                {step.state === "failed" && <X className="size-4" strokeWidth={3} />}
                {(step.state === "current" || step.state === "upcoming") && (
                  <span className="text-[11px] font-extrabold tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                )}
                {step.state === "current" && (
                  <span aria-hidden className="absolute inset-0 animate-ping bg-primary/40" />
                )}
              </span>

              {/* Rail segment to the next checkpoint */}
              {!isLast && (
                <span
                  aria-hidden
                  className={`flex-1 ${
                    traversed ? "h-0.5 bg-success" : "h-0 border-t-2 border-dashed border-border"
                  }`}
                />
              )}
            </div>

            {/* Checkpoint copy under the node */}
            <div className="min-w-0 pr-3 pt-2.5">
              <p className={`text-xs font-bold tracking-[-0.01em] ${LABEL_CLASSES[step.state]}`}>
                {step.label}
              </p>
              <p className={`mt-1 text-[11px] leading-snug ${DESC_CLASSES[step.state]}`}>
                {step.desc}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ----------------------------------------------------------------------------
// journeyTrackingSteps — the application journey as tracking checkpoints.
// Single source of truth behind the applicant home journey cards.
//
// Copy contract (production tone): descriptions are short, formal status
// phrases in sentence case — never dev shorthand. They must read correctly
// on their own in a narrow column AND alongside the applicant-home
// "Next Step" guidance, which carries the full correspondence-grade
// sentence (see applicant-home.tsx → nextStageHint).
//
//   Submitted  → always done (receipt is instant)
//   Review     → only "current" once an evaluator has EXPLICITLY taken the
//                application up for review (status Under Review — the applicant
//                is emailed at that moment). While the application is merely
//                submitted, Review stays a dashed-ahead upcoming checkpoint.
//                Done once a decision exists.
//   Decision   → the FINAL checkpoint, and the outcome is NOT promised: while
//                the shortlist decision is pending it reads neutrally as
//                "Decision — Awaiting the shortlist decision" (it can still go
//                either way). Once HR records a decision it resolves to
//                "Shortlisted" (done, green) or "Not Shortlisted" (failed, red
//                ✕ — the rejection terminal). Never label the pending node
//                "Shortlisted": that reads to the applicant as a guaranteed
//                positive outcome.
// ----------------------------------------------------------------------------
export function journeyTrackingSteps(
  stage: StageKey,
  isRejected: boolean,
  inReview = false
): TrackingStep[] {
  // Review is DONE only once a DECISION exists (Shortlisted / Rejected
  // stages). The "Under Review" stage itself is the CURRENT checkpoint when
  // the caller confirms the pick-up (inReview) — never "done" on its own.
  const decided = stage === "Shortlisted" || stage === "Rejected";
  const reviewState: TrackingStepState = decided
    ? "done"
    : inReview
    ? "current"
    : "upcoming";
  const reviewDesc =
    reviewState === "done"
      ? "Evaluation completed"
      : reviewState === "current"
      ? "Credentials under evaluation"
      : "Awaiting evaluation";

  return [
    {
      key: "SUBMITTED",
      label: "Submitted",
      desc: "Application Received",
      state: "done",
    },
    {
      key: "REVIEW",
      label: "Review",
      desc: reviewDesc,
      state: reviewState,
    },
    isRejected
      ? {
          key: "SHORTLISTED",
          label: "Not Shortlisted",
          desc: "Thank you for your interest in this position",
          state: "failed",
        }
      : {
          key: "SHORTLISTED",
          // Pending reads neutrally as "Decision" — the shortlist decision can
          // go either way (shortlisted OR "Not Shortlisted"), so the awaiting
          // node must not promise the positive outcome. Only a recorded
          // decision resolves the label to "Shortlisted".
          label: stage === "Shortlisted" ? "Shortlisted" : "Decision",
          desc:
            stage === "Shortlisted"
              ? "Notice sent to your registered email address"
              : "Awaiting the shortlist decision",
          state: stage === "Shortlisted" ? "done" : "upcoming",
        },
  ];
}
