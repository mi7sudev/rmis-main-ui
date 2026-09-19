/**
 * dedupe-positions.ts — Remove double-imported legacy position rows.
 *
 * Background:
 *   The Strapi→Next.js data migration inserted every plantilla position twice
 *   (consecutive id pairs, e.g. 1636=1637, 1638=1639). The Settings ▸ Positions
 *   screen therefore reported 594 rows while the real number of distinct
 *   plantilla items is ~304.
 *
 * What this script does (idempotent, safe to re-run):
 *   1. Groups `postions` rows by `item_number` (NOT NULL). The canonical row of
 *      each group is the lowest id; every other copy is a duplicate.
 *   2. Also removes the obvious workspace test junk
 *      ("DELETE-ME Workspace Test", item_number IS NULL).
 *   3. Before deleting a duplicate, every row in the 13 link tables that
 *      references the duplicate `postion_id` is repointed to the canonical id.
 *      If the canonical already owns the identical link (same other-key), the
 *      extra link row is deleted instead (collision-aware, avoids double links).
 *   4. Deletes the duplicate position rows inside one transaction.
 *
 * Usage:  bun scripts/dedupe-positions.ts
 */
import { PrismaClient } from "@prisma/client";

const DB_URL = `file:${process.cwd()}/db/production-data.db`;
const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });

/** Link tables that reference postions.id via a `postion_id` column. */
const LINK_TABLES = [
  "up_users_postion_lnk",
  "up_users_postion_update_lnk",
  "applicant_awards_positions_lnk",
  "applicant_accomplishments_positions_lnk",
  "jobpostings_postions_lnk",
  "applicant_interviews_positions_lnk",
  "applicant_interview_assessments_positions_lnk",
  "applicant_examinations_positions_lnk",
  "merged_awards_accomplishments_position_lnk",
  // child tables owned by a position (place of assignment / eligibilities)
  "postions_place_of_assignment_lnk",
  "postions_eligibilities_lnk",
  "postions_specific_eligibilities_lnk",
  "postions_deleted_by_lnk",
] as const;

type LinkRow = Record<string, unknown>;

async function tableColumns(table: string): Promise<string[]> {
  const cols = (await db.$queryRawUnsafe<Array<{ name: string }>>(
    `PRAGMA table_info('${table}')`,
  )) as Array<{ name: string }>;
  return cols.map((c) => c.name);
}

/**
 * Collision-aware move: for a link row currently pointing at `dupId`, point it
 * to `keepId`. If the canonical row already has an identical link (every other
 * column equal), delete the redundant row instead.
 */
