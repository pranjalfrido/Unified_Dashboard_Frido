// Web Worker: parses Excel/CSV off the main thread so UI never freezes
importScripts("https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js");

self.onmessage = function (e) {
  try {
    const { buffer, sheetNames } = e.data;
    const wb = XLSX.read(buffer, { type: "array", cellDates: true });
    // Find data sheet
    const dataName =
      wb.SheetNames.find((n) => n.trim().toLowerCase() === "billing_data") ??
      wb.SheetNames.find((n) => !/^instruction/i.test(n.trim())) ??
      wb.SheetNames[0];
    const ws = wb.Sheets[dataName];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
    self.postMessage({ ok: true, aoa, sheetName: dataName });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message ?? String(err) });
  }
};
