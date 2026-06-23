import { getBQ } from './api/_bq.js'
import { config } from 'dotenv'
config()

const bq = getBQ()

// Raw total from partnerbizz_reports_v2.sales
const [raw] = await bq.query({ query: `
  SELECT item_id, SUM(CAST(qty_sold AS FLOAT64)) AS units, COUNT(1) AS cnt
  FROM \`frido-429506.partnerbizz_reports_v2.sales\`
  WHERE date BETWEEN '2026-06-10' AND '2026-06-15'
  GROUP BY item_id ORDER BY units DESC
` })
const rawTotal = raw.reduce((s,r) => s + Number(r.units), 0)
console.log(`Raw (no dedup) from partnerbizz_reports_v2.sales: ${rawTotal}`)

// Dedup by item_id + city_id + date, latest _dlt_load_id
const [deduped] = await bq.query({ query: `
  SELECT item_id, SUM(CAST(qty_sold AS FLOAT64)) AS units
  FROM (
    SELECT item_id, city_id, date, qty_sold,
      ROW_NUMBER() OVER (PARTITION BY item_id, city_id, date ORDER BY _dlt_load_id DESC) AS rn
    FROM \`frido-429506.partnerbizz_reports_v2.sales\`
    WHERE date BETWEEN '2026-06-10' AND '2026-06-15'
  )
  WHERE rn = 1
  GROUP BY item_id ORDER BY units DESC
` })
const dedupTotal = deduped.reduce((s,r) => s + Number(r.units), 0)
console.log(`After dedup (latest _dlt_load_id per item+city+date): ${dedupTotal}`)
deduped.forEach(r => console.log(` ${r.item_id}: ${r.units}`))
console.log(`\nCSV (fact_blinkit_sales_report): 1732`)
console.log(`UI downloaded Excel shows: 1487`)
