// Inventory → Inward: SQL text + pure aggregation (no I/O), shared by api/inward.js and the
// offline checks in scripts/. Data rules are the ones validated for the build spec
// (docs/INWARD_DATA_NOTES.md):
//   • GRN fact = production.unicommerce_grn_refined, GRN date parsed from the first 10 chars of the
//     GRNDate STRING (some rows lack seconds, so never CAST/DATE() it)
//   • hard floor 2025-04-01; PKG SKUs, the Vadgaon traceability facility and "WRONG" invoices excluded
//   • final SKU = ItemSkuCode minus a trailing _RAW_PO<n> / -RAW-PO<n> / _RAW; units × <n> (pack qty)
//   • final SKU → productid_sku_mapping.productid (TRIM, exact) → masterskucode → SKU master
//     Product_Code. A row that doesn't resolve all the way is DROPPED from every number (business
//     rule: raw-material codes not yet in the SKU master are not dashboard inward) and is shown only
//     in Data quality (admins).
//   • vendor → vendor_mapping (exact vendor_name) → unified_vendor_name + vendor_type
import {
  buildFacilityMaps, normSku, cleanLabel, buildSkuMap, resolveMasterSkuKey, isPseudoSku,
  isTotalAvgSaleChannel, norm, LOCATION_ORDER,
} from './_inventory_shared.js'

export const INWARD_PERMISSION = 'inventory:inward'
export const GRN_FLOOR = '2025-04-01'
// Real vendor_mapping.vendor_type values, in display order. 'Unmapped' = vendor name missing from
// vendor_mapping (kept so totals reconcile; listed under Data quality).
export const SOURCE_TYPES = ['Domestic', 'Import', 'Inhouse', 'Internal']
export const UNMAPPED_SOURCE = 'Unmapped'

const TBL = {
  grn: '`frido-429506.production.unicommerce_grn_refined`',
  skuMap: '`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping`',
  master: '`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master`',
  vendor: '`frido-429506.production.vendor_mapping`',
  sales: '`frido-429506.production.aggregated_uniware_sales_report`',
}

// ── Dates (all 'YYYY-MM-DD' strings, UTC arithmetic so no timezone drift) ─────────────
export const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
export const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000)
export const monthOf = d => `${String(d).slice(0, 7)}-01`
export const isIsoDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + 'T00:00:00Z').getTime())

// Previous equal period: same number of days, ending the day before `start`.
export function periods(start, end) {
  const days = dayDiff(start, end) + 1
  const prevEnd = addDays(start, -1)
  const prevStart = addDays(prevEnd, -(days - 1))
  return { start, end, days, prevStart, prevEnd }
}

// ── SQL ───────────────────────────────────────────────────────────────────────────────
// @qStart / @qEnd: STRING 'YYYY-MM-DD' params (cast in SQL).
const GRN_FILTERED_CTES = `
grn AS (
  SELECT *, SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(GRNDate, 1, 10)) AS grn_date
  FROM ${TBL.grn}
),
flt AS (
  SELECT *,
    REGEXP_REPLACE(REGEXP_REPLACE(ItemSkuCode, r'[-_]RAW[-_]?PO[-_]?[0-9]+$', ''), r'[-_]RAW$', '') AS final_sku_code,
    COALESCE(SAFE_CAST(REGEXP_EXTRACT(ItemSkuCode, r'[-_]RAW[-_]?PO[-_]?([0-9]+)$') AS INT64), 1) AS pack_qty
  FROM grn
  WHERE grn_date >= DATE '${GRN_FLOOR}'
    AND grn_date BETWEEN CAST(@qStart AS DATE) AND CAST(@qEnd AS DATE)
    AND NOT REGEXP_CONTAINS(UPPER(ItemSkuCode), r'PKG')
    AND Facility != 'myfrido-Vadgaon_Traceability'
    AND NOT REGEXP_CONTAINS(UPPER(IFNULL(CAST(GRNInvoiceNo AS STRING), '')), r'WRONG')
),
skumap AS (
  -- one row per productid, so a duplicate mapping row can never double-count a GRN line
  SELECT TRIM(productid) AS productid, ANY_VALUE(TRIM(masterskucode)) AS masterskucode
  FROM ${TBL.skuMap}
  WHERE masterskucode IS NOT NULL AND LOWER(TRIM(masterskucode)) NOT IN ('', 'not found')
  GROUP BY 1
),
master AS (
  SELECT TRIM(Product_Code) AS product_code,
    ANY_VALUE(TRIM(Category_Name)) AS category, ANY_VALUE(TRIM(Sub_category)) AS sub_category, ANY_VALUE(TRIM(Name)) AS name
  FROM ${TBL.master}
  WHERE Product_Code IS NOT NULL AND TRIM(Product_Code) != ''
  GROUP BY 1
),
vmap AS (
  SELECT vendor_name, ANY_VALUE(unified_vendor_name) AS unified_vendor_name, ANY_VALUE(vendor_type) AS vendor_type
  FROM ${TBL.vendor}
  GROUP BY 1
)`

