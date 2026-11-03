// A batch's scopes (Month + partner) and its rows with every error and warning, paged, plus
// the error report. Shared by the upload preview and Upload history.
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { C } from "../utils.js";
import { fetchStagedRows, fetchScopes, rowMessages, downloadErrorReport, headerFor } from "./cnEngine.js";
import { PAGE, fmt, btn, th, td, num } from "./ui.js";

const STATUS = {
  new: { label: "New", tone: () => C.green },
  replace: { label: "Replace", tone: () => C.amber },
  blocked: { label: "Blocked", tone: () => C.red },
};

export function Pill({ tone, children }) {
  return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: tone.bg, color: tone.tx, border: `1px solid ${tone.bd}` }}>{children}</span>;
}

export function Stat({ label, value, tone }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${tone ? tone.bd : C.border}`, borderRadius: 10, padding: "10px 14px", minWidth: 120 }}>
      <div style={{ fontSize: 11, color: C.t3, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: tone ? tone.tx : C.t1, marginTop: 2 }}>{value}</div>
    </div>
  );
}

export function Pager({ page, count, setPage, what }) {
  if (count <= PAGE) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0 14px", fontSize: 12, color: C.t3 }}>
      <button className="tool-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
      {what} {fmt(page * PAGE + 1)}–{fmt(Math.min((page + 1) * PAGE, count))} of {fmt(count)}
      <button className="tool-btn" disabled={(page + 1) * PAGE >= count} onClick={() => setPage((p) => p + 1)}>Next</button>
    </div>
  );
}

// batch: { batchId, headers, headerMap, fileName, totalRows, failedRows, warningRows, inlineScopes }
// version: bump to refetch after the batch was re-validated.
export default function BatchReview({ cfg, batch, version = 0, onError }) {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState({ rows: [], count: 0 });
  const [scopePage, setScopePage] = useState(0);
  const [scopes, setScopes] = useState({ scopes: [], count: 0, loaded: false });

  useEffect(() => {
    let live = true;
    fetchStagedRows(batch.batchId, { filter, page, pageSize: PAGE })
      .then((r) => live && setRows(r)).catch((e) => live && onError?.(e.message));
    return () => { live = false; };
  }, [batch.batchId, filter, page, version, onError]);

  // Scopes: inline in the validation summary for small files, paged from the table otherwise.
  useEffect(() => {
    let live = true;
    const inline = batch.inlineScopes;
    if (inline) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setScopes({ scopes: inline.slice(scopePage * PAGE, scopePage * PAGE + PAGE), count: inline.length, loaded: true });
      return;
    }
    fetchScopes(batch.batchId, { page: scopePage, pageSize: PAGE })
      .then((s) => live && setScopes({ ...s, loaded: true })).catch((e) => live && onError?.(e.message));
    return () => { live = false; };
  }, [batch.batchId, batch.inlineScopes, scopePage, version, onError]);

  return (
    <>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.t2, margin: "4px 0 6px" }}>By Month + {cfg.partner_label}</div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "auto", background: C.card, maxHeight: "40vh", marginBottom: 6 }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
          <thead><tr>
            <th style={th}>Month / {cfg.partner_label}</th><th style={th}>Status</th>
            <th style={{ ...th, textAlign: "right" }}>Existing rows replaced</th><th style={{ ...th, textAlign: "right" }}>New rows</th>
            <th style={{ ...th, textAlign: "right" }}>Rows with errors</th><th style={th}>Notes</th>
          </tr></thead>
          <tbody>
            {scopes.scopes.map((x) => (
              <tr key={x.scope_key}>
                <td style={{ ...td, fontWeight: 600 }}>{x.label}</td>
                <td style={td}><Pill tone={STATUS[x.status].tone()}>{STATUS[x.status].label}</Pill></td>
                <td style={num}>{x.status === "blocked" ? "—" : fmt(x.existing_rows)}</td>
                <td style={num}>{fmt(x.new_rows)}</td>
                <td style={num}>{fmt(x.error_rows)}</td>
                <td style={{ ...td, color: C.t2 }}>
                  {x.status === "replace" && <div style={{ color: C.amber.tx, fontWeight: 600 }}>This will replace {fmt(x.existing_rows)} existing row{x.existing_rows === 1 ? "" : "s"} for {x.label}.</div>}
                  {x.status === "blocked" && <div style={{ color: C.red.tx }}>Not saved — fix row{x.blocked_by.length > 1 ? "s" : ""} {x.blocked_by.join(", ")}. Existing data for this scope stays as it is.</div>}
                  {x.warnings.map((w) => <div key={w} style={{ color: C.amber.tx }}>{w}</div>)}
                </td>
              </tr>
            ))}
            {scopes.loaded && scopes.count === 0 && <tr><td colSpan={6} style={{ ...td, color: C.t3, textAlign: "center" }}>No row could be placed in a Month + {cfg.partner_label} — see the row errors below.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={scopePage} count={scopes.count} setPage={setScopePage} what="Scopes (blocked first)" />

      <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "8px 0 6px", flexWrap: "wrap" }}>
        {[["all", `All rows (${fmt(batch.totalRows)})`], ["errors", `Not saved (${fmt(batch.failedRows)})`], ["warnings", `Warnings (${fmt(batch.warningRows)})`]].map(([k, l]) => (
          <button key={k} className={`tool-btn${filter === k ? " is-active" : ""}`} onClick={() => { setFilter(k); setPage(0); }}>{l}</button>
        ))}
        <button className="tool-btn" style={{ ...btn, marginLeft: "auto" }}
          onClick={() => downloadErrorReport(batch.batchId, batch.headers, batch.fileName ?? "upload.xlsx").catch((e) => onError?.(e.message))}>
          <Download size={13} /> Download error report
        </button>
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "auto", background: C.card, maxHeight: "50vh" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
          <thead><tr>
            <th style={th}>Row</th>
            {cfg.columns.map((c) => <th key={c.key} style={th}>{headerFor(c)}</th>)}
            <th style={{ ...th, minWidth: 320 }}>Messages</th>
          </tr></thead>
          <tbody>
            {rows.rows.map((r) => {
              const m = rowMessages(r);
              return (
                <tr key={r.row_no} style={{ background: m.errors.length ? C.red.bg : "transparent" }}>
                  <td style={{ ...td, fontFamily: "monospace", color: C.t3 }}>{r.row_no}</td>
                  {cfg.columns.map((c) => <td key={c.key} style={td}>{r.raw?.[batch.headerMap[c.key]] ?? ""}</td>)}
                  <td style={td}>
                    {m.errors.map((x) => <div key={x} style={{ color: C.red.tx }}>✕ {x}</div>)}
                    {m.warnings.map((x) => <div key={x} style={{ color: C.amber.tx }}>⚠ {x}</div>)}
                    {!m.errors.length && !m.warnings.length && <span style={{ color: C.green.tx }}>✓ OK</span>}
                  </td>
                </tr>
              );
            })}
            {rows.rows.length === 0 && <tr><td colSpan={cfg.columns.length + 2} style={{ ...td, color: C.t3, textAlign: "center" }}>Nothing to show.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={page} count={rows.count} setPage={setPage} what="Rows" />
    </>
  );
}
