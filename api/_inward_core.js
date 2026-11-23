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
// Real vendor_mapping.vendor_type values shown on this page, in display order. 'Internal' (intra-
// company transfers, not a real inward receipt) is deliberately excluded everywhere — at the SQL
// level, not just filtered in the UI — per explicit instruction: this page shows only 3rd-party
// (Domestic/Import) and Inhouse inward. 'Unmapped' = vendor name missing from vendor_mapping (kept
// so totals reconcile; listed under Data quality).
export const SOURCE_TYPES = ['Domestic', 'Import', 'Inhouse']
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
    SAFE_CAST(f.QuantityRejected AS FLOAT64) * f.pack_qty AS rej
  FROM flt f
  JOIN skumap s ON s.productid = TRIM(f.final_sku_code)
  JOIN master m ON m.product_code = s.masterskucode
  LEFT JOIN vmap v ON v.vendor_name = f.VendorName
  -- Internal (intra-company transfer, not a real 3rd-party/Inhouse inward receipt) is dropped here,
  -- at the source, so it never reaches any number, filter option, chart or table on this page.
  WHERE COALESCE(v.vendor_type, '${UNMAPPED_SOURCE}') != 'Internal'
)
SELECT CAST(grn_date AS STRING) AS d, grn_code AS g, facility AS f, vendor AS v, source_type AS t,
  sku AS s, category AS c, sub_category AS sc, name AS n,
  SUM(IFNULL(qty, 0)) AS q, SUM(IFNULL(rej, 0)) AS r
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

// Full GRN-level detail (one row per raw GRN line, not aggregated) for every SKU that doesn't
// resolve to the SKU master — admins only, exported from the Data quality panel so they can see
// exactly which GRNs/vendors/dates carried each unmapped code, not just a per-code rollup.
export const DQ_UNMAPPED_SKU_DETAIL_SQL = `
WITH ${GRN_FILTERED_CTES},
j AS (
  SELECT f.*, s.masterskucode, m.product_code
  FROM flt f
  LEFT JOIN skumap s ON s.productid = TRIM(f.final_sku_code)
  LEFT JOIN master m ON m.product_code = s.masterskucode
)
SELECT
  CAST(grn_date AS STRING) AS grnDate, GRNCode AS grnCode, ItemSkuCode AS itemSkuCode, final_sku_code AS finalSkuCode,
  IF(masterskucode IS NULL, 'No usable row in productid_sku_mapping', 'Master code not in SKU master') AS reason,
  Facility AS facility, VendorName AS vendorName, VendorCode AS vendorCode,
  GRNInvoiceNo AS grnInvoiceNo, CAST(GRNInvoiceDate AS STRING) AS grnInvoiceDate, POCode AS poCode, CAST(PODate AS STRING) AS poDate,
  SAFE_CAST(QuantityReceived AS FLOAT64) AS quantityReceived, SAFE_CAST(QuantityRejected AS FLOAT64) AS quantityRejected,
  pack_qty AS packQty, SAFE_CAST(QuantityReceived AS FLOAT64) * pack_qty AS units,
  RejectionReason AS rejectionReason, GrnitemStatus AS grnItemStatus
FROM j
WHERE product_code IS NULL
ORDER BY grn_date DESC, GRNCode`

