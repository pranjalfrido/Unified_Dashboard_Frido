// Turning a spreadsheet into the rows the upload engine stages. Pure functions, shared by the
// parse worker and the tests. The browser only finds the header row and passes cell values
// on as text; every check happens in the database (cn_stage_rows / cn_validate_batch).

// Same rule as cn_norm_header() in SQL: case, punctuation and spacing ignored, a trailing
// "optional" / "required" / "mandatory" dropped. Used here only to find the header row.
export const normHeader = (h) =>
  String(h ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+(optional|required|mandatory)$/, "");

// Every header spelling a type accepts.
export const knownHeaders = (columns) =>
  new Set(columns.flatMap((c) => [c.label, ...(c.aliases ?? [])]).map(normHeader));

const pad = (n) => String(n).padStart(2, "0");

// A cell as the text the engine parses. Excel date cells arrive as Date objects: they are
// sent as YYYY-MM-DD from LOCAL date parts, nudged by 12 h so a value stored as 23:59:59 on
// the last day of a month (a known SheetJS/timezone artefact) doesn't land a month early.
export function cellText(v) {
  if (v == null) return "";
  if (v instanceof Date) {
    if (isNaN(v)) return "";
    const d = new Date(v.getTime() + 12 * 3600 * 1000);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return String(v).trim();
}

// aoa: sheet_to_json(..., { header: 1, blankrows: true }) output; firstRow: the sheet row
// number of aoa[0]. Returns { headers, rows: [[sheetRow, cell, cell, …]] } or { error }, cells
// aligned with headers — the compact shape cn_stage_rows takes.
export function rowsFromAoa(aoa, columns, firstRow = 1) {
  const known = knownHeaders(columns);
  // Header row: the row among the first 20 that matches the most known headers (at least 2),
  // so a title or blank rows above the header are fine.
  let best = -1, bestHits = 1;
  for (let i = 0; i < Math.min(aoa.length, 20); i++) {
    const hits = (aoa[i] ?? []).filter((c) => known.has(normHeader(c))).length;
    if (hits > bestHits) { best = i; bestHits = hits; }
  }
  if (best === -1) return { error: "Couldn't find the header row. Use the template's headers." };

  const headers = (aoa[best] ?? []).map((h) => cellText(h));
  const rows = [];
  for (let i = best + 1; i < aoa.length; i++) {
    const cells = aoa[i] ?? [];
    const vals = headers.map((_, c) => cellText(cells[c]));
    // Skip rows with nothing under any named header.
    if (vals.some((t, c) => headers[c] && t !== "")) rows.push([firstRow + i, ...vals]);
  }
  return { headers, rows };
}

// Excel-style column letters: 0 -> A, 26 -> AA.
export const colLetter = (i) => (i < 26 ? String.fromCharCode(65 + i) : colLetter(Math.floor(i / 26) - 1) + colLetter(i % 26));
