import { getPool } from './_db.js'
import { syncRange } from './_bq.js'

function todayStr() { return new Date().toISOString().slice(0, 10) }
function daysAgoStr(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action || req.body?.action

  const pool = getPool()

  try {
    // GET /api/admin?action=status
    if (action === 'status') {
      const { rows: log } = await pool.query(`SELECT * FROM sync_log ORDER BY synced_at DESC LIMIT 30`)
      const { rows: cnt } = await pool.query(`SELECT COUNT(*) AS total, MIN(order_date) AS min_date, MAX(order_date) AS max_date FROM orders`)
      return res.json({ log, orders: cnt[0] })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    // POST /api/admin?action=sync  { days: 7 }
    if (action === 'sync') {
      const days = req.body?.days ?? 7
      const start = daysAgoStr(days - 1)
      const end = todayStr()
      res.json({ message: `Syncing ${start} → ${end} in background` })
      syncRange(pool, start, end).catch(e => console.error('[sync]', e.message))
      return
    }

    // POST /api/admin?action=sync-month  { start, end }
    if (action === 'sync-month') {
      const { start, end } = req.body
      if (!start || !end) return res.status(400).json({ error: 'start and end required' })
      const result = await syncRange(pool, start, end)
      return res.json({ ok: true, start, end, ...result })
    }

    // POST /api/admin?action=delete-range  { before }
    if (action === 'delete-range') {
      const { before } = req.body
      if (!before) return res.status(400).json({ error: 'before date required' })
      const { rowCount } = await pool.query(`DELETE FROM orders WHERE order_date < $1`, [before])
      return res.json({ ok: true, deleted: rowCount })
    }

    // POST /api/admin?action=vacuum
    if (action === 'vacuum') {
      await pool.query(`VACUUM FULL orders`)
      return res.json({ ok: true, message: 'VACUUM FULL complete' })
    }

    // POST /api/admin?action=wipe
    if (action === 'wipe') {
      await pool.query(`TRUNCATE TABLE orders`)
      await pool.query(`TRUNCATE TABLE sync_log`)
      return res.json({ ok: true, message: 'Tables wiped. Now call /api/admin?action=sync-month for each month.' })
    }

    return res.status(400).json({ error: 'Unknown action. Use: status, sync, sync-month, delete-range, vacuum, wipe' })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