// Same, for every GRN line whose vendor name has no row in vendor_mapping — these DO still count
// in the page's main totals (shown as source type "Unmapped"), unlike unresolved SKUs; this export
// just lets an admin see exactly which GRNs/vendors need a vendor_mapping entry.
export const DQ_UNMAPPED_VENDOR_DETAIL_SQL = `
WITH ${GRN_FILTERED_CTES},
j AS (
  SELECT f.*, s.masterskucode, m.product_code
  FROM flt f
  LEFT JOIN skumap s ON s.productid = TRIM(f.final_sku_code)
  LEFT JOIN master m ON m.product_code = s.masterskucode
)
SELECT
  CAST(j.grn_date AS STRING) AS grnDate, j.GRNCode AS grnCode, j.ItemSkuCode AS itemSkuCode, j.product_code AS resolvedSku,
  j.Facility AS facility, j.VendorName AS vendorName, j.VendorCode AS vendorCode,
  j.GRNInvoiceNo AS grnInvoiceNo, CAST(j.GRNInvoiceDate AS STRING) AS grnInvoiceDate, j.POCode AS poCode, CAST(j.PODate AS STRING) AS poDate,
  SAFE_CAST(j.QuantityReceived AS FLOAT64) AS quantityReceived, SAFE_CAST(j.QuantityRejected AS FLOAT64) AS quantityRejected,
  j.pack_qty AS packQty, SAFE_CAST(j.QuantityReceived AS FLOAT64) * j.pack_qty AS units,
  j.RejectionReason AS rejectionReason, j.GrnitemStatus AS grnItemStatus
FROM j
LEFT JOIN vmap v ON v.vendor_name = j.VendorName
WHERE j.product_code IS NOT NULL AND v.vendor_name IS NULL
ORDER BY j.grn_date DESC, j.GRNCode`

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

// One vendor's inward lines (drill-down) — @vendor is the unified vendor name shown in the table.
export const VENDOR_GRN_SQL = GRN_SQL.replace('FROM res\nGROUP BY', 'FROM res\nWHERE vendor = @vendor\nGROUP BY')

// One sub-category's inward lines (drill-down, across all its SKUs) — @subCategory is the SKU
// master's Sub_category value shown in the sub-category roll-up view.
export const SUBCAT_GRN_SQL = GRN_SQL.replace('FROM res\nGROUP BY', 'FROM res\nWHERE sub_category = @subCategory\nGROUP BY')

// Earliest-ever inward date per resolved SKU, from the GRN_FLOOR (not from the selected range's
// start) through @qEnd — independent of the range picked, so "New SKU" always means "never
// received before", not "not received last period". Reuses GRN_SQL unchanged except the WHERE's
// lower bound: GRN_SQL's own `grn_date BETWEEN @qStart AND @qEnd` becomes `grn_date <= @qEnd` here
// (no @qStart), so this always scans the FULL history up to the end of the selected range.
export const FIRST_SKU_SQL = `
WITH ${GRN_FILTERED_CTES.replace("AND grn_date BETWEEN CAST(@qStart AS DATE) AND CAST(@qEnd AS DATE)", 'AND grn_date <= CAST(@qEnd AS DATE)')},
res AS (
  SELECT f.grn_date, m.product_code AS sku
  FROM flt f
  JOIN skumap s ON s.productid = TRIM(f.final_sku_code)
  JOIN master m ON m.product_code = s.masterskucode
  LEFT JOIN vmap v ON v.vendor_name = f.VendorName
  WHERE COALESCE(v.vendor_type, '${UNMAPPED_SOURCE}') != 'Internal'
)
SELECT sku AS s, CAST(MIN(grn_date) AS STRING) AS d
FROM res
GROUP BY sku`

