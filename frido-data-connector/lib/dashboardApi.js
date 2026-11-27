// `dashboard_api` tool: call a dashboard /api/* endpoint server-side exactly as the page does, and return only what was asked.
// Read-only: only the listed endpoints, POST bodies with the page's own params, no write actions. The endpoint already has
// its own database connection (cost ledger, support tickets, …), so the connector needs no new DB access.
// Results are cached 30 minutes per endpoint+params (small LRU, the sales payload is ~10 MB).
import { formatValueByName, formatTsv, indianInt } from './format.js';

const DASH = process.env.DASHBOARD_URL || 'https://frido-navigator.vercel.app';
// The dashboard's login wall (middleware.js) lets NavAI read the data endpoints with its own read-only secret in
// x-navai-secret. Set NAVAI_API_SECRET on the service from Secret Manager (never in the image or the repo).
export const dashAuth = () => (process.env.NAVAI_API_SECRET ? { 'x-navai-secret': process.env.NAVAI_API_SECRET } : {});
const TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 4;   // the sales payloads are 60-70 MB
const cache = new Map(); // key -> { at, data }

// endpoint -> page. Static files are the pre-computed copies the pages read first.
export const ENDPOINTS = {
  'bq': 'Sales / Ads / P&L inputs (all channels)',
  'logistics': 'Logistics → Performance',
  'inventory': 'Inventory Health (live fallback)',
  'inventory-oos': 'Inventory → Out-of-stock loss',
  'sales-allocation': 'Inventory → Sales allocation',
  'inward': 'Inventory → Inward',
  'return-analysis': 'Sales → D2C Return Analysis',
  'returns': 'Returns summary',
  'customer': 'Customers',
  'customer-support': 'Customers → Support',
  'cogs-monthly': 'COGS per SKU per month (P&L)',
  'cat-daily': 'Category by day (Sales)',
  'courier-allocation': 'Logistics → Courier allocation',
  // Static pre-computed files the pages read first (served by the dashboard; hourly/daily cron). /api/logistics currently
  // errors in production (Clickpost column zone_by_frido missing), so Logistics → Performance comes from these files.
  'inv-data-7d': 'Inventory Health pre-computed file (7-day avg sale)',
  'inv-data-15d': 'Inventory Health pre-computed file (15-day avg sale)',
  'inv-data-30d': 'Inventory Health pre-computed file (30-day avg sale)',
  'logistics-data-forward': 'Logistics → Performance pre-computed file, forward shipments (MTD or last month; check mtdStart/mtdEnd)',
  'logistics-data': 'Logistics → Performance pre-computed file, all directions',
  'logistics-data-forward-cod': 'Logistics → Performance file, forward COD',
  'logistics-data-forward-prepaid': 'Logistics → Performance file, forward prepaid',
  'logistics-data-reverse': 'Logistics → Performance file, reverse shipments',
  'logistics-cost-data': 'Logistics → Cost pre-computed file',
  'pnl-data': 'Sales / P&L payload, month to date (same shape as api/bq)',
  'pnl-data-lastmonth': 'Sales / P&L payload, last month (same shape as api/bq)',
  'sales-alloc-data': 'Inventory → Sales allocation pre-computed file',
  'inward-data': 'Inventory → Inward pre-computed file',
  'ads-data': 'Ads pre-computed file',
};
const STATIC_FILES = new Set(Object.keys(ENDPOINTS).filter(k => /^(inv-data-|logistics-data|logistics-cost-data|pnl-data|sales-alloc-data|inward-data|ads-data)/.test(k)));

// Params that would change data or bypass the page's read path are refused.
const BLOCKED_PARAMS = new Set(['action', 'refresh', 'invalidate', '__cubeSqlOnly']);

function lru(key, data) {
  cache.set(key, { at: Date.now(), data });
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
}

