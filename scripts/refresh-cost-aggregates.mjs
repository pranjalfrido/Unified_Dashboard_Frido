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
import { loadCourierProfiles, persistCourierProfiles, PER_KG_COURIERS, sqlList } from './courier-profiles.mjs'
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

// Measure how each courier bills BEFORE building anything off it, and store the result so
// the API request path can read it instead of re-measuring per call. Logged each run so a
// newly dumped courier changing a classification is visible rather than silent.
const PROFILES = await loadCourierProfiles(pool)
await persistCourierProfiles(pool, PROFILES)

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
const SL = c => `CASE WHEN i.courier_name IN (${sqlList(PER_KG_COURIERS)}) THEN NULL
                      WHEN ${c}>0 AND ${c}<=0.5 THEN 0.5
                      WHEN ${c}>0 THEN CEIL(${c}) ELSE 0 END`
const EXI = EX_GST.replace(/(total_cost|freight_charge|surcharge|other_charge)/g, 'i.$1')

// OUR weight, falling back to the courier's when we did not declare one.
//
// 17,507 Delhivery shipments (₹13.48 L) carry no declared weight. Requiring one dropped them
// from every figure, so spend was understated. Falling back to the courier's own weight keeps
// them in the cost analysis and yields a zero weight gap for those rows — which is the honest
// result: with nothing declared on our side there is no discrepancy to claim, only a
// data-capture gap to fix upstream.
const OUR_WT = 'COALESCE(NULLIF(i.declared_weight_frido, 0), i.charged_weight_courier)'
// Slab of a weight column, matching the card's own grain. NULL for Bluedart B2B, which its
// contract prices per actual kg with no slabbing.
const SLABC = col => `CASE WHEN i.courier_name IN (${sqlList(PER_KG_COURIERS)}) THEN NULL
                           WHEN ${col} > 0 AND ${col} <= 0.5 THEN 0.5
                           WHEN ${col} > 0 THEN CEIL(${col}) ELSE 0 END`

// One row per key, so a courier with duplicate card rows cannot fan the join out. Bluedart
// B2B carries a NULL weight_slab and IS NOT DISTINCT FROM matches NULL to NULL, so it matched
// all 4 rows per key — 16x once the card is joined twice, which inflated the invoiced total
// by ₹3.31 Cr. MIN() collapses each key to a single rate.
// Card collapsed to ONE row per key, materialised so the join is a plain indexed lookup.
//
// Bluedart B2B carries a NULL weight_slab (its contract prices per actual kg) and
// IS NOT DISTINCT FROM matches NULL to NULL, so each of its shipments matched all 4 rows for
// its key — 16x once the card is joined twice. That inflated the invoiced total by ₹3.31 Cr
// and put "Actually Billed" at ₹10.17 Cr against a true ₹6.86 Cr. Every other courier was
// already 1.00x, which is why it stayed hidden.
//
// Built as a TABLE rather than an inline subquery: as a subquery it re-aggregated the card
// on each of the two joins and lc_billing_summary exceeded the 300s statement timeout.
await swap('lc_card_dedup', `
  CREATE TABLE __TARGET__ AS
  SELECT month_year, courier_name, account_type, leg, zone, payment_mode, weight_slab,
         MIN(freight_median) AS freight_median,
         MIN(surcharge_rate) AS surcharge_rate
    FROM public.logistics_rate_card_derived
   WHERE shipments >= 20
   GROUP BY 1,2,3,4,5,6,7
`, 'CREATE INDEX __IDX__ ON __TARGET__ (courier_name, month_year, account_type, leg, zone, payment_mode, weight_slab)')

const CARD = (a, w) => `
  JOIN public.lc_card_dedup ${a}
       ON ${a}.month_year = i.month_year AND ${a}.courier_name = i.courier_name
      AND ${a}.account_type = COALESCE(i.courier_account_type,'(none)')
      AND ${a}.leg = ${LEG} AND ${a}.zone = i.zone
      AND ${a}.weight_slab IS NOT DISTINCT FROM ${SL(w)}
      AND ${a}.payment_mode = COALESCE(i.payment_mode,'(none)')`

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
    ${CARD('dco', OUR_WT)}
   WHERE i.total_cost > 0 AND i.zone IN ('A','B','C','D','E')
     AND i.charged_weight_courier <= 500
     AND i.month_year IS NOT NULL
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
      ${CARD('dco', OUR_WT)}
     WHERE i.total_cost > 0 AND i.zone IN ('A','B','C','D','E')
       AND i.charged_weight_courier <= 500
       AND i.month_year IS NOT NULL
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


// ── Claimable weight overbilling per month, for the Monthly Trend table ──
// Same total-cost basis and same per-ROW clamp as lc_billing_summary and
// lc_courier_disputes, so the monthly column sums to the headline figure rather than telling
// a third story. Only the WEIGHT component is claimable — the rate variance is measured
// against a card derived from these same invoices, so it flags inconsistency with the
// courier's own behaviour rather than a breach of the signed contract.
await swap('lc_month_claims', `
  CREATE TABLE __TARGET__ AS
  WITH j AS (
    SELECT i.month_year,
           dco.freight_median * (1 + dco.surcharge_rate) AS ours,
           dct.freight_median * (1 + dct.surcharge_rate) AS theirs,
           ${EXI} AS invoiced
      FROM public.logistics_invoices_b2c i
      ${CARD('dct','i.charged_weight_courier')}
      ${CARD('dco', OUR_WT)}
     WHERE i.total_cost > 0 AND i.zone IN ('A','B','C','D','E')
       AND i.charged_weight_courier <= 500
       AND i.month_year IS NOT NULL
  )
  SELECT month_year,
         COUNT(*)::int AS priced_n,
         COALESCE(SUM(GREATEST(theirs - ours, 0)), 0)::float8   AS weight_claim,
         COALESCE(SUM(GREATEST(invoiced - theirs, 0)), 0)::float8 AS rate_variance,
         COUNT(*) FILTER (WHERE theirs - ours > 1)::int AS affected_n,
         COALESCE(SUM(invoiced), 0)::float8 AS invoiced_rs
    FROM j
   GROUP BY 1
`, 'CREATE INDEX __IDX__ ON __TARGET__ (month_year)')



