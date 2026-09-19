// Document Intelligence Service
// Uses an OpenAI-compatible AI API (NVIDIA by default) to extract structured
// information from uploaded documents
// (PDS, Resume/CV, certificates, awards, training certs, etc.) and map to applicant form fields.
//
// CRITICAL RULE: Never fabricate information. If a field cannot be confidently extracted,
// leave it null and mark it for user review.
//
// Supported file types:
// - Images (PNG, JPEG, GIF, WebP, BMP) → sent to VLM as image_url
// - PDF, Word (.doc/.docx) → sent to VLM as file_url
// - Excel (.xlsx, .xls) → parsed to text via exceljs, then sent to LLM as text
//   (The PDS / CSC Form 212 is distributed as an Excel file in the Philippines.)

import { ZAI } from "@/lib/ai-client";
import { promises as fs } from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { extractText as unpdfExtractText } from "unpdf";
import mammoth from "mammoth";
import type { ValidDocumentCategory } from "@/lib/file-types";
import { detectFileKind } from "@/lib/file-types";
import { parsePdsExcel } from "@/lib/pds-parser";

// Production schema has no Document model — the category enum is defined
// locally in @/lib/file-types. Alias to keep the rest of this module readable.
export type DocumentCategory = ValidDocumentCategory;

export type ExtractedField<T = string> = {
  value: T | null;
  confidence: "high" | "medium" | "low" | "none";
  source: string; // which part of the document
};

export type ExtractedPersonalInfo = {
  firstName: ExtractedField;
  middleName: ExtractedField;
  lastName: ExtractedField;
  extensionName: ExtractedField;
  emailAddress: ExtractedField;
  mobileNumber: ExtractedField;
  contactNumber: ExtractedField;
  birthDate: ExtractedField;
  birthPlace: ExtractedField;
  gender: ExtractedField;
  civilStatus: ExtractedField;
  citizenship: ExtractedField;
  religion: ExtractedField;
  presentAddress: ExtractedField;
  city: ExtractedField;
  province: ExtractedField;
  country: ExtractedField;
  zipCode: ExtractedField;
};

export type ExtractedEducation = {
  educationLevel: ExtractedField;
  degree: ExtractedField;
  course: ExtractedField;
  schoolName: ExtractedField;
  yearGraduated: ExtractedField;
  unitsEarned: ExtractedField;
  awards: ExtractedField;
  highestLevel: ExtractedField;
};

export type ExtractedWorkExperience = {
  positionTitle: ExtractedField;
  employerName: ExtractedField;
  employerAddress: ExtractedField;
  inclusiveDateFrom: ExtractedField;
  inclusiveDateTo: ExtractedField;
  statusOfEmployment: ExtractedField;
  monthlySalary: ExtractedField<number | null>;
  isGovtService: ExtractedField<boolean | null>;
  reasonForLeaving: ExtractedField;
  accomplishment: ExtractedField;
  actualDuties: ExtractedField;
};

export type ExtractedTraining = {
  titleOfTraining: ExtractedField;
  typeOfTraining: ExtractedField;
  inclusiveDateFrom: ExtractedField;
  inclusiveDateTo: ExtractedField;
  numberHours: ExtractedField<number | null>;
  isGovtService: ExtractedField<boolean | null>;
};

export type ExtractedEligibility = {
  eligibilityTitle: ExtractedField;
  rating: ExtractedField;
  examDate: ExtractedField;
  examPlace: ExtractedField;
  licenseNumber: ExtractedField;
  licenseValidity: ExtractedField;
};

export type ExtractedAward = {
  recognitionType: ExtractedField;
  recognitionDetails: ExtractedField;
  recognitionScope: ExtractedField;
  recognitionCategory: ExtractedField;
  recognitionProvider: ExtractedField;
  dateGranted: ExtractedField;
};

export type ExtractionResult = {
  personalInfo?: Partial<ExtractedPersonalInfo>;
  educations?: ExtractedEducation[];
  workExperiences?: ExtractedWorkExperience[];
  trainings?: ExtractedTraining[];
  eligibilities?: ExtractedEligibility[];
  awards?: ExtractedAward[];
  rawTextPreview?: string;
  documentType?: string;
  warnings?: string[];
};

// ---- Excel parsing ----

// Heuristic: does this cell value look like a field label?
// Labels are short, contain letters, don't contain digits, and often end with ":".
function looksLikeLabel(s: string): boolean {
  if (!s) return false;
  const trimmed = s.replace(/:$/, "").trim();
  if (trimmed.length === 0 || trimmed.length > 40) return false;
  if (!/[a-zA-Z]/.test(trimmed)) return false; // must contain at least one letter
  if (/\d/.test(trimmed)) return false; // labels don't contain digits
  return true;
}

// Set of country names used to filter out dropdown-list pollution.
// The PDS / CSC Form 212 embeds a country dropdown source list in far-right
// columns (one country per row, ~200 rows: Afghanistan, Albania, ... Vietnam).
// This list has nothing to do with the applicant's data but pollutes the
// extracted text — sometimes pushing real education/work/training data past
// the truncation limit and confusing the LLM into returning empty arrays.
//
// IMPORTANT: Only actual COUNTRY names belong here. Do NOT add Yes/No,
// Married/Single/Widowed/Separated, Male/Female, etc. — those are legitimate
// data values that appear inline with labels (e.g. "CIVIL STATUS: Married")
// and filtering them would corrupt real applicant data.
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

function isDropdownNoise(s: string): boolean {
  return COUNTRY_NAMES.has(s.trim());
}

