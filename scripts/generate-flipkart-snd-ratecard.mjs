// Precomputes the Flipkart SnD (Sales & Distribution) rate card and writes
// public/flipkart-snd-ratecard.json. Run standalone: `node scripts/generate-flipkart-snd-ratecard.mjs`.
//
// Grain: (month, category, subcategory, fulfillmentType). Each cell combines Flipkart's own
// settlement-side fee (from flipkart_reports.profit_and_loss's total_expenses_inrx) with Frido's
// own fulfilment cost (NON_FBF/FBM orders, weight-slab rate card) and Stocko movement charge
// (FBF orders, ₹8/kg) — neither of which Flipkart's own export includes. Methodology verified
// against real BigQuery data across Mar-Jun 2026 (grand total ~24.88% all-in SnD on Net Revenue).
//
// IMPORTANT: flipkart_reports.* is a raw/un-deduplicated dataset — rows get re-appended across
// sync batches (same order_id+order_item_id reappearing identically under a different
// _dlt_load_id). Every query against any table in this dataset MUST dedupe via
// ROW_NUMBER() OVER (PARTITION BY order_id, order_item_id ORDER BY _dlt_load_id DESC) = 1
// before aggregating, or totals silently inflate 1.5-3x (confirmed and fixed during derivation).
//
// Known limitation: the sku_name -> item-master Weight_gms join (used for Frido's own fulfilment
// cost) only matches ~80% of units by volume (lower than the ~99% match rate on the main revenue
// join) — unmatched units simply contribute 0 to that order's weight-based cost rather than a
// fabricated estimate. The category-fallback layer (see below) is the safety net for SKUs with
// no profit_and_loss coverage at all, not for this narrower weight-join gap.

import { writeFileSync } from 'fs'
import { getBQ } from '../api/_bq.js'
import { loadSndRateSlabs, rateForWeight } from '../api/_sndRates.js'

const STOCKO_RATE_PER_KG = 8 // FBF Stocko movement charge, confirmed rate (NOT Amazon's ₹4/kg)
const MIN_ORDER_COUNT = 15   // below this, a cell is flagged `isThin` (apply-time fallback may skip it)

console.log('Generating Flipkart SnD rate card…')
const t0 = Date.now()
const bq = getBQ()

async function query(sql) {
  const [rows] = await bq.query({ query: sql, maximumBytesBilled: '20000000000' })
  return rows
}

// Shared dedup CTE text, reused by every query against flipkart_reports.profit_and_loss.
const DEDUPED_PL = `
  WITH deduped AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY order_id, order_item_id ORDER BY _dlt_load_id DESC) AS rn
    FROM \`frido-429506.flipkart_reports.profit_and_loss\`
    WHERE order_date IS NOT NULL AND order_date != ''
  ),
  clean AS (
    SELECT * FROM deduped WHERE rn = 1 AND order_status != 'CANCELLED'
  )
`

// Item-master normalization — identical pattern to api/_bq.js's buildQuery() item_master CTE.
const ITEM_MASTER_CTE = `
  item_master AS (
    SELECT
      REGEXP_REPLACE(UPPER(TRIM(Product_Code)), r'[^A-Z0-9-]', '') AS sku_key,
      CASE WHEN LOWER(ANY_VALUE(Category_Name)) LIKE '%spare%' THEN 'Others' ELSE ANY_VALUE(Category_Name) END AS category,
      CASE WHEN LOWER(ANY_VALUE(Category_Name)) LIKE '%spare%' THEN 'Others' ELSE ANY_VALUE(Sub_category) END AS subcategory,
      SAFE_CAST(NULLIF(TRIM(ANY_VALUE(Weight_gms)), '') AS FLOAT64) AS weight_gms
    FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\`
    WHERE Product_Code IS NOT NULL AND TRIM(Product_Code) != ''
    GROUP BY sku_key
  )
`

