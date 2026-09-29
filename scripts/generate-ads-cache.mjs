// Runs in GitHub Actions every 6 hours — queries BigQuery for last 90 days of ads data,
// writes public/ads-data.json for CDN delivery. Frontend slices client-side by date range.

import { writeFileSync } from 'fs'
import { BigQuery } from '@google-cloud/bigquery'
import pkg from 'pg'
const { Pool } = pkg

const bq = new BigQuery({ keyFilename: 'sa_key.json' })

// Rolling 90-day window ending yesterday
const endD = new Date()
endD.setDate(endD.getDate() - 1)
const end = endD.toISOString().slice(0, 10)
const startD = new Date(endD)
startD.setDate(startD.getDate() - 89)
const start = startD.toISOString().slice(0, 10)

// Previous 90-day window for WoW/period comparison
const prevEnd = new Date(startD)
prevEnd.setDate(prevEnd.getDate() - 1)
const prevStart = new Date(prevEnd)
prevStart.setDate(prevStart.getDate() - 89)
const ps = prevStart.toISOString().slice(0, 10)
const pe = prevEnd.toISOString().slice(0, 10)

// Flipkart lags ~3 days
const fkEndD = new Date(endD); fkEndD.setDate(fkEndD.getDate() - 3)
const fkStartD = new Date(startD)
const fkStart = fkStartD.toISOString().slice(0, 10)
const fkEnd = fkEndD.toISOString().slice(0, 10)

console.log(`Generating ads cache: ${start} → ${end} (prev: ${ps} → ${pe})`)

