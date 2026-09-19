"use client";

// ============================================================================
// RMIS 2.0 — Review Workspace (Evaluator) — deep-link wrapper
//
// The review experience itself lives in `review-modal.tsx` (the modernized
// "02 · Review Workspace" — a large centered modal). This thin wrapper keeps
// the #/evaluator-review?id=… route alive for deep links (candidate detail
// application history, notifications): it renders the SAME modal mounted
// open, and closing it returns to the review queue.
// ============================================================================

import { useNav } from "@/components/nav-provider";
import { ReviewModal } from "@/components/workspaces/evaluator/review-modal";

export function ReviewWorkspace() {
  const { params, navigate } = useNav();
  const rawId = params.id;
  const parsed = rawId != null ? Number(rawId) : NaN;
  const applicationId = Number.isFinite(parsed) ? parsed : null;

  return (
    <ReviewModal
      applicationId={applicationId}
      open={applicationId != null}
      onOpenChange={(v) => {
        if (!v) navigate("review-queue");
      }}
    />
  );
}
