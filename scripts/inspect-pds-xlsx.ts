// Dump every non-empty cell of a PDS xlsx so we can see the exact 2026 layout.
// Usage: bun scripts/inspect-pds-xlsx.ts "upload/1/f68cb119-b1e0-4ab4-82f7-74383b359e73.xlsx"
import ExcelJS from "exceljs";
import { promises as fs } from "fs";
import path from "path";

const rel = process.argv[2];
if (!rel) {
  console.error("Usage: bun scripts/inspect-pds-xlsx.ts <file.xlsx>");
  process.exit(1);
}
const abs = path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(await fs.readFile(abs));

for (const ws of wb.worksheets) {
  console.log(`\n===== SHEET "${ws.name}" (rowCount=${ws.rowCount}, actualRowCount=${ws.actualRowCount}) =====`);
  const maxRow = Math.min(Math.max(ws.rowCount || 0, ws.actualRowCount || 0), 200);
  for (let r = 1; r <= maxRow; r++) {
    const cells: string[] = [];
    for (let c = 1; c <= 18; c++) {
      const cell = ws.getRow(r).getCell(c);
      let v = "";
      try {
        const val = cell.value;
        if (val == null) v = "";
        else if (val instanceof Date) v = `[DATE ${val.toISOString().slice(0, 10)}]`;
        else if (typeof val === "object" && "richText" in val) v = (val as any).richText.map((t: any) => t.text || "").join("");
        else if (typeof val === "object" && "result" in val) v = String((val as any).result ?? "");
        else if (typeof val === "object" && "text" in val) v = String((val as any).text ?? "");
        else v = String(val);
      } catch {
        v = "?";
      }
      v = v.replace(/\s+/g, " ").trim();
      if (v) cells.push(`${cell.address}="${v}"`);
    }
    if (cells.length) console.log(`R${r}: ${cells.join(" | ")}`);
  }
}
