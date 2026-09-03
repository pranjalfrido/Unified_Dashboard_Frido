// ESTIMATED RTO / RVP cost for July and August 2026, Chair & Mobility vs the rest.
//
//   node -r dotenv/config scripts/rto-rvp-estimated-cost.mjs
//
// Writes ../RTO_RVP_Estimated_Cost_Jul_Aug_2026.xlsx
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// THIS REPORT IS AN ESTIMATE, NOT INVOICED COST. Read this before quoting any figure.
//
// The shipment COUNTS come from the order/dispatch system (supplied manually). The per-unit
// COSTS come from the courier invoice ledger. The two populations do not agree:
//
//   July, Non Chair & Mobility RTO   dispatch 20,404   ·   invoiced 2,569
//   July, Chair & Mobility RTO       dispatch    164   ·   invoiced     9
//   July, all shipments              dispatch 1,93,250 ·   invoiced 1,47,939
//
// So a count from one source is being priced at a rate from the other. That is a defensible
// estimate — the rate is what those movements actually cost when they were invoiced — but it
// is NOT what any courier has billed, and the gap is large enough that the difference matters.
//
// August has NO cost data at all: logistics_invoices_b2c ends at July 2026 and
// awb_shipment_dims has zero August rows. Its figures are entirely rate x count.
//
// Every cost cell in this workbook is therefore labelled ESTIMATED.
// ─────────────────────────────────────────────────────────────────────────────────────────

import pkg from 'pg'
import XLSX from 'xlsx'
import { config } from 'dotenv'
config()

const OUT = process.env.REPORT_OUT || '../RTO_RVP_Estimated_Cost_Jul_Aug_2026.xlsx'

// The 15% buffer carried from the previous report, applied on top of every cost figure.
const BUFFER = 1.15

// Counts as supplied from the order/dispatch system. Hardcoded because they came in by hand
// and are not in any table — if they later land in the DB this block is what to replace.
const DISPATCH = [
  { month: 'July 2026',   grp: 'Chair & Mobility',     shipments: 2392,   delivered: 2172,   rto: 164,   rvp: 8 },
  { month: 'July 2026',   grp: 'Non Chair & Mobility', shipments: 190858, delivered: 169667, rto: 20404, rvp: 25 },
  { month: 'August 2026', grp: 'Chair & Mobility',     shipments: 4067,   delivered: 2418,   rto: 95,    rvp: 3 },
  { month: 'August 2026', grp: 'Non Chair & Mobility', shipments: 263093, delivered: 201196, rto: 13789, rvp: 8 },
]

const pool = new pkg.Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl: { rejectUnauthorized: false }, max: 3,
  connectionTimeoutMillis: 60000, statement_timeout: 300000,
})

// Ex-GST. Delhivery uploaded GST-inclusive totals; keyed on the 1.18 ratio so the correction
// self-retires when a clean file lands rather than stripping 18% from good data forever.
const EX = `CASE
  WHEN abs(i.total_cost::float8 / NULLIF(i.freight_charge::float8
       + COALESCE(i.surcharge::float8,0) + COALESCE(i.other_charge::float8,0), 0) - 1.18) < 0.005
  THEN i.total_cost::float8 / 1.18 ELSE i.total_cost::float8 END`

const CM = `d.category IN ('Mobility', 'Ergo Furniture', 'Sparepart (Chair & Mobility)')`
const GRP = `CASE WHEN ${CM} THEN 'Chair & Mobility' ELSE 'Non Chair & Mobility' END`

const SLAB = `CASE WHEN i.charged_weight_courier > 0 AND i.charged_weight_courier <= 0.5 THEN 0.5
                   WHEN i.charged_weight_courier > 0 THEN CEIL(i.charged_weight_courier)
                   ELSE NULL END`

// RTO net of the bundled forward leg. Five couriers invoice forward + return on one row, so
// the raw RTO rate reads ~1.9x the true return cost. Which couriers bundle is read from
// lc_courier_profile, measured from the billing rather than a typed list.
const RTO_NET = `CASE
  WHEN upper(i.shipment_mode) = 'RTO' AND pr.courier_name IS NOT NULL AND fm.fwd_t IS NOT NULL
  THEN GREATEST((${EX}) - fm.fwd_t, 0) ELSE (${EX}) END`

const JOINS = `
  LEFT JOIN (SELECT courier_name FROM public.lc_courier_profile WHERE is_rto_bundle) pr
         ON pr.courier_name = i.courier_name AND upper(i.shipment_mode) = 'RTO'
  LEFT JOIN public.lc_fwd_median fm
         ON pr.courier_name IS NOT NULL
        AND fm.courier_name = i.courier_name AND fm.zone = i.zone
        AND fm.acct = COALESCE(i.courier_account_type, '(none)')
        AND fm.slab IS NOT DISTINCT FROM ${SLAB}`

