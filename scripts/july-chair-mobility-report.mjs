// July 2026 B2C logistics cost, split Chair & Mobility vs the rest, with product detail and
// a Forward / RTO / RVP / Reverse leg breakdown.
//
//   node -r dotenv/config scripts/july-chair-mobility-report.mjs
//   REPORT_MONTH=2026-08 node -r dotenv/config scripts/july-chair-mobility-report.mjs
//
// Writes ../July_2026_Logistics_Cost_Chair_vs_NonChair.xlsx
//
// WHY THIS IS A SCRIPT AND NOT A ONE-OFF QUERY: the grouping is a judgement call, not a
// column in the data — see CHAIR_MOBILITY below. Keeping it in a file means the definition is
// visible and re-runnable rather than buried in a chat message, and the sensitivity sheet
// shows what changes if the call is made differently.

import pkg from 'pg'
import XLSX from 'xlsx'
import { config } from 'dotenv'
config()

const MONTH = process.env.REPORT_MONTH || '2026-07'
const OUT = process.env.REPORT_OUT || '../July_2026_Logistics_Cost_Chair_vs_NonChair.xlsx'

const pool = new pkg.Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl: { rejectUnauthorized: false }, max: 3,
  connectionTimeoutMillis: 60000, statement_timeout: 300000,
})

// Ex-GST total. Delhivery uploaded GST-inclusive totals while every other courier's are net;
// keyed on the 1.18 RATIO rather than the courier name, so the correction self-retires when a
// clean file lands instead of stripping 18% from good data forever.
const EX = `CASE
  WHEN abs(i.total_cost::float8 / NULLIF(i.freight_charge::float8
       + COALESCE(i.surcharge::float8,0) + COALESCE(i.other_charge::float8,0), 0) - 1.18) < 0.005
  THEN i.total_cost::float8 / 1.18 ELSE i.total_cost::float8 END`

// THE GROUPING, stated explicitly because the data has no product-line flag.
//
// 'Chair & Mobility' spans three categories rather than one label:
//   Mobility                      wheelchairs, commodes, walkers, bath safety
//   Ergo Furniture                ergo chairs, standing desks, monitor arms
//   Sparepart (Chair & Mobility)  spares for the above
//
// Ergo Furniture is INCLUDED on the basis that ergo chairs are a chair line. It is only 193
// shipments but ~42% of the group's cost, so the sensitivity sheet reports the figure both
// ways rather than hiding how much rests on that one decision.
const CHAIR_MOBILITY = `d.category IN ('Mobility', 'Ergo Furniture', 'Sparepart (Chair & Mobility)')`
const GRP = `CASE WHEN ${CHAIR_MOBILITY} THEN 'Chair & Mobility' ELSE 'Non Chair & Mobility' END`

// Only the rows the dashboard reports on: real spend, the five real zones.
const SCOPE = `i.month_year = $1 AND i.total_cost > 0 AND i.zone IN ('A','B','C','D','E')`

// Billable slab, matching how couriers actually charge (0.5 kg floor, then up to the next kg).
const SLAB = `CASE WHEN i.charged_weight_courier > 0 AND i.charged_weight_courier <= 0.5 THEN 0.5
                   WHEN i.charged_weight_courier > 0 THEN CEIL(i.charged_weight_courier)
                   ELSE NULL END`

// RTO carries the FORWARD leg for five couriers: they invoice forward + return on one row, so
// the raw RTO figure reads ~1.9x the forward rate and overstates the return by roughly double.
// Subtracting the forward median for that courier/zone/account/slab cell lands RTO near the
// ~0.9x of forward the contracts specify.
//
// Bluedart and Urbanbolt invoice the return alone and are NOT netted — doing so would drive
// their RTO cost negative. Which couriers bundle comes from public.lc_courier_profile, measured
// from the billing itself rather than a typed list.
//
// GREATEST(...,0) guards the rare cell priced below its own forward rate.
const RTO_NET = `CASE
  WHEN upper(i.shipment_mode) = 'RTO' AND pr.courier_name IS NOT NULL AND fm.fwd_t IS NOT NULL
  THEN GREATEST((${EX}) - fm.fwd_t, 0)
  ELSE (${EX}) END`

