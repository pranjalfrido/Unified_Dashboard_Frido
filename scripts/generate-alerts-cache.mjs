// Runs hourly in GitHub Actions. Computes the FIXED-WINDOW bell alerts (#3 Delivery%, #4 RTO%,
// #11 TAT/EDD breach%, #6 D2C return-rate red lines, #7 channel zero-orders, #8 D2C CM1%/COGS%)
// directly from BigQuery/Supabase, independent of whatever date range/filter a user currently has
// selected in the app — that was Phase 1's first bug: these alerts must never depend on client
// filter state. Writes public/alerts-data.json; the client (computeCombinedAlerts in src/utils.js)
// reads this static file for these alerts instead of logisticsData/data. Thresholds live in
// src/config/metricTargets.js ALERT_RULES — this script only computes the raw numbers, it does
// not decide what counts as "bad".
//
// Windows (fixed, never the user's selection):
//   Logistics (#3/#4/#11): orders created 15-21 days ago (7-day mature window, matches
//     api/logistics.js's own DATE(created_at) grain).
//   Returns/P&L (#6/#8):  orders 14-20 days ago (D2C Return Analysis page's own maturity bar —
//     reused for #8 since CM1/COGS depend on the same resolved Order_Status outcome data).
//   Zero-orders (#7):     yesterday (most recent complete calendar day), computed in IST
//     explicitly (not the machine's local timezone) — see istDateString() below. This was a
//     real bug found during Phase 1 verification 2026-10-31: the original #7 (a client useMemo
//     in utils.js) built "yesterday" from the browser's local clock and only ever ran against
//     whatever date range a user happened to have selected, so it fired for nearly every channel
//     whenever the selected range didn't actually include a real "yesterday" IST boundary. Moved
//     here, same fixed-window-independent-of-client-state treatment as #3/#4/#6/#11.
//
// #11 EDD field: expected_delivery_date_by_courier_partner (same as api/logistics.js's `edd`).
// #3/#4/#11 reuse api/logistics.js's OWN handler in-process (not re-derived SQL) — an earlier
// version of this script hand-wrote a second, independently-maintained query against
// Clickpost_Shipment_Tracking_Report that filtered by order_date instead of DATE(created_at) and
// used a simplified unified_status mapping missing several real status branches, so its RTO%
// diverged from the live Logistics -> Performance page for the identical date range (5.76% vs
// 6.21%, caught during Phase 1 verification 2026-10-31). Calling the real handler guarantees this
// can never drift again — there is exactly one place that query lives.
//
// #8 CM1%/COGS%/SnD% reuse the exact pure formulas from src/pnl/pnlUtils.js for Net Revenue/COGS
// (netRevenueOf, cogsMonthlyMapOf, getCogsPerUnit) against a standalone query mirroring
// api/bq.js's shSkuCosts grain, so CM1/COGS are formula-identical to the live P&L -> D2C page
// (reconciled 2026-10-31: 43.18% CM1 vs live's reported ~43.5%). Unlike the live page's
// resolvedDailySKU engine (which patches in a rolling historical rate for IMMATURE/recent days),
// this window is always 14-20 days old — already-settled — so the raw Order_Status outcome split
// from the base query is used directly; no resolved-rate engine needed.
//
// SnD% does NOT use pnlUtils.js's exported blendedLogisticsPerUnit/blendedLogisticsForBuckets —
// those two helpers still implement an OLDER formula (rtoPct*rate.rto + returnPct*rate.reverse as
// STANDALONE costs) that pnlUtils.js's own file comments document as superseded; the live page's
// actual shSkuCosts (PnLPage.jsx) never calls them, it inlines the corrected, business-confirmed
// formula directly. This script ports that inline formula verbatim (see rateForSlab + the
// per-bucket outcomeLogistics loop below) rather than the stale exported helpers — using the
// helpers first produced SnD% 17-21% vs. the live page's ~15% for the same period.
//
// #12 (SnD% as its own alert) is intentionally NOT built yet — still on hold pending the user's
// bar approval; the SnD% NUMBER is still computed/written below for future use, but ALERT_RULES
// has no SnD bar yet so the client does not alert on it.

import { writeFileSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { BigQuery } from '@google-cloud/bigquery'
import pkg from 'pg'
import returnAnalysisHandler from '../api/return-analysis.js'
import logisticsHandler from '../api/logistics.js'
import { buildQuery } from '../api/_bq.js'
import { netRevenueOf, cogsMonthlyMapOf, getCogsPerUnit } from '../src/pnl/pnlUtils.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// Ported verbatim from src/pnl/PnLPage.jsx's local (non-exported) rateForSlab: exact weightGm
// match first, else bracket to the nearest slab <= the value (same convention pnlUtils.js's
// rateForWeightGm/rateForBucketSlab use, kept local here since neither is exported).
function rateForSlab(slabs, weightSlab) {
  if (!slabs?.length || weightSlab == null) return null
  const exact = slabs.find(s => s.weightGm === weightSlab)
  if (exact) return exact
  let match = null
  for (const s of slabs) { if (s.weightGm <= weightSlab) match = s; else break }
  return match || slabs[0]
}

const bq = new BigQuery({ keyFilename: join(ROOT, 'sa_key.json'), projectId: 'frido-429506' })

// Calls a real Express-route handler in-process (same code path server.js wires to that route)
// instead of hand-rolling separate SQL, so these numbers are guaranteed to reconcile with the
// live page's own cards for the same date range/filters — see the file header for the RTO%
// mismatch this specifically fixes (logistics) and the earlier returns-SQL mismatch it already
// fixed (returns, kept from the prior pass).
async function callHandler(handler, body) {
  return new Promise((resolve, reject) => {
    const req = { method: 'POST', body }
    const res = {
      _status: 200,
      setHeader() { return this },
      status(code) { this._status = code; return this },
      json(payload) { if (this._status >= 400) reject(new Error(JSON.stringify(payload))); else resolve(payload) },
      end() { resolve(null) },
    }
    handler(req, res).catch(reject)
  })
}

const fmtLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const today = new Date()
const windowEnd = (daysAgo) => { const d = new Date(today); d.setDate(d.getDate() - daysAgo); return d }

// --- IST day boundary for #7 (yesterday) --------------------------------------------------
// "Yesterday" must be a fixed calendar date in IST (Asia/Kolkata), not the machine's local
// timezone (the original #7 bug — see file header) and not whatever the client browser's clock
// says. Intl.DateTimeFormat with timeZone:'Asia/Kolkata' gives the correct Y-M-D regardless of
// what timezone this script itself runs in (GitHub Actions runners are UTC).
function istDateString(d) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const get = t => parts.find(p => p.type === t).value
  return `${get('year')}-${get('month')}-${get('day')}`
}
const yesterdayIST = new Date(Date.now() - 24 * 60 * 60 * 1000)
const yesterdayStr = istDateString(yesterdayIST)

// Logistics: 15-21 days ago inclusive (7 days)
const logEnd = windowEnd(15)
const logStart = windowEnd(21)
const logEndStr = fmtLocal(logEnd)
const logStartStr = fmtLocal(logStart)

// Returns/P&L: 14-20 days ago inclusive (7 days)
const retEnd = windowEnd(14)
const retStart = windowEnd(20)
const retEndStr = fmtLocal(retEnd)
const retStartStr = fmtLocal(retStart)

