// MASTER RATE CARD — courier x account x leg x zone x weight slab, plus weighted-average
// cost sheets by slab/zone and by product.
//
// Supersedes derive-rate-card.mjs, which predates three corrections that all move the
// numbers. Kept as a separate file so the old workbook stays reproducible.
//
// WHAT CHANGED SINCE THE FIRST VERSION
//
// 1. DELHIVERY GST EXCLUDED. Delhivery's total_cost was uploaded GST-inclusive while every
//    other courier's is ex-GST, so any cross-courier average silently mixed tax-inclusive
//    and tax-exclusive money. Verified 1.180 on 58,128 of 58,128 rows before dividing.
//    Keyed on the RATIO, not the courier name, so it becomes a no-op once ex-GST totals are
//    uploaded — a name-based rule would strip another 18% from the corrected file.
//
// 2. BLUEDART B2B INCLUDED (2,493 rows). It arrived in the B2C ledger under its own courier
//    name. Priced per actual kg with NO slabbing and a /4500 volumetric divisor (CFT 6), so
//    its zone letters mean REGIONS: A=West B=North C=South D=East E=NE/J&K. Flagged in the
//    Notes column so nobody reads its zones as distance bands.
//
// 3. WEIGHTED AVERAGES, not a mean of per-shipment costs. sum(cost)/sum(shipments) — an
//    unweighted mean lets a 20-shipment cell count as much as a 200,000-shipment one. The
//    median is still reported per cell for the rate card, because a rate card wants the
//    recurring rate, while the cost sheets want true average spend.
//
// METHOD NOTES CARRIED OVER
//
// * RTO IS THE RETURN LEG ONLY. Bluedart/Urbanbolt invoice the return leg alone (raw ratio
//   0.900); the other five bundle forward + return into one row (raw ~1.9x), so for those
//   the matching forward cost is subtracted. Without this, RTO reads ~2x reality.
//
// * Every rate-card row carries n and CV. CV < 5% means a single rate genuinely exists in
//   that cell; > 20% means no single rate does and the number must not be read as one.
//
//   node scripts/master-rate-card.mjs
//   node scripts/master-rate-card.mjs --min 10 --out ../Custom.xlsx

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
const OUT = arg('--out') || join(__dirname, '..', '..', 'Frido_Master_Rate_Card.xlsx')

const connStr = process.env.SUPABASE_URL
if (!connStr) { console.error('SUPABASE_URL not set'); process.exit(1) }
const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false }, max: 3 })

// ── Delhivery GST correction, applied on read. See header note 1. ──
const EX_GST = `
  CASE WHEN abs(total_cost::float8
              / NULLIF(freight_charge::float8 + COALESCE(surcharge::float8, 0)
                     + COALESCE(other_charge::float8, 0), 0) - 1.18) < 0.005
       THEN total_cost::float8 / 1.18
       ELSE total_cost::float8 END`

// Bluedart B2B zones are REGIONS, not distance bands, and it is billed per actual kg.
const B2B = `'Bluedart B2B'`

const SCOPE = `
  total_cost > 0
  AND zone IN ('A','B','C','D','E')
  AND charged_weight_courier <= 500
`

// Billable slab: 0.5 kg floor then round up to the next whole kg — how a courier card
// steps. <= 0.5 so an exactly-0.5 kg parcel stays in the 0.5 slab rather than being
// promoted to 1 kg. Bluedart B2B is excluded: its contract prices per actual kg.
const SLAB = `CASE WHEN courier_name = ${B2B} THEN NULL
                   WHEN charged_weight_courier <= 0.5 THEN 0.5
                   ELSE CEIL(charged_weight_courier) END`

