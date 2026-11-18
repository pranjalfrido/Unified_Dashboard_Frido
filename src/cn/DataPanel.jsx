// Saved credit-note rows of one upload type: filters, paging, Excel export, and (for managers)
// editing a row's values or deleting it. Active rows only — replaced and deleted rows are kept
// in the database but never listed.
import { useCallback, useEffect, useState } from "react";
import { Download, Pencil, Trash2, Check, X, RefreshCw } from "lucide-react";
import { C } from "../utils.js";
import { LIST_COLUMNS, monthLabel, fetchData, fetchPartners, exportData, updateRow, deleteRow } from "./cnData.js";
import { Pager } from "./BatchReview.jsx";
import { PAGE, fmt, btn, th, td, num } from "./ui.js";

const money = (v) => (v == null || v === "" ? "—" : `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const input = { fontSize: 12, padding: "5px 8px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.card, color: C.t1, fontFamily: "inherit" };

export default function DataPanel({ cfg, manage }) {
  const cols = LIST_COLUMNS[cfg.code];
  const reasons = cfg.columns.find((c) => c.key === "reason")?.enum;
  const [filters, setFilters] = useState({ from: "", to: "", partnerId: "", reason: "", awb: "" });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ rows: [], count: 0, loading: true });
  const [partners, setPartners] = useState([]);
  const [status, setStatus] = useState(null);
  const [editing, setEditing] = useState(null); // { id, values }
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => { fetchPartners(cfg).then(setPartners).catch(() => setPartners([])); }, [cfg]);

  useEffect(() => {
    let live = true;
    fetchData(cfg, applied, { page, pageSize: PAGE })
      .then((d) => live && setData({ ...d, loading: false }))
      .catch((e) => live && (setData({ rows: [], count: 0, loading: false }), setStatus({ kind: "error", text: e.message })));
    return () => { live = false; };
  }, [cfg, applied, page, version]);

  const flash = useCallback((kind, text) => { setStatus({ kind, text }); if (kind !== "error") setTimeout(() => setStatus(null), 3500); }, []);
  const apply = () => { setApplied(filters); setPage(0); };
  const clear = () => { const f = { from: "", to: "", partnerId: "", reason: "", awb: "" }; setFilters(f); setApplied(f); setPage(0); };

  const onExport = async () => {
    setBusy(true);
    try { const n = await exportData(cfg, applied, (k) => setStatus({ kind: "info", text: `Exporting… ${fmt(k)} rows` })); flash("ok", `Exported ${fmt(n)} rows.`); }
    catch (e) { flash("error", e.message); }
    finally { setBusy(false); }
  };

  const startEdit = (r) => setEditing({ id: r.id, values: Object.fromEntries(cfg.editable_cols.map((k) => [k, r[k] == null ? "" : String(r[k])])) });
  const saveEdit = async () => {
    const row = data.rows.find((r) => r.id === editing.id);
    const changes = Object.fromEntries(Object.entries(editing.values).filter(([k, v]) => v !== (row[k] == null ? "" : String(row[k]))));
    if (!Object.keys(changes).length) { setEditing(null); return; }
    setBusy(true);
    try { await updateRow(cfg, editing.id, changes); setEditing(null); setVersion((v) => v + 1); flash("ok", "Row updated."); }
    catch (e) { flash("error", e.message); }
    finally { setBusy(false); }
  };
  const remove = async (r) => {
    const what = [r.awb, monthLabel(r.month), r.courier ?? r.transporter ?? r.partner, r.courier_account ?? r.facility].filter(Boolean).join(" / ");
    if (!confirm(`Delete ${what}? It is removed from the listings and reports; the history is kept.`)) return;
    setBusy(true);
    try { await deleteRow(cfg, r.id); setVersion((v) => v + 1); flash("ok", "Row deleted."); }
    catch (e) { flash("error", e.message); }
    finally { setBusy(false); }
  };

  const cell = (r, c) => {
    if (editing?.id === r.id && cfg.editable_cols.includes(c.key)) {
      return <input value={editing.values[c.key]} onChange={(e) => setEditing((ed) => ({ ...ed, values: { ...ed.values, [c.key]: e.target.value } }))}
        placeholder={c.key === "expected_cn" && cfg.code === "lost_damage" ? "blank = shipment value" : ""}
        style={{ ...input, width: c.type === "amount" ? 110 : 120, textAlign: c.type === "amount" ? "right" : "left" }} />;
    }
    const v = r[c.key];
    if (c.type === "month") return monthLabel(v);
    if (c.type === "amount") return <>{money(v)}{c.key === "expected_cn" && r.expected_cn_defaulted && <span title="Defaulted to the shipment value" style={{ color: C.t3 }}> *</span>}</>;
    if (c.type === "pct") return v == null ? "—" : `${Number(v).toFixed(1)}%`;
    return v ?? "";
  };

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: C.t3 }}>From month<br /><input type="month" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} style={input} /></label>
        <label style={{ fontSize: 11, color: C.t3 }}>To month<br /><input type="month" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} style={input} /></label>
        <label style={{ fontSize: 11, color: C.t3 }}>{cfg.partner_label}<br />
          <select value={filters.partnerId} onChange={(e) => setFilters({ ...filters, partnerId: e.target.value })} style={{ ...input, minWidth: 150 }}>
            <option value="">All</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {reasons && (
          <label style={{ fontSize: 11, color: C.t3 }}>Reason<br />
            <select value={filters.reason} onChange={(e) => setFilters({ ...filters, reason: e.target.value })} style={{ ...input, minWidth: 140 }}>
              <option value="">All</option>
              {reasons.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
        )}
        {cfg.code === "lost_damage" && (
          <label style={{ fontSize: 11, color: C.t3 }}>AWB<br /><input value={filters.awb} onChange={(e) => setFilters({ ...filters, awb: e.target.value })} placeholder="contains…" style={{ ...input, width: 140 }} /></label>
        )}
        <button className="tool-btn is-active" onClick={apply}>Apply</button>
        <button className="tool-btn" onClick={clear}>Clear</button>
        <button className="tool-btn" style={btn} onClick={() => setVersion((v) => v + 1)}><RefreshCw size={13} /> Reload</button>
        <button className="tool-btn" style={{ ...btn, marginLeft: "auto" }} onClick={onExport} disabled={busy || !data.count}><Download size={13} /> Export to Excel</button>
      </div>

      {status && (
        <div style={{ fontSize: 12.5, padding: "8px 12px", borderRadius: 8, marginBottom: 10, border: `1px solid ${status.kind === "error" ? C.red.bd : C.border}`,
          background: status.kind === "error" ? C.red.bg : C.card, color: status.kind === "error" ? C.red.tx : status.kind === "ok" ? C.green.tx : C.t2 }}>{status.text}</div>
      )}

      <div style={{ fontSize: 12, color: C.t3, marginBottom: 6 }}>
        {data.loading ? "Loading…" : `${fmt(data.count)} saved row${data.count === 1 ? "" : "s"}`} · amounts INR ex-GST
        {cfg.code === "lost_damage" && " · * Expected CN defaulted to the shipment value"}
        {!manage && " · view only — editing needs Documents → Credit notes: manage"}
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "auto", background: C.card, maxHeight: "62vh" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
          <thead><tr>
            {cols.map((c) => <th key={c.key} style={{ ...th, textAlign: c.type === "amount" || c.type === "pct" ? "right" : "left" }}>{c.label}</th>)}
            <th style={th} title="Upload batch that saved the row">Batch</th>
            {manage && <th style={{ ...th, width: 70 }} />}
          </tr></thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id}>
                {cols.map((c) => <td key={c.key} style={c.type === "amount" || c.type === "pct" ? num : td}>{cell(r, c)}</td>)}
                <td style={{ ...td, fontFamily: "monospace", color: C.t3 }}>#{r.batch_id}</td>
                {manage && (
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    {editing?.id === r.id ? (
                      <>
                        <button title="Save" onClick={saveEdit} disabled={busy} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.acc }}><Check size={14} /></button>
                        <button title="Cancel" onClick={() => setEditing(null)} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.t3 }}><X size={14} /></button>
                      </>
                    ) : (
                      <>
                        <button title={`Edit ${cfg.editable_cols.join(", ")}`} onClick={() => startEdit(r)} disabled={busy || !!editing} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.t2 }}><Pencil size={14} /></button>
                        <button title="Delete" onClick={() => remove(r)} disabled={busy || !!editing} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.red.tx }}><Trash2 size={14} /></button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {!data.loading && data.rows.length === 0 && (
              <tr><td colSpan={cols.length + 2} style={{ ...td, color: C.t3, textAlign: "center", padding: 28 }}>No saved rows{applied !== filters || Object.values(applied).some(Boolean) ? " match these filters" : " yet — upload a file to add some"}.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager page={page} count={data.count} setPage={setPage} what="Rows" />
      {manage && <div style={{ fontSize: 11.5, color: C.t3, marginTop: 8 }}>Edit changes values only ({cfg.editable_cols.join(", ").replace(/_/g, " ")}). To change a month, {cfg.partner_label.toLowerCase()} or key, upload a corrected file.</div>}
    </div>
  );
}
