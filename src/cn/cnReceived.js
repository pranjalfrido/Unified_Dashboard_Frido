// Totals for the "Credit notes received" page (Cost Analytics → Overview). The database returns
// active CN totals per category × reason × partner × month (cn_received_summary,
// scripts/sql/cn/010); everything here is plain arithmetic on those rows, so it is tested
// without a browser. The page is one summary across all three formats (B2C couriers, FTL/PTL,
// 3PL) and shows received CN against invoice value only; the Excel export (buildExport) also
// carries the expected amount uploaded with each CN.
import * as XLSX from "xlsx";
import { receivedShareOfInvoice } from "./format.js";

export const CATEGORIES = [
  { key: "B2C", label: "B2C couriers", reasons: ["Weight Dispute", "Lost/Damage", "SLA Breach", "High Ageing", "Wrong Invoicing"] },
  { key: "FTL/PTL", label: "FTL/PTL", reasons: ["Wrong Billing"] },
  { key: "3PL", label: "3PL", reasons: ["Wrong Billing"] },
];
// FTL/PTL and 3PL uploads have no reason column; the database gives their format's name as the
// reason, and those CNs are all billing corrections, so they are shown as "Wrong billing".
const reasonOf = (r) => (CATEGORIES.some((c) => c.key === r.reason) ? "Wrong Billing" : r.reason);
export const categoryLabel = (key) => CATEGORIES.find((c) => c.key === key)?.label ?? key;

// Reasons as stored → sentence case for display.
const REASON_LABELS = { "Weight Dispute": "Weight dispute", "SLA Breach": "SLA breach", "High Ageing": "High ageing", "Wrong Invoicing": "Wrong invoicing", "Wrong Billing": "Wrong billing" };
export const reasonLabel = (r) => REASON_LABELS[r] ?? r;
// Lost/Damage-type claims are against a shipment's value, not an invoice.
export const SHIPMENT_VALUE_REASONS = new Set(["Lost/Damage", "SLA Breach", "High Ageing", "Wrong Invoicing"]);

// invoice stays NULL until a row with an invoice value is added: shipment-value reasons have none.
const blank = () => ({ n: 0, invoice: null, expected: 0, received: 0 });
function add(t, r) {
  t.n += r.n;
  if (r.invoice != null) t.invoice = (t.invoice ?? 0) + Number(r.invoice);
  t.expected += Number(r.expected);
  t.received += Number(r.received);
  return t;
}
export const shareOf = (t) => receivedShareOfInvoice(t.received, t.invoice);

// The last `n` months that have data, oldest first ("YYYY-MM").
export const lastMonths = (months, n = 12) => [...months].sort().slice(-n);

// The rows of the selected invoice months ("YYYY-MM"); an empty or missing list means all.
export function inMonths(rows, months) {
  const keep = months?.length ? new Set(months) : null;
  return keep ? rows.filter((r) => keep.has(r.month)) : rows;
}

const byCatBlank = () => Object.fromEntries(CATEGORIES.map((c) => [c.key, blank()]));

// One pass over the rows. Every month and every reason also keeps its split by format
// (byCat), and every partner its split by reason, for the per-format views.
export function summarize(rows) {
  const total = blank();
  const categories = CATEGORIES.map((c) => ({ ...c, total: blank(), reasons: c.reasons.map((reason) => ({ reason, total: blank() })) }));
  const byCat = Object.fromEntries(categories.map((c) => [c.key, c]));
  const months = new Map(), partners = new Map(), reasons = new Map();
  for (const row of rows) {
    const r = { ...row, reason: reasonOf(row) };
    add(total, r);
    const c = byCat[r.category];
    if (c) {
      add(c.total, r);
      const line = c.reasons.find((x) => x.reason === r.reason);
      if (line) add(line.total, r);
    }
    if (!months.has(r.month)) months.set(r.month, { month: r.month, total: blank(), byCat: byCatBlank() });
    const m = months.get(r.month);
    add(m.total, r);
    if (m.byCat[r.category]) add(m.byCat[r.category], r);
    if (!reasons.has(r.reason)) reasons.set(r.reason, { reason: r.reason, total: blank(), byCat: byCatBlank() });
    const rs = reasons.get(r.reason);
    add(rs.total, r);
    if (rs.byCat[r.category]) add(rs.byCat[r.category], r);
    const pk = `${r.category}|${r.partner}`;
    if (!partners.has(pk)) partners.set(pk, { category: r.category, partner: r.partner, total: blank(), reasons: {} });
    const p = partners.get(pk);
    add(p.total, r);
    p.reasons[r.reason] = add(p.reasons[r.reason] ?? blank(), r);
  }
  const byReceived = (a, b) => b.total.received - a.total.received;
  return {
    total,
    categories,
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)), // oldest first
    // Highest received first: the order of "Top partners" and "Received by reason".
    partners: [...partners.values()].sort((a, b) => byReceived(a, b) || a.partner.localeCompare(b.partner)),
    reasons: [...reasons.values()].sort((a, b) => byReceived(a, b) || a.reason.localeCompare(b.reason)),
  };
}