// Coarse band, so B2B heavy freight still lands somewhere on the cost sheets.
const BAND = `CASE WHEN charged_weight_courier <= 0.5 THEN '0.5 kg'
                   WHEN charged_weight_courier <= 1  THEN '1 kg'
                   WHEN charged_weight_courier <= 2  THEN '2 kg'
                   WHEN charged_weight_courier <= 5  THEN '3-5 kg'
                   WHEN charged_weight_courier <= 10 THEN '6-10 kg'
                   WHEN charged_weight_courier <= 25 THEN '11-25 kg'
                   WHEN charged_weight_courier <= 50 THEN '26-50 kg'
                   ELSE '50 kg +' END`

const LEG = `CASE WHEN upper(shipment_mode) = 'FORWARD' THEN 'Forward'
                  WHEN upper(shipment_mode) = 'RTO'     THEN 'RTO'
                  ELSE 'Reverse' END`

const RTO_BUNDLES_FORWARD = ['Delhivery', 'ElasticRun', 'Shadowfax', 'SkyAir', 'Swift']

// Forward benchmark per courier/zone/account/slab, used to strip the bundled forward leg
// out of an RTO row. Ex-GST on both sides or the subtraction mixes tax bases.
const FWD_BENCH = `
  fwd AS (
    SELECT courier_name, zone, COALESCE(courier_account_type,'(none)') AS acct,
           ${SLAB} AS slab,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY freight_charge::float8) AS fwd_f,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY ${EX_GST})            AS fwd_t
      FROM public.logistics_invoices_b2c
     WHERE ${SCOPE} AND upper(shipment_mode) = 'FORWARD'
     GROUP BY 1,2,3,4
  )`

const netOf = (col, fwdCol) => `
  CASE WHEN upper(b.shipment_mode) = 'RTO' AND b.courier_name = ANY($1)
            AND fwd.${fwdCol} IS NOT NULL
       THEN GREATEST(${col} - fwd.${fwdCol}, 0)
       ELSE ${col} END`

// Shared row source: applies the GST fix, the slab/band/leg derivations and the RTO
// netting once, so every sheet below is built off identical numbers.
const ROWS = `
  WITH ${FWD_BENCH},
  raw AS (
    SELECT courier_name, zone, COALESCE(courier_account_type,'(none)') AS acct,
           ${SLAB} AS slab, ${BAND} AS band, ${LEG} AS leg, shipment_mode,
           awb_number,
           charged_weight_courier::float8 AS cw,
           freight_charge::float8 AS f,
           COALESCE(surcharge::float8, 0)    AS s,
           COALESCE(other_charge::float8, 0) AS o,
           ${EX_GST} AS t
      FROM public.logistics_invoices_b2c
     WHERE ${SCOPE}
  ),
  b AS (
    SELECT b.courier_name, b.zone, b.acct, b.slab, b.band, b.leg, b.cw, b.s, b.o,
           b.awb_number,
           ${netOf('b.f', 'fwd_f')} AS f,
           ${netOf('b.t', 'fwd_t')} AS t
      FROM raw b
      LEFT JOIN fwd ON fwd.courier_name = b.courier_name AND fwd.zone = b.zone
                   AND fwd.acct = b.acct
                   AND fwd.slab IS NOT DISTINCT FROM b.slab
  )`

console.log('Building master rate card…')

// ── Sheet: MASTER RATE CARD ──
const { rows: card } = await pool.query(`
  ${ROWS}
  SELECT courier_name, acct, leg, zone, slab, band,
         COUNT(*)::int AS n,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY f)::float8 AS rate_median,
         (SUM(f) / COUNT(*))::float8 AS rate_wavg,
         MIN(f)::float8 AS rate_min,
         MAX(f)::float8 AS rate_max,
         CASE WHEN AVG(f) > 0 THEN STDDEV_POP(f) / AVG(f) ELSE 0 END::float8 AS cv,
         (SUM(s) / COUNT(*))::float8 AS sur_avg,
         (SUM(o) / COUNT(*))::float8 AS oth_avg,
         (SUM(t) / COUNT(*))::float8 AS total_wavg,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY t)::float8 AS total_median,
         (SUM(t) / NULLIF(SUM(cw), 0))::float8 AS cost_per_kg,
         SUM(t)::float8 AS spend
    FROM b
   GROUP BY 1,2,3,4,5,6
  HAVING COUNT(*) >= ${MIN_N}
   ORDER BY courier_name, acct, leg, zone, slab NULLS LAST, band
`, [RTO_BUNDLES_FORWARD])