// ---------------------------------------------------------------------------
// Query 1 — core P&L aggregation: (month, category, subcategory, fulfillment_type)
// ---------------------------------------------------------------------------
async function fetchCoreExpenses() {
  const sql = `
    ${DEDUPED_PL},
    ${ITEM_MASTER_CTE}
    SELECT
      FORMAT_DATE('%Y-%m', DATE(clean.order_date)) AS month,
      im.category, im.subcategory,
      clean.fulfillment_type AS fulfillment_type,
      COUNT(DISTINCT clean.order_id) AS order_count,
      SUM(clean.net_units) AS net_units,
      SUM(clean.estimated_net_sales_inrx) AS net_sales,
      SUM(clean.total_expenses_inrx) AS fk_expense
    FROM clean
    LEFT JOIN item_master im
      ON REGEXP_REPLACE(UPPER(TRIM(clean.sku_name)), r'[^A-Z0-9-]', '') = im.sku_key
    WHERE im.subcategory IS NOT NULL AND clean.fulfillment_type IS NOT NULL
    GROUP BY month, category, subcategory, fulfillment_type
  `
  return query(sql)
}

// ---------------------------------------------------------------------------
// Query 2 — per-order-LINE weight, for Frido's own fulfilment/Stocko cost.
// Gross qty (includes Returned/RTO/CIR, excludes only Cancelled) per confirmed instruction.
//
// Returns one row per (order_id, sku_name) line, each carrying its own line_weight_gm AND the
// order's total order_weight_gm (via a window function) — the weight-slab RATE is looked up
// once per order using the pooled order_weight_gm (a courier bills the whole shipment as one
// parcel), but the resulting cost is then split across lines by weight_share = line/order, so a
// multi-SKU order's cost lands proportionally across every category/subcategory it actually
// touches instead of being dumped entirely onto one arbitrarily-chosen line's category (the
// original ANY_VALUE()-per-order approach silently misattributed ~Rs 24L/3.8% of orders' cost
// between categories — confirmed via a full-dataset check before this fix).
// ---------------------------------------------------------------------------
async function fetchOrderWeights() {
  const sql = `
    ${DEDUPED_PL},
    ${ITEM_MASTER_CTE},
    lined AS (
      SELECT
        clean.order_id,
        FORMAT_DATE('%Y-%m', DATE(clean.order_date)) AS month,
        clean.fulfillment_type,
        im.category, im.subcategory,
        (clean.gross_units * im.weight_gms) AS line_weight_gm,
        SUM(clean.gross_units * im.weight_gms) OVER (PARTITION BY clean.order_id) AS order_weight_gm
      FROM clean
      LEFT JOIN item_master im
        ON REGEXP_REPLACE(UPPER(TRIM(clean.sku_name)), r'[^A-Z0-9-]', '') = im.sku_key
      WHERE clean.fulfillment_type IS NOT NULL AND im.weight_gms IS NOT NULL AND im.weight_gms > 0
        AND clean.gross_units > 0
    )
    SELECT order_id, month, fulfillment_type, category, subcategory, order_weight_gm,
      SAFE_DIVIDE(SUM(line_weight_gm), ANY_VALUE(order_weight_gm)) AS weight_share
    FROM lined
    WHERE order_weight_gm > 0
    GROUP BY order_id, month, fulfillment_type, category, subcategory, order_weight_gm
  `
  return query(sql)
}