async function repoint(
  table: string,
  cols: string[],
  keepId: number,
  dupId: number,
): Promise<{ moved: number; dropped: number }> {
  let moved = 0;
  let dropped = 0;
  const others = cols.filter((c) => c !== "id" && c !== "postion_id");
  const rows = (await db.$queryRawUnsafe<LinkRow[]>(
    `SELECT * FROM ${table} WHERE postion_id = ?`,
    dupId,
  )) as LinkRow[];

  for (const row of rows) {
    // Build the "other key" predicate (e.g. jobposting_id = 12, user_id = 3 …)
    const preds: string[] = [];
    const vals: Array<string | number | null> = [];
    for (const c of others) {
      preds.push(`${c} IS ?`);
      const v = row[c];
      vals.push(v === null || v === undefined ? null : (v as string | number));
    }
    const where =
      `postion_id = ? AND ` + (preds.length ? preds.join(" AND ") : "1=1");
    const whereVals = [keepId, ...vals];

    const existing = (await db.$queryRawUnsafe<LinkRow[]>(
      `SELECT id FROM ${table} WHERE ${where} LIMIT 1`,
      ...whereVals,
    )) as LinkRow[];

    if (existing.length > 0) {
      await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id = ?`, row.id as number);
      dropped++;
    } else {
      await db.$executeRawUnsafe(
        `UPDATE ${table} SET postion_id = ? WHERE id = ?`,
        keepId,
        row.id as number,
      );
      moved++;
    }
  }
  return { moved, dropped };
}

async function main() {
  const S = <T,>(r: unknown) =>
    JSON.parse(
      JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? Number(v) : v)),
    ) as T;

  const before = (S(await db.$queryRawUnsafe<{ c: number }>(
    "SELECT COUNT(*) c FROM postions",
  )))[0].c as number;

  // 1. Duplicate groups by item_number (canonical = lowest id)
  const groups = S(
    await db.$queryRawUnsafe<Array<{ item_number: string; keep: number; ids: string; c: number }>>(
      `SELECT item_number, MIN(id) keep, GROUP_CONCAT(id) ids, COUNT(*) c
       FROM postions WHERE item_number IS NOT NULL
       GROUP BY item_number HAVING c > 1`,
    ),
  );

  // 2. Test junk rows (explicitly named DELETE-ME)
  const junk = S(
    await db.$queryRawUnsafe<Array<{ id: number }>>(
      `SELECT id FROM postions WHERE item_number IS NULL
       AND position_title = 'DELETE-ME Workspace Test'`,
    ),
  );

  type Dup = { keepId: number; dupIds: number[] };
  const dups: Dup[] = [];
  let dupCount = 0;
  for (const g of groups) {
    const ids = String(g.ids)
      .split(",")
      .map(Number)
      .sort((a, b) => a - b);
    dups.push({ keepId: ids[0], dupIds: ids.slice(1) });
    dupCount += ids.length - 1;
  }
  const junkCount = junk.length;

  if (dupCount === 0 && junkCount === 0) {
    console.log("No duplicate or junk positions found — nothing to do.");
    await db.$disconnect();
    return;
  }

  console.log(`Found ${dupCount} duplicate copies in ${groups.length} groups, ${junkCount} junk row(s). Total ${before} → target ${before - dupCount - junkCount}.`);

  // Column cache per link table
  const colCache = new Map<string, string[]>();
  for (const t of LINK_TABLES) {
    try {
      colCache.set(t, await tableColumns(t));
    } catch {
      console.warn(`  (skipping missing table ${t})`);
    }
  }

  await db.$transaction(
    async (tx) => {
      const raw = tx.$queryRawUnsafe.bind(tx);
      const exe = tx.$executeRawUnsafe.bind(tx);

      // 3. Repoint / collapse references for every duplicate copy
      for (const { keepId, dupIds } of dups) {
        for (const dupId of dupIds) {
          for (const [table, cols] of colCache) {
            const refCount = (S(
              await raw(`SELECT COUNT(*) c FROM ${table} WHERE postion_id = ?`, dupId),
            ) as Array<{ c: number }>)[0].c as number;
            if (refCount === 0) continue;
            const r = await repointOn(table, cols, keepId, dupId, exe, raw);
            if (r.moved || r.dropped) {
              console.log(`  ${table}: dup ${dupId} → keep ${keepId} (moved ${r.moved}, collapsed ${r.dropped})`);
            }
          }
        }
      }

      // 4. Delete duplicate + junk rows
      for (const { dupIds } of dups) {
        for (const dupId of dupIds) {
          await exe(`DELETE FROM postions WHERE id = ?`, dupId);
        }
      }
      for (const j of junk) {
        await exe(`DELETE FROM postions WHERE id = ?`, j.id);
      }
    },
    { timeout: 60_000 },
  );

    async function repointOn(
    table: string,
    cols: string[],
    keepId: number,
    dupId: number,
    exe: (q: string, ...v: unknown[]) => Promise<unknown>,
    raw: (q: string, ...v: unknown[]) => Promise<unknown>,
  ): Promise<{ moved: number; dropped: number }> {
    let moved = 0;
    let dropped = 0;
    const others = cols.filter((c) => c !== "id" && c !== "postion_id");
    const rows = S(await raw(`SELECT * FROM ${table} WHERE postion_id = ?`, dupId)) as LinkRow[];
    for (const row of rows) {
      const preds: string[] = [];
      const vals: Array<string | number | null> = [];
      for (const c of others) {
        preds.push(`${c} IS ?`);
        const v = row[c];
        vals.push(v === null || v === undefined ? null : (v as string | number));
      }
      const where = `postion_id = ? AND ` + (preds.length ? preds.join(" AND ") : "1=1");
      const whereVals = [keepId, ...vals];
      const existing = S(await raw(`SELECT id FROM ${table} WHERE ${where} LIMIT 1`, ...whereVals)) as Array<{ id: number }>;
      if (existing.length > 0) {
        await exe(`DELETE FROM ${table} WHERE id = ?`, row.id as number);
        dropped++;
      } else {
        await exe(`UPDATE ${table} SET postion_id = ? WHERE id = ?`, keepId, row.id as number);
        moved++;
      }
    }
    return { moved, dropped };
  }

  // 5. Verification
  const after = (S(await db.$queryRawUnsafe<{ c: number }>(
    "SELECT COUNT(*) c FROM postions",
  )))[0].c as number;
  const remaining = S(
    await db.$queryRawUnsafe<Array<{ item_number: string; c: number }>>(
      `SELECT item_number, COUNT(*) c FROM postions WHERE item_number IS NOT NULL
       GROUP BY item_number HAVING c > 1`,
    ),
  );

  // No orphaned references left
  let orphanRefs = 0;
  for (const t of colCache) {
    const n = (S(
      await db.$queryRawUnsafe<{ c: number }[]>(
        `SELECT COUNT(*) c FROM ${t[0]} WHERE postion_id NOT IN (SELECT id FROM postions)`,
      ),
    ) as Array<{ c: number }>)[0].c as number;
    orphanRefs += n;
    if (n > 0) console.warn(`  ORPHANS in ${t[0]}: ${n}`);
  }

  console.log(`Positions: ${before} → ${after} (removed ${before - after})`);
  console.log(`Remaining duplicate groups: ${remaining.length}`);
  console.log(`Orphaned references: ${orphanRefs}`);
  console.log("Done. Re-run is a no-op.");

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  await db.$disconnect();
  process.exit(1);
});
