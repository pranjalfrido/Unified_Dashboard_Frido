// Logistics → Cost Analytics → Overview → "CN Received": every credit note uploaded under
// Documents → Logistics Credit Notes, as totals by category and reason, by month and by
// partner. Read-only; the uploads themselves stay in Documents.
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { C, fmt } from "../utils.js";
import { Card, KPICard } from "../components.jsx";
import { supabase } from "../supabase.js";
import { CATEGORIES, applyFilters, summarize, pendingOf, recoveryOf, shareOfInvoice, monthName } from "./cnReceived.js";

const money = (v) => (v < 0 ? `−${fmt(-v)}` : fmt(v));
const exact = (v) => `₹${Math.round(v).toLocaleString("en-IN")}`;
const pct = (v) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const btn = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "6px 11px", fontFamily: "var(--font)", fontSize: 11.5, fontWeight: 700, color: C.t2, cursor: "pointer" };
const sel = { fontSize: 12, padding: "6px 9px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.card, color: C.t1, fontFamily: "var(--font)" };
const th = { position: "sticky", top: 0, background: C.ach, padding: "8px 10px", fontSize: 11, fontWeight: 700, color: C.t2, textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", textAlign: "right" };
const td = { padding: "7px 10px", borderBottom: `1px solid ${C.border}`, fontSize: 12.5, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const tdL = { ...td, textAlign: "left", fontVariantNumeric: "normal" };

const COLS = [
  ["Invoice value", (t) => (t.hasInvoice ? money(t.invoice) : "—")],
  ["Expected CN", (t) => money(t.expected)],
  ["Received CN", (t) => money(t.received)],
  ["Pending CN", (t) => money(pendingOf(t))],
  ["Recovery %", (t) => pct(recoveryOf(t))],
  ["Received % of invoice", (t) => pct(shareOfInvoice(t))],
];

function Table({ head, rows, maxHeight }) {
  return (
    <div style={{ overflow: "auto", maxHeight, border: `1px solid ${C.border}`, borderRadius: 10 }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
        <thead><tr>{head.map((h, i) => <th key={h} style={i === 0 || (head[0] === "Category" && i === 1) ? { ...th, textAlign: "left" } : th}>{h}</th>)}</tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

export default function CnReceivedPage({ onBack, onOpenUploads }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ from: "", to: "", category: "", partner: "" });

  useEffect(() => {
    let live = true;
    supabase.rpc("cn_received_summary").then(({ data: d, error: e }) => {
      if (!live) return;
      if (e) setError(e.message); else setData(d);
    });
    return () => { live = false; };
  }, []);

  const months = useMemo(() => [...new Set((data?.rows ?? []).map((r) => r.month))].sort(), [data]);
  const partners = useMemo(() => [...new Set((data?.rows ?? []).filter((r) => !filters.category || r.category === filters.category).map((r) => r.partner))].sort(), [data, filters.category]);
  const view = useMemo(() => (data ? summarize(applyFilters(data.rows, filters)) : null), [data, filters]);
  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v, ...(k === "category" ? { partner: "" } : {}) }));
  const lastUpload = useMemo(() => {
    const t = Object.values(data?.updated ?? {}).sort().pop();
    return t ? new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
  }, [data]);

  const exportXlsx = () => {
    const wb = XLSX.utils.book_new();
    const head = (first) => [...first, "Invoice value", "Expected CN", "Received CN", "Pending CN", "Recovery %", "Received % of invoice"];
    const nums = (t) => [t.hasInvoice ? Math.round(t.invoice * 100) / 100 : "", Math.round(t.expected * 100) / 100, Math.round(t.received * 100) / 100,
      Math.round(pendingOf(t) * 100) / 100, recoveryOf(t) == null ? "" : Math.round(recoveryOf(t) * 1000) / 10, shareOfInvoice(t) == null ? "" : Math.round(shareOfInvoice(t) * 1000) / 10];
    const catRows = view.categories.flatMap((c) => [[c.label, "", ...nums(c.total)], ...c.reasons.map((x) => ["", x.reason, ...nums(x.total)])]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head(["Category", "Reason"]), ...catRows, ["Total", "", ...nums(view.total)]]), "By category");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head(["Month"]), ...view.months.map((m) => [monthName(m.month), ...nums(m.total)])]), "By month");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head(["Category", "Partner"]), ...view.partners.map((p) => [p.category, p.partner, ...nums(p.total)])]), "By partner");
    XLSX.writeFile(wb, `cn_received_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const t = view?.total;
  return (
    <div className="page-scroll lc-page" style={{ padding: "14px 18px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={onBack} style={btn}>← Cost Analytics</button>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontFamily: C.display, fontSize: 19, fontWeight: 600, color: C.t1, letterSpacing: "-.02em" }}>Credit Notes Received</div>
          <div style={{ fontSize: 11, color: C.t3, marginTop: 1 }}>
            From Documents → Logistics Credit Notes · INR ex-GST{lastUpload ? ` · last upload ${lastUpload}` : ""}
          </div>
        </div>
        {onOpenUploads && <button onClick={onOpenUploads} style={btn}>Open uploads</button>}
        {view && <button onClick={exportXlsx} style={btn}>Export Excel</button>}
      </div>

      {error && <div style={{ padding: 30, textAlign: "center", color: C.red.tx, fontSize: 13 }}>Could not load credit notes: {error}</div>}
      {!data && !error && <div style={{ padding: 30, textAlign: "center", color: C.t3, fontSize: 13 }}>Loading credit notes…</div>}

      {view && (<>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "inline-flex", background: C.bg, borderRadius: 9, padding: 3, gap: 2 }}>
            {[{ key: "", label: "All" }, ...CATEGORIES].map((c) => {
              const on = filters.category === c.key;
              return (
                <button key={c.key || "all"} onClick={() => set("category", c.key)}
                  style={{ border: "none", cursor: "pointer", fontFamily: "var(--font)", fontSize: 12, fontWeight: on ? 700 : 500, padding: "6px 12px", borderRadius: 7, background: on ? C.acc : "transparent", color: on ? C.onAcc : C.t1 }}>
                  {c.label}
                </button>
              );
            })}
          </div>
          <select value={filters.partner} onChange={(e) => set("partner", e.target.value)} style={sel} aria-label="Partner">
            <option value="">All partners</option>
            {partners.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filters.from} onChange={(e) => set("from", e.target.value)} style={sel} aria-label="From month">
            <option value="">From: first month</option>
            {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
          </select>
          <select value={filters.to} onChange={(e) => set("to", e.target.value)} style={sel} aria-label="To month">
            <option value="">To: latest month</option>
            {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
          </select>
          {(filters.from || filters.to || filters.category || filters.partner) && (
            <button onClick={() => setFilters({ from: "", to: "", category: "", partner: "" })} style={btn}>Clear</button>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
          <KPICard label="Expected CN" value={money(t.expected)} sub={exact(t.expected)} />
          <KPICard label="Received CN" value={money(t.received)} sub={exact(t.received)} accent={C.green.tx} />
          <KPICard label="Pending CN" value={money(pendingOf(t))} sub={exact(pendingOf(t))} accent={pendingOf(t) > 0 ? C.amber.tx : undefined} />
          <KPICard label="Recovery %" value={pct(recoveryOf(t))} sub="received ÷ expected" />
          <KPICard label="Invoice value" value={t.hasInvoice ? money(t.invoice) : "—"} sub={`received is ${pct(shareOfInvoice(t))} of it`} />
        </div>

        {t.n === 0 ? (
          <Card><div style={{ padding: 24, textAlign: "center", color: C.t3, fontSize: 13 }}>No credit notes match these filters.</div></Card>
        ) : (<>
          <Card title="By category and reason" note="Invoice value is the one uploaded with the CNs; Lost/Damage rows carry a shipment value, not an invoice" style={{ marginBottom: 14, height: "auto" }}>
            <Table head={["Category", "Reason", ...COLS.map((c) => c[0])]} rows={<>
              {view.categories.filter((c) => c.total.n > 0).map((c) => [
                <tr key={c.key} style={{ fontWeight: 700, color: C.t1 }}>
                  <td style={tdL}>{c.label}</td><td style={tdL} />
                  {COLS.map(([h, f]) => <td key={h} style={td}>{f(c.total)}</td>)}
                </tr>,
                ...c.reasons.filter((x) => x.total.n > 0).map((x) => (
                  <tr key={`${c.key}|${x.reason}`} style={{ color: C.t2 }}>
                    <td style={tdL} /><td style={tdL}>{x.reason}</td>
                    {COLS.map(([h, f]) => <td key={h} style={td}>{f(x.total)}</td>)}
                  </tr>
                )),
              ])}
              <tr style={{ fontWeight: 800, color: C.t1 }}>
                <td style={{ ...tdL, borderBottom: "none" }}>Total</td><td style={{ ...tdL, borderBottom: "none" }} />
                {COLS.map(([h, f]) => <td key={h} style={{ ...td, borderBottom: "none" }}>{f(t)}</td>)}
              </tr>
            </>} />
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))", gap: 14 }}>
            <Card title="By month" note="invoice month, newest first" style={{ height: "auto" }}>
              <Table maxHeight="60vh" head={["Month", ...COLS.slice(0, 5).map((c) => c[0])]} rows={view.months.map((m) => (
                <tr key={m.month}>
                  <td style={tdL}>{monthName(m.month)}</td>
                  {COLS.slice(0, 5).map(([h, f]) => <td key={h} style={td}>{f(m.total)}</td>)}
                </tr>
              ))} />
            </Card>
            <Card title="By partner" note="largest pending first" style={{ height: "auto" }}>
              <Table maxHeight="60vh" head={["Category", "Partner", "Expected CN", "Received CN", "Pending CN", "Recovery %"]} rows={view.partners.map((p) => (
                <tr key={`${p.category}|${p.partner}`}>
                  <td style={{ ...tdL, color: C.t3 }}>{CATEGORIES.find((c) => c.key === p.category)?.label ?? p.category}</td>
                  <td style={tdL}>{p.partner}</td>
                  <td style={td}>{money(p.total.expected)}</td>
                  <td style={td}>{money(p.total.received)}</td>
                  <td style={td}>{money(pendingOf(p.total))}</td>
                  <td style={td}>{pct(recoveryOf(p.total))}</td>
                </tr>
              ))} />
            </Card>
          </div>
        </>)}
      </>)}
    </div>
  );
}
