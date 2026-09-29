// Derives a MASTER RATE CARD from what the couriers actually invoiced, rather than from
// the contract PDFs. Two sheets are written:
//
//   Sheet 1 "Master Rate Card" — courier x zone x account x slab x leg
//   Sheet 2 "Avg Cost by Slab" — consolidated avg total cost by slab for
//                                Forward / Reverse / RTO
//
// METHOD NOTES (these decide whether the output is trustworthy):
//
// * MEDIAN, not mean. Freight within a cell is mostly tight but has outliers; a mean
//   lets one ₹2,000 shipment distort a ₹40 slab. Median is the rate that actually
//   recurs. Mean is still reported alongside so the two can be compared.
//
// * Every row carries n, CV (coefficient of variation) and min/max. Measured across 742
//   cells with 20+ shipments: 382 are tight (CV<5%, a single rate genuinely exists),
//   313 loose (5-20%), 47 scattered (>20%). A scattered cell means "no single rate here"
//   and must not be read as a rate — the CV column is what tells you which is which.
//
// * BASE FREIGHT (freight_charge) for the rate card, because that is what a rate card
//   prices. Surcharges and other charges are billed on top and are reported separately.
//   Sheet 2 uses total_cost, since the question there was landed cost per slab.
//
// * RTO is the RETURN LEG ONLY everywhere in this workbook. Couriers record it two ways:
//   Bluedart/Urbanbolt invoice the return leg alone (raw ratio 0.900), while the other five
//   bundle forward + return into that one row (raw 1.8-2.0x). For the bundlers the matching
//   forward rate is subtracted, which lands every courier at ~0.9x of forward — one
//   contractual rule, two recording conventions. See RTO_BUNDLES_FORWARD.
//
//   node scripts/derive-rate-card.mjs
//   node scripts/derive-rate-card.mjs --min 10   (raise the per-cell shipment floor)

import pkg from 'pg'
import { config } from 'dotenv'
import XLSX from 'xlsx'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

config()
const { Pool } = pkg

const argv = process.argv.slice(2)
const arg = n => { const i = argv.indexOf(n); return i !== -1 ? argv[i + 1] : null }
const MIN_N = parseInt(arg('--min') || '5', 10)

const __dirname = dirname(fileURLToPath(import.meta.url))
// --out lets you write beside a copy that's already open in Excel (Windows locks it).
const OUT = arg('--out') || join(__dirname, '..', '..', 'Frido_Master_Rate_Card_Derived.xlsx')

const connStr = process.env.SUPABASE_URL
if (!connStr) { console.error('SUPABASE_URL not set'); process.exit(1) }
const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false }, max: 3 })

// Scope matches the dashboard exactly, so the sheet and the page can't disagree.
const SCOPE = `
  total_cost > 0
  AND zone IN ('A','B','C','D','E')
  AND charged_weight_courier <= 500
`

// Billable slab: 0.5 kg minimum, then round UP to the next whole kg — how courier rate
// cards actually step. <= 0.5 (not < 0.5) so an exactly-0.5 kg parcel stays in the
// 0.5 slab instead of being promoted to 1 kg.
const SLAB = `CASE WHEN charged_weight_courier <= 0.5 THEN 0.5
                   ELSE CEIL(charged_weight_courier) END`

// Three legs. RTO is kept SEPARATE here (unlike the dashboard, which folds it into
// Reverse for reporting) because the whole point of this sheet is to price each leg.
const LEG = `CASE WHEN upper(shipment_mode) = 'FORWARD' THEN 'Forward'
                  WHEN upper(shipment_mode) = 'RTO'     THEN 'RTO'
                  ELSE 'Reverse' END`

// Couriers whose RTO row bills FORWARD + RETURN in one number (verified: no RTO AWB has a
// separate forward row). For those, the return-leg charge is the row minus the matching
// forward rate. Bluedart/Urbanbolt already invoice the return leg alone, so they're absent.
const RTO_BUNDLES_FORWARD = ['Delhivery', 'ElasticRun', 'Shadowfax', 'SkyAir', 'Swift']

