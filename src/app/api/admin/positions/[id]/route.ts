import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { requireEvaluatorFromReq } from "@/lib/auth";
import { positionCreateSchema } from "@/lib/validation";
import { positionInputToData } from "@/lib/positions";
import { loadPositionPlaceOfAssignment } from "@/lib/applicant-data";

// PATCH /api/admin/positions/[id] — evaluator+admin update of a position record.
// Mirrors POST /api/admin/positions: optional fields are stored as null when
// emptied, and the place-of-assignment junction row is re-linked when
// `placeOfAssignmentId` is provided.
//
// Production schema notes (see prisma/schema.prisma):
//   * Position maps to the `postions` table (typo preserved).
//   * `positionSalaryStep` / `salaryGrade` are String? (CSC salary grade strings).
//   * `positionLevel` is Int?, `salaryAmount` is Float?.
//   * Relation to place_of_assignment is via `postions_place_of_assignment_lnk`.
export const PATCH = handleApi(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  await requireEvaluatorFromReq(req);
  const { id: idStr } = await params;
  const positionId = parseInt(idStr, 10);
  if (isNaN(positionId)) return err("Invalid position id", 400);

  const existing = await db.position.findUnique({ where: { id: positionId } });
  if (!existing) return err("Position not found", 404);

  const parsed = positionCreateSchema.partial().safeParse(await req.json());
  if (!parsed.success) return err("Invalid input", 400, parsed.error.flatten());
  const d = parsed.data;

  // Partial write: only fields present in the payload (see positions.ts).
  const data: Record<string, unknown> = {
    ...positionInputToData(d, { partial: true }),
    updatedAt: new Date(),
  };

  const position = await db.position.update({ where: { id: positionId }, data });

  // Re-link place of assignment when the field is present in the payload.
  let placeOfAssignment: { id: number; name: string | null } | null = null;
  if (d.placeOfAssignmentId !== undefined) {
    await db.positionPlaceOfAssignmentLink.deleteMany({ where: { postionId: positionId } });
    if (d.placeOfAssignmentId) {
      const poaId = parseInt(d.placeOfAssignmentId, 10);
      if (!isNaN(poaId)) {
        await db.positionPlaceOfAssignmentLink.create({
          data: { postionId: positionId, placeOfAssignmentId: poaId },
        });
        const poa = await db.placeOfAssignment.findUnique({ where: { id: poaId } });
        if (poa) placeOfAssignment = { id: poa.id, name: poa.name };
      }
    } else {
      // Link removed — check if one still exists (shouldn't, but be safe).
      const places = await loadPositionPlaceOfAssignment(positionId);
      if (places[0]) placeOfAssignment = { id: places[0].id, name: places[0].name };
    }
  } else {
    // Not updating the link — return the current one.
    const places = await loadPositionPlaceOfAssignment(positionId);
    if (places[0]) placeOfAssignment = { id: places[0].id, name: places[0].name };
  }

  return ok({ ...position, placeOfAssignment });
});
