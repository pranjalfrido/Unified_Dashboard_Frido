// Documents → Logistics Credit Notes. Section navigation for the four CN uploaders, batch
// history and masters. Uploads whose cn_upload_types row exists are listed in UPLOADS; the
// rest show where they land in the build.
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { C } from "../utils.js";
import { canManage } from "./cnApi.js";
import MastersPanel from "./MastersPanel.jsx";
import UploadPanel from "./UploadPanel.jsx";

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

const UPLOADS = ["weight_dispute", "lost_damage", "ftl_ptl", "3pl"];

const COMING = {
  batches: "Phase 4",
};

export default function CnModulePage({ onBack }) {
  const [section, setSection] = useState("b2c");
  const [view, setView] = useState("weight_dispute");
  const [manage, setManage] = useState(false);
  const [accessError, setAccessError] = useState(null);

  // A failed check is reported, not read as "no access": a dropped connection must not
  // silently turn a manager's screens view-only.
  useEffect(() => {
    let live = true;
    canManage()
      .then((m) => { if (live) { setManage(m); setAccessError(null); } })
      .catch((e) => { if (live) setAccessError(e.message); });
    return () => { live = false; };
  }, []);

  const sec = SECTIONS.find((s) => s.key === section);
  const pick = (s) => { setSection(s.key); setView(s.views[0].key); };

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

      {sec.views.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {sec.views.map((v) => (
            <button key={v.key} onClick={() => setView(v.key)} className={`tool-btn${v.key === view ? " is-active" : ""}`} aria-pressed={v.key === view}>
              {v.label}
            </button>
          ))}
        </div>
      )}

      {accessError && (
        <div style={{ fontSize: 12.5, padding: "8px 12px", borderRadius: 8, marginBottom: 12, background: C.amber.bg, border: `1px solid ${C.amber.bd}`, color: C.amber.tx }}>
          Couldn't check whether you can manage credit notes ({accessError}), so editing is off for now. Reload the page to try again.
        </div>
      )}

      {view === "masters" ? (
        <MastersPanel manage={manage} />
      ) : UPLOADS.includes(view) ? (
        <UploadPanel key={view} type={view} />
      ) : (
        <div style={{ border: `1px dashed ${C.border2}`, borderRadius: 10, padding: "36px 20px", textAlign: "center", color: C.t3, fontSize: 13, background: C.card }}>
          {sec.views.find((v) => v.key === view)?.label} — coming in {COMING[view]}.
        </div>
      )}
    </div>
  );
}
