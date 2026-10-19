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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  try {
    const { skus, startMonth, endMonth } = req.body || {}
    if (!startMonth || !endMonth) return res.status(400).json({ error: 'startMonth and endMonth (YYYY-MM-01) required' })

    // skus is OPTIONAL: when omitted, returns every SKU for the month range — same "load the
    // whole rate card" shape the old flat cogs-data.json fetch had, so callers that don't yet
    // know their SKU universe up front (e.g. PnLPage's day-wise trend chart, which only learns
    // SKUs as the daily rows stream in) don't need a separate SKU-discovery round-trip first.
    const cleanSkus = Array.isArray(skus) ? [...new Set(skus.map(s => String(s || '').trim()).filter(Boolean))] : null

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
      res.status(200).json({
        rows: rows.map(r => ({
          sku: r.sku,
          month: r.month, // already a plain 'YYYY-MM-DD' string, see types.setTypeParser(1082, ...) above
          cogs: parseFloat(r.cogs),
          category: r.category,
          subCategory: r.sub_category,
          cogsSource: r.cogs_source,
          carriedFromMonth: r.carried_from_month || null,
        })),
      })
    } finally {
      db.release()
    }
  } catch (e) {
    console.error('cogs-monthly error:', e)
    res.status(500).json({ error: e.message })
  }
}
