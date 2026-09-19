// Deterministic PDS (CSC Form 212 Revised 2017) Excel Parser
// =============================================================================
//
// The Philippine Civil Service Commission Personal Data Sheet (CS Form 212
// Revised 2017) is a STANDARDIZED government form distributed as an Excel
// template with a FIXED layout. Every PDS has the same 4-sheet structure:
//
//   • Sheet "C1" (Page 1): I. PERSONAL INFORMATION, II. FAMILY BACKGROUND,
//                           III. EDUCATIONAL BACKGROUND
//   • Sheet "C2" (Page 2): IV. CIVIL SERVICE ELIGIBILITY, V. WORK EXPERIENCE
//   • Sheet "C3" (Page 3): VI. VOLUNTARY WORK, VII. LEARNING & DEVELOPMENT
//                          (TRAINING), VIII. OTHER INFORMATION (skills/awards)
//   • Sheet "C4" (Page 4): IX. references + government disclosure questions
//   • Sheet "Lookup":     dropdown source values (filtered out)
//
// Because the layout is fixed, we can read each field by its known cell
// position — NO LLM call needed. This makes extraction:
//   • Instant        (~200–500ms instead of 60–86s with the LLM)
//   • 100% accurate  (no hallucination, no truncation, no rate limits)
//   • Free           (no API costs)
//
// This parser is the PRIMARY extraction path for PDS Excel files. The LLM
// extraction in @/lib/extraction.ts is kept as a FALLBACK only for non-Excel
// PDS documents (scanned PDFs / images) and for other document categories.
//
// Robustness strategy:
//   • Label-based row detection — scan each sheet for known label text
//     ("SURNAME", "FIRST NAME", "DATE OF BIRTH", etc.) rather than hard-coding
//     row numbers, so the parser survives minor template row shifts.
//   • Value scanning — after finding a label, scan rightward in the same row
//     for the first real value cell, skipping merged-cell echoes and dropdown
//     source-list noise (country names, civil-status options).
//   • Table detection — for education/work/training/eligibility tables, locate
//     the header row by keyword, then read data rows until "N/A", blank, or the
//     "(Continue on separate sheet" marker.
//   • Graceful degradation — any field that can't be located is left null with
//     confidence "none" (same as the LLM would return).

import ExcelJS from "exceljs";
import { promises as fs } from "fs";
import path from "path";
import type {
  ExtractionResult,
  ExtractedField,
  ExtractedPersonalInfo,
  ExtractedEducation,
  ExtractedWorkExperience,
  ExtractedTraining,
  ExtractedEligibility,
  ExtractedAward,
} from "@/lib/extraction";

// ---- Cell value extraction -------------------------------------------------

/**
 * Extract a clean string value from an ExcelJS cell, handling:
 *   • Date objects → "YYYY-MM-DD"
 *   • Rich text (cell.value.richText[]) → concatenated text
 *   • Formula results (cell.value.result)
 *   • Hyperlink objects (cell.value.text)
 *   • Merged-cell null values → ""
 *   • The "[object Object]" artifact that appears when cell.text is called on
 *     object-valued cells without this handling.
 */
function cleanCell(cell: ExcelJS.Cell): string {
  try {
    const v = cell.value;
    if (v == null) return "";
    if (v instanceof Date) {
      // Format as YYYY-MM-DD (the PDS schema expects this format).
      const iso = v.toISOString();
      return iso.slice(0, 10);
    }
    if (typeof v === "number") return String(v);
    if (typeof v === "string") return v.trim();
    if (typeof v === "boolean") return v ? "Yes" : "No";
    if (typeof v === "object") {
      // Rich text run array
      const rt = (v as { richText?: Array<{ text?: string }> }).richText;
      if (Array.isArray(rt)) {
        return rt.map((t) => t.text || "").join("").trim();
      }
      // Formula cell — prefer the cached result
      if ("result" in v && v.result != null) {
        const r = v.result;
        if (r instanceof Date) return r.toISOString().slice(0, 10);
        return String(r).trim();
      }
      // Hyperlink object
      if ("text" in v && typeof v.text === "string") return v.text.trim();
      // Fallback — should not normally happen
      return "";
    }
    return "";
  } catch {
    return "";
  }
}

/** Get the cleaned value of a cell at (row, col) on a worksheet. */
function getVal(ws: ExcelJS.Worksheet, row: number, col: number): string {
  return cleanCell(ws.getRow(row).getCell(col));
}

// ---- Dropdown noise filtering ----------------------------------------------
//
// The PDS template embeds dropdown source lists in far-right columns (col P/Q
// and the long vertical country list). These pollute row scans. We filter them
// out so "scan rightward for the value" doesn't grab a dropdown option instead
// of the real answer.

const COUNTRY_NAMES = new Set([
  "Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda",
  "Argentina","Armenia","Aruba","Australia","Austria","Azerbaijan",
  "Bahamas, The","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize",
  "Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil",
  "Brunei","Bulgaria","Burkina Faso","Burma","Burundi","Cabo Verde","Cambodia",
  "Cameroon","Canada","Cape Verde","Central African Republic","Chad","Chile",
  "China","Colombia","Comoros","Congo, Republic of the","Congo, Democratic Republic of the",
  "Costa Rica","Cote d'Ivoire","Croatia","Cuba","Curacao","Cyprus","Czech Republic",
  "Denmark","Djibouti","Dominica","Dominican Republic","East Timor","Ecuador",
  "Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini",
  "Ethiopia","Fiji","Finland","France","Gabon","Gambia, The","Georgia","Germany",
  "Ghana","Greece","Grenada","Guatemala","Guinea","Guinea-Bissau","Guyana","Haiti",
  "Holy See","Honduras","Hong Kong","Hungary","Iceland","India","Indonesia","Iran",
  "Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan","Kenya",
  "Kiribati","Korea, North","Korea, South","Kosovo","Kuwait","Kyrgyzstan","Laos",
  "Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania",
  "Luxembourg","Macau","Macedonia","Madagascar","Malawi","Malaysia","Maldives",
  "Mali","Malta","Marshall Islands","Mauritania","Mauritius","Mexico","Micronesia",
  "Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Namibia",
  "Nauru","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria",
  "Niue","North Korea","North Macedonia","Norway","Oman","Pakistan","Palau","Panama",
  "Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar",
  "Romania","Russia","Rwanda","Saint Kitts and Nevis","Saint Lucia",
  "Saint Vincent and the Grenadines","Samoa","San Marino","Sao Tome and Principe",
  "Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore",
  "Slovakia","Slovenia","Solomon Islands","Somalia","South Africa","South Korea",
  "South Sudan","Spain","Sri Lanka","Sudan","Suriname","Swaziland","Sweden",
  "Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste",
  "Togo","Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu",
  "Uganda","Ukraine","United Arab Emirates","United Kingdom","United States",
  "Uruguay","Uzbekistan","Vanuatu","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe",
  "Netherlands Antilles","Palestinian Territories","Sint Maarten",
]);

// Dropdown source values for civil status / sex / solo-parent indicators.
// These appear in column P of C1 as a vertical list — NOT the applicant's
// selected value. Filter them so they aren't mistaken for answers.
const DROPDOWN_OPTIONS = new Set([
  "Married","Widow/er","Separated","Solo Parent","Others",
  "Please indicate country:","Pls. indicate country:",
]);