// LEFT joins, so a non-bundler or an unpriced cell falls through to the raw cost rather than
// dropping the row entirely.
const RTO_JOINS = `
  LEFT JOIN (SELECT courier_name FROM public.lc_courier_profile WHERE is_rto_bundle) pr
         ON pr.courier_name = i.courier_name AND upper(i.shipment_mode) = 'RTO'
  LEFT JOIN public.lc_fwd_median fm
         ON pr.courier_name IS NOT NULL
        AND fm.courier_name = i.courier_name
        AND fm.zone = i.zone
        AND fm.acct = COALESCE(i.courier_account_type, '(none)')
        AND fm.slab IS NOT DISTINCT FROM ${SLAB}`

// Per-leg cost columns. RTO uses the netted figure; the others are the invoiced cost as-is.
const legCols = `
  COUNT(*) FILTER (WHERE upper(i.shipment_mode) = 'FORWARD')::int              AS fwd_n,
  SUM(${EX}) FILTER (WHERE upper(i.shipment_mode) = 'FORWARD')::float8         AS fwd_cost,
  COUNT(*) FILTER (WHERE upper(i.shipment_mode) = 'RTO')::int                  AS rto_n,
  SUM(${RTO_NET}) FILTER (WHERE upper(i.shipment_mode) = 'RTO')::float8        AS rto_cost,
  SUM(${EX}) FILTER (WHERE upper(i.shipment_mode) = 'RTO')::float8             AS rto_cost_gross,
  COUNT(*) FILTER (WHERE upper(i.shipment_mode) = 'RVP')::int                  AS rvp_n,
  SUM(${EX}) FILTER (WHERE upper(i.shipment_mode) = 'RVP')::float8             AS rvp_cost,
  COUNT(*) FILTER (WHERE upper(i.shipment_mode) = 'REVERSE')::int              AS rev_n,
  SUM(${EX}) FILTER (WHERE upper(i.shipment_mode) = 'REVERSE')::float8         AS rev_cost`

// A 15% buffer is applied ON TOP of every cost figure in this report, per the reporting
// basis agreed for it. Invoiced cost understates what should be budgeted, so each rupee
// figure is grossed up rather than a separate column being added — the sheets are the
// buffered view, and the Definition sheet states that so no reader mistakes these for raw
// invoiced amounts.
//
// Counts, weights and shipment values are NOT buffered: the buffer is a cost provision, and
// inflating a shipment count or a goods value would be meaningless.
const BUFFER = 1.15

// Cost rounding WITH the buffer applied. Every rupee figure in the workbook goes through
// this, so the buffer cannot be forgotten on one sheet and applied on another.
const rup = v => Math.round((Number(v) || 0) * BUFFER)
// Raw rounding for the figures the buffer must not touch — weights and shipment values.
const rupRaw = v => Math.round(Number(v) || 0)
const num2 = v => Math.round((Number(v) || 0) * 100 * BUFFER) / 100
// Raw 2dp, for ratios that are already a percentage of a buffered number.
const num2Raw = v => Math.round((Number(v) || 0) * 100) / 100
const q = async (sql, params = [MONTH]) => (await pool.query(sql, params)).rows

// ── 1. Group summary, with legs ──
const summary = await q(`
  SELECT ${GRP} AS grp,
         COUNT(*)::int AS shipments,
         SUM(${EX})::float8 AS cost,
         AVG(${EX})::float8 AS avg_cost,
         SUM(i.charged_weight_courier)::float8 AS kg,
         SUM(i.shipment_value)::float8 AS value,
         COUNT(DISTINCT d.sub_category)::int AS products,
         ${legCols}
    FROM public.logistics_invoices_b2c i
    JOIN public.awb_shipment_dims d ON d.awb = i.awb_number
    ${RTO_JOINS}
   WHERE ${SCOPE}
   GROUP BY 1 ORDER BY 3 DESC`)

// ── 2. Category detail ──
const byCat = await q(`
  SELECT ${GRP} AS grp, COALESCE(d.category, '(uncategorised)') AS category,
         COUNT(*)::int AS shipments,
         SUM(${EX})::float8 AS cost,
         AVG(${EX})::float8 AS avg_cost,
         SUM(i.charged_weight_courier)::float8 AS kg,
         SUM(i.shipment_value)::float8 AS value,
         ${legCols}
    FROM public.logistics_invoices_b2c i
    JOIN public.awb_shipment_dims d ON d.awb = i.awb_number
    ${RTO_JOINS}
   WHERE ${SCOPE}
   GROUP BY 1, 2 ORDER BY 1, 4 DESC`)