// Per courier/zone/account/slab forward benchmark, used to strip the bundled forward leg.
// Joined on the same keys the rate card groups by, so the subtraction is like-for-like.
const FWD_BENCH = `
  fwd AS (
    SELECT courier_name, zone, COALESCE(courier_account_type,'(none)') AS acct,
           ${SLAB} AS slab,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY freight_charge::float8) AS fwd_f,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY total_cost::float8)     AS fwd_t
      FROM public.logistics_invoices_b2c
     WHERE ${SCOPE} AND upper(shipment_mode) = 'FORWARD'
     GROUP BY 1,2,3,4
  )`

// Net out the forward leg for the bundling couriers only. GREATEST(...,0) guards the rare
// cell where the RTO row is cheaper than forward — a negative "rate" would be nonsense.
const netOf = (col, fwdCol) => `
  CASE WHEN upper(b.shipment_mode) = 'RTO' AND b.courier_name = ANY($1)
            AND fwd.${fwdCol} IS NOT NULL
       THEN GREATEST(${col} - fwd.${fwdCol}, 0)
       ELSE ${col} END`

console.log('Deriving rate card from invoiced data…')

// ── Sheet 1: master rate card ──
const { rows: card } = await pool.query(`
  WITH ${FWD_BENCH},
  raw AS (
    SELECT courier_name, zone, COALESCE(courier_account_type,'(none)') AS acct,
           ${SLAB} AS slab, ${LEG} AS leg, shipment_mode,
           freight_charge::float8 AS f, surcharge::float8 AS s,
           other_charge::float8 AS o, total_cost::float8 AS t
      FROM public.logistics_invoices_b2c
     WHERE ${SCOPE}
  ),
  b AS (
    SELECT b.courier_name, b.zone, b.acct, b.slab, b.leg,
           ${netOf('b.f', 'fwd_f')} AS f,
           ${netOf('b.t', 'fwd_t')} AS t,
           b.s, b.o
      FROM raw b
      LEFT JOIN fwd ON fwd.courier_name = b.courier_name AND fwd.zone = b.zone
                   AND fwd.acct = b.acct AND fwd.slab = b.slab
  )
  SELECT courier_name, zone, acct, slab, leg,
         COUNT(*)::int AS n,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY f)::float8 AS rate_median,
         AVG(f)::float8 AS rate_mean,
         MIN(f)::float8 AS rate_min,
         MAX(f)::float8 AS rate_max,
         CASE WHEN AVG(f) > 0 THEN STDDEV_POP(f) / AVG(f) ELSE 0 END::float8 AS cv,
         AVG(s)::float8 AS surcharge_avg,
         AVG(o)::float8 AS other_avg,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY t)::float8 AS total_median
    FROM b
   GROUP BY 1,2,3,4,5
  HAVING COUNT(*) >= ${MIN_N}
   ORDER BY courier_name, acct, leg, zone, slab
`, [RTO_BUNDLES_FORWARD])

