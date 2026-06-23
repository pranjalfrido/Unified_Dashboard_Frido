const { BigQuery } = require('@google-cloud/bigquery')
const bq = new BigQuery({ keyFilename: 'c:/Users/PranjalTripati/OneDrive - Arcatron Mobility Pvt Ltd/Desktop/MIS/sa_key.json', projectId: 'frido-429506' })

const q = `
SELECT t.Channel, t.ChannelSKUCode, t.ProductId, COUNT(*) AS orders
FROM (
  SELECT 'Shopify' AS Channel, sku AS ChannelSKUCode, sku AS ProductId
  FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\`
  WHERE order_date_ist BETWEEN '2026-06-01' AND '2026-06-20'
  UNION ALL
  SELECT 'Amazon' AS Channel, sku AS ChannelSKUCode, asin AS ProductId
  FROM \`frido-429506.production.amazon_seller_central_all_orders\`
  WHERE purchase_date_ist BETWEEN '2026-06-01' AND '2026-06-20'
  UNION ALL
  SELECT 'Flipkart' AS Channel,
    TRIM(REPLACE(REGEXP_REPLACE(sku,r'"{2,}SKU:-*"{0,}',''),'"','')) AS ChannelSKUCode,
    TRIM(REPLACE(REGEXP_REPLACE(sku,r'"{2,}SKU:-*"{0,}',''),'"','')) AS ProductId
  FROM \`frido-429506.flipkart_reports.sales_report\`
  WHERE DATE(SUBSTR(order_date,1,10)) BETWEEN '2026-06-01' AND '2026-06-20'
  UNION ALL
  SELECT 'Myntra' AS Channel, seller_sku_code AS ChannelSKUCode, seller_sku_code AS ProductId
  FROM \`frido-429506.production.fact_myntra_orders_report\`
  WHERE created_on BETWEEN '2026-06-01' AND '2026-06-20'
) t
LEFT JOIN \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\` sm
  ON TRIM(
    CASE WHEN t.Channel = 'Amazon' THEN t.ProductId ELSE t.ChannelSKUCode END
  ) = TRIM(sm.productid)
WHERE sm.productid IS NULL OR TRIM(sm.masterskucode) IN ('','not found')
GROUP BY t.Channel, t.ChannelSKUCode, t.ProductId
ORDER BY t.Channel, orders DESC
`

bq.query(q).then(([r]) => {
  const byChannel = {}
  r.forEach(x => {
    if (!byChannel[x.Channel]) byChannel[x.Channel] = []
    byChannel[x.Channel].push(x)
  })
  Object.entries(byChannel).forEach(([ch, rows]) => {
    console.log(`\n── ${ch} — ${rows.length} unmapped SKUs ──`)
    if (ch === 'Amazon') {
      console.log('Seller SKU'.padEnd(35) + 'ASIN'.padEnd(22) + 'Orders')
    } else {
      console.log('ChannelSKUCode'.padEnd(45) + 'Orders')
    }
    console.log('-'.repeat(70))
    rows.forEach(x => {
      if (ch === 'Amazon') {
        console.log(String(x.ChannelSKUCode || '').padEnd(35) + String(x.ProductId || '').padEnd(22) + x.orders)
      } else {
        console.log(String(x.ChannelSKUCode || '').padEnd(45) + x.orders)
      }
    })
  })
}).catch(console.error)