// Last-ever inward per resolved SKU (date, that date's total qty, and vendor(s) on that date) —
// full history (GRN_FLOOR → @qEnd), independent of the page's selected range, for the Product
// master table (a SKU not inwarded in the selected range still shows its true last inward here).
// Same two-step shape as FIRST_SKU_SQL's sibling idea, but MAX instead of MIN, plus the date's
// own qty/vendor via a self-join back onto the max date per SKU.
export const LAST_SKU_SQL = `
WITH ${GRN_FILTERED_CTES.replace("AND grn_date BETWEEN CAST(@qStart AS DATE) AND CAST(@qEnd AS DATE)", 'AND grn_date <= CAST(@qEnd AS DATE)')},
res AS (
  SELECT f.grn_date, m.product_code AS sku,
    COALESCE(v.unified_vendor_name, f.VendorName) AS vendor,
    SAFE_CAST(f.QuantityReceived AS FLOAT64) * f.pack_qty AS qty
  FROM flt f
  JOIN skumap s ON s.productid = TRIM(f.final_sku_code)
  JOIN master m ON m.product_code = s.masterskucode
  LEFT JOIN vmap v ON v.vendor_name = f.VendorName
  WHERE COALESCE(v.vendor_type, '${UNMAPPED_SOURCE}') != 'Internal'
),
last_date AS (
  SELECT sku, MAX(grn_date) AS last_grn_date
  FROM res
  GROUP BY sku
)
SELECT r.sku AS s, CAST(ld.last_grn_date AS STRING) AS d,
  SUM(IFNULL(r.qty, 0)) AS q, r.vendor AS v
FROM res r
JOIN last_date ld ON ld.sku = r.sku AND r.grn_date = ld.last_grn_date
GROUP BY r.sku, ld.last_grn_date, r.vendor`

export const MASTER_SQL = `SELECT TRIM(Product_Code) AS code, TRIM(Category_Name) AS category, TRIM(Sub_category) AS sub_category, TRIM(Name) AS name, TRIM(Type) AS type
FROM ${TBL.master} WHERE Product_Code IS NOT NULL AND TRIM(Product_Code) != ''`

// Vendor master: every 3rd-party/Inhouse vendor ever used (from GRN_FLOOR, Internal excluded — same
// rule as everywhere else on this page), full history through @qEnd — independent of the page's
// selected range, so a vendor with no GRN in the selected window still appears with its true
// lifetime totals and last-ever GRN date. Mirrors LAST_SKU_SQL's shape, but per vendor: one row per
// (vendor, GRN date, SKU, sub-category) — SKU/sub-category breakdown is rolled up in JS, since a
// GROUP BY here would need every grain at once anyway.
export const VENDOR_MASTER_SQL = `
WITH ${GRN_FILTERED_CTES.replace("AND grn_date BETWEEN CAST(@qStart AS DATE) AND CAST(@qEnd AS DATE)", 'AND grn_date <= CAST(@qEnd AS DATE)')},
res AS (
  SELECT f.grn_date, f.GRNCode AS grn_code,
    COALESCE(v.unified_vendor_name, f.VendorName) AS vendor,
    COALESCE(v.vendor_type, '${UNMAPPED_SOURCE}') AS source_type,
    m.product_code AS sku, m.sub_category,
    SAFE_CAST(f.QuantityReceived AS FLOAT64) * f.pack_qty AS qty
  FROM flt f
  JOIN skumap s ON s.productid = TRIM(f.final_sku_code)
  JOIN master m ON m.product_code = s.masterskucode
  LEFT JOIN vmap v ON v.vendor_name = f.VendorName
  WHERE COALESCE(v.vendor_type, '${UNMAPPED_SOURCE}') != 'Internal'
)
SELECT vendor AS v, source_type AS t, CAST(grn_date AS STRING) AS d, grn_code AS g, sku AS s, sub_category AS sc,
  SUM(IFNULL(qty, 0)) AS q
FROM res
GROUP BY v, t, d, g, s, sc`

