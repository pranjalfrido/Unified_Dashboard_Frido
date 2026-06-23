import { getBQ } from './api/_bq.js'
import { config } from 'dotenv'
config()

const bq = getBQ()

// Check stg_partnerbizz_reports__sales__latest
const [latest] = await bq.query({ query: `
  SELECT item_id, SUM(CAST(qty_sold AS FLOAT64)) AS units, COUNT(1) AS cnt
  FROM \`frido-429506.production.stg_partnerbizz_reports__sales__latest\`
  WHERE date BETWEEN '2026-06-10' AND '2026-06-15'
  GROUP BY item_id ORDER BY units DESC
` }).catch(e => [[]])

if (latest.length) {
  const total = latest.reduce((s,r) => s + Number(r.units), 0)
  console.log(`stg_partnerbizz_reports__sales__latest total: ${total}`)
  latest.forEach(r => console.log(` ${r.item_id}: ${r.units} (${r.cnt} rows)`))
} else {
  console.log('stg_partnerbizz_reports__sales__latest - no data or error')
}

// Also check stg_partnerbizz_reports__sales
const [stg] = await bq.query({ query: `
  SELECT item_id, SUM(CAST(qty_sold AS FLOAT64)) AS units, COUNT(1) AS cnt
  FROM \`frido-429506.production.stg_partnerbizz_reports__sales\`
  WHERE date BETWEEN '2026-06-10' AND '2026-06-15'
  GROUP BY item_id ORDER BY units DESC
` }).catch(e => [[]])

if (stg.length) {
  const total = stg.reduce((s,r) => s + Number(r.units), 0)
  console.log(`\nstg_partnerbizz_reports__sales total: ${total}`)
  stg.forEach(r => console.log(` ${r.item_id}: ${r.units} (${r.cnt} rows)`))
}
