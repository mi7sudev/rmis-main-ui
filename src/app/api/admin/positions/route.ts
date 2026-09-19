import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { requireEvaluatorFromReq } from "@/lib/auth";
import { positionCreateSchema, paginationSchema, type Paginated } from "@/lib/validation";
import { positionInputToData } from "@/lib/positions";
import { loadPositionPlaceOfAssignment } from "@/lib/applicant-data";

// Production schema notes:
//   * Position maps to the `postions` table (typo preserved).
//   * positionSalaryStep and salaryGrade are String? (CSC salary grade strings).
//   * positionLevel is Int?.
//   * Relation to place_of_assignment is via `postions_place_of_assignment_lnk`.
//   * Relation to job_postings is via `jobpostings_postions_lnk`.

export const GET = handleApi(async (req: NextRequest) => {
  await requireEvaluatorFromReq(req);
  const url = new URL(req.url);
  const { page, pageSize } = paginationSchema.parse({
    page: url.searchParams.get("page") ?? 1,
    pageSize: url.searchParams.get("pageSize") ?? 50,
  });

  const [positions, total] = await Promise.all([
    db.position.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.position.count(),
  ]);

  // For each position, load linked placeOfAssignment + count of job postings
  const data: Array<
    (typeof positions)[number] & {
      placeOfAssignment: Awaited<ReturnType<typeof loadPositionPlaceOfAssignment>>[number] | null;
      _count: { jobPostings: number };
    }
  > = [];
  for (const p of positions) {
    const places = await loadPositionPlaceOfAssignment(p.id);
    const jobLinks = await db.jobPostingPositionLink.findMany({
      where: { postionId: p.id },
      select: { jobpostingId: true },
    });
    const jobPostingsCount = jobLinks.length;
    data.push({
      ...p,
      placeOfAssignment: places[0] ?? null,
      _count: { jobPostings: jobPostingsCount },
    });
  }

  const result: Paginated<typeof data[number]> = {
    data,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  };
  return ok(result);
});

export const POST = handleApi(async (req: NextRequest) => {
  await requireEvaluatorFromReq(req);
  const parsed = positionCreateSchema.safeParse(await req.json());
  if (!parsed.success) return err("Invalid input", 400, parsed.error.flatten());
  const d = parsed.data;

  const now = new Date();
  const position = await db.position.create({
    data: {
      // Full write: every mapped column, absent payload fields as null.
      ...positionInputToData(d),
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      // NOTE: createdById / updatedById FK-reference admin_users.id, NOT up_users.id.
      // With PRAGMA foreign_keys = ON, setting these to the logged-in up_users
      // id throws "FOREIGN KEY constraint failed". All 580 existing production
      // rows have these columns as NULL, so we omit them here to match that
      // production-consistent behavior.
    },
  });

  // Link to placeOfAssignment if provided
  let placeOfAssignment: { id: number; name: string | null } | null = null;
  if (d.placeOfAssignmentId) {
    const poaId = parseInt(d.placeOfAssignmentId, 10);
    if (!isNaN(poaId)) {
      await db.positionPlaceOfAssignmentLink.create({
        data: { postionId: position.id, placeOfAssignmentId: poaId },
      });
      const poa = await db.placeOfAssignment.findUnique({ where: { id: poaId } });
      if (poa) placeOfAssignment = { id: poa.id, name: poa.name };
    }
  }

  return ok({ ...position, placeOfAssignment }, 201);
});
