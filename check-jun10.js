import { getBQ } from './api/_bq.js'
import { config } from 'dotenv'
config()

const bq = getBQ()

const [rows] = await bq.query({ query: `
  SELECT item_id, SUM(CAST(qty_sold AS FLOAT64)) AS units
  FROM (
    SELECT item_id, city_id, date, qty_sold,
      ROW_NUMBER() OVER (PARTITION BY item_id, city_id, date ORDER BY _dlt_load_id DESC) AS rn
    FROM \`frido-429506.partnerbizz_reports_v2.sales\`
    WHERE date = '2026-06-10'
  ) WHERE rn = 1
  GROUP BY item_id ORDER BY units DESC
` })

const portal = {
  '10195922':45,'10223269':40,'10153128':39,'10195305':32,'10223845':22,
  '10223266':21,'10253603':20,'10153130':18,'10253616':13,'10195730':13,
  '10153131':11,'10153129':9,'10253614':6,'10273682':1,'10273680':1
}

console.log('item_id'.padEnd(14) + '| BQ'.padEnd(8) + '| Portal'.padEnd(10) + '| match?')
console.log('-'.repeat(40))
let bqTotal = 0, portalTotal = 0
rows.forEach(r => {
  const bq = Number(r.units)
  const p = portal[String(r.item_id)] || 0
  bqTotal += bq; portalTotal += p
  console.log(String(r.item_id).padEnd(14) + '| ' + String(bq).padEnd(6) + ' | ' + String(p).padEnd(8) + ' | ' + (bq === p ? '✅' : `❌ diff=${bq-p}`))
})
console.log('-'.repeat(40))
console.log('TOTAL'.padEnd(14) + '| ' + String(bqTotal).padEnd(6) + ' | ' + String(291))
