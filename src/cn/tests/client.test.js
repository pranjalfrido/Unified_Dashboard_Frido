// Browser-side pieces of the upload engine: header-row detection, cell conversion, the
// template (including Excel drop-downs), and a template → parse → stage round trip.
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { unzipSync, strFromU8 } from "fflate";
import { normHeader, rowsFromAoa, cellText, colLetter } from "../cnParse.js";
import { addListValidations } from "../xlsxDropdown.js";
import { buildTemplateBytes } from "../cnTemplate.js";
import { engineDb, as, USERS } from "./pgHarness.js";

const COLUMNS = [
  { key: "month", label: "Month", required: true },
  { key: "courier", label: "Courier", required: true },
  { key: "courier_account", label: "Courier Account", aliases: ["Account"] },
  { key: "received_cn", label: "Total Received CN (ex GST)", aliases: ["Received CN"], required: true },
];

describe("header row and cells", () => {
  it("normalises headers the way the database does", () => {
    expect(normHeader("  Courier Account (optional) ")).toBe("courier account");
    expect(normHeader("Total Received CN (ex GST)")).toBe("total received cn ex gst");
    expect(normHeader("CN No.")).toBe("cn no");
  });

  it("finds the header row below a title, skips blank rows and keeps sheet row numbers", () => {
    const aoa = [
      ["Weight dispute CNs — Q1"], [],
      ["Month", "Courier", "Account", "Received CN", "Notes"],
      ["Apr-2026", "Delhivery", "", 100, "x"],
      ["", "", "", "", ""],
      ["May-2026", "Swift", "Swift NDD", "1,000", ""],
    ];
    const out = rowsFromAoa(aoa, COLUMNS, 1);
    expect(out.headers).toEqual(["Month", "Courier", "Account", "Received CN", "Notes"]);
    expect(out.rows).toEqual([[4, "Apr-2026", "Delhivery", "", "100", "x"], [6, "May-2026", "Swift", "Swift NDD", "1,000", ""]]);
  });

  it("refuses a sheet without a recognisable header row", () => {
    expect(rowsFromAoa([["a", "b"], [1, 2]], COLUMNS).error).toMatch(/header row/);
  });

  it("sends Excel dates as local YYYY-MM-DD, even when stored a second before midnight", () => {
    expect(cellText(new Date(2026, 3, 1))).toBe("2026-04-01");
    expect(cellText(new Date(2026, 2, 31, 23, 59, 59))).toBe("2026-04-01");
    expect(cellText(new Date(2026, 3, 15, 0, 0, 0))).toBe("2026-04-15");
    expect(cellText(null)).toBe("");
    expect(cellText(" 12 ")).toBe("12");
  });

  it("names columns like Excel", () => {
    expect([0, 4, 25, 26, 27].map(colLetter)).toEqual(["A", "E", "Z", "AA", "AB"]);
  });
});

describe("drop-downs", () => {
  it("inserts data validation in the place Excel requires and keeps the file readable", () => {
    const ws = XLSX.utils.aoa_to_sheet([["Reason"], ["Lost/Damage"]]);
    ws["!margins"] = { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "data");
    const bytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
    const out = addListValidations(bytes, [{ ref: "A2:A50001", values: ["Lost/Damage", "SLA Breach", 'Say "hi"'] }]);
    const xml = strFromU8(unzipSync(out)["xl/worksheets/sheet1.xml"]);
    expect(xml).toContain('<dataValidation type="list" allowBlank="1"');
    expect(xml).toContain('sqref="A2:A50001"><formula1>"Lost/Damage,SLA Breach,Say &quot;&quot;hi&quot;&quot;"</formula1>');
    expect(xml.indexOf("<dataValidations")).toBeGreaterThan(xml.indexOf("</sheetData>"));
    expect(xml.indexOf("<dataValidations")).toBeLessThan(xml.indexOf("<pageMargins"));
    expect(XLSX.read(out, { type: "array" }).Sheets.data.A2.v).toBe("Lost/Damage");
  });

  it("refuses lists Excel can't hold", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["x"]]), "data");
    const bytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
    expect(() => addListValidations(bytes, [{ ref: "A2", values: ["a,b"] }])).toThrow();
  });
});

describe("template round trip", () => {
  it("builds a template whose headers and sample row pass the database checks", async () => {
    const db = await engineDb();
    const cfg = (await db.query(`SELECT * FROM cn_upload_types WHERE code = 'weight_dispute'`)).rows[0];
    const wb = XLSX.read(buildTemplateBytes(cfg), { type: "array", cellDates: true });
    expect(wb.SheetNames).toEqual(["data", "instructions"]);
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets.data, { header: 1, raw: true, defval: "", blankrows: true });
    expect(aoa[0]).toContain("Courier Account (optional)");
    const parsed = rowsFromAoa(aoa, cfg.columns, 1);
    const v = await as(db, USERS.uploader, async () => {
      const b = (await db.query(`SELECT cn_create_batch('weight_dispute', 't.xlsx', $1) AS r`, [parsed.headers])).rows[0].r;
      await db.query(`SELECT cn_stage_rows($1, $2::jsonb)`, [b.batch_id, JSON.stringify(parsed.rows)]);
      return (await db.query(`SELECT cn_validate_batch($1) AS r`, [b.batch_id])).rows[0].r;
    });
    expect(v).toMatchObject({ total_rows: 1, error_rows: 0, rows_to_save: 1 });
  }, 30000);

  it("adds a drop-down for enum columns", () => {
    const cfg = { label: "Test", partner_label: "Courier", template_file: "t.xlsx", columns: [
      { key: "awb", label: "AWB", required: true, example: "123" },
      { key: "reason", label: "Reason", type: "enum", required: true, enum: ["Lost/Damage", "SLA Breach"], example: "SLA Breach" },
    ] };
    const xml = strFromU8(unzipSync(buildTemplateBytes(cfg))["xl/worksheets/sheet1.xml"]);
    expect(xml).toContain('sqref="B2:B50001"><formula1>"Lost/Damage,SLA Breach"</formula1>');
  });
});
