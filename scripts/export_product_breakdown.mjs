import { BigQuery } from '@google-cloud/bigquery'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { writeFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const bq = new BigQuery({ keyFilename: join(__dirname, '../../sa_key.json'), projectId: 'frido-429506' })

const start = '2026-07-03'
const end = '2026-07-09'

// Get ad spend by product (Meta + Google product-targeted campaigns)
const [adsRows] = await bq.query(`
WITH im_sub AS (
  SELECT LOWER(TRIM(Sub_category)) AS sub_key, ANY_VALUE(Category_Name) AS Category_Name
  FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\`
  WHERE Sub_category IS NOT NULL GROUP BY sub_key
),
im_cat AS (
  SELECT LOWER(TRIM(Category_Name)) AS cat_key, ANY_VALUE(Category_Name) AS Category_Name
  FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\`
  WHERE Category_Name IS NOT NULL GROUP BY cat_key
),
camp_map AS (
  SELECT LOWER(TRIM(campaign_name)) AS camp_key, ANY_VALUE(product_name) AS product_name,
    ANY_VALUE(category) AS category, ANY_VALUE(target_type) AS target_type
  FROM \`frido-429506.ads_campaign_mapping.master_campaign_mapping_sheet_all_platforms\`
  WHERE campaign_name IS NOT NULL GROUP BY camp_key
),
mapped AS (
  SELECT a.platform,
    COALESCE(m.target_type, a.target_type) AS target_type,
    COALESCE(m.product_name, a.product_name) AS product_name,
    COALESCE(m.category, CASE
      WHEN a.target_type = 'product' THEN COALESCE(i_prod.Category_Name, 'Unknown')
      WHEN a.target_type = 'category' THEN COALESCE(i_cat.Category_Name, a.product_name)
      ELSE 'Unknown' END) AS category,
    a.spend, a.clicks, a.impressions
  FROM \`frido-429506.production.fact_all_platform_ads_report\` a
  LEFT JOIN camp_map m ON LOWER(TRIM(a.campaign_name)) = m.camp_key AND (a.product_name IS NULL OR TRIM(a.product_name) = '')
  LEFT JOIN im_sub i_prod ON a.target_type = 'product' AND LOWER(TRIM(a.product_name)) = i_prod.sub_key
  LEFT JOIN im_cat i_cat ON a.target_type = 'category' AND LOWER(TRIM(a.product_name)) = i_cat.cat_key
  WHERE a.report_date BETWEEN '${start}' AND '${end}'
    AND a.target_type = 'product'
    AND a.platform IN ('Meta', 'Google')
    AND (a.product_name IS NOT NULL AND TRIM(a.product_name) != '' OR m.product_name IS NOT NULL)
)
SELECT product_name, category, ROUND(SUM(spend),0) AS spend, ROUND(SUM(clicks),0) AS clicks, ROUND(SUM(impressions),0) AS impressions
FROM mapped
GROUP BY product_name, category
ORDER BY spend DESC
`)

// Get sales revenue by subcategory (Shopify only)
const [salesRows] = await bq.query(`
WITH valid_cats AS (
  SELECT DISTINCT LOWER(TRIM(Category_Name)) AS cat_key, Category_Name
  FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\`
  WHERE Category_Name IS NOT NULL AND TRIM(Category_Name) != ''
)
SELECT s.SubCategory AS sub_category, s.Category AS category,
  ROUND(SUM(s.SellingPrice_Exc_GST),0) AS revenue, COUNT(DISTINCT s.OrderId) AS orders
FROM \`frido-429506.production.fact_all_platform_sales_report\` s
JOIN valid_cats vc ON LOWER(TRIM(s.Category)) = vc.cat_key
WHERE s.OrderDate BETWEEN '${start}' AND '${end}'
  AND s.Channel = 'Shopify'
  AND s.SubCategory IS NOT NULL AND TRIM(s.SubCategory) != ''
GROUP BY sub_category, category
ORDER BY revenue DESC
`)

// Build sales lookup
const salesMap = {}
salesRows.forEach(r => { salesMap[r.sub_category?.toLowerCase().trim()] = { revenue: r.revenue, orders: r.orders, category: r.category } })

// Merge ads + sales
const rows = adsRows.map(r => {
  const salesKey = r.product_name?.toLowerCase().trim()
  const sales = salesMap[salesKey] || { revenue: 0, orders: 0 }
  const cpc = r.clicks > 0 ? (r.spend / r.clicks).toFixed(1) : ''
  const ctr = r.impressions > 0 ? (r.clicks / r.impressions * 100).toFixed(2) : ''
  const roas = r.spend > 0 && sales.revenue > 0 ? (sales.revenue / r.spend).toFixed(2) : ''
  return { product: r.product_name, category: r.category, spend: r.spend, clicks: r.clicks, impressions: r.impressions, cpc, ctr, revenue: sales.revenue, orders: sales.orders, roas }
})

// Others row
const advertisedKeys = new Set(adsRows.map(r => r.product_name?.toLowerCase().trim()))
let othersRevenue = 0, othersOrders = 0
salesRows.forEach(r => {
  if (!advertisedKeys.has(r.sub_category?.toLowerCase().trim())) {
    othersRevenue += parseFloat(r.revenue) || 0
    othersOrders += parseFloat(r.orders) || 0
  }
})
rows.push({ product: 'Others', category: '', spend: 0, clicks: 0, impressions: 0, cpc: '', ctr: '', revenue: othersRevenue, orders: othersOrders, roas: '' })

// CSV
const header = 'Product,Category,Spend,Clicks,Impressions,CPC,CTR%,Revenue,Orders,ROAS'
const lines = rows.map(r => `"${r.product}","${r.category}",${r.spend},${r.clicks},${r.impressions},${r.cpc},${r.ctr},${r.revenue},${r.orders},${r.roas}`)
const csv = [header, ...lines].join('\n')

const outPath = join(__dirname, '../../product_breakdown_export.csv')
writeFileSync(outPath, csv)
console.log(`Exported ${rows.length} rows to product_breakdown_export.csv`)
console.log(`Path: ${outPath}`)
