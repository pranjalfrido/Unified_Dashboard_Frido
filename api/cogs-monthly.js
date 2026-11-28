/* global process */
// Month-wise per-SKU COGS — serves public.product_cogs_monthly (Supabase), the table built
// 2026-10-18 to replace the flat public/cogs-data.json rate card. Each row is (sku, month) with
// cogs_source distinguishing a real uploaded value ('actual') from a carried-forward one, per
// the explicit backfill/carry-forward rule confirmed when the table was built: months before the
// earliest uploaded month carry that month's value backward, and months after the latest
// uploaded month carry ITS value forward until a newer month's sheet replaces it.
//
// Read-only: SELECT only, never writes. Writes happen via scripts/sync-cogs-monthly-rest.mjs
// whenever a new month's COGS sheet lands.

import pkg from 'pg'

const { Pool, types } = pkg
// Postgres DATE columns (month, carried_from_month) default to parsing into JS Date objects,
// which then serialize through toISOString() -> UTC, shifting the date back a day whenever the
// server's local timezone is ahead of UTC (confirmed live: a row for month=2026-10-01 came back
// as "2026-09-30"). DATE has no time-of-day or timezone component in Postgres, so there's no
// correct Date-object representation anyway — return the raw 'YYYY-MM-DD' string pg already
// received on the wire instead of round-tripping it through a Date object at all. OID 1082 =
// pg's DATE type.
types.setTypeParser(1082, val => val)

// Dedicated small pool, same reasoning as api/logistics-cost.js: this project's shared pool is
// used by every other route, and this endpoint's queries are cheap (indexed PK lookups, not
// full-table scans) so it doesn't need logistics-cost's max:6 — a couple of connections is
// plenty, and keeping it separate means a spike here can't starve unrelated routes.
let cogsPool
function getCogsPool() {
  if (!cogsPool) {
    const connStr = process.env.SUPABASE_URL
    if (!connStr) throw new Error('SUPABASE_URL not configured')
    cogsPool = new Pool({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      max: 4,
      connectionTimeoutMillis: 20000,
      idleTimeoutMillis: 30000,
      statement_timeout: 30000,
    })
    cogsPool.on('error', e => console.error('[cogs-monthly pool]', e.message))
  }
  return cogsPool
}

// Reliability (batch: fix/pnl-cogs-fallback). The P&L silently fell back to an ASP estimate whenever this route failed,
// and it had no defence against the usual serverless failures: a pooled connection that died while the function was
// frozen ("Connection terminated unexpectedly" on the first query after a thaw), a cold-start connect, or the pooler being
// busy. So: (1) one retry on a fresh pool, (2) the answer is cached per instance for 10 min (the table changes only when a
// new month's sheet is synced), and served STALE if the database cannot be reached, (3) every failure or empty answer is
// logged with status, duration and row count (no user data, no SKU list) so Vercel logs show why.
const TTL_MS = 10 * 60 * 1000
const cache = new Map() // key -> { at, body }
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function runQuery(cleanSkus, startMonth, endMonth) {
  const pool = getCogsPool()
  const db = await pool.connect()
  try {
    const { rows } = cleanSkus
      ? await db.query(
          `SELECT sku, month, cogs, category, sub_category, cogs_source, carried_from_month
             FROM public.product_cogs_monthly
            WHERE sku = ANY($1::text[])
              AND month BETWEEN $2::date AND $3::date`,
          [cleanSkus, startMonth, endMonth]
        )
      : await db.query(
          `SELECT sku, month, cogs, category, sub_category, cogs_source, carried_from_month
             FROM public.product_cogs_monthly
            WHERE month BETWEEN $1::date AND $2::date`,
          [startMonth, endMonth]
        )
    return rows
  } finally {
    db.release()
  }
}

// One retry on a brand-new pool (the old one may hold dead sockets), except for bad input.
export async function queryWithRetry(cleanSkus, startMonth, endMonth, run = runQuery) {
  try {
    return { rows: await run(cleanSkus, startMonth, endMonth), retried: false }
  } catch (e) {
    if (/invalid input|out of range/i.test(e.message || '')) throw e
    const old = cogsPool
    cogsPool = null
    if (old) old.end().catch(() => {})
    await sleep(300)
    return { rows: await run(cleanSkus, startMonth, endMonth), retried: true }
  }
}

export function _resetCogsCache() { cache.clear() }

const shape = r => ({
  sku: r.sku,
  month: r.month, // already a plain 'YYYY-MM-DD' string, see types.setTypeParser(1082, ...) above
  cogs: parseFloat(r.cogs),
  category: r.category,
  subCategory: r.sub_category,
  cogsSource: r.cogs_source,
  carriedFromMonth: r.carried_from_month || null,
})

export default async function handler(req, res, deps = {}) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const t0 = Date.now()
  const log = (level, status, extra = {}) => console[level](JSON.stringify({ route: 'cogs-monthly', status, ms: Date.now() - t0, ...extra }))
  const { skus, startMonth, endMonth } = req.body || {}
  if (!startMonth || !endMonth) { log('warn', 400, { rows: 0, reason: 'startMonth / endMonth missing' }); return res.status(400).json({ error: 'startMonth and endMonth (YYYY-MM-01) required' }) }

  // skus is OPTIONAL: when omitted, returns every SKU for the month range — same "load the
  // whole rate card" shape the old flat cogs-data.json fetch had, so callers that don't yet
  // know their SKU universe up front (e.g. PnLPage's day-wise trend chart, which only learns
  // SKUs as the daily rows stream in) don't need a separate SKU-discovery round-trip first.
  const cleanSkus = Array.isArray(skus) ? [...new Set(skus.map(s => String(s || '').trim()).filter(Boolean))].sort() : null
  const ck = `${cleanSkus ? cleanSkus.join(',') : '*'}|${startMonth}|${endMonth}`
  const hit = cache.get(ck)
  if (hit && Date.now() - hit.at < TTL_MS) return res.status(200).json(hit.body)

  try {
    const { rows, retried } = await queryWithRetry(cleanSkus, startMonth, endMonth, deps.run || runQuery)
    const body = { rows: rows.map(shape) }
    if (rows.length === 0) log('warn', 200, { rows: 0, skus: cleanSkus ? cleanSkus.length : null, reason: 'no rows for the requested months' })
    else {
      if (cache.size > 50) cache.clear()
      cache.set(ck, { at: Date.now(), body })
      if (retried || Date.now() - t0 > 3000) log('warn', 200, { rows: rows.length, retried, slow: Date.now() - t0 > 3000 })
    }
    return res.status(200).json(body)
  } catch (e) {
    if (hit) { // the database cannot be reached: the last good answer is better than none
      log('error', 200, { rows: hit.body.rows.length, stale: true, error: e.code || e.message })
      res.setHeader('X-Cogs-Stale', '1')
      return res.status(200).json(hit.body)
    }
    log('error', 500, { rows: 0, error: e.code || e.message })
    return res.status(500).json({ error: e.message })
  }
}
