// Logistics → Cost Analytics → Overview → "CN Received": credit notes received from couriers,
// transporters and 3PLs, against the invoice values uploaded with them. Totals only, read
// through cn_received_summary(); the uploads themselves live in Documents → Logistics Credit
// Notes. Expected CN stays in the data and the Excel export but is not shown here.
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ArrowUp, ArrowDown, ArrowUpDown, ChevronDown, ChevronRight, Info, X } from "lucide-react";
import { C } from "../utils.js";
import { Card, KPICard } from "../components.jsx";
import { supabase } from "../supabase.js";
import MonthRangePicker from "../responsive/MonthRangePicker.jsx";
import { CATEGORIES, categoryLabel, applyFilters, summarize, hasActivity, monthName } from "./cnReceived.js";
import { formatInr, formatInrFull, formatPct, receivedShareOfInvoice } from "./format.js";

const NO_FILTERS = { months: [], category: "", partner: "" };
const shareOf = (t) => receivedShareOfInvoice(t.received, t.invoice);

// ── Small pieces ─────────────────────────────────────────────────────────────

// A compact amount whose exact value shows on hover.
function Amount({ v }) {
  const full = formatInrFull(v);
  return <span title={full === "—" ? undefined : full}>{formatInr(v)}</span>;
}

function Skeleton({ h, w = "100%", r = 10 }) {
  return <div className="cnr-skel" style={{ height: h, width: w, borderRadius: r, background: C.hov }} />;
}

const btn = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "6px 11px", fontFamily: "var(--font)", fontSize: 11.5, fontWeight: 700, color: C.t2, cursor: "pointer" };
const link = { border: "none", background: "none", padding: 0, color: C.acc, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "var(--font)" };

// Tables: mint header, zebra rows, 44px rows, numbers right-aligned in tabular figures.
const tableWrap = { border: `1px solid ${C.border}`, borderRadius: 10, overflow: "auto" };
// Headers may wrap to two lines so all five columns fit when two tables sit side by side.
const thBase = { position: "sticky", top: 0, zIndex: 1, background: C.acl, height: 44, padding: "6px 10px", fontSize: 11, fontWeight: 700, color: C.t2, textTransform: "uppercase", letterSpacing: 0.4, lineHeight: 1.25, verticalAlign: "middle", borderBottom: `1px solid ${C.border}` };
const tdBase = { height: 44, padding: "0 10px", fontSize: 12.5, color: C.t1, whiteSpace: "nowrap" };
const num = { textAlign: "right", fontVariantNumeric: "tabular-nums" };
const zebra = (i) => (i % 2 ? C.hov : C.card);

function useSort(key = null, dir = "desc") {
  const [sort, setSort] = useState(key ? { key, dir } : null);
  const toggle = (k) => setSort((s) => (s?.key === k ? { key: k, dir: s.dir === "desc" ? "asc" : "desc" } : { key: k, dir: "desc" }));
  const apply = (rows, get) => {
    if (!sort) return rows;
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a, sort.key), y = get(b, sort.key);
      if (typeof x === "string" || typeof y === "string") return sign * String(x ?? "").localeCompare(String(y ?? ""));
      return sign * ((x ?? -Infinity) - (y ?? -Infinity));
    });
  };
  return { sort, toggle, apply };
}

function SortTh({ label, k, s, align = "right" }) {
  const on = s.sort?.key === k;
  const Icon = !on ? ArrowUpDown : s.sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th onClick={() => s.toggle(k)} aria-sort={on ? (s.sort.dir === "asc" ? "ascending" : "descending") : "none"}
      style={{ ...thBase, textAlign: align, cursor: "pointer", userSelect: "none", ...(align === "right" ? { width: 104 } : {}) }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexDirection: align === "right" ? "row-reverse" : "row" }}>
        {label}<Icon size={12} style={{ opacity: on ? 1 : 0.4 }} />
      </span>
    </th>
  );
}

