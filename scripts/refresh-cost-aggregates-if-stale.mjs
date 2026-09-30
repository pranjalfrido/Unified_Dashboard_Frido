// Wrapper called by GitHub Actions every hour.
// Rebuilds lc_cube (and all dependent tables) only when the ledger has changed
// since the last build — skips the 3-5 min rebuild when nothing was uploaded.
//
// Staleness check: compares the row count stored in public.lc_cube_meta against
// the current row count of logistics_invoices_b2c. A new upload always adds rows,
// so a count mismatch is a reliable signal that the cube is out of date.
// lc_cube_meta is a single-row table written by refresh-cost-aggregates.mjs
// at the end of every successful build.

import pkg from 'pg'
import { config } from 'dotenv'
config()

const pool = new pkg.Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 30000,
  statement_timeout: 60000,
})
pool.on('error', e => console.error('[pool] non-fatal:', e.message))

async function q(sql) {
  const { rows } = await pool.query(sql)
  return rows
}

// Current ledger size
const [{ ledger_n }] = await q(`SELECT COUNT(*)::int AS ledger_n FROM public.logistics_invoices_b2c`)

// Last recorded ledger size when lc_cube was built. Table may not exist yet.
let last_n = -1
try {
  const rows = await q(`SELECT ledger_n FROM public.lc_cube_meta LIMIT 1`)
  if (rows.length) last_n = rows[0].ledger_n
} catch {
  // table doesn't exist yet → treat as stale
}

console.log(`logistics_invoices_b2c: ${ledger_n} rows  |  last cube build snapshot: ${last_n === -1 ? 'none' : last_n}`)

if (ledger_n === last_n) {
  console.log('lc_cube is up to date — skipping rebuild.')
  await pool.end()
  process.exit(0)
}

console.log('Ledger has changed — rebuilding lc_cube (fast path)…')
await pool.end()

// Fast path: rebuilds only lc_addon_rate, lc_fwd_median, lc_cube (~2 min).
// The billing/dispute tables (lc_billing_summary, lc_courier_disputes etc.) are
// expensive and only power the Recoverable section — run refresh-cost-aggregates.mjs
// manually once a month to refresh those.
const { default: childProcess } = await import('child_process')
const { execFileSync } = childProcess
execFileSync('node', ['scripts/refresh-lc-cube-only.mjs'], { stdio: 'inherit' })

// After a successful rebuild, record the ledger snapshot so the next hourly
// run can skip if nothing was uploaded in the interim.
const pool2 = new pkg.Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 30000,
  statement_timeout: 30000,
})
pool2.on('error', e => console.error('[pool2] non-fatal:', e.message))
await pool2.query(`
  CREATE TABLE IF NOT EXISTS public.lc_cube_meta (ledger_n int, built_at timestamptz);
  TRUNCATE public.lc_cube_meta;
  INSERT INTO public.lc_cube_meta (ledger_n, built_at) VALUES ($1, now())
`, [ledger_n])
await pool2.end()
console.log(`Recorded snapshot: ${ledger_n} rows at ${new Date().toISOString()}`)