// Resolved inward lines, one row per (GRN date, GRN, facility, vendor, SKU).
export const GRN_SQL = `
WITH ${GRN_FILTERED_CTES},
res AS (
  SELECT
    f.grn_date, f.GRNCode AS grn_code, f.Facility AS facility,
    COALESCE(v.unified_vendor_name, f.VendorName) AS vendor,
    COALESCE(v.vendor_type, '${UNMAPPED_SOURCE}') AS source_type,
    m.product_code AS sku, m.category, m.sub_category, m.name,
    SAFE_CAST(f.QuantityReceived AS FLOAT64) * f.pack_qty AS qty,
    SAFE_CAST(f.QuantityRejected AS FLOAT64) * f.pack_qty AS rej,
    DATE_DIFF(
      COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(CAST(f.GRNReceivedTimestamp AS STRING), 1, 10)), f.grn_date),
      SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(CAST(f.PODate AS STRING), 1, 10)),
      DAY) AS lead_days
  FROM flt f
  JOIN skumap s ON s.productid = TRIM(f.final_sku_code)
  JOIN master m ON m.product_code = s.masterskucode
  LEFT JOIN vmap v ON v.vendor_name = f.VendorName
)
SELECT CAST(grn_date AS STRING) AS d, grn_code AS g, facility AS f, vendor AS v, source_type AS t,
  sku AS s, category AS c, sub_category AS sc, name AS n,
  SUM(IFNULL(qty, 0)) AS q, SUM(IFNULL(rej, 0)) AS r, MAX(lead_days) AS lt
FROM res
GROUP BY d, g, f, v, t, s, c, sc, n`

// Data quality (admins): unresolved SKUs, vendors missing from vendor_mapping, zero/negative qty.
export const DQ_SQL = `
WITH ${GRN_FILTERED_CTES},
j AS (
  SELECT f.*, s.masterskucode, m.product_code
  FROM flt f
  LEFT JOIN skumap s ON s.productid = TRIM(f.final_sku_code)
  LEFT JOIN master m ON m.product_code = s.masterskucode
)
SELECT 'sku' AS kind, ItemSkuCode AS a, final_sku_code AS b,
  IF(masterskucode IS NULL, 'No usable row in productid_sku_mapping', 'Master code not in SKU master') AS c,
  COUNT(*) AS lines, SUM(IFNULL(SAFE_CAST(QuantityReceived AS FLOAT64), 0) * pack_qty) AS units, CAST(MAX(grn_date) AS STRING) AS last_date
FROM j WHERE product_code IS NULL GROUP BY 1, 2, 3, 4
UNION ALL
SELECT 'vendor', j.VendorName, CAST(NULL AS STRING), CAST(NULL AS STRING),
  COUNT(*), SUM(IFNULL(SAFE_CAST(QuantityReceived AS FLOAT64), 0) * pack_qty), CAST(MAX(grn_date) AS STRING)
FROM j LEFT JOIN vmap v ON v.vendor_name = j.VendorName
WHERE j.product_code IS NOT NULL AND v.vendor_name IS NULL GROUP BY 1, 2
UNION ALL
SELECT 'qty', GRNCode, ItemSkuCode, CAST(QuantityReceived AS STRING),
  COUNT(*), SUM(IFNULL(SAFE_CAST(QuantityReceived AS FLOAT64), 0) * pack_qty), CAST(MAX(grn_date) AS STRING)
FROM j WHERE IFNULL(SAFE_CAST(QuantityReceived AS FLOAT64), 0) <= 0 GROUP BY 1, 2, 3, 4`

