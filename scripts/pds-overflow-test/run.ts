// One-off validation script: build a synthetic OVERFLOW PDS (CS Form 212 style)
// with 30 trainings on C3 + 12 past the "continue on separate sheet" marker +
// 80 more on a "C3 (2)" continuation sheet + 35 work rows, then run the
// deterministic parser and print what it recovered.
import ExcelJS from "exceljs";
import { parsePdsExcel } from "../../src/lib/pds-parser";

const wb = new ExcelJS.Workbook();

// ---------- C1: personal info + education ----------
const c1 = wb.addWorksheet("C1");
c1.addRow([]);
c1.addRow([]);
c1.getCell("A3").value = "PERSONAL DATA SHEET";
for (let i = 0; i < 4; i++) c1.addRow([]);
// row 9-ish: name block (labels row 9, values row 10 to the right)
const surnameRow = 9;
c1.getCell(`A${surnameRow}`).value = "SURNAME";
c1.getCell(`C${surnameRow}`).value = "Dela Cruz";
c1.getCell(`E${surnameRow}`).value = "FIRST NAME";
c1.getCell(`G${surnameRow}`).value = "Juan";
c1.getCell(`I${surnameRow}`).value = "MIDDLE NAME";
c1.getCell(`K${surnameRow}`).value = "Santos";
// DOB
c1.getCell("A12").value = "DATE OF BIRTH";
c1.getCell("C12").value = "1990-05-14";
c1.getCell("E12").value = "PLACE OF BIRTH";
c1.getCell("G12").value = "Makati City";
c1.getCell("A15").value = "SEX";
c1.getCell("C15").value = "Male";
c1.getCell("A16").value = "CIVIL STATUS";
c1.getCell("C16").value = "Married";
c1.getCell("F11").value = "16. CITIZENSHIP";
c1.getCell("L11").value = "Filipino";
// address block
c1.getCell("F18").value = "RESIDENTIAL ADDRESS";
c1.getCell("F19").value = "123 Rizal St.";
c1.getCell("F20").value = "Barangay Poblacion";
c1.getCell("F21").value = "Makati City"; // value ABOVE the City/Municipality label (row 22)
c1.getCell("F22").value = "City/Municipality";
c1.getCell("K21").value = "Metro Manila"; // value above Province label
c1.getCell("K22").value = "Province";
c1.getCell("I23").value = "ZIP CODE";
c1.getCell("L23").value = "1200";
// email/mobile
c1.getCell("F30").value = "20. MOBILE NO.";
c1.getCell("K30").value = "09171234567";
c1.getCell("F31").value = "E-MAIL ADDRESS";
c1.getCell("K31").value = "juan.delacruz@example.com";
// education table header (row 50)
c1.getCell("B50").value = "LEVEL";
c1.getCell("D50").value = "NAME OF SCHOOL";
c1.getCell("G50").value = "BASIC EDUCATION/DEGREE/COURSE";
c1.getCell("J50").value = "PERIOD FROM";
c1.getCell("K50").value = "PERIOD TO";
c1.getCell("M50").value = "YEAR GRADUATED";
c1.getCell("N50").value = "SCHOLARSHIP/ACADEMIC HONORS";
const eduRows = [
  ["ELEMENTARY", "Makati Elementary School", "GRADUATED", 1996, 2002, 2002, ""],
  ["SECONDARY", "Makati Science High School", "GRADUATED", 2002, 2006, 2006, "With Honors"],
  ["COLLEGE", "UP Diliman", "BS Mechanical Engineering", 2006, 2010, 2010, "Cum Laude"],
  ["GRADUATE STUDIES", "DLSU", "MS Engineering Management", 2012, 2015, 2015, ""],
];
eduRows.forEach((r, i) => {
  const row = c1.getRow(51 + i);
  row.getCell(2).value = r[0] as string;
  row.getCell(4).value = r[1] as string;
  row.getCell(7).value = r[2] as string;
  row.getCell(10).value = r[3] as number;
  row.getCell(11).value = r[4] as number;
  row.getCell(13).value = r[5] as number;
  row.getCell(14).value = r[6] as string;
});

