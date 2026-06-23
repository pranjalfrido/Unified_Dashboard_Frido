import { getBQ } from './api/_bq.js'
import { config } from 'dotenv'
config()

const bq = getBQ()

// fact_blinkit_sales_report - no dedup needed (no dlt_load_id)
const [fact] = await bq.query({ query: `
  SELECT TRIM(CAST(item_id AS STRING)) AS item_id, SUM(CAST(qty_sold AS FLOAT64)) AS units
  FROM \`frido-429506.production.fact_blinkit_sales_report\`
  WHERE date BETWEEN '2026-06-10' AND '2026-06-15'
  GROUP BY item_id ORDER BY units DESC
` })

// partnerbizz_reports_v2.sales - dedup by item+city+date latest dlt_load_id
const [pv2] = await bq.query({ query: `
  SELECT item_id, SUM(CAST(qty_sold AS FLOAT64)) AS units
  FROM (
    SELECT item_id, city_id, date, qty_sold,
      ROW_NUMBER() OVER (PARTITION BY item_id, city_id, date ORDER BY _dlt_load_id DESC) AS rn
    FROM \`frido-429506.partnerbizz_reports_v2.sales\`
    WHERE date BETWEEN '2026-06-10' AND '2026-06-15'
  ) WHERE rn = 1
  GROUP BY item_id ORDER BY units DESC
` })

const factMap = Object.fromEntries(fact.map(r => [String(r.item_id), Number(r.units)]))
const pv2Map  = Object.fromEntries(pv2.map(r  => [String(r.item_id), Number(r.units)]))
const allIds  = [...new Set([...Object.keys(factMap), ...Object.keys(pv2Map)])]

console.log('item_id'.padEnd(14) + '| fact_blinkit'.padEnd(16) + '| partnerbizz_v2'.padEnd(18) + '| diff')
console.log('-'.repeat(60))
let totalFact = 0, totalPv2 = 0
allIds.sort((a,b) => (pv2Map[b]||0)-(pv2Map[a]||0)).forEach(id => {
  const f = factMap[id] || 0
  const p = pv2Map[id]  || 0
  totalFact += f; totalPv2 += p
  console.log(id.padEnd(14) + '| ' + String(f).padEnd(14) + ' | ' + String(p).padEnd(16) + ' | ' + (f - p))
})
console.log('-'.repeat(60))
console.log('TOTAL'.padEnd(14) + '| ' + String(totalFact).padEnd(14) + ' | ' + String(totalPv2).padEnd(16) + ' | ' + (totalFact - totalPv2))
console.log('\nUI shows 1487 — neither table matches!')