// Value columns shared by the three tables.
const VALUE_COLS = [["Invoice value", "invoice"], ["Received CN", "received"], ["Received % of invoice", "share"]];
const valueOf = (t, k) => (k === "share" ? shareOf(t) : k === "invoice" ? t.invoice : t.received);
function ValueCells({ t, noInvoiceNote }) {
  return (<>
    <td style={{ ...tdBase, ...num }}>
      {t.invoice == null && noInvoiceNote ? (
        <span title={noInvoiceNote} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.t3 }}>
          — <Info size={12} aria-label={noInvoiceNote} />
        </span>
      ) : <Amount v={t.invoice} />}
    </td>
    <td style={{ ...tdBase, ...num }}><Amount v={t.received} /></td>
    <td style={{ ...tdBase, ...num }}>{formatPct(shareOf(t))}</td>
  </>);
}

// Lost/Damage-type reasons are claimed against a shipment's value, not an invoice.
const NO_INVOICE = "Shipment value, not invoice";

// ── Trend: Received CN by month, and Received % of invoice beneath it ───────
// Two charts on one shared month axis rather than one chart with two y-axes: each keeps a
// single honest scale, and hovering either shows all four figures for that month.

function TrendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const row = (k, v) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
      <span style={{ color: C.t3 }}>{k}</span><span style={{ color: C.t1, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{v}</span>
    </div>
  );
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, padding: "8px 12px", fontSize: 11.5, boxShadow: C.sh2, minWidth: 210 }}>
      <div style={{ fontWeight: 700, color: C.t1, marginBottom: 4 }}>{monthName(d.month)}</div>
      {row("Received CN", formatInrFull(d.received))}
      {row("Invoice value", formatInrFull(d.invoice))}
      {row("Received % of invoice", formatPct(d.share))}
    </div>
  );
}