// Parse an Excel file (.xlsx/.xls) into a readable text representation.
// The PDS (CSC Form 212) is a structured Excel form — we read all sheets,
// extract cell values with their row/column context, and format as readable text
// so the LLM can understand the form structure and extract structured data.
//
// Key transformations (each fixes a real extraction bug observed on the
// CSC Form 212 PDS Excel template):
//   1. Skip "Lookup" sheets — these are dropdown value sources (Yes/No,
//      Civil Status, Gender, Country list) that pollute the text.
//   2. Filter out cells whose value is a pure dropdown-list entry (country
//      names, Yes/No, civil-status values). These appear as vertical lists in
//      far-right columns and were pushing real education/work/training rows
//      past the truncation limit, causing the LLM to return empty arrays.
//   3. Deduplicate adjacent identical cells within a row — merged-cell ranges
//      cause exceljs to return the same value in every cell of the merge, so
//      a single "PERSONAL DATA SHEET" label would appear 14 times per row.
//   4. Keep the "Label: Value" pairing only for genuine label cells (short,
//      alphabetic, no digits) so tabular data (education/work tables) is
//      preserved as pipe-separated values the LLM can parse column-by-column.
//
// Uses exceljs (maintained, no known advisories) instead of the vulnerable xlsx package.
async function parseExcelToText(filePath: string): Promise<string> {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const buffer = await fs.readFile(abs);

  const workbook = new ExcelJS.Workbook();
  // Cast to the exact declared parameter type: Buffer typings differ between
  // runtimes (@types/node vs bun) but the runtime value is the same object.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const sections: string[] = [];

  for (const sheet of workbook.worksheets) {
    // Skip Lookup sheets — they only contain dropdown source values
    // (Yes/No, Civil Status, Gender, Country list) that pollute extraction.
    if (/^lookup$/i.test(sheet.name)) continue;
    if (sheet.rowCount === 0) continue;

    sections.push(`\n=== Sheet: ${sheet.name} ===`);

    // Get the actual used range dimensions
    const rowCount = sheet.actualRowCount;

    for (let r = 1; r <= rowCount; r++) {
      const row = sheet.getRow(r);
      const rawCells: string[] = [];
      let hasContent = false;

      // Collect non-empty cell values across the row.
      // NOTE: ExcelJS's `cell.text` getter throws "Cannot read properties of
      // null (reading 'toString')" when cell.value is explicitly null (common
      // in merged-cell regions of PDS / CSC Form 212 spreadsheets). We wrap
      // it in try/catch and fall back to checking cell.value directly.
      for (let c = 1; c <= row.cellCount; c++) {
        const cell = row.getCell(c);
        let value = "";
        try {
          value = cell.text || (typeof cell.value === "string" ? cell.value : "");
        } catch {
          // cell.text getter threw (null value in merged cell, etc.)
          value = typeof cell.value === "string" ? cell.value : "";
        }
        const trimmed = String(value || "").trim();
        rawCells.push(trimmed);
        if (trimmed) hasContent = true;
      }

      if (!hasContent) continue;

      // Filter out dropdown-noise cells (country names, Yes/No, civil-status
      // values). These are embedded vertical lists in far-right columns that
      // have nothing to do with the applicant's actual data.
      let cells = rawCells.filter((c) => c && !isDropdownNoise(c));

      // Skip rows that are now empty (pure dropdown-list rows like
      // "Afghanistan", "Albania", ...).
      if (cells.length === 0) continue;

      // Deduplicate adjacent identical cells — merged-cell ranges cause
      // exceljs to return the same value in every cell of the merge (e.g.
      // "PERSONAL DATA SHEET" repeated 14 times across one row).
      const deduped: string[] = [];
      for (const c of cells) {
        if (deduped[deduped.length - 1] !== c) deduped.push(c);
      }
      cells = deduped;

      // Format the row.
      // Only pair cells as "Label: Value" when the first cell genuinely looks
      // like a label (short, alphabetic, no digits) and the next cell looks like a value.
      // This prevents mangling tabular data (e.g. education tables) where every cell is a value.
      const parts: string[] = [];
      for (let c = 0; c < cells.length; c++) {
        const cell = cells[c];
        if (!cell) continue;
        const next = cells[c + 1];

        if (next && looksLikeLabel(cell) && !looksLikeLabel(next)) {
          // Label: Value pair
          parts.push(`${cell.replace(/:$/, "")}: ${next}`);
          c++; // skip the value cell
        } else {
          // Standalone cell — add as-is
          parts.push(cell);
        }
      }
      if (parts.length > 0) {
        sections.push(parts.join(" | "));
      }
    }
  }

  const text = sections.join("\n");
  // Truncate to avoid exceeding LLM context limits (keep first ~16000 chars).
  // Increased from 12000 → 16000 because the dedup + dropdown-noise filtering
  // above significantly reduces text size, leaving room for the full PDS
  // (4 sheets) without cutting off the education/work/training sections.
  const MAX_CHARS = 16000;
  if (text.length > MAX_CHARS) {
    return text.slice(0, MAX_CHARS) + "\n\n[... document truncated ...]";
  }
  return text;
}

// Parse a PDF file into per-page text for the text-based LLM extraction path.
// The VLM API rejects PDF file_url data URLs ("URL格式无效"), so we extract text
// via unpdf and send it to the chat completions endpoint — same as Excel.
//
// Returns one string PER PAGE (mergePages: false) so the PDS extractor can
// chunk multi-page documents instead of truncating them — applicants with
// 100+ trainings/awards routinely submit 6-10 page PDS PDFs, and the old
// single-string 12K truncation silently dropped every overflow page.
async function parsePdfPages(filePath: string): Promise<string[]> {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const buffer = await fs.readFile(abs);
  // unpdf is a worker-free PDF text extractor built for bundled/server
  // environments (pdfjs-dist's dynamic worker import fails under Turbopack).
  const { text } = await unpdfExtractText(new Uint8Array(buffer), { mergePages: false });
  const pages = Array.isArray(text) ? text : [String(text ?? "")];
  return pages.map((p) => (p || "").trim());
}

// Legacy single-string variant — still used by non-PDS categories where the
// document is small and a truncation guard is safe.
async function parsePdfToText(filePath: string): Promise<string> {
  const pages = await parsePdfPages(filePath);
  const out = pages.join("\n\n").trim();
  const MAX_CHARS = 12000;
  if (out.length > MAX_CHARS) {
    return out.slice(0, MAX_CHARS) + "\n\n[... document truncated ...]";
  }
  return out;
}

// Parse a Word (.doc/.docx) file into readable text for the text-based LLM.
async function parseWordToText(filePath: string): Promise<string> {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const buffer = await fs.readFile(abs);
  const result = await mammoth.extractRawText({ buffer });
  const text = (result?.value || "").trim();
  const MAX_CHARS = 12000;
  if (text.length > MAX_CHARS) {
    return text.slice(0, MAX_CHARS) + "\n\n[... document truncated ...]";
  }
  return text;
}

// ---- File reading for VLM (images) ----

async function readAsDataUrl(filePath: string): Promise<{ url: string; kind: ReturnType<typeof detectFileKind> }> {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const buffer = await fs.readFile(abs);
  const ext = path.extname(abs).toLowerCase();
  const kind = detectFileKind(filePath);

  let mime: string;
  switch (kind) {
    case "image":
      mime = `image/${ext.replace(".", "") === "jpg" ? "jpeg" : ext.replace(".", "")}`;
      break;
    case "pdf":
      mime = "application/pdf";
      break;
    case "word":
      mime = ext === ".doc"
        ? "application/msword"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      break;
    default:
      mime = "application/octet-stream";
  }
  return { url: `data:${mime};base64,${buffer.toString("base64")}`, kind };
}

// ---- Prompt building ----