// ── Measured leg multipliers, per courier ──
// Answers "how do I price RTO?" from evidence rather than assumption.
//
// CRITICAL — an RTO row's cost is not always the return leg alone. Verified: none of the
// 23,790 RTO AWBs has a separate Forward row, so for most couriers that single row bills
// forward + return together. Raw RTO/forward therefore reads 1.8-2.0x, which looks like
// "RTO costs double" but is really two legs in one number. Subtracting the forward leg
// gives the return-only charge, and it lands at ~0.9x for every courier — one contractual
// rule, recorded two different ways:
//   Bluedart/Urbanbolt  raw 0.900  net -0.100  -> row is the RETURN LEG ONLY
//   others              raw ~1.9   net ~0.9    -> row is FORWARD + RETURN, strip forward
// Both raw and net are reported so the convention per courier stays visible.
const { rows: mult } = await pool.query(`
  WITH b AS (
    SELECT courier_name, zone, COALESCE(courier_account_type,'(none)') AS acct,
           ${SLAB} AS slab, upper(shipment_mode) AS m, freight_charge::float8 AS f
      FROM public.logistics_invoices_b2c WHERE ${SCOPE}
  ),
  agg AS (
    SELECT courier_name, zone, acct, slab, m, COUNT(*) AS n,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY f) AS med
      FROM b GROUP BY 1,2,3,4,5 HAVING COUNT(*) >= 30
  )
  SELECT f.courier_name,
         COUNT(r.med)::int AS rto_cells,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY r.med / NULLIF(f.med,0))::float8 AS rto_ratio,
         -- Return leg alone: strip the bundled forward charge.
         percentile_cont(0.5) WITHIN GROUP
           (ORDER BY (r.med - f.med) / NULLIF(f.med,0))::float8 AS rto_net_ratio,
         COUNT(v.med)::int AS rev_cells,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY v.med / NULLIF(f.med,0))::float8 AS rev_ratio
    FROM agg f
    LEFT JOIN agg r ON r.courier_name=f.courier_name AND r.zone=f.zone AND r.acct=f.acct
                   AND r.slab=f.slab AND r.m='RTO'
    LEFT JOIN agg v ON v.courier_name=f.courier_name AND v.zone=f.zone AND v.acct=f.acct
                   AND v.slab=f.slab AND v.m IN ('REVERSE','RVP','DTO')
   WHERE f.m='FORWARD'
   GROUP BY 1 ORDER BY 1
`)

// ── Sheet 2: consolidated avg total cost by slab and leg ──
const { rows: bySlab } = await pool.query(`
  WITH ${FWD_BENCH},
  raw AS (
    SELECT courier_name, zone, COALESCE(courier_account_type,'(none)') AS acct,
           ${SLAB} AS slab, ${LEG} AS leg, shipment_mode,
           total_cost::float8 AS t, charged_weight_courier::float8 AS w
      FROM public.logistics_invoices_b2c WHERE ${SCOPE}
  ),
  b AS (
    SELECT b.slab, b.leg, b.w, ${netOf('b.t', 'fwd_t')} AS t
      FROM raw b
      LEFT JOIN fwd ON fwd.courier_name = b.courier_name AND fwd.zone = b.zone
                   AND fwd.acct = b.acct AND fwd.slab = b.slab
  )
  SELECT slab, leg,
         COUNT(*)::int AS shipments,
         AVG(t)::float8 AS avg_total_cost,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY t)::float8 AS median_total_cost,
         SUM(t)::float8 AS total_spend,
         (SUM(t) / NULLIF(SUM(w),0))::float8 AS cost_per_kg
    FROM b
   GROUP BY 1,2
   ORDER BY slab, leg
`, [RTO_BUNDLES_FORWARD])

// Wide pivot: one row per slab, a column per leg — the shape asked for.
const { rows: pivot } = await pool.query(`
  WITH ${FWD_BENCH},
  raw AS (
    SELECT courier_name, zone, COALESCE(courier_account_type,'(none)') AS acct,
           ${SLAB} AS slab, ${LEG} AS leg, shipment_mode, total_cost::float8 AS t
      FROM public.logistics_invoices_b2c WHERE ${SCOPE}
  ),
  b AS (
    SELECT b.slab, b.leg, ${netOf('b.t', 'fwd_t')} AS t
      FROM raw b
      LEFT JOIN fwd ON fwd.courier_name = b.courier_name AND fwd.zone = b.zone
                   AND fwd.acct = b.acct AND fwd.slab = b.slab
  )
  SELECT slab,
         COUNT(*) FILTER (WHERE leg='Forward')::int AS fwd_n,
         AVG(t) FILTER (WHERE leg='Forward')::float8 AS fwd_avg,
         COUNT(*) FILTER (WHERE leg='Reverse')::int AS rev_n,
         AVG(t) FILTER (WHERE leg='Reverse')::float8 AS rev_avg,
         COUNT(*) FILTER (WHERE leg='RTO')::int AS rto_n,
         AVG(t) FILTER (WHERE leg='RTO')::float8 AS rto_avg,
         COUNT(*)::int AS all_n,
         AVG(t)::float8 AS all_avg
    FROM b GROUP BY 1 ORDER BY slab
`, [RTO_BUNDLES_FORWARD])

