import { getBQ, buildQuery } from './_bq.js'

// Server-side in-memory cache with 5-minute TTL
const cache = new Map()
const CACHE_TTL = 5 * 60 * 1000

function getCacheKey(body) {
  const { start, end, category, subCategory, sku, subChannel, voucher, channel } = body
  return JSON.stringify({ start, end, category, subCategory, sku, subChannel, voucher, channel })
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

  const { start, end, category, subCategory, sku, subChannel, voucher, channel: activeChannel } = req.body
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

  // Run all aggregation queries in parallel directly on BigQuery
  const base = buildQuery(start, end, { category, subCategory, sku, subChannel, voucher })
  const prevBase = buildQuery(ps, pe, { category, subCategory, sku, subChannel, voucher })

  const queries = {
    totals: `WITH q AS (${base}) SELECT COUNT(DISTINCT OrderId) AS n_orders, SUM(SellingPrice_Inc_GST) AS total_rev, SUM(SellingPrice_Exc_GST) AS total_exc_rev, SUM(ItemQty) AS total_qty, COUNT(DISTINCT OrderDate) AS n_days, COUNT(DISTINCT CustomerId) AS n_custs FROM q`,
    byChannel: `WITH q AS (${base}) SELECT Channel, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS qty FROM q GROUP BY Channel ORDER BY rev DESC`,
    byDate: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, Channel, SUM(SellingPrice_Inc_GST) AS rev, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units FROM q GROUP BY date, Channel ORDER BY date`,
    byCategory: `WITH q AS (${base}) SELECT Category, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS units FROM q GROUP BY Category ORDER BY rev DESC`,
    byState: `WITH q AS (${base}) SELECT UPPER(TRIM(State)) AS state, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, COUNT(DISTINCT City) AS cities FROM q WHERE State IS NOT NULL GROUP BY UPPER(TRIM(State)) ORDER BY rev DESC LIMIT 30`,
    byOrderValue: `WITH q AS (${base}), ot AS (SELECT OrderId, SUM(SellingPrice_Inc_GST) AS order_rev FROM q GROUP BY OrderId) SELECT CASE WHEN order_rev < 500 THEN '<₹500' WHEN order_rev < 1000 THEN '₹500-1K' WHEN order_rev < 2500 THEN '₹1K-2.5K' WHEN order_rev < 5000 THEN '₹2.5K-5K' WHEN order_rev < 10000 THEN '₹5K-10K' WHEN order_rev < 25000 THEN '₹10K-25K' ELSE '₹25K+' END AS bucket, COUNT(*) AS cnt, SUM(order_rev) AS rev FROM ot GROUP BY 1`,
    byVoucher: `WITH q AS (${base}) SELECT CASE WHEN voucher_code IS NULL OR TRIM(voucher_code) = '' THEN 'No voucher' WHEN UPPER(voucher_code) LIKE '%PREPAID%' THEN 'Prepaid Disc' WHEN UPPER(voucher_code) LIKE '%PLM%' THEN 'Loyalty (PLM)' WHEN UPPER(voucher_code) LIKE '%FRV%' THEN 'Repeat (FRV)' WHEN REGEXP_CONTAINS(voucher_code, r'^[0-9]') OR LOWER(voucher_code) IN ('custom discount','custom_discount','simpl discount','simpldiscount','percentage','discount-3') OR LOWER(voucher_code) LIKE '%total pos%' OR LOWER(voucher_code) LIKE 'clickpost%' THEN 'POS/Manual' WHEN UPPER(voucher_code) LIKE '%HDFC%' OR UPPER(voucher_code) LIKE '%APAY%' OR UPPER(voucher_code) LIKE '%NOCOST%' OR UPPER(voucher_code) LIKE '%EMI%' OR UPPER(voucher_code) LIKE '%ONECARD%' OR UPPER(voucher_code) LIKE '%SIMPL%' THEN 'Bank/EMI' WHEN UPPER(voucher_code) LIKE 'IST-%' OR UPPER(voucher_code) LIKE '%INFLUENCER%' OR UPPER(voucher_code) LIKE 'AC-%' OR UPPER(voucher_code) LIKE 'GC-%' OR UPPER(voucher_code) LIKE 'DC-%' THEN 'Influencer/Aff' WHEN UPPER(voucher_code) LIKE '%SUMMER%' OR UPPER(voucher_code) LIKE '%BFS%' OR UPPER(voucher_code) LIKE '%LOVE%' THEN 'Sale Campaign' WHEN UPPER(voucher_code) LIKE '%FGP500%' OR UPPER(voucher_code) LIKE '%TECBXAY2%' OR UPPER(voucher_code) LIKE '%FREE GIFT COUPON%' OR LOWER(voucher_code) LIKE '%free-gift-coupon-500%' THEN 'Free Gift ₹500' WHEN UPPER(voucher_code) LIKE '%FGP1000%' OR UPPER(voucher_code) LIKE '%TECBXAY4%' THEN 'Free Gift ₹1000' WHEN UPPER(voucher_code) LIKE '%CARCOMFORT%' OR UPPER(voucher_code) LIKE '%BUNDLE%' OR UPPER(voucher_code) LIKE '%PACK%' OR UPPER(voucher_code) LIKE '%-PACK' OR UPPER(voucher_code) LIKE 'P2-%' OR UPPER(voucher_code) LIKE '%OFF-2%' OR UPPER(voucher_code) LIKE '%PACKOFF%' THEN 'Bundle/Pack' WHEN UPPER(voucher_code) IN ('FIRST50','ARCH10','FRIDO5','COMFY15','COMFY10','COMFY20','FIXPOSTURE200','FIXYOURPOSTURESALE','MYFRIDO10','FLAT100','PD20','OFF-2-PACK','WEDGEPL-59','SUMMER65') OR UPPER(voucher_code) LIKE 'COMFY%' OR UPPER(voucher_code) LIKE 'FIRST%' OR UPPER(voucher_code) LIKE 'FRIDO%' OR UPPER(voucher_code) LIKE 'ARCH%' OR UPPER(voucher_code) LIKE 'FLAT%' OR UPPER(voucher_code) LIKE 'FIXPOSTURE%' THEN 'Campaign' ELSE 'Other' END AS voucher_type, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel = 'Shopify' GROUP BY 1`,
    bySubChannel: `WITH q AS (${base}) SELECT SubChannel, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, SUM(ItemQty) AS qty FROM q WHERE Channel = 'Shopify' GROUP BY SubChannel ORDER BY rev DESC`,
    byPaymentMode: `WITH q AS (${base}) SELECT CASE WHEN PaymentMode IS NULL OR TRIM(PaymentMode) = '' THEN 'Unknown' WHEN LOWER(PaymentMode) LIKE '%cod%' OR LOWER(PaymentMode) LIKE '%cash%' THEN 'COD' ELSE 'Prepaid' END AS payment_mode, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel = 'Shopify' GROUP BY 1`,
    byOrderStatus: `WITH q AS (${base}) SELECT Order_Status AS order_status, COUNT(DISTINCT OrderId) AS cnt, SUM(SellingPrice_Inc_GST) AS rev FROM q GROUP BY Order_Status`,
    highTicket: `WITH q AS (${base}), ot AS (SELECT OrderId, SUM(SellingPrice_Inc_GST) AS rev FROM q GROUP BY OrderId HAVING SUM(SellingPrice_Inc_GST) >= 10000) SELECT COUNT(*) AS ht_count, SUM(rev) AS ht_rev FROM ot`,
    multiItem: `WITH q AS (${base}), ot AS (SELECT OrderId, SUM(ItemQty) AS total_qty FROM q GROUP BY OrderId) SELECT COUNT(CASE WHEN total_qty > 1 THEN 1 END) AS multi_item_orders FROM ot`,
    repeatRate: subChannel === 'International'
      ? `WITH in_range AS (SELECT DISTINCT customer_id FROM \`frido-429506.production.fact_shopify_international_orders\` WHERE order_date BETWEEN '${start}' AND '${end}' AND customer_id IS NOT NULL), prior AS (SELECT DISTINCT customer_id FROM \`frido-429506.production.fact_shopify_international_orders\` WHERE order_date < '${start}' AND customer_id IS NOT NULL) SELECT COUNT(*) AS n_custs, COUNTIF(p.customer_id IS NOT NULL) AS repeat_custs FROM in_range ir LEFT JOIN prior p USING (customer_id)`
      : `WITH in_range AS (SELECT DISTINCT customer_id FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` WHERE order_date_ist BETWEEN '${start}' AND '${end}' AND customer_id IS NOT NULL), prior AS (SELECT DISTINCT customer_id FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` WHERE order_date_ist < '${start}' AND customer_id IS NOT NULL) SELECT COUNT(*) AS n_custs, COUNTIF(p.customer_id IS NOT NULL) AS repeat_custs FROM in_range ir LEFT JOIN prior p USING (customer_id)`,
    bySubCategory: `WITH q AS (${base}) SELECT Category, SubCategory, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev FROM q GROUP BY Category, SubCategory ORDER BY rev DESC LIMIT 200`,
    byCategoryChannel: `WITH q AS (${base}) SELECT Category, Channel, SUM(SellingPrice_Inc_GST) AS rev FROM q GROUP BY Category, Channel`,
    byCity: `WITH q AS (${base}) SELECT TRIM(City) AS city, UPPER(TRIM(State)) AS state, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE City IS NOT NULL AND TRIM(City) != '' GROUP BY TRIM(City), UPPER(TRIM(State)) ORDER BY rev DESC LIMIT 50`,
    bySKU: `WITH q AS (${base}) SELECT ChannelSKUCode AS sku, Category AS category, SubCategory AS subcategory, Channel AS channel, SUM(ItemQty) AS units, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE ChannelSKUCode IS NOT NULL AND TRIM(ChannelSKUCode) != '' GROUP BY ChannelSKUCode, Category, SubCategory, Channel ORDER BY rev DESC LIMIT 500`,
    byFinancialStatus: `WITH q AS (${base}) SELECT FinancialStatus AS financial_status, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel = 'Shopify' AND FinancialStatus IS NOT NULL GROUP BY FinancialStatus ORDER BY orders DESC`,
    byFulfilmentStatus: `WITH q AS (${base}) SELECT FulfilmentStatus AS fulfil_status, COUNT(DISTINCT OrderId) AS orders FROM q WHERE Channel = 'Shopify' AND FulfilmentStatus IS NOT NULL GROUP BY FulfilmentStatus ORDER BY orders DESC`,
    byRefundTrend: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, COUNT(DISTINCT OrderId) AS total_orders, COUNTIF(RefundStatus = 'true') AS refund_lines FROM q WHERE Channel = 'Shopify' GROUP BY date ORDER BY date`,
    topOrders: `WITH q AS (${base}), ot AS (SELECT OrderId, CAST(OrderDate AS STRING) AS order_date, Channel, State, City, SUM(SellingPrice_Inc_GST) AS rev, SUM(ItemQty) AS qty, MAX(FulfilmentStatus) AS order_status, MAX(CustomerId) AS customer_id, MAX(voucher_code) AS voucher_code, STRING_AGG(DISTINCT ChannelSKUCode, ', ' ORDER BY ChannelSKUCode LIMIT 5) AS skus FROM q GROUP BY OrderId, OrderDate, Channel, State, City) SELECT * FROM ot ORDER BY rev DESC LIMIT 20`,
    byVoucherRaw: `WITH q AS (${base}) SELECT TRIM(voucher_code) AS voucher_code, COUNT(DISTINCT OrderId) AS orders FROM q WHERE Channel = 'Shopify' AND voucher_code IS NOT NULL AND TRIM(voucher_code) != '' GROUP BY TRIM(voucher_code) ORDER BY orders DESC LIMIT 300`,
    prevTotals: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS total_rev, SUM(SellingPrice_Exc_GST) AS total_exc_rev, COUNT(DISTINCT OrderId) AS n_orders FROM q`,
    prevByDate: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q GROUP BY date ORDER BY date`,
    prevShopify: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev, COUNT(DISTINCT OrderId) AS orders FROM q WHERE Channel='Shopify'`,
    prevShopifyDaily: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Shopify' GROUP BY date ORDER BY date`,
    prevAmzSC: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE SubChannel='Amazon Seller Central'`,
    prevAmzVC: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE SubChannel='Amazon Vendor Central'`,
    prevAmzDaily: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Amazon' GROUP BY date ORDER BY date`,
    prevFk: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev FROM q WHERE Channel='Flipkart'`,
    prevFkDaily: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Flipkart' GROUP BY date ORDER BY date`,
    prevBl: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Blinkit'`,
    prevBlDaily: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Blinkit' GROUP BY date ORDER BY date`,
    prevIn: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Instamart'`,
    prevInDaily: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Instamart' GROUP BY date ORDER BY date`,
    prevZp: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Zepto'`,
    prevZpDaily: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='Zepto' GROUP BY date ORDER BY date`,
    prevCr: `WITH q AS (${prevBase}) SELECT SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS exc_rev FROM q WHERE Channel='CRED'`,
    prevCrDaily: `WITH q AS (${prevBase}) SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM q WHERE Channel='CRED' GROUP BY date ORDER BY date`,
    amzSCFulfillment: `WITH q AS (${base}) SELECT fulfillment_channel, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, SUM(ItemQty) AS units FROM q WHERE SubChannel = 'Amazon Seller Central' AND FulfilmentStatus != 'Cancelled' AND SellingPrice_Inc_GST > 0 GROUP BY fulfillment_channel`,
    amzSCStatus: `WITH q AS (${base}) SELECT FinancialStatus AS order_status, COUNT(DISTINCT OrderId) AS orders FROM q WHERE SubChannel = 'Amazon Seller Central' GROUP BY order_status ORDER BY orders DESC`,
    amzSCStates: `WITH q AS (${base}) SELECT State AS ship_state, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE SubChannel = 'Amazon Seller Central' AND FulfilmentStatus != 'Cancelled' AND SellingPrice_Inc_GST > 0 GROUP BY ship_state ORDER BY rev DESC`,
    amzSCSKUs: `WITH q AS (${base}) SELECT ChannelSKUCode AS sku, ProductId AS asin, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE SubChannel = 'Amazon Seller Central' AND FulfilmentStatus != 'Cancelled' AND SellingPrice_Inc_GST > 0 GROUP BY sku, asin ORDER BY rev DESC LIMIT 20`,
    amzSCDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, fulfillment_channel, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE SubChannel = 'Amazon Seller Central' AND FulfilmentStatus != 'Cancelled' AND SellingPrice_Inc_GST > 0 GROUP BY date, fulfillment_channel ORDER BY date`,
    amzVCAccounts: `WITH q AS (${base}) SELECT ChannelAccount AS vendor_account, SUM(ItemQty) AS ordered_units, ROUND(SUM(SellingPrice_Inc_GST),0) AS ordered_rev, SUM(ItemQty) AS shipped_units, ROUND(SUM(SellingPrice_Inc_GST),0) AS shipped_rev, 0 AS returns FROM q WHERE SubChannel = 'Amazon Vendor Central' GROUP BY vendor_account ORDER BY ordered_rev DESC`,
    amzVCDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, SUM(ItemQty) AS ordered_units, ROUND(SUM(SellingPrice_Inc_GST),0) AS ordered_rev, SUM(ItemQty) AS shipped_units FROM q WHERE SubChannel = 'Amazon Vendor Central' GROUP BY date ORDER BY date`,
    amzVCASINs: `WITH q AS (${base}) SELECT ProductId AS asin, COALESCE(NULLIF(TRIM(ChannelSKUCode),''), NULLIF(TRIM(MasterSKU),'')) AS sku, SUM(ItemQty) AS ordered_units, ROUND(SUM(SellingPrice_Inc_GST),0) AS ordered_rev, SUM(ItemQty) AS shipped_units, 0 AS returns FROM q WHERE SubChannel = 'Amazon Vendor Central' GROUP BY asin, sku ORDER BY ordered_rev DESC LIMIT 20`,
    amzIntlCountries: `SELECT Country, COUNT(DISTINCT amazon_order_id) AS orders, ROUND(SUM(CAST(item_price AS FLOAT64)),0) AS rev, SUM(CAST(quantity AS INT64)) AS units FROM \`frido-429506.production.amazon_seller_central_uk_uae_all_orders\` WHERE purchase_date_ist BETWEEN '${start}' AND '${end}' AND item_status != 'Cancelled' GROUP BY Country ORDER BY rev DESC`,
    amzIntlSKUs: `SELECT sku, Country, COUNT(DISTINCT amazon_order_id) AS orders, SUM(CAST(quantity AS INT64)) AS units, ROUND(SUM(CAST(item_price AS FLOAT64)),0) AS rev FROM \`frido-429506.production.amazon_seller_central_uk_uae_all_orders\` WHERE purchase_date_ist BETWEEN '${start}' AND '${end}' AND item_status != 'Cancelled' GROUP BY sku, Country ORDER BY rev DESC LIMIT 20`,
    amzIntlDaily: `SELECT CAST(purchase_date_ist AS STRING) AS date, Country, COUNT(DISTINCT amazon_order_id) AS orders, ROUND(SUM(CAST(item_price AS FLOAT64)),0) AS rev FROM \`frido-429506.production.amazon_seller_central_uk_uae_all_orders\` WHERE purchase_date_ist BETWEEN '${start}' AND '${end}' AND item_status != 'Cancelled' GROUP BY date, Country ORDER BY date`,
    fkTotals: `WITH q AS (${base}) SELECT CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, SUM(ItemQty) AS units FROM q WHERE Channel='Flipkart' GROUP BY sub`,
    fkDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Flipkart' GROUP BY date, sub ORDER BY date`,
    fkStatus: `WITH q AS (${base}) SELECT FulfilmentStatus AS status, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders FROM q WHERE Channel='Flipkart' AND FulfilmentStatus IS NOT NULL GROUP BY status, sub ORDER BY orders DESC`,
    fkSKUs: `WITH q AS (${base}) SELECT ChannelSKUCode AS sku, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Flipkart' AND ChannelSKUCode IS NOT NULL GROUP BY sku, sub ORDER BY rev DESC LIMIT 30`,
    fkCategories: `WITH q AS (${base}) SELECT Category AS category, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, SUM(ItemQty) AS units FROM q WHERE Channel='Flipkart' GROUP BY category, sub ORDER BY rev DESC`,
    fkStates: `WITH q AS (${base}) SELECT UPPER(TRIM(State)) AS state, CASE WHEN SubChannel='Flipkart FBF' THEN 'FBF' ELSE 'NON-FBF' END AS sub, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Flipkart' AND State IS NOT NULL GROUP BY state, sub ORDER BY rev DESC`,
    blTotals: `WITH q AS (${base}) SELECT SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, COUNT(DISTINCT ChannelSKUCode) AS skus, COUNT(DISTINCT City) AS cities, COUNT(DISTINCT OrderDate) AS days FROM q WHERE Channel='Blinkit'`,
    blDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Blinkit' GROUP BY date ORDER BY date`,
    blCategories: `WITH q AS (${base}) SELECT Category AS category, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, COUNT(DISTINCT ChannelSKUCode) AS skus FROM q WHERE Channel='Blinkit' GROUP BY category ORDER BY rev DESC`,
    blSKUs: `WITH q AS (${base}), names AS (SELECT DISTINCT TRIM(CAST(item_id AS STRING)) AS item_id, item_name FROM \`frido-429506.partnerbizz_reports_v2.sales\`) SELECT q.ChannelSKUCode AS item_id, COALESCE(MAX(n.item_name), q.ChannelSKUCode) AS item_name, SUM(q.ItemQty) AS units, ROUND(SUM(q.SellingPrice_Inc_GST),0) AS rev, COUNT(DISTINCT q.City) AS cities FROM q LEFT JOIN names n ON q.ChannelSKUCode = n.item_id WHERE q.Channel='Blinkit' GROUP BY item_id ORDER BY rev DESC`,
    blCities: `WITH q AS (${base}) SELECT City AS city_name, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, COUNT(DISTINCT ChannelSKUCode) AS skus FROM q WHERE Channel='Blinkit' AND City IS NOT NULL GROUP BY city_name ORDER BY rev DESC`,
    inTotals: `WITH q AS (${base}) SELECT SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, COUNT(DISTINCT ChannelSKUCode) AS skus, COUNT(DISTINCT City) AS cities, COUNT(DISTINCT OrderDate) AS days FROM q WHERE Channel='Instamart'`,
    inDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Instamart' GROUP BY date ORDER BY date`,
    inCategories: `WITH q AS (${base}) SELECT Category AS category, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, COUNT(DISTINCT ChannelSKUCode) AS skus FROM q WHERE Channel='Instamart' GROUP BY category ORDER BY rev DESC`,
    inSKUs: `WITH q AS (${base}), names AS (SELECT DISTINCT TRIM(productid) AS productid, channelproductname FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\` WHERE TRIM(channelname)='Instamart') SELECT q.ChannelSKUCode AS item_id, COALESCE(MAX(n.channelproductname), q.ChannelSKUCode) AS item_name, SUM(q.ItemQty) AS units, ROUND(SUM(q.SellingPrice_Inc_GST),0) AS rev, COUNT(DISTINCT q.City) AS cities FROM q LEFT JOIN names n ON q.ChannelSKUCode = n.productid WHERE q.Channel='Instamart' AND q.ChannelSKUCode IS NOT NULL GROUP BY item_id ORDER BY rev DESC`,
    inCities: `WITH q AS (${base}) SELECT City AS city_name, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, COUNT(DISTINCT ChannelSKUCode) AS skus FROM q WHERE Channel='Instamart' AND City IS NOT NULL GROUP BY city_name ORDER BY rev DESC`,
    zpTotals: `WITH q AS (${base}), zraw AS (SELECT SUM(CAST(orders AS FLOAT64)) AS total_orders FROM \`frido-429506.production.zepto_sales_report\` WHERE date BETWEEN '${start}' AND '${end}') SELECT SUM(q.ItemQty) AS units, ROUND(SUM(q.SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(q.SellingPrice_Exc_GST),0) AS exc_rev, COUNT(DISTINCT q.ChannelSKUCode) AS skus, COUNT(DISTINCT q.City) AS cities, COUNT(DISTINCT q.OrderDate) AS days, (SELECT total_orders FROM zraw) AS orders FROM q WHERE q.Channel='Zepto'`,
    zpDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='Zepto' GROUP BY date ORDER BY date`,
    zpCategories: `WITH q AS (${base}) SELECT Category AS category, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, COUNT(DISTINCT ChannelSKUCode) AS skus FROM q WHERE Channel='Zepto' GROUP BY category ORDER BY rev DESC`,
    zpSKUs: `WITH q AS (${base}), names AS (SELECT DISTINCT TRIM(sku_number) AS sku_number, sku_name FROM \`frido-429506.production.zepto_sales_report\`) SELECT q.ChannelSKUCode AS item_id, COALESCE(MAX(n.sku_name), q.ChannelSKUCode) AS item_name, SUM(q.ItemQty) AS units, ROUND(SUM(q.SellingPrice_Inc_GST),0) AS rev, COUNT(DISTINCT q.City) AS cities FROM q LEFT JOIN names n ON q.ChannelSKUCode = n.sku_number WHERE q.Channel='Zepto' AND q.ChannelSKUCode IS NOT NULL GROUP BY item_id ORDER BY rev DESC`,
    zpCities: `WITH q AS (${base}) SELECT City AS city_name, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, COUNT(DISTINCT ChannelSKUCode) AS skus FROM q WHERE Channel='Zepto' AND City IS NOT NULL GROUP BY city_name ORDER BY rev DESC`,
    crTotals: `WITH q AS (${base}) SELECT COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev, COUNT(DISTINCT ChannelSKUCode) AS skus, COUNT(DISTINCT City) AS cities, COUNT(DISTINCT OrderDate) AS days FROM q WHERE Channel='CRED'`,
    crDaily: `WITH q AS (${base}) SELECT CAST(OrderDate AS STRING) AS date, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='CRED' GROUP BY date ORDER BY date`,
    crSKUs: `WITH q AS (${base}) SELECT ChannelSKUCode AS sku, MAX(COALESCE(NULLIF(TRIM(ChannelSKUCode),''), ChannelSKUCode)) AS sku_name, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='CRED' AND ChannelSKUCode IS NOT NULL GROUP BY sku ORDER BY rev DESC LIMIT 30`,
    crCategories: `WITH q AS (${base}) SELECT Category AS category, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM q WHERE Channel='CRED' GROUP BY category ORDER BY rev DESC`,
    crSubCategories: `WITH q AS (${base}) SELECT Category AS category, SubCategory AS subcategory, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='CRED' GROUP BY category, subcategory ORDER BY rev DESC`,
    crStates: `WITH q AS (${base}) SELECT UPPER(TRIM(State)) AS state, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='CRED' AND State IS NOT NULL GROUP BY state ORDER BY rev DESC`,
    crStatus: `WITH q AS (${base}) SELECT FulfilmentStatus AS status, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='CRED' AND FulfilmentStatus IS NOT NULL GROUP BY status ORDER BY orders DESC`,
    crCities: `WITH q AS (${base}) SELECT TRIM(City) AS city, COUNT(DISTINCT OrderId) AS orders, ROUND(SUM(SellingPrice_Inc_GST),0) AS rev FROM q WHERE Channel='CRED' AND City IS NOT NULL GROUP BY city ORDER BY rev DESC LIMIT 30`,
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
    r.bySubCategory.forEach(x => { const key = `${x.Category || 'Unknown'}::${x.SubCategory || 'Unknown'}`; subCatMap[key] = { rev: parseFloat(x.rev) || 0, orders: { size: parseInt(x.orders) || 0 } } })

    const catChannelMap = {}
    r.byCategoryChannel.forEach(x => {
      const cat = x.Category || 'Unknown'
      if (!catChannelMap[cat]) catChannelMap[cat] = {}
      catChannelMap[cat][x.Channel] = parseFloat(x.rev) || 0
    })

    const stateMap = {}
    r.byState.forEach(x => { if (!x.state) return; stateMap[x.state] = { rev: parseFloat(x.rev) || 0, orders: parseInt(x.orders) || 0, cities: { size: parseInt(x.cities) } } })

    const cityRows = (r.byCity || []).map(x => ({ city: x.city, state: x.state, orders: parseInt(x.orders) || 0, rev: parseFloat(x.rev) || 0 }))
    const skuRows = (r.bySKU || []).map(x => ({ sku: x.sku, category: x.category || '', subCategory: x.subcategory || '', channel: x.channel || '', units: parseInt(x.units) || 0, orders: parseInt(x.orders) || 0, rev: parseFloat(x.rev) || 0 }))

    const financialStatusMap = {}
    r.byFinancialStatus.forEach(x => { financialStatusMap[x.financial_status || 'Unknown'] = { orders: parseInt(x.orders) || 0, rev: parseFloat(x.rev) || 0 } })

    const fulfilmentStatusMap = {}
    r.byFulfilmentStatus.forEach(x => { fulfilmentStatusMap[x.fulfil_status || 'Unknown'] = parseInt(x.orders) || 0 })

    const refundTrend = (r.byRefundTrend || []).map(x => ({ date: x.date, total: parseInt(x.total_orders) || 0, refunds: parseInt(x.refund_lines) || 0, rate: x.total_orders ? (parseInt(x.refund_lines) / parseInt(x.total_orders) * 100) : 0 }))

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

    const payload = {
      source: 'postgres-aggregated',
      prevRev: parseFloat(r.prevTotals?.[0]?.total_rev) || 0,
      prevExcRev: parseFloat(r.prevTotals?.[0]?.total_exc_rev) || 0,
      prevOrders: parseInt(r.prevTotals?.[0]?.n_orders) || 0,
      prevDailyArr: (r.prevByDate || []).map(x => ({ date: x.date, rev: parseFloat(x.rev) || 0 })),
      totalRev, totalExcRev, totalQty, nOrders, nDays,
      blendedAOV: nOrders ? totalRev / nOrders : 0,
      gstCollected: totalRev - totalExcRev,
      nCusts, repeatCusts,
      uniqueDates: dateSet,
      dailyArr, chMap, catMap, subCatMap, stateMap, cityRows, catChannelMap, orderStatusMap, orderStatusRevMap,
      buckets, bucketRev, voucherMap, subChannelMap, paymentModeMap, tatOrders: [],
      htCount, htRev: htRevAgg, multiItemOrders,
      financialStatusMap, fulfilmentStatusMap, refundTrend,
      voucherList: (r.byVoucherRaw || []).map(x => ({ code: x.voucher_code, orders: parseInt(x.orders) || 0 })),
      orders, skuRows, rows: [],
      amzSC: {
        prevRev: parseFloat(r.prevAmzSC?.[0]?.rev) || 0,
        prevDaily: (r.prevAmzDaily || []).map(x => ({ date: x.date, rev: parseFloat(x.rev) || 0 })),
        fulfillment: (r.amzSCFulfillment || []).map(x => ({ type: x.fulfillment_channel === 'Amazon' ? 'FBA' : 'MFN', orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: parseInt(x.units)||0 })),
        status: (r.amzSCStatus || []).map(x => ({ status: x.order_status, orders: parseInt(x.orders)||0 })),
        states: (r.amzSCStates || []).map(x => ({ state: x.ship_state, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        skus: (r.amzSCSKUs || []).map(x => ({ sku: x.sku, asin: x.asin, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0 })),
        daily: (r.amzSCDaily || []).map(x => ({ date: x.date, type: x.fulfillment_channel === 'Amazon' ? 'FBA' : 'MFN', orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
      },
      amzVC: {
        prevRev: parseFloat(r.prevAmzVC?.[0]?.rev) || 0,
        accounts: (r.amzVCAccounts || []).map(x => ({ account: x.vendor_account, orderedUnits: parseInt(x.ordered_units)||0, orderedRev: parseFloat(x.ordered_rev)||0, shippedUnits: parseInt(x.shipped_units)||0, shippedRev: parseFloat(x.shipped_rev)||0, returns: parseInt(x.returns)||0 })),
        daily: (r.amzVCDaily || []).map(x => ({ date: x.date, orderedUnits: parseInt(x.ordered_units)||0, orderedRev: parseFloat(x.ordered_rev)||0, shippedUnits: parseInt(x.shipped_units)||0 })),
        asins: (r.amzVCASINs || []).map(x => ({ asin: x.asin, sku: x.sku || '—', orderedUnits: parseInt(x.ordered_units)||0, orderedRev: parseFloat(x.ordered_rev)||0, shippedUnits: parseInt(x.shipped_units)||0, returns: parseInt(x.returns)||0 })),
      },
      amzIntl: {
        countries: (r.amzIntlCountries || []).map(x => ({ country: x.Country, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: parseInt(x.units)||0 })),
        skus: (r.amzIntlSKUs || []).map(x => ({ sku: x.sku, country: x.Country, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0 })),
        daily: (r.amzIntlDaily || []).map(x => ({ date: x.date, country: x.Country, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
      },
      flipkart: {
        prevRev: parseFloat(r.prevFk?.[0]?.rev) || 0,
        prevExcRev: parseFloat(r.prevFk?.[0]?.exc_rev) || 0,
        prevDaily: (r.prevFkDaily || []).map(x => ({ date: x.date, rev: parseFloat(x.rev) || 0 })),
        totals: (r.fkTotals || []).map(x => ({ sub: x.sub, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0, units: parseInt(x.units)||0 })),
        daily: (r.fkDaily || []).map(x => ({ date: x.date, sub: x.sub, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        status: (r.fkStatus || []).map(x => ({ status: x.status, sub: x.sub, orders: parseInt(x.orders)||0 })),
        skus: (r.fkSKUs || []).map(x => ({ sku: x.sku, sub: x.sub, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0 })),
        categories: (r.fkCategories || []).map(x => ({ category: x.category, sub: x.sub, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0, units: parseInt(x.units)||0 })),
        states: (r.fkStates || []).map(x => ({ state: x.state, sub: x.sub, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
      },
      cred: {
        prevRev: parseFloat(r.prevCr?.[0]?.rev) || 0,
        prevExcRev: parseFloat(r.prevCr?.[0]?.exc_rev) || 0,
        prevDaily: (r.prevCrDaily || []).map(x => ({ date: x.date, rev: parseFloat(x.rev) || 0 })),
        totals: r.crTotals?.[0] ? { orders: parseInt(r.crTotals[0].orders)||0, units: parseInt(r.crTotals[0].units)||0, rev: parseFloat(r.crTotals[0].rev)||0, excRev: parseFloat(r.crTotals[0].exc_rev)||0, skus: parseInt(r.crTotals[0].skus)||0, cities: parseInt(r.crTotals[0].cities)||0, days: parseInt(r.crTotals[0].days)||0 } : {},
        daily: (r.crDaily || []).map(x => ({ date: x.date, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        skus: (r.crSKUs || []).map(x => ({ sku: x.sku, name: x.sku_name, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0 })),
        categories: (r.crCategories || []).map(x => ({ category: x.category, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, excRev: parseFloat(x.exc_rev)||0 })),
        subCategories: (r.crSubCategories || []).map(x => ({ category: x.category, subcategory: x.subcategory, orders: parseInt(x.orders)||0, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0 })),
        states: (r.crStates || []).map(x => ({ state: x.state, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        status: (r.crStatus || []).map(x => ({ status: x.status, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
        cities: (r.crCities || []).map(x => ({ city: x.city, orders: parseInt(x.orders)||0, rev: parseFloat(x.rev)||0 })),
      },
      zepto: {
        prevRev: parseFloat(r.prevZp?.[0]?.rev) || 0,
        prevDaily: (r.prevZpDaily || []).map(x => ({ date: x.date, rev: parseFloat(x.rev) || 0 })),
        totals: r.zpTotals?.[0] ? { units: parseInt(r.zpTotals[0].units)||0, orders: parseInt(r.zpTotals[0].orders)||0, rev: parseFloat(r.zpTotals[0].rev)||0, excRev: parseFloat(r.zpTotals[0].exc_rev)||0, skus: parseInt(r.zpTotals[0].skus)||0, cities: parseInt(r.zpTotals[0].cities)||0, days: parseInt(r.zpTotals[0].days)||0 } : {},
        daily: (r.zpDaily || []).map(x => ({ date: x.date, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0 })),
        categories: (r.zpCategories || []).map(x => ({ category: x.category, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, skus: parseInt(x.skus)||0 })),
        skus: (r.zpSKUs || []).map(x => ({ itemId: x.item_id, name: x.item_name, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, cities: parseInt(x.cities)||0 })),
        cities: (r.zpCities || []).map(x => ({ city: x.city_name, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, skus: parseInt(x.skus)||0 })),
      },
      instamart: {
        prevRev: parseFloat(r.prevIn?.[0]?.rev) || 0,
        prevDaily: (r.prevInDaily || []).map(x => ({ date: x.date, rev: parseFloat(x.rev) || 0 })),
        totals: r.inTotals?.[0] ? { units: parseInt(r.inTotals[0].units)||0, rev: parseFloat(r.inTotals[0].rev)||0, excRev: parseFloat(r.inTotals[0].exc_rev)||0, skus: parseInt(r.inTotals[0].skus)||0, cities: parseInt(r.inTotals[0].cities)||0, days: parseInt(r.inTotals[0].days)||0 } : {},
        daily: (r.inDaily || []).map(x => ({ date: x.date, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0 })),
        categories: (r.inCategories || []).map(x => ({ category: x.category, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, skus: parseInt(x.skus)||0 })),
        skus: (r.inSKUs || []).map(x => ({ itemId: x.item_id, name: x.item_name, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, cities: parseInt(x.cities)||0 })),
        cities: (r.inCities || []).map(x => ({ city: x.city_name, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, skus: parseInt(x.skus)||0 })),
      },
      blinkit: {
        totals: r.blTotals?.[0] ? { units: parseInt(r.blTotals[0].units)||0, rev: parseFloat(r.blTotals[0].rev)||0, skus: parseInt(r.blTotals[0].skus)||0, cities: parseInt(r.blTotals[0].cities)||0, days: parseInt(r.blTotals[0].days)||0 } : {},
        daily: (r.blDaily || []).map(x => ({ date: x.date, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0 })),
        categories: (r.blCategories || []).map(x => ({ category: x.category, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, skus: parseInt(x.skus)||0 })),
        skus: (r.blSKUs || []).map(x => ({ itemId: x.item_id, name: x.item_name, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, mrp: parseFloat(x.mrp)||0, cities: parseInt(x.cities)||0 })),
        cities: (r.blCities || []).map(x => ({ city: x.city_name, units: parseInt(x.units)||0, rev: parseFloat(x.rev)||0, skus: parseInt(x.skus)||0 })),
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