// ---------- C2: eligibility (3 rows) + work experience (35 rows = OVERFLOW in standard table) ----------
const c2 = wb.addWorksheet("C2");
c2.getCell("B1").value = "IV. CIVIL SERVICE ELIGIBILITY";
c2.getCell("B2").value = "CAREER SERVICE/RA 1080 (BOARD/BAR) UNDER SPECIAL LAWS";
c2.getCell("D2").value = "RATING";
c2.getCell("E2").value = "DATE OF EXAM";
c2.getCell("F2").value = "PLACE OF EXAM";
c2.getCell("G2").value = "LICENSE NUMBER";
c2.getCell("I2").value = "DATE OF VALIDITY";
const elig = [
  ["Civil Service Professional", 86.4, "2012-03-11", "Makati City", "1234567", ""],
  ["Registered Mechanical Engineer", 85.2, "2010-09-05", "Manila", "0098765", "2027-09-04"],
  ["Master Plumber", 80.1, "2015-07-20", "Quezon City", "5554443", ""],
];
elig.forEach((r, i) => {
  const row = c2.getRow(4 + i);
  row.getCell(2).value = r[0] as string;
  row.getCell(4).value = r[1] as number;
  row.getCell(5).value = r[2] as string;
  row.getCell(6).value = r[3] as string;
  row.getCell(7).value = r[4] as string;
  row.getCell(9).value = r[5] as string;
});
c2.getCell("B20").value = "V. WORK EXPERIENCE";
c2.getCell("A22").value = "INCLUSIVE DATES";
c2.getCell("D22").value = "POSITION TITLE";
c2.getCell("G22").value = "DEPARTMENT/AGENCY/OFFICE/COMPANY";
c2.getCell("J22").value = "MONTHLY SALARY";
c2.getCell("L22").value = "STATUS OF EMPLOYMENT";
c2.getCell("M22").value = "GOVT SERVICE (Y/N)";
// 35 work rows — the old parser capped at ~30 and dropped the rest
for (let i = 0; i < 35; i++) {
  const row = c2.getRow(25 + i);
  row.getCell(1).value = `2010-0${(i % 9) + 1}-01`;
  row.getCell(3).value = i === 34 ? "Present" : `2012-0${(i % 9) + 1}-01`;
  row.getCell(4).value = `Engineer ${i + 1}`;
  row.getCell(7).value = "DOST-MIRDC";
  row.getCell(10).value = 30000 + i * 100;
  row.getCell(12).value = "Permanent";
  row.getCell(13).value = "Y";
}