// ── 3. Product detail (sub_category is the product name in this master) ──
const byProduct = await q(`
  SELECT ${GRP} AS grp, COALESCE(d.category, '(uncategorised)') AS category,
         COALESCE(d.sub_category, '(unnamed)') AS product,
         COUNT(*)::int AS shipments,
         SUM(${EX})::float8 AS cost,
         AVG(${EX})::float8 AS avg_cost,
         SUM(i.charged_weight_courier)::float8 AS kg,
         AVG(i.charged_weight_courier)::float8 AS avg_kg,
         AVG(d.volumetric_kg)::float8 AS avg_vol_kg,
         SUM(i.shipment_value)::float8 AS value,
         ${legCols}
    FROM public.logistics_invoices_b2c i
    JOIN public.awb_shipment_dims d ON d.awb = i.awb_number
    ${RTO_JOINS}
   WHERE ${SCOPE}
   GROUP BY 1, 2, 3 ORDER BY 1, 5 DESC`)

// ── 4. Coverage — what the join misses, so the totals are auditable ──
const coverage = await q(`
  SELECT COUNT(*)::int AS all_shipments,
         SUM(${EX})::float8 AS all_cost,
         COUNT(d.awb)::int AS joined_shipments,
         SUM(${EX}) FILTER (WHERE d.awb IS NOT NULL)::float8 AS joined_cost,
         COUNT(*) FILTER (WHERE d.awb IS NULL)::int AS unjoined_shipments,
         SUM(${EX}) FILTER (WHERE d.awb IS NULL)::float8 AS unjoined_cost
    FROM public.logistics_invoices_b2c i
    LEFT JOIN public.awb_shipment_dims d ON d.awb = i.awb_number
   WHERE ${SCOPE}`)

// ── 5. Sensitivity — how much the answer moves on the two judgement calls ──
const sens = await q(`
  SELECT
    SUM(${EX}) FILTER (WHERE d.category IN ('Mobility','Ergo Furniture','Sparepart (Chair & Mobility)'))::float8 AS with_ergo,
    SUM(${EX}) FILTER (WHERE d.category IN ('Mobility','Sparepart (Chair & Mobility)'))::float8 AS without_ergo,
    SUM(${EX}) FILTER (WHERE d.category IN ('Mobility','Ergo Furniture','Sparepart (Chair & Mobility)')
                        AND d.sub_category NOT ILIKE '%bath mat%')::float8 AS excl_bathmats,
    SUM(${EX}) FILTER (WHERE d.category = 'Mixed Shipments')::float8 AS mixed_cost,
    COUNT(*) FILTER (WHERE d.category = 'Mixed Shipments')::int AS mixed_n
    FROM public.logistics_invoices_b2c i
    JOIN public.awb_shipment_dims d ON d.awb = i.awb_number
   WHERE ${SCOPE}`)

await pool.end()

// ── Build the workbook ──
const wb = XLSX.utils.book_new()
const add = (name, rows, widths) => {
  const ws = XLSX.utils.json_to_sheet(rows)
  if (widths) ws['!cols'] = widths.map(w => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, ws, name)
}

const cov = coverage[0]
const joinedTotal = summary.reduce((s, r) => s + Number(r.cost), 0)

// Leg columns, shared by the three detail sheets. RTO is reported NET of the bundled forward
// leg, with the gross alongside so the adjustment is visible rather than silent.
const legFields = r => ({
  'Forward Shipments': r.fwd_n,
  'Forward Cost': rup(r.fwd_cost),
  'RTO Shipments': r.rto_n,
  'RTO Cost (net of fwd)': rup(r.rto_cost),
  'RTO Cost (as invoiced)': rup(r.rto_cost_gross),
  // RVP and Reverse are both customer-initiated returns, so they report as one figure. RTO
  // stays separate: it is a failed delivery, and its cost is netted of the bundled forward
  // leg while these are not — merging all three would mix two different cost bases.
  'RVP + Reverse Shipments': Number(r.rvp_n) + Number(r.rev_n),
  'RVP + Reverse Cost': rup(Number(r.rvp_cost) + Number(r.rev_cost)),
  'All Returns Cost': rup(Number(r.rto_cost) + Number(r.rvp_cost) + Number(r.rev_cost)),
})
const legWidths = [18, 14, 14, 22, 22, 24, 20, 17]

