// Logistics → Cost Analytics → Overview → "CN Received": credit notes received from couriers,
// transporters and 3PLs, against the invoice values uploaded with them. Totals only, read through
// cn_received_summary(); the uploads themselves live in Documents → Logistics Credit Notes.
// Built from the dashboard's own pieces (KPICard, Card, Dropdown, MonthRangePicker, the Cost
// Analytics pill tabs, BarGradient, the .hb-track progress bar) and theme tokens only.
import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Info } from "lucide-react";
import { C } from "../utils.js";
import { Card, KPICard, Dropdown, BarGradient } from "../components.jsx";
import { supabase } from "../supabase.js";
import MonthRangePicker from "../responsive/MonthRangePicker.jsx";
import {
  CATEGORIES, categoryLabel, reasonLabel, SHIPMENT_VALUE_REASONS, applyFilters, summarize, hasActivity,
  monthName, lastMonths, shareOf, buildExport,
} from "./cnReceived.js";
import { formatInr, formatInrFull, formatPct } from "./format.js";

const NO_INVOICE = "Shipment value, not invoice";
const GREEN = () => C.green.tx; // success green: every Received CN amount

// The calendar month in India, "YYYY-MM": its bar is still filling, so it gets a lighter tint.
const currentMonth = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 7);

// ── Shared pieces ────────────────────────────────────────────────────────────

// Compact amount; the exact en-IN value on hover.
function Amount({ v, green }) {
  const full = formatInrFull(v);
  return <span title={full === "—" ? undefined : full} style={green && full !== "—" ? { color: GREEN() } : undefined}>{formatInr(v)}</span>;
}

// Secondary button, as Cost Analytics' "Allocation".
const secondaryBtn = {
  display: "inline-flex", alignItems: "center", gap: 5, background: C.card, border: `1px solid ${C.border2}`, borderRadius: 8,
  padding: "5px 10px", cursor: "pointer", fontFamily: "var(--font)", fontSize: 11.5, fontWeight: 700, color: C.t2, whiteSpace: "nowrap",
};
const textBtn = { border: "none", background: "none", padding: 0, color: C.acc, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "var(--font)" };

function Skeleton({ h, w = "100%" }) {
  return <div className="cnr-skel" role="status" aria-label="Loading" style={{ height: h, width: w, borderRadius: C.r.lg, background: C.card }} />;
}