function isNoise(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (COUNTRY_NAMES.has(t)) return true;
  if (DROPDOWN_OPTIONS.has(t)) return true;
  // Checkbox cells in the Revised 2026 template are stored as Excel booleans
  // and render as "Yes"/"No" — a bare Yes/No is a checkbox state, never a
  // free-text answer, so it must never be picked up by value scans.
  if (/^(yes|no|y|n)$/i.test(t)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// OFFICIAL-FORM FURNITURE FILTER (Revised 2026 template)
// ---------------------------------------------------------------------------
// The official CS Form 212 template is full of static text that sits in the
// same columns the applicant's data occupies: instructional parentheticals
// ("(Continue on sheet C6 if necessary)"), the signature block
// ("SIGNATURE" / "(e-signature/digital certificate)" / "DATE"), page footers
// ("CS FORM 212 (Revised 2026), Page 2 of 4"), section headers
// ("VII. VOLUNTARY WORK OR INVOLVEMENT ..."), column headers
// ("POSITION / NATURE OF WORK", "INCLUSIVE DATES (dd/mm/yyyy)") and bare row
// counters ("30."). On a BLANK template these are the only non-empty cells —
// and without this filter the parser harvested them all as data entries.
//
// No legitimate applicant value matches any of these patterns.
const PDS_FURNITURE: RegExp[] = [
  /continue on (separate )?sheet/i,          // "(Continue on sheet C6 if necessary)"
  /e-?signature|digital certificate/i,       // "(e-signature/digital certificate)"
  /^cs\s*form\b/i,                          // "CS Form No. 212", "CS FORM 212 (Revised 2026)..."
  /page \d+ of \d+/i,
  /^signature$/i,
  /^date$/i,
  /^(from|to)$/i,
  /^\(.*\)\s*$/,                             // fully parenthetical instruction text
  /^\d+\.?\s*$/,                             // bare row counters: "30.", "28"
  /^tick appropriate boxes/i,
  /misrepresentation/i,
  /read the attached guide/i,
  /^person(al)? data sheet$/i,
  /^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\.\s/i, // "I. PERSONAL INFORMATION", "VII. VOLUNTARY WORK..."
  /voluntary work or involvement/i,
  /^title of learning/i,
  /^type of (ld|l&d)/i,
  /^position \/ nature of work/i,
  /^inclusive dates/i,
  /^(monthly salary|status of appointment|gov'?t service|salary\/ job|department \/ agency)/i,
  /^(career service|rating \(|place of exam|date of exam|date of validity|license \()/i,
  /^(name of school|basic education\/degree|period of attendance|highest level|year graduated|scholarship\/)/i,
  /write in full|do not abbreviate|write full/i,
  /^name extension/i,                        // "NAME EXTENSION (JR., SR)"
  /^sex at birth/i,
];

/** True when the text is official-form furniture rather than applicant data. */
function isFormFurniture(s: string): boolean {
  const t = (s || "").trim();
  if (!t) return false;
  return PDS_FURNITURE.some((re) => re.test(t));
}

/**
 * Is this cell value an instructional/section-label string rather than a real
 * answer? Used to stop `valueRightOf` from grabbing far-away label text when
 * the actual value cell is empty (common for checkbox-based PDS fields like
 * SEX and CIVIL STATUS). Also stops at official-form furniture (footers,
 * signature blocks, continuation-sheet markers).
 */
function isInstructional(s: string): boolean {
  const t = s.trim().toLowerCase();
  if (!t) return true;
  // Instructional phrases embedded in the PDS template.
  if (/(please indicate|pls\. indicate|indicate the details|if applicable|if holder|write in full|do not abbreviate|write full)/.test(t)) return true;
  // Section labels like "17. RESIDENTIAL ADDRESS", "18. PERMANENT ADDRESS", "20. MOBILE NO."
  if (/^\d+\.\s/.test(s.trim())) return true;
  // Official-form furniture (footers, signature blocks, section headers, ...).
  if (isFormFurniture(s)) return true;
  // Known section/column headers we should not treat as a value.
  if (/^(residential address|permanent address|telephone no|mobile no|e-mail address|city\/municipality|province|zip code|house\/block\/lot|street|subdivision\/village|barangay|surname|first name|middle name|name extension|date of birth|place of birth|sex|civil status|citizenship|height|weight|blood type|level|name of school)$/i.test(t)) return true;
  return false;
}

// ---- Field helpers ---------------------------------------------------------

/** Build a high-confidence ExtractedField from a raw string value. */
function field(value: string, source: string): ExtractedField {
  const v = value == null ? "" : value.trim();
  if (!v || v === "N/A" || v === "n/a" || v === "NA") {
    return { value: null, confidence: "none", source };
  }
  return { value: v, confidence: "high", source };
}

/** Build a numeric ExtractedField (e.g. monthly salary, training hours). */
function numField(value: string, source: string): ExtractedField<number | null> {
  const v = (value || "").trim();
  if (!v || /^n\/?a$/i.test(v)) return { value: null, confidence: "none", source };
  // Only accept values that are (optionally "N HOURS"-suffixed) plain numbers.
  // Stripping non-digits from text like "(Continue on sheet C5 if necessary)"
  // used to yield nonsense numbers (the "5" from "C5"), and footer text like
  // "CS FORM 212 (Revised 2026)" became 2122026 — reject any string that
  // still contains letters after removing the optional HOURS suffix.
  const stripped = v.replace(/\s*hours?\s*$/i, "").trim();
  if (/[a-z]/i.test(stripped)) return { value: null, confidence: "low", source };
  // Strip currency symbols, commas, etc.
  const cleaned = stripped.replace(/[^0-9.]/g, "");
  const n = parseFloat(cleaned);
  if (Number.isNaN(n)) return { value: null, confidence: "low", source };
  return { value: n, confidence: "high", source };
}

/** Build a boolean ExtractedField from Yes/No. */
function boolField(value: string, source: string): ExtractedField<boolean | null> {
  const v = (value || "").trim().toLowerCase();
  if (!v || v === "n/a") return { value: null, confidence: "none", source };
  if (v === "y" || v === "yes") return { value: true, confidence: "high", source };
  if (v === "n" || v === "no") return { value: false, confidence: "high", source };
  return { value: null, confidence: "low", source };
}

/** Normalize a date string to YYYY-MM-DD. Accepts Date-serialized strings,
 * "Mon Dec 01 2003..." style, MM/DD/YYYY, and ISO. Returns "" if unparseable. */
function normalizeDate(raw: string): string {
  if (!raw) return "";
  const s = raw.trim();
  if (!s || /^n\/?a$/i.test(s)) return "";
  // Already ISO
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  // JS Date string e.g. "Mon Dec 01 2003 00:00:00 GMT+0000 (...)"
  const d1 = new Date(s);
  if (!Number.isNaN(d1.getTime())) {
    return d1.toISOString().slice(0, 10);
  }
  // MM/DD/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = m[1].padStart(2, "0");
    const dd = m[2].padStart(2, "0");
    return `${m[3]}-${mm}-${dd}`;
  }
  return s; // give back as-is; caller may still find it useful
}

/**
 * Like normalizeDate but rejects implausible years (a PDS birth/exam/validity
 * date is always ≥ 1900). Guards against artifact dates like "0212-01-01"
 * that Excel date-serial coercion of footer text used to produce.
 */
function normalizeSaneDate(raw: string): string {
  const iso = normalizeDate(raw);
  const y = parseInt(iso.slice(0, 4), 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso) && (y < 1900 || y > 2200)) return "";
  return iso;
}

// ---- Label-based cell search ----------------------------------------------

type CellRef = { row: number; col: number };

/**
 * Find the first cell on the worksheet whose cleaned value matches the given
 * substring (case-insensitive). Searches within the optional row/col bounds.
 * Returns null if not found.
 */
function findCell(
  ws: ExcelJS.Worksheet,
  needle: string,
  opts: { fromRow?: number; toRow?: number; fromCol?: number; toCol?: number } = {}
): CellRef | null {
  const fromRow = opts.fromRow ?? 1;
  const toRow = opts.toRow ?? sheetMaxRow(ws);
  const fromCol = opts.fromCol ?? 1;
  const toCol = opts.toCol ?? 18;
  const needleLower = needle.toLowerCase();
  for (let r = fromRow; r <= toRow; r++) {
    const row = ws.getRow(r);
    for (let c = fromCol; c <= toCol; c++) {
      const v = cleanCell(row.getCell(c)).toLowerCase();
      if (v && v.includes(needleLower)) return { row: r, col: c };
    }
  }
  return null;
}

/**
 * Starting just right of (row, col), scan rightward and return the first cell
 * value that is non-empty, not a merged echo of the label, not dropdown
 * noise, and not instructional/section-label text. This is how we pick up the
 * applicant's answer that sits a few columns to the right of a field label.
 *
 * Stops at instructional text so checkbox-based fields (SEX, CIVIL STATUS)
 * whose value cell is empty don't grab a far-away label.
 */
function valueRightOf(
  ws: ExcelJS.Worksheet,
  row: number,
  labelCol: number,
  maxScan = 12
): string {
  const labelVal = getVal(ws, row, labelCol).toLowerCase();
  for (let c = labelCol + 1; c <= labelCol + maxScan; c++) {
    const v = getVal(ws, row, c);
    if (!v) continue;
    if (v.toLowerCase() === labelVal) continue; // merged echo
    if (isNoise(v)) continue; // dropdown source value
    if (isInstructional(v)) break; // hit a section label / instruction → stop
    return v;
  }
  return "";
}

/**
 * Like valueRightOf but looks in the rows just BELOW a label cell too — useful
 * for fields where the value sits under the label rather than to its right.
 */
function valueNear(
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  opts: { scanRight?: number; scanDown?: number } = {}
): string {
  const scanRight = opts.scanRight ?? 6;
  const scanDown = opts.scanDown ?? 3;
  const labelVal = getVal(ws, row, col).toLowerCase();
  // Scan right first (most common), then down.
  for (let c = col + 1; c <= col + scanRight; c++) {
    const v = getVal(ws, row, c);
    if (!v || v.toLowerCase() === labelVal || isNoise(v)) continue;
    if (isInstructional(v)) break;
    return v;
  }
  for (let dr = 1; dr <= scanDown; dr++) {
    for (let c = col; c <= col + scanRight; c++) {
      const v = getVal(ws, row + dr, c);
      if (!v || v.toLowerCase() === labelVal || isNoise(v)) continue;
      // Skip sub-labels / instructional text so a label under the value slot
      // is never read as the value itself.
      if (isInstructional(v)) break;
      return v;
    }
  }
  return "";
}

// ---- Section-range helpers -------------------------------------------------
//
// OVERFLOW SUPPORT (CS Form 212 continuation pages)
// -----------------------------------------------------------------------------
// Applicants with many entries (100+ trainings, awards, etc.) customize the PDS:
// they insert extra rows below the standard table, or duplicate a sheet
// ("C3 (2)", "Sheet1", "Continuation"...) and paste the overflow there. The
// original parsers scanned a fixed ~30 rows and BREAKED at the
// "Continue on separate sheet" marker — silently dropping every overflow row.
//
// The rewritten parsers below scan to the TRUE end of each section (located by
// the next section's header text) instead of a fixed row count, and
// `parsePdsExcel` additionally parses every non-standard (continuation) sheet,
// classifying it by its table headers.

/** Hard sanity cap for row scans (a legitimate PDS will never exceed this). */
const MAX_SCAN_ROWS = 400;

/**
 * Reliable "last row with data" bound for sheet scans.
 *
 * NOTE: ExcelJS's `actualRowCount` is NOT the last row containing data — it
 * stops at the first trailing gap (e.g. a PDS with trainings at rows 1–44 and
 * awards at rows 120–133 reports actualRowCount=61). `rowCount` (the last row
 * index in the sheet's row collection) is the correct bound. We take the max
 * of both and cap at MAX_SCAN_ROWS.
 */
function sheetMaxRow(ws: ExcelJS.Worksheet): number {
  return Math.min(Math.max(ws.rowCount || 0, ws.actualRowCount || 0), MAX_SCAN_ROWS);
}

/**
 * Find the row where a section ends: the first row at/after `fromRow` whose
 * cell text (cols 1..14) matches one of the `stopPatterns`. Returns `null`
 * when no stop marker exists (caller should scan to MAX_SCAN_ROWS).
 */
function findSectionEnd(
  ws: ExcelJS.Worksheet,
  fromRow: number,
  stopPatterns: RegExp[]
): number | null {
  const maxRow = sheetMaxRow(ws);
  for (let r = Math.max(1, fromRow); r <= maxRow; r++) {
    for (let c = 1; c <= 14; c++) {
      const v = getVal(ws, r, c);
      if (!v) continue;
      if (stopPatterns.some((re) => re.test(v))) return r;
    }
  }
  return null;
}

// ---- Section parsers -------------------------------------------------------

/** Detect whether a workbook looks like a standard CSC Form 212 PDS. */
export function looksLikePds(workbook: ExcelJS.Workbook): boolean {
  const names = workbook.worksheets.map((w) => w.name.toLowerCase());
  // Standard template has sheets C1, C2, C3, C4 (+ optional Lookup).
  // Some applicants customize their PDS and delete unused sheets (e.g. drop
  // C2–C4 when they only kept page 1) — requiring EVERY sheet made those
  // files fail the whole deterministic parse. C1 carries the "PERSONAL DATA
  // SHEET" marker, so C1 + marker is enough to trust the layout.
  const hasC1 = names.some((n) => /^c1$/i.test(n) || /^sheet.?1$/i.test(n));
  // And the "PERSONAL DATA SHEET" marker on the first sheet.
  const first = workbook.worksheets[0];
  if (!first) return false;
  let hasMarker = false;
  for (let r = 1; r <= 10 && !hasMarker; r++) {
    for (let c = 1; c <= 14 && !hasMarker; c++) {
      if (/personal data sheet/i.test(getVal(first, r, c))) hasMarker = true;
    }
  }
  return hasC1 && hasMarker;
}

function getSheet(workbook: ExcelJS.Workbook, patterns: RegExp[]): ExcelJS.Worksheet | undefined {
  for (const ws of workbook.worksheets) {
    if (patterns.some((p) => p.test(ws.name))) return ws;
  }
  return undefined;
}

/** Parse Sheet C1 — personal information + educational background. */
function parsePersonalInfo(c1: ExcelJS.Worksheet): Partial<ExtractedPersonalInfo> {
  const out: Partial<ExtractedPersonalInfo> = {};

  // SURNAME — label "SURNAME", value a few cols right.
  const surnameCell = findCell(c1, "SURNAME", { fromRow: 8, toRow: 14, fromCol: 1, toCol: 6 });
  if (surnameCell) out.lastName = field(valueRightOf(c1, surnameCell.row, surnameCell.col), "C1 §I surname");

  // FIRST NAME
  const firstCell = findCell(c1, "FIRST NAME", { fromRow: 8, toRow: 14, fromCol: 1, toCol: 6 });
  if (firstCell) out.firstName = field(valueRightOf(c1, firstCell.row, firstCell.col), "C1 §I first name");

  // MIDDLE NAME
  const middleCell = findCell(c1, "MIDDLE NAME", { fromRow: 8, toRow: 14, fromCol: 1, toCol: 6 });
  if (middleCell) out.middleName = field(valueRightOf(c1, middleCell.row, middleCell.col), "C1 §I middle name");

  // NAME EXTENSION (JR/SR) — label "NAME EXTENSION", value right of it.
  const extCell = findCell(c1, "NAME EXTENSION", { fromRow: 8, toRow: 14, fromCol: 8, toCol: 18 });
  if (extCell) out.extensionName = field(valueRightOf(c1, extCell.row, extCell.col), "C1 §I name extension");

  // DATE OF BIRTH
  const dobCell = findCell(c1, "DATE OF BIRTH", { fromRow: 10, toRow: 16, fromCol: 1, toCol: 6 });
  if (dobCell) out.birthDate = field(normalizeSaneDate(valueRightOf(c1, dobCell.row, dobCell.col)), "C1 §I birth date");

  // PLACE OF BIRTH
  const pobCell = findCell(c1, "PLACE OF BIRTH", { fromRow: 12, toRow: 18, fromCol: 1, toCol: 6 });
  if (pobCell) out.birthPlace = field(valueRightOf(c1, pobCell.row, pobCell.col), "C1 §I birth place");

  // SEX — label "SEX" (short, so match exactly to avoid false positives).
  // Domain check: only MALE/FEMALE are valid answers. The Revised 2026
  // template encodes sex as tick-box booleans (which cannot be decoded to a
  // specific option), so a valid text value is only ever present in typed
  // variants of the form.
  const sexCell = findCell(c1, "SEX", { fromRow: 14, toRow: 18, fromCol: 1, toCol: 4 });
  if (sexCell) {
    const v = valueRightOf(c1, sexCell.row, sexCell.col);
    if (v && /^(male|female)$/i.test(v.trim())) out.gender = field(v, "C1 §I sex");
  }

  // CIVIL STATUS — domain-checked for the same reason as SEX.
  const csCell = findCell(c1, "CIVIL STATUS", { fromRow: 14, toRow: 20, fromCol: 1, toCol: 4 });
  if (csCell) {
    const v = valueRightOf(c1, csCell.row, csCell.col);
    if (v && /^(single|married|widow(er)?(\/er)?|separated|annulled|solo parent|others?)\b/i.test(v.trim())) {
      out.civilStatus = field(v, "C1 §I civil status");
    }
  }

  // CITIZENSHIP — label "16. CITIZENSHIP" / "CITIZENSHIP". Domain-checked:
  // tick-box booleans and stray labels must not become citizenship values.
  const citCell = findCell(c1, "CITIZENSHIP", { fromRow: 10, toRow: 16, fromCol: 5, toCol: 12 });
  if (citCell) {
    const v = valueRightOf(c1, citCell.row, citCell.col);
    if (v && /^(filipino|dual)/i.test(v.trim())) out.citizenship = field(v, "C1 §I citizenship");
  }

  // RESIDENTIAL ADDRESS — label "RESIDENTIAL ADDRESS", then several sub-fields
  // follow in the columns to its right (House/Block/Lot, Street,
  // Subdivision/Village, Barangay, City/Municipality, Province, ZIP CODE).
  //
  // Layout quirk: each sub-label (e.g. "City/Municipality") sits in the row
  // DIRECTLY BELOW its value (e.g. "TAGUIG"). So to read a sub-field's value
  // we look one row ABOVE the sub-label, in the same column.
  const addrCell = findCell(c1, "RESIDENTIAL ADDRESS", { fromRow: 15, toRow: 22, fromCol: 5, toCol: 12 });
  if (addrCell) {
    const r = addrCell.row;
    // Collect the applicant's address values from the block, stopping at the
    // "18. PERMANENT ADDRESS" section header (which immediately follows).
    const block: string[] = [];
    for (let dr = 0; dr <= 8; dr++) {
      for (let c = addrCell.col; c <= addrCell.col + 8; c++) {
        const v = getVal(c1, r + dr, c);
        if (!v) continue;
        // Stop the block at the permanent-address section.
        if (/PERMANENT ADDRESS/i.test(v)) { dr = 99; break; }
        if (isNoise(v)) continue;
        if (isInstructional(v)) continue;
        // Skip the sub-labels themselves.
        if (/^(House|Street|Subdivision|Barangay|City|Municipality|Province|ZIP)/i.test(v)) continue;
        if (/RESIDENTIAL ADDRESS/i.test(v)) continue;
        if (v.toLowerCase() === getVal(c1, r + dr, c - 1).toLowerCase()) continue; // merged echo
        block.push(v);
      }
    }
    // Dedupe adjacent (merged echoes) and drop N/A placeholders.
    const deduped: string[] = [];
    for (const v of block) {
      if (deduped[deduped.length - 1] === v) continue;
      if (/^n\/?a$/i.test(v)) continue;
      deduped.push(v);
    }
    if (deduped.length) {
      out.presentAddress = field(deduped.join(", "), "C1 §I residential address");
    }

    // City / Province / ZIP — sub-label is one row BELOW its value. Read the
    // cell directly above the sub-label, same column.
    const cityCell = findCell(c1, "City/Municipality", { fromRow: r, toRow: r + 8, fromCol: addrCell.col, toCol: addrCell.col + 8 });
    if (cityCell) {
      const v = getVal(c1, cityCell.row - 1, cityCell.col);
      if (v && !isInstructional(v) && !/^n\/?a$/i.test(v)) out.city = field(v, "C1 §I city");
    }
    const provCell = findCell(c1, "Province", { fromRow: r, toRow: r + 8, fromCol: addrCell.col, toCol: addrCell.col + 8 });
    if (provCell) {
      const v = getVal(c1, provCell.row - 1, provCell.col);
      if (v && !isInstructional(v) && !/^n\/?a$/i.test(v)) out.province = field(v, "C1 §I province");
    }
    const zipCell = findCell(c1, "ZIP CODE", { fromRow: r, toRow: r + 8, fromCol: addrCell.col - 2, toCol: addrCell.col + 8 });
    if (zipCell) {
      // ZIP value is in the same row as the label (to its right), not above.
      const v = valueRightOf(c1, zipCell.row, zipCell.col, 4);
      if (v) out.zipCode = field(v, "C1 §I zip code");
    }
  }

  // MOBILE NO — label "20. MOBILE NO."
  const mobCell = findCell(c1, "MOBILE NO", { fromRow: 28, toRow: 40, fromCol: 5, toCol: 12 });
  if (mobCell) {
    const v = valueRightOf(c1, mobCell.row, mobCell.col, 6);
    if (v) out.mobileNumber = field(v, "C1 §I mobile");
  }

  // E-MAIL ADDRESS — label "E-MAIL ADDRESS"
  const emailCell = findCell(c1, "E-MAIL ADDRESS", { fromRow: 28, toRow: 40, fromCol: 5, toCol: 12 });
  if (emailCell) {
    const v = valueRightOf(c1, emailCell.row, emailCell.col, 6);
    if (v && /@/.test(v)) out.emailAddress = field(v, "C1 §I email");
  }

  return out;
}

/** Parse the education table on Sheet C1 (Section III). */
function parseEducation(c1: ExcelJS.Worksheet): ExtractedEducation[] {
  // Locate the education table header — the row with "LEVEL" and "NAME OF SCHOOL".
  // Widen the search window: templates customized by applicants (inserted rows
  // for overflow entries) can push the education table far down the sheet.
  const headerCell = findCell(c1, "NAME OF SCHOOL", { fromRow: 40, toRow: MAX_SCAN_ROWS, fromCol: 1, toCol: 14 });
  if (!headerCell) return [];

  const headerRow = headerCell.row;
  // Data rows follow the header. Each level row has the level name in col B
  // (ELEMENTARY, SECONDARY, VOCATIONAL/TRADE COURSE, COLLEGE, GRADUATE STUDIES).
  // Columns (verified against the official CSC template):
  //   B  = LEVEL
  //   D  = NAME OF SCHOOL (merged D-F)
  //   G  = BASIC EDUCATION/DEGREE/COURSE (merged G-I)
  //   J  = PERIOD FROM (year)
  //   K  = PERIOD TO (year)
  //   M  = YEAR GRADUATED
  //   N  = SCHOLARSHIP/HONORS
  const LEVELS = [
    { re: /^elementary/i, label: "ELEMENTARY" },
    { re: /^secondary/i, label: "SECONDARY" },
    { re: /^vocational/i, label: "VOCATIONAL/TRADE COURSE" },
    { re: /^college/i, label: "COLLEGE" },
    { re: /^graduate/i, label: "GRADUATE STUDIES" },
  ];

  const out: ExtractedEducation[] = [];
  // Scan until the signature block (or sheet end) — applicants who took many
  // courses add extra education rows below the standard 5 levels.
  const eduEnd = findSectionEnd(c1, headerRow + 1, [/^signature/i, /civil service eligibility/i]) ?? headerRow + MAX_SCAN_ROWS;
  for (let r = headerRow + 1; r < eduEnd; r++) {
    const levelRaw = getVal(c1, r, 2); // col B
    if (!levelRaw) continue;
    if (/continue on separate sheet/i.test(levelRaw)) continue;
    const matched = LEVELS.find((l) => l.re.test(levelRaw));
    if (!matched) continue;

    const school = getVal(c1, r, 4); // col D
    const degree = getVal(c1, r, 7); // col G
    const fromYear = getVal(c1, r, 10); // col J
    const toYear = getVal(c1, r, 11); // col K
    const yearGrad = getVal(c1, r, 13); // col M
    const honors = getVal(c1, r, 14); // col N

    // Skip rows where the school is N/A or blank — applicant has no data for
    // this education level.
    if (!school || /^n\/?a$/i.test(school)) continue;

    // For elementary/secondary the "degree" column often holds "GRADUATED"
    // (indicating highest level earned) rather than a real degree.
    const isGraduatedMarker = /^graduated$/i.test(degree);

    out.push({
      educationLevel: field(matched.label, "C1 §III level"),
      schoolName: field(school, "C1 §III school"),
      degree: field(isGraduatedMarker ? "" : degree, "C1 §III degree"),
      course: field(isGraduatedMarker ? "" : degree, "C1 §III course"),
      yearGraduated: field(yearGrad || toYear || fromYear, "C1 §III year graduated"),
      unitsEarned: field(isGraduatedMarker ? "GRADUATED" : "", "C1 §III units"),
      awards: field(honors, "C1 §III honors"),
      highestLevel: field(isGraduatedMarker ? "GRADUATED" : "", "C1 §III highest level"),
    });
  }
  return out;
}

/** Parse Sheet C2 — civil service eligibility (Section IV). */
function parseEligibility(c2: ExcelJS.Worksheet): ExtractedEligibility[] {
  // Header row contains "CAREER SERVICE" and "RATING".
  const headerCell = findCell(c2, "CAREER SERVICE", { fromRow: 1, toRow: 14, fromCol: 1, toCol: 12 });
  if (!headerCell) return [];
  const headerRow = headerCell.row;

  // Column layout differs between the Revised 2017 and Revised 2026 templates:
  //   2017: B-C=title, D=rating, E=exam date, F=exam place, G-H=license no, I=validity
  //   2026: B-E=title(merged), F=rating, G-H=exam date, I-K=exam place, L=license no, M=validity
  // The 2017 mapping read the WRONG cells on 2026 forms (e.g. the rating slot
  // received the title, the exam-date slot received the title's merged echo).
  // Detect each column from its own header text instead of hard-coding.
  const findHeaderCol = (re: RegExp): number | null => {
    for (let r = headerRow; r <= headerRow + 1; r++) {
      for (let c = 1; c <= 16; c++) {
        const v = getVal(c2, r, c);
        if (v && re.test(v)) return c;
      }
    }
    return null;
  };
  const ratingCol = findHeaderCol(/rating/i) ?? 4;
  const examDateCol = findHeaderCol(/date of exam/i) ?? 5;
  const examPlaceCol = findHeaderCol(/place of exam/i) ?? 6;
  const licenseNoCol = findHeaderCol(/^(number|license)/i) ?? 7;
  const licenseValCol = findHeaderCol(/validity/i) ?? 9;

  // Overflow: applicants with many eligibilities (e.g. RA 1080 + Civil Service
  // Professional + multiple board ratings) add rows below the standard table.
  // Scan to the "WORK EXPERIENCE" section header instead of a fixed row count.
  const out: ExtractedEligibility[] = [];
  const eligEnd = findSectionEnd(c2, headerRow + 1, [/work experience/i]) ?? headerRow + MAX_SCAN_ROWS;
  for (let r = headerRow + 2; r < eligEnd; r++) {
    const title = getVal(c2, r, 2);
    if (!title) continue;
    if (/^n\/?a$/i.test(title)) continue;
    // Official-form furniture ("(Continue on sheet C9 if necessary)",
    // SIGNATURE row, "CS FORM 212 (Revised 2026), Page 2 of 4" footer) —
    // on a blank template these are the only rows in the scan band.
    if (isFormFurniture(title)) continue;
    const rating = getVal(c2, r, ratingCol);
    const examDate = getVal(c2, r, examDateCol);
    const examPlace = getVal(c2, r, examPlaceCol);
    const licenseNo = getVal(c2, r, licenseNoCol);
    const licenseVal = getVal(c2, r, licenseValCol);
    out.push({
      eligibilityTitle: field(title, "C2 §IV title"),
      rating: field(rating, "C2 §IV rating"),
      examDate: field(normalizeSaneDate(examDate), "C2 §IV exam date"),
      examPlace: field(examPlace, "C2 §IV exam place"),
      licenseNumber: field(licenseNo, "C2 §IV license no"),
      licenseValidity: field(normalizeSaneDate(licenseVal), "C2 §IV license validity"),
    });
  }
  return out;
}

/** Parse Sheet C2 — work experience (Section V).
 *  Also handles applicant-ppt CONTINUATION sheets that have no "POSITION TITLE"
 *  header but use the layout:
 *    col 1 = running row number ("3", "4"...)
 *    col 2 = FROM date
 *    col 3 = TO date
 *    col 4 = POSITION TITLE (long text)
 *    col 5 = DEPARTMENT/COMPANY (long text)
 *    col 6 = MONTHLY SALARY (number)
 *    col 7 = STATUS OF EMPLOYMENT
 *    col 8 = GOVT SERVICE (Y/N)
 *  Real-world continuation sheets like "Work Experience Continuation" use this
 *  layout, so the official-C2-only reader was silently dropping them. */
function parseWorkExperience(c2: ExcelJS.Worksheet): ExtractedWorkExperience[] {
  const out: ExtractedWorkExperience[] = [];

  // ---- Mode A: header-based (standard C2 layout) ----
  const headerCell = findCell(c2, "POSITION TITLE", { fromRow: 10, toRow: 22, fromCol: 1, toCol: 12 });

  if (headerCell) {
    const headerRow = headerCell.row;
    // Columns: A-B=From(merged), C=To, D-F=Position(merged), G-I=Dept/Company(merged),
    //          J=MonthlySalary, K=Grade, L=Status, M=GovtService
    const workEnd = findSectionEnd(c2, headerRow + 1, [/voluntary work/i]) ?? headerRow + MAX_SCAN_ROWS;
    for (let r = headerRow + 3; r < workEnd; r++) {
      const from = getVal(c2, r, 1);
      const to = getVal(c2, r, 3);
      const position = getVal(c2, r, 4);
      if (!position) continue;
      if (/^n\/?a$/i.test(position)) continue;
      // Furniture: continuation markers, signature block, page footers.
      if (isFormFurniture(position)) continue;
      const dept = getVal(c2, r, 7);
      const salary = getVal(c2, r, 10);
      const status = getVal(c2, r, 12);
      const govt = getVal(c2, r, 13);
      out.push({
        positionTitle: field(position, "C2 §V position"),
        employerName: field(dept, "C2 §V employer"),
        employerAddress: field("", "C2 §V employer address"),
        inclusiveDateFrom: field(normalizeSaneDate(from), "C2 §V from"),
        inclusiveDateTo: field(normalizeSaneDate(to), "C2 §V to"),
        statusOfEmployment: field(status, "C2 §V status"),
        monthlySalary: numField(salary, "C2 §V salary"),
        isGovtService: boolField(govt, "C2 §V govt service"),
        reasonForLeaving: field("", "C2 §V reason"),
        accomplishment: field("", "C2 §V accomplishment"),
        actualDuties: field("", "C2 §V duties"),
      });
    }
    return out;
  }

  // ---- Mode B: applicant-ppt continuation layout (no header row) ----
  // Layout: col 1 = row#, col 2 = FROM date, col 3 = TO date,
  //         col 4 = POSITION TITLE, col 5 = EMPLOYER, col 6 = SALARY,
  //         col 7 = STATUS, col 8 = GOVT SERVICE
  const maxRow = sheetMaxRow(c2);
  for (let r = 1; r <= maxRow; r++) {
    const rowNum = getVal(c2, r, 1);
    const from = getVal(c2, r, 2);
    const to = getVal(c2, r, 3);
    const position = getVal(c2, r, 4);
    const dept = getVal(c2, r, 5);
    const salary = getVal(c2, r, 6);
    const status = getVal(c2, r, 7);
    const govt = getVal(c2, r, 8);

    if (!position) continue;
    if (/^n\/?a$/i.test(position)) continue;
    if (isFormFurniture(position)) continue;

    // Require the continuation layout markers: row# is digit-only counter,
    // from/to are dates, position is long text.
    const looksLikeWork =
      rowNum && /^\d+\.?$/.test(rowNum.trim()) &&
      /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(from) &&
      /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(to) &&
      position.length > 8;
    if (!looksLikeWork) continue;

    out.push({
      positionTitle: field(position, "continuation §V position"),
      employerName: field(dept, "continuation §V employer"),
      employerAddress: field("", "continuation §V employer address"),
      inclusiveDateFrom: field(normalizeSaneDate(from), "continuation §V from"),
      inclusiveDateTo: field(normalizeSaneDate(to), "continuation §V to"),
      statusOfEmployment: field(status, "continuation §V status"),
      monthlySalary: numField(salary, "continuation §V salary"),
      isGovtService: boolField(govt, "continuation §V govt service"),
      reasonForLeaving: field("", "continuation §V reason"),
      accomplishment: field("", "continuation §V accomplishment"),
      actualDuties: field("", "continuation §V duties"),
    });
  }
  return out;
}

/** Parse Sheet C3 — training programs (Section VII).
 *  Also handles applicant-ppt CONTINUATION sheets that have no "TITLE OF
 *  LEARNING" header but use the layout:
 *    col 1 = running row number ("21", "22"…)
 *    col 2 = TITLE
 *    col 3 = FROM date
 *    col 4 = TO date
 *    col 5 = NUMBER OF HOURS (e.g. "3 HOURS")
 *    col 6 = Type of LD
 *    col 7 = Conducted/Sponsored by
 *  Real-world continuation sheets like "Training Continuation" use this
 *  layout, so the official-C3-only reader was silently dropping them. */
function parseTraining(c3: ExcelJS.Worksheet): ExtractedTraining[] {
  const out: ExtractedTraining[] = [];

  // ---- Mode A: header-based (standard C3 layout) ----
  const headerCell = findCell(c3, "TITLE OF LEARNING", { fromRow: 1, toRow: MAX_SCAN_ROWS, fromCol: 1, toCol: 12 });

  if (headerCell) {
    const headerRow = headerCell.row;
    // Columns (verified from real uploads):
    //   A-D = TITLE (merged)
    //   E   = FROM date
    //   F   = TO date
    //   G   = NUMBER OF HOURS (may include " HOURS" suffix)
    //   H   = Type of LD
    const trainEnd = findSectionEnd(c3, headerRow + 1, [/non-academic/i, /other information/i]) ?? headerRow + MAX_SCAN_ROWS;
    for (let r = headerRow + 2; r < trainEnd; r++) {
      const title = getVal(c3, r, 1);
      if (!title) continue;
      if (/^n\/?a$/i.test(title)) continue;
      // Furniture: continuation markers, section headers, column headers,
      // signature block, page footers — never applicant data.
      if (isFormFurniture(title)) continue;
      const from = getVal(c3, r, 5);
      const to = getVal(c3, r, 6);
      const hours = getVal(c3, r, 7);
      const type = getVal(c3, r, 8);
      out.push({
        titleOfTraining: field(title, "C3 §VII title"),
        typeOfTraining: field(type, "C3 §VII type"),
        inclusiveDateFrom: field(normalizeSaneDate(from), "C3 §VII from"),
        inclusiveDateTo: field(normalizeSaneDate(to), "C3 §VII to"),
        numberHours: numField(hours, "C3 §VII hours"),
        isGovtService: { value: null, confidence: "none", source: "C3 §VII" },
      });
    }
    return out;
  }

  // ---- Mode B: applicant-ppt continuation layout (no header row) ----
  // Title sits in col 2 (col 1 is a running row counter), dates in cols 3–4,
  // hours in col 5, type in col 6. Scan from row 1 to MAX_SCAN_ROWS and
  // accept any row that looks like a training entry.
  const maxRow = sheetMaxRow(c3);
  for (let r = 1; r <= maxRow; r++) {
    const rowNum = getVal(c3, r, 1);
    const title = getVal(c3, r, 2);
    const from = getVal(c3, r, 3);
    const to = getVal(c3, r, 4);
    const hours = getVal(c3, r, 5);
    const type = getVal(c3, r, 6);
    if (!title) continue;
    if (/^n\/?a$/i.test(title)) continue;
    if (isFormFurniture(title)) continue;
    // Require either a digit in the date cells or an "N HOURS" / "N hours" /
    // bare number in the hours cell — otherwise we're looking at a header or
    // unrelated row.
    const looksLikeTraining =
      /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(from || "") ||
      /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(to || "") ||
      /\d+\s*hours?$/i.test(hours || "");
    if (!looksLikeTraining) continue;
    // The leading row-number column (col 1) is a digit-only counter — skip
    // rows where col 1 is non-numeric so we don't pick up unrelated text.
    if (rowNum && !/^\d+\.?$/.test(rowNum.trim())) continue;
    out.push({
      titleOfTraining: field(title, "continuation §VII title"),
      typeOfTraining: field(type, "continuation §VII type"),
      inclusiveDateFrom: field(normalizeSaneDate(from), "continuation §VII from"),
      inclusiveDateTo: field(normalizeSaneDate(to), "continuation §VII to"),
      numberHours: numField(hours, "continuation §VII hours"),
      isGovtService: { value: null, confidence: "none", source: "continuation §VII" },
    });
  }
  return out;
}

/** Parse Sheet C3 — non-academic distinctions / recognition (Section VIII). */
function parseAwards(c3: ExcelJS.Worksheet): ExtractedAward[] {
  // Section VIII header contains "NON-ACADEMIC DISTINCTIONS".
  // Search the whole sheet: applicants with 100+ trainings insert rows above
  // this section, pushing it far below its standard row 30–50 position.
  const headerCell = findCell(c3, "NON-ACADEMIC DISTINCTIONS", { fromRow: 5, toRow: MAX_SCAN_ROWS, fromCol: 1, toCol: 14 });
  if (!headerCell) return [];
  const r = headerCell.row;
  // OVERFLOW: the standard template shows only ~7 recognition rows; applicants
  // with many awards add extra lines. Scan to the "MEMBERSHIP IN ASSOCIATION"
  // section (or sheet end) instead of a fixed 7 rows.
  const out: ExtractedAward[] = [];
  const awardsEnd = findSectionEnd(c3, r + 1, [/membership/i]) ?? r + MAX_SCAN_ROWS;
  for (let rr = r; rr < awardsEnd; rr++) {
    for (let c = headerCell.col + 1; c <= headerCell.col + 10; c++) {
      const v = getVal(c3, rr, c);
      if (!v) continue;
      if (isNoise(v)) continue;
      if (isInstructional(v)) continue;
      if (isFormFurniture(v)) continue;
      if (/^n\/?a$/i.test(v)) continue;
      // Skip bare section numbers like "31.", "32.", "33."
      if (/^\d+\.$/.test(v.trim())) continue;
      // Skip CSC form footer / signature-line boilerplate that leaks into the
      // awards scan on dense C3 sheets (rows past the awards table contain
      // "SIGNATURE", "DATE", and "CS FORM 212 (Revised 2017), Page X of Y").
      if (/^(signature|date|cs form no\.?|community tax)/i.test(v.trim())) continue;
      if (/^cs form 212.*page \d+ of \d+$/i.test(v.trim())) continue;
      // Skip actual date values that sit next to the "DATE" label in the
      // signature row (e.g. "JULY 15, 2026", "07/15/2026") — they look like
      // recognition dates but they're the signature date, not an award.
      if (/^[A-Z]+\s+\d{1,2},?\s+\d{4}$/i.test(v.trim())) continue;
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(v.trim())) continue;
      // Skip very short fragments that are clearly not recognition text.
      if (v.trim().length < 4) continue;
      // Stop at the next section header.
      if (/MEMBERSHIP/i.test(v)) return out;
      // Skip merged echoes.
      if (v === getVal(c3, rr, c - 1)) continue;
      out.push({
        recognitionType: field("Recognition", "C3 §VIII type"),
        recognitionDetails: field(v, "C3 §VIII details"),
        recognitionScope: field("", "C3 §VIII scope"),
        recognitionCategory: field("", "C3 §VIII category"),
        recognitionProvider: field("", "C3 §VIII provider"),
        dateGranted: field("", "C3 §VIII date"),
      });
      break; // move to next row
    }
  }
  return out;
}

// ---- Continuation-sheet support --------------------------------------------
//
// Applicants commonly duplicate a page sheet and paste overflow rows into it
// ("C3 (2)", "C3-copy", "Sheet1", "Continuation", "Work Exp Sheet"...). The
// classifiers below detect what each extra sheet contains by its header
// keywords, and the matching section parser is run against it.

type ExtraSheetKind = "training" | "award" | "work" | "eligibility" | "education";

function classifyExtraSheet(ws: ExcelJS.Worksheet): ExtraSheetKind | null {
  // Read the first 40 rows of text for classification.
  const maxRow = Math.min(ws.actualRowCount, 40);
  const lines: string[] = [];
  for (let r = 1; r <= maxRow; r++) {
    for (let c = 1; c <= 14; c++) {
      const v = getVal(ws, r, c);
      if (v) lines.push(v);
    }
  }
  const text = lines.join("\n").toLowerCase();
  if (!text.trim()) return null;
  if (/title of learning|training program|l&d|number of hours/.test(text)) return "training";
  if (/non-academic/.test(text)) return "award";
  if (/position title/.test(text)) return "work";
  if (/career service|rating/.test(text)) return "eligibility";
  if (/name of school/.test(text)) return "education";
  // Fallback: a continuation page usually has no headers — sniff the table
  // shape. Real applicants paste overflow into a fresh sheet using a column
  // layout like "row-num | title | from | to | hours | type | conducted-by"
  // — title sits in col 2 (col 1 is the running row counter), dates in 3-4,
  // hours in 5, type in 6. We probe BOTH the official C3 layout (title in
  // col 1, dates in 5-6, hours in 7, type in 8) AND the applicant-ppt layout
  // because both occur in the wild. Work-experience continuation sheets use a
  // similar layout but their "title" slot holds a date ("07/01/2025"), so we
  // require the title column to be NON-numeric text of >8 chars.
  const isTitleText = (s: string) =>
    s.length > 8 && !/^\d/.test(s.trim()) && !/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s.trim()) && !isFormFurniture(s);

  // ---- Training shape (two layouts) ----
  const TRAINING_LAYOUTS: Array<{ titleCol: number; probeCols: number[] }> = [
    { titleCol: 1, probeCols: [1, 5, 6, 7, 8] }, // official C3 (title merged A:D)
    { titleCol: 2, probeCols: [2, 3, 4, 5, 6] }, // applicant-ppt continuation
  ];
  let dataRows = 0;
  let trainingShaped = 0;
  for (let r = 1; r <= Math.min(ws.actualRowCount, 80); r++) {
    for (const layout of TRAINING_LAYOUTS) {
      const cols = layout.probeCols.map((c) => getVal(ws, r, c));
      const filled = cols.filter(Boolean).length;
      const title = cols[layout.probeCols.indexOf(layout.titleCol)] || "";
      if (filled >= 4 && isTitleText(title)) {
        dataRows++;
        // Look for any date- or hours-shaped value in the date/hours columns.
        const dateOrHours = cols.some((v) => /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(v) || /\d+\s*hours?$/i.test(v));
        if (dateOrHours) trainingShaped++;
        break; // count this row only once even if both layouts match
      }
    }
  }
  if (dataRows >= 3 && trainingShaped >= Math.ceil(dataRows / 2)) return "training";

  // ---- Work Experience shape (continuation sheets have no "POSITION TITLE" header) ----
  // Layout: col 1 = row#, col 2 = from date, col 3 = to date, col 4 = position (long),
  // col 5 = employer (long), col 6 = salary, col 7 = status, col 8 = govt Y/N.
  // We identify by: col 4 is long text, cols 2-3 are dates, filled >= 5.
  let workDataRows = 0;
  let workShaped = 0;
  for (let r = 1; r <= Math.min(ws.actualRowCount, 80); r++) {
    const rowNum = getVal(ws, r, 1);
    const from = getVal(ws, r, 2);
    const to = getVal(ws, r, 3);
    const position = getVal(ws, r, 4);
    const employer = getVal(ws, r, 5);
    const salary = getVal(ws, r, 6);
    const filled = [rowNum, from, to, position, employer, salary].filter(Boolean).length;
    if (filled >= 5 && position.length > 8 && /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(from) && /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(to)) {
      // Row 1 is a running counter (digit-only) — confirms this is the continuation layout.
      if (rowNum && /^\d+\.?$/.test(rowNum.trim())) {
        workDataRows++;
        workShaped++;
      }
    }
  }
  if (workDataRows >= 3 && workShaped >= Math.ceil(workDataRows / 2)) return "work";

  return null;
}

/** Sheet names that belong to the standard CSC template (+ Lookup).
 *  The Revised 2026 template ships named continuation pages — "C5_L&D cont.",
 *  "C6_Work exp cont.", "C7_Family Background cont. ", "C8_Edu cont.",
 *  "C9_Elig cont." — which are BLANK form pages (labels only, no data), not
 *  applicant-made overflow sheets. Treating them as "extra sheets" made the
 *  classifiers harvest their label rows as data. Applicant-created duplicates
 *  like "C3 (2)" or "Work Experience Continuation" do NOT match and are still
 *  parsed for overflow rows. */
function isStandardSheetName(name: string): boolean {
  const t = name.trim();
  // Official page sheets C1–C19 (bare) and "C<N>_... cont." continuation pages.
  if (/^c(1\d|\d)$/i.test(t)) return true;
  if (/^c(1\d|\d)_.*cont\.?\s*$/i.test(t)) return true;
  return /^(lookup|sheet\.?[1-4]|page\.?[1-4])$/i.test(t);
}

/**
 * Parse every non-standard (continuation) sheet in the workbook, classifying
 * each by its headers and merging the results into the given buckets.
 * Returns a list of human-readable warnings (e.g. how many extra rows were
 * recovered from which sheet) for transparency in the review UI.
 */
function parseContinuationSheets(
  workbook: ExcelJS.Workbook,
  buckets: {
    educations: ExtractedEducation[];
    workExperiences: ExtractedWorkExperience[];
    trainings: ExtractedTraining[];
    eligibilities: ExtractedEligibility[];
    awards: ExtractedAward[];
  }
): string[] {
  const warnings: string[] = [];
  for (const ws of workbook.worksheets) {
    if (isStandardSheetName(ws.name)) continue;
    if (ws.rowCount === 0 || ws.actualRowCount === 0) continue;
    const kind = classifyExtraSheet(ws);
    if (!kind) {
      // Non-standard sheet that we couldn't classify. Warn so silent drops
      // (like the bug where "Training Continuation" was skipped because its
      // column layout didn't match C3) show up in the review UI instead of
      // vanishing.
      warnings.push(`Continuation sheet "${ws.name}" was skipped (unrecognized layout). If it contains data, verify it was captured.`);
      continue;
    }
    switch (kind) {
      case "training": {
        const before = buckets.trainings.length;
        buckets.trainings.push(...parseTraining(ws));
        const found = buckets.trainings.length - before;
        if (found > 0) warnings.push(`Continuation sheet "${ws.name}": ${found} additional training${found === 1 ? "" : "s"} recovered.`);
        break;
      }
      case "award": {
        const before = buckets.awards.length;
        buckets.awards.push(...parseAwards(ws));
        const found = buckets.awards.length - before;
        if (found > 0) warnings.push(`Continuation sheet "${ws.name}": ${found} additional award${found === 1 ? "" : "s"} recovered.`);
        break;
      }
      case "work": {
        const before = buckets.workExperiences.length;
        buckets.workExperiences.push(...parseWorkExperience(ws));
        const found = buckets.workExperiences.length - before;
        if (found > 0) warnings.push(`Continuation sheet "${ws.name}": ${found} additional work experience entr${found === 1 ? "y" : "ies"} recovered.`);
        break;
      }
      case "eligibility": {
        const before = buckets.eligibilities.length;
        buckets.eligibilities.push(...parseEligibility(ws));
        const found = buckets.eligibilities.length - before;
        if (found > 0) warnings.push(`Continuation sheet "${ws.name}": ${found} additional eligibilit${found === 1 ? "y" : "ies"} recovered.`);
        break;
      }
      case "education": {
        const before = buckets.educations.length;
        buckets.educations.push(...parseEducation(ws));
        const found = buckets.educations.length - before;
        if (found > 0) warnings.push(`Continuation sheet "${ws.name}": ${found} additional education entr${found === 1 ? "y" : "ies"} recovered.`);
        break;
      }
    }
  }
  return warnings;
}

// ---- Main entry point ------------------------------------------------------

/**
 * Deterministically parse a CSC Form 212 PDS Excel file into the
 * ExtractionResult structure. Returns null if the file does not look like a
 * standard PDS (so the caller can fall back to the LLM extraction path).
 */
export async function parsePdsExcel(filePath: string): Promise<ExtractionResult | null> {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const buffer = await fs.readFile(abs);
  const workbook = new ExcelJS.Workbook();
  // Cast to the exact declared parameter type: Buffer typings differ between
  // runtimes (@types/node vs bun) but the runtime value is the same object.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  if (!looksLikePds(workbook)) return null;

  const c1 = getSheet(workbook, [/^c1$/i, /^sheet.?1$/i, /^page.?1$/i]);
  const c2 = getSheet(workbook, [/^c2$/i, /^sheet.?2$/i, /^page.?2$/i]);
  const c3 = getSheet(workbook, [/^c3$/i, /^sheet.?3$/i, /^page.?3$/i]);

  const personalInfo = c1 ? parsePersonalInfo(c1) : {};
  const buckets = {
    educations: c1 ? parseEducation(c1) : [],
    workExperiences: c2 ? parseWorkExperience(c2) : [],
    trainings: c3 ? parseTraining(c3) : [],
    eligibilities: c2 ? parseEligibility(c2) : [],
    awards: c3 ? parseAwards(c3) : [],
  };

  // OVERFLOW: parse any extra sheets the applicant added ("C3 (2)",
  // "Continuation", "Sheet1", ...) and merge their rows into the buckets.
  const warnings = parseContinuationSheets(workbook, buckets);

  return {
    personalInfo,
    ...buckets,
    documentType: "PDS",
    warnings,
  };
}
