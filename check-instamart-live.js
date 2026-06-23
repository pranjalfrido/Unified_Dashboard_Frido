import { getBQ, buildQuery } from './api/_bq.js'
import { config } from 'dotenv'
config()

const bq = getBQ()
const base = buildQuery('2026-06-13', '2026-06-19')

const [rows] = await bq.query({ query: `
  WITH q AS (${base})
  SELECT COUNT(1) AS cnt, SUM(ItemQty) AS units, SUM(SellingPrice_Inc_GST * ItemQty) AS rev
  FROM q WHERE Channel = 'Instamart'
` })
console.log('Instamart Jun 13-19 via buildQuery:', rows[0])

// Also check raw table directly
const [raw] = await bq.query({ query: `
  SELECT COUNT(1) AS cnt, SUM(CAST(units_sold AS FLOAT64)) AS units
  FROM \`frido-429506.production.fact_instamart_sales_report\`
  WHERE DATE(ordered_date) BETWEEN '2026-06-13' AND '2026-06-19'
` })
console.log('Raw fact_instamart_sales_report Jun 13-19:', raw[0])
