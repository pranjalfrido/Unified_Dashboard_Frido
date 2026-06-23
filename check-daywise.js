import { getBQ, buildQuery } from './api/_bq.js'
import { config } from 'dotenv'
config()

const bq = getBQ()
const base = buildQuery('2026-06-10', '2026-06-15')

const [rows] = await bq.query({ query: `
  WITH q AS (${base})
  SELECT CAST(OrderDate AS STRING) AS date, SUM(ItemQty) AS units
  FROM q WHERE Channel = 'Blinkit'
  GROUP BY date ORDER BY date
`, maximumBytesBilled: '10000000000' })

const portal = { '2026-06-10':291,'2026-06-11':245,'2026-06-12':288,'2026-06-13':327,'2026-06-14':342,'2026-06-15':239 }

console.log('Date       | BQ units | Portal | match?')
console.log('-'.repeat(45))
let bqTotal = 0
rows.forEach(r => {
  const bqU = Number(r.units)
  const p = portal[r.date] || 0
  bqTotal += bqU
  console.log(`${r.date} | ${String(bqU).padEnd(8)} | ${String(p).padEnd(6)} | ${bqU === p ? '✅' : `❌ diff=${bqU - p}`}`)
})
console.log('-'.repeat(45))
console.log(`TOTAL      | ${bqTotal}     | 1732`)