// ── Sheet: weighted avg cost by SLAB x ZONE ──
const { rows: slabZone } = await pool.query(`
  ${ROWS}
  SELECT band, zone,
         COUNT(*)::int AS n,
         (SUM(t) / COUNT(*))::float8 AS wavg,
         (SUM(t) / NULLIF(SUM(cw), 0))::float8 AS cpk,
         SUM(t)::float8 AS spend,
         COUNT(*) FILTER (WHERE leg = 'Forward')::int AS fwd_n,
         (SUM(t) FILTER (WHERE leg = 'Forward')
            / NULLIF(COUNT(*) FILTER (WHERE leg = 'Forward'), 0))::float8 AS fwd_wavg,
         COUNT(*) FILTER (WHERE leg = 'Reverse')::int AS rev_n,
         (SUM(t) FILTER (WHERE leg = 'Reverse')
            / NULLIF(COUNT(*) FILTER (WHERE leg = 'Reverse'), 0))::float8 AS rev_wavg,
         COUNT(*) FILTER (WHERE leg = 'RTO')::int AS rto_n,
         (SUM(t) FILTER (WHERE leg = 'RTO')
            / NULLIF(COUNT(*) FILTER (WHERE leg = 'RTO'), 0))::float8 AS rto_wavg
    FROM b
   GROUP BY 1,2
   ORDER BY 1,2
`, [RTO_BUNDLES_FORWARD])

// ── Sheet: weighted avg cost by SLAB (all zones) ──
const { rows: bySlab } = await pool.query(`
  ${ROWS}
  SELECT band,
         COUNT(*)::int AS n,
         (SUM(t) / COUNT(*))::float8 AS wavg,
         (SUM(t) / NULLIF(SUM(cw), 0))::float8 AS cpk,
         SUM(t)::float8 AS spend,
         COUNT(*) FILTER (WHERE leg = 'Forward')::int AS fwd_n,
         (SUM(t) FILTER (WHERE leg = 'Forward')
            / NULLIF(COUNT(*) FILTER (WHERE leg = 'Forward'), 0))::float8 AS fwd_wavg,
         COUNT(*) FILTER (WHERE leg = 'Reverse')::int AS rev_n,
         (SUM(t) FILTER (WHERE leg = 'Reverse')
            / NULLIF(COUNT(*) FILTER (WHERE leg = 'Reverse'), 0))::float8 AS rev_wavg,
         COUNT(*) FILTER (WHERE leg = 'RTO')::int AS rto_n,
         (SUM(t) FILTER (WHERE leg = 'RTO')
            / NULLIF(COUNT(*) FILTER (WHERE leg = 'RTO'), 0))::float8 AS rto_wavg
    FROM b
   GROUP BY 1
   ORDER BY 1
`, [RTO_BUNDLES_FORWARD])

