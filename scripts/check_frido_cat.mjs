import { BigQuery } from '@google-cloud/bigquery'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const bq = new BigQuery({ keyFilename: join(__dirname, '../../sa_key.json'), projectId: 'frido-429506' })

const [rows] = await bq.query(`
  SELECT SubCategory, COUNT(DISTINCT OrderId) AS orders, SUM(SellingPrice_Exc_GST) AS revenue
  FROM \`frido-429506.production.fact_all_platform_sales_report\`
  WHERE OrderDate BETWEEN '2026-07-03' AND '2026-07-09'
    AND Channel = 'Shopify'
    AND Category = 'Frido'
  GROUP BY SubCategory
  ORDER BY revenue DESC
`)
console.log('Category=Frido subcategories:')
rows.forEach(r => console.log(`  SubCategory: ${r.SubCategory} | Orders: ${r.orders} | Revenue: ${r.revenue}`))
