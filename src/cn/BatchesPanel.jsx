// Upload history: every CN upload, newest first. Open one to see its scopes, rows and error
// report; managers can roll back a saved upload, and an unsaved one can be discarded.
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Eye, RotateCcw, X, RefreshCw } from "lucide-react";
import { C } from "../utils.js";
import { listBatches, fetchBatchDetail, rollbackBatch } from "./cnData.js";
import { discardBatch } from "./cnEngine.js";
import BatchReview, { Pill, Pager } from "./BatchReview.jsx";
import { PAGE, fmt, btn, th, td, num } from "./ui.js";

const PAGE_SIZE = PAGE;
const STATUS_TONE = { staged: () => C.blue, queued: () => C.blue, committed: () => C.green, rolled_back: () => C.amber, discarded: () => C.red };
const STATUS_LABEL = { staged: "Not saved", queued: "Saving…", committed: "Saved", rolled_back: "Rolled back", discarded: "Discarded" };
const when = (t) => (t ? new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const sel = { fontSize: 12, padding: "5px 8px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.card, color: C.t1, fontFamily: "inherit" };

function BatchDetail({ b, cfg, onBack }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const onError = useCallback((m) => setError(m), []);
  useEffect(() => { fetchBatchDetail(b.id).then(setDetail).catch((e) => setError(e.message)); }, [b.id]);
  return (
    <div>
      <button className="tool-btn" style={{ ...btn, marginBottom: 12 }} onClick={onBack}><ArrowLeft size={13} /> All uploads</button>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.t1 }}>Batch #{b.id} · {b.type_label} · {b.file_name}</div>
      <div style={{ fontSize: 12, color: C.t3, margin: "4px 0 12px" }}>
        {STATUS_LABEL[b.status]} · uploaded by {b.uploaded_by_name} on {when(b.uploaded_at)}
        {b.committed_at && ` · saved ${when(b.committed_at)}: ${fmt(b.inserted_rows)} rows saved, ${fmt(b.replaced_rows)} replaced`}
        {b.rolled_back_at && ` · rolled back ${when(b.rolled_back_at)}${b.rolled_back_by_name ? ` by ${b.rolled_back_by_name}` : ""}`}
      </div>
      {b.commit_error && <div style={{ fontSize: 12.5, padding: "8px 12px", borderRadius: 8, marginBottom: 10, background: C.amber.bg, border: `1px solid ${C.amber.bd}`, color: C.amber.tx }}>{b.commit_error}</div>}
      {error && <div style={{ fontSize: 12.5, color: C.red.tx, marginBottom: 10 }}>{error}</div>}
      {b.status === "discarded" ? (
        <div style={{ fontSize: 12.5, color: C.t3 }}>This upload was discarded; its rows are no longer kept.</div>
      ) : detail && cfg ? (
        <BatchReview cfg={cfg} onError={onError} batch={{
          batchId: b.id, headers: detail.headers, headerMap: detail.header_map, fileName: b.file_name,
          totalRows: b.total_rows, failedRows: b.failed_rows, warningRows: b.warning_rows,
        }} />
      ) : !error && <div style={{ fontSize: 12.5, color: C.t3 }}>Loading…</div>}
    </div>
  );
}

