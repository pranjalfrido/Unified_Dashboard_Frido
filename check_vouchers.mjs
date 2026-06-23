import { BigQuery } from '@google-cloud/bigquery'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const bq = new BigQuery({ keyFilename: join(__dirname, 'sa_key.json'), projectId: 'frido-429506' })

const queries = [
  ['is_refunded_line', `SELECT is_refunded_line, COUNT(*) AS cnt FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` WHERE order_date_ist BETWEEN '2026-01-01' AND '2026-06-17' GROUP BY 1 ORDER BY cnt DESC LIMIT 10`],
  ['order_fulfillment_status', `SELECT order_fulfillment_status, COUNT(*) AS cnt FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` WHERE order_date_ist BETWEEN '2026-01-01' AND '2026-06-17' GROUP BY 1 ORDER BY cnt DESC LIMIT 10`],
  ['financial_status', `SELECT financial_status, COUNT(*) AS cnt FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` WHERE order_date_ist BETWEEN '2026-01-01' AND '2026-06-17' GROUP BY 1 ORDER BY cnt DESC LIMIT 10`],
  ['pincode sample', `SELECT shipping_pincode, shipping_state, shipping_city, COUNT(*) AS cnt FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` WHERE order_date_ist BETWEEN '2026-06-01' AND '2026-06-17' AND shipping_pincode IS NOT NULL GROUP BY 1,2,3 ORDER BY cnt DESC LIMIT 5`],
  ['customer_id repeat', `SELECT COUNT(DISTINCT customer_id) AS unique_custs, COUNT(DISTINCT order_name) AS orders FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\` WHERE order_date_ist BETWEEN '2026-06-01' AND '2026-06-17'`],
]

for (const [label, sql] of queries) {
  console.log(`\n--- ${label} ---`)
  const [rows] = await bq.query({ query: sql })
  rows.forEach(r => console.log(JSON.stringify(r)))
}
