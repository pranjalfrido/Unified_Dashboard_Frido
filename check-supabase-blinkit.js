import pkg from 'pg'
import { config } from 'dotenv'
config()

const { Pool } = pkg
const pool = new Pool({ connectionString: process.env.SUPABASE_URL, ssl: { rejectUnauthorized: false } })

const { rows } = await pool.query(`
  SELECT order_date::text AS date, SUM(item_qty) AS units, COUNT(*) AS rows
  FROM orders
  WHERE channel = 'Blinkit'
  AND order_date BETWEEN '2026-06-10' AND '2026-06-15'
  GROUP BY order_date
  ORDER BY order_date
`)

console.log('Date       | Units in Supabase | Rows')
console.log('-'.repeat(45))
let total = 0
rows.forEach(r => { total += Number(r.units); console.log(`${r.date} | ${String(r.units).padEnd(17)} | ${r.rows}`) })
console.log('-'.repeat(45))
console.log(`Total: ${total}  (UI shows 1487, BQ raw = 1732)`)

await pool.end()
