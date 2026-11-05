// Totals for the "CN Received" page (Cost Analytics → Overview). The database returns active
// CN totals per category × reason × partner × month (cn_received_summary, scripts/sql/cn/010);
// everything here is plain arithmetic on those rows, so it is tested without a browser.
// Expected CN is carried through for the Excel export but not shown on the page.

export const CATEGORIES = [
  { key: "B2C", label: "B2C Couriers", reasons: ["Weight Dispute", "Lost/Damage", "SLA Breach", "High Ageing", "Wrong Invoicing"] },
  { key: "FTL/PTL", label: "FTL/PTL", reasons: [] },
  { key: "3PL", label: "3PL", reasons: [] },
];
export const categoryLabel = (key) => CATEGORIES.find((c) => c.key === key)?.label ?? key;

// invoice stays NULL until a row with an invoice value is added: Lost/Damage-type rows carry a
// shipment value instead, so a total built only from them has no invoice value at all.
const blank = () => ({ n: 0, invoice: null, expected: 0, received: 0 });
function add(t, r) {
  t.n += r.n;
  if (r.invoice != null) t.invoice = (t.invoice ?? 0) + Number(r.invoice);
  t.expected += Number(r.expected);
  t.received += Number(r.received);
  return t;
}

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
    // Oldest first: the chart's order. Tables sort for themselves.
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    partners: [...partners.values()],
  };
}

// A row "has CN data" if any invoice value or any received amount is above zero.
export const hasActivity = (t) => (t.invoice ?? 0) > 0 || t.received > 0;

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthName = (ym) => `${MON[Number(ym.slice(5, 7)) - 1]}-${ym.slice(0, 4)}`;