function buildPrompt(category: DocumentCategory): string {
  const base = `You are a document intelligence assistant for the DOST-MIRDC Recruitment Management Information System (RMIS).
Analyze the provided document and extract structured information that maps to applicant profile fields.

CRITICAL RULES:
1. Extract ONLY information that is clearly present in the document.
2. NEVER fabricate, guess, or infer information that is not explicitly stated.
3. If a field cannot be found, set its value to null and confidence to "none".
4. Use confidence "high" only when the value is explicitly and unambiguously stated.
5. Use "medium" when the value is present but requires minor interpretation.
6. Use "low" when the value is implied or partially stated.
7. Return ONLY valid JSON (no markdown fences, no commentary).

Return a JSON object with this exact structure:`;

  const schemas: Record<DocumentCategory, string> = {
    PDS: `${base}

This is a Philippine Civil Service Commission (CSC) Personal Data Sheet (CS Form 212 Revised 2017).
The document is spread across 4 sheets (C1–C4), each corresponding to a page:

  • Sheet C1 (Page 1): I. PERSONAL INFORMATION, II. FAMILY BACKGROUND, III. EDUCATIONAL BACKGROUND
  • Sheet C2 (Page 2): IV. CIVIL SERVICE ELIGIBILITY, V. WORK EXPERIENCE
  • Sheet C3 (Page 3): VI. VOLUNTARY WORK, VII. LEARNING AND DEVELOPMENT (L&D) / TRAINING PROGRAMS, VIII. OTHER INFORMATION (skills, non-academic distinctions/recognition)
  • Sheet C4 (Page 4): IX. character references + government disclosure questions

IMPORTANT EXTRACTION RULES:
  • Scan EVERY sheet — education is on C1, work experience + eligibility are on C2, training is on C3.
  • "N/A" in a section means the applicant has no data for that section — return an EMPTY array, do NOT create entries with "N/A" values.
  • For EDUCATION (section III on C1): the data is in a TABLE with one row per education level. Each row has these columns (left to right):
      LEVEL | NAME OF SCHOOL | BASIC EDUCATION/DEGREE/COURSE | PERIOD OF ATTENDANCE (From, To) | HIGHEST LEVEL/UNITS EARNED | YEAR GRADUATED | SCHOLARSHIP/ACADEMIC HONORS
    There are up to 5 levels: ELEMENTARY, SECONDARY, VOCATIONAL/TRADE COURSE, COLLEGE, GRADUATE STUDIES.
    Create a SEPARATE education entry for EACH level that has a school name (skip levels where the school is "N/A" or blank).
    Map: LEVEL → educationLevel, NAME OF SCHOOL → schoolName, BASIC EDUCATION/DEGREE/COURSE → degree (and course), YEAR GRADUATED → yearGraduated, HIGHEST LEVEL/UNITS EARNED → unitsEarned, SCHOLARSHIP/ACADEMIC HONORS → awards.
  • For WORK EXPERIENCE (section V on C2): the table columns are:
      From | To | POSITION TITLE | DEPARTMENT/AGENCY/OFFICE/COMPANY | NAME OF OFFICE/UNIT | IMMEDIATE SUPERVISOR | MONTHLY SALARY | SALARY GRADE | STATUS OF EMPLOYMENT | GOVT SERVICE (Y/N)
    Create one entry per work row. Map position title, employer name (department/company), employer address, inclusive dates, monthly salary, status of employment, and isGovtService (Yes→true, No→false).
  • For ELIGIBILITY (section IV on C2): the table columns are:
      CAREER SERVICE/RA 1080 (BOARD/BAR) | RATING | DATE OF EXAM | PLACE OF EXAM | LICENSE NUMBER | DATE OF VALIDITY
    Create one entry per eligibility row. Map to eligibilityTitle, rating, examDate, examPlace, licenseNumber, licenseValidity.
  • For TRAINING (section VII on C3): the table columns are:
      TITLE OF L&D/TRAINING | From | To | NUMBER OF HOURS | Type of LD (Managerial/Supervisory/Technical/etc)
    Create one entry per training row. Map to titleOfTraining, typeOfTraining, inclusiveDateFrom, inclusiveDateTo, numberHours.
  • For AWARDS (section VIII "NON-ACADEMIC DISTINCTIONS / RECOGNITION" on C3): list each recognition. Map to recognitionDetails, recognitionType ("Award" or "Recognition"), recognitionProvider if stated.

Return a JSON object with this exact structure:
{
  "personalInfo": {
    "firstName": {"value": null, "confidence": "none", "source": "name section"},
    "middleName": {"value": null, "confidence": "none", "source": ""},
    "lastName": {"value": null, "confidence": "none", "source": ""},
    "extensionName": {"value": null, "confidence": "none", "source": ""},
    "emailAddress": {"value": null, "confidence": "none", "source": ""},
    "mobileNumber": {"value": null, "confidence": "none", "source": ""},
    "contactNumber": {"value": null, "confidence": "none", "source": ""},
    "birthDate": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"},
    "birthPlace": {"value": null, "confidence": "none", "source": ""},
    "gender": {"value": null, "confidence": "none", "source": "Male or Female"},
    "civilStatus": {"value": null, "confidence": "none", "source": ""},
    "citizenship": {"value": null, "confidence": "none", "source": ""},
    "presentAddress": {"value": null, "confidence": "none", "source": ""},
    "city": {"value": null, "confidence": "none", "source": ""},
    "province": {"value": null, "confidence": "none", "source": ""},
    "country": {"value": null, "confidence": "none", "source": ""}
  },
  "educations": [{"educationLevel": {"value": null, "confidence": "none", "source": ""}, "degree": {"value": null, "confidence": "none", "source": ""}, "course": {"value": null, "confidence": "none", "source": ""}, "schoolName": {"value": null, "confidence": "none", "source": ""}, "yearGraduated": {"value": null, "confidence": "none", "source": ""}, "unitsEarned": {"value": null, "confidence": "none", "source": ""}, "awards": {"value": null, "confidence": "none", "source": ""}}],
  "workExperiences": [{"positionTitle": {"value": null, "confidence": "none", "source": ""}, "employerName": {"value": null, "confidence": "none", "source": ""}, "employerAddress": {"value": null, "confidence": "none", "source": ""}, "inclusiveDateFrom": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "inclusiveDateTo": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "statusOfEmployment": {"value": null, "confidence": "none", "source": ""}, "monthlySalary": {"value": null, "confidence": "none", "source": 0}, "isGovtService": {"value": null, "confidence": "none", "source": false}, "actualDuties": {"value": null, "confidence": "none", "source": ""}}],
  "trainings": [{"titleOfTraining": {"value": null, "confidence": "none", "source": ""}, "typeOfTraining": {"value": null, "confidence": "none", "source": "Technical|Managerial/Supervisory|Orientation|Other"}, "inclusiveDateFrom": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "inclusiveDateTo": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "numberHours": {"value": null, "confidence": "none", "source": 0}}],
  "eligibilities": [{"eligibilityTitle": {"value": null, "confidence": "none", "source": ""}, "rating": {"value": null, "confidence": "none", "source": ""}, "examDate": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "examPlace": {"value": null, "confidence": "none", "source": ""}, "licenseNumber": {"value": null, "confidence": "none", "source": ""}}],
  "awards": []
}`,
    RESUME: `${base}
{
  "personalInfo": { "firstName": {"value": null, "confidence": "none", "source": ""}, "lastName": {"value": null, "confidence": "none", "source": ""}, "middleName": {"value": null, "confidence": "none", "source": ""}, "emailAddress": {"value": null, "confidence": "none", "source": ""}, "mobileNumber": {"value": null, "confidence": "none", "source": ""}, "contactNumber": {"value": null, "confidence": "none", "source": ""}, "presentAddress": {"value": null, "confidence": "none", "source": ""}, "city": {"value": null, "confidence": "none", "source": ""}, "province": {"value": null, "confidence": "none", "source": ""}, "country": {"value": null, "confidence": "none", "source": ""} },
  "educations": [{"educationLevel": {"value": null, "confidence": "none", "source": ""}, "degree": {"value": null, "confidence": "none", "source": ""}, "course": {"value": null, "confidence": "none", "source": ""}, "schoolName": {"value": null, "confidence": "none", "source": ""}, "yearGraduated": {"value": null, "confidence": "none", "source": ""}}],
  "workExperiences": [{"positionTitle": {"value": null, "confidence": "none", "source": ""}, "employerName": {"value": null, "confidence": "none", "source": ""}, "inclusiveDateFrom": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "inclusiveDateTo": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "actualDuties": {"value": null, "confidence": "none", "source": ""}}],
  "trainings": [{"titleOfTraining": {"value": null, "confidence": "none", "source": ""}, "inclusiveDateFrom": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "inclusiveDateTo": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "numberHours": {"value": null, "confidence": "none", "source": 0}}],
  "eligibilities": []
}`,
    EDUCATION: `${base}
{ "educations": [{"educationLevel": {"value": null, "confidence": "none", "source": ""}, "degree": {"value": null, "confidence": "none", "source": ""}, "course": {"value": null, "confidence": "none", "source": ""}, "schoolName": {"value": null, "confidence": "none", "source": ""}, "yearGraduated": {"value": null, "confidence": "none", "source": ""}, "unitsEarned": {"value": null, "confidence": "none", "source": ""}, "awards": {"value": null, "confidence": "none", "source": ""}}] }`,
    WORK_EXPERIENCE: `${base}
{ "workExperiences": [{"positionTitle": {"value": null, "confidence": "none", "source": ""}, "employerName": {"value": null, "confidence": "none", "source": ""}, "employerAddress": {"value": null, "confidence": "none", "source": ""}, "inclusiveDateFrom": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "inclusiveDateTo": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "statusOfEmployment": {"value": null, "confidence": "none", "source": ""}, "monthlySalary": {"value": null, "confidence": "none", "source": 0}, "isGovtService": {"value": null, "confidence": "none", "source": false}, "actualDuties": {"value": null, "confidence": "none", "source": ""}}] }`,
    TRAINING: `${base}
{ "trainings": [{"titleOfTraining": {"value": null, "confidence": "none", "source": ""}, "typeOfTraining": {"value": null, "confidence": "none", "source": "Technical|Managerial/Supervisory|Orientation|Other"}, "inclusiveDateFrom": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "inclusiveDateTo": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "numberHours": {"value": null, "confidence": "none", "source": 0}}] }`,
    ELIGIBILITY: `${base}
{ "eligibilities": [{"eligibilityTitle": {"value": null, "confidence": "none", "source": ""}, "rating": {"value": null, "confidence": "none", "source": ""}, "examDate": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "examPlace": {"value": null, "confidence": "none", "source": ""}, "licenseNumber": {"value": null, "confidence": "none", "source": ""}, "licenseValidity": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}}] }`,
    AWARD: `${base}
{ "awards": [{"recognitionType": {"value": null, "confidence": "none", "source": "Award"}, "recognitionDetails": {"value": null, "confidence": "none", "source": ""}, "recognitionScope": {"value": null, "confidence": "none", "source": ""}, "recognitionCategory": {"value": null, "confidence": "none", "source": ""}, "recognitionProvider": {"value": null, "confidence": "none", "source": ""}, "dateGranted": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}}] }`,
    ACCOMPLISHMENT: `${base}
{ "awards": [{"recognitionType": {"value": null, "confidence": "none", "source": "Accomplishment"}, "recognitionDetails": {"value": null, "confidence": "none", "source": ""}, "recognitionScope": {"value": null, "confidence": "none", "source": ""}, "recognitionCategory": {"value": null, "confidence": "none", "source": ""}, "recognitionProvider": {"value": null, "confidence": "none", "source": ""}, "dateGranted": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}}] }`,
    COE: `${base}
{ "workExperiences": [{"positionTitle": {"value": null, "confidence": "none", "source": ""}, "employerName": {"value": null, "confidence": "none", "source": ""}, "employerAddress": {"value": null, "confidence": "none", "source": ""}, "inclusiveDateFrom": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "inclusiveDateTo": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "statusOfEmployment": {"value": null, "confidence": "none", "source": ""}, "monthlySalary": {"value": null, "confidence": "none", "source": 0}, "isGovtService": {"value": null, "confidence": "none", "source": false}}] }`,
    PERFORMANCE_EVALUATION: `${base}
{ "personalInfo": { "firstName": {"value": null, "confidence": "none", "source": ""}, "lastName": {"value": null, "confidence": "none", "source": ""} } }`,
    SUPPORTING: `${base}
{ "personalInfo": { "firstName": {"value": null, "confidence": "none", "source": ""}, "lastName": {"value": null, "confidence": "none", "source": ""}, "emailAddress": {"value": null, "confidence": "none", "source": ""} } }`,
    PROFILE_PICTURE: `${base}
{ "personalInfo": {} }`,
  };

  return schemas[category] || schemas.SUPPORTING;
}

