import { buildQuery } from './api/_bq.js'
import { getBQ } from './api/_bq.js'
import { config } from 'dotenv'
config()

const bq = getBQ()
const base = buildQuery('2026-06-10', '2026-06-15')
const [rows] = await bq.query({ query: `
  WITH q AS (${base})
  SELECT CAST(OrderDate AS STRING) AS date, SUM(ItemQty) AS units
  FROM q
  WHERE Channel = 'Blinkit'
  GROUP BY date
  ORDER BY date
`, maximumBytesBilled: '10000000000' })

console.log('Date       | Units (after unified CTE)')
console.log('-'.repeat(40))
let total = 0
rows.forEach(r => { total += Number(r.units); console.log(`${r.date} | ${r.units}`) })
console.log('-'.repeat(40))
console.log(`Total: ${total}`)
