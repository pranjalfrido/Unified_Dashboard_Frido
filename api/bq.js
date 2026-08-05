import { getBQ, buildQuery, netRevenueSelectFragment, computeNetRevenueMeasures } from './_bq.js'

// Server-side in-memory cache with 5-minute TTL
const cache = new Map()
const CACHE_TTL = 5 * 60 * 1000

const CACHE_VERSION = 3
function getCacheKey(body) {
  const { start, end, category, subCategory, sku, subChannel, voucher, channel, region, tier, state, city, country, paymentType, channelGroup } = body
  return JSON.stringify({ v: CACHE_VERSION, start, end, category, subCategory, sku, subChannel, voucher, channel, region, tier, state, city, country, paymentType, channelGroup })
}

function getFromCache(key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null }
  return entry.data
}

function setInCache(key, data) {
  // Keep cache size bounded to 200 entries
  if (cache.size >= 200) {
    const oldest = cache.keys().next().value
    cache.delete(oldest)
  }
  cache.set(key, { data, ts: Date.now() })
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { start, end, category, subCategory, sku, subChannel, voucher, channel: activeChannel, region, tier, state, city, country, paymentType, channelGroup } = req.body
  if (!start || !end) return res.status(400).json({ error: 'Missing start or end date' })

  const cacheKey = getCacheKey(req.body)
  const cached = getFromCache(cacheKey)
  if (cached) {
    res.setHeader('X-Cache', 'HIT')
    return res.json(cached)
  }

  const bq = getBQ()

  // Compute previous period dates (same length, immediately before start)
  const startD = new Date(start), endD = new Date(end)
  const nDaysRange = Math.round((endD - startD) / 86400000) + 1
  const prevEnd = new Date(startD); prevEnd.setDate(prevEnd.getDate() - 1)
  const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - nDaysRange + 1)
  const ps = prevStart.toISOString().slice(0, 10), pe = prevEnd.toISOString().slice(0, 10)

  // MoM: same date range shifted back 1 month
  const momStartD = new Date(startD); momStartD.setMonth(momStartD.getMonth() - 1)
  const momEndD = new Date(endD); momEndD.setMonth(momEndD.getMonth() - 1)
  const moms = momStartD.toISOString().slice(0, 10), mome = momEndD.toISOString().slice(0, 10)

  // YoY: same date range shifted back 1 year
  const yoyStartD = new Date(startD); yoyStartD.setFullYear(yoyStartD.getFullYear() - 1)
  const yoyEndD = new Date(endD); yoyEndD.setFullYear(yoyEndD.getFullYear() - 1)
  const yoys = yoyStartD.toISOString().slice(0, 10), yoye = yoyEndD.toISOString().slice(0, 10)

  // Run all aggregation queries in parallel directly on BigQuery
  const base = buildQuery(start, end, { category, subCategory, sku, subChannel, voucher, region, tier, state, city, country, paymentType, channelGroup })
  // Sub-channel-agnostic base — used only to list all available D2C sub-channels for the
  // toggle itself, so the option list doesn't collapse to just the currently-selected one.
  const baseNoSubCh = buildQuery(start, end, { category, subCategory, sku, voucher, region, tier, state, city, country, paymentType, channelGroup })
  // Offline Credit Notes are excluded from `base` by default (every other query in this file sums
  // SellingPrice_Inc_GST with no Order_Status filter, so leaving Credit Notes in would silently
  // inflate revenue). Only the offline-specific queries — which explicitly CASE on Order_Status —
  // need Credit Note rows present, so they alone use this variant.
  const baseWithCN = buildQuery(start, end, { category, subCategory, sku, subChannel, voucher, region, tier, state, city, country, paymentType, channelGroup, includeCreditNotes: true })
  const prevBaseWithCN = buildQuery(ps, pe, { category, subCategory, sku, subChannel, voucher, region, tier, state, city, country, paymentType, channelGroup, includeCreditNotes: true })
  const prevBase = buildQuery(ps, pe, { category, subCategory, sku, subChannel, voucher, region, tier, state, city, country, paymentType, channelGroup })
  const momBase = buildQuery(moms, mome, { category, subCategory, sku, subChannel, voucher, region, tier, state, city, country, paymentType, channelGroup })
  const yoyBase = buildQuery(yoys, yoye, { category, subCategory, sku, subChannel, voucher, region, tier, state, city, country, paymentType, channelGroup })

  // Detect if selected range is entirely after latest FK data — if so, shift FK queries to last available window
  const [[fkLatestRow]] = await bq.query({ query: `SELECT MAX(OrderDate) AS latest FROM \`frido-429506.production.fact_all_platform_sales_report\` WHERE Channel='Flipkart'`, maximumBytesBilled: '1000000000' })
  const fkLatestDate = fkLatestRow?.latest?.value || fkLatestRow?.latest || null
  let fkStart = start, fkEnd = end
  if (fkLatestDate && start > fkLatestDate) {
    // Shift the FK query window so it ends at fkLatestDate with same number of days
    const fkEndD = new Date(fkLatestDate)
    const fkStartD = new Date(fkEndD); fkStartD.setDate(fkStartD.getDate() - nDaysRange + 1)
    fkStart = fkStartD.toISOString().slice(0, 10)
    fkEnd = fkLatestDate
  }
  const fkBase = buildQuery(fkStart, fkEnd, { category, subCategory, sku, subChannel, voucher, region, tier, state, city, country, paymentType, channelGroup })

  const queries = {
    totals: subChannel === 'International'
      ? (() => { const cWhere = country ? ` AND source_system = '${country.replace(/'/g,"''")}'` : ''; return `SELECT COUNT(DISTINCT order_id) AS n_orders, SUM(final_total_incl_tax) AS total_rev, SUM(total_excl_tax) AS total_exc_rev, SUM(qty) AS total_qty, COUNT(DISTINCT order_date) AS n_days, COUNT(DISTINCT customer_id) AS n_custs FROM \`frido-429506.production.fact_shopify_international_orders\` WHERE order_date BETWEEN '${start}' AND '${end}' AND (financial_status IS NULL OR financial_status != 'voided')${cWhere}` })()
      : `WITH q AS (${base}) SELECT COUNT(DISTINCT OrderId) AS n_orders, SUM(SellingPrice_Inc_GST) AS total_rev, SUM(SellingPrice_Exc_GST) AS total_exc_rev, SUM(ItemQty) AS total_qty, SUM(CASE WHEN UPPER(COALESCE(MasterSKU,'')) NOT LIKE '%COUP%' AND UPPER(COALESCE(MasterSKU,'')) NOT LIKE '%DFA%' THEN ItemQty ELSE 0 END) AS asp_qty, COUNT(DISTINCT OrderDate) AS n_days, COUNT(DISTINCT CustomerId) AS n_custs, SUM(CASE WHEN (Channel='Amazon' AND SubChannel IN ('Amazon Seller Central','Amazon International')) OR Channel='Flipkart' OR Channel='Myntra' OR (Channel='Shopify' AND SubChannel != 'Shopify International') THEN SellingPrice_Inc_GST ELSE 0 END) AS return_trackable_rev FROM q`,
    byChannel: `WITH q AS (${base}) SELECT Channel, SubChannel, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS qty, SUM(CASE WHEN Order_Status = 'Cancelled' THEN SellingPrice_Inc_GST ELSE 0 END) AS cancel_rev, SUM(CASE WHEN Order_Status = 'RTO' THEN SellingPrice_Inc_GST ELSE 0 END) AS rto_rev, SUM(CASE WHEN Order_Status = 'Return' THEN SellingPrice_Inc_GST ELSE 0 END) AS return_rev, SUM(CASE WHEN Order_Status = 'CIR' THEN SellingPrice_Inc_GST ELSE 0 END) AS cir_rev FROM q WHERE NOT (Channel = 'Shopify' AND SubChannel = 'Shopify International') GROUP BY Channel, SubChannel ORDER BY rev DESC`,
    // AOV/ASP scope: All-tab blended AOV/ASP should only reflect channels with reliable per-order
    // economics — Shopify, Amazon Seller Central, Myntra, Flipkart, Firstcry, CRED — excluding
    // Amazon Vendor Central, quick-commerce (Blinkit/Zepto/Instamart, no order-level AOV concept),
    // and Offline (B2B/distributor bulk orders skew AOV/ASP heavily).
    aspAovTotals: `WITH q AS (${base}) SELECT COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(CASE WHEN UPPER(COALESCE(MasterSKU,'')) NOT LIKE '%COUP%' AND UPPER(COALESCE(MasterSKU,'')) NOT LIKE '%DFA%' THEN ItemQty ELSE 0 END) AS asp_qty FROM q WHERE (Channel='Shopify' AND SubChannel != 'Shopify International') OR (Channel='Amazon' AND SubChannel='Amazon Seller Central') OR Channel IN ('Myntra','Flipkart','Firstcry','CRED')`,
    shopifyIntlTotals: subChannel === 'International' ? `SELECT 0 AS intl_rev, 0 AS intl_exc_rev` : `SELECT SUM(final_total_incl_tax) AS intl_rev, SUM(total_excl_tax) AS intl_exc_rev FROM \`frido-429506.production.fact_shopify_international_orders\` WHERE order_date BETWEEN '${start}' AND '${end}' AND (financial_status IS NULL OR financial_status != 'voided')`,
    prevShopifyIntlTotals: subChannel === 'International' ? `SELECT 0 AS intl_rev, 0 AS intl_exc_rev` : `SELECT SUM(final_total_incl_tax) AS intl_rev, SUM(total_excl_tax) AS intl_exc_rev FROM \`frido-429506.production.fact_shopify_international_orders\` WHERE order_date BETWEEN '${ps}' AND '${pe}' AND (financial_status IS NULL OR financial_status != 'voided')`,
    // Mobility net revenue uses manager-defined filter (FinancialStatus × Order_Status whitelist)
    // instead of the generic retained-share formula. Only SellingPrice_Exc_GST from qualifying
    // rows is summed — no GST, no deduction %, just the exact combinations that count as real sales.
    mobilityNetCalc: `SELECT ROUND(SUM(SellingPrice_Exc_GST), 2) AS net_rev FROM \`frido-429506.production.fact_all_platform_sales_report\` WHERE OrderDate BETWEEN '${start}' AND '${end}' AND Channel = 'Shopify' AND SubChannel = 'Mobility' AND LOWER(COALESCE(FinancialStatus,'')) NOT LIKE '%refund%' AND ((FinancialStatus = 'paid' AND (Order_Status IN ('Delivered','Dispatched','Exchange') OR Order_Status IS NULL OR TRIM(Order_Status) = '' OR Order_Status = 'null')) OR (FinancialStatus IN ('pending','partially_paid') AND Order_Status IN ('Delivered','Dispatched','Exchange')))`,
    // shNetCalc / prevShNetCalc feed the shared measures layer (netRevenueSelectFragment +
    // computeNetRevenueMeasures in _bq.js) — the same fragment every tab uses, so Net Revenue/
    // GST/return-rate math can never drift between Shopify, other channels, and the All tab.
    shNetCalc: subChannel === 'International'
      ? (() => { const cWhere = country ? ` AND source_system = '${country.replace(/'/g,"''")}'` : ''; return `SELECT SUM(final_total_incl_tax) AS gross_inc_gst, SUM(total_excl_tax) AS gross_exc_gst, 0 AS cancel_rev, 0 AS rto_rev, 0 AS return_rev, 0 AS cir_rev, 0 AS exch_rev, 0 AS exch_orders FROM \`frido-429506.production.fact_shopify_international_orders\` WHERE order_date BETWEEN '${start}' AND '${end}' AND (financial_status IS NULL OR financial_status != 'voided')${cWhere}` })()
      : `WITH q AS (${base}) SELECT ${netRevenueSelectFragment()}, SUM(CASE WHEN Order_Status='Exchange' THEN SellingPrice_Inc_GST ELSE 0 END) AS exch_rev, COUNT(DISTINCT CASE WHEN Order_Status='Exchange' THEN OrderId END) AS exch_orders, SUM(CASE WHEN Order_Status='Cancelled' AND PaymentMode='COD' THEN SellingPrice_Inc_GST ELSE 0 END) AS cod_cancel_rev FROM q WHERE Channel='Shopify' AND SubChannel != 'Shopify International' AND SubChannel != 'Retail Store'`,
    prevShNetCalc: subChannel === 'International'
      ? (() => { const cWhere = country ? ` AND source_system = '${country.replace(/'/g,"''")}'` : ''; return `SELECT SUM(final_total_incl_tax) AS gross_inc_gst, SUM(total_excl_tax) AS gross_exc_gst, 0 AS cancel_rev, 0 AS rto_rev, 0 AS return_rev, 0 AS cir_rev, 0 AS exch_rev, 0 AS exch_orders, 0 AS cod_cancel_rev FROM \`frido-429506.production.fact_shopify_international_orders\` WHERE order_date BETWEEN '${ps}' AND '${pe}' AND (financial_status IS NULL OR financial_status != 'voided')${cWhere}` })()
      : `WITH q AS (${prevBase}) SELECT ${netRevenueSelectFragment()}, SUM(CASE WHEN Order_Status='Exchange' THEN SellingPrice_Inc_GST ELSE 0 END) AS exch_rev, COUNT(DISTINCT CASE WHEN Order_Status='Exchange' THEN OrderId END) AS exch_orders, SUM(CASE WHEN Order_Status='Cancelled' AND PaymentMode='COD' THEN SellingPrice_Inc_GST ELSE 0 END) AS cod_cancel_rev FROM q WHERE Channel='Shopify' AND SubChannel != 'Shopify International' AND SubChannel != 'Retail Store'`,
    byDate: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, Channel, SubChannel, SUM(SellingPrice_Inc_GST) AS rev, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, SUM(CASE WHEN Order_Status NOT IN ('Cancelled','RTO','Return','CIR') THEN SellingPrice_Exc_GST ELSE 0 END) AS net_exc_rev FROM q GROUP BY date, Channel, SubChannel ORDER BY date`,
    byCategory: `WITH q AS (${base}) SELECT Category, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS units, SUM(CASE WHEN UPPER(COALESCE(MasterSKU,'')) NOT LIKE '%COUP%' AND UPPER(COALESCE(MasterSKU,'')) NOT LIKE '%DFA%' THEN ItemQty ELSE 0 END) AS asp_units FROM q GROUP BY Category ORDER BY rev DESC`,
    byState: `WITH q AS (${base}) SELECT CASE WHEN TRIM(State) IS NULL OR TRIM(State) IN ('','-') THEN 'OTHERS' ELSE UPPER(TRIM(State)) END AS state, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, COUNT(DISTINCT City) AS cities FROM q WHERE State IS NOT NULL GROUP BY 1 ORDER BY rev DESC LIMIT 30`,
    shCategory: `WITH q AS (${base}) SELECT Category, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS units, SUM(CASE WHEN UPPER(COALESCE(MasterSKU,'')) NOT LIKE '%COUP%' AND UPPER(COALESCE(MasterSKU,'')) NOT LIKE '%DFA%' THEN ItemQty ELSE 0 END) AS asp_units, COUNT(DISTINCT CASE WHEN Order_Status='Cancelled' THEN OrderId END) AS cancelled, COUNT(DISTINCT CASE WHEN Order_Status IN ('RTO','Return') THEN OrderId END) AS rto, COUNT(DISTINCT CASE WHEN Order_Status='CIR' THEN OrderId END) AS cir, COUNT(DISTINCT CASE WHEN Order_Status='Exchange' THEN OrderId END) AS exch, SUM(CASE WHEN Order_Status='Cancelled' THEN SellingPrice_Inc_GST ELSE 0 END) AS cancel_rev, SUM(CASE WHEN Order_Status='Cancelled' AND PaymentMode='COD' THEN SellingPrice_Inc_GST ELSE 0 END) AS cod_cancel_rev, SUM(CASE WHEN Order_Status IN ('RTO','Return') THEN SellingPrice_Inc_GST ELSE 0 END) AS rto_rev, SUM(CASE WHEN Order_Status='CIR' THEN SellingPrice_Inc_GST ELSE 0 END) AS cir_rev, SUM(CASE WHEN Order_Status='Exchange' THEN SellingPrice_Inc_GST ELSE 0 END) AS exch_rev FROM q WHERE Channel='Shopify' GROUP BY Category ORDER BY rev DESC`,
    shCategoryPrev: `WITH q AS (${prevBase}) SELECT Category, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Shopify' GROUP BY Category`,
    shSubCategory: `WITH q AS (${base}) SELECT Category, SubCategory, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS units, SUM(CASE WHEN UPPER(COALESCE(MasterSKU,'')) NOT LIKE '%COUP%' AND UPPER(COALESCE(MasterSKU,'')) NOT LIKE '%DFA%' THEN ItemQty ELSE 0 END) AS asp_units, COUNT(DISTINCT CASE WHEN Order_Status='Cancelled' THEN OrderId END) AS cancelled, COUNT(DISTINCT CASE WHEN Order_Status IN ('RTO','Return') THEN OrderId END) AS rto, COUNT(DISTINCT CASE WHEN Order_Status='CIR' THEN OrderId END) AS cir, COUNT(DISTINCT CASE WHEN Order_Status='Exchange' THEN OrderId END) AS exch, SUM(CASE WHEN Order_Status='Cancelled' THEN SellingPrice_Inc_GST ELSE 0 END) AS cancel_rev, SUM(CASE WHEN Order_Status='Cancelled' AND PaymentMode='COD' THEN SellingPrice_Inc_GST ELSE 0 END) AS cod_cancel_rev, SUM(CASE WHEN Order_Status IN ('RTO','Return') THEN SellingPrice_Inc_GST ELSE 0 END) AS rto_rev, SUM(CASE WHEN Order_Status='CIR' THEN SellingPrice_Inc_GST ELSE 0 END) AS cir_rev, SUM(CASE WHEN Order_Status='Exchange' THEN SellingPrice_Inc_GST ELSE 0 END) AS exch_rev FROM q WHERE Channel='Shopify' GROUP BY Category, SubCategory ORDER BY rev DESC`,
    shSubCategoryPrev: `WITH q AS (${prevBase}) SELECT Category, SubCategory, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Shopify' GROUP BY Category, SubCategory`,
    shSKU: `WITH q AS (${base}) SELECT Category, SubCategory, SubChannel, MasterSKU AS sku, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS units, SUM(CASE WHEN Order_Status IN ('Cancelled','RTO','Return','CIR','Exchange') THEN ItemQty ELSE 0 END) AS return_units, COUNT(DISTINCT CASE WHEN Order_Status='Cancelled' THEN OrderId END) AS cancelled, COUNT(DISTINCT CASE WHEN Order_Status IN ('RTO','Return') THEN OrderId END) AS rto, COUNT(DISTINCT CASE WHEN Order_Status='CIR' THEN OrderId END) AS cir, COUNT(DISTINCT CASE WHEN Order_Status='Exchange' THEN OrderId END) AS exch, SUM(CASE WHEN Order_Status='Cancelled' THEN SellingPrice_Inc_GST ELSE 0 END) AS cancel_rev, SUM(CASE WHEN Order_Status='Cancelled' AND PaymentMode='COD' THEN SellingPrice_Inc_GST ELSE 0 END) AS cod_cancel_rev, SUM(CASE WHEN Order_Status IN ('RTO','Return') THEN SellingPrice_Inc_GST ELSE 0 END) AS rto_rev, SUM(CASE WHEN Order_Status='CIR' THEN SellingPrice_Inc_GST ELSE 0 END) AS cir_rev, SUM(CASE WHEN Order_Status='Exchange' THEN SellingPrice_Inc_GST ELSE 0 END) AS exch_rev FROM q WHERE Channel='Shopify' AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != '' GROUP BY Category, SubCategory, SubChannel, MasterSKU ORDER BY rev DESC`,
    shSKUPrev: `WITH q AS (${prevBase}) SELECT Category, SubCategory, MasterSKU AS sku, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Shopify' AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != '' GROUP BY Category, SubCategory, MasterSKU`,
    // PnL cost rows — per SKU × Order_Status × weight_slab for D2C India (Shopify, non-international).
    // Weight slab: if Weight_gms <= 500 → 500, else CEIL(Weight_gms / 1000) * 1000.
    // Client applies snd-rates.json lookup per slab + status to get logistics & fulfilment costs.
    // Fulfilment is charged on ALL statuses including Cancelled; logistics is status-dependent.
    // Payment gateway (1.1% of gross) and software fee (₹15/unit) are also summed here for D2C.
    shSkuCosts: `WITH q AS (${base}),
    lined AS (
      SELECT
        MasterSKU AS sku,
        SubChannel AS sub_channel,
        COALESCE(Order_Status, 'Delivered') AS order_status,
        ItemQty AS qty,
        SellingPrice_Inc_GST AS gross_inc_gst,
        CASE
          WHEN Weight_gms IS NULL THEN NULL
          WHEN (Weight_gms * ItemQty) <= 500 THEN 500
          ELSE CAST(CEIL((Weight_gms * ItemQty) / 1000.0) * 1000 AS INT64)
        END AS weight_slab
      FROM q
      WHERE Channel = 'Shopify'
        AND SubChannel NOT IN ('Shopify International', 'Retail Store')
        AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != ''
    )
    SELECT
      sku,
      sub_channel,
      order_status,
      weight_slab,
      COUNT(*) AS line_count,
      SUM(qty) AS total_qty,
      SUM(gross_inc_gst) AS gross_inc_gst
    FROM lined
    GROUP BY sku, sub_channel, order_status, weight_slab`,
    shState: `WITH q AS (${base}) SELECT UPPER(TRIM(State)) AS state, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(ItemQty) AS units, COUNT(DISTINCT City) AS cities, COUNT(DISTINCT CASE WHEN Order_Status IN ('RTO','Return','CIR') THEN OrderId END) AS rto_orders, SUM(CASE WHEN Order_Status IN ('RTO','Return','CIR') THEN SellingPrice_Inc_GST ELSE 0 END) AS return_rev FROM q WHERE Channel='Shopify' AND State IS NOT NULL AND TRIM(State) != '' GROUP BY UPPER(TRIM(State)) ORDER BY rev DESC LIMIT 30`,
    shStateTotal: `WITH q AS (${base}) SELECT SUM(SellingPrice_Inc_GST) AS total_rev, COUNT(DISTINCT OrderId) AS total_orders FROM q WHERE Channel='Shopify' AND State IS NOT NULL AND TRIM(State) != ''`,
    shStatePrev: `WITH q AS (${prevBase}) SELECT UPPER(TRIM(State)) AS state, SUM(SellingPrice_Inc_GST) AS rev, COUNT(DISTINCT OrderId) AS orders FROM q WHERE Channel='Shopify' AND State IS NOT NULL AND TRIM(State) != '' GROUP BY UPPER(TRIM(State))`,
    shRegion: `WITH q AS (${base}) SELECT Region AS region, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(ItemQty) AS units FROM q WHERE Channel='Shopify' AND Region IS NOT NULL GROUP BY Region ORDER BY rev DESC`,
    shTier: `WITH q AS (${base}) SELECT City_Tier AS city_tier, Tier_Label AS tier_label, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(ItemQty) AS units FROM q WHERE Channel='Shopify' AND City_Tier IS NOT NULL GROUP BY City_Tier, Tier_Label ORDER BY City_Tier`,
    shCity: `WITH q AS (${base}) SELECT INITCAP(TRIM(City)) AS city, INITCAP(TRIM(State)) AS state, MAX(Region) AS region, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, COUNT(DISTINCT CASE WHEN Order_Status IN ('RTO','Return','CIR') THEN OrderId END) AS rto_orders, SUM(CASE WHEN Order_Status IN ('RTO','Return','CIR') THEN SellingPrice_Inc_GST ELSE 0 END) AS return_rev FROM q WHERE Channel='Shopify' AND City IS NOT NULL AND TRIM(City) != '' GROUP BY INITCAP(TRIM(City)), INITCAP(TRIM(State)) ORDER BY rev DESC LIMIT 50`,
    shCityTotal: `WITH q AS (${base}) SELECT SUM(SellingPrice_Inc_GST) AS total_rev, COUNT(DISTINCT OrderId) AS total_orders FROM q WHERE Channel='Shopify' AND City IS NOT NULL AND TRIM(City) != ''`,
    shCityPrev: `WITH q AS (${prevBase}) SELECT INITCAP(TRIM(City)) AS city, INITCAP(TRIM(State)) AS state, SUM(SellingPrice_Inc_GST) AS rev, COUNT(DISTINCT OrderId) AS orders FROM q WHERE Channel='Shopify' AND City IS NOT NULL AND TRIM(City) != '' GROUP BY INITCAP(TRIM(City)), INITCAP(TRIM(State))`,
    byRegion: `WITH q AS (${base}) SELECT Region AS region, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(ItemQty) AS units FROM q WHERE Region IS NOT NULL GROUP BY Region ORDER BY rev DESC`,
    byTier: `WITH q AS (${base}) SELECT City_Tier AS city_tier, Tier_Label AS tier_label, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(ItemQty) AS units FROM q WHERE City_Tier IS NOT NULL GROUP BY City_Tier, Tier_Label ORDER BY City_Tier`,
    byOrderValue: `WITH q AS (${base}), ot AS (SELECT OrderId, SUM(SellingPrice_Inc_GST) AS order_rev FROM q GROUP BY OrderId) SELECT CASE WHEN order_rev < 500 THEN '<₹500' WHEN order_rev < 1000 THEN '₹500-1K' WHEN order_rev < 2500 THEN '₹1K-2.5K' WHEN order_rev < 5000 THEN '₹2.5K-5K' WHEN order_rev < 10000 THEN '₹5K-10K' WHEN order_rev < 25000 THEN '₹10K-25K' ELSE '₹25K+' END AS bucket, COUNT(*) AS cnt, SUM(order_rev) AS rev FROM ot GROUP BY 1`,
    byVoucher: `WITH q AS (${base}) SELECT CASE WHEN voucher_code IS NULL OR TRIM(voucher_code) = '' THEN 'No voucher' WHEN UPPER(voucher_code) LIKE '%PREPAID%' THEN 'Prepaid Disc' WHEN UPPER(voucher_code) LIKE '%PLM%' THEN 'Loyalty (PLM)' WHEN UPPER(voucher_code) LIKE '%FRV%' THEN 'Repeat (FRV)' WHEN REGEXP_CONTAINS(voucher_code, r'^[0-9]') OR LOWER(voucher_code) IN ('custom discount','custom_discount','simpl discount','simpldiscount','percentage','discount-3') OR LOWER(voucher_code) LIKE '%total pos%' OR LOWER(voucher_code) LIKE 'clickpost%' THEN 'POS/Manual' WHEN UPPER(voucher_code) LIKE '%HDFC%' OR UPPER(voucher_code) LIKE '%APAY%' OR UPPER(voucher_code) LIKE '%NOCOST%' OR UPPER(voucher_code) LIKE '%EMI%' OR UPPER(voucher_code) LIKE '%ONECARD%' OR UPPER(voucher_code) LIKE '%SIMPL%' THEN 'Bank/EMI' WHEN UPPER(voucher_code) LIKE 'IST-%' OR UPPER(voucher_code) LIKE '%INFLUENCER%' OR UPPER(voucher_code) LIKE 'AC-%' OR UPPER(voucher_code) LIKE 'GC-%' OR UPPER(voucher_code) LIKE 'DC-%' THEN 'Influencer/Aff' WHEN UPPER(voucher_code) LIKE '%SUMMER%' OR UPPER(voucher_code) LIKE '%BFS%' OR UPPER(voucher_code) LIKE '%LOVE%' THEN 'Sale Campaign' WHEN UPPER(voucher_code) LIKE '%FGP500%' OR UPPER(voucher_code) LIKE '%TECBXAY2%' OR UPPER(voucher_code) LIKE '%FREE GIFT COUPON%' OR LOWER(voucher_code) LIKE '%free-gift-coupon-500%' THEN 'Free Gift ₹500' WHEN UPPER(voucher_code) LIKE '%FGP1000%' OR UPPER(voucher_code) LIKE '%TECBXAY4%' THEN 'Free Gift ₹1000' WHEN UPPER(voucher_code) LIKE '%CARCOMFORT%' OR UPPER(voucher_code) LIKE '%BUNDLE%' OR UPPER(voucher_code) LIKE '%PACK%' OR UPPER(voucher_code) LIKE '%-PACK' OR UPPER(voucher_code) LIKE 'P2-%' OR UPPER(voucher_code) LIKE '%OFF-2%' OR UPPER(voucher_code) LIKE '%PACKOFF%' THEN 'Bundle/Pack' WHEN UPPER(voucher_code) IN ('FIRST50','ARCH10','FRIDO5','COMFY15','COMFY10','COMFY20','FIXPOSTURE200','FIXYOURPOSTURESALE','MYFRIDO10','FLAT100','PD20','OFF-2-PACK','WEDGEPL-59','SUMMER65') OR UPPER(voucher_code) LIKE 'COMFY%' OR UPPER(voucher_code) LIKE 'FIRST%' OR UPPER(voucher_code) LIKE 'FRIDO%' OR UPPER(voucher_code) LIKE 'ARCH%' OR UPPER(voucher_code) LIKE 'FLAT%' OR UPPER(voucher_code) LIKE 'FIXPOSTURE%' THEN 'Campaign' ELSE 'Other' END AS voucher_type, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel = 'Shopify' AND SubChannel != 'Retail Store' GROUP BY 1`,
    bySubChannel: `WITH q AS (${base}) SELECT SubChannel, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS qty FROM q WHERE Channel = 'Shopify' AND SubChannel != 'Retail Store' GROUP BY SubChannel ORDER BY rev DESC`,
    // Sub-channel-agnostic — always lists every D2C sub-channel regardless of which one is
    // currently selected, so the toggle's own option list never collapses to just the active pick.
    allSubChannels: `WITH q AS (${baseNoSubCh}) SELECT SubChannel FROM q WHERE Channel = 'Shopify' AND SubChannel NOT IN ('Retail Store', 'International', 'Shopify B2B', 'Shopify International') AND SubChannel IS NOT NULL GROUP BY SubChannel ORDER BY SubChannel`,
    byPaymentMode: `WITH q AS (${base}) SELECT CASE WHEN PaymentMode IS NULL OR TRIM(PaymentMode) = '' THEN 'Unknown' WHEN LOWER(PaymentMode) LIKE '%cod%' OR LOWER(PaymentMode) LIKE '%cash%' THEN 'COD' ELSE 'Prepaid' END AS payment_mode, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel = 'Shopify' AND SubChannel != 'Retail Store' GROUP BY 1`,
    shPaymentTypes: `WITH q AS (${base}) SELECT PaymentMode AS payment_type, COUNT(DISTINCT OrderId) AS orders FROM q WHERE Channel = 'Shopify' AND SubChannel != 'Retail Store' AND PaymentMode IS NOT NULL AND TRIM(PaymentMode) != '' GROUP BY PaymentMode ORDER BY orders DESC LIMIT 50`,
    byOrderStatus: subChannel === 'International' ? `SELECT 'Unknown' AS order_status, 0 AS cnt, 0 AS rev, 0 AS exc_rev` : `WITH q AS (${base}) SELECT Order_Status AS order_status, COUNT(DISTINCT OrderId) AS cnt, SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev FROM q GROUP BY Order_Status`,
    highTicket: `WITH q AS (${base}), ot AS (SELECT OrderId, SUM(SellingPrice_Inc_GST) AS rev FROM q GROUP BY OrderId HAVING SUM(SellingPrice_Inc_GST) >= 10000) SELECT COUNT(*) AS ht_count, SUM(rev) AS ht_rev FROM ot`,
    multiItem: `WITH q AS (${base}), ot AS (SELECT OrderId, SUM(ItemQty) AS total_qty FROM q GROUP BY OrderId) SELECT COUNT(CASE WHEN total_qty > 1 THEN 1 END) AS multi_item_orders FROM ot`,
    repeatRate: subChannel === 'International'
      ? `WITH in_range AS (SELECT DISTINCT customer_id FROM \`frido-429506.production.fact_shopify_international_orders\` WHERE order_date BETWEEN '${start}' AND '${end}' AND customer_id IS NOT NULL), prior AS (SELECT DISTINCT customer_id FROM \`frido-429506.production.fact_shopify_international_orders\` WHERE order_date < '${start}' AND customer_id IS NOT NULL) SELECT COUNT(*) AS n_custs, COUNTIF(p.customer_id IS NOT NULL) AS repeat_custs FROM in_range ir LEFT JOIN prior p USING (customer_id)`
      : `WITH in_range AS (SELECT DISTINCT customer_id FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` WHERE order_date_ist BETWEEN '${start}' AND '${end}' AND customer_id IS NOT NULL), prior AS (SELECT DISTINCT customer_id FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` WHERE order_date_ist < '${start}' AND customer_id IS NOT NULL) SELECT COUNT(*) AS n_custs, COUNTIF(p.customer_id IS NOT NULL) AS repeat_custs FROM in_range ir LEFT JOIN prior p USING (customer_id)`,
    bySubCategory: `WITH q AS (${base}) SELECT Category, SubCategory, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, SUM(ItemQty) AS units, SUM(CASE WHEN UPPER(COALESCE(MasterSKU,'')) NOT LIKE '%COUP%' AND UPPER(COALESCE(MasterSKU,'')) NOT LIKE '%DFA%' THEN ItemQty ELSE 0 END) AS asp_units, SUM(CASE WHEN Order_Status='Cancelled' THEN SellingPrice_Inc_GST ELSE 0 END) AS cancel_rev, SUM(CASE WHEN Order_Status='RTO' THEN SellingPrice_Inc_GST ELSE 0 END) AS rto_rev, SUM(CASE WHEN Order_Status='CIR' THEN SellingPrice_Inc_GST ELSE 0 END) AS cir_rev, SUM(CASE WHEN Order_Status IN ('Return','Credit Note') THEN SellingPrice_Inc_GST ELSE 0 END) AS return_rev FROM q GROUP BY Category, SubCategory ORDER BY rev DESC LIMIT 200`,
    prevByCategory: `WITH q AS (${prevBase}) SELECT Category, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Category IS NOT NULL GROUP BY Category`,
    prevBySubCategory: `WITH q AS (${prevBase}) SELECT Category, SubCategory, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Category IS NOT NULL GROUP BY Category, SubCategory`,
    byCategoryChannel: `WITH q AS (${base}) SELECT Category, Channel, SubChannel, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel != 'Flipkart' GROUP BY Category, Channel, SubChannel`,
    byCategoryChannelFk: `WITH q AS (${fkBase}) SELECT Category, Channel, SubChannel, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel = 'Flipkart' GROUP BY Category, Channel, SubChannel`,
    bySubCategoryChannel: `WITH q AS (${base}) SELECT Category, SubCategory, Channel, SubChannel, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel != 'Flipkart' GROUP BY Category, SubCategory, Channel, SubChannel ORDER BY rev DESC`,
    bySubCategoryChannelFk: `WITH q AS (${fkBase}) SELECT Category, SubCategory, Channel, SubChannel, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel = 'Flipkart' GROUP BY Category, SubCategory, Channel, SubChannel ORDER BY rev DESC`,
    byCity: `WITH q AS (${base}) SELECT UPPER(TRIM(City_L2)) AS city, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE City_L2 IS NOT NULL AND TRIM(City_L2) != '' GROUP BY UPPER(TRIM(City_L2)) ORDER BY rev DESC LIMIT 50`,
    byStatePrev: `WITH q AS (${prevBase}) SELECT CASE WHEN TRIM(State) IS NULL OR TRIM(State) IN ('','-') THEN 'OTHERS' ELSE UPPER(TRIM(State)) END AS state, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE State IS NOT NULL GROUP BY 1`,
    byStateTotal: `WITH q AS (${base}) SELECT SUM(SellingPrice_Inc_GST) AS total_rev FROM q WHERE State IS NOT NULL AND TRIM(State) != ''`,
    byCityPrev: `WITH q AS (${prevBase}) SELECT UPPER(TRIM(City_L2)) AS city, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE City_L2 IS NOT NULL AND TRIM(City_L2) != '' GROUP BY UPPER(TRIM(City_L2))`,
    byCityTotal: `WITH q AS (${base}) SELECT SUM(SellingPrice_Inc_GST) AS total_rev FROM q WHERE City_L2 IS NOT NULL AND TRIM(City_L2) != ''`,
    // No LIMIT here — this feeds skuChannelMap (AllTab's Category×Channel drill-down), and a cap
    // silently drops sub-categories from the tree entirely (their expand arrow just disappears)
    // once total SKU×category×channel combos exceed the limit. Already aggregated (SUM/COUNT),
    // not raw rows, so the result set stays small even at full SKU catalog size.
    bySKU: `WITH q AS (${base}) SELECT MasterSKU AS sku, Category AS category, SubCategory AS subcategory, Channel AS channel, SUM(ItemQty) AS units, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE MasterSKU IS NOT NULL AND TRIM(MasterSKU) != '' GROUP BY MasterSKU, Category, SubCategory, Channel ORDER BY rev DESC`,
    byFinancialStatus: `WITH q AS (${base}) SELECT FinancialStatus AS financial_status, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel = 'Shopify' AND SubChannel != 'Retail Store' AND FinancialStatus IS NOT NULL GROUP BY FinancialStatus ORDER BY orders DESC`,
    byFulfilmentStatus: `WITH q AS (${base}) SELECT FulfilmentStatus AS fulfil_status, COUNT(DISTINCT OrderId) AS orders FROM q WHERE Channel = 'Shopify' AND SubChannel != 'Retail Store' AND FulfilmentStatus IS NOT NULL GROUP BY FulfilmentStatus ORDER BY orders DESC`,
    byRefundTrend: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, COUNT(DISTINCT OrderId) AS total_orders, COUNTIF(is_refund = 1) AS refund_lines FROM q WHERE Channel = 'Shopify' AND SubChannel != 'Retail Store' GROUP BY date ORDER BY date`,
    byDailyReturnTrend: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, COUNT(DISTINCT OrderId) AS total_orders, COUNT(DISTINCT CASE WHEN Order_Status='RTO' THEN OrderId END) AS rto_orders, COUNT(DISTINCT CASE WHEN Order_Status='Return' THEN OrderId END) AS return_orders, COUNT(DISTINCT CASE WHEN Order_Status='Exchange' THEN OrderId END) AS exch_orders, COUNT(DISTINCT CASE WHEN Order_Status='CIR' THEN OrderId END) AS cir_orders, COUNT(DISTINCT CASE WHEN Order_Status='Cancelled' THEN OrderId END) AS cancel_orders FROM q WHERE Channel = 'Shopify' AND SubChannel != 'Retail Store' GROUP BY date ORDER BY date`,
    topOrders: `WITH q AS (${base}), ot AS (SELECT OrderId, CAST(OrderDate AS STRING) AS order_date, Channel, State, City, SUM(SellingPrice_Inc_GST) AS rev, SUM(ItemQty) AS qty, MAX(FulfilmentStatus) AS order_status, MAX(CustomerId) AS customer_id, MAX(voucher_code) AS voucher_code, STRING_AGG(DISTINCT ChannelSKUCode, ', ' ORDER BY ChannelSKUCode LIMIT 5) AS skus FROM q GROUP BY OrderId, OrderDate, Channel, State, City) SELECT * FROM ot ORDER BY rev DESC LIMIT 20`,
    byVoucherRaw: `WITH q AS (${base}) SELECT TRIM(voucher_code) AS voucher_code, COUNT(DISTINCT OrderId) AS orders FROM q WHERE Channel = 'Shopify' AND SubChannel != 'Retail Store' AND voucher_code IS NOT NULL AND TRIM(voucher_code) != '' GROUP BY TRIM(voucher_code) ORDER BY orders DESC LIMIT 300`,
    byCIR: subChannel === 'International' ? `SELECT 0 AS cir_rev, 0 AS cir_exc_rev, 0 AS cir_orders` : `WITH q AS (${base}) SELECT SUM(SellingPrice_Inc_GST) AS cir_rev, SUM(SellingPrice_Exc_GST) AS cir_exc_rev, COUNT(DISTINCT OrderId) AS cir_orders FROM q WHERE Order_Status = 'CIR'`,
    byReturn: subChannel === 'International' ? `SELECT 0 AS return_rev, 0 AS return_exc_rev, 0 AS return_orders` : `WITH q AS (${base}) SELECT SUM(SellingPrice_Inc_GST) AS return_rev, SUM(SellingPrice_Exc_GST) AS return_exc_rev, COUNT(DISTINCT OrderId) AS return_orders FROM q WHERE Order_Status = 'Return'`,
    byExchange: subChannel === 'International' ? `SELECT 0 AS exchange_orders, 0 AS exchange_rev` : `WITH q AS (${base}) SELECT COUNT(DISTINCT OrderId) AS exchange_orders, SUM(SellingPrice_Inc_GST) AS exchange_rev FROM q WHERE Order_Status = 'Exchange'`,
    shReturnReasons: `SELECT COALESCE(NULLIF(TRIM(Customer_Return_Reason),''), 'Unknown') AS reason, COALESCE(NULLIF(TRIM(Customer_Sub_Reason),''), 'Unknown') AS sub_reason, COALESCE(NULLIF(TRIM(Category),''), 'Others') AS category, COALESCE(NULLIF(TRIM(SubCategory),''), 'Others') AS sub_category, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev FROM \`frido-429506.production.fact_all_platform_sales_report\` WHERE OrderDate BETWEEN '${start}' AND '${end}' AND Channel = 'Shopify' AND SubChannel != 'Retail Store' AND Order_Status IN ('RTO','Return','CIR') AND Customer_Return_Reason IS NOT NULL AND TRIM(Customer_Return_Reason) != ''${subChannel === 'ShopifyIndia' ? ` AND SubChannel != 'Shopify International'` : ''} GROUP BY 1,2,3,4 ORDER BY orders DESC`,
    byRTO: subChannel === 'International' ? `SELECT 0 AS rto_rev, 0 AS rto_exc_rev, 0 AS rto_orders` : `WITH q AS (${base}) SELECT SUM(SellingPrice_Inc_GST) AS rto_rev, SUM(SellingPrice_Exc_GST) AS rto_exc_rev, COUNT(DISTINCT OrderId) AS rto_orders FROM q WHERE Order_Status = 'RTO'`,
    returnNumerator: subChannel === 'International' ? `SELECT 0 AS return_numerator_rev` : `WITH q AS (${base}) SELECT SUM(CASE WHEN ((Channel='Amazon' AND SubChannel IN ('Amazon Seller Central','Amazon International')) OR Channel IN ('Flipkart','Myntra') OR (Channel='Shopify' AND SubChannel != 'Shopify International')) AND Order_Status IN ('RTO','Return','CIR','Cancelled') THEN SellingPrice_Inc_GST WHEN Channel IN ('CRED','Firstcry') AND Order_Status = 'Return' THEN SellingPrice_Inc_GST WHEN Channel='Retail' AND Order_Status IN ('RTO','Return','CIR','Cancelled') THEN SellingPrice_Inc_GST WHEN Channel='offline_sales' AND Order_Status = 'Credit Note' THEN SellingPrice_Inc_GST ELSE 0 END) AS return_numerator_rev FROM q`,
    prevTotals: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS total_rev, SUM(SellingPrice_Exc_GST) AS total_exc_rev, COUNT(DISTINCT OrderId) AS n_orders, SUM(ItemQty) AS total_qty, COUNT(DISTINCT CASE WHEN Order_Status IN ('RTO','Return') THEN OrderId END) AS rto_orders, COUNT(DISTINCT CASE WHEN Order_Status = 'CIR' THEN OrderId END) AS cir_orders FROM q`,
    prevAspAovTotals: `WITH q AS (${prevBase}) SELECT COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(CASE WHEN UPPER(COALESCE(MasterSKU,'')) NOT LIKE '%COUP%' AND UPPER(COALESCE(MasterSKU,'')) NOT LIKE '%DFA%' THEN ItemQty ELSE 0 END) AS asp_qty FROM q WHERE (Channel='Shopify' AND SubChannel != 'Shopify International') OR (Channel='Amazon' AND SubChannel='Amazon Seller Central') OR Channel IN ('Myntra','Flipkart','Firstcry','CRED')`,
    momTotals: `WITH q AS (${momBase}) SELECT SUM(SellingPrice_Inc_GST) AS total_rev, SUM(SellingPrice_Exc_GST) AS total_exc_rev, COUNT(DISTINCT OrderId) AS n_orders FROM q`,
    yoyTotals: `WITH q AS (${yoyBase}) SELECT SUM(SellingPrice_Inc_GST) AS total_rev, SUM(SellingPrice_Exc_GST) AS total_exc_rev, COUNT(DISTINCT OrderId) AS n_orders FROM q`,
    prevByChannel: `WITH q AS (${prevBase}) SELECT Channel, SubChannel, SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(CASE WHEN Order_Status = 'Cancelled' THEN SellingPrice_Inc_GST ELSE 0 END) AS cancel_rev, SUM(CASE WHEN Order_Status = 'RTO' THEN SellingPrice_Inc_GST ELSE 0 END) AS rto_rev, SUM(CASE WHEN Order_Status = 'Return' THEN SellingPrice_Inc_GST ELSE 0 END) AS return_rev, SUM(CASE WHEN Order_Status = 'CIR' THEN SellingPrice_Inc_GST ELSE 0 END) AS cir_rev FROM q WHERE NOT (Channel = 'Shopify' AND SubChannel = 'Shopify International') GROUP BY Channel, SubChannel`,
    prevByDate: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q GROUP BY date ORDER BY date`,
    prevShopify: subChannel === 'International'
      ? (() => { const cWhere = country ? ` AND source_system = '${country.replace(/'/g,"''")}'` : ''; return `SELECT SUM(final_total_incl_tax) AS rev, SUM(total_excl_tax) AS exc_rev, COUNT(DISTINCT order_id) AS orders, SUM(qty) AS units, 0 AS rto_orders, 0 AS cir_orders, 0 AS exchange_orders FROM \`frido-429506.production.fact_shopify_international_orders\` WHERE order_date BETWEEN '${ps}' AND '${pe}' AND (financial_status IS NULL OR financial_status != 'voided')${cWhere}` })()
      : `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, COUNT(DISTINCT CASE WHEN Order_Status IN ('RTO','Return') THEN OrderId END) AS rto_orders, COUNT(DISTINCT CASE WHEN Order_Status = 'CIR' THEN OrderId END) AS cir_orders, COUNT(DISTINCT CASE WHEN Order_Status='Exchange' THEN OrderId END) AS exchange_orders FROM q WHERE Channel='Shopify' AND SubChannel != 'Shopify International'`,
    shTotals: subChannel === 'International'
      ? (() => { const cWhere = country ? ` AND source_system = '${country.replace(/'/g,"''")}'` : ''; return `SELECT SUM(final_total_incl_tax) AS rev, SUM(total_excl_tax) AS exc_rev, COUNT(DISTINCT order_id) AS orders, SUM(qty) AS qty FROM \`frido-429506.production.fact_shopify_international_orders\` WHERE order_date BETWEEN '${start}' AND '${end}' AND (financial_status IS NULL OR financial_status != 'voided')${cWhere}` })()
      : `WITH q AS (${base}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS qty, SUM(CASE WHEN UPPER(COALESCE(MasterSKU,'')) NOT LIKE '%COUP%' AND UPPER(COALESCE(MasterSKU,'')) NOT LIKE '%DFA%' THEN ItemQty ELSE 0 END) AS asp_qty FROM q WHERE Channel='Shopify' AND SubChannel != 'Shopify International'`,
    shDaily: subChannel === 'International'
      ? (() => { const cWhere = country ? ` AND source_system = '${country.replace(/'/g,"''")}'` : ''; return `SELECT CAST(order_date AS STRING) AS date, SUM(final_total_incl_tax) AS rev, SUM(total_excl_tax) AS exc_rev, COUNT(DISTINCT order_id) AS orders, SUM(qty) AS units FROM \`frido-429506.production.fact_shopify_international_orders\` WHERE order_date BETWEEN '${start}' AND '${end}' AND (financial_status IS NULL OR financial_status != 'voided')${cWhere} GROUP BY date ORDER BY date` })()
      : `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units FROM q WHERE Channel='Shopify' AND SubChannel != 'Shopify International' GROUP BY date ORDER BY date`,
    prevShopifyDaily: subChannel === 'International'
      ? (() => { const cWhere = country ? ` AND source_system = '${country.replace(/'/g,"''")}'` : ''; return `SELECT CAST(order_date AS STRING) AS date, SUM(final_total_incl_tax) AS rev FROM \`frido-429506.production.fact_shopify_international_orders\` WHERE order_date BETWEEN '${ps}' AND '${pe}' AND (financial_status IS NULL OR financial_status != 'voided')${cWhere} GROUP BY date ORDER BY date` })()
      : `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Shopify' AND SubChannel != 'Shopify International' GROUP BY date ORDER BY date`,
    prevShopifyCancel: `WITH q AS (${prevBase}) SELECT COUNT(DISTINCT CASE WHEN Order_Status='Cancelled' THEN OrderId END) AS cancelled_orders, COUNT(DISTINCT OrderId) AS total_orders FROM q WHERE Channel='Shopify'`,
    prevAmzSC: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, COUNT(DISTINCT CASE WHEN FinancialStatus != 'Cancelled' THEN OrderId END) AS orders, SUM(CASE WHEN FinancialStatus != 'Cancelled' THEN ItemQty ELSE 0 END) AS units, SUM(CASE WHEN fulfillment_channel='Amazon' THEN SellingPrice_Inc_GST ELSE 0 END) AS fba_rev, COUNT(DISTINCT CASE WHEN FinancialStatus='Cancelled' THEN OrderId END) AS cancelled_orders, COUNT(DISTINCT CASE WHEN FulfilmentStatus='Shipped' THEN OrderId END) AS shipped_orders FROM q WHERE SubChannel='Amazon Seller Central'`,
    prevAmzVC: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS units FROM q WHERE SubChannel='Amazon Vendor Central'`,
    prevAmzDaily: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Amazon' GROUP BY date ORDER BY date`,
    prevFk: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, SUM(CASE WHEN SubChannel='FBF' THEN SellingPrice_Inc_GST ELSE 0 END) AS fbf_rev, SUM(CASE WHEN SubChannel!='FBF' THEN SellingPrice_Inc_GST ELSE 0 END) AS nonfbf_rev, COUNT(DISTINCT CASE WHEN FulfilmentStatus='Cancelled' THEN OrderId END) AS cancel_orders, ROUND(SUM(CASE WHEN Order_Status IN ('Return','RTO') THEN ABS(SellingPrice_Inc_GST) ELSE 0 END),0) AS return_rev, ROUND(SUM(CASE WHEN FulfilmentStatus != 'Cancelled' THEN SellingPrice_Inc_GST ELSE 0 END),0) AS delivered_rev FROM q WHERE Channel='Flipkart'`,
    prevFkDaily: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Flipkart' GROUP BY date ORDER BY date`,
    prevBl: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS units, COUNT(DISTINCT SubCategory) AS skus, COUNT(DISTINCT City) AS cities, COUNT(DISTINCT OrderId) AS orders FROM q WHERE Channel='Blinkit'`,
    prevBlDaily: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Blinkit' GROUP BY date ORDER BY date`,
    prevIn: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS units, COUNT(DISTINCT SubCategory) AS skus, COUNT(DISTINCT City) AS cities, COUNT(DISTINCT OrderId) AS orders FROM q WHERE Channel='Instamart'`,
    prevInDaily: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Instamart' GROUP BY date ORDER BY date`,
    prevZp: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS units, COUNT(DISTINCT SubCategory) AS skus, COUNT(DISTINCT City) AS cities, COUNT(DISTINCT OrderId) AS orders FROM q WHERE Channel='Zepto'`,
    prevZpDaily: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Zepto' GROUP BY date ORDER BY date`,
    prevCr: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, COUNT(DISTINCT SubCategory) AS skus, COUNT(DISTINCT City) AS cities FROM q WHERE Channel='CRED'`,
    prevCrNetCalc: `WITH q AS (${prevBase}) SELECT ${netRevenueSelectFragment()} FROM q WHERE Channel='CRED'`,
    prevCrDaily: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='CRED' GROUP BY date ORDER BY date`,
    prevFc: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, COUNT(DISTINCT SubCategory) AS skus, COUNT(DISTINCT City) AS cities FROM q WHERE Channel='Firstcry'`,
    prevFcNetCalc: `WITH q AS (${prevBase}) SELECT ${netRevenueSelectFragment()} FROM q WHERE Channel='Firstcry'`,
    prevFcDaily: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Firstcry' GROUP BY date ORDER BY date`,
    amzSCTotals: `WITH q AS (${base}) SELECT COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units FROM q WHERE SubChannel = 'Amazon Seller Central' AND FinancialStatus != 'Cancelled'`,
    // Gross here is ALL orders (not pre-filtering out Cancelled) so cancel_rev/return_rev read as a
    // true share-of-gross, consistent with the shared measures formula (computeNetRevenueMeasures).
    // Amazon SC doesn't distinguish RTO from Return (combined as return_rev) and has no CIR status;
    // cancellation comes from FinancialStatus, not Order_Status/FulfilmentStatus, on this channel.
    amzSCNetCalc: `WITH q AS (${base}) SELECT ROUND(SUM(CASE WHEN SellingPrice_Inc_GST > 0 THEN SellingPrice_Inc_GST ELSE 0 END),2) AS gross_inc_gst, ROUND(SUM(CASE WHEN SellingPrice_Inc_GST > 0 THEN SellingPrice_Exc_GST ELSE 0 END),2) AS gross_exc_gst, ROUND(SUM(CASE WHEN Order_Status IN ('Return','RTO') THEN ABS(SellingPrice_Inc_GST) ELSE 0 END),2) AS return_rev, ROUND(SUM(CASE WHEN FinancialStatus = 'Cancelled' THEN ABS(SellingPrice_Inc_GST) ELSE 0 END),2) AS cancel_rev, 0 AS rto_rev, 0 AS cir_rev FROM q WHERE SubChannel = 'Amazon Seller Central'`,
    amzSCFulfillment: `WITH q AS (${base}) SELECT fulfillment_channel, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, SUM(ItemQty) AS units FROM q WHERE SubChannel = 'Amazon Seller Central' AND FulfilmentStatus != 'Cancelled' AND SellingPrice_Inc_GST > 0 GROUP BY fulfillment_channel`,
    amzSCStatus: `WITH q AS (${base}) SELECT FinancialStatus AS order_status, COUNT(DISTINCT OrderId) AS orders FROM q WHERE SubChannel = 'Amazon Seller Central' GROUP BY order_status ORDER BY orders DESC`,
    amzSCOrderStatusDebug: `WITH q AS (${base}) SELECT Order_Status, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE SubChannel = 'Amazon Seller Central' GROUP BY Order_Status ORDER BY orders DESC`,
    amzSCStates: `WITH q AS (${base}), base AS (SELECT UPPER(TRIM(State)) AS ship_state, OrderId, Order_Status, SellingPrice_Inc_GST, FulfilmentStatus FROM q WHERE SubChannel = 'Amazon Seller Central') SELECT ship_state, COUNT(DISTINCT CASE WHEN FulfilmentStatus != 'Cancelled' AND SellingPrice_Inc_GST > 0 THEN OrderId END) AS orders, ROUND(SUM(CASE WHEN FulfilmentStatus != 'Cancelled' AND SellingPrice_Inc_GST > 0 THEN SellingPrice_Inc_GST ELSE 0 END),0) AS rev, COUNT(DISTINCT CASE WHEN Order_Status IN ('Return','RTO') THEN OrderId END) AS rto_orders, ROUND(SUM(CASE WHEN Order_Status IN ('Return','RTO') THEN ABS(SellingPrice_Inc_GST) ELSE 0 END),0) AS return_rev FROM base GROUP BY ship_state ORDER BY rev DESC`,
    amzSCCities: `WITH q AS (${base}), base AS (SELECT UPPER(TRIM(City_L2)) AS city, OrderId, Order_Status, SellingPrice_Inc_GST, FinancialStatus FROM q WHERE SubChannel = 'Amazon Seller Central' AND City_L2 IS NOT NULL AND TRIM(City_L2) != '') SELECT city, COUNT(DISTINCT CASE WHEN FinancialStatus != 'Cancelled' AND SellingPrice_Inc_GST > 0 THEN OrderId END) AS orders, ROUND(SUM(CASE WHEN FinancialStatus != 'Cancelled' AND SellingPrice_Inc_GST > 0 THEN SellingPrice_Inc_GST ELSE 0 END),0) AS rev, COUNT(DISTINCT CASE WHEN Order_Status IN ('Return','RTO') THEN OrderId END) AS rto_orders, ROUND(SUM(CASE WHEN Order_Status IN ('Return','RTO') THEN ABS(SellingPrice_Inc_GST) ELSE 0 END),0) AS return_rev FROM base GROUP BY city ORDER BY rev DESC LIMIT 50`,
    amzSCStatesPrev: `WITH q AS (${prevBase}) SELECT UPPER(TRIM(State)) AS ship_state, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE SubChannel = 'Amazon Seller Central' AND FulfilmentStatus != 'Cancelled' AND SellingPrice_Inc_GST > 0 GROUP BY ship_state`,
    amzSCCitiesPrev: `WITH q AS (${prevBase}) SELECT UPPER(TRIM(City_L2)) AS city, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE SubChannel = 'Amazon Seller Central' AND FinancialStatus != 'Cancelled' AND City_L2 IS NOT NULL AND TRIM(City_L2) != '' GROUP BY city`,
    amzSCStateTotal: `WITH q AS (${base}) SELECT ROUND(SUM(SellingPrice_Inc_GST),0) AS total_rev FROM q WHERE SubChannel = 'Amazon Seller Central' AND FulfilmentStatus != 'Cancelled' AND SellingPrice_Inc_GST > 0 AND State IS NOT NULL AND TRIM(State) != ''`,
    amzSCCityTotal: `WITH q AS (${base}) SELECT ROUND(SUM(SellingPrice_Inc_GST),0) AS total_rev FROM q WHERE SubChannel = 'Amazon Seller Central' AND FinancialStatus != 'Cancelled' AND SellingPrice_Inc_GST > 0 AND City_L2 IS NOT NULL AND TRIM(City_L2) != ''`,
    amzSCSKUs: `WITH q AS (${base}) SELECT ChannelSKUCode AS sku, ProductId AS asin, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE SubChannel = 'Amazon Seller Central' AND FulfilmentStatus != 'Cancelled' AND SellingPrice_Inc_GST > 0 GROUP BY sku, asin ORDER BY rev DESC LIMIT 20`,
    amzSCDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, fulfillment_channel, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE SubChannel = 'Amazon Seller Central' AND FulfilmentStatus != 'Cancelled' AND SellingPrice_Inc_GST > 0 GROUP BY date, fulfillment_channel ORDER BY date`,
    amzSCReturnRate: `WITH q AS (${base}) SELECT ROUND(SUM(SellingPrice_Inc_GST), 2) AS total_rev_inc, ROUND(SUM(CASE WHEN Order_Status = 'Return' THEN ABS(SellingPrice_Inc_GST) ELSE 0 END), 2) AS returned_rev FROM q WHERE SubChannel = 'Amazon Seller Central'`,
    amzSCReturnCat: `WITH q AS (${base}), ret AS (SELECT DISTINCT order_id FROM \`frido-429506.production.fact_all_settlement_report\` WHERE transaction_type = 'Refund' AND settlement_region = 'India') SELECT q.Category, COUNT(DISTINCT q.OrderId) AS orders, COUNT(DISTINCT CASE WHEN ret.order_id IS NOT NULL THEN q.OrderId END) AS returned FROM q LEFT JOIN ret ON q.OrderId = ret.order_id WHERE q.SubChannel = 'Amazon Seller Central' AND q.FinancialStatus != 'Cancelled' AND q.Category IS NOT NULL GROUP BY q.Category`,
    amzSCReturnSubCat: `WITH q AS (${base}), ret AS (SELECT DISTINCT order_id FROM \`frido-429506.production.fact_all_settlement_report\` WHERE transaction_type = 'Refund' AND settlement_region = 'India') SELECT q.Category, q.SubCategory, COUNT(DISTINCT q.OrderId) AS orders, COUNT(DISTINCT CASE WHEN ret.order_id IS NOT NULL THEN q.OrderId END) AS returned FROM q LEFT JOIN ret ON q.OrderId = ret.order_id WHERE q.SubChannel = 'Amazon Seller Central' AND q.FinancialStatus != 'Cancelled' AND q.Category IS NOT NULL GROUP BY q.Category, q.SubCategory`,
    amzSCReturnSKU: `WITH q AS (${base}), ret AS (SELECT DISTINCT order_id FROM \`frido-429506.production.fact_all_settlement_report\` WHERE transaction_type = 'Refund' AND settlement_region = 'India') SELECT q.Category, q.SubCategory, q.MasterSKU AS sku, COUNT(DISTINCT q.OrderId) AS orders, COUNT(DISTINCT CASE WHEN ret.order_id IS NOT NULL THEN q.OrderId END) AS returned FROM q LEFT JOIN ret ON q.OrderId = ret.order_id WHERE q.SubChannel = 'Amazon Seller Central' AND q.FinancialStatus != 'Cancelled' AND q.MasterSKU IS NOT NULL GROUP BY q.Category, q.SubCategory, q.MasterSKU`,
    amzSCCatChannel: `WITH q AS (${base}) SELECT Category, CASE WHEN fulfillment_channel='Amazon' THEN 'FBA' ELSE 'MFN' END AS ch, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, ROUND(SUM(CASE WHEN Order_Status='Cancelled' THEN SellingPrice_Inc_GST ELSE 0 END),0) AS cancel_rev, ROUND(SUM(CASE WHEN Order_Status='RTO' THEN SellingPrice_Inc_GST ELSE 0 END),0) AS rto_rev, ROUND(SUM(CASE WHEN Order_Status='CIR' THEN SellingPrice_Inc_GST ELSE 0 END),0) AS cir_rev, ROUND(SUM(CASE WHEN Order_Status='Exchange' THEN SellingPrice_Inc_GST ELSE 0 END),0) AS exch_rev, ROUND(SUM(CASE WHEN Order_Status='Return' THEN SellingPrice_Inc_GST ELSE 0 END),0) AS return_rev FROM q WHERE SubChannel = 'Amazon Seller Central' AND Category IS NOT NULL GROUP BY Category, ch ORDER BY rev DESC`,
    amzSCSubCatChannel: `WITH q AS (${base}) SELECT Category, SubCategory, CASE WHEN fulfillment_channel='Amazon' THEN 'FBA' ELSE 'MFN' END AS ch, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, ROUND(SUM(CASE WHEN Order_Status='Cancelled' THEN SellingPrice_Inc_GST ELSE 0 END),0) AS cancel_rev, ROUND(SUM(CASE WHEN Order_Status='RTO' THEN SellingPrice_Inc_GST ELSE 0 END),0) AS rto_rev, ROUND(SUM(CASE WHEN Order_Status='CIR' THEN SellingPrice_Inc_GST ELSE 0 END),0) AS cir_rev, ROUND(SUM(CASE WHEN Order_Status='Exchange' THEN SellingPrice_Inc_GST ELSE 0 END),0) AS exch_rev, ROUND(SUM(CASE WHEN Order_Status='Return' THEN SellingPrice_Inc_GST ELSE 0 END),0) AS return_rev FROM q WHERE SubChannel = 'Amazon Seller Central' AND Category IS NOT NULL GROUP BY Category, SubCategory, ch ORDER BY rev DESC`,
    amzSCSKUChannel: `WITH q AS (${base}) SELECT Category, SubCategory, MasterSKU AS sku, CASE WHEN fulfillment_channel='Amazon' THEN 'FBA' ELSE 'MFN' END AS ch, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, ROUND(SUM(CASE WHEN Order_Status='Cancelled' THEN SellingPrice_Inc_GST ELSE 0 END),0) AS cancel_rev, ROUND(SUM(CASE WHEN Order_Status='RTO' THEN SellingPrice_Inc_GST ELSE 0 END),0) AS rto_rev, ROUND(SUM(CASE WHEN Order_Status='CIR' THEN SellingPrice_Inc_GST ELSE 0 END),0) AS cir_rev, ROUND(SUM(CASE WHEN Order_Status='Exchange' THEN SellingPrice_Inc_GST ELSE 0 END),0) AS exch_rev, ROUND(SUM(CASE WHEN Order_Status='Return' THEN SellingPrice_Inc_GST ELSE 0 END),0) AS return_rev FROM q WHERE SubChannel = 'Amazon Seller Central' AND MasterSKU IS NOT NULL GROUP BY Category, SubCategory, sku, ch ORDER BY rev DESC`,
    amzSCCatChannelPrev: `WITH q AS (${prevBase}) SELECT Category, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE SubChannel = 'Amazon Seller Central' AND Category IS NOT NULL GROUP BY Category`,
    amzSCSubCatChannelPrev: `WITH q AS (${prevBase}) SELECT Category, SubCategory, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE SubChannel = 'Amazon Seller Central' AND Category IS NOT NULL GROUP BY Category, SubCategory`,
    amzSCSKUChannelPrev: `WITH q AS (${prevBase}) SELECT Category, SubCategory, MasterSKU AS sku, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE SubChannel = 'Amazon Seller Central' AND MasterSKU IS NOT NULL GROUP BY Category, SubCategory, sku`,
    amzVCCat: `WITH q AS (${base}) SELECT Category, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE SubChannel = 'Amazon Vendor Central' AND Category IS NOT NULL GROUP BY Category ORDER BY rev DESC`,
    amzVCSubCat: `WITH q AS (${base}) SELECT Category, SubCategory, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE SubChannel = 'Amazon Vendor Central' AND Category IS NOT NULL GROUP BY Category, SubCategory ORDER BY rev DESC`,
    amzVCSKU: `WITH q AS (${base}) SELECT Category, SubCategory, MasterSKU AS sku, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE SubChannel = 'Amazon Vendor Central' AND MasterSKU IS NOT NULL GROUP BY Category, SubCategory, sku ORDER BY rev DESC`,
    amzVCCatPrev: `WITH q AS (${prevBase}) SELECT Category, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE SubChannel = 'Amazon Vendor Central' AND Category IS NOT NULL GROUP BY Category`,
    amzVCSubCatPrev: `WITH q AS (${prevBase}) SELECT Category, SubCategory, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE SubChannel = 'Amazon Vendor Central' AND Category IS NOT NULL GROUP BY Category, SubCategory`,
    amzVCSKUPrev: `WITH q AS (${prevBase}) SELECT Category, SubCategory, MasterSKU AS sku, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE SubChannel = 'Amazon Vendor Central' AND MasterSKU IS NOT NULL GROUP BY Category, SubCategory, sku`,
    amzSCRegion: `WITH q AS (${base}) SELECT Region AS region, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, SUM(ItemQty) AS units FROM q WHERE SubChannel = 'Amazon Seller Central' AND FinancialStatus != 'Cancelled' AND Region IS NOT NULL GROUP BY Region ORDER BY rev DESC`,
    amzSCTier: `WITH q AS (${base}) SELECT City_Tier AS city_tier, Tier_Label AS tier_label, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, SUM(ItemQty) AS units FROM q WHERE SubChannel = 'Amazon Seller Central' AND FinancialStatus != 'Cancelled' AND City_Tier IS NOT NULL GROUP BY City_Tier, Tier_Label ORDER BY City_Tier`,
    amzVCAccounts: `WITH q AS (${base}) SELECT ChannelAccount AS vendor_account, SUM(ItemQty) AS ordered_units, ROUND(SUM(SellingPrice_Inc_GST),0) AS ordered_rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS ordered_exc_rev, SUM(ItemQty) AS shipped_units, ROUND(SUM(SellingPrice_Inc_GST),0) AS shipped_rev, 0 AS returns FROM q WHERE SubChannel = 'Amazon Vendor Central' GROUP BY vendor_account ORDER BY ordered_rev DESC`,
    amzVCDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, SUM(ItemQty) AS ordered_units, ROUND(SUM(SellingPrice_Inc_GST),0) AS ordered_rev, SUM(ItemQty) AS shipped_units FROM q WHERE SubChannel = 'Amazon Vendor Central' GROUP BY date ORDER BY date`,
    amzVCASINs: `WITH q AS (${base}) SELECT ProductId AS asin, COALESCE(NULLIF(TRIM(ChannelSKUCode),''), NULLIF(TRIM(MasterSKU),'')) AS sku, SUM(ItemQty) AS ordered_units, ROUND(SUM(SellingPrice_Inc_GST),0) AS ordered_rev, SUM(ItemQty) AS shipped_units, 0 AS returns FROM q WHERE SubChannel = 'Amazon Vendor Central' GROUP BY asin, sku ORDER BY ordered_rev DESC LIMIT 20`,
    amzIntlPrev: `SELECT COUNT(DISTINCT amazon_order_id) AS orders, ROUND(SUM(CAST(item_price AS FLOAT64)),0) AS rev, ROUND(SUM(CAST(item_price AS FLOAT64) - CAST(item_tax AS FLOAT64)),0) AS net_rev, SUM(CAST(quantity AS INT64)) AS units FROM \`frido-429506.production.amazon_seller_central_uk_uae_all_orders\` WHERE purchase_date_ist BETWEEN '${ps}' AND '${pe}' AND item_status != 'Cancelled'`,
    amzIntlReturnRate: `WITH q AS (${base}) SELECT ROUND(SUM(SellingPrice_Inc_GST),2) AS total_rev, ROUND(SUM(CASE WHEN Order_Status='Return' THEN ABS(SellingPrice_Inc_GST) ELSE 0 END),2) AS return_rev FROM q WHERE SubChannel='Amazon International'`,
    amzIntlReturnCat: `WITH q AS (${base}), ret AS (SELECT DISTINCT order_id FROM \`frido-429506.production.fact_all_settlement_report\` WHERE transaction_type = 'Refund' AND settlement_region IN ('UAE','UK')) SELECT q.Category, COUNT(DISTINCT q.OrderId) AS orders, COUNT(DISTINCT CASE WHEN ret.order_id IS NOT NULL THEN q.OrderId END) AS returned FROM q LEFT JOIN ret ON q.OrderId = ret.order_id WHERE q.SubChannel = 'Amazon International' AND q.FinancialStatus != 'Cancelled' AND q.Category IS NOT NULL GROUP BY q.Category`,
    amzIntlReturnSubCat: `WITH q AS (${base}), ret AS (SELECT DISTINCT order_id FROM \`frido-429506.production.fact_all_settlement_report\` WHERE transaction_type = 'Refund' AND settlement_region IN ('UAE','UK')) SELECT q.Category, q.SubCategory, COUNT(DISTINCT q.OrderId) AS orders, COUNT(DISTINCT CASE WHEN ret.order_id IS NOT NULL THEN q.OrderId END) AS returned FROM q LEFT JOIN ret ON q.OrderId = ret.order_id WHERE q.SubChannel = 'Amazon International' AND q.FinancialStatus != 'Cancelled' AND q.Category IS NOT NULL GROUP BY q.Category, q.SubCategory`,
    amzIntlReturnSKU: `WITH q AS (${base}), ret AS (SELECT DISTINCT order_id FROM \`frido-429506.production.fact_all_settlement_report\` WHERE transaction_type = 'Refund' AND settlement_region IN ('UAE','UK')) SELECT q.MasterSKU AS sku, COUNT(DISTINCT q.OrderId) AS orders, COUNT(DISTINCT CASE WHEN ret.order_id IS NOT NULL THEN q.OrderId END) AS returned FROM q LEFT JOIN ret ON q.OrderId = ret.order_id WHERE q.SubChannel = 'Amazon International' AND q.FinancialStatus != 'Cancelled' AND q.MasterSKU IS NOT NULL GROUP BY q.MasterSKU`,
    amzIntlCountries: `SELECT Country, COUNT(DISTINCT amazon_order_id) AS orders, ROUND(SUM(CAST(item_price AS FLOAT64)),0) AS rev, ROUND(SUM(CAST(item_price AS FLOAT64) - CAST(item_tax AS FLOAT64)),0) AS net_rev, ROUND(SUM(CAST(item_tax AS FLOAT64)),0) AS tax, SUM(CAST(quantity AS INT64)) AS units FROM \`frido-429506.production.amazon_seller_central_uk_uae_all_orders\` WHERE purchase_date_ist BETWEEN '${start}' AND '${end}' AND item_status != 'Cancelled' GROUP BY Country ORDER BY rev DESC`,
    amzIntlCatChannel: `WITH q AS (${base}) SELECT Category, Country AS ch, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE SubChannel = 'Amazon International' AND FinancialStatus != 'Cancelled' AND Category IS NOT NULL GROUP BY Category, Country ORDER BY rev DESC`,
    amzIntlSubCatChannel: `WITH q AS (${base}) SELECT Category, SubCategory, Country AS ch, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE SubChannel = 'Amazon International' AND FinancialStatus != 'Cancelled' AND Category IS NOT NULL GROUP BY Category, SubCategory, Country ORDER BY rev DESC`,
    amzIntlSKUChannel: `WITH q AS (${base}) SELECT Category, SubCategory, MasterSKU AS sku, Country AS ch, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE SubChannel = 'Amazon International' AND FinancialStatus != 'Cancelled' AND MasterSKU IS NOT NULL GROUP BY Category, SubCategory, sku, Country ORDER BY rev DESC`,
    amzIntlSKUs: `SELECT sku, Country, COUNT(DISTINCT amazon_order_id) AS orders, SUM(CAST(quantity AS INT64)) AS units, ROUND(SUM(CAST(item_price AS FLOAT64)),0) AS rev, ROUND(SUM(CAST(item_price AS FLOAT64) - CAST(item_tax AS FLOAT64)),0) AS net_rev FROM \`frido-429506.production.amazon_seller_central_uk_uae_all_orders\` WHERE purchase_date_ist BETWEEN '${start}' AND '${end}' AND item_status != 'Cancelled' GROUP BY sku, Country ORDER BY rev DESC LIMIT 20`,
    amzIntlDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, Country, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS net_rev FROM q WHERE SubChannel = 'Amazon International' AND FinancialStatus != 'Cancelled' GROUP BY date, Country ORDER BY date`,
    // Flipkart doesn't distinguish RTO from Return (combined here as return_rev, rto_rev always 0)
    // and has no CIR status; cancellation comes from FulfilmentStatus, not Order_Status, on this
    // channel. Field names match netRevenueSelectFragment's output so computeNetRevenueMeasures works.
    fkNetCalc: `WITH q AS (${fkBase}) SELECT SUM(SellingPrice_Inc_GST) AS gross_inc_gst, SUM(SellingPrice_Exc_GST) AS gross_exc_gst, SUM(CASE WHEN FulfilmentStatus='Cancelled' THEN SellingPrice_Inc_GST ELSE 0 END) AS cancel_rev, SUM(CASE WHEN Order_Status IN ('Return','RTO') THEN ABS(SellingPrice_Inc_GST) ELSE 0 END) AS return_rev, 0 AS rto_rev, 0 AS cir_rev FROM q WHERE Channel='Flipkart'`,
    fkTotals: `WITH q AS (${fkBase}) SELECT CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, SUM(ItemQty) AS units, COUNT(DISTINCT CASE WHEN Order_Status='Return' THEN OrderId END) AS returns, ROUND(SUM(CASE WHEN Order_Status='Return' THEN ABS(SellingPrice_Inc_GST) ELSE 0 END),0) AS return_rev, ROUND(SUM(CASE WHEN Order_Status IN ('Return','RTO') THEN ABS(SellingPrice_Inc_GST) ELSE 0 END),0) AS total_return_rev, COUNT(DISTINCT CASE WHEN FulfilmentStatus='Cancelled' THEN OrderId END) AS cancel_orders, ROUND(SUM(CASE WHEN FulfilmentStatus='Cancelled' THEN SellingPrice_Inc_GST ELSE 0 END),0) AS cancel_rev FROM q WHERE Channel='Flipkart' GROUP BY sub`,
    fkDaily: `WITH q AS (${fkBase}) SELECT CAST(OrderDate AS STRING) AS date, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, COUNT(DISTINCT CASE WHEN Order_Status='Return' THEN OrderId END) AS returns, ROUND(SUM(CASE WHEN Order_Status IN ('Return','RTO') THEN ABS(SellingPrice_Inc_GST) ELSE 0 END),0) AS return_rev FROM q WHERE Channel='Flipkart' GROUP BY date, sub ORDER BY date`,
    fkStatus: `WITH q AS (${fkBase}) SELECT FulfilmentStatus AS status, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders FROM q WHERE Channel='Flipkart' AND FulfilmentStatus IS NOT NULL GROUP BY status, sub ORDER BY orders DESC`,
    fkSKUs: `WITH q AS (${fkBase}) SELECT ChannelSKUCode AS sku, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Flipkart' AND ChannelSKUCode IS NOT NULL GROUP BY sku, sub ORDER BY rev DESC LIMIT 30`,
    fkCategories: `WITH q AS (${fkBase}) SELECT Category AS category, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, SUM(ItemQty) AS units, COUNT(DISTINCT CASE WHEN Order_Status='Return' THEN OrderId END) AS returns, ROUND(SUM(CASE WHEN Order_Status IN ('Return','RTO') THEN ABS(SellingPrice_Inc_GST) ELSE 0 END),0) AS return_rev, ROUND(SUM(CASE WHEN FulfilmentStatus != 'Cancelled' AND SellingPrice_Inc_GST > 0 THEN SellingPrice_Inc_GST ELSE 0 END),0) AS delivered_rev FROM q WHERE Channel='Flipkart' GROUP BY category, sub ORDER BY rev DESC`,
    fkStates: `WITH q AS (${fkBase}) SELECT COALESCE(NULLIF(TRIM(UPPER(State)),'-'), 'OTHERS') AS state, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(CASE WHEN Order_Status IN ('Return','RTO') THEN ABS(SellingPrice_Inc_GST) ELSE 0 END),0) AS return_rev, ROUND(SUM(CASE WHEN FulfilmentStatus != 'Cancelled' AND SellingPrice_Inc_GST > 0 THEN SellingPrice_Inc_GST ELSE 0 END),0) AS delivered_rev FROM q WHERE Channel='Flipkart' GROUP BY state, sub ORDER BY rev DESC`,
    fkCities: `WITH q AS (${fkBase}) SELECT UPPER(TRIM(City_L2)) AS city, UPPER(TRIM(State)) AS state, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(CASE WHEN Order_Status IN ('Return','RTO') THEN ABS(SellingPrice_Inc_GST) ELSE 0 END),0) AS return_rev, ROUND(SUM(CASE WHEN FulfilmentStatus != 'Cancelled' AND SellingPrice_Inc_GST > 0 THEN SellingPrice_Inc_GST ELSE 0 END),0) AS delivered_rev FROM q WHERE Channel='Flipkart' AND City_L2 IS NOT NULL AND TRIM(City_L2) != '' GROUP BY city, state, sub ORDER BY rev DESC`,
    fkStatesPrev: `WITH q AS (${prevBase}) SELECT COALESCE(NULLIF(TRIM(UPPER(State)),'-'), 'OTHERS') AS state, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Flipkart' GROUP BY state, sub`,
    fkCitiesPrev: `WITH q AS (${prevBase}) SELECT UPPER(TRIM(City_L2)) AS city, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Flipkart' AND City_L2 IS NOT NULL AND TRIM(City_L2) != '' GROUP BY city, sub`,
    fkReturnRate: `WITH q AS (${fkBase}) SELECT CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, ROUND(SUM(SellingPrice_Inc_GST),0) AS total_rev, ROUND(SUM(CASE WHEN Order_Status IN ('Return','RTO') THEN ABS(SellingPrice_Inc_GST) ELSE 0 END),0) AS return_rev FROM q WHERE Channel='Flipkart' GROUP BY sub`,
    fkStateTotal: `WITH q AS (${fkBase}) SELECT ROUND(SUM(SellingPrice_Inc_GST),0) AS total_rev, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub FROM q WHERE Channel='Flipkart' GROUP BY sub`,
    fkCityTotal: `WITH q AS (${fkBase}) SELECT ROUND(SUM(SellingPrice_Inc_GST),0) AS total_rev, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub FROM q WHERE Channel='Flipkart' AND City_L2 IS NOT NULL AND TRIM(City_L2) != '' GROUP BY sub`,
    fkRegions: `WITH q AS (${fkBase}) SELECT Region AS region, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Flipkart' AND Region IS NOT NULL GROUP BY region, sub ORDER BY rev DESC`,
    fkSubCategory: `WITH q AS (${fkBase}) SELECT Category AS category, SubCategory AS subcategory, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, SUM(ItemQty) AS units, COUNT(DISTINCT CASE WHEN Order_Status='Return' THEN OrderId END) AS returns, ROUND(SUM(CASE WHEN Order_Status IN ('Return','RTO') THEN ABS(SellingPrice_Inc_GST) ELSE 0 END),0) AS return_rev, ROUND(SUM(CASE WHEN FulfilmentStatus != 'Cancelled' AND SellingPrice_Inc_GST > 0 THEN SellingPrice_Inc_GST ELSE 0 END),0) AS delivered_rev FROM q WHERE Channel='Flipkart' AND Category IS NOT NULL GROUP BY category, subcategory, sub ORDER BY rev DESC`,
    fkSKUMatrix: `WITH q AS (${fkBase}) SELECT Category AS category, SubCategory AS subcategory, MasterSKU AS sku, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, SUM(ItemQty) AS units FROM q WHERE Channel='Flipkart' AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != '' GROUP BY category, subcategory, sku, sub ORDER BY rev DESC`,
    fkDailyCat: `WITH q AS (${fkBase}) SELECT CAST(OrderDate AS STRING) AS date, Category AS category, SubCategory AS subcategory, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Flipkart' AND Category IS NOT NULL GROUP BY date, category, subcategory, sub ORDER BY date`,
    fkCatPrev: `WITH q AS (${prevBase}) SELECT Category AS category, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Flipkart' AND Category IS NOT NULL GROUP BY category, sub`,
    fkSubCatPrev: `WITH q AS (${prevBase}) SELECT Category AS category, SubCategory AS subcategory, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Flipkart' AND Category IS NOT NULL GROUP BY category, subcategory, sub`,
    fkSKUPrev: `WITH q AS (${prevBase}) SELECT Category AS category, SubCategory AS subcategory, MasterSKU AS sku, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Flipkart' AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != '' GROUP BY category, subcategory, sku, sub`,
    amzSCDailyCat: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, Category AS category, SubCategory AS subcategory, CASE WHEN fulfillment_channel='Amazon' THEN 'FBA' ELSE 'MFN' END AS ch, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE SubChannel='Amazon Seller Central' AND FinancialStatus != 'Cancelled' AND Category IS NOT NULL GROUP BY date, category, subcategory, ch ORDER BY date`,
    amzVCDailyCat: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, Category AS category, SubCategory AS subcategory, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE SubChannel='Amazon Vendor Central' AND Category IS NOT NULL GROUP BY date, category, subcategory ORDER BY date`,
    blTotals: `WITH q AS (${base}) SELECT SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, COUNT(DISTINCT SubCategory) AS skus, COUNT(DISTINCT City) AS cities, COUNT(DISTINCT OrderDate) AS days, COUNT(DISTINCT OrderId) AS orders FROM q WHERE Channel='Blinkit'`,
    blDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Blinkit' GROUP BY date ORDER BY date`,
    blCategories: `WITH q AS (${base}) SELECT Category AS category, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, COUNT(DISTINCT ChannelSKUCode) AS skus FROM q WHERE Channel='Blinkit' GROUP BY category ORDER BY rev DESC`,
    blSubCategories: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Blinkit' AND Category IS NOT NULL GROUP BY category, subcategory ORDER BY rev DESC`,
    blStates: `WITH q AS (${base}) SELECT COALESCE(NULLIF(TRIM(UPPER(State)),'-'),'OTHERS') AS state, SUM(ItemQty) AS units, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Blinkit' AND State IS NOT NULL GROUP BY state ORDER BY rev DESC`,
    blStatesPrev: `WITH q AS (${prevBase}) SELECT COALESCE(NULLIF(TRIM(UPPER(State)),'-'),'OTHERS') AS state, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Blinkit' AND State IS NOT NULL GROUP BY state`,
    blStateTotal: `WITH q AS (${base}) SELECT ROUND(SUM(SellingPrice_Inc_GST),0) AS total_rev FROM q WHERE Channel='Blinkit' AND State IS NOT NULL`,
    blSKUs: `WITH q AS (${base}), names AS (SELECT DISTINCT TRIM(CAST(item_id AS STRING)) AS item_id, item_name FROM \`frido-429506.partnerbizz_reports_v2.sales\`) SELECT q.ChannelSKUCode AS item_id, COALESCE(MAX(n.item_name), q.ChannelSKUCode) AS item_name, SUM(q.ItemQty) AS units, ROUND(SUM(q.SellingPrice_Inc_GST),0) AS rev, COUNT(DISTINCT q.City) AS cities FROM q LEFT JOIN names n ON q.ChannelSKUCode = n.item_id WHERE q.Channel='Blinkit' GROUP BY item_id ORDER BY rev DESC`,
    blSKUMatrix: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, MasterSKU AS sku, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Blinkit' AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != '' GROUP BY category, subcategory, sku ORDER BY rev DESC`,
    blCities: `WITH q AS (${base}) SELECT City AS city_name, Region AS region, City_Tier AS city_tier, SUM(ItemQty) AS units, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, COUNT(DISTINCT ChannelSKUCode) AS skus FROM q WHERE Channel='Blinkit' AND City IS NOT NULL GROUP BY city_name, region, city_tier ORDER BY rev DESC`,
    blCitiesPrev: `WITH q AS (${prevBase}) SELECT City AS city_name, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Blinkit' AND City IS NOT NULL GROUP BY city_name`,
    blCityTotal: `WITH q AS (${base}) SELECT ROUND(SUM(SellingPrice_Inc_GST),0) AS total_rev FROM q WHERE Channel='Blinkit' AND City IS NOT NULL`,
    blCatPrev: `WITH q AS (${prevBase}) SELECT Category AS category, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Blinkit' AND Category IS NOT NULL GROUP BY category`,
    blSubCatPrev: `WITH q AS (${prevBase}) SELECT Category AS category, SubCategory AS subcategory, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Blinkit' AND Category IS NOT NULL GROUP BY category, subcategory`,
    blSKUPrev: `WITH q AS (${prevBase}) SELECT Category AS category, SubCategory AS subcategory, MasterSKU AS sku, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Blinkit' AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != '' GROUP BY category, subcategory, sku`,
    inTotals: `WITH q AS (${base}) SELECT SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, COUNT(DISTINCT SubCategory) AS skus, COUNT(DISTINCT City) AS cities, COUNT(DISTINCT OrderDate) AS days, COUNT(DISTINCT OrderId) AS orders FROM q WHERE Channel='Instamart'`,
    inDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Instamart' GROUP BY date ORDER BY date`,
    inCategories: `WITH q AS (${base}) SELECT Category AS category, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, COUNT(DISTINCT ChannelSKUCode) AS skus FROM q WHERE Channel='Instamart' GROUP BY category ORDER BY rev DESC`,
    inSubCategories: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Instamart' AND Category IS NOT NULL GROUP BY category, subcategory ORDER BY rev DESC`,
    inStates: `WITH q AS (${base}) SELECT COALESCE(NULLIF(TRIM(UPPER(State)),'-'),'OTHERS') AS state, SUM(ItemQty) AS units, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Instamart' AND State IS NOT NULL GROUP BY state ORDER BY rev DESC`,
    inStatesPrev: `WITH q AS (${prevBase}) SELECT COALESCE(NULLIF(TRIM(UPPER(State)),'-'),'OTHERS') AS state, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Instamart' AND State IS NOT NULL GROUP BY state`,
    inStateTotal: `WITH q AS (${base}) SELECT ROUND(SUM(SellingPrice_Inc_GST),0) AS total_rev FROM q WHERE Channel='Instamart' AND State IS NOT NULL`,
    inSKUs: `WITH q AS (${base}), names AS (SELECT DISTINCT TRIM(productid) AS productid, channelproductname FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\` WHERE TRIM(channelname)='Instamart') SELECT q.ChannelSKUCode AS item_id, COALESCE(MAX(n.channelproductname), q.ChannelSKUCode) AS item_name, SUM(q.ItemQty) AS units, ROUND(SUM(q.SellingPrice_Inc_GST),0) AS rev, COUNT(DISTINCT q.City) AS cities FROM q LEFT JOIN names n ON q.ChannelSKUCode = n.productid WHERE q.Channel='Instamart' AND q.ChannelSKUCode IS NOT NULL GROUP BY item_id ORDER BY rev DESC`,
    inSKUMatrix: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, MasterSKU AS sku, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Instamart' AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != '' GROUP BY category, subcategory, sku ORDER BY rev DESC`,
    inCities: `WITH q AS (${base}) SELECT City AS city_name, Region AS region, City_Tier AS city_tier, SUM(ItemQty) AS units, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, COUNT(DISTINCT ChannelSKUCode) AS skus FROM q WHERE Channel='Instamart' AND City IS NOT NULL GROUP BY city_name, region, city_tier ORDER BY rev DESC`,
    inCitiesPrev: `WITH q AS (${prevBase}) SELECT City AS city_name, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Instamart' AND City IS NOT NULL GROUP BY city_name`,
    inCityTotal: `WITH q AS (${base}) SELECT ROUND(SUM(SellingPrice_Inc_GST),0) AS total_rev FROM q WHERE Channel='Instamart' AND City IS NOT NULL`,
    inCatPrev: `WITH q AS (${prevBase}) SELECT Category AS category, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Instamart' AND Category IS NOT NULL GROUP BY category`,
    inSubCatPrev: `WITH q AS (${prevBase}) SELECT Category AS category, SubCategory AS subcategory, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Instamart' AND Category IS NOT NULL GROUP BY category, subcategory`,
    inSKUPrev: `WITH q AS (${prevBase}) SELECT Category AS category, SubCategory AS subcategory, MasterSKU AS sku, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Instamart' AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != '' GROUP BY category, subcategory, sku`,
    zpTotals: `WITH q AS (${base}), zraw AS (SELECT SUM(CAST(orders AS FLOAT64)) AS total_orders FROM \`frido-429506.production.zepto_sales_report\` WHERE date BETWEEN '${start}' AND '${end}') SELECT SUM(q.ItemQty) AS units, ROUND(SUM(q.SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(q.SellingPrice_Exc_GST),0) AS exc_rev, COUNT(DISTINCT q.SubCategory) AS skus, COUNT(DISTINCT q.City) AS cities, COUNT(DISTINCT q.OrderDate) AS days, (SELECT total_orders FROM zraw) AS orders FROM q WHERE q.Channel='Zepto'`,
    zpDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Zepto' GROUP BY date ORDER BY date`,
    zpCategories: `WITH q AS (${base}) SELECT Category AS category, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, COUNT(DISTINCT ChannelSKUCode) AS skus FROM q WHERE Channel='Zepto' GROUP BY category ORDER BY rev DESC`,
    zpSubCategories: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Zepto' AND Category IS NOT NULL GROUP BY category, subcategory ORDER BY rev DESC`,
    zpStates: `WITH q AS (${base}) SELECT COALESCE(NULLIF(TRIM(UPPER(State)),'-'),'OTHERS') AS state, SUM(ItemQty) AS units, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Zepto' AND State IS NOT NULL GROUP BY state ORDER BY rev DESC`,
    zpStatesPrev: `WITH q AS (${prevBase}) SELECT COALESCE(NULLIF(TRIM(UPPER(State)),'-'),'OTHERS') AS state, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Zepto' AND State IS NOT NULL GROUP BY state`,
    zpStateTotal: `WITH q AS (${base}) SELECT ROUND(SUM(SellingPrice_Inc_GST),0) AS total_rev FROM q WHERE Channel='Zepto' AND State IS NOT NULL`,
    zpSKUs: `WITH q AS (${base}), names AS (SELECT DISTINCT TRIM(sku_number) AS sku_number, sku_name FROM \`frido-429506.production.zepto_sales_report\`) SELECT q.ChannelSKUCode AS item_id, COALESCE(MAX(n.sku_name), q.ChannelSKUCode) AS item_name, SUM(q.ItemQty) AS units, ROUND(SUM(q.SellingPrice_Inc_GST),0) AS rev, COUNT(DISTINCT q.City) AS cities FROM q LEFT JOIN names n ON q.ChannelSKUCode = n.sku_number WHERE q.Channel='Zepto' AND q.ChannelSKUCode IS NOT NULL GROUP BY item_id ORDER BY rev DESC`,
    zpSKUMatrix: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, MasterSKU AS sku, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Zepto' AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != '' GROUP BY category, subcategory, sku ORDER BY rev DESC`,
    zpCities: `WITH q AS (${base}) SELECT City AS city_name, Region AS region, City_Tier AS city_tier, SUM(ItemQty) AS units, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, COUNT(DISTINCT ChannelSKUCode) AS skus FROM q WHERE Channel='Zepto' AND City IS NOT NULL GROUP BY city_name, region, city_tier ORDER BY rev DESC`,
    zpCitiesPrev: `WITH q AS (${prevBase}) SELECT City AS city_name, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Zepto' AND City IS NOT NULL GROUP BY city_name`,
    zpCityTotal: `WITH q AS (${base}) SELECT ROUND(SUM(SellingPrice_Inc_GST),0) AS total_rev FROM q WHERE Channel='Zepto' AND City IS NOT NULL`,
    zpCatPrev: `WITH q AS (${prevBase}) SELECT Category AS category, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Zepto' AND Category IS NOT NULL GROUP BY category`,
    zpSubCatPrev: `WITH q AS (${prevBase}) SELECT Category AS category, SubCategory AS subcategory, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Zepto' AND Category IS NOT NULL GROUP BY category, subcategory`,
    zpSKUPrev: `WITH q AS (${prevBase}) SELECT Category AS category, SubCategory AS subcategory, MasterSKU AS sku, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Zepto' AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != '' GROUP BY category, subcategory, sku`,
    crTotals: `WITH q AS (${base}) SELECT COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, COUNT(DISTINCT SubCategory) AS skus, COUNT(DISTINCT City) AS cities, COUNT(DISTINCT OrderDate) AS days FROM q WHERE Channel='CRED'`,
    // Feeds the shared measures layer (computeNetRevenueMeasures) — CRED has Return/Cancelled
    // status (no RTO/CIR distinction), so those map to rto_rev: 0 / cir_rev: 0.
    crNetCalc: `WITH q AS (${base}) SELECT ${netRevenueSelectFragment()} FROM q WHERE Channel='CRED'`,
    crDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='CRED' GROUP BY date ORDER BY date`,
    crSKUs: `WITH q AS (${base}) SELECT ChannelSKUCode AS sku, MAX(COALESCE(NULLIF(TRIM(ChannelSKUCode),''), ChannelSKUCode)) AS sku_name, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='CRED' AND ChannelSKUCode IS NOT NULL GROUP BY sku ORDER BY rev DESC LIMIT 30`,
    crCategories: `WITH q AS (${base}) SELECT Category AS category, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='CRED' GROUP BY category ORDER BY rev DESC`,
    crSubCategories: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='CRED' GROUP BY category, subcategory ORDER BY rev DESC`,
    crSKUMatrix: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, MasterSKU AS sku, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='CRED' AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != '' GROUP BY category, subcategory, sku ORDER BY rev DESC`,
    crCatPrev: `WITH q AS (${prevBase}) SELECT Category AS category, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='CRED' GROUP BY category`,
    crSubCatPrev: `WITH q AS (${prevBase}) SELECT Category AS category, SubCategory AS subcategory, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='CRED' GROUP BY category, subcategory`,
    crStates: `WITH q AS (${base}) SELECT INITCAP(TRIM(State)) AS state, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(CASE WHEN Order_Status IN ('Return','RTO','CIR') THEN SellingPrice_Inc_GST ELSE 0 END),0) AS return_rev FROM q WHERE Channel='CRED' AND State IS NOT NULL GROUP BY state ORDER BY rev DESC`,
    crStatesPrev: `WITH q AS (${prevBase}) SELECT INITCAP(TRIM(State)) AS state, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='CRED' AND State IS NOT NULL GROUP BY state`,
    crStateTotal: `WITH q AS (${base}) SELECT ROUND(SUM(SellingPrice_Inc_GST),0) AS total_rev FROM q WHERE Channel='CRED' AND State IS NOT NULL`,
    crCityTotal: `WITH q AS (${base}) SELECT ROUND(SUM(SellingPrice_Inc_GST),0) AS total_rev FROM q WHERE Channel='CRED' AND City IS NOT NULL AND TRIM(City) != ''`,
    crRegion: `WITH q AS (${base}), sm AS (SELECT DISTINCT State, Region FROM \`frido-429506.production.pincode_city_master\` WHERE State IS NOT NULL AND Region IS NOT NULL) SELECT sm.Region AS region, COUNT(DISTINCT q.OrderId) AS orders, ROUND(SUM(q.SellingPrice_Inc_GST),0) AS rev, SUM(q.ItemQty) AS units FROM q JOIN sm ON UPPER(TRIM(q.State)) = UPPER(TRIM(sm.State)) WHERE q.Channel='CRED' GROUP BY region ORDER BY rev DESC`,
    crTier: `WITH q AS (${base}), tm AS (SELECT DISTINCT State, City_Tier, Tier_Label FROM \`frido-429506.production.pincode_city_master\` WHERE State IS NOT NULL AND City_Tier IS NOT NULL) SELECT tm.City_Tier AS city_tier, tm.Tier_Label AS tier_label, COUNT(DISTINCT q.OrderId) AS orders, ROUND(SUM(q.SellingPrice_Inc_GST),0) AS rev, SUM(q.ItemQty) AS units FROM q JOIN tm ON UPPER(TRIM(q.State)) = UPPER(TRIM(tm.State)) WHERE q.Channel='CRED' GROUP BY city_tier, tier_label ORDER BY city_tier`,
    crStatus: `WITH q AS (${base}) SELECT FulfilmentStatus AS status, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='CRED' AND FulfilmentStatus IS NOT NULL GROUP BY status ORDER BY orders DESC`,
    crCities: `WITH q AS (${base}) SELECT INITCAP(TRIM(City)) AS city, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(CASE WHEN Order_Status IN ('Return','RTO','CIR') THEN SellingPrice_Inc_GST ELSE 0 END),0) AS return_rev FROM q WHERE Channel='CRED' AND City IS NOT NULL AND TRIM(City) != '' GROUP BY city ORDER BY rev DESC`,
    crCitiesPrev: `WITH q AS (${prevBase}) SELECT INITCAP(TRIM(City)) AS city, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='CRED' AND City IS NOT NULL AND TRIM(City) != '' GROUP BY city`,
    fcTotals: `WITH q AS (${base}) SELECT COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, COUNT(DISTINCT SubCategory) AS skus, COUNT(DISTINCT City) AS cities, COUNT(DISTINCT OrderDate) AS days FROM q WHERE Channel='Firstcry'`,
    // Feeds the shared measures layer (computeNetRevenueMeasures)
    fcNetCalc: `WITH q AS (${base}) SELECT ${netRevenueSelectFragment()} FROM q WHERE Channel='Firstcry'`,
    fcDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Firstcry' GROUP BY date ORDER BY date`,
    fcSKUs: `WITH q AS (${base}) SELECT ChannelSKUCode AS sku, MAX(COALESCE(NULLIF(TRIM(ChannelSKUCode),''), ChannelSKUCode)) AS sku_name, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Firstcry' AND ChannelSKUCode IS NOT NULL GROUP BY sku ORDER BY rev DESC LIMIT 30`,
    fcCategories: `WITH q AS (${base}) SELECT Category AS category, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Firstcry' GROUP BY category ORDER BY rev DESC`,
    fcSubCategories: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Firstcry' GROUP BY category, subcategory ORDER BY rev DESC`,
    fcSKUMatrix: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, MasterSKU AS sku, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Firstcry' AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != '' GROUP BY category, subcategory, sku ORDER BY rev DESC`,
    fcStates: `WITH q AS (${base}) SELECT INITCAP(TRIM(State)) AS state, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(CASE WHEN Order_Status IN ('Return','RTO','CIR') THEN SellingPrice_Inc_GST ELSE 0 END),0) AS return_rev FROM q WHERE Channel='Firstcry' AND State IS NOT NULL GROUP BY state ORDER BY rev DESC`,
    fcStatesPrev: `WITH q AS (${prevBase}) SELECT INITCAP(TRIM(State)) AS state, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Firstcry' AND State IS NOT NULL GROUP BY state`,
    fcStateTotal: `WITH q AS (${base}) SELECT ROUND(SUM(SellingPrice_Inc_GST),0) AS total_rev FROM q WHERE Channel='Firstcry' AND State IS NOT NULL`,
    fcCityTotal: `WITH q AS (${base}) SELECT ROUND(SUM(SellingPrice_Inc_GST),0) AS total_rev FROM q WHERE Channel='Firstcry' AND City IS NOT NULL AND TRIM(City) != ''`,
    fcCatPrev: `WITH q AS (${prevBase}) SELECT Category AS category, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Firstcry' GROUP BY category`,
    fcSubCatPrev: `WITH q AS (${prevBase}) SELECT Category AS category, SubCategory AS subcategory, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Firstcry' GROUP BY category, subcategory`,
    fcRegion: `WITH q AS (${base}), sm AS (SELECT DISTINCT State, Region FROM \`frido-429506.production.pincode_city_master\` WHERE State IS NOT NULL AND Region IS NOT NULL) SELECT sm.Region AS region, COUNT(DISTINCT q.OrderId) AS orders, ROUND(SUM(q.SellingPrice_Inc_GST),0) AS rev, SUM(q.ItemQty) AS units FROM q JOIN sm ON UPPER(TRIM(q.State)) = UPPER(TRIM(sm.State)) WHERE q.Channel='Firstcry' GROUP BY region ORDER BY rev DESC`,
    fcTier: `WITH q AS (${base}), tm AS (SELECT DISTINCT State, City_Tier, Tier_Label FROM \`frido-429506.production.pincode_city_master\` WHERE State IS NOT NULL AND City_Tier IS NOT NULL) SELECT tm.City_Tier AS city_tier, tm.Tier_Label AS tier_label, COUNT(DISTINCT q.OrderId) AS orders, ROUND(SUM(q.SellingPrice_Inc_GST),0) AS rev, SUM(q.ItemQty) AS units FROM q JOIN tm ON UPPER(TRIM(q.State)) = UPPER(TRIM(tm.State)) WHERE q.Channel='Firstcry' GROUP BY city_tier, tier_label ORDER BY city_tier`,
    fcStatus: `WITH q AS (${base}) SELECT FulfilmentStatus AS status, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Firstcry' AND FulfilmentStatus IS NOT NULL GROUP BY status ORDER BY orders DESC`,
    fcCities: `WITH q AS (${base}) SELECT INITCAP(TRIM(City)) AS city, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(CASE WHEN Order_Status IN ('Return','RTO','CIR') THEN SellingPrice_Inc_GST ELSE 0 END),0) AS return_rev FROM q WHERE Channel='Firstcry' AND City IS NOT NULL AND TRIM(City) != '' GROUP BY city ORDER BY rev DESC LIMIT 50`,
    fcCitiesPrev: `WITH q AS (${prevBase}) SELECT INITCAP(TRIM(City)) AS city, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Firstcry' AND City IS NOT NULL AND TRIM(City) != '' GROUP BY city`,
    mnTotals: `WITH q AS (${base}) SELECT COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, COUNT(DISTINCT SubCategory) AS skus, COUNT(DISTINCT City) AS cities, COUNT(DISTINCT OrderDate) AS days, ROUND(SUM(CASE WHEN Order_Status='Return' THEN ABS(SellingPrice_Inc_GST) ELSE 0 END),0) AS return_rev, COUNT(DISTINCT CASE WHEN Order_Status='Return' THEN OrderId END) AS return_orders FROM q WHERE Channel='Myntra'`,
    // Feeds the shared measures layer (computeNetRevenueMeasures)
    mnNetCalc: `WITH q AS (${base}) SELECT ${netRevenueSelectFragment()} FROM q WHERE Channel='Myntra'`,
    mnDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Myntra' GROUP BY date ORDER BY date`,
    mnStatus: `WITH q AS (${base}) SELECT FulfilmentStatus AS status, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Myntra' AND FulfilmentStatus IS NOT NULL GROUP BY status ORDER BY orders DESC`,
    mnCategories: `WITH q AS (${base}) SELECT Category AS category, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Myntra' GROUP BY category ORDER BY rev DESC`,
    mnSubCategories: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Myntra' AND SubCategory IS NOT NULL GROUP BY category, subcategory ORDER BY rev DESC`,
    mnSKUMatrix: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, ChannelSKUCode AS sku, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, COUNT(DISTINCT OrderId) AS orders FROM q WHERE Channel='Myntra' AND ChannelSKUCode IS NOT NULL GROUP BY category, subcategory, sku ORDER BY rev DESC`,
    mnSKUs: `WITH q AS (${base}) SELECT ChannelSKUCode AS sku, Category AS category, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Myntra' AND ChannelSKUCode IS NOT NULL GROUP BY sku, category ORDER BY rev DESC LIMIT 30`,
    mnStates: `WITH q AS (${base}) SELECT INITCAP(TRIM(State)) AS state, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(CASE WHEN Order_Status IN ('Return','RTO','CIR') THEN SellingPrice_Inc_GST ELSE 0 END),0) AS return_rev FROM q WHERE Channel='Myntra' AND State IS NOT NULL GROUP BY state ORDER BY rev DESC`,
    mnStatesPrev: `WITH q AS (${prevBase}) SELECT INITCAP(TRIM(State)) AS state, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Myntra' AND State IS NOT NULL GROUP BY state`,
    mnStateTotal: `WITH q AS (${base}) SELECT ROUND(SUM(SellingPrice_Inc_GST),0) AS total_rev FROM q WHERE Channel='Myntra' AND State IS NOT NULL`,
    mnCityTotal: `WITH q AS (${base}) SELECT ROUND(SUM(SellingPrice_Inc_GST),0) AS total_rev FROM q WHERE Channel='Myntra' AND City IS NOT NULL`,
    mnCatPrev: `WITH q AS (${prevBase}) SELECT Category AS category, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Myntra' GROUP BY category`,
    mnSubCatPrev: `WITH q AS (${prevBase}) SELECT Category AS category, SubCategory AS subcategory, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Myntra' AND SubCategory IS NOT NULL GROUP BY category, subcategory`,
    mnCities: `WITH q AS (${base}) SELECT City AS city, Region AS region, City_Tier AS city_tier, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(CASE WHEN Order_Status IN ('Return','RTO','CIR') THEN SellingPrice_Inc_GST ELSE 0 END),0) AS return_rev FROM q WHERE Channel='Myntra' AND City IS NOT NULL GROUP BY city, region, city_tier ORDER BY rev DESC`,
    mnCitiesPrev: `WITH q AS (${prevBase}) SELECT City AS city, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Myntra' AND City IS NOT NULL GROUP BY city`,
    prevMn: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, COUNT(DISTINCT OrderId) AS orders FROM q WHERE Channel='Myntra'`,
    prevMnNetCalc: `WITH q AS (${prevBase}) SELECT ${netRevenueSelectFragment()} FROM q WHERE Channel='Myntra'`,
    prevMnDaily: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Myntra' GROUP BY date ORDER BY date`,
    masterSkuList: `SELECT DISTINCT TRIM(Product_Code) AS sku FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\` WHERE TRIM(Product_Code) != '' ORDER BY sku`,
    offlineTotals: `WITH q AS (${baseWithCN}) SELECT SubChannel, SUM(CASE WHEN Order_Status='Sales' THEN SellingPrice_Inc_GST ELSE 0 END) AS rev_sales, SUM(CASE WHEN Order_Status='Sales' THEN SellingPrice_Exc_GST ELSE 0 END) AS exc_rev_sales, SUM(CASE WHEN Order_Status='Credit Note' THEN SellingPrice_Inc_GST ELSE 0 END) AS cn_rev, SUM(CASE WHEN Order_Status='Credit Note' THEN SellingPrice_Exc_GST ELSE 0 END) AS cn_exc_rev, COUNT(DISTINCT CASE WHEN Order_Status='Sales' THEN OrderId END) AS orders, SUM(CASE WHEN Order_Status='Sales' THEN ItemQty ELSE 0 END) AS units, COUNT(DISTINCT CASE WHEN Order_Status='Credit Note' THEN OrderId END) AS cn_orders, SUM(CASE WHEN Order_Status='Credit Note' THEN ItemQty ELSE 0 END) AS cn_units FROM q WHERE Channel='offline_sales' GROUP BY SubChannel`,
    prevOffline: `WITH q AS (${prevBaseWithCN}) SELECT SubChannel, SUM(CASE WHEN Order_Status='Sales' THEN SellingPrice_Inc_GST ELSE 0 END) AS rev_sales, SUM(CASE WHEN Order_Status='Sales' THEN SellingPrice_Exc_GST ELSE 0 END) AS exc_rev_sales, SUM(CASE WHEN Order_Status='Credit Note' THEN SellingPrice_Inc_GST ELSE 0 END) AS cn_rev, SUM(CASE WHEN Order_Status='Credit Note' THEN SellingPrice_Exc_GST ELSE 0 END) AS cn_exc_rev, COUNT(DISTINCT CASE WHEN Order_Status='Sales' THEN OrderId END) AS orders, SUM(CASE WHEN Order_Status='Sales' THEN ItemQty ELSE 0 END) AS units, COUNT(DISTINCT CASE WHEN Order_Status='Credit Note' THEN OrderId END) AS cn_orders, SUM(CASE WHEN Order_Status='Credit Note' THEN ItemQty ELSE 0 END) AS cn_units FROM q WHERE Channel='offline_sales' GROUP BY SubChannel`,
    prevOfflineDaily: `WITH q AS (${prevBaseWithCN}) SELECT CAST(OrderDate AS STRING) AS date, SubChannel, SUM(CASE WHEN Order_Status='Sales' THEN SellingPrice_Inc_GST ELSE 0 END) AS rev FROM q WHERE Channel='offline_sales' GROUP BY date, SubChannel ORDER BY date`,
    offlineDaily: `WITH q AS (${baseWithCN}) SELECT CAST(OrderDate AS STRING) AS date, SubChannel, COUNT(DISTINCT CASE WHEN Order_Status='Sales' THEN OrderId END) AS orders, SUM(CASE WHEN Order_Status='Sales' THEN ItemQty ELSE 0 END) AS units, SUM(CASE WHEN Order_Status='Sales' THEN SellingPrice_Inc_GST ELSE 0 END) AS rev, SUM(CASE WHEN Order_Status='Sales' THEN SellingPrice_Exc_GST ELSE 0 END) AS exc_rev, SUM(CASE WHEN Order_Status='Credit Note' THEN SellingPrice_Inc_GST ELSE 0 END) AS cn_rev, SUM(CASE WHEN Order_Status='Credit Note' THEN SellingPrice_Exc_GST ELSE 0 END) AS cn_exc_rev FROM q WHERE Channel='offline_sales' GROUP BY date, SubChannel ORDER BY date`,
    offlineSubChannel: `WITH q AS (${base}) SELECT SubChannel, COUNT(DISTINCT CASE WHEN Order_Status='Sales' THEN OrderId END) AS orders, SUM(CASE WHEN Order_Status='Sales' THEN ItemQty ELSE 0 END) AS units, SUM(CASE WHEN Order_Status='Sales' THEN SellingPrice_Inc_GST ELSE 0 END) AS rev, SUM(CASE WHEN Order_Status='Sales' THEN SellingPrice_Exc_GST ELSE 0 END) AS exc_rev FROM q WHERE Channel='offline_sales' GROUP BY SubChannel ORDER BY rev DESC`,
    offlineCategory: `WITH q AS (${baseWithCN}) SELECT SubChannel, Category, COUNT(DISTINCT CASE WHEN Order_Status='Sales' THEN OrderId END) AS orders, SUM(CASE WHEN Order_Status='Sales' THEN SellingPrice_Inc_GST ELSE 0 END) AS rev, SUM(CASE WHEN Order_Status='Sales' THEN SellingPrice_Exc_GST ELSE 0 END) AS exc_rev, SUM(CASE WHEN Order_Status='Sales' THEN ItemQty ELSE 0 END) AS units, SUM(CASE WHEN Order_Status='Credit Note' THEN SellingPrice_Inc_GST ELSE 0 END) AS cn_rev FROM q WHERE Channel='offline_sales' GROUP BY SubChannel, Category ORDER BY rev DESC`,
    offlineSubCategory: `WITH q AS (${base}) SELECT SubChannel, Category, SubCategory, COUNT(DISTINCT CASE WHEN Order_Status='Sales' THEN OrderId END) AS orders, SUM(CASE WHEN Order_Status='Sales' THEN SellingPrice_Inc_GST ELSE 0 END) AS rev, SUM(CASE WHEN Order_Status='Sales' THEN SellingPrice_Exc_GST ELSE 0 END) AS exc_rev, SUM(CASE WHEN Order_Status='Sales' THEN ItemQty ELSE 0 END) AS units FROM q WHERE Channel='offline_sales' GROUP BY SubChannel, Category, SubCategory ORDER BY rev DESC`,
    offlineSKU: `WITH q AS (${base}) SELECT SubChannel, Category, SubCategory, MasterSKU AS sku, COUNT(DISTINCT CASE WHEN Order_Status='Sales' THEN OrderId END) AS orders, SUM(CASE WHEN Order_Status='Sales' THEN SellingPrice_Inc_GST ELSE 0 END) AS rev, SUM(CASE WHEN Order_Status='Sales' THEN SellingPrice_Exc_GST ELSE 0 END) AS exc_rev, SUM(CASE WHEN Order_Status='Sales' THEN ItemQty ELSE 0 END) AS units FROM q WHERE Channel='offline_sales' AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != '' GROUP BY SubChannel, Category, SubCategory, MasterSKU ORDER BY rev DESC LIMIT 600`,
    offlineState: `WITH q AS (${base}) SELECT SubChannel, UPPER(TRIM(State)) AS state, COUNT(DISTINCT CASE WHEN Order_Status='Sales' THEN OrderId END) AS orders, SUM(CASE WHEN Order_Status='Sales' THEN SellingPrice_Inc_GST ELSE 0 END) AS rev, COUNT(DISTINCT City) AS cities FROM q WHERE Channel='offline_sales' AND State IS NOT NULL AND TRIM(State) != '' AND Order_Status='Sales' GROUP BY SubChannel, UPPER(TRIM(State)) ORDER BY rev DESC`,
    offlineCity: `WITH q AS (${base}) SELECT SubChannel, INITCAP(TRIM(City)) AS city, INITCAP(TRIM(State)) AS state, MAX(Region) AS region, COUNT(DISTINCT CASE WHEN Order_Status='Sales' THEN OrderId END) AS orders, SUM(CASE WHEN Order_Status='Sales' THEN SellingPrice_Inc_GST ELSE 0 END) AS rev FROM q WHERE Channel='offline_sales' AND City IS NOT NULL AND TRIM(City) != '' AND Order_Status='Sales' GROUP BY SubChannel, INITCAP(TRIM(City)), INITCAP(TRIM(State)) ORDER BY rev DESC`,
    offCatPrev: `WITH q AS (${prevBase}) SELECT SubChannel, Category AS category, ROUND(SUM(CASE WHEN Order_Status='Sales' THEN SellingPrice_Inc_GST ELSE 0 END),0) AS rev FROM q WHERE Channel='offline_sales' GROUP BY SubChannel, category`,
    offSubCatPrev: `WITH q AS (${prevBase}) SELECT SubChannel, Category AS category, SubCategory AS subcategory, ROUND(SUM(CASE WHEN Order_Status='Sales' THEN SellingPrice_Inc_GST ELSE 0 END),0) AS rev FROM q WHERE Channel='offline_sales' GROUP BY SubChannel, category, subcategory`,
    offStatesPrev: `WITH q AS (${prevBase}) SELECT SubChannel, UPPER(TRIM(State)) AS state, ROUND(SUM(CASE WHEN Order_Status='Sales' THEN SellingPrice_Inc_GST ELSE 0 END),0) AS rev FROM q WHERE Channel='offline_sales' AND State IS NOT NULL AND TRIM(State) != '' GROUP BY SubChannel, state`,
    offCitiesPrev: `WITH q AS (${prevBase}) SELECT SubChannel, INITCAP(TRIM(City)) AS city, ROUND(SUM(CASE WHEN Order_Status='Sales' THEN SellingPrice_Inc_GST ELSE 0 END),0) AS rev FROM q WHERE Channel='offline_sales' AND City IS NOT NULL AND TRIM(City) != '' AND Order_Status='Sales' GROUP BY SubChannel, city`,
    offStateTotal: `WITH q AS (${base}) SELECT SubChannel, ROUND(SUM(CASE WHEN Order_Status='Sales' THEN SellingPrice_Inc_GST ELSE 0 END),0) AS total_rev FROM q WHERE Channel='offline_sales' AND State IS NOT NULL AND TRIM(State) != '' GROUP BY SubChannel`,
    offCityTotal: `WITH q AS (${base}) SELECT SubChannel, ROUND(SUM(CASE WHEN Order_Status='Sales' THEN SellingPrice_Inc_GST ELSE 0 END),0) AS total_rev FROM q WHERE Channel='offline_sales' AND City IS NOT NULL AND TRIM(City) != '' AND Order_Status='Sales' GROUP BY SubChannel`,
    // Region/City_Tier columns are unpopulated for Stockist/MTGT distributor records, so derive
    // from State via pincode_city_master (same pattern as CRED/Firstcry's crRegion/crTier) instead
    // of relying on the raw Region/City_Tier columns which only exist for Shopify B2B rows.
    offlineRegion: `WITH q AS (${base}), sm AS (SELECT DISTINCT State, Region FROM \`frido-429506.production.pincode_city_master\` WHERE State IS NOT NULL AND Region IS NOT NULL) SELECT q.SubChannel, sm.Region AS region, COUNT(DISTINCT CASE WHEN q.Order_Status='Sales' THEN q.OrderId END) AS orders, SUM(CASE WHEN q.Order_Status='Sales' THEN q.SellingPrice_Inc_GST ELSE 0 END) AS rev, SUM(CASE WHEN q.Order_Status='Sales' THEN q.ItemQty ELSE 0 END) AS units FROM q JOIN sm ON UPPER(TRIM(q.State)) = UPPER(TRIM(sm.State)) WHERE q.Channel='offline_sales' AND q.Order_Status='Sales' GROUP BY q.SubChannel, region ORDER BY rev DESC`,
    offlineTier: `WITH q AS (${base}), tm AS (SELECT DISTINCT State, City_Tier, Tier_Label FROM \`frido-429506.production.pincode_city_master\` WHERE State IS NOT NULL AND City_Tier IS NOT NULL) SELECT q.SubChannel, tm.City_Tier AS city_tier, tm.Tier_Label AS tier_label, COUNT(DISTINCT CASE WHEN q.Order_Status='Sales' THEN q.OrderId END) AS orders, SUM(CASE WHEN q.Order_Status='Sales' THEN q.SellingPrice_Inc_GST ELSE 0 END) AS rev, SUM(CASE WHEN q.Order_Status='Sales' THEN q.ItemQty ELSE 0 END) AS units FROM q JOIN tm ON UPPER(TRIM(q.State)) = UPPER(TRIM(tm.State)) WHERE q.Channel='offline_sales' AND q.Order_Status='Sales' GROUP BY q.SubChannel, city_tier, tier_label ORDER BY city_tier`,
    adsTotals: `SELECT platform, ROUND(SUM(spend),0) AS spend, ROUND(SUM(revenue),0) AS revenue, ROUND(SUM(impressions),0) AS impressions, ROUND(SUM(clicks),0) AS clicks, ROUND(SUM(orders),0) AS orders, ROUND(SAFE_DIVIDE(SUM(clicks),SUM(impressions))*100,2) AS ctr, ROUND(SAFE_DIVIDE(SUM(spend),SUM(clicks)),2) AS cpc, ROUND(SAFE_DIVIDE(SUM(revenue),SUM(spend)),2) AS roas FROM \`frido-429506.production.fact_all_platform_ads_report\` WHERE report_date BETWEEN '${start}' AND '${end}' GROUP BY platform ORDER BY spend DESC`,
    adsDaily: `SELECT CAST(report_date AS STRING) AS date, platform, ROUND(SUM(spend),0) AS spend, ROUND(SUM(revenue),0) AS revenue, ROUND(SUM(impressions),0) AS impressions, ROUND(SUM(clicks),0) AS clicks FROM \`frido-429506.production.fact_all_platform_ads_report\` WHERE report_date BETWEEN '${start}' AND '${end}' GROUP BY date, platform ORDER BY date`,
    adsByAdType: `SELECT platform, ad_type, ROUND(SUM(spend),0) AS spend, ROUND(SUM(revenue),0) AS revenue, ROUND(SUM(impressions),0) AS impressions, ROUND(SUM(clicks),0) AS clicks, ROUND(SUM(orders),0) AS orders, ROUND(SAFE_DIVIDE(SUM(clicks),SUM(impressions))*100,2) AS ctr, ROUND(SAFE_DIVIDE(SUM(spend),SUM(clicks)),2) AS cpc, ROUND(SAFE_DIVIDE(SUM(revenue),SUM(spend)),2) AS roas FROM \`frido-429506.production.fact_all_platform_ads_report\` WHERE report_date BETWEEN '${start}' AND '${end}' GROUP BY platform, ad_type ORDER BY platform, spend DESC`,
    adsCampaigns: `SELECT platform, ad_type, campaign_name, ROUND(SUM(spend),0) AS spend, ROUND(SUM(revenue),0) AS revenue, ROUND(SUM(impressions),0) AS impressions, ROUND(SUM(clicks),0) AS clicks, ROUND(SUM(orders),0) AS orders, ROUND(SAFE_DIVIDE(SUM(clicks),SUM(impressions))*100,2) AS ctr, ROUND(SAFE_DIVIDE(SUM(spend),SUM(clicks)),2) AS cpc, ROUND(SAFE_DIVIDE(SUM(revenue),SUM(spend)),2) AS roas FROM \`frido-429506.production.fact_all_platform_ads_report\` WHERE report_date BETWEEN '${start}' AND '${end}' GROUP BY platform, ad_type, campaign_name ORDER BY spend DESC LIMIT 100`,
    adsByCategory: `SELECT platform, category, ROUND(SUM(spend),0) AS spend, ROUND(SUM(revenue),0) AS revenue, ROUND(SUM(impressions),0) AS impressions, ROUND(SUM(clicks),0) AS clicks, ROUND(SUM(orders),0) AS orders, ROUND(SAFE_DIVIDE(SUM(revenue),SUM(spend)),2) AS roas FROM \`frido-429506.production.fact_all_platform_ads_report\` WHERE report_date BETWEEN '${start}' AND '${end}' AND category IS NOT NULL AND TRIM(category) != '' GROUP BY platform, category ORDER BY spend DESC`,
    adsBySku: `SELECT platform, category, product_name, ROUND(SUM(spend),0) AS spend, ROUND(SUM(revenue),0) AS revenue, ROUND(SUM(impressions),0) AS impressions, ROUND(SUM(clicks),0) AS clicks, ROUND(SUM(orders),0) AS orders, ROUND(SAFE_DIVIDE(SUM(revenue),SUM(spend)),2) AS roas FROM \`frido-429506.production.fact_all_platform_ads_report\` WHERE report_date BETWEEN '${start}' AND '${end}' AND product_name IS NOT NULL AND TRIM(product_name) != '' GROUP BY platform, category, product_name ORDER BY spend DESC LIMIT 200`,
    adsCategoryBreakdown: `WITH im AS (SELECT DISTINCT LOWER(TRIM(Category_Name)) AS cat_key, Category_Name, LOWER(TRIM(Sub_category)) AS subcat_key, Sub_category FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\` WHERE Sub_category IS NOT NULL AND Category_Name IS NOT NULL), ads_agg AS (SELECT platform, CASE WHEN platform IN ('Meta','Google') THEN 'Shopify' ELSE platform END AS sales_platform, COALESCE(NULLIF(TRIM(target_type),''), 'all') AS target_type, LOWER(TRIM(product_name)) AS product_name_key, SUM(spend) AS spend FROM \`frido-429506.production.fact_all_platform_ads_report\` WHERE report_date BETWEEN '${start}' AND '${end}' GROUP BY platform, sales_platform, target_type, product_name_key), sales_rev_raw AS (SELECT s.Channel AS sales_platform, LOWER(TRIM(s.Category)) AS cat_key, LOWER(TRIM(s.SubCategory)) AS subcat_key, SUM(s.SellingPrice_Exc_GST) AS revenue FROM \`frido-429506.production.fact_all_platform_sales_report\` s WHERE s.OrderDate BETWEEN '${start}' AND '${end}' AND s.Channel IN ('Amazon','Flipkart','Shopify','Zepto','Instamart','Myntra','Blinkit') AND s.Country = 'India' GROUP BY sales_platform, cat_key, subcat_key), sales_rev AS (SELECT sr.* FROM sales_rev_raw sr JOIN im ON im.cat_key = sr.cat_key AND im.subcat_key = sr.subcat_key), platform_total_rev AS (SELECT sales_platform, SUM(revenue) AS total_rev FROM sales_rev GROUP BY sales_platform), platform_cat_rev AS (SELECT sales_platform, cat_key, SUM(revenue) AS cat_rev FROM sales_rev GROUP BY sales_platform, cat_key), product_join_raw AS (SELECT a.platform, a.sales_platform, a.product_name_key, a.spend, sc.subcat_key, sc.Sub_category, sc.Category_Name, sc.cat_key FROM ads_agg a LEFT JOIN im sc ON a.target_type = 'product' AND (sc.subcat_key = a.product_name_key OR STRPOS(sc.subcat_key, a.product_name_key) > 0 OR STRPOS(a.product_name_key, sc.subcat_key) > 0) WHERE a.target_type = 'product'), product_key_status AS (SELECT platform, sales_platform, product_name_key, ANY_VALUE(spend) AS spend, MAX(subcat_key IS NOT NULL) AS has_match FROM product_join_raw GROUP BY platform, sales_platform, product_name_key), product_unmatched AS (SELECT platform, sales_platform, product_name_key, spend FROM product_key_status WHERE NOT has_match), product_matched AS (SELECT pk.platform, pk.sales_platform, pk.product_name_key, pk.spend, pj.subcat_key, pj.Sub_category, pj.Category_Name, pj.cat_key FROM product_key_status pk JOIN product_join_raw pj USING (platform, sales_platform, product_name_key) WHERE pk.has_match AND pj.subcat_key IS NOT NULL), product_rev_join AS (SELECT pm.*, COALESCE(sr.revenue,0) AS subcat_rev, SUM(COALESCE(sr.revenue,0)) OVER (PARTITION BY pm.platform, pm.product_name_key) AS matched_set_total_rev, COUNT(*) OVER (PARTITION BY pm.platform, pm.product_name_key) AS matched_set_size FROM product_matched pm LEFT JOIN sales_rev sr ON sr.sales_platform = pm.sales_platform AND sr.subcat_key = pm.subcat_key AND sr.cat_key = pm.cat_key), product_attributed AS (SELECT platform, 'product' AS target_type, Sub_category AS product_name, Category_Name AS category, spend * SAFE_DIVIDE(CASE WHEN matched_set_total_rev > 0 THEN subcat_rev ELSE 1 END, CASE WHEN matched_set_total_rev > 0 THEN matched_set_total_rev ELSE matched_set_size END) AS spend FROM product_rev_join), category_join_raw AS (SELECT a.platform, a.sales_platform, a.product_name_key, a.spend, sc.cat_key, sc.Category_Name FROM ads_agg a LEFT JOIN (SELECT DISTINCT cat_key, Category_Name FROM im) sc ON a.target_type = 'category' AND (sc.cat_key = a.product_name_key OR STRPOS(sc.cat_key, a.product_name_key) > 0 OR STRPOS(a.product_name_key, sc.cat_key) > 0) WHERE a.target_type = 'category'), category_key_status AS (SELECT platform, sales_platform, product_name_key, ANY_VALUE(spend) AS spend, MAX(cat_key IS NOT NULL) AS has_match FROM category_join_raw GROUP BY platform, sales_platform, product_name_key), category_unmatched AS (SELECT platform, sales_platform, product_name_key, spend FROM category_key_status WHERE NOT has_match), category_matched AS (SELECT ck.platform, ck.sales_platform, ck.product_name_key, ck.spend, cj.cat_key, cj.Category_Name FROM category_key_status ck JOIN category_join_raw cj USING (platform, sales_platform, product_name_key) WHERE ck.has_match AND cj.cat_key IS NOT NULL), category_attributed AS (SELECT cm.platform, 'category' AS target_type, im.Sub_category AS product_name, im.Category_Name AS category, cm.spend * SAFE_DIVIDE(COALESCE(sr.revenue,0), NULLIF(pcr.cat_rev,0)) AS spend FROM category_matched cm JOIN im ON im.cat_key = cm.cat_key LEFT JOIN sales_rev sr ON sr.sales_platform = cm.sales_platform AND sr.subcat_key = im.subcat_key AND sr.cat_key = im.cat_key LEFT JOIN platform_cat_rev pcr ON pcr.sales_platform = cm.sales_platform AND pcr.cat_key = cm.cat_key WHERE pcr.cat_rev > 0), all_bucket AS (SELECT platform, sales_platform, spend FROM ads_agg WHERE target_type = 'all' UNION ALL SELECT platform, sales_platform, spend FROM product_unmatched UNION ALL SELECT platform, sales_platform, spend FROM category_unmatched), all_attributed AS (SELECT ab.platform, 'all' AS target_type, im.Sub_category AS product_name, im.Category_Name AS category, ab.spend * SAFE_DIVIDE(COALESCE(sr.revenue,0), NULLIF(ptr.total_rev,0)) AS spend FROM all_bucket ab JOIN im ON TRUE LEFT JOIN sales_rev sr ON sr.sales_platform = ab.sales_platform AND sr.subcat_key = im.subcat_key AND sr.cat_key = im.cat_key LEFT JOIN platform_total_rev ptr ON ptr.sales_platform = ab.sales_platform WHERE ptr.total_rev > 0), combined AS (SELECT * FROM product_attributed UNION ALL SELECT * FROM category_attributed UNION ALL SELECT * FROM all_attributed) SELECT platform, target_type, product_name, category, SUM(spend) AS spend, 0 AS orders, 0 AS revenue, 0 AS clicks, 0 AS impressions, 0 AS ctr, 0 AS cpc, 0 AS roas FROM combined GROUP BY platform, target_type, product_name, category ORDER BY platform, spend DESC LIMIT 20000`,
    adsZeroOrder: `SELECT * FROM (SELECT platform, COALESCE(NULLIF(TRIM(product_name),''), NULLIF(TRIM(campaign_name),''), 'Unknown') AS product, campaign_name, ROUND(SUM(spend),0) AS spend, ROUND(SUM(orders),0) AS orders, ROUND(SUM(clicks),0) AS clicks, ROUND(SUM(impressions),0) AS impressions, ROUND(SAFE_DIVIDE(SUM(clicks),SUM(impressions))*100,2) AS ctr, ROUND(SAFE_DIVIDE(SUM(spend),SUM(clicks)),2) AS cpc FROM \`frido-429506.production.fact_all_platform_ads_report\` WHERE report_date BETWEEN '${start}' AND '${end}' AND platform IN ('Google','Flipkart') GROUP BY platform, product, campaign_name) WHERE spend > 0 ORDER BY platform, spend DESC LIMIT 500`,
    // Flipkart is excluded here and queried separately via salesCategoryOrdersFk using the
    // fkStart/fkEnd-shifted window — Flipkart data lags the other channels, so on a range that
    // runs past Flipkart's latest ingested date, querying it with the same start/end as everyone
    // else silently undercounts its revenue (this was the source of the By Category/By Product
    // revenue total falling short of the KPI card's Net Revenue, which already accounts for the lag).
    salesCategoryOrders: `WITH im AS (SELECT DISTINCT LOWER(TRIM(Category_Name)) AS cat_key, Category_Name, LOWER(TRIM(Sub_category)) AS subcat_key, Sub_category FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\` WHERE Category_Name IS NOT NULL AND Sub_category IS NOT NULL AND TRIM(Category_Name) != '' AND TRIM(Sub_category) != '') SELECT s.Channel AS platform, s.SubChannel AS sub_channel, CASE WHEN im.cat_key IS NOT NULL THEN im.Category_Name ELSE 'Others' END AS category, CASE WHEN im.subcat_key IS NOT NULL THEN im.Sub_category ELSE NULL END AS sub_category, COUNT(DISTINCT s.OrderId) AS orders, SUM(s.ItemQty) AS units, SUM(CASE WHEN s.Order_Status IN ('Cancelled','RTO','Return','CIR','Exchange') THEN s.ItemQty ELSE 0 END) AS return_units, ROUND(SUM(s.SellingPrice_Exc_GST),0) AS revenue, ROUND(SUM(s.SellingPrice_Inc_GST),0) AS gross_revenue, ROUND(SUM(CASE WHEN s.Order_Status = 'Cancelled' THEN s.SellingPrice_Inc_GST ELSE 0 END),0) AS cancel_rev, ROUND(SUM(CASE WHEN s.Order_Status = 'Cancelled' AND s.payment_type = 'COD' THEN s.SellingPrice_Inc_GST ELSE 0 END),0) AS cod_cancel_rev, ROUND(SUM(CASE WHEN s.Order_Status IN ('RTO','Return') THEN s.SellingPrice_Inc_GST ELSE 0 END),0) AS return_rev, ROUND(SUM(CASE WHEN s.Order_Status = 'CIR' THEN s.SellingPrice_Inc_GST ELSE 0 END),0) AS cir_rev FROM \`frido-429506.production.fact_all_platform_sales_report\` s LEFT JOIN im ON LOWER(TRIM(s.Category)) = im.cat_key AND LOWER(TRIM(s.SubCategory)) = im.subcat_key WHERE s.OrderDate BETWEEN '${start}' AND '${end}' AND s.Channel IN ('Amazon','Shopify','Zepto','Instamart','Myntra','Blinkit') AND s.Country = 'India' AND s.Category IS NOT NULL AND TRIM(s.Category) != '' GROUP BY platform, sub_channel, category, sub_category ORDER BY platform, orders DESC`,
    salesCategoryOrdersFk: `WITH im AS (SELECT DISTINCT LOWER(TRIM(Category_Name)) AS cat_key, Category_Name, LOWER(TRIM(Sub_category)) AS subcat_key, Sub_category FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\` WHERE Category_Name IS NOT NULL AND Sub_category IS NOT NULL AND TRIM(Category_Name) != '' AND TRIM(Sub_category) != '') SELECT s.Channel AS platform, CASE WHEN im.cat_key IS NOT NULL THEN im.Category_Name ELSE 'Others' END AS category, CASE WHEN im.subcat_key IS NOT NULL THEN im.Sub_category ELSE NULL END AS sub_category, COUNT(DISTINCT s.OrderId) AS orders, SUM(s.ItemQty) AS units, ROUND(SUM(s.SellingPrice_Exc_GST),0) AS revenue, ROUND(SUM(s.SellingPrice_Inc_GST),0) AS gross_revenue, ROUND(SUM(CASE WHEN s.Order_Status = 'Cancelled' THEN s.SellingPrice_Inc_GST ELSE 0 END),0) AS cancel_rev, ROUND(SUM(CASE WHEN s.Order_Status IN ('RTO','Return') THEN s.SellingPrice_Inc_GST ELSE 0 END),0) AS return_rev, ROUND(SUM(CASE WHEN s.Order_Status = 'CIR' THEN s.SellingPrice_Inc_GST ELSE 0 END),0) AS cir_rev FROM \`frido-429506.production.fact_all_platform_sales_report\` s LEFT JOIN im ON LOWER(TRIM(s.Category)) = im.cat_key AND LOWER(TRIM(s.SubCategory)) = im.subcat_key WHERE s.OrderDate BETWEEN '${fkStart}' AND '${fkEnd}' AND s.Channel = 'Flipkart' AND s.Country = 'India' AND s.Category IS NOT NULL AND TRIM(s.Category) != '' GROUP BY platform, category, sub_category ORDER BY orders DESC`,
    channelDailyExcRev: `SELECT Channel, CAST(OrderDate AS STRING) AS date, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM \`frido-429506.production.fact_all_platform_sales_report\` WHERE OrderDate BETWEEN '${start}' AND '${end}' AND Channel IN ('Amazon','Flipkart','Zepto','Instamart','Myntra','Blinkit') AND Country = 'India' GROUP BY Channel, date ORDER BY Channel, date`,
    // Powers the Ads trend chart's category/sub-category slicer — daily ad spend split by
    // category+sub-category (product_name doubles as sub-category here, same as elsewhere in
    // this file). No item-master join needed since fact_all_platform_ads_report already carries
    // category/product_name directly.
    // Category here is validated against the item master, same base every category/sub-category
    // field in the Ads tab is measured against — anything not in Category_Name (including the
    // literal 'all' from ad targeting metadata, i.e. target_type='all' spend not tied to a
    // specific category/product) folds into 'Others' instead of leaking a raw, unmapped label
    // into the slicer where it can never join to real sales revenue.
    adsDailyByCategory: `WITH valid_cats AS (SELECT DISTINCT LOWER(TRIM(Category_Name)) AS cat_key FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\` WHERE Category_Name IS NOT NULL AND TRIM(Category_Name) != '') SELECT CAST(a.report_date AS STRING) AS date, a.platform, CASE WHEN vc.cat_key IS NOT NULL THEN a.category ELSE 'Others' END AS category, CASE WHEN vc.cat_key IS NOT NULL THEN NULLIF(TRIM(a.product_name),'') ELSE NULL END AS sub_category, ROUND(SUM(a.spend),0) AS spend FROM \`frido-429506.production.fact_all_platform_ads_report\` a LEFT JOIN valid_cats vc ON LOWER(TRIM(a.category)) = vc.cat_key WHERE a.report_date BETWEEN '${start}' AND '${end}' GROUP BY date, platform, category, sub_category`,
    // Daily sales revenue by category/sub-category, mirroring salesCategoryOrders' item-master
    // join so category names line up with the ads side above and with the By Category table.
    salesDailyByCategory: `WITH valid_cats AS (SELECT DISTINCT LOWER(TRIM(Category_Name)) AS cat_key FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\` WHERE Category_Name IS NOT NULL AND TRIM(Category_Name) != '') SELECT CAST(s.OrderDate AS STRING) AS date, s.Channel AS platform, CASE WHEN vc.cat_key IS NOT NULL THEN s.Category ELSE 'Others' END AS category, CASE WHEN vc.cat_key IS NOT NULL THEN s.SubCategory ELSE NULL END AS sub_category, ROUND(SUM(s.SellingPrice_Exc_GST),0) AS revenue FROM \`frido-429506.production.fact_all_platform_sales_report\` s LEFT JOIN valid_cats vc ON LOWER(TRIM(s.Category)) = vc.cat_key WHERE s.OrderDate BETWEEN '${start}' AND '${end}' AND s.Channel IN ('Amazon','Flipkart','Shopify','Zepto','Instamart','Myntra','Blinkit') AND s.Country = 'India' AND s.Category IS NOT NULL AND TRIM(s.Category) != '' GROUP BY date, platform, category, sub_category`,
    prevAdsTotals: `SELECT platform, ROUND(SUM(spend),0) AS spend, ROUND(SUM(revenue),0) AS revenue, ROUND(SUM(impressions),0) AS impressions, ROUND(SUM(clicks),0) AS clicks FROM \`frido-429506.production.fact_all_platform_ads_report\` WHERE report_date BETWEEN '${ps}' AND '${pe}' GROUP BY platform`,
    shopifyNewCusts: `WITH in_range AS (SELECT DISTINCT customer_id FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` WHERE order_date_ist BETWEEN '${start}' AND '${end}' AND customer_id IS NOT NULL), prior AS (SELECT DISTINCT customer_id FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` WHERE order_date_ist < '${start}' AND customer_id IS NOT NULL) SELECT COUNT(*) AS n_custs, COUNTIF(p.customer_id IS NOT NULL) AS repeat_custs FROM in_range ir LEFT JOIN prior p USING (customer_id)`,
    eboTotals: `WITH q AS (${base}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS qty FROM q WHERE Channel='Retail'`,
    eboNetCalc: `WITH q AS (${base}) SELECT SUM(SellingPrice_Inc_GST) AS gross, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(CASE WHEN Order_Status='Cancelled' THEN SellingPrice_Inc_GST ELSE 0 END) AS cancel_rev, SUM(CASE WHEN Order_Status='RTO' THEN SellingPrice_Inc_GST ELSE 0 END) AS rto_rev, SUM(CASE WHEN Order_Status='Return' THEN SellingPrice_Inc_GST ELSE 0 END) AS return_rev, SUM(CASE WHEN Order_Status='CIR' THEN SellingPrice_Inc_GST ELSE 0 END) AS cir_rev, SUM(CASE WHEN Order_Status='Exchange' THEN SellingPrice_Inc_GST ELSE 0 END) AS exch_rev, COUNT(DISTINCT CASE WHEN Order_Status='Exchange' THEN OrderId END) AS exch_orders FROM q WHERE Channel='Retail'`,
    prevEboNetCalc: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS gross, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(CASE WHEN Order_Status='Cancelled' THEN SellingPrice_Inc_GST ELSE 0 END) AS cancel_rev, SUM(CASE WHEN Order_Status='RTO' THEN SellingPrice_Inc_GST ELSE 0 END) AS rto_rev, SUM(CASE WHEN Order_Status='Return' THEN SellingPrice_Inc_GST ELSE 0 END) AS return_rev, SUM(CASE WHEN Order_Status='CIR' THEN SellingPrice_Inc_GST ELSE 0 END) AS cir_rev, SUM(CASE WHEN Order_Status='Exchange' THEN SellingPrice_Inc_GST ELSE 0 END) AS exch_rev, COUNT(DISTINCT CASE WHEN Order_Status='Exchange' THEN OrderId END) AS exch_orders FROM q WHERE Channel='Retail'`,
    eboDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units FROM q WHERE Channel='Retail' GROUP BY date ORDER BY date`,
    prevEboDaily: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Retail' GROUP BY date ORDER BY date`,
    prevEbo: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, COUNT(DISTINCT CASE WHEN Order_Status IN ('RTO','Return') THEN OrderId END) AS rto_orders, COUNT(DISTINCT CASE WHEN Order_Status = 'CIR' THEN OrderId END) AS cir_orders, COUNT(DISTINCT CASE WHEN Order_Status='Exchange' THEN OrderId END) AS exchange_orders FROM q WHERE Channel='Retail'`,
    eboCategory: `WITH q AS (${base}) SELECT Category, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS units, SUM(CASE WHEN UPPER(COALESCE(MasterSKU,'')) NOT LIKE '%COUP%' AND UPPER(COALESCE(MasterSKU,'')) NOT LIKE '%DFA%' THEN ItemQty ELSE 0 END) AS asp_units, COUNT(DISTINCT CASE WHEN Order_Status='Cancelled' THEN OrderId END) AS cancelled, COUNT(DISTINCT CASE WHEN Order_Status IN ('RTO','Return') THEN OrderId END) AS rto, COUNT(DISTINCT CASE WHEN Order_Status='CIR' THEN OrderId END) AS cir, COUNT(DISTINCT CASE WHEN Order_Status='Exchange' THEN OrderId END) AS exch, SUM(CASE WHEN Order_Status='Cancelled' THEN SellingPrice_Inc_GST ELSE 0 END) AS cancel_rev, SUM(CASE WHEN Order_Status IN ('RTO','Return') THEN SellingPrice_Inc_GST ELSE 0 END) AS rto_rev, SUM(CASE WHEN Order_Status='CIR' THEN SellingPrice_Inc_GST ELSE 0 END) AS cir_rev, SUM(CASE WHEN Order_Status='Exchange' THEN SellingPrice_Inc_GST ELSE 0 END) AS exch_rev FROM q WHERE Channel='Retail' GROUP BY Category ORDER BY rev DESC`,
    eboCategoryPrev: `WITH q AS (${prevBase}) SELECT Category, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Retail' GROUP BY Category`,
    eboSubCategory: `WITH q AS (${base}) SELECT Category, SubCategory, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS units, SUM(CASE WHEN UPPER(COALESCE(MasterSKU,'')) NOT LIKE '%COUP%' AND UPPER(COALESCE(MasterSKU,'')) NOT LIKE '%DFA%' THEN ItemQty ELSE 0 END) AS asp_units, COUNT(DISTINCT CASE WHEN Order_Status='Cancelled' THEN OrderId END) AS cancelled, COUNT(DISTINCT CASE WHEN Order_Status IN ('RTO','Return') THEN OrderId END) AS rto, COUNT(DISTINCT CASE WHEN Order_Status='CIR' THEN OrderId END) AS cir, COUNT(DISTINCT CASE WHEN Order_Status='Exchange' THEN OrderId END) AS exch, SUM(CASE WHEN Order_Status='Cancelled' THEN SellingPrice_Inc_GST ELSE 0 END) AS cancel_rev, SUM(CASE WHEN Order_Status IN ('RTO','Return') THEN SellingPrice_Inc_GST ELSE 0 END) AS rto_rev, SUM(CASE WHEN Order_Status='CIR' THEN SellingPrice_Inc_GST ELSE 0 END) AS cir_rev, SUM(CASE WHEN Order_Status='Exchange' THEN SellingPrice_Inc_GST ELSE 0 END) AS exch_rev FROM q WHERE Channel='Retail' GROUP BY Category, SubCategory ORDER BY rev DESC`,
    eboSubCategoryPrev: `WITH q AS (${prevBase}) SELECT Category, SubCategory, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Retail' GROUP BY Category, SubCategory`,
    eboSKU: `WITH q AS (${base}) SELECT Category, SubCategory, MasterSKU AS sku, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS units, COUNT(DISTINCT CASE WHEN Order_Status='Cancelled' THEN OrderId END) AS cancelled, COUNT(DISTINCT CASE WHEN Order_Status IN ('RTO','Return') THEN OrderId END) AS rto, COUNT(DISTINCT CASE WHEN Order_Status='CIR' THEN OrderId END) AS cir, COUNT(DISTINCT CASE WHEN Order_Status='Exchange' THEN OrderId END) AS exch, SUM(CASE WHEN Order_Status='Cancelled' THEN SellingPrice_Inc_GST ELSE 0 END) AS cancel_rev, SUM(CASE WHEN Order_Status IN ('RTO','Return') THEN SellingPrice_Inc_GST ELSE 0 END) AS rto_rev, SUM(CASE WHEN Order_Status='CIR' THEN SellingPrice_Inc_GST ELSE 0 END) AS cir_rev, SUM(CASE WHEN Order_Status='Exchange' THEN SellingPrice_Inc_GST ELSE 0 END) AS exch_rev FROM q WHERE Channel='Retail' AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != '' GROUP BY Category, SubCategory, MasterSKU ORDER BY rev DESC`,
    eboState: `WITH q AS (${base}) SELECT UPPER(TRIM(State)) AS state, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(ItemQty) AS units, COUNT(DISTINCT City) AS cities, COUNT(DISTINCT CASE WHEN Order_Status IN ('RTO','Return','CIR') THEN OrderId END) AS rto_orders, SUM(CASE WHEN Order_Status IN ('RTO','Return','CIR') THEN SellingPrice_Inc_GST ELSE 0 END) AS return_rev FROM q WHERE Channel='Retail' AND State IS NOT NULL AND TRIM(State) != '' GROUP BY UPPER(TRIM(State)) ORDER BY rev DESC LIMIT 30`,
    eboStateTotal: `WITH q AS (${base}) SELECT SUM(SellingPrice_Inc_GST) AS total_rev, COUNT(DISTINCT OrderId) AS total_orders FROM q WHERE Channel='Retail' AND State IS NOT NULL AND TRIM(State) != ''`,
    eboStatePrev: `WITH q AS (${prevBase}) SELECT UPPER(TRIM(State)) AS state, SUM(SellingPrice_Inc_GST) AS rev, COUNT(DISTINCT OrderId) AS orders FROM q WHERE Channel='Retail' AND State IS NOT NULL AND TRIM(State) != '' GROUP BY UPPER(TRIM(State))`,
    eboCity: `WITH q AS (${base}) SELECT INITCAP(TRIM(City)) AS city, INITCAP(TRIM(State)) AS state, MAX(Region) AS region, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, COUNT(DISTINCT CASE WHEN Order_Status IN ('RTO','Return','CIR') THEN OrderId END) AS rto_orders, SUM(CASE WHEN Order_Status IN ('RTO','Return','CIR') THEN SellingPrice_Inc_GST ELSE 0 END) AS return_rev FROM q WHERE Channel='Retail' AND City IS NOT NULL AND TRIM(City) != '' GROUP BY INITCAP(TRIM(City)), INITCAP(TRIM(State)) ORDER BY rev DESC LIMIT 50`,
    eboCityTotal: `WITH q AS (${base}) SELECT SUM(SellingPrice_Inc_GST) AS total_rev, COUNT(DISTINCT OrderId) AS total_orders FROM q WHERE Channel='Retail' AND City IS NOT NULL AND TRIM(City) != ''`,
    eboCityPrev: `WITH q AS (${prevBase}) SELECT INITCAP(TRIM(City)) AS city, INITCAP(TRIM(State)) AS state, SUM(SellingPrice_Inc_GST) AS rev, COUNT(DISTINCT OrderId) AS orders FROM q WHERE Channel='Retail' AND City IS NOT NULL AND TRIM(City) != '' GROUP BY INITCAP(TRIM(City)), INITCAP(TRIM(State))`,
    eboRegion: `WITH q AS (${base}) SELECT Region AS region, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(ItemQty) AS units FROM q WHERE Channel='Retail' AND Region IS NOT NULL GROUP BY Region ORDER BY rev DESC`,
    eboTier: `WITH q AS (${base}) SELECT City_Tier AS city_tier, Tier_Label AS tier_label, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(ItemQty) AS units FROM q WHERE Channel='Retail' AND City_Tier IS NOT NULL GROUP BY City_Tier, Tier_Label ORDER BY City_Tier`,
    eboReturnReasons: `SELECT COALESCE(NULLIF(TRIM(Customer_Return_Reason),''), 'Unknown') AS reason, COALESCE(NULLIF(TRIM(Customer_Sub_Reason),''), 'Unknown') AS sub_reason, COALESCE(NULLIF(TRIM(Category),''), 'Unknown') AS category, COALESCE(NULLIF(TRIM(SubCategory),''), 'Unknown') AS sub_category, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev FROM \`frido-429506.production.fact_all_platform_sales_report\` WHERE OrderDate BETWEEN '${start}' AND '${end}' AND Channel = 'Shopify' AND SubChannel = 'Retail Store' AND Order_Status IN ('RTO','Return','CIR') AND Customer_Return_Reason IS NOT NULL AND TRIM(Customer_Return_Reason) != '' GROUP BY 1,2,3,4 ORDER BY orders DESC`,
    eboCIR: `WITH q AS (${base}) SELECT SUM(SellingPrice_Inc_GST) AS cir_rev, SUM(SellingPrice_Exc_GST) AS cir_exc_rev, COUNT(DISTINCT OrderId) AS cir_orders FROM q WHERE Channel='Retail' AND Order_Status = 'CIR'`,
    eboReturn: `WITH q AS (${base}) SELECT SUM(SellingPrice_Inc_GST) AS return_rev, SUM(SellingPrice_Exc_GST) AS return_exc_rev, COUNT(DISTINCT OrderId) AS return_orders FROM q WHERE Channel='Retail' AND Order_Status = 'Return'`,
    eboExchange: `WITH q AS (${base}) SELECT COUNT(DISTINCT OrderId) AS exchange_orders, SUM(SellingPrice_Inc_GST) AS exchange_rev FROM q WHERE Channel='Retail' AND Order_Status = 'Exchange'`,
    eboRTO: `WITH q AS (${base}) SELECT SUM(SellingPrice_Inc_GST) AS rto_rev, SUM(SellingPrice_Exc_GST) AS rto_exc_rev, COUNT(DISTINCT OrderId) AS rto_orders FROM q WHERE Channel='Retail' AND Order_Status = 'RTO'`,
    eboDailyReturnTrend: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, COUNT(DISTINCT OrderId) AS total_orders, COUNT(DISTINCT CASE WHEN Order_Status='RTO' THEN OrderId END) AS rto_orders, COUNT(DISTINCT CASE WHEN Order_Status='Return' THEN OrderId END) AS return_orders, COUNT(DISTINCT CASE WHEN Order_Status='Exchange' THEN OrderId END) AS exch_orders, COUNT(DISTINCT CASE WHEN Order_Status='CIR' THEN OrderId END) AS cir_orders, COUNT(DISTINCT CASE WHEN Order_Status='Cancelled' THEN OrderId END) AS cancel_orders FROM q WHERE Channel='Retail' GROUP BY date ORDER BY date`,
    pnlAdRawTotals: `SELECT platform, ROUND(SUM(spend),2) AS spend FROM \`frido-429506.production.fact_all_platform_ads_report\` WHERE report_date BETWEEN '${start}' AND '${end}' AND platform IN ('Meta','Google') GROUP BY platform`,
  }

  try {
    const results = await Promise.all(
      Object.entries(queries).map(([key, sql]) =>
        bq.query({ query: sql }).then(([rows]) => ({ key, rows }))
      )
    )
    const r = Object.fromEntries(results.map(({ key, rows }) => [key, rows]))

    const dateSet = [...new Set(r.byDate.map(x => x.date))].sort()
    const dailyArr = dateSet.map(date => {
      const entry = { date }
      r.byDate.filter(x => x.date === date).forEach(x => {
        const key = (x.Channel === 'Retail') ? 'EBO' : x.Channel
        const rev = parseFloat(x.rev) || 0
        const net = parseFloat(x.net_exc_rev) || 0
        const ord = parseInt(x.orders) || 0
        const uni = parseInt(x.units) || 0
        entry[key] = (entry[key] || 0) + rev
        entry[key + '_net'] = (entry[key + '_net'] || 0) + net
        entry[key + '_o'] = (entry[key + '_o'] || 0) + ord
        entry[key + '_u'] = (entry[key + '_u'] || 0) + uni
      })
      return entry
    })

    const catMap = {}
    r.byCategory.forEach(x => { catMap[x.Category || 'Others'] = { rev: parseFloat(x.rev) || 0, excRev: parseFloat(x.exc_rev) || 0, orders: { size: parseInt(x.orders) }, units: parseInt(x.units) || 0, aspUnits: parseInt(x.asp_units) || parseInt(x.units) || 0 } })

    const subCatMap = {}
    r.bySubCategory.forEach(x => { const key = `${x.Category || 'Others'}::${x.SubCategory || 'Others'}`; subCatMap[key] = { rev: parseFloat(x.rev) || 0, excRev: parseFloat(x.exc_rev) || 0, cancelRev: parseFloat(x.cancel_rev) || 0, rtoRev: parseFloat(x.rto_rev) || 0, cirRev: parseFloat(x.cir_rev) || 0, returnRev: parseFloat(x.return_rev) || 0, orders: { size: parseInt(x.orders) || 0 }, units: parseInt(x.units) || 0, aspUnits: parseInt(x.asp_units) || parseInt(x.units) || 0 } })

    const catPrevMap = {}
    ;(r.prevByCategory || []).forEach(x => { catPrevMap[x.Category || 'Others'] = parseFloat(x.rev) || 0 })

    const subCatPrevMap = {}
    ;(r.prevBySubCategory || []).forEach(x => { subCatPrevMap[`${x.Category || 'Others'}::${x.SubCategory || 'Others'}`] = parseFloat(x.rev) || 0 })

    const catChannelMap = {}
    ;[...(r.byCategoryChannel || []), ...(r.byCategoryChannelFk || [])].forEach(x => {
      const cat = x.Category || 'Others'
      const ch = (x.Channel === 'Retail') ? 'EBO' : x.Channel
      if (!catChannelMap[cat]) catChannelMap[cat] = {}
      catChannelMap[cat][ch] = (catChannelMap[cat][ch] || 0) + (parseFloat(x.rev) || 0)
    })

    const subCatChannelMap = {}
    ;[...(r.bySubCategoryChannel || []), ...(r.bySubCategoryChannelFk || [])].forEach(x => {
      const cat = x.Category || 'Others'
      const sc = x.SubCategory || 'Others'
      const ch = (x.Channel === 'Retail') ? 'EBO' : x.Channel
      if (!ch) return
      if (!subCatChannelMap[cat]) subCatChannelMap[cat] = {}
      if (!subCatChannelMap[cat][sc]) subCatChannelMap[cat][sc] = {}
      subCatChannelMap[cat][sc][ch] = (subCatChannelMap[cat][sc][ch] || 0) + (parseFloat(x.rev) || 0)
    })

    const stateMap = {}
    r.byState.forEach(x => { if (!x.state) return; stateMap[x.state] = { rev: parseFloat(x.rev) || 0, orders: parseInt(x.orders) || 0, cities: { size: parseInt(x.cities) } } })
    const statePrevMap = Object.fromEntries((r.byStatePrev || []).filter(x => x.state).map(x => [x.state, parseFloat(x.rev) || 0]))
    const stateTotal = parseFloat(r.byStateTotal?.[0]?.total_rev) || 0

    const cityRows = (r.byCity || []).map(x => ({ city: x.city, state: x.state, region: x.region || '', cityTier: x.city_tier || '', orders: parseInt(x.orders) || 0, rev: parseFloat(x.rev) || 0 }))
    const cityPrevMap = Object.fromEntries((r.byCityPrev || []).filter(x => x.city).map(x => [x.city, parseFloat(x.rev) || 0]))
    const cityTotal = parseFloat(r.byCityTotal?.[0]?.total_rev) || 0
    const regionRows = (r.byRegion || []).map(x => ({ region: x.region, orders: parseInt(x.orders) || 0, rev: parseFloat(x.rev) || 0, units: parseInt(x.units) || 0 }))
    const tierRows = (r.byTier || []).map(x => ({ tier: parseInt(x.city_tier) || x.city_tier, label: x.tier_label, orders: parseInt(x.orders) || 0, rev: parseFloat(x.rev) || 0, units: parseInt(x.units) || 0 }))
    const skuRows = (r.bySKU || []).map(x => ({ sku: x.sku, category: x.category || '', subCategory: x.subcategory || '', channel: x.channel || '', units: parseInt(x.units) || 0, orders: parseInt(x.orders) || 0, rev: parseFloat(x.rev) || 0 }))

    const financialStatusMap = {}
    r.byFinancialStatus.forEach(x => { financialStatusMap[x.financial_status || 'Unknown'] = { orders: parseInt(x.orders) || 0, rev: parseFloat(x.rev) || 0 } })

    const fulfilmentStatusMap = {}
    r.byFulfilmentStatus.forEach(x => { fulfilmentStatusMap[x.fulfil_status || 'Unknown'] = parseInt(x.orders) || 0 })

    const refundTrend = (r.byRefundTrend || []).map(x => ({ date: x.date, total: parseInt(x.total_orders) || 0, refunds: parseInt(x.refund_lines) || 0, rate: x.total_orders ? (parseInt(x.refund_lines) / parseInt(x.total_orders) * 100) : 0 }))
    const dailyReturnTrend = (r.byDailyReturnTrend || []).map(x => ({ date: x.date, total: parseInt(x.total_orders) || 0, rtoPct: x.total_orders ? ((parseInt(x.rto_orders) + parseInt(x.return_orders || 0)) / parseInt(x.total_orders) * 100) : 0, exchPct: x.total_orders ? (parseInt(x.exch_orders) / parseInt(x.total_orders) * 100) : 0, cirPct: x.total_orders ? (parseInt(x.cir_orders) / parseInt(x.total_orders) * 100) : 0, cancelPct: x.total_orders ? (parseInt(x.cancel_orders) / parseInt(x.total_orders) * 100) : 0 }))

    // Shared measures layer (computeNetRevenueMeasures in _bq.js) drives every channel's netRev
    // here too — %s are share-of-Gross-Inc-GST, Net Revenue (Exc GST) = Gross Exc GST × retained
    // share. This keeps chMap (and the All tab's summed total) reconcilable with each channel tab.
    const chMap = {}
    r.byChannel.forEach(x => {
      const m = computeNetRevenueMeasures({
        gross_inc_gst: x.rev, gross_exc_gst: x.exc_rev,
        cir_rev: x.cir_rev, rto_rev: x.rto_rev, return_rev: x.return_rev, cancel_rev: x.cancel_rev,
      })
      // Split Shopify Retail Store rows into EBO channel
      const key = x.Channel === 'Retail' ? 'EBO' : x.Channel
      if (!chMap[key]) chMap[key] = { rev: 0, excRev: 0, netRev: 0, orders: 0, qty: 0 }
      chMap[key].rev += m.grossIncGst
      chMap[key].excRev += m.grossExcGst
      chMap[key].netRev += m.netRevenueExcGst
      chMap[key].orders += parseInt(x.orders) || 0
      chMap[key].qty += parseInt(x.qty) || 0
    })
    // Override chMap['Shopify'] netRev using exact same shared-measures formula as the Shopify tab
    // (India only, from shNetCalc) then add International net rev on top
    const shM = computeNetRevenueMeasures(r.shNetCalc?.[0] || {})
    if (shM.grossIncGst > 0) {
      const intlExcRev = parseFloat(r.shopifyIntlTotals?.[0]?.intl_exc_rev) || 0
      const intlRev = parseFloat(r.shopifyIntlTotals?.[0]?.intl_rev) || 0
      if (chMap['Shopify']) {
        chMap['Shopify'].netRev = shM.netRevenueExcGst + intlExcRev
        chMap['Shopify'].rev = shM.grossIncGst + intlRev
        chMap['Shopify'].excRev = shM.grossExcGst + intlExcRev
      } else {
        chMap['Shopify'] = { rev: shM.grossIncGst + intlRev, excRev: shM.grossExcGst + intlExcRev, netRev: shM.netRevenueExcGst + intlExcRev, orders: 0, qty: 0 }
      }
    }

    // (Myntra previously had excRev shown directly as netRev here, on the assumption the platform
    // reports net-of-returns — that's false, Myntra has real Return/Cancelled revenue in Order_Status,
    // so it's now computed by the shared-measures loop above like every other channel. No override needed.)

    // Override chMap['Amazon'] — the Amazon tab's own SC net revenue (amzSCNetCalc) uses Amazon-
    // specific quirks that byChannel's generic aggregation doesn't replicate: only rows with
    // SellingPrice_Inc_GST > 0 count toward gross, Return+RTO are combined into one return_rev,
    // and Cancelled comes from FinancialStatus (not Order_Status). VC has no Cancel/RTO/Return/CIR
    // concept, so its net revenue is just its Exc-GST total. Mirror the Amazon tab's exact
    // SC-netCalc + VC-exc-rev sum so the All-tab total reconciles with the Amazon tab.
    if (r.amzSCNetCalc?.length) {
      const scM = computeNetRevenueMeasures(r.amzSCNetCalc[0])
      const vcRev = (r.amzVCAccounts || []).reduce((s, x) => s + (parseFloat(x.ordered_rev) || 0), 0)
      const vcExcRev = (r.amzVCAccounts || []).reduce((s, x) => s + (parseFloat(x.ordered_exc_rev) || 0), 0)
      const vcUnits = (r.amzVCAccounts || []).reduce((s, x) => s + (parseInt(x.ordered_units) || 0), 0)
      if (chMap['Amazon']) {
        chMap['Amazon'].rev = scM.grossIncGst + vcRev
        chMap['Amazon'].excRev = scM.grossExcGst + vcExcRev
        chMap['Amazon'].netRev = scM.netRevenueExcGst + vcExcRev
        chMap['Amazon'].qty = (chMap['Amazon'].qty || 0)
      } else {
        chMap['Amazon'] = { rev: scM.grossIncGst + vcRev, excRev: scM.grossExcGst + vcExcRev, netRev: scM.netRevenueExcGst + vcExcRev, orders: 0, qty: vcUnits }
      }
    }

    // Override chMap['offline_sales'] — Offline has no Cancel/RTO/Return/CIR order-status concept,
    // so computeNetRevenueMeasures always returns a 0% deduction for it above, silently dropping
    // Credit Notes from the All-tab's Net Revenue. Offline's own tab computes
    // Net Rev = Exc-GST Sales − Exc-GST Credit Notes (see offlineTotals) — mirror that here so the
    // All-tab total reconciles with the Offline tab.
    if (r.offlineTotals?.length) {
      const offRevSales = r.offlineTotals.reduce((s, x) => s + (parseFloat(x.rev_sales) || 0), 0)
      const offExcRevSales = r.offlineTotals.reduce((s, x) => s + (parseFloat(x.exc_rev_sales) || 0), 0)
      const offOrders = r.offlineTotals.reduce((s, x) => s + (parseInt(x.orders) || 0), 0)
      const offUnits = r.offlineTotals.reduce((s, x) => s + (parseInt(x.units) || 0), 0)
      const offCnExcRev = Math.abs(r.offlineTotals.reduce((s, x) => s + (parseFloat(x.cn_exc_rev) || 0), 0))
      chMap['offline_sales'] = { rev: offRevSales, excRev: offExcRevSales, netRev: offExcRevSales - offCnExcRev, orders: offOrders, qty: offUnits }
    }

    const orderStatusMap = {}
    const orderStatusRevMap = {}
    r.byOrderStatus.forEach(x => { orderStatusMap[x.order_status || 'Unknown'] = parseInt(x.cnt) || 0; orderStatusRevMap[x.order_status || 'Unknown'] = parseFloat(x.rev) || 0 })

    const bucketOrder = ['<₹500','₹500-1K','₹1K-2.5K','₹2.5K-5K','₹5K-10K','₹10K-25K','₹25K+']
    const buckets = Object.fromEntries(bucketOrder.map(k => [k, 0]))
    const bucketRev = Object.fromEntries(bucketOrder.map(k => [k, 0]))
    r.byOrderValue.forEach(x => { buckets[x.bucket] = parseInt(x.cnt) || 0; bucketRev[x.bucket] = parseFloat(x.rev) || 0 })

    const voucherMap = {}
    r.byVoucher.forEach(x => { voucherMap[x.voucher_type] = { orders: parseInt(x.orders) || 0, rev: parseFloat(x.rev) || 0 } })
    const subChannelMap = {}
    r.bySubChannel.forEach(x => { if (x.SubChannel) subChannelMap[x.SubChannel] = { rev: parseFloat(x.rev) || 0, excRev: parseFloat(x.exc_rev) || 0, orders: parseInt(x.orders) || 0, qty: parseInt(x.qty) || 0 } })
    // Override Mobility net revenue with manager-defined filter (paid/pending/partially_paid × Delivered/Dispatched/Exchange/Blank)
    const mobilityNetRev = parseFloat(r.mobilityNetCalc?.[0]?.net_rev) || 0
    if (subChannelMap['Mobility'] && mobilityNetRev > 0) subChannelMap['Mobility'].netRev = mobilityNetRev
    const SUB_CHANNEL_ORDER = ['MyFrido', 'Mobility']
    const allSubChannels = (r.allSubChannels || []).map(x => x.SubChannel).filter(Boolean)
      .sort((a, b) => (SUB_CHANNEL_ORDER.indexOf(a) === -1 ? 99 : SUB_CHANNEL_ORDER.indexOf(a)) - (SUB_CHANNEL_ORDER.indexOf(b) === -1 ? 99 : SUB_CHANNEL_ORDER.indexOf(b)))
    const paymentModeMap = {}
    r.byPaymentMode.forEach(x => { paymentModeMap[x.payment_mode] = { orders: parseInt(x.orders) || 0, rev: parseFloat(x.rev) || 0 } })

    const t = r.totals[0] || {}
    const totalRev = parseFloat(t.total_rev) || 0
    const totalExcRev = parseFloat(t.total_exc_rev) || 0
    const nOrders = parseInt(t.n_orders) || 0
    const totalQty = parseInt(t.total_qty) || 0
    const aspQtyRaw = parseFloat(t.asp_qty)
    const aspQty = (!isNaN(aspQtyRaw) && aspQtyRaw > 0) ? aspQtyRaw : totalQty
    const returnTrackableRev = parseFloat(r.returnNumerator?.[0]?.return_numerator_rev) || 0
    // AOV/ASP for the All tab only reflect Shopify, Amazon SC, Myntra, Flipkart, Firstcry, CRED —
    // not blended across every channel (VC/quick-commerce/offline have no comparable order economics).
    const aaT = r.aspAovTotals?.[0] || {}
    const aspAovOrders = parseInt(aaT.orders) || 0
    const aspAovRev = parseFloat(aaT.rev) || 0
    const aspAovQty = parseFloat(aaT.asp_qty) || 0
    const blendedAOVScoped = aspAovOrders ? aspAovRev / aspAovOrders : 0
    const aspScoped = aspAovQty ? aspAovRev / aspAovQty : 0
    const nDays = parseInt(t.n_days) || 1
    const nCusts = parseInt(r.repeatRate[0]?.n_custs) || parseInt(t.n_custs) || 0
    const repeatCusts = parseInt(r.repeatRate[0]?.repeat_custs) || 0
    const htCount = parseInt(r.highTicket[0]?.ht_count) || 0
    const htRevAgg = parseFloat(r.highTicket[0]?.ht_rev) || 0
    const multiItemOrders = parseInt(r.multiItem[0]?.multi_item_orders) || 0

    const orders = r.topOrders.map(x => ({
      orderId: x.OrderId, rev: parseFloat(x.rev) || 0, qty: parseInt(x.qty) || 0, items: parseInt(x.qty) || 0,
      channel: x.Channel, date: x.order_date, state: x.State, city: x.City,
      orderStatus: x.order_status, customerId: x.customer_id, voucher: x.voucher_code, skus: x.skus || '',
      isRTO: false, isCIR: false, isCancelled: false, isExchange: false
    }))

    const momRev = parseFloat(r.momTotals?.[0]?.total_rev) || 0
    const yoyRev = parseFloat(r.yoyTotals?.[0]?.total_rev) || 0
    const momOrders = parseInt(r.momTotals?.[0]?.n_orders) || 0
    const yoyOrders = parseInt(r.yoyTotals?.[0]?.n_orders) || 0

    const rtoRev = parseFloat(r.byOrderStatus?.find(x => x.order_status === 'RTO')?.rev) || 0
    const rtoExcRev = parseFloat(r.byRTO?.[0]?.rto_exc_rev) || parseFloat(r.byOrderStatus?.find(x => x.order_status === 'RTO')?.exc_rev) || 0
    const returnRev = parseFloat(r.byReturn?.[0]?.return_rev) || 0
    const returnExcRev = parseFloat(r.byReturn?.[0]?.return_exc_rev) || 0
    const cancellRev = parseFloat(r.byOrderStatus?.find(x => x.order_status === 'Cancelled')?.rev) || 0
    const cancellExcRev = parseFloat(r.byOrderStatus?.find(x => x.order_status === 'Cancelled')?.exc_rev) || 0
    const cirRev = parseFloat(r.byCIR?.[0]?.cir_rev) || 0
    const cirExcRev = parseFloat(r.byCIR?.[0]?.cir_exc_rev) || 0
    const rtoRevDirect = parseFloat(r.byRTO?.[0]?.rto_rev) || 0
    // netRevenueCalc is finalized below (after chMap/fkBlock apply their per-channel overrides) as
    // the SUM of each channel's own shared-measures Net Revenue — not one blended global retained-
    // share applied to the whole business. Summing each channel's own % rates is more accurate
    // (and is what keeps this reconcilable with every channel tab), since CIR/RTO/Return/Cancel
    // rates genuinely differ by channel. Placeholder here; real value set after fkBlock below.
    let netRevenueCalc = 0

    // Build flipkart block early so we can patch overall totals with estimated days
    const fkBlock = (() => {
        const fkRealDaily = (r.fkDaily || []).map(x => ({ date: x.date, sub: x.sub, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, returns: parseInt(x.returns)||0, returnRev: parseFloat(x.return_rev)||0, estimated: false }))
        const fkDates = [...new Set(fkRealDaily.map(x => x.date))].sort()
        // When selected range is entirely after latest FK data, fall back to fkLast7 for avg baseline
        const fkLast7Rows = (r.fkLast7 || []).map(x => ({ date: x.date, sub: x.sub === 'FBF' ? 'FBF' : 'NON-FBF', orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0 }))
        const fkLast7Dates = [...new Set(fkLast7Rows.map(x => x.date))].sort()
        const latestFkDate = fkDates[fkDates.length - 1] || fkLast7Dates[fkLast7Dates.length - 1]
        const estimatedDaily = []
        if (latestFkDate && latestFkDate < end) {
          // Use real daily rows if available, else fall back to fkLast7 baseline
          const baselineRows = fkRealDaily.length > 0 ? fkRealDaily : fkLast7Rows
          const baselineDates = fkRealDaily.length > 0 ? fkDates : fkLast7Dates
          const subTotals = { FBF: {}, 'NON-FBF': {} }
          baselineRows.forEach(x => {
            const s = x.sub === 'FBF' ? 'FBF' : 'NON-FBF'
            if (!subTotals[s][x.date]) subTotals[s][x.date] = { rev: 0, orders: 0, units: 0 }
            subTotals[s][x.date].rev += x.rev; subTotals[s][x.date].orders += x.orders; subTotals[s][x.date].units += x.units
          })
          const last7Dates = baselineDates.slice(-7)
          for (const sub of ['FBF', 'NON-FBF']) {
            const last7 = last7Dates.map(d => subTotals[sub][d] || { rev: 0, orders: 0, units: 0 })
            const avgRev = Math.round(last7.reduce((s, d) => s + d.rev, 0) / last7.length)
            const avgOrders = Math.round(last7.reduce((s, d) => s + d.orders, 0) / last7.length)
            const avgUnits = Math.round(last7.reduce((s, d) => s + d.units, 0) / last7.length)
            const cur = new Date(latestFkDate), end_ = new Date(end)
            cur.setDate(cur.getDate() + 1)
            while (cur <= end_) {
              const d = cur.toISOString().slice(0, 10)
              estimatedDaily.push({ date: d, sub, rev: avgRev, orders: avgOrders, units: avgUnits, estimated: true })
              cur.setDate(cur.getDate() + 1)
            }
          }
        }
        const estBySub = { FBF: { rev: 0, orders: 0, units: 0 }, 'NON-FBF': { rev: 0, orders: 0, units: 0 } }
        estimatedDaily.forEach(d => { const s = d.sub === 'FBF' ? 'FBF' : 'NON-FBF'; estBySub[s].rev += d.rev; estBySub[s].orders += d.orders; estBySub[s].units += d.units })
        const estTotalRev = estimatedDaily.reduce((s, d) => s + d.rev, 0)
        const estTotalOrders = estimatedDaily.reduce((s, d) => s + d.orders, 0)
        const estTotalUnits = estimatedDaily.reduce((s, d) => s + d.units, 0)
        const realTotals = (r.fkTotals || []).map(x => ({ sub: x.sub, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, units: parseInt(x.units)||0, returns: parseInt(x.returns)||0, cancelOrders: parseInt(x.cancel_orders)||0, cancelRev: parseFloat(x.cancel_rev)||0, returnRev: parseFloat(x.return_rev)||0, totalReturnRev: parseFloat(x.total_return_rev)||0 }))
        const patchedTotals = realTotals.map(t => {
          const e = estBySub[t.sub] || { rev: 0, orders: 0, units: 0 }
          // Only patch rev/excRev with estimated — orders/units stay as real COUNT(DISTINCT) to avoid inflation
          return { ...t, rev: t.rev + e.rev, orders: t.orders, units: t.units, excRev: t.excRev + e.rev }
        })
        if (!patchedTotals.find(t => t.sub === 'NON-FBF') && estBySub['NON-FBF'].rev > 0) patchedTotals.push({ sub: 'NON-FBF', ...estBySub['NON-FBF'], excRev: estBySub['NON-FBF'].rev })
        return { estTotalRev, estTotalOrders, estTotalUnits, latestFkDate, estimatedDays: estimatedDaily.length, daily: [...fkRealDaily, ...estimatedDaily], patchedTotals }
    })()

    // Patch overall totals with Flipkart estimated days
    const adjTotalRev = totalRev + fkBlock.estTotalRev
    const adjTotalExcRev = totalExcRev + fkBlock.estTotalRev
    const adjNOrders = nOrders + fkBlock.estTotalOrders
    const adjTotalQty = totalQty + fkBlock.estTotalUnits
    const adjAspQty = aspQty + fkBlock.estTotalUnits
    if (chMap['Flipkart']) {
      chMap['Flipkart'].rev += fkBlock.estTotalRev
      chMap['Flipkart'].excRev += fkBlock.estTotalRev
      chMap['Flipkart'].orders += fkBlock.estTotalOrders
      chMap['Flipkart'].qty += fkBlock.estTotalUnits
      // Override netRev using the exact same aggregate the Flipkart tab itself computes from
      // (fkBlock.patchedTotals — FBF+NON-FBF combined, real+estimated-days patched), NOT the
      // separate fkNetCalc query, which runs on a different base (FulfilmentStatus-based Cancelled,
      // combined Return+RTO via ABS()) and doesn't reconcile with the tab's own numbers.
      const fkAgg = fkBlock.patchedTotals.reduce((a, t) => ({
        rev: a.rev + t.rev, excRev: a.excRev + t.excRev,
        cancelRev: a.cancelRev + (t.cancelRev || 0), returnRev: a.returnRev + (t.totalReturnRev || 0),
      }), { rev: 0, excRev: 0, cancelRev: 0, returnRev: 0 })
      const fkM = computeNetRevenueMeasures({ gross_inc_gst: fkAgg.rev, gross_exc_gst: fkAgg.excRev, cancel_rev: fkAgg.cancelRev, return_rev: fkAgg.returnRev, rto_rev: 0, cir_rev: 0 })
      if (fkM.grossIncGst > 0) {
        // patchedTotals already includes the estimated-days patch (rev/excRev), so no separate
        // fkBlock.estTotalRev add-on is needed here — that would double-count it.
        chMap['Flipkart'].netRev = fkM.netRevenueExcGst
      }
    }
    // Now that every chMap[channel].netRev override (Shopify, Flipkart) has been applied, finalize
    // netRevenueCalc as their sum — same number the "All" tab's Net Revenue KPI derives client-side
    // from chMap (AllTab, App.jsx), so the two can never drift apart.
    netRevenueCalc = Object.values(chMap).reduce((s, v) => s + (v.netRev || 0), 0)
    // Patch dailyArr for all-channels chart
    fkBlock.daily.filter(x => x.estimated).forEach(x => {
      const entry = dailyArr.find(d => d.date === x.date)
      if (entry) { entry['Flipkart'] = (entry['Flipkart'] || 0) + x.rev; entry['Flipkart_o'] = (entry['Flipkart_o'] || 0) + x.orders; entry['Flipkart_u'] = (entry['Flipkart_u'] || 0) + x.units }
      else dailyArr.push({ date: x.date, Flipkart: x.rev, Flipkart_o: x.orders, Flipkart_u: x.units })
    })
    dailyArr.sort((a, b) => a.date?.localeCompare(b.date))

    // Patch dailyArr _net using each channel's overall netRev/rev ratio from chMap — runs after
    // every chMap override (Shopify/Amazon/Flipkart/Offline) and the Flipkart estimated-days gross
    // patch above, so daily chart values use the same final netRev the KPIs/tables show, not a
    // stale pre-override ratio. Also gives QC channels (Blinkit/Zepto/Instamart), which have no
    // per-day exc_rev, a correct net figure.
    dailyArr.forEach(entry => {
      Object.keys(entry).forEach(k => {
        if (k === 'date' || k.endsWith('_net') || k.endsWith('_o') || k.endsWith('_u')) return
        const ch = k
        const gross = entry[ch] || 0
        if (gross > 0 && chMap[ch]) {
          const ratio = chMap[ch].rev > 0 ? chMap[ch].netRev / chMap[ch].rev : 0
          entry[ch + '_net'] = gross * ratio
        }
      })
    })

    // Builds the By Category / By Product breakdown feeding the Ads tab's Spend Detail tables.
    // platformFilter is null for "All", a single sales-Channel/ads-platform name (e.g. 'Amazon'),
    // or 'D2C' to combine Meta+Google ad spend against Shopify sales (mirrors chMap's D2C row).
    // Only the Flipkart Others-estimate patch applies when Flipkart is in scope (All or 'Flipkart').
    const buildSpendDetail = (platformFilter) => {
      const adsPlatforms = platformFilter === 'D2C' ? ['Meta', 'Google'] : platformFilter ? [platformFilter] : null
      const salesChannels = platformFilter === 'D2C' ? ['Shopify'] : platformFilter ? [platformFilter] : null
      const includesFlipkart = !platformFilter || platformFilter === 'Flipkart'

      // Fold "Sparepart" categories into "Others" — they're a small, miscellaneous bucket
      // that doesn't warrant its own row alongside the real product categories.
      const normCat = cat => (cat || 'Others').trim().toLowerCase().startsWith('sparepart') ? 'Others' : (cat || 'Others').trim()
      const allSalesRows = [...(r.salesCategoryOrders || []), ...(includesFlipkart ? (r.salesCategoryOrdersFk || []) : [])]
      const rows = allSalesRows
        .filter(x => !salesChannels || salesChannels.includes(x.platform))
        .map(x => ({ ...x, category: normCat(x.category) }))
      const adsCB = (r.adsCategoryBreakdown || []).filter(x => !adsPlatforms || adsPlatforms.includes(x.platform))
      const adCatMapAll = {}
      adsCB.forEach(x => {
        const cat = normCat(x.category)
        if (!adCatMapAll[cat]) adCatMapAll[cat] = 0
        adCatMapAll[cat] += parseFloat(x.spend) || 0
      })
      const adSubCatMapAll = {}
      adsCB.filter(x => x.product_name).forEach(x => {
        const subCat = x.product_name.trim()
        if (!adSubCatMapAll[subCat]) adSubCatMapAll[subCat] = 0
        adSubCatMapAll[subCat] += parseFloat(x.spend) || 0
      })
      // Ad spend with no product_name at all (platform/account-level spend not tied to
      // any product) — this can't be joined to a sub-category, so it's tracked separately
      // and folded into "Others" below so total spend always reconciles to adCatMapAll.
      let unmatchedProductSpend = 0
      adsCB.filter(x => !x.product_name).forEach(x => { unmatchedProductSpend += parseFloat(x.spend) || 0 })

      // Shared measures layer — same formula as Shopify/EBO/All tab.
      const netRevOf = row => computeNetRevenueMeasures({
        gross_inc_gst: row.grossRevenue, gross_exc_gst: row.revenue,
        cancel_rev: row.cancelRev, return_rev: row.returnRev, cir_rev: row.cirRev, rto_rev: 0,
      }).netRevenueExcGst

      // Category-level
      const catMap = {}
      rows.forEach(x => {
        const cat = (x.category || 'Others').trim()
        if (!catMap[cat]) catMap[cat] = { orders: 0, revenue: 0, grossRevenue: 0, cancelRev: 0, returnRev: 0, cirRev: 0 }
        catMap[cat].orders += parseFloat(x.orders) || 0
        catMap[cat].revenue += parseFloat(x.revenue) || 0
        catMap[cat].grossRevenue += parseFloat(x.gross_revenue) || 0
        catMap[cat].cancelRev += parseFloat(x.cancel_rev) || 0
        catMap[cat].returnRev += parseFloat(x.return_rev) || 0
        catMap[cat].cirRev += parseFloat(x.cir_rev) || 0
      })
      const categoryRowsAll = Object.entries(catMap).map(([cat, v]) => ({
        category: cat, spend: adCatMapAll[cat] || 0, revenue: Math.round(v.revenue), netRevenue: Math.round(netRevOf(v)),
        orders: Math.round(v.orders), returns: Math.round(v.returnRev), cancellations: Math.round(v.cancelRev),
        // ROAS = Revenue (Ex GST) ÷ Spend — same definition as the Platform Overview table, not the
        // returns/cancel/CIR-adjusted netRevenue.
        roas: adCatMapAll[cat] > 0 ? v.revenue / adCatMapAll[cat] : 0,
      }))
      // Any ad-spend category with no matching sales category at all — fold its spend into
      // "Others" so the category table's total spend always reconciles to adCatMapAll's total.
      const unmatchedCatSpend = Object.entries(adCatMapAll)
        .filter(([cat]) => !catMap[cat])
        .reduce((s, [, v]) => s + v, 0)
      if (unmatchedCatSpend > 0) {
        const others = categoryRowsAll.find(x => x.category === 'Others')
        if (others) others.spend += unmatchedCatSpend
        else categoryRowsAll.push({ category: 'Others', spend: unmatchedCatSpend, revenue: 0, netRevenue: 0, orders: 0, returns: 0, cancellations: 0, roas: 0 })
      }
      // Flipkart's feed lags real time — chMap['Flipkart'] (and so the KPI card's Net Revenue)
      // is patched with a trailing-7-day-average estimate for the missing days, but that estimate
      // has no category/product breakdown to attribute it to. Add it to "Others" so this table's
      // total always reconciles to the KPI card's Net Revenue — only when Flipkart is in scope.
      if (includesFlipkart && fkBlock.estTotalRev > 0) {
        const others = categoryRowsAll.find(x => x.category === 'Others')
        if (others) { others.revenue += Math.round(fkBlock.estTotalRev); others.netRevenue += Math.round(fkBlock.estTotalRev) }
        else categoryRowsAll.push({ category: 'Others', spend: 0, revenue: Math.round(fkBlock.estTotalRev), netRevenue: Math.round(fkBlock.estTotalRev), orders: 0, returns: 0, cancellations: 0, roas: 0 })
      }

      // Sub-category level
      const subCatMap = {}
      const subCatBySubOnly = {} // product_name -> sales stats, ignoring category (fallback join key)
      rows.forEach(x => {
        // Sales rows with no sub_category (mostly the "Others" category bucket) still
        // carry real revenue — fold them into "Unspecified" instead of dropping them,
        // otherwise this revenue silently disappears from the By Product table.
        const subCat = (x.sub_category || '').trim() || 'Unspecified'
        const cat = (x.category || 'Others').trim()
        const key = `${cat}||${subCat}`
        if (!subCatMap[key]) subCatMap[key] = { category: cat, subCategory: subCat, orders: 0, revenue: 0, grossRevenue: 0, cancelRev: 0, returnRev: 0, cirRev: 0 }
        subCatMap[key].orders += parseFloat(x.orders) || 0
        subCatMap[key].revenue += parseFloat(x.revenue) || 0
        subCatMap[key].grossRevenue += parseFloat(x.gross_revenue) || 0
        subCatMap[key].cancelRev += parseFloat(x.cancel_rev) || 0
        subCatMap[key].returnRev += parseFloat(x.return_rev) || 0
        subCatMap[key].cirRev += parseFloat(x.cir_rev) || 0

        if (!subCatBySubOnly[subCat]) subCatBySubOnly[subCat] = { orders: 0, revenue: 0, grossRevenue: 0, cancelRev: 0, returnRev: 0, cirRev: 0 }
        subCatBySubOnly[subCat].orders += parseFloat(x.orders) || 0
        subCatBySubOnly[subCat].revenue += parseFloat(x.revenue) || 0
        subCatBySubOnly[subCat].grossRevenue += parseFloat(x.gross_revenue) || 0
        subCatBySubOnly[subCat].cancelRev += parseFloat(x.cancel_rev) || 0
        subCatBySubOnly[subCat].returnRev += parseFloat(x.return_rev) || 0
        subCatBySubOnly[subCat].cirRev += parseFloat(x.cir_rev) || 0
      })

      // Build product rows FROM ad spend (not from sales rows) so every rupee of spend is
      // represented — a sales-driven join silently drops any product_name with no matching
      // sub_category, which is what caused By Product spend to undercount vs the real total.
      const usedSalesKeys = new Set()
      const spendMatchedRows = Object.keys(adSubCatMapAll).map(subCat => {
        const spend = adSubCatMapAll[subCat] || 0
        const matchKey = Object.keys(subCatMap).find(k => k.endsWith(`||${subCat}`))
        if (matchKey) {
          usedSalesKeys.add(matchKey)
          const v = subCatMap[matchKey]
          return {
            category: v.category, subCategory: v.subCategory, spend,
            revenue: Math.round(v.revenue), netRevenue: Math.round(netRevOf(v)), orders: Math.round(v.orders),
            returns: Math.round(v.returnRev), cancellations: Math.round(v.cancelRev),
            // ROAS = Revenue (Ex GST) ÷ Spend — matches the Platform Overview definition.
            roas: spend > 0 ? v.revenue / spend : 0,
          }
        }
        const v = subCatBySubOnly[subCat]
        if (v) {
          return {
            category: normCat(rows.find(x => (x.sub_category || '').trim() === subCat)?.category), subCategory: subCat, spend,
            revenue: Math.round(v.revenue), netRevenue: Math.round(netRevOf(v)), orders: Math.round(v.orders),
            returns: Math.round(v.returnRev), cancellations: Math.round(v.cancelRev),
            roas: spend > 0 ? v.revenue / spend : 0,
          }
        }
        // No sales sub-category matches this ad product_name at all — fold into Others
        // so its spend still reconciles rather than silently disappearing.
        return { category: 'Others', subCategory: subCat, spend, revenue: 0, netRevenue: 0, orders: 0, returns: 0, cancellations: 0, roas: 0 }
      })

      // Sales sub-categories with zero matched ad spend still get a row (spend: 0) for completeness.
      const unspentRows = Object.entries(subCatMap).filter(([k]) => !usedSalesKeys.has(k)).map(([, v]) => ({
        category: v.category, subCategory: v.subCategory, spend: 0,
        revenue: Math.round(v.revenue), netRevenue: Math.round(netRevOf(v)), orders: Math.round(v.orders),
        returns: Math.round(v.returnRev), cancellations: Math.round(v.cancelRev), roas: 0,
      }))

      // Any ad spend with no product_name (platform/account-level) — bucket into Others too.
      const otherSpendRows = unmatchedProductSpend > 0
        ? [{ category: 'Others', subCategory: 'Unattributed', spend: unmatchedProductSpend, revenue: 0, netRevenue: 0, orders: 0, returns: 0, cancellations: 0, roas: 0 }]
        : []

      // Flipkart trailing-average estimate for lagging days (see categoryRowsAll above) —
      // no product breakdown available, so it goes under Others / Flipkart Estimate.
      const fkEstRows = includesFlipkart && fkBlock.estTotalRev > 0
        ? [{ category: 'Others', subCategory: 'Flipkart Estimate', spend: 0, revenue: Math.round(fkBlock.estTotalRev), netRevenue: Math.round(fkBlock.estTotalRev), orders: 0, returns: 0, cancellations: 0, roas: 0 }]
        : []

      const subCategoryRowsAll = [...spendMatchedRows, ...unspentRows, ...otherSpendRows, ...fkEstRows]

      // Force exact reconciliation to the KPI card's own revenue number (same chMap source the
      // frontend's Net Revenue / Platform Overview use). The two sides are built from genuinely
      // different queries (item-master category validation, Country='India' filtering, Flipkart's
      // lag-shifted window, etc.) that can never be made to agree to the rupee by construction —
      // rather than let those small structural gaps grow with the date range, plug the residual
      // straight into "Others" so By Category / By Product always foot to the KPI exactly.
      const trueRevenue = platformFilter === 'D2C'
        ? (chMap['Shopify']?.excRev || 0)
        : platformFilter
          ? (chMap[platformFilter]?.excRev || 0)
          : ['Shopify', 'Amazon', 'Blinkit', 'Zepto', 'Instamart', 'Myntra', 'Flipkart'].reduce((s, c) => s + (chMap[c]?.excRev || 0), 0)
      const reconcile = (rows) => {
        const currentTotal = rows.reduce((s, x) => s + x.revenue, 0)
        const residual = Math.round(trueRevenue - currentTotal)
        if (Math.abs(residual) < 1) return rows
        const others = rows.find(x => x.category === 'Others' && (rows === categoryRowsAll || x.subCategory === 'Unspecified'))
        if (others) { others.revenue += residual; others.netRevenue += residual }
        else rows.push(rows === categoryRowsAll
          ? { category: 'Others', spend: 0, revenue: residual, netRevenue: residual, orders: 0, returns: 0, cancellations: 0, roas: 0 }
          : { category: 'Others', subCategory: 'Unspecified', spend: 0, revenue: residual, netRevenue: residual, orders: 0, returns: 0, cancellations: 0, roas: 0 })
        return rows
      }
      reconcile(categoryRowsAll)
      reconcile(subCategoryRowsAll)

      return { categoryRows: categoryRowsAll, subCategoryRows: subCategoryRowsAll }
    }

    const payload = {
      source: 'postgres-aggregated',
      prevRev: parseFloat(r.prevTotals?.[0]?.total_rev) || 0,
      prevExcRev: parseFloat(r.prevTotals?.[0]?.total_exc_rev) || 0,
      prevOrders: parseInt(r.prevTotals?.[0]?.n_orders) || 0,
      prevQty: parseInt(r.prevTotals?.[0]?.total_qty) || 0,
      prevRtoOrders: parseInt(r.prevTotals?.[0]?.rto_orders) || 0,
      prevCirOrders: parseInt(r.prevTotals?.[0]?.cir_orders) || 0,
      prevScopedAOV: (() => { const o = parseInt(r.prevAspAovTotals?.[0]?.orders) || 0; const rv = parseFloat(r.prevAspAovTotals?.[0]?.rev) || 0; return o ? rv / o : 0 })(),
      prevScopedASP: (() => { const q = parseFloat(r.prevAspAovTotals?.[0]?.asp_qty) || 0; const rv = parseFloat(r.prevAspAovTotals?.[0]?.rev) || 0; return q ? rv / q : 0 })(),
      prevDailyArr: (r.prevByDate || []).map(x => ({ date: x.date, rev: parseFloat(x.rev) || 0 })),
      // Shared measures layer — same formula as chMap above, applied to the previous period, so
      // the WoW/MoM channel-share comparison is apples-to-apples with the current period's chMap.
      prevChMap: (() => {
        const m = {}
        ;(r.prevByChannel || []).forEach(x => {
          const cm = computeNetRevenueMeasures({
            gross_inc_gst: x.rev, gross_exc_gst: x.exc_rev,
            cir_rev: x.cir_rev, rto_rev: x.rto_rev, return_rev: x.return_rev, cancel_rev: x.cancel_rev,
          })
          const key = x.Channel === 'Retail' ? 'EBO' : x.Channel
          if (!m[key]) m[key] = { rev: 0, excRev: 0, netRev: 0 }
          m[key].rev += cm.grossIncGst; m[key].excRev += cm.grossExcGst; m[key].netRev += cm.netRevenueExcGst
        })
        const prevShM = computeNetRevenueMeasures(r.prevShNetCalc?.[0] || {})
        const prevIntlExcRev = parseFloat(r.prevShopifyIntlTotals?.[0]?.intl_exc_rev) || 0
        const prevIntlRev = parseFloat(r.prevShopifyIntlTotals?.[0]?.intl_rev) || 0
        if (prevShM.grossIncGst > 0) {
          if (m['Shopify']) { m['Shopify'].rev = prevShM.grossIncGst + prevIntlRev; m['Shopify'].excRev = prevShM.grossExcGst + prevIntlExcRev; m['Shopify'].netRev = prevShM.netRevenueExcGst + prevIntlExcRev }
          else m['Shopify'] = { rev: prevShM.grossIncGst + prevIntlRev, excRev: prevShM.grossExcGst + prevIntlExcRev, netRev: prevShM.netRevenueExcGst + prevIntlExcRev }
        }
        return m
      })(),
      totalRev: adjTotalRev, totalExcRev: adjTotalExcRev, totalQty: adjTotalQty, aspQty: adjAspQty, nOrders: adjNOrders, nDays,
      blendedAOV: adjNOrders ? adjTotalRev / adjNOrders : 0,
      // Scoped AOV/ASP for the All tab — Shopify, Amazon SC, Myntra, Flipkart, Firstcry, CRED only.
      scopedAOV: blendedAOVScoped, scopedASP: aspScoped,
      gstCollected: adjTotalRev - adjTotalExcRev,
      rtoRev, returnRev, cancellRev, cirRev, rtoRevDirect, netRevenueCalc, returnTrackableRev,
      cirOrders: parseInt(r.byCIR?.[0]?.cir_orders) || 0,
      exchangeOrders: parseInt(r.byExchange?.[0]?.exchange_orders) || 0,
      exchangeRev: parseFloat(r.byExchange?.[0]?.exchange_rev) || 0,
      momRev, yoyRev, momOrders, yoyOrders,
      momPeriod: `${moms} → ${mome}`, yoyPeriod: `${yoys} → ${yoye}`,
      nCusts, repeatCusts,
      uniqueDates: dateSet,
      dailyArr, chMap, catMap, subCatMap, catPrevMap, subCatPrevMap, stateMap, statePrevMap, stateTotal, cityRows, cityPrevMap, cityTotal, regionRows, tierRows, catChannelMap, subCatChannelMap, orderStatusMap, orderStatusRevMap,
      buckets, bucketRev, voucherMap, subChannelMap, allSubChannels, paymentModeMap, tatOrders: [],
      htCount, htRev: htRevAgg, multiItemOrders,
      financialStatusMap, fulfilmentStatusMap, refundTrend, dailyReturnTrend,
      voucherList: (r.byVoucherRaw || []).map(x => ({ code: x.voucher_code, orders: parseInt(x.orders) || 0 })),
      orders, skuRows, rows: [],
      pnlSalesRows: [...(r.salesCategoryOrders || []), ...(r.salesCategoryOrdersFk || [])],
      // D2C ad spend (Meta + Google) by item-master sub_category — mirrors the Ads tab's adProdMap
      // which keys by platform||product_name from adsCategoryBreakdown (already revenue-share attributed).
      pnlAdSpendMap: (() => {
        const m = {}
        ;(r.adsCategoryBreakdown || [])
          .filter(x => x.platform === 'Meta' || x.platform === 'Google')
          .forEach(x => {
            const sc = (x.product_name || '').trim()
            if (!sc) return
            m[sc] = (m[sc] || 0) + (parseFloat(x.spend) || 0)
          })
        // Add unattributed spend to Others so table total matches raw Meta+Google
        const rawRows = r.pnlAdRawTotals || []
        const rawTotal = (parseFloat(rawRows.find(t => t.platform === 'Meta')?.spend) || 0)
                       + (parseFloat(rawRows.find(t => t.platform === 'Google')?.spend) || 0)
        const attributed = Object.values(m).reduce((s, v) => s + v, 0)
        const unattributed = rawTotal - attributed
        if (unattributed > 0) m['Others'] = (m['Others'] || 0) + unattributed
        return m
      })(),
      pnlRawAdSpend: (() => {
        const rows = r.pnlAdRawTotals || []
        const meta = parseFloat(rows.find(t => t.platform === 'Meta')?.spend) || 0
        const google = parseFloat(rows.find(t => t.platform === 'Google')?.spend) || 0
        return meta + google
      })(),
      masterSkuList: (r.masterSkuList || []).map(x => x.sku).filter(Boolean),
      shopify: {
        // Shared measures layer (computeNetRevenueMeasures in _bq.js) — see formula note there.
        // exchRev/exchOrders are Shopify-tab-specific extras, not part of the shared measure set.
        netCalc: (() => {
          const sc = r.shNetCalc?.[0] || {}
          const m = computeNetRevenueMeasures(sc)
          return {
            gross: m.grossIncGst, excRev: m.grossExcGst,
            cancelRev: m.cancelRev, codCancelRev: parseFloat(sc.cod_cancel_rev) || 0, rtoRev: m.rtoRev, returnRev: m.returnRev, cirRev: m.cirRev,
            exchRev: parseFloat(sc.exch_rev) || 0, exchOrders: parseInt(sc.exch_orders) || 0,
            cirPct: m.cirPct, rtoPct: m.rtoPct, returnPct: m.returnPct, cancelPct: m.cancelPct, totalReturnPct: m.totalReturnPct,
            gstCompleted: m.gstAmount, netRevIncGst: m.netRevenueIncGst, netRev: m.netRevenueExcGst,
          }
        })(),
        prevNetCalc: (() => {
          const m = computeNetRevenueMeasures(r.prevShNetCalc?.[0] || {})
          return { gross: m.grossIncGst, netRevIncGst: m.netRevenueIncGst, gstCompleted: m.gstAmount, netRev: m.netRevenueExcGst }
        })(),
        totals: r.shTotals?.[0] ? { rev: parseFloat(r.shTotals[0].rev)||0, excRev: parseFloat(r.shTotals[0].exc_rev)||0, orders: parseInt(r.shTotals[0].orders)||0, qty: parseInt(r.shTotals[0].qty)||0, aspQty: parseInt(r.shTotals[0].asp_qty)||parseInt(r.shTotals[0].qty)||0 } : {},
        daily: (r.shDaily || []).map(x => ({ date: x.date, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0 })),
        prevRev: parseFloat(r.prevShopify?.[0]?.rev) || 0,
        prevExcRev: parseFloat(r.prevShopify?.[0]?.exc_rev) || 0,
        prevOrders: parseInt(r.prevShopify?.[0]?.orders) || 0,
        prevUnits: parseInt(r.prevShopify?.[0]?.units) || 0,
        prevRtoOrders: parseInt(r.prevShopify?.[0]?.rto_orders) || 0,
        prevCirOrders: parseInt(r.prevShopify?.[0]?.cir_orders) || 0,
        prevExchangeOrders: parseInt(r.prevShopify?.[0]?.exchange_orders) || 0,
        prevCancelledOrders: parseInt(r.prevShopifyCancel?.[0]?.cancelled_orders) || 0,
        prevDaily: (r.prevShopifyDaily || []).map(x => ({ date: x.date, rev: parseFloat(x.rev) || 0 })),
        catMap: Object.fromEntries((r.shCategory || []).map(x => [x.Category || 'Others', { rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, orders: { size: parseInt(x.orders)||0 }, units: parseInt(x.units)||0, aspUnits: parseInt(x.asp_units)||parseInt(x.units)||0, cancelled: parseInt(x.cancelled)||0, rto: parseInt(x.rto)||0, cir: parseInt(x.cir)||0, exch: parseInt(x.exch)||0, cancelRev: parseFloat(x.cancel_rev)||0, codCancelRev: parseFloat(x.cod_cancel_rev)||0, rtoRev: parseFloat(x.rto_rev)||0, cirRev: parseFloat(x.cir_rev)||0, exchRev: parseFloat(x.exch_rev)||0 }])),
        catPrevMap: Object.fromEntries((r.shCategoryPrev || []).map(x => [x.Category || 'Others', parseFloat(x.rev)||0])),
        subCatMap: Object.fromEntries((r.shSubCategory || []).map(x => [`${x.Category||'Others'}::${x.SubCategory||'Others'}`, { rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, orders: { size: parseInt(x.orders)||0 }, units: parseInt(x.units)||0, aspUnits: parseInt(x.asp_units)||parseInt(x.units)||0, cancelled: parseInt(x.cancelled)||0, rto: parseInt(x.rto)||0, cir: parseInt(x.cir)||0, exch: parseInt(x.exch)||0, cancelRev: parseFloat(x.cancel_rev)||0, codCancelRev: parseFloat(x.cod_cancel_rev)||0, rtoRev: parseFloat(x.rto_rev)||0, cirRev: parseFloat(x.cir_rev)||0, exchRev: parseFloat(x.exch_rev)||0 }])),
        subCatPrevMap: Object.fromEntries((r.shSubCategoryPrev || []).map(x => [`${x.Category||'Others'}::${x.SubCategory||'Others'}`, parseFloat(x.rev)||0])),
        skuMap: (() => { const m = {}; (r.shSKU || []).forEach(x => { const cat = x.Category||'Others', sc = x.SubCategory||'Others', sku = x.sku, subCh = (x.SubChannel||'').toLowerCase(); if (!m[cat]) m[cat] = {}; if (!m[cat][sc]) m[cat][sc] = {}; if (!m[cat][sc][sku]) m[cat][sc][sku] = { subChannelRows: {} }; const e = m[cat][sc][sku]; e.subChannelRows[subCh] = { rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, returnUnits: parseInt(x.return_units)||0, cancelled: parseInt(x.cancelled)||0, rto: parseInt(x.rto)||0, cir: parseInt(x.cir)||0, exch: parseInt(x.exch)||0, cancelRev: parseFloat(x.cancel_rev)||0, codCancelRev: parseFloat(x.cod_cancel_rev)||0, rtoRev: parseFloat(x.rto_rev)||0, cirRev: parseFloat(x.cir_rev)||0, exchRev: parseFloat(x.exch_rev)||0 } }); return m })(),
        skuPrevMap: (() => { const m = {}; (r.shSKUPrev || []).forEach(x => { const cat = x.Category||'Others', sc = x.SubCategory||'Others', sku = x.sku; if (!m[cat]) m[cat] = {}; if (!m[cat][sc]) m[cat][sc] = {}; m[cat][sc][sku] = parseFloat(x.rev)||0 }); return m })(),
        // Per-SKU cost rows — each row is (sku, order_status, weight_slab, total_qty, gross_inc_gst).
        // PnLPage.jsx applies snd-rates.json lookup + status logic to compute logistics/fulfilment.
        skuCostRows: (r.shSkuCosts || []).map(x => ({
          sku: x.sku,
          subChannel: (x.sub_channel || '').toLowerCase(),
          orderStatus: x.order_status || 'Delivered',
          weightSlab: x.weight_slab != null ? parseInt(x.weight_slab) : null,
          lineCount: parseInt(x.line_count) || 0,
          totalQty: parseInt(x.total_qty) || 0,
          grossIncGst: parseFloat(x.gross_inc_gst) || 0,
        })),
        stateMap: Object.fromEntries((r.shState || []).filter(x => x.state).map(x => [x.state, { rev: parseFloat(x.rev)||0, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, cities: { size: parseInt(x.cities)||0 }, rtoOrders: parseInt(x.rto_orders)||0, returnRev: parseFloat(x.return_rev)||0 }])),
        statePrevMap: Object.fromEntries((r.shStatePrev || []).filter(x => x.state).map(x => [x.state, { rev: parseFloat(x.rev)||0, orders: parseInt(x.orders)||0 }])),
        cityRows: (r.shCity || []).map(x => ({ city: x.city, state: x.state || '', region: x.region || '', orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, rtoOrders: parseInt(x.rto_orders)||0, returnRev: parseFloat(x.return_rev)||0 })).filter(x => x.city),
        cityPrevMap: Object.fromEntries((r.shCityPrev || []).filter(x => x.city).map(x => [`${x.city}|${x.state||''}`, { rev: parseFloat(x.rev)||0, orders: parseInt(x.orders)||0 }])),
        cityTotal: r.shCityTotal?.[0] ? { rev: parseFloat(r.shCityTotal[0].total_rev)||0, orders: parseInt(r.shCityTotal[0].total_orders)||0 } : { rev: 0, orders: 0 },
        stateTotal: r.shStateTotal?.[0] ? { rev: parseFloat(r.shStateTotal[0].total_rev)||0, orders: parseInt(r.shStateTotal[0].total_orders)||0 } : { rev: 0, orders: 0 },
        paymentTypes: (r.shPaymentTypes || []).map(x => ({ paymentType: x.payment_type, orders: parseInt(x.orders)||0 })).filter(x => x.paymentType),
        regionRows: (r.shRegion || []).map(x => ({ region: x.region, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: parseInt(x.units)||0 })),
        tierRows: (r.shTier || []).map(x => ({ tier: parseInt(x.city_tier)||x.city_tier, label: x.tier_label, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: parseInt(x.units)||0 })),
        topStates: (r.shState || []).slice(0, 6).filter(x => x.state).map(x => ({ name: x.state, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: 0 })),
        returnReasons: (r.shReturnReasons || []).map(x => ({ reason: x.reason, subReason: x.sub_reason, category: x.category, subCategory: x.sub_category, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
      },
      ebo: (() => {
        // Shared measures layer — same formula as Shopify/All tab.
        const nc = r.eboNetCalc?.[0] || {}
        const m = computeNetRevenueMeasures({
          gross_inc_gst: nc.gross, gross_exc_gst: nc.exc_rev,
          cir_rev: nc.cir_rev, rto_rev: nc.rto_rev, return_rev: nc.return_rev, cancel_rev: nc.cancel_rev,
        })
        const exchRev = parseFloat(nc.exch_rev) || 0
        const exchOrders = parseInt(nc.exch_orders) || 0
        const netCalc = {
          gross: m.grossIncGst, excRev: m.grossExcGst,
          cancelRev: m.cancelRev, rtoRev: m.rtoRev, returnRev: m.returnRev, cirRev: m.cirRev,
          cirPct: m.cirPct, rtoPct: m.rtoPct, returnPct: m.returnPct, cancelPct: m.cancelPct, totalReturnPct: m.totalReturnPct,
          exchRev, exchOrders, netRev: m.netRevenueExcGst, gstCollected: m.gstAmount,
        }
        const pncM = computeNetRevenueMeasures(r.prevEboNetCalc?.[0] || {})
        const prevNetCalc = { gross: pncM.grossIncGst, excRev: pncM.grossExcGst, cancelRev: pncM.cancelRev, rtoRev: pncM.rtoRev, returnRev: pncM.returnRev, cirRev: pncM.cirRev, netRev: pncM.netRevenueExcGst }
        return {
          netCalc,
          prevNetCalc,
          totals: r.eboTotals?.[0] ? { rev: parseFloat(r.eboTotals[0].rev)||0, excRev: parseFloat(r.eboTotals[0].exc_rev)||0, orders: parseInt(r.eboTotals[0].orders)||0, qty: parseInt(r.eboTotals[0].qty)||0 } : {},
          daily: (r.eboDaily || []).map(x => ({ date: x.date, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0 })),
          prevDaily: (r.prevEboDaily || []).map(x => ({ date: x.date, rev: parseFloat(x.rev)||0 })),
          prevRev: parseFloat(r.prevEbo?.[0]?.rev) || 0,
          prevExcRev: parseFloat(r.prevEbo?.[0]?.exc_rev) || 0,
          prevOrders: parseInt(r.prevEbo?.[0]?.orders) || 0,
          prevUnits: parseInt(r.prevEbo?.[0]?.units) || 0,
          prevRtoOrders: parseInt(r.prevEbo?.[0]?.rto_orders) || 0,
          prevCirOrders: parseInt(r.prevEbo?.[0]?.cir_orders) || 0,
          prevExchangeOrders: parseInt(r.prevEbo?.[0]?.exchange_orders) || 0,
          catMap: Object.fromEntries((r.eboCategory || []).map(x => [x.Category || 'Others', { rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, orders: { size: parseInt(x.orders)||0 }, units: parseInt(x.units)||0, aspUnits: parseInt(x.asp_units)||parseInt(x.units)||0, cancelled: parseInt(x.cancelled)||0, rto: parseInt(x.rto)||0, cir: parseInt(x.cir)||0, exch: parseInt(x.exch)||0, cancelRev: parseFloat(x.cancel_rev)||0, rtoRev: parseFloat(x.rto_rev)||0, cirRev: parseFloat(x.cir_rev)||0, exchRev: parseFloat(x.exch_rev)||0 }])),
          catPrevMap: Object.fromEntries((r.eboCategoryPrev || []).map(x => [x.Category || 'Others', parseFloat(x.rev)||0])),
          subCatMap: Object.fromEntries((r.eboSubCategory || []).map(x => [`${x.Category||'Others'}::${x.SubCategory||'Others'}`, { rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, orders: { size: parseInt(x.orders)||0 }, units: parseInt(x.units)||0, aspUnits: parseInt(x.asp_units)||parseInt(x.units)||0, cancelled: parseInt(x.cancelled)||0, rto: parseInt(x.rto)||0, cir: parseInt(x.cir)||0, exch: parseInt(x.exch)||0, cancelRev: parseFloat(x.cancel_rev)||0, rtoRev: parseFloat(x.rto_rev)||0, cirRev: parseFloat(x.cir_rev)||0, exchRev: parseFloat(x.exch_rev)||0 }])),
          subCatPrevMap: Object.fromEntries((r.eboSubCategoryPrev || []).map(x => [`${x.Category||'Others'}::${x.SubCategory||'Others'}`, parseFloat(x.rev)||0])),
          skuMap: (() => { const m = {}; (r.eboSKU || []).forEach(x => { const cat = x.Category||'Others', sc = x.SubCategory||'Others', sku = x.sku; if (!m[cat]) m[cat] = {}; if (!m[cat][sc]) m[cat][sc] = {}; m[cat][sc][sku] = { rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, cancelled: parseInt(x.cancelled)||0, rto: parseInt(x.rto)||0, cir: parseInt(x.cir)||0, exch: parseInt(x.exch)||0, cancelRev: parseFloat(x.cancel_rev)||0, rtoRev: parseFloat(x.rto_rev)||0, cirRev: parseFloat(x.cir_rev)||0, exchRev: parseFloat(x.exch_rev)||0 } }); return m })(),
          stateMap: Object.fromEntries((r.eboState || []).filter(x => x.state).map(x => [x.state, { rev: parseFloat(x.rev)||0, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, cities: { size: parseInt(x.cities)||0 }, rtoOrders: parseInt(x.rto_orders)||0, returnRev: parseFloat(x.return_rev)||0 }])),
          statePrevMap: Object.fromEntries((r.eboStatePrev || []).filter(x => x.state).map(x => [x.state, { rev: parseFloat(x.rev)||0, orders: parseInt(x.orders)||0 }])),
          stateTotal: r.eboStateTotal?.[0] ? { rev: parseFloat(r.eboStateTotal[0].total_rev)||0, orders: parseInt(r.eboStateTotal[0].total_orders)||0 } : { rev: 0, orders: 0 },
          cityRows: (r.eboCity || []).map(x => ({ city: x.city, state: x.state || '', region: x.region || '', orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, rtoOrders: parseInt(x.rto_orders)||0, returnRev: parseFloat(x.return_rev)||0 })).filter(x => x.city),
          cityPrevMap: Object.fromEntries((r.eboCityPrev || []).filter(x => x.city).map(x => [`${x.city}|${x.state||''}`, { rev: parseFloat(x.rev)||0, orders: parseInt(x.orders)||0 }])),
          cityTotal: r.eboCityTotal?.[0] ? { rev: parseFloat(r.eboCityTotal[0].total_rev)||0, orders: parseInt(r.eboCityTotal[0].total_orders)||0 } : { rev: 0, orders: 0 },
          regionRows: (r.eboRegion || []).map(x => ({ region: x.region, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: parseInt(x.units)||0 })),
          tierRows: (r.eboTier || []).map(x => ({ tier: parseInt(x.city_tier)||x.city_tier, label: x.tier_label, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: parseInt(x.units)||0 })),
          returnReasons: (r.eboReturnReasons || []).map(x => ({ reason: x.reason, subReason: x.sub_reason, category: x.category, subCategory: x.sub_category, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
          cir: r.eboCIR?.[0] ? { cirRev: parseFloat(r.eboCIR[0].cir_rev)||0, cirExcRev: parseFloat(r.eboCIR[0].cir_exc_rev)||0, cirOrders: parseInt(r.eboCIR[0].cir_orders)||0 } : { cirRev: 0, cirExcRev: 0, cirOrders: 0 },
          returnData: r.eboReturn?.[0] ? { returnRev: parseFloat(r.eboReturn[0].return_rev)||0, returnExcRev: parseFloat(r.eboReturn[0].return_exc_rev)||0, returnOrders: parseInt(r.eboReturn[0].return_orders)||0 } : { returnRev: 0, returnExcRev: 0, returnOrders: 0 },
          exchange: r.eboExchange?.[0] ? { exchangeOrders: parseInt(r.eboExchange[0].exchange_orders)||0, exchangeRev: parseFloat(r.eboExchange[0].exchange_rev)||0 } : { exchangeOrders: 0, exchangeRev: 0 },
          rto: r.eboRTO?.[0] ? { rtoRev: parseFloat(r.eboRTO[0].rto_rev)||0, rtoExcRev: parseFloat(r.eboRTO[0].rto_exc_rev)||0, rtoOrders: parseInt(r.eboRTO[0].rto_orders)||0 } : { rtoRev: 0, rtoExcRev: 0, rtoOrders: 0 },
          dailyReturnTrend: (r.eboDailyReturnTrend || []).map(x => ({ date: x.date, total: parseInt(x.total_orders)||0, rtoPct: x.total_orders ? ((parseInt(x.rto_orders)+parseInt(x.return_orders||0))/parseInt(x.total_orders)*100) : 0, exchPct: x.total_orders ? (parseInt(x.exch_orders)/parseInt(x.total_orders)*100) : 0, cirPct: x.total_orders ? (parseInt(x.cir_orders)/parseInt(x.total_orders)*100) : 0, cancelPct: x.total_orders ? (parseInt(x.cancel_orders)/parseInt(x.total_orders)*100) : 0 })),
        }
      })(),
      amzSC: {
        totalOrders: parseInt(r.amzSCTotals?.[0]?.orders) || 0,
        totalUnits: parseInt(r.amzSCTotals?.[0]?.units) || 0,
        // Shared measures layer — same formula as Shopify/EBO/All tab.
        netCalc: (() => {
          const m = computeNetRevenueMeasures(r.amzSCNetCalc?.[0] || {})
          return { gross: m.grossIncGst, cancelRev: m.cancelRev, returnRev: m.returnRev, afterReturns: m.netRevenueIncGst, netRev: m.netRevenueExcGst, gstRatio: m.grossIncGst > 0 ? (m.grossIncGst - m.grossExcGst) / m.grossIncGst : 0 }
        })(),
        prevRev: parseFloat(r.prevAmzSC?.[0]?.rev) || 0,
        prevExcRev: parseFloat(r.prevAmzSC?.[0]?.exc_rev) || 0,
        prevOrders: parseInt(r.prevAmzSC?.[0]?.orders) || 0,
        prevUnits: parseInt(r.prevAmzSC?.[0]?.units) || 0,
        prevFbaRev: parseFloat(r.prevAmzSC?.[0]?.fba_rev) || 0,
        prevCancelledOrders: parseInt(r.prevAmzSC?.[0]?.cancelled_orders) || 0,
        prevShippedOrders: parseInt(r.prevAmzSC?.[0]?.shipped_orders) || 0,
        prevDaily: (r.prevAmzDaily || []).map(x => ({ date: x.date, rev: parseFloat(x.rev) || 0 })),
        fulfillment: (r.amzSCFulfillment || []).map(x => ({ type: x.fulfillment_channel === 'Amazon' ? 'FBA' : 'MFN', orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, units: parseInt(x.units)||0 })),
        status: (r.amzSCStatus || []).map(x => ({ status: x.order_status, orders: parseInt(x.orders)||0 })),
        orderStatusDebug: (r.amzSCOrderStatusDebug || []).map(x => ({ status: x.Order_Status, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        states: (r.amzSCStates || []).map(x => ({ state: x.ship_state, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, rtoOrders: parseInt(x.rto_orders)||0, returnRev: parseFloat(x.return_rev)||0 })),
        statePrevMap: Object.fromEntries((r.amzSCStatesPrev||[]).map(x => [x.ship_state, parseFloat(x.rev)||0])),
        cityPrevMap: Object.fromEntries((r.amzSCCitiesPrev||[]).map(x => [x.city, parseFloat(x.rev)||0])),
        stateTotal: parseFloat(r.amzSCStateTotal?.[0]?.total_rev) || 0,
        cityTotal: parseFloat(r.amzSCCityTotal?.[0]?.total_rev) || 0,
        skus: (r.amzSCSKUs || []).map(x => ({ sku: x.sku, asin: x.asin, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0 })),
        daily: (r.amzSCDaily || []).map(x => ({ date: x.date, type: x.fulfillment_channel === 'Amazon' ? 'FBA' : 'MFN', orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0 })),
        returnRate: (() => {
          const row = (r.amzSCReturnRate || [])[0]
          const totalRev = parseFloat(row?.total_rev_inc) || 0
          const returnedRev = parseFloat(row?.returned_rev) || 0
          const pct = totalRev > 0 ? Math.round(returnedRev / totalRev * 1000) / 10 : 0
          return { pct, daily: [], rollOrders: totalRev, rollReturned: returnedRev }
        })(),
        regionRows: (r.amzSCRegion || []).map(x => ({ region: x.region, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: parseInt(x.units)||0 })),
        tierRows: (r.amzSCTier || []).map(x => ({ tier: parseInt(x.city_tier)||x.city_tier, label: x.tier_label, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: parseInt(x.units)||0 })),
        topStates: (r.amzSCStates || []).slice(0, 6).map(x => ({ name: x.ship_state, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: 0 })),
        cities: (r.amzSCCities || []).map(x => ({ city: x.city, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, rtoOrders: parseInt(x.rto_orders)||0, returnRev: parseFloat(x.return_rev)||0 })),
        catChannel: (() => {
          const map = {}
          ;(r.amzSCCatChannel || []).forEach(x => {
            if (!map[x.Category]) map[x.Category] = {}
            map[x.Category][x.ch] = { rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, units: parseInt(x.units)||0, orders: parseInt(x.orders)||0, cancelRev: parseFloat(x.cancel_rev)||0, rtoRev: parseFloat(x.rto_rev)||0, cirRev: parseFloat(x.cir_rev)||0, exchRev: parseFloat(x.exch_rev)||0, returnRev: parseFloat(x.return_rev)||0 }
          })
          return map
        })(),
        subCatChannel: (() => {
          const map = {}
          ;(r.amzSCSubCatChannel || []).forEach(x => {
            if (!map[x.Category]) map[x.Category] = {}
            if (!map[x.Category][x.SubCategory]) map[x.Category][x.SubCategory] = {}
            map[x.Category][x.SubCategory][x.ch] = { rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, units: parseInt(x.units)||0, orders: parseInt(x.orders)||0, cancelRev: parseFloat(x.cancel_rev)||0, rtoRev: parseFloat(x.rto_rev)||0, cirRev: parseFloat(x.cir_rev)||0, exchRev: parseFloat(x.exch_rev)||0, returnRev: parseFloat(x.return_rev)||0 }
          })
          return map
        })(),
        skuChannel: (() => {
          const map = {}
          ;(r.amzSCSKUChannel || []).forEach(x => {
            if (!map[x.Category]) map[x.Category] = {}
            if (!map[x.Category][x.SubCategory]) map[x.Category][x.SubCategory] = {}
            if (!map[x.Category][x.SubCategory][x.sku]) map[x.Category][x.SubCategory][x.sku] = {}
            map[x.Category][x.SubCategory][x.sku][x.ch] = { rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, units: parseInt(x.units)||0, orders: parseInt(x.orders)||0, cancelRev: parseFloat(x.cancel_rev)||0, rtoRev: parseFloat(x.rto_rev)||0, cirRev: parseFloat(x.cir_rev)||0, exchRev: parseFloat(x.exch_rev)||0, returnRev: parseFloat(x.return_rev)||0 }
          })
          return map
        })(),
        dailyCat: (r.amzSCDailyCat || []).map(x => ({ date: x.date, category: x.category, subcategory: x.subcategory, ch: x.ch, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        catPrevMap: Object.fromEntries((r.amzSCCatChannelPrev||[]).map(x => [x.Category, parseFloat(x.rev)||0])),
        subCatPrevMap: (r.amzSCSubCatChannelPrev||[]).reduce((m,x) => { m[`${x.Category}::${x.SubCategory}`] = parseFloat(x.rev)||0; return m }, {}),
        skuPrevMap: (r.amzSCSKUChannelPrev||[]).reduce((m,x) => { if (!m[x.Category]) m[x.Category] = {}; if (!m[x.Category][x.SubCategory]) m[x.Category][x.SubCategory] = {}; m[x.Category][x.SubCategory][x.sku] = parseFloat(x.rev)||0; return m }, {}),
      },
      amzVCMatrix: {
        catData: (() => {
          const map = {}
          ;(r.amzVCCat || []).forEach(x => { map[x.Category] = { rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, units: parseInt(x.units)||0, orders: parseInt(x.orders)||0 } })
          return map
        })(),
        subCatData: (() => {
          const map = {}
          ;(r.amzVCSubCat || []).forEach(x => {
            if (!map[x.Category]) map[x.Category] = {}
            map[x.Category][x.SubCategory] = { rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, units: parseInt(x.units)||0, orders: parseInt(x.orders)||0 }
          })
          return map
        })(),
        skuData: (() => {
          const map = {}
          ;(r.amzVCSKU || []).forEach(x => {
            if (!map[x.Category]) map[x.Category] = {}
            if (!map[x.Category][x.SubCategory]) map[x.Category][x.SubCategory] = {}
            map[x.Category][x.SubCategory][x.sku] = { rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, units: parseInt(x.units)||0, orders: parseInt(x.orders)||0 }
          })
          return map
        })(),
        dailyCat: (r.amzVCDailyCat || []).map(x => ({ date: x.date, category: x.category, subcategory: x.subcategory, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        catPrevMap: Object.fromEntries((r.amzVCCatPrev||[]).map(x => [x.Category, parseFloat(x.rev)||0])),
        subCatPrevMap: (r.amzVCSubCatPrev||[]).reduce((m,x) => { m[`${x.Category}::${x.SubCategory}`] = parseFloat(x.rev)||0; return m }, {}),
        skuPrevMap: (r.amzVCSKUPrev||[]).reduce((m,x) => { if (!m[x.Category]) m[x.Category] = {}; if (!m[x.Category][x.SubCategory]) m[x.Category][x.SubCategory] = {}; m[x.Category][x.SubCategory][x.sku] = parseFloat(x.rev)||0; return m }, {}),
      },
      amzVC: {
        prevRev: parseFloat(r.prevAmzVC?.[0]?.rev) || 0,
        prevExcRev: parseFloat(r.prevAmzVC?.[0]?.exc_rev) || 0,
        prevUnits: parseInt(r.prevAmzVC?.[0]?.units) || 0,
        accounts: (r.amzVCAccounts || []).map(x => ({ account: x.vendor_account, orderedUnits: parseInt(x.ordered_units)||0, orderedRev: parseFloat(x.ordered_rev)||0, orderedExcRev: parseFloat(x.ordered_exc_rev)||0, shippedUnits: parseInt(x.shipped_units)||0, shippedRev: parseFloat(x.shipped_rev)||0, returns: parseInt(x.returns)||0 })),
        daily: (() => {
          const realDaily = (r.amzVCDaily || []).map(x => ({ date: x.date, orderedUnits: parseInt(x.ordered_units)||0, orderedRev: parseFloat(x.ordered_rev)||0, shippedUnits: parseInt(x.shipped_units)||0, returnedOrders: 0, estimated: false }))
          const vcDates = realDaily.map(x => x.date).sort()
          const latestVCDate = vcDates[vcDates.length - 1]
          const estimatedVC = []
          if (latestVCDate && latestVCDate < end) {
            const last7 = realDaily.slice(-7)
            const avgRev = Math.round(last7.reduce((s, d) => s + d.orderedRev, 0) / last7.length)
            const avgUnits = Math.round(last7.reduce((s, d) => s + d.orderedUnits, 0) / last7.length)
            const cur = new Date(latestVCDate), end_ = new Date(end)
            cur.setDate(cur.getDate() + 1)
            while (cur <= end_) {
              const d = cur.toISOString().slice(0, 10)
              estimatedVC.push({ date: d, orderedRev: avgRev, orderedUnits: avgUnits, shippedUnits: 0, returnedOrders: 0, estimated: true })
              cur.setDate(cur.getDate() + 1)
            }
          }
          return [...realDaily, ...estimatedVC]
        })(),
        latestVCDate: (() => { const dates = (r.amzVCDaily || []).map(x => x.date).sort(); return dates[dates.length-1] || null })(),
        asins: (r.amzVCASINs || []).map(x => ({ asin: x.asin, sku: x.sku || '—', orderedUnits: parseInt(x.ordered_units)||0, orderedRev: parseFloat(x.ordered_rev)||0, shippedUnits: parseInt(x.shipped_units)||0, returns: parseInt(x.returns)||0 })),
      },
      amzIntl: {
        prevRev: parseFloat(r.amzIntlPrev?.[0]?.rev) || 0,
        prevNetRev: parseFloat(r.amzIntlPrev?.[0]?.net_rev) || 0,
        prevOrders: parseInt(r.amzIntlPrev?.[0]?.orders) || 0,
        prevUnits: parseInt(r.amzIntlPrev?.[0]?.units) || 0,
        countries: (r.amzIntlCountries || []).map(x => ({ country: x.Country, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, netRev: parseFloat(x.net_rev)||0, tax: parseFloat(x.tax)||0, units: parseInt(x.units)||0 })),
        skus: (r.amzIntlSKUs || []).map(x => ({ sku: x.sku, country: x.Country, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, netRev: parseFloat(x.net_rev)||0 })),
        daily: (r.amzIntlDaily || []).map(x => ({ date: x.date, country: x.Country, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, netRev: parseFloat(x.net_rev)||0 })),
        returnRate: (() => { const row = (r.amzIntlReturnRate||[])[0]; const totalRev = parseFloat(row?.total_rev)||0; const returnRev = parseFloat(row?.return_rev)||0; return { pct: totalRev > 0 ? Math.round(returnRev/totalRev*1000)/10 : 0, returnRev, totalRev } })(),
        returnByCat: Object.fromEntries((r.amzIntlReturnCat || []).map(x => [x.Category, { orders: parseInt(x.orders)||0, returned: parseInt(x.returned)||0 }])),
        returnBySubCat: (() => { const m = {}; (r.amzIntlReturnSubCat || []).forEach(x => { if (!m[x.Category]) m[x.Category] = {}; m[x.Category][x.SubCategory] = { orders: parseInt(x.orders)||0, returned: parseInt(x.returned)||0 } }); return m })(),
        returnBySku: Object.fromEntries((r.amzIntlReturnSKU || []).map(x => [x.sku, { orders: parseInt(x.orders)||0, returned: parseInt(x.returned)||0 }])),
        catChannel: (() => {
          const retMap = Object.fromEntries((r.amzIntlReturnCat || []).map(x => [x.Category, { orders: parseInt(x.orders)||0, returned: parseInt(x.returned)||0 }]))
          const map = {}
          ;(r.amzIntlCatChannel || []).forEach(x => {
            if (!map[x.Category]) map[x.Category] = {}
            const rd = retMap[x.Category] || { orders: 0, returned: 0 }
            map[x.Category][x.ch] = { rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, units: parseInt(x.units)||0, orders: parseInt(x.orders)||0, returned: rd.returned, totalOrdersForReturn: rd.orders }
          })
          return map
        })(),
        subCatChannel: (() => {
          const retMap = {}
          ;(r.amzIntlReturnSubCat || []).forEach(x => { retMap[`${x.Category}::${x.SubCategory}`] = { orders: parseInt(x.orders)||0, returned: parseInt(x.returned)||0 } })
          const map = {}
          ;(r.amzIntlSubCatChannel || []).forEach(x => {
            if (!map[x.Category]) map[x.Category] = {}
            if (!map[x.Category][x.SubCategory]) map[x.Category][x.SubCategory] = {}
            const rd = retMap[`${x.Category}::${x.SubCategory}`] || { orders: 0, returned: 0 }
            map[x.Category][x.SubCategory][x.ch] = { rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, units: parseInt(x.units)||0, orders: parseInt(x.orders)||0, returned: rd.returned, totalOrdersForReturn: rd.orders }
          })
          return map
        })(),
        skuChannel: (() => {
          const retMap = Object.fromEntries((r.amzIntlReturnSKU || []).map(x => [x.sku, { orders: parseInt(x.orders)||0, returned: parseInt(x.returned)||0 }]))
          const map = {}
          ;(r.amzIntlSKUChannel || []).forEach(x => {
            if (!map[x.Category]) map[x.Category] = {}
            if (!map[x.Category][x.SubCategory]) map[x.Category][x.SubCategory] = {}
            if (!map[x.Category][x.SubCategory][x.sku]) map[x.Category][x.SubCategory][x.sku] = {}
            const rd = retMap[x.sku] || { orders: 0, returned: 0 }
            map[x.Category][x.SubCategory][x.sku][x.ch] = { rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, units: parseInt(x.units)||0, orders: parseInt(x.orders)||0, returned: rd.returned, totalOrdersForReturn: rd.orders }
          })
          return map
        })(),
      },
      flipkart: {
        prevRev: parseFloat(r.prevFk?.[0]?.rev) || 0,
        prevExcRev: parseFloat(r.prevFk?.[0]?.exc_rev) || 0,
        prevOrders: parseInt(r.prevFk?.[0]?.orders) || 0,
        prevUnits: parseInt(r.prevFk?.[0]?.units) || 0,
        prevFbfRev: parseFloat(r.prevFk?.[0]?.fbf_rev) || 0,
        prevNonFbfRev: parseFloat(r.prevFk?.[0]?.nonfbf_rev) || 0,
        prevCancelOrders: parseInt(r.prevFk?.[0]?.cancel_orders) || 0,
        prevReturnRev: parseFloat(r.prevFk?.[0]?.return_rev) || 0,
        prevDeliveredRev: parseFloat(r.prevFk?.[0]?.delivered_rev) || 0,
        prevDaily: (r.prevFkDaily || []).map(x => ({ date: x.date, rev: parseFloat(x.rev) || 0 })),
        totals: fkBlock.patchedTotals,
        // Shared measures layer — Flipkart combines Return+RTO as one figure (no separate RTO
        // status, per fkNetCalc's note), so it's passed as return_rev with rto_rev: 0.
        netCalc: (() => {
          const all = fkBlock.patchedTotals.reduce((a, t) => ({ rev: a.rev + t.rev, excRev: a.excRev + t.excRev, cancelRev: a.cancelRev + (t.cancelRev||0), returnRev: a.returnRev + (t.totalReturnRev||0) }), { rev: 0, excRev: 0, cancelRev: 0, returnRev: 0 })
          const m = computeNetRevenueMeasures({ gross_inc_gst: all.rev, gross_exc_gst: all.excRev, cancel_rev: all.cancelRev, return_rev: all.returnRev, rto_rev: 0, cir_rev: 0 })
          return { gross: m.grossIncGst, cancelRev: m.cancelRev, returnRev: m.returnRev, netRev: m.netRevenueExcGst, gstRatio: m.grossIncGst > 0 ? (m.grossIncGst - m.grossExcGst) / m.grossIncGst : 0 }
        })(),
        estTotalRev: fkBlock.estTotalRev, estTotalOrders: fkBlock.estTotalOrders, estTotalUnits: fkBlock.estTotalUnits,
        daily: fkBlock.daily,
        latestRealDate: fkLatestDate || fkBlock.latestFkDate || null,
        estimatedDays: fkBlock.estimatedDays,
        dataShifted: fkStart !== start,
        status: (r.fkStatus || []).map(x => ({ status: x.status, sub: x.sub, orders: parseInt(x.orders)||0 })),
        skus: (r.fkSKUs || []).map(x => ({ sku: x.sku, sub: x.sub, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0 })),
        returnRate: (() => {
          const rows = r.fkReturnRate || []
          const all = { deliveredRev: 0, returnRev: 0 }
          const bySubMap = {}
          rows.forEach(x => {
            const d = parseFloat(x.total_rev)||0, rt = parseFloat(x.return_rev)||0
            all.deliveredRev += d; all.returnRev += rt
            bySubMap[x.sub] = { deliveredRev: d, returnRev: rt, pct: d > 0 ? rt/d*100 : 0 }
          })
          return { all: { ...all, pct: all.deliveredRev > 0 ? all.returnRev/all.deliveredRev*100 : 0 }, bySub: bySubMap }
        })(),
        categories: (r.fkCategories || []).map(x => ({ category: x.category, sub: x.sub, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: parseInt(x.units)||0, excRev: parseFloat(x.exc_rev)||0, returns: parseInt(x.returns)||0, returnRev: parseFloat(x.return_rev)||0, deliveredRev: parseFloat(x.delivered_rev)||0 })),
        states: (r.fkStates || []).map(x => ({ state: (!x.state || x.state.trim() === '-' || x.state.trim() === '') ? 'Others' : x.state, sub: x.sub, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, returnRev: parseFloat(x.return_rev)||0, deliveredRev: parseFloat(x.delivered_rev)||0 })),
        cities: (r.fkCities || []).map(x => ({ city: x.city, state: x.state, sub: x.sub, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, returnRev: parseFloat(x.return_rev)||0, deliveredRev: parseFloat(x.delivered_rev)||0 })),
        statePrevMap: (r.fkStatesPrev||[]).reduce((m,x) => { const k = `${(!x.state||x.state.trim()==='-'||x.state.trim()==='')?'Others':x.state}::${x.sub}`; m[k] = (m[k]||0) + (parseFloat(x.rev)||0); return m }, {}),
        cityPrevMap: (r.fkCitiesPrev||[]).reduce((m,x) => { const k = `${x.city}::${x.sub}`; m[k] = (m[k]||0) + (parseFloat(x.rev)||0); return m }, {}),
        stateTotalMap: (r.fkStateTotal||[]).reduce((m,x) => { m[x.sub] = parseFloat(x.total_rev)||0; return m }, {}),
        cityTotalMap: (r.fkCityTotal||[]).reduce((m,x) => { m[x.sub] = parseFloat(x.total_rev)||0; return m }, {}),
        catPrevMap: (r.fkCatPrev||[]).reduce((m,x) => { const k = `${x.category}::${x.sub}`; m[k] = (m[k]||0)+(parseFloat(x.rev)||0); return m }, {}),
        subCatPrevMap: (r.fkSubCatPrev||[]).reduce((m,x) => { const k = `${x.category}::${x.subcategory}::${x.sub}`; m[k] = (m[k]||0)+(parseFloat(x.rev)||0); return m }, {}),
        skuPrevMap: (r.fkSKUPrev||[]).reduce((m,x) => { const k = `${x.category}::${x.subcategory}::${x.sku}::${x.sub}`; m[k] = (m[k]||0)+(parseFloat(x.rev)||0); return m }, {}),
        regions: (r.fkRegions || []).map(x => ({ region: x.region, sub: x.sub, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        subCategories: (r.fkSubCategory || []).map(x => ({ category: x.category, subcategory: x.subcategory, sub: x.sub, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, units: parseInt(x.units)||0, returns: parseInt(x.returns)||0, returnRev: parseFloat(x.return_rev)||0, deliveredRev: parseFloat(x.delivered_rev)||0 })),
        dailyCat: (r.fkDailyCat || []).map(x => ({ date: x.date, category: x.category, subcategory: x.subcategory, sub: x.sub, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        skuMatrix: (() => {
          const map = {}
          ;(r.fkSKUMatrix || []).forEach(x => {
            const cat = x.category || 'Others', sc = x.subcategory || 'Others', sku = x.sku, sub = x.sub
            if (!map[cat]) map[cat] = {}
            if (!map[cat][sc]) map[cat][sc] = {}
            if (!map[cat][sc][sku]) map[cat][sc][sku] = { rev: 0, excRev: 0, units: 0, orders: 0 }
            map[cat][sc][sku].rev += parseFloat(x.rev)||0
            map[cat][sc][sku].excRev += parseFloat(x.exc_rev)||0
            map[cat][sc][sku].units += parseInt(x.units)||0
            map[cat][sc][sku].orders += parseInt(x.orders)||0
          })
          return map
        })(),
      },
      cred: {
        // Shared measures layer — same formula as Shopify/EBO/Amazon SC/All tab.
        netCalc: (() => {
          const m = computeNetRevenueMeasures(r.crNetCalc?.[0] || {})
          return { gross: m.grossIncGst, excRev: m.grossExcGst, cancelRev: m.cancelRev, returnRev: m.returnRev, cirRev: m.cirRev, rtoRev: m.rtoRev, netRev: m.netRevenueExcGst, gstCollected: m.gstAmount }
        })(),
        prevNetCalc: (() => { const m = computeNetRevenueMeasures(r.prevCrNetCalc?.[0] || {}); return { netRev: m.netRevenueExcGst, gstCollected: m.gstAmount } })(),
        prevRev: parseFloat(r.prevCr?.[0]?.rev) || 0,
        prevExcRev: parseFloat(r.prevCr?.[0]?.exc_rev) || 0,
        prevOrders: parseInt(r.prevCr?.[0]?.orders) || 0,
        prevUnits: parseInt(r.prevCr?.[0]?.units) || 0,
        prevSkus: parseInt(r.prevCr?.[0]?.skus) || 0,
        prevCities: parseInt(r.prevCr?.[0]?.cities) || 0,
        prevDaily: (r.prevCrDaily || []).map(x => ({ date: x.date, rev: parseFloat(x.rev) || 0 })),
        totals: r.crTotals?.[0] ? { orders: parseInt(r.crTotals[0].orders)||0, units: parseInt(r.crTotals[0].units)||0, rev: parseFloat(r.crTotals[0].rev)||0, excRev: parseFloat(r.crTotals[0].exc_rev)||0, skus: parseInt(r.crTotals[0].skus)||0, cities: parseInt(r.crTotals[0].cities)||0, days: parseInt(r.crTotals[0].days)||0 } : {},
        daily: (r.crDaily || []).map(x => ({ date: x.date, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        skus: (r.crSKUs || []).map(x => ({ sku: x.sku, name: x.sku_name, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0 })),
        categories: (r.crCategories || []).map(x => ({ category: x.category, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        subCategories: (r.crSubCategories || []).map(x => ({ category: x.category, subcategory: x.subcategory, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        catPrevMap: Object.fromEntries((r.crCatPrev || []).map(x => [x.category, parseFloat(x.rev)||0])),
        subCatPrevMap: (r.crSubCatPrev || []).reduce((m,x) => { m[`${x.category}::${x.subcategory}`] = parseFloat(x.rev)||0; return m }, {}),
        skuMatrix: (() => { const m = {}; (r.crSKUMatrix||[]).forEach(x => { const cat=x.category||'Others', sc=x.subcategory||'Others', sku=x.sku; if(!m[cat])m[cat]={}; if(!m[cat][sc])m[cat][sc]={}; m[cat][sc][sku]={rev:parseFloat(x.rev)||0,excRev:parseFloat(x.exc_rev)||0,units:parseInt(x.units)||0,orders:parseInt(x.orders)||0} }); return m })(),
        states: (r.crStates || []).map(x => ({ state: x.state, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, returnRev: parseFloat(x.return_rev)||0 })),
        statePrevMap: Object.fromEntries((r.crStatesPrev || []).map(x => [x.state, parseFloat(x.rev)||0])),
        stateTotal: parseFloat(r.crStateTotal?.[0]?.total_rev) || 0,
        cityTotal: parseFloat(r.crCityTotal?.[0]?.total_rev) || 0,
        status: (r.crStatus || []).map(x => ({ status: x.status, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        cities: (r.crCities || []).map(x => ({ city: x.city, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, returnRev: parseFloat(x.return_rev)||0 })),
        cityPrevMap: Object.fromEntries((r.crCitiesPrev || []).map(x => [x.city, parseFloat(x.rev)||0])),
        regionRows: (r.crRegion || []).map(x => ({ name: x.region, region: x.region, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: parseInt(x.units)||0 })),
        tierRows: (r.crTier || []).map(x => ({ name: `Tier ${x.city_tier}`, tier: parseInt(x.city_tier)||x.city_tier, label: x.tier_label, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: parseInt(x.units)||0 })),
      },
      firstcry: {
        // Shared measures layer — same formula as Shopify/EBO/Amazon SC/All tab.
        netCalc: (() => {
          const m = computeNetRevenueMeasures(r.fcNetCalc?.[0] || {})
          return { gross: m.grossIncGst, excRev: m.grossExcGst, cancelRev: m.cancelRev, returnRev: m.returnRev, cirRev: m.cirRev, rtoRev: m.rtoRev, netRev: m.netRevenueExcGst, gstCollected: m.gstAmount }
        })(),
        prevNetCalc: (() => { const m = computeNetRevenueMeasures(r.prevFcNetCalc?.[0] || {}); return { netRev: m.netRevenueExcGst, gstCollected: m.gstAmount } })(),
        prevRev: parseFloat(r.prevFc?.[0]?.rev) || 0,
        prevExcRev: parseFloat(r.prevFc?.[0]?.exc_rev) || 0,
        prevOrders: parseInt(r.prevFc?.[0]?.orders) || 0,
        prevUnits: parseInt(r.prevFc?.[0]?.units) || 0,
        prevSkus: parseInt(r.prevFc?.[0]?.skus) || 0,
        prevCities: parseInt(r.prevFc?.[0]?.cities) || 0,
        prevDaily: (r.prevFcDaily || []).map(x => ({ date: x.date, rev: parseFloat(x.rev) || 0 })),
        totals: r.fcTotals?.[0] ? { orders: parseInt(r.fcTotals[0].orders)||0, units: parseInt(r.fcTotals[0].units)||0, rev: parseFloat(r.fcTotals[0].rev)||0, excRev: parseFloat(r.fcTotals[0].exc_rev)||0, skus: parseInt(r.fcTotals[0].skus)||0, cities: parseInt(r.fcTotals[0].cities)||0, days: parseInt(r.fcTotals[0].days)||0 } : {},
        daily: (r.fcDaily || []).map(x => ({ date: x.date, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        skus: (r.fcSKUs || []).map(x => ({ sku: x.sku, name: x.sku_name, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0 })),
        categories: (r.fcCategories || []).map(x => ({ category: x.category, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        subCategories: (r.fcSubCategories || []).map(x => ({ category: x.category, subcategory: x.subcategory, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        skuMatrix: (() => { const m = {}; (r.fcSKUMatrix||[]).forEach(x => { const cat=x.category||'Others', sc=x.subcategory||'Others', sku=x.sku; if(!m[cat])m[cat]={}; if(!m[cat][sc])m[cat][sc]={}; m[cat][sc][sku]={rev:parseFloat(x.rev)||0,excRev:parseFloat(x.exc_rev)||0,units:parseInt(x.units)||0,orders:parseInt(x.orders)||0} }); return m })(),
        states: (r.fcStates || []).map(x => ({ state: x.state, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, returnRev: parseFloat(x.return_rev)||0 })),
        statePrevMap: Object.fromEntries((r.fcStatesPrev || []).map(x => [x.state, parseFloat(x.rev)||0])),
        stateTotal: parseFloat(r.fcStateTotal?.[0]?.total_rev) || 0,
        cityTotal: parseFloat(r.fcCityTotal?.[0]?.total_rev) || 0,
        catPrevMap: Object.fromEntries((r.fcCatPrev || []).map(x => [x.category, parseFloat(x.rev)||0])),
        subCatPrevMap: (r.fcSubCatPrev || []).reduce((m,x) => { m[`${x.category}::${x.subcategory}`] = parseFloat(x.rev)||0; return m }, {}),
        status: (r.fcStatus || []).map(x => ({ status: x.status, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        cities: (r.fcCities || []).map(x => ({ city: x.city, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, returnRev: parseFloat(x.return_rev)||0 })),
        cityPrevMap: Object.fromEntries((r.fcCitiesPrev || []).map(x => [x.city, parseFloat(x.rev)||0])),
        regionRows: (r.fcRegion || []).map(x => ({ name: x.region, region: x.region, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: parseInt(x.units)||0 })),
        tierRows: (r.fcTier || []).map(x => ({ name: `Tier ${x.city_tier}`, tier: parseInt(x.city_tier)||x.city_tier, label: x.tier_label, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: parseInt(x.units)||0 })),
      },
      zepto: {
        prevRev: parseFloat(r.prevZp?.[0]?.rev) || 0,
        prevExcRev: parseFloat(r.prevZp?.[0]?.exc_rev) || 0,
        prevUnits: parseInt(r.prevZp?.[0]?.units) || 0,
        prevSkus: parseInt(r.prevZp?.[0]?.skus) || 0,
        prevCities: parseInt(r.prevZp?.[0]?.cities) || 0,
        prevOrders: parseInt(r.prevZp?.[0]?.orders) || 0,
        prevDaily: (r.prevZpDaily || []).map(x => ({ date: x.date, rev: parseFloat(x.rev) || 0 })),
        totals: r.zpTotals?.[0] ? { units: parseInt(r.zpTotals[0].units)||0, orders: parseInt(r.zpTotals[0].orders)||0, rev: parseFloat(r.zpTotals[0].rev)||0, excRev: parseFloat(r.zpTotals[0].exc_rev)||0, skus: parseInt(r.zpTotals[0].skus)||0, cities: parseInt(r.zpTotals[0].cities)||0, days: parseInt(r.zpTotals[0].days)||0 } : {},
        daily: (r.zpDaily || []).map(x => ({ date: x.date, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        categories: (r.zpCategories || []).map(x => ({ category: x.category, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, skus: parseInt(x.skus)||0 })),
        subCategories: (r.zpSubCategories || []).map(x => ({ category: x.category, subcategory: x.subcategory, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        skus: (r.zpSKUs || []).map(x => ({ itemId: x.item_id, name: x.item_name, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, cities: parseInt(x.cities)||0 })),
        skuMatrix: (() => { const m = {}; (r.zpSKUMatrix||[]).forEach(x => { const cat=x.category||'Others', sc=x.subcategory||'Others', sku=x.sku; if(!m[cat])m[cat]={}; if(!m[cat][sc])m[cat][sc]={}; if(!m[cat][sc][sku])m[cat][sc][sku]={rev:0,excRev:0,units:0}; m[cat][sc][sku].rev+=parseFloat(x.rev)||0; m[cat][sc][sku].excRev+=parseFloat(x.exc_rev)||0; m[cat][sc][sku].units+=parseInt(x.units)||0 }); return m })(),
        cities: (r.zpCities || []).map(x => ({ city: x.city_name, region: x.region || '', cityTier: x.city_tier || '', units: parseInt(x.units)||0, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, skus: parseInt(x.skus)||0 })),
        states: (r.zpStates || []).map(x => ({ state: x.state?.charAt(0).toUpperCase()+x.state?.slice(1).toLowerCase(), units: parseInt(x.units)||0, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        statePrevMap: (r.zpStatesPrev||[]).reduce((m,x) => { const s = x.state?.charAt(0).toUpperCase()+x.state?.slice(1).toLowerCase(); m[s] = parseFloat(x.rev)||0; return m }, {}),
        cityPrevMap: (r.zpCitiesPrev||[]).reduce((m,x) => { m[x.city_name] = parseFloat(x.rev)||0; return m }, {}),
        stateTotal: parseFloat(r.zpStateTotal?.[0]?.total_rev)||0,
        cityTotal: parseFloat(r.zpCityTotal?.[0]?.total_rev)||0,
        catPrevMap: (r.zpCatPrev||[]).reduce((m,x) => { m[x.category] = parseFloat(x.rev)||0; return m }, {}),
        subCatPrevMap: (r.zpSubCatPrev||[]).reduce((m,x) => { m[`${x.category}::${x.subcategory}`] = parseFloat(x.rev)||0; return m }, {}),
        skuPrevMap: (() => { const m = {}; (r.zpSKUPrev||[]).forEach(x => { if(!m[x.category])m[x.category]={}; if(!m[x.category][x.subcategory])m[x.category][x.subcategory]={}; m[x.category][x.subcategory][x.sku]=(m[x.category][x.subcategory][x.sku]||0)+(parseFloat(x.rev)||0) }); return m })(),
      },
      instamart: {
        prevRev: parseFloat(r.prevIn?.[0]?.rev) || 0,
        prevExcRev: parseFloat(r.prevIn?.[0]?.exc_rev) || 0,
        prevUnits: parseInt(r.prevIn?.[0]?.units) || 0,
        prevSkus: parseInt(r.prevIn?.[0]?.skus) || 0,
        prevCities: parseInt(r.prevIn?.[0]?.cities) || 0,
        prevOrders: parseInt(r.prevIn?.[0]?.orders) || 0,
        prevDaily: (r.prevInDaily || []).map(x => ({ date: x.date, rev: parseFloat(x.rev) || 0 })),
        totals: r.inTotals?.[0] ? { units: parseInt(r.inTotals[0].units)||0, rev: parseFloat(r.inTotals[0].rev)||0, excRev: parseFloat(r.inTotals[0].exc_rev)||0, skus: parseInt(r.inTotals[0].skus)||0, cities: parseInt(r.inTotals[0].cities)||0, days: parseInt(r.inTotals[0].days)||0, orders: parseInt(r.inTotals[0].orders)||0 } : {},
        daily: (r.inDaily || []).map(x => ({ date: x.date, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        categories: (r.inCategories || []).map(x => ({ category: x.category, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, skus: parseInt(x.skus)||0 })),
        subCategories: (r.inSubCategories || []).map(x => ({ category: x.category, subcategory: x.subcategory, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        skus: (r.inSKUs || []).map(x => ({ itemId: x.item_id, name: x.item_name, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, cities: parseInt(x.cities)||0 })),
        skuMatrix: (() => { const m = {}; (r.inSKUMatrix||[]).forEach(x => { const cat=x.category||'Others', sc=x.subcategory||'Others', sku=x.sku; if(!m[cat])m[cat]={}; if(!m[cat][sc])m[cat][sc]={}; if(!m[cat][sc][sku])m[cat][sc][sku]={rev:0,excRev:0,units:0}; m[cat][sc][sku].rev+=parseFloat(x.rev)||0; m[cat][sc][sku].excRev+=parseFloat(x.exc_rev)||0; m[cat][sc][sku].units+=parseInt(x.units)||0 }); return m })(),
        cities: (r.inCities || []).map(x => ({ city: x.city_name, region: x.region || '', cityTier: x.city_tier || '', units: parseInt(x.units)||0, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, skus: parseInt(x.skus)||0 })),
        states: (r.inStates || []).map(x => ({ state: x.state?.charAt(0).toUpperCase()+x.state?.slice(1).toLowerCase(), units: parseInt(x.units)||0, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        statePrevMap: (r.inStatesPrev||[]).reduce((m,x) => { const s = x.state?.charAt(0).toUpperCase()+x.state?.slice(1).toLowerCase(); m[s] = parseFloat(x.rev)||0; return m }, {}),
        cityPrevMap: (r.inCitiesPrev||[]).reduce((m,x) => { m[x.city_name] = parseFloat(x.rev)||0; return m }, {}),
        stateTotal: parseFloat(r.inStateTotal?.[0]?.total_rev)||0,
        cityTotal: parseFloat(r.inCityTotal?.[0]?.total_rev)||0,
        catPrevMap: (r.inCatPrev||[]).reduce((m,x) => { m[x.category] = parseFloat(x.rev)||0; return m }, {}),
        subCatPrevMap: (r.inSubCatPrev||[]).reduce((m,x) => { m[`${x.category}::${x.subcategory}`] = parseFloat(x.rev)||0; return m }, {}),
        skuPrevMap: (() => { const m = {}; (r.inSKUPrev||[]).forEach(x => { if(!m[x.category])m[x.category]={}; if(!m[x.category][x.subcategory])m[x.category][x.subcategory]={}; m[x.category][x.subcategory][x.sku]=(m[x.category][x.subcategory][x.sku]||0)+(parseFloat(x.rev)||0) }); return m })(),
      },
      myntra: {
        // Shared measures layer — same formula as Shopify/EBO/Amazon SC/All tab. Overrides the
        // old "excRev shown directly as net" approach (platform data isn't actually net-of-returns).
        netCalc: (() => {
          const m = computeNetRevenueMeasures(r.mnNetCalc?.[0] || {})
          return { gross: m.grossIncGst, excRev: m.grossExcGst, cancelRev: m.cancelRev, returnRev: m.returnRev, cirRev: m.cirRev, rtoRev: m.rtoRev, netRev: m.netRevenueExcGst, gstCollected: m.gstAmount }
        })(),
        prevNetCalc: (() => { const m = computeNetRevenueMeasures(r.prevMnNetCalc?.[0] || {}); return { netRev: m.netRevenueExcGst, gstCollected: m.gstAmount } })(),
        prevRev: parseFloat(r.prevMn?.[0]?.rev) || 0,
        prevExcRev: parseFloat(r.prevMn?.[0]?.exc_rev) || 0,
        prevOrders: parseInt(r.prevMn?.[0]?.orders) || 0,
        prevDaily: (r.prevMnDaily || []).map(x => ({ date: x.date, rev: parseFloat(x.rev) || 0 })),
        totals: r.mnTotals?.[0] ? { orders: parseInt(r.mnTotals[0].orders)||0, units: parseInt(r.mnTotals[0].units)||0, rev: parseFloat(r.mnTotals[0].rev)||0, excRev: parseFloat(r.mnTotals[0].exc_rev)||0, skus: parseInt(r.mnTotals[0].skus)||0, cities: parseInt(r.mnTotals[0].cities)||0, days: parseInt(r.mnTotals[0].days)||0, returnRev: parseFloat(r.mnTotals[0].return_rev)||0, returnOrders: parseInt(r.mnTotals[0].return_orders)||0 } : {},
        daily: (r.mnDaily || []).map(x => ({ date: x.date, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        status: (r.mnStatus || []).map(x => ({ status: x.status, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        categories: (r.mnCategories || []).map(x => ({ category: x.category, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        subCategories: (r.mnSubCategories || []).map(x => ({ category: x.category, subcategory: x.subcategory, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        catPrevMap: Object.fromEntries((r.mnCatPrev || []).map(x => [x.category, parseFloat(x.rev)||0])),
        subCatPrevMap: (r.mnSubCatPrev || []).reduce((m,x) => { m[`${x.category}::${x.subcategory}`] = parseFloat(x.rev)||0; return m }, {}),
        skuMatrix: (() => { const m = {}; (r.mnSKUMatrix||[]).forEach(x => { const cat=x.category||'Others', sc=x.subcategory||'Others', sku=x.sku; if(!m[cat])m[cat]={}; if(!m[cat][sc])m[cat][sc]={}; m[cat][sc][sku]={rev:parseFloat(x.rev)||0,excRev:parseFloat(x.exc_rev)||0,units:parseInt(x.units)||0,orders:parseInt(x.orders)||0} }); return m })(),
        skus: (r.mnSKUs || []).map(x => ({ sku: x.sku, category: x.category || '', orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        states: (r.mnStates || []).map(x => ({ state: x.state, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, returnRev: parseFloat(x.return_rev)||0 })),
        statePrevMap: Object.fromEntries((r.mnStatesPrev || []).map(x => [x.state, parseFloat(x.rev)||0])),
        stateTotal: parseFloat(r.mnStateTotal?.[0]?.total_rev) || 0,
        cityTotal: parseFloat(r.mnCityTotal?.[0]?.total_rev) || 0,
        cities: (r.mnCities || []).map(x => ({ city: x.city, region: x.region || '', cityTier: x.city_tier || '', orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, returnRev: parseFloat(x.return_rev)||0 })),
        cityPrevMap: Object.fromEntries((r.mnCitiesPrev || []).map(x => [x.city, parseFloat(x.rev)||0])),
      },
      blinkit: {
        prevRev: parseFloat(r.prevBl?.[0]?.rev) || 0,
        prevExcRev: parseFloat(r.prevBl?.[0]?.exc_rev) || 0,
        prevUnits: parseInt(r.prevBl?.[0]?.units) || 0,
        prevSkus: parseInt(r.prevBl?.[0]?.skus) || 0,
        prevCities: parseInt(r.prevBl?.[0]?.cities) || 0,
        prevOrders: parseInt(r.prevBl?.[0]?.orders) || 0,
        totals: r.blTotals?.[0] ? { units: parseInt(r.blTotals[0].units)||0, rev: parseFloat(r.blTotals[0].rev)||0, excRev: parseFloat(r.blTotals[0].exc_rev)||0, skus: parseInt(r.blTotals[0].skus)||0, cities: parseInt(r.blTotals[0].cities)||0, days: parseInt(r.blTotals[0].days)||0, orders: parseInt(r.blTotals[0].orders)||0 } : {},
        daily: (r.blDaily || []).map(x => ({ date: x.date, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        categories: (r.blCategories || []).map(x => ({ category: x.category, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, skus: parseInt(x.skus)||0 })),
        subCategories: (r.blSubCategories || []).map(x => ({ category: x.category, subcategory: x.subcategory, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        skus: (r.blSKUs || []).map(x => ({ itemId: x.item_id, name: x.item_name, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, mrp: parseFloat(x.mrp)||0, cities: parseInt(x.cities)||0 })),
        skuMatrix: (() => { const m = {}; (r.blSKUMatrix||[]).forEach(x => { const cat=x.category||'Others', sc=x.subcategory||'Others', sku=x.sku; if(!m[cat])m[cat]={}; if(!m[cat][sc])m[cat][sc]={}; if(!m[cat][sc][sku])m[cat][sc][sku]={rev:0,excRev:0,units:0}; m[cat][sc][sku].rev+=parseFloat(x.rev)||0; m[cat][sc][sku].excRev+=parseFloat(x.exc_rev)||0; m[cat][sc][sku].units+=parseInt(x.units)||0 }); return m })(),
        cities: (r.blCities || []).map(x => ({ city: x.city_name, region: x.region || '', cityTier: x.city_tier || '', units: parseInt(x.units)||0, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, skus: parseInt(x.skus)||0 })),
        states: (r.blStates || []).map(x => ({ state: x.state?.charAt(0).toUpperCase()+x.state?.slice(1).toLowerCase(), units: parseInt(x.units)||0, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        statePrevMap: (r.blStatesPrev||[]).reduce((m,x) => { const s = x.state?.charAt(0).toUpperCase()+x.state?.slice(1).toLowerCase(); m[s] = parseFloat(x.rev)||0; return m }, {}),
        cityPrevMap: (r.blCitiesPrev||[]).reduce((m,x) => { m[x.city_name] = parseFloat(x.rev)||0; return m }, {}),
        stateTotal: parseFloat(r.blStateTotal?.[0]?.total_rev)||0,
        cityTotal: parseFloat(r.blCityTotal?.[0]?.total_rev)||0,
        catPrevMap: (r.blCatPrev||[]).reduce((m,x) => { m[x.category] = parseFloat(x.rev)||0; return m }, {}),
        subCatPrevMap: (r.blSubCatPrev||[]).reduce((m,x) => { m[`${x.category}::${x.subcategory}`] = parseFloat(x.rev)||0; return m }, {}),
        skuPrevMap: (() => { const m = {}; (r.blSKUPrev||[]).forEach(x => { if(!m[x.category])m[x.category]={}; if(!m[x.category][x.subcategory])m[x.category][x.subcategory]={}; m[x.category][x.subcategory][x.sku]=(m[x.category][x.subcategory][x.sku]||0)+(parseFloat(x.rev)||0) }); return m })(),
      },
      offline: {
        totalsBySub: (r.offlineTotals || []).map(x => ({ subChannel: x.SubChannel, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, revSales: parseFloat(x.rev_sales)||0, excRevSales: parseFloat(x.exc_rev_sales)||0, cnRev: parseFloat(x.cn_rev)||0, cnExcRev: parseFloat(x.cn_exc_rev)||0, cnOrders: parseInt(x.cn_orders)||0, cnUnits: parseInt(x.cn_units)||0 })),
        prevBySub: (r.prevOffline || []).map(x => ({ subChannel: x.SubChannel, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, revSales: parseFloat(x.rev_sales)||0, excRevSales: parseFloat(x.exc_rev_sales)||0, cnRev: parseFloat(x.cn_rev)||0, cnExcRev: parseFloat(x.cn_exc_rev)||0, cnOrders: parseInt(x.cn_orders)||0, cnUnits: parseInt(x.cn_units)||0 })),
        prevDaily: (r.prevOfflineDaily || []).map(x => ({ date: x.date, subChannel: x.SubChannel, rev: parseFloat(x.rev) || 0 })),
        daily: (r.offlineDaily || []).map(x => ({ date: x.date, subChannel: x.SubChannel, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, cnRev: parseFloat(x.cn_rev)||0, cnExcRev: parseFloat(x.cn_exc_rev)||0 })),
        subChannelRows: (r.offlineSubChannel || []).map(x => ({ subChannel: x.SubChannel, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        categoryRows: (r.offlineCategory || []).map(x => ({ subChannel: x.SubChannel, category: x.Category || 'Others', rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, cnRev: parseFloat(x.cn_rev)||0 })),
        subCategoryRows: (r.offlineSubCategory || []).map(x => ({ subChannel: x.SubChannel, category: x.Category || 'Others', subCategory: x.SubCategory || 'Others', rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0 })),
        skuRows: (r.offlineSKU || []).map(x => ({ subChannel: x.SubChannel, category: x.Category || 'Others', subCategory: x.SubCategory || 'Others', sku: x.sku, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0 })),
        stateRows: (r.offlineState || []).filter(x => x.state).map(x => ({ subChannel: x.SubChannel, state: x.state, rev: parseFloat(x.rev)||0, orders: parseInt(x.orders)||0, cities: parseInt(x.cities)||0 })),
        cityRows: (r.offlineCity || []).map(x => ({ subChannel: x.SubChannel, city: x.city, state: x.state || '', region: x.region || '', orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })).filter(x => x.city),
        catPrevRows: (r.offCatPrev || []).map(x => ({ subChannel: x.SubChannel, category: x.category, rev: parseFloat(x.rev)||0 })),
        subCatPrevRows: (r.offSubCatPrev || []).map(x => ({ subChannel: x.SubChannel, category: x.category, subcategory: x.subcategory, rev: parseFloat(x.rev)||0 })),
        statePrevRows: (r.offStatesPrev || []).filter(x => x.state).map(x => ({ subChannel: x.SubChannel, state: x.state, rev: parseFloat(x.rev)||0 })),
        cityPrevRows: (r.offCitiesPrev || []).map(x => ({ subChannel: x.SubChannel, city: x.city, rev: parseFloat(x.rev)||0 })).filter(x => x.city),
        stateTotalRows: (r.offStateTotal || []).map(x => ({ subChannel: x.SubChannel, total: parseFloat(x.total_rev)||0 })),
        cityTotalRows: (r.offCityTotal || []).map(x => ({ subChannel: x.SubChannel, total: parseFloat(x.total_rev)||0 })),
        regionRows: (r.offlineRegion || []).map(x => ({ subChannel: x.SubChannel, region: x.region, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: parseInt(x.units)||0 })),
        tierRows: (r.offlineTier || []).map(x => ({ subChannel: x.SubChannel, tier: parseInt(x.city_tier)||x.city_tier, label: x.tier_label, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: parseInt(x.units)||0 })),
      },
      ads: {
        totals: (r.adsTotals || []).map(x => ({ platform: x.platform, spend: parseFloat(x.spend)||0, revenue: parseFloat(x.revenue)||0, impressions: parseFloat(x.impressions)||0, clicks: parseFloat(x.clicks)||0, orders: parseFloat(x.orders)||0, ctr: parseFloat(x.ctr)||0, cpc: parseFloat(x.cpc)||0, roas: parseFloat(x.roas)||0 })),
        // Flipkart's data feed lags recent days — chMap['Flipkart'].excRev (feeding the Net
        // Revenue KPI) includes a 7-day-trailing-average estimate for those missing days, but
        // the category/product breakdown below only sums rows actually present in the sales
        // table. Exposed here so the frontend can add the same estimate into Flipkart's
        // "Others" bucket, keeping the KPI and the breakdown tables' totals consistent.
        flipkartEstRev: fkBlock.estTotalRev || 0,
        daily: (r.adsDaily || []).map(x => ({ date: x.date, platform: x.platform, spend: parseFloat(x.spend)||0, revenue: parseFloat(x.revenue)||0, impressions: parseFloat(x.impressions)||0, clicks: parseFloat(x.clicks)||0 })),
        channelDailyExcRev: (() => {
          const map = {}
          ;(r.channelDailyExcRev || []).forEach(x => {
            if (!map[x.Channel]) map[x.Channel] = {}
            map[x.Channel][x.date] = parseFloat(x.exc_rev) || 0
          })
          return map
        })(),
        channelSalesOrders: (() => {
          const m = {}
          ;(r.byChannel || []).forEach(x => { m[x.Channel] = parseInt(x.orders) || 0 })
          return m
        })(),
        // Powers the Ads trend chart's category/sub-category slicer (see adsDailyByCategory /
        // salesDailyByCategory above). Left as raw normalized rows — the frontend aggregates by
        // date after filtering to the selected category/sub-category and current platform tab.
        adsDailyByCategory: (r.adsDailyByCategory || []).map(x => ({ date: x.date, platform: x.platform, category: x.category, subCategory: x.sub_category || null, spend: parseFloat(x.spend) || 0 })),
        salesDailyByCategory: (r.salesDailyByCategory || []).map(x => ({ date: x.date, platform: x.platform, category: x.category, subCategory: x.sub_category || null, revenue: parseFloat(x.revenue) || 0 })),
        byAdType: (r.adsByAdType || []).map(x => ({ platform: x.platform, adType: x.ad_type, spend: parseFloat(x.spend)||0, revenue: parseFloat(x.revenue)||0, impressions: parseFloat(x.impressions)||0, clicks: parseFloat(x.clicks)||0, orders: parseFloat(x.orders)||0, ctr: parseFloat(x.ctr)||0, cpc: parseFloat(x.cpc)||0, roas: parseFloat(x.roas)||0 })),
        campaigns: (r.adsCampaigns || []).map(x => ({ platform: x.platform, adType: x.ad_type, campaign: x.campaign_name, spend: parseFloat(x.spend)||0, revenue: parseFloat(x.revenue)||0, impressions: parseFloat(x.impressions)||0, clicks: parseFloat(x.clicks)||0, orders: parseFloat(x.orders)||0, ctr: parseFloat(x.ctr)||0, cpc: parseFloat(x.cpc)||0, roas: parseFloat(x.roas)||0 })),
        byCategory: (r.adsByCategory || []).map(x => ({ platform: x.platform, category: x.category, spend: parseFloat(x.spend)||0, revenue: parseFloat(x.revenue)||0, impressions: parseFloat(x.impressions)||0, clicks: parseFloat(x.clicks)||0, orders: parseFloat(x.orders)||0, roas: parseFloat(x.roas)||0 })),
        bySku: (r.adsBySku || []).map(x => ({ platform: x.platform, category: x.category, sku: x.product_name, spend: parseFloat(x.spend)||0, revenue: parseFloat(x.revenue)||0, impressions: parseFloat(x.impressions)||0, clicks: parseFloat(x.clicks)||0, orders: parseFloat(x.orders)||0, roas: parseFloat(x.roas)||0 })),
        categoryBreakdown: (() => {
          const salesRows = r.salesCategoryOrders || []
          const adsTotals = r.adsTotals || []
          const metaSpend = parseFloat(adsTotals.find(t => t.platform === 'Meta')?.spend) || 0
          const googleSpend = parseFloat(adsTotals.find(t => t.platform === 'Google')?.spend) || 0
          const shopifyAdSpend = metaSpend + googleSpend
          const metaShare = shopifyAdSpend > 0 ? metaSpend / shopifyAdSpend : 0.5
          const googleShare = shopifyAdSpend > 0 ? googleSpend / shopifyAdSpend : 0.5

          const shopifySales = salesRows.filter(s => s.platform === 'Shopify')

          // Build ad spend lookup by platform → category → spend/clicks/impressions
          const adsCB = r.adsCategoryBreakdown || []
          // ad spend by platform+category (for category table)
          const adCatMap = {}
          adsCB.forEach(x => {
            const key = `${x.platform}||${(x.category || 'Others').trim()}`
            if (!adCatMap[key]) adCatMap[key] = { spend: 0, clicks: 0, impressions: 0 }
            adCatMap[key].spend += parseFloat(x.spend) || 0
            adCatMap[key].clicks += parseFloat(x.clicks) || 0
            adCatMap[key].impressions += parseFloat(x.impressions) || 0
          })
          // ad spend by platform+subCategory (for product table) — every row from adsCategoryBreakdown
          // is already resolved down to a specific sub-category/product regardless of the original
          // target_type (product/category/all), since category- and all-level spend is now split
          // across matched sub-categories by revenue share before this point.
          const adProdMap = {}
          adsCB.filter(x => x.product_name).forEach(x => {
            const key = `${x.platform}||${x.product_name.trim()}`
            if (!adProdMap[key]) adProdMap[key] = { spend: 0, clicks: 0, impressions: 0, category: x.category || 'Others' }
            adProdMap[key].spend += parseFloat(x.spend) || 0
            adProdMap[key].clicks += parseFloat(x.clicks) || 0
            adProdMap[key].impressions += parseFloat(x.impressions) || 0
          })

          // CATEGORY TABLE: built from sales, revenue = full category sales, spend from ads
          // For D2C (Meta+Google) use Shopify sales split by spend share
          const catSalesMap = {}
          shopifySales.forEach(s => {
            const cat = (s.category || 'Others').trim()
            if (!catSalesMap[cat]) catSalesMap[cat] = { revenue: 0, orders: 0 }
            catSalesMap[cat].revenue += parseFloat(s.revenue) || 0
            catSalesMap[cat].orders += parseFloat(s.orders) || 0
          })

          const categoryRows = Object.entries(catSalesMap).map(([cat, sales]) => {
            const metaAd = adCatMap[`Meta||${cat}`] || {}
            const googleAd = adCatMap[`Google||${cat}`] || {}
            const spend = (metaAd.spend || 0) + (googleAd.spend || 0)
            const clicks = (metaAd.clicks || 0) + (googleAd.clicks || 0)
            const impressions = (metaAd.impressions || 0) + (googleAd.impressions || 0)
            return { platform: 'D2C', category: cat, subCategory: null, spend, clicks, impressions, salesRevenue: Math.round(sales.revenue), orders: Math.round(sales.orders) }
          })

          // PRODUCT TABLE: built from sales subcategories, revenue = full subcat sales, spend from ads
          const subCatSalesMap = {}
          shopifySales.forEach(s => {
            const subCat = (s.sub_category || '').trim()
            const cat = (s.category || 'Others').trim()
            const key = subCat || `__nosubcat__${cat}`
            if (!subCatSalesMap[key]) subCatSalesMap[key] = { subCategory: subCat || null, category: cat, revenue: 0, orders: 0 }
            subCatSalesMap[key].revenue += parseFloat(s.revenue) || 0
            subCatSalesMap[key].orders += parseFloat(s.orders) || 0
          })

          // Track which subCats are matched by ads
          const matchedSubCats = new Set()
          // Sales rows with no sub-category (blank/unmapped SKUs) still carry real revenue —
          // fold them into Others instead of dropping them, so this table's total matches the
          // category table's total (and the Net Revenue KPI) rather than silently running short.
          let noSubCatRevenue = 0, noSubCatOrders = 0
          const productRows = Object.values(subCatSalesMap).map(s => {
            const subCat = s.subCategory
            if (!subCat) { noSubCatRevenue += s.revenue; noSubCatOrders += s.orders; return null }
            const metaKey = `Meta||${subCat}`
            const googleKey = `Google||${subCat}`
            const metaAd = adProdMap[metaKey] || {}
            const googleAd = adProdMap[googleKey] || {}
            const spend = (metaAd.spend || 0) + (googleAd.spend || 0)
            const clicks = (metaAd.clicks || 0) + (googleAd.clicks || 0)
            const impressions = (metaAd.impressions || 0) + (googleAd.impressions || 0)
            if (spend > 0) matchedSubCats.add(subCat)
            return { platform: 'D2C', category: s.category, subCategory: subCat, spend, clicks, impressions, salesRevenue: Math.round(s.revenue), orders: Math.round(s.orders) }
          }).filter(Boolean)

          // Others: subCats with sales but no ad spend, plus no-sub-category revenue — aggregate into one Others row
          const othersRevenue = productRows.filter(r => r.spend === 0).reduce((s, r) => s + r.salesRevenue, 0) + Math.round(noSubCatRevenue)
          const othersOrders = productRows.filter(r => r.spend === 0).reduce((s, r) => s + r.orders, 0) + Math.round(noSubCatOrders)
          const advertisedProducts = productRows.filter(r => r.spend > 0)
          if (othersRevenue > 0) {
            advertisedProducts.push({ platform: 'D2C', category: 'Others', subCategory: 'Others', spend: 0, clicks: 0, impressions: 0, salesRevenue: othersRevenue, orders: othersOrders })
          }

          // MARKETPLACE PLATFORMS: build category+product rows per platform
          const mktPlatforms = ['Amazon', 'Flipkart', 'Myntra', 'Zepto', 'Instamart', 'Blinkit']
          mktPlatforms.forEach(plat => {
            const platSales = salesRows.filter(s => s.platform === plat)
            if (!platSales.length) return

            // Category rows for this platform
            const platCatSales = {}
            platSales.forEach(s => {
              const cat = (s.category || 'Others').trim()
              if (!platCatSales[cat]) platCatSales[cat] = { revenue: 0, orders: 0 }
              platCatSales[cat].revenue += parseFloat(s.revenue) || 0
              platCatSales[cat].orders += parseFloat(s.orders) || 0
            })
            Object.entries(platCatSales).forEach(([cat, sales]) => {
              const adEntry = adCatMap[`${plat}||${cat}`] || {}
              categoryRows.push({ platform: plat, category: cat, subCategory: null, spend: adEntry.spend || 0, clicks: adEntry.clicks || 0, impressions: adEntry.impressions || 0, salesRevenue: Math.round(sales.revenue), orders: Math.round(sales.orders) })
            })
            // Flipkart's data feed lags recent days — the Net Revenue KPI includes a
            // trailing-average estimate for those missing days (see chMap['Flipkart'] patch
            // above); add the same estimate here as an uncategorized row so this table's total
            // stays consistent with the KPI instead of silently running short.
            if (plat === 'Flipkart' && fkBlock.estTotalRev > 0) {
              categoryRows.push({ platform: plat, category: 'Others (est.)', subCategory: null, spend: 0, clicks: 0, impressions: 0, salesRevenue: Math.round(fkBlock.estTotalRev), orders: 0 })
            }

            // Product rows for this platform
            const platSubCatSales = {}
            let platNoSubCatRev = 0, platNoSubCatOrders = 0
            platSales.forEach(s => {
              const subCat = (s.sub_category || '').trim()
              const cat = (s.category || 'Others').trim()
              if (!subCat) { platNoSubCatRev += parseFloat(s.revenue) || 0; platNoSubCatOrders += parseFloat(s.orders) || 0; return }
              if (!platSubCatSales[subCat]) platSubCatSales[subCat] = { category: cat, revenue: 0, orders: 0 }
              platSubCatSales[subCat].revenue += parseFloat(s.revenue) || 0
              platSubCatSales[subCat].orders += parseFloat(s.orders) || 0
            })
            // No-sub-category revenue (blank/unmapped SKUs) folds into Others below, same as D2C.
            let platOthersRev = platNoSubCatRev, platOthersOrders = platNoSubCatOrders
            Object.entries(platSubCatSales).forEach(([subCat, s]) => {
              const adEntry = adProdMap[`${plat}||${subCat}`] || {}
              if (adEntry.spend > 0) {
                advertisedProducts.push({ platform: plat, category: s.category, subCategory: subCat, spend: adEntry.spend || 0, clicks: adEntry.clicks || 0, impressions: adEntry.impressions || 0, salesRevenue: Math.round(s.revenue), orders: Math.round(s.orders) })
              } else {
                platOthersRev += s.revenue
                platOthersOrders += s.orders
              }
            })
            if (platOthersRev > 0) {
              advertisedProducts.push({ platform: plat, category: 'Others', subCategory: 'Others', spend: 0, clicks: 0, impressions: 0, salesRevenue: Math.round(platOthersRev), orders: Math.round(platOthersOrders) })
            }
            // Same Flipkart lag-estimate reconciliation as the category table above.
            if (plat === 'Flipkart' && fkBlock.estTotalRev > 0) {
              advertisedProducts.push({ platform: plat, category: 'Others (est.)', subCategory: 'Others (est.)', spend: 0, clicks: 0, impressions: 0, salesRevenue: Math.round(fkBlock.estTotalRev), orders: 0 })
            }
          })

          // Reconcile: any platform+category (or platform+subCategory) with ad spend but no matching
          // sales row in this period would otherwise be silently dropped, since categoryRows/
          // advertisedProducts are built by iterating SALES data and looking up ad spend — not the
          // other way around. Add zero-sales rows for these so every rupee of ad spend still shows up.
          const d2cCatKeys = new Set(categoryRows.filter(r => r.platform === 'D2C').map(r => r.category))
          const mktCatKeys = new Set()
          categoryRows.filter(r => r.platform !== 'D2C').forEach(r => mktCatKeys.add(`${r.platform}||${r.category}`))
          Object.entries(adCatMap).forEach(([key, ad]) => {
            if (!ad.spend) return
            const [plat, cat] = key.split('||')
            if (plat === 'Meta' || plat === 'Google') {
              if (!d2cCatKeys.has(cat)) {
                d2cCatKeys.add(cat)
                categoryRows.push({ platform: 'D2C', category: cat, subCategory: null, spend: (adCatMap[`Meta||${cat}`]?.spend || 0) + (adCatMap[`Google||${cat}`]?.spend || 0), clicks: (adCatMap[`Meta||${cat}`]?.clicks || 0) + (adCatMap[`Google||${cat}`]?.clicks || 0), impressions: (adCatMap[`Meta||${cat}`]?.impressions || 0) + (adCatMap[`Google||${cat}`]?.impressions || 0), salesRevenue: 0, orders: 0 })
              }
            } else if (mktPlatforms.includes(plat) && !mktCatKeys.has(key)) {
              mktCatKeys.add(key)
              categoryRows.push({ platform: plat, category: cat, subCategory: null, spend: ad.spend || 0, clicks: ad.clicks || 0, impressions: ad.impressions || 0, salesRevenue: 0, orders: 0 })
            }
          })
          const d2cSubCatKeys = new Set(advertisedProducts.filter(r => r.platform === 'D2C').map(r => r.subCategory))
          const mktSubCatKeys = new Set()
          advertisedProducts.filter(r => r.platform !== 'D2C').forEach(r => mktSubCatKeys.add(`${r.platform}||${r.subCategory}`))
          Object.entries(adProdMap).forEach(([key, ad]) => {
            if (!ad.spend) return
            const [plat, subCat] = key.split('||')
            if (plat === 'Meta' || plat === 'Google') {
              if (!d2cSubCatKeys.has(subCat)) {
                d2cSubCatKeys.add(subCat)
                advertisedProducts.push({ platform: 'D2C', category: ad.category || 'Others', subCategory: subCat, spend: (adProdMap[`Meta||${subCat}`]?.spend || 0) + (adProdMap[`Google||${subCat}`]?.spend || 0), clicks: (adProdMap[`Meta||${subCat}`]?.clicks || 0) + (adProdMap[`Google||${subCat}`]?.clicks || 0), impressions: (adProdMap[`Meta||${subCat}`]?.impressions || 0) + (adProdMap[`Google||${subCat}`]?.impressions || 0), salesRevenue: 0, orders: 0 })
              }
            } else if (mktPlatforms.includes(plat) && !mktSubCatKeys.has(key)) {
              mktSubCatKeys.add(key)
              advertisedProducts.push({ platform: plat, category: ad.category || 'Others', subCategory: subCat, spend: ad.spend || 0, clicks: ad.clicks || 0, impressions: ad.impressions || 0, salesRevenue: 0, orders: 0 })
            }
          })

          return { categoryRows, productRows: advertisedProducts }
        })(),
        // Consolidated Spend Detail table (Ads tab, "All" sub-tab only) — one row per
        // category+sub-category, summed across every platform, with gross/net revenue and
        // returns/cancellations broken out (unlike categoryBreakdown above, which is
        // platform-split and gross-revenue-only). Net Revenue uses the same
        // (gross − cancel − return/RTO − CIR) × (1 − GST ratio) formula used throughout
        // the rest of the app (chMap, Shopify/Flipkart tabs, etc).
        // Category/product spend+revenue breakdown, buildable for "all platforms" or scoped to
        // one platform (or a set, e.g. D2C = Meta+Google) so every Ads sub-tab can render the
        // exact same table component. Ad spend drives both category and product rows (not sales
        // data) so every rupee of spend is represented even when it has no sales-side match —
        // a sales-driven join would silently drop unmatched spend, which is what originally
        // caused By Product spend to undercount the true total.
        allSpendDetail: buildSpendDetail(null),
        spendDetailByPlatform: Object.fromEntries(
          ['Meta', 'Google', 'D2C', 'Amazon', 'Flipkart', 'Myntra', 'Zepto', 'Instamart', 'Blinkit'].map(p => [p, buildSpendDetail(p)])
        ),
        zeroOrder: (r.adsZeroOrder || []).map(x => ({ platform: x.platform, product: x.product, campaign: x.campaign_name, spend: parseFloat(x.spend)||0, orders: parseFloat(x.orders)||0, clicks: parseFloat(x.clicks)||0, impressions: parseFloat(x.impressions)||0, ctr: parseFloat(x.ctr)||0, cpc: parseFloat(x.cpc)||0 })),
        prevTotals: (r.prevAdsTotals || []).reduce((m, x) => { m[x.platform] = { spend: parseFloat(x.spend)||0, revenue: parseFloat(x.revenue)||0, impressions: parseFloat(x.impressions)||0, clicks: parseFloat(x.clicks)||0 }; return m }, {}),
        // prevAdsCategoryBreakdown query dropped — it duplicated the full ~3s attribution
        // pipeline just to power WoW% badges on the per-platform Category/Product tables.
        // Those badges now simply show no delta (prevCategoryBreakdown is empty) rather than
        // paying that cost on every request.
        prevCategoryBreakdown: [],
        nCusts: parseInt(r.shopifyNewCusts?.[0]?.n_custs) || 0,
        repeatCusts: parseInt(r.shopifyNewCusts?.[0]?.repeat_custs) || 0,
      },
    }
    setInCache(cacheKey, payload)
    res.setHeader('X-Cache', 'MISS')
    res.json(payload)
  } catch (err) {
    console.error('[api/bq]', err.message)
    res.status(500).json({ error: err.message })
  }
}
