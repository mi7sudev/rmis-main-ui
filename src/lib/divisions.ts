// ============================================================================
// RMIS — Official DOST-MIRDC division registry.
// ----------------------------------------------------------------------------
// Source of truth: the official "WE'RE HIRING!" job bulletins supplied by the
// user (upload/JOBS.zip). Each bulletin prints the posting's FULL division
// name under the item number, e.g.:
//   MIRDCB-CSRS-1-2026   → Technology Solution Division
//   MIRDCB-SRSRS-5-2026  → Advanced Manufacturing and Materials Research and
//                          Development Division
//   MIRDCB-SRSRS-18-2010 → Product and Equipment Research and Development
//                          Division
// The DB stores the SHORT division codes on `postions.division`; every UI
// surface renders the FULL official name through this map — never invent
// shortened marketing-style labels ("Technology Solution", "Advanced
// Manufacturing R&D") — those are wrong per the reference bulletins.
// ============================================================================

export const DIVISION_LABEL: Record<string, string> = {
  PMD: "Planning and Management Division",
  TSSS: "Technical Support Services Division",
  FAD: "Finance and Administration Division",
  TDD: "Training and Development Division",
  MPRD: "Metals Processing Research and Development Division",
  TSD: "Technology Solution Division",
  AMMRDD: "Advanced Manufacturing and Materials Research and Development Division",
  PERDD: "Product and Equipment Research and Development Division",
};

/**
 * Resolve a division code to its official full name.
 * Returns null for empty/missing codes so callers can hide the element,
 * and echoes unknown codes through untouched (forward-compatible).
 */
export function divisionLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return DIVISION_LABEL[code] ?? code;
}