export default function BatchesPanel({ types, manage }) {
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ rows: [], count: 0, loading: true });
  const [open, setOpen] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    listBatches({ type: type || null, status: status || null, page, pageSize: PAGE_SIZE })
      .then((d) => live && setData({ ...d, loading: false }))
      .catch((e) => live && (setData({ rows: [], count: 0, loading: false }), setMsg({ kind: "error", text: e.message })));
    return () => { live = false; };
  }, [type, status, page, version]);

  const act = async (fn, okText) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ kind: "ok", text: okText }); setVersion((v) => v + 1); }
    catch (e) { setMsg({ kind: "error", text: e.message }); }
    finally { setBusy(false); }
  };
  const onRollback = (b) => {
    if (!confirm(`Roll back batch #${b.id} (${b.type_label}, ${b.file_name})?\n\nIts ${fmt(b.inserted_rows)} saved rows are removed and the ${fmt(b.replaced_rows)} rows it replaced come back.`)) return;
    act(() => rollbackBatch(b.id), `Batch #${b.id} rolled back.`);
  };
  const onDiscard = (b) => { if (confirm(`Discard unsaved batch #${b.id}?`)) act(() => discardBatch(b.id), `Batch #${b.id} discarded.`); };

  if (open) return <BatchDetail b={open} cfg={types[open.upload_type]} onBack={() => { setOpen(null); setVersion((v) => v + 1); }} />;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <select value={type} onChange={(e) => { setType(e.target.value); setPage(0); }} style={sel}>
          <option value="">All uploads</option>
          {Object.values(types).sort((a, b) => a.sort - b.sort).map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} style={sel}>
          <option value="">Any status</option>
          {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className="tool-btn" style={btn} onClick={() => setVersion((v) => v + 1)}><RefreshCw size={13} /> Reload</button>
        <span style={{ fontSize: 12, color: C.t3 }}>{data.loading ? "Loading…" : `${fmt(data.count)} upload${data.count === 1 ? "" : "s"}`}</span>
      </div>
      {msg && (
        <div style={{ fontSize: 12.5, padding: "8px 12px", borderRadius: 8, marginBottom: 10, border: `1px solid ${msg.kind === "error" ? C.red.bd : C.green.bd}`,
          background: msg.kind === "error" ? C.red.bg : C.green.bg, color: msg.kind === "error" ? C.red.tx : C.green.tx }}>{msg.text}</div>
      )}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "auto", background: C.card, maxHeight: "65vh" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
          <thead><tr>
            <th style={th}>#</th><th style={th}>Upload</th><th style={th}>File</th><th style={th}>Status</th>
            <th style={th}>Uploaded by</th><th style={th}>When</th>
            <th style={{ ...th, textAlign: "right" }}>Rows</th><th style={{ ...th, textAlign: "right" }}>Saved</th>
            <th style={{ ...th, textAlign: "right" }}>Replaced</th><th style={{ ...th, textAlign: "right" }}>Not saved</th>
            <th style={th} />
          </tr></thead>
          <tbody>
            {data.rows.map((b) => (
              <tr key={b.id}>
                <td style={{ ...td, fontFamily: "monospace", color: C.t3 }}>{b.id}</td>
                <td style={td}>{b.type_label}</td>
                <td style={{ ...td, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={b.file_name}>{b.file_name}</td>
                <td style={td}><Pill tone={STATUS_TONE[b.status]()}>{STATUS_LABEL[b.status]}</Pill></td>
                <td style={td}>{b.uploaded_by_name}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{when(b.uploaded_at)}</td>
                <td style={num}>{fmt(b.total_rows)}</td>
                <td style={num}>{b.status === "committed" || b.status === "rolled_back" ? fmt(b.inserted_rows) : "—"}</td>
                <td style={num}>{b.status === "committed" || b.status === "rolled_back" ? fmt(b.replaced_rows) : "—"}</td>
                <td style={num}>{fmt(b.failed_rows)}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  <button className="tool-btn" style={btn} onClick={() => setOpen(b)}><Eye size={13} /> View</button>
                  {manage && b.status === "committed" && <button className="tool-btn" style={{ ...btn, marginLeft: 6 }} disabled={busy} onClick={() => onRollback(b)}><RotateCcw size={13} /> Roll back</button>}
                  {b.status === "staged" && <button className="tool-btn" style={{ ...btn, marginLeft: 6 }} disabled={busy} onClick={() => onDiscard(b)}><X size={13} /> Discard</button>}
                </td>
              </tr>
            ))}
            {!data.loading && data.rows.length === 0 && <tr><td colSpan={11} style={{ ...td, color: C.t3, textAlign: "center", padding: 28 }}>No uploads yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={page} count={data.count} setPage={setPage} what="Uploads" />
      <div style={{ fontSize: 11.5, color: C.t3, marginTop: 8 }}>
        Roll back undoes a saved upload: its rows are removed and the rows it replaced come back. It is refused while a later upload has replaced the same Month + partner — roll that one back first.
        {!manage && " Rolling back needs Documents → Credit notes: manage."}
      </div>
    </div>
  );
}