const queries = {
  adsTotals: `SELECT platform, ROUND(SUM(spend),0) AS spend, ROUND(SUM(revenue),0) AS revenue, ROUND(SUM(impressions),0) AS impressions, ROUND(SUM(clicks),0) AS clicks, ROUND(SUM(orders),0) AS orders, ROUND(SAFE_DIVIDE(SUM(clicks),SUM(impressions))*100,2) AS ctr, ROUND(SAFE_DIVIDE(SUM(spend),SUM(clicks)),2) AS cpc, ROUND(SAFE_DIVIDE(SUM(revenue),SUM(spend)),2) AS roas FROM \`frido-429506.production.fact_all_platform_ads_report\` WHERE report_date BETWEEN '${start}' AND '${end}' GROUP BY platform ORDER BY spend DESC`,
  adsDaily: `SELECT CAST(report_date AS STRING) AS date, platform, ROUND(SUM(spend),0) AS spend, ROUND(SUM(revenue),0) AS revenue, ROUND(SUM(impressions),0) AS impressions, ROUND(SUM(clicks),0) AS clicks FROM \`frido-429506.production.fact_all_platform_ads_report\` WHERE report_date BETWEEN '${start}' AND '${end}' GROUP BY date, platform ORDER BY date`,
  adsByAdType: `SELECT platform, ad_type, ROUND(SUM(spend),0) AS spend, ROUND(SUM(revenue),0) AS revenue, ROUND(SUM(impressions),0) AS impressions, ROUND(SUM(clicks),0) AS clicks, ROUND(SUM(orders),0) AS orders, ROUND(SAFE_DIVIDE(SUM(clicks),SUM(impressions))*100,2) AS ctr, ROUND(SAFE_DIVIDE(SUM(spend),SUM(clicks)),2) AS cpc, ROUND(SAFE_DIVIDE(SUM(revenue),SUM(spend)),2) AS roas FROM \`frido-429506.production.fact_all_platform_ads_report\` WHERE report_date BETWEEN '${start}' AND '${end}' GROUP BY platform, ad_type ORDER BY platform, spend DESC`,
  adsCampaigns: `SELECT platform, ad_type, campaign_name, ROUND(SUM(spend),0) AS spend, ROUND(SUM(revenue),0) AS revenue, ROUND(SUM(impressions),0) AS impressions, ROUND(SUM(clicks),0) AS clicks, ROUND(SUM(orders),0) AS orders, ROUND(SAFE_DIVIDE(SUM(clicks),SUM(impressions))*100,2) AS ctr, ROUND(SAFE_DIVIDE(SUM(spend),SUM(clicks)),2) AS cpc, ROUND(SAFE_DIVIDE(SUM(revenue),SUM(spend)),2) AS roas FROM \`frido-429506.production.fact_all_platform_ads_report\` WHERE report_date BETWEEN '${start}' AND '${end}' GROUP BY platform, ad_type, campaign_name ORDER BY spend DESC LIMIT 100`,
  adsByCategory: `SELECT platform, category, ROUND(SUM(spend),0) AS spend, ROUND(SUM(revenue),0) AS revenue, ROUND(SUM(impressions),0) AS impressions, ROUND(SUM(clicks),0) AS clicks, ROUND(SUM(orders),0) AS orders, ROUND(SAFE_DIVIDE(SUM(revenue),SUM(spend)),2) AS roas FROM \`frido-429506.production.fact_all_platform_ads_report\` WHERE report_date BETWEEN '${start}' AND '${end}' AND category IS NOT NULL AND TRIM(category) != '' GROUP BY platform, category ORDER BY spend DESC`,
  adsBySku: `SELECT platform, category, product_name, ROUND(SUM(spend),0) AS spend, ROUND(SUM(revenue),0) AS revenue, ROUND(SUM(impressions),0) AS impressions, ROUND(SUM(clicks),0) AS clicks, ROUND(SUM(orders),0) AS orders, ROUND(SAFE_DIVIDE(SUM(revenue),SUM(spend)),2) AS roas FROM \`frido-429506.production.fact_all_platform_ads_report\` WHERE report_date BETWEEN '${start}' AND '${end}' AND product_name IS NOT NULL AND TRIM(product_name) != '' GROUP BY platform, category, product_name ORDER BY spend DESC LIMIT 200`,
  adsCategoryBreakdown: `WITH im AS (SELECT DISTINCT LOWER(TRIM(Category_Name)) AS cat_key, CASE WHEN LOWER(TRIM(Category_Name)) LIKE '%spare%' THEN 'Others' ELSE Category_Name END AS Category_Name, LOWER(TRIM(Sub_category)) AS subcat_key, CASE WHEN LOWER(TRIM(Category_Name)) LIKE '%spare%' THEN 'Others' ELSE Sub_category END AS Sub_category FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\` WHERE Sub_category IS NOT NULL AND Category_Name IS NOT NULL AND TRIM(Sub_category) != '' AND TRIM(Category_Name) != ''), ads_agg AS (SELECT platform, CASE WHEN platform IN ('Meta','Google') THEN 'Shopify' ELSE platform END AS sales_platform, COALESCE(NULLIF(TRIM(target_type),''), 'all') AS target_type, LOWER(TRIM(product_name)) AS product_name_key, SUM(spend) AS spend FROM \`frido-429506.production.fact_all_platform_ads_report\` WHERE report_date BETWEEN '${start}' AND '${end}' GROUP BY platform, sales_platform, target_type, product_name_key), sales_rev_raw AS (SELECT s.Channel AS sales_platform, LOWER(TRIM(s.Category)) AS cat_key, LOWER(TRIM(s.SubCategory)) AS subcat_key, SUM(s.SellingPrice_Exc_GST) AS revenue FROM \`frido-429506.production.fact_all_platform_sales_report\` s WHERE s.OrderDate BETWEEN '${start}' AND '${end}' AND s.Channel IN ('Amazon','Flipkart','Shopify','Zepto','Instamart','Myntra','Blinkit') AND s.Country = 'India' AND NOT (s.Channel = 'Shopify' AND s.OrderId LIKE '%_EX%') GROUP BY sales_platform, cat_key, subcat_key), sales_rev AS (SELECT sr.* FROM sales_rev_raw sr JOIN im ON im.cat_key = sr.cat_key AND im.subcat_key = sr.subcat_key), platform_total_rev AS (SELECT sales_platform, SUM(revenue) AS total_rev FROM sales_rev GROUP BY sales_platform), platform_cat_rev AS (SELECT sales_platform, cat_key, SUM(revenue) AS cat_rev FROM sales_rev GROUP BY sales_platform, cat_key), product_join_raw AS (SELECT a.platform, a.sales_platform, a.product_name_key, a.spend, sc.subcat_key, sc.Sub_category, sc.Category_Name, sc.cat_key FROM ads_agg a LEFT JOIN im sc ON a.target_type = 'product' AND (sc.subcat_key = a.product_name_key OR STRPOS(sc.subcat_key, a.product_name_key) > 0 OR STRPOS(a.product_name_key, sc.subcat_key) > 0) WHERE a.target_type = 'product'), product_key_status AS (SELECT platform, sales_platform, product_name_key, ANY_VALUE(spend) AS spend, MAX(subcat_key IS NOT NULL) AS has_match FROM product_join_raw GROUP BY platform, sales_platform, product_name_key), product_unmatched AS (SELECT platform, sales_platform, product_name_key, spend FROM product_key_status WHERE NOT has_match), product_matched AS (SELECT pk.platform, pk.sales_platform, pk.product_name_key, pk.spend, pj.subcat_key, pj.Sub_category, pj.Category_Name, pj.cat_key FROM product_key_status pk JOIN product_join_raw pj USING (platform, sales_platform, product_name_key) WHERE pk.has_match AND pj.subcat_key IS NOT NULL), product_rev_join AS (SELECT pm.*, COALESCE(sr.revenue,0) AS subcat_rev, SUM(COALESCE(sr.revenue,0)) OVER (PARTITION BY pm.platform, pm.product_name_key) AS matched_set_total_rev, COUNT(*) OVER (PARTITION BY pm.platform, pm.product_name_key) AS matched_set_size FROM product_matched pm LEFT JOIN sales_rev sr ON sr.sales_platform = pm.sales_platform AND sr.subcat_key = pm.subcat_key AND sr.cat_key = pm.cat_key), product_attributed AS (SELECT platform, 'product' AS target_type, Sub_category AS product_name, Category_Name AS category, spend * SAFE_DIVIDE(CASE WHEN matched_set_total_rev > 0 THEN subcat_rev ELSE 1 END, CASE WHEN matched_set_total_rev > 0 THEN matched_set_total_rev ELSE matched_set_size END) AS spend FROM product_rev_join), category_join_raw AS (SELECT a.platform, a.sales_platform, a.product_name_key, a.spend, sc.cat_key, sc.Category_Name FROM ads_agg a LEFT JOIN (SELECT DISTINCT cat_key, Category_Name FROM im) sc ON a.target_type = 'category' AND (sc.cat_key = a.product_name_key OR STRPOS(sc.cat_key, a.product_name_key) > 0 OR STRPOS(a.product_name_key, sc.cat_key) > 0) WHERE a.target_type = 'category'), category_key_status AS (SELECT platform, sales_platform, product_name_key, ANY_VALUE(spend) AS spend, MAX(cat_key IS NOT NULL) AS has_match FROM category_join_raw GROUP BY platform, sales_platform, product_name_key), category_unmatched AS (SELECT platform, sales_platform, product_name_key, spend FROM category_key_status WHERE NOT has_match), category_matched AS (SELECT ck.platform, ck.sales_platform, ck.product_name_key, ck.spend, cj.cat_key, cj.Category_Name FROM category_key_status ck JOIN category_join_raw cj USING (platform, sales_platform, product_name_key) WHERE ck.has_match AND cj.cat_key IS NOT NULL), category_attributed AS (SELECT cm.platform, 'category' AS target_type, im.Sub_category AS product_name, im.Category_Name AS category, cm.spend * SAFE_DIVIDE(COALESCE(sr.revenue,0), NULLIF(pcr.cat_rev,0)) AS spend FROM category_matched cm JOIN im ON im.cat_key = cm.cat_key LEFT JOIN sales_rev sr ON sr.sales_platform = cm.sales_platform AND sr.subcat_key = im.subcat_key AND sr.cat_key = im.cat_key LEFT JOIN platform_cat_rev pcr ON pcr.sales_platform = cm.sales_platform AND pcr.cat_key = cm.cat_key WHERE pcr.cat_rev > 0), all_bucket AS (SELECT platform, sales_platform, spend FROM ads_agg WHERE target_type = 'all' UNION ALL SELECT platform, sales_platform, spend FROM product_unmatched UNION ALL SELECT platform, sales_platform, spend FROM category_unmatched), all_attributed AS (SELECT ab.platform, 'all' AS target_type, im.Sub_category AS product_name, im.Category_Name AS category, ab.spend * SAFE_DIVIDE(COALESCE(sr.revenue,0), NULLIF(ptr.total_rev,0)) AS spend FROM all_bucket ab JOIN im ON TRUE LEFT JOIN sales_rev sr ON sr.sales_platform = ab.sales_platform AND sr.subcat_key = im.subcat_key AND sr.cat_key = im.cat_key LEFT JOIN platform_total_rev ptr ON ptr.sales_platform = ab.sales_platform WHERE ptr.total_rev > 0), combined AS (SELECT * FROM product_attributed UNION ALL SELECT * FROM category_attributed UNION ALL SELECT * FROM all_attributed) SELECT platform, target_type, product_name, category, SUM(spend) AS spend, 0 AS orders, 0 AS revenue, 0 AS clicks, 0 AS impressions, 0 AS ctr, 0 AS cpc, 0 AS roas FROM combined GROUP BY platform, target_type, product_name, category ORDER BY platform, spend DESC LIMIT 20000`,
  adsDailyByCategory: `WITH valid_cats AS (SELECT DISTINCT LOWER(TRIM(Category_Name)) AS cat_key FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\` WHERE Category_Name IS NOT NULL AND TRIM(Category_Name) != '') SELECT CAST(a.report_date AS STRING) AS date, a.platform, CASE WHEN vc.cat_key IS NOT NULL THEN a.category ELSE 'Others' END AS category, CASE WHEN vc.cat_key IS NOT NULL THEN NULLIF(TRIM(a.product_name),'') ELSE NULL END AS sub_category, ROUND(SUM(a.spend),0) AS spend FROM \`frido-429506.production.fact_all_platform_ads_report\` a LEFT JOIN valid_cats vc ON LOWER(TRIM(a.category)) = vc.cat_key WHERE a.report_date BETWEEN '${start}' AND '${end}' GROUP BY date, platform, category, sub_category`,
  salesDailyByCategory: `WITH item_master AS (SELECT REGEXP_REPLACE(UPPER(TRIM(Product_Code)), r'[^A-Z0-9-]', '') AS sku_key, CASE WHEN LOWER(ANY_VALUE(Category_Name)) LIKE '%spare%' THEN 'Others' ELSE ANY_VALUE(Category_Name) END AS Category_Name, CASE WHEN LOWER(ANY_VALUE(Category_Name)) LIKE '%spare%' THEN 'Others' ELSE ANY_VALUE(Sub_category) END AS Sub_category FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\` WHERE Product_Code IS NOT NULL AND TRIM(Product_Code) != '' GROUP BY sku_key) SELECT CAST(s.OrderDate AS STRING) AS date, s.Channel AS platform, COALESCE(im.Category_Name, 'Others') AS category, im.Sub_category AS sub_category, ROUND(SUM(s.SellingPrice_Exc_GST),0) AS revenue FROM \`frido-429506.production.fact_all_platform_sales_report\` s LEFT JOIN item_master im ON REGEXP_REPLACE(UPPER(TRIM(s.masterskucode)), r'[^A-Z0-9-]', '') = im.sku_key WHERE s.OrderDate BETWEEN '${start}' AND '${end}' AND s.Channel IN ('Amazon','Flipkart','Shopify','Zepto','Instamart','Myntra','Blinkit') AND s.Country = 'India' AND s.Category IS NOT NULL AND TRIM(s.Category) != '' AND NOT (s.Channel = 'Shopify' AND s.OrderId LIKE '%_EX%') GROUP BY date, platform, category, sub_category`,
  channelDailyExcRev: `SELECT Channel, CAST(OrderDate AS STRING) AS date, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM \`frido-429506.production.fact_all_platform_sales_report\` WHERE OrderDate BETWEEN '${start}' AND '${end}' AND Channel IN ('Amazon','Flipkart','Zepto','Instamart','Myntra','Blinkit') AND Country = 'India' GROUP BY Channel, date ORDER BY Channel, date`,
  salesCategoryOrders: `WITH item_master AS (SELECT REGEXP_REPLACE(UPPER(TRIM(Product_Code)), r'[^A-Z0-9-]', '') AS sku_key, CASE WHEN LOWER(ANY_VALUE(Category_Name)) LIKE '%spare%' THEN 'Others' ELSE ANY_VALUE(Category_Name) END AS Category_Name, CASE WHEN LOWER(ANY_VALUE(Category_Name)) LIKE '%spare%' THEN 'Others' ELSE ANY_VALUE(Sub_category) END AS Sub_category FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\` WHERE Product_Code IS NOT NULL AND TRIM(Product_Code) != '' GROUP BY sku_key) SELECT s.Channel AS platform, s.SubChannel AS sub_channel, COALESCE(im.Category_Name, 'Others') AS category, im.Sub_category AS sub_category, COUNT(DISTINCT s.OrderId) AS orders, SUM(s.ItemQty) AS units, ROUND(SUM(s.SellingPrice_Exc_GST),0) AS revenue, ROUND(SUM(s.SellingPrice_Inc_GST),0) AS gross_revenue, ROUND(SUM(CASE WHEN s.Order_Status = 'Cancelled' THEN s.SellingPrice_Inc_GST ELSE 0 END),0) AS cancel_rev, ROUND(SUM(CASE WHEN s.Order_Status IN ('RTO','Return') THEN s.SellingPrice_Inc_GST ELSE 0 END),0) AS return_rev, ROUND(SUM(CASE WHEN s.Order_Status = 'CIR' THEN s.SellingPrice_Inc_GST ELSE 0 END),0) AS cir_rev, ROUND(SUM(CASE WHEN s.Order_Status = 'Exchange' THEN s.SellingPrice_Inc_GST ELSE 0 END),0) AS exch_rev FROM \`frido-429506.production.fact_all_platform_sales_report\` s LEFT JOIN item_master im ON REGEXP_REPLACE(UPPER(TRIM(s.masterskucode)), r'[^A-Z0-9-]', '') = im.sku_key WHERE s.OrderDate BETWEEN '${start}' AND '${end}' AND s.Channel IN ('Amazon','Shopify','Zepto','Instamart','Myntra','Blinkit') AND s.Country = 'India' AND s.Category IS NOT NULL AND TRIM(s.Category) != '' AND NOT (s.OrderId LIKE '%_EX%') GROUP BY platform, sub_channel, category, sub_category ORDER BY platform, orders DESC`,
  salesCategoryOrdersFk: `WITH item_master AS (SELECT REGEXP_REPLACE(UPPER(TRIM(Product_Code)), r'[^A-Z0-9-]', '') AS sku_key, CASE WHEN LOWER(ANY_VALUE(Category_Name)) LIKE '%spare%' THEN 'Others' ELSE ANY_VALUE(Category_Name) END AS Category_Name, CASE WHEN LOWER(ANY_VALUE(Category_Name)) LIKE '%spare%' THEN 'Others' ELSE ANY_VALUE(Sub_category) END AS Sub_category FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\` WHERE Product_Code IS NOT NULL AND TRIM(Product_Code) != '' GROUP BY sku_key) SELECT s.Channel AS platform, COALESCE(im.Category_Name, 'Others') AS category, im.Sub_category AS sub_category, COUNT(DISTINCT s.OrderId) AS orders, SUM(s.ItemQty) AS units, ROUND(SUM(s.SellingPrice_Exc_GST),0) AS revenue, ROUND(SUM(s.SellingPrice_Inc_GST),0) AS gross_revenue, ROUND(SUM(CASE WHEN s.Order_Status = 'Cancelled' THEN s.SellingPrice_Inc_GST ELSE 0 END),0) AS cancel_rev, ROUND(SUM(CASE WHEN s.Order_Status IN ('RTO','Return') THEN s.SellingPrice_Inc_GST ELSE 0 END),0) AS return_rev, ROUND(SUM(CASE WHEN s.Order_Status = 'CIR' THEN s.SellingPrice_Inc_GST ELSE 0 END),0) AS cir_rev FROM \`frido-429506.production.fact_all_platform_sales_report\` s LEFT JOIN item_master im ON REGEXP_REPLACE(UPPER(TRIM(s.masterskucode)), r'[^A-Z0-9-]', '') = im.sku_key WHERE s.OrderDate BETWEEN '${fkStart}' AND '${fkEnd}' AND s.Channel = 'Flipkart' AND s.Country = 'India' AND s.Category IS NOT NULL AND TRIM(s.Category) != '' GROUP BY platform, category, sub_category ORDER BY orders DESC`,
  channelExcRevTotals: `SELECT Channel, ROUND(SUM(SellingPrice_Exc_GST),0) AS exc_rev FROM \`frido-429506.production.fact_all_platform_sales_report\` WHERE OrderDate BETWEEN '${start}' AND '${end}' AND Channel IN ('Shopify','Amazon','Blinkit','Zepto','Instamart','Myntra','Flipkart') AND Country = 'India' AND NOT (Channel = 'Shopify' AND OrderId LIKE '%_EX%') GROUP BY Channel`,
  channelDailyOrders: `SELECT Channel, CAST(OrderDate AS STRING) AS date, COUNT(DISTINCT OrderId) AS orders FROM \`frido-429506.production.fact_all_platform_sales_report\` WHERE OrderDate BETWEEN '${start}' AND '${end}' AND Channel IN ('Shopify','Amazon','Blinkit','Zepto','Instamart','Myntra','Flipkart') AND Country = 'India' AND NOT (Channel = 'Shopify' AND OrderId LIKE '%_EX%') GROUP BY Channel, date ORDER BY Channel, date`,
  credDailyByProduct: `SELECT CAST(OrderDate AS STRING) AS date, COALESCE(SubCategory, Category, 'Other') AS subCategory, COALESCE(Category, 'Other') AS category, SUM(SellingPrice_Inc_GST) AS rev, SUM(SellingPrice_Exc_GST) AS excRev, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units FROM \`frido-429506.production.fact_all_platform_sales_report\` WHERE OrderDate BETWEEN '${start}' AND '${end}' AND Channel = 'CRED' AND LOWER(COALESCE(FinancialStatus,'')) NOT LIKE '%refund%' GROUP BY date, subCategory, category ORDER BY date`,
  shopifyNewCusts: `WITH in_range AS (SELECT DISTINCT customer_id FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` WHERE order_date_ist BETWEEN '${start}' AND '${end}' AND customer_id IS NOT NULL), prior AS (SELECT DISTINCT customer_id FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` WHERE order_date_ist < '${start}' AND customer_id IS NOT NULL) SELECT COUNT(*) AS n_custs, COUNTIF(p.customer_id IS NOT NULL) AS repeat_custs FROM in_range ir LEFT JOIN prior p USING (customer_id)`,
  prevAdsTotals: `SELECT platform, ROUND(SUM(spend),0) AS spend, ROUND(SUM(revenue),0) AS revenue, ROUND(SUM(impressions),0) AS impressions, ROUND(SUM(clicks),0) AS clicks FROM \`frido-429506.production.fact_all_platform_ads_report\` WHERE report_date BETWEEN '${ps}' AND '${pe}' GROUP BY platform`,
}