// ── Sheets: weighted avg cost by PRODUCT ──
// Joins awb_shipment_dims for category / sub-category / dimensions. Coverage is ~99.5% on
// forward legs but thinner on RTO, so n travels with every row.
const productSql = dim => `
  ${ROWS},
  p AS (
    SELECT b.*, d.category, d.sub_category, d.volumetric_kg::float8 AS vw,
           d.len_cm::float8 AS l, d.bre_cm::float8 AS bc, d.hei_cm::float8 AS h
      FROM b JOIN public.awb_shipment_dims d ON d.awb = b.awb_number
     WHERE d.category IS NOT NULL
  )
  SELECT ${dim},
         COUNT(*)::int AS n,
         (SUM(t) / COUNT(*))::float8 AS wavg,
         (SUM(t) / NULLIF(SUM(cw), 0))::float8 AS cpk,
         SUM(t)::float8 AS spend,
         (SUM(cw) / COUNT(*))::float8 AS cw_avg,
         (SUM(vw) / NULLIF(COUNT(vw), 0))::float8 AS vw_avg,
         AVG(l)::float8 AS l_avg, AVG(bc)::float8 AS b_avg, AVG(h)::float8 AS h_avg,
         COUNT(*) FILTER (WHERE leg = 'Forward')::int AS fwd_n,
         (SUM(t) FILTER (WHERE leg = 'Forward')
            / NULLIF(COUNT(*) FILTER (WHERE leg = 'Forward'), 0))::float8 AS fwd_wavg,
         COUNT(*) FILTER (WHERE leg = 'Reverse')::int AS rev_n,
         (SUM(t) FILTER (WHERE leg = 'Reverse')
            / NULLIF(COUNT(*) FILTER (WHERE leg = 'Reverse'), 0))::float8 AS rev_wavg,
         COUNT(*) FILTER (WHERE leg = 'RTO')::int AS rto_n,
         (SUM(t) FILTER (WHERE leg = 'RTO')
            / NULLIF(COUNT(*) FILTER (WHERE leg = 'RTO'), 0))::float8 AS rto_wavg
    FROM p`

const { rows: byCat } = await pool.query(
  `${productSql('category')} GROUP BY 1 ORDER BY spend DESC`, [RTO_BUNDLES_FORWARD])

const { rows: bySub } = await pool.query(
  `${productSql('category, sub_category')} GROUP BY 1,2
    HAVING COUNT(*) >= ${MIN_N} ORDER BY category, spend DESC`, [RTO_BUNDLES_FORWARD])

const { rows: catSlab } = await pool.query(
  `${productSql('category, band')} GROUP BY 1,2
    HAVING COUNT(*) >= ${MIN_N} ORDER BY category, band`, [RTO_BUNDLES_FORWARD])

// ── Measured leg multipliers ──
const { rows: mult } = await pool.query(`
  WITH r AS (
    SELECT courier_name, zone, COALESCE(courier_account_type,'(none)') AS acct,
           ${SLAB} AS slab, upper(shipment_mode) AS m, freight_charge::float8 AS f
      FROM public.logistics_invoices_b2c WHERE ${SCOPE}
  ),
  agg AS (
    SELECT courier_name, zone, acct, slab, m, COUNT(*) AS n,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY f) AS med
      FROM r GROUP BY 1,2,3,4,5 HAVING COUNT(*) >= 30
  )
  SELECT f.courier_name,
         COUNT(x.med)::int AS rto_cells,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY x.med / NULLIF(f.med,0))::float8 AS rto_raw,
         percentile_cont(0.5) WITHIN GROUP
           (ORDER BY (x.med - f.med) / NULLIF(f.med,0))::float8 AS rto_net,
         COUNT(v.med)::int AS rev_cells,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY v.med / NULLIF(f.med,0))::float8 AS rev_ratio
    FROM agg f
    LEFT JOIN agg x ON x.courier_name=f.courier_name AND x.zone=f.zone AND x.acct=f.acct
                   AND x.slab IS NOT DISTINCT FROM f.slab AND x.m='RTO'
    LEFT JOIN agg v ON v.courier_name=f.courier_name AND v.zone=f.zone AND v.acct=f.acct
                   AND v.slab IS NOT DISTINCT FROM f.slab AND v.m IN ('REVERSE','RVP','DTO')
   WHERE f.m='FORWARD'
   GROUP BY 1 ORDER BY 1
`)

await pool.end()

