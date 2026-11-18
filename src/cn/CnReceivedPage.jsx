// Logistics → Cost Analytics → Overview → "CN Received": one summary page of the credit notes
// received across all three formats (B2C couriers, FTL/PTL, 3PL), against the invoice values
// uploaded with them. Totals only, read through cn_received_summary(); the uploads themselves live
// in Documents → Logistics Credit Notes. Built from the dashboard's own pieces (KPICard, Card,
// MonthRangePicker, chartLegendProps, the Cost Analytics tooltip) and theme tokens only.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { ChevronRight, Info } from "lucide-react";
import { C } from "../utils.js";
import { Card, KPICard, chartLegendProps } from "../components.jsx";
import { supabase } from "../supabase.js";
import MonthRangePicker from "../responsive/MonthRangePicker.jsx";
import { monthsLabel } from "../responsive/monthRange.js";
import { useBreakpoint } from "../responsive/useBreakpoint.js";
import CnReceivedMobile from "./CnReceivedMobile.jsx";
import {
  categoryLabel, reasonLabel, SHIPMENT_VALUE_REASONS, inMonths, summarize, hasActivity,
  monthName, lastMonths, shareOf, buildExport, topPartner, topReason, categoryReasons, currentMonth,
} from "./cnReceived.js";
import { formatInr, formatInrFull, formatPct } from "./format.js";

const NO_INVOICE = "Shipment value, not invoice";
const GREEN = () => C.green.tx; // success green: every Received CN amount

// One fixed colour per format, in every chart, legend and table dot. The same mapping as Cost
// Analytics' overview trend (OV_SERIES there): B2C lightest, FTL/PTL the accent, 3PL deepest.
// `id` is the chart data key ("FTL/PTL" is not a safe one).
const FORMATS = [
  { key: "B2C", id: "b2c", get color() { return "#4FA88E"; } },
  { key: "FTL/PTL", id: "ftl", get color() { return C.acc; } },
  { key: "3PL", id: "tpl", get color() { return C.acd; } },
].map((f) => ({ ...f, label: categoryLabel(f.key) }));
const LEGEND_ORDER = [...FORMATS.map((f) => f.id), "pct"];
const formatOf = (key) => FORMATS.find((f) => f.key === key);
// The "% of invoice" line: the palette's first non-accent series hue, so it never reads as a format.
const LINE = () => C.series[1];

// ── Shared pieces ────────────────────────────────────────────────────────────

// Compact amount; the exact en-IN value on hover.
function Amount({ v, green }) {
  const full = formatInrFull(v);
  return <span title={full === "—" ? undefined : full} style={green && full !== "—" ? { color: GREEN() } : undefined}>{formatInr(v)}</span>;
}

const Dot = ({ color, size = 8 }) => <span aria-hidden style={{ display: "inline-block", width: size, height: size, borderRadius: 999, background: color, flexShrink: 0 }} />;

// Secondary button, as Cost Analytics' "CN Received".
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
const Th = ({ children, right }) => <th style={{ ...th, textAlign: right ? "right" : "left" }}>{children}</th>;

