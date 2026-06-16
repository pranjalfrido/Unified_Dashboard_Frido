import { getPool } from './_db.js'
import { syncRange } from './_bq.js'

function todayStr() { return new Date().toISOString().slice(0, 10) }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { from = '2022-01-01', to = todayStr() } = req.body
  res.json({ message: `Wiping and re-syncing ${from} → ${to} in background` })

  const pool = getPool()
  ;(async () => {
    try {
      await pool.query(`TRUNCATE TABLE orders`)
      await pool.query(`TRUNCATE TABLE sync_log`)
      console.log('[wipe] Tables truncated. Starting sync...')
      let cur = new Date(from)
      const endDate = new Date(to)
      while (cur <= endDate) {
        const monthStart = cur.toISOString().slice(0, 10)
        const last = new Date(cur.getFullYear(), cur.getMonth() + 1, 0)
        const monthEnd = (last > endDate ? endDate : last).toISOString().slice(0, 10)
        try {
          await syncRange(pool, monthStart, monthEnd)
        } catch (e) {
          console.error(`[wipe] ❌ ${monthStart}→${monthEnd}:`, e.message)
        }
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
      }
      console.log('[wipe] ✅ Full re-sync complete!')
    } catch (e) {
      console.error('[wipe]', e.message)
    }
  })()
}
