// Documents → Logistics Credit Notes. Each upload type has an Upload view and a Saved data
// view; Upload history lists every batch; Masters holds the names uploads are matched to.
// Upload types come from cn_upload_types (scripts/sql/cn/003–006).
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { C } from "../utils.js";
import { supabase } from "../supabase.js";
import { canManage } from "./cnApi.js";
import MastersPanel from "./MastersPanel.jsx";
import UploadPanel from "./UploadPanel.jsx";
import DataPanel from "./DataPanel.jsx";
import BatchesPanel from "./BatchesPanel.jsx";

const SECTIONS = [
  { key: "b2c", label: "B2C Couriers", views: [
    { key: "weight_dispute", label: "Weight Dispute CN" },
    { key: "lost_damage", label: "Lost/Damage/SLA Breach CN" },
  ] },
  { key: "ftl_ptl", label: "FTL/PTL", views: [{ key: "ftl_ptl", label: "FTL/PTL CN" }] },
  { key: "3pl", label: "3PL", views: [{ key: "3pl", label: "3PL CN" }] },
  { key: "batches", label: "Upload history", views: [{ key: "batches", label: "Upload history" }] },
  { key: "masters", label: "Masters", views: [{ key: "masters", label: "Masters" }] },
];

export default function CnModulePage({ onBack }) {
  const [section, setSection] = useState("b2c");
  const [view, setView] = useState("weight_dispute");
  const [mode, setMode] = useState("upload"); // upload | data, for the upload views
  const [manage, setManage] = useState(false);
  const [accessError, setAccessError] = useState(null);
  const [types, setTypes] = useState(null);
  const [typesError, setTypesError] = useState(null);

  // A failed check is reported, not read as "no access": a dropped connection must not
  // silently turn a manager's screens view-only.
  useEffect(() => {
    let live = true;
    canManage()
      .then((m) => { if (live) { setManage(m); setAccessError(null); } })
      .catch((e) => { if (live) setAccessError(e.message); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    supabase.from("cn_upload_types").select("*").order("sort").then(({ data, error }) => {
      if (!live) return;
      if (error) setTypesError(error.message);
      else setTypes(Object.fromEntries((data ?? []).map((t) => [t.code, t])));
    });
    return () => { live = false; };
  }, []);

  const sec = SECTIONS.find((s) => s.key === section);
  const pick = (s) => { setSection(s.key); setView(s.views[0].key); };
  const cfg = types?.[view];

  return (
    <div style={{ padding: "24px 32px 48px", minHeight: "var(--app-h)", background: C.bg, color: C.t1 }}>
      {onBack && (
        <button onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.card, border: `1.5px solid ${C.acc}`, color: C.acc, fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: "6px 12px", borderRadius: 20, marginBottom: 10 }}>
          <ArrowLeft size={14} /> Back to Documents
        </button>
      )}
      <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 4 }}>Uploads · INR ex-GST</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: C.t1, letterSpacing: -0.5, marginBottom: 16 }}>Logistics Credit Notes</div>

      <div style={{ display: "flex", alignItems: "center", gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 12, flexWrap: "wrap" }}>
        {SECTIONS.map((s) => {
          const on = s.key === section;
          return (
            <button key={s.key} onClick={() => pick(s)}
              style={{ background: "transparent", border: "none", borderBottom: `2px solid ${on ? C.acc : "transparent"}`, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: on ? C.acc : C.t2, cursor: "pointer", fontFamily: "inherit" }}>
              {s.label}
            </button>
          );
        })}
      </div>

      {(sec.views.length > 1 || types?.[sec.views[0].key]) && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
          {sec.views.length > 1 && sec.views.map((v) => (
            <button key={v.key} onClick={() => setView(v.key)} className={`tool-btn${v.key === view ? " is-active" : ""}`} aria-pressed={v.key === view}>
              {v.label}
            </button>
          ))}
          {cfg && (
            <div style={{ marginLeft: sec.views.length > 1 ? "auto" : 0, display: "flex", gap: 6 }}>
              {[["upload", "Upload"], ["data", "Saved data"]].map(([k, l]) => (
                <button key={k} onClick={() => setMode(k)} className={`tool-btn${mode === k ? " is-active" : ""}`} aria-pressed={mode === k}>{l}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {accessError && (
        <div style={{ fontSize: 12.5, padding: "8px 12px", borderRadius: 8, marginBottom: 12, background: C.amber.bg, border: `1px solid ${C.amber.bd}`, color: C.amber.tx }}>
          Couldn't check whether you can manage credit notes ({accessError}), so editing is off for now. Reload the page to try again.
        </div>
      )}
      {typesError && <div style={{ fontSize: 12.5, color: C.red.tx, marginBottom: 12 }}>Couldn't load the upload types: {typesError}</div>}

      {view === "masters" ? (
        <MastersPanel manage={manage} />
      ) : !types ? (
        !typesError && <div style={{ fontSize: 13, color: C.t3 }}>Loading…</div>
      ) : view === "batches" ? (
        <BatchesPanel types={types} manage={manage} />
      ) : cfg ? (
        mode === "data" ? <DataPanel key={view} cfg={cfg} manage={manage} /> : <UploadPanel key={view} cfg={cfg} />
      ) : (
        <div style={{ fontSize: 13, color: C.t3 }}>This upload type isn't set up in the database yet.</div>
      )}
    </div>
  );
}