// Chart chrome and tooltip, as Cost Analytics.
const axisTick = () => ({ fontSize: 11, fill: C.t3 });
const tipBox = () => ({ background: C.card, border: `1px solid ${C.border2}`, borderRadius: 9, padding: "9px 11px", boxShadow: "0 6px 20px rgba(0,0,0,.12)", minWidth: 200 });
function TipLine({ label, value, color, green, bold, rule }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 11, color: C.t2, marginTop: 3, ...(rule ? { borderTop: `1px solid ${C.border2}`, paddingTop: 4, marginTop: 5 } : {}) }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: bold ? 700 : 400, color: bold ? C.t1 : C.t2 }}>{color && <Dot color={color} />}{label}</span>
      <span style={{ fontWeight: 700, color: green ? GREEN() : C.t1, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

// ── KPI cards ────────────────────────────────────────────────────────────────

// Received CN (big, green), then "of ₹X invoice" and "Y% of invoice". A format with nothing in the
// range reads ₹0 in muted ink, "No invoices yet" and "—".
function FormatKpi({ label, color, t, highlight }) {
  const empty = t.n === 0 || (!(t.invoice > 0) && t.received === 0);
  return (
    <KPICard
      label={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{color && <Dot color={color} />}{label}</span>}
      value={empty ? "₹0" : <Amount v={t.received} />}
      accent={empty ? C.t3 : GREEN()}
      sub={
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span>{empty ? "No invoices yet" : t.invoice > 0 ? <>of <Amount v={t.invoice} /> invoice</> : "no invoice value"}</span>
          <span>{empty || shareOf(t) == null ? "—" : `${formatPct(shareOf(t))} of invoice`}</span>
        </span>
      }
      style={highlight ? { border: `1.5px solid ${C.acc}` } : undefined} />
  );
}

// ── Monthly trend ────────────────────────────────────────────────────────────

function TrendTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={tipBox()}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: C.t1, marginBottom: 4 }}>{monthName(d.month)}{d.partial ? " · month in progress" : ""}</div>
      {FORMATS.map((f) => <TipLine key={f.id} label={f.label} value={d.has[f.id] ? formatInrFull(d[f.id]) : "—"} color={f.color} />)}
      <TipLine label="Total received" value={formatInrFull(d.received)} green bold rule />
      <TipLine label="Invoice value" value={formatInrFull(d.invoice)} />
      <TipLine label="% of invoice" value={formatPct(d.share)} color={LINE()} />
    </div>
  );
}