export async function fetchEndpoint(endpoint, params) {
  const key = `${endpoint}|${JSON.stringify(params, Object.keys(params || {}).sort())}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return { data: hit.data, cached: true };
  let r;
  if (STATIC_FILES.has(endpoint)) {
    r = await fetch(`${DASH}/${endpoint}.json`, { headers: dashAuth(), signal: AbortSignal.timeout(150000) });
  } else {
    r = await fetch(`${DASH}/api/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...dashAuth() }, body: JSON.stringify(params || {}), signal: AbortSignal.timeout(170000) });
  }
  if (!r.ok) throw new Error(`/api/${endpoint} returned ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  lru(key, data);
  return { data, cached: false };
}

// "a.b[0].c" -> value. "*" walks every element of an array: "rows.*.sku".
function pick(obj, path) {
  const parts = String(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur = [obj];
  for (const p of parts) {
    const next = [];
    for (const c of cur) {
      if (c == null) continue;
      if (p === '*') { if (Array.isArray(c)) next.push(...c); else if (typeof c === 'object') next.push(...Object.values(c)); }
      else next.push(c[p]);
    }
    cur = next;
  }
  return parts.includes('*') ? cur : cur[0];
}

function shape(v, depth = 0, maxDepth = 2) {
  if (Array.isArray(v)) return `array[${v.length}]` + (v.length && v[0] && typeof v[0] === 'object' && depth < maxDepth ? ' of {' + Object.keys(v[0]).slice(0, 16).join(',') + '}' : '');
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (depth >= maxDepth) return `{${keys.length} keys: ${keys.slice(0, 12).join(',')}}`;
    const o = {};
    for (const k of keys.slice(0, 80)) o[k] = shape(v[k], depth + 1, maxDepth);
    return o;
  }
  return typeof v === 'number' ? `number` : typeof v;
}

const isNum = x => typeof x === 'number' && Number.isFinite(x);

// Array of flat objects -> optional groupBy/sum, sort, limit -> formatted TSV.
function tableOf(rows, { groupBy, sum, sortBy, desc = true, limit = 20, where }, seen) {
  let list = rows.filter(r => r && typeof r === 'object' && !Array.isArray(r));
  if (where && typeof where === 'object') {
    list = list.filter(r => Object.entries(where).every(([k, v]) => String(pick(r, k)) === String(v)));
  }
  const total = list.length;
  if (groupBy && sum?.length) {
    const g = new Map();
    for (const r of list) {
      const k = String(r[groupBy] ?? 'NULL');
      const e = g.get(k) || { [groupBy]: k };
      for (const f of sum) e[f] = (e[f] || 0) + (isNum(r[f]) ? r[f] : Number(r[f]) || 0);
      g.set(k, e);
    }
    list = [...g.values()];
  } else if (sum?.length) {
    const e = {};
    for (const f of sum) e[f] = list.reduce((a, r) => a + (isNum(r[f]) ? r[f] : Number(r[f]) || 0), 0);
    list = [e];
  }
  const sortKey = sortBy || (groupBy && sum?.length ? sum[0] : null);
  if (sortKey) list.sort((a, b) => (desc ? 1 : -1) * ((Number(b[sortKey]) || 0) - (Number(a[sortKey]) || 0)));
  const cut = list.slice(0, Math.min(Math.max(Number(limit) || 20, 1), 50));
  const keys = [...new Set(cut.flatMap(r => Object.keys(r)))].filter(k => cut.some(r => r[k] == null || typeof r[k] !== 'object'));
  const tsv = [keys.join('\t'), ...cut.map(r => keys.map(k => (r[k] == null ? 'NULL' : typeof r[k] === 'object' ? JSON.stringify(r[k]).slice(0, 60) : String(r[k]))).join('\t'))].join('\n');
  // Totals over ALL the rows (not just the ones shown), calculated here so the model never adds numbers itself.
  const totals = {};
  for (const k of keys) { const vals = list.map(r => r[k]); if (vals.length && vals.every(v => isNum(v))) totals[k] = vals.reduce((a, v) => a + v, 0); }
  const label = list.length > cut.length ? `TOTAL of all ${list.length} rows (calculated by the connector)` : `TOTAL of the ${cut.length} rows (calculated by the connector)`;
  return { text: formatTsv(tsv, seen, { totals, totalLabel: label }), total, shown: cut.length };
}

function scalarText(v, name, seen) {
  if (isNum(v)) { const f = formatValueByName(name, v, seen); return f; }
  if (v && typeof v === 'object') return JSON.stringify(v).slice(0, 4000);
  return String(v);
}

// Inventory Health "Regular" view straight from the pre-computed file: per location (optionally one SKU / one location),
// the sum of pivot.rows[*].byLocation[loc].byFacilityType.Regular — exactly what the page's Regular tiles/pivot show.
function regularView(data, { sku, location }, seen) {
  const rows = data?.pivot?.rows;
  if (!Array.isArray(rows)) return null;
  const want = sku ? String(sku).toUpperCase() : null;
  const byLoc = {};
  for (const r of rows) {
    if (want && String(r.sku).toUpperCase() !== want) continue;
    for (const [loc, v] of Object.entries(r.byLocation || {})) {
      if (location && loc !== location) continue;
      byLoc[loc] = (byLoc[loc] || 0) + (v?.byFacilityType?.Regular || 0);
    }
  }
  const total = Object.values(byLoc).reduce((a, b) => a + b, 0);
  const lines = Object.entries(byLoc).filter(([, n]) => n || !want).sort((a, b) => b[1] - a[1]).map(([l, n]) => { seen?.add(indianInt(n)); return l + '	' + indianInt(n); });
  seen?.add(indianInt(total));
  const sep = String.fromCharCode(10);
  return ['Regular facilities only (Inventory Health Regular view)' + (want ? ' · SKU ' + sku : ''), 'location	units', ...lines, 'TOTAL	' + indianInt(total), 'snapshot: ' + (data.lastSnapshotUpdated || data.asOf || 'n/a')].join(sep);
}

// Areas whose numbers have been checked against known dashboard values are listed in DASHBOARD_API_VERIFIED
// (comma-separated endpoint names; "bq:ads" for the Ads block of bq). Everything else is served as UNVERIFIED and the
// model must start its answer with "Unverified, please cross-check <page>:".
const verifiedSet = () => new Set((process.env.DASHBOARD_API_VERIFIED || '').split(',').map(x => x.trim()).filter(Boolean));
function verificationLine(endpoint, args) {
  const v = verifiedSet();
  const paths = args.paths || [];
  let key = endpoint;
  let page = ENDPOINTS[endpoint];
  if (endpoint === 'bq' && (args.params?.adsMonthly || paths.some(p => /^ads/.test(p)))) { key = 'bq:ads'; page = 'Ads tab'; }
  else if (endpoint === 'bq' && paths.some(p => /^(pnl|flipkart|myntra|ebo|blinkit|zepto|instamart|cred|firstcry|offline|international)/.test(p))) { key = 'bq:pnl'; page = 'P&L tab'; }
  return v.has(key)
    ? 'VERIFICATION: verified against known dashboard values for this area.'
    : `VERIFICATION: UNVERIFIED. Start your answer with exactly "Unverified, please cross-check ${page}:" and then give the numbers.`;
}

export async function runDashboardApi(args = {}, seen) {
  const endpoint = String(args.endpoint || '').replace(/^\/?api\//, '').replace(/\.json$/, '');
  if (!(endpoint in ENDPOINTS)) return { text: `Unknown endpoint "${args.endpoint}". Allowed: ${Object.keys(ENDPOINTS).join(', ')}.` };
  const params = { ...(args.params || {}) };
  for (const k of Object.keys(params)) if (BLOCKED_PARAMS.has(k)) return { text: `Parameter "${k}" is not allowed (read-only).` };
  const { data, cached } = await fetchEndpoint(endpoint, params);
  const head = `dashboard_api ${endpoint} (${ENDPOINTS[endpoint]}) · params ${JSON.stringify(params)}${cached ? ' · cached' : ''}
${verificationLine(endpoint, args)}`;
  if (args.regular) {
    const t = regularView(data, args.regular === true ? {} : args.regular, seen);
    if (t) return { text: `${head}
${t}` };
    return { text: `${head}
regular view needs an inventory file (inv-data-7d/15d/30d).` };
  }
  if (args.describe || !args.paths?.length) {
    return { text: `${head}\nResponse structure (depth 2; use "paths" to read values):\n${JSON.stringify(shape(data), null, 1).slice(0, 12000)}` };
  }
  const out = [head];
  for (const path of args.paths.slice(0, 8)) {
    const v = pick(data, path);
    out.push(`\n== ${path}`);
    if (Array.isArray(v)) {
      if (v.length && v.every(x => x && typeof x === 'object' && !Array.isArray(x))) {
        const t = tableOf(v, args, seen);
        out.push(`(${t.shown} of ${t.total} rows${args.groupBy ? ', grouped' : ''})\n${t.text}`);
      } else out.push(JSON.stringify(v.slice(0, Math.min(Number(args.limit) || 20, 50))));
    } else if (v && typeof v === 'object') {
      out.push(Object.entries(v).slice(0, 80).map(([k, x]) => `${k}\t${scalarText(x, k, seen)}`).join('\n'));
    } else if (v === undefined) out.push('(no such path — run with describe:true to see the structure)');
    else out.push(scalarText(v, path.split('.').pop(), seen));
  }
  return { text: out.join('\n').slice(0, 60000) };
}
