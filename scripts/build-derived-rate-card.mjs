// Builds public.logistics_rate_card_derived — a month-wise rate card measured from the
// invoices, used for COST ANALYSIS ONLY.
//
// NOT FOR CLAIMS. The card is derived from the same invoices it would be used to audit, so
// a courier that overbills consistently has that overbilling baked in as its rate. Use the
// signed contract cards for any recoverable figure. This card answers "what did a 2 kg
// parcel to zone C actually cost", which the contract cannot.
//
// ── THE ONE DESIGN DECISION THAT MAKES THIS WORK ──
//
// Rates are derived on the COURIER'S CHARGED WEIGHT, then applied to OUR DECLARED WEIGHT.
//
// If the card were derived on declared weight, an inflated shipment would land in the wrong
// slab, its cost would be averaged into a heavier cell, and the inflation would become the
// "normal" rate for that slab — partly cancelling the error we are trying to measure.
// Deriving on charged weight keeps the card independent of our own weights, so the entire
// difference between the two is attributable to WEIGHT, not rate. Holding month constant
// removes rate drift as well.
//
// ── PAYMENT MODE IS PART OF THE GRAIN ──
//
// Some couriers price COD into the freight line rather than as a separate fee. Swift, April,
// zone D, 0.5 kg, forward: Surface Prepaid ₹31 (5,309 rows) · Surface COD ₹55 (884) ·
// NDD Prepaid ₹45 · NDD COD ₹70 — four exact rates, each internally consistent. Keying
// without payment_mode collapsed all four to a ₹31 median, under-priced every COD shipment
// by ₹24, and misattributed the shortfall to "rate variance" (₹12.27 L on Swift alone).
//
// ── FALLBACK CHAIN (agreed with the user) ──
//
// Slicing by month makes thin cells common, so each priced row records WHICH tier priced it
// rather than silently assuming coverage:
//   tier 1  month_exact   this month's cell, n >= 20            — preferred
//   tier 2  all_period    same key, all months pooled, n >= 20  — rate is stable, month thin
//   tier 3  courier_zone  courier x leg x zone, any slab, per-kg — slab too thin to price
//   tier 4  unpriced      no basis; excluded from variance, reported as coverage loss
//
//   node scripts/build-derived-rate-card.mjs --dry-run
//   node scripts/build-derived-rate-card.mjs
//   node scripts/build-derived-rate-card.mjs --month 2026-07   (refresh one month)

import pkg from 'pg'
import { config } from 'dotenv'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

config()
const { Pool } = pkg

const argv = process.argv.slice(2)
const arg = n => { const i = argv.indexOf(n); return i !== -1 ? argv[i + 1] : null }
const DRY = argv.includes('--dry-run')
const ONE_MONTH = arg('--month')
const MIN_N = parseInt(arg('--min') || '20', 10)

const __dirname = dirname(fileURLToPath(import.meta.url))
const connStr = process.env.SUPABASE_URL
if (!connStr) { console.error('SUPABASE_URL not set'); process.exit(1) }
const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false }, max: 3 })

// Delhivery's total_cost was uploaded GST-inclusive. Keyed on the 1.18 RATIO, not the
// courier name, so it becomes a no-op once ex-GST totals are uploaded — a name-based rule
// would strip another 18% from the corrected file.
const EX_GST = `
  CASE WHEN abs(total_cost::float8
              / NULLIF(freight_charge::float8 + COALESCE(surcharge::float8, 0)
                     + COALESCE(other_charge::float8, 0), 0) - 1.18) < 0.005
       THEN total_cost::float8 / 1.18 ELSE total_cost::float8 END`

const SCOPE = `total_cost > 0 AND zone IN ('A','B','C','D','E')
               AND charged_weight_courier <= 500 AND month_year IS NOT NULL`

// Slab from the COURIER'S charged weight — see the header note. 0.5 kg floor then round up.
// NULL for Bluedart B2B, which its contract prices per actual kg.
const SLAB = `CASE WHEN courier_name = 'Bluedart B2B' THEN NULL
                   WHEN charged_weight_courier <= 0.5 THEN 0.5
                   ELSE CEIL(charged_weight_courier) END`

const LEG = `CASE WHEN upper(shipment_mode) = 'FORWARD' THEN 'Forward'
                  WHEN upper(shipment_mode) = 'RTO'     THEN 'RTO'
                  ELSE 'Reverse' END`

// RTO rows bundle forward + return for five couriers, so the return leg is the row minus
// the matching forward cost. Bluedart/Urbanbolt already invoice the return leg alone.
const RTO_BUNDLES = ['Delhivery', 'ElasticRun', 'Shadowfax', 'SkyAir', 'Swift']

