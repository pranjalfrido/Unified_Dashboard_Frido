// Rebuilds the pre-computed tables the Logistics Cost tab reads.
//
// WHY THESE EXIST: both were CTEs recomputed inside every dashboard query. `rates` aggregates
// the whole ledger and was inlined into BASE, which four separate queries expand — so one page
// load re-derived it four times. Neither depends on the page filters, so both are computed
// here instead and the tab just reads them.
//
// RUN THIS AFTER EVERY INVOICE UPLOAD. Nothing triggers it automatically: a filter change or a
// page reload must never rebuild these, which is the whole point. Pair it with
// scripts/build-derived-rate-card.mjs, which has the same trigger.
//
//   node scripts/refresh-cost-aggregates.mjs

import pkg from 'pg'
import { config } from 'dotenv'
config()

const pool = new pkg.Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl: { rejectUnauthorized: false }, max: 2,
  connectionTimeoutMillis: 60000,
  idleTimeoutMillis: 120000,
  statement_timeout: 300000,
})

// Must stay identical to api/logistics-cost.js, or the numbers silently diverge.
const EX_GST = `
  CASE WHEN abs(total_cost::float8
              / NULLIF(freight_charge::float8 + COALESCE(surcharge::float8, 0)
                     + COALESCE(other_charge::float8, 0), 0) - 1.18) < 0.005
       THEN total_cost::float8 / 1.18 ELSE total_cost::float8 END`

const SLAB = `CASE WHEN i.charged_weight_courier > 0 AND i.charged_weight_courier <= 0.5 THEN 0.5
                   WHEN i.charged_weight_courier > 0 THEN CEIL(i.charged_weight_courier)
                   ELSE 0 END`