function parseJsonResponse(content: string): unknown {
  if (!content) throw new Error("Empty response from LLM/VLM");
  // strip markdown fences if present
  let cleaned = content.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  // find first { and last }
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    cleaned = cleaned.slice(first, last + 1);
  }
  return JSON.parse(cleaned);
}

// ---- Parallel per-section PDS extraction ----
//
// The PDS (CSC Form 212) is a large 4-sheet Excel document. A single LLM call
// to extract ALL sections (personal info + education + work + training +
// eligibility + awards) takes 60+ seconds because the model must generate a
// very large JSON output. This exceeds gateway/browser HTTP timeouts (typically
// 30–60s), causing the client to receive a 504/timeout error even though the
// server eventually completes successfully.
//
// FIX: Split the extraction into 4 focused parallel LLM calls, each asking for
// only a subset of the data. Each call generates a much smaller JSON output, so
// each completes in ~10–15s. Running them in parallel means the total wall-clock
// time is the slowest call (~15s) instead of the sum (~60s) — comfortably under
// any gateway timeout.
//
// The 4 groups are chosen to balance output size and keep related sections
// together (e.g. work experience and eligibility are both on Sheet C2):
//   1. Personal info  (Sheet C1)
//   2. Educations     (Sheet C1)
//   3. Work + Eligibility (Sheet C2)
//   4. Training + Awards  (Sheet C3)

/** Shared preamble for all per-section prompts. */
const PDS_PREAMBLE = `You are a document intelligence assistant for the DOST-MIRDC Recruitment Management Information System (RMIS).
Analyze the provided PDS (Philippine Civil Service Commission CSC Form 212 Revised 2017) spreadsheet content and extract structured information.

CRITICAL RULES:
1. Extract ONLY information that is clearly present in the document.
2. NEVER fabricate, guess, or infer information that is not explicitly stated.
3. If a field cannot be found, set its value to null and confidence to "none".
4. Use confidence "high" only when the value is explicitly and unambiguously stated.
5. Use "medium" when the value is present but requires minor interpretation.
6. Use "low" when the value is implied or partially stated.
7. Return ONLY valid JSON (no markdown fences, no commentary).
8. "N/A" in a section means the applicant has no data — return an EMPTY array.
9. Dates may appear as full timestamps (e.g. "Mon Dec 01 2003 00:00:00 GMT+0000") — convert to "YYYY-MM-DD".`;

