import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { Plus, Trash2, Download, Search, CalendarPlus, X, FileSpreadsheet, Upload, Save, RefreshCw } from "lucide-react";
import { supabase } from "./supabase.js";

// ── COGS Tracker — Supabase-backed ──────────────────────────────────────────
// Table: cogs_ledger (itemskucode text, productname text, tallyproductname text,
//                     subcategory text, category text, month text, cogs numeric,
//                     is_explicit boolean, PRIMARY KEY (itemskucode, month))

const FIXED = [
  { key: "itemskucode", label: "SKU Code", w: "160px", required: true },
  { key: "productname", label: "Product Name", w: "220px" },
  { key: "tallyproductname", label: "Tally Product Name", w: "220px" },
  { key: "subcategory", label: "Sub Category", w: "160px" },
  { key: "category", label: "Category", w: "160px" },
];

const todayMonth = () => new Date().toISOString().slice(0, 7);
const monthLabel = (m) => {
  const [y, mo] = m.split("-");
  const mon = new Date(+y, +mo - 1).toLocaleString("en", { month: "short" });
  return `${mon}-${String(y).slice(2)}`;
};
const nextMonth = (m) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo, 1).toISOString().slice(0, 7);
};
const uid = () => Math.random().toString(36).slice(2, 10);
const exampleFor = (key) =>
  ({ itemskucode: "SKU001", productname: "Example Product", category: "Example Category", subcategory: "Example Sub Category", tallyproductname: "Example Tally Name" }[key] ?? "");
