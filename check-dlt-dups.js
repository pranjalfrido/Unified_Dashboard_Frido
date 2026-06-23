import { getBQ } from './api/_bq.js'
import { config } from 'dotenv'
config()

const bq = getBQ()

// Check how many duplicate (item_id, city_name, date) combos exist
const [dups] = await bq.query({ query: `
  SELECT item_id, city_name, CAST(date AS STRING) AS date, COUNT(*) AS row_count,
    STRING_AGG(CAST(qty_sold AS STRING), ', ') AS qty_values,
    STRING_AGG(_dlt_load_id, ', ') AS load_ids
  FROM \`frido-429506.production.fact_blinkit_sales_report\`
  WHERE date BETWEEN '2026-06-10' AND '2026-06-15'
  GROUP BY item_id, city_name, date
  HAVING COUNT(*) > 1
  ORDER BY row_count DESC
  LIMIT 10
` })

console.log(`Duplicate (item_id, city_name, date) combos: ${dups.length}`)
console.log()
dups.forEach(r => console.log(`item_id=${r.item_id} city=${r.city_name} date=${r.date} | rows=${r.row_count} | qty_values=[${r.qty_values}] | load_ids=[${r.load_ids}]`))

// Total with and without dedup
const [totals] = await bq.query({ query: `
  SELECT
    SUM(CAST(qty_sold AS FLOAT64)) AS raw_total,
    (SELECT SUM(qty) FROM (
      SELECT item_id, city_name, date, MAX(CAST(qty_sold AS FLOAT64)) AS qty
      FROM \`frido-429506.production.fact_blinkit_sales_report\`
      WHERE date BETWEEN '2026-06-10' AND '2026-06-15'
      GROUP BY item_id, city_name, date
    )) AS dedup_max,
    (SELECT SUM(qty) FROM (
      SELECT item_id, city_name, date, MIN(CAST(qty_sold AS FLOAT64)) AS qty
      FROM \`frido-429506.production.fact_blinkit_sales_report\`
      WHERE date BETWEEN '2026-06-10' AND '2026-06-15'
      GROUP BY item_id, city_name, date
    )) AS dedup_min
  FROM \`frido-429506.production.fact_blinkit_sales_report\`
  WHERE date BETWEEN '2026-06-10' AND '2026-06-15'
` })

console.log('\nTotals:')
console.log(' Raw SUM (no dedup):', totals[0].raw_total)
console.log(' Dedup using MAX:   ', totals[0].dedup_max)
console.log(' Dedup using MIN:   ', totals[0].dedup_min)
console.log('\nUI shows: 1487')
