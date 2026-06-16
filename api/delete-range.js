import { getPool } from './_db.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { before } = req.body
  if (!before) return res.status(400).json({ error: 'before date required' })

  const pool = getPool()
  try {
    const { rowCount } = await pool.query(`DELETE FROM orders WHERE order_date < $1`, [before])
    res.json({ ok: true, deleted: rowCount })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
