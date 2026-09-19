import { NextRequest, NextResponse } from "next/server";
import { getSessionFromReq, getApplicantIdForUser } from "@/lib/auth";
import { uploadDir } from "@/lib/env";
import { readMeta } from "@/lib/documents";
import fs from "fs/promises";
import path from "path";

// ============================================================================
// GET /api/files/[...path]
//
// Serves an uploaded applicant document from the on-disk upload store
// (`upload/<applicantId>/<uuid>.<ext>`). This route exists because Next.js
// only serves static files from `public/`, but the upload directory lives at
// the project root — so direct links like `/upload/570/uuid.pdf` return 404.
//
// The frontend links documents as `/api/files/${filePath}` where `filePath`
// is e.g. `upload/570/uuid.pdf` (as stored in the `.meta.json` sidecar).
//
// AUTHORIZATION:
//   - APPLICANT  → may only access files under their OWN applicantId directory
//   - EVALUATOR  → may access any applicant's files (read-only review)
//   - ADMIN      → may access any applicant's files
//
// SECURITY:
//   - The resolved absolute path is validated to stay within uploadDir()
//     (prevents `..` path traversal).
//   - `.meta.json` sidecar files are never served (they hold private metadata).
//   - Files are served with `Cache-Control: private, no-store` so browsers
//     never cache sensitive applicant documents.
// ============================================================================

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  // 1. Authenticate — any logged-in user may proceed (role-scoped below).
  const user = await getSessionFromReq(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse the catch-all path segments.
  //    Expected shape: ["upload", "<applicantId>", "<fileName>"]
  //    The leading "upload/" segment comes from the stored `filePath` field.
  const { path: segments } = await ctx.params;
  const decoded = segments.map((s) => decodeURIComponent(s));

  // Strip a leading "upload" segment if present (the stored filePath includes
  // it, e.g. "upload/570/uuid.pdf"). Tolerate either form for robustness.
  let parts = decoded;
  if (parts[0] === "upload") {
    parts = parts.slice(1);
  }

  if (parts.length !== 2) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [applicantIdStr, fileName] = parts;

  // 3. Reject metadata sidecar files — they hold private extraction data and
  //    must never be served to clients. (Defense in depth: the frontend never
  //    links to them, but block direct requests.)
  if (fileName.endsWith(".meta.json")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 4. Validate applicantId is a positive integer.
  const applicantId = parseInt(applicantIdStr, 10);
  if (!Number.isInteger(applicantId) || applicantId <= 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 5. Authorize — applicants can only read their OWN files.
  if (user.role === "APPLICANT") {
    const ownId = await getApplicantIdForUser(parseInt(user.id, 10));
    if (ownId !== applicantId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (user.role !== "EVALUATOR" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 6. Resolve the absolute path — SECURITY: must stay within uploadDir().
  const root = path.resolve(uploadDir());
  const absPath = path.resolve(root, applicantIdStr, fileName);
  if (!absPath.startsWith(root + path.sep)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 7. File must exist and be a regular file.
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(absPath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 8. Read the sidecar `.meta.json` for the correct MIME type + original
  //    filename (so the browser shows the user-facing name, not the uuid).
  const docId = fileName.replace(/\.[^.]+$/, ""); // strip extension → uuid
  const metaPath = path.resolve(root, applicantIdStr, `${docId}.meta.json`);
  const meta = await readMeta(metaPath);

  const mimeType = meta?.mimeType || "application/octet-stream";
  const originalName = meta?.originalName || fileName;

  // 9. Read the file and stream it back. (Max upload size is 10 MB, so reading
  //    into a buffer is acceptable here.)
  const buffer = await fs.readFile(absPath);

  // Content-Disposition: inline so the browser opens it in-page (PDF viewer,
  // image, etc.). Encode filename per RFC 5987 for non-ASCII names.
  const asciiFallback = originalName.replace(/[^\x20-\x7E]/g, "_");
  const encodedName = encodeURIComponent(originalName);

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(stat.size),
      "Content-Disposition": `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`,
      // Sensitive applicant documents — never cache.
      "Cache-Control": "private, no-store",
    },
  });
}
