// Totals for the "Credit notes received" page (Cost Analytics → Overview). The database returns
// active CN totals per category × reason × partner × month (cn_received_summary,
// scripts/sql/cn/010); everything here is plain arithmetic on those rows, so it is tested
// without a browser. The page shows received CN against invoice value only; the Excel export
// (buildExport) also carries the expected amount uploaded with each CN.
import * as XLSX from "xlsx";
import { receivedShareOfInvoice } from "./format.js";

export const CATEGORIES = [
  { key: "B2C", label: "B2C couriers", reasons: ["Weight Dispute", "Lost/Damage", "SLA Breach", "High Ageing", "Wrong Invoicing"] },
  { key: "FTL/PTL", label: "FTL/PTL", reasons: ["FTL/PTL"] },
  { key: "3PL", label: "3PL", reasons: ["3PL"] },
];
export const categoryLabel = (key) => CATEGORIES.find((c) => c.key === key)?.label ?? key;

// Reasons as stored → sentence case for display.
const REASON_LABELS = { "Weight Dispute": "Weight dispute", "SLA Breach": "SLA breach", "High Ageing": "High ageing", "Wrong Invoicing": "Wrong invoicing" };
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

// filters: { months: ["YYYY-MM", …] ([] = all), category: "" | key, partner: "" | name }
export function applyFilters(rows, f) {
  const months = f.months?.length ? new Set(f.months) : null;
  return rows.filter((r) => (!months || months.has(r.month))
    && (!f.category || r.category === f.category) && (!f.partner || r.partner === f.partner));
}

export function summarize(rows) {
  const total = blank();
  const categories = CATEGORIES.map((c) => ({ ...c, total: blank(), reasons: c.reasons.map((reason) => ({ reason, total: blank() })) }));
  const byCat = Object.fromEntries(categories.map((c) => [c.key, c]));
  const months = new Map(), partners = new Map();
  for (const r of rows) {
    add(total, r);
    const c = byCat[r.category];
    if (c) {
      add(c.total, r);
      const line = c.reasons.find((x) => x.reason === r.reason);
      if (line) add(line.total, r);
    }
    if (!months.has(r.month)) months.set(r.month, { month: r.month, total: blank() });
    add(months.get(r.month).total, r);
    const pk = `${r.category}|${r.partner}`;
    if (!partners.has(pk)) partners.set(pk, { category: r.category, partner: r.partner, total: blank() });
    add(partners.get(pk).total, r);
  }
  return {
    total,
    categories,
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)), // oldest first
    // Highest received first, the order of the "Top partners" list.
    partners: [...partners.values()].sort((a, b) => b.total.received - a.total.received || a.partner.localeCompare(b.partner)),
  };
}

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
