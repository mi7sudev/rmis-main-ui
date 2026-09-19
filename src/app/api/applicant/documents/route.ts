import { NextRequest } from "next/server";
import { ok, err, handleApi } from "@/lib/api";
import { requireApplicantFromReq, getApplicantIdForUser } from "@/lib/auth";
import { uploadDir } from "@/lib/env";
import { auditLog } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import {
  ALLOWED_UPLOAD_MIMES,
  ALLOWED_UPLOAD_EXTS,
  MIME_TO_EXT,
  isValidDocumentCategory,
  type ValidDocumentCategory,
} from "@/lib/file-types";
import {
  listApplicantDocuments,
  writeMeta,
  insertFileRow,
  linkFileToApplicant,
  deleteApplicantDocumentsByCategory,
  type DocumentMeta,
} from "@/lib/documents";

const UPLOAD_ROOT = uploadDir();
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

// ============================================================================
// Production `files` table integration — the shared helpers (insertFileRow /
// linkFileToApplicant / CATEGORY_TO_FILE_FIELD) live in `@/lib/documents` so
// manual uploads AND auto-extracted profile pictures mirror identically.
//
// `created_at` / `updated_at` / `published_at` are written as INTEGER
// ms-epoch values (via raw SQL) to match the existing production convention —
// Prisma's typed client would store ISO TEXT, creating a mixed-type column.
//
// All writes to `files` / `files_related_mph` are wrapped in try/catch: if the
// DB write fails for any reason (constraint, schema drift, etc.) we must NOT
// fail the upload — the binary is already on disk and the sidecar JSON is the
// source of truth for the upload feature.
// ============================================================================

// ============================================================================
// Sidecar JSON layout.
//
// The production DB has NO dedicated `documents` table for the
// document-intelligence feature — uploaded files are stored in the `files`
// table with a polymorphic relation in `files_related_mph`. We DO write to
// `files` + `files_related_mph` (see helpers below) so the upload stays
// compatible with the existing production data, but the local
// document-intelligence feature also needs richer metadata (extraction
// status, category, extracted JSON) that doesn't fit the `files` schema. That
// extra metadata is persisted as a sidecar JSON file in the upload directory
// (one metadata file per uploaded document).
//
// Directory layout:
//   upload/<applicantId>/<uuid>.<ext>          ← the binary file
//   upload/<applicantId>/<uuid>.meta.json      ← metadata sidecar
//
// The shared read/write/list helpers live in `@/lib/documents` so both this
// applicant-facing upload route and the admin/evaluator-facing
// `/api/admin/applicants/[id]` route use one implementation.
// ============================================================================

export const GET = handleApi(async (req: NextRequest) => {
  const user = await requireApplicantFromReq(req);
  const applicantId = await getApplicantIdForUser(parseInt(user.id, 10));
  if (!applicantId) return err("Applicant profile not found", 404);
  const docs = await listApplicantDocuments(applicantId);
  return ok(docs);
});

