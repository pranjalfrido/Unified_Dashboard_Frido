// Web Worker: full Excel parse + row mapping, so main thread never blocks
importScripts("https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js");

function normMonth(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 7);
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
    const { buffer, fields, sampleSigs, sigKeys, totalParts, totalField } = e.data;

    // 1. Parse workbook
    const wb = XLSX.read(buffer, { type: "array", cellDates: true });
    const dataName =
      wb.SheetNames.find((n) => n.trim().toLowerCase() === "billing_data") ??
      wb.SheetNames.find((n) => !/^instruction/i.test(n.trim())) ??
      wb.SheetNames[0];
    const ws = wb.Sheets[dataName];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });

    if (!aoa.length) { self.postMessage({ ok: false, error: "empty sheet" }); return; }

    // 2. Find header row
    const reqKeys = fields.filter((f) => f.req).map((f) => normHead(f.label));
    const hIdx = aoa.findIndex((r) => {
      const cells = r.map(normHead);
      return reqKeys.every((w) => cells.includes(w));
    });
    if (hIdx === -1) {
      self.postMessage({ ok: false, error: "header_not_found", reqLabels: fields.filter((f) => f.req).map((f) => f.label) });
      return;
    }

    // 3. Map rows
    const head = aoa[hIdx].map(normHead);
    const idxOf = {};
    for (const f of fields) idxOf[f.key] = head.indexOf(normHead(f.label));

    const body = aoa.slice(hIdx + 1);
    const raw = [];
    for (const r of body) {
      const o = {};
      for (const f of fields) {
        const i = idxOf[f.key];
        let v = i === -1 ? "" : r[i];
        if (f.type === "month") v = normMonth(v) ?? "";
        else if (f.type === "date") v = normDate(v);
        else v = v == null ? "" : String(v).trim();
        o[f.key] = v;
      }
      raw.push(o);
    }

    // 4. Filter empty & sample rows
    const nonEmpty = raw.filter((r) => fields.some((f) => r[f.key] !== ""));
    const isSample = (r) => sampleSigs.some((sig) =>
      sigKeys.every((k) => String(sig[k] ?? "").trim() !== "" &&
        String(r[k] ?? "").trim().toLowerCase() === String(sig[k]).trim().toLowerCase())
    );
    const nonSample = nonEmpty.filter((r) => !isSample(r));
    const candidates = nonSample.length > 0 ? nonSample : nonEmpty;

    // 5. Validate required fields
    const sumParts = (r) => totalParts.reduce((s, k) => s + (Number(r[k]) || 0), 0);
    const good = [], bad = [];
    candidates.forEach((r, i) => {
      const missing = fields.filter((f) => f.req && !f.computed && r[f.key] === "").map((f) => f.label);
      for (const f of fields) {
        if (f.req && f.computed && r[f.key] === "" && sumParts(r) === 0) missing.push(f.label);
      }
      if (missing.length) bad.push({ line: hIdx + 2 + i, missing });
      else good.push(r);
    });

    self.postMessage({ ok: true, good, bad, hIdx });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message ?? String(err) });
  }
};