/** Extract personal info + educations + work + eligibility from C1+C2 sheets. */
async function extractPdsCore(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  text: string
): Promise<Partial<ExtractionResult>> {
  const prompt = `${PDS_PREAMBLE}

Extract these sections from the PDS:

1. PERSONAL INFORMATION (Section I, Sheet C1): firstName, middleName, lastName, extensionName,
   emailAddress, mobileNumber, contactNumber, birthDate (YYYY-MM-DD), birthPlace, gender
   (Male/Female), civilStatus (Single/Married/Widowed/Separated), citizenship, presentAddress,
   city, province, country, zipCode.

2. EDUCATIONAL BACKGROUND (Section III, Sheet C1): TABLE with one row per level
   (ELEMENTARY, SECONDARY, VOCATIONAL/TRADE COURSE, COLLEGE, GRADUATE STUDIES).
   Columns: LEVEL | NAME OF SCHOOL | DEGREE/COURSE | PERIOD (From, To) | UNITS EARNED |
   YEAR GRADUATED | HONORS. Create one entry per level with a real school name.
   Map: LEVEL→educationLevel, SCHOOL→schoolName, DEGREE/COURSE→degree, YEAR→yearGraduated,
   UNITS→unitsEarned, HONORS→awards.

3. CIVIL SERVICE ELIGIBILITY (Section IV, Sheet C2): TABLE columns:
   CAREER SERVICE/RA 1080 | RATING | DATE OF EXAM | PLACE OF EXAM | LICENSE NUMBER | DATE OF VALIDITY
   Map to eligibilityTitle, rating, examDate, examPlace, licenseNumber, licenseValidity.

4. WORK EXPERIENCE (Section V, Sheet C2): TABLE columns:
   From | To | POSITION TITLE | DEPARTMENT/COMPANY | OFFICE/UNIT | SUPERVISOR | SALARY | GRADE |
   STATUS | GOVT SERVICE (Y/N). Map positionTitle, employerName, employerAddress, inclusiveDateFrom,
   inclusiveDateTo, monthlySalary (number), statusOfEmployment, isGovtService (Yes→true), actualDuties.

"N/A" means no data — return EMPTY array. Dates as "YYYY-MM-DD".

Return ONLY this JSON:
{
  "personalInfo": {"firstName": {"value": null, "confidence": "none", "source": ""}, "middleName": {"value": null, "confidence": "none", "source": ""}, "lastName": {"value": null, "confidence": "none", "source": ""}, "extensionName": {"value": null, "confidence": "none", "source": ""}, "emailAddress": {"value": null, "confidence": "none", "source": ""}, "mobileNumber": {"value": null, "confidence": "none", "source": ""}, "contactNumber": {"value": null, "confidence": "none", "source": ""}, "birthDate": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "birthPlace": {"value": null, "confidence": "none", "source": ""}, "gender": {"value": null, "confidence": "none", "source": "Male or Female"}, "civilStatus": {"value": null, "confidence": "none", "source": ""}, "citizenship": {"value": null, "confidence": "none", "source": ""}, "presentAddress": {"value": null, "confidence": "none", "source": ""}, "city": {"value": null, "confidence": "none", "source": ""}, "province": {"value": null, "confidence": "none", "source": ""}, "country": {"value": null, "confidence": "none", "source": ""}, "zipCode": {"value": null, "confidence": "none", "source": ""}},
  "educations": [{"educationLevel": {"value": null, "confidence": "none", "source": ""}, "degree": {"value": null, "confidence": "none", "source": ""}, "course": {"value": null, "confidence": "none", "source": ""}, "schoolName": {"value": null, "confidence": "none", "source": ""}, "yearGraduated": {"value": null, "confidence": "none", "source": ""}, "unitsEarned": {"value": null, "confidence": "none", "source": ""}, "awards": {"value": null, "confidence": "none", "source": ""}}],
  "workExperiences": [{"positionTitle": {"value": null, "confidence": "none", "source": ""}, "employerName": {"value": null, "confidence": "none", "source": ""}, "employerAddress": {"value": null, "confidence": "none", "source": ""}, "inclusiveDateFrom": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "inclusiveDateTo": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "statusOfEmployment": {"value": null, "confidence": "none", "source": ""}, "monthlySalary": {"value": null, "confidence": "none", "source": 0}, "isGovtService": {"value": null, "confidence": "none", "source": false}, "actualDuties": {"value": null, "confidence": "none", "source": ""}}],
  "eligibilities": [{"eligibilityTitle": {"value": null, "confidence": "none", "source": ""}, "rating": {"value": null, "confidence": "none", "source": ""}, "examDate": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "examPlace": {"value": null, "confidence": "none", "source": ""}, "licenseNumber": {"value": null, "confidence": "none", "source": ""}, "licenseValidity": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}}]
}

Parsed spreadsheet content:
---
${text}
---`;

  const response = await zai.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
  });
  const parsed = parseJsonResponse(response.choices[0]?.message?.content || "") as Partial<ExtractionResult>;
  return {
    personalInfo: parsed.personalInfo,
    educations: parsed.educations || [],
    workExperiences: parsed.workExperiences || [],
    eligibilities: parsed.eligibilities || [],
  };
}

/** Extract trainings + awards from C3 sheet (the largest section — 18+ entries). */
async function extractPdsTrainingAwards(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  text: string
): Promise<Partial<ExtractionResult>> {
  const prompt = `${PDS_PREAMBLE}

Extract these sections from the PDS. The content may include Sheet C3 (Page 3) AND
any CONTINUATION sheets/pages the applicant added for overflow entries.

1. LEARNING AND DEVELOPMENT / TRAINING PROGRAMS (Section VII): TABLE columns:
   TITLE OF L&D/TRAINING | From | To | NUMBER OF HOURS | Type of LD (Managerial/Supervisory/Technical/etc)
   Create one entry per row. Map to titleOfTraining, typeOfTraining, inclusiveDateFrom,
   inclusiveDateTo, numberHours (number).
   IMPORTANT: continuation pages often repeat only the table (no section header) —
   treat every row shaped "title | date | date | hours" as a training entry.

2. OTHER INFORMATION - NON-ACADEMIC DISTINCTIONS / RECOGNITION (Section VIII):
   List each recognition. Map to recognitionDetails, recognitionType ("Award" or "Recognition"),
   recognitionProvider, recognitionScope, recognitionCategory, dateGranted.

"N/A" means no data — return EMPTY array. Dates as "YYYY-MM-DD".

Return ONLY this JSON:
{
  "trainings": [{"titleOfTraining": {"value": null, "confidence": "none", "source": ""}, "typeOfTraining": {"value": null, "confidence": "none", "source": "Technical|Managerial/Supervisory|Orientation|Other"}, "inclusiveDateFrom": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "inclusiveDateTo": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "numberHours": {"value": null, "confidence": "none", "source": 0}}],
  "awards": [{"recognitionType": {"value": null, "confidence": "none", "source": "Award"}, "recognitionDetails": {"value": null, "confidence": "none", "source": ""}, "recognitionScope": {"value": null, "confidence": "none", "source": ""}, "recognitionCategory": {"value": null, "confidence": "none", "source": ""}, "recognitionProvider": {"value": null, "confidence": "none", "source": ""}, "dateGranted": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}}]
}

Parsed spreadsheet content:
---
${text}
---`;

  const response = await zai.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
  });
  const parsed = parseJsonResponse(response.choices[0]?.message?.content || "") as Partial<ExtractionResult>;
  return {
    trainings: parsed.trainings || [],
    awards: parsed.awards || [],
  };
}

/**
 * Wrap an LLM call with retry-on-429 (rate limit) logic. The ZAI API enforces
 * a concurrency/rate limit. This helper waits 3s and retries up to 3 times.
 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (/429|rate.?limit|too many requests/i.test(msg) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

/**
 * Split the parsed Excel text by sheet markers ("=== Sheet: <name> ===") into a
 * map of sheetName → text. This lets each extraction call receive ONLY the
 * relevant sheet(s), reducing the LLM input from ~16,000 chars (all 4 sheets)
 * to ~8,000 chars (C1+C2) or ~4,000 chars (C3) — cutting per-call time.
 */
