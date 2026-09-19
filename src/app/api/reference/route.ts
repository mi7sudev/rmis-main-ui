import { db } from "@/lib/db";
import { ok, handleApi } from "@/lib/api";

// Public reference data: eligibility titles + courses + places of assignment.
//
// Production schema notes:
//   * Eligibility has only `name` (no `category` column).
//   * Course has `name`, `abbri`, `category`, `level`.
//   * PlaceOfAssignment has only `name`.
//
// All three tables follow the production draft/published pattern: each content
// item is stored as BOTH a draft row (publishedAt IS NULL) and a published row
// (publishedAt IS NOT NULL), sharing the same documentId. Without filtering,
// every dropdown option would appear twice (draft + published).
//
// We therefore:
//   1. Filter to published rows only (publishedAt IS NOT NULL), and
//   2. Deduplicate by name as a defensive measure (handles edge cases where
//      two different content items happen to share the same display name).
export const GET = handleApi(async () => {
  const [eligibilities, courses, placesOfAssignment] = await Promise.all([
    db.eligibility.findMany({
      where: { publishedAt: { not: null } },
      orderBy: { name: "asc" },
    }),
    db.course.findMany({
      where: { publishedAt: { not: null } },
      orderBy: { name: "asc" },
    }),
    db.placeOfAssignment.findMany({
      where: { publishedAt: { not: null } },
      orderBy: { name: "asc" },
    }),
  ]);

  // Collapse rows that share the same display name. Keeps the first occurrence
  // (after the name-asc sort) so the dropdown always renders unique options.
  const dedupeByName = <T extends { name: string | null }>(rows: T[]): T[] => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const r of rows) {
      const key = r.name ?? "";
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    return out;
  };

  return ok({
    eligibilities: dedupeByName(eligibilities),
    courses: dedupeByName(courses),
    placesOfAssignment: dedupeByName(placesOfAssignment),
  });
});
