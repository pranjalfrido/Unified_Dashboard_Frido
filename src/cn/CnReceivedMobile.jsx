// "Credit notes received" on phones (≤768px), in the look of the mobile Logistics → Cost screens:
// the master card (MasterTrendCard, summary mode) with a monthly bar chart and four tiles, then list
// cards built from CardKit and the Cost screens' row (name + sub-line, amount + %, thin bar).
// Display only: every figure comes from the same summarize() view as the desktop page, in the
// same formatter (format.js). The header (back, range pill, ⋯) is App's MobilePageHeader, fed by
// CnReceivedPage through onMobileCtrl.
import { useEffect, useRef, useState } from "react";
import { C } from "../utils.js";
import { supabase } from "../supabase.js";
import MasterTrendCard from "../responsive/MasterTrendCard.jsx";
import BottomSheet from "../responsive/BottomSheet.jsx";
import Skeleton from "../responsive/Skeleton.jsx";
import { Card, ShowAllButton, Chips, RowText } from "../responsive/CardKit.jsx";
import {
  categoryLabel, reasonLabel, SHIPMENT_VALUE_REASONS, inMonths, summarize, lastMonths, shareOf, hasActivity,
  monthName, topPartner, topReason, rankPartners, currentMonth,
} from "./cnReceived.js";
import { formatInr, formatInrFull, formatPct } from "./format.js";

