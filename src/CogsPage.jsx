import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { Plus, Trash2, Download, Search, FileSpreadsheet, Upload, Save, RefreshCw } from "lucide-react";
import { supabase } from "./supabase.js";
import { C as BASE_C } from "./utils.js";

// ── COGS Tracker — row-wise layout ───────────────────────────────────────────
// DB: cogs_ledger (itemskucode, month, cogs, is_explicit)
// UI: each row = 1 SKU × 1 month, sorted by month then SKU. Just a plain
// uploader — SKU must exist in item master (validated against it below), and
// api/cogs-context.js is used only for a pre-save sanity check (COGS vs the
// SKU's last-60-day ASP). Product name/category/subcategory/analysis belong
// in a separate costing-analysis view, not here.

const FIELDS = [
  { key: "month",       label: "Month",   w: 110, req: true, type: "month", ex: "2026-06" },
  { key: "itemskucode", label: "SKU Code", w: 150, req: true, type: "text",  ex: "SKU001" },
  { key: "cogs",        label: "COGS",    w: 110, req: true, type: "num",   ex: "42.50" },
];

const todayMonth = () => new Date().toISOString().slice(0, 7);
const uid = () => Math.random().toString(36).slice(2, 10);
const blankRow = () => ({ _uid: uid(), _dirty: true, month: todayMonth(), itemskucode: "", cogs: "" });

