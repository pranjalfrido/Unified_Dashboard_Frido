// `inventory_opportunity` tool: which sub-categories hold stock beyond N days of cover (push for sale / liquidate), read-only.
// Same stock and same valuation rule as the Inventory cost card (lib/inventoryCost.js): Regular facilities, value = own COGS x units,
// else the sub-category average COGS, else not valued. Every number is calculated here; the model only copies.
//
// Per SKU (stock > 0):  stock, value at cost, B2C avg daily sale (30 and 7 days, from the Inventory Health files), 90-day avg
//   (units sold in the last 90 days from sales_90d / 90: that table may include non-B2C channels, so it is labelled), DOI = floor(stock / avg),
//   last sale date, ever-sold flag, excess = max(0, stock - cover_days x avg), excess value = excess x COGS per unit.
// Excluded, and listed by exact name: never-sold SKUs ("never live"), spare parts and covers (knowledge/liquidation-config.json), anything the user excludes.
// Sub-categories are ranked by excess value (or DOI / stock value); the high-value group (default Mobility, Ergo Furniture) is a separate list.
import { regularRows, valueRow, buildCogs } from './inventoryCost.js';
import { formatTsv, indianInt, formatRupees } from './format.js';

// Selling price and 60/90-day units: one BigQuery query on the consumer-channel sales table (every channel in it is B2C: Shopify, Amazon,
// Flipkart, Myntra, Blinkit ... offline/EBO stores), the dashboard's MasterSKU, same exclusions as the Gross Revenue formula.
// ASP = SellingPrice_Exc_GST / ItemQty over the last 90 days: the price after discounts, before cancellations and returns (as on the Sales page).
export const SALES_SQL = `SELECT COALESCE(
    NULLIF(REGEXP_REPLACE(UPPER(TRIM(masterskucode)), r'[^A-Z0-9-]', ''), ''),
    NULLIF(REGEXP_REPLACE(UPPER(TRIM(ChannelSKUCode)), r'[^A-Z0-9-]', ''), ''),
    NULLIF(REGEXP_REPLACE(UPPER(TRIM(ProductId)), r'[^A-Z0-9-]', ''), '')) AS sku,
  SUM(ItemQty) AS units_90d,
  SUM(IF(OrderDate >= DATE_SUB(CURRENT_DATE('Asia/Kolkata'), INTERVAL 60 DAY), ItemQty, 0)) AS units_60d,
  SUM(SellingPrice_Exc_GST) AS rev_exc_90d,
  SUM(SellingPrice_Inc_GST) AS rev_inc_90d,
  MAX(OrderDate) AS last_order_date
FROM \`frido-429506.production.fact_all_platform_sales_report\`
WHERE OrderDate >= DATE_SUB(CURRENT_DATE('Asia/Kolkata'), INTERVAL 90 DAY)
  AND NOT (OrderId LIKE '%_EX%')
  AND NOT (Channel = 'offline_sales' AND COALESCE(Order_Status, '') = 'Credit Note')
  AND NOT (Channel = 'Amazon' AND COALESCE(Order_Status, '') = 'RTV (Return to vendor)')
GROUP BY sku
HAVING sku IS NOT NULL`;

export const SALES_DAYS = [7, 15, 30, 60, 90];
export const RANKS = ['excess_value', 'doi', 'stock_value'];
const RANK_LABEL = { excess_value: 'excess value', doi: 'DOI', stock_value: 'stock value' };

const arr = v => (Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : typeof v === 'string' && v.trim() ? v.split(/[|,;]/).map(x => x.trim()).filter(Boolean) : null);
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };

// defaults come from knowledge/liquidation-config.json (so they can change without code)
export function defaultSettings(cfg = {}) {
  return {
    cover_days: num(cfg.cover_days, 1, 365) ?? 60,
    top_n: Math.round(num(cfg.top_n, 1, 50) ?? 20),
    channel: cfg.channel === 'all' ? 'all' : 'b2c',
    sales_days: SALES_DAYS.includes(Number(cfg.sales_days)) ? Number(cfg.sales_days) : 30,
    min_doi: cfg.min_doi == null ? null : num(cfg.min_doi, 0, 100000),
    rank_by: RANKS.includes(cfg.rank_by) ? cfg.rank_by : 'excess_value',
    exclude_categories: arr(cfg.exclude_categories) || [],
    exclude_sub_categories: arr(cfg.exclude_sub_categories) || [],
    exclude_words: arr(cfg.exclude_sub_category_words) || [],
    include_categories: arr(cfg.include_categories) || [],
    include_sub_categories: arr(cfg.include_sub_categories) || [],
    high_value_categories: arr(cfg.high_value_categories) || [],
  };
}

