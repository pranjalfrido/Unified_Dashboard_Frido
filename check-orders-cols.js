import { getBQ } from './api/_bq.js'
import { config } from 'dotenv'
config()

const bq = getBQ()

// Zepto - has orders column
const [z] = await bq.query({ query: `
  SELECT SUM(CAST(orders AS FLOAT64)) AS total_orders, SUM(CAST(sales_qty_units AS FLOAT64)) AS total_units
  FROM \`frido-429506.production.zepto_sales_report\`
  WHERE date BETWEEN '2026-06-13' AND '2026-06-18'
` })
console.log('Zepto orders vs units:', z[0])

// Instamart - check if orders column exists
const [i1] = await bq.query({ query: `
  SELECT column_name FROM \`frido-429506.production\`.INFORMATION_SCHEMA.COLUMNS
  WHERE table_name = 'fact_instamart_sales_report' AND column_name IN ('orders','order_count','num_orders')
` })
console.log('Instamart order columns:', i1)

// Blinkit partnerbizz - check columns
const [b1] = await bq.query({ query: `
  SELECT column_name FROM \`frido-429506.partnerbizz_reports_v2\`.INFORMATION_SCHEMA.COLUMNS
  WHERE table_name = 'sales' AND column_name IN ('orders','order_count','num_orders','order_id')
` })
console.log('Blinkit partnerbizz order columns:', b1)
