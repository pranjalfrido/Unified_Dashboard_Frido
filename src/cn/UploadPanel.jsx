// Upload → preview → confirm, for any CN upload type. Everything about a type (columns,
// scope, checks) comes from its cn_upload_types row; this screen only drives the flow.
import { useRef, useState, useCallback } from "react";
import { FileSpreadsheet, Upload, Check, X } from "lucide-react";
import { C } from "../utils.js";
import { downloadTemplate, parseFile, uploadAndValidate, revalidate, commitBatch, discardBatch, fetchBatch, headerFor } from "./cnEngine.js";
import BatchReview, { Stat } from "./BatchReview.jsx";
import { fmt, btn } from "./ui.js";

export default function UploadPanel({ cfg }) {
  const [phase, setPhase] = useState("idle"); // idle | working | preview | committing | queued | done
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [file, setFile] = useState(null);
  const [batch, setBatch] = useState(null); // { batchId, headers, ignored, headerMap, summary }
  const [version, setVersion] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState(null);
  const input = useRef(null);
  const onError = useCallback((m) => setError(m), []);

  const reset = () => {
    setPhase("idle"); setBatch(null); setResult(null); setError(null); setProgress(null);
    setConfirmed(false); setFile(null);
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
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
    try {
      const summary = await revalidate(batch.batchId);
      setBatch((b) => ({ ...b, summary }));
      setVersion((v) => v + 1);
      setConfirmed(false);
    } catch { /* keep the old preview */ }
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

  const s = batch?.summary;
  const replaceLabels = s?.replace_labels ?? [];

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

          <BatchReview cfg={cfg} version={version} onError={onError} batch={{
            batchId: batch.batchId, headers: batch.headers, headerMap: batch.headerMap, fileName: file?.name,
            totalRows: s.total_rows, failedRows: s.failed_rows, warningRows: s.warning_rows, inlineScopes: s.scopes,
          }} />

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
