// `cn_received` tool: Logistics → Cost Analytics → Overview → "CN Received" page (route /logistics/cn_received).
// The page has no /api endpoint: the browser calls the read-only Supabase function cn_received_summary() (scripts/sql/cn/010 in the
// dashboard repo) and does plain arithmetic on its rows (src/cn/cnReceived.js). This file runs the same query (SELECT only, read-only
// transaction, active rows only) and the same arithmetic. TEMPORARY COPY of that page logic, like lib/pnlTool.js (docs/BACKLOG.md).
// Totals only: the page never shows individual credit notes, so neither does this tool.
import { queryRows } from './supabase.js';
import { formatRupees, indianInt } from './format.js';

const CATEGORIES = [
  { key: 'B2C', label: 'B2C couriers' }, { key: 'FTL/PTL', label: 'FTL/PTL' }, { key: '3PL', label: '3PL' },
];
// FTL/PTL and 3PL uploads have no reason column; the page shows them as "Wrong billing" (cnReceived.js reasonOf).
const reasonOf = r => (CATEGORIES.some(c => c.key === r.reason) ? 'Wrong billing' : r.reason);
const REASON_LABELS = { 'Weight Dispute': 'Weight dispute', 'SLA Breach': 'SLA breach', 'High Ageing': 'High ageing', 'Wrong Invoicing': 'Wrong invoicing', 'Wrong Billing': 'Wrong billing' };
const reasonLabel = r => REASON_LABELS[r] ?? r;

// Exactly the UNION of cn_received_summary(), with an optional month range on d.month (a date, first of the month).
export const CN_SQL = (from, to) => {
  const w = alias => `${alias}.is_active${from ? ` AND ${alias}.month >= '${from}-01'::date` : ''}${to ? ` AND ${alias}.month <= '${to}-01'::date` : ''}`;
  return `
SELECT 'B2C' AS category, 'Weight Dispute' AS reason, c.name AS partner, to_char(d.month, 'YYYY-MM') AS month,
       count(*)::int AS n, sum(d.invoice_value) AS invoice, sum(d.expected_cn) AS expected, sum(d.received_cn) AS received
  FROM public.cn_weight_dispute d JOIN public.cn_couriers c ON c.id = d.courier_id WHERE ${w('d')} GROUP BY 1, 2, 3, 4
UNION ALL
SELECT 'B2C', d.reason, c.name, to_char(d.month, 'YYYY-MM'),
       count(*)::int, NULL, sum(d.expected_cn), sum(COALESCE(d.cn_received_amt, 0))
  FROM public.cn_lost_damage d JOIN public.cn_couriers c ON c.id = d.courier_id WHERE ${w('d')} GROUP BY 1, 2, 3, 4
UNION ALL
SELECT 'FTL/PTL', 'FTL/PTL', t.name, to_char(d.month, 'YYYY-MM'),
       count(*)::int, sum(d.invoice_value), sum(d.expected_cn), sum(d.received_cn)
  FROM public.cn_ftl_ptl d JOIN public.cn_transporters t ON t.id = d.transporter_id WHERE ${w('d')} GROUP BY 1, 2, 3, 4
UNION ALL
SELECT '3PL', '3PL', p.name, to_char(d.month, 'YYYY-MM'),
       count(*)::int, sum(d.invoice_value), sum(d.expected_cn), sum(d.received_cn)
  FROM public.cn_3pl d JOIN public.cn_3pl_partners p ON p.id = d.partner_id WHERE ${w('d')} GROUP BY 1, 2, 3, 4`;
};

const blank = () => ({ n: 0, invoice: null, expected: 0, received: 0 });
function add(t, r) {
  t.n += Number(r.n);
  if (r.invoice != null) t.invoice = (t.invoice ?? 0) + Number(r.invoice);
  t.expected += Number(r.expected ?? 0);
  t.received += Number(r.received ?? 0);
  return t;
}
const share = t => (t.invoice == null || Number(t.invoice) === 0 ? null : t.received / t.invoice);   // receivedShareOfInvoice
let SEEN = null;   // formatted figures the answer may quote (same guard the other tools feed)
const money = n => { if (n == null) return '—'; const f = formatRupees(n); if (SEEN) SEEN.add(f); return `${f} (raw ${Math.round(n)})`; };
const pct = s => (s == null ? '—' : `${(s * 100).toFixed(1)}%`);
const monthLabel = ym => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(ym.slice(5, 7)) - 1] + '-' + ym.slice(0, 4);