// ── Product view: rates by category / sub-category, with dimensions ──
// Joins awb_shipment_dims (synced from BigQuery). Coverage is 99.5% on forward legs but
// only ~57% on RTO, so every row carries its own n — a thin cell must not read as a rate.
//
// "Mixed Shipments" is a multi-SKU parcel: its category is not a product attribute, so it
// is reported as its own bucket rather than blended into a real category's average.
//
// volumetric_kg is L*B*H/5000 from the source, NOT physical weight. It is shown next to the
// courier's charged weight so the two can be compared, which is the point of the sheet.
const PRODUCT_SELECT = (dim) => `
  WITH ${FWD_BENCH},
  raw AS (
    SELECT i.courier_name, i.zone, COALESCE(i.courier_account_type,'(none)') AS acct,
           ${SLAB.replace(/charged_weight_courier/g, 'i.charged_weight_courier')} AS slab,
           ${LEG.replace(/shipment_mode/g, 'i.shipment_mode')} AS leg,
           i.shipment_mode, i.total_cost::float8 AS t, i.freight_charge::float8 AS f,
           i.charged_weight_courier::float8 AS cw,
           d.category, d.sub_category, d.volumetric_kg::float8 AS vw,
           d.len_cm::float8 AS l, d.bre_cm::float8 AS bcm, d.hei_cm::float8 AS h
      FROM public.logistics_invoices_b2c i
      JOIN public.awb_shipment_dims d ON d.awb = i.awb_number
     WHERE ${SCOPE.replace(/total_cost/g, 'i.total_cost')
                  .replace(/zone/g, 'i.zone')
                  .replace(/charged_weight_courier/g, 'i.charged_weight_courier')}
       AND d.category IS NOT NULL
  ),
  b AS (
    SELECT b.*, ${netOf('b.t', 'fwd_t')} AS t_net, ${netOf('b.f', 'fwd_f')} AS f_net
      FROM raw b
      LEFT JOIN fwd ON fwd.courier_name = b.courier_name AND fwd.zone = b.zone
                   AND fwd.acct = b.acct AND fwd.slab = b.slab
  )
  SELECT ${dim},
         COUNT(*) FILTER (WHERE leg='Forward')::int  AS fwd_n,
         AVG(t_net) FILTER (WHERE leg='Forward')::float8 AS fwd_avg,
         COUNT(*) FILTER (WHERE leg='Reverse')::int  AS rev_n,
         AVG(t_net) FILTER (WHERE leg='Reverse')::float8 AS rev_avg,
         COUNT(*) FILTER (WHERE leg='RTO')::int      AS rto_n,
         AVG(t_net) FILTER (WHERE leg='RTO')::float8 AS rto_avg,
         COUNT(*)::int AS all_n,
         AVG(t_net)::float8 AS all_avg,
         AVG(f_net)::float8 AS freight_avg,
         AVG(cw)::float8 AS cw_avg,
         AVG(vw)::float8 AS vw_avg,
         AVG(l)::float8 AS l_avg, AVG(bcm)::float8 AS b_avg, AVG(h)::float8 AS h_avg,
         SUM(t_net)::float8 AS spend
    FROM b`

const { rows: byCat } = await pool.query(
  `${PRODUCT_SELECT('category')} GROUP BY 1 ORDER BY spend DESC`, [RTO_BUNDLES_FORWARD])

const { rows: bySub } = await pool.query(
  `${PRODUCT_SELECT('category, sub_category')} GROUP BY 1,2
    HAVING COUNT(*) >= ${MIN_N} ORDER BY category, spend DESC`, [RTO_BUNDLES_FORWARD])

