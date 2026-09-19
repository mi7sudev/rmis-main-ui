import { NextRequest } from "next/server";
import { ok, handleApi } from "@/lib/api";
import { requireAdminFromReq } from "@/lib/auth";
import { queryAuditLogs, getDistinctActions, type AuditLogRow } from "@/lib/audit-db";
import type { Paginated } from "@/lib/validation";

// ============================================================================
// GET /api/admin/audit-logs
//
// Returns a PAGINATED, FILTERABLE list of ALL audit events from the dedicated
// audit_logs table (db/audit.db). This is the data source for the admin
// "Activity Log" page — a comprehensive history of who did what, when.
//
// Auth: ADMIN only (evaluators do not have access to the system-wide audit log).
//
// Query params:
//   - page        (default 1)
//   - pageSize    (default 50, max 100)
//   - search      (optional substring match on description / user_label / action)
//   - action      (optional: exact action code, e.g. "LOGIN_SUCCESS")
//   - userId      (optional: filter by actor's user ID)
//   - entityType  (optional: user / job / application / document / applicant)
//   - startDate   (optional: ISO date prefix, e.g. "2026-08-13")
//   - endDate     (optional: ISO date prefix)
//
// Also returns the distinct list of actions (for the filter dropdown).
// ============================================================================

export const GET = handleApi(async (req: NextRequest) => {
  await requireAdminFromReq(req);

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "50", 10) || 50));
  const search = url.searchParams.get("search")?.trim() || undefined;
  const action = url.searchParams.get("action") || undefined;
  const userId = url.searchParams.get("userId") || undefined;
  const entityType = url.searchParams.get("entityType") || undefined;
  const startDate = url.searchParams.get("startDate") || undefined;
  const endDate = url.searchParams.get("endDate") || undefined;

  const { rows, total } = queryAuditLogs({
    search,
    action,
    userId,
    entityType,
    startDate,
    endDate,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const actions = getDistinctActions();

  // Derive quick summary stats (computed over the current page rows — gives
  // the admin a sense of activity distribution without a second aggregate query).
  const summary = computeSummary(rows, total);

  const result: Paginated<AuditLogRow> = {
    data: rows,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  };

  return ok({ ...result, actions, summary });
});

function computeSummary(rows: AuditLogRow[], total: number) {
  const byAction = new Map<string, number>();
  const byRole = new Map<string, number>();
  for (const r of rows) {
    byAction.set(r.action, (byAction.get(r.action) ?? 0) + 1);
    if (r.user_role) byRole.set(r.user_role, (byRole.get(r.user_role) ?? 0) + 1);
  }
  return {
    totalEvents: total,
    onPage: rows.length,
    topActions: Array.from(byAction.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([action, count]) => ({ action, count })),
    byRole: Array.from(byRole.entries()).map(([role, count]) => ({ role, count })),
  };
}
