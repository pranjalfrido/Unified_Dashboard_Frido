// Upload → preview → confirm, for any CN upload type. Everything about a type (columns,
// scope, checks) comes from its cn_upload_types row; this screen only drives the flow.
import { useEffect, useRef, useState, useCallback } from "react";
import { FileSpreadsheet, Upload, Download, Check, X } from "lucide-react";
import { C } from "../utils.js";
import {
  loadUploadType, downloadTemplate, parseFile, uploadAndValidate, revalidate, commitBatch, discardBatch, fetchBatch,
  fetchStagedRows, fetchScopes, rowMessages, downloadErrorReport, headerFor,
} from "./cnEngine.js";

const PAGE = 100;
const fmt = (n) => Number(n ?? 0).toLocaleString("en-IN");

const STATUS = {
  new: { label: "New", tone: () => C.green },
  replace: { label: "Replace", tone: () => C.amber },
  blocked: { label: "Blocked", tone: () => C.red },
};

function Pill({ tone, children }) {
  return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: tone.bg, color: tone.tx, border: `1px solid ${tone.bd}` }}>{children}</span>;
}

function Stat({ label, value, tone }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${tone ? tone.bd : C.border}`, borderRadius: 10, padding: "10px 14px", minWidth: 120 }}>
      <div style={{ fontSize: 11, color: C.t3, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: tone ? tone.tx : C.t1, marginTop: 2 }}>{value}</div>
    </div>
  );
}

export default function UploadPanel({ type }) {
  const [cfg, setCfg] = useState(null);
  const [cfgError, setCfgError] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | working | preview | committing | queued | done
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [file, setFile] = useState(null);
  const [batch, setBatch] = useState(null); // { batchId, headers, ignored, headerMap, summary }
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState({ rows: [], count: 0 });
  const [scopePage, setScopePage] = useState(0);
  const [scopes, setScopes] = useState({ scopes: [], count: 0 });
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState(null);
  const input = useRef(null);

  useEffect(() => {
    let live = true;
    loadUploadType(type).then((c) => live && setCfg(c)).catch((e) => live && setCfgError(e.message));
    return () => { live = false; };
  }, [type]);

  const loadRows = useCallback(async (batchId, f, p) => {
    try { setRows(await fetchStagedRows(batchId, { filter: f, page: p, pageSize: PAGE })); }
    catch (e) { setError(e.message); }
  }, []);

  useEffect(() => {
    // A fetch: state is set when it resolves, not synchronously in the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (batch && phase === "preview") loadRows(batch.batchId, filter, page);
  }, [batch, phase, filter, page, loadRows]);

  // Scopes: inline in the summary for small files, paged from the table for large ones.
  useEffect(() => {
    if (!batch || phase !== "preview") return;
    const inline = batch.summary.scopes;
    if (inline) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setScopes({ scopes: inline.slice(scopePage * PAGE, scopePage * PAGE + PAGE), count: inline.length });
      return;
    }
    fetchScopes(batch.batchId, { page: scopePage, pageSize: PAGE }).then(setScopes).catch((e) => setError(e.message));
  }, [batch, phase, scopePage]);

  const reset = () => {
    setPhase("idle"); setBatch(null); setResult(null); setError(null); setProgress(null);
    setConfirmed(false); setFilter("all"); setPage(0); setScopePage(0); setFile(null);
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !cfg) return;
    reset();
    setFile(f);
    setPhase("working");
    try {
      setProgress({ step: "reading" });
      const parsed = await parseFile(f, cfg.columns);
      if (!parsed.rows.length) throw new Error("The file has a header row but no data rows.");
      const res = await uploadAndValidate(cfg, f.name, parsed, setProgress);
      setBatch({ ...res, headers: parsed.headers });
      setPhase("preview");
    } catch (err) {
      setError(err.message);
      setPhase("idle");
    } finally { setProgress(null); }
  };

  // After a failed save, re-run the checks so the preview shows what changed.
  const refreshPreview = async () => {
    try { const summary = await revalidate(batch.batchId); setBatch((b) => ({ ...b, summary })); setConfirmed(false); } catch { /* keep the old preview */ }
    setPhase("preview");
  };

  const onCommit = async () => {
    setPhase("committing"); setError(null);
    try {
      const res = await commitBatch(batch.batchId, batch.summary.token);
      if (!res.queued) { setResult(res); setPhase("done"); return; }
      // Large file: the database commits it in the background. Wait for the batch to settle.
      setPhase("queued");
      for (;;) {
        await new Promise((r) => setTimeout(r, 3000));
        const b = await fetchBatch(batch.batchId);
        if (b.status === "committed") {
          setResult({ batch_id: b.id, inserted_rows: b.inserted_rows, replaced_rows: b.replaced_rows, failed_rows: b.failed_rows, blocked_scopes: b.blocked_scopes });
          setPhase("done");
          return;
        }
        if (b.status !== "queued") { setError(b.commit_error ?? "The background save did not complete."); await refreshPreview(); return; }
      }
    } catch (err) {
      setError(err.message);
      await refreshPreview();
    }
  };

  const onDiscard = async () => {
    try { await discardBatch(batch.batchId); } catch { /* staged rows are cleaned up either way */ }
    reset();
  };

  if (cfgError) return <div style={{ color: C.red.tx, fontSize: 13 }}>{cfgError}</div>;
  if (!cfg) return <div style={{ color: C.t3, fontSize: 13 }}>Loading…</div>;

  const s = batch?.summary;
  const replaceLabels = s?.replace_labels ?? [];
  const btn = { display: "inline-flex", alignItems: "center", gap: 6 };
  const th = { position: "sticky", top: 0, background: C.ach, textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 700, color: C.t2, textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
  const td = { padding: "7px 10px", borderBottom: `1px solid ${C.border}`, verticalAlign: "top", fontSize: 12.5 };
  const num = { ...td, textAlign: "right", fontFamily: "monospace" };

  return (
    <div>
      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button className="tool-btn" style={btn} onClick={() => downloadTemplate(cfg)}><FileSpreadsheet size={13} /> Download template</button>
        <button className="tool-btn is-active" style={btn} onClick={() => input.current?.click()} disabled={phase === "working" || phase === "committing" || phase === "queued"}>
          <Upload size={13} /> Upload file
        </button>
        <input ref={input} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} style={{ display: "none" }} />
        <span style={{ fontSize: 11.5, color: C.t3 }}>
          .xlsx or .csv · columns: {cfg.columns.map(headerFor).join(", ")}
        </span>
      </div>
      <div style={{ fontSize: 12, color: C.t2, marginBottom: 14, lineHeight: 1.6 }}>
        An upload <strong>replaces</strong> all existing {cfg.label} rows for each <strong>Month + {cfg.partner_label}</strong> in the file.
        Anything not in the file is left as it is. You'll see exactly what will be replaced before anything is saved.
      </div>

      {progress && (
        <div style={{ fontSize: 12.5, color: C.t2, padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: C.card, marginBottom: 12 }}>
          {progress.step === "reading" && `Reading ${file?.name}…`}
          {progress.step === "staging" && `Checking rows… ${fmt(progress.done)} / ${fmt(progress.total)}`}
          {progress.step === "validating" && "Checking the whole file (duplicates, scopes, bill ledger)…"}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12.5, padding: "10px 12px", borderRadius: 8, marginBottom: 12, background: C.red.bg, border: `1px solid ${C.red.bd}`, color: C.red.tx }}>{error}</div>
      )}

      {phase === "done" && result && (
        <div style={{ padding: "14px 16px", borderRadius: 10, background: C.green.bg, border: `1px solid ${C.green.bd}`, color: C.green.tx, fontSize: 13, marginBottom: 12 }}>
          <strong>Saved batch #{result.batch_id}.</strong> {fmt(result.inserted_rows)} row{result.inserted_rows === 1 ? "" : "s"} saved,
          {" "}{fmt(result.replaced_rows)} existing row{result.replaced_rows === 1 ? "" : "s"} replaced (archived)
          {result.failed_rows ? `, ${fmt(result.failed_rows)} not saved` : ""}{result.blocked_scopes ? ` (${result.blocked_scopes} blocked scope${result.blocked_scopes === 1 ? "" : "s"})` : ""}.
          <div style={{ marginTop: 8 }}><button className="tool-btn" onClick={reset}>Upload another file</button></div>
        </div>
      )}

      {phase === "queued" && (
        <div style={{ fontSize: 12.5, padding: "10px 12px", borderRadius: 8, marginBottom: 12, background: C.blue.bg, border: `1px solid ${C.blue.bd}`, color: C.blue.tx }}>
          Saving in the background — this file touches {fmt((s?.rows_to_save ?? 0) + (s?.rows_to_replace ?? 0))} rows, too many to save in one request. It usually takes under a minute; you can leave this page and check Upload history later.
        </div>
      )}

      {(phase === "preview" || phase === "committing") && s && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.t1, marginBottom: 8 }}>Preview · {file?.name} · batch #{batch.batchId}</div>
          {batch.ignored.length > 0 && (
            <div style={{ fontSize: 12, color: C.t3, marginBottom: 8 }}>Columns ignored (not part of this upload): {batch.ignored.join(", ")}</div>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <Stat label="Rows in file" value={fmt(s.total_rows)} />
            <Stat label="Will be saved" value={fmt(s.rows_to_save)} tone={C.green} />
            <Stat label="Will replace" value={fmt(s.rows_to_replace)} tone={s.rows_to_replace ? C.amber : undefined} />
            <Stat label="Rows with errors" value={fmt(s.error_rows)} tone={s.error_rows ? C.red : undefined} />
            <Stat label="Rows with warnings" value={fmt(s.warning_rows)} tone={s.warning_rows ? C.amber : undefined} />
            <Stat label="Scopes new / replace / blocked" value={`${s.new_scopes} / ${s.replace_scopes} / ${s.blocked_scopes}`} />
          </div>

          {/* Scopes */}
          <div style={{ fontSize: 12, fontWeight: 700, color: C.t2, margin: "4px 0 6px" }}>By Month + {cfg.partner_label}</div>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "auto", background: C.card, maxHeight: "40vh", marginBottom: 14 }}>
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
                {s.total_scopes === 0 && <tr><td colSpan={6} style={{ ...td, color: C.t3, textAlign: "center" }}>No row could be placed in a Month + {cfg.partner_label} — see the row errors below.</td></tr>}
              </tbody>
            </table>
          </div>
          {scopes.count > PAGE && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "-8px 0 14px", fontSize: 12, color: C.t3 }}>
              <button className="tool-btn" disabled={scopePage === 0} onClick={() => setScopePage((p) => p - 1)}>Previous</button>
              Scopes {fmt(scopePage * PAGE + 1)}–{fmt(Math.min((scopePage + 1) * PAGE, scopes.count))} of {fmt(scopes.count)} (blocked first)
              <button className="tool-btn" disabled={(scopePage + 1) * PAGE >= scopes.count} onClick={() => setScopePage((p) => p + 1)}>Next</button>
            </div>
          )}

          {/* Rows */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
            {[["all", `All rows (${fmt(s.total_rows)})`], ["errors", `Not saved (${fmt(s.failed_rows)})`], ["warnings", `Warnings (${fmt(s.warning_rows)})`]].map(([k, l]) => (
              <button key={k} className={`tool-btn${filter === k ? " is-active" : ""}`} onClick={() => { setFilter(k); setPage(0); }}>{l}</button>
            ))}
            <button className="tool-btn" style={{ ...btn, marginLeft: "auto" }} onClick={() => downloadErrorReport(batch.batchId, batch.headers, file?.name ?? "upload.xlsx").catch((e) => setError(e.message))}>
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
          {rows.count > PAGE && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 12, color: C.t3 }}>
              <button className="tool-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
              Rows {fmt(page * PAGE + 1)}–{fmt(Math.min((page + 1) * PAGE, rows.count))} of {fmt(rows.count)}
              <button className="tool-btn" disabled={(page + 1) * PAGE >= rows.count} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          )}

          {/* Confirm */}
          <div style={{ marginTop: 16, padding: "14px 16px", border: `1px solid ${s.replace_scopes ? C.amber.bd : C.border}`, borderRadius: 10, background: s.replace_scopes ? C.amber.bg : C.card }}>
            {s.rows_to_save === 0 ? (
              <div style={{ fontSize: 13, color: C.red.tx }}>Nothing can be saved from this file. Fix the errors (download the error report) and upload it again.</div>
            ) : (
              <>
                {s.replace_scopes > 0 && (
                  <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: C.amber.tx, cursor: "pointer", marginBottom: 10 }}>
                    <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
                    <span>I understand this will replace <strong>{fmt(s.rows_to_replace)}</strong> existing row{s.rows_to_replace === 1 ? "" : "s"} in {fmt(s.replace_scopes)} scope{s.replace_scopes === 1 ? "" : "s"}
                      {" "}({replaceLabels.join(", ")}{s.replace_scopes > replaceLabels.length ? ", …" : ""}). The old rows are archived and can be restored by rolling back this upload.</span>
                  </label>
                )}
                <div style={{ fontSize: 12.5, color: C.t2, marginBottom: 10 }}>
                  {fmt(s.rows_to_save)} row{s.rows_to_save === 1 ? "" : "s"} will be saved{s.failed_rows ? `; ${fmt(s.failed_rows)} will not (errors or blocked scopes)` : ""}.
                </div>
              </>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="tool-btn is-active" style={btn} onClick={onCommit}
                disabled={phase === "committing" || s.rows_to_save === 0 || (s.replace_scopes > 0 && !confirmed)}>
                <Check size={13} /> {phase === "committing" ? "Saving…" : `Save ${fmt(s.rows_to_save)} row${s.rows_to_save === 1 ? "" : "s"}`}
              </button>
              <button className="tool-btn" style={btn} onClick={onDiscard} disabled={phase === "committing"}><X size={13} /> Discard</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