// ── 1. Ensure the table exists ──
const ddl = readFileSync(join(__dirname, 'sql', 'derived-rate-card.sql'), 'utf8')
if (!DRY) {
  await pool.query(ddl)
  console.log('table ready')
} else {
  console.log('DRY RUN — no DDL, no writes')
}

// ── 2. Measure every cell ──
const monthFilter = ONE_MONTH ? `AND month_year = '${ONE_MONTH}'` : ''

const { rows: cells } = await pool.query(`
  WITH fwd AS (
    SELECT month_year, courier_name, COALESCE(courier_account_type,'(none)') AS acct,
           zone, ${SLAB} AS slab, COALESCE(payment_mode,'(none)') AS pay,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY freight_charge::float8) AS fwd_f
      FROM public.logistics_invoices_b2c
     WHERE ${SCOPE} AND upper(shipment_mode) = 'FORWARD'
     GROUP BY 1,2,3,4,5,6
  ),
  raw AS (
    SELECT month_year, courier_name, COALESCE(courier_account_type,'(none)') AS acct,
           zone, ${SLAB} AS slab, ${LEG} AS leg, shipment_mode,
           COALESCE(payment_mode,'(none)') AS pay,
           charged_weight_courier::float8 AS cw,
           freight_charge::float8 AS f,
           ${EX_GST} AS t
      FROM public.logistics_invoices_b2c
     WHERE ${SCOPE} ${monthFilter}
  ),
  b AS (
    SELECT r.month_year, r.courier_name, r.acct, r.zone, r.slab, r.leg, r.pay, r.cw, r.t,
           CASE WHEN upper(r.shipment_mode) = 'RTO' AND r.courier_name = ANY($1)
                     AND f.fwd_f IS NOT NULL
                THEN GREATEST(r.f - f.fwd_f, 0) ELSE r.f END AS f
      FROM raw r
      LEFT JOIN fwd f ON f.month_year = r.month_year AND f.courier_name = r.courier_name
                     AND f.acct = r.acct AND f.zone = r.zone
                     AND f.slab IS NOT DISTINCT FROM r.slab
                     AND f.pay = r.pay
  )
  SELECT month_year, courier_name, acct, leg, zone, slab, pay,
         COUNT(*)::int AS n,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY f)::float8 AS median,
         (SUM(f) / COUNT(*))::float8 AS wavg,
         MIN(f)::float8 AS fmin, MAX(f)::float8 AS fmax,
         CASE WHEN AVG(f) > 0 THEN STDDEV_POP(f) / AVG(f) ELSE 0 END::float8 AS cv,
         -- Add-on load measured off the total, not by summing the surcharge columns:
         -- those columns do not always account for the whole freight-to-total gap.
         GREATEST(SUM(t) / NULLIF(SUM(f), 0) - 1, 0)::float8 AS sur_rate,
         (SUM(t) / COUNT(*))::float8 AS total_wavg,
         (SUM(t) / NULLIF(SUM(cw), 0))::float8 AS cpk
    FROM b
   GROUP BY 1,2,3,4,5,6,7
   ORDER BY 1,2,3,4,5,6,7
`, [RTO_BUNDLES])

const conf = cv => (cv < 0.05 ? 'tight' : cv < 0.20 ? 'loose' : 'scattered')
const priceable = cells.filter(c => c.n >= MIN_N)

console.log(`\nmeasured ${cells.length} cells · ${priceable.length} with n >= ${MIN_N}`)
const months = [...new Set(cells.map(c => c.month_year))].sort()
console.log(`months: ${months.join(', ')}`)
for (const t of ['tight', 'loose', 'scattered']) {
  console.log(`  ${t.padEnd(10)} ${priceable.filter(c => conf(c.cv) === t).length}`)
}