// ── Cost analysis per billable weight slab ──
//
// One row per slab (0.5, 1, 2, 3 … kg) with the leg split, claimable weight overbilling and
// the weight gap that causes it. Replaces the Prepaid-vs-COD donuts, which only restated the
// COD premium already stated in a KPI tile.
//
// Slab is the COURIER'S charged weight rounded to how they bill — 0.5 kg floor then up to the
// next whole kg — because that is the unit the invoice is priced on. Claim and rate use the
// same total-cost basis and per-ROW clamp as every other view, so this table's Claimable
// column sums to the same headline figure.
await swap('lc_slab_costs', `
  CREATE TABLE __TARGET__ AS
  WITH card AS (
    -- ONE row per key. Bluedart B2B has a NULL weight_slab, and IS NOT DISTINCT FROM treats
    -- NULL as equal to NULL, so joining the card directly fanned each of its shipments across
    -- all 112 NULL-slab rows — inflating the table to 699,419 rows and ₹11.23 Cr against the
    -- true 667,139 and ₹6.99 Cr. Collapsing first keeps the join one-to-one.
    SELECT month_year, courier_name, account_type, leg, zone, payment_mode, weight_slab,
           MIN(freight_median * (1 + surcharge_rate)) AS rate
      FROM public.logistics_rate_card_derived
     WHERE shipments >= 20
     GROUP BY 1,2,3,4,5,6,7
  ),
  j AS (
    SELECT CASE WHEN i.charged_weight_courier <= 0.5 THEN 0.5
                ELSE CEIL(i.charged_weight_courier) END AS slab,
           ${LEG} AS leg,
           -- Courier's own invoiced amount and charged weight: a cost analysis reports what
           -- was actually billed, not what a card says it should have been.
           ${EXI} AS invoiced,
           i.charged_weight_courier::float8 AS cw,
           ${OUR_WT}::float8 AS dw,
           co.rate AS ours, ct.rate AS theirs
      FROM public.logistics_invoices_b2c i
      -- LEFT: the card is needed only for the claim column, so a shipment with no priceable
      -- cell must still appear in the SPEND figures.
      LEFT JOIN card ct ON ct.month_year = i.month_year AND ct.courier_name = i.courier_name
                       AND ct.account_type = COALESCE(i.courier_account_type,'(none)')
                       AND ct.leg = ${LEG} AND ct.zone = i.zone
                       AND ct.payment_mode = COALESCE(i.payment_mode,'(none)')
                       AND ct.weight_slab IS NOT DISTINCT FROM ${SLABC('i.charged_weight_courier')}
      LEFT JOIN card co ON co.month_year = i.month_year AND co.courier_name = i.courier_name
                       AND co.account_type = COALESCE(i.courier_account_type,'(none)')
                       AND co.leg = ${LEG} AND co.zone = i.zone
                       AND co.payment_mode = COALESCE(i.payment_mode,'(none)')
                       AND co.weight_slab IS NOT DISTINCT FROM ${SLABC(OUR_WT)}
     WHERE i.total_cost > 0 AND i.zone IN ('A','B','C','D','E')
       AND i.charged_weight_courier <= 500
  )
  SELECT slab,
         COUNT(*)::int AS n,
         COALESCE(SUM(invoiced), 0)::float8 AS cost,
         (SUM(invoiced) / COUNT(*))::float8 AS avg_cost,
         (SUM(invoiced) / NULLIF(SUM(cw), 0))::float8 AS cpk,
         COUNT(*) FILTER (WHERE leg = 'Forward')::int AS fwd_n,
         AVG(invoiced) FILTER (WHERE leg = 'Forward')::float8 AS fwd_avg,
         COUNT(*) FILTER (WHERE leg = 'Reverse')::int AS rev_n,
         AVG(invoiced) FILTER (WHERE leg = 'Reverse')::float8 AS rev_avg,
         COUNT(*) FILTER (WHERE leg = 'RTO')::int AS rto_n,
         AVG(invoiced) FILTER (WHERE leg = 'RTO')::float8 AS rto_avg,
         COALESCE(SUM(GREATEST(theirs - ours, 0))
                  FILTER (WHERE ours IS NOT NULL AND theirs IS NOT NULL AND dw > 0), 0)::float8 AS claim_rs,
         COUNT(*) FILTER (WHERE ours IS NOT NULL AND theirs IS NOT NULL AND dw > 0
                            AND theirs - ours > 1)::int AS claim_n,
         AVG(cw - dw) FILTER (WHERE dw > 0)::float8 AS avg_gap_kg
    FROM j
   GROUP BY 1
`, 'CREATE INDEX __IDX__ ON __TARGET__ (slab)')

console.log('all aggregates refreshed.')
await pool.end()