// Tables, in the shared DataTable's look: mint header, 1px dividers, right-aligned tabular numbers.
const th = { position: "sticky", top: 0, zIndex: 1, background: C.acl, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: C.t2, padding: "7px 10px", borderBottom: `1.5px solid ${C.border}`, whiteSpace: "nowrap" };
const td = { padding: "0 10px", height: 40, fontSize: 12, color: C.t1, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
const num = { textAlign: "right", fontVariantNumeric: "tabular-nums" };

// ── Chart ────────────────────────────────────────────────────────────────────

function ChartTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const line = (k, v, green) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, fontSize: 11, color: C.t2, marginTop: 3 }}>
      <span>{k}</span><span style={{ fontWeight: 700, color: green ? GREEN() : C.t1, fontVariantNumeric: "tabular-nums" }}>{v}</span>
    </div>
  );
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border2}`, borderRadius: 9, padding: "9px 11px", boxShadow: "0 6px 20px rgba(0,0,0,.12)", minWidth: 200 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: C.t1, marginBottom: 2 }}>{monthName(d.month)}{d.partial ? " · month in progress" : ""}</div>
      {line("Received CN", formatInrFull(d.received), true)}
      {line("Invoice value", formatInrFull(d.invoice))}
      {line("% of invoice", formatPct(d.share))}
    </div>
  );
}

function MonthChart({ months, onPick }) {
  const now = currentMonth();
  const data = months.map((m) => ({ month: m.month, label: monthName(m.month), received: m.total.received, invoice: m.total.invoice, share: shareOf(m.total), partial: m.month === now }));
  return (
    <Card title="Received CN by month" note="click a bar to see that month" style={{ height: "auto", marginBottom: 14 }}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 10, right: 14, left: 4, bottom: 4 }}>
          <BarGradient id="gCnReceived" />
          <CartesianGrid stroke={C.border} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.t3 }} axisLine={{ stroke: C.border2 }} tickLine={false} interval="preserveStartEnd" minTickGap={14} />
          <YAxis tick={{ fontSize: 11, fill: C.t3 }} axisLine={false} tickLine={false} width={70} tickFormatter={(v) => formatInr(v)} />
          <Tooltip content={<ChartTip />} cursor={{ fill: C.hov }} />
          <Bar dataKey="received" name="Received CN" radius={[4, 4, 0, 0]} maxBarSize={40} cursor="pointer" onClick={(d) => onPick(d?.payload?.month ?? d?.month)}>
            {data.map((d) => (
              <Cell key={d.month} fill="url(#gCnReceived)" fillOpacity={d.partial ? 0.4 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

// ── By reason ────────────────────────────────────────────────────────────────

function ReasonRow({ label, t, reason, bold, indent }) {
  const shipmentOnly = SHIPMENT_VALUE_REASONS.has(reason);
  return (
    <tr style={bold ? { fontWeight: 700 } : undefined}>
      <td style={{ ...td, paddingLeft: indent ? 24 : 10, color: bold ? C.t1 : C.t2 }}>{label}</td>
      <td style={{ ...td, ...num }}><Amount v={t.received} green /></td>
      <td style={{ ...td, ...num, color: C.t2 }}>
        {shipmentOnly ? (
          <span title={NO_INVOICE} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.t3 }}>— <Info size={12} aria-label={NO_INVOICE} /></span>
        ) : formatPct(shareOf(t))}
      </td>
    </tr>
  );
}

function ByReason({ view, grouped }) {
  const byReceived = (a, b) => b.total.received - a.total.received;
  const cats = view.categories.filter((c) => c.total.n > 0).sort(byReceived);
  return (
    <Card title="By reason" style={{ height: "auto" }}>
      <div style={{ overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={{ ...th, textAlign: "left" }}>Reason</th>
            <th style={{ ...th, textAlign: "right" }}>Received CN</th>
            <th style={{ ...th, textAlign: "right" }}>% of invoice</th>
          </tr></thead>
          <tbody>
            {cats.flatMap((c) => {
              const reasons = c.reasons.filter((x) => x.total.n > 0).sort(byReceived);
              // FTL/PTL and 3PL have a single reason, their own name: one row says it all.
              if (reasons.length === 1 && reasons[0].reason === c.key) return [<ReasonRow key={c.key} label={c.label} t={c.total} bold={grouped} />];
              return [
                ...(grouped ? [<ReasonRow key={c.key} label={c.label} t={c.total} bold />] : []),
                ...reasons.map((x) => <ReasonRow key={`${c.key}|${x.reason}`} label={reasonLabel(x.reason)} t={x.total} reason={x.reason} indent={grouped} />),
              ];
            })}
            <tr style={{ fontWeight: 800, background: C.acl }}>
              <td style={{ ...td, borderBottom: "none" }}>Total</td>
              <td style={{ ...td, ...num, borderBottom: "none" }}><Amount v={view.total.received} green /></td>
              <td style={{ ...td, ...num, borderBottom: "none" }}>{formatPct(shareOf(view.total))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Top partners ─────────────────────────────────────────────────────────────

function TopPartners({ view, showCategory }) {
  const [showZero, setShowZero] = useState(false);
  const withCn = view.partners.filter((p) => p.total.received > 0);
  const zero = view.partners.length - withCn.length;
  const rows = showZero ? view.partners : withCn;
  const total = view.total.received;
  return (
    <Card title="Top partners" note="share of received CN" style={{ height: "auto" }}>
      <div>
        {rows.map((p) => (
          <div key={`${p.category}|${p.partner}`} style={{ padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12.5, color: C.t1, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.partner}</span>
              {showCategory && (
                <span style={{ fontSize: 10, fontWeight: 600, color: C.t3, background: C.bg, borderRadius: 999, padding: "1px 7px", flexShrink: 0 }}>{categoryLabel(p.category)}</span>
              )}
              <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 700, ...num }}><Amount v={p.total.received} green /></span>
            </div>
            <div className="hb-track" style={{ marginTop: 6 }}>
              <div className="hb-fill" style={{ width: `${total > 0 ? (p.total.received / total) * 100 : 0}%`, background: C.acc }} />
            </div>
          </div>
        ))}
      </div>
      {zero > 0 && (
        <button onClick={() => setShowZero((v) => !v)} style={{ ...textBtn, marginTop: 10 }}>
          {showZero ? `Hide ${zero} partner${zero === 1 ? "" : "s"} with no CN` : `Show ${zero} partner${zero === 1 ? "" : "s"} with no CN`}
        </button>
      )}
    </Card>
  );
}

// ── By month ─────────────────────────────────────────────────────────────────

function ByMonth({ view }) {
  const [all, setAll] = useState(false);
  const rows = [...view.months].reverse().filter((m) => hasActivity(m.total)); // newest first
  const shown = all ? rows : rows.slice(0, 6);
  return (
    <Card title="By month" note="invoice month" style={{ height: "auto", marginTop: 14 }}>
      <div style={{ overflow: "auto", maxHeight: all ? 520 : undefined }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={{ ...th, textAlign: "left" }}>Month</th>
            <th style={{ ...th, textAlign: "right" }}>Invoice value</th>
            <th style={{ ...th, textAlign: "right" }}>Received CN</th>
            <th style={{ ...th, textAlign: "right" }}>% of invoice</th>
          </tr></thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.month}>
                <td style={td}>{monthName(m.month)}</td>
                <td style={{ ...td, ...num }}><Amount v={m.total.invoice} /></td>
                <td style={{ ...td, ...num }}><Amount v={m.total.received} green /></td>
                <td style={{ ...td, ...num }}>{formatPct(shareOf(m.total))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 6 && (
        <button onClick={() => setAll((v) => !v)} style={{ ...textBtn, marginTop: 10 }}>{all ? "Show the latest 6 months" : "Show all months"}</button>
      )}
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CnReceivedPage({ onBack, onOpenUploads }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  // months: null until the data arrives, then defaults to the last 12 months with data.
  const [filters, setFilters] = useState({ months: null, category: "", partner: "" });

  useEffect(() => {
    let live = true;
    supabase.rpc("cn_received_summary").then(({ data: d, error: e }) => {
      if (!live) return;
      if (e) setError(e.message); else setData(d);
    });
    return () => { live = false; };
  }, []);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const allMonths = useMemo(() => [...new Set(rows.map((r) => r.month))].sort(), [rows]);
  const defaultMonths = useMemo(() => lastMonths(allMonths, 12), [allMonths]);
  const months = filters.months ?? defaultMonths;
  const partners = useMemo(() => [...new Set(rows.filter((r) => !filters.category || r.category === filters.category).map((r) => r.partner))].sort(), [rows, filters.category]);
  const view = useMemo(() => summarize(applyFilters(rows, { ...filters, months })), [rows, filters, months]);
  const set = useCallback((k, v) => setFilters((f) => ({ ...f, [k]: v, ...(k === "category" ? { partner: "" } : {}) })), []);
  const reset = () => setFilters({ months: null, category: "", partner: "" });
  const changed = filters.category || filters.partner || filters.months !== null;
  const pickMonth = (m) => m && set("months", months.length === 1 && months[0] === m ? null : [m]);
  const lastUpload = useMemo(() => {
    const t = Object.values(data?.updated ?? {}).sort().pop();
    return t ? new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
  }, [data]);
  const loading = !data && !error;

  return (
    <div className="page-scroll lc-page" style={{ padding: "6px 24px 40px 14px" }}>
      <style>{`
        @keyframes cnrPulse { 0%, 100% { opacity: 1 } 50% { opacity: .5 } }
        .cnr-skel { animation: cnrPulse 1.2s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) { .cnr-skel { animation: none } }
        .cnr-two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: start }
        @media (max-width: 1199px) { .cnr-two { grid-template-columns: minmax(0, 1fr) } }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "8px 0 12px" }}>
        {onBack && <button onClick={onBack} style={secondaryBtn}>← Cost Analytics</button>}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: C.display, fontSize: 19, fontWeight: 600, color: C.t1, letterSpacing: "-.02em" }}>Credit notes received</div>
          <div style={{ fontSize: 11, color: C.t3, marginTop: 1 }}>Logistics credit notes · INR ex-GST{lastUpload ? ` · last upload ${lastUpload}` : ""}</div>
        </div>
        {onOpenUploads && <button onClick={onOpenUploads} style={secondaryBtn}>Uploads</button>}
        <button onClick={() => XLSX.writeFile(buildExport(view), `cn_received_${new Date().toISOString().slice(0, 10)}.xlsx`)} style={secondaryBtn} disabled={!data}>Export</button>
      </div>

      {error && <Card style={{ height: "auto" }}><div style={{ padding: 24, textAlign: "center", color: C.red.tx, fontSize: 13 }}>Could not load credit notes: {error}</div></Card>}

      {!error && (<>
        {/* Filter row: pills left, partner and months right; stays visible on scroll. */}
        <div style={{ position: "sticky", top: 0, zIndex: 5, background: C.bg, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "6px 0 12px" }}>
          <div style={{ display: "inline-flex", background: C.card, borderRadius: 9, padding: 3, gap: 2, boxShadow: C.sh1 }}>
            {[{ key: "", label: "All" }, ...CATEGORIES].map((c) => {
              const on = filters.category === c.key;
              return (
                <button key={c.key || "all"} onClick={() => set("category", c.key)} aria-pressed={on} disabled={loading}
                  style={{ border: "none", cursor: "pointer", fontFamily: "var(--font)", fontSize: 12, fontWeight: on ? 700 : 500, padding: "6px 14px", borderRadius: 7, background: on ? C.acc : "transparent", color: on ? C.onAcc : C.t1, transition: "all .15s" }}>
                  {c.label}
                </button>
              );
            })}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {changed && <button onClick={reset} style={textBtn}>Reset</button>}
            <Dropdown value={filters.partner} onChange={(v) => set("partner", v)}
              options={[{ id: "", label: "All partners" }, ...partners.map((p) => ({ id: p, label: p }))]}
              style={{ fontSize: 12, padding: "6px 10px", borderRadius: 8, minWidth: 150 }} />
            {allMonths.length > 0 && <MonthRangePicker months={allMonths} value={months.length === allMonths.length ? [] : months} onApply={(v) => set("months", v)} title="Invoice months" />}
          </div>
        </div>

        {loading ? (<>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginBottom: 14 }}>
            <Skeleton h={104} /><Skeleton h={104} /><Skeleton h={104} />
          </div>
          <Skeleton h={300} />
          <div className="cnr-two" style={{ marginTop: 14 }}><Skeleton h={320} /><Skeleton h={320} /></div>
          <div style={{ marginTop: 14 }}><Skeleton h={280} /></div>
        </>) : view.total.n === 0 ? (
          <Card style={{ height: "auto" }}>
            <div style={{ padding: "40px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.t1, marginBottom: 12 }}>No credit notes for this selection</div>
              <button onClick={reset} style={secondaryBtn}>Reset filters</button>
            </div>
          </Card>
        ) : (<>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginBottom: 14 }}>
            <KPICard label="Received CN" value={<Amount v={view.total.received} />} accent={GREEN()} sub={formatInrFull(view.total.received)}
              style={{ border: `1.5px solid ${C.acc}` }} />
            <KPICard label="Invoice value" value={<Amount v={view.total.invoice} />} sub={formatInrFull(view.total.invoice)} />
            <KPICard label="Received % of invoice" value={formatPct(shareOf(view.total))} sub="received ÷ invoice value" />
          </div>

          <MonthChart months={view.months} onPick={pickMonth} />

          <div className="cnr-two">
            <ByReason view={view} grouped={!filters.category} />
            <TopPartners view={view} showCategory={!filters.category} />
          </div>

          <ByMonth view={view} />
        </>)}
      </>)}
    </div>
  );
}