function p(v) { return parseFloat(v) || 0 }
function i(v) { return parseInt(v) || 0 }

async function runQuery(sql) {
  const [rows] = await bq.query({ query: sql })
  return rows
}

const results = await Promise.all(
  Object.entries(queries).map(async ([key, sql]) => {
    console.log(`  Running ${key}...`)
    const rows = await runQuery(sql)
    console.log(`  ✓ ${key}: ${rows.length} rows`)
    return [key, rows]
  })
)
const r = Object.fromEntries(results)

// computeNetRevenueMeasures — mirrors _bq.js exactly
function computeNetRevenueMeasures(row = {}) {
  const grossIncGst = p(row.gross_inc_gst)
  const grossExcGst = p(row.gross_exc_gst)
  const cirRev = p(row.cir_rev)
  const rtoRev = p(row.rto_rev)
  const returnRev = p(row.return_rev)
  const cancelRev = p(row.cancel_rev)
  const exchRev = p(row.exch_rev)
  const retainedShare = Math.max(0, 1 - (rtoRev + cirRev + returnRev + cancelRev) / (grossIncGst || 1))
  return { netRevenueExcGst: grossExcGst * retainedShare }
}

// chMap from channel sales totals — only excRev needed for reconcile step
const chMap = {}
;(r.channelExcRevTotals || []).forEach(x => { chMap[x.Channel] = { excRev: p(x.exc_rev) } })