// Build beside the live table then swap, so the dashboard never queries a missing table.
// ONE client for the whole swap. The build statements run for tens of seconds and the
// BEGIN/COMMIT must share a session, so acquiring a fresh pool connection per statement both
// risked a connect timeout mid-build and would have left the transaction on another session.
async function swap(name, createSql, indexSql) {
  const t = Date.now()
  const c = await pool.connect()
  try {
    await c.query('SET statement_timeout = 300000')
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

console.log('refreshing cost aggregates…')

// Add-on load per courier per month: (ex-GST total / freight) - 1. Derived from the total
// rather than by summing the surcharge columns, which do not capture the whole gap —
// Delhivery's columns sum to 6.3% against a real 20.0% load.
await swap('lc_addon_rate', `
  CREATE TABLE __TARGET__ AS
  SELECT courier_name, month_year,
         GREATEST(SUM(${EX_GST}) / NULLIF(SUM(freight_charge)::float8, 0) - 1, 0) AS addon_rate
    FROM public.logistics_invoices_b2c
   WHERE total_cost > 0 AND freight_charge > 0
   GROUP BY 1, 2
`, 'CREATE INDEX __IDX__ ON __TARGET__ (courier_name, month_year)')

// Median forward cost per cell, used to net the bundled forward leg out of RTO rows.
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


// ── Weight-vs-rate attribution + Billing Accuracy totals ──
// A single-row summary. As a live query this was the most expensive on the page (30.6s): it
// joins the derived rate card TWICE across the full ledger, once at the courier's charged
// weight and once at our declared weight, and `IS NOT DISTINCT FROM` on the nullable slab
// column defeats index use on both joins.
//
// It is filter-independent by design — the split is a property of the whole book, not of a
// slicer selection — so it is computed once here.
const LEG = `CASE WHEN upper(i.shipment_mode)='FORWARD' THEN 'Forward'
                  WHEN upper(i.shipment_mode)='RTO' THEN 'RTO' ELSE 'Reverse' END`
const SL = c => `CASE WHEN i.courier_name='Bluedart B2B' THEN NULL
                      WHEN ${c}>0 AND ${c}<=0.5 THEN 0.5
                      WHEN ${c}>0 THEN CEIL(${c}) ELSE 0 END`
const EXI = EX_GST.replace(/(total_cost|freight_charge|surcharge|other_charge)/g, 'i.$1')
const CARD = (a, w) => `
  JOIN public.logistics_rate_card_derived ${a}
       ON ${a}.month_year = i.month_year AND ${a}.courier_name = i.courier_name
      AND ${a}.account_type = COALESCE(i.courier_account_type,'(none)')
      AND ${a}.leg = ${LEG} AND ${a}.zone = i.zone
      AND ${a}.weight_slab IS NOT DISTINCT FROM ${SL(w)}
      AND ${a}.payment_mode = COALESCE(i.payment_mode,'(none)')
      AND ${a}.shipments >= 20`

await swap('lc_billing_summary', `
  CREATE TABLE __TARGET__ AS
  SELECT COUNT(*)::int AS dc_n,
         COALESCE(SUM(dco.freight_median),0)::float8 AS dc_ours,
         COALESCE(SUM(dct.freight_median),0)::float8 AS dc_theirs,
         COALESCE(SUM(i.freight_charge),0)::float8   AS dc_invoiced,
         COUNT(*) FILTER (WHERE dct.freight_median - dco.freight_median > 1)::int AS dc_weight_n,
         COUNT(*) FILTER (WHERE i.freight_charge - dct.freight_median > 1)::int   AS dc_rate_n,
         COALESCE(SUM(dco.freight_median * (1 + dco.surcharge_rate)),0)::float8 AS dt_ours,
         COALESCE(SUM(dct.freight_median * (1 + dct.surcharge_rate)),0)::float8 AS dt_theirs,
         COALESCE(SUM(${EXI}),0)::float8 AS dt_invoiced,
         COUNT(*) FILTER (WHERE dct.freight_median*(1+dct.surcharge_rate)
                              - dco.freight_median*(1+dco.surcharge_rate) > 1)::int AS dt_weight_n,
         COUNT(*) FILTER (WHERE ${EXI}
                              - dct.freight_median*(1+dct.surcharge_rate) > 1)::int AS dt_rate_n,
         -- Per-ROW clamped: the claimable figure. Netting on the grand total lets a shipment
         -- billed BELOW card cancel one billed above it, but you cannot invoice a courier for
         -- the under-billed parcels — so the clamp belongs on each row, not on the sum.
         COALESCE(SUM(GREATEST(dct.freight_median*(1+dct.surcharge_rate)
                             - dco.freight_median*(1+dco.surcharge_rate), 0)), 0)::float8 AS dt_weight_claim,
         COALESCE(SUM(GREATEST(${EXI}
                             - dct.freight_median*(1+dct.surcharge_rate), 0)), 0)::float8 AS dt_rate_claim
    FROM public.logistics_invoices_b2c i
    ${CARD('dct','i.charged_weight_courier')}
    ${CARD('dco','i.declared_weight_frido')}
   WHERE i.total_cost > 0 AND i.zone IN ('A','B','C','D','E')
     AND i.charged_weight_courier <= 500
     AND i.declared_weight_frido > 0 AND i.month_year IS NOT NULL
`, null)

// ── Per-courier dispute breakdown, on the SAME total-cost basis as lc_billing_summary ──
//
// WHY: the Recoverable by Cause section was computing its own figures from frido_billed_cost
// / frido_carrier_cost, which price BASE FREIGHT only. Cost Overview meanwhile reports the
// total-cost basis. The page therefore showed two different "claimable" totals — ₹76.78 L
// here against ₹32.34 L there — with no way for a reader to tell which was right.
//
// It also divided each courier's claim by its ENTIRE shipment count, so Bluedart read ₹7.1
// per shipment when only ~106k of its 431k shipments are disputed at all. Counting only the
// disputed rows gives ₹28.60, which is the number a claim is actually argued on.
await swap('lc_courier_disputes', `
  CREATE TABLE __TARGET__ AS
  WITH j AS (
    SELECT i.courier_name,
           dco.freight_median * (1 + dco.surcharge_rate) AS ours,
           dct.freight_median * (1 + dct.surcharge_rate) AS theirs,
           ${EXI} AS invoiced
      FROM public.logistics_invoices_b2c i
      ${CARD('dct','i.charged_weight_courier')}
      ${CARD('dco','i.declared_weight_frido')}
     WHERE i.total_cost > 0 AND i.zone IN ('A','B','C','D','E')
       AND i.charged_weight_courier <= 500
       AND i.declared_weight_frido > 0 AND i.month_year IS NOT NULL
  )
  SELECT courier_name,
         COUNT(*)::int AS priced_n,
         -- GREATEST(...,0): billing BELOW their own card is not an overcharge, and letting it
         -- go negative would net off real overbilling on other shipments.
         COALESCE(SUM(GREATEST(theirs - ours, 0)), 0)::float8   AS weight_rs,
         COALESCE(SUM(GREATEST(invoiced - theirs, 0)), 0)::float8 AS rate_rs,
         COALESCE(SUM(GREATEST(theirs - ours, 0) + GREATEST(invoiced - theirs, 0)), 0)::float8 AS total_rs,
         -- Denominator for a per-shipment figure: rows with a dispute worth more than ₹1,
         -- not every shipment the courier carried.
         COUNT(*) FILTER (WHERE GREATEST(theirs - ours, 0) + GREATEST(invoiced - theirs, 0) > 1)::int AS disputed_n,
         COALESCE(SUM(invoiced), 0)::float8 AS invoiced_rs
    FROM j
   GROUP BY 1
`, 'CREATE INDEX __IDX__ ON __TARGET__ (courier_name)')


console.log('all aggregates refreshed.')
await pool.end()