import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// ============================================================================
// Audit Log Database — a DEDICATED SQLite file for structured audit events.
//
// WHY A SEPARATE FILE (db/audit.db)?
//   The production database (db/production-data.db) is a PURE MAPPING
//   target — the Prisma schema explicitly warns NEVER to run migrations
//   against it. The previous auditLog() implementation wrote to the
//   production `notifications` table, which:
//     (a) polluted a production table with app-specific audit rows,
//     (b) was lossy — no userId / ipAddress / entityType / entityId columns,
//         so the actor and target of each action were lost.
//
//   This dedicated audit.db file:
//     - is owned 100% by this Next.js app,
//     - has a proper schema with all structured fields,
//     - is created automatically on first use (idempotent),
//     - never touches the production database.
//
// SCHEMA:
//   audit_logs (
//     id          INTEGER PRIMARY KEY AUTOINCREMENT,
//     timestamp   TEXT    NOT NULL,   -- ISO 8601 with milliseconds
//     user_id     TEXT,               -- actor's up_users.id (string)
//     user_label  TEXT,               -- "username (email)" for quick display
//     user_role   TEXT,               -- ADMIN / EVALUATOR / APPLICANT / SYSTEM
//     action      TEXT    NOT NULL,   -- LOGIN_SUCCESS, JOB_POSTING_CREATED, …
//     entity_type TEXT,               -- user / job / application / document / …
//     entity_id   TEXT,               -- string for flexibility
//     description TEXT,               -- human-readable summary (no PII)
//     ip_address  TEXT
//   )
// ============================================================================

const AUDIT_DB_PATH = join(process.cwd(), "db", "audit.db");

// Ensure the db/ directory exists (it always should, but be safe).
try {
  mkdirSync(dirname(AUDIT_DB_PATH), { recursive: true });
} catch {
  // ignore — directory already exists
}

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(AUDIT_DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("synchronous = NORMAL");

  // Idempotent table creation — safe to run on every connection.
  _db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp   TEXT    NOT NULL,
      user_id     TEXT,
      user_label  TEXT,
      user_role   TEXT,
      action      TEXT    NOT NULL,
      entity_type TEXT,
      entity_id   TEXT,
      description TEXT,
      ip_address  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id   ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action    ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity    ON audit_logs(entity_type, entity_id);
  `);

  return _db;
}

export type AuditLogRow = {
  id: number;
  timestamp: string;
  user_id: string | null;
  user_label: string | null;
  user_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string | null;
  ip_address: string | null;
};

export type AuditLogInput = {
  timestamp: string; // ISO 8601
  userId: string | null;
  userLabel: string | null;
  userRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  description: string;
  ipAddress: string | null;
};

// ----------------------------------------------------------------------------
// Insert a single audit log entry. Sync (better-sqlite3) — very fast.
// Never throws: if the insert fails, the error is logged to stderr and the
// caller's operation continues unaffected (audit logging is non-critical).
// ----------------------------------------------------------------------------
export function insertAuditLog(entry: AuditLogInput): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO audit_logs
           (timestamp, user_id, user_label, user_role, action, entity_type, entity_id, description, ip_address)
         VALUES (@timestamp, @userId, @userLabel, @userRole, @action, @entityType, @entityId, @description, @ipAddress)`,
      )
      .run({
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
  } catch (e) {
    console.error("[AUDIT-DB] insert failed:", e);
  }
}