// buildSpendDetail — mirrors api/bq.js buildSpendDetail exactly, fkBlock.estTotalRev = 0
function buildSpendDetail(platformFilter) {
  const adsPlatforms = platformFilter === 'D2C' ? ['Meta', 'Google'] : platformFilter ? [platformFilter] : null
  const salesChannels = platformFilter === 'D2C' ? ['Shopify'] : platformFilter ? [platformFilter] : null
  const includesFlipkart = !platformFilter || platformFilter === 'Flipkart'

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
    adCatMapAll[cat] += p(x.spend)
  })
  const adSubCatMapAll = {}
  adsCB.filter(x => x.product_name).forEach(x => {
    const subCat = x.product_name.trim()
    if (!adSubCatMapAll[subCat]) adSubCatMapAll[subCat] = 0
    adSubCatMapAll[subCat] += p(x.spend)
  })
  let unmatchedProductSpend = 0
  adsCB.filter(x => !x.product_name).forEach(x => { unmatchedProductSpend += p(x.spend) })

  const netRevOf = row => computeNetRevenueMeasures({
    gross_inc_gst: row.grossRevenue, gross_exc_gst: row.revenue,
    cancel_rev: row.cancelRev, return_rev: row.returnRev, cir_rev: row.cirRev, rto_rev: 0, exch_rev: row.exchRev,
  }).netRevenueExcGst

  const catMap = {}
  rows.forEach(x => {
    const cat = (x.category || 'Others').trim()
    if (!catMap[cat]) catMap[cat] = { orders: 0, revenue: 0, grossRevenue: 0, cancelRev: 0, returnRev: 0, cirRev: 0, exchRev: 0 }
    catMap[cat].orders += p(x.orders)
    catMap[cat].revenue += p(x.revenue)
    catMap[cat].grossRevenue += p(x.gross_revenue)
    catMap[cat].cancelRev += p(x.cancel_rev)
    catMap[cat].returnRev += p(x.return_rev)
    catMap[cat].cirRev += p(x.cir_rev)
    catMap[cat].exchRev += p(x.exch_rev)
  })
  const categoryRowsAll = Object.entries(catMap).map(([cat, v]) => ({
    category: cat, spend: adCatMapAll[cat] || 0, revenue: Math.round(v.revenue), netRevenue: Math.round(netRevOf(v)),
    orders: Math.round(v.orders), returns: Math.round(v.returnRev), cancellations: Math.round(v.cancelRev),
    roas: adCatMapAll[cat] > 0 ? v.revenue / adCatMapAll[cat] : 0,
  }))
  const unmatchedCatSpend = Object.entries(adCatMapAll).filter(([cat]) => !catMap[cat]).reduce((s, [, v]) => s + v, 0)
  if (unmatchedCatSpend > 0) {
    const others = categoryRowsAll.find(x => x.category === 'Others')
    if (others) others.spend += unmatchedCatSpend
    else categoryRowsAll.push({ category: 'Others', spend: unmatchedCatSpend, revenue: 0, netRevenue: 0, orders: 0, returns: 0, cancellations: 0, roas: 0 })
  }

  const subCatMap = {}
  const subCatBySubOnly = {}
  rows.forEach(x => {
    const subCat = (x.sub_category || '').trim() || 'Unspecified'
    const cat = (x.category || 'Others').trim()
    const key = `${cat}||${subCat}`
    if (!subCatMap[key]) subCatMap[key] = { category: cat, subCategory: subCat, orders: 0, revenue: 0, grossRevenue: 0, cancelRev: 0, returnRev: 0, cirRev: 0, exchRev: 0 }
    subCatMap[key].orders += p(x.orders)
    subCatMap[key].revenue += p(x.revenue)
    subCatMap[key].grossRevenue += p(x.gross_revenue)
    subCatMap[key].cancelRev += p(x.cancel_rev)
    subCatMap[key].returnRev += p(x.return_rev)
    subCatMap[key].cirRev += p(x.cir_rev)
    subCatMap[key].exchRev += p(x.exch_rev)
    if (!subCatBySubOnly[subCat]) subCatBySubOnly[subCat] = { orders: 0, revenue: 0, grossRevenue: 0, cancelRev: 0, returnRev: 0, cirRev: 0, exchRev: 0 }
    subCatBySubOnly[subCat].orders += p(x.orders)
    subCatBySubOnly[subCat].revenue += p(x.revenue)
    subCatBySubOnly[subCat].grossRevenue += p(x.gross_revenue)
    subCatBySubOnly[subCat].cancelRev += p(x.cancel_rev)
    subCatBySubOnly[subCat].returnRev += p(x.return_rev)
    subCatBySubOnly[subCat].cirRev += p(x.cir_rev)
    subCatBySubOnly[subCat].exchRev += p(x.exch_rev)
  })

  const usedSalesKeys = new Set()
  const spendMatchedRows = Object.keys(adSubCatMapAll).map(subCat => {
    const spend = adSubCatMapAll[subCat] || 0
    const matchKey = Object.keys(subCatMap).find(k => k.endsWith(`||${subCat}`))
    if (matchKey) {
      usedSalesKeys.add(matchKey)
      const v = subCatMap[matchKey]
      return { category: v.category, subCategory: v.subCategory, spend, revenue: Math.round(v.revenue), netRevenue: Math.round(netRevOf(v)), orders: Math.round(v.orders), returns: Math.round(v.returnRev), cancellations: Math.round(v.cancelRev), roas: spend > 0 ? v.revenue / spend : 0 }
    }
    const v = subCatBySubOnly[subCat]
    if (v) {
      return { category: normCat(rows.find(x => (x.sub_category || '').trim() === subCat)?.category), subCategory: subCat, spend, revenue: Math.round(v.revenue), netRevenue: Math.round(netRevOf(v)), orders: Math.round(v.orders), returns: Math.round(v.returnRev), cancellations: Math.round(v.cancelRev), roas: spend > 0 ? v.revenue / spend : 0 }
    }
    return { category: 'Others', subCategory: subCat, spend, revenue: 0, netRevenue: 0, orders: 0, returns: 0, cancellations: 0, roas: 0 }
  })

  const unspentRows = Object.entries(subCatMap).filter(([k]) => !usedSalesKeys.has(k)).map(([, v]) => ({
    category: v.category, subCategory: v.subCategory, spend: 0, revenue: Math.round(v.revenue), netRevenue: Math.round(netRevOf(v)), orders: Math.round(v.orders), returns: Math.round(v.returnRev), cancellations: Math.round(v.cancelRev), roas: 0,
  }))

  const otherSpendRows = unmatchedProductSpend > 0
    ? [{ category: 'Others', subCategory: 'Unattributed', spend: unmatchedProductSpend, revenue: 0, netRevenue: 0, orders: 0, returns: 0, cancellations: 0, roas: 0 }]
    : []

  const subCategoryRowsAll = [...spendMatchedRows, ...unspentRows, ...otherSpendRows]

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