function TrendChart({ months }) {
  const now = currentMonth();
  const data = months.map((m) => {
    const d = { month: m.month, label: monthName(m.month), received: m.total.received, invoice: m.total.invoice, share: shareOf(m.total), partial: m.month === now };
    d.has = {};
    for (const f of FORMATS) { d[f.id] = m.byCat[f.key].received; d.has[f.id] = m.byCat[f.key].n > 0; }
    d.pct = d.share == null ? null : d.share * 100;
    d.top = [...FORMATS].reverse().find((f) => d[f.id] > 0)?.id; // the segment that gets the rounded top
    return d;
  });
  return (
    <Card title="Received CN by month" note="stacked by format · % of invoice on the right axis" style={{ height: "auto", marginBottom: 14 }}>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 10, right: 6, left: 4, bottom: 4 }}>
          <CartesianGrid stroke={C.border} vertical={false} />
          <XAxis dataKey="label" tick={axisTick()} axisLine={{ stroke: C.border2 }} tickLine={false} interval="preserveStartEnd" minTickGap={14} />
          <YAxis yAxisId="amt" tick={axisTick()} axisLine={false} tickLine={false} width={70} tickFormatter={(v) => formatInr(v)} />
          <YAxis yAxisId="pct" orientation="right" tick={axisTick()} axisLine={false} tickLine={false} width={46} tickFormatter={(v) => `${Number(v.toFixed(2))}%`} />
          <Tooltip content={<TrendTip />} cursor={{ fill: C.hov }} />
          {/* Legend in the formats' fixed order, then the line (Recharts sorts by name otherwise). */}
          <Legend {...chartLegendProps({ fontSize: 11 })} itemSorter={(item) => LEGEND_ORDER.indexOf(item.dataKey)} />
          {FORMATS.map((f) => (
            // A 1px card-coloured stroke keeps a gap between stacked segments, so formats never
            // rely on colour alone.
            <Bar key={f.id} yAxisId="amt" dataKey={f.id} name={f.label} stackId="cn" fill={f.color} stroke={C.card} strokeWidth={1} maxBarSize={40} isAnimationActive={false}>
              {data.map((d) => <Cell key={d.month} fillOpacity={d.partial ? 0.45 : 1} radius={d.top === f.id ? [4, 4, 0, 0] : 0} />)}
            </Bar>
          ))}
          <Line yAxisId="pct" type="monotone" dataKey="pct" name="% of invoice" stroke={LINE()} strokeWidth={2}
            dot={{ r: 3.5, fill: LINE(), stroke: C.card, strokeWidth: 1.5 }} activeDot={{ r: 5, fill: LINE(), stroke: C.card, strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
}

// ── Format-wise summary ──────────────────────────────────────────────────────

function FormatTable({ view }) {
  const [open, setOpen] = useState(() => new Set());
  const toggle = (k) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <Card title="By format" note="click a format to see its partners" style={{ height: "auto", marginBottom: 14 }}>
      <div style={{ overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <Th>Format</Th><Th right>Invoice value</Th><Th right>Received CN</Th><Th right>% of invoice</Th><Th>Top partner</Th><Th>Top reason</Th>
          </tr></thead>
          <tbody>
            {view.categories.map((c) => {
              const f = formatOf(c.key);
              const isOpen = open.has(c.key);
              const partners = view.partners.filter((p) => p.category === c.key);
              const tp = topPartner(view, c.key);
              const tr = topReason(categoryReasons(c));
              const canOpen = partners.length > 0;
              return (
                <Fragment key={c.key}>
                  <tr onClick={canOpen ? () => toggle(c.key) : undefined} aria-expanded={canOpen ? isOpen : undefined}
                    tabIndex={canOpen ? 0 : undefined} onKeyDown={canOpen ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(c.key); } } : undefined}
                    style={{ cursor: canOpen ? "pointer" : "default", fontWeight: 600 }}>
                    <td style={td}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                        <ChevronRight size={13} aria-hidden style={{ color: canOpen ? C.t3 : "transparent", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                        <Dot color={f.color} />{c.label}
                      </span>
                    </td>
                    <td style={{ ...td, ...num }}><Amount v={c.total.n ? c.total.invoice : null} /></td>
                    <td style={{ ...td, ...num }}><Amount v={c.total.n ? c.total.received : null} green /></td>
                    <td style={{ ...td, ...num }}>{formatPct(shareOf(c.total))}</td>
                    <td style={td}>{tp ? <>{tp.partner} <span style={{ color: C.t3, fontWeight: 400 }}>·</span> <Amount v={tp.total.received} green /></> : "—"}</td>
                    <td style={td}>{tr ? reasonLabel(tr) : "—"}</td>
                  </tr>
                  {isOpen && partners.map((p) => {
                    const r = topReason(p.reasons);
                    return (
                      <tr key={`${c.key}|${p.partner}`} style={{ background: C.bg }}>
                        <td style={{ ...td, paddingLeft: 48, color: C.t2 }}>{p.partner}</td>
                        <td style={{ ...td, ...num, color: C.t2 }}><Amount v={p.total.invoice} /></td>
                        <td style={{ ...td, ...num }}><Amount v={p.total.received} green /></td>
                        <td style={{ ...td, ...num, color: C.t2 }}>{formatPct(shareOf(p.total))}</td>
                        <td style={td} />
                        <td style={{ ...td, color: C.t2 }}>{r ? reasonLabel(r) : "—"}</td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
            <tr style={{ fontWeight: 800, background: C.acl }}>
              <td style={{ ...td, borderBottom: "none", paddingLeft: 30 }}>Total</td>
              <td style={{ ...td, ...num, borderBottom: "none" }}><Amount v={view.total.invoice} /></td>
              <td style={{ ...td, ...num, borderBottom: "none" }}><Amount v={view.total.received} green /></td>
              <td style={{ ...td, ...num, borderBottom: "none" }}>{formatPct(shareOf(view.total))}</td>
              <td style={{ ...td, borderBottom: "none" }} /><td style={{ ...td, borderBottom: "none" }} />
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Received by reason ───────────────────────────────────────────────────────

// Reason label on the axis; shipment-value reasons carry an info icon whose tooltip says so.
function ReasonTick({ x, y, payload }) {
  const shipment = SHIPMENT_VALUE_REASONS.has(payload.value);
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={shipment ? -20 : -6} y={0} dy={4} textAnchor="end" fontSize={11.5} fill={C.t2}>{reasonLabel(payload.value)}</text>
      {shipment && (
        <g transform="translate(-16,-6)" style={{ cursor: "help" }} aria-label={NO_INVOICE}>
          <title>{NO_INVOICE}</title>
          <rect width={12} height={12} fill="transparent" />
          <Info size={12} color={C.t3} />
        </g>
      )}
    </g>
  );
}

function ReasonTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={tipBox()}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: C.t1, marginBottom: 4 }}>{reasonLabel(d.reason)}</div>
      {FORMATS.filter((f) => d.byCat[f.key].n > 0).map((f) => <TipLine key={f.id} label={f.label} value={formatInrFull(d.byCat[f.key].received)} color={f.color} />)}
      <TipLine label="Total received" value={formatInrFull(d.total.received)} green bold rule />
      {SHIPMENT_VALUE_REASONS.has(d.reason) && <div style={{ fontSize: 10.5, color: C.t3, marginTop: 5 }}>{NO_INVOICE}</div>}
    </div>
  );
}

// The formats a chart shows, as dots in the card header; nothing for a single format.
const FormatKey = ({ formats }) => formats.length > 1 && (
  <span style={{ display: "inline-flex", gap: 10, fontSize: 11, color: C.t2 }}>
    {formats.map((f) => <span key={f.id} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Dot color={f.color} />{f.label}</span>)}
  </span>
);

const barHeight = (n) => Math.max(1, n) * 34 + 24;

function ReasonChart({ view }) {
  // Stacked by format so the bars keep the formats' colours; the tooltip spells out the split.
  const data = view.reasons.filter((r) => r.total.received > 0).map((r) => {
    const d = { ...r, received: r.total.received };
    for (const f of FORMATS) d[f.id] = r.byCat[f.key].received;
    d.end = [...FORMATS].reverse().find((f) => d[f.id] > 0)?.id; // the segment that gets the rounded end
    return d;
  });
  const present = FORMATS.filter((f) => data.some((d) => d[f.id] > 0));
  return (
    <Card title="Received by reason" note="all formats" action={<FormatKey formats={present} />} style={{ height: "auto" }}>
      {data.length === 0 ? <div style={{ fontSize: 12, color: C.t3, padding: "12px 0" }}>No received CN in this period.</div> : (
        <ResponsiveContainer width="100%" height={barHeight(data.length)}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.border} horizontal={false} />
            <XAxis type="number" tick={axisTick()} axisLine={false} tickLine={false} tickFormatter={(v) => formatInr(v)} />
            <YAxis type="category" dataKey="reason" width={136} axisLine={false} tickLine={false} tick={<ReasonTick />} interval={0} />
            <Tooltip content={<ReasonTip />} cursor={{ fill: C.hov }} />
            {present.map((f) => (
              <Bar key={f.id} dataKey={f.id} name={f.label} stackId="r" fill={f.color} stroke={C.card} strokeWidth={1} maxBarSize={20} isAnimationActive={false}>
                {data.map((d) => <Cell key={d.reason} radius={d.end === f.id ? [0, 4, 4, 0] : 0} />)}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

// ── Top partners ─────────────────────────────────────────────────────────────

function PartnerTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const f = formatOf(p.category);
  return (
    <div style={tipBox()}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: C.t1, marginBottom: 4 }}>{p.partner}</div>
      <TipLine label={f?.label ?? p.category} value="" color={f?.color} />
      <TipLine label="Received CN" value={formatInrFull(p.total.received)} green />
      <TipLine label="Invoice value" value={formatInrFull(p.total.invoice)} />
      <TipLine label="% of invoice" value={formatPct(shareOf(p.total))} />
    </div>
  );
}

const PartnerTick = ({ x, y, payload }) => (
  <text x={x - 6} y={y} dy={4} textAnchor="end" fontSize={11.5} fill={C.t2}>
    {payload.value.length > 18 ? `${payload.value.slice(0, 17)}…` : payload.value}
  </text>
);

function TopPartners({ view }) {
  const [all, setAll] = useState(false);
  const [showZero, setShowZero] = useState(false);
  const withCn = view.partners.filter((p) => p.total.received > 0).map((p) => ({ ...p, received: p.total.received }));
  const zero = view.partners.filter((p) => p.total.received === 0);
  const data = all ? withCn : withCn.slice(0, 5);
  const present = FORMATS.filter((f) => withCn.some((p) => p.category === f.key));
  return (
    <Card title="Top partners" note="by received CN"
      action={<FormatKey formats={present} />}
      style={{ height: "auto" }}>
      {data.length === 0 ? <div style={{ fontSize: 12, color: C.t3, padding: "12px 0" }}>No received CN in this period.</div> : (
        <ResponsiveContainer width="100%" height={barHeight(data.length)}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.border} horizontal={false} />
            <XAxis type="number" tick={axisTick()} axisLine={false} tickLine={false} tickFormatter={(v) => formatInr(v)} />
            <YAxis type="category" dataKey="partner" width={130} axisLine={false} tickLine={false} tick={<PartnerTick />} interval={0} />
            <Tooltip content={<PartnerTip />} cursor={{ fill: C.hov }} />
            <Bar dataKey="received" name="Received CN" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
              {data.map((p) => <Cell key={`${p.category}|${p.partner}`} fill={formatOf(p.category)?.color ?? C.acc} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
        {withCn.length > 5 && <button onClick={() => setAll((v) => !v)} style={textBtn}>{all ? "Show top 5" : `Show all partners (${withCn.length})`}</button>}
        {zero.length > 0 && (
          <button onClick={() => setShowZero((v) => !v)} style={textBtn}>
            {`${showZero ? "Hide" : "Show"} ${zero.length} partner${zero.length === 1 ? "" : "s"} with no CN`}
          </button>
        )}
      </div>
      {showZero && zero.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {zero.map((p) => (
            <div key={`${p.category}|${p.partner}`} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 0", borderTop: `1px solid ${C.border}`, fontSize: 12, color: C.t2 }}>
              <Dot color={formatOf(p.category)?.color ?? C.t3} />{p.partner}
              <span style={{ marginLeft: "auto", ...num, color: C.t3 }}>₹0</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Month by format ──────────────────────────────────────────────────────────

function MonthTable({ view }) {
  const [all, setAll] = useState(false);
  const rows = [...view.months].reverse().filter((m) => hasActivity(m.total)); // newest first
  const shown = all ? rows : rows.slice(0, 6);
  return (
    <Card title="Month by format" note="invoice month" style={{ height: "auto", marginTop: 14 }}>
      <div style={{ overflow: "auto", maxHeight: all ? 520 : undefined }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <Th>Month</Th>
            {FORMATS.map((f) => <th key={f.id} style={{ ...th, textAlign: "right" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Dot color={f.color} size={7} />{f.key === "B2C" ? "B2C" : f.label}</span></th>)}
            <Th right>Total received</Th><Th right>Invoice value</Th><Th right>% of invoice</Th>
          </tr></thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.month}>
                <td style={td}>{monthName(m.month)}</td>
                {FORMATS.map((f) => <td key={f.id} style={{ ...td, ...num }}><Amount v={m.byCat[f.key].n ? m.byCat[f.key].received : null} green /></td>)}
                <td style={{ ...td, ...num, fontWeight: 700 }}><Amount v={m.total.received} green /></td>
                <td style={{ ...td, ...num }}><Amount v={m.total.invoice} /></td>
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

// Phones (≤768px, as App's phone header) get CnReceivedMobile; the header there is App's
// MobilePageHeader, fed through onMobileCtrl (range pill, caption, ⋯ Export / Open uploads).
export default function CnReceivedPage({ onBack, onOpenUploads, onMobileCtrl }) {
  const bp = useBreakpoint();
  const phone = bp.width <= 768 || bp.isPhoneLandscape;
  const [rangeOpen, setRangeOpen] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  // null until changed: the last 12 months with data. [] = every month.
  const [picked, setPicked] = useState(null);

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
  const months = picked ?? defaultMonths;
  const view = useMemo(() => summarize(inMonths(rows, months)), [rows, months]);
  const lastUpload = useMemo(() => {
    const t = Object.values(data?.updated ?? {}).sort().pop();
    return t ? new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
  }, [data]);
  const loading = !data && !error;
  const catTotal = (key) => view.categories.find((c) => c.key === key).total;
  const rangeValue = months.length === allMonths.length ? [] : months;
  const exportXlsx = () => XLSX.writeFile(buildExport(view), `cn_received_${new Date().toISOString().slice(0, 10)}.xlsx`);

  // Phone header, handed up as plain values only when its text changes; the actions read the
  // latest closures through ctrlLive (as LogisticsCostPage does).
  const ctrlKey = phone && onMobileCtrl ? JSON.stringify({
    pill: allMonths.length ? monthsLabel(rangeValue, allMonths, { short: true }) : "",
    caption: `All formats · INR ex-GST${lastUpload ? ` · updated ${lastUpload}` : ""}`,
    ready: !!data, uploads: !!onOpenUploads,
  }) : "";
  const ctrlLive = useRef(null);
  useEffect(() => { ctrlLive.current = { exportXlsx, onOpenUploads }; });
  useEffect(() => {
    if (!onMobileCtrl) return;
    if (!ctrlKey) { onMobileCtrl(null); return; }
    const v = JSON.parse(ctrlKey);
    onMobileCtrl({
      pill: v.pill, caption: v.caption, openRange: () => setRangeOpen(true),
      menu: [
        ...(v.ready ? [{ id: "export", label: "Export (Excel)", onSelect: () => ctrlLive.current.exportXlsx() }] : []),
        ...(v.uploads ? [{ id: "uploads", label: "Open uploads", onSelect: () => ctrlLive.current.onOpenUploads() }] : []),
      ],
    });
  }, [onMobileCtrl, ctrlKey]);
  useEffect(() => () => onMobileCtrl?.(null), [onMobileCtrl]);

  if (phone) {
    return (
      <>
        <CnReceivedMobile view={view} loading={loading} error={error} monthsCount={months.length} onChangeRange={() => setRangeOpen(true)}
          layout={bp.isPhoneLandscape ? "landscape" : "phone"} />
        {allMonths.length > 0 && <MonthRangePicker variant="sheet" open={rangeOpen} onClose={() => setRangeOpen(false)} months={allMonths} value={rangeValue} onApply={setPicked} title="Invoice months" />}
      </>
    );
  }

  return (
    <div className="page-scroll lc-page" style={{ padding: "6px 24px 40px 14px" }}>
      <style>{`
        @keyframes cnrPulse { 0%, 100% { opacity: 1 } 50% { opacity: .5 } }
        .cnr-skel { animation: cnrPulse 1.2s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) { .cnr-skel { animation: none } }
        .cnr-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px }
        .cnr-two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: start }
        @media (max-width: 1199px) {
          .cnr-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)) }
          .cnr-two { grid-template-columns: minmax(0, 1fr) }
        }
      `}</style>

      {/* Header: title on the left, the range and Export on the right. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "8px 0 14px" }}>
        {onBack && <button onClick={onBack} style={secondaryBtn}>← Cost Analytics</button>}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: C.display, fontSize: 19, fontWeight: 600, color: C.t1, letterSpacing: "-.02em" }}>Credit notes received</div>
          <div style={{ fontSize: 11, color: C.t3, marginTop: 1 }}>All formats · INR ex-GST{lastUpload ? ` · last upload ${lastUpload}` : ""}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {allMonths.length > 0 && <MonthRangePicker months={allMonths} value={rangeValue} onApply={setPicked} title="Invoice months" />}
          <button onClick={exportXlsx} style={secondaryBtn} disabled={!data}>Export</button>
        </div>
      </div>

      {error ? (
        <Card style={{ height: "auto" }}><div style={{ padding: 24, textAlign: "center", color: C.red.tx, fontSize: 13 }}>Could not load credit notes: {error}</div></Card>
      ) : loading ? (<>
        <div className="cnr-kpis"><Skeleton h={112} /><Skeleton h={112} /><Skeleton h={112} /><Skeleton h={112} /></div>
        <Skeleton h={340} />
        <div style={{ marginTop: 14 }}><Skeleton h={220} /></div>
        <div className="cnr-two" style={{ marginTop: 14 }}><Skeleton h={300} /><Skeleton h={300} /></div>
        <div style={{ marginTop: 14 }}><Skeleton h={300} /></div>
      </>) : view.total.n === 0 ? (
        <Card style={{ height: "auto" }}>
          <div style={{ padding: "40px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.t1, marginBottom: 12 }}>No credit notes for this period</div>
            <button onClick={() => setPicked(null)} style={secondaryBtn}>Reset range</button>
          </div>
        </Card>
      ) : (<>
        <div className="cnr-kpis">
          <FormatKpi label="All formats" t={view.total} highlight />
          {FORMATS.map((f) => <FormatKpi key={f.id} label={f.label} color={f.color} t={catTotal(f.key)} />)}
        </div>

        <TrendChart months={view.months} />
        <FormatTable view={view} />

        <div className="cnr-two">
          <ReasonChart view={view} />
          <TopPartners view={view} />
        </div>

        <MonthTable view={view} />
      </>)}
    </div>
  );
}
