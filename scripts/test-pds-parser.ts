// Test the PDS parser against:
//   1. The BLANK official Revised 2026 template  → must extract ZERO fields.
//   2. A synthetic FILLED copy of the same file  → must extract real values,
//      with no form furniture anywhere in the output.
import { parsePdsExcel } from "@/lib/pds-parser";
import { countExtractedFields } from "@/lib/extraction";
import ExcelJS from "exceljs";
import { promises as fs } from "fs";
import path from "path";

const BLANK = "upload/1/f68cb119-b1e0-4ab4-82f7-74383b359e73.xlsx";

function summarize(label: string, r: Awaited<ReturnType<typeof parsePdsExcel>>) {
  if (!r) {
    console.log(`${label}: parser returned null (not recognized as PDS)`);
    return;
  }
  const count = countExtractedFields(r);
  const filledPersonal = Object.entries(r.personalInfo || {})
    .filter(([, f]) => f && f.value !== null && f.confidence !== "none")
    .map(([k, f]) => `${k}=${JSON.stringify((f as any).value)}`);
  console.log(`\n===== ${label} =====`);
  console.log(`fieldsExtracted: ${count}`);
  console.log(`personal filled: ${filledPersonal.length ? filledPersonal.join(", ") : "(none)"}`);
  console.log(
    `entries: edu=${r.educations?.length ?? 0} work=${r.workExperiences?.length ?? 0} ` +
    `training=${r.trainings?.length ?? 0} elig=${r.eligibilities?.length ?? 0} awards=${r.awards?.length ?? 0}`
  );
  if (r.warnings?.length) console.log(`warnings: ${r.warnings.join(" | ")}`);
}

// ---- 1. Blank template -----------------------------------------------------
const blankResult = await parsePdsExcel(BLANK);
summarize("BLANK TEMPLATE (expect 0 fields)", blankResult);

// ---- 2. Synthetic filled copy ----------------------------------------------
const filledPath = path.join(process.cwd(), "scripts/tmp-filled-pds.xlsx");
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(await fs.readFile(path.join(process.cwd(), BLANK)));

function findCell(ws: ExcelJS.Worksheet, needle: string, maxCol = 16) {
  for (let r = 1; r <= 400; r++) {
    for (let c = 1; c <= maxCol; c++) {
      let v = "";
      try {
        const val = ws.getRow(r).getCell(c).value;
        if (val == null) v = "";
        else if (typeof val === "object" && "richText" in val) v = (val as any).richText.map((t: any) => t.text || "").join("");
        else if (typeof val === "object" && "result" in val) v = String((val as any).result ?? "");
        else if (typeof val === "object" && "text" in val) v = String((val as any).text ?? "");
        else v = String(val);
      } catch {
        v = "";
      }
      if (v.toLowerCase().includes(needle.toLowerCase())) return { r, c };
    }
  }
  return null;
}

// C1 personal info (labels at known rows per the 2026 layout)
const c1 = wb.getWorksheet("C1")!;
c1.getRow(10).getCell(4).value = "Dela Cruz";   // SURNAME value (D10)
c1.getRow(11).getCell(4).value = "Juan";        // FIRST NAME value (D11)
c1.getRow(12).getCell(4).value = "Santos";      // MIDDLE NAME value (D12)
c1.getRow(11).getCell(14).value = "Jr.";        // NAME EXTENSION value (N11)
c1.getRow(13).getCell(4).value = "01/15/1990";  // DATE OF BIRTH (D13)
c1.getRow(15).getCell(4).value = "Manila";      // PLACE OF BIRTH (D15)
const mob = findCell(c1, "MOBILE NO");          // G33 label → value right (H33)
if (mob) c1.getRow(mob.r).getCell(mob.c + 1).value = "09171234567";
const eml = findCell(c1, "E-MAIL ADDRESS");     // G34 label → value right (H34)
if (eml) c1.getRow(eml.r).getCell(eml.c + 1).value = "juan.delacruz@test.ph";

// C1 education: ELEMENTARY row 55, COLLEGE row 58 (col B holds the level)
c1.getRow(55).getCell(4).value = "Manila Elementary School";
c1.getRow(55).getCell(7).value = "GRADUATED";
c1.getRow(55).getCell(13).value = 2002;
c1.getRow(58).getCell(4).value = "University of the Philippines Diliman";
c1.getRow(58).getCell(7).value = "BS Computer Science";
c1.getRow(58).getCell(10).value = 2010;
c1.getRow(58).getCell(11).value = 2014;
c1.getRow(58).getCell(13).value = 2014;

// C2 eligibility: header row 3 → data rows start at 5.
// 2026 layout: B-E title (merged), F rating, G exam date, I place, L license no, M validity
const c2 = wb.getWorksheet("C2")!;
c2.getRow(5).getCell(2).value = "Civil Service Professional";
c2.getRow(5).getCell(6).value = "80.70";
c2.getRow(5).getCell(7).value = "03/15/2015";
c2.getRow(5).getCell(9).value = "Quezon City";
c2.getRow(5).getCell(12).value = "1234567";
c2.getRow(5).getCell(13).value = "10/15/2027";

// C2 work experience: header row 15 → data rows start at 18
c2.getRow(18).getCell(1).value = "05/01/2020";
c2.getRow(18).getCell(3).value = "12/31/2024";
c2.getRow(18).getCell(4).value = "Information Technology Officer";
c2.getRow(18).getCell(7).value = "Metals Industry Research and Development Center";
c2.getRow(18).getCell(10).value = 55000;
c2.getRow(18).getCell(12).value = "Permanent";
c2.getRow(18).getCell(13).value = "Y";

// C3 training: find header then fill 2 rows below it
const c3 = wb.getWorksheet("C3")!;
const tr = findCell(c3, "TITLE OF LEARNING");
if (tr) {
  c3.getRow(tr.r + 2).getCell(1).value = "Cybersecurity Fundamentals Workshop";
  c3.getRow(tr.r + 2).getCell(5).value = "06/10/2023";
  c3.getRow(tr.r + 2).getCell(6).value = "06/12/2023";
  c3.getRow(tr.r + 2).getCell(7).value = "24 HOURS";
  c3.getRow(tr.r + 2).getCell(8).value = "Technical";
  c3.getRow(tr.r + 3).getCell(1).value = "Leadership and Development Seminar";
  c3.getRow(tr.r + 3).getCell(5).value = "02/01/2024";
  c3.getRow(tr.r + 3).getCell(6).value = "02/02/2024";
  c3.getRow(tr.r + 3).getCell(7).value = "16";
  c3.getRow(tr.r + 3).getCell(8).value = "Managerial";
} else {
  console.log("!! TITLE OF LEARNING not found on C3 — training rows not written");
}

await wb.xlsx.writeFile(filledPath);
const filledResult = await parsePdsExcel(path.relative(process.cwd(), filledPath));
summarize("FILLED COPY (expect real data, no furniture)", filledResult);

// Dump the filled result JSON for manual inspection
console.log("\n----- filled extraction JSON (trimmed) -----");
const fr = filledResult!;
console.log(JSON.stringify(
  {
    personalInfo: fr.personalInfo,
    educations: fr.educations,
    workExperiences: fr.workExperiences,
    trainings: fr.trainings,
    eligibilities: fr.eligibilities,
  },
  null,
  1
).slice(0, 6000));
