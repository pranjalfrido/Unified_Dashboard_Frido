import { getBQ } from './api/_bq.js'
import { config } from 'dotenv'
import { readFileSync } from 'fs'
import { resolve } from 'path'
config()

// Proper CSV parser that handles quoted fields
function parseCSV(text) {
  const rows = []
  const lines = text.trim().split('\n')
  for (const line of lines) {
    const cols = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') { inQ = !inQ }
      else if (c === ',' && !inQ) { cols.push(cur); cur = '' }
      else cur += c
    }
    cols.push(cur)
    rows.push(cols)
  }
  return rows
}

const csvPath = resolve('..', 'sales_csv-2554990.csv')
const rows = parseCSV(readFileSync(csvPath, 'utf8'))
const header = rows[0]
const iDate = header.indexOf('date')
const iQty = header.indexOf('qty_sold')
const iItem = header.indexOf('item_id')
const portalDaywise = {}
const portalItemwise = {}
for (const cols of rows.slice(1)) {
  const item_id = cols[iItem]
  const date = cols[iDate]
  const qty = parseFloat(cols[iQty]) || 0
  if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) continue
  portalDaywise[date] = (portalDaywise[date] || 0) + qty
  portalItemwise[item_id] = (portalItemwise[item_id] || 0) + qty
}

const bq = getBQ()

// BQ day-wise with dedup
const [dayRows] = await bq.query({ query: `
  SELECT CAST(date AS STRING) AS date, SUM(qty_sold) AS units
  FROM (
    SELECT date, CAST(qty_sold AS FLOAT64) AS qty_sold,
      ROW_NUMBER() OVER (PARTITION BY item_id, city_id, date ORDER BY _dlt_load_id DESC) AS rn
    FROM \`frido-429506.partnerbizz_reports_v2.sales\`
    WHERE DATE(date) BETWEEN '2026-06-08' AND '2026-06-13'
  ) WHERE rn = 1
  GROUP BY date ORDER BY date
` })

// BQ item-wise with dedup
const [itemRows] = await bq.query({ query: `
  SELECT item_id, SUM(qty_sold) AS units
  FROM (
    SELECT item_id, CAST(qty_sold AS FLOAT64) AS qty_sold,
      ROW_NUMBER() OVER (PARTITION BY item_id, city_id, date ORDER BY _dlt_load_id DESC) AS rn
    FROM \`frido-429506.partnerbizz_reports_v2.sales\`
    WHERE DATE(date) BETWEEN '2026-06-08' AND '2026-06-13'
  ) WHERE rn = 1
  GROUP BY item_id ORDER BY units DESC
` })

console.log('\n=== DAY-WISE ===')
console.log('Date       | BQ units | Portal | match?')
console.log('-'.repeat(48))
let bqTotal = 0, portalTotal = 0
for (const r of dayRows) {
  const bqU = Number(r.units)
  const p = portalDaywise[r.date] || 0
  bqTotal += bqU; portalTotal += p
  console.log(`${r.date} | ${String(bqU).padEnd(8)} | ${String(p).padEnd(6)} | ${bqU === p ? '✅' : `❌ diff=${bqU - p}`}`)
}
// also show portal dates not in BQ
for (const [d, p] of Object.entries(portalDaywise)) {
  if (!dayRows.find(r => r.date === d)) {
    console.log(`${d} | MISSING  | ${p}     | ❌ missing in BQ`)
    portalTotal += p
  }
}
console.log('-'.repeat(48))
console.log(`TOTAL      | ${bqTotal}      | ${portalTotal}`)

console.log('\n=== ITEM-WISE ===')
console.log('item_id        | BQ    | Portal | match?')
console.log('-'.repeat(48))
let bqItemTotal = 0, pItemTotal = 0
for (const r of itemRows) {
  const bqU = Number(r.units)
  const p = portalItemwise[String(r.item_id)] || 0
  bqItemTotal += bqU; pItemTotal += p
  console.log(`${String(r.item_id).padEnd(15)}| ${String(bqU).padEnd(6)}| ${String(p).padEnd(7)}| ${bqU === p ? '✅' : `❌ diff=${bqU - p}`}`)
}
for (const [id, p] of Object.entries(portalItemwise)) {
  if (!itemRows.find(r => String(r.item_id) === id)) {
    console.log(`${id.padEnd(15)}| MISS  | ${p}     | ❌ missing in BQ`)
    pItemTotal += p
  }
}
console.log('-'.repeat(48))
console.log(`${'TOTAL'.padEnd(15)}| ${bqItemTotal}  | ${pItemTotal}`)