const dateRangeLabel = (startStr, endStr) => {
  const fmtD = s => { const d = new Date(s + 'T00:00:00'); return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })}` }
  return startStr === endStr ? `Orders ${fmtD(startStr)}` : `Orders ${fmtD(startStr).split(' ')[0]}–${fmtD(endStr)}`
}

async function run(sql) {
  // No explicit `location` — matches every other BQ call in this repo (api/_bq.js,
  // api/logistics.js, api/return-analysis.js), which all let the client auto-detect it. A prior
  // pass here hardcoded `location: 'US'`, which failed — the real dataset isn't in that region
  // — caught during Phase 1 verification 2026-10-31.
  const [rows] = await bq.query({ query: sql, maximumBytesBilled: '10000000000' })
  return rows
}

async function main() {
  const out = { generatedAt: new Date().toISOString(), logistics: null, returns: null, zeroOrders: null, d2cPnl: null }

  // --- Logistics: #3 Delivery%, #4 RTO%, #11 SLA-breach% (TAT/EDD) --------------------------
  // Calls api/logistics.js's OWN handler in-process — single source of truth, see file header.
  try {
    const resp = await callHandler(logisticsHandler, { start: logStartStr, end: logEndStr, shipmentType: 'forward' })
    const k = resp?.kpis || {}
    const total = parseInt(k.total_shipments) || 0
    const delivered = parseInt(k.delivered) || 0
    const rto = parseInt(k.rto) || 0
    const onTime = parseInt(k.on_time) || 0
    const slaBreach = parseInt(k.sla_breach) || 0
    const deliveredWithEdd = onTime + slaBreach
    out.logistics = {
      windowStart: logStartStr, windowEnd: logEndStr, rangeLabel: dateRangeLabel(logStartStr, logEndStr),
      total, delivered, rto,
      deliveryPct: total > 0 ? +(delivered / total * 100).toFixed(2) : null,
      rtoPct: total > 0 ? +(rto / total * 100).toFixed(2) : null,
      // #11: null (not 0, not a fallback) if there's no delivered-with-edd population to compute a
      // share of — the client must treat null as "skip this alert", never substitute a different
      // field. api/logistics.js's `edd` field is expected_delivery_date_by_courier_partner
      // (SAFE.PARSE_DATE'd) — if that's unavailable for this window, on_time+sla_breach is 0 and
      // this is correctly null, no silent fallback to a different population.
      slaBreachPct: deliveredWithEdd > 0 ? +(slaBreach / deliveredWithEdd * 100).toFixed(2) : null,
      slaBreachAvailable: deliveredWithEdd > 0,
    }
  } catch (e) {
    console.error('generate-alerts-cache: logistics window query failed —', e.message)
    out.logistics = null // client must skip #3/#4/#11 this run, not fall back to stale/wrong data
  }

  // --- Returns: #6 D2C return-rate red lines (Shopify, ex Retail Store / Shopify International) ---
  try {
    const resp = await callHandler(returnAnalysisHandler, { start: retStartStr, end: retEndStr })
    const k = resp?.kpis || {}
    const gross = parseFloat(k.totalRevenue) || 0
    out.returns = {
      windowStart: retStartStr, windowEnd: retEndStr, rangeLabel: dateRangeLabel(retStartStr, retEndStr),
      gross,
      cancelPct: gross > 0 ? +(k.cancelPct ?? 0).toFixed(2) : null,
      rtoPct: gross > 0 ? +(k.rtoPct ?? 0).toFixed(2) : null,
      cirPct: gross > 0 ? +(k.cirPct ?? 0).toFixed(2) : null,
      exchangePct: gross > 0 ? +(k.exchangePct ?? 0).toFixed(2) : null,
      totalReturnPct: gross > 0 ? +(k.returnPct ?? 0).toFixed(2) : null,
    }
  } catch (e) {
    console.error('generate-alerts-cache: returns window query failed —', e.message)
    out.returns = null
  }

  // --- #7: channel with 0 orders yesterday (IST), grouped, CRED/Firstcry excluded ------------
  // Standalone query against fact_all_platform_sales_report, same Channel grouping convention as
  // api/bq.js's byChannel query. Independent of any client-selected date range (the original
  // bug) and uses an explicit IST day boundary (Intl.DateTimeFormat), not the host machine's
  // local clock.
  try {
    const rows = await run(`
      SELECT Channel, COUNT(DISTINCT OrderId) AS orders
      FROM \`frido-429506.production.fact_all_platform_sales_report\`
      WHERE OrderDate = '${yesterdayStr}'
        AND Country = 'India'
        AND NOT (Channel = 'Shopify' AND OrderId LIKE '%_EX%')
      GROUP BY Channel
    `)
    const ordersByChannel = {}
    rows.forEach(r => { ordersByChannel[r.Channel] = parseInt(r.orders) || 0 })
    // Real channel list — same set the Sales page's channel tabs cover (src/permissionTree.js
    // sales:<channel> keys), minus CRED/Firstcry (excluded per the backtest: naturally
    // thin/intermittent channels that false-fire constantly — see ALERTS_BACKTEST.md).
    const ALL_CHANNELS = ['Shopify', 'Amazon', 'Flipkart', 'Blinkit', 'Zepto', 'Instamart', 'Myntra']
    const zero = ALL_CHANNELS.filter(c => !(ordersByChannel[c] > 0))
    out.zeroOrders = {
      date: yesterdayStr,
      label: `${new Date(yesterdayStr + 'T00:00:00').getDate()} ${new Date(yesterdayStr + 'T00:00:00').toLocaleString('en-US', { month: 'short' })}`,
      ordersByChannel,
      zeroChannels: zero,
    }
  } catch (e) {
    console.error('generate-alerts-cache: zero-orders query failed —', e.message)
    out.zeroOrders = null
  }

  // --- #8/#12: D2C CM1%/COGS%/SnD%, mature 14-20-day window ----------------------------------
  try {
    const base = buildQuery(retStartStr, retEndStr, {})
    const rows = await run(`
      WITH q AS (${base}),
      lined AS (
        SELECT
          MasterSKU AS sku,
          COALESCE(Order_Status, 'Delivered') AS order_status,
          ItemQty AS qty,
          SellingPrice_Inc_GST AS gross_inc_gst,
          SellingPrice_Exc_GST AS exc_gst,
          CASE
            WHEN Weight_gms IS NULL THEN NULL
            WHEN (Weight_gms * ItemQty) <= 500 THEN 500
            ELSE CAST(CEIL((Weight_gms * ItemQty) / 1000.0) * 1000 AS INT64)
          END AS weight_slab
        FROM q
        WHERE Channel = 'Shopify'
          AND SubChannel NOT IN ('Shopify International', 'Retail Store')
          AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != ''
      )
      SELECT
        sku, order_status, weight_slab,
        COUNT(*) AS line_count,
        SUM(qty) AS total_qty,
        SUM(gross_inc_gst) AS gross_inc_gst,
        SUM(exc_gst) AS exc_gst
      FROM lined
      GROUP BY sku, order_status, weight_slab
    `)

    // ── Shape into per-SKU aggregates: units/gross/excGst by outcome, weight-slab bucket shares ──
    const bySku = {}
    rows.forEach(r => {
      const sku = r.sku
      if (!bySku[sku]) bySku[sku] = { units: 0, gross: 0, excGst: 0, rtoUnits: 0, cirUnits: 0, cancelUnits: 0, exchUnits: 0, returnUnits: 0, buckets: {}, totalQtyForBuckets: 0 }
      const e = bySku[sku]
      const qty = parseInt(r.total_qty) || 0
      const gross = parseFloat(r.gross_inc_gst) || 0
      const excGst = parseFloat(r.exc_gst) || 0
      e.units += qty
      e.gross += gross
      e.excGst += excGst
      const status = r.order_status
      if (status === 'RTO') e.rtoUnits += qty
      else if (status === 'CIR') e.cirUnits += qty
      else if (status === 'Cancelled') e.cancelUnits += qty
      else if (status === 'Exchange') e.exchUnits += qty
      else if (status === 'Return') e.returnUnits += qty
      if (r.weight_slab != null) {
        const slab = parseInt(r.weight_slab)
        if (!e.buckets[slab]) e.buckets[slab] = { qty: 0, lineCount: 0 }
        e.buckets[slab].qty += qty
        e.buckets[slab].lineCount += parseInt(r.line_count) || 0
        e.totalQtyForBuckets += qty
      }
    })

    // COGS: real per-SKU/month Supabase table -> sub-category average -> ASP estimate (last
    // resort), the SAME tiered fallback getCogsPerUnit already implements — just needs the raw
    // rows shaped via cogsMonthlyMapOf. OID 1082 type-parser fix for Postgres DATE columns (same
    // bug/fix as api/cogs-monthly.js — without it `month` comes back as a JS Date object and
    // every lookup misses, silently falling everything to the ASP estimate).
    const { Pool, types } = pkg
    types.setTypeParser(1082, val => val)
    const pgPool = new Pool({ connectionString: process.env.SUPABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 })
    const cogsRes = await pgPool.query(`SELECT sku, month, cogs, category, sub_category AS "subCategory", cogs_source AS "cogsSource" FROM public.product_cogs_monthly`)
    await pgPool.end()
    const cogsMonthlyMap = cogsMonthlyMapOf(cogsRes.rows)

    // SnD rate card (public/snd-rates.json) — same file the live page fetches, read directly here.
    const sndRates = JSON.parse(readFileSync(join(ROOT, 'public', 'snd-rates.json'), 'utf8'))

    const month = `${retStartStr.slice(0, 7)}-01`
    let totalNet = 0, totalCogs = 0, netCovered = 0, totalSnd = 0, sndNetCovered = 0, cm1 = 0, cm1NetCovered = 0

    Object.entries(bySku).forEach(([sku, e]) => {
      if (!e.units) return
      const returnUnitsForNet = e.rtoUnits + e.cirUnits + e.cancelUnits + e.returnUnits
      // netRevenueOf expects per-outcome REVENUE (cancelRev/rtoRev/cirRev/returnRev), not units —
      // reconstruct those from this SKU's own blended ASP so the SAME totalReturnRev/gstRatio
      // formula applies exactly as the live page computes it from real per-outcome revenue rows.
      const asp = e.units > 0 ? e.gross / e.units : 0
      const cancelRev = e.cancelUnits * asp, rtoRev = e.rtoUnits * asp, cirRev = e.cirUnits * asp, returnRev = e.returnUnits * asp
      const realNet = netRevenueOf({ rev: e.gross, excRev: e.excGst, units: e.units, returnUnits: returnUnitsForNet, cancelRev, rtoRev, cirRev, returnRev })
      totalNet += realNet.net

      // COGS (mature window — applied to NET units per the live page's convention).
      const perUnitCogs = getCogsPerUnit({ sku, date: month, cogsMonthlyMap, asp })
      const rowCosted = perUnitCogs > 0 || realNet.netUnits > 0
      if (rowCosted) { totalCogs += perUnitCogs * realNet.netUnits; netCovered += realNet.net }

      // SnD — bucketed weight-slab distribution (same shSkuCosts grain as PnLPage.jsx: the SKU's
      // resolved RTO%/CIR%/Exchange%/Delivered% split applied identically within EACH weight
      // bucket, each priced at its own real weight, summed across buckets), NOT a single blended
      // weight (the bias the earlier rolling-7-day backtest flagged, which used a single SKU-day
      // average weight-slab approximation and ran SnD% a few points higher than the live page).
      //
      // IMPORTANT: this deliberately does NOT call pnlUtils.js's blendedLogisticsPerUnit/
      // blendedLogisticsForBuckets — those two exported helpers still implement the OLD,
      // since-superseded formula (rtoPct*rate.rto + returnPct*rate.reverse as STANDALONE costs),
      // which pnlUtils.js's own file-header comment documents as confirmed wrong and replaced.
      // The live page's actual shSkuCosts (PnLPage.jsx) never uses those helpers for this —
      // it inlines the corrected, business-confirmed formula directly (every non-cancelled unit
      // pays `forward` once; RTO/CIR/Exchange each add their OWN extra leg on top). Using the
      // stale exported helper here was tried first and produced SnD% 17-21% vs. the live page's
      // ~15% for the same period — ported the live page's inline formula verbatim instead, which
      // is the only way to guarantee this reconciles.
      const buckets = e.totalQtyForBuckets > 0
        ? Object.entries(e.buckets).map(([slab, b]) => ({ slab: Number(slab), share: b.qty / e.totalQtyForBuckets, unitsPerOrder: b.lineCount > 0 ? b.qty / b.lineCount : 1 }))
        : [{ slab: 2000, share: 1, unitsPerOrder: 1 }] // same 2kg fallback as shSkuCosts for a SKU with no weight on record
      const rtoPct = e.units > 0 ? e.rtoUnits / e.units : 0
      const cirPct = e.units > 0 ? (e.cirUnits + e.returnUnits) / e.units : 0 // CIR + plain Return share the reverse-only leg, same as shSkuCosts' cirPct
      const exchPct = e.units > 0 ? e.exchUnits / e.units : 0
      const cancelPct = e.units > 0 ? e.cancelUnits / e.units : 0
      const deliveredPct = Math.max(1 - rtoPct - cirPct - exchPct - cancelPct, 0)
      let logisticsCost = 0, fulfilmentCost = 0, anySnd = false
      buckets.forEach(({ slab, share, unitsPerOrder }) => {
        const rate = rateForSlab(sndRates, slab)
        if (!rate) return
        anySnd = true
        const bucketUnits = e.units * share
        const perUnitDivisor = unitsPerOrder > 0 ? unitsPerOrder : 1
        // The confirmed-correct per-bucket formula (PnLPage.jsx shSkuCosts, "outcomeLogistics"):
        // forward is paid once by every non-cancelled unit; RTO adds +rto, CIR/Return adds
        // +reverse, Exchange adds +reverse+forward (a second shipment) on top of its own forward.
        logisticsCost +=
          (bucketUnits * rtoPct * (rate.forward + rate.rto) +
           bucketUnits * cirPct * (rate.forward + rate.reverse) +
           bucketUnits * exchPct * (rate.forward + rate.reverse + rate.forward) +
           bucketUnits * deliveredPct * rate.forward) / perUnitDivisor
        fulfilmentCost += (bucketUnits * rate.fulfilment) / perUnitDivisor
      })
      // Stock-movement (Rs4/kg) is a fixed per-SHIPMENT warehouse-transfer cost unrelated to
      // return outcome — summed per raw (weight_slab, line_count) line, same as shSkuCosts'
      // separate first loop over skuCostRows (effectiveSlab/1000 * 4 * lineCount), NOT scaled by
      // outcome percentages or divided by unitsPerOrder.
      const stockMovement = Object.entries(e.buckets).reduce((s, [slab, b]) => s + (Number(slab) / 1000) * 4 * b.lineCount, 0)
      let sndCost = anySnd ? logisticsCost + fulfilmentCost + stockMovement : 0
      if (anySnd) {
        const paymentGw = e.gross * 0.011
        const softwareFee = e.units * 15
        sndCost += paymentGw + softwareFee
        totalSnd += sndCost
        sndNetCovered += realNet.net
      }
      if (rowCosted && anySnd) { cm1 += (realNet.net - perUnitCogs * realNet.netUnits) - sndCost; cm1NetCovered += realNet.net }
    })

    out.d2cPnl = {
      windowStart: retStartStr, windowEnd: retEndStr, rangeLabel: dateRangeLabel(retStartStr, retEndStr),
      netRevenue: Math.round(totalNet),
      cogsPct: netCovered > 0 ? +(totalCogs / netCovered * 100).toFixed(2) : null,
      sndPct: sndNetCovered > 0 ? +(totalSnd / sndNetCovered * 100).toFixed(2) : null,
      cm1Pct: cm1NetCovered > 0 ? +(cm1 / cm1NetCovered * 100).toFixed(2) : null,
    }
  } catch (e) {
    console.error('generate-alerts-cache: D2C P&L window query failed —', e.message)
    out.d2cPnl = null
  }

  writeFileSync(join(ROOT, 'public', 'alerts-data.json'), JSON.stringify(out, null, 2))
  console.log('Wrote public/alerts-data.json:', JSON.stringify(out))
}

main().catch(e => { console.error(e); process.exit(1) })