export const POST = handleApi(async (req: NextRequest) => {
  const user = await requireApplicantFromReq(req);
  const applicantId = await getApplicantIdForUser(parseInt(user.id, 10));
  if (!applicantId) return err("Applicant profile not found", 404);

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const rawCategory = (formData.get("category") as string) || "SUPPORTING";

  if (!isValidDocumentCategory(rawCategory)) {
    return err(`Invalid document category: ${rawCategory}`, 400);
  }
  const category = rawCategory;

  if (!file) return err("No file provided", 400);
  if (file.size > MAX_SIZE) return err("File too large (max 10MB)", 413);

  // PROFILE_PICTURE uses REPLACE semantics — only the latest photo shows as
  // the avatar, so older ones would just be clutter. Remove previous pictures
  // before the new one lands.
  if (category === "PROFILE_PICTURE") {
    try {
      await deleteApplicantDocumentsByCategory(applicantId, "PROFILE_PICTURE");
    } catch (replaceErr) {
      console.error(
        "[documents/upload] Non-fatal: failed to remove previous profile picture:",
        replaceErr
      );
    }
  }

  const ext = path.extname(file.name).toLowerCase();
  const isKnownMime = (ALLOWED_UPLOAD_MIMES as readonly string[]).includes(file.type);
  const isGenericMime = file.type === "application/octet-stream" || file.type === "";
  const isKnownExt = (ALLOWED_UPLOAD_EXTS as readonly string[]).includes(ext);

  if (!isKnownMime) {
    if (!isGenericMime) {
      return err(
        `Unsupported file type: ${file.type}. Supported: images (PNG/JPEG/GIF/WebP), PDF, Word (.doc/.docx), Excel (.xlsx/.xls)`,
        415
      );
    }
    if (!isKnownExt) {
      return err(
        `Unsupported file: ${file.name}. Allowed extensions: ${ALLOWED_UPLOAD_EXTS.join(", ")}`,
        415
      );
    }
  }

  let mimeType = file.type;
  if ((!mimeType || isGenericMime) && isKnownExt) {
    mimeType =
      ext === ".xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : ext === ".xls"
        ? "application/vnd.ms-excel"
        : ext === ".docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : ext === ".doc"
        ? "application/msword"
        : ext === ".pdf"
        ? "application/pdf"
        : ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".gif"
        ? "image/gif"
        : ext === ".webp"
        ? "image/webp"
        : "application/octet-stream";
  }
  const safeExt = ext || MIME_TO_EXT[mimeType] || ".bin";

  // SECURITY: Sanitize extension — strip any path traversal characters
  // (path.extname should already be safe, but defense in depth)
  const sanitizedExt = path.basename(safeExt);

  // Per-applicant directory + uuid-based filename
  const applicantDir = path.join(UPLOAD_ROOT, String(applicantId));
  await fs.mkdir(applicantDir, { recursive: true });
  const id = crypto.randomUUID();
  const safeName = `${id}${sanitizedExt}`;
  const filePath = path.join(applicantDir, safeName);
  const relPath = `upload/${applicantId}/${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  const now = new Date().toISOString();
  const meta: DocumentMeta = {
    id,
    applicantId,
    uploadedById: parseInt(user.id, 10),
    fileName: safeName,
    originalName: file.name,
    mimeType,
    size: file.size,
    filePath: relPath,
    category,
    status: "UPLOADED",
    extractedJson: null,
    extractionError: null,
    extractedAt: null,
    createdAt: now,
    updatedAt: now,
    fileTableId: null,
  };

  // ------------------------------------------------------------------------
  // Write to the production `files` + `files_related_mph` tables so the
  // upload is visible to any code that reads those tables.
  // Non-fatal: if either insert throws, we log and continue — the binary is
  // already on disk and the sidecar JSON remains the source of truth.
  // ------------------------------------------------------------------------
  try {
    const fileTableId = await insertFileRow({
      originalName: file.name,
      ext: sanitizedExt,
      mime: mimeType,
      sizeBytes: file.size,
    });
    if (fileTableId !== null) {
      await linkFileToApplicant(fileTableId, applicantId, category);
    }
    meta.fileTableId = fileTableId;
  } catch (fileDbErr) {
    console.error(
      "[documents/upload] Non-fatal: failed to write to files / files_related_mph:",
      fileDbErr
    );
  }

  await writeMeta(path.join(applicantDir, `${id}.meta.json`), meta);

  // Audit: applicant uploaded a document
  await auditLog({
    userId: user.id,
    userLabel: user.name ? `${user.name} (${user.email})` : user.email,
    userRole: user.role,
    action: "DOCUMENT_UPLOADED",
    entityType: "document",
    entityId: id,
    description: `Uploaded ${category} document: ${file.name}`,
    ipAddress: getClientIp(req),
  });

  return ok(meta, 201);
});