// ---------------------------------------------------------------------------
// Query 3 — category fallback layer: SKUs with ZERO rows in profit_and_loss at all.
// Bounded to profit_and_loss's own date coverage (it starts partway through the sales-side
// table's history) — without this bound, "missing SKU" would wrongly include years of
// pre-profit_and_loss-coverage sales that were never actually missing, just out of range.
// ---------------------------------------------------------------------------
async function fetchMissingSkuRevenue(plMinDate, plMaxDate) {
  const sql = `
    WITH pl_skus AS (
      SELECT DISTINCT UPPER(TRIM(sku_name)) AS sku_key
      FROM \`frido-429506.flipkart_reports.profit_and_loss\`
      WHERE sku_name IS NOT NULL
    ),
    ${ITEM_MASTER_CTE}
    SELECT
      FORMAT_DATE('%Y-%m', s.OrderDate) AS month,
      COALESCE(im.category, 'Others') AS category,
      -- fulfillment_channel on the sales-side fact table is already 'FBF'/'NON_FBF'/'Dropship' —
      -- fold the rare 'Dropship' rows into NON_FBF (Frido/seller-fulfilled, same as seller_easy_ship).
      CASE WHEN s.fulfillment_channel = 'FBF' THEN 'FBF' ELSE 'NON_FBF' END AS fulfillment_type,
      SUM(CASE WHEN s.Order_Status NOT IN ('Return','RTO','Cancelled','CIR') THEN s.SellingPrice_Exc_GST ELSE 0 END) AS net_sales,
      COUNT(DISTINCT s.OrderId) AS order_count
    FROM \`frido-429506.production.fact_all_platform_sales_report\` s
    LEFT JOIN item_master im
      ON REGEXP_REPLACE(UPPER(TRIM(s.masterskucode)), r'[^A-Z0-9-]', '') = im.sku_key
    WHERE s.Channel = 'Flipkart' AND NOT (s.OrderId LIKE '%_EX%')
      AND s.OrderDate BETWEEN '${plMinDate}' AND '${plMaxDate}'
      AND UPPER(TRIM(s.masterskucode)) NOT IN (SELECT sku_key FROM pl_skus)
    GROUP BY month, category, fulfillment_type
    HAVING net_sales != 0
  `
  return query(sql)
}

// ---------------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------------
async function fetchPlDateRange() {
  const rows = await query(`
    SELECT MIN(order_date) AS mn, MAX(order_date) AS mx
    FROM \`frido-429506.flipkart_reports.profit_and_loss\`
    WHERE order_date IS NOT NULL AND order_date != ''
  `)
  return { min: rows[0].mn, max: rows[0].mx }
}

const plRange = await fetchPlDateRange()
console.log(`profit_and_loss date coverage: ${plRange.min} to ${plRange.max}`)

