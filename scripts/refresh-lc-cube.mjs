// Rebuilds public.lc_cube from the B2C parcel ledger.
//
// The cube is what every Cost Analysis figure is rolled up from, and
// generate-logistics-cost-cache.mjs reads it through the API — so a stale cube means a
// stale dashboard no matter how often the cache is regenerated. That is exactly what went
// wrong: Delhivery July and Safexpress August were uploaded, the hourly workflow kept
// rebuilding the cache, and neither month appeared because nothing rebuilt the cube.
//
// buildCube() already lives in api/logistics-cost.js — it sets its own statement_timeout on
// a checked-out client and swaps the table in a transaction. This script is a thin runner so
// the workflow can call it on its own, rather than only as part of
// refresh-cost-aggregates.mjs, which also rebuilds several heavier tables and currently
// fails partway through on lc_courier_disputes. Coupling the cube to that script's success
// is what let it go stale for days.
//
// Run BEFORE generate-logistics-cost-cache.mjs.

import { config } from 'dotenv'
config()

import pkg from 'pg'
const { Pool } = pkg

const connStr = process.env.SUPABASE_URL || process.env.NEON_URL
if (!connStr) {
  console.error('SUPABASE_URL not configured')
  process.exit(1)
}

const { buildCube } = await import('../api/logistics-cost.js')

const pool = new Pool({
  connectionString: connStr,
  ssl: { rejectUnauthorized: false },
  max: 3,
})
// node-postgres kills the process on an unhandled idle-client error, and the pooler drops
// idle connections routinely.
pool.on('error', e => console.error('[lc-cube pool]', e.message))

const t0 = Date.now()
console.log('rebuilding lc_cube …')

try {
  const rows = await buildCube(pool)
  const { rows: chk } = await pool.query(`
    SELECT COUNT(DISTINCT month)::int AS months,
           MAX(month) AS latest,
           SUM(n)::bigint AS shipments
    FROM public.lc_cube`)
  const s = chk[0]
  console.log(
    `lc_cube rebuilt: ${Number(rows).toLocaleString('en-IN')} rows, ` +
    `${s.months} months, latest ${s.latest}, ` +
    `${Number(s.shipments).toLocaleString('en-IN')} shipments ` +
    `(${((Date.now() - t0) / 1000).toFixed(1)}s)`
  )
  // An empty cube is a silent catastrophe — every tab would read zero and look merely
  // quiet rather than broken — so fail the step loudly instead.
  if (!Number(rows)) {
    console.error('ERROR: lc_cube rebuilt with 0 rows')
    process.exitCode = 1
  }
} catch (e) {
  console.error(`lc_cube rebuild FAILED: ${e.message}`)
  process.exitCode = 1
} finally {
  await pool.end()
}
