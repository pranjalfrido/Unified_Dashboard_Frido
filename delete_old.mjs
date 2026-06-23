import pkg from 'pg'
import { config } from 'dotenv'
config()
const { Pool } = pkg
const pool = new Pool({ connectionString: process.env.SUPABASE_URL, ssl: { rejectUnauthorized: false } })
console.log('Deleting rows before 2025-01-01...')
const { rowCount } = await pool.query(`DELETE FROM orders WHERE order_date < '2025-01-01'`)
console.log('Deleted', rowCount, 'rows')
const { rows } = await pool.query('SELECT COUNT(*) AS remaining, MIN(order_date) AS min_date, MAX(order_date) AS max_date FROM orders')
console.log('Remaining:', rows[0])
await pool.end()