// The partner of a format with the most received CN; null when none received anything.
export function topPartner(view, categoryKey) {
  const p = view.partners.find((x) => x.category === categoryKey);
  return p && p.total.received > 0 ? p : null;
}

// The reason with the most received CN among { reason: total } entries; null when none received anything.
export function topReason(reasonTotals) {
  let best = null;
  for (const [reason, t] of Object.entries(reasonTotals)) {
    if (t.received > 0 && (!best || t.received > best.received)) best = { reason, received: t.received };
  }
  return best?.reason ?? null;
}
export const categoryReasons = (c) => Object.fromEntries(c.reasons.map((x) => [x.reason, x.total]));

// Partners for the phone "Top partners" card, ranked by its chip: received, % of invoice, or the
// amount of the partner's top reason. Partners with no CN in the range are kept apart, by name.
export function rankPartners(view, by = "received") {
  const rows = view.partners.map((p) => {
    const reason = topReason(p.reasons);
    return { ...p, reason, reasonReceived: reason ? p.reasons[reason].received : 0, pct: shareOf(p.total) };
  });
  const key = { received: (x) => x.total.received, pct: (x) => x.pct ?? -1, reason: (x) => x.reasonReceived }[by];
  return {
    withCn: rows.filter((x) => x.total.received > 0).sort((a, b) => key(b) - key(a) || a.partner.localeCompare(b.partner)),
    none: rows.filter((x) => x.total.received === 0).sort((a, b) => a.partner.localeCompare(b.partner)),
  };
}

// The calendar month in India, "YYYY-MM": its bar is still filling, so it gets a lighter tint.
export const currentMonth = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 7);

// A month "has CN data" if any invoice value or any received amount is above zero.
export const hasActivity = (t) => (t.invoice ?? 0) > 0 || t.received > 0;

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthName = (ym) => `${MON[Number(ym.slice(5, 7)) - 1]}-${ym.slice(0, 4)}`;

// Excel export of the selection: by category and reason, by month, by partner. Includes the
// expected amount uploaded with each CN, which the page itself does not display.
export function buildExport(view) {
  const r2 = (v) => (v == null ? "" : Math.round(v * 100) / 100);
  const head = (first) => [...first, "Invoice value", "Expected CN", "Received CN", "Received % of invoice"];
  const vals = (t) => [r2(t.invoice), r2(t.expected), r2(t.received), shareOf(t) == null ? "" : Math.round(shareOf(t) * 1000) / 10];
  const wb = XLSX.utils.book_new();
  const cat = view.categories.filter((c) => c.total.n > 0)
    .flatMap((c) => [[c.label, "", ...vals(c.total)], ...c.reasons.filter((x) => x.total.n > 0).map((x) => ["", reasonLabel(x.reason), ...vals(x.total)])]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head(["Category", "Reason"]), ...cat, ["Total", "", ...vals(view.total)]]), "By category");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head(["Month"]), ...[...view.months].reverse().map((m) => [monthName(m.month), ...vals(m.total)])]), "By month");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head(["Category", "Partner"]), ...view.partners.map((p) => [categoryLabel(p.category), p.partner, ...vals(p.total)])]), "By partner");
  return wb;
}
