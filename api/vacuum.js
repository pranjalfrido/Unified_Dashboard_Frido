import { getPool } from './_db.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const pool = getPool()
  try {
    await pool.query(`VACUUM FULL orders`)
    res.json({ ok: true, message: 'VACUUM FULL complete' })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
