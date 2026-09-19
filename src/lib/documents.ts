// ============================================================================
// documents.ts — Shared helpers for the filesystem-based document store.
//
// The production DB has NO dedicated `documents` table for the
// document-intelligence feature — uploaded files live on disk under
// `upload/<applicantId>/` with a sidecar `.meta.json` per file. This module
// centralizes the meta-sidecar read/list logic so both the applicant-facing
// upload API (`/api/applicant/documents`) and the admin/evaluator-facing
// applicant-details API (`/api/admin/applicants/[id]`) share one implementation.
// ============================================================================

import { uploadDir } from "@/lib/env";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { db } from "@/lib/db";
import type { ValidDocumentCategory } from "@/lib/file-types";
import type { ExtractedPhoto } from "@/lib/pds-photo";

export type DocumentMeta = {
  id: string; // = uuid (no DB primary key)
  applicantId: number;
  uploadedById: number;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  filePath: string; // relative to project root, e.g. "upload/123/uuid.xlsx"
  category: ValidDocumentCategory;
  status: "UPLOADED" | "PROCESSING" | "EXTRACTED" | "PARTIALLY_EXTRACTED" | "FAILED";
  extractedJson?: string | null;
  extractionError?: string | null;
  extractedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  fileTableId?: number | null;
};

/** Read a single `.meta.json` sidecar. Returns null if missing or unparseable. */
export async function readMeta(metaPath: string): Promise<DocumentMeta | null> {
  try {
    const raw = await fs.readFile(metaPath, "utf-8");
    return JSON.parse(raw) as DocumentMeta;
  } catch {
    return null;
  }
}

/** Write a `.meta.json` sidecar (used by the upload route). */
export async function writeMeta(metaPath: string, meta: DocumentMeta): Promise<void> {
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
}

/**
 * List all uploaded documents for an applicant by reading the sidecar JSON
 * files in `upload/<applicantId>/`. Sorted newest-first by `createdAt`.
 * Returns an empty array if the directory does not exist (no uploads yet).
 */
export async function listApplicantDocuments(
  applicantId: number
): Promise<DocumentMeta[]> {
  const dir = path.join(uploadDir(), String(applicantId));
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const metaFiles = entries.filter((f) => f.endsWith(".meta.json"));
  const out: DocumentMeta[] = [];
  for (const f of metaFiles) {
    const m = await readMeta(path.join(dir, f));
    if (m) out.push(m);
  }
  out.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return out;
}

// ============================================================================
// Production `files` / `files_related_mph` table integration (shared).
//
// Uploaded files are mirrored into the legacy `files` table with a polymorphic
// link in `files_related_mph` so new uploads stay consistent with the existing
// production rows. All writes are best-effort: the sidecar JSON on disk is the
// source of truth for the document-intelligence feature — a failed mirror
// insert must never fail the upload.
//
// `field` value follows the existing production convention for
// `related_type = "api::applicant.applicant"` (e.g. "merged_pdf",
// "education_attachment", "profile_picture").
// ============================================================================
export const FILE_RELATED_TYPE_APPLICANT = "api::applicant.applicant";

export const CATEGORY_TO_FILE_FIELD: Record<ValidDocumentCategory, string> = {
  PDS: "merged_pdf",
  RESUME: "merged_pdf",
  EDUCATION: "education_attachment",
  WORK_EXPERIENCE: "work_experience_attachment",
  TRAINING: "training_attachment",
  ELIGIBILITY: "eligibility_attachment",
  AWARD: "award_attachment",
  ACCOMPLISHMENT: "award_attachment",
  COE: "merged_pdf",
  PERFORMANCE_EVALUATION: "merged_pdf",
  SUPPORTING: "merged_pdf",
  PROFILE_PICTURE: "profile_picture",
};

/**
 * Insert a row into the production `files` table mirroring the legacy
 * convention (ms-epoch INTEGER timestamps, KB `size`, `/uploads/<hash><ext>`
 * URL, `provider="local"`, `folder_path="/"`). Returns the new file.id or null
 * if the insert did not produce a row.
 */