export function summarizeCn(rawRows) {
  const total = blank(), cats = new Map(), reasons = new Map(), partners = new Map(), months = new Map();
  const bump = (map, key, row, init) => { if (!map.has(key)) map.set(key, init); return add(map.get(key).t, row); };
  for (const raw of rawRows) {
    const r = { ...raw, reason: reasonOf(raw) };
    add(total, r);
    bump(cats, r.category, r, { category: r.category, t: blank() });
    bump(reasons, r.reason, r, { reason: r.reason, t: blank() });
    bump(partners, `${r.category}|${r.partner}`, r, { category: r.category, partner: r.partner, t: blank() });
    bump(months, r.month, r, { month: r.month, t: blank() });
  }
  const byRec = (a, b) => b.t.received - a.t.received;
  return {
    total,
    categories: CATEGORIES.map(c => ({ ...c, t: cats.get(c.key)?.t ?? blank() })),
    reasons: [...reasons.values()].sort(byRec),
    partners: [...partners.values()].sort((a, b) => byRec(a, b) || a.partner.localeCompare(b.partner)),
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}

const row = (label, t) => `${label}\t${indianInt(t.n)}\t${money(t.invoice)}\t${money(t.received)}\t${pct(share(t))}`;
const HEAD = 'cn_count\tinvoice_value\treceived_cn\treceived_pct_of_invoice';

export async function runCnTool(args = {}, seen) {
  SEEN = seen || null;
  const ym = /^\d{4}-\d{2}$/;
  let from = ym.test(String(args.from || args.month || '')) ? String(args.from || args.month) : null;
  let to = ym.test(String(args.to || args.month || '')) ? String(args.to || args.month) : null;
  if (from && to && from > to) [from, to] = [to, from];
  const rows = await queryRows(CN_SQL(from, to));
  const s = summarizeCn(rows);
  const scope = from || to ? `${from ? monthLabel(from) : 'earliest'} to ${to ? monthLabel(to) : 'latest'}` : 'all months';
  if (!s.total.n) {
    // Say which months do have data (the page's month picker only offers those), so "last month" can be answered honestly.
    const have = [...new Set((await queryRows(CN_SQL())).map(r => r.month))].sort();
    return { text: `CN Received · ${scope}: no credit notes uploaded for this period.${have.length ? ` Months with CN data on the page: ${have.slice(-6).map(monthLabel).join(', ')} (latest: ${monthLabel(have[have.length - 1])}). Say that, and offer the latest month.` : ''}` };
  }
  const lines = [
    `Logistics → Cost Analytics → CN Received · invoice months ${scope} · as the CN Received page computes it (totals only; individual credit notes are not on this page)`,
    'DEFINITIONS: received_cn = credit-note amount received; invoice_value = the invoice amount uploaded with the CN (blank for Lost/Damage, SLA breach, High ageing and Wrong invoicing, which are claims against a shipment value); received_pct_of_invoice = received ÷ invoice. "expected_cn" is the amount uploaded as expected; it is in the page\'s Excel export, not on screen.',
    `\nTOTAL\t${HEAD}`, row('all formats', s.total),
    `\nBY FORMAT\t${HEAD}`, ...s.categories.map(c => row(c.label, c.t)),
    `\nBY REASON (all formats, highest received first)\t${HEAD}`, ...s.reasons.map(r => row(reasonLabel(r.reason), r.t)),
    `\nBY PARTNER (highest received first)\tcn_count\tinvoice_value\treceived_cn\treceived_pct_of_invoice\texpected_cn\texpected_minus_received`,
    ...s.partners.slice(0, 25).map(p => `${p.partner} (${p.category})\t${indianInt(p.t.n)}\t${money(p.t.invoice)}\t${money(p.t.received)}\t${pct(share(p.t))}\t${money(p.t.expected)}\t${money(p.t.expected - p.t.received)}`),
  ];
  if (s.partners.length > 25) lines.push(`[${s.partners.length - 25} more partners not shown]`);
  if (s.months.length > 1) lines.push(`\nBY INVOICE MONTH\t${HEAD}`, ...s.months.map(m => row(monthLabel(m.month), m.t)));
  lines.push('\nNOT ON THIS PAGE (say so, do not invent): which individual credit notes are still open or pending, ageing of credit notes, per-CN lists. expected_minus_received is a derived gap (the page itself only shows received vs invoice).');
  return { text: lines.join('\n') };
}