// Bands must sort by weight, not alphabetically — "11-25 kg" sorts before "2 kg" as text,
// which puts the sheet in a nonsensical order.
const BAND_ORDER = ['0.5 kg', '1 kg', '2 kg', '3-5 kg', '6-10 kg', '11-25 kg', '26-50 kg', '50 kg +']
const bandRank = b => { const i = BAND_ORDER.indexOf(b); return i === -1 ? 99 : i }
const byBand = (a, b) => bandRank(a.band) - bandRank(b.band)

const r2 = v => (v == null ? null : Math.round(Number(v) * 100) / 100)
const r3 = v => (v == null ? null : Math.round(Number(v) * 1000) / 1000)

const wb = XLSX.utils.book_new()
const add = (rows, name, header) =>
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows, header ? { header } : undefined), name)

// Bluedart B2B needs its zone letters explained wherever they appear, or a reader will
// take them for distance bands like every other courier's.
const B2B_REGION = { A: 'West', B: 'North', C: 'South', D: 'East', E: 'NE / J&K' }
const noteFor = r => (r.courier_name === 'Bluedart B2B'
  ? `zone = region (${B2B_REGION[r.zone] || r.zone}) · per actual kg, no slab · vol ÷4500`
  : '')

add([...card].sort((a, b) =>
  String(a.courier_name).localeCompare(b.courier_name)
  || String(a.acct).localeCompare(b.acct)
  || String(a.leg).localeCompare(b.leg)
  || String(a.zone).localeCompare(b.zone)
  // Slab is null for Bluedart B2B (priced per actual kg), so fall back to band order.
  || (a.slab == null || b.slab == null ? byBand(a, b) : Number(a.slab) - Number(b.slab))
).map(r => ({
  Courier: r.courier_name,
  Account: r.acct,
  Leg: r.leg,
  Zone: r.zone,
  'Weight Slab (kg)': r.slab == null ? null : Number(r.slab),
  Band: r.band,
  Shipments: r.n,
  'Freight (median)': r2(r.rate_median),
  'Freight (wtd avg)': r2(r.rate_wavg),
  'Freight min': r2(r.rate_min),
  'Freight max': r2(r.rate_max),
  CV: r3(r.cv),
  Confidence: r.cv < 0.05 ? 'tight' : r.cv < 0.20 ? 'loose' : 'scattered',
  'Surcharge avg': r2(r.sur_avg),
  'Other avg': r2(r.oth_avg),
  'Total cost (wtd avg)': r2(r.total_wavg),
  'Total cost (median)': r2(r.total_median),
  'Cost per kg': r2(r.cost_per_kg),
  'Total spend': r2(r.spend),
  Notes: noteFor(r),
})), 'Master Rate Card')

const legCols = r => ({
  Shipments: r.n,
  'Wtd avg cost': r2(r.wavg),
  'Cost per kg': r2(r.cpk),
  'Forward n': r.fwd_n, 'Forward wtd avg': r2(r.fwd_wavg),
  'Reverse n': r.rev_n, 'Reverse wtd avg': r2(r.rev_wavg),
  'RTO n': r.rto_n, 'RTO wtd avg': r2(r.rto_wavg),
  'Total spend': r2(r.spend),
})

add([...bySlab].sort(byBand)
  .map(r => ({ 'Weight Band': r.band, ...legCols(r) })), 'Wtd Avg by Slab')
add([...slabZone].sort((a, b) => byBand(a, b) || String(a.zone).localeCompare(b.zone))
  .map(r => ({ 'Weight Band': r.band, Zone: r.zone, ...legCols(r) })), 'Wtd Avg by Slab x Zone')

const prodCols = r => ({
  ...legCols(r),
  'Charged kg': r2(r.cw_avg),
  'Volumetric kg': r2(r.vw_avg),
  'L cm': r2(r.l_avg), 'B cm': r2(r.b_avg), 'H cm': r2(r.h_avg),
})

