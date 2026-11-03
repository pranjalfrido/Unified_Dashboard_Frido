// Masters for credit-note uploads: couriers and their accounts, transporters, 3PL partners
// and their facilities. Everyone with Documents can see them; admins and
// documents:cn-manage can add, edit, deactivate or delete.
import { useEffect, useMemo, useState, useCallback } from "react";
import { Plus, Save, Trash2, RefreshCw } from "lucide-react";
import { C } from "../utils.js";
import { MASTERS, listMaster, saveMaster, deleteMaster } from "./cnApi.js";

const uid = () => Math.random().toString(36).slice(2, 10);
const toEdit = (m, r) => {
  const out = { ...r, _uid: uid(), _dirty: false };
  for (const c of m.columns) if (c.type === "list") out[c.key] = (r[c.key] ?? []).join(", ");
  return out;
};

export default function MastersPanel({ manage }) {
  const [which, setWhich] = useState("couriers");
  const [data, setData] = useState({}); // master key -> rows
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const m = MASTERS[which];

  const load = useCallback(async (keys) => {
    try {
      const got = await Promise.all(keys.map((k) => listMaster(MASTERS[k]).then((rows) => [k, rows.map((r) => toEdit(MASTERS[k], r))])));
      setData((d) => ({ ...d, ...Object.fromEntries(got) }));
    } catch (e) { setStatus({ kind: "error", text: e.message }); }
  }, []);

  // The active master plus whatever its picker columns point at (accounts need couriers).
  useEffect(() => {
    const need = [which, ...m.columns.filter((c) => c.ref).map((c) => c.ref)].filter((k) => !data[k]);
    // A fetch: state is set when it resolves, not synchronously in the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (need.length) load(need);
  }, [which, m, data, load]);

  const rows = data[which] ?? null;
  const refNames = useMemo(() => {
    const out = {};
    for (const c of m.columns.filter((c) => c.ref)) out[c.ref] = new Map((data[c.ref] ?? []).map((r) => [String(r.id), r.name]));
    return out;
  }, [m, data]);

  const flash = (kind, text) => { setStatus({ kind, text }); if (kind !== "error") setTimeout(() => setStatus(null), 3500); };
  const setRows = (fn) => setData((d) => ({ ...d, [which]: fn(d[which] ?? []) }));
  const setCell = (id, key, v) => setRows((rs) => rs.map((r) => (r._uid === id ? { ...r, [key]: v, _dirty: true } : r)));

  const add = () => setRows((rs) => [{ _uid: uid(), _dirty: true, is_active: true, ...Object.fromEntries(m.columns.map((c) => [c.key, ""])) }, ...rs]);

  const save = async (r) => {
    setBusy(true);
    try {
      const saved = await saveMaster(m, r);
      setRows((rs) => rs.map((x) => (x._uid === r._uid ? toEdit(m, saved) : x)));
      flash("ok", `Saved ${saved.name}.`);
    } catch (e) { flash("error", e.message); }
    finally { setBusy(false); }
  };

  const remove = async (r) => {
    if (!r.id) { setRows((rs) => rs.filter((x) => x._uid !== r._uid)); return; }
    if (!confirm(`Delete ${r.name}? If credit-note rows use it, deactivate it instead.`)) return;
    setBusy(true);
    try {
      await deleteMaster(m, r.id);
      setRows((rs) => rs.filter((x) => x._uid !== r._uid));
      flash("ok", `Deleted ${r.name}.`);
    } catch (e) { flash("error", e.message); }
    finally { setBusy(false); }
  };

  const th = { position: "sticky", top: 0, background: C.ach, textAlign: "left", padding: "9px 12px", fontSize: 11, fontWeight: 700, color: C.t2, textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
  const cellInput = { width: "100%", border: "none", background: "transparent", padding: "9px 12px", fontSize: 12.5, color: C.t1, fontFamily: "inherit", outline: "none" };
  const iconBtn = { background: "transparent", border: "none", cursor: "pointer", padding: 5, borderRadius: 5, display: "inline-flex" };

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {Object.values(MASTERS).map((x) => (
          <button key={x.key} onClick={() => setWhich(x.key)} className={`tool-btn${x.key === which ? " is-active" : ""}`} aria-pressed={x.key === which}>
            {x.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        {manage && <button className="tool-btn" onClick={add} disabled={busy}><Plus size={13} /> Add {m.label.replace(/s$/, "").toLowerCase()}</button>}
        <button className="tool-btn" onClick={() => load([which, ...m.columns.filter((c) => c.ref).map((c) => c.ref)])} disabled={busy}><RefreshCw size={13} /> Reload</button>
        <span style={{ fontSize: 11.5, color: C.t3 }}>
          {rows ? `${rows.filter((r) => r.id).length} ${m.label.toLowerCase()}` : "Loading…"}
          {!manage && " · view only — managing masters needs Documents → Credit notes: manage"}
        </span>
      </div>

      {status && (
        <div style={{ fontSize: 12.5, padding: "8px 12px", borderRadius: 8, marginBottom: 10, border: `1px solid ${C.border}`, background: C.card, color: status.kind === "error" ? C.red.tx : C.green.tx }}>
          {status.text}
        </div>
      )}

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "auto", background: C.card, maxHeight: "62vh" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", fontSize: 12.5 }}>
          <thead>
            <tr>
              {m.columns.map((c) => (
                <th key={c.key} style={{ ...th, minWidth: c.w }} title={c.hint}>{c.label}{c.req && <span style={{ color: C.red.tx }}> *</span>}</th>
              ))}
              <th style={{ ...th, width: 90 }}>Active</th>
              {manage && <th style={{ ...th, width: 70 }} />}
            </tr>
          </thead>
          <tbody>
            {rows?.length === 0 && (
              <tr><td colSpan={m.columns.length + 2} style={{ padding: "28px 16px", textAlign: "center", color: C.t3 }}>
                No {m.label.toLowerCase()} yet.{manage ? " Add one, or run the master seed." : ""}
              </td></tr>
            )}
            {(rows ?? []).map((r) => (
              <tr key={r._uid} style={{ opacity: r.is_active === false ? 0.55 : 1 }}>
                {m.columns.map((c) => (
                  <td key={c.key} style={{ padding: 0, borderBottom: `1px solid ${C.border}` }}>
                    {c.ref ? (
                      manage ? (
                        <select value={r[c.key] ?? ""} onChange={(e) => setCell(r._uid, c.key, e.target.value)} style={{ ...cellInput, cursor: "pointer" }}>
                          <option value="">Choose…</option>
                          {(data[c.ref] ?? []).filter((o) => o.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      ) : <div style={cellInput}>{refNames[c.ref]?.get(String(r[c.key])) ?? ""}</div>
                    ) : c.type === "pairs" ? (
                      <div style={{ ...cellInput, color: C.t2 }}>{(r[c.key] ?? []).map((p) => `${p.courier} / ${p.account_type}`).join(", ")}</div>
                    ) : manage && !c.readOnly ? (
                      <input value={r[c.key] ?? ""} onChange={(e) => setCell(r._uid, c.key, e.target.value)} placeholder={c.label} style={cellInput} />
                    ) : <div style={cellInput}>{r[c.key]}</div>}
                  </td>
                ))}
                <td style={{ padding: "0 12px", borderBottom: `1px solid ${C.border}` }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.t2, cursor: manage ? "pointer" : "default" }}>
                    <input type="checkbox" checked={r.is_active !== false} disabled={!manage} onChange={(e) => setCell(r._uid, "is_active", e.target.checked)} />
                    {r.is_active === false ? "No" : "Yes"}
                  </label>
                </td>
                {manage && (
                  <td style={{ padding: "0 6px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>
                    <button onClick={() => save(r)} disabled={busy || !r._dirty} title="Save" style={{ ...iconBtn, color: r._dirty ? C.acc : C.t3 }}><Save size={14} /></button>
                    <button onClick={() => remove(r)} disabled={busy} title="Delete" style={{ ...iconBtn, color: C.red.tx }}><Trash2 size={14} /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11.5, color: C.t3, marginTop: 10, lineHeight: 1.6 }}>
        Uploads match names ignoring case and extra spaces; a name not listed here makes that row an error.
        Bill-ledger names link an entry to the bill ledgers for the invoice-value check.
      </p>
    </div>
  );
}