add('Summary', [
  { Metric: 'Month', Value: MONTH },
  { Metric: 'Basis', Value: 'B2C courier invoices, ex-GST, zones A-E, total_cost > 0' },
  { Metric: 'BUFFER', Value: 'All COST figures include a 15% buffer on top of invoiced cost. Shipment counts, weights and shipment values are NOT buffered.' },
  { Metric: 'RTO note', Value: 'RTO cost is NET of the bundled forward leg for the five couriers that invoice both on one row. Gross shown alongside.' },
  {},
  ...summary.map(r => ({
    Metric: r.grp,
    Value: '',
    Shipments: r.shipments,
    'Logistics Cost': rup(r.cost),
    'Share of Joined %': num2Raw((Number(r.cost) / joinedTotal) * 100),
    'Avg Cost / Shipment': num2(r.avg_cost),
    'Charged Weight kg': rupRaw(r.kg),
    'Shipment Value': rupRaw(r.value),
    'Logistics % of Value': num2Raw((Number(r.cost) * BUFFER / Number(r.value)) * 100),
    Products: r.products,
    ...legFields(r),
  })),
  {},
  { Metric: 'Joined total', 'Logistics Cost': rup(joinedTotal) },
  { Metric: 'All B2C cost this month', 'Logistics Cost': rup(cov.all_cost) },
  { Metric: 'Not joined to product master', 'Logistics Cost': rup(cov.unjoined_cost), Shipments: cov.unjoined_shipments },
  { Metric: 'Join coverage %', Value: num2Raw((Number(cov.joined_cost) / Number(cov.all_cost)) * 100) },
], [34, 100, 12, 16, 18, 20, 18, 16, 20, 10, ...legWidths])

add('By Category', byCat.map(r => ({
  Group: r.grp,
  Category: r.category,
  Shipments: r.shipments,
  'Logistics Cost': rup(r.cost),
  'Avg Cost / Shipment': num2(r.avg_cost),
  'Charged Weight kg': rupRaw(r.kg),
  'Shipment Value': rupRaw(r.value),
  'Logistics % of Value': Number(r.value) ? num2Raw((Number(r.cost) * BUFFER / Number(r.value)) * 100) : null,
  ...legFields(r),
})), [22, 32, 12, 16, 20, 18, 16, 20, ...legWidths])

add('By Product', byProduct.map(r => ({
  Group: r.grp,
  Category: r.category,
  Product: r.product,
  Shipments: r.shipments,
  'Logistics Cost': rup(r.cost),
  'Avg Cost / Shipment': num2(r.avg_cost),
  'Charged Weight kg': rupRaw(r.kg),
  'Avg Weight kg': num2Raw(r.avg_kg),
  'Avg Volumetric kg': r.avg_vol_kg == null ? null : num2Raw(r.avg_vol_kg),
  'Shipment Value': rupRaw(r.value),
  'Logistics % of Value': Number(r.value) ? num2Raw((Number(r.cost) * BUFFER / Number(r.value)) * 100) : null,
  ...legFields(r),
})), [22, 26, 42, 12, 16, 20, 18, 15, 18, 16, 20, ...legWidths])

// Chair & Mobility on its own sheet — it is the small side of the split and would otherwise be
// a handful of rows buried under ~190.
add('Chair & Mobility Only', byProduct
  .filter(r => r.grp === 'Chair & Mobility')
  .map(r => ({
    Category: r.category,
    Product: r.product,
    Shipments: r.shipments,
    'Logistics Cost': rup(r.cost),
    'Avg Cost / Shipment': num2(r.avg_cost),
    'Avg Weight kg': num2Raw(r.avg_kg),
    'Shipment Value': rupRaw(r.value),
    ...legFields(r),
  })), [26, 44, 12, 16, 20, 15, 16, ...legWidths])

