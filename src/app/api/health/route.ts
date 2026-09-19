import { NextRequest } from "next/server";
import { ok, handleApi } from "@/lib/api";
import { db } from "@/lib/db";

/**
 * GET /api/health — liveness + readiness probe.
 *
 * Used by:
 *   - systemd (`ExecStartPost` / monitoring) and ops `curl` checks
 *   - load balancers / reverse proxies (optional upstream health)
 *
 * Returns:
 *   200 {"status":"healthy","checks":{"app":"ok","database":"ok"}}      — all good
 *   503 {"status":"unhealthy","checks":{"app":"ok","database":"fail"}}  — DB unreachable
 *
 * Deliberately unauthenticated (safe to expose on an intranet): it returns no
 * data, only the two boolean checks.
 */
export const GET = handleApi(async (_req: NextRequest) => {
  const checks: Record<string, "ok" | "fail"> = { app: "ok", database: "fail" };
  let healthy = false;

  try {
    await db.$queryRawUnsafe("SELECT 1");
    checks.database = "ok";
    healthy = true;
  } catch (error) {
    console.error("[health] database check failed:", error);
  }

  return ok(
    { status: healthy ? "healthy" : "unhealthy", checks },
    healthy ? 200 : 503
  );
});