// Sales units per (day, normalised SKU key, facility). The key expression is the SQL twin of
// _inventory_shared.js parseFinalSku + normSku (cut at the first "_", then at "-raw", uppercase,
// no whitespace), so resolveMasterSkuKey's mapping step can be applied to it in JS unchanged.
// @excl: channel codes (uppercased) explicitly mapped to a non-sale description (stock transfer,
// ignore, custom) — everything else counts, the same set as Health's "Total Avg Sale".
const SALES_KEY_EXPR = `UPPER(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(IFNULL(final_sku, ''), r'_.*$', ''), r'(?i)-raw.*$', ''), r'\\s', ''))`
export const SALES_SQL = `
SELECT CAST(order_date AS STRING) AS d, ${SALES_KEY_EXPR} AS k, Facility AS f, SUM(total_quantity) AS q
FROM ${TBL.sales}
WHERE order_date BETWEEN CAST(@qStart AS DATE) AND CAST(@qEnd AS DATE)
  AND UPPER(TRIM(IFNULL(channel, ''))) NOT IN UNNEST(@excl)
  AND NOT REGEXP_CONTAINS(UPPER(IFNULL(final_sku, '')), r'COUP|DFA')
GROUP BY d, k, f`

// One SKU's daily sales (drill-down). @keys: every normalised raw key that resolves to the SKU.
export const SKU_SALES_SQL = `
SELECT CAST(order_date AS STRING) AS d, SUM(total_quantity) AS q
FROM ${TBL.sales}
WHERE order_date BETWEEN CAST(@qStart AS DATE) AND CAST(@qEnd AS DATE)
  AND UPPER(TRIM(IFNULL(channel, ''))) NOT IN UNNEST(@excl)
  AND ${SALES_KEY_EXPR} IN UNNEST(@keys)
GROUP BY d`

// One SKU's inward lines (drill-down).
export const SKU_GRN_SQL = GRN_SQL.replace('FROM res\nGROUP BY', 'FROM res\nWHERE sku = @sku\nGROUP BY')

export const MASTER_SQL = `SELECT TRIM(Product_Code) AS code, TRIM(Category_Name) AS category, TRIM(Sub_category) AS sub_category, TRIM(Name) AS name, TRIM(Type) AS type
FROM ${TBL.master} WHERE Product_Code IS NOT NULL AND TRIM(Product_Code) != ''`
export const SKUMAP_SQL = `SELECT DISTINCT TRIM(productid) AS productid, TRIM(masterskucode) AS masterskucode
FROM ${TBL.skuMap} WHERE masterskucode IS NOT NULL AND LOWER(TRIM(masterskucode)) NOT IN ('', 'not found')`

// Channels to drop from sales (explicitly mapped to a non-sale description).
export function nonSaleChannels(channelToDescription) {
  const out = []
  for (const [ch] of channelToDescription) if (!isTotalAvgSaleChannel(ch, channelToDescription)) out.push(norm(ch))
  return out.length ? out : ['__none__']
}

