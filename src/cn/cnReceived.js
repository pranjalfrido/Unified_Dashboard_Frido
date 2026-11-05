// Totals for the "CN Received" page (Cost Analytics → Overview). The database returns active
// CN totals per category × reason × partner × month (cn_received_summary, scripts/sql/cn/010);
// everything here is plain arithmetic on those rows, so it is tested without a browser.

export const CATEGORIES = [
  { key: "B2C", label: "B2C Couriers", reasons: ["Weight Dispute", "Lost/Damage", "SLA Breach", "High Ageing", "Wrong Invoicing"] },
  { key: "FTL/PTL", label: "FTL/PTL", reasons: [] },
  { key: "3PL", label: "3PL", reasons: [] },
];

const blank = () => ({ n: 0, invoice: 0, hasInvoice: false, expected: 0, received: 0 });
function add(t, r) {
  t.n += r.n;
  if (r.invoice != null) { t.invoice += Number(r.invoice); t.hasInvoice = true; }
  t.expected += Number(r.expected);
  t.received += Number(r.received);
  return t;
}
// Pending can go below zero when a partner credits more than was claimed; it is shown as is.
export const pendingOf = (t) => t.expected - t.received;
export const recoveryOf = (t) => (t.expected > 0 ? t.received / t.expected : null);
export const shareOfInvoice = (t) => (t.hasInvoice && t.invoice > 0 ? t.received / t.invoice : null);

// filters: { from: "YYYY-MM" | "", to: "YYYY-MM" | "", category: "" | "B2C" | "FTL/PTL" | "3PL", partner: "" | name }
export function applyFilters(rows, f) {
  return rows.filter((r) => (!f.from || r.month >= f.from) && (!f.to || r.month <= f.to)
    && (!f.category || r.category === f.category) && (!f.partner || r.partner === f.partner));
}

export function summarize(rows) {
  const total = blank();
  // Category blocks with their reasons, in the order of finance's CN sheet.
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
    if (!months.has(r.month)) months.set(r.month, { month: r.month, total: blank(), cats: Object.fromEntries(CATEGORIES.map((x) => [x.key, blank()])) });
    const m = months.get(r.month);
    add(m.total, r);
    if (m.cats[r.category]) add(m.cats[r.category], r);
    const pk = `${r.category}|${r.partner}`;
    if (!partners.has(pk)) partners.set(pk, { category: r.category, partner: r.partner, total: blank() });
    add(partners.get(pk).total, r);
  }
  return {
    total,
    categories,
    months: [...months.values()].sort((a, b) => b.month.localeCompare(a.month)),
    // Largest outstanding first: that is what someone opening this page wants to chase.
    partners: [...partners.values()].sort((a, b) => pendingOf(b.total) - pendingOf(a.total) || a.partner.localeCompare(b.partner)),
  };
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthName = (ym) => `${MON[Number(ym.slice(5, 7)) - 1]}-${ym.slice(0, 4)}`;