const numOrBlank = (v) => {
  if (v == null || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
};
const normMonth = (v) => {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 7);
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${String(+m[2]).padStart(2, "0")}`;
  if (/^\d{4,6}$/.test(s)) {
    const d = XLSX.SSF ? XLSX.SSF.parse_date_code(+s) : null;
    if (d && d.y) return `${d.y}-${String(d.m).padStart(2, "0")}`;
  }
  const d2 = new Date(s);
  if (!isNaN(d2)) return d2.toISOString().slice(0, 7);
  return null;
};

// Build rows/months from flat Supabase records
function buildState(records) {
  const monthSet = new Set();
  const byKey = new Map();
  for (const rec of records) {
    const key = rec.itemskucode.toLowerCase();
    monthSet.add(rec.month);
    if (!byKey.has(key)) {
      byKey.set(key, {
        id: uid(),
        itemskucode: rec.itemskucode,
        productname: rec.productname || "",
        tallyproductname: rec.tallyproductname || "",
        subcategory: rec.subcategory || "",
        category: rec.category || "",
        cogs: {},
        explicit: {},
      });
    }
    const row = byKey.get(key);
    row.cogs[rec.month] = rec.cogs != null ? String(rec.cogs) : "";
    row.explicit[rec.month] = rec.is_explicit ?? true;
  }
  const months = Array.from(monthSet).sort();
  const rows = Array.from(byKey.values());
  return { months: months.length ? months : [todayMonth()], rows: rows.length ? rows : [{ id: uid(), itemskucode: "", productname: "", tallyproductname: "", subcategory: "", category: "", cogs: {}, explicit: {} }] };
}

export default function CogsPage() {
  const [months, setMonths] = useState([todayMonth()]);
  const [rows, setRows] = useState([{ id: uid(), itemskucode: "", productname: "", category: "", subcategory: "", tallyproductname: "", cogs: {}, explicit: {} }]);
  const [query, setQuery] = useState("");
  const [dbLoading, setDbLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dbError, setDbError] = useState(null);
  const [dirty, setDirty] = useState(false);
  const templateInput = useRef(null);

  // Load from Supabase on mount
  const loadFromDb = useCallback(async () => {
    setDbLoading(true);
    setDbError(null);
    try {
      const { data, error } = await supabase.from("cogs_ledger").select("*").order("itemskucode").order("month");
      if (error) throw error;
      if (data && data.length > 0) {
        const { months: m, rows: r } = buildState(data);
        setMonths(m);
        setRows(r);
      }
      setDirty(false);
    } catch (e) {
      setDbError(e.message || "Failed to load from database");
    } finally {
      setDbLoading(false);
    }
  }, []);

  useEffect(() => { loadFromDb(); }, [loadFromDb]);

  // Save all rows to Supabase (upsert)
  const saveToDb = async () => {
    const realRows = rows.filter(r => (r.itemskucode || "").trim() !== "");
    if (!realRows.length) { alert("Add at least one SKU before saving."); return; }
    setSaving(true);
    setDbError(null);
    try {
      const records = [];
      for (const row of realRows) {
        for (const month of months) {
          const cogsVal = row.cogs[month];
          records.push({
            itemskucode: row.itemskucode.trim(),
            productname: row.productname || null,
            tallyproductname: row.tallyproductname || null,
            subcategory: row.subcategory || null,
            category: row.category || null,
            month,
            cogs: cogsVal !== "" && cogsVal != null ? Number(cogsVal) : null,
            is_explicit: row.explicit?.[month] ?? false,
          });
        }
      }
      const { error } = await supabase.from("cogs_ledger").upsert(records, { onConflict: "itemskucode,month" });
      if (error) throw error;
      setDirty(false);
      alert("Saved to database successfully.");
    } catch (e) {
      setDbError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      [r.itemskucode, r.productname, r.category, r.subcategory, r.tallyproductname].some(v => (v || "").toLowerCase().includes(q))
    );
  }, [rows, query]);

  const mark = () => setDirty(true);

  const setAttr = (id, key, val) => { setRows(rs => rs.map(r => r.id === id ? { ...r, [key]: val } : r)); mark(); };
  const setCogs = (id, month, val) => {
    setRows(rs => rs.map(r => r.id === id ? { ...r, cogs: { ...r.cogs, [month]: val }, explicit: { ...(r.explicit || {}), [month]: val !== "" } } : r));
    mark();
  };
  const addRow = () => { setRows(rs => [...rs, { id: uid(), itemskucode: "", productname: "", category: "", subcategory: "", tallyproductname: "", cogs: {}, explicit: {} }]); mark(); };
  const deleteRow = async (id) => {
    const row = rows.find(r => r.id === id);
    if (row?.itemskucode?.trim()) {
      try {
        await supabase.from("cogs_ledger").delete().eq("itemskucode", row.itemskucode.trim());
      } catch (e) { /* silently ignore */ }
    }
    setRows(rs => rs.filter(r => r.id !== id));
    mark();
  };
  const addMonthAfterLast = () => {
    const last = months[months.length - 1];
    const nm = nextMonth(last);
    if (months.includes(nm)) return;
    setMonths(ms => [...ms, nm]);
    setRows(rs => rs.map(r => ({ ...r, cogs: { ...r.cogs, [nm]: r.cogs[last] ?? "" } })));
    mark();
  };
  const removeMonth = (m) => {
    if (months.length === 1) return;
    setMonths(ms => ms.filter(x => x !== m));
    setRows(rs => rs.map(r => { const c = { ...r.cogs }; delete c[m]; return { ...r, cogs: c }; }));
    mark();
  };

  const downloadTemplate = () => {
    const MANDATORY = new Set(["SKU Code", "COGS Month", "COGS"]);
    const cols = [...FIXED.map(f => ({ label: f.label, ex: exampleFor(f.key) })), { label: "COGS Month", ex: todayMonth() }, { label: "COGS", ex: "42.50" }];
    const headerRow = cols.map(c => `${c.label} ${MANDATORY.has(c.label) ? "(Mandatory)" : "(Optional)"}`);
    const ws = XLSX.utils.aoa_to_sheet([headerRow, cols.map(c => c.ex)]);
    ws["!cols"] = cols.map(c => ({ wch: Math.max(16, c.label.length + 14) }));
    const green = "1F5C4A", red = "9E2B25";
    for (let c = 0; c < cols.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      ws[addr].s = { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 }, fill: { fgColor: { rgb: MANDATORY.has(cols[c].label) ? red : green } }, alignment: { horizontal: "left", vertical: "center" } };
      const ex = XLSX.utils.encode_cell({ r: 1, c });
      ws[ex].s = { font: { italic: true, color: { rgb: "9A9382" } } };
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SKUs");
    const notes = XLSX.utils.aoa_to_sheet([
      ["How to use this template"], [""],
      ["MANDATORY columns: SKU Code, COGS Month, COGS."],
      ["OPTIONAL columns: Product Name, Category, Sub Category, Tally Product Name."], [""],
      ["1. Keep the header row exactly as-is."],
      ["2. Delete the grey example row, then add your data below the header."],
      ["3. COGS Month must be in YYYY-MM format, e.g. 2026-03."],
      ["4. One row = one SKU's COGS for one month."],
      ["5. Uploading APPENDS: new SKUs are added; existing SKUs get that month's COGS updated."],
      ["6. After upload, click Save to persist to the database."],
    ]);
    notes["!cols"] = [{ wch: 108 }];
    if (notes["A1"]) notes["A1"].s = { font: { bold: true, sz: 13 } };
    XLSX.utils.book_append_sheet(wb, notes, "Instructions");
    XLSX.writeFile(wb, "cogs_template.xlsx");
  };

  const importTemplate = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
        if (!aoa.length) throw new Error("empty");
        const normHead = (c) => String(c).trim().toLowerCase().replace(/\s*\((mandatory|optional|required)\)\s*$/i, "").trim();
        let headerIdx = aoa.findIndex(r => { const cells = r.map(normHead); return ["sku code", "cogs month"].every(w => cells.includes(w)); });
        if (headerIdx === -1) headerIdx = 0;
        const head = aoa[headerIdx].map(normHead);
        const col = (label) => head.indexOf(label.toLowerCase());
        const ci = { sku: col("SKU Code"), name: col("Product Name"), cat: col("Category"), subcat: col("Sub Category"), tally: col("Tally Product Name"), month: col("COGS Month"), cogs: col("COGS") };
        if (ci.sku === -1 || ci.month === -1 || ci.cogs === -1) { alert("Missing required column (SKU Code, COGS Month, or COGS). Use the downloaded template."); return; }
        const body = aoa.slice(headerIdx + 1);
        const rawParsed = body.map(r => ({
          sku: String(r[ci.sku] ?? "").trim(),
          name: String(r[ci.name] ?? "").trim(),
          cat: String(r[ci.cat] ?? "").trim(),
          subcat: ci.subcat === -1 ? "" : String(r[ci.subcat] ?? "").trim(),
          tally: ci.tally === -1 ? "" : String(r[ci.tally] ?? "").trim(),
          month: normMonth(r[ci.month]),
          cogs: r[ci.cogs] == null ? "" : String(r[ci.cogs]).trim(),
        })).filter(r => (r.sku || r.name || r.cat || r.subcat || r.tally || r.cogs) && !(r.sku === "SKU001" && r.name === "Example Product"));
        const bad = [], parsed = [];
        rawParsed.forEach((r, i) => {
          const missing = [];
          if (!r.sku) missing.push("SKU Code");
          if (r.cogs === "") missing.push("COGS");
          if (!r.month) missing.push("COGS Month");
          if (missing.length) bad.push({ line: i + 2, missing });
          else parsed.push(r);
        });
        if (bad.length) {
          const preview = bad.slice(0, 8).map(b => `• row ${b.line}: missing ${b.missing.join(", ")}`).join("\n");
          const more = bad.length > 8 ? `\n…and ${bad.length - 8} more.` : "";
          const proceed = confirm(`${bad.length} row${bad.length !== 1 ? "s" : ""} skipped:\n\n${preview}${more}\n\nImport ${parsed.length} valid row${parsed.length !== 1 ? "s" : ""} anyway?`);
          if (!proceed) { if (templateInput.current) templateInput.current.value = ""; return; }
        }
        if (!parsed.length) { alert("No rows found."); return; }
        const fileMonths = Array.from(new Set(parsed.map(r => r.month).filter(Boolean)));
        const mergedMonths = Array.from(new Set([...months, ...fileMonths])).sort();
        let added = 0, updated = 0;
        setRows(prev => {
          const byKey = new Map(prev.map(r => [r.itemskucode.toLowerCase(), { ...r, cogs: { ...r.cogs }, explicit: { ...(r.explicit || {}) } }]));
          for (const r of parsed) {
            const key = r.sku.toLowerCase();
            if (!byKey.has(key)) { byKey.set(key, { id: uid(), itemskucode: r.sku, productname: r.name, category: r.cat, subcategory: r.subcat, tallyproductname: r.tally, cogs: {}, explicit: {} }); added++; }
            else { const row = byKey.get(key); if (!row.productname && r.name) row.productname = r.name; if (!row.category && r.cat) row.category = r.cat; if (!row.subcategory && r.subcat) row.subcategory = r.subcat; if (!row.tallyproductname && r.tally) row.tallyproductname = r.tally; }
          }
          for (const r of parsed) {
            if (!r.month || r.cogs === "") continue;
            const row = byKey.get(r.sku.toLowerCase());
            row.cogs[r.month] = r.cogs; row.explicit[r.month] = true; updated++;
          }
          for (const row of byKey.values()) {
            let last = "";
            for (const m of mergedMonths) {
              const val = row.cogs[m];
              if (val !== undefined && val !== "") last = val;
              else if (last !== "") row.cogs[m] = last;
            }
          }
          return Array.from(byKey.values());
        });
        setMonths(mergedMonths);
        mark();
        alert(`Upload complete.\n${added} new SKU${added !== 1 ? "s" : ""} added, ${updated} COGS value${updated !== 1 ? "s" : ""} updated.\n\nClick Save to persist to the database.`);
      } catch { alert("Couldn't read that file. Use the template from 'Download template'."); }
      finally { if (templateInput.current) templateInput.current.value = ""; }
    };
    reader.readAsArrayBuffer(file);
  };

  const exportCSV = () => {
    const header = [...FIXED.map(f => f.label), ...months.map(m => `COGS ${monthLabel(m)}`)];
    const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [header.map(esc).join(",")];
    for (const r of rows) {
      if ((r.itemskucode || "").trim() === "") continue;
      lines.push([...FIXED.map(f => esc(r[f.key] ?? "")), ...months.map(m => esc(r.cogs[m] ?? ""))].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `cogs_${todayMonth()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportXLSX = () => {
    const green = "1F5C4A";
    const realRows = rows.filter(r => (r.itemskucode || "").trim() !== "");
    if (!realRows.length) { alert("Nothing to export — add at least one SKU first."); return; }
    const styleHeader = (ws, ncols) => {
      for (let c = 0; c < ncols; c++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c });
        if (ws[addr]) ws[addr].s = { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 }, fill: { fgColor: { rgb: green } }, alignment: { horizontal: "left", vertical: "center" } };
      }
    };
    const snapHead = [...FIXED.map(f => f.label), "COGS_Update_Month", "Month"];
    const latestFor = (r) => {
      const exp = r.explicit || {};
      for (let i = months.length - 1; i >= 0; i--) { const m = months[i]; if (exp[m] && r.cogs[m] !== undefined && r.cogs[m] !== "") return m; }
      for (let i = months.length - 1; i >= 0; i--) { const m = months[i]; if (r.cogs[m] !== undefined && r.cogs[m] !== "") return m; }
      return null;
    };
    const snapBody = realRows.map(r => { const m = latestFor(r); return [...FIXED.map(f => r[f.key] ?? ""), m ? numOrBlank(r.cogs[m]) : "", m ? monthLabel(m) : ""]; });
    const wsSnap = XLSX.utils.aoa_to_sheet([snapHead, ...snapBody]);
    wsSnap["!cols"] = [{ wch: 18 }, { wch: 40 }, { wch: 18 }, { wch: 18 }, { wch: 24 }, { wch: 18 }, { wch: 10 }];
    styleHeader(wsSnap, snapHead.length);
    const longHead = [...FIXED.map(f => f.label), "Month", "COGS"];
    const longBody = [];
    for (const m of months) for (const r of realRows) longBody.push([...FIXED.map(f => r[f.key] ?? ""), m, numOrBlank(r.cogs[m])]);
    const wsLong = XLSX.utils.aoa_to_sheet([longHead, ...longBody]);
    wsLong["!cols"] = [{ wch: 18 }, { wch: 28 }, { wch: 18 }, { wch: 24 }, { wch: 24 }, { wch: 12 }, { wch: 12 }];
    styleHeader(wsLong, longHead.length);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsSnap, "Latest COGS");
    XLSX.utils.book_append_sheet(wb, wsLong, "Month-wise");
    XLSX.writeFile(wb, `cogs_${todayMonth()}.xlsx`);
  };

  const S = getStyles();

  if (dbLoading) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "#8A8271" }}>
      <RefreshCw size={28} style={{ opacity: 0.4, animation: "spin 1s linear infinite" }} />
      <span style={{ fontSize: 13 }}>Loading COGS data…</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );

  return (
    <div style={S.page}>
      <style>{globalCSS}</style>
      <header style={S.header}>
        <div style={S.actions}>
          {dbError && <span style={{ fontSize: 12, color: "#C4483A", maxWidth: 240 }}>⚠ {dbError}</span>}
          <div style={S.searchWrap}>
            <Search size={15} style={{ opacity: 0.5 }} />
            <input style={S.search} placeholder="Filter SKUs…" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <button style={S.ghostBtn} onClick={downloadTemplate}><FileSpreadsheet size={15} /> Download template</button>
          <button style={S.ghostBtn} onClick={() => templateInput.current?.click()}><Upload size={15} /> Upload template</button>
          <input ref={templateInput} type="file" accept=".xlsx,.xls" onChange={importTemplate} style={{ display: "none" }} />
          <button style={S.ghostBtn} onClick={exportCSV}><Download size={15} /> Export CSV</button>
          <button style={S.ghostBtn} onClick={exportXLSX}><Download size={15} /> Export Excel</button>
          <button style={S.ghostBtn} onClick={loadFromDb}><RefreshCw size={15} /> Refresh</button>
          <button style={{ ...S.primaryBtn, opacity: saving ? 0.7 : 1 }} onClick={saveToDb} disabled={saving}>
            <Save size={15} /> {saving ? "Saving…" : dirty ? "Save *" : "Save"}
          </button>
        </div>
      </header>

      <div style={S.toolbar}>
        <button style={S.chipBtn} onClick={addRow}><Plus size={15} /> Add SKU</button>
        <button style={S.chipBtn} onClick={addMonthAfterLast}><CalendarPlus size={15} /> Add month (fills from {monthLabel(months[months.length - 1])})</button>
        <span style={S.count}>{rows.length} SKU{rows.length !== 1 ? "s" : ""} · {months.length} month{months.length !== 1 ? "s" : ""}</span>
        {dirty && <span style={{ fontSize: 11.5, color: "#C4483A", fontWeight: 600 }}>Unsaved changes — click Save</span>}
      </div>

      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              {FIXED.map(f => (
                <th key={f.key} style={{ ...S.th, ...S.thSticky, minWidth: f.w }}>
                  {f.label}{f.required && <span style={{ color: "#C4483A" }}> *</span>}
                </th>
              ))}
              {months.map(m => (
                <th key={m} style={{ ...S.th, ...S.thMonth }}>
                  <div style={S.monthHead}>
                    <span>{monthLabel(m)}</span>
                    {months.length > 1 && (
                      <button style={S.removeMonth} title="Remove month" onClick={() => removeMonth(m)}><X size={12} /></button>
                    )}
                  </div>
                </th>
              ))}
              <th style={{ ...S.th, width: 44 }} />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={FIXED.length + months.length + 1} style={S.empty}>No SKUs match your filter. Clear the filter or add a new SKU.</td></tr>
            )}
            {filtered.map(r => (
              <tr key={r.id} className="cogs-row">
                {FIXED.map(f => (
                  <td key={f.key} style={{ ...S.td, ...S.tdSticky }}>
                    <input style={S.cellInput} value={r[f.key]} placeholder={f.label} onChange={e => setAttr(r.id, f.key, e.target.value)} />
                  </td>
                ))}
                {months.map(m => (
                  <td key={m} style={S.td}>
                    <input style={{ ...S.cellInput, ...S.numInput }} value={r.cogs[m] ?? ""} placeholder="0.00" inputMode="decimal" onChange={e => setCogs(r.id, m, e.target.value)} />
                  </td>
                ))}
                <td style={{ ...S.td, textAlign: "center" }}>
                  <button style={S.delBtn} title="Delete SKU" onClick={() => deleteRow(r.id)}><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={S.note}>Data is persisted to Supabase. Click <strong>Save</strong> after any edits. One row per SKU — new months add a column.</p>
    </div>
  );
}

const globalCSS = `
  .cogs-row:hover td { background: #FBFAF7 !important; }
  .cogs-row:hover td:first-child { background: #F5F2EC !important; }
`;

function getStyles() {
  const ink = "#1C1A16", line = "#E6E1D6", paper = "#FCFBF8", accent = "#1F5C4A", accentSoft = "#EAF1EC";
  return {
    page: { fontFamily: "'DM Sans', system-ui, sans-serif", background: paper, color: ink, minHeight: "100%", padding: "28px 24px 48px" },
    header: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 20 },
    eyebrow: { fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: accent, marginBottom: 4 },
    h1: { fontFamily: "'Fraunces', Georgia, serif", fontSize: 34, fontWeight: 600, margin: 0, letterSpacing: "-0.02em" },
    actions: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
    searchWrap: { display: "flex", alignItems: "center", gap: 7, background: "#fff", border: `1px solid ${line}`, borderRadius: 8, padding: "8px 11px" },
    search: { border: "none", background: "transparent", fontSize: 14, width: 130, color: ink },
    primaryBtn: { display: "inline-flex", alignItems: "center", gap: 7, background: accent, color: "#fff", border: "none", padding: "9px 15px", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer" },
    ghostBtn: { display: "inline-flex", alignItems: "center", gap: 7, background: "#fff", color: ink, border: `1px solid ${line}`, padding: "9px 14px", borderRadius: 8, fontSize: 14, cursor: "pointer" },
    toolbar: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" },
    chipBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: accentSoft, color: accent, border: `1px solid ${line}`, padding: "7px 13px", borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: "pointer" },
    count: { fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#8A8271", marginLeft: 4 },
    tableWrap: { border: `1px solid ${line}`, borderRadius: 12, overflow: "auto", background: "#fff", maxHeight: "68vh" },
    table: { borderCollapse: "separate", borderSpacing: 0, width: "100%", fontSize: 14 },
    th: { position: "sticky", top: 0, zIndex: 2, background: "#F5F2EC", textAlign: "left", padding: "11px 12px", fontWeight: 600, fontSize: 12.5, color: "#5C574B", borderBottom: `1px solid ${line}`, whiteSpace: "nowrap" },
    thSticky: { left: 0, zIndex: 3 },
    thMonth: { textAlign: "right", fontFamily: "'DM Mono', monospace", letterSpacing: "0.02em" },
    monthHead: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 },
    removeMonth: { display: "inline-flex", background: "transparent", border: "none", color: "#B0A99A", cursor: "pointer", padding: 0 },
    td: { padding: 0, borderBottom: `1px solid #F0ECE3`, background: "#fff" },
    tdSticky: { position: "sticky", left: 0, zIndex: 1, background: "#fff" },
    cellInput: { width: "100%", border: "none", background: "transparent", padding: "11px 12px", fontSize: 14, color: ink, fontFamily: "inherit" },
    numInput: { textAlign: "right", fontFamily: "'DM Mono', monospace", fontVariantNumeric: "tabular-nums" },
    delBtn: { display: "inline-flex", background: "transparent", border: "none", color: "#C4483A", cursor: "pointer", padding: 6, borderRadius: 6 },
    empty: { padding: "34px 16px", textAlign: "center", color: "#9A9382", fontSize: 14 },
    note: { fontSize: 12.5, color: "#9A9382", marginTop: 16, maxWidth: 640, lineHeight: 1.5 },
  };
}