// ── 3. Upsert ──
// Every measured cell is stored, including thin ones: the shipments column lets the pricing
// path apply the n >= 20 rule, and a stored thin cell still documents that the combination
// exists. Filtering here would make "no cell" and "thin cell" indistinguishable.
if (!DRY) {
  const CHUNK = 500
  let written = 0
  for (let i = 0; i < cells.length; i += CHUNK) {
    const batch = cells.slice(i, i + CHUNK)
    const vals = []
    const params = []
    batch.forEach((c, k) => {
      const b = k * 17
      vals.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6}::numeric,$${b+7},$${b+8}::int,`
        + `$${b+9}::numeric,$${b+10}::numeric,$${b+11}::numeric,$${b+12}::numeric,`
        + `$${b+13}::numeric,$${b+14},$${b+15}::numeric,$${b+16}::numeric,$${b+17}::numeric)`)
      params.push(c.month_year, c.courier_name, c.acct, c.leg, c.zone, c.slab, c.pay, c.n,
        c.median, c.wavg, c.fmin, c.fmax, c.cv, conf(c.cv), c.sur_rate, c.total_wavg, c.cpk)
    })
    await pool.query(`
      INSERT INTO public.logistics_rate_card_derived
        (month_year, courier_name, account_type, leg, zone, weight_slab, payment_mode,
         shipments,
         freight_median, freight_wavg, freight_min, freight_max, cv, confidence,
         surcharge_rate, total_wavg, cost_per_kg)
      VALUES ${vals.join(',')}
      ON CONFLICT (month_year, courier_name, account_type, leg, zone, weight_slab, payment_mode)
      DO UPDATE SET
        shipments = EXCLUDED.shipments,
        freight_median = EXCLUDED.freight_median, freight_wavg = EXCLUDED.freight_wavg,
        freight_min = EXCLUDED.freight_min, freight_max = EXCLUDED.freight_max,
        cv = EXCLUDED.cv, confidence = EXCLUDED.confidence,
        surcharge_rate = EXCLUDED.surcharge_rate, total_wavg = EXCLUDED.total_wavg,
        cost_per_kg = EXCLUDED.cost_per_kg, computed_at = now()
    `, params)
    written += batch.length
    process.stdout.write(`\r  written ${written}/${cells.length}`)
  }
  process.stdout.write('\n')
}

// ── 4. Coverage report: which tier would price each shipment? ──
// Run against the real ledger so the fallback distribution is measured, not assumed.
// Skipped on a dry run, which has no table to read.
if (DRY) {
  await pool.end()
  console.log('\nDRY RUN — coverage report needs the table; re-run without --dry-run.')
  process.exit(0)
}

const { rows: cov } = await pool.query(`
  WITH s AS (
    SELECT month_year, courier_name, COALESCE(courier_account_type,'(none)') AS acct,
           zone, ${LEG} AS leg, COALESCE(payment_mode,'(none)') AS pay,
           -- OUR declared weight decides the slab we price at; the card was built on
           -- theirs. That asymmetry is the measurement.
           CASE WHEN courier_name = 'Bluedart B2B' THEN NULL
                WHEN declared_weight_frido <= 0.5 THEN 0.5
                ELSE CEIL(declared_weight_frido) END AS our_slab
      FROM public.logistics_invoices_b2c
     WHERE ${SCOPE} AND declared_weight_frido > 0
  ),
  c AS (
    SELECT month_year, courier_name, account_type, leg, zone, weight_slab, payment_mode,
           shipments
      FROM public.logistics_rate_card_derived
  ),
  allp AS (
    SELECT courier_name, account_type, leg, zone, weight_slab, payment_mode, SUM(shipments) n
      FROM public.logistics_rate_card_derived GROUP BY 1,2,3,4,5,6
  ),
  cz AS (
    -- Tier 3 drops the slab AND the payment mode: at that point we are only asserting a
    -- courier-zone-leg average, so keeping payment in the key would just shrink it further.
    SELECT courier_name, leg, zone, SUM(shipments) n
      FROM public.logistics_rate_card_derived GROUP BY 1,2,3
  )
  SELECT CASE
           WHEN m.shipments >= ${MIN_N}  THEN '1 month_exact'
           WHEN a.n         >= ${MIN_N}  THEN '2 all_period'
           WHEN z.n         >= ${MIN_N}  THEN '3 courier_zone'
           ELSE '4 unpriced'
         END AS tier,
         COUNT(*)::int AS shipments
    FROM s
    LEFT JOIN c    m ON m.month_year = s.month_year AND m.courier_name = s.courier_name
                    AND m.account_type = s.acct AND m.leg = s.leg AND m.zone = s.zone
                    AND m.weight_slab IS NOT DISTINCT FROM s.our_slab
                    AND m.payment_mode = s.pay
    LEFT JOIN allp a ON a.courier_name = s.courier_name AND a.account_type = s.acct
                    AND a.leg = s.leg AND a.zone = s.zone
                    AND a.weight_slab IS NOT DISTINCT FROM s.our_slab
                    AND a.payment_mode = s.pay
    LEFT JOIN cz   z ON z.courier_name = s.courier_name AND z.leg = s.leg AND z.zone = s.zone
   GROUP BY 1 ORDER BY 1
`)

const totCov = cov.reduce((s, r) => s + r.shipments, 0)
console.log('\nfallback tier coverage (priced on OUR declared weight):')
for (const r of cov) {
  console.log(`  ${r.tier.padEnd(16)} ${String(r.shipments).padStart(7)}  ${(r.shipments / totCov * 100).toFixed(2)}%`)
}

await pool.end()
console.log(DRY ? '\nDRY RUN — re-run without --dry-run to write.' : '\ndone')
