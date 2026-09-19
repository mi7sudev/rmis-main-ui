import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { err, ApiError } from "@/lib/api";
import { requireApplicantFromReq, getApplicantIdForUser } from "@/lib/auth";
import { extractFromDocument, countExtractedFields, mergeExtractions } from "@/lib/extraction";
import { extractPdsPhoto } from "@/lib/pds-photo";
import { saveProfilePictureDocument } from "@/lib/documents";
import { uploadDir } from "@/lib/env";
import fs from "fs/promises";
import path from "path";
import type { DocumentCategory } from "@/lib/extraction";

const UPLOAD_ROOT = uploadDir();

// Categories that support meaningful AI extraction.
// Other categories (SUPPORTING, COE, PERFORMANCE_EVALUATION, PROFILE_PICTURE)
// are just attachments — no structured fields to extract.
const EXTRACTABLE_CATEGORIES: ReadonlySet<DocumentCategory> = new Set([
  "PDS",
  "RESUME",
  "EDUCATION",
  "WORK_EXPERIENCE",
  "TRAINING",
  "ELIGIBILITY",
  "AWARD",
  "ACCOMPLISHMENT",
]);

const schema = z.object({
  documentIds: z.array(z.string()).optional(),
  category: z.string().optional(),
});

type DocumentMeta = {
  id: string;
  applicantId: number;
  fileName: string;
  originalName: string;
  filePath: string;
  category: DocumentCategory;
  status: "UPLOADED" | "PROCESSING" | "EXTRACTED" | "PARTIALLY_EXTRACTED" | "FAILED";
  extractedJson?: string | null;
  extractionError?: string | null;
  extractedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Original upload MIME type — used to route PDS photo extraction (PDF vs XLSX). */
  mimeType?: string;
};

async function readMeta(metaPath: string): Promise<DocumentMeta | null> {
  try {
    const raw = await fs.readFile(metaPath, "utf-8");
    return JSON.parse(raw) as DocumentMeta;
  } catch {
    return null;
  }
}

async function writeMeta(metaPath: string, meta: DocumentMeta): Promise<void> {
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
}

// ----------------------------------------------------------------------------
// ERROR VISIBILITY POLICY (see src/lib/api.ts): raw Node/AI error text —
// absolute server paths (ENOENT…), the AI endpoint URL, provider internals —
// must never reach the client OR the persisted meta file. Map every failure
// class to a safe, actionable message; the full raw error stays server-side
// (console.error) for diagnosis.
// ----------------------------------------------------------------------------
function safeExtractionError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: string } | null)?.code ?? "";
  if (
    /^(ENOENT|EACCES|EPERM|EISDIR|EIO)$/.test(code) ||
    /ENOENT|EACCES|EPERM|EISDIR|no such file or directory|permission denied/i.test(raw)
  ) {
    return "The document file could not be read on the server. Please re-upload the document and try again.";
  }
  if (/AI_API_KEY/.test(raw)) {
    return "Document extraction is not configured on this server. Please contact the administrator.";
  }
  if (
    /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|integrate\.api\.nvidia\.com|HTTP \d+/.test(raw)
  ) {
    return "The extraction service could not be reached. Please try again in a few minutes.";
  }
  if (/Conversion failed|Prisma|SQLITE/i.test(raw)) {
    return "This document could not be processed right now. Please try again.";
  }
  return "This document could not be extracted. Try a different file, or contact support if the problem persists.";
}

async function listApplicantDocs(applicantId: number): Promise<DocumentMeta[]> {
  const dir = path.join(UPLOAD_ROOT, String(applicantId));
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
  return out;
}

// =============================================================================
// STREAMING RESPONSE — prevents gateway/proxy timeouts during long extractions.
//
// The VLM/LLM extraction can take 30–60+ seconds for large PDS documents. Most
// HTTP gateways (Caddy, nginx, cloud proxies) cut idle connections after 30–60s
// of no data. To prevent this, we return a ReadableStream that sends a newline
// ("\n") every 5 seconds as a keepalive while the extraction runs. When the
// extraction completes, the final JSON is appended to the stream and the stream
// is closed.
//
// The client's `res.json()` reads the entire body — leading whitespace/newlines
// before the JSON are ignored by the JSON parser, so `JSON.parse("\n\n{...}")`
// works correctly. No client-side changes are needed.
// =============================================================================

