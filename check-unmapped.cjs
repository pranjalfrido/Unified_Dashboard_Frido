const { BigQuery } = require('@google-cloud/bigquery')
const bq = new BigQuery({ keyFilename: 'c:/Users/PranjalTripati/OneDrive - Arcatron Mobility Pvt Ltd/Desktop/MIS/sa_key.json', projectId: 'frido-429506' })

const q = `
SELECT t.Channel, t.ChannelSKUCode, t.ProductId, COUNT(*) AS orders
FROM (
  SELECT 'Shopify' AS Channel, sku AS ChannelSKUCode, sku AS ProductId FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\`
  WHERE order_date_ist BETWEEN '2026-06-01' AND '2026-06-20'
  UNION ALL
  SELECT 'Amazon' AS Channel, sku AS ChannelSKUCode, asin AS ProductId FROM \`frido-429506.production.amazon_seller_central_all_orders\`
  WHERE purchase_date_ist BETWEEN '2026-06-01' AND '2026-06-20'
  UNION ALL
  SELECT 'Myntra' AS Channel, seller_sku_code AS ChannelSKUCode, myntra_sku_code AS ProductId FROM \`frido-429506.production.fact_myntra_orders_report\`
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
    console.log(`\n── ${ch} (top 12 unmapped) ──`)
    console.log('ChannelSKUCode'.padEnd(40) + 'ProductId (ASIN)'.padEnd(25) + 'Orders')
    console.log('-'.repeat(75))
    rows.slice(0, 12).forEach(x => {
      console.log(String(x.ChannelSKUCode || '').padEnd(40) + String(x.ProductId || '').padEnd(25) + x.orders)
    })
  })
}).catch(console.error)
