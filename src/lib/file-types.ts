// Shared file-type constants and helpers for document upload/processing.
// Single source of truth so the upload route and extraction service stay in sync.

export const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"] as const;
export const EXCEL_EXTS = [".xlsx", ".xls", ".xlsm"] as const;
export const PDF_EXTS = [".pdf"] as const;
export const WORD_EXTS = [".doc", ".docx"] as const;

export const ALLOWED_UPLOAD_EXTS = [
  ...IMAGE_EXTS,
  ...EXCEL_EXTS,
  ...PDF_EXTS,
  ...WORD_EXTS,
] as const;

export const ALLOWED_UPLOAD_MIMES = [
  "image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
] as const;

export type FileKind = "image" | "excel" | "pdf" | "word" | "unknown";

// Explicit MIME-to-extension map — avoids fragile string splitting.
export const MIME_TO_EXT: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/msword": ".doc",
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpeg",
  "image/jpg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

export function detectFileKind(filePath: string): FileKind {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  if (IMAGE_EXTS.includes(ext as never)) return "image";
  if (EXCEL_EXTS.includes(ext as never)) return "excel";
  if (PDF_EXTS.includes(ext as never)) return "pdf";
  if (WORD_EXTS.includes(ext as never)) return "word";
  return "unknown";
}

// Valid document categories — used by the document upload/extract feature.
// Production schema has NO `Document` model (uploads live in the `files` table),
// so this list is the local source of truth.
export const VALID_DOCUMENT_CATEGORIES = [
  "PDS", "RESUME", "EDUCATION", "WORK_EXPERIENCE", "TRAINING",
  "ELIGIBILITY", "AWARD", "ACCOMPLISHMENT", "COE",
  "PERFORMANCE_EVALUATION", "SUPPORTING", "PROFILE_PICTURE",
] as const;

export type ValidDocumentCategory = (typeof VALID_DOCUMENT_CATEGORIES)[number];

export function isValidDocumentCategory(s: string): s is ValidDocumentCategory {
  return (VALID_DOCUMENT_CATEGORIES as readonly string[]).includes(s);
}