// Units excluded as raw material / packaging (the PKG-code filter in GRN_FILTERED_CTES), for the
// phone + laptop "Finished goods only · X units … not shown" note. Small addition only — surfaces
// an existing exclusion, doesn't change what's excluded. Same date-floor/facility/invoice filters
// as the real GRN_FILTERED_CTES, minus the PKG regex itself, intersected with it via HAVING-style
// predicate so the count is exactly "what GRN_FILTERED_CTES's PKG line removes".
export const EXCLUDED_PKG_SQL = `
WITH grn AS (
  SELECT *, SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(GRNDate, 1, 10)) AS grn_date
  FROM ${TBL.grn}
),
flt AS (
  SELECT *, COALESCE(SAFE_CAST(REGEXP_EXTRACT(ItemSkuCode, r'[-_]RAW[-_]?PO[-_]?([0-9]+)$') AS INT64), 1) AS pack_qty
  FROM grn
  WHERE grn_date >= DATE '${GRN_FLOOR}'
    AND grn_date BETWEEN CAST(@qStart AS DATE) AND CAST(@qEnd AS DATE)
    AND Facility != 'myfrido-Vadgaon_Traceability'
    AND NOT REGEXP_CONTAINS(UPPER(IFNULL(CAST(GRNInvoiceNo AS STRING), '')), r'WRONG')
    AND REGEXP_CONTAINS(UPPER(ItemSkuCode), r'PKG')
)
SELECT SUM(IFNULL(SAFE_CAST(QuantityReceived AS FLOAT64), 0) * pack_qty) AS units
FROM flt`
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
//   grnRows      GRN_SQL rows for [prevStart, end]
//   salesRows    SALES_SQL rows for [prevStart, end]
//   master       MASTER_SQL rows; skuMapRows SKUMAP_SQL rows
//   firstSkuRows FIRST_SKU_SQL rows (earliest-ever inward date per SKU, GRN_FLOOR → end) — drives
//                the "New SKUs this period" KPI; optional (defaults to none ⇒ newSkus stays 0)
//   lastSkuRows  LAST_SKU_SQL rows (latest-ever inward date/qty/vendor per SKU, GRN_FLOOR → end) —
//                drives the Product master table's Last inward columns; optional (defaults to none)
//   refRows      optional facility/channel reference rows (defaults to api/data snapshots)
export function buildInwardPayload({ grnRows, salesRows, masterRows, skuMapRows, firstSkuRows, lastSkuRows, vendorMasterRows, dqRows, refRows, range, filters, isAdmin, excludedPkgUnits }) {
  const { start, end, prevStart, prevEnd, days } = range
  const { facilityToLocation } = buildFacilityMaps(refRows)
  const locOf = f => facilityToLocation.get(f) || cleanLabel(f) || 'Unknown'
  const masterIdx = buildMasterIndex(masterRows)
  const skuMap = buildSkuMap(skuMapRows || [])

  // ── Normalise GRN rows ──
  // Internal (intra-company transfer) is already dropped by GRN_SQL's WHERE clause; this second,
  // defense-in-depth check means a row that somehow slips through (a future caller, a regressed
  // query) still never reaches this page's numbers.
  const lines = []
  let lastGrnDate = null
  for (const raw of grnRows || []) {
    if (raw.t === 'Internal') continue
    const d = String(val(raw.d) || '').slice(0, 10)
    if (!d) continue
    if (!lastGrnDate || d > lastGrnDate) lastGrnDate = d
    const q = Number(raw.q) || 0
    const sub = cleanLabel(raw.sc) || 'Uncategorized'
    lines.push({
      d, g: raw.g, loc: locOf(raw.f), facility: raw.f, v: cleanLabel(raw.v) || 'Unknown', t: raw.t || UNMAPPED_SOURCE,
      s: raw.s, key: normSku(raw.s), c: cleanLabel(raw.c) || 'Uncategorized', sc: sub, n: cleanLabel(raw.n),
      q, r: Number(raw.r) || 0,
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
    const rejected = ls.reduce((a, l) => a + l.r, 0)
    return {
      units: round(units),
      grns: new Set(ls.map(l => l.g)).size, skus: new Set(ls.map(l => l.key)).size, vendors: new Set(ls.map(l => l.v)).size,
      rejected: round(rejected), rejectionPct: (units + rejected) > 0 ? (rejected / (units + rejected)) * 100 : 0,
      // Standard inward-coverage convention: inward units ÷ sales units, same period. > 1 = stock
      // building (inward outpacing sell-through); < 1 = stock draining. Internal transfers are
      // already excluded from `ls` at the SQL layer, so this is 3rd-party + Inhouse inward only.
      salesUnits: round(salesUnits), ratio: salesUnits > 0 ? units / salesUnits : null,
    }
  }
  const kpis = { cur: kpi(Lc, Sc), prev: kpi(Lp, Sp) }

  // ── New SKUs this period: first-ever inward date (from GRN_FLOOR, not just the selected range)
  // falls inside [start, end]. firstSkuRows come from FIRST_SKU_SQL, keyed by resolved SKU code.
  const firstSeen = new Map()
  for (const raw of firstSkuRows || []) {
    const d = String(val(raw.d) || '').slice(0, 10)
    if (raw.s && d) firstSeen.set(raw.s, d)
  }
  const curSkuSet = new Set(Lc.map(l => l.s))
  const newSkuCount = [...curSkuSet].filter(sku => { const f = firstSeen.get(sku); return f && f >= start && f <= end }).length
  kpis.cur.newSkus = newSkuCount

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
    return { sourceType: t, units: round(units), grns, avgGrnSize: grns ? round(units / grns, 1) : 0, share: totalUnits ? units / totalUnits : 0 }
  }).filter(r => r.units !== 0 || r.grns > 0 || SOURCE_TYPES.includes(r.sourceType))

  // ── Vendor performance ──
  const vMap = new Map()
  for (const l of Lc) {
    if (!vMap.has(l.v)) vMap.set(l.v, { vendor: l.v, types: new Map(), grns: new Set(), skus: new Set(), units: 0, rejected: 0, last: l.d })
    const a = vMap.get(l.v)
    a.types.set(l.t, (a.types.get(l.t) || 0) + 1)
    a.grns.add(l.g); a.skus.add(l.key)
    a.units += l.q; a.rejected += l.r
    if (l.d > a.last) a.last = l.d
  }
  const vendors = [...vMap.values()].map(a => {
    const sourceType = [...a.types.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || UNMAPPED_SOURCE
    return {
      vendor: a.vendor, sourceType, grns: a.grns.size, units: round(a.units), skus: a.skus.size,
      lastGrn: a.last,
      rejected: round(a.rejected), rejectionPct: (a.units + a.rejected) > 0 ? (a.rejected / (a.units + a.rejected)) * 100 : 0,
    }
  }).sort((a, b) => b.units - a.units)

  // ── SKU detail ──
  const salesBySku = new Map()
  for (const x of Sc) salesBySku.set(x.key, (salesBySku.get(x.key) || 0) + x.q)
  const kMap = new Map()
  for (const l of Lc) {
    if (!kMap.has(l.key)) kMap.set(l.key, { sku: l.s, skuKey: l.key, name: l.n, category: l.c, subCategory: l.sc, units: 0, rejected: 0, grns: new Set(), lastInward: l.d })
    const k = kMap.get(l.key)
    k.units += l.q; k.rejected += l.r; k.grns.add(l.g)
    if (l.d > k.lastInward) k.lastInward = l.d
  }
  // Units per (resolved SKU, month), current AND previous period — just enough granularity for
  // the "Inward value ₹" tile (small addition) to pick the right product_cogs_monthly rate per
  // month (both for the tile itself and its ▲/▼ vs the previous period), without sending every
  // individual GRN line to the client.
  const monthlyOf = ls => {
    const m = new Map() // "sku|month" -> units
    for (const l of ls) {
      const month = monthOf(l.d)
      const k2 = `${l.s}|${month}`
      m.set(k2, (m.get(k2) || 0) + l.q)
    }
    return [...m.entries()].map(([k2, units]) => { const [sku, month] = k2.split('|'); return { sku, month, units: round(units) } })
  }
  const skuMonthly = monthlyOf(Lc)
  const prevSkuMonthly = monthlyOf(Lp)
  const skus = [...kMap.values()].map(k => ({
    sku: k.sku, skuKey: k.skuKey, name: k.name, category: k.category, subCategory: k.subCategory,
    units: round(k.units), rejected: round(k.rejected), grns: k.grns.size, lastInward: k.lastInward,
    salesUnits: round(salesBySku.get(k.skuKey) || 0),
  })).sort((a, b) => b.units - a.units)

  // ── Product master (every SKU in the SKU master, not just ones with a GRN in range) ──
  // Independent of the page's slicer filters (F) and of the selected range for existence/last-
  // inward — only the "Inward qty (range)" column reflects the selected range. Last inward date/
  // qty/vendor(s) come from lastSkuRows (LAST_SKU_SQL), full history, so a SKU with zero GRNs in
  // the selected range still shows its true last inward instead of blanks.
  const rangeQtyBySku = new Map()
  for (const l of cur0) rangeQtyBySku.set(l.key, (rangeQtyBySku.get(l.key) || 0) + l.q)
  const lastBySku = new Map() // skuKey -> { date, qty, vendors: Map<vendor, qty> }
  for (const raw of lastSkuRows || []) {
    const sku = raw.s
    if (!sku) continue
    const key = normSku(sku)
    const d = String(val(raw.d) || '').slice(0, 10)
    if (!d) continue
    if (!lastBySku.has(key)) lastBySku.set(key, { date: d, qty: 0, vendors: new Map() })
    const entry = lastBySku.get(key)
    const q = Number(raw.q) || 0
    entry.qty += q
    const vendor = cleanLabel(raw.v) || 'Unknown'
    entry.vendors.set(vendor, (entry.vendors.get(vendor) || 0) + q)
  }
  const masterSkus = [...masterIdx.entries()].map(([key, m]) => {
    const last = lastBySku.get(key)
    return {
      sku: m.sku, skuKey: key, category: m.category, subCategory: m.subCategory,
      lastInward: last?.date || null,
      lastInwardQty: last ? round(last.qty) : null,
      lastInwardVendors: last ? [...last.vendors.entries()].sort((a, b) => b[1] - a[1]).map(([vendor]) => vendor) : [],
      rangeQty: round(rangeQtyBySku.get(key) || 0),
    }
  }).sort((a, b) => (b.lastInward || '').localeCompare(a.lastInward || ''))

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
  if (F.vendor.length || F.sourceType.length) notes.push('Sales are not filtered by vendor or source type (a sale has neither).')

  // ── Vendor master (every vendor ever used, not just ones with a GRN in range) ──
  const vendorMaster = buildVendorMaster({ vendorMasterRows, start, end })

  return {
    meta: {
      start, end, prevStart, prevEnd, days, isAdmin: !!isAdmin,
      lastGrnDate, lastSalesDate, generatedAt: new Date().toISOString(), notes,
      excludedPkgUnits: excludedPkgUnits != null ? round(excludedPkgUnits) : 0,
    },
    filterOptions, kpis, daily, sourceMix, vendors, skus, skuMonthly, prevSkuMonthly, masterSkus, vendorMaster, dataQuality,
  }
}

// Drill-down for a SKU or a vendor row: its last N distinct days with a GRN (skipping zero-GRN
// days — a low-frequency vendor/SKU still gets N real data points, just spread over a longer
// span), each with that day's total units and GRN count. grnRows: SKU_GRN_SQL or VENDOR_GRN_SQL
// rows for the full history (no date filter upstream — the N-days cutoff happens here).
export function buildLastGrnDays({ grnRows, days = 10 }) {
  const byDay = new Map() // date -> { date, units, grns: Set, vendors: Map<vendor, units> }
  for (const r of grnRows || []) {
    const d = String(val(r.d) || '').slice(0, 10)
    if (!d) continue
    if (!byDay.has(d)) byDay.set(d, { date: d, units: 0, grns: new Set(), vendors: new Map() })
    const row = byDay.get(d)
    const qty = Number(r.q) || 0
    row.units += qty
    row.grns.add(r.g)
    const vendor = val(r.v) || 'Unmapped'
    row.vendors.set(vendor, (row.vendors.get(vendor) || 0) + qty)
  }
  const rows = [...byDay.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, days)
    .map(r => ({
      date: r.date, units: round(r.units), grnCount: r.grns.size,
      // Vendors for that day, highest-units first — so when >1 vendor inwarded the same
      // SKU/sub-category on the same day, both names surface in a stable, meaningful order.
      vendors: [...r.vendors.entries()].sort((a, b) => b[1] - a[1]).map(([vendor, units]) => ({ vendor, units: round(units) })),
    }))
  return { rows, lastGrnDate: rows[0]?.date || null }
}

// Vendor master (every vendor ever used, excluding Internal, from GRN_FLOOR): last-ever GRN date,
// lifetime GRNs/units, distinct SKUs/sub-categories (shown as "products supplied"), and units in
// the page's currently selected range — independent of the page's slicer filters, same convention
// as the Product master table. vendorMasterRows: VENDOR_MASTER_SQL rows, full history.
export function buildVendorMaster({ vendorMasterRows, start, end }) {
  const byVendor = new Map()
  for (const r of vendorMasterRows || []) {
    const vendor = cleanLabel(val(r.v)) || 'Unknown'
    const d = String(val(r.d) || '').slice(0, 10)
    if (!d) continue
    const q = Number(r.q) || 0
    if (!byVendor.has(vendor)) {
      byVendor.set(vendor, {
        vendor, sourceType: r.t || UNMAPPED_SOURCE, lastGrn: d, lifetimeUnits: 0, lifetimeGrns: new Set(),
        skus: new Set(), subCategories: new Map(), rangeUnits: 0,
      })
    }
    const a = byVendor.get(vendor)
    if (d > a.lastGrn) a.lastGrn = d
    a.lifetimeUnits += q
    a.lifetimeGrns.add(r.g)
    if (r.s) a.skus.add(r.s)
    const sub = cleanLabel(r.sc) || 'Uncategorized'
    a.subCategories.set(sub, (a.subCategories.get(sub) || 0) + q)
    if (d >= start && d <= end) a.rangeUnits += q
  }
  return [...byVendor.values()].map(a => ({
    vendor: a.vendor, sourceType: a.sourceType, lastGrn: a.lastGrn,
    lifetimeUnits: round(a.lifetimeUnits), lifetimeGrns: a.lifetimeGrns.size, skuCount: a.skus.size,
    rangeUnits: round(a.rangeUnits),
    // Sub-categories ("products supplied"), highest-units first — same display convention as a
    // vendor drill-down's SKUs-supplied list, but lifetime and rolled up to sub-category.
    productsSupplied: [...a.subCategories.entries()].sort((x, y) => y[1] - x[1]).map(([subCategory, units]) => ({ subCategory, units: round(units) })),
  })).sort((a, b) => (b.lastGrn || '').localeCompare(a.lastGrn || ''))
}

// Vendor drill-down's "SKUs supplied" addition: SKU · sub-category · units, for one vendor, in the
// page's selected date range (not full history, unlike the last-10-GRN-days table above) — top 10
// by units, highest first. grnRows: VENDOR_GRN_SQL rows (same per-line shape as GRN_SQL: s/sc/q),
// for the full history; filtered down to [start, end] here.
export function buildVendorSkusSupplied({ grnRows, start, end }) {
  const bySku = new Map() // skuKey -> { sku, subCategory, units }
  for (const r of grnRows || []) {
    const d = String(val(r.d) || '').slice(0, 10)
    if (!d || d < start || d > end) continue
    const sku = val(r.s)
    if (!sku) continue
    const key = normSku(sku)
    if (!bySku.has(key)) bySku.set(key, { sku, subCategory: cleanLabel(r.sc) || 'Uncategorized', units: 0 })
    bySku.get(key).units += Number(r.q) || 0
  }
  return [...bySku.values()].map(x => ({ ...x, units: round(x.units) })).sort((a, b) => b.units - a.units)
}
