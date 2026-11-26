// A product question ("Posture corrector inward this month", "Sandals sales last month") is answered with numbers the connector
// calculates itself, from the pages' own data, so the model only words the result. It never adds, divides or compares numbers.
//   inward: the Inventory → Inward page data (POST /api/inward, filtered to the matched sub-categories / SKU), previous period included
//   sales : the Sales page's category / sub-category query (lib/salesCategorySql.js), units, orders and gross revenue
// Pure parts (detectMetric, parsePeriod, build*) are unit-tested; the data comes in through `deps` so tests need no network.
import { indianInt, formatRupees } from './format.js';
import { SALES_CATEGORY_SQL } from './salesCategorySql.js';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function detectMetric(text) {
  const t = String(text).toLowerCase();
  const inward = /\b(inward|inwarded|inwards|grn|grns|received)\b/.test(t);
  const sales = /\b(sales|sale|sold|selling|revenue|gmv)\b/.test(t);
  if (inward === sales) return null; // neither, or both: the model handles it
  return inward ? 'inward' : 'sales';
}

// IST "today" as YYYY-MM-DD.
export const istToday = (now = Date.now()) => new Date(now + 5.5 * 3600e3).toISOString().slice(0, 10);

export function parsePeriod(text, today = istToday()) {
  const t = String(text).toLowerCase();
  const [y, m] = today.split('-').map(Number);
  const label = (a, b) => (a === b ? fmtDate(a) : `${fmtDate(a)} to ${fmtDate(b)}`);
  const mk = (start, end) => ({ start, end, label: label(start, end) });
  if (/\bthis month\b|\bmonth to date\b|\bmtd\b/.test(t)) return mk(iso(y, m, 1), today);
  if (/\blast month\b|\bprevious month\b/.test(t)) { const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1; return { start: iso(py, pm, 1), end: iso(py, pm, lastDay(py, pm)), label: `${MONTH_NAMES[pm - 1]} ${py}` }; }
  if (/\byesterday\b/.test(t)) { const d = addDays(today, -1); return mk(d, d); }
  if (/\btoday\b/.test(t)) return mk(today, today);
  const n = t.match(/\blast (\d{1,3}) days\b/);
  if (n) return mk(addDays(today, -Number(n[1])), addDays(today, -1));
  const mm = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[\s,-]*(?:(20\d\d)\b)?/);
  if (mm) {
    const idx = MONTHS.indexOf(mm[1]) + 1;
    const yy = mm[2] ? Number(mm[2]) : (idx > m ? y - 1 : y);
    const end = yy === y && idx === m ? today : iso(yy, idx, lastDay(yy, idx));
    return { start: iso(yy, idx, 1), end, label: `${MONTH_NAMES[idx - 1]} ${yy}` };
  }
  return null;
}
function fmtDate(s) { const [y, m, d] = s.split('-').map(Number); return `${d} ${MONTH_NAMES[m - 1]} ${y}`; }
const rangeLabel = p => (p.label.includes(' to ') ? `${p.label.split(' to ')[0].replace(/ \d{4}$/, '')}–${p.label.split(' to ')[1]}` : p.label);

