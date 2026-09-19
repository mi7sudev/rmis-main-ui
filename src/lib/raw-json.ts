/**
 * raw-json.ts — Helper for reading SQLite `json`-typed columns.
 *
 * WHY THIS EXISTS:
 * Prisma 6.11's SQLite connector throws "Conversion failed: Value json not
 * supported" whenever a query returns a row with NULL in a `json`-declared
 * SQLite column. To work around this, the Prisma schema declares every
 * `json`-typed column as `Unsupported("json")?`, which makes Prisma skip
 * the column entirely — so it's NOT included in Prisma client query results.
 *
 * To READ a json column's value, this helper opens a SEPARATE read-only
 * connection to the same SQLite database via `better-sqlite3` and fetches
 * the value as a plain string. The caller can `JSON.parse()` it if needed.
 *
 * Example:
 *   import { getApplicantCharacterReference } from '@/lib/raw-json'
 *   const raw = await getApplicantCharacterReference(148)  // string | null
 *   const refs = raw ? JSON.parse(raw) as Array<...> : []
 */

import Database from "better-sqlite3";
import { sqliteFilePath } from "@/lib/env";

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  // DATABASE_URL is validated as a `file:` URL in @/lib/env, so sqliteFilePath()
  // always returns a usable filesystem path here. This works identically on
  // localhost dev and the intranet production server (both use SQLite files).
  _db = new Database(sqliteFilePath(), { readonly: true, fileMustExist: true });
  return _db;
}

/** Read applicants.character_reference (json column) as a raw string. */
export function getApplicantCharacterReference(applicantId: number): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT character_reference AS v FROM applicants WHERE id = ? LIMIT 1")
    .get(applicantId) as { v: string | null } | undefined;
  return row?.v ?? null;
}

/** Read applications.snapshot_profile (json column) as a raw string. */
export function getApplicationSnapshotProfile(applicationId: number): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT snapshot_profile AS v FROM applications WHERE id = ? LIMIT 1")
    .get(applicationId) as { v: string | null } | undefined;
  return row?.v ?? null;
}

/** Read all snapshot_* json columns for an application in one round-trip. */
export function getApplicationSnapshots(applicationId: number): {
  profile: string | null;
  awards: string | null;
  experiences: string | null;
  trainings: string | null;
  eligibilities: string | null;
  educations: string | null;
  attachment: string | null;
} {
  const db = getDb();
  const row = db
    .prepare(`
      SELECT snapshot_profile, snapshot_awards, snapshot_experiences,
             snapshot_trainings, snapshot_eligibilities, snapshot_educations,
             snapshot_attachment
      FROM applications WHERE id = ? LIMIT 1
    `)
    .get(applicationId) as {
      snapshot_profile: string | null;
      snapshot_awards: string | null;
      snapshot_experiences: string | null;
      snapshot_trainings: string | null;
      snapshot_eligibilities: string | null;
      snapshot_educations: string | null;
      snapshot_attachment: string | null;
    } | undefined;
  if (!row) {
    return {
      profile: null, awards: null, experiences: null, trainings: null,
      eligibilities: null, educations: null, attachment: null,
    };
  }
  return {
    profile: row.snapshot_profile,
    awards: row.snapshot_awards,
    experiences: row.snapshot_experiences,
    trainings: row.snapshot_trainings,
    eligibilities: row.snapshot_eligibilities,
    educations: row.snapshot_educations,
    attachment: row.snapshot_attachment,
  };
}

/**
 * Read the four credential snapshot columns for MANY applications in one
 * round-trip (used by the evaluator queue to compute per-row requirements
 * match summaries). Returns a map keyed by application id; ids with no row
 * are absent from the map.
 */
export function getApplicationsSnapshotCore(ids: number[]): Map<
  number,
  {
    educations: string | null;
    experiences: string | null;
    trainings: string | null;
    eligibilities: string | null;
  }
> {
  const out = new Map<
    number,
    {
      educations: string | null;
      experiences: string | null;
      trainings: string | null;
      eligibilities: string | null;
    }
  >();
  if (ids.length === 0) return out;
  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT id, snapshot_educations, snapshot_experiences,
              snapshot_trainings, snapshot_eligibilities
       FROM applications WHERE id IN (${placeholders})`,
    )
    .all(...ids) as {
    id: number;
    snapshot_educations: string | null;
    snapshot_experiences: string | null;
    snapshot_trainings: string | null;
    snapshot_eligibilities: string | null;
  }[];
  for (const r of rows) {
    out.set(r.id, {
      educations: r.snapshot_educations,
      experiences: r.snapshot_experiences,
      trainings: r.snapshot_trainings,
      eligibilities: r.snapshot_eligibilities,
    });
  }
  return out;
}

/** Read postions.competency_requirements_richtext (json column) as a raw string. */
export function getPositionCompetencyRequirementsRichtext(positionId: number): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT competency_requirements_richtext AS v FROM postions WHERE id = ? LIMIT 1")
    .get(positionId) as { v: string | null } | undefined;
  return row?.v ?? null;
}

/** Read evaluation_criterias.{education,training,work_exp}_criteria json columns. */
export function getEvaluationCriteriaJson(criteriaId: number): {
  education: string | null;
  training: string | null;
  workExp: string | null;
} {
  const db = getDb();
  const row = db
    .prepare(`
      SELECT education_criteria, training_criteria, work_exp_criteria
      FROM evaluation_criterias WHERE id = ? LIMIT 1
    `)
    .get(criteriaId) as {
      education_criteria: string | null;
      training_criteria: string | null;
      work_exp_criteria: string | null;
    } | undefined;
  if (!row) return { education: null, training: null, workExp: null };
  return {
    education: row.education_criteria,
    training: row.training_criteria,
    workExp: row.work_exp_criteria,
  };
}

/** Read files.formats (json column) as a raw string. */
export function getFileFormats(fileId: number): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT formats AS v FROM files WHERE id = ? LIMIT 1")
    .get(fileId) as { v: string | null } | undefined;
  return row?.v ?? null;
}

/** Read files.provider_metadata (json column) as a raw string. */
export function getFileProviderMetadata(fileId: number): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT provider_metadata AS v FROM files WHERE id = ? LIMIT 1")
    .get(fileId) as { v: string | null } | undefined;
  return row?.v ?? null;
}