const s = sens[0]
add('Definition & Sensitivity', [
  { Item: 'HOW "Chair & Mobility" IS DEFINED', Detail: 'The data has no product-line flag, so this is a grouping of three categories:' },
  { Item: '', Detail: 'Mobility · Ergo Furniture · Sparepart (Chair & Mobility)' },
  {},
  { Item: 'Judgement call 1 — Ergo Furniture', Detail: 'Included, on the basis that ergo chairs and desks are a chair line.' },
  { Item: '  Chair & Mobility WITH Ergo Furniture', Detail: rup(s.with_ergo) },
  { Item: '  Chair & Mobility WITHOUT Ergo Furniture', Detail: rup(s.without_ergo) },
  { Item: '  Difference', Detail: rup(Number(s.with_ergo) - Number(s.without_ergo)) },
  {},
  { Item: 'Judgement call 2 — bath mats inside "Mobility"', Detail: 'Anti-Slip / AeroDry Bath Mat sit under Mobility but are bathroom safety, not a mobility aid.' },
  { Item: '  Chair & Mobility excluding bath mats', Detail: rup(s.excl_bathmats) },
  {},
  { Item: 'LEGS', Detail: 'shipment_mode carries four values: FORWARD, RTO, RVP, REVERSE. RVP and REVERSE are reported separately rather than merged.' },
  { Item: '  RTO netting', Detail: 'Delhivery, ElasticRun, Shadowfax, SkyAir and Swift invoice forward + return on the RTO row. The forward median for that courier/zone/account/slab is subtracted, so RTO reflects the return leg only.' },
  { Item: '  Not netted', Detail: 'Bluedart and Urbanbolt invoice the return alone; netting them would drive the cost negative.' },
  { Item: '  Which couriers bundle', Detail: 'Read from public.lc_courier_profile, measured from the billing itself rather than a typed list.' },
  {},
  { Item: 'UNALLOCATED — Mixed Shipments', Detail: 'Multi-product parcels that may contain a chair; counted in Non Chair & Mobility because that is where the category falls.' },
  { Item: '  Mixed Shipments cost', Detail: rup(s.mixed_cost) },
  { Item: '  Mixed Shipments shipments', Detail: s.mixed_n },
  {},
  { Item: 'UNALLOCATED — no product join', Detail: 'AWBs with no row in the product master; in neither group.' },
  { Item: '  Cost', Detail: rup(cov.unjoined_cost) },
  { Item: '  Shipments', Detail: cov.unjoined_shipments },
  {},
  { Item: 'BUFFER — 15%', Detail: 'Every cost figure in this workbook is invoiced cost x 1.15. Counts, weights and shipment values are unbuffered, because a buffer is a cost provision and inflating a count or a goods value would be meaningless.' },
  { Item: '  Logistics % of Value', Detail: 'Computed on the BUFFERED cost over the unbuffered goods value, so it reads as the provisioned rate rather than the invoiced one.' },
  {},
  { Item: 'RVP + Reverse', Detail: 'Merged: both are customer-initiated returns. RTO is kept separate because it is a failed delivery and its cost is netted of the bundled forward leg, so merging all three would mix two cost bases.' },
  {},
  { Item: 'GST', Detail: 'All costs ex-GST. Delhivery uploaded GST-inclusive totals; corrected by detecting the 1.18 ratio, not by courier name.' },
], [44, 150])

let out = OUT
try {
  XLSX.writeFile(wb, out)
} catch (e) {
  // EBUSY means the workbook is open in Excel, which holds an exclusive lock. Write beside
  // it rather than failing, and say so — losing the run to a locked file wastes 90s.
  if (e.code !== 'EBUSY') throw e
  out = OUT.replace(/.xlsx$/, '_v2.xlsx')
  XLSX.writeFile(wb, out)
  console.log('  (original was open in Excel, so wrote ' + out + ' instead)')
}

// Console figures carry the buffer too, so this recap matches the workbook rather than
// quietly reporting the unbuffered number beside a buffered sheet.
const L = v => '₹' + ((Number(v) * BUFFER) / 1e5).toFixed(2) + 'L'
console.log(`wrote ${OUT}`)
console.log(`  sheets: Summary · By Category (${byCat.length}) · By Product (${byProduct.length}) · Chair & Mobility Only · Definition & Sensitivity\n`)
for (const r of summary) {
  console.log(`  ${r.grp}`)
  console.log(`    total    ${String(r.shipments).padStart(7)} shp  ${L(r.cost)}`)
  console.log(`    forward  ${String(r.fwd_n).padStart(7)} shp  ${L(r.fwd_cost)}`)
  console.log(`    RTO      ${String(r.rto_n).padStart(7)} shp  ${L(r.rto_cost)}   (as invoiced ${L(r.rto_cost_gross)})`)
  console.log(`    RVP+rev  ${String(Number(r.rvp_n) + Number(r.rev_n)).padStart(7)} shp  ${L(Number(r.rvp_cost) + Number(r.rev_cost))}`)
  console.log(`    returns  ${String(Number(r.rto_n) + Number(r.rvp_n) + Number(r.rev_n)).padStart(7)} shp  ${L(Number(r.rto_cost) + Number(r.rvp_cost) + Number(r.rev_cost))}`)
}
console.log(`\n  join coverage ${((Number(cov.joined_cost) / Number(cov.all_cost)) * 100).toFixed(1)}%`)
