// ============================================================================
// pds-photo.ts — Extract the 1×1 profile photo from an uploaded PDS document.
// ============================================================================
// The CS Form 212 (PDS) carries a passport-size photo on its first page. When
// the PDS is a digital PDF the photo is an embedded raster XObject; when it is
// an Excel workbook the photo sits in the `xl/media/*` ZIP entries.
//
// This module is AI-FREE on purpose: it must work even when AI_API_KEY is not
// configured, so an applicant whose PDS text extraction fails still gets their
// photo pulled onto their profile. Every failure path returns null — a missing
// photo is an expected, non-fatal outcome (the applicant can always upload one
// manually from the profile header).
//
// Selection heuristics (tuned for CS Form 212 layouts):
//   • scan pages 1–2 of a PDF (the photo is on page 1; page 2 is a fallback
//     for alternate templates)
//   • reject rasters smaller than 60px on either side (icons, bullets, rules)
//   • reject extreme aspect ratios (< 0.3 or > 3.5) — banner strips, dividers
//   • among survivors pick the LARGEST by pixel area — the ID photo dominates
//     every other raster in a real PDS
//   • normalize the winner to PNG via sharp (unpdf hands back raw RGB/Gray
//     pixel data), capped at 800px on the long edge for sane file sizes
// ============================================================================

import { getDocumentProxy, extractImages } from "unpdf";
import sharp from "sharp";
import zlib from "zlib";

export type ExtractedPhoto = {
  data: Buffer;
  mime: "image/png";
  width: number;
  height: number;
  /** Where the photo came from — for logs/sidecar notes. */
  source: string;
};

const MIN_SIDE_PX = 60;
const MIN_RATIO = 0.3;
const MAX_RATIO = 3.5;
const MAX_EDGE_PX = 800;

function isPlausiblePhoto(width: number, height: number): boolean {
  if (!width || !height) return false;
  if (width < MIN_SIDE_PX || height < MIN_SIDE_PX) return false;
  const ratio = width / height;
  return ratio >= MIN_RATIO && ratio <= MAX_RATIO;
}

async function toNormalizedPng(
  input: Buffer,
  raw?: { width: number; height: number; channels: 1 | 3 | 4 },
  source = "unknown"
): Promise<ExtractedPhoto | null> {
  try {
    let pipeline = raw
      ? sharp(input, { raw })
      : sharp(input);
    const meta = await pipeline.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!isPlausiblePhoto(width, height)) return null;
    const data = await pipeline
      .resize(MAX_EDGE_PX, MAX_EDGE_PX, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    // Re-read the post-resize dimensions for accurate sidecar metadata.
    const outMeta = await sharp(data).metadata();
    return {
      data,
      mime: "image/png",
      width: outMeta.width ?? width,
      height: outMeta.height ?? height,
      source,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PDF path — unpdf (serverless pdf.js) hands back raw pixel data per image.
// ---------------------------------------------------------------------------
async function extractPhotoFromPdf(buffer: Buffer): Promise<ExtractedPhoto | null> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const pagesToScan = Math.min(pdf.numPages, 2);
  const candidates: ExtractedPhoto[] = [];
  for (let p = 1; p <= pagesToScan; p++) {
    const images = await extractImages(pdf, p).catch(() => []);
    for (const img of images) {
      if (!img?.data?.length || !img.width || !img.height) continue;
      if (!isPlausiblePhoto(img.width, img.height)) continue;
      const png = await toNormalizedPng(
        Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength),
        { width: img.width, height: img.height, channels: img.channels },
        `pdf-page-${p}`
      );
      if (png) candidates.push(png);
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.width * b.height - a.width * a.height);
  return candidates[0];
}

// ---------------------------------------------------------------------------
// XLSX path — an .xlsx is a plain ZIP; the embedded photo lives under
// `xl/media/`. Minimal central-directory reader (no new dependencies).
// ---------------------------------------------------------------------------
function findEocdOffset(buf: Buffer): number {
  const scanFloor = Math.max(0, buf.length - 22 - 65536);
  for (let i = buf.length - 22; i >= scanFloor; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

function listXlsxMediaEntries(buf: Buffer): Array<{ data: Buffer }> {
  const eocd = findEocdOffset(buf);
  if (eocd < 0) return [];
  const entryCount = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16); // central directory offset
  const out: Array<{ data: Buffer }> = [];
  for (let i = 0; i < entryCount && ptr + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buf.readUInt16LE(ptr + 10);
    const compressedSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString("utf8", ptr + 46, ptr + 46 + nameLen);
    ptr += 46 + nameLen + extraLen + commentLen;

    if (!/^xl\/media\/.+\.(png|jpe?g|gif|webp|bmp)$/i.test(name)) continue;
    if (compressedSize === 0) continue;
    // Local file header: nameLen @26, extraLen @28 — the local extra can
    // differ from the central one, so re-derive the data start here.
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compressedSize);
    try {
      out.push({ data: method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw) });
    } catch {
      /* corrupt entry — skip */
    }
  }
  return out;
}

async function extractPhotoFromXlsx(buffer: Buffer): Promise<ExtractedPhoto | null> {
  const candidates: ExtractedPhoto[] = [];
  for (const entry of listXlsxMediaEntries(buffer)) {
    const png = await toNormalizedPng(entry.data, undefined, "xlsx-media");
    if (png) candidates.push(png);
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.width * b.height - a.width * a.height);
  return candidates[0];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attempt to pull the 1×1 profile photo out of a PDS document.
 * Dispatches on MIME type (PDF → embedded rasters, XLSX → xl/media entries).
 * Returns null when nothing plausible is found — never throws for "no photo".
 * (Unexpected internal errors are caught and logged; the photo is optional.)
 */
export async function extractPdsPhoto(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractedPhoto | null> {
  try {
    const mt = (mimeType || "").toLowerCase();
    if (mt.includes("pdf")) return await extractPhotoFromPdf(buffer);
    if (mt.includes("spreadsheetml") || mt.includes("ms-excel") || mt.includes("excel")) {
      return await extractPhotoFromXlsx(buffer);
    }
    return null;
  } catch (e) {
    console.error(
      "[pds-photo] extraction failed (non-fatal):",
      e instanceof Error ? e.message : e
    );
    return null;
  }
}