function splitTextBySheet(text: string): Map<string, string> {
  const sheets = new Map<string, string>();
  const parts = text.split(/(?==== Sheet: )/);
  for (const part of parts) {
    const match = part.match(/^=== Sheet: (.+?) ===\n/);
    if (match) {
      const name = match[1].trim();
      sheets.set(name, part);
    }
  }
  return sheets;
}

/**
 * Extract PDS data using exactly 2 parallel LLM calls (staying under the ZAI
 * API's concurrency limit of ~2):
 *
 *   Call 1 (C1+C2): personalInfo + educations + workExperiences + eligibilities
 *   Call 2 (C3):    trainings + awards
 *
 * Running in parallel, total time = max(call1, call2) ≈ 25–35s, comfortably
 * under the 60s gateway timeout. Each call gets only its relevant sheet text
 * (not the full 16K-char document), further reducing per-call time.
 *
 * If a call fails (even after 429 retries), that section returns [] so the
 * rest of the extraction still succeeds.
 */
async function extractPdsParallel(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  text: string
): Promise<ExtractionResult> {
  const sheets = splitTextBySheet(text);
  const findSheet = (patterns: RegExp[]): string => {
    for (const [name, content] of sheets) {
      if (patterns.some((p) => p.test(name))) return content;
    }
    return text; // fallback: use full text
  };
  const sheetC1 = findSheet([/^c?1$/i, /^sheet.?1$/i, /^page.?1$/i]);
  const sheetC2 = findSheet([/^c?2$/i, /^sheet.?2$/i, /^page.?2$/i]);
  const sheetC3 = findSheet([/^c?3$/i, /^sheet.?3$/i, /^page.?3$/i]);

  // ── OVERFLOW: route applicant-added continuation sheets ──
  // Sheets beyond the standard C1–C4/Lookup set ("C3 (2)", "Continuation",
  // "Sheet1", ...) contain overflow rows. Classify each by keyword and append
  // its text to the relevant LLM call's input so the overflow is extracted.
  const warnings: string[] = [];
  const KNOWN_SHEET = /^(c[1-4]|lookup|sheet\.?[1-4]|page\.?[1-4])$/i;
  let extraTrainingText = "";
  let extraCoreText = "";
  for (const [name, content] of sheets) {
    if (KNOWN_SHEET.test(name.trim())) continue;
    const lower = content.toLowerCase();
    if (/non-academic|title of learning|training program|l&d|number of hours|recognition/.test(lower)) {
      extraTrainingText += `\n=== Continuation sheet: ${name} ===\n${content}`;
      warnings.push(`Continuation sheet "${name}" routed to training/awards extraction.`);
    } else if (/position title|career service|name of school|rating/.test(lower)) {
      extraCoreText += `\n=== Continuation sheet: ${name} ===\n${content}`;
      warnings.push(`Continuation sheet "${name}" routed to core extraction.`);
    } else {
      // Unknown content — most continuation sheets are trainings/awards.
      extraTrainingText += `\n=== Continuation sheet: ${name} ===\n${content}`;
      warnings.push(`Unrecognized continuation sheet "${name}" scanned for trainings/awards.`);
    }
  }

  // Core call gets C1 + C2 combined (personal info, education, work, eligibility)
  const coreText = `${sheetC1}\n${sheetC2}${extraCoreText}`;
  // Training/awards call gets C3 + any training-shaped continuation sheets
  const trainingText = `${sheetC3}${extraTrainingText}`;

  const safeRun = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await withRetry(fn); } catch { return fallback; }
  };

  // Run calls SEQUENTIALLY (one at a time). The ZAI API enforces a strict
  // concurrency rate limit — even 2 parallel requests trigger HTTP 429.
  // Sequential calls never hit 429. Each call gets only its relevant sheet text
  // (~8K chars for C1+C2, ~4K for C3), keeping per-call time low.
  //   Call 1 (C1+C2): personal + education + work + eligibility  ≈ 20s
  //   Call 2 (C3):    training + awards                          ≈ 25s
  //   Total ≈ 45s — well under the 60s gateway timeout.
  const core = await safeRun(() => withRetry(() => extractPdsCore(zai, coreText)), {
    personalInfo: {}, educations: [], workExperiences: [], eligibilities: [],
  });
  const trainingAwards = await safeRun(() => withRetry(() => extractPdsTrainingAwards(zai, trainingText)), {
    trainings: [], awards: [],
  });

  return dedupeExtraction({
    personalInfo: core.personalInfo || {},
    educations: core.educations || [],
    workExperiences: core.workExperiences || [],
    eligibilities: core.eligibilities || [],
    trainings: trainingAwards.trainings || [],
    awards: trainingAwards.awards || [],
    documentType: "PDS" as DocumentCategory,
    warnings,
  });
}

// ---- Multi-page PDF PDS extraction (page-chunked, section-carryover) -------
//
// A multi-page PDS PDF (applicants with 100+ trainings submit 6–10+ pages)
// cannot be extracted in one LLM call: the old 12K-char truncation silently
// dropped every page past ~2. Instead we:
//   1. Extract text PER PAGE (parsePdfPages).
//   2. Group pages into chunks of ≤4 pages / ~11K chars.
//   3. Chunk 1 → standard core extraction (personal/education/work/eligibility).
//   4. Chunks 2+ → a CONTINUATION prompt that classifies each row by its table
//      shape (trainings/awards/work/education) — overflow pages usually have NO
//      section headers, so shape-based classification is what keeps awards out
//      of the training bucket and vice versa.
//   5. Merge + dedupe (chunk boundaries can duplicate a row that spans pages).

const MAX_PDF_PAGES = 40;

function buildPdfChunks(pages: string[]): string[] {
  const chunks: string[] = [];
  let cur = "";
  let count = 0;
  pages.forEach((page, idx) => {
    if (!page) return;
    const pageText = `--- PAGE ${idx + 1} ---\n${page}`;
    if (cur && (cur.length + pageText.length > 11000 || count >= 4)) {
      chunks.push(cur);
      cur = "";
      count = 0;
    }
    cur += (cur ? "\n\n" : "") + pageText;
    count++;
  });
  if (cur.trim()) chunks.push(cur);
  return chunks;
}

/**
 * Extract structured rows from a continuation chunk of a multi-page PDS PDF.
 * Continuation pages have no section headers, so the model classifies rows by
 * their table SHAPE (title+dates+hours → training; recognition text → award;
 * position+employer+dates → work; level+school+year → education).
 */