// Rates come from the WHOLE invoice history (Apr–Jul), not July alone: July's own Chair RTO
// sample is 9 shipments, far too thin to rate a month on. Apr–Jul gives 388.
const rates = (await pool.query(`
  SELECT ${GRP} AS grp, upper(i.shipment_mode) AS mode,
         COUNT(*)::int AS sample,
         AVG(${RTO_NET})::float8 AS mean_net,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY ${RTO_NET})::float8 AS median_net,
         MIN(i.month_year) AS from_month, MAX(i.month_year) AS to_month
    FROM public.logistics_invoices_b2c i
    JOIN public.awb_shipment_dims d ON d.awb = i.awb_number
    ${JOINS}
   WHERE i.total_cost > 0 AND i.zone IN ('A','B','C','D','E')
     AND upper(i.shipment_mode) IN ('RTO','RVP')
   GROUP BY 1, 2`)).rows

// Actually-invoiced RTO/RVP by month, so the estimate can be shown against reality.
const actual = (await pool.query(`
  SELECT i.month_year AS m, ${GRP} AS grp, upper(i.shipment_mode) AS mode,
         COUNT(*)::int AS n, SUM(${RTO_NET})::float8 AS cost
    FROM public.logistics_invoices_b2c i
    JOIN public.awb_shipment_dims d ON d.awb = i.awb_number
    ${JOINS}
   WHERE i.total_cost > 0 AND i.zone IN ('A','B','C','D','E')
     AND upper(i.shipment_mode) IN ('RTO','RVP')
   GROUP BY 1, 2, 3`)).rows

await pool.end()

// MEDIAN, not mean, is the basis. RTO/RVP cost is heavily skewed — a handful of bulky returns
// pulls the mean well above what a typical return costs, and multiplying a skewed mean by
// 20,000 shipments compounds that. The mean is reported alongside so the spread is visible.
const rateOf = (grp, mode) => rates.find(r => r.grp === grp && r.mode === mode) || null

const rup = v => Math.round((Number(v) || 0) * BUFFER)
const num2 = v => Math.round((Number(v) || 0) * 100) / 100

const rows = DISPATCH.map(d => {
  const rRto = rateOf(d.grp, 'RTO')
  const rRvp = rateOf(d.grp, 'RVP')
  const rtoRate = rRto ? Number(rRto.median_net) : 0
  const rvpRate = rRvp ? Number(rRvp.median_net) : 0
  const rtoCost = d.rto * rtoRate
  const rvpCost = d.rvp * rvpRate
  return {
    Month: d.month,
    Category: d.grp,
    Shipments: d.shipments,
    Delivered: d.delivered,
    'Delivery %': num2((d.delivered / d.shipments) * 100),
    'RTO Shipments': d.rto,
    'RTO %': num2((d.rto / d.shipments) * 100),
    'RTO Rate / unit': num2(rtoRate * BUFFER),
    'RTO Cost (EST)': rup(rtoCost),
    'RVP Shipments': d.rvp,
    'RVP %': num2((d.rvp / d.shipments) * 100),
    'RVP Rate / unit': num2(rvpRate * BUFFER),
    'RVP Cost (EST)': rup(rvpCost),
    'RTO + RVP Shipments': d.rto + d.rvp,
    'RTO + RVP Cost (EST)': rup(rtoCost + rvpCost),
    // Return cost spread across ALL shipments in the month, buffered once. rtoCost/rvpCost
    // are raw here — rup() is what applies the buffer — so the multiply happens on this line
    // and not twice.
    'Return Cost / Shipment': num2(((rtoCost + rvpCost) * BUFFER) / d.shipments),
  }
})

// ── Workbook ──
const wb = XLSX.utils.book_new()
const add = (name, data, widths) => {
  const ws = XLSX.utils.json_to_sheet(data)
  if (widths) ws['!cols'] = widths.map(w => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, ws, name)
}

add('Summary (ESTIMATED)', [
  { Month: '*** ALL COST FIGURES ARE ESTIMATES, NOT INVOICED COST — see the Basis sheet ***' },
  {},
  ...rows,
], [16, 22, 12, 11, 11, 14, 8, 16, 17, 14, 8, 16, 17, 20, 21, 22])

add('Rates Used', rates.map(r => ({
  Category: r.grp,
  Leg: r.mode,
  'Sample (invoiced trips)': r.sample,
  'From': r.from_month,
  'To': r.to_month,
  'Median / unit (ex-GST)': num2(r.median_net),
  'Mean / unit (ex-GST)': num2(r.mean_net),
  'Median x 1.15 buffer': num2(Number(r.median_net) * BUFFER),
  'Basis used': 'median',
})).sort((a, b) => a.Category.localeCompare(b.Category) || a.Leg.localeCompare(b.Leg)),
[22, 6, 22, 10, 10, 22, 20, 22, 12])

