// ============================================================================
// positions.ts — THE Position write-path module (wire → column mapping).
//
// WHY ONE HOME: POST /api/admin/positions and PATCH /api/admin/positions/[id]
// each hand-rolled a 19-field ladder mapping positionCreateSchema fields to
// `postions` columns. The two ladders had already drifted in shape (POST
// writes every column unconditionally; PATCH writes only present fields) and
// embed a silent rename trap — wire `salaryStep` maps to DB column
// `positionSalaryStep`. Both routes now call positionInputToData() so the
// mapping + null-normalization rules exist exactly once.
//
// Production schema notes (prisma/schema.prisma):
//   * Position maps to the `postions` table (typo preserved).
//   * `positionSalaryStep` / `salaryGrade` are String? (CSC salary grade
//     strings); `positionLevel` is Int?, `salaryAmount` is Float?.
//   * `placeOfAssignmentId` is NOT a column — it drives the
//     `postions_place_of_assignment_lnk` junction and is handled by the
//     routes themselves.
// ============================================================================

import type { PositionInput } from "@/lib/validation";

/**
 * [wireField, dbColumn] pairs. Numeric columns normalize with `?? null`
 * (0 is a legal value); everything else with `|| null` (empty string → null).
 * Order follows positionCreateSchema.
 */
const FIELD_MAP: ReadonlyArray<readonly [
  wire: keyof PositionInput,
  column: string
]> = [
  ["itemNumber", "itemNumber"],
  ["positionTitle", "positionTitle"],
  ["positionType", "positionType"],
  ["positionStatus", "positionStatus"],
  ["positionLevel", "positionLevel"], // Int? — numeric normalization
  ["salaryGrade", "salaryGrade"],
  ["salaryStep", "positionSalaryStep"], // ← the rename trap, documented once
  ["salaryAmount", "salaryAmount"], // Float? — numeric normalization
  ["division", "division"],
  ["section", "section"],
  ["classification", "classification"],
  ["cscEducation", "cscEducation"],
  ["cscEligibility", "cscEligibility"],
  ["cscEligibilityGroup", "cscEligibilityGroup"],
  ["cscWorkExperience", "cscWorkExperience"],
  ["cscTrainingRequirements", "cscTrainingRequirements"],
  ["preferredQualification", "preferredQualification"],
  ["competencyRequirements", "competencyRequirements"],
  ["specialSkill", "specialSkill"],
];

const NUMERIC_WIRES = new Set<keyof PositionInput>(["positionLevel", "salaryAmount"]);

/**
 * Build the Prisma `data` object for a Position write from a parsed
 * positionCreateSchema payload.
 *
 * @param d        validated payload (possibly partial — see `partial`)
 * @param partial  true → only fields present in the payload are written
 *                 (PATCH semantics); false → every column is written,
 *                 absent fields as null (POST semantics)
 */
export function positionInputToData(
  d: PositionInput,
  { partial = false }: { partial?: boolean } = {}
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [wire, column] of FIELD_MAP) {
    const v = d[wire];
    if (partial && v === undefined) continue;
    data[column] = NUMERIC_WIRES.has(wire) ? (v ?? null) : (v || null);
  }
  return data;
}