const normMonth = (v) => {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 7);
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${String(+m[2]).padStart(2, "0")}`;
  const d2 = new Date(s);
  if (!isNaN(d2)) return d2.toISOString().slice(0, 7);
  return null;
};

const toDbRecord = (r) => ({
  itemskucode: r.itemskucode.trim(),
  month: r.month,
  cogs: r.cogs !== "" && r.cogs != null ? Number(r.cogs) : null,
  is_explicit: true,
});

const fromDbRecord = (d) => ({
  _uid: uid(),
  _dirty: false,
  month: d.month ?? "",
  itemskucode: d.itemskucode ?? "",
  cogs: d.cogs != null ? String(d.cogs) : "",
});

const API = import.meta.env.VITE_API_URL || "";

export default function CogsPage() {
  const [rows, setRows] = useState([blankRow()]);
  const [query, setQuery] = useState("");
  const [monthFilter, setMonthFilter] = useState("all");
  const [allMonths, setAllMonths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [validSkus, setValidSkus] = useState(null); // Set of valid item_master Product_Code (uppercased), null until loaded
  const [skuContext, setSkuContext] = useState({}); // { SKU: { asp_inc_gst_60d, ... } } — cache for the pre-save margin sanity check only
  const fileInput = useRef(null);

  // ── Item master (SKU validity gate) ─────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        // product_code, lowercase. The column was quoted as "Product_Code", which does not
        // exist — PostgREST returned an error, `data` fell back to [], and validSkus became
        // an EMPTY Set, so every SKU in an upload was reported "not found in item master".
        const { data, error } = await supabase.from("item_master").select("product_code");
        if (error) throw error;
        const set = new Set((data ?? [])
          .map((d) => String(d.product_code || "").trim().toUpperCase())
          .filter(Boolean));
        // An empty result is a failure, not an item master with no products. Treating it as
        // data is what turned one bad column name into "all 1,813 rows are invalid".
        setValidSkus(set.size ? set : null);
      } catch (e) {
        console.error("Failed to load item master for SKU validation:", e);
        // null, NOT an empty Set: every gate below is written `validSkus && ...`, so null
        // skips validation and lets the upload through. Failing closed here means a
        // transient fetch error silently rejects a perfectly good file and blames the file.
        setValidSkus(null);
      }
    })();
  }, []);

  const flash = (kind, text) => {
    setStatus({ kind, text });
    if (kind !== "error") setTimeout(() => setStatus(null), 4000);
  };

  const loadFromDb = useCallback(async () => {
    setLoading(true);
    setStatus(null);
    try {
      const { data, error } = await supabase
        .from("cogs_ledger")
        .select("*")
        .order("month", { ascending: true })
        .order("itemskucode", { ascending: true });
      if (error) throw error;
      const loaded = (data ?? []).map(fromDbRecord);
      setRows(loaded.length ? loaded : [blankRow()]);
      const months = [...new Set((data ?? []).map((d) => d.month).filter(Boolean))].sort();
      setAllMonths(months);
    } catch (e) {
      flash("error", `Load failed: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFromDb(); }, [loadFromDb]);

  const saveToDb = async () => {
    const valid = rows.filter((r) => r._dirty && r.itemskucode.trim() && r.month);
    if (!valid.length) { flash("ok", "Nothing new to save."); return; }

    if (validSkus) {
      const invalid = [...new Set(valid.filter((r) => !validSkus.has(r.itemskucode.trim().toUpperCase())).map((r) => r.itemskucode.trim()))];
      if (invalid.length) {
        flash("error", `Cannot save — SKU(s) not found in item master: ${invalid.slice(0, 10).join(", ")}${invalid.length > 10 ? ` (+${invalid.length - 10} more)` : ""}`);
        return;
      }
    }

    const warned = await findMarginWarnings(valid);
    if (warned.length) {
      const preview = warned.slice(0, 8).map((r) => `• ${r.itemskucode} / ${r.month}: COGS ${r.cogs}`).join("\n");
      if (!confirm(`${warned.length} row(s) have COGS at or above the SKU's last-60-day selling price (inc GST) — likely a data-entry mistake:\n\n${preview}\n\nSave anyway?`)) return;
    }

    setSaving(true);
    try {
      const records = valid.map(toDbRecord);
      const { error } = await supabase.from("cogs_ledger").upsert(records, { onConflict: "itemskucode,month" });
      if (error) throw error;
      setRows((rs) => rs.map((r) => ({ ...r, _dirty: false })));
      const months = [...new Set(valid.map((r) => r.month))].sort();
      setAllMonths((prev) => [...new Set([...prev, ...months])].sort());
      flash("ok", `Saved ${valid.length} records to database.`);
    } catch (e) {
      flash("error", `Save failed: ${e.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (id) => {
    const row = rows.find((r) => r._uid === id);
    if (!row) return;
    if (row.itemskucode.trim() && row.month) {
      if (!confirm(`Delete ${row.itemskucode} / ${row.month}?`)) return;
      await supabase.from("cogs_ledger").delete().eq("itemskucode", row.itemskucode.trim()).eq("month", row.month);
    }
    setRows((rs) => rs.filter((r) => r._uid !== id));
  };

  const setCell = (id, key, val) =>
    setRows((rs) => rs.map((r) => r._uid === id ? { ...r, [key]: val, _dirty: true } : r));

  const addRow = () => setRows((rs) => [blankRow(), ...rs]);

  // Sanity check before saving: flags any row whose COGS is >= its last-60-day
  // ASP (inc GST) — i.e. zero/negative margin, almost always a data-entry mistake.
  // Warns and lets the user confirm rather than hard-blocking, since a genuinely
  // loss-leading SKU is possible.
  const findMarginWarnings = async (candidateRows) => {
    const skus = [...new Set(candidateRows.map((r) => r.itemskucode.trim().toUpperCase()).filter(Boolean))];
    if (!skus.length) return [];
    const need = skus.filter((s) => !(s in skuContext));
    let ctxNow = skuContext;
    if (need.length) {
      try {
        const res = await fetch(`${API}/api/cogs-context`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skus: need }),
        });
        const json = await res.json();
        if (res.ok) { ctxNow = { ...skuContext, ...json.skus }; setSkuContext(ctxNow); }
      } catch { /* sanity check is best-effort — don't block saving on it failing */ }
    }
    return candidateRows.filter((r) => {
      const ctx = ctxNow[r.itemskucode.trim().toUpperCase()];
      const asp = ctx?.asp_inc_gst_60d;
      const cogs = r.cogs !== "" && r.cogs != null ? Number(r.cogs) : null;
      return asp != null && asp > 0 && cogs != null && cogs >= asp;
    });
  };

  const filtered = useMemo(() => {
    let r = rows;
    if (monthFilter !== "all") r = r.filter((row) => row.month === monthFilter);
    const q = query.trim().toLowerCase();
    if (q) r = r.filter((row) => FIELDS.some((f) => String(row[f.key] ?? "").toLowerCase().includes(q)));
    return r;
  }, [rows, monthFilter, query]);

  const unsaved = rows.filter((r) => r._dirty && r.itemskucode.trim() && r.month).length;

  // ── Template download ──────────────────────────────────────────────────────
  const downloadTemplate = () => {
    const headerRow = FIELDS.map((f) => f.req ? `${f.label} *` : f.label);
    const ex1 = FIELDS.map((f) => f.ex ?? "");
    const ex2 = FIELDS.map((f) => {
      if (f.key === "month") return "2026-07";
      if (f.key === "cogs") return "38.00";
      if (f.key === "itemskucode") return "SKU002";
      return f.ex ?? "";
    });
    const ws = XLSX.utils.aoa_to_sheet([headerRow, ex1, ex2]);
    ws["!cols"] = FIELDS.map((f) => ({ wch: Math.max(14, f.label.length + 6) }));
    FIELDS.forEach((f, c) => {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[addr]) ws[addr].s = {
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
        fill: { patternType: "solid", fgColor: { rgb: f.req ? "9E2B25" : "1F5C4A" } },
        alignment: { horizontal: "left" },
      };
    });
    const instrData = [
      ["Column", "Required?", "Description"],
      ["Month", "YES", "Billing month in YYYY-MM format e.g. 2026-06"],
      ["SKU Code", "YES", "Your internal SKU / item code — must exist in item master"],
      ["COGS", "YES", "Cost of goods sold for this SKU in this month"],
      [""],
      ["Notes"],
      ["1. One row = one SKU for one month."],
      ["2. To upload multiple months, add rows one below the other — June rows first, then July rows etc."],
      ["3. Uploading the same SKU + month will UPDATE that record (upsert)."],
      ["4. Product name, category and sub-category are looked up automatically from item master — do not include them here."],
      ["5. Delete the two sample rows before adding your data."],
    ];
    const notes = XLSX.utils.aoa_to_sheet(instrData);
    notes["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 80 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "COGS Data");
    XLSX.utils.book_append_sheet(wb, notes, "Instructions");
    XLSX.writeFile(wb, "cogs_template.xlsx");
  };

  // ── Import ─────────────────────────────────────────────────────────────────
  const importTemplate = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadProgress({ parsing: true });
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await new Promise((r) => setTimeout(r, 50));
        const wb = XLSX.read(reader.result, { type: "array", cellDates: true });
        const wsName = wb.SheetNames.find((n) => /cogs|data/i.test(n)) ?? wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
        if (!aoa.length) throw new Error("Empty sheet");

        const normHead = (c) => String(c ?? "").trim().toLowerCase().replace(/\s*\*\s*$/, "").replace(/[\s_]+/g, " ").trim();

        // Accepted spellings per column. The template writes the first of each, but files
        // come from Tally exports, the CSV/Excel this page itself downloads (which uses the
        // DB column names), and hand-made sheets — all of which spell the SKU column
        // differently. Matching only "sku code" rejected a file whose data was perfectly
        // good, with an error that read as though the file were malformed.
        const ALIASES = {
          month: ["month", "month year", "period", "billing month", "mon"],
          itemskucode: ["sku code", "sku", "itemskucode", "item sku code", "item sku",
                        "sku id", "skucode", "item code", "product code"],
          cogs: ["cogs", "cost", "unit cost", "cogs value", "cost of goods sold", "cogs per unit"],
        };
        const matchCol = (cells, key) => {
          for (const a of ALIASES[key]) {
            const i = cells.indexOf(a);
            if (i !== -1) return i;
          }
          return -1;
        };

        // A row is the header when the two REQUIRED identifying columns are both present.
        // cogs is not part of the test: a sheet can legitimately label that column something
        // this list does not know, and failing on it would reject the whole file rather than
        // flagging one column.
        const hIdx = aoa.findIndex((row) => {
          const cells = row.map(normHead);
          return matchCol(cells, "month") !== -1 && matchCol(cells, "itemskucode") !== -1;
        });
        if (hIdx === -1) {
          // Name what was actually in the first row. "Use the template" is no help when the
          // file came from somewhere else and the reader cannot see which column was wrong.
          const first = (aoa[0] || []).map(normHead).filter(Boolean).slice(0, 8).join(", ");
          throw new Error(
            "Couldn't find a header row with a month column and a SKU column.\n\n" +
            (first ? `First row reads: ${first}\n\n` : "") +
            "Accepted month headers: " + ALIASES.month.join(", ") + "\n" +
            "Accepted SKU headers: " + ALIASES.itemskucode.join(", ")
          );
        }

        const head = aoa[hIdx].map(normHead);
        const ci = {};
        for (const f of FIELDS) {
          // Alias match first, then the exact label, so a column this list does not know but
          // which matches FIELDS verbatim still resolves.
          ci[f.key] = matchCol(head, f.key);
          if (ci[f.key] === -1) ci[f.key] = head.indexOf(normHead(f.label));
        }

        const body = aoa.slice(hIdx + 1);
        const good = [], bad = [];
        body.forEach((row, i) => {
          const r = {};
          for (const f of FIELDS) {
            const idx = ci[f.key];
            let v = idx === -1 ? "" : row[idx];
            if (f.type === "month") v = normMonth(v) ?? "";
            else v = v == null ? "" : String(v).trim();
            r[f.key] = v;
          }
          const isEmpty = !r.itemskucode && !r.cogs;
          const isSample = r.itemskucode === "SKU001" || r.itemskucode === "SKU002";
          if (isEmpty || isSample) return;

          const missing = FIELDS.filter((f) => f.req && !r[f.key]).map((f) => f.label);
          if (missing.length) { bad.push({ line: hIdx + 2 + i, missing }); return; }

          // Hard SKU-validity gate: a SKU not in item master can't be uploaded at all,
          // not even skipped-with-warning like a soft-missing-field row — surfaced separately below.
          if (validSkus && !validSkus.has(r.itemskucode.trim().toUpperCase())) {
            bad.push({ line: hIdx + 2 + i, missing: [`SKU "${r.itemskucode}" not found in item master`] });
            return;
          }

          good.push({ ...r, _uid: uid(), _dirty: false });
        });

        if (bad.length) {
          const preview = bad.slice(0, 8).map((b) => `• row ${b.line}: ${b.missing.join(", ")}`).join("\n");
          if (!confirm(`${bad.length} row(s) will be skipped (missing required fields or invalid SKU):\n\n${preview}\n\nImport ${good.length} valid rows?`)) return;
        }
        if (!good.length) { alert("No valid rows found."); return; }

        const warned = await findMarginWarnings(good);
        if (warned.length) {
          const preview = warned.slice(0, 8).map((r) => `• ${r.itemskucode} / ${r.month}: COGS ${r.cogs}`).join("\n");
          if (!confirm(`${warned.length} row(s) have COGS at or above the SKU's last-60-day selling price (inc GST) — likely a data-entry mistake:\n\n${preview}\n\nContinue with upload anyway?`)) return;
        }

        setUploadProgress({ done: 0, total: good.length });
        await new Promise((r) => setTimeout(r, 30));

        const PAGE = 500;
        let done = 0;
        for (let i = 0; i < good.length; i += PAGE) {
          const chunk = good.slice(i, i + PAGE).map(toDbRecord);
          const { error } = await supabase.from("cogs_ledger").upsert(chunk, { onConflict: "itemskucode,month" });
          if (error) throw error;
          done += chunk.length;
          setUploadProgress({ done, total: good.length });
        }

        await loadFromDb();
        setUploadProgress({ done: good.length, total: good.length, finished: true });
        flash("ok", `Uploaded ${good.length} records.`);
        setTimeout(() => setUploadProgress(null), 4000);
      } catch (err) {
        setUploadProgress(null);
        alert(`Upload failed: ${err.message ?? err}`);
      } finally {
        if (fileInput.current) fileInput.current.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // ── Export helpers ─────────────────────────────────────────────────────────
  const [exportProgress, setExportProgress] = useState(null);

  const fetchAllFromDb = async () => {
    const all = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("cogs_ledger")
        .select("*")
        .order("month", { ascending: true })
        .order("itemskucode", { ascending: true })
        .range(from, from + 999);
      if (error) throw error;
      all.push(...data);
      setExportProgress({ done: all.length });
      if (data.length < 1000) break;
      from += 1000;
    }
    return all;
  };

  const exportCSV = async () => {
    setExportProgress({ done: 0 });
    try {
      const all = await fetchAllFromDb();
      if (!all.length) { alert("Nothing to export."); return; }
      const header = FIELDS.map((f) => f.label);
      const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const lines = [header.map(esc).join(",")];
      for (const r of all) lines.push(FIELDS.map((f) => esc(r[f.key === "cogs" ? "cogs" : f.key] ?? "")).join(","));
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `cogs_${todayMonth()}.csv` });
      a.click(); URL.revokeObjectURL(a.href);
      setExportProgress({ done: all.length, total: all.length, finished: true });
      setTimeout(() => setExportProgress(null), 3000);
    } catch (e) { flash("error", `Export failed: ${e.message ?? e}`); setExportProgress(null); }
  };

  const exportXLSX = async () => {
    setExportProgress({ done: 0 });
    try {
      const all = await fetchAllFromDb();
      if (!all.length) { alert("Nothing to export."); return; }
      const head = FIELDS.map((f) => f.label);
      const body = all.map((r) => FIELDS.map((f) => f.type === "num" ? (r[f.key] != null ? Number(r[f.key]) : "") : r[f.key] ?? ""));
      const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
      ws["!cols"] = FIELDS.map((f) => ({ wch: Math.max(12, Math.round(f.w / 7)) }));
      for (let c = 0; c < head.length; c++) {
        const a = XLSX.utils.encode_cell({ r: 0, c });
        if (ws[a]) ws[a].s = { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 }, fill: { fgColor: { rgb: "1F5C4A" } } };
      }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "COGS");
      XLSX.writeFile(wb, `cogs_${todayMonth()}.xlsx`);
      setExportProgress({ done: all.length, total: all.length, finished: true });
      setTimeout(() => setExportProgress(null), 3000);
    } catch (e) { flash("error", `Export failed: ${e.message ?? e}`); setExportProgress(null); }
  };

  // ── Styles ─────────────────────────────────────────────────────────────────
  // Theme tokens, not a private palette: this page used to keep a fixed grey/green
  // look whatever theme was active. red stays semantic.
  const C = { bg: BASE_C.bg, card: BASE_C.card, border: BASE_C.border, t1: BASE_C.t1, t2: BASE_C.t2, t3: BASE_C.t3, accent: BASE_C.acc, red: BASE_C.red.tx };
  const btnBase = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${C.border}` };
  const ghostBtn = { ...btnBase, background: C.card, color: C.t2 };
  const primaryBtn = { ...btnBase, background: C.accent, color: '#fff', border: 'none' };
  const chipBtn = { ...btnBase, background: '#EAF1EC', color: C.accent, borderRadius: 20 };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 10, color: C.t3 }}>
      <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
      <span style={{ fontSize: 13 }}>Loading COGS data…</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );

  return (
    <div style={{ padding: '24px 32px 48px', minHeight: '100vh', background: C.bg, color: C.t1, fontFamily: 'inherit' }}>
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>SKU-wise · month-wise</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.t1, letterSpacing: -0.5 }}>COGS Tracker</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 10px' }}>
            <Search size={13} style={{ color: C.t3 }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter SKUs…"
              style={{ border: 'none', background: 'transparent', fontSize: 12, color: C.t1, width: 130, outline: 'none' }} />
          </div>
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}
            style={{ ...ghostBtn, padding: '6px 10px' }}>
            <option value="all">All months</option>
            {allMonths.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button style={ghostBtn} onClick={downloadTemplate}><FileSpreadsheet size={13} /> Template</button>
          <button style={ghostBtn} onClick={() => fileInput.current?.click()}><Upload size={13} /> Upload</button>
          <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" onChange={importTemplate} style={{ display: 'none' }} />
          <button style={ghostBtn} onClick={exportCSV}><Download size={13} /> CSV</button>
          <button style={ghostBtn} onClick={exportXLSX}><Download size={13} /> Excel</button>
          <button style={ghostBtn} onClick={loadFromDb}><RefreshCw size={13} /> Reload</button>
          <button style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }} onClick={saveToDb} disabled={saving}>
            <Save size={13} /> {saving ? "Saving…" : unsaved ? `Save (${unsaved})` : "Save"}
          </button>
        </div>
      </div>

      {/* Upload progress bar */}
      {uploadProgress && (
        <div style={{ margin: '0 0 12px 0', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1E40AF' }}>
              {uploadProgress.finished ? `✓ Upload complete — ${uploadProgress.total.toLocaleString()} records saved`
                : uploadProgress.parsing ? `⏳ Parsing file… please wait`
                : `⬆ Uploading… ${uploadProgress.done.toLocaleString()} / ${uploadProgress.total.toLocaleString()} records`}
            </span>
            <span style={{ fontSize: 13, color: '#1E40AF', fontWeight: 800 }}>
              {uploadProgress.finished ? '100%' : uploadProgress.parsing || !uploadProgress.total ? '' : `${Math.round((uploadProgress.done / uploadProgress.total) * 100)}%`}
            </span>
          </div>
          <div style={{ height: 8, background: '#DBEAFE', borderRadius: 99, overflow: 'hidden' }}>
            {uploadProgress.parsing
              ? <div style={{ height: '100%', width: '30%', background: 'linear-gradient(90deg,#2563EB 0%,#60A5FA 50%,#2563EB 100%)', backgroundSize: '200% 100%', borderRadius: 99, animation: 'shimmer 1.2s infinite linear' }} />
              : <div style={{ height: '100%', background: '#2563EB', borderRadius: 99, width: uploadProgress.total ? `${(uploadProgress.done / uploadProgress.total) * 100}%` : '0%', transition: 'width 0.3s ease' }} />
            }
          </div>
          {!uploadProgress.parsing && !uploadProgress.finished && uploadProgress.total > 0 && (
            <div style={{ fontSize: 11, color: '#3B82F6', marginTop: 4 }}>{(uploadProgress.total - uploadProgress.done).toLocaleString()} records remaining…</div>
          )}
        </div>
      )}

      {/* Export progress bar */}
      {exportProgress && (
        <div style={{ margin: '0 0 12px 0', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>
              {exportProgress.finished
                ? `✓ Downloaded — ${exportProgress.total.toLocaleString()} rows`
                : `⬇ Fetching rows… ${exportProgress.done.toLocaleString()} fetched`}
            </span>
          </div>
          <div style={{ height: 6, background: '#D1FAE5', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#16A34A', borderRadius: 99, width: exportProgress.finished ? '100%' : `${Math.min(90, 10 + exportProgress.done / 50)}%`, transition: 'width 0.4s ease' }} />
          </div>
        </div>
      )}

      {/* Status */}
      {status && (
        <div style={{ fontSize: 12.5, padding: '8px 12px', borderRadius: 8, marginBottom: 10, border: `1px solid ${status.kind === 'error' ? '#FCA5A5' : '#BBF7D0'}`, background: status.kind === 'error' ? '#FEF2F2' : '#F0FDF4', color: status.kind === 'error' ? C.red : C.accent }}>
          {status.text}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button style={chipBtn} onClick={addRow}><Plus size={13} /> Add row</button>
        <span style={{ fontSize: 11, color: C.t3, fontFamily: 'monospace', marginLeft: 4 }}>
          {filtered.length} record{filtered.length !== 1 ? 's' : ''}{monthFilter !== 'all' ? ` · ${monthFilter}` : ''}{query ? ' (filtered)' : ''}
        </span>
        {unsaved > 0 && <span style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>● {unsaved} unsaved — click Save</span>}
      </div>

      {/* Table */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'auto', background: C.card, maxHeight: '65vh' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 12.5 }}>
          <thead>
            <tr>
              {FIELDS.map((f, i) => (
                <th key={f.key} style={{
                  position: 'sticky', top: 0, zIndex: i === 0 ? 3 : 2,
                  left: i === 0 ? 0 : undefined,
                  background: C.ach, textAlign: f.type === 'num' ? 'right' : 'left',
                  padding: '10px 12px', fontSize: 11, fontWeight: 700, color: C.t2,
                  textTransform: 'uppercase', letterSpacing: 0.4,
                  borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap', minWidth: f.w,
                }}>
                  {f.label}{f.req && <span style={{ color: C.red }}> *</span>}
                </th>
              ))}
              <th style={{ position: 'sticky', top: 0, zIndex: 2, background: C.ach, width: 40, borderBottom: `1px solid ${C.border}` }} />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={FIELDS.length + 1} style={{ padding: '32px 16px', textAlign: 'center', color: C.t3, fontSize: 13 }}>
                No records found. Download the template, fill it in, and upload — or add a row manually.
              </td></tr>
            )}
            {filtered.map((r) => {
              const skuClean = r.itemskucode.trim().toUpperCase();
              const skuInvalid = validSkus && skuClean && !validSkus.has(skuClean);
              return (
              <tr key={r._uid}
                onMouseEnter={(e) => e.currentTarget.querySelectorAll('td').forEach((td) => td.style.background = C.hov)}
                onMouseLeave={(e) => e.currentTarget.querySelectorAll('td').forEach((td) => td.style.background = C.card)}>
                {FIELDS.map((f, i) => (
                  <td key={f.key} style={{
                    padding: 0, background: C.card, borderBottom: '1px solid #F0ECE3',
                    position: i === 0 ? 'sticky' : undefined, left: i === 0 ? 0 : undefined, zIndex: i === 0 ? 1 : undefined,
                  }}>
                    <input
                      value={r[f.key] ?? ""}
                      onChange={(e) => setCell(r._uid, f.key, e.target.value)}
                      placeholder={f.ex}
                      title={f.key === "itemskucode" && skuInvalid ? "SKU not found in item master" : undefined}
                      style={{
                        width: '100%', border: 'none',
                        background: f.key === "itemskucode" && skuInvalid ? '#FEF2F2' : 'transparent',
                        padding: '10px 12px', fontSize: 12.5,
                        color: f.key === "itemskucode" && skuInvalid ? C.red : C.t1,
                        fontFamily: 'inherit',
                        textAlign: f.type === 'num' ? 'right' : 'left',
                        outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  </td>
                ))}
                <td style={{ padding: '0 4px', textAlign: 'center', background: C.card, borderBottom: '1px solid #F0ECE3' }}>
                  <button onClick={() => deleteRow(r._uid)}
                    style={{ background: 'transparent', border: 'none', color: '#C4483A', cursor: 'pointer', padding: 4, borderRadius: 4 }}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 12, color: C.t3, marginTop: 12 }}>
        One row = one SKU for one month. Same SKU + month on upload will update the existing record. SKU must exist in item master.
        Use <strong>Month</strong> dropdown to filter by month.
      </p>
    </div>
  );
}