async function extractPdsContinuation(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  chunkText: string
): Promise<Partial<ExtractionResult>> {
  const prompt = `${PDS_PREAMBLE}

You are given CONTINUATION pages of a multi-page Philippine CSC Form 212 (PDS) PDF.
Earlier pages (personal information, family background, eligibility) were already
extracted. These pages typically contain OVERFLOW rows the applicant added —
e.g. 100+ training entries or awards — and often have NO section headers.

Classify every data row by its TABLE SHAPE and extract ALL of them:
  • TRAINING row    → "title of training/seminar | from-date | to-date | number of hours [type]"
                      → { titleOfTraining, typeOfTraining, inclusiveDateFrom, inclusiveDateTo, numberHours }
  • AWARD row       → a recognition/distinction line, sometimes with a date or granting body
                      → { recognitionType: "Award"|"Recognition", recognitionDetails, recognitionProvider, dateGranted }
  • WORK row        → "position title | department/company | from | to | salary | status"
                      → { positionTitle, employerName, inclusiveDateFrom, inclusiveDateTo, monthlySalary, statusOfEmployment }
  • EDUCATION row   → "level | school | degree/course | year graduated"
                      → { educationLevel, schoolName, degree, yearGraduated }

CRITICAL:
  • Extract ONLY rows clearly present in the text. NEVER fabricate.
  • Ignore page headers/footers, CSC form boilerplate, signature lines,
    instructions, and repeated section labels.
  • A row that spans two pages (title on one page, dates on the next) is ONE row.
  • Dates → "YYYY-MM-DD". "N/A"/blank sections → empty arrays.

Return ONLY this JSON:
{
  "trainings": [{"titleOfTraining": {"value": null, "confidence": "none", "source": ""}, "typeOfTraining": {"value": null, "confidence": "none", "source": ""}, "inclusiveDateFrom": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "inclusiveDateTo": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "numberHours": {"value": null, "confidence": "none", "source": 0}}],
  "awards": [{"recognitionType": {"value": null, "confidence": "none", "source": "Award"}, "recognitionDetails": {"value": null, "confidence": "none", "source": ""}, "recognitionProvider": {"value": null, "confidence": "none", "source": ""}, "dateGranted": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}}],
  "workExperiences": [{"positionTitle": {"value": null, "confidence": "none", "source": ""}, "employerName": {"value": null, "confidence": "none", "source": ""}, "inclusiveDateFrom": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "inclusiveDateTo": {"value": null, "confidence": "none", "source": "YYYY-MM-DD"}, "monthlySalary": {"value": null, "confidence": "none", "source": 0}, "statusOfEmployment": {"value": null, "confidence": "none", "source": ""}}],
  "educations": [{"educationLevel": {"value": null, "confidence": "none", "source": ""}, "schoolName": {"value": null, "confidence": "none", "source": ""}, "degree": {"value": null, "confidence": "none", "source": ""}, "yearGraduated": {"value": null, "confidence": "none", "source": ""}}]
}

Continuation pages content:
---
${chunkText}
---`;

  const response = await zai.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
  });
  const parsed = parseJsonResponse(response.choices[0]?.message?.content || "") as Partial<ExtractionResult>;
  return {
    trainings: parsed.trainings || [],
    awards: parsed.awards || [],
    workExperiences: parsed.workExperiences || [],
    educations: parsed.educations || [],
  };
}

/**
 * Extract a multi-page PDS PDF by processing page chunks sequentially and
 * merging the results. Chunk 1 uses the standard core prompt; every later
 * chunk uses the continuation prompt. Rows duplicated across chunk boundaries
 * are removed by dedupeExtraction.
 */
async function extractPdsPdfChunked(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  pages: string[]
): Promise<ExtractionResult> {
  const warnings: string[] = [];
  if (pages.length > MAX_PDF_PAGES) {
    warnings.push(`Document has ${pages.length} pages — only the first ${MAX_PDF_PAGES} were processed.`);
  }
  const chunks = buildPdfChunks(pages.slice(0, MAX_PDF_PAGES));

  const safeRun = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await withRetry(fn); } catch { return fallback; }
  };

  const merged: ExtractionResult = {
    personalInfo: {},
    educations: [],
    workExperiences: [],
    trainings: [],
    eligibilities: [],
    awards: [],
    documentType: "PDS" as DocumentCategory,
    warnings,
  };

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (i === 0) {
      // First chunk — standard core extraction (personal + education + work + eligibility).
      const core = await safeRun(() => withRetry(() => extractPdsCore(zai, chunk)), {
        personalInfo: {}, educations: [], workExperiences: [], eligibilities: [],
      });
      merged.personalInfo = core.personalInfo || {};
      merged.educations = core.educations || [];
      merged.workExperiences = core.workExperiences || [];
      merged.eligibilities = core.eligibilities || [];
      // The first chunk may also contain the start of the training/awards
      // sections (pages 3–4 of a standard PDS) — extract those too.
      const ta = await safeRun(() => withRetry(() => extractPdsTrainingAwards(zai, chunk)), {
        trainings: [], awards: [],
      });
      merged.trainings = ta.trainings || [];
      merged.awards = ta.awards || [];
    } else {
      // Continuation chunks — shape-based classification of overflow rows.
      const cont = await safeRun(() => withRetry(() => extractPdsContinuation(zai, chunk)), {
        trainings: [], awards: [], workExperiences: [], educations: [],
      });
      merged.trainings!.push(...(cont.trainings || []));
      merged.awards!.push(...(cont.awards || []));
      merged.workExperiences!.push(...(cont.workExperiences || []));
      merged.educations!.push(...(cont.educations || []));
      if ((cont.trainings?.length || cont.awards?.length || cont.workExperiences?.length || cont.educations?.length)) {
        warnings.push(`Pages chunk ${i + 1}: overflow rows recovered (trainings/awards/work/education).`);
      }
    }
  }

  return dedupeExtraction(merged);
}

// ---- Main extraction entry point ----