const [coreRows, weightRows, missingRows] = await Promise.all([
  fetchCoreExpenses(),
  fetchOrderWeights(),
  fetchMissingSkuRevenue(plRange.min, plRange.max),
])
console.log(`Fetched ${coreRows.length} core rows, ${weightRows.length} weighted orders, ${missingRows.length} missing-SKU rows in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

const slabs = loadSndRateSlabs()

// Frido's own fulfilment/Stocko cost, spread into (month, category, subcategory, fulfillment_type)
// buckets. The weight-slab RATE is resolved once per order (against the order's pooled
// order_weight_gm — a courier bills the whole shipment as one parcel), then split across each
// line's (category, subcategory) bucket by weight_share = line_weight / order_weight, so a
// multi-SKU order's cost lands proportionally across every category it touches instead of all
// on one arbitrarily-chosen line (see fetchOrderWeights()'s comment for the bug this replaced).
const fridoCostByCell = {} // key: month::category::subcategory::fulfillment_type -> cost sum
for (const row of weightRows) {
  const orderWeightGm = parseFloat(row.order_weight_gm) || 0
  const weightShare = parseFloat(row.weight_share) || 0
  if (orderWeightGm <= 0 || weightShare <= 0) continue
  const ft = row.fulfillment_type
  let orderCost = 0
  if (ft === 'NON_FBF') {
    const rate = rateForWeight(slabs, orderWeightGm)
    if (rate) orderCost = rate.fulfilment
  } else if (ft === 'FBF') {
    orderCost = (orderWeightGm / 1000) * STOCKO_RATE_PER_KG
  }
  const cost = orderCost * weightShare
  if (cost <= 0) continue
  const key = `${row.month}::${row.category || 'Others'}::${row.subcategory || 'Others'}::${ft}`
  fridoCostByCell[key] = (fridoCostByCell[key] || 0) + cost
}

// Build the real observed cells.
const cells = coreRows.map(row => {
  const netSales = parseFloat(row.net_sales) || 0
  const fkExpense = -(parseFloat(row.fk_expense) || 0) // total_expenses_inrx is negative in source
  const key = `${row.month}::${row.category || 'Others'}::${row.subcategory}::${row.fulfillment_type}`
  const fridoCost = fridoCostByCell[key] || 0
  const allInExpense = fkExpense + fridoCost
  const orderCount = parseInt(row.order_count) || 0
  return {
    month: row.month,
    category: row.category || 'Others',
    subcategory: row.subcategory,
    fulfillmentType: row.fulfillment_type,
    netSales: Math.round(netSales),
    fkExpense: Math.round(fkExpense),
    fkExpensePct: netSales > 0 ? Math.round((fkExpense / netSales) * 10000) / 100 : 0,
    fridoFulfilmentCost: Math.round(fridoCost),
    fridoCostPct: netSales > 0 ? Math.round((fridoCost / netSales) * 10000) / 100 : 0,
    allInExpense: Math.round(allInExpense),
    allInExpensePct: netSales > 0 ? Math.round((allInExpense / netSales) * 10000) / 100 : 0,
    orderCount,
    isThin: orderCount < MIN_ORDER_COUNT,
  }
}).filter(c => c.netSales !== 0)

// Category-fallback: blend the real cells (FBF+NON_FBF combined) per (month, category), PLUS
// fold in the missing-SKU revenue at an estimated cost using that same blended rate — this is
// the "second rung" of the apply-time fallback chain, and also how the ~63 missing SKUs' revenue
// gets a cost estimate.
const catAgg = {} // key: month::category -> {netSales, cost, orderCount}
for (const c of cells) {
  const key = `${c.month}::${c.category}`
  if (!catAgg[key]) catAgg[key] = { netSales: 0, cost: 0, orderCount: 0 }
  catAgg[key].netSales += c.netSales
  catAgg[key].cost += c.allInExpense
  catAgg[key].orderCount += c.orderCount
}
const categoryFallback = Object.entries(catAgg).map(([key, v]) => {
  const [month, category] = key.split('::')
  return {
    month, category,
    blendedAllInExpensePct: v.netSales > 0 ? Math.round((v.cost / v.netSales) * 10000) / 100 : 0,
    orderCount: v.orderCount,
  }
})
const catFallbackByKey = Object.fromEntries(categoryFallback.map(c => [`${c.month}::${c.category}`, c]))

// Missing-SKU revenue costed at its (month, category)'s blended fallback rate.
let missingRevTotal = 0, missingCostTotal = 0
for (const row of missingRows) {
  const netSales = parseFloat(row.net_sales) || 0
  if (!netSales) continue
  const key = `${row.month}::${row.category}`
  const fallback = catFallbackByKey[key]
  const pct = fallback ? fallback.blendedAllInExpensePct : 0
  missingRevTotal += netSales
  missingCostTotal += netSales * (pct / 100)
}

// Grand totals across the measured cells + missing-SKU fallback layer, for the verify script.
const measuredNetSales = cells.reduce((s, c) => s + c.netSales, 0)
const measuredCost = cells.reduce((s, c) => s + c.allInExpense, 0)
const grandNetSales = measuredNetSales + missingRevTotal
const grandCost = measuredCost + missingCostTotal

const months = [...new Set(cells.map(c => c.month))].sort()

const output = {
  generatedAt: new Date().toISOString(),
  months,
  cells,
  categoryFallback,
  meta: {
    minOrderCountThreshold: MIN_ORDER_COUNT,
    stockoRatePerKg: STOCKO_RATE_PER_KG,
    grandTotals: {
      measuredNetSales: Math.round(measuredNetSales),
      measuredCost: Math.round(measuredCost),
      measuredAllInExpensePct: measuredNetSales > 0 ? Math.round((measuredCost / measuredNetSales) * 10000) / 100 : 0,
      missingSkuNetSales: Math.round(missingRevTotal),
      missingSkuCost: Math.round(missingCostTotal),
      netSales: Math.round(grandNetSales),
      totalCost: Math.round(grandCost),
      allInExpensePct: grandNetSales > 0 ? Math.round((grandCost / grandNetSales) * 10000) / 100 : 0,
    },
  },
}

writeFileSync('public/flipkart-snd-ratecard.json', JSON.stringify(output))
console.log(`Written public/flipkart-snd-ratecard.json — ${cells.length} cells, ${months.length} months`)
console.log('Grand totals:', output.meta.grandTotals)
console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
process.exit(0)
