import { getPool } from './_db.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const pool = getPool()
  try {
    const { rows: log } = await pool.query(`SELECT * FROM sync_log ORDER BY synced_at DESC LIMIT 30`)
    const { rows: cnt } = await pool.query(`SELECT COUNT(*) AS total, MIN(order_date) AS min_date, MAX(order_date) AS max_date FROM orders`)
    res.json({ log, orders: cnt[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
