// Rebuilds public.lc_fwd_median — the per (courier, zone, account, slab) median forward cost
// used to strip the bundled forward leg out of RTO rows in the Cost by Product query.
//
// WHY IT IS MATERIALISED: this was an inline CTE recomputed on every dashboard request, and
// it cost ~40s of that query's 45s because it medians the entire ledger. Nothing about it
// depends on the page slicers, so it is computed once here instead.
//
// RUN THIS whenever new invoices are uploaded — the medians go stale otherwise. Pair it with
// scripts/build-derived-rate-card.mjs, which has the same trigger.
//
//   node scripts/refresh-fwd-median.mjs

import pkg from 'pg'
import { config } from 'dotenv'
config()

const pool = new pkg.Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl: { rejectUnauthorized: false }, max: 2,
})

// Must match api/logistics-cost.js exactly, or the join silently misses rows.
const EX_GST = `
  CASE WHEN abs(i.total_cost::float8
              / NULLIF(i.freight_charge::float8 + COALESCE(i.surcharge::float8, 0)
                     + COALESCE(i.other_charge::float8, 0), 0) - 1.18) < 0.005
       THEN i.total_cost::float8 / 1.18 ELSE i.total_cost::float8 END`
const SLAB = `CASE WHEN i.charged_weight_courier > 0 AND i.charged_weight_courier <= 0.5 THEN 0.5
                   WHEN i.charged_weight_courier > 0 THEN CEIL(i.charged_weight_courier)
                   ELSE 0 END`

const t0 = Date.now()

// Build beside the live table, then swap: a DROP-then-CREATE would leave the dashboard
// querying a missing table for the seconds the rebuild takes.
await pool.query('DROP TABLE IF EXISTS public.lc_fwd_median_new')
await pool.query(`
  CREATE TABLE public.lc_fwd_median_new AS
  SELECT i.courier_name, i.zone, COALESCE(i.courier_account_type, '(none)') AS acct,
         ${SLAB} AS slab,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY ${EX_GST}) AS fwd_t
    FROM public.logistics_invoices_b2c i
   WHERE upper(i.shipment_mode) = 'FORWARD' AND i.total_cost > 0
     AND i.zone IN ('A','B','C','D','E') AND i.charged_weight_courier <= 500
   GROUP BY 1, 2, 3, 4
`)
await pool.query('CREATE INDEX idx_lcfwd_new ON public.lc_fwd_median_new (courier_name, zone, acct, slab)')
await pool.query('ANALYZE public.lc_fwd_median_new')

await pool.query('BEGIN')
await pool.query('DROP TABLE IF EXISTS public.lc_fwd_median')
await pool.query('ALTER TABLE public.lc_fwd_median_new RENAME TO lc_fwd_median')
await pool.query('ALTER INDEX idx_lcfwd_new RENAME TO idx_lcfwd')
await pool.query('COMMIT')

const { rows } = await pool.query('SELECT COUNT(*)::int n FROM public.lc_fwd_median')
console.log(`lc_fwd_median rebuilt: ${rows[0].n} rows in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
await pool.end()
