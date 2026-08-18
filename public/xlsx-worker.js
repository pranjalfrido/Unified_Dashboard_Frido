// Web Worker: parse Excel and stream validated rows in chunks so upload can start immediately
importScripts("https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js");

function normMonth(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v)) {
    // Use local year/month to avoid UTC timezone shift on end-of-month dates
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    return y + "-" + m;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[-/.](\d{1,2})/);
  if (m) return m[1] + "-" + String(+m[2]).padStart(2, "0");
  const d2 = new Date(s);
  if (!isNaN(d2)) return d2.toISOString().slice(0, 7);
  return null;
}

function normDate(v) {
  if (v == null || v === "") return "";
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) return dmy[3] + "-" + String(+dmy[2]).padStart(2, "0") + "-" + String(+dmy[1]).padStart(2, "0");
  const d2 = new Date(s);
  return isNaN(d2) ? s : d2.toISOString().slice(0, 10);
}

function normHead(c) {
  return String(c ?? "").trim().toLowerCase()
    .replace(/\s*\*\s*$/, "")
    .replace(/\s*\((mandatory|optional|required|computed|auto)\)\s*$/i, "")
    .replace(/[\s_]+/g, " ").trim();
}

self.onmessage = function (e) {
  try {
    const { buffer, fields, sampleSigs, sigKeys, totalParts, totalField, chunkSize } = e.data;

    // 1. Parse workbook
    const wb = XLSX.read(buffer, { type: "array", cellDates: true });
    const dataName =
      wb.SheetNames.find((n) => n.trim().toLowerCase() === "billing_data") ??
      wb.SheetNames.find((n) => !/^instruction/i.test(n.trim())) ??
      wb.SheetNames[0];
    const ws = wb.Sheets[dataName];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });

    if (!aoa.length) { self.postMessage({ type: "error", error: "empty sheet" }); return; }

    // 2. Find header row
    const reqKeys = fields.filter((f) => f.req).map((f) => normHead(f.label));
    const hIdx = aoa.findIndex((r) => {
      const cells = r.map(normHead);
      return reqKeys.every((w) => cells.includes(w));
    });
    if (hIdx === -1) {
      self.postMessage({ type: "error", error: "header_not_found", reqLabels: fields.filter((f) => f.req).map((f) => f.label) });
      return;
    }

    // 3. Build index
    const head = aoa[hIdx].map(normHead);
    const idxOf = {};
    for (const f of fields) idxOf[f.key] = head.indexOf(normHead(f.label));

    const body = aoa.slice(hIdx + 1);
    const totalRows = body.length;
    const sumParts = (r) => totalParts.reduce((s, k) => s + (Number(r[k]) || 0), 0);
    const isSample = (r) => sampleSigs.some((sig) =>
      sigKeys.every((k) => String(sig[k] ?? "").trim() !== "" &&
        String(r[k] ?? "").trim().toLowerCase() === String(sig[k]).trim().toLowerCase())
    );

    // 4. Stream chunks — post each chunk as soon as it's ready so upload starts immediately
    const CHUNK = chunkSize || 500;
    let parsedSoFar = 0;
    let badRows = [];
    let chunk = [];

    for (let i = 0; i < body.length; i++) {
      const r = body[i];
      const o = {};
      for (const f of fields) {
        const ci = idxOf[f.key];
        let v = ci === -1 ? "" : r[ci];
        if (f.type === "month") v = normMonth(v) ?? "";
        else if (f.type === "date") v = normDate(v);
        else v = v == null ? "" : String(v).trim();
        o[f.key] = v;
      }

      // skip empty & sample rows
      const isEmpty = !fields.some((f) => o[f.key] !== "");
      if (isEmpty || isSample(o)) continue;

      // validate
      const missing = fields.filter((f) => f.req && !f.computed && o[f.key] === "").map((f) => f.label);
      for (const f of fields) {
        if (f.req && f.computed && o[f.key] === "" && sumParts(o) === 0) missing.push(f.label);
      }
      if (missing.length) { badRows.push({ line: hIdx + 2 + i, missing }); continue; }

      chunk.push(o);
      parsedSoFar++;

      // Send chunk as soon as it's full
      if (chunk.length >= CHUNK) {
        self.postMessage({ type: "chunk", rows: chunk, parsed: parsedSoFar, total: totalRows });
        chunk = [];
      }
    }

    // Send remaining rows
    if (chunk.length > 0) {
      self.postMessage({ type: "chunk", rows: chunk, parsed: parsedSoFar, total: totalRows });
    }

    self.postMessage({ type: "done", bad: badRows, total: parsedSoFar });
  } catch (err) {
    self.postMessage({ type: "error", error: err.message ?? String(err) });
  }
};
