import { getBQ } from './api/_bq.js'
import { config } from 'dotenv'
config()

const bq = getBQ()

// Raw from source - no dedup
const [raw] = await bq.query({ query: `
  SELECT item_id, SUM(CAST(qty_sold AS FLOAT64)) AS raw_units, COUNT(*) AS raw_rows
  FROM \`frido-429506.production.fact_blinkit_sales_report\`
  WHERE date BETWEEN '2026-06-10' AND '2026-06-15'
  GROUP BY item_id
  ORDER BY raw_units DESC
` })

// After dedup (GROUP BY item_id, city_name, date)
const [deduped] = await bq.query({ query: `
  SELECT item_id, SUM(CAST(qty_sold AS FLOAT64)) AS deduped_units
  FROM (
    SELECT item_id, city_name, date, SUM(CAST(qty_sold AS FLOAT64)) AS qty_sold
    FROM \`frido-429506.production.fact_blinkit_sales_report\`
    WHERE date BETWEEN '2026-06-10' AND '2026-06-15'
    GROUP BY item_id, city_name, date
  )
  GROUP BY item_id
  ORDER BY deduped_units DESC
` })

const dedupMap = Object.fromEntries(deduped.map(r => [String(r.item_id), r.deduped_units]))

console.log('item_id'.padEnd(12), '| raw_units'.padEnd(12), '| raw_rows'.padEnd(12), '| deduped_units'.padEnd(16), '| diff')
console.log('-'.repeat(70))
let totalRaw = 0, totalDeduped = 0
raw.forEach(r => {
  const d = dedupMap[String(r.item_id)] || 0
  totalRaw += Number(r.raw_units)
  totalDeduped += Number(d)
  const diff = Number(r.raw_units) - Number(d)
  if (diff !== 0) console.log(String(r.item_id).padEnd(12), '|', String(r.raw_units).padEnd(10), '|', String(r.raw_rows).padEnd(10), '|', String(d).padEnd(14), '|', diff)
})
console.log('-'.repeat(70))
console.log(`TOTAL raw: ${totalRaw}  |  deduped: ${totalDeduped}  |  diff: ${totalRaw - totalDeduped}`)
