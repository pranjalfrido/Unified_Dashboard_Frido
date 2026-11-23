// The upload template for a CN upload type, as .xlsx bytes. Kept apart from cnEngine.js (which
// needs the Supabase client) so tests can build it.
import * as XLSXStyle from "xlsx-js-style";
import { colLetter } from "./cnParse.js";
import { addListValidations } from "./xlsxDropdown.js";

export const headerFor = (col) => (col.required ? col.label : `${col.label} (optional)`);

export function buildTemplateBytes(cfg) {
  const cols = cfg.columns;
  const ws = XLSXStyle.utils.aoa_to_sheet([cols.map(headerFor), cols.map((c) => c.example ?? "")]);
  ws["!cols"] = cols.map((c) => ({ wch: Math.max(16, headerFor(c).length + 4) }));
  cols.forEach((c, i) => {
    const cell = ws[XLSXStyle.utils.encode_cell({ r: 0, c: i })];
    if (cell) cell.s = { font: { bold: true, sz: 11 }, fill: { patternType: "solid", fgColor: { rgb: c.required ? "FFD600" : "FFF3B0" } } };
  });
  const notes = XLSXStyle.utils.aoa_to_sheet([
    ["Column", "Required", "What to enter"],
    ...cols.map((c) => [headerFor(c), c.required ? "Yes" : "Optional",
      [c.hint, c.enum ? `One of: ${c.enum.join(", ")}` : null].filter(Boolean).join(". ")]),
    [],
    ["How the upload works"],
    ["1. Keep the header row as it is. Replace the sample row with your data."],
    [`2. An upload REPLACES all existing ${cfg.label} rows for each Month + ${cfg.partner_label} it contains. Other months and ${cfg.partner_label.toLowerCase()}s are not touched.`],
    ["3. Amounts are INR ex-GST. ₹ signs and commas are fine. Month can be Apr-2026, 04/2026 or 2026-04."],
    [`4. Names must match Masters exactly (case and extra spaces don't matter).`],
  ]);
  notes["!cols"] = [{ wch: 32 }, { wch: 10 }, { wch: 100 }];
  const wb = XLSXStyle.utils.book_new();
  XLSXStyle.utils.book_append_sheet(wb, ws, "data");
  XLSXStyle.utils.book_append_sheet(wb, notes, "instructions");
  const bytes = new Uint8Array(XLSXStyle.write(wb, { type: "array", bookType: "xlsx" }));
  const lists = cols.map((c, i) => c.enum ? { ref: `${colLetter(i)}2:${colLetter(i)}50001`, values: c.enum } : null).filter(Boolean);
  return addListValidations(bytes, lists);
}
