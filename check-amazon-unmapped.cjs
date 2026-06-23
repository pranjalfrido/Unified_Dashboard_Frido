const { BigQuery } = require('@google-cloud/bigquery')
const bq = new BigQuery({ keyFilename: 'c:/Users/PranjalTripati/OneDrive - Arcatron Mobility Pvt Ltd/Desktop/MIS/sa_key.json', projectId: 'frido-429506' })

const q = `
SELECT t.ChannelSKUCode, t.ProductId, COUNT(*) AS orders
FROM (
  SELECT sku AS ChannelSKUCode, asin AS ProductId
  FROM \`frido-429506.production.amazon_seller_central_all_orders\`
  WHERE purchase_date_ist BETWEEN '2026-06-01' AND '2026-06-20'
) t
LEFT JOIN \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\` sm
  ON TRIM(t.ProductId) = TRIM(sm.productid)
WHERE sm.productid IS NULL OR TRIM(sm.masterskucode) IN ('','not found')
GROUP BY t.ChannelSKUCode, t.ProductId
ORDER BY orders DESC
`

bq.query(q).then(([r]) => {
  console.log(`\nTotal unmapped Amazon ASINs: ${r.length}\n`)
  console.log('Seller SKU'.padEnd(35) + 'ASIN'.padEnd(22) + 'Orders')
  console.log('-'.repeat(65))
  r.forEach(x => {
    console.log(String(x.ChannelSKUCode || '').padEnd(35) + String(x.ProductId || '').padEnd(22) + x.orders)
  })
}).catch(console.error)