// defaults < settings remembered from the chat < what the model sets now. Invalid values are ignored (and reported).
export function mergeSettings(defaults, ...layers) {
  const s = { ...defaults }, notes = [];
  for (const L of layers) {
    if (!L) continue;
    for (const [k, v] of Object.entries(L)) {
      if (v === undefined) continue;
      if (k === 'cover_days') { const n = num(v, 1, 365); n === null ? notes.push(`cover_days ${v} is not valid (1-365)`) : (s.cover_days = n); }
      else if (k === 'top_n') { const n = num(v, 1, 50); n === null ? notes.push(`top_n ${v} is not valid (1-50)`) : (s.top_n = Math.round(n)); }
      else if (k === 'channel') { const c = String(v).toLowerCase(); (c === 'b2c' || c === 'all') ? (s.channel = c) : notes.push(`channel ${v} is not valid (b2c or all)`); }
      else if (k === 'sales_days') { const n = Number(v); SALES_DAYS.includes(n) ? (s.sales_days = n) : notes.push(`sales period ${v} days is not available: choose 7, 15, 30, 60 or 90 days`); }
      else if (k === 'min_doi') { if (v === null || v === '' || String(v).toLowerCase() === 'none') s.min_doi = null; else { const n = num(v, 0, 100000); n === null ? notes.push(`min_doi ${v} is not valid`) : (s.min_doi = n); } }
      else if (k === 'rank_by') { const r = String(v).toLowerCase().replace(/[ -]/g, '_'); RANKS.includes(r) ? (s.rank_by = r) : notes.push(`rank_by ${v} is not valid (${RANKS.join(', ')})`); }
      else if (['exclude_categories', 'exclude_sub_categories', 'exclude_words', 'include_categories', 'include_sub_categories', 'high_value_categories'].includes(k)) { const a = arr(v); if (a) s[k] = a; }
    }
  }
  return { settings: s, notes };
}

// "Settings: cover_days=60 · top_n=20 · ..." : shown in every plan and result, and read back from the chat for follow-ups.
export function settingsLine(s) {
  const j = a => (a.length ? a.join('|') : 'none');
  return `Settings: cover_days=${s.cover_days} · top_n=${s.top_n} · channel=${s.channel} · sales_days=${s.sales_days} · min_doi=${s.min_doi ?? 'none'} · rank_by=${s.rank_by} · exclude_categories=${j(s.exclude_categories)} · exclude_sub_categories=${j(s.exclude_sub_categories)} · exclude_words=${j(s.exclude_words)} · include_categories=${j(s.include_categories)} · include_sub_categories=${j(s.include_sub_categories)} · high_value_categories=${j(s.high_value_categories)}`;
}
export function parseSettingsLine(text) {
  const m = /^\s*(?:\*\*)?Settings:\s*(.+)$/m.exec(String(text || ''));
  if (!m) return null;
  const out = {};
  for (const part of m[1].split('·')) {
    const [k, ...rest] = part.trim().split('=');
    const v = rest.join('=').replace(/\*\*/g, '').trim();
    if (!k || !v) continue;
    if (['exclude_categories', 'exclude_sub_categories', 'exclude_words', 'include_categories', 'include_sub_categories', 'high_value_categories'].includes(k)) out[k] = v === 'none' ? [] : v.split('|');
    else out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}
// Hidden state of an answer built in code: <!--nx:{"v":1,"kind":"plan"|"result","s":{settings},"r":{figures}}--> (the chat screen never shows it).
// The visible "Settings: 60 days cover · ..." line is plain words; this is what follow-ups read.
const HIDDEN = /<!--nx:(\{[\s\S]*?\})-->/;
export const hiddenState = (kind, s, r) => `<!--nx:${JSON.stringify({ v: 1, kind, s, ...(r ? { r } : {}) }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')}-->`;
export function parseHidden(text) {
  const m = HIDDEN.exec(String(text || ''));
  if (!m) return null;
  try { const d = JSON.parse(m[1]); return d && typeof d === 'object' && d.s ? d : null; } catch { return null; }
}
// The latest assistant message of the chat that carries the settings (hidden state, or the older raw Settings line).
export function flowMessageFromChat(messages) {
  const list = [...(messages || [])];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (m.role !== 'assistant') continue;
    const text = String(m.content ?? m.text ?? '');
    const h = parseHidden(text);
    if (h) return { index: i, text, hidden: h, settings: h.s, kind: h.kind };
    const s = parseSettingsLine(text);
    if (s) return { index: i, text, hidden: null, settings: s, kind: /Shall I run it with these settings\?/.test(text) ? 'plan' : 'result' };
  }
  return null;
}
export function settingsFromChat(messages) { return flowMessageFromChat(messages)?.settings || null; }

