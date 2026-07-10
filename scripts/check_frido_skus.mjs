import { BigQuery } from '@google-cloud/bigquery'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const bq = new BigQuery({ keyFilename: join(__dirname, '../../sa_key.json'), projectId: 'frido-429506' })

const [rows] = await bq.query(`
  SELECT ChannelSKUCode, COUNT(DISTINCT OrderId) AS orders, SUM(ItemQty) AS units, ROUND(SUM(SellingPrice_Exc_GST),0) AS revenue
  FROM \`frido-429506.production.fact_all_platform_sales_report\`
  WHERE OrderDate BETWEEN '2026-07-03' AND '2026-07-09'
    AND Channel = 'Shopify'
    AND Category = 'Frido'
  GROUP BY ChannelSKUCode
  ORDER BY revenue DESC
  LIMIT 30
`)
console.log('SKUs under Category=Frido:')
rows.forEach(r => console.log(`  MasterSKU: ${r.MasterSKU} | ChannelSKU: ${r.ChannelSKUCode} | Product: ${r.ProductName} | Orders: ${r.orders} | Units: ${r.units} | Revenue: ₹${r.revenue}`))