// ---------- C3: 30 trainings + 12 past the "continue" marker + 12 awards ----------
const c3 = wb.addWorksheet("C3");
c3.getCell("B1").value = "VI. VOLUNTARY WORK";
c3.getCell("B10").value = "VII. LEARNING AND DEVELOPMENT (L&D) INTERVENTIONS/TRAINING PROGRAMS";
c3.getCell("A12").value = "TITLE OF LEARNING AND DEVELOPMENT INTERVENTIONS/TRAINING PROGRAMS";
c3.getCell("E12").value = "FROM";
c3.getCell("F12").value = "TO";
c3.getCell("G12").value = "NUMBER OF HOURS";
c3.getCell("H12").value = "Type of LD";
// 30 trainings directly on C3
for (let i = 0; i < 30; i++) {
  const row = c3.getRow(15 + i);
  row.getCell(1).value = `Leadership Training Seminar ${i + 1}`;
  row.getCell(5).value = `2018-0${(i % 9) + 1}-01`;
  row.getCell(6).value = `2018-0${(i % 9) + 1}-15`;
  row.getCell(7).value = `${8 + i} HOURS`;
  row.getCell(8).value = "Technical";
}
// overflow marker mid-table — old parser BREAKED here; new one continues
c3.getCell("A60").value = "(Continue on separate sheet if necessary)";
for (let i = 0; i < 12; i++) {
  const row = c3.getRow(61 + i);
  row.getCell(1).value = `Advanced Technical Workshop ${i + 1}`;
  row.getCell(5).value = `2019-0${(i % 9) + 1}-01`;
  row.getCell(6).value = `2019-0${(i % 9) + 1}-20`;
  row.getCell(7).value = `${16 + i} HOURS`;
  row.getCell(8).value = "Managerial/Supervisory";
}
// awards section — pushed far down by the extended table (row 120)
c3.getCell("A120").value = "VIII. OTHER INFORMATION";
c3.getCell("B121").value = "31. NON-ACADEMIC DISTINCTIONS / RECOGNITION: (Write in full)";
for (let i = 0; i < 12; i++) {
  const row = c3.getRow(122 + i);
  row.getCell(3).value = `Outstanding Public Service Award ${i + 1} — Civil Service Commission`;
}
c3.getCell("B140").value = "34. MEMBERSHIP IN ASSOCIATION/ORGANIZATION";

// ---------- "C3 (2)": applicant-added continuation sheet with 80 MORE trainings ----------
const c3b = wb.addWorksheet("C3 (2)");
c3b.getCell("A1").value = "TITLE OF LEARNING AND DEVELOPMENT INTERVENTIONS/TRAINING PROGRAMS (Continuation)";
c3b.getCell("E1").value = "FROM";
c3b.getCell("F1").value = "TO";
c3b.getCell("G1").value = "NUMBER OF HOURS";
c3b.getCell("H1").value = "Type of LD";
for (let i = 0; i < 80; i++) {
  const row = c3b.getRow(2 + i);
  row.getCell(1).value = `Continuation Training Program ${i + 1}`;
  row.getCell(5).value = `2020-0${(i % 9) + 1}-01`;
  row.getCell(6).value = `2020-0${(i % 9) + 1}-10`;
  row.getCell(7).value = `${24 + i} HOURS`;
  row.getCell(8).value = "Technical";
}

// ---------- Lookup sheet (noise) ----------
const lookup = wb.addWorksheet("Lookup");
lookup.addRow(["Yes", "No"]);
lookup.addRow(["Afghanistan", "Albania", "Philippines"]);

const out = "/home/z/my-project/scripts/pds-overflow-test/overflow-pds.xlsx";
await wb.xlsx.writeFile(out);
console.log("Wrote", out);

// ---------- Run the parser ----------
const result = await parsePdsExcel(out);
if (!result) {
  console.error("FAILED: parser returned null (template not recognized)");
  process.exit(1);
}
console.log("\n=== OVERFLOW PARSING RESULTS ===");
console.log("Personal:  ", [
  result.personalInfo.lastName?.value,
  result.personalInfo.firstName?.value,
  result.personalInfo.emailAddress?.value,
].join(" / "));
console.log("Education: ", result.educations?.length, "(expect 4)");
console.log("Eligibility:", result.eligibilities?.length, "(expect 3)");
console.log("Work:      ", result.workExperiences?.length, "(expect 35)");
console.log("Trainings: ", result.trainings?.length, "(expect 30+12+80 = 122)");
console.log("Awards:    ", result.awards?.length, "(expect 12)");
console.log("Warnings:  ", result.warnings);
const okTrain = result.trainings?.length === 122;
const okWork = result.workExperiences?.length === 35;
const okAwards = result.awards?.length === 12;
console.log("\n" + (okTrain && okWork && okAwards ? "✅ ALL OVERFLOW ROWS RECOVERED" : "❌ MISMATCH — inspect above"));
process.exit(okTrain && okWork && okAwards ? 0 : 1);