// Names the user typed (exclude / include) -> the SKU master's exact categories / sub-categories. An exact category or sub-category name
// wins; otherwise every sub-category whose name contains the words (max 25); a name that matches nothing is reported, never guessed.
export function resolveNames(settings, names, defaults = {}) {
  const lcl = x => String(x ?? '').trim().toLowerCase();
  const notes = [], s = { ...settings };
  const cl = new Map(names.cats.map(c => [lcl(c), c])), sl = new Map(names.subs.map(c => [lcl(c), c]));
  const known = new Set([...(defaults.exclude_categories || []), ...(defaults.exclude_sub_categories || []), ...(defaults.include_categories || []), ...(defaults.include_sub_categories || [])].map(lcl));
  const resolve = list => {
    const cats = [], subs = [];
    for (const e of list) {
      const k = lcl(e);
      if (!k) continue;
      if (cl.has(k)) cats.push(cl.get(k));
      else if (sl.has(k)) subs.push(sl.get(k));
      else {
        const hits = names.subs.filter(x => lcl(x).includes(k));
        if (hits.length) { subs.push(...hits.slice(0, 25)); notes.push(`"${e}" matched ${hits.length} sub-categor${hits.length === 1 ? 'y' : 'ies'}${hits.length > 25 ? ' (first 25 used)' : ''}`); }
        else { const ch = names.cats.filter(x => lcl(x).includes(k)); if (ch.length) cats.push(...ch); else if (!known.has(k)) notes.push(`no category or sub-category is called "${e}"`); }
      }
    }
    return { cats: [...new Set(cats)], subs: [...new Set(subs)] };
  };
  const ex = resolve([...(s.exclude_categories || []), ...(s.exclude_sub_categories || [])]);
  const inc = resolve([...(s.include_categories || []), ...(s.include_sub_categories || [])]);
  s.exclude_categories = ex.cats; s.exclude_sub_categories = ex.subs; s.include_categories = inc.cats; s.include_sub_categories = inc.subs;
  return { settings: s, notes };
}

const key = s => String(s ?? '').toUpperCase().replace(/[\s_]+/g, '');
const lc = s => String(s ?? '').trim().toLowerCase();
const day = v => (v ? String(v).slice(0, 10) : '');