export async function extractFromDocument(
  filePath: string,
  category: DocumentCategory
): Promise<ExtractionResult> {
  const kind = detectFileKind(filePath);

  // ── PDS Excel: deterministic cell-based parser (PRIMARY path) ──────────────
  // The PDS (CSC Form 212 Revised 2017) is a standardized government form with
  // a fixed Excel layout. Reading the cells directly is:
  //   • Instant       (~200–500ms vs 60–86s with the LLM)
  //   • 100% accurate (no hallucination, no truncation, no rate limits)
  //   • Free          (no API call)
  // The LLM path below is kept as a fallback only for non-Excel PDS files
  // (scanned PDFs / images) or if the deterministic parser doesn't recognize
  // the file as a standard CSC Form 212 template.
  if (category === "PDS" && kind === "excel") {
    try {
      const deterministic = await parsePdsExcel(filePath);
      if (deterministic) {
        return deterministic;
      }
      // Not a recognized standard PDS layout → fall through to the LLM path.
    } catch (e) {
      console.warn("[extraction] Deterministic PDS parser failed, falling back to LLM:", e instanceof Error ? e.message : e);
    }
  }

  const prompt = buildPrompt(category);
  const zai = await ZAI.create();

  // Excel, PDF, and Word documents → extract text, then use the text-based LLM.
  // (The VLM API rejects PDF/Word file_url data URLs with "URL格式无效"; text
  // extraction is also more reliable for structured documents like PDS/resumes.)
  if (kind === "excel" || kind === "pdf" || kind === "word") {
    const excelText =
      kind === "excel" ? await parseExcelToText(filePath)
      : kind === "pdf" ? await parsePdfToText(filePath)
      : await parseWordToText(filePath);
    if (!excelText.trim()) {
      return {
        personalInfo: {},
        educations: [],
        workExperiences: [],
        trainings: [],
        eligibilities: [],
        awards: [],
        documentType: category,
        rawTextPreview: "",
        warnings: [`No readable text content found in ${kind} file`],
      };
    }

    // ── PDS (fallback): parallel per-section LLM extraction ──
    // Reached only for non-Excel PDS files (scanned PDFs/images) or when the
    // deterministic parser didn't recognize the layout.
    if (category === "PDS") {
      // PDFs: page-chunked extraction — multi-page PDS PDFs (100+ trainings)
      // must NOT be truncated; every page is processed and merged.
      if (kind === "pdf") {
        const pages = await parsePdfPages(filePath);
        if (!pages.some((p) => p)) {
          return {
            personalInfo: {},
            educations: [],
            workExperiences: [],
            trainings: [],
            eligibilities: [],
            awards: [],
            documentType: category,
            rawTextPreview: "",
            warnings: ["No readable text content found in PDF (it may be a scan without a text layer)"],
          };
        }
        const result = await extractPdsPdfChunked(zai, pages);
        return {
          ...result,
          rawTextPreview: pages.join("\n").slice(0, 2000),
        };
      }
      const result = await extractPdsParallel(zai, excelText);
      return {
        ...result,
        documentType: category,
        rawTextPreview: excelText.slice(0, 2000),
      };
    }

    // ── Other document types (resume, education cert, etc.): single call ──
    // These are smaller documents where a single call completes in <20s.
    const excelPrompt = `${prompt}

The following is the parsed content of a spreadsheet document.
The content is organized by sheet (=== Sheet: <name> ===) and each row is a line of
"Label: Value" pairs and/or pipe-separated (" | ") tabular values.

If a section shows only "N/A" with no real data, return an EMPTY array for it.
Dates may appear as full timestamps (e.g. "Mon Dec 01 2003 00:00:00 GMT+0000") —
convert to "YYYY-MM-DD" in the output.

Parsed spreadsheet content:
---
${excelText}
---

Return ONLY the JSON object. Populate all arrays with ALL entries found in the document.`;

    const response = await zai.chat.completions.create({
      messages: [{ role: "user", content: excelPrompt }],
    });
    const contentText = response.choices[0]?.message?.content || "";
    const parsed = parseJsonResponse(contentText) as ExtractionResult;
    return {
      ...parsed,
      documentType: category,
      rawTextPreview: excelText.slice(0, 2000),
      warnings: [],
    };
  }

  // Images → VLM (image data URLs are accepted by the vision API).
  if (kind === "image") {
    const { url } = await readAsDataUrl(filePath);
    const content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > = [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url } },
    ];

    const response = await zai.chat.completions.createVision({
      messages: [{ role: "user", content }],
      thinking: { type: "disabled" },
    });

    const contentText = response.choices[0]?.message?.content || "";
    const parsed = parseJsonResponse(contentText) as ExtractionResult;
    return {
      ...parsed,
      documentType: category,
      warnings: [],
    };
  }

  // Unsupported file type — cannot extract.
  return {
    personalInfo: {},
    educations: [],
    workExperiences: [],
    trainings: [],
    eligibilities: [],
    awards: [],
    documentType: category,
    rawTextPreview: "",
    warnings: [`Unsupported file type (${kind}) for extraction`],
  };
}

// ---- Overflow dedupe -------------------------------------------------------

/** Build a dedupe signature for a single extracted entry (lowercased, trimmed). */
function entrySignature(section: string, entry: Record<string, unknown>): string | null {
  const val = (k: string): string => {
    const f = entry[k] as { value?: unknown } | undefined;
    const v = f?.value;
    return v == null ? "" : String(v).trim().toLowerCase();
  };
  switch (section) {
    case "trainings": {
      const key = `${val("titleOfTraining")}|${val("inclusiveDateFrom")}`;
      return key.replace(/\|+$/, "") || null;
    }
    case "awards": {
      const key = val("recognitionDetails");
      return key || null;
    }
    case "workExperiences": {
      const key = `${val("positionTitle")}|${val("employerName")}|${val("inclusiveDateFrom")}`;
      return key.replace(/\|+$/, "") || null;
    }
    case "eligibilities": {
      const key = `${val("eligibilityTitle")}|${val("examDate")}`;
      return key.replace(/\|+$/, "") || null;
    }
    case "educations": {
      const key = `${val("educationLevel")}|${val("schoolName")}`;
      return key.replace(/\|+$/, "") || null;
    }
    default:
      return null;
  }
}

/**
 * Remove duplicate entries produced by chunk/sheet overlap (e.g. a training
 * row that spans two PDF pages gets extracted by both chunks). A duplicate is
 * an entry whose section signature matches an earlier entry. First occurrence
 * wins; empty-signature entries are always kept.
 */
export function dedupeExtraction(result: ExtractionResult): ExtractionResult {
  const sections = [
    "educations",
    "workExperiences",
    "trainings",
    "eligibilities",
    "awards",
  ] as const;
  const seen = new Set<string>();
  const out = { ...result } as ExtractionResult;
  for (const section of sections) {
    const arr = out[section];
    if (!arr?.length) continue;
    const kept: unknown[] = [];
    for (const entry of arr) {
      const sig = entrySignature(section, entry as Record<string, unknown>);
      if (!sig) {
        kept.push(entry);
        continue;
      }
      const key = `${section}:${sig}`;
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(entry);
    }
    (out as Record<string, unknown>)[section] = kept;
  }
  return out;
}

// ---- Merging multiple extractions ----

export function mergeExtractions(results: ExtractionResult[]): ExtractionResult {
  const merged: ExtractionResult = {
    educations: [],
    workExperiences: [],
    trainings: [],
    eligibilities: [],
    awards: [],
    warnings: [],
  };

  const personal: Record<string, ExtractedField> = {};
  for (const r of results) {
    if (r.personalInfo) {
      for (const [key, val] of Object.entries(r.personalInfo)) {
        const existing = personal[key];
        const incoming = val as ExtractedField;
        if (!existing || rankConfidence(incoming.confidence) > rankConfidence(existing.confidence)) {
          if (incoming.value != null && incoming.value !== "") {
            personal[key] = incoming;
          }
        }
      }
    }
    if (r.educations) merged.educations!.push(...r.educations);
    if (r.workExperiences) merged.workExperiences!.push(...r.workExperiences);
    if (r.trainings) merged.trainings!.push(...r.trainings);
    if (r.eligibilities) merged.eligibilities!.push(...r.eligibilities);
    if (r.awards) merged.awards!.push(...r.awards);
    if (r.warnings) merged.warnings!.push(...r.warnings);
  }
  merged.personalInfo = personal;
  return dedupeExtraction(merged);
}

function rankConfidence(c: string): number {
  return { high: 4, medium: 3, low: 2, none: 1 }[c] ?? 0;
}

// Count how many non-null fields are in an extraction (for UX feedback).
// Counts only array entries where at least one field has a non-null value,
// NOT the raw array length — the LLM prompt returns a null-template object
// when nothing is found, which would otherwise inflate the count.
export function countExtractedFields(result: ExtractionResult): number {
  let count = 0;
  if (result.personalInfo) {
    for (const v of Object.values(result.personalInfo)) {
      const f = v as ExtractedField;
      if (f?.value != null && f.value !== "") count++;
    }
  }
  for (const arr of [result.educations, result.workExperiences, result.trainings, result.eligibilities, result.awards]) {
    if (!arr) continue;
    for (const entry of arr) {
      const fields = Object.values(entry as Record<string, ExtractedField>);
      if (fields.some((f) => f?.value != null && f.value !== "")) count++;
    }
  }
  return count;
}
