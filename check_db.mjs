import pkg from 'pg'
import { config } from 'dotenv'
config()
const { Pool } = pkg
const pool = new Pool({ connectionString: process.env.SUPABASE_URL, ssl: { rejectUnauthorized: false } })
const { rows } = await pool.query(`SELECT COUNT(*) AS remaining, MIN(order_date) AS min_date, MAX(order_date) AS max_date FROM orders`)
console.log('Rows remaining:', rows[0])
const { rows: sz } = await pool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size`)
console.log('DB size:', sz[0].db_size)
await pool.end()
