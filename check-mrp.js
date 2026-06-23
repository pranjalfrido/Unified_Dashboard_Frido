import { getBQ } from './api/_bq.js'
import { config } from 'dotenv'
config()

const bq = getBQ()
const [rows] = await bq.query({ query: `
  SELECT item_id, city_name, CAST(qty_sold AS FLOAT64) AS qty,
    CAST(mrp AS FLOAT64) AS mrp_col,
    ROUND(CAST(mrp AS FLOAT64) / CAST(qty_sold AS FLOAT64), 2) AS mrp_per_unit
  FROM \`frido-429506.partnerbizz_reports_v2.sales\`
  WHERE date = '2026-06-10' AND CAST(qty_sold AS FLOAT64) > 0
  LIMIT 10
` })

console.log('item_id      | qty | mrp_col  | mrp_per_unit (is it total or per unit?)')
console.log('-'.repeat(65))
rows.forEach(r => console.log(`${String(r.item_id).padEnd(12)} | ${String(r.qty).padEnd(3)} | ${String(r.mrp_col).padEnd(8)} | ${r.mrp_per_unit}`))