export async function POST(req: NextRequest) {
  // ── Phase 1: Auth + validation (before starting the stream) ──
  let user;
  try {
    user = await requireApplicantFromReq(req);
  } catch (e) {
    if (e instanceof ApiError) return err(e.message, e.status);
    return err("Unauthorized", 401);
  }

  let applicantId: number | null = null;
  try {
    applicantId = await getApplicantIdForUser(parseInt(user.id, 10));
  } catch {
    applicantId = null;
  }
  if (!applicantId) return err("Applicant profile not found", 404);

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err("Invalid input", 400, parsed.error.flatten());
  const { documentIds, category } = parsed.data;

  let docs = await listApplicantDocs(applicantId);
  if (documentIds?.length) {
    const idSet = new Set(documentIds);
    docs = docs.filter((d) => idSet.has(d.id));
  } else {
    docs = docs.filter(
      (d) => d.status === "UPLOADED" && EXTRACTABLE_CATEGORIES.has(d.category)
    );
  }
  if (!docs.length) return err("No extractable documents found", 404);

  const applicantDir = path.join(UPLOAD_ROOT, String(applicantId));

  // Mark all as PROCESSING
  for (const doc of docs) {
    doc.status = "PROCESSING";
    doc.updatedAt = new Date().toISOString();
    await writeMeta(path.join(applicantDir, `${doc.id}.meta.json`), doc);
  }

  // ── Phase 2: Streaming response with keepalive ──
  const encoder = new TextEncoder();
  const capturedDocs = docs; // capture for the stream closure
  const capturedCategory = category;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Keepalive: send a newline every 5 seconds to prevent gateway timeout.
      // Newlines before the JSON are ignored by JSON.parse().
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode("\n"));
        } catch {
          // stream already closed — ignore
        }
      }, 5000);

      const results: Array<{
        id: string;
        status: string;
        fieldsExtracted?: number;
        extraction?: unknown;
        error?: string;
      }> = [];
      const extractions: unknown[] = [];

      try {
        for (const doc of capturedDocs) {
          const abs = path.join(process.cwd(), doc.filePath);
          const cat = (capturedCategory || doc.category) as DocumentCategory;
          try {
            const extracted = await extractFromDocument(abs, cat);
            const count = countExtractedFields(extracted);
            const status =
              count === 0 ? "FAILED" : count < 3 ? "PARTIALLY_EXTRACTED" : "EXTRACTED";
            // Zero usable fields usually means the applicant uploaded the
            // BLANK official CS Form 212 template (every non-empty cell in it
            // is form furniture, not data). Give an actionable message instead
            // of a generic "try a clearer scan".
            const zeroFieldError =
              cat === "PDS"
                ? "This looks like a blank CS Form 212 (PDS) template — no filled-out information was found. Please fill it out in Excel, save it, then upload the completed form."
                : "No information could be extracted from this document. Try a clearer scan or a different file.";
            doc.status = status;
            doc.extractedJson = JSON.stringify(extracted);
            doc.extractedAt = new Date().toISOString();
            doc.extractionError = count === 0 ? zeroFieldError : null;
            doc.updatedAt = new Date().toISOString();
            await writeMeta(path.join(applicantDir, `${doc.id}.meta.json`), doc);
            results.push({
              id: doc.id,
              status,
              fieldsExtracted: count,
              extraction: extracted,
              ...(count === 0 ? { error: zeroFieldError } : {}),
            });
            extractions.push(extracted);
          } catch (e) {
            const raw = e instanceof Error ? e.message : String(e);
            const safe = safeExtractionError(e);
            console.error(`[extract] document ${doc.id} failed:`, raw); // server-side only
            doc.status = "FAILED";
            doc.extractionError = safe;
            doc.updatedAt = new Date().toISOString();
            await writeMeta(path.join(applicantDir, `${doc.id}.meta.json`), doc);
            results.push({ id: doc.id, status: "FAILED", error: safe });
          }

          // ── Profile photo extraction (AI-FREE — works without AI_API_KEY) ──
          // Runs for PDS documents regardless of the text-extraction outcome:
          // the 1×1 photo is pulled straight out of the PDF rasters / XLSX
          // media. Replaces any previous profile picture. Every failure is
          // non-fatal — a missing photo is an expected outcome and the
          // applicant can always upload one manually from the profile header.
          if (cat === "PDS") {
            try {
              const bin = await fs.readFile(abs);
              const photo = await extractPdsPhoto(bin, doc.mimeType || "");
              if (photo) {
                const saved = await saveProfilePictureDocument(
                  applicantId,
                  parseInt(user.id, 10),
                  photo
                );
                if (saved) {
                  console.log(
                    `[extract] PDS photo extracted for applicant ${applicantId} (${photo.width}x${photo.height}, ${photo.source})`
                  );
                }
              }
            } catch (photoErr) {
              console.error(
                "[extract] PDS photo extraction failed (non-fatal):",
                photoErr instanceof Error ? photoErr.message : photoErr
              );
            }
          }
        }

        const merged = mergeExtractions(
          extractions.filter(Boolean) as Parameters<typeof mergeExtractions>[0]
        );
        // Send the final JSON — leading newlines from keepalive are ignored by JSON.parse
        const payload = JSON.stringify({ results, merged });
        controller.enqueue(encoder.encode(payload));
      } catch (e) {
        // Catastrophic failure — send an error JSON so the client can handle it.
        // Raw detail stays server-side; the client gets the safe message only.
        const raw = e instanceof Error ? e.message : "Extraction failed";
        console.error("[extract/stream] Catastrophic error:", raw);
        const safe = safeExtractionError(e);
        const errorPayload = JSON.stringify({
          results: capturedDocs.map((d) => ({ id: d.id, status: "FAILED", error: safe })),
          merged: {},
        });
        controller.enqueue(encoder.encode(errorPayload));
      } finally {
        clearInterval(keepalive);
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-Accel-Buffering": "no", // disable nginx buffering (if behind nginx)
      "Cache-Control": "no-cache",
    },
  });
}
