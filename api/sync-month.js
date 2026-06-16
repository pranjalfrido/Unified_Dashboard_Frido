import { getPool } from './_db.js'
import { syncRange } from './_bq.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { start, end } = req.body
  if (!start || !end) return res.status(400).json({ error: 'start and end required' })

  const pool = getPool()
  try {
    const result = await syncRange(pool, start, end)
    res.json({ ok: true, start, end, ...result })
  } catch (e) {
    res.status(500).json({ error: e.message, start, end })
  }
}
