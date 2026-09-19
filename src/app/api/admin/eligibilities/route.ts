import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { requireAdminFromReq } from "@/lib/auth";

// Production schema for Eligibility (`eligibilities` table):
//   id, documentId, name, createdAt, updatedAt, publishedAt,
//   createdById, updatedById, locale, index
//
// NOTE: there is NO `category` column. The frontend may still send one —
// we accept it for backwards compatibility but only persist `name`.

const schema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  category: z.string().max(100).optional().nullable(),
});

export const GET = handleApi(async (req: NextRequest) => {
  await requireAdminFromReq(req);
  return ok(await db.eligibility.findMany({ orderBy: { name: "asc" } }));
});

export const POST = handleApi(async (req: NextRequest) => {
  await requireAdminFromReq(req);
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return err("Invalid input", 400, parsed.error.flatten());
  const { name } = parsed.data;
  const now = new Date();
  return ok(
    await db.eligibility.create({
      data: {
        name,
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
        // NOTE: createdById / updatedById FK-reference admin_users.id, NOT
        // up_users.id. With PRAGMA foreign_keys = ON, setting these to the
        // logged-in up_users id throws "FOREIGN KEY constraint failed".
        // Production leaves these NULL, so we omit them to match.
      },
    }),
    201
  );
});