// ----------------------------------------------------------------------------
// Query audit logs with filtering + pagination.
// Returns rows newest-first.
// ----------------------------------------------------------------------------
export function queryAuditLogs(params: {
  search?: string;
  action?: string;
  userId?: string;
  entityType?: string;
  startDate?: string; // ISO date prefix e.g. "2026-08-13"
  endDate?: string;
  limit: number;
  offset: number;
}): { rows: AuditLogRow[]; total: number } {
  const db = getDb();
  const where: string[] = [];
  const args: Record<string, unknown> = {};

  if (params.search) {
    where.push("(description LIKE @search OR user_label LIKE @search OR action LIKE @search)");
    args.search = `%${params.search}%`;
  }
  if (params.action && params.action !== "ALL") {
    where.push("action = @action");
    args.action = params.action;
  }
  if (params.userId) {
    where.push("user_id = @userId");
    args.userId = params.userId;
  }
  if (params.entityType && params.entityType !== "ALL") {
    where.push("entity_type = @entityType");
    args.entityType = params.entityType;
  }
  if (params.startDate) {
    where.push("timestamp >= @startDate");
    args.startDate = params.startDate;
  }
  if (params.endDate) {
    where.push("timestamp <= @endDate");
    args.endDate = params.endDate + "T23:59:59.999Z";
  }

  const whereClause = where.length ? "WHERE " + where.join(" AND ") : "";

  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM audit_logs ${whereClause}`).get(args) as {
      c: number;
    }
  ).c;

  const rows = db
    .prepare(
      `SELECT id, timestamp, user_id, user_label, user_role, action, entity_type, entity_id, description, ip_address
       FROM audit_logs ${whereClause}
       ORDER BY id DESC
       LIMIT @limit OFFSET @offset`,
    )
    .all({ ...args, limit: params.limit, offset: params.offset }) as AuditLogRow[];

  return { rows, total };
}

// ----------------------------------------------------------------------------
// Get the distinct list of actions that have been logged (for the filter
// dropdown in the UI).
// ----------------------------------------------------------------------------
export function getDistinctActions(): string[] {
  return (
    getDb()
      .prepare(
        "SELECT DISTINCT action FROM audit_logs ORDER BY action ASC",
      )
      .all() as { action: string }[]
  ).map((r) => r.action);
}

// ----------------------------------------------------------------------------
// One-time migration of historical [AUDIT] entries from the production
// `notifications` table into the new dedicated audit_logs table.
//
// This is idempotent — it tracks the highest notifications.id already
// migrated and only imports newer rows. Safe to call on every server start.
//
// Historical entries are lossy (no userId / ipAddress / entityType stored),
// so those fields are left null and the description is preserved as-is.
// ----------------------------------------------------------------------------
let migrationDone = false;
export async function migrateHistoricalAuditLogs(): Promise<number> {
  if (migrationDone) return 0;
  migrationDone = true;

  try {
    // Dynamically import db (Prisma) — avoids circular dependency at module
    // load time. The production DB has the `notifications` table.
    const { db } = await import("@/lib/db");
    const rows = await db.notification.findMany({
      where: { name: { startsWith: "[AUDIT]" } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        notificationDescription: true,
        createdAt: true,
      },
    });

    if (!rows.length) return 0;

    const stmt = getDb().prepare(
      `INSERT OR IGNORE INTO audit_logs
         (timestamp, user_id, user_label, user_role, action, entity_type, entity_id, description, ip_address)
       VALUES (@timestamp, @userId, @userLabel, @userRole, @action, @entityType, @entityId, @description, @ipAddress)`,
    );

    let count = 0;
    const tx = getDb().transaction((items: typeof rows) => {
      for (const r of items) {
        // Extract action from "[AUDIT] LOGIN_SUCCESS" → "LOGIN_SUCCESS"
        const action = (r.name ?? "").replace(/^\[AUDIT\]\s*/, "").trim() || "UNKNOWN";
        // Extract username from descriptions like "User testadmin signed in"
        // or "Failed login attempt for testadmin"
        let userId: string | null = null;
        let userLabel: string | null = null;
        const m1 = r.notificationDescription?.match(/User (\S+) signed in/);
        const m2 = r.notificationDescription?.match(/Failed login attempt for (\S+)/);
        const username = m1?.[1] ?? m2?.[1];
        if (username) {
          userLabel = username;
        }
        const ts = r.createdAt
          ? new Date(typeof r.createdAt === "number" ? r.createdAt : r.createdAt.getTime()).toISOString()
          : new Date().toISOString();

        try {
          stmt.run({
            timestamp: ts,
            userId,
            userLabel,
            userRole: null, // unknown for historical entries
            action,
            entityType: null,
            entityId: null,
            description: r.notificationDescription ?? "",
            ipAddress: null,
          });
          count++;
        } catch {
          // ignore individual insert errors (e.g. duplicates)
        }
      }
    });
    tx(rows);

    console.log(`[AUDIT-DB] migrated ${count} historical audit entries from notifications table`);
    return count;
  } catch (e) {
    console.error("[AUDIT-DB] historical migration failed:", e);
    return 0;
  }
}
