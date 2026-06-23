const { BigQuery } = require('@google-cloud/bigquery')
const bq = new BigQuery({ keyFilename: 'c:/Users/PranjalTripati/OneDrive - Arcatron Mobility Pvt Ltd/Desktop/MIS/sa_key.json', projectId: 'frido-429506' })

const q = `
SELECT
  Channel,
  COUNT(DISTINCT t.ChannelSKUCode) AS total_skus,
  COUNT(DISTINCT CASE WHEN TRIM(sm.masterskucode) NOT IN ('','not found') THEN t.ChannelSKUCode END) AS mapped_skus,
  COUNT(DISTINCT CASE WHEN sm.masterskucode IS NULL OR TRIM(sm.masterskucode) IN ('','not found') THEN t.ChannelSKUCode END) AS unmapped_skus
FROM (
  SELECT 'Shopify' AS Channel, sku AS ChannelSKUCode, sku AS ProductId FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\`
  WHERE order_date_ist BETWEEN '2026-06-01' AND '2026-06-20'
  UNION ALL
  SELECT 'Amazon' AS Channel, sku AS ChannelSKUCode, asin AS ProductId FROM \`frido-429506.production.amazon_seller_central_all_orders\`
  WHERE purchase_date_ist BETWEEN '2026-06-01' AND '2026-06-20'
  UNION ALL
  SELECT 'Flipkart' AS Channel, TRIM(REPLACE(REGEXP_REPLACE(sku,r'"{2,}SKU:-*"{0,}',''),'"','')) AS ChannelSKUCode, TRIM(REPLACE(REGEXP_REPLACE(sku,r'"{2,}SKU:-*"{0,}',''),'"','')) AS ProductId FROM \`frido-429506.flipkart_reports.sales_report\`
  WHERE DATE(SUBSTR(order_date,1,10)) BETWEEN '2026-06-01' AND '2026-06-20'
  UNION ALL
  SELECT 'Blinkit' AS Channel, CAST(item_id AS STRING) AS ChannelSKUCode, CAST(item_id AS STRING) AS ProductId FROM \`frido-429506.partnerbizz_reports_v2.sales\`
  WHERE DATE(date) BETWEEN '2026-06-01' AND '2026-06-20'
  UNION ALL
  SELECT 'Zepto' AS Channel, sku_number AS ChannelSKUCode, sku_number AS ProductId FROM \`frido-429506.production.zepto_sales_report\`
  WHERE date BETWEEN '2026-06-01' AND '2026-06-20'
  UNION ALL
  SELECT 'Instamart' AS Channel, item_code AS ChannelSKUCode, item_code AS ProductId FROM \`frido-429506.production.fact_instamart_sales_report\`
  WHERE DATE(ordered_date) BETWEEN '2026-06-01' AND '2026-06-20'
  UNION ALL
  SELECT 'Myntra' AS Channel, seller_sku_code AS ChannelSKUCode, seller_sku_code AS ProductId FROM \`frido-429506.production.fact_myntra_orders_report\`
  WHERE created_on BETWEEN '2026-06-01' AND '2026-06-20'
) t
LEFT JOIN \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\` sm
  ON TRIM(
    CASE WHEN t.Channel = 'Amazon' THEN t.ProductId ELSE t.ChannelSKUCode END
  ) = TRIM(sm.productid)
GROUP BY Channel ORDER BY Channel
`

bq.query(q).then(([r]) => {
  console.log('\nChannel'.padEnd(12) + 'Total SKUs'.padStart(12) + 'Mapped'.padStart(10) + 'Unmapped'.padStart(10) + 'Coverage'.padStart(10))
  console.log('-'.repeat(56))
  r.forEach(x => {
    const cov = x.total_skus > 0 ? ((x.mapped_skus / x.total_skus) * 100).toFixed(0) + '%' : '—'
    console.log(x.Channel.padEnd(12) + String(x.total_skus).padStart(12) + String(x.mapped_skus).padStart(10) + String(x.unmapped_skus).padStart(10) + cov.padStart(10))
  })
}).catch(console.error)