// ── Lookups ───────────────────────────────────────────────────────────────────────────
// Sales-side SKU master: same exclusions as Inventory Health (no bundles / combos), keyed by normSku.
export function buildMasterIndex(masterRows) {
  const byKey = new Map()
  for (const r of masterRows || []) {
    if (!r.code) continue
    if (norm(r.type) === 'BUNDLE' || norm(r.category) === 'COMBO') continue
    byKey.set(normSku(r.code), { sku: r.code, category: cleanLabel(r.category) || 'Uncategorized', subCategory: cleanLabel(r.sub_category) || 'Uncategorized', name: cleanLabel(r.name) })
  }
  return byKey
}

// COGS lookup — same tiers as src/pnl/pnlUtils.js getCogsPerUnit (SKU's own month → its
// sub-category's average real COGS for that month). That file can't be imported server-side (it
// pulls in browser theme code), so the two tiers are mirrored here. The P&L's last tier (a % of
// ASP) needs a selling price, which a GRN line doesn't have: a SKU with no COGS row at all uses its
// SKU-master sub-category's average instead, else it is uncosted (₹0, counted separately).
export function buildCogsLookup(cogsRows) {
  const bySku = new Map()      // normSku → Map(month → cogs)
  const skuSub = new Map()     // normSku → sub-category (from the COGS table)
  const subSums = new Map()    // sub-category → Map(month → {sum, n})
  for (const r of cogsRows || []) {
    if (r.cogs == null || Number.isNaN(Number(r.cogs))) continue
    const k = normSku(r.sku)
    const m = String(r.month).slice(0, 10)
    if (!bySku.has(k)) bySku.set(k, new Map())
    bySku.get(k).set(m, Number(r.cogs))
    if (r.subCategory) {
      if (!skuSub.has(k)) skuSub.set(k, r.subCategory)
      if (!subSums.has(r.subCategory)) subSums.set(r.subCategory, new Map())
      const sm = subSums.get(r.subCategory)
      const acc = sm.get(m) || { sum: 0, n: 0 }
      acc.sum += Number(r.cogs); acc.n += 1
      sm.set(m, acc)
    }
  }
  const subAvg = (sub, m) => { const a = sub && subSums.get(sub)?.get(m); return a ? a.sum / a.n : null }
  return function cogsFor(sku, date, masterSubCategory) {
    const k = normSku(sku)
    const m = monthOf(date)
    const own = bySku.get(k)?.get(m)
    if (own != null) return { rate: own, tier: 'sku' }
    const viaSub = subAvg(skuSub.get(k), m)
    if (viaSub != null) return { rate: viaSub, tier: 'subcategory' }
    const viaMaster = subAvg(masterSubCategory, m)
    if (viaMaster != null) return { rate: viaMaster, tier: 'subcategory' }
    return { rate: null, tier: 'none' }
  }
}

// ── Aggregation ───────────────────────────────────────────────────────────────────────
const inList = (vals, v) => !vals || vals.length === 0 || vals.includes(v)
const arr = v => Array.isArray(v) ? v.filter(Boolean).map(String) : (typeof v === 'string' && v ? v.split(',').map(s => s.trim()).filter(Boolean) : [])

export function normaliseFilters(body = {}) {
  return {
    warehouse: arr(body.warehouse),
    sourceType: arr(body.sourceType),
    vendor: arr(body.vendor),
    category: arr(body.category),
    subCategory: arr(body.subCategory),
    sku: typeof body.sku === 'string' ? body.sku.trim().slice(0, 80) : '',
  }
}

const skuSearch = (q, sku, name, sub) => {
  if (!q) return true
  const n = q.toUpperCase()
  return String(sku || '').toUpperCase().includes(n) || String(name || '').toUpperCase().includes(n) || String(sub || '').toUpperCase().includes(n)
}

const round = (v, dp = 0) => { const p = 10 ** dp; return Math.round((v || 0) * p) / p }
const val = x => (x && typeof x === 'object' && 'value' in x ? x.value : x)

