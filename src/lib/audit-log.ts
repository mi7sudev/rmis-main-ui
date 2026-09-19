// Audit logging for government compliance — records who did what, when.
//
// This module is the SINGLE entry point for writing audit events. It:
//   1. Emits a structured JSON line to the server console (for log aggregation
//      / SIEM forwarding).
//   2. Persists the event to a DEDICATED audit_logs table in db/audit.db
//      (separate from the production DB — see src/lib/audit-db.ts).
//
// SECURITY: Never log passwords, tokens, government IDs, or PII.
// Only log: timestamp, user ID, action, entity type, entity ID, and a
// high-level description (no field-level data).
//
// The caller should resolve the actor's label (username + email) and role
// from the session BEFORE calling this function, so the audit row carries
// enough context to display in the admin UI without an extra join.

import { insertAuditLog, migrateHistoricalAuditLogs } from "@/lib/audit-db";
import type { Role } from "@/lib/roles";

export type AuditAction =
  | "USER_CREATED"
  | "USER_UPDATED"
  | "USER_DISABLED"
  | "USER_DELETED"
  | "USER_ROLE_CHANGED"
  | "APPLICATION_STATUS_CHANGED"
  | "APPLICATION_SUBMITTED"
  | "ASSESSMENT_SUBMITTED"
  | "JOB_POSTING_CREATED"
  | "JOB_POSTING_UPDATED"
  | "JOB_POSTING_DELETED"
  | "POSITION_CREATED"
  | "POSITION_UPDATED"
  | "DOCUMENT_UPLOADED"
  | "DOCUMENT_DELETED"
  | "PROFILE_UPDATED"
  | "PROFILE_COMPLETED"
  | "PROFILE_CLEARED"
  | "DIRECT_EMAIL_SENT"
  | "NOTICE_SENT"
  | "REGRET_LETTERS_BULK_SENT"
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT";

// Kick off the one-time historical migration on module load (idempotent,
// fire-and-forget). This imports the 152 existing [AUDIT] entries from the
// production notifications table into the new dedicated audit_logs table so the
// admin UI shows a complete history.
void migrateHistoricalAuditLogs().catch(() => {
  // migration errors are non-fatal — logged inside the function
});

/**
 * Record an audit event. This is fire-and-forget — if logging fails,
 * the original operation still succeeds (the audit log is not in the
 * critical path). Errors are logged to console.error but never thrown.
 *
 * @param params.userId     — the actor's user ID (up_users.id)
 * @param params.userLabel  — "username (email)" for quick display
 * @param params.userRole   — ADMIN / EVALUATOR / APPLICANT
 * @param params.action     — one of AuditAction
 * @param params.entityType — user / job / application / document / …
 * @param params.entityId   — the affected entity's ID
 * @param params.description — human-readable summary (no PII)
 * @param params.ipAddress  — client IP (best-effort)
 */
export async function auditLog(params: {
  userId: number | string | null;
  userLabel?: string | null;
  userRole?: Role | string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: number | string | null;
  description: string;
  ipAddress?: string;
}): Promise<void> {
  const {
    userId,
    userLabel,
    userRole,
    action,
    entityType,
    entityId,
    description,
    ipAddress,
  } = params;

  const timestamp = new Date().toISOString();
  const userIdStr = userId != null ? String(userId) : null;

  const entry = {
    timestamp,
    userId: userIdStr,
    userLabel: userLabel ?? null,
    userRole: userRole ?? null,
    action,
    entityType: entityType || null,
    entityId: entityId != null ? String(entityId) : null,
    description, // high-level description, no PII
    ipAddress: ipAddress || null,
  };

  // 1. Server console — structured JSON for log aggregation / SIEM.
  console.info("[AUDIT]", JSON.stringify(entry));

  // 2. Dedicated audit_logs table (db/audit.db). Sync insert — very fast.
  //    Never throws (insertAuditLog swallows errors internally).
  insertAuditLog({
    timestamp: entry.timestamp,
    userId: entry.userId,
    userLabel: entry.userLabel,
    userRole: entry.userRole,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    description: entry.description,
    ipAddress: entry.ipAddress,
  });
}