const M = C.m;
// The format colours of the mobile Cost Overview split bar: B2C green, FTL/PTL g2, 3PL g3.
const FORMATS = [
  { key: "B2C", color: M.green },
  { key: "FTL/PTL", color: M.g2 },
  { key: "3PL", color: M.g3 },
].map((f) => ({ ...f, label: categoryLabel(f.key) }));
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monShort = (ym) => `${MON[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;
const pctOf = (part, whole) => (whole > 0 ? part / whole : null);
const bar = (part, whole) => (whole > 0 ? (part / whole) * 100 : null);

// ── Amounts ──────────────────────────────────────────────────────────────────

// Compact amount; the exact en-IN value for 3 s on a long-press (touch) or right-click. A long-press
// inside a tappable row does not also tap the row.
function useFullValue(v) {
  const [full, setFull] = useState(false);
  const hold = useRef(null), hide = useRef(null), held = useRef(false);
  useEffect(() => () => { clearTimeout(hold.current); clearTimeout(hide.current); }, []);
  const exact = formatInrFull(v);
  const can = exact !== "—";
  const reveal = () => {
    if (!can) return;
    setFull(true);
    clearTimeout(hide.current);
    hide.current = setTimeout(() => setFull(false), 3000);
  };
  const cancel = () => clearTimeout(hold.current);
  const bind = {
    onPointerDown: () => { held.current = false; cancel(); hold.current = setTimeout(() => { held.current = true; reveal(); }, 500); },
    onPointerUp: cancel, onPointerLeave: cancel, onPointerCancel: cancel,
    onContextMenu: (e) => { if (can) { e.preventDefault(); reveal(); } },
    onClickCapture: (e) => { if (held.current) { held.current = false; e.preventDefault(); e.stopPropagation(); } },
  };
  return { text: full ? exact : formatInr(v), title: can ? exact : undefined, reveal, bind };
}

function Amt({ v, color }) {
  const f = useFullValue(v);
  return <span title={f.title} {...f.bind} style={{ color, WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}>{f.text}</span>;
}

const Dot = ({ color }) => <span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: color, marginRight: 7, verticalAlign: "1px", flexShrink: 0 }} />;

// ── Hero: master card, monthly bars, 2×2 tiles ───────────────────────────────

// Total received per month (no stacking on a phone; the split is in the popover). The current,
// still-filling month is the lighter green. Tap a bar for its month; tap it again or outside to close.
function MonthBars({ months }) {
  const [sel, setSel] = useState(null);
  const box = useRef(null);
  useEffect(() => {
    if (sel == null) return;
    const close = (e) => { if (!box.current?.contains(e.target)) setSel(null); };
    const key = (e) => { if (e.key === "Escape") setSel(null); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", key); };
  }, [sel]);
  const H = 120;
  const n = months.length;
  const max = Math.max(...months.map((m) => m.total.received), 0) || 1;
  const cur = currentMonth();
  const ticks = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : months.map((_, i) => i);
  const m = sel != null ? months[sel] : null;
  const left = sel != null ? ((sel + 0.5) / n) * 100 : 0;
  return (
    <div ref={box} style={{ position: "relative", marginTop: 8 }}>
      <div role="group" aria-label="Received CN by invoice month" style={{ display: "flex", alignItems: "flex-end", gap: n > 18 ? 2 : 4, height: H }}>
        {months.map((x, i) => {
          const h = x.total.received > 0 ? Math.max(3, (x.total.received / max) * (H - 6)) : 0;
          return (
            <button key={x.month} type="button" aria-expanded={sel === i} aria-label={`${monthName(x.month)}: ${formatInrFull(x.total.received)} received`}
              onClick={() => setSel(sel === i ? null : i)}
              style={{ flex: "1 1 0", minWidth: 0, height: "100%", padding: 0, border: "none", background: "transparent", display: "flex", alignItems: "flex-end", cursor: "pointer" }}>
              <span aria-hidden="true" style={{ display: "block", width: "100%", height: h || 2, borderRadius: h ? "4px 4px 0 0" : 1, background: !h ? M.line : x.month === cur ? M.g3 : M.green,
                opacity: sel != null && sel !== i ? 0.4 : 1, transition: `opacity ${C.motion.base} ease` }} />
            </button>
          );
        })}
      </div>
      <div aria-hidden="true" style={{ position: "relative", height: 18, marginTop: 4, fontSize: 12, color: M.muted }}>
        {ticks.map((i) => (
          <span key={i} style={{ position: "absolute", top: 0, whiteSpace: "nowrap",
            ...(i === 0 ? { left: 0 } : i === n - 1 ? { right: 0 } : { left: `${((i + 0.5) / n) * 100}%`, transform: "translateX(-50%)" }) }}>{monShort(months[i].month)}</span>
        ))}
      </div>
      {m && (
        <div role="dialog" aria-label={monthName(m.month)}
          style={{ position: "absolute", top: 0, left: `clamp(0px, calc(${left}% - 110px), calc(100% - 220px))`, width: 220, zIndex: C.z.dropdown, background: M.card, border: `1px solid ${M.line}`, borderRadius: 12, boxShadow: C.sh3, padding: "10px 12px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: M.ink, marginBottom: 4 }}>{monthName(m.month)}{m.month === cur ? " · so far" : ""}</div>
          {FORMATS.map((f) => (
            <TipLine key={f.key} label={<><Dot color={f.color} />{f.label}</>} value={m.byCat[f.key].n > 0 ? formatInr(m.byCat[f.key].received) : "—"} green={m.byCat[f.key].n > 0} />
          ))}
          <TipLine rule label="Total received" value={formatInr(m.total.received)} green bold />
          <TipLine label="Invoice value" value={formatInr(m.total.invoice)} />
          <TipLine label="% of invoice" value={formatPct(shareOf(m.total))} />
        </div>
      )}
    </div>
  );
}

function TipLine({ label, value, green, bold, rule }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, lineHeight: "20px", color: M.muted, ...(rule ? { borderTop: `1px solid ${M.line}`, marginTop: 4, paddingTop: 4 } : {}) }}>
      <span style={{ fontWeight: bold ? 700 : 500, color: bold ? M.ink : M.muted, whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ fontWeight: 700, color: green ? M.up : M.ink, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

// A tile in KpiTile's look on the master card (translucent white, label in small caps), one line
// taller for "x% of ₹Y". Tapping it shows the exact amount.
function Tile({ label, color, value, sub, green, muted }) {
  const f = useFullValue(value);
  return (
    <button type="button" onClick={f.reveal} title={f.title} aria-label={`${label}: ${f.title ?? formatInr(value)}, ${sub}`}
      style={{ display: "block", width: "100%", minWidth: 0, minHeight: 72, padding: 8, borderRadius: M.radius.tile, textAlign: "left", fontFamily: "var(--font)", cursor: "pointer",
        background: "rgba(255,255,255,.9)", border: `1px solid ${M.tileBorder}`, boxShadow: "0 1px 2px rgba(15,42,29,.04)" }}>
      <span style={{ display: "flex", alignItems: "center", minWidth: 0, fontSize: M.type.label, fontWeight: 600, textTransform: "uppercase", color: M.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {color && <Dot color={color} />}{label}
      </span>
      <span style={{ display: "block", marginTop: 3, fontSize: M.type.tileValue, fontWeight: 700, color: muted ? M.muted : green ? M.up : M.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>{muted ? "₹0" : f.text}</span>
      <span style={{ display: "block", marginTop: 1, fontSize: 12, color: M.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>{sub}</span>
    </button>
  );
}

function HeroValue({ v }) {
  const f = useFullValue(v);
  // Padded to a 44px tap target, the padding taken back by the margin so the line doesn't move.
  return <span role="button" tabIndex={0} title={f.title} onClick={f.reveal} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); f.reveal(); } }}
    style={{ display: "inline-block", padding: "8px 0", margin: "-8px 0", cursor: "pointer" }}>{f.text}</span>;
}

function Hero({ view, monthsCount, layout }) {
  const t = view.total;
  const span = `${monthsCount} month${monthsCount === 1 ? "" : "s"}`;
  const metrics = [{
    key: "cn", label: "CN received · all formats", value: <HeroValue v={t.received} />, valueColor: M.up,
    sub: t.invoice ? `${formatPct(shareOf(t))} of ${formatInr(t.invoice)} invoice · ${span}` : span,
    def: "Credit notes received from logistics partners (B2C couriers, FTL/PTL, 3PL), INR ex-GST, by invoice month. % of invoice = received ÷ the invoice value uploaded with the CNs.",
  }];
  const tiles = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8, marginTop: 10 }}>
      {FORMATS.map((f) => {
        const c = view.categories.find((x) => x.key === f.key).total;
        if (c.n === 0) return <Tile key={f.key} label={f.label} color={f.color} value={0} sub="No invoices yet" muted />;
        return <Tile key={f.key} label={f.label} color={f.color} value={c.received} green sub={c.invoice ? `${formatPct(shareOf(c))} of ${formatInr(c.invoice)}` : "No invoice value"} />;
      })}
      <Tile label="Invoice value" value={t.invoice} sub="all formats" />
    </div>
  );
  return <MasterTrendCard metrics={metrics} layout={layout} summary={<><MonthBars months={view.months} />{tiles}</>} />;
}

// ── Rows ─────────────────────────────────────────────────────────────────────

// The Cost screens' ranked row (PartnerRow): name + sub-line, amount + line under it, thin bar.
// Adds what this page needs: expandable (aria-expanded + chevron), indented, muted.
function Row({ name, color, sub, value, valueSub, bar: b, onClick, expanded, indent, muted }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} aria-expanded={onClick && expanded != null ? expanded : undefined}
      style={{ display: "block", width: "100%", minHeight: 44, textAlign: "left", border: "none", borderTop: `1px solid ${M.line}`, background: "transparent",
        padding: `10px 0 10px ${indent ? 16 : 0}px`, fontFamily: "var(--font)", color: muted ? M.muted : M.ink, cursor: onClick ? "pointer" : "default" }}>
      <RowText name={<>{color && <Dot color={color} />}{name}{expanded != null && <span aria-hidden="true" style={{ display: "inline-block", marginLeft: 6, color: M.muted, transform: expanded ? "rotate(90deg)" : "none", transition: `transform ${C.motion.base} ease` }}>›</span>}</>}
        sub={sub} value={value} valueSub={valueSub} />
      {b != null && <span aria-hidden="true" style={{ display: "block", height: 3, marginTop: 6, borderRadius: 2, background: M.line }}><i style={{ display: "block", height: "100%", width: `${Math.max(1, Math.min(100, b))}%`, background: M.green, borderRadius: 2 }} /></span>}
    </Tag>
  );
}

const ofInv = (t) => `${formatPct(shareOf(t))} of inv`;

function FormatsCard({ view }) {
  const [open, setOpen] = useState(null);
  const total = view.total.received;
  return (
    <Card title="By format" right={<span style={{ fontSize: 12, color: M.muted }}>tap for partners</span>}>
      {FORMATS.map((f) => {
        const c = view.categories.find((x) => x.key === f.key);
        if (c.total.n === 0) return <Row key={f.key} name={f.label} color={f.color} sub="No invoices yet" value="₹0" valueSub="—" muted />;
        const tp = topPartner(view, f.key);
        const isOpen = open === f.key;
        const partners = view.partners.filter((p) => p.category === f.key);
        return (
          <div key={f.key}>
            <Row name={f.label} color={f.color} sub={`${formatInr(c.total.invoice)} inv · top: ${tp?.partner ?? "—"}`}
              value={<Amt v={c.total.received} color={M.up} />} valueSub={ofInv(c.total)} bar={bar(c.total.received, total)}
              expanded={isOpen} onClick={() => setOpen(isOpen ? null : f.key)} />
            {isOpen && partners.map((p) => {
              const r = topReason(p.reasons);
              return (
                <Row key={p.partner} indent name={p.partner} sub={`${formatInr(p.total.invoice)} inv · ${r ? reasonLabel(r) : "—"}`}
                  value={<Amt v={p.total.received} color={p.total.received > 0 ? M.up : undefined} />} valueSub={ofInv(p.total)} bar={bar(p.total.received, c.total.received)} />
              );
            })}
          </div>
        );
      })}
    </Card>
  );
}

function PartnersCard({ view }) {
  const [by, setBy] = useState("received");
  const [all, setAll] = useState(false);
  const total = view.total.received;
  const { withCn, none } = rankPartners(view, by);
  const maxPct = Math.max(...withCn.map((p) => p.pct ?? 0), 0);
  const shown = all ? [...withCn, ...none] : withCn.slice(0, 4);
  const share = (p) => formatPct(pctOf(p.total.received, total));
  const cells = (p) => {
    if (p.total.received === 0) return { value: "₹0", valueSub: "no CN", bar: null };
    if (by === "pct") return { value: formatPct(p.pct), valueSub: <><Amt v={p.total.received} /> · {share(p)}</>, bar: maxPct > 0 && p.pct != null ? (p.pct / maxPct) * 100 : null };
    if (by === "reason") return { value: <Amt v={p.reasonReceived} color={M.up} />, valueSub: `of ${formatInr(p.total.received)}`, bar: bar(p.reasonReceived, total) };
    return { value: <Amt v={p.total.received} color={M.up} />, valueSub: `${share(p)} of total`, bar: bar(p.total.received, total) };
  };
  const more = withCn.length > 4 || none.length > 0;
  return (
    <Card title="Top partners" right={<span style={{ fontSize: 12, color: M.muted }}>{view.partners.length} partners</span>}>
      <Chips label="Rank partners by" value={by} onChange={setBy}
        options={[{ id: "received", label: "Received" }, { id: "pct", label: "% of invoice" }, { id: "reason", label: "By reason" }]} />
      <div style={{ marginTop: 4 }}>
        {shown.map((p) => (
          <Row key={`${p.category}|${p.partner}`} name={p.partner} muted={p.total.received === 0}
            sub={`${categoryLabel(p.category)} · ${p.reason ? reasonLabel(p.reason) : "—"}`} {...cells(p)} />
        ))}
      </div>
      {more && <ShowAllButton onClick={() => setAll((a) => !a)}>{all ? "Show fewer" : `Show all${none.length ? ` · ${none.length} with no CN` : ` ${withCn.length}`}`}</ShowAllButton>}
    </Card>
  );
}

function ReasonsCard({ view }) {
  const total = view.total.received;
  const rows = view.reasons.filter((r) => r.total.received > 0);
  return (
    <Card title="Received by reason">
      {rows.map((r) => {
        const shipment = SHIPMENT_VALUE_REASONS.has(r.reason);
        return (
          <Row key={r.reason} name={reasonLabel(r.reason)} sub={shipment ? "Shipment value" : "Invoice-based"}
            value={<Amt v={r.total.received} color={M.up} />} valueSub={shipment ? "—" : ofInv(r.total)} bar={bar(r.total.received, total)} />
        );
      })}
    </Card>
  );
}

// ── Monthly table (bottom sheet) ─────────────────────────────────────────────

const th = { position: "sticky", top: -10, zIndex: 1, background: M.card, padding: "8px 6px", fontSize: 12, fontWeight: 600, textTransform: "uppercase", color: M.muted, borderBottom: `1px solid ${M.line}`, whiteSpace: "nowrap" };
const td = { padding: "0 6px", height: 44, fontSize: 13, color: M.ink, borderTop: `1px solid ${M.line}`, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };

function MonthSheet({ open, onClose, view }) {
  const [exp, setExp] = useState(null);
  const rows = [...view.months].filter((m) => hasActivity(m.total)).reverse(); // newest first
  return (
    <BottomSheet open={open} onClose={onClose} title="Month by format" subtitle="Invoice month · tap a month for its split">
      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left", paddingLeft: 0 }}>Month</th>
            <th style={{ ...th, textAlign: "right" }}>Received</th>
            <th style={{ ...th, textAlign: "right" }}>Invoice</th>
            <th style={{ ...th, textAlign: "right", paddingRight: 0 }}>%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const isOpen = exp === m.month;
            return [
              <tr key={m.month} tabIndex={0} aria-expanded={isOpen} onClick={() => setExp(isOpen ? null : m.month)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExp(isOpen ? null : m.month); } }} style={{ cursor: "pointer" }}>
                <td style={{ ...td, paddingLeft: 0, fontWeight: 600 }}>{monthName(m.month)}<span aria-hidden="true" style={{ display: "inline-block", marginLeft: 6, color: M.muted, transform: isOpen ? "rotate(90deg)" : "none" }}>›</span></td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700, color: M.up }}>{formatInr(m.total.received)}</td>
                <td style={{ ...td, textAlign: "right" }}>{formatInr(m.total.invoice)}</td>
                <td style={{ ...td, textAlign: "right", paddingRight: 0 }}>{formatPct(shareOf(m.total))}</td>
              </tr>,
              isOpen && (
                <tr key={`${m.month}-split`}>
                  <td colSpan={4} style={{ padding: "2px 0 10px 12px" }}>
                    {FORMATS.map((f) => (
                      <TipLine key={f.key} label={<><Dot color={f.color} />{f.label}</>} value={m.byCat[f.key].n > 0 ? formatInr(m.byCat[f.key].received) : "—"} green={m.byCat[f.key].received > 0} />
                    ))}
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </BottomSheet>
  );
}

// ── States ───────────────────────────────────────────────────────────────────

function LoadingCards() {
  const rows = (k) => Array.from({ length: k }, (_, i) => (
    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 0", borderTop: `1px solid ${M.line}` }}>
      <span style={{ flex: 1 }}><Skeleton width="55%" height={13} /><br /><Skeleton width="35%" height={11} style={{ marginTop: 6 }} /></span>
      <Skeleton width={64} height={13} />
    </div>
  ));
  return (
    <>
      <div style={{ background: M.masterGrad, border: `1px solid ${M.masterBorder}`, borderRadius: M.radius.card, padding: 16, boxShadow: M.cardShadow }}>
        <Skeleton width="45%" height={12} />
        <div style={{ marginTop: 8 }}><Skeleton width="40%" height={26} /></div>
        <div style={{ marginTop: 8 }}><Skeleton width="70%" height={12} /></div>
        <div style={{ marginTop: 14 }}><Skeleton width="100%" height={120} radius={10} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8, marginTop: 10 }}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} width="100%" height={72} radius={M.radius.tile} />)}
        </div>
      </div>
      <Skeleton width="100%" height={44} radius={12} />
      <Card title="By format">{rows(3)}</Card>
      <Card title="Top partners">{rows(4)}</Card>
      <Card title="Received by reason">{rows(3)}</Card>
    </>
  );
}

// ── Page body ────────────────────────────────────────────────────────────────

export default function CnReceivedMobile({ view, loading, error, monthsCount, onChangeRange, layout = "phone" }) {
  const [table, setTable] = useState(false);
  let body;
  if (error) body = <Card><div style={{ padding: "12px 0", fontSize: 13, color: M.down }}>Could not load credit notes: {error}</div></Card>;
  else if (loading) body = <LoadingCards />;
  else if (view.total.n === 0) {
    body = (
      <Card>
        <div style={{ padding: "16px 0 4px", textAlign: "center", fontSize: 14, fontWeight: 700, color: M.ink }}>No credit notes for this period</div>
        <ShowAllButton onClick={onChangeRange}>Change range</ShowAllButton>
      </Card>
    );
  } else {
    body = (
      <>
        <div>
          <Hero view={view} monthsCount={monthsCount} layout={layout} />
          <ShowAllButton onClick={() => setTable(true)}>Show monthly table →</ShowAllButton>
        </div>
        <FormatsCard view={view} />
        <PartnersCard view={view} />
        <ReasonsCard view={view} />
        <MonthSheet open={table} onClose={() => setTable(false)} view={view} />
      </>
    );
  }
  return (
    // The extra plain div keeps the card stack out of index.css's ".page-scroll > div[flex column]
    // { gap: 22px }": the Cost screens' 12px gap applies, as there.
    <div className="page-scroll" style={{ padding: 0, background: M.bg }}>
      <div>
        <div className="log-mobile ov-mobile" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, color: M.ink, padding: "12px max(12px, var(--safe-right)) 24px max(12px, var(--safe-left))" }}>
          {body}
        </div>
      </div>
    </div>
  );
}

// ── Entry on mobile Logistics → Cost → Overview ──────────────────────────────

// "CN received ₹X · Y% of invoice →" for the last 12 months with data (the CN screen's default
// range, so the two agree). Hidden if the summary can't be read.
export function CnEntryCard({ onOpen }) {
  const [t, setT] = useState(undefined); // undefined = loading, null = hidden
  useEffect(() => {
    let live = true;
    supabase.rpc("cn_received_summary").then(({ data, error }) => {
      if (!live) return;
      if (error || !data) { setT(null); return; }
      const rows = data.rows ?? [];
      setT(summarize(inMonths(rows, lastMonths([...new Set(rows.map((r) => r.month))].sort(), 12))).total);
    });
    return () => { live = false; };
  }, []);
  if (t === null) return null;
  return (
    <button type="button" onClick={onOpen} aria-label={t ? `CN received ${formatInr(t.received)}, ${formatPct(shareOf(t))} of invoice. Open` : "CN received. Open"}
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 56, padding: "12px 16px", border: "none", borderRadius: M.radius.card, background: M.card, boxShadow: M.cardShadow,
        textAlign: "left", fontFamily: "var(--font)", color: M.ink, cursor: "pointer" }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: M.type.cardTitle, fontWeight: 700 }}>CN received</span>
        <span style={{ display: "block", fontSize: 12, color: M.muted, marginTop: 1 }}>All formats · last 12 months</span>
      </span>
      <span style={{ textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        {t === undefined ? <Skeleton width={84} height={14} /> : (
          <>
            <span style={{ display: "block", fontSize: M.type.listValue, fontWeight: 700, color: M.up }}>{formatInr(t.received)}</span>
            <span style={{ display: "block", fontSize: 12, color: M.muted }}>{formatPct(shareOf(t))} of invoice</span>
          </>
        )}
      </span>
      <span aria-hidden="true" style={{ color: M.green, fontSize: 16, fontWeight: 700 }}>→</span>
    </button>
  );
}