// Turns raw query rows into the page payload. Pure: same input → same output.
//   grnRows   GRN_SQL rows for [prevStart, end]
//   salesRows SALES_SQL rows for [prevStart, end]
//   master    MASTER_SQL rows; skuMapRows SKUMAP_SQL rows; cogsRows /api/cogs-monthly rows
//   refRows   optional facility/channel reference rows (defaults to api/data snapshots)
export function buildInwardPayload({ grnRows, salesRows, masterRows, skuMapRows, cogsRows, dqRows, refRows, range, filters, isAdmin, cogsError }) {
  const { start, end, prevStart, prevEnd, days } = range
  const { facilityToLocation } = buildFacilityMaps(refRows)
  const locOf = f => facilityToLocation.get(f) || cleanLabel(f) || 'Unknown'
  const masterIdx = buildMasterIndex(masterRows)
  const skuMap = buildSkuMap(skuMapRows || [])
  const cogsFor = buildCogsLookup(cogsRows)

  // ── Normalise GRN rows ──
  const lines = []
  let lastGrnDate = null
  for (const raw of grnRows || []) {
    const d = String(val(raw.d) || '').slice(0, 10)
    if (!d) continue
    if (!lastGrnDate || d > lastGrnDate) lastGrnDate = d
    const q = Number(raw.q) || 0
    const sub = cleanLabel(raw.sc) || 'Uncategorized'
    const { rate, tier } = cogsFor(raw.s, d, sub)
    lines.push({
      d, g: raw.g, loc: locOf(raw.f), facility: raw.f, v: cleanLabel(raw.v) || 'Unknown', t: raw.t || UNMAPPED_SOURCE,
      s: raw.s, key: normSku(raw.s), c: cleanLabel(raw.c) || 'Uncategorized', sc: sub, n: cleanLabel(raw.n),
      q, r: Number(raw.r) || 0, lt: raw.lt == null ? null : Number(raw.lt),
      value: rate == null ? 0 : q * rate, costed: rate != null, tier,
      cur: d >= start && d <= end, prev: d >= prevStart && d <= prevEnd,
    })
  }

  // ── Normalise sales rows → master SKU ──
  const sales = []
  let lastSalesDate = null
  for (const raw of salesRows || []) {
    const d = String(val(raw.d) || '').slice(0, 10)
    if (!d) continue
    const rawKey = raw.k || ''
    if (!rawKey || isPseudoSku(rawKey)) continue
    const { key } = resolveMasterSkuKey(rawKey, skuMap)
    const m = masterIdx.get(key)
    if (!m) continue
    const q = Number(raw.q) || 0
    if (!lastSalesDate || d > lastSalesDate) lastSalesDate = d
    sales.push({ d, key, s: m.sku, c: m.category, sc: m.subCategory, n: m.name, loc: locOf(raw.f), q, cur: d >= start && d <= end, prev: d >= prevStart && d <= prevEnd })
  }

  // ── Filter options: from the CURRENT period, before any filter ──
  const cur0 = lines.filter(l => l.cur)
  const uniq = xs => [...new Set(xs)]
  const vendorType = new Map()
  for (const l of cur0) if (!vendorType.has(l.v)) vendorType.set(l.v, l.t)
  const subPairs = new Map()
  for (const l of cur0) subPairs.set(`${l.c}|${l.sc}`, { category: l.c, subCategory: l.sc })
  const orderLoc = (a, b) => { const ia = LOCATION_ORDER.indexOf(a), ib = LOCATION_ORDER.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b) }
  const presentTypes = uniq(cur0.map(l => l.t))
  const filterOptions = {
    warehouses: uniq(cur0.map(l => l.loc)).sort(orderLoc),
    sourceTypes: [...SOURCE_TYPES, UNMAPPED_SOURCE].filter(t => SOURCE_TYPES.includes(t) || presentTypes.includes(t)),
    vendors: [...vendorType.entries()].map(([vendor, sourceType]) => ({ vendor, sourceType })).sort((a, b) => a.vendor.localeCompare(b.vendor)),
    categories: uniq(cur0.map(l => l.c)).sort(),
    subCategories: [...subPairs.values()].sort((a, b) => a.category.localeCompare(b.category) || a.subCategory.localeCompare(b.subCategory)),
  }

  // ── Apply filters ──
  const F = filters
  const grnOk = l => inList(F.warehouse, l.loc) && inList(F.sourceType, l.t) && inList(F.vendor, l.v)
    && inList(F.category, l.c) && inList(F.subCategory, l.sc) && skuSearch(F.sku, l.s, l.n, l.sc)
  const salesOk = x => inList(F.warehouse, x.loc) && inList(F.category, x.c) && inList(F.subCategory, x.sc) && skuSearch(F.sku, x.s, x.n, x.sc)
  const L = lines.filter(grnOk)
  const S = sales.filter(salesOk)
  const Lc = L.filter(l => l.cur), Lp = L.filter(l => l.prev)
  const Sc = S.filter(x => x.cur), Sp = S.filter(x => x.prev)

  // ── KPIs ──
  const kpi = (ls, ss) => {
    const units = ls.reduce((a, l) => a + l.q, 0)
    const salesUnits = ss.reduce((a, x) => a + x.q, 0)
    return {
      units: round(units), value: round(ls.reduce((a, l) => a + l.value, 0)),
      grns: new Set(ls.map(l => l.g)).size, skus: new Set(ls.map(l => l.key)).size, vendors: new Set(ls.map(l => l.v)).size,
      rejected: round(ls.reduce((a, l) => a + l.r, 0)),
      salesUnits: round(salesUnits), ratio: salesUnits > 0 ? units / salesUnits : null,
      uncostedUnits: round(ls.filter(l => !l.costed).reduce((a, l) => a + l.q, 0)),
    }
  }
  const kpis = { cur: kpi(Lc, Sc), prev: kpi(Lp, Sp) }

  // ── Daily trend (current period, every day present) ──
  const allTypes = filterOptions.sourceTypes
  const dayMap = new Map()
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i)
    const row = { date: d, total: 0, sales: 0 }
    for (const t of allTypes) row[t] = 0
    dayMap.set(d, row)
  }
  for (const l of Lc) { const r = dayMap.get(l.d); if (r) { r[l.t] = (r[l.t] || 0) + l.q; r.total += l.q } }
  for (const x of Sc) { const r = dayMap.get(x.d); if (r) r.sales += x.q }
  const daily = [...dayMap.values()].map(r => { const o = { ...r }; for (const k of Object.keys(o)) if (typeof o[k] === 'number') o[k] = round(o[k]); return o })

  // ── Source mix ──
  const totalUnits = kpis.cur.units
  const sourceMix = allTypes.map(t => {
    const ls = Lc.filter(l => l.t === t)
    const units = ls.reduce((a, l) => a + l.q, 0)
    const grns = new Set(ls.map(l => l.g)).size
    return { sourceType: t, units: round(units), value: round(ls.reduce((a, l) => a + l.value, 0)), grns, avgGrnSize: grns ? round(units / grns, 1) : 0, share: totalUnits ? units / totalUnits : 0 }
  }).filter(r => r.units !== 0 || r.grns > 0 || SOURCE_TYPES.includes(r.sourceType))

  // ── Vendor performance ──
  const vMap = new Map()
  for (const l of Lc) {
    if (!vMap.has(l.v)) vMap.set(l.v, { vendor: l.v, types: new Map(), grns: new Set(), skus: new Set(), dates: new Set(), units: 0, value: 0, rejected: 0, leadByGrn: new Map(), first: l.d, last: l.d })
    const a = vMap.get(l.v)
    a.types.set(l.t, (a.types.get(l.t) || 0) + 1)
    a.grns.add(l.g); a.skus.add(l.key); a.dates.add(l.d)
    a.units += l.q; a.value += l.value; a.rejected += l.r
    if (l.d < a.first) a.first = l.d
    if (l.d > a.last) a.last = l.d
    if (l.lt != null && l.lt >= 0) a.leadByGrn.set(l.g, Math.max(a.leadByGrn.get(l.g) ?? -1, l.lt))
  }
  const vendors = [...vMap.values()].map(a => {
    const sourceType = [...a.types.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || UNMAPPED_SOURCE
    const leads = [...a.leadByGrn.values()]
    const nDates = a.dates.size
    return {
      vendor: a.vendor, sourceType, grns: a.grns.size, units: round(a.units), value: round(a.value), skus: a.skus.size,
      lastGrn: a.last, avgDaysBetween: nDates > 1 ? round(dayDiff(a.first, a.last) / (nDates - 1), 1) : null,
      rejected: round(a.rejected), rejectionPct: (a.units + a.rejected) > 0 ? (a.rejected / (a.units + a.rejected)) * 100 : 0,
      leadTimeDays: leads.length ? round(leads.reduce((s, x) => s + x, 0) / leads.length, 1) : null, leadTimeGrns: leads.length,
    }
  }).sort((a, b) => b.units - a.units)

  // ── Warehouses ──
  const wMap = new Map()
  const wRow = loc => { if (!wMap.has(loc)) wMap.set(loc, { location: loc, units: 0, value: 0, grns: new Set(), salesUnits: 0 }); return wMap.get(loc) }
  for (const l of Lc) { const w = wRow(l.loc); w.units += l.q; w.value += l.value; w.grns.add(l.g) }
  for (const x of Sc) wRow(x.loc).salesUnits += x.q
  const warehouses = [...wMap.values()]
    .map(w => ({ location: w.location, units: round(w.units), value: round(w.value), grns: w.grns.size, salesUnits: round(w.salesUnits), ratio: w.salesUnits > 0 ? w.units / w.salesUnits : null }))
    .filter(w => w.units !== 0 || w.salesUnits !== 0)
    .sort((a, b) => orderLoc(a.location, b.location))

  // ── Category / sub-category ──
  const cMap = new Map()
  const cRow = (c, sc) => {
    if (!cMap.has(c)) cMap.set(c, { category: c, units: 0, value: 0, salesUnits: 0, subs: new Map() })
    const cat = cMap.get(c)
    if (!cat.subs.has(sc)) cat.subs.set(sc, { subCategory: sc, units: 0, value: 0, salesUnits: 0 })
    return [cat, cat.subs.get(sc)]
  }
  for (const l of Lc) { const [c, s] = cRow(l.c, l.sc); c.units += l.q; s.units += l.q; c.value += l.value; s.value += l.value }
  for (const x of Sc) { const [c, s] = cRow(x.c, x.sc); c.salesUnits += x.q; s.salesUnits += x.q }
  const fin = o => ({ ...o, units: round(o.units), value: round(o.value), salesUnits: round(o.salesUnits), ratio: o.salesUnits > 0 ? o.units / o.salesUnits : null })
  const categories = [...cMap.values()].map(c => ({
    ...fin({ category: c.category, units: c.units, value: c.value, salesUnits: c.salesUnits }),
    subs: [...c.subs.values()].map(fin).sort((a, b) => b.units - a.units || b.salesUnits - a.salesUnits),
  })).sort((a, b) => b.units - a.units || b.salesUnits - a.salesUnits)

  // ── SKU detail ──
  const salesBySku = new Map()
  for (const x of Sc) salesBySku.set(x.key, (salesBySku.get(x.key) || 0) + x.q)
  const kMap = new Map()
  for (const l of Lc) {
    if (!kMap.has(l.key)) kMap.set(l.key, { sku: l.s, skuKey: l.key, name: l.n, category: l.c, subCategory: l.sc, units: 0, value: 0, rejected: 0, grns: new Set(), lastInward: l.d, uncosted: 0 })
    const k = kMap.get(l.key)
    k.units += l.q; k.value += l.value; k.rejected += l.r; k.grns.add(l.g)
    if (!l.costed) k.uncosted += l.q
    if (l.d > k.lastInward) k.lastInward = l.d
  }
  const skus = [...kMap.values()].map(k => ({
    sku: k.sku, skuKey: k.skuKey, name: k.name, category: k.category, subCategory: k.subCategory,
    units: round(k.units), value: round(k.value), rejected: round(k.rejected), grns: k.grns.size, lastInward: k.lastInward,
    salesUnits: round(salesBySku.get(k.skuKey) || 0), uncostedUnits: round(k.uncosted),
  })).sort((a, b) => b.units - a.units)

  // ── Data quality (admins only) ──
  let dataQuality = null
  if (isAdmin && dqRows) {
    const pick = kind => dqRows.filter(r => r.kind === kind)
    const sum = (rs, k) => round(rs.reduce((a, r) => a + (Number(r[k]) || 0), 0))
    const sku = pick('sku').map(r => ({ itemSkuCode: r.a, finalSku: r.b, reason: r.c, lines: Number(r.lines) || 0, units: round(Number(r.units) || 0), lastDate: val(r.last_date) })).sort((a, b) => b.units - a.units)
    const vendor = pick('vendor').map(r => ({ vendorName: r.a, lines: Number(r.lines) || 0, units: round(Number(r.units) || 0), lastDate: val(r.last_date) })).sort((a, b) => b.units - a.units)
    const qty = pick('qty').map(r => ({ grnCode: r.a, itemSkuCode: r.b, quantityReceived: r.c, lines: Number(r.lines) || 0, lastDate: val(r.last_date) }))
    dataQuality = {
      unmappedSku: { count: sku.length, lines: sum(pick('sku'), 'lines'), units: sum(pick('sku'), 'units'), rows: sku },
      unmappedVendor: { count: vendor.length, lines: sum(pick('vendor'), 'lines'), units: sum(pick('vendor'), 'units'), rows: vendor },
      badQty: { count: qty.length, lines: sum(pick('qty'), 'lines'), rows: qty },
    }
  }

  const notes = []
  if (cogsError) notes.push(`COGS could not be loaded (${cogsError}); ₹ values show as 0.`)
  if (F.vendor.length || F.sourceType.length) notes.push('Sales are not filtered by vendor or source type (a sale has neither).')

  return {
    meta: {
      start, end, prevStart, prevEnd, days, isAdmin: !!isAdmin,
      lastGrnDate, lastSalesDate, generatedAt: new Date().toISOString(), notes,
    },
    filterOptions, kpis, daily, sourceMix, vendors, warehouses, categories, skus, dataQuality,
  }
}

