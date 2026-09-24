"use client";

// ============================================================================
// Atlas dash — ReviewModal namespace re-export.
//
// The shared credential-review modal lives in
// @/components/workspaces/evaluator/review-modal (a single implementation
// with one behavior contract: GET/PATCH /api/evaluator/applications/:id,
// Start Review / Shortlist / Not Qualified + remarks, confirm gate, email
// notices). The Atlas views import it from the dash/views namespace so the
// rebuild stays presentation-only and never forks the decision flow.
// ============================================================================

export { ReviewModal, type ReviewModalProps } from "@/components/workspaces/evaluator/review-modal";