add(byCat.map(r => ({ Category: r.category, ...prodCols(r) })), 'Wtd Avg by Product')
add(bySub.map(r => ({ Category: r.category, 'Sub Category': r.sub_category, ...prodCols(r) })), 'Wtd Avg by Sub Product')
add([...catSlab].sort((a, b) => String(a.category).localeCompare(b.category) || byBand(a, b))
  .map(r => ({ Category: r.category, 'Weight Band': r.band, ...prodCols(r) })), 'Product x Slab')

add(mult.map(r => ({
  Courier: r.courier_name,
  'RTO cells compared': r.rto_cells,
  'RTO row ÷ Forward (raw)': r3(r.rto_raw),
  'Return leg ÷ Forward (net)': r3(r.rto_net),
  'Reverse cells compared': r.rev_cells,
  'Reverse ÷ Forward': r3(r.rev_ratio),
  'What the RTO row contains': r.rto_raw == null ? 'no comparable RTO cells'
    : Number(r.rto_raw) < 1 ? 'RETURN LEG ONLY — raw ratio is the RTO rate'
    : 'FORWARD + RETURN bundled — net ratio is the RTO rate',
})), 'Leg Multipliers')

// A method sheet, so the workbook can be handed on without a verbal briefing.
add([
  ['Built', 'from public.logistics_invoices_b2c — invoices as uploaded, not contract cards'],
  ['Scope', 'total_cost > 0, zone A-E, charged weight <= 500 kg'],
  ['Delhivery GST', 'total_cost was uploaded GST-inclusive; divided by 1.18 (verified 1.180 on 58,128/58,128 rows). Keyed on the ratio, so it stops applying once ex-GST totals are uploaded.'],
  ['Bluedart B2B', 'zone letters are REGIONS: A=West B=North C=South D=East E=NE/J&K. Priced per actual kg with no slabbing; volumetric divisor 4500 (CFT 6), not the 5000 used for B2C.'],
  ['Weighted average', 'sum(cost) / count(shipments). An unweighted mean would let a 20-shipment cell count as much as a 200,000-shipment one.'],
  ['Median vs wtd avg', 'Median is the recurring rate — use it as the rate card. Weighted average is true spend per shipment — use it for budgeting.'],
  ['RTO', 'Return leg only. Bluedart and Urbanbolt invoice the return leg alone; Delhivery, ElasticRun, Shadowfax, SkyAir and Swift bundle forward + return in one row, so the matching forward cost is subtracted for those five.'],
  ['CV column', '< 0.05 tight — a single rate genuinely exists. 0.05-0.20 loose. > 0.20 scattered — do NOT read the number as a rate.'],
  ['Min shipments', `cells with fewer than ${MIN_N} shipments are excluded`],
  ['Known gap', 'Delhivery May 2026 has 9,755 DTO rows whose freight landed in other_charge, so their freight reads 0. Cost is right; the freight split is not.'],
].map(([Item, Detail]) => ({ Item, Detail })), 'Method')

XLSX.writeFile(wb, OUT)

const tight = card.filter(r => r.cv < 0.05).length
const loose = card.filter(r => r.cv >= 0.05 && r.cv < 0.20).length

console.log(`\nWrote ${OUT}`)
console.log(`  Master Rate Card         ${card.length} cells (min ${MIN_N} shipments)`)
console.log(`  Wtd Avg by Slab          ${bySlab.length} bands`)
console.log(`  Wtd Avg by Slab x Zone   ${slabZone.length} rows`)
console.log(`  Wtd Avg by Product       ${byCat.length} categories`)
console.log(`  Wtd Avg by Sub Product   ${bySub.length} sub-categories`)
console.log(`  Product x Slab           ${catSlab.length} rows`)
console.log(`  Leg Multipliers          ${mult.length} couriers`)
console.log(`\n  confidence: ${tight} tight · ${loose} loose · ${card.length - tight - loose} scattered`)