add('Estimate vs Invoiced', (() => {
  const out = []
  for (const m of ['2026-07']) {
    for (const g of ['Chair & Mobility', 'Non Chair & Mobility']) {
      for (const leg of ['RTO', 'RVP']) {
        const a = actual.find(x => x.m === m && x.grp === g && x.mode === leg)
        const d = DISPATCH.find(x => x.month === 'July 2026' && x.grp === g)
        const rate = rateOf(g, leg)
        const dispatchN = leg === 'RTO' ? d.rto : d.rvp
        out.push({
          Month: m, Category: g, Leg: leg,
          'Dispatch count': dispatchN,
          'Invoiced count': a ? a.n : 0,
          'Count gap': dispatchN - (a ? a.n : 0),
          'Invoiced cost (actual)': a ? rup(a.cost) : 0,
          'Estimated cost': rup(dispatchN * (rate ? Number(rate.median_net) : 0)),
        })
      }
    }
  }
  return out
})(), [10, 22, 6, 15, 15, 12, 22, 16])

add('Basis & Caveats', [
  { Item: 'STATUS', Detail: 'ESTIMATE. No courier has billed these amounts.' },
  {},
  { Item: 'Where the counts come from', Detail: 'The order/dispatch system, supplied manually. Not from any table in the database.' },
  { Item: 'Where the rates come from', Detail: 'The courier invoice ledger (logistics_invoices_b2c), joined to the product master.' },
  { Item: 'Why that is a problem', Detail: 'The two sources describe different populations. A count from one is being priced at a rate from the other.' },
  {},
  { Item: 'THE COUNT GAP — July', Detail: '' },
  { Item: '  Non Chair RTO', Detail: 'dispatch 20,404 vs invoiced 2,569 — dispatch is 7.9x higher' },
  { Item: '  Chair RTO', Detail: 'dispatch 164 vs invoiced 9' },
  { Item: '  All shipments', Detail: 'dispatch 1,93,250 vs invoiced 1,47,939 — a 45,311 gap' },
  { Item: '  Note', Detail: 'RVP runs the OTHER way (dispatch 25 vs invoiced 234), so this is not simply invoices lagging dispatches.' },
  {},
  { Item: 'AUGUST', Detail: 'No cost data exists. logistics_invoices_b2c ends at July 2026; awb_shipment_dims has zero August rows. August figures are entirely rate x count.' },
  { Item: '  Additional risk', Detail: 'August RTO% is 5.24% against July 10.69%, so the return mix differs — July-derived rates may not hold.' },
  {},
  { Item: 'RATE BASIS — median, not mean', Detail: 'RTO/RVP cost is heavily skewed: a few bulky returns pull the mean well above a typical return. Multiplying a skewed mean by 20,000 shipments compounds that error, so the median is used. Both are on the Rates Used sheet.' },
  { Item: 'RATE WINDOW — Apr to Jul', Detail: 'Not July alone: July has only 9 invoiced Chair RTO shipments, far too thin to rate a month on. Apr-Jul gives 388.' },
  { Item: 'RTO netting', Detail: 'RTO rates are NET of the bundled forward leg. Delhivery, ElasticRun, Shadowfax, SkyAir and Swift invoice forward + return on one row, so the raw rate reads ~1.9x the true return cost. Bluedart and Urbanbolt are not netted — they invoice the return alone.' },
  {},
  { Item: 'BUFFER', Detail: 'A 15% buffer is applied on top of every cost figure, carried from the previous report. Shipment counts and percentages are unbuffered.' },
  { Item: 'GST', Detail: 'All costs ex-GST.' },
  {},
  { Item: 'TO REPLACE THIS WITH ACTUALS', Detail: 'Upload the August courier invoices and re-run scripts/july-chair-mobility-report.mjs with REPORT_MONTH=2026-08. That reports invoiced cost with no inference.' },
], [34, 132])

let out = OUT
try { XLSX.writeFile(wb, out) } catch (e) {
  if (e.code !== 'EBUSY') throw e
  out = OUT.replace(/\.xlsx$/, '_v2.xlsx')
  XLSX.writeFile(wb, out)
  console.log(`  (original was open in Excel, wrote ${out} instead)`)
}

// Full digits with Indian grouping. Lakh abbreviations are fine on a dashboard but not
// in a figure someone will quote — '₹11.71L' invites a misread where '11,71,118' does not.
const L = v => '₹' + Math.round(Number(v) || 0).toLocaleString('en-IN')
console.log(`wrote ${out}\n`)
console.log('ESTIMATED RTO + RVP cost (15% buffer, ex-GST):')
for (const r of rows) {
  console.log(`  ${r.Month.padEnd(12)} ${r.Category.padEnd(21)} RTO ${String(r['RTO Shipments']).padStart(6)} = ${L(r['RTO Cost (EST)']).padStart(9)}   RVP ${String(r['RVP Shipments']).padStart(3)} = ${L(r['RVP Cost (EST)']).padStart(8)}   total ${L(r['RTO + RVP Cost (EST)'])}`)
}
console.log('\nrates used (median, ex-GST, pre-buffer):')
for (const r of rates) console.log(`  ${r.grp.padEnd(21)} ${r.mode}  ₹${Number(r.median_net).toFixed(2)}  (sample ${r.sample})`)
