import { getBQ, buildQuery } from './_bq.js'

// Server-side in-memory cache with 5-minute TTL
const cache = new Map()
const CACHE_TTL = 5 * 60 * 1000

function getCacheKey(body) {
  const { start, end, category, subCategory, sku, subChannel, voucher, channel, region, tier, state, city, country } = body
  return JSON.stringify({ start, end, category, subCategory, sku, subChannel, voucher, channel, region, tier, state, city, country })
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

  const { start, end, category, subCategory, sku, subChannel, voucher, channel: activeChannel, region, tier, state, city, country } = req.body
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
  const base = buildQuery(start, end, { category, subCategory, sku, subChannel, voucher, region, tier, state, city, country })
  const prevBase = buildQuery(ps, pe, { category, subCategory, sku, subChannel, voucher, region, tier, state, city, country })
  const momBase = buildQuery(moms, mome, { category, subCategory, sku, subChannel, voucher, region, tier, state, city, country })
  const yoyBase = buildQuery(yoys, yoye, { category, subCategory, sku, subChannel, voucher, region, tier, state, city, country })

  const queries = {
    totals: `WITH q AS (${base}) SELECT COUNT(DISTINCT OrderId) AS n_orders, SUM(SellingPrice_Inc_GST) AS total_rev, SUM(SellingPrice_Exc_GST) AS total_exc_rev, SUM(ItemQty) AS total_qty, COUNT(DISTINCT OrderDate) AS n_days, COUNT(DISTINCT CustomerId) AS n_custs FROM q`,
    byChannel: `WITH q AS (${base}) SELECT Channel, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS qty FROM q GROUP BY Channel ORDER BY rev DESC`,
    byDate: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, Channel, SUM(SellingPrice_Inc_GST) AS rev, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units FROM q GROUP BY date, Channel ORDER BY date`,
    byCategory: `WITH q AS (${base}) SELECT Category, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS units FROM q GROUP BY Category ORDER BY rev DESC`,
    byState: `WITH q AS (${base}) SELECT CASE WHEN TRIM(State) IS NULL OR TRIM(State) IN ('','-') THEN 'OTHERS' ELSE UPPER(TRIM(State)) END AS state, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, COUNT(DISTINCT City) AS cities FROM q WHERE State IS NOT NULL GROUP BY 1 ORDER BY rev DESC LIMIT 30`,
    shCategory: `WITH q AS (${base}) SELECT Category, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS units, COUNT(DISTINCT CASE WHEN is_cancelled=1 THEN OrderId END) AS cancelled, COUNT(DISTINCT CASE WHEN is_rto=1 THEN OrderId END) AS rto, COUNT(DISTINCT CASE WHEN is_CIR_return=1 THEN OrderId END) AS cir, COUNT(DISTINCT CASE WHEN is_exchange=1 THEN OrderId END) AS exch FROM q WHERE Channel='Shopify' GROUP BY Category ORDER BY rev DESC`,
    shSubCategory: `WITH q AS (${base}) SELECT Category, SubCategory, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS units, COUNT(DISTINCT CASE WHEN is_cancelled=1 THEN OrderId END) AS cancelled, COUNT(DISTINCT CASE WHEN is_rto=1 THEN OrderId END) AS rto, COUNT(DISTINCT CASE WHEN is_CIR_return=1 THEN OrderId END) AS cir, COUNT(DISTINCT CASE WHEN is_exchange=1 THEN OrderId END) AS exch FROM q WHERE Channel='Shopify' GROUP BY Category, SubCategory ORDER BY rev DESC`,
    shSKU: `WITH q AS (${base}) SELECT Category, SubCategory, MasterSKU AS sku, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS units, COUNT(DISTINCT CASE WHEN is_cancelled=1 THEN OrderId END) AS cancelled, COUNT(DISTINCT CASE WHEN is_rto=1 THEN OrderId END) AS rto, COUNT(DISTINCT CASE WHEN is_CIR_return=1 THEN OrderId END) AS cir, COUNT(DISTINCT CASE WHEN is_exchange=1 THEN OrderId END) AS exch FROM q WHERE Channel='Shopify' AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != '' GROUP BY Category, SubCategory, MasterSKU ORDER BY rev DESC LIMIT 300`,
    shState: `WITH q AS (${base}) SELECT UPPER(TRIM(State)) AS state, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, COUNT(DISTINCT City) AS cities FROM q WHERE Channel='Shopify' AND State IS NOT NULL AND TRIM(State) != '' GROUP BY UPPER(TRIM(State)) ORDER BY rev DESC LIMIT 30`,
    shRegion: `WITH q AS (${base}) SELECT Region AS region, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(ItemQty) AS units FROM q WHERE Channel='Shopify' AND Region IS NOT NULL GROUP BY Region ORDER BY rev DESC`,
    shTier: `WITH q AS (${base}) SELECT City_Tier AS city_tier, Tier_Label AS tier_label, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(ItemQty) AS units FROM q WHERE Channel='Shopify' AND City_Tier IS NOT NULL GROUP BY City_Tier, Tier_Label ORDER BY City_Tier`,
    shCity: `WITH q AS (${base}) SELECT INITCAP(TRIM(City)) AS city, INITCAP(TRIM(State)) AS state, MAX(Region) AS region, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Shopify' AND City IS NOT NULL AND TRIM(City) != '' GROUP BY INITCAP(TRIM(City)), INITCAP(TRIM(State)) ORDER BY rev DESC LIMIT 50`,
    byRegion: `WITH q AS (${base}) SELECT Region AS region, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(ItemQty) AS units FROM q WHERE Region IS NOT NULL GROUP BY Region ORDER BY rev DESC`,
    byTier: `WITH q AS (${base}) SELECT City_Tier AS city_tier, Tier_Label AS tier_label, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(ItemQty) AS units FROM q WHERE City_Tier IS NOT NULL GROUP BY City_Tier, Tier_Label ORDER BY City_Tier`,
    byOrderValue: `WITH q AS (${base}), ot AS (SELECT OrderId, SUM(SellingPrice_Inc_GST) AS order_rev FROM q GROUP BY OrderId) SELECT CASE WHEN order_rev < 500 THEN '<₹500' WHEN order_rev < 1000 THEN '₹500-1K' WHEN order_rev < 2500 THEN '₹1K-2.5K' WHEN order_rev < 5000 THEN '₹2.5K-5K' WHEN order_rev < 10000 THEN '₹5K-10K' WHEN order_rev < 25000 THEN '₹10K-25K' ELSE '₹25K+' END AS bucket, COUNT(*) AS cnt, SUM(order_rev) AS rev FROM ot GROUP BY 1`,
    byVoucher: `WITH q AS (${base}) SELECT CASE WHEN voucher_code IS NULL OR TRIM(voucher_code) = '' THEN 'No voucher' WHEN UPPER(voucher_code) LIKE '%PREPAID%' THEN 'Prepaid Disc' WHEN UPPER(voucher_code) LIKE '%PLM%' THEN 'Loyalty (PLM)' WHEN UPPER(voucher_code) LIKE '%FRV%' THEN 'Repeat (FRV)' WHEN REGEXP_CONTAINS(voucher_code, r'^[0-9]') OR LOWER(voucher_code) IN ('custom discount','custom_discount','simpl discount','simpldiscount','percentage','discount-3') OR LOWER(voucher_code) LIKE '%total pos%' OR LOWER(voucher_code) LIKE 'clickpost%' THEN 'POS/Manual' WHEN UPPER(voucher_code) LIKE '%HDFC%' OR UPPER(voucher_code) LIKE '%APAY%' OR UPPER(voucher_code) LIKE '%NOCOST%' OR UPPER(voucher_code) LIKE '%EMI%' OR UPPER(voucher_code) LIKE '%ONECARD%' OR UPPER(voucher_code) LIKE '%SIMPL%' THEN 'Bank/EMI' WHEN UPPER(voucher_code) LIKE 'IST-%' OR UPPER(voucher_code) LIKE '%INFLUENCER%' OR UPPER(voucher_code) LIKE 'AC-%' OR UPPER(voucher_code) LIKE 'GC-%' OR UPPER(voucher_code) LIKE 'DC-%' THEN 'Influencer/Aff' WHEN UPPER(voucher_code) LIKE '%SUMMER%' OR UPPER(voucher_code) LIKE '%BFS%' OR UPPER(voucher_code) LIKE '%LOVE%' THEN 'Sale Campaign' WHEN UPPER(voucher_code) LIKE '%FGP500%' OR UPPER(voucher_code) LIKE '%TECBXAY2%' OR UPPER(voucher_code) LIKE '%FREE GIFT COUPON%' OR LOWER(voucher_code) LIKE '%free-gift-coupon-500%' THEN 'Free Gift ₹500' WHEN UPPER(voucher_code) LIKE '%FGP1000%' OR UPPER(voucher_code) LIKE '%TECBXAY4%' THEN 'Free Gift ₹1000' WHEN UPPER(voucher_code) LIKE '%CARCOMFORT%' OR UPPER(voucher_code) LIKE '%BUNDLE%' OR UPPER(voucher_code) LIKE '%PACK%' OR UPPER(voucher_code) LIKE '%-PACK' OR UPPER(voucher_code) LIKE 'P2-%' OR UPPER(voucher_code) LIKE '%OFF-2%' OR UPPER(voucher_code) LIKE '%PACKOFF%' THEN 'Bundle/Pack' WHEN UPPER(voucher_code) IN ('FIRST50','ARCH10','FRIDO5','COMFY15','COMFY10','COMFY20','FIXPOSTURE200','FIXYOURPOSTURESALE','MYFRIDO10','FLAT100','PD20','OFF-2-PACK','WEDGEPL-59','SUMMER65') OR UPPER(voucher_code) LIKE 'COMFY%' OR UPPER(voucher_code) LIKE 'FIRST%' OR UPPER(voucher_code) LIKE 'FRIDO%' OR UPPER(voucher_code) LIKE 'ARCH%' OR UPPER(voucher_code) LIKE 'FLAT%' OR UPPER(voucher_code) LIKE 'FIXPOSTURE%' THEN 'Campaign' ELSE 'Other' END AS voucher_type, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel = 'Shopify' GROUP BY 1`,
    bySubChannel: `WITH q AS (${base}) SELECT SubChannel, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS qty FROM q WHERE Channel = 'Shopify' GROUP BY SubChannel ORDER BY rev DESC`,
    byPaymentMode: `WITH q AS (${base}) SELECT CASE WHEN PaymentMode IS NULL OR TRIM(PaymentMode) = '' THEN 'Unknown' WHEN LOWER(PaymentMode) LIKE '%cod%' OR LOWER(PaymentMode) LIKE '%cash%' THEN 'COD' ELSE 'Prepaid' END AS payment_mode, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel = 'Shopify' GROUP BY 1`,
    byOrderStatus: `WITH q AS (${base}) SELECT Order_Status AS order_status, COUNT(DISTINCT OrderId) AS cnt, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel = 'Shopify' AND Country = 'India' GROUP BY Order_Status`,
    highTicket: `WITH q AS (${base}), ot AS (SELECT OrderId, SUM(SellingPrice_Inc_GST) AS rev FROM q GROUP BY OrderId HAVING SUM(SellingPrice_Inc_GST) >= 10000) SELECT COUNT(*) AS ht_count, SUM(rev) AS ht_rev FROM ot`,
    multiItem: `WITH q AS (${base}), ot AS (SELECT OrderId, SUM(ItemQty) AS total_qty FROM q GROUP BY OrderId) SELECT COUNT(CASE WHEN total_qty > 1 THEN 1 END) AS multi_item_orders FROM ot`,
    repeatRate: subChannel === 'International'
      ? `WITH in_range AS (SELECT DISTINCT customer_id FROM \`frido-429506.production.fact_shopify_international_orders\` WHERE order_date BETWEEN '${start}' AND '${end}' AND customer_id IS NOT NULL), prior AS (SELECT DISTINCT customer_id FROM \`frido-429506.production.fact_shopify_international_orders\` WHERE order_date < '${start}' AND customer_id IS NOT NULL) SELECT COUNT(*) AS n_custs, COUNTIF(p.customer_id IS NOT NULL) AS repeat_custs FROM in_range ir LEFT JOIN prior p USING (customer_id)`
      : `WITH in_range AS (SELECT DISTINCT customer_id FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` WHERE order_date_ist BETWEEN '${start}' AND '${end}' AND customer_id IS NOT NULL), prior AS (SELECT DISTINCT customer_id FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` WHERE order_date_ist < '${start}' AND customer_id IS NOT NULL) SELECT COUNT(*) AS n_custs, COUNTIF(p.customer_id IS NOT NULL) AS repeat_custs FROM in_range ir LEFT JOIN prior p USING (customer_id)`,
    bySubCategory: `WITH q AS (${base}) SELECT Category, SubCategory, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(ItemQty) AS units FROM q GROUP BY Category, SubCategory ORDER BY rev DESC LIMIT 200`,
    byCategoryChannel: `WITH q AS (${base}) SELECT Category, Channel, SUM(SellingPrice_Inc_GST) AS rev FROM q GROUP BY Category, Channel`,
    bySubCategoryChannel: `WITH q AS (${base}) SELECT Category, SubCategory, Channel, SUM(SellingPrice_Inc_GST) AS rev FROM q GROUP BY Category, SubCategory, Channel ORDER BY rev DESC`,
    byCity: `WITH q AS (${base}) SELECT UPPER(TRIM(City_L2)) AS city, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE City_L2 IS NOT NULL AND TRIM(City_L2) != '' GROUP BY UPPER(TRIM(City_L2)) ORDER BY rev DESC LIMIT 50`,
    bySKU: `WITH q AS (${base}) SELECT MasterSKU AS sku, Category AS category, SubCategory AS subcategory, Channel AS channel, SUM(ItemQty) AS units, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE MasterSKU IS NOT NULL AND TRIM(MasterSKU) != '' GROUP BY MasterSKU, Category, SubCategory, Channel ORDER BY rev DESC LIMIT 500`,
    byFinancialStatus: `WITH q AS (${base}) SELECT FinancialStatus AS financial_status, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel = 'Shopify' AND FinancialStatus IS NOT NULL GROUP BY FinancialStatus ORDER BY orders DESC`,
    byFulfilmentStatus: `WITH q AS (${base}) SELECT FulfilmentStatus AS fulfil_status, COUNT(DISTINCT OrderId) AS orders FROM q WHERE Channel = 'Shopify' AND FulfilmentStatus IS NOT NULL GROUP BY FulfilmentStatus ORDER BY orders DESC`,
    byRefundTrend: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, COUNT(DISTINCT OrderId) AS total_orders, COUNTIF(RefundStatus = 'true') AS refund_lines FROM q WHERE Channel = 'Shopify' GROUP BY date ORDER BY date`,
    byDailyReturnTrend: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, COUNT(DISTINCT OrderId) AS total_orders, COUNTIF(is_rto = 1) AS rto_orders, COUNTIF(is_exchange = 1) AS exch_orders, COUNTIF(is_CIR_return = 1) AS cir_orders FROM q WHERE Channel = 'Shopify' GROUP BY date ORDER BY date`,
    topOrders: `WITH q AS (${base}), ot AS (SELECT OrderId, CAST(OrderDate AS STRING) AS order_date, Channel, State, City, SUM(SellingPrice_Inc_GST) AS rev, SUM(ItemQty) AS qty, MAX(FulfilmentStatus) AS order_status, MAX(CustomerId) AS customer_id, MAX(voucher_code) AS voucher_code, STRING_AGG(DISTINCT ChannelSKUCode, ', ' ORDER BY ChannelSKUCode LIMIT 5) AS skus FROM q GROUP BY OrderId, OrderDate, Channel, State, City) SELECT * FROM ot ORDER BY rev DESC LIMIT 20`,
    byVoucherRaw: `WITH q AS (${base}) SELECT TRIM(voucher_code) AS voucher_code, COUNT(DISTINCT OrderId) AS orders FROM q WHERE Channel = 'Shopify' AND voucher_code IS NOT NULL AND TRIM(voucher_code) != '' GROUP BY TRIM(voucher_code) ORDER BY orders DESC LIMIT 300`,
    byCIR: `WITH q AS (${base}) SELECT SUM(SellingPrice_Inc_GST) AS cir_rev, COUNT(DISTINCT OrderId) AS cir_orders FROM q WHERE is_CIR_return = 1`,
    byExchange: `WITH q AS (${base}) SELECT COUNT(DISTINCT OrderId) AS exchange_orders FROM q WHERE is_exchange = 1 AND Channel = 'Shopify'`,
    byRTO: `WITH q AS (${base}) SELECT SUM(SellingPrice_Inc_GST) AS rto_rev, COUNT(DISTINCT OrderId) AS rto_orders FROM q WHERE is_rto = 1 AND Channel = 'Shopify'`,
    prevTotals: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS total_rev, SUM(SellingPrice_Exc_GST) AS total_exc_rev, COUNT(DISTINCT OrderId) AS n_orders, SUM(ItemQty) AS total_qty, COUNT(DISTINCT CASE WHEN FulfilmentStatus='RTO' THEN OrderId END) AS rto_orders, COUNT(DISTINCT CASE WHEN is_CIR_return=1 THEN OrderId END) AS cir_orders FROM q`,
    momTotals: `WITH q AS (${momBase}) SELECT SUM(SellingPrice_Inc_GST) AS total_rev, SUM(SellingPrice_Exc_GST) AS total_exc_rev, COUNT(DISTINCT OrderId) AS n_orders FROM q`,
    yoyTotals: `WITH q AS (${yoyBase}) SELECT SUM(SellingPrice_Inc_GST) AS total_rev, SUM(SellingPrice_Exc_GST) AS total_exc_rev, COUNT(DISTINCT OrderId) AS n_orders FROM q`,
    prevByChannel: `WITH q AS (${prevBase}) SELECT Channel, SUM(SellingPrice_Inc_GST) AS rev FROM q GROUP BY Channel`,
    prevByDate: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q GROUP BY date ORDER BY date`,
    prevShopify: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, COUNTIF(is_rto=1) AS rto_orders, COUNTIF(is_CIR_return=1) AS cir_orders, COUNTIF(is_exchange=1) AS exchange_orders FROM q WHERE Channel='Shopify'`,
    prevShopifyDaily: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Shopify' GROUP BY date ORDER BY date`,
    prevShopifyCancel: `WITH q AS (${prevBase}) SELECT COUNT(DISTINCT CASE WHEN Order_Status='Cancelled' THEN OrderId END) AS cancelled_orders, COUNT(DISTINCT OrderId) AS total_orders FROM q WHERE Channel='Shopify'`,
    prevAmzSC: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, COUNT(DISTINCT CASE WHEN FinancialStatus != 'Cancelled' THEN OrderId END) AS orders, SUM(CASE WHEN FinancialStatus != 'Cancelled' THEN ItemQty ELSE 0 END) AS units, SUM(CASE WHEN fulfillment_channel='Amazon' THEN SellingPrice_Inc_GST ELSE 0 END) AS fba_rev, COUNT(DISTINCT CASE WHEN FinancialStatus='Cancelled' THEN OrderId END) AS cancelled_orders, COUNT(DISTINCT CASE WHEN FulfilmentStatus='Shipped' THEN OrderId END) AS shipped_orders FROM q WHERE SubChannel='Amazon Seller Central'`,
    prevAmzVC: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS units FROM q WHERE SubChannel='Amazon Vendor Central'`,
    prevAmzDaily: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Amazon' GROUP BY date ORDER BY date`,
    prevFk: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, SUM(CASE WHEN SubChannel='FBF' THEN SellingPrice_Inc_GST ELSE 0 END) AS fbf_rev, SUM(CASE WHEN SubChannel!='FBF' THEN SellingPrice_Inc_GST ELSE 0 END) AS nonfbf_rev FROM q WHERE Channel='Flipkart'`,
    prevFkDaily: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Flipkart' GROUP BY date ORDER BY date`,
    prevBl: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS units, COUNT(DISTINCT SubCategory) AS skus, COUNT(DISTINCT City) AS cities FROM q WHERE Channel='Blinkit'`,
    prevBlDaily: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Blinkit' GROUP BY date ORDER BY date`,
    prevIn: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS units, COUNT(DISTINCT SubCategory) AS skus, COUNT(DISTINCT City) AS cities FROM q WHERE Channel='Instamart'`,
    prevInDaily: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Instamart' GROUP BY date ORDER BY date`,
    prevZp: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS units, COUNT(DISTINCT SubCategory) AS skus, COUNT(DISTINCT City) AS cities FROM q WHERE Channel='Zepto'`,
    prevZpDaily: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Zepto' GROUP BY date ORDER BY date`,
    prevCr: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, COUNT(DISTINCT SubCategory) AS skus, COUNT(DISTINCT City) AS cities FROM q WHERE Channel='CRED'`,
    prevCrDaily: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='CRED' GROUP BY date ORDER BY date`,
    prevFc: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, COUNT(DISTINCT SubCategory) AS skus, COUNT(DISTINCT City) AS cities FROM q WHERE Channel='Firstcry'`,
    prevFcDaily: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Firstcry' GROUP BY date ORDER BY date`,
    amzSCTotals: `WITH q AS (${base}) SELECT COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units FROM q WHERE SubChannel = 'Amazon Seller Central' AND FinancialStatus != 'Cancelled'`,
    amzSCFulfillment: `WITH q AS (${base}) SELECT fulfillment_channel, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, SUM(ItemQty) AS units FROM q WHERE SubChannel = 'Amazon Seller Central' AND FulfilmentStatus != 'Cancelled' AND SellingPrice_Inc_GST > 0 GROUP BY fulfillment_channel`,
    amzSCStatus: `WITH q AS (${base}) SELECT FinancialStatus AS order_status, COUNT(DISTINCT OrderId) AS orders FROM q WHERE SubChannel = 'Amazon Seller Central' GROUP BY order_status ORDER BY orders DESC`,
    amzSCStates: `WITH q AS (${base}) SELECT UPPER(TRIM(State)) AS ship_state, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE SubChannel = 'Amazon Seller Central' AND FulfilmentStatus != 'Cancelled' AND SellingPrice_Inc_GST > 0 GROUP BY ship_state ORDER BY rev DESC`,
    amzSCCities: `WITH q AS (${base}) SELECT UPPER(TRIM(City_L2)) AS city, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE SubChannel = 'Amazon Seller Central' AND FinancialStatus != 'Cancelled' AND City_L2 IS NOT NULL AND TRIM(City_L2) != '' GROUP BY city ORDER BY rev DESC LIMIT 50`,
    amzSCSKUs: `WITH q AS (${base}) SELECT ChannelSKUCode AS sku, ProductId AS asin, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE SubChannel = 'Amazon Seller Central' AND FulfilmentStatus != 'Cancelled' AND SellingPrice_Inc_GST > 0 GROUP BY sku, asin ORDER BY rev DESC LIMIT 20`,
    amzSCDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, fulfillment_channel, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE SubChannel = 'Amazon Seller Central' AND FulfilmentStatus != 'Cancelled' AND SellingPrice_Inc_GST > 0 GROUP BY date, fulfillment_channel ORDER BY date`,
    amzSCReturnRate: `SELECT COUNT(DISTINCT o.amazon_order_id) AS total_orders, COUNT(DISTINCT s.order_id) AS returned_orders FROM \`frido-429506.production.amazon_seller_central_all_orders\` o LEFT JOIN (SELECT DISTINCT order_id FROM \`frido-429506.production.fact_all_settlement_report\` WHERE transaction_type = 'Refund' AND settlement_region = 'India') s ON o.amazon_order_id = s.order_id WHERE o.purchase_date_ist BETWEEN '${start}' AND '${end}' AND o.order_status != 'Cancelled'`,
    amzSCReturnCat: `WITH q AS (${base}), ret AS (SELECT DISTINCT order_id FROM \`frido-429506.production.fact_all_settlement_report\` WHERE transaction_type = 'Refund' AND settlement_region = 'India') SELECT q.Category, COUNT(DISTINCT q.OrderId) AS orders, COUNT(DISTINCT CASE WHEN ret.order_id IS NOT NULL THEN q.OrderId END) AS returned FROM q LEFT JOIN ret ON q.OrderId = ret.order_id WHERE q.SubChannel = 'Amazon Seller Central' AND q.FinancialStatus != 'Cancelled' AND q.Category IS NOT NULL GROUP BY q.Category`,
    amzSCReturnSubCat: `WITH q AS (${base}), ret AS (SELECT DISTINCT order_id FROM \`frido-429506.production.fact_all_settlement_report\` WHERE transaction_type = 'Refund' AND settlement_region = 'India') SELECT q.Category, q.SubCategory, COUNT(DISTINCT q.OrderId) AS orders, COUNT(DISTINCT CASE WHEN ret.order_id IS NOT NULL THEN q.OrderId END) AS returned FROM q LEFT JOIN ret ON q.OrderId = ret.order_id WHERE q.SubChannel = 'Amazon Seller Central' AND q.FinancialStatus != 'Cancelled' AND q.Category IS NOT NULL GROUP BY q.Category, q.SubCategory`,
    amzSCReturnSKU: `WITH q AS (${base}), ret AS (SELECT DISTINCT order_id FROM \`frido-429506.production.fact_all_settlement_report\` WHERE transaction_type = 'Refund' AND settlement_region = 'India') SELECT q.Category, q.SubCategory, q.MasterSKU AS sku, COUNT(DISTINCT q.OrderId) AS orders, COUNT(DISTINCT CASE WHEN ret.order_id IS NOT NULL THEN q.OrderId END) AS returned FROM q LEFT JOIN ret ON q.OrderId = ret.order_id WHERE q.SubChannel = 'Amazon Seller Central' AND q.FinancialStatus != 'Cancelled' AND q.MasterSKU IS NOT NULL GROUP BY q.Category, q.SubCategory, q.MasterSKU`,
    amzSCCatChannel: `WITH q AS (${base}) SELECT Category, CASE WHEN fulfillment_channel='Amazon' THEN 'FBA' ELSE 'MFN' END AS ch, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE SubChannel = 'Amazon Seller Central' AND FinancialStatus != 'Cancelled' AND Category IS NOT NULL GROUP BY Category, ch ORDER BY rev DESC`,
    amzSCSubCatChannel: `WITH q AS (${base}) SELECT Category, SubCategory, CASE WHEN fulfillment_channel='Amazon' THEN 'FBA' ELSE 'MFN' END AS ch, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE SubChannel = 'Amazon Seller Central' AND FinancialStatus != 'Cancelled' AND Category IS NOT NULL GROUP BY Category, SubCategory, ch ORDER BY rev DESC`,
    amzSCSKUChannel: `WITH q AS (${base}) SELECT Category, SubCategory, MasterSKU AS sku, CASE WHEN fulfillment_channel='Amazon' THEN 'FBA' ELSE 'MFN' END AS ch, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE SubChannel = 'Amazon Seller Central' AND FinancialStatus != 'Cancelled' AND MasterSKU IS NOT NULL GROUP BY Category, SubCategory, sku, ch ORDER BY rev DESC LIMIT 500`,
    amzVCCat: `WITH q AS (${base}) SELECT Category, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE SubChannel = 'Amazon Vendor Central' AND Category IS NOT NULL GROUP BY Category ORDER BY rev DESC`,
    amzVCSubCat: `WITH q AS (${base}) SELECT Category, SubCategory, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE SubChannel = 'Amazon Vendor Central' AND Category IS NOT NULL GROUP BY Category, SubCategory ORDER BY rev DESC`,
    amzVCSKU: `WITH q AS (${base}) SELECT Category, SubCategory, MasterSKU AS sku, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE SubChannel = 'Amazon Vendor Central' AND MasterSKU IS NOT NULL GROUP BY Category, SubCategory, sku ORDER BY rev DESC LIMIT 500`,
    amzSCRegion: `WITH q AS (${base}) SELECT Region AS region, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, SUM(ItemQty) AS units FROM q WHERE SubChannel = 'Amazon Seller Central' AND FinancialStatus != 'Cancelled' AND Region IS NOT NULL GROUP BY Region ORDER BY rev DESC`,
    amzSCTier: `WITH q AS (${base}) SELECT City_Tier AS city_tier, Tier_Label AS tier_label, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, SUM(ItemQty) AS units FROM q WHERE SubChannel = 'Amazon Seller Central' AND FinancialStatus != 'Cancelled' AND City_Tier IS NOT NULL GROUP BY City_Tier, Tier_Label ORDER BY City_Tier`,
    amzVCAccounts: `WITH q AS (${base}) SELECT ChannelAccount AS vendor_account, SUM(ItemQty) AS ordered_units, ROUND(SUM(SellingPrice_Inc_GST),0) AS ordered_rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS ordered_exc_rev, SUM(ItemQty) AS shipped_units, ROUND(SUM(SellingPrice_Inc_GST),0) AS shipped_rev, 0 AS returns FROM q WHERE SubChannel = 'Amazon Vendor Central' GROUP BY vendor_account ORDER BY ordered_rev DESC`,
    amzVCDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, SUM(ItemQty) AS ordered_units, ROUND(SUM(SellingPrice_Inc_GST),0) AS ordered_rev, SUM(ItemQty) AS shipped_units FROM q WHERE SubChannel = 'Amazon Vendor Central' GROUP BY date ORDER BY date`,
    amzVCASINs: `WITH q AS (${base}) SELECT ProductId AS asin, COALESCE(NULLIF(TRIM(ChannelSKUCode),''), NULLIF(TRIM(MasterSKU),'')) AS sku, SUM(ItemQty) AS ordered_units, ROUND(SUM(SellingPrice_Inc_GST),0) AS ordered_rev, SUM(ItemQty) AS shipped_units, 0 AS returns FROM q WHERE SubChannel = 'Amazon Vendor Central' GROUP BY asin, sku ORDER BY ordered_rev DESC LIMIT 20`,
    amzIntlPrev: `SELECT COUNT(DISTINCT amazon_order_id) AS orders, ROUND(SUM(CAST(item_price AS FLOAT64)),0) AS rev, ROUND(SUM(CAST(item_price AS FLOAT64) - CAST(item_tax AS FLOAT64)),0) AS net_rev, SUM(CAST(quantity AS INT64)) AS units FROM \`frido-429506.production.amazon_seller_central_uk_uae_all_orders\` WHERE purchase_date_ist BETWEEN '${ps}' AND '${pe}' AND item_status != 'Cancelled'`,
    amzIntlReturnCat: `WITH q AS (${base}), ret AS (SELECT DISTINCT order_id FROM \`frido-429506.production.fact_all_settlement_report\` WHERE transaction_type = 'Refund' AND settlement_region IN ('UAE','UK')) SELECT q.Category, COUNT(DISTINCT q.OrderId) AS orders, COUNT(DISTINCT CASE WHEN ret.order_id IS NOT NULL THEN q.OrderId END) AS returned FROM q LEFT JOIN ret ON q.OrderId = ret.order_id WHERE q.SubChannel = 'Amazon International' AND q.FinancialStatus != 'Cancelled' AND q.Category IS NOT NULL GROUP BY q.Category`,
    amzIntlReturnSubCat: `WITH q AS (${base}), ret AS (SELECT DISTINCT order_id FROM \`frido-429506.production.fact_all_settlement_report\` WHERE transaction_type = 'Refund' AND settlement_region IN ('UAE','UK')) SELECT q.Category, q.SubCategory, COUNT(DISTINCT q.OrderId) AS orders, COUNT(DISTINCT CASE WHEN ret.order_id IS NOT NULL THEN q.OrderId END) AS returned FROM q LEFT JOIN ret ON q.OrderId = ret.order_id WHERE q.SubChannel = 'Amazon International' AND q.FinancialStatus != 'Cancelled' AND q.Category IS NOT NULL GROUP BY q.Category, q.SubCategory`,
    amzIntlReturnSKU: `WITH q AS (${base}), ret AS (SELECT DISTINCT order_id FROM \`frido-429506.production.fact_all_settlement_report\` WHERE transaction_type = 'Refund' AND settlement_region IN ('UAE','UK')) SELECT q.MasterSKU AS sku, COUNT(DISTINCT q.OrderId) AS orders, COUNT(DISTINCT CASE WHEN ret.order_id IS NOT NULL THEN q.OrderId END) AS returned FROM q LEFT JOIN ret ON q.OrderId = ret.order_id WHERE q.SubChannel = 'Amazon International' AND q.FinancialStatus != 'Cancelled' AND q.MasterSKU IS NOT NULL GROUP BY q.MasterSKU`,
    amzIntlCountries: `SELECT Country, COUNT(DISTINCT amazon_order_id) AS orders, ROUND(SUM(CAST(item_price AS FLOAT64)),0) AS rev, ROUND(SUM(CAST(item_price AS FLOAT64) - CAST(item_tax AS FLOAT64)),0) AS net_rev, ROUND(SUM(CAST(item_tax AS FLOAT64)),0) AS tax, SUM(CAST(quantity AS INT64)) AS units FROM \`frido-429506.production.amazon_seller_central_uk_uae_all_orders\` WHERE purchase_date_ist BETWEEN '${start}' AND '${end}' AND item_status != 'Cancelled' GROUP BY Country ORDER BY rev DESC`,
    amzIntlCatChannel: `WITH q AS (${base}) SELECT Category, Country AS ch, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE SubChannel = 'Amazon International' AND FinancialStatus != 'Cancelled' AND Category IS NOT NULL GROUP BY Category, Country ORDER BY rev DESC`,
    amzIntlSubCatChannel: `WITH q AS (${base}) SELECT Category, SubCategory, Country AS ch, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE SubChannel = 'Amazon International' AND FinancialStatus != 'Cancelled' AND Category IS NOT NULL GROUP BY Category, SubCategory, Country ORDER BY rev DESC`,
    amzIntlSKUChannel: `WITH q AS (${base}) SELECT Category, SubCategory, MasterSKU AS sku, Country AS ch, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE SubChannel = 'Amazon International' AND FinancialStatus != 'Cancelled' AND MasterSKU IS NOT NULL GROUP BY Category, SubCategory, sku, Country ORDER BY rev DESC LIMIT 500`,
    amzIntlSKUs: `SELECT sku, Country, COUNT(DISTINCT amazon_order_id) AS orders, SUM(CAST(quantity AS INT64)) AS units, ROUND(SUM(CAST(item_price AS FLOAT64)),0) AS rev, ROUND(SUM(CAST(item_price AS FLOAT64) - CAST(item_tax AS FLOAT64)),0) AS net_rev FROM \`frido-429506.production.amazon_seller_central_uk_uae_all_orders\` WHERE purchase_date_ist BETWEEN '${start}' AND '${end}' AND item_status != 'Cancelled' GROUP BY sku, Country ORDER BY rev DESC LIMIT 20`,
    amzIntlDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, Country, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS net_rev FROM q WHERE SubChannel = 'Amazon International' AND FinancialStatus != 'Cancelled' GROUP BY date, Country ORDER BY date`,
    fkTotals: `WITH q AS (${base}) SELECT CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, SUM(ItemQty) AS units, COUNT(DISTINCT CASE WHEN RefundStatus='Return' AND FulfilmentStatus='Return' THEN OrderId END) AS returns FROM q WHERE Channel='Flipkart' GROUP BY sub`,
    fkDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, COUNT(DISTINCT CASE WHEN RefundStatus='Return' AND FulfilmentStatus='Return' THEN OrderId END) AS returns FROM q WHERE Channel='Flipkart' GROUP BY date, sub ORDER BY date`,
    fkStatus: `WITH q AS (${base}) SELECT FulfilmentStatus AS status, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders FROM q WHERE Channel='Flipkart' AND FulfilmentStatus IS NOT NULL GROUP BY status, sub ORDER BY orders DESC`,
    fkSKUs: `WITH q AS (${base}) SELECT ChannelSKUCode AS sku, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Flipkart' AND ChannelSKUCode IS NOT NULL GROUP BY sku, sub ORDER BY rev DESC LIMIT 30`,
    fkCategories: `WITH q AS (${base}) SELECT Category AS category, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, SUM(ItemQty) AS units, COUNT(DISTINCT CASE WHEN RefundStatus='Return' AND FulfilmentStatus='Return' THEN OrderId END) AS returns FROM q WHERE Channel='Flipkart' GROUP BY category, sub ORDER BY rev DESC`,
    fkStates: `WITH q AS (${base}) SELECT COALESCE(NULLIF(TRIM(UPPER(State)),'-'), 'OTHERS') AS state, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Flipkart' GROUP BY state, sub ORDER BY rev DESC`,
    fkCities: `WITH q AS (${base}) SELECT UPPER(TRIM(City_L2)) AS city, UPPER(TRIM(State)) AS state, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Flipkart' AND City_L2 IS NOT NULL AND TRIM(City_L2) != '' GROUP BY city, state, sub ORDER BY rev DESC LIMIT 100`,
    fkRegions: `WITH q AS (${base}) SELECT Region AS region, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Flipkart' AND Region IS NOT NULL GROUP BY region, sub ORDER BY rev DESC`,
    fkSubCategory: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, SUM(ItemQty) AS units, COUNT(DISTINCT CASE WHEN RefundStatus='Return' AND FulfilmentStatus='Return' THEN OrderId END) AS returns FROM q WHERE Channel='Flipkart' AND Category IS NOT NULL GROUP BY category, subcategory, sub ORDER BY rev DESC`,
    fkSKUMatrix: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, MasterSKU AS sku, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, SUM(ItemQty) AS units FROM q WHERE Channel='Flipkart' AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != '' GROUP BY category, subcategory, sku, sub ORDER BY rev DESC LIMIT 300`,
    fkDailyCat: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, Category AS category, SubCategory AS subcategory, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Flipkart' AND Category IS NOT NULL GROUP BY date, category, subcategory, sub ORDER BY date`,
    amzSCDailyCat: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, Category AS category, SubCategory AS subcategory, CASE WHEN fulfillment_channel='Amazon' THEN 'FBA' ELSE 'MFN' END AS ch, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE SubChannel='Amazon Seller Central' AND FinancialStatus != 'Cancelled' AND Category IS NOT NULL GROUP BY date, category, subcategory, ch ORDER BY date`,
    amzVCDailyCat: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, Category AS category, SubCategory AS subcategory, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE SubChannel='Amazon Vendor Central' AND Category IS NOT NULL GROUP BY date, category, subcategory ORDER BY date`,
    blTotals: `WITH q AS (${base}) SELECT SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, COUNT(DISTINCT SubCategory) AS skus, COUNT(DISTINCT City) AS cities, COUNT(DISTINCT OrderDate) AS days FROM q WHERE Channel='Blinkit'`,
    blDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Blinkit' GROUP BY date ORDER BY date`,
    blCategories: `WITH q AS (${base}) SELECT Category AS category, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, COUNT(DISTINCT ChannelSKUCode) AS skus FROM q WHERE Channel='Blinkit' GROUP BY category ORDER BY rev DESC`,
    blSubCategories: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Blinkit' AND Category IS NOT NULL GROUP BY category, subcategory ORDER BY rev DESC`,
    blStates: `WITH q AS (${base}) SELECT COALESCE(NULLIF(TRIM(UPPER(State)),'-'),'OTHERS') AS state, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Blinkit' AND State IS NOT NULL GROUP BY state ORDER BY rev DESC`,
    blSKUs: `WITH q AS (${base}), names AS (SELECT DISTINCT TRIM(CAST(item_id AS STRING)) AS item_id, item_name FROM \`frido-429506.partnerbizz_reports_v2.sales\`) SELECT q.ChannelSKUCode AS item_id, COALESCE(MAX(n.item_name), q.ChannelSKUCode) AS item_name, SUM(q.ItemQty) AS units, ROUND(SUM(q.SellingPrice_Inc_GST),0) AS rev, COUNT(DISTINCT q.City) AS cities FROM q LEFT JOIN names n ON q.ChannelSKUCode = n.item_id WHERE q.Channel='Blinkit' GROUP BY item_id ORDER BY rev DESC`,
    blSKUMatrix: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, MasterSKU AS sku, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Blinkit' AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != '' GROUP BY category, subcategory, sku ORDER BY rev DESC LIMIT 300`,
    blCities: `WITH q AS (${base}) SELECT City AS city_name, Region AS region, City_Tier AS city_tier, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, COUNT(DISTINCT ChannelSKUCode) AS skus FROM q WHERE Channel='Blinkit' AND City IS NOT NULL GROUP BY city_name, region, city_tier ORDER BY rev DESC`,
    inTotals: `WITH q AS (${base}) SELECT SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, COUNT(DISTINCT SubCategory) AS skus, COUNT(DISTINCT City) AS cities, COUNT(DISTINCT OrderDate) AS days FROM q WHERE Channel='Instamart'`,
    inDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Instamart' GROUP BY date ORDER BY date`,
    inCategories: `WITH q AS (${base}) SELECT Category AS category, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, COUNT(DISTINCT ChannelSKUCode) AS skus FROM q WHERE Channel='Instamart' GROUP BY category ORDER BY rev DESC`,
    inSubCategories: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Instamart' AND Category IS NOT NULL GROUP BY category, subcategory ORDER BY rev DESC`,
    inStates: `WITH q AS (${base}) SELECT COALESCE(NULLIF(TRIM(UPPER(State)),'-'),'OTHERS') AS state, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Instamart' AND State IS NOT NULL GROUP BY state ORDER BY rev DESC`,
    inSKUs: `WITH q AS (${base}), names AS (SELECT DISTINCT TRIM(productid) AS productid, channelproductname FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\` WHERE TRIM(channelname)='Instamart') SELECT q.ChannelSKUCode AS item_id, COALESCE(MAX(n.channelproductname), q.ChannelSKUCode) AS item_name, SUM(q.ItemQty) AS units, ROUND(SUM(q.SellingPrice_Inc_GST),0) AS rev, COUNT(DISTINCT q.City) AS cities FROM q LEFT JOIN names n ON q.ChannelSKUCode = n.productid WHERE q.Channel='Instamart' AND q.ChannelSKUCode IS NOT NULL GROUP BY item_id ORDER BY rev DESC`,
    inSKUMatrix: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, MasterSKU AS sku, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Instamart' AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != '' GROUP BY category, subcategory, sku ORDER BY rev DESC LIMIT 300`,
    inCities: `WITH q AS (${base}) SELECT City AS city_name, Region AS region, City_Tier AS city_tier, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, COUNT(DISTINCT ChannelSKUCode) AS skus FROM q WHERE Channel='Instamart' AND City IS NOT NULL GROUP BY city_name, region, city_tier ORDER BY rev DESC`,
    zpTotals: `WITH q AS (${base}), zraw AS (SELECT SUM(CAST(orders AS FLOAT64)) AS total_orders FROM \`frido-429506.production.zepto_sales_report\` WHERE date BETWEEN '${start}' AND '${end}') SELECT SUM(q.ItemQty) AS units, ROUND(SUM(q.SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(q.SellingPrice_Exc_GST),0) AS exc_rev, COUNT(DISTINCT q.SubCategory) AS skus, COUNT(DISTINCT q.City) AS cities, COUNT(DISTINCT q.OrderDate) AS days, (SELECT total_orders FROM zraw) AS orders FROM q WHERE q.Channel='Zepto'`,
    zpDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Zepto' GROUP BY date ORDER BY date`,
    zpCategories: `WITH q AS (${base}) SELECT Category AS category, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, COUNT(DISTINCT ChannelSKUCode) AS skus FROM q WHERE Channel='Zepto' GROUP BY category ORDER BY rev DESC`,
    zpSubCategories: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Zepto' AND Category IS NOT NULL GROUP BY category, subcategory ORDER BY rev DESC`,
    zpStates: `WITH q AS (${base}) SELECT COALESCE(NULLIF(TRIM(UPPER(State)),'-'),'OTHERS') AS state, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Zepto' AND State IS NOT NULL GROUP BY state ORDER BY rev DESC`,
    zpSKUs: `WITH q AS (${base}), names AS (SELECT DISTINCT TRIM(sku_number) AS sku_number, sku_name FROM \`frido-429506.production.zepto_sales_report\`) SELECT q.ChannelSKUCode AS item_id, COALESCE(MAX(n.sku_name), q.ChannelSKUCode) AS item_name, SUM(q.ItemQty) AS units, ROUND(SUM(q.SellingPrice_Inc_GST),0) AS rev, COUNT(DISTINCT q.City) AS cities FROM q LEFT JOIN names n ON q.ChannelSKUCode = n.sku_number WHERE q.Channel='Zepto' AND q.ChannelSKUCode IS NOT NULL GROUP BY item_id ORDER BY rev DESC`,
    zpSKUMatrix: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, MasterSKU AS sku, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Zepto' AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != '' GROUP BY category, subcategory, sku ORDER BY rev DESC LIMIT 300`,
    zpCities: `WITH q AS (${base}) SELECT City AS city_name, Region AS region, City_Tier AS city_tier, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, COUNT(DISTINCT ChannelSKUCode) AS skus FROM q WHERE Channel='Zepto' AND City IS NOT NULL GROUP BY city_name, region, city_tier ORDER BY rev DESC`,
    crTotals: `WITH q AS (${base}) SELECT COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, COUNT(DISTINCT SubCategory) AS skus, COUNT(DISTINCT City) AS cities, COUNT(DISTINCT OrderDate) AS days FROM q WHERE Channel='CRED'`,
    crDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='CRED' GROUP BY date ORDER BY date`,
    crSKUs: `WITH q AS (${base}) SELECT ChannelSKUCode AS sku, MAX(COALESCE(NULLIF(TRIM(ChannelSKUCode),''), ChannelSKUCode)) AS sku_name, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='CRED' AND ChannelSKUCode IS NOT NULL GROUP BY sku ORDER BY rev DESC LIMIT 30`,
    crCategories: `WITH q AS (${base}) SELECT Category AS category, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='CRED' GROUP BY category ORDER BY rev DESC`,
    crSubCategories: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='CRED' GROUP BY category, subcategory ORDER BY rev DESC`,
    crSKUMatrix: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, MasterSKU AS sku, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='CRED' AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != '' GROUP BY category, subcategory, sku ORDER BY rev DESC LIMIT 300`,
    crStates: `WITH q AS (${base}) SELECT INITCAP(TRIM(State)) AS state, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='CRED' AND State IS NOT NULL GROUP BY state ORDER BY rev DESC`,
    crRegion: `WITH q AS (${base}), sm AS (SELECT DISTINCT State, Region FROM \`frido-429506.production.pincode_city_master\` WHERE State IS NOT NULL AND Region IS NOT NULL) SELECT sm.Region AS region, COUNT(DISTINCT q.OrderId) AS orders, ROUND(SUM(q.SellingPrice_Inc_GST),0) AS rev, SUM(q.ItemQty) AS units FROM q JOIN sm ON UPPER(TRIM(q.State)) = UPPER(TRIM(sm.State)) WHERE q.Channel='CRED' GROUP BY region ORDER BY rev DESC`,
    crTier: `WITH q AS (${base}), tm AS (SELECT DISTINCT State, City_Tier, Tier_Label FROM \`frido-429506.production.pincode_city_master\` WHERE State IS NOT NULL AND City_Tier IS NOT NULL) SELECT tm.City_Tier AS city_tier, tm.Tier_Label AS tier_label, COUNT(DISTINCT q.OrderId) AS orders, ROUND(SUM(q.SellingPrice_Inc_GST),0) AS rev, SUM(q.ItemQty) AS units FROM q JOIN tm ON UPPER(TRIM(q.State)) = UPPER(TRIM(tm.State)) WHERE q.Channel='CRED' GROUP BY city_tier, tier_label ORDER BY city_tier`,
    crStatus: `WITH q AS (${base}) SELECT FulfilmentStatus AS status, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='CRED' AND FulfilmentStatus IS NOT NULL GROUP BY status ORDER BY orders DESC`,
    crCities: `WITH q AS (${base}) SELECT INITCAP(TRIM(City)) AS city, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='CRED' AND City IS NOT NULL AND TRIM(City) != '' GROUP BY city ORDER BY rev DESC LIMIT 50`,
    fcTotals: `WITH q AS (${base}) SELECT COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, COUNT(DISTINCT SubCategory) AS skus, COUNT(DISTINCT City) AS cities, COUNT(DISTINCT OrderDate) AS days FROM q WHERE Channel='Firstcry'`,
    fcDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Firstcry' GROUP BY date ORDER BY date`,
    fcSKUs: `WITH q AS (${base}) SELECT ChannelSKUCode AS sku, MAX(COALESCE(NULLIF(TRIM(ChannelSKUCode),''), ChannelSKUCode)) AS sku_name, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Firstcry' AND ChannelSKUCode IS NOT NULL GROUP BY sku ORDER BY rev DESC LIMIT 30`,
    fcCategories: `WITH q AS (${base}) SELECT Category AS category, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Firstcry' GROUP BY category ORDER BY rev DESC`,
    fcSubCategories: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Firstcry' GROUP BY category, subcategory ORDER BY rev DESC`,
    fcSKUMatrix: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, MasterSKU AS sku, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Firstcry' AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != '' GROUP BY category, subcategory, sku ORDER BY rev DESC LIMIT 300`,
    fcStates: `WITH q AS (${base}) SELECT INITCAP(TRIM(State)) AS state, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Firstcry' AND State IS NOT NULL GROUP BY state ORDER BY rev DESC`,
    fcRegion: `WITH q AS (${base}), sm AS (SELECT DISTINCT State, Region FROM \`frido-429506.production.pincode_city_master\` WHERE State IS NOT NULL AND Region IS NOT NULL) SELECT sm.Region AS region, COUNT(DISTINCT q.OrderId) AS orders, ROUND(SUM(q.SellingPrice_Inc_GST),0) AS rev, SUM(q.ItemQty) AS units FROM q JOIN sm ON UPPER(TRIM(q.State)) = UPPER(TRIM(sm.State)) WHERE q.Channel='Firstcry' GROUP BY region ORDER BY rev DESC`,
    fcTier: `WITH q AS (${base}), tm AS (SELECT DISTINCT State, City_Tier, Tier_Label FROM \`frido-429506.production.pincode_city_master\` WHERE State IS NOT NULL AND City_Tier IS NOT NULL) SELECT tm.City_Tier AS city_tier, tm.Tier_Label AS tier_label, COUNT(DISTINCT q.OrderId) AS orders, ROUND(SUM(q.SellingPrice_Inc_GST),0) AS rev, SUM(q.ItemQty) AS units FROM q JOIN tm ON UPPER(TRIM(q.State)) = UPPER(TRIM(tm.State)) WHERE q.Channel='Firstcry' GROUP BY city_tier, tier_label ORDER BY city_tier`,
    fcStatus: `WITH q AS (${base}) SELECT FulfilmentStatus AS status, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Firstcry' AND FulfilmentStatus IS NOT NULL GROUP BY status ORDER BY orders DESC`,
    fcCities: `WITH q AS (${base}) SELECT INITCAP(TRIM(City)) AS city, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Firstcry' AND City IS NOT NULL AND TRIM(City) != '' GROUP BY city ORDER BY rev DESC LIMIT 50`,
    mnTotals: `WITH q AS (${base}) SELECT COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, COUNT(DISTINCT SubCategory) AS skus, COUNT(DISTINCT City) AS cities, COUNT(DISTINCT OrderDate) AS days FROM q WHERE Channel='Myntra'`,
    mnDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Myntra' GROUP BY date ORDER BY date`,
    mnStatus: `WITH q AS (${base}) SELECT FulfilmentStatus AS status, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Myntra' AND FulfilmentStatus IS NOT NULL GROUP BY status ORDER BY orders DESC`,
    mnCategories: `WITH q AS (${base}) SELECT Category AS category, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Myntra' GROUP BY category ORDER BY rev DESC`,
    mnSubCategories: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Myntra' AND SubCategory IS NOT NULL GROUP BY category, subcategory ORDER BY rev DESC`,
    mnSKUMatrix: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, ChannelSKUCode AS sku, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, COUNT(DISTINCT OrderId) AS orders FROM q WHERE Channel='Myntra' AND ChannelSKUCode IS NOT NULL GROUP BY category, subcategory, sku ORDER BY rev DESC`,
    mnSKUs: `WITH q AS (${base}) SELECT ChannelSKUCode AS sku, Category AS category, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='Myntra' AND ChannelSKUCode IS NOT NULL GROUP BY sku, category ORDER BY rev DESC LIMIT 30`,
    mnStates: `WITH q AS (${base}) SELECT INITCAP(TRIM(State)) AS state, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Myntra' AND State IS NOT NULL GROUP BY state ORDER BY rev DESC`,
    mnCities: `WITH q AS (${base}) SELECT City AS city, Region AS region, City_Tier AS city_tier, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Myntra' AND City IS NOT NULL GROUP BY city, region, city_tier ORDER BY rev DESC LIMIT 30`,
    prevMn: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, COUNT(DISTINCT OrderId) AS orders FROM q WHERE Channel='Myntra'`,
    prevMnDaily: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Myntra' GROUP BY date ORDER BY date`,
    masterSkuList: `SELECT DISTINCT TRIM(Product_Code) AS sku FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\` WHERE TRIM(Product_Code) != '' ORDER BY sku`,
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
        entry[x.Channel] = parseFloat(x.rev) || 0
        entry[x.Channel + '_o'] = parseInt(x.orders) || 0
        entry[x.Channel + '_u'] = parseInt(x.units) || 0
      })
      return entry
    })

    const catMap = {}
    r.byCategory.forEach(x => { catMap[x.Category || 'Unknown'] = { rev: parseFloat(x.rev) || 0, excRev: parseFloat(x.exc_rev) || 0, orders: { size: parseInt(x.orders) }, units: parseInt(x.units) || 0 } })

    const subCatMap = {}
    r.bySubCategory.forEach(x => { const key = `${x.Category || 'Unknown'}::${x.SubCategory || 'Unknown'}`; subCatMap[key] = { rev: parseFloat(x.rev) || 0, orders: { size: parseInt(x.orders) || 0 }, units: parseInt(x.units) || 0 } })

    const catChannelMap = {}
    r.byCategoryChannel.forEach(x => {
      const cat = x.Category || 'Unknown'
      if (!catChannelMap[cat]) catChannelMap[cat] = {}
      catChannelMap[cat][x.Channel] = parseFloat(x.rev) || 0
    })

    const subCatChannelMap = {}
    ;(r.bySubCategoryChannel || []).forEach(x => {
      const cat = x.Category || 'Unknown'
      const sc = x.SubCategory || 'Unknown'
      const ch = x.Channel
      if (!ch) return
      if (!subCatChannelMap[cat]) subCatChannelMap[cat] = {}
      if (!subCatChannelMap[cat][sc]) subCatChannelMap[cat][sc] = {}
      subCatChannelMap[cat][sc][ch] = (subCatChannelMap[cat][sc][ch] || 0) + (parseFloat(x.rev) || 0)
    })

    const stateMap = {}
    r.byState.forEach(x => { if (!x.state) return; stateMap[x.state] = { rev: parseFloat(x.rev) || 0, orders: parseInt(x.orders) || 0, cities: { size: parseInt(x.cities) } } })

    const cityRows = (r.byCity || []).map(x => ({ city: x.city, state: x.state, region: x.region || '', cityTier: x.city_tier || '', orders: parseInt(x.orders) || 0, rev: parseFloat(x.rev) || 0 }))
    const regionRows = (r.byRegion || []).map(x => ({ region: x.region, orders: parseInt(x.orders) || 0, rev: parseFloat(x.rev) || 0, units: parseInt(x.units) || 0 }))
    const tierRows = (r.byTier || []).map(x => ({ tier: parseInt(x.city_tier) || x.city_tier, label: x.tier_label, orders: parseInt(x.orders) || 0, rev: parseFloat(x.rev) || 0, units: parseInt(x.units) || 0 }))
    const skuRows = (r.bySKU || []).map(x => ({ sku: x.sku, category: x.category || '', subCategory: x.subcategory || '', channel: x.channel || '', units: parseInt(x.units) || 0, orders: parseInt(x.orders) || 0, rev: parseFloat(x.rev) || 0 }))

    const financialStatusMap = {}
    r.byFinancialStatus.forEach(x => { financialStatusMap[x.financial_status || 'Unknown'] = { orders: parseInt(x.orders) || 0, rev: parseFloat(x.rev) || 0 } })

    const fulfilmentStatusMap = {}
    r.byFulfilmentStatus.forEach(x => { fulfilmentStatusMap[x.fulfil_status || 'Unknown'] = parseInt(x.orders) || 0 })

    const refundTrend = (r.byRefundTrend || []).map(x => ({ date: x.date, total: parseInt(x.total_orders) || 0, refunds: parseInt(x.refund_lines) || 0, rate: x.total_orders ? (parseInt(x.refund_lines) / parseInt(x.total_orders) * 100) : 0 }))
    const dailyReturnTrend = (r.byDailyReturnTrend || []).map(x => ({ date: x.date, total: parseInt(x.total_orders) || 0, rtoPct: x.total_orders ? (parseInt(x.rto_orders) / parseInt(x.total_orders) * 100) : 0, exchPct: x.total_orders ? (parseInt(x.exch_orders) / parseInt(x.total_orders) * 100) : 0, cirPct: x.total_orders ? (parseInt(x.cir_orders) / parseInt(x.total_orders) * 100) : 0 }))

    const chMap = {}
    r.byChannel.forEach(x => { chMap[x.Channel] = { rev: parseFloat(x.rev) || 0, excRev: parseFloat(x.exc_rev) || 0, orders: parseInt(x.orders) || 0, qty: parseInt(x.qty) || 0 } })

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
    r.bySubChannel.forEach(x => { subChannelMap[x.SubChannel || 'Unknown'] = { rev: parseFloat(x.rev) || 0, excRev: parseFloat(x.exc_rev) || 0, orders: parseInt(x.orders) || 0, qty: parseInt(x.qty) || 0 } })
    const paymentModeMap = {}
    r.byPaymentMode.forEach(x => { paymentModeMap[x.payment_mode] = { orders: parseInt(x.orders) || 0, rev: parseFloat(x.rev) || 0 } })

    const t = r.totals[0] || {}
    const totalRev = parseFloat(t.total_rev) || 0
    const totalExcRev = parseFloat(t.total_exc_rev) || 0
    const nOrders = parseInt(t.n_orders) || 0
    const totalQty = parseInt(t.total_qty) || 0
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
    const cancellRev = parseFloat(r.byOrderStatus?.find(x => x.order_status === 'Cancelled')?.rev) || 0
    const cirRev = parseFloat(r.byCIR?.[0]?.cir_rev) || 0
    const rtoRevDirect = parseFloat(r.byRTO?.[0]?.rto_rev) || 0
    const netRevenueCalc = totalRev - (totalRev - totalExcRev) - rtoRev - cirRev - cancellRev

    // Build flipkart block early so we can patch overall totals with estimated days
    const fkBlock = (() => {
        const fkRealDaily = (r.fkDaily || []).map(x => ({ date: x.date, sub: x.sub, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, returns: parseInt(x.returns)||0, estimated: false }))
        const fkDates = [...new Set(fkRealDaily.map(x => x.date))].sort()
        const latestFkDate = fkDates[fkDates.length - 1]
        const estimatedDaily = []
        if (latestFkDate && latestFkDate < end) {
          const subTotals = { FBF: {}, 'NON-FBF': {} }
          fkRealDaily.forEach(x => {
            const s = x.sub === 'FBF' ? 'FBF' : 'NON-FBF'
            if (!subTotals[s][x.date]) subTotals[s][x.date] = { rev: 0, orders: 0, units: 0 }
            subTotals[s][x.date].rev += x.rev; subTotals[s][x.date].orders += x.orders; subTotals[s][x.date].units += x.units
          })
          const last7Dates = fkDates.slice(-7)
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
        const realTotals = (r.fkTotals || []).map(x => ({ sub: x.sub, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, units: parseInt(x.units)||0, returns: parseInt(x.returns)||0 }))
        const patchedTotals = realTotals.map(t => {
          const e = estBySub[t.sub] || { rev: 0, orders: 0, units: 0 }
          return { ...t, rev: t.rev + e.rev, orders: t.orders + e.orders, units: t.units + e.units, excRev: t.excRev + e.rev }
        })
        if (!patchedTotals.find(t => t.sub === 'NON-FBF') && estBySub['NON-FBF'].rev > 0) patchedTotals.push({ sub: 'NON-FBF', ...estBySub['NON-FBF'], excRev: estBySub['NON-FBF'].rev })
        return { estTotalRev, estTotalOrders, estTotalUnits, latestFkDate, estimatedDays: estimatedDaily.length, daily: [...fkRealDaily, ...estimatedDaily], patchedTotals }
    })()

    // Patch overall totals with Flipkart estimated days
    const adjTotalRev = totalRev + fkBlock.estTotalRev
    const adjTotalExcRev = totalExcRev + fkBlock.estTotalRev
    const adjNOrders = nOrders + fkBlock.estTotalOrders
    const adjTotalQty = totalQty + fkBlock.estTotalUnits
    if (chMap['Flipkart']) {
      chMap['Flipkart'].rev += fkBlock.estTotalRev
      chMap['Flipkart'].excRev += fkBlock.estTotalRev
      chMap['Flipkart'].orders += fkBlock.estTotalOrders
      chMap['Flipkart'].qty += fkBlock.estTotalUnits
    }
    // Patch dailyArr for all-channels chart
    fkBlock.daily.filter(x => x.estimated).forEach(x => {
      const entry = dailyArr.find(d => d.date === x.date)
      if (entry) { entry['Flipkart'] = (entry['Flipkart'] || 0) + x.rev; entry['Flipkart_o'] = (entry['Flipkart_o'] || 0) + x.orders; entry['Flipkart_u'] = (entry['Flipkart_u'] || 0) + x.units }
      else dailyArr.push({ date: x.date, Flipkart: x.rev, Flipkart_o: x.orders, Flipkart_u: x.units })
    })
    dailyArr.sort((a, b) => a.date?.localeCompare(b.date))

    const payload = {
      source: 'postgres-aggregated',
      prevRev: parseFloat(r.prevTotals?.[0]?.total_rev) || 0,
      prevExcRev: parseFloat(r.prevTotals?.[0]?.total_exc_rev) || 0,
      prevOrders: parseInt(r.prevTotals?.[0]?.n_orders) || 0,
      prevQty: parseInt(r.prevTotals?.[0]?.total_qty) || 0,
      prevRtoOrders: parseInt(r.prevTotals?.[0]?.rto_orders) || 0,
      prevCirOrders: parseInt(r.prevTotals?.[0]?.cir_orders) || 0,
      prevDailyArr: (r.prevByDate || []).map(x => ({ date: x.date, rev: parseFloat(x.rev) || 0 })),
      prevChMap: Object.fromEntries((r.prevByChannel || []).map(x => [x.Channel, parseFloat(x.rev) || 0])),
      totalRev: adjTotalRev, totalExcRev: adjTotalExcRev, totalQty: adjTotalQty, nOrders: adjNOrders, nDays,
      blendedAOV: adjNOrders ? adjTotalRev / adjNOrders : 0,
      gstCollected: adjTotalRev - adjTotalExcRev,
      rtoRev, cancellRev, cirRev, rtoRevDirect, netRevenueCalc,
      cirOrders: parseInt(r.byCIR?.[0]?.cir_orders) || 0,
      exchangeOrders: parseInt(r.byExchange?.[0]?.exchange_orders) || 0,
      momRev, yoyRev, momOrders, yoyOrders,
      momPeriod: `${moms} → ${mome}`, yoyPeriod: `${yoys} → ${yoye}`,
      nCusts, repeatCusts,
      uniqueDates: dateSet,
      dailyArr, chMap, catMap, subCatMap, stateMap, cityRows, regionRows, tierRows, catChannelMap, subCatChannelMap, orderStatusMap, orderStatusRevMap,
      buckets, bucketRev, voucherMap, subChannelMap, paymentModeMap, tatOrders: [],
      htCount, htRev: htRevAgg, multiItemOrders,
      financialStatusMap, fulfilmentStatusMap, refundTrend, dailyReturnTrend,
      voucherList: (r.byVoucherRaw || []).map(x => ({ code: x.voucher_code, orders: parseInt(x.orders) || 0 })),
      orders, skuRows, rows: [],
      masterSkuList: (r.masterSkuList || []).map(x => x.sku).filter(Boolean),
      shopify: {
        prevRev: parseFloat(r.prevShopify?.[0]?.rev) || 0,
        prevExcRev: parseFloat(r.prevShopify?.[0]?.exc_rev) || 0,
        prevOrders: parseInt(r.prevShopify?.[0]?.orders) || 0,
        prevUnits: parseInt(r.prevShopify?.[0]?.units) || 0,
        prevRtoOrders: parseInt(r.prevShopify?.[0]?.rto_orders) || 0,
        prevCirOrders: parseInt(r.prevShopify?.[0]?.cir_orders) || 0,
        prevExchangeOrders: parseInt(r.prevShopify?.[0]?.exchange_orders) || 0,
        prevCancelledOrders: parseInt(r.prevShopifyCancel?.[0]?.cancelled_orders) || 0,
        prevDaily: (r.prevShopifyDaily || []).map(x => ({ date: x.date, rev: parseFloat(x.rev) || 0 })),
        catMap: Object.fromEntries((r.shCategory || []).map(x => [x.Category || 'Unknown', { rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, orders: { size: parseInt(x.orders)||0 }, units: parseInt(x.units)||0, cancelled: parseInt(x.cancelled)||0, rto: parseInt(x.rto)||0, cir: parseInt(x.cir)||0, exch: parseInt(x.exch)||0 }])),
        subCatMap: Object.fromEntries((r.shSubCategory || []).map(x => [`${x.Category||'Unknown'}::${x.SubCategory||'Unknown'}`, { rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, orders: { size: parseInt(x.orders)||0 }, units: parseInt(x.units)||0, cancelled: parseInt(x.cancelled)||0, rto: parseInt(x.rto)||0, cir: parseInt(x.cir)||0, exch: parseInt(x.exch)||0 }])),
        skuMap: (() => { const m = {}; (r.shSKU || []).forEach(x => { const cat = x.Category||'Unknown', sc = x.SubCategory||'Unknown', sku = x.sku; if (!m[cat]) m[cat] = {}; if (!m[cat][sc]) m[cat][sc] = {}; m[cat][sc][sku] = { rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, cancelled: parseInt(x.cancelled)||0, rto: parseInt(x.rto)||0, cir: parseInt(x.cir)||0, exch: parseInt(x.exch)||0 } }); return m })(),
        stateMap: Object.fromEntries((r.shState || []).filter(x => x.state).map(x => [x.state, { rev: parseFloat(x.rev)||0, orders: parseInt(x.orders)||0, cities: { size: parseInt(x.cities)||0 } }])),
        cityRows: (r.shCity || []).map(x => ({ city: x.city, state: x.state || '', region: x.region || '', orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })).filter(x => x.city),
        regionRows: (r.shRegion || []).map(x => ({ region: x.region, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: parseInt(x.units)||0 })),
        tierRows: (r.shTier || []).map(x => ({ tier: parseInt(x.city_tier)||x.city_tier, label: x.tier_label, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: parseInt(x.units)||0 })),
        topStates: (r.shState || []).slice(0, 6).filter(x => x.state).map(x => ({ name: x.state, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: 0 })),
      },
      amzSC: {
        totalOrders: parseInt(r.amzSCTotals?.[0]?.orders) || 0,
        totalUnits: parseInt(r.amzSCTotals?.[0]?.units) || 0,
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
        states: (r.amzSCStates || []).map(x => ({ state: x.ship_state, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        skus: (r.amzSCSKUs || []).map(x => ({ sku: x.sku, asin: x.asin, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0 })),
        daily: (r.amzSCDaily || []).map(x => ({ date: x.date, type: x.fulfillment_channel === 'Amazon' ? 'FBA' : 'MFN', orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0 })),
        returnRate: (() => {
          const d = r.amzSCReturnRate?.[0]
          const total = parseInt(d?.total_orders) || 0
          const returned = parseInt(d?.returned_orders) || 0
          return { total, returned, pct: total > 0 ? parseFloat((returned / total * 100).toFixed(2)) : 0 }
        })(),
        regionRows: (r.amzSCRegion || []).map(x => ({ region: x.region, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: parseInt(x.units)||0 })),
        tierRows: (r.amzSCTier || []).map(x => ({ tier: parseInt(x.city_tier)||x.city_tier, label: x.tier_label, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: parseInt(x.units)||0 })),
        topStates: (r.amzSCStates || []).slice(0, 6).map(x => ({ name: x.ship_state, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: 0 })),
        cities: (r.amzSCCities || []).map(x => ({ city: x.city, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        catChannel: (() => {
          const retMap = {}
          ;(r.amzSCReturnCat || []).forEach(x => { retMap[x.Category] = { orders: parseInt(x.orders)||0, returned: parseInt(x.returned)||0 } })
          const map = {}
          ;(r.amzSCCatChannel || []).forEach(x => {
            if (!map[x.Category]) map[x.Category] = {}
            map[x.Category][x.ch] = { rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, units: parseInt(x.units)||0, orders: parseInt(x.orders)||0 }
          })
          Object.keys(map).forEach(cat => {
            const rd = retMap[cat] || { orders: 0, returned: 0 }
            Object.keys(map[cat]).forEach(ch => { map[cat][ch].returned = rd.returned; map[cat][ch].totalOrdersForReturn = rd.orders })
          })
          return map
        })(),
        subCatChannel: (() => {
          const retMap = {}
          ;(r.amzSCReturnSubCat || []).forEach(x => { retMap[`${x.Category}::${x.SubCategory}`] = { orders: parseInt(x.orders)||0, returned: parseInt(x.returned)||0 } })
          const map = {}
          ;(r.amzSCSubCatChannel || []).forEach(x => {
            if (!map[x.Category]) map[x.Category] = {}
            if (!map[x.Category][x.SubCategory]) map[x.Category][x.SubCategory] = {}
            map[x.Category][x.SubCategory][x.ch] = { rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, units: parseInt(x.units)||0, orders: parseInt(x.orders)||0 }
          })
          Object.keys(map).forEach(cat => Object.keys(map[cat]).forEach(sc => {
            const rd = retMap[`${cat}::${sc}`] || { orders: 0, returned: 0 }
            Object.keys(map[cat][sc]).forEach(ch => { map[cat][sc][ch].returned = rd.returned; map[cat][sc][ch].totalOrdersForReturn = rd.orders })
          }))
          return map
        })(),
        skuChannel: (() => {
          const retMap = {}
          ;(r.amzSCReturnSKU || []).forEach(x => { retMap[`${x.Category}::${x.SubCategory}::${x.sku}`] = { orders: parseInt(x.orders)||0, returned: parseInt(x.returned)||0 } })
          const map = {}
          ;(r.amzSCSKUChannel || []).forEach(x => {
            if (!map[x.Category]) map[x.Category] = {}
            if (!map[x.Category][x.SubCategory]) map[x.Category][x.SubCategory] = {}
            if (!map[x.Category][x.SubCategory][x.sku]) map[x.Category][x.SubCategory][x.sku] = {}
            map[x.Category][x.SubCategory][x.sku][x.ch] = { rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, units: parseInt(x.units)||0, orders: parseInt(x.orders)||0 }
          })
          Object.keys(map).forEach(cat => Object.keys(map[cat]).forEach(sc => Object.keys(map[cat][sc]).forEach(sku => {
            const rd = retMap[`${cat}::${sc}::${sku}`] || { orders: 0, returned: 0 }
            Object.keys(map[cat][sc][sku]).forEach(ch => { map[cat][sc][sku][ch].returned = rd.returned; map[cat][sc][sku][ch].totalOrdersForReturn = rd.orders })
          })))
          return map
        })(),
        dailyCat: (r.amzSCDailyCat || []).map(x => ({ date: x.date, category: x.category, subcategory: x.subcategory, ch: x.ch, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
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
        prevDaily: (r.prevFkDaily || []).map(x => ({ date: x.date, rev: parseFloat(x.rev) || 0 })),
        totals: fkBlock.patchedTotals,
        estTotalRev: fkBlock.estTotalRev, estTotalOrders: fkBlock.estTotalOrders, estTotalUnits: fkBlock.estTotalUnits,
        daily: fkBlock.daily,
        latestRealDate: fkBlock.latestFkDate || null,
        estimatedDays: fkBlock.estimatedDays,
        status: (r.fkStatus || []).map(x => ({ status: x.status, sub: x.sub, orders: parseInt(x.orders)||0 })),
        skus: (r.fkSKUs || []).map(x => ({ sku: x.sku, sub: x.sub, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0 })),
        categories: (r.fkCategories || []).map(x => ({ category: x.category, sub: x.sub, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: parseInt(x.units)||0, excRev: parseFloat(x.exc_rev)||0, returns: parseInt(x.returns)||0 })),
        states: (r.fkStates || []).map(x => ({ state: (!x.state || x.state.trim() === '-' || x.state.trim() === '') ? 'Others' : x.state, sub: x.sub, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        cities: (r.fkCities || []).map(x => ({ city: x.city, state: x.state, sub: x.sub, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        regions: (r.fkRegions || []).map(x => ({ region: x.region, sub: x.sub, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        subCategories: (r.fkSubCategory || []).map(x => ({ category: x.category, subcategory: x.subcategory, sub: x.sub, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, units: parseInt(x.units)||0, returns: parseInt(x.returns)||0 })),
        dailyCat: (r.fkDailyCat || []).map(x => ({ date: x.date, category: x.category, subcategory: x.subcategory, sub: x.sub, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        skuMatrix: (() => {
          const map = {}
          ;(r.fkSKUMatrix || []).forEach(x => {
            const cat = x.category || 'Unknown', sc = x.subcategory || 'Unknown', sku = x.sku, sub = x.sub
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
        skuMatrix: (() => { const m = {}; (r.crSKUMatrix||[]).forEach(x => { const cat=x.category||'Unknown', sc=x.subcategory||'Unknown', sku=x.sku; if(!m[cat])m[cat]={}; if(!m[cat][sc])m[cat][sc]={}; m[cat][sc][sku]={rev:parseFloat(x.rev)||0,excRev:parseFloat(x.exc_rev)||0,units:parseInt(x.units)||0,orders:parseInt(x.orders)||0} }); return m })(),
        states: (r.crStates || []).map(x => ({ state: x.state, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        status: (r.crStatus || []).map(x => ({ status: x.status, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        cities: (r.crCities || []).map(x => ({ city: x.city, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        regionRows: (r.crRegion || []).map(x => ({ name: x.region, region: x.region, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: parseInt(x.units)||0 })),
        tierRows: (r.crTier || []).map(x => ({ name: `Tier ${x.city_tier}`, tier: parseInt(x.city_tier)||x.city_tier, label: x.tier_label, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: parseInt(x.units)||0 })),
      },
      firstcry: {
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
        skuMatrix: (() => { const m = {}; (r.fcSKUMatrix||[]).forEach(x => { const cat=x.category||'Unknown', sc=x.subcategory||'Unknown', sku=x.sku; if(!m[cat])m[cat]={}; if(!m[cat][sc])m[cat][sc]={}; m[cat][sc][sku]={rev:parseFloat(x.rev)||0,excRev:parseFloat(x.exc_rev)||0,units:parseInt(x.units)||0,orders:parseInt(x.orders)||0} }); return m })(),
        states: (r.fcStates || []).map(x => ({ state: x.state, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        status: (r.fcStatus || []).map(x => ({ status: x.status, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        cities: (r.fcCities || []).map(x => ({ city: x.city, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        regionRows: (r.fcRegion || []).map(x => ({ name: x.region, region: x.region, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: parseInt(x.units)||0 })),
        tierRows: (r.fcTier || []).map(x => ({ name: `Tier ${x.city_tier}`, tier: parseInt(x.city_tier)||x.city_tier, label: x.tier_label, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: parseInt(x.units)||0 })),
      },
      zepto: {
        prevRev: parseFloat(r.prevZp?.[0]?.rev) || 0,
        prevExcRev: parseFloat(r.prevZp?.[0]?.exc_rev) || 0,
        prevUnits: parseInt(r.prevZp?.[0]?.units) || 0,
        prevSkus: parseInt(r.prevZp?.[0]?.skus) || 0,
        prevCities: parseInt(r.prevZp?.[0]?.cities) || 0,
        prevDaily: (r.prevZpDaily || []).map(x => ({ date: x.date, rev: parseFloat(x.rev) || 0 })),
        totals: r.zpTotals?.[0] ? { units: parseInt(r.zpTotals[0].units)||0, orders: parseInt(r.zpTotals[0].orders)||0, rev: parseFloat(r.zpTotals[0].rev)||0, excRev: parseFloat(r.zpTotals[0].exc_rev)||0, skus: parseInt(r.zpTotals[0].skus)||0, cities: parseInt(r.zpTotals[0].cities)||0, days: parseInt(r.zpTotals[0].days)||0 } : {},
        daily: (r.zpDaily || []).map(x => ({ date: x.date, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        categories: (r.zpCategories || []).map(x => ({ category: x.category, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, skus: parseInt(x.skus)||0 })),
        subCategories: (r.zpSubCategories || []).map(x => ({ category: x.category, subcategory: x.subcategory, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        skus: (r.zpSKUs || []).map(x => ({ itemId: x.item_id, name: x.item_name, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, cities: parseInt(x.cities)||0 })),
        skuMatrix: (() => { const m = {}; (r.zpSKUMatrix||[]).forEach(x => { const cat=x.category||'Unknown', sc=x.subcategory||'Unknown', sku=x.sku; if(!m[cat])m[cat]={}; if(!m[cat][sc])m[cat][sc]={}; if(!m[cat][sc][sku])m[cat][sc][sku]={rev:0,excRev:0,units:0}; m[cat][sc][sku].rev+=parseFloat(x.rev)||0; m[cat][sc][sku].excRev+=parseFloat(x.exc_rev)||0; m[cat][sc][sku].units+=parseInt(x.units)||0 }); return m })(),
        cities: (r.zpCities || []).map(x => ({ city: x.city_name, region: x.region || '', cityTier: x.city_tier || '', units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, skus: parseInt(x.skus)||0 })),
        states: (r.zpStates || []).map(x => ({ state: x.state?.charAt(0).toUpperCase()+x.state?.slice(1).toLowerCase(), units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0 })),
      },
      instamart: {
        prevRev: parseFloat(r.prevIn?.[0]?.rev) || 0,
        prevExcRev: parseFloat(r.prevIn?.[0]?.exc_rev) || 0,
        prevUnits: parseInt(r.prevIn?.[0]?.units) || 0,
        prevSkus: parseInt(r.prevIn?.[0]?.skus) || 0,
        prevCities: parseInt(r.prevIn?.[0]?.cities) || 0,
        prevDaily: (r.prevInDaily || []).map(x => ({ date: x.date, rev: parseFloat(x.rev) || 0 })),
        totals: r.inTotals?.[0] ? { units: parseInt(r.inTotals[0].units)||0, rev: parseFloat(r.inTotals[0].rev)||0, excRev: parseFloat(r.inTotals[0].exc_rev)||0, skus: parseInt(r.inTotals[0].skus)||0, cities: parseInt(r.inTotals[0].cities)||0, days: parseInt(r.inTotals[0].days)||0 } : {},
        daily: (r.inDaily || []).map(x => ({ date: x.date, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        categories: (r.inCategories || []).map(x => ({ category: x.category, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, skus: parseInt(x.skus)||0 })),
        subCategories: (r.inSubCategories || []).map(x => ({ category: x.category, subcategory: x.subcategory, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        skus: (r.inSKUs || []).map(x => ({ itemId: x.item_id, name: x.item_name, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, cities: parseInt(x.cities)||0 })),
        skuMatrix: (() => { const m = {}; (r.inSKUMatrix||[]).forEach(x => { const cat=x.category||'Unknown', sc=x.subcategory||'Unknown', sku=x.sku; if(!m[cat])m[cat]={}; if(!m[cat][sc])m[cat][sc]={}; if(!m[cat][sc][sku])m[cat][sc][sku]={rev:0,excRev:0,units:0}; m[cat][sc][sku].rev+=parseFloat(x.rev)||0; m[cat][sc][sku].excRev+=parseFloat(x.exc_rev)||0; m[cat][sc][sku].units+=parseInt(x.units)||0 }); return m })(),
        cities: (r.inCities || []).map(x => ({ city: x.city_name, region: x.region || '', cityTier: x.city_tier || '', units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, skus: parseInt(x.skus)||0 })),
        states: (r.inStates || []).map(x => ({ state: x.state?.charAt(0).toUpperCase()+x.state?.slice(1).toLowerCase(), units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0 })),
      },
      myntra: {
        prevRev: parseFloat(r.prevMn?.[0]?.rev) || 0,
        prevExcRev: parseFloat(r.prevMn?.[0]?.exc_rev) || 0,
        prevOrders: parseInt(r.prevMn?.[0]?.orders) || 0,
        prevDaily: (r.prevMnDaily || []).map(x => ({ date: x.date, rev: parseFloat(x.rev) || 0 })),
        totals: r.mnTotals?.[0] ? { orders: parseInt(r.mnTotals[0].orders)||0, units: parseInt(r.mnTotals[0].units)||0, rev: parseFloat(r.mnTotals[0].rev)||0, excRev: parseFloat(r.mnTotals[0].exc_rev)||0, skus: parseInt(r.mnTotals[0].skus)||0, cities: parseInt(r.mnTotals[0].cities)||0, days: parseInt(r.mnTotals[0].days)||0 } : {},
        daily: (r.mnDaily || []).map(x => ({ date: x.date, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        status: (r.mnStatus || []).map(x => ({ status: x.status, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        categories: (r.mnCategories || []).map(x => ({ category: x.category, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        subCategories: (r.mnSubCategories || []).map(x => ({ category: x.category, subcategory: x.subcategory, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        skuMatrix: (() => { const m = {}; (r.mnSKUMatrix||[]).forEach(x => { const cat=x.category||'Unknown', sc=x.subcategory||'Unknown', sku=x.sku; if(!m[cat])m[cat]={}; if(!m[cat][sc])m[cat][sc]={}; m[cat][sc][sku]={rev:parseFloat(x.rev)||0,excRev:parseFloat(x.exc_rev)||0,units:parseInt(x.units)||0,orders:parseInt(x.orders)||0} }); return m })(),
        skus: (r.mnSKUs || []).map(x => ({ sku: x.sku, category: x.category || '', orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        states: (r.mnStates || []).map(x => ({ state: x.state, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        cities: (r.mnCities || []).map(x => ({ city: x.city, region: x.region || '', cityTier: x.city_tier || '', orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
      },
      blinkit: {
        prevRev: parseFloat(r.prevBl?.[0]?.rev) || 0,
        prevExcRev: parseFloat(r.prevBl?.[0]?.exc_rev) || 0,
        prevUnits: parseInt(r.prevBl?.[0]?.units) || 0,
        prevSkus: parseInt(r.prevBl?.[0]?.skus) || 0,
        prevCities: parseInt(r.prevBl?.[0]?.cities) || 0,
        totals: r.blTotals?.[0] ? { units: parseInt(r.blTotals[0].units)||0, rev: parseFloat(r.blTotals[0].rev)||0, excRev: parseFloat(r.blTotals[0].exc_rev)||0, skus: parseInt(r.blTotals[0].skus)||0, cities: parseInt(r.blTotals[0].cities)||0, days: parseInt(r.blTotals[0].days)||0 } : {},
        daily: (r.blDaily || []).map(x => ({ date: x.date, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        categories: (r.blCategories || []).map(x => ({ category: x.category, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, skus: parseInt(x.skus)||0 })),
        subCategories: (r.blSubCategories || []).map(x => ({ category: x.category, subcategory: x.subcategory, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        skus: (r.blSKUs || []).map(x => ({ itemId: x.item_id, name: x.item_name, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, mrp: parseFloat(x.mrp)||0, cities: parseInt(x.cities)||0 })),
        skuMatrix: (() => { const m = {}; (r.blSKUMatrix||[]).forEach(x => { const cat=x.category||'Unknown', sc=x.subcategory||'Unknown', sku=x.sku; if(!m[cat])m[cat]={}; if(!m[cat][sc])m[cat][sc]={}; if(!m[cat][sc][sku])m[cat][sc][sku]={rev:0,excRev:0,units:0}; m[cat][sc][sku].rev+=parseFloat(x.rev)||0; m[cat][sc][sku].excRev+=parseFloat(x.exc_rev)||0; m[cat][sc][sku].units+=parseInt(x.units)||0 }); return m })(),
        cities: (r.blCities || []).map(x => ({ city: x.city_name, region: x.region || '', cityTier: x.city_tier || '', units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, skus: parseInt(x.skus)||0 })),
        states: (r.blStates || []).map(x => ({ state: x.state?.charAt(0).toUpperCase()+x.state?.slice(1).toLowerCase(), units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0 })),
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