console.log('  Computing allSpendDetail and spendDetailByPlatform...')
const allSpendDetail = buildSpendDetail(null)
const spendDetailByPlatform = {}
for (const plat of ['D2C', 'Meta', 'Google', 'Amazon', 'Flipkart', 'Myntra', 'Zepto', 'Instamart', 'Blinkit']) {
  spendDetailByPlatform[plat] = buildSpendDetail(plat)
}
console.log('  ✓ spendDetail built')

// Assemble the same shape as api/bq.js ads object
const adsTotalsArr = (r.adsTotals || []).map(x => ({ platform: x.platform, spend: p(x.spend), revenue: p(x.revenue), impressions: p(x.impressions), clicks: p(x.clicks), orders: p(x.orders), ctr: p(x.ctr), cpc: p(x.cpc), roas: p(x.roas) }))

const channelDailyExcRevMap = {}
;(r.channelDailyExcRev || []).forEach(x => {
  if (!channelDailyExcRevMap[x.Channel]) channelDailyExcRevMap[x.Channel] = {}
  channelDailyExcRevMap[x.Channel][x.date] = p(x.exc_rev)
})

const prevTotalsMap = {}
;(r.prevAdsTotals || []).forEach(x => { prevTotalsMap[x.platform] = { spend: p(x.spend), revenue: p(x.revenue), impressions: p(x.impressions), clicks: p(x.clicks) } })

