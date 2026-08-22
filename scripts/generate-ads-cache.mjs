// Runs in GitHub Actions every 6 hours — queries BigQuery for last 90 days of ads data,
// writes public/ads-data.json for CDN delivery. Frontend slices client-side by date range.

import { writeFileSync } from 'fs'
import { BigQuery } from '@google-cloud/bigquery'

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
  salesCategoryOrders: `WITH item_master AS (SELECT REGEXP_REPLACE(UPPER(TRIM(Product_Code)), r'[^A-Z0-9-]', '') AS sku_key, CASE WHEN LOWER(ANY_VALUE(Category_Name)) LIKE '%spare%' THEN 'Others' ELSE ANY_VALUE(Category_Name) END AS Category_Name, CASE WHEN LOWER(ANY_VALUE(Category_Name)) LIKE '%spare%' THEN 'Others' ELSE ANY_VALUE(Sub_category) END AS Sub_category FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\` WHERE Product_Code IS NOT NULL AND TRIM(Product_Code) != '' GROUP BY sku_key) SELECT s.Channel AS platform, s.SubChannel AS sub_channel, COALESCE(im.Category_Name, 'Others') AS category, im.Sub_category AS sub_category, COUNT(DISTINCT s.OrderId) AS orders, SUM(s.ItemQty) AS units, ROUND(SUM(s.SellingPrice_Exc_GST),0) AS revenue, ROUND(SUM(s.SellingPrice_Inc_GST),0) AS gross_revenue FROM \`frido-429506.production.fact_all_platform_sales_report\` s LEFT JOIN item_master im ON REGEXP_REPLACE(UPPER(TRIM(s.masterskucode)), r'[^A-Z0-9-]', '') = im.sku_key WHERE s.OrderDate BETWEEN '${start}' AND '${end}' AND s.Channel IN ('Amazon','Shopify','Zepto','Instamart','Myntra','Blinkit') AND s.Country = 'India' AND s.Category IS NOT NULL AND TRIM(s.Category) != '' AND NOT (s.OrderId LIKE '%_EX%') GROUP BY platform, sub_channel, category, sub_category ORDER BY platform, orders DESC`,
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

// Assemble the same shape as api/bq.js ads object
const adsTotalsArr = (r.adsTotals || []).map(x => ({ platform: x.platform, spend: p(x.spend), revenue: p(x.revenue), impressions: p(x.impressions), clicks: p(x.clicks), orders: p(x.orders), ctr: p(x.ctr), cpc: p(x.cpc), roas: p(x.roas) }))

const metaSpend = p(adsTotalsArr.find(t => t.platform === 'Meta')?.spend)
const googleSpend = p(adsTotalsArr.find(t => t.platform === 'Google')?.spend)
const shopifyAdSpend = metaSpend + googleSpend
const metaShare = shopifyAdSpend > 0 ? metaSpend / shopifyAdSpend : 0.5
const googleShare = shopifyAdSpend > 0 ? googleSpend / shopifyAdSpend : 0.5

const shopifySales = (r.salesCategoryOrders || []).filter(s => s.platform === 'Shopify')

const adsCB = r.adsCategoryBreakdown || []
const adCatMap = {}
adsCB.forEach(x => {
  const key = `${x.platform}||${(x.category || 'Others').trim()}`
  if (!adCatMap[key]) adCatMap[key] = { spend: 0, clicks: 0, impressions: 0 }
  adCatMap[key].spend += p(x.spend)
})
const adProdMap = {}
adsCB.filter(x => x.product_name).forEach(x => {
  const key = `${x.platform}||${x.product_name.trim()}`
  if (!adProdMap[key]) adProdMap[key] = { spend: 0, category: x.category || 'Others' }
  adProdMap[key].spend += p(x.spend)
})

const catSalesMap = {}
shopifySales.forEach(s => {
  const cat = (s.category || 'Others').trim()
  if (!catSalesMap[cat]) catSalesMap[cat] = { revenue: 0, orders: 0 }
  catSalesMap[cat].revenue += p(s.revenue)
  catSalesMap[cat].orders += p(s.orders)
})

const categoryRows = Object.entries(catSalesMap).map(([cat, sales]) => {
  const metaAd = adCatMap[`Meta||${cat}`] || {}
  const googleAd = adCatMap[`Google||${cat}`] || {}
  const spend = (metaAd.spend || 0) + (googleAd.spend || 0)
  return { category: cat, revenue: sales.revenue, orders: sales.orders, spend, roas: spend > 0 ? sales.revenue / spend : 0 }
}).sort((a, b) => b.spend - a.spend)

const subCatSalesMap = {}
shopifySales.forEach(s => {
  const cat = (s.category || 'Others').trim()
  const sc = (s.sub_category || 'Others').trim()
  const key = `${cat}::${sc}`
  if (!subCatSalesMap[key]) subCatSalesMap[key] = { category: cat, subCategory: sc, revenue: 0, orders: 0 }
  subCatSalesMap[key].revenue += p(s.revenue)
  subCatSalesMap[key].orders += p(s.orders)
})
const productRows = Object.entries(subCatSalesMap).map(([, v]) => {
  const metaAd = adProdMap[`Meta||${v.subCategory.toLowerCase()}`] || {}
  const googleAd = adProdMap[`Google||${v.subCategory.toLowerCase()}`] || {}
  const spend = (metaAd.spend || 0) + (googleAd.spend || 0)
  return { ...v, spend, roas: spend > 0 ? v.revenue / spend : 0 }
}).sort((a, b) => b.spend - a.spend)

const channelDailyExcRevMap = {}
;(r.channelDailyExcRev || []).forEach(x => {
  if (!channelDailyExcRevMap[x.Channel]) channelDailyExcRevMap[x.Channel] = {}
  channelDailyExcRevMap[x.Channel][x.date] = p(x.exc_rev)
})

const prevTotalsMap = {}
;(r.prevAdsTotals || []).forEach(x => { prevTotalsMap[x.platform] = { spend: p(x.spend), revenue: p(x.revenue), impressions: p(x.impressions), clicks: p(x.clicks) } })

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
    categoryBreakdown: { categoryRows, productRows },
    prevTotals: prevTotalsMap,
    flipkartEstRev: 0,
    channelSalesOrders: {},
  },
}

writeFileSync('public/ads-data.json', JSON.stringify(payload))
console.log(`✓ Written public/ads-data.json (${(JSON.stringify(payload).length / 1024 / 1024).toFixed(1)} MB)`)
console.log(`  Rolling window: ${start} → ${end}`)