// Category x slab: where a category's cost actually comes from — a heavy category is
// expensive because of its slab mix, and this separates rate from mix.
const { rows: byCatSlab } = await pool.query(
  `${PRODUCT_SELECT('category, slab')} GROUP BY 1,2
    HAVING COUNT(*) >= ${MIN_N} ORDER BY category, slab`, [RTO_BUNDLES_FORWARD])

await pool.end()

const r2 = v => (v == null ? null : Math.round(Number(v) * 100) / 100)
const r3 = v => (v == null ? null : Math.round(Number(v) * 1000) / 1000)

const wb = XLSX.utils.book_new()

XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(card.map(r => ({
  Courier: r.courier_name,
  Account: r.acct,
  Leg: r.leg,
  Zone: r.zone,
  'Slab (kg)': Number(r.slab),
  Shipments: r.n,
  'Rate (median)': r2(r.rate_median),
  'Rate (mean)': r2(r.rate_mean),
  'Rate min': r2(r.rate_min),
  'Rate max': r2(r.rate_max),
  // CV is the trust column: <0.05 means a single rate genuinely exists in this cell.
  CV: r3(r.cv),
  Confidence: r.cv < 0.05 ? 'tight' : r.cv < 0.20 ? 'loose' : 'scattered',
  'Surcharge avg': r2(r.surcharge_avg),
  'Other avg': r2(r.other_avg),
  'Total cost (median)': r2(r.total_median),
}))), 'Master Rate Card')

// ── Rate-card sheets in contract layout: zones across, one row per carrier/service/slab ──
// This is the shape a rate card is normally published in, so it can be read against the
// contract PDFs line for line. One sheet per leg, because Forward/Reverse/RTO are
// genuinely different price lists and interleaving them makes the sheet unreadable.
const ZONES = ['A', 'B', 'C', 'D', 'E']

for (const leg of ['Forward', 'Reverse', 'RTO']) {
  const byRow = new Map()
  for (const r of card) {
    if (r.leg !== leg) continue
    // Carrier + account together are the price list; slab is the row within it.
    // Title-case the account so Swift's "Surface"/"SURFACE" don't split into two lists.
    const acct = r.acct === '(none)' ? null
      : r.acct.replace(/\S+/g, w => (w.length > 3 && w === w.toUpperCase()
          ? w[0] + w.slice(1).toLowerCase() : w))
    const service = acct ? `B2C - ${acct}` : 'B2C'
    const k = `${r.courier_name}|${service}|${r.slab}`
    if (!byRow.has(k)) {
      byRow.set(k, {
        Carrier: r.courier_name, Service: service, 'Weight Slab (kg)': Number(r.slab),
        _sort: Number(r.slab),
      })
    }
    const row = byRow.get(k)
    if (!ZONES.includes(r.zone)) continue
    // Folding case-variant accounts can land two cells on the same zone/slab. Keep the
    // one backed by more shipments rather than whichever happened to come last.
    if (row[r.zone] == null || r.n > row[`${r.zone} n`]) {
      row[r.zone] = r2(r.rate_median)
      // Shipment counts and confidence live in trailing columns so the zone grid stays
      // clean, but a blank-looking cell can still be traced to "no data" vs "cheap".
      row[`${r.zone} n`] = r.n
      row[`${r.zone} CV`] = r3(r.cv)
    }
  }

  const rows = [...byRow.values()]
    .sort((a, b) => a.Carrier.localeCompare(b.Carrier) ||
                    a.Service.localeCompare(b.Service) || a._sort - b._sort)
    .map(({ _sort, ...keep }) => {
      // Force a stable column order: zones first, then the n/CV block.
      const out = { Carrier: keep.Carrier, Service: keep.Service, 'Weight Slab (kg)': keep['Weight Slab (kg)'] }
      for (const z of ZONES) out[z] = keep[z] ?? null
      for (const z of ZONES) out[`${z} n`] = keep[`${z} n`] ?? null
      for (const z of ZONES) out[`${z} CV`] = keep[`${z} CV`] ?? null
      return out
    })

  // Pass an explicit header list: json_to_sheet infers columns from the first row, so a
  // zone that is blank on row 1 would otherwise be dropped from the whole sheet.
  const header = ['Carrier', 'Service', 'Weight Slab (kg)', ...ZONES,
    ...ZONES.map(z => `${z} n`), ...ZONES.map(z => `${z} CV`)]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows, { header }), `Rate Card - ${leg}`)
  console.log(`  Rate Card - ${leg.padEnd(8)} ${rows.length} rows`)
}

XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pivot.map(r => ({
  'Slab (kg)': Number(r.slab),
  'Forward n': r.fwd_n, 'Forward avg ₹': r2(r.fwd_avg),
  'Reverse n': r.rev_n, 'Reverse avg ₹': r2(r.rev_avg),
  'RTO n': r.rto_n, 'RTO avg ₹': r2(r.rto_avg),
  'All n': r.all_n, 'All avg ₹': r2(r.all_avg),
}))), 'Avg Cost by Slab')

XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bySlab.map(r => ({
  'Slab (kg)': Number(r.slab),
  Leg: r.leg,
  Shipments: r.shipments,
  'Avg total cost': r2(r.avg_total_cost),
  'Median total cost': r2(r.median_total_cost),
  'Total spend': r2(r.total_spend),
  'Cost per kg': r2(r.cost_per_kg),
}))), 'Slab x Leg (long)')

// Product sheets. Legs across the columns, same shape as Avg Cost by Slab.
const productRow = r => ({
  ...(r.category !== undefined ? { Category: r.category } : {}),
  ...(r.sub_category !== undefined ? { 'Sub Category': r.sub_category } : {}),
  ...(r.slab !== undefined ? { 'Weight Slab (kg)': Number(r.slab) } : {}),
  'Forward n': r.fwd_n, 'Forward avg ₹': r2(r.fwd_avg),
  'Reverse n': r.rev_n, 'Reverse avg ₹': r2(r.rev_avg),
  'RTO n': r.rto_n, 'RTO avg ₹': r2(r.rto_avg),
  'All n': r.all_n, 'All avg ₹': r2(r.all_avg),
  'Freight avg ₹': r2(r.freight_avg),
  'Charged wt (kg)': r2(r.cw_avg),
  'Volumetric wt (kg)': r2(r.vw_avg),
  'L cm': r2(r.l_avg), 'B cm': r2(r.b_avg), 'H cm': r2(r.h_avg),
  'Total spend ₹': r2(r.spend),
})

XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byCat.map(productRow)), 'By Category')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bySub.map(productRow)), 'By Sub Category')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byCatSlab.map(productRow)), 'Category x Slab')

XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mult.map(r => ({
  Courier: r.courier_name,
  'RTO cells compared': r.rto_cells,
  'RTO row ÷ Forward (raw)': r3(r.rto_ratio),
  'Return leg ÷ Forward (net of fwd)': r3(r.rto_net_ratio),
  'Reverse cells compared': r.rev_cells,
  'Reverse ÷ Forward': r3(r.rev_ratio),
  'What the RTO row contains': r.rto_ratio == null ? 'no comparable RTO cells'
    : Number(r.rto_ratio) < 1 ? 'RETURN LEG ONLY — use the raw ratio as the RTO rate'
    : 'FORWARD + RETURN bundled — use the net ratio as the RTO rate',
}))), 'Measured Leg Multipliers')

XLSX.writeFile(wb, OUT)

console.log(`\nWrote ${OUT}`)
console.log(`  Master Rate Card        ${card.length} cells (min ${MIN_N} shipments each)`)
console.log(`  Avg Cost by Slab        ${pivot.length} slabs`)
console.log(`  Slab x Leg (long)       ${bySlab.length} rows`)
console.log(`  Measured Multipliers    ${mult.length} couriers`)

const tight = card.filter(r => r.cv < 0.05).length
const loose = card.filter(r => r.cv >= 0.05 && r.cv < 0.20).length
console.log(`\n  confidence: ${tight} tight · ${loose} loose · ${card.length - tight - loose} scattered`)
console.log('  read the CV / Confidence columns before trusting any single rate.')