// Drill-down payload for one SKU: inward events + daily inward + daily sales, start → today.
export function buildSkuDetail({ grnRows, salesRows, refRows, start, end }) {
  const { facilityToLocation } = buildFacilityMaps(refRows)
  const events = (grnRows || []).map(r => ({
    date: String(val(r.d)).slice(0, 10), grnCode: r.g, vendor: cleanLabel(r.v) || 'Unknown', sourceType: r.t || UNMAPPED_SOURCE,
    warehouse: facilityToLocation.get(r.f) || cleanLabel(r.f), units: round(Number(r.q) || 0), rejected: round(Number(r.r) || 0),
  })).sort((a, b) => a.date.localeCompare(b.date) || String(a.grnCode).localeCompare(String(b.grnCode)))
  const inByDay = new Map(), salesByDay = new Map()
  for (const e of events) inByDay.set(e.date, (inByDay.get(e.date) || 0) + e.units)
  for (const r of salesRows || []) { const d = String(val(r.d)).slice(0, 10); salesByDay.set(d, (salesByDay.get(d) || 0) + (Number(r.q) || 0)) }
  const daily = []
  for (let d = start; d <= end; d = addDays(d, 1)) daily.push({ date: d, inward: round(inByDay.get(d) || 0), sales: round(salesByDay.get(d) || 0) })
  return { start, end, events, daily }
}
// (The estimated-stock rebuild runs in the browser — src/inventory/inwardUtils.js estimateStock —
// because today's stock comes from Inventory Health's feed, which the page already holds.)
