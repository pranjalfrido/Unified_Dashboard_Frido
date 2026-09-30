// Fast refresh — rebuilds only the tables the main dashboard numbers depend on.
// Runs in ~2 min vs ~10 min for the full refresh.
//
// What this rebuilds (needed for cost totals, monthly trend, courier/zone breakdown):
//   lc_addon_rate   — surcharge load per courier per month
//   lc_fwd_median   — median forward cost for RTO netting
//   lc_cube         — the pre-aggregated cube the dashboard reads
//
// What this SKIPS (billing accuracy / dispute / claimable sections only):
//   lc_card_dedup, lc_billing_summary, lc_courier_disputes,
//   lc_month_claims, lc_slab_costs
// Run the full scripts/refresh-cost-aggregates.mjs monthly (or after a rate card update)
// to keep those sections current.

import pkg from 'pg'
import { config } from 'dotenv'
import { loadCourierProfiles, persistCourierProfiles } from './courier-profiles.mjs'
import { buildCube } from '../api/logistics-cost.js'
config()

const directUrl = process.env.SUPABASE_DB_URL
  || (process.env.SUPABASE_URL || '').replace(':6543/', ':5432/')

const pool = new pkg.Pool({
  connectionString: directUrl,
  ssl: { rejectUnauthorized: false }, max: 2,
  connectionTimeoutMillis: 60000,
  idleTimeoutMillis: 120000,
  statement_timeout: 900000,
})
pool.on('error', e => console.error('[pool] non-fatal:', e.message))

const EX_GST = `
  CASE WHEN abs(total_cost::float8
              / NULLIF(freight_charge::float8 + COALESCE(surcharge::float8, 0)
                     + COALESCE(other_charge::float8, 0), 0) - 1.18) < 0.005
       THEN total_cost::float8 / 1.18 ELSE total_cost::float8 END`

async function swap(name, createSql, indexSql) {
  const t = Date.now()
  const c = await pool.connect()
  try {
    await c.query('SET statement_timeout = 900000')
    await c.query(`DROP TABLE IF EXISTS public.${name}_new`)
    await c.query(createSql.replace('__TARGET__', `public.${name}_new`))
    if (indexSql) await c.query(indexSql.replace('__IDX__', `idx_${name}_new`).replace('__TARGET__', `public.${name}_new`))
    await c.query(`ANALYZE public.${name}_new`)
    await c.query('BEGIN')
    await c.query(`DROP TABLE IF EXISTS public.${name}`)
    await c.query(`ALTER TABLE public.${name}_new RENAME TO ${name}`)
    if (indexSql) await c.query(`ALTER INDEX idx_${name}_new RENAME TO idx_${name}`)
    await c.query('COMMIT')
    const { rows } = await c.query(`SELECT COUNT(*)::int n FROM public.${name}`)
    console.log(`  ${name.padEnd(22)} ${String(rows[0].n).padStart(6)} rows  ${((Date.now() - t) / 1000).toFixed(1)}s`)
  } finally {
    c.release()
  }
}

console.log('refreshing lc_cube (fast path)…')

const profileClient = await pool.connect()
await profileClient.query('SET statement_timeout = 900000')
const profilePool = { query: (...args) => profileClient.query(...args) }
try {
  const PROFILES = await loadCourierProfiles(profilePool)
  await persistCourierProfiles(profilePool, PROFILES)
} finally {
  profileClient.release()
}

await swap('lc_addon_rate', `
  CREATE TABLE __TARGET__ AS
  SELECT courier_name, month_year,
         GREATEST(SUM(${EX_GST}) / NULLIF(SUM(freight_charge)::float8, 0) - 1, 0) AS addon_rate
    FROM public.logistics_invoices_b2c
   WHERE total_cost > 0 AND freight_charge > 0
   GROUP BY 1, 2
`, 'CREATE INDEX __IDX__ ON __TARGET__ (courier_name, month_year)')

const SLAB = `CASE WHEN i.charged_weight_courier > 0 AND i.charged_weight_courier <= 0.5 THEN 0.5
                   WHEN i.charged_weight_courier > 0 THEN CEIL(i.charged_weight_courier)
                   ELSE 0 END`

await swap('lc_fwd_median', `
  CREATE TABLE __TARGET__ AS
  SELECT i.courier_name, i.zone, COALESCE(i.courier_account_type, '(none)') AS acct,
         ${SLAB} AS slab,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY ${EX_GST.replace(/total_cost|freight_charge|surcharge|other_charge/g, m => 'i.' + m)}) AS fwd_t
    FROM public.logistics_invoices_b2c i
   WHERE upper(i.shipment_mode) = 'FORWARD' AND i.total_cost > 0
     AND i.zone IN ('A','B','C','D','E') AND i.charged_weight_courier <= 500
   GROUP BY 1, 2, 3, 4
`, 'CREATE INDEX __IDX__ ON __TARGET__ (courier_name, zone, acct, slab)')

const t = Date.now()
const n = await buildCube(pool)
console.log(`  ${'lc_cube'.padEnd(22)} ${String(n).padStart(6)} rows  ${((Date.now() - t) / 1000).toFixed(1)}s`)

console.log('fast refresh done.')
await pool.end()
