/**
 * snapshot.ts — Shared helpers for reading + normalizing the production
 * `applications.snapshot_*` JSON columns.
 *
 * Two naming conventions coexist inside snapshot payloads:
 *   · snake_case  — rows written by the legacy import
 *   · camelCase   — rows written by this system (jobs/apply)
 * `transformSnapshotKeys` converts snake_case → camelCase at the API
 * boundary so every frontend/engine consumer sees ONE shape.
 */

/** Parse a raw snapshot string; null/"" → null, invalid JSON → null. */
export function safeJsonParse(s: string | null | undefined): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Convert a single snake_case key segment to camelCase. */
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Recursively transform all object keys in a parsed JSON value from
 * snake_case (legacy DB column convention) to camelCase (JS/TS convention
 * expected by the evaluator frontend renderers).
 *
 * Arrays are mapped element-wise; primitives and null are returned unchanged.
 */
export function transformSnapshotKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(transformSnapshotKeys);
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[snakeToCamel(key)] = transformSnapshotKeys(value);
    }
    return result;
  }
  return obj;
}

/** Parse + key-normalize a raw snapshot string into a record array ([] when empty). */
export function parseSnapshotArray(raw: string | null | undefined): Record<string, unknown>[] {
  const parsed = safeJsonParse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (x): x is Record<string, unknown> => x != null && typeof x === "object",
  );
}