export async function insertFileRow(args: {
  originalName: string;
  ext: string;
  mime: string;
  sizeBytes: number;
}): Promise<number | null> {
  const now = Date.now(); // ms-epoch INTEGER — matches production convention
  const documentId = crypto.randomUUID();
  // File hashes use the legacy `<sanitized_name>_<random_hex>` format —
  // namespacing avoids collisions in /uploads/ which is shared across applicants.
  const baseName =
    args.originalName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40) ||
    "file";
  const hash = `${baseName}_${crypto.randomBytes(5).toString("hex")}`;
  // `files.size` stores KB (float), not bytes.
  const sizeKb = Math.round((args.sizeBytes / 1024) * 100) / 100;
  const fileUrl = `/uploads/${hash}${args.ext}`;

  const inserted = await db.$queryRaw<{ id: number }[]>`
    INSERT INTO files (
      document_id, name, ext, mime, folder_path, provider,
      hash, size, url, preview_url,
      width, height,
      created_at, updated_at, published_at,
      created_by_id, updated_by_id, locale
    ) VALUES (
      ${documentId}, ${args.originalName}, ${args.ext}, ${args.mime}, ${"/"}, ${"local"},
      ${hash}, ${sizeKb}, ${fileUrl}, ${null},
      ${null}, ${null},
      ${now}, ${now}, ${now},
      ${null}, ${null}, ${null}
    )
    RETURNING id
  `;
  return inserted[0]?.id ?? null;
}

/**
 * Link a `files` row to an applicant via the `files_related_mph` polymorphic
 * table, mirroring the legacy convention (`related_type =
 * "api::applicant.applicant"`, `field` derived from the upload category).
 */
export async function linkFileToApplicant(
  fileId: number,
  applicantId: number,
  category: ValidDocumentCategory
): Promise<void> {
  const relatedField = CATEGORY_TO_FILE_FIELD[category] ?? "merged_pdf";
  // `order` is a SQL reserved word — quote it as an identifier.
  await db.$executeRaw`
    INSERT INTO files_related_mph (
      file_id, related_id, related_type, field, "order"
    ) VALUES (
      ${fileId}, ${applicantId}, ${FILE_RELATED_TYPE_APPLICANT}, ${relatedField}, ${1}
    )
  `;
}

/**
 * Delete every document of a category for an applicant — binary + sidecar
 * (the `files` mirror rows are left alone: they are best-effort history, and
 * the sidecar/filesystem is the source of truth for this feature).
 * Used for REPLACE semantics, e.g. profile pictures (only the latest shows).
 */
export async function deleteApplicantDocumentsByCategory(
  applicantId: number,
  category: ValidDocumentCategory
): Promise<number> {
  const docs = await listApplicantDocuments(applicantId);
  const doomed = docs.filter((d) => d.category === category);
  for (const d of doomed) {
    try {
      await fs.unlink(path.join(process.cwd(), d.filePath));
    } catch {
      /* binary already gone */
    }
    try {
      await fs.unlink(path.join(uploadDir(), String(applicantId), `${d.id}.meta.json`));
    } catch {
      /* sidecar already gone */
    }
  }
  return doomed.length;
}

/**
 * Persist an auto-extracted profile photo (from a PDS) as a
 * PROFILE_PICTURE document — binary + sidecar + best-effort `files` mirror.
 * Replaces any previous profile picture (latest wins).
 * Returns the sidecar meta on success, null when the write failed.
 */
export async function saveProfilePictureDocument(
  applicantId: number,
  uploadedById: number,
  photo: ExtractedPhoto
): Promise<DocumentMeta | null> {
  try {
    // REPLACE semantics — only one profile picture should exist at a time.
    await deleteApplicantDocumentsByCategory(applicantId, "PROFILE_PICTURE");

    const applicantDir = path.join(uploadDir(), String(applicantId));
    await fs.mkdir(applicantDir, { recursive: true });
    const id = crypto.randomUUID();
    const safeName = `${id}.png`;
    await fs.writeFile(path.join(applicantDir, safeName), photo.data);

    const now = new Date().toISOString();
    const meta: DocumentMeta = {
      id,
      applicantId,
      uploadedById,
      fileName: safeName,
      originalName: `Profile photo (extracted from PDS — ${photo.source})`,
      mimeType: photo.mime,
      size: photo.data.length,
      filePath: `upload/${applicantId}/${safeName}`,
      category: "PROFILE_PICTURE",
      status: "UPLOADED",
      extractedJson: null,
      extractionError: null,
      extractedAt: null,
      createdAt: now,
      updatedAt: now,
      fileTableId: null,
    };

    // Best-effort mirror into `files` / `files_related_mph` (non-fatal).
    try {
      const fileTableId = await insertFileRow({
        originalName: "profile-photo.png",
        ext: ".png",
        mime: photo.mime,
        sizeBytes: photo.data.length,
      });
      if (fileTableId !== null) {
        await linkFileToApplicant(fileTableId, applicantId, "PROFILE_PICTURE");
      }
      meta.fileTableId = fileTableId;
    } catch (mirrorErr) {
      console.error(
        "[documents/profile-picture] Non-fatal: files-table mirror failed:",
        mirrorErr
      );
    }

    await writeMeta(path.join(applicantDir, `${id}.meta.json`), meta);
    return meta;
  } catch (e) {
    console.error(
      "[documents/profile-picture] save failed (non-fatal):",
      e instanceof Error ? e.message : e
    );
    return null;
  }
}
