import { getPool } from './_db.js'
import { syncRange } from './_bq.js'

function todayStr() { return new Date().toISOString().slice(0, 10) }
function daysAgoStr(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const days = req.body?.days ?? 7
  const start = daysAgoStr(days - 1)
  const end = todayStr()
  res.json({ message: `Syncing ${start} → ${end} in background` })

  const pool = getPool()
  syncRange(pool, start, end).catch(e => console.error('[sync]', e.message))
}
