import { getBQ } from './api/_bq.js'
import { config } from 'dotenv'
config()

const bq = getBQ()
const [rows] = await bq.query({ query: `
  SELECT
    CAST(date AS STRING) AS date,
    SUM(CAST(qty_sold AS FLOAT64)) AS units
  FROM \`frido-429506.production.fact_blinkit_sales_report\`
  WHERE date BETWEEN '2026-06-10' AND '2026-06-19'
  GROUP BY date
  ORDER BY date
` })

let running = 0
console.log('Date       | Units  | Cumulative (10th-Xth)')
console.log('-'.repeat(50))
rows.forEach(r => {
  running += Number(r.units)
  console.log(`${r.date} | ${String(r.units).padEnd(6)} | ${running}`)
})