// deps data: files = { 7: file, 15?: file, 30: file } (stock, B2C avg sale 7/15/30 days, last sale date), sales = Map(skuKey -> { units90, units60,
// revExc90, revInc90 }) from SALES_SQL, firstSale = Set(skuKey) of SKUs with a first-sale date in the item master.
export function analyse({ files, sales, firstSale, cogs, settings }) {
  const file = files[30] || files[settings.sales_days] || files[7];
  const f7 = new Map((files[7]?.skus || []).map(s => [key(s.skuKey || s.sku), s]));
  const fPick = settings.sales_days >= 60 ? null : files[settings.sales_days];
  const fPickMap = fPick ? new Map(fPick.skus.map(s => [key(s.skuKey || s.sku), s])) : null;
  const all = settings.channel === 'all';
  const rows = regularRows(file).map(s => valueRow(s, cogs)).filter(r => (r.totalInvt || 0) > 0);

  const excluded = { never: { skus: 0, units: 0, list: [] }, names: new Map() };
  const addEx = (name, kind, r) => { const k = `${kind}|${name}`; const e = excluded.names.get(k) || { name, kind, skus: 0, units: 0 }; e.skus++; e.units += r.totalInvt; excluded.names.set(k, e); };
  const exCat = new Set(settings.exclude_categories.map(lc)), exSub = new Set(settings.exclude_sub_categories.map(lc));
  const exWords = settings.exclude_words.map(w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'));
  const incCat = new Set(settings.include_categories.map(lc)), incSub = new Set(settings.include_sub_categories.map(lc));
  const hv = new Set(settings.high_value_categories.map(lc));

  const out = [];
  for (const r of rows) {
    const k = key(r.skuKey || r.sku);
    const sl = sales.get(k);
    const everSold = !!sl || !!r.lastSaleDate || firstSale.has(k);
    const avg = x => (x ? (all ? x.totalAvgSale : x.avgSale) || 0 : 0);
    const avg30 = avg(f30Map(files)?.get(k));
    const avg7 = avg(f7.get(k));
    const avg90 = sl ? Math.round((sl.units90 / 90) * 10) / 10 : 0;
    const avg60 = sl ? Math.round((sl.units60 / 60) * 10) / 10 : 0;
    const avgChosen = settings.sales_days === 90 ? avg90 : settings.sales_days === 60 ? avg60 : avg(fPickMap?.get(k));
    if (!everSold) { excluded.never.skus++; excluded.never.units += r.totalInvt; excluded.never.list.push(r.sku); continue; }
    // selling price after discounts (ex GST) and what it leaves over the COGS
    const aspExc = sl && sl.units90 > 0 ? sl.revExc90 / sl.units90 : null;
    const aspInc = sl && sl.units90 > 0 ? sl.revInc90 / sl.units90 : null;
    const cat = r.category || 'Uncategorised', sub = r.subCategory || 'Uncategorised';
    if (exCat.has(lc(cat))) { addEx(cat, 'category', r); continue; }
    if (exSub.has(lc(sub))) { addEx(sub, 'sub-category', r); continue; }
    const w = exWords.findIndex(re => re.test(sub));
    if (w >= 0) { addEx(sub, `sub-category name contains "${settings.exclude_words[w]}"`, r); continue; }
    if (incCat.size && !incCat.has(lc(cat))) { addEx(cat, 'not in the included categories', r); continue; }
    if (incSub.size && !incSub.has(lc(sub))) { addEx(sub, 'not in the included sub-categories', r); continue; }
    const stock = r.totalInvt;
    const doi = avgChosen > 0 ? Math.floor(stock / avgChosen) : null;
    if (settings.min_doi != null && doi != null && doi < settings.min_doi) { addEx(`DOI below ${settings.min_doi}`, 'minimum DOI', r); continue; }
    const excessUnits = Math.max(0, Math.ceil(stock - settings.cover_days * avgChosen));
    const unit = r.cogs;
    const margin = aspExc != null && unit != null ? aspExc - unit : null;
    out.push({
      sku: r.sku, category: cat, sub_category: sub, high_value: hv.has(lc(cat)),
      stock_units: stock, cogs_per_unit: unit, cogs_basis: r.cogsMap === 'Missing' ? 'No COGS' : r.cogsMap, stock_value: r.totalCost,
      avg_sale_30d: avg30, avg_sale_7d: avg7, avg_sale_60d: avg60, avg_sale_90d: avg90, avg_sale_used: avgChosen, doi,
      last_sale_date: day(sl?.lastOrder || r.lastSaleDate), ever_sold: 'yes', no_sale_90d: !sl || !(sl.units90 > 0) ? 'yes' : 'no',
      units_sold_90d: sl ? sl.units90 : 0, rev_exc_90d: sl ? sl.revExc90 : 0,
      asp_exc_gst: aspExc, asp_inc_gst: aspInc, margin_per_unit: margin,
      max_discount_pct: margin != null ? (margin > 0 ? Math.round((margin / aspExc) * 1000) / 10 : 0) : null,
      price_note: aspExc == null ? 'ASP n/a (no sale in 90 days)' : margin == null ? 'margin n/a (no COGS)' : margin <= 0 ? 'selling at or below cost' : '',
      excess_units: excessUnits, excess_value: unit != null ? excessUnits * unit : null,
      trend_7d_vs_30d_pct: avg30 > 0 ? Math.round(((avg7 - avg30) / avg30) * 1000) / 10 : null,
      trend_30d_vs_90d_pct: avg90 > 0 ? Math.round(((avg30 - avg90) / avg90) * 1000) / 10 : null,
    });
  }

  // SKUs with stock but no COGS at all are NOT dropped: they are listed separately (ranked by excess units), flagged "No COGS",
  // and kept out of the value-based sub-category ranking (their value cannot be calculated).
  const noCogs = out.filter(r => r.cogs_per_unit == null).sort((a, b) => b.excess_units - a.excess_units || b.stock_units - a.stock_units || a.sku.localeCompare(b.sku));
  const valued = out.filter(r => r.cogs_per_unit != null);

  // sub-category level (valued SKUs). ASP is weighted by units sold in 90 days (sum revenue / sum units); COGS per unit is weighted by stock
  // (stock value / stock units); margin = ASP - COGS; max discount before loss = margin / ASP.
  const g = new Map();
  for (const r of valued) {
    const e = g.get(r.sub_category) || { sub_category: r.sub_category, category: r.category, high_value: r.high_value, skus: 0, stock_units: 0, stock_value: 0, excess_units: 0, excess_value: 0, avg_used: 0, avg30: 0, avg7: 0, avg90: 0, units90: 0, rev90: 0, rows: [] };
    e.skus++; e.stock_units += r.stock_units; e.stock_value += r.stock_value || 0; e.excess_units += r.excess_units; e.excess_value += r.excess_value || 0;
    e.avg_used += r.avg_sale_used; e.avg30 += r.avg_sale_30d; e.avg7 += r.avg_sale_7d; e.avg90 += r.avg_sale_90d; e.units90 += r.units_sold_90d; e.rev90 += r.rev_exc_90d;
    e.rows.push(r); g.set(r.sub_category, e);
  }
  const subs = [...g.values()].map(e => {
    const asp = e.units90 > 0 ? e.rev90 / e.units90 : null;
    const cogsU = e.stock_units > 0 ? e.stock_value / e.stock_units : null;
    const margin = asp != null && cogsU != null ? asp - cogsU : null;
    return {
      ...e, doi: e.avg_used > 0 ? Math.floor(e.stock_units / e.avg_used) : null,
      asp_exc_gst: asp, cogs_per_unit: cogsU, margin_per_unit: margin, max_discount_pct: margin != null ? (margin > 0 ? Math.round((margin / asp) * 1000) / 10 : 0) : null,
      price_note: asp == null ? 'ASP n/a (no sale in 90 days)' : margin != null && margin <= 0 ? 'selling at or below cost' : '',
      trend_7d_vs_30d_pct: e.avg30 > 0 ? Math.round(((e.avg7 - e.avg30) / e.avg30) * 1000) / 10 : null,
      trend_30d_vs_90d_pct: e.avg90 > 0 ? Math.round(((e.avg30 - e.avg90) / e.avg90) * 1000) / 10 : null,
    };
  });
  const rankKey = { excess_value: 'excess_value', stock_value: 'stock_value', doi: 'doi' }[settings.rank_by];
  const cmp = (a, b) => ((b[rankKey] ?? Infinity) - (a[rankKey] ?? Infinity)) || (b.excess_value - a.excess_value) || a.sub_category.localeCompare(b.sub_category);
  const eligible = subs.filter(s => s.excess_units > 0);
  const main = eligible.filter(s => !s.high_value).sort(cmp), high = eligible.filter(s => s.high_value).sort(cmp);
  return {
    settings, out, subs, main, high, noCogs,
    excluded: { never: excluded.never, names: [...excluded.names.values()].sort((a, b) => b.units - a.units) },
    counts: { skusWithStock: rows.length, included: out.length, includedUnits: out.reduce((a, r) => a + r.stock_units, 0), includedValue: out.reduce((a, r) => a + (r.stock_value || 0), 0), subCategories: subs.length, withExcess: eligible.length, noCogsSkus: noCogs.length, noCogsUnits: noCogs.reduce((a, r) => a + r.stock_units, 0), noCogsExcessUnits: noCogs.reduce((a, r) => a + r.excess_units, 0) },
  };
}
// the 30-day SKU map is built once per file object
const _m = new WeakMap();
function f30Map(files) { const f = files[30]; if (!f) return null; if (!_m.has(f)) _m.set(f, new Map(f.skus.map(s => [key(s.skuKey || s.sku), s]))); return _m.get(f); }

const money = formatRupees, int = indianInt;
const r1 = n => Math.round((n || 0) * 10) / 10;
function subTsv(list, n) {
  const head = 'sub_category\tcategory\tskus\tstock_units\tstock_value\texcess_units\texcess_value\tdoi\tavg_sale_used\ttrend_7d_vs_30d_pct\ttrend_30d_vs_90d_pct\tasp_exc_gst\tcogs_per_unit\tmargin_per_unit\tmax_discount_pct\tprice_note';
  const rows = list.slice(0, n).map(e => [e.sub_category, e.category, e.skus, e.stock_units, e.stock_value, e.excess_units, e.excess_value, e.doi ?? 'NULL', r1(e.avg_used), e.trend_7d_vs_30d_pct ?? 'NULL', e.trend_30d_vs_90d_pct ?? 'NULL', e.asp_exc_gst == null ? 'NULL' : Math.round(e.asp_exc_gst), e.cogs_per_unit == null ? 'NULL' : Math.round(e.cogs_per_unit), e.margin_per_unit == null ? 'NULL' : Math.round(e.margin_per_unit), e.max_discount_pct ?? 'NULL', e.price_note || ''].join('\t'));
  const sum = k => list.reduce((a, e) => a + (e[k] || 0), 0);
  return formatTsv([head, ...rows].join('\n'), null, { totals: { skus: sum('skus'), stock_units: sum('stock_units'), stock_value: sum('stock_value'), excess_units: sum('excess_units'), excess_value: sum('excess_value') }, totalLabel: `TOTAL of all ${int(list.length)} sub-categories with excess (calculated by the connector)` });
}
const basis = s => `${s.channel === 'all' && s.sales_days < 60 ? 'all-channel' : 'B2C'} average daily sale over the last ${s.sales_days} days${s.sales_days >= 60 ? ' (units in the consumer-channel sales table / days)' : ' (Inventory Health file, same as the page)'}`;
const PRICE_NOTE = 'Selling price: ASP = SellingPrice_Exc_GST / units over the last 90 days (B2C channels, after discounts, before cancellations and returns). margin per unit = ASP - COGS per unit; max discount before loss % = margin / ASP. Sub-category ASP is weighted by units sold, COGS by stock units. "ASP n/a" = no sale in the last 90 days.';
const noCogsTsv = (list, n) => {
  const head = 'sku\tsub_category\tcategory\tstock_units\texcess_units\tdoi\tavg_sale_used\tasp_exc_gst\tflag';
  const rows = list.slice(0, n).map(r => [r.sku, r.sub_category, r.category, r.stock_units, r.excess_units, r.doi ?? 'NULL', r1(r.avg_sale_used), r.asp_exc_gst == null ? 'NULL' : Math.round(r.asp_exc_gst), 'No COGS'].join('\t'));
  const sum = k => list.reduce((a, e) => a + (e[k] || 0), 0);
  return formatTsv([head, ...rows].join('\n'), null, { totals: { stock_units: sum('stock_units'), excess_units: sum('excess_units') }, totalLabel: `TOTAL of all ${int(list.length)} SKUs without COGS (calculated by the connector)` });
};

export function planText(res, ctx) {
  const s = res.settings, ex = res.excluded;
  const lines = [
    'inventory_opportunity PLAN (nothing has been run yet; show this to the user and ask for confirmation).',
    `Stock: Regular facilities, Inventory Health files as of ${ctx.asOf || 'n/a'}. ${ctx.cogsLabel}. Valuation: own COGS, else sub-category average, else not valued.`,
    '', 'Assumptions and defaults (the user can change any of them in the chat):',
    `- cover_days ${s.cover_days}: excess = stock beyond ${s.cover_days} days of cover (stock - ${s.cover_days} x avg daily sale, minimum 0); excess value = excess units x COGS per unit`,
    `- sales basis: ${basis(s)} (channel = ${s.channel}; sales_days can be 7, 15, 30, 60 or 90)`,
    `- ${PRICE_NOTE}`,
    `- SKUs with stock but no COGS are not dropped: they are listed separately, ranked by excess units, flagged "No COGS" (${int(res.counts.noCogsSkus)} SKUs, ${int(res.counts.noCogsUnits)} units at present)`,
    `- top_n ${s.top_n} sub-categories, ranked by ${RANK_LABEL[s.rank_by]} (rank_by: excess_value, doi or stock_value); minimum DOI to include: ${s.min_doi ?? 'none'}`,
    `- separate high-value list (top ${s.top_n}, not mixed with the rest): ${s.high_value_categories.join(', ') || 'none'}`,
    `- answer is sub-category wise; the Excel has the sub-category summaries and every SKU with all columns`,
    '', `Excluded (exact names):`,
    `- never-live SKUs (never sold: no sale record in the last 90 days and no first-sale date): ${int(ex.never.skus)} SKUs, ${int(ex.never.units)} units`,
    ...ex.names.slice(0, 30).map(e => `- ${e.kind}: ${e.name} (${int(e.skus)} SKUs, ${int(e.units)} units)`),
    '', `Included: ${int(res.counts.included)} SKUs in ${int(res.counts.subCategories)} sub-categories, ${int(res.counts.includedUnits)} units valued ${money(res.counts.includedValue)}; ${int(res.counts.withExcess)} sub-categories have excess at ${s.cover_days} days of cover.`,
    '', settingsLine(s),
    'Ask exactly: "Shall I run it with these settings?" and tell the user they can change any setting, add or remove exclusions, or pick another high-value group. Copy the Settings line into your reply unchanged.',
  ];
  return lines.join('\n');
}

export function resultText(res, ctx) {
  const s = res.settings, ex = res.excluded, n = s.top_n;
  const out = [
    `inventory_opportunity RESULT: sub-categories with stock beyond ${s.cover_days} days of cover, ranked by ${RANK_LABEL[s.rank_by]}.`,
    `Stock: Regular facilities, Inventory Health files as of ${ctx.asOf || 'n/a'}. ${ctx.cogsLabel}. Sales: ${basis(s)}. Excess = max(0, stock - ${s.cover_days} x avg sale); excess value = excess x COGS per unit; DOI = floor(stock / avg sale). trend_7d_vs_30d = B2C avg of the last 7 days vs the last 30; trend_30d_vs_90d is indicative (the 90-day figure comes from sales_90d).`,
    `Excluded: never-live ${int(ex.never.skus)} SKUs (${int(ex.never.units)} units); ${ex.names.slice(0, 12).map(e => `${e.name} [${e.kind}] ${int(e.skus)} SKUs`).join('; ') || 'nothing else'}.`,
    '', `MAIN LIST (excluding ${s.high_value_categories.join(' / ') || 'no separate group'}): top ${Math.min(n, res.main.length)} of ${res.main.length} sub-categories with excess`,
    res.main.length ? subTsv(res.main, n) : 'No sub-categories with excess in the main list.',
  ];
  if (s.high_value_categories.length) out.push('', `HIGH-VALUE LIST (${s.high_value_categories.join(', ')}), separate: top ${Math.min(n, res.high.length)} of ${res.high.length}`, res.high.length ? subTsv(res.high, n) : 'No sub-categories with excess in the high-value group.');
  out.push('', `NO COGS LIST: ${int(res.counts.noCogsSkus)} SKUs have stock but no COGS (not valued, kept out of the rankings above), ranked by excess units, flagged "No COGS". Top ${Math.min(n, res.noCogs.length)}:`,
    res.noCogs.length ? noCogsTsv(res.noCogs, n) : 'None: every included SKU has a COGS (own or sub-category average).');
  out.push('', PRICE_NOTE);
  out.push('', ctx.attached ? 'ATTACHED: an Excel with the sub-category summaries and every SKU with all columns is attached below the answer (say so).' : 'No Excel is attached to this result.', settingsLine(s));
  return out.join('\n');
}

// ── Excel ──
const SKU_COLS = [['sku', 'SKU'], ['category', 'Category'], ['sub_category', 'Sub-category'], ['stock_units', 'Stock (Regular, units)'], ['cogs_per_unit', 'COGS / unit'], ['cogs_basis', 'COGS basis'], ['stock_value', 'Stock value at cost'], ['avg_sale_7d', 'Avg daily sale 7d'], ['avg_sale_30d', 'Avg daily sale 30d'], ['avg_sale_60d', 'Avg daily sale 60d'], ['avg_sale_90d', 'Avg daily sale 90d'], ['avg_sale_used', 'Avg daily sale used'], ['doi', 'DOI (days)'], ['last_sale_date', 'Last sale date'], ['ever_sold', 'Ever sold'], ['no_sale_90d', 'No sale in 90d'], ['units_sold_90d', 'Units sold 90d'], ['excess_units', 'Excess units'], ['excess_value', 'Excess value at cost'], ['asp_exc_gst', 'ASP ex GST (90d, after discounts)'], ['asp_inc_gst', 'ASP inc GST (90d)'], ['margin_per_unit', 'Margin per unit (ASP - COGS)'], ['max_discount_pct', 'Max discount before loss %'], ['price_note', 'Price / COGS note'], ['trend_7d_vs_30d_pct', 'Trend 7d vs 30d %'], ['trend_30d_vs_90d_pct', 'Trend 30d vs 90d %'], ['high_value', 'High-value group']];
const SUB_COLS = [['rank', 'Rank'], ['sub_category', 'Sub-category'], ['category', 'Category'], ['skus', 'SKUs'], ['stock_units', 'Stock units'], ['stock_value', 'Stock value at cost'], ['excess_units', 'Excess units'], ['excess_value', 'Excess value at cost'], ['doi', 'DOI (days)'], ['avg_used', 'Avg daily sale used'], ['asp_exc_gst', 'ASP ex GST (weighted)'], ['cogs_per_unit', 'COGS per unit (weighted)'], ['margin_per_unit', 'Margin per unit'], ['max_discount_pct', 'Max discount before loss %'], ['price_note', 'Price note'], ['trend_7d_vs_30d_pct', 'Trend 7d vs 30d %'], ['trend_30d_vs_90d_pct', 'Trend 30d vs 90d %']];

// Returns { name, mime, data (base64) } or null when the xlsx library is not available.
export async function buildWorkbook(res, ctx, XLSX) {
  const lib = XLSX || (await import('xlsx')).default || (await import('xlsx'));
  const s = res.settings;
  const sheet = (cols, rows) => lib.utils.aoa_to_sheet([cols.map(c => c[1]), ...rows.map(r => cols.map(c => { const v = r[c[0]]; return v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : typeof v === 'number' ? Math.round(v * 100) / 100 : v; }))]);
  const wb = lib.utils.book_new();
  const info = [['Inventory opportunity (push for sale / liquidate)'], [`Stock as of ${ctx.asOf || 'n/a'} (Regular facilities)`], [ctx.cogsLabel], [`Sales basis: ${basis(s)}`], [settingsLine(s)], [],
    ['Excluded', 'Kind', 'SKUs', 'Units'], ['Never-live SKUs (never sold)', 'never sold', res.excluded.never.skus, res.excluded.never.units], ...res.excluded.names.map(e => [e.name, e.kind, e.skus, e.units]), [],
    ['Included SKUs', res.counts.included], ['Included units', res.counts.includedUnits], ['Included value at cost (Rs)', Math.round(res.counts.includedValue)]];
  lib.utils.book_append_sheet(wb, lib.utils.aoa_to_sheet(info), 'Settings & exclusions');
  const ranked = list => list.map((e, i) => ({ ...e, rank: i + 1 }));
  lib.utils.book_append_sheet(wb, sheet(SUB_COLS, ranked(res.main)), 'Sub-category summary');
  if (s.high_value_categories.length) lib.utils.book_append_sheet(wb, sheet(SUB_COLS, ranked(res.high)), 'High-value summary');
  const bySub = new Map(res.subs.map(e => [e.sub_category, res.main.concat(res.high).findIndex(x => x.sub_category === e.sub_category)]));
  const skuRows = [...res.out].sort((a, b) => ((bySub.get(a.sub_category) ?? 1e9) - (bySub.get(b.sub_category) ?? 1e9)) || ((b.excess_value || 0) - (a.excess_value || 0)) || a.sku.localeCompare(b.sku));
  lib.utils.book_append_sheet(wb, sheet(SKU_COLS, skuRows), 'All SKUs');
  lib.utils.book_append_sheet(wb, sheet(SKU_COLS, res.noCogs), 'No COGS SKUs');
  if (res.excluded.never.list.length) lib.utils.book_append_sheet(wb, lib.utils.aoa_to_sheet([['Never-live SKUs (excluded)'], ...res.excluded.never.list.map(x => [x])]), 'Never-live SKUs');
  const buf = lib.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
  return { name: `Inventory_opportunity_${String(ctx.asOf || '').slice(0, 10) || 'today'}.xlsx`, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: Buffer.from(buf).toString('base64') };
}

// Live data: the Inventory Health files, sales_90d and the item master's first-sale dates, plus the COGS table.
export async function runInventoryOpportunity(args, deps, chatSettings, defaults, now = Date.now()) {
  const { settings, notes } = mergeSettings(defaults, chatSettings, args);
  const ist = new Date(now + 5.5 * 3600e3);
  const y = ist.getUTCFullYear(), m = ist.getUTCMonth() + 1;
  const back = new Date(Date.UTC(y, m - 1 - 6, 1));
  const pad = n => String(n).padStart(2, '0');
  const body = { startMonth: `${back.getUTCFullYear()}-${pad(back.getUTCMonth() + 1)}-01`, endMonth: `${y}-${pad(m)}-01` };
  const want = [...new Set([7, 30, ...(settings.sales_days === 15 ? [15] : [])])];
  const [fileList, cogsResp, salesRows, masterRows] = await Promise.all([
    Promise.all(want.map(d => deps.invFile(`inv-data-${d}d`))), deps.cogsMonthly(body), deps.sales(), deps.firstSales(),
  ]);
  const files = Object.fromEntries(want.map((d, i) => [d, fileList[i]]));
  const cogs = buildCogs(cogsResp?.rows);
  const sales = new Map();
  for (const r of salesRows) {
    const k = key(r.sku); const e = sales.get(k) || { units90: 0, units60: 0, revExc90: 0, revInc90: 0, lastOrder: '' };
    e.units90 += Number(r.units_90d || 0); e.units60 += Number(r.units_60d || 0); e.revExc90 += Number(r.rev_exc_90d || 0); e.revInc90 += Number(r.rev_inc_90d || 0);
    const d = String(r.last_order_date?.value ?? r.last_order_date ?? '').slice(0, 10); if (d > e.lastOrder) e.lastOrder = d;
    sales.set(k, e);
  }
  const firstSale = new Set(masterRows.filter(r => r.sku_first_sales_date && r.sku_first_sales_date !== 'NaT' && !Number.isNaN(new Date(r.sku_first_sales_date).getTime())).map(r => key(r.product_code)));
  const baseRows = regularRows(files[30] || files[7]);
  const named = resolveNames(settings, { cats: [...new Set(baseRows.map(r => r.category).filter(Boolean))], subs: [...new Set(baseRows.map(r => r.subCategory).filter(Boolean))] }, defaults);
  notes.push(...named.notes);
  const res = analyse({ files, sales, firstSale, cogs, settings: named.settings });
  const label = cogs.srcMonth && cogs.month && cogs.srcMonth !== cogs.month ? `COGS rates: ${monthName(cogs.srcMonth)}, carried forward` : `COGS rates: ${monthName(cogs.month)}`;
  const ctx = { asOf: files[30]?.asOf || files[7]?.asOf, cogsLabel: label };
  return { res, ctx, notes };
}
const monthName = m => { const d = new Date(String(m).slice(0, 10) + 'T00:00:00Z'); return Number.isNaN(d.getTime()) ? String(m) : d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }); };