function Trend({ months, selected, onPick }) {
  const data = months.map((m) => ({ month: m.month, label: monthName(m.month), received: m.total.received, invoice: m.total.invoice,
    share: shareOf(m.total), sharePct: shareOf(m.total) == null ? null : shareOf(m.total) * 100 }));
  const sel = new Set(selected);
  const axis = { fontSize: 11, fill: C.t3 };
  return (
    <Card title="Received CN by month" note={selected.length ? "selected months highlighted · click a bar to change" : "click a bar to filter to that month"} style={{ height: "auto", marginBottom: 14 }}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} syncId="cnr" margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={C.border} />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: C.border }} hide />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={74} tickFormatter={(v) => formatInr(v)} />
          <Tooltip content={<TrendTooltip />} cursor={{ fill: C.hov }} />
          <Bar dataKey="received" name="Received CN" radius={[4, 4, 0, 0]} maxBarSize={36} cursor="pointer"
            onClick={(d) => onPick(d?.payload?.month ?? d?.month)}>
            {data.map((d) => <Cell key={d.month} fill={C.acc} fillOpacity={!sel.size || sel.has(d.month) ? 1 : 0.3} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.t2, margin: "8px 0 2px 2px" }}>Received % of invoice</div>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data} syncId="cnr" margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={C.border} />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: C.border }} interval="preserveStartEnd" minTickGap={18} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={74} tickFormatter={(v) => `${v}%`} />
          <Tooltip content={<TrendTooltip />} cursor={{ stroke: C.border2 }} />
          <Line dataKey="sharePct" name="Received % of invoice" stroke={C.acm} strokeWidth={2} connectNulls={false}
            dot={{ r: 3, fill: C.acm, stroke: C.card, strokeWidth: 2 }} activeDot={{ r: 5, stroke: C.card, strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

// ── Tables ───────────────────────────────────────────────────────────────────

function CategoryTable({ view }) {
  const s = useSort();
  const [collapsed, setCollapsed] = useState(() => new Set());
  const toggle = (k) => setCollapsed((c) => { const n = new Set(c); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const get = (x, k) => (k === "name" ? x.label ?? x.reason : valueOf(x.total, k));
  const cats = s.apply(view.categories.filter((c) => c.total.n > 0), get);
  return (
    <Card title="By category and reason" style={{ height: "auto" }}>
      <div style={tableWrap}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
          <thead><tr>
            <SortTh label="Category" k="name" s={s} align="left" />
            <th style={{ ...thBase, textAlign: "left" }}>Reason</th>
            {VALUE_COLS.map(([l, k]) => <SortTh key={k} label={l} k={k} s={s} />)}
          </tr></thead>
          <tbody>
            {(() => {
              let i = 0;
              return cats.map((c) => {
                const open = !collapsed.has(c.key);
                const reasons = s.apply(c.reasons.filter((x) => x.total.n > 0), get);
                return [
                  <tr key={c.key} style={{ background: zebra(i++), fontWeight: 700 }}>
                    <td style={tdBase}>
                      <button onClick={() => toggle(c.key)} aria-expanded={open} disabled={!reasons.length}
                        style={{ border: "none", background: "none", padding: 0, cursor: reasons.length ? "pointer" : "default", display: "inline-flex", alignItems: "center", gap: 4, color: C.t1, font: "inherit", fontWeight: 700 }}>
                        {reasons.length ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span style={{ width: 14 }} />}
                        {c.label}
                      </button>
                    </td>
                    <td style={tdBase} />
                    <ValueCells t={c.total} />
                  </tr>,
                  ...(open ? reasons.map((x) => (
                    <tr key={`${c.key}|${x.reason}`} style={{ background: zebra(i++), color: C.t2 }}>
                      <td style={tdBase} />
                      <td style={{ ...tdBase, paddingLeft: 24, color: C.t2 }}>{x.reason}</td>
                      <ValueCells t={x.total} noInvoiceNote={NO_INVOICE} />
                    </tr>
                  )) : []),
                ];
              });
            })()}
            <tr style={{ background: C.acl, fontWeight: 800 }}>
              <td style={tdBase}>Total</td><td style={tdBase} />
              <ValueCells t={view.total} />
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PartnerTable({ view }) {
  const s = useSort("received", "desc");
  const [showEmpty, setShowEmpty] = useState(false);
  const get = (p, k) => (k === "partner" ? p.partner : k === "category" ? categoryLabel(p.category) : valueOf(p.total, k));
  const all = s.apply(view.partners, get);
  const active = all.filter((p) => hasActivity(p.total));
  const empty = all.length - active.length;
  const rows = showEmpty ? all : active;
  return (
    <Card title="By partner" style={{ height: "auto" }}>
      <div style={{ ...tableWrap, maxHeight: 560 }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
          <thead><tr>
            <SortTh label="Category" k="category" s={s} align="left" />
            <SortTh label="Partner" k="partner" s={s} align="left" />
            {VALUE_COLS.map(([l, k]) => <SortTh key={k} label={l} k={k} s={s} />)}
          </tr></thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={`${p.category}|${p.partner}`} style={{ background: zebra(i) }}>
                <td style={tdBase}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: C.t3, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 999, padding: "2px 8px" }}>
                    {categoryLabel(p.category)}
                  </span>
                </td>
                <td style={tdBase}>{p.partner}</td>
                <ValueCells t={p.total} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {empty > 0 && (
        <button onClick={() => setShowEmpty((v) => !v)} style={{ ...link, marginTop: 10 }}>
          {showEmpty ? `Hide ${empty} partner${empty === 1 ? "" : "s"} with no CN` : `Show ${empty} partner${empty === 1 ? "" : "s"} with no CN`}
        </button>
      )}
    </Card>
  );
}

function MonthTable({ view }) {
  const s = useSort("month", "desc");
  const [all, setAll] = useState(false);
  const get = (m, k) => (k === "month" ? m.month : valueOf(m.total, k));
  const rows = s.apply(view.months.filter((m) => hasActivity(m.total)), get);
  const shown = all ? rows : rows.slice(0, 12);
  return (
    <Card title="By month" note="invoice month" style={{ height: "auto", marginTop: 14 }}>
      <div style={{ ...tableWrap, maxHeight: all ? 640 : undefined }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
          <thead><tr>
            <SortTh label="Month" k="month" s={s} align="left" />
            {VALUE_COLS.map(([l, k]) => <SortTh key={k} label={l} k={k} s={s} />)}
          </tr></thead>
          <tbody>
            {shown.map((m, i) => (
              <tr key={m.month} style={{ background: zebra(i) }}>
                <td style={tdBase}>{monthName(m.month)}</td>
                <ValueCells t={m.total} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 12 && (
        <button onClick={() => setAll((v) => !v)} style={{ ...link, marginTop: 10 }}>
          {all ? "Show the latest 12 months" : `Show all ${rows.length} months`}
        </button>
      )}
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function monthsChip(sel) {
  const s = [...sel].sort();
  if (s.length === 1) return monthName(s[0]);
  return `${monthName(s[0])} – ${monthName(s[s.length - 1])}${s.length > 2 ? ` (${s.length} months)` : ""}`;
}

function Chip({ children, onRemove }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: C.t1, background: C.acl, border: `1px solid ${C.border}`, borderRadius: 999, padding: "3px 6px 3px 10px" }}>
      {children}
      <button onClick={onRemove} aria-label="Remove filter" style={{ border: "none", background: "none", cursor: "pointer", padding: 0, display: "inline-flex", color: C.t2 }}><X size={13} /></button>
    </span>
  );
}

export default function CnReceivedPage({ onBack, onOpenUploads }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(NO_FILTERS);

  useEffect(() => {
    let live = true;
    supabase.rpc("cn_received_summary").then(({ data: d, error: e }) => {
      if (!live) return;
      if (e) setError(e.message); else setData(d);
    });
    return () => { live = false; };
  }, []);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const months = useMemo(() => [...new Set(rows.map((r) => r.month))].sort(), [rows]);
  const partners = useMemo(() => [...new Set(rows.filter((r) => !filters.category || r.category === filters.category).map((r) => r.partner))].sort(), [rows, filters.category]);
  const view = useMemo(() => summarize(applyFilters(rows, filters)), [rows, filters]);
  // The trend follows the category and partner filters but always spans every month, so a
  // clicked bar narrows the cards and tables without the chart collapsing to one bar.
  const trend = useMemo(() => summarize(applyFilters(rows, { ...filters, months: [] })).months, [rows, filters]);
  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v, ...(k === "category" ? { partner: "" } : {}) }));
  const pickMonth = (m) => m && set("months", filters.months.length === 1 && filters.months[0] === m ? [] : [m]);
  const reset = () => setFilters(NO_FILTERS);
  const filtered = filters.category || filters.partner || filters.months.length;
  const lastUpload = useMemo(() => {
    const t = Object.values(data?.updated ?? {}).sort().pop();
    return t ? new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
  }, [data]);

  // The export keeps Expected CN, which the page itself doesn't show.
  const exportXlsx = () => {
    const r2 = (v) => (v == null ? "" : Math.round(v * 100) / 100);
    const head = (first) => [...first, "Invoice value", "Expected CN", "Received CN", "Received % of invoice"];
    const vals = (t) => [r2(t.invoice), r2(t.expected), r2(t.received), shareOf(t) == null ? "" : Math.round(shareOf(t) * 1000) / 10];
    const wb = XLSX.utils.book_new();
    const cat = view.categories.filter((c) => c.total.n > 0).flatMap((c) => [[c.label, "", ...vals(c.total)], ...c.reasons.filter((x) => x.total.n > 0).map((x) => ["", x.reason, ...vals(x.total)])]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head(["Category", "Reason"]), ...cat, ["Total", "", ...vals(view.total)]]), "By category");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head(["Month"]), ...[...view.months].reverse().map((m) => [monthName(m.month), ...vals(m.total)])]), "By month");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head(["Category", "Partner"]), ...view.partners.map((p) => [categoryLabel(p.category), p.partner, ...vals(p.total)])]), "By partner");
    XLSX.writeFile(wb, `cn_received_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const loading = !data && !error;
  return (
    <div className="page-scroll lc-page" style={{ padding: "14px 18px 40px" }}>
      <style>{`
        @keyframes cnrPulse { 0%, 100% { opacity: 1 } 50% { opacity: .45 } }
        .cnr-skel { animation: cnrPulse 1.2s ease-in-out infinite }
        .cnr-two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: start }
        @media (max-width: 1199px) { .cnr-two { grid-template-columns: minmax(0, 1fr) } }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        <button onClick={onBack} style={btn}>← Cost Analytics</button>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontFamily: C.display, fontSize: 19, fontWeight: 600, color: C.t1, letterSpacing: "-.02em" }}>Credit Notes Received</div>
          <div style={{ fontSize: 11, color: C.t3, marginTop: 1 }}>
            From Documents → Logistics Credit Notes · INR ex-GST{lastUpload ? ` · last upload ${lastUpload}` : ""}
          </div>
        </div>
        {onOpenUploads && <button onClick={onOpenUploads} style={btn}>Open uploads</button>}
        <button onClick={exportXlsx} style={btn} disabled={!data}>Export Excel</button>
      </div>

      {error && <Card style={{ height: "auto" }}><div style={{ padding: 24, textAlign: "center", color: C.red.tx, fontSize: 13 }}>Could not load credit notes: {error}</div></Card>}

      {!error && (<>
        {/* Filter bar: one row, stays visible while the page scrolls. */}
        <div style={{ position: "sticky", top: 0, zIndex: 5, background: C.bg, padding: "8px 0 10px", marginBottom: 6 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, padding: 3, gap: 2 }}>
              {[{ key: "", label: "All" }, ...CATEGORIES].map((c) => {
                const on = filters.category === c.key;
                return (
                  <button key={c.key || "all"} onClick={() => set("category", c.key)} disabled={loading} aria-pressed={on}
                    style={{ border: "none", cursor: "pointer", fontFamily: "var(--font)", fontSize: 12, fontWeight: on ? 700 : 500, padding: "6px 12px", borderRadius: 7, background: on ? C.acc : "transparent", color: on ? C.onAcc : C.t1 }}>
                    {c.label}
                  </button>
                );
              })}
            </div>
            <select value={filters.partner} onChange={(e) => set("partner", e.target.value)} disabled={loading} aria-label="Partner"
              style={{ fontSize: 12, padding: "7px 10px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.card, color: C.t1, fontFamily: "var(--font)" }}>
              <option value="">All partners</option>
              {partners.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            {months.length > 0 && <MonthRangePicker months={months} value={filters.months} onApply={(v) => set("months", v)} title="Invoice months" />}
          </div>
          {filtered ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
              {filters.category && <Chip onRemove={() => set("category", "")}>{categoryLabel(filters.category)}</Chip>}
              {filters.partner && <Chip onRemove={() => set("partner", "")}>{filters.partner}</Chip>}
              {filters.months.length > 0 && <Chip onRemove={() => set("months", [])}>{monthsChip(filters.months)}</Chip>}
              <button onClick={reset} style={{ ...link, marginLeft: 4 }}>Reset</button>
            </div>
          ) : null}
        </div>

        {loading ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 14 }}>
              <Skeleton h={92} /><Skeleton h={92} /><Skeleton h={92} />
            </div>
            <Skeleton h={390} />
            <div className="cnr-two" style={{ marginTop: 14 }}><Skeleton h={360} /><Skeleton h={360} /></div>
            <div style={{ marginTop: 14 }}><Skeleton h={300} /></div>
          </>
        ) : view.total.n === 0 ? (
          <Card style={{ height: "auto" }}>
            <div style={{ padding: "36px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.t1, marginBottom: 10 }}>No credit notes for this selection</div>
              <button onClick={reset} style={btn}>Reset filters</button>
            </div>
          </Card>
        ) : (<>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 14 }}>
            <KPICard label="Received CN" value={<Amount v={view.total.received} />} sub={formatInrFull(view.total.received)} />
            <KPICard label="Invoice value" value={<Amount v={view.total.invoice} />} sub={formatInrFull(view.total.invoice)} />
            <KPICard label="Received % of invoice" value={formatPct(shareOf(view.total))} sub="received ÷ invoice value" />
          </div>

          <Trend months={trend} selected={filters.months} onPick={pickMonth} />

          <div className="cnr-two">
            <CategoryTable view={view} />
            <PartnerTable view={view} />
          </div>

          <MonthTable view={view} />
        </>)}
      </>)}
    </div>
  );
}