const pctChange = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);
const arrow = p => (p == null ? 'n/a' : `${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(1)}%`);
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map((h, i) => (i ? '---:' : '---')).join('|')}|`, ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n');

// ── inward ───────────────────────────────────────────────────────────────────────────────────────────────────
// deps.inward(body) -> the /api/inward response. mention: one entry of matchProducts().mentions.
export async function computeInward(mention, period, deps) {
  const subs = mention.kind === 'sku' ? null : mention.matches.map(m => m.sub);
  const base = { start: period.start, end: period.end };
  const filter = mention.kind === 'sku' ? { sku: mention.matches[0].sku } : { subCategory: subs };
  const all = await deps.inward({ ...base, ...filter });
  const cur = all?.kpis?.cur, prev = all?.kpis?.prev;
  if (!cur) return null;
  const rows = [];
  if (mention.kind === 'sku') {
    const r = (all.skus || []).find(s => s.sku === mention.matches[0].sku);
    rows.push({ name: mention.matches[0].sku, units: r?.units ?? cur.units, rej: r?.rejected ?? cur.rejected, grns: cur.grns, skus: 1 });
  } else {
    const by = new Map();
    for (const s of all.skus || []) {
      if (!(s.units > 0 || s.rejected > 0)) continue;
      const e = by.get(s.subCategory) || { units: 0, rej: 0, skus: 0 };
      e.units += s.units || 0; e.rej += s.rejected || 0; e.skus += 1; by.set(s.subCategory, e);
    }
    const one = subs.length <= 8;
    for (const sub of subs) {
      const e = by.get(sub) || { units: 0, rej: 0, skus: 0 };
      let grns = null;
      if (one) { const r = subs.length === 1 ? all : await deps.inward({ ...base, subCategory: [sub] }); grns = r?.kpis?.cur?.grns ?? null; }
      rows.push({ name: sub, units: e.units, rej: e.rej, grns, skus: e.skus });
    }
    rows.sort((a, b) => b.units - a.units || a.name.localeCompare(b.name));
  }
  const units = rows.reduce((a, r) => a + r.units, 0), rej = rows.reduce((a, r) => a + r.rej, 0);
  const total = { units, rej, grns: cur.grns, skus: cur.skus };
  const when = rangeLabel(period);
  const what = mention.kind === 'sku' ? `${mention.matches[0].sku} (${mention.matches[0].sub})` : subs.length === 1 ? `${subs[0]}, ${mention.matches[0].skus.length} SKU${mention.matches[0].skus.length === 1 ? '' : 's'}` : `${mention.text} (${subs.length} products)`;
  const head = `**${what}: ${indianInt(units)} units inward, ${when}** · ${indianInt(cur.grns)} GRN${cur.grns === 1 ? '' : 's'} · ${indianInt(rej)} rejected`;
  const vs = prev && prev.units != null ? `Previous equal period: ${indianInt(prev.units)} units (${arrow(pctChange(units, prev.units))}).` : '';
  const lines = [head];
  if (rows.length > 1 || mention.kind !== 'sku') {
    const withGrns = rows.some(r => r.grns != null);
    const t = table(withGrns ? ['Product', 'Units', 'GRNs', 'Rejected'] : ['Product', 'Units', 'Rejected'],
      [...rows.map(r => (withGrns ? [r.name, indianInt(r.units), r.grns == null ? '—' : indianInt(r.grns), indianInt(r.rej)] : [r.name, indianInt(r.units), indianInt(r.rej)])),
        withGrns ? ['**Total**', `**${indianInt(units)}**`, `**${indianInt(cur.grns)}**`, `**${indianInt(rej)}**`] : ['**Total**', `**${indianInt(units)}**`, `**${indianInt(rej)}**`]]);
    lines.push('', t);
  }
  if (vs) lines.push('', vs);
  lines.push('', 'Source: Inventory → Inward · finished goods only · GRN count in the Total row counts each GRN once.');
  if (mention.kind === 'several') lines.push('', 'Tell me which one you meant.');
  return { kind: 'inward', text: lines.join('\n'), total };
}

// ── sales ────────────────────────────────────────────────────────────────────────────────────────────────────
// deps.salesRows(start, end) -> rows of the Sales page's category query { sub_category, orders, units, gross_revenue, ... }
export async function computeSales(mention, period, deps) {
  const rowsAll = await deps.salesRows(period.start, period.end);
  const wanted = mention.kind === 'sku' ? null : new Set(mention.matches.map(m => m.sub));
  if (mention.kind === 'sku') return null; // the category query is by sub-category; a SKU question goes to the model + tools
  const by = new Map();
  for (const r of rowsAll) {
    if (!wanted.has(r.sub_category)) continue;
    const e = by.get(r.sub_category) || { orders: 0, units: 0, gross: 0 };
    e.orders += Number(r.orders) || 0; e.units += Number(r.units) || 0; e.gross += Number(r.gross_revenue) || 0; by.set(r.sub_category, e);
  }
  const list = [...by].map(([name, e]) => ({ name, ...e })).sort((a, b) => b.units - a.units || a.name.localeCompare(b.name));
  if (!list.length) return null;
  const sum = k => list.reduce((a, r) => a + r[k], 0);
  const total = { units: sum('units'), orders: sum('orders'), gross: sum('gross'), products: list.length };
  const shown = list.slice(0, 10), rest = list.slice(10);
  const row = r => [r.name, indianInt(r.units), indianInt(r.orders), formatRupees(r.gross)];
  const body = shown.map(row);
  if (rest.length) body.push([`Other ${rest.length} products`, indianInt(rest.reduce((a, r) => a + r.units, 0)), indianInt(rest.reduce((a, r) => a + r.orders, 0)), formatRupees(rest.reduce((a, r) => a + r.gross, 0))]);
  body.push(['**Total**', `**${indianInt(total.units)}**`, `**${indianInt(total.orders)}**`, `**${formatRupees(total.gross)}**`]);
  const what = list.length === 1 ? `${list[0].name}, ${mention.matches[0].skus.length} SKU${mention.matches[0].skus.length === 1 ? '' : 's'}` : `${mention.text} (${mention.matches.length} products match, ${list.length} had sales)`;
  const lines = [`**${what}: ${indianInt(total.units)} units sold, ${formatRupees(total.gross)} gross revenue, ${period.label.includes(' to ') ? rangeLabel(period) : period.label}** · ${indianInt(total.orders)} orders`, '',
    table(['Product', 'Units', 'Orders', 'Gross revenue'], body), '',
    'Source: Sales → category / sub-category table (order value before cancellations and returns).'];
  if (mention.kind === 'several') lines.push('', 'Tell me which one you meant.');
  return { kind: 'sales', text: lines.join('\n'), total };
}

// question + the product match -> { text, kind, total } or null (not a product inward/sales question, or the data is not available)
export async function computeProductMetric(question, matchResult, deps, today = istToday()) {
  try {
    const mentions = matchResult?.mentions || [];
    if (mentions.length !== 1) return null;
    const metric = detectMetric(question);
    const period = parsePeriod(question, today);
    if (!metric || !period) return null;
    return metric === 'inward' ? await computeInward(mentions[0], period, deps) : await computeSales(mentions[0], period, deps);
  } catch (e) {
    console.error('Product metric skipped:', String(e.message).slice(0, 160));
    return null;
  }
}

// Real data sources (the pages' own): the dashboard's /api/inward and the Sales category query on BigQuery.
export function liveDeps({ fetchEndpoint, getBQ }) {
  return {
    inward: async body => (await fetchEndpoint('inward', body)).data,
    salesRows: async (start, end) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new Error('bad date');
      const sql = SALES_CATEGORY_SQL.replace(/__START__/g, start).replace(/__END__/g, end);
      const [rows] = await getBQ().query({ query: sql, maximumBytesBilled: String(20 * 1024 ** 3) });
      return rows;
    },
  };
}