// Additional Spend — from markting_spend Postgres table (same logic as api/bq.js)
// Covers the full rolling 90-day window so the frontend can slice by date client-side.
let additionalSpend = null
let additionalSpendByProduct = {}
try {
  const connStr = process.env.NEON_URL || process.env.SUPABASE_URL
  if (!connStr) throw new Error('No database URL configured')
  const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false }, max: 3 })

  // Find all months in the 90-day window
  const months = []
  const cur = new Date(startD.getFullYear(), startD.getMonth(), 1)
  while (cur <= endD) {
    months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`)
    cur.setMonth(cur.getMonth() + 1)
  }
  const placeholders = months.map((_, i) => `$${i + 1}`).join(',')
  const { rows: spendRows } = await pool.query(
    `SELECT month_year, SUM(total_spend_ex_gst::numeric) AS total_spend
     FROM markting_spend
     WHERE channeltomap = 'D2C'
       AND is_additional_spend = 'yes'
       AND marketing_spend_to_be_mapped_for = 'product'
       AND TO_CHAR(month_year::timestamp, 'YYYY-MM') IN (${placeholders})
     GROUP BY month_year`,
    months
  )
  console.log(`  ✓ markting_spend: ${spendRows.length} month rows`)

  if (spendRows.length > 0) {
    // Fetch daily Shopify sales for the full rolling window to prorate spend
    const monthStart = `${months[0]}-01`
    const lastMonth = months[months.length - 1]
    const [mY, mM] = lastMonth.split('-').map(Number)
    const monthEnd = new Date(mY, mM, 0).toISOString().slice(0, 10)

    const [[dailySalesRows], [dailyProductRows]] = await Promise.all([
      bq.query({ query: `SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev FROM \`frido-429506.production.fact_all_platform_sales_report\` WHERE OrderDate BETWEEN '${monthStart}' AND '${monthEnd}' AND Channel = 'Shopify' AND SubChannel != 'Shopify International' AND LOWER(COALESCE(FinancialStatus,'')) NOT LIKE '%refund%' GROUP BY date ORDER BY date` }),
      bq.query({ query: `SELECT CAST(OrderDate AS STRING) AS date, COALESCE(SubCategory, Category, 'Other') AS subCategory, SUM(SellingPrice_Inc_GST) AS rev FROM \`frido-429506.production.fact_all_platform_sales_report\` WHERE OrderDate BETWEEN '${monthStart}' AND '${monthEnd}' AND Channel = 'Shopify' AND SubChannel != 'Shopify International' AND LOWER(COALESCE(FinancialStatus,'')) NOT LIKE '%refund%' GROUP BY date, subCategory` }),
    ])

    const dayRevMap = {}
    const monthRevMap = {}
    for (const row of dailySalesRows) {
      const d = row.date?.value || row.date
      const rev = parseFloat(row.rev) || 0
      dayRevMap[d] = rev
      const mk = d.slice(0, 7)
      monthRevMap[mk] = (monthRevMap[mk] || 0) + rev
    }

    const dayProductRevMap = {}
    for (const row of dailyProductRows) {
      const d = row.date?.value || row.date
      const sc = row.subCategory
      const rev = parseFloat(row.rev) || 0
      if (!dayProductRevMap[d]) dayProductRevMap[d] = {}
      dayProductRevMap[d][sc] = (dayProductRevMap[d][sc] || 0) + rev
    }

    const productDaySpend = {}
    let totalAdditionalSpend = 0

    for (const sr of spendRows) {
      const mk = String(sr.month_year).slice(0, 7)
      const monthTotal = parseFloat(sr.total_spend) || 0
      if (monthTotal === 0) continue
      const monthRevTotal = monthRevMap[mk] || 0
      const [mYr, mMo] = mk.split('-').map(Number)
      const daysInMonth = new Date(mYr, mMo, 0).getDate()

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${mk}-${String(d).padStart(2, '0')}`
        const dayTotalRev = dayRevMap[dateStr] || 0
        let daySpend = monthRevTotal > 0 ? monthTotal * (dayTotalRev / monthRevTotal) : monthTotal / daysInMonth
        if (daySpend === 0) continue

        const dayProds = dayProductRevMap[dateStr] || {}
        const dayProdTotal = Object.values(dayProds).reduce((s, v) => s + v, 0)
        if (dayProdTotal > 0) {
          for (const [sc, scRev] of Object.entries(dayProds)) {
            if (!productDaySpend[sc]) productDaySpend[sc] = {}
            productDaySpend[sc][dateStr] = (productDaySpend[sc][dateStr] || 0) + daySpend * (scRev / dayProdTotal)
          }
        }
      }

      // KPI: sum for the full rolling window (frontend will slice to selected range)
      if (monthRevTotal > 0) {
        let rangeRev = 0
        for (const [day, rev] of Object.entries(dayRevMap)) {
          if (day >= start && day <= end && day.startsWith(mk)) rangeRev += rev
        }
        totalAdditionalSpend += monthTotal * (rangeRev / monthRevTotal)
      } else {
        const daysInRange = daysInMonth
        totalAdditionalSpend += monthTotal * (daysInRange / daysInMonth)
      }
    }

    additionalSpend = Math.round(totalAdditionalSpend)
    additionalSpendByProduct = productDaySpend
    console.log(`  ✓ additionalSpend computed: ₹${(additionalSpend / 1e7).toFixed(2)} Cr`)
  }

  await pool.end()
} catch (e) {
  console.error('  ✗ additionalSpend error:', e.message)
}

// Build CRED byCategory and byProduct (aggregated over rolling window)
const credProductMap = {}
for (const row of (r.credDailyByProduct || [])) {
  const date = row.date?.value || row.date
  if (date < start || date > end) continue
  const sc = row.subCategory
  if (!credProductMap[sc]) credProductMap[sc] = { subCategory: sc, category: row.category || 'Other', rev: 0, excRev: 0, orders: 0, units: 0 }
  credProductMap[sc].rev += p(row.rev)
  credProductMap[sc].excRev += p(row.excRev)
  credProductMap[sc].orders += i(row.orders)
  credProductMap[sc].units += i(row.units)
}
const credByProduct = Object.values(credProductMap).sort((a, b) => b.rev - a.rev)
const credCatMap = {}
for (const prod of credByProduct) {
  const cat = prod.category
  if (!credCatMap[cat]) credCatMap[cat] = { category: cat, rev: 0, excRev: 0, orders: 0, units: 0 }
  credCatMap[cat].rev += prod.rev
  credCatMap[cat].excRev += prod.excRev
  credCatMap[cat].orders += prod.orders
  credCatMap[cat].units += prod.units
}
const credByCategory = Object.values(credCatMap).sort((a, b) => b.rev - a.rev)

// CRED daily totals for the rolling window
const credDailyByProductRaw = (r.credDailyByProduct || []).map(x => ({
  date: x.date?.value || x.date,
  subCategory: x.subCategory,
  category: x.category || 'Other',
  rev: p(x.rev),
  excRev: p(x.excRev),
  orders: i(x.orders),
  units: i(x.units),
}))

console.log(`  ✓ CRED byCategory: ${credByCategory.length} cats, byProduct: ${credByProduct.length} products`)

const payload = {
  asOf: new Date().toISOString(),
  rollingStart: start,
  rollingEnd: end,
  ads: {
    totals: adsTotalsArr,
    daily: (r.adsDaily || []).map(x => ({ date: x.date, platform: x.platform, spend: p(x.spend), revenue: p(x.revenue), impressions: p(x.impressions), clicks: p(x.clicks) })),
    channelDailyExcRev: channelDailyExcRevMap,
    adsDailyByCategory: (r.adsDailyByCategory || []).map(x => ({ date: x.date, platform: x.platform, category: x.category, subCategory: x.sub_category || null, spend: p(x.spend) })),
    salesDailyByCategory: (r.salesDailyByCategory || []).map(x => ({ date: x.date, platform: x.platform, category: x.category, subCategory: x.sub_category || null, revenue: p(x.revenue) })),
    byAdType: (r.adsByAdType || []).map(x => ({ platform: x.platform, adType: x.ad_type, spend: p(x.spend), revenue: p(x.revenue), impressions: p(x.impressions), clicks: p(x.clicks), orders: p(x.orders), ctr: p(x.ctr), cpc: p(x.cpc), roas: p(x.roas) })),
    campaigns: (r.adsCampaigns || []).map(x => ({ platform: x.platform, adType: x.ad_type, campaign: x.campaign_name, spend: p(x.spend), revenue: p(x.revenue), impressions: p(x.impressions), clicks: p(x.clicks), orders: p(x.orders), ctr: p(x.ctr), cpc: p(x.cpc), roas: p(x.roas) })),
    byCategory: (r.adsByCategory || []).map(x => ({ platform: x.platform, category: x.category, spend: p(x.spend), revenue: p(x.revenue), impressions: p(x.impressions), clicks: p(x.clicks), orders: p(x.orders), roas: p(x.roas) })),
    bySku: (r.adsBySku || []).map(x => ({ platform: x.platform, category: x.category, sku: x.product_name, spend: p(x.spend), revenue: p(x.revenue), impressions: p(x.impressions), clicks: p(x.clicks), orders: p(x.orders), roas: p(x.roas) })),
    allSpendDetail,
    spendDetailByPlatform,
    channelDailyOrders: (r.channelDailyOrders || []).map(x => ({ channel: x.Channel, date: x.date, orders: i(x.orders) })),
    shopifyNewCusts: { nCusts: i(r.shopifyNewCusts?.[0]?.n_custs), repeatCusts: i(r.shopifyNewCusts?.[0]?.repeat_custs) },
    prevTotals: prevTotalsMap,
    flipkartEstRev: 0,
    channelSalesOrders: {},
    additionalSpend,
    additionalSpendByProduct,
  },
}

payload.cred = {
  byCategory: credByCategory,
  byProduct: credByProduct,
  dailyByProduct: credDailyByProductRaw,
}

writeFileSync('public/ads-data.json', JSON.stringify(payload))
console.log(`✓ Written public/ads-data.json (${(JSON.stringify(payload).length / 1024 / 1024).toFixed(1)} MB)`)
console.log(`  Rolling window: ${start} → ${end}`)
