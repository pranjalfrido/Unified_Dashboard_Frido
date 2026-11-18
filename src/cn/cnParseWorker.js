// Reads an uploaded .xlsx / .csv off the main thread, so a 50k-row file doesn't freeze the page.
import * as XLSX from "xlsx";
import { rowsFromAoa } from "./cnParse.js";

self.onmessage = (e) => {
  const { buffer, fileName, columns } = e.data;
  try {
    const isCsv = /\.csv$/i.test(fileName);
    // CSV cells stay text (raw), so "01/04/2026" is not read as January 4th the US way; the
    // database parses months itself. xlsx date cells come through as dates.
    const wb = XLSX.read(buffer, isCsv ? { type: "array", raw: true } : { type: "array", cellDates: true });
    const name = wb.SheetNames.find((n) => !/^instruction/i.test(n.trim())) ?? wb.SheetNames[0];
    const ws = wb.Sheets[name];
    if (!ws || !ws["!ref"]) { self.postMessage({ error: "The file has no data." }); return; }
    const firstRow = XLSX.utils.decode_range(ws["!ref"]).s.r + 1;
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "", blankrows: true });
    self.postMessage({ ...rowsFromAoa(aoa, columns, firstRow), sheet: name });
  } catch (err) {
    self.postMessage({ error: `Couldn't read the file: ${err.message ?? err}` });
  }
};
