// Runs hourly in GitHub Actions. Computes the FIXED-WINDOW bell alerts (#3 Delivery%, #4 RTO%,
// #11 TAT/EDD breach%, #6 D2C return-rate red lines) directly from BigQuery, independent of
// whatever date range/filter a user currently has selected in the app — that was Phase 1's first
// bug: these 4 alerts must never depend on client filter state. Writes public/alerts-data.json;
// the client (computeCombinedAlerts in src/utils.js) reads this static file for these 4 alerts
// instead of logisticsData/data. Thresholds live in src/config/metricTargets.js ALERT_RULES — this
// script only computes the raw numbers, it does not decide what counts as "bad".
//
// Windows (fixed, never the user's selection):
//   Logistics (#3/#4/#11): orders 15-21 days ago (7-day mature window, order_date grain).
//   Returns   (#6):        orders 14-20 days ago (D2C Return Analysis page's own maturity bar).
//
// #11 EDD field: expected_delivery_date_by_courier_partner (same as api/logistics.js's `edd`).
// If that field or its derived sla_breach/on_time counts are unavailable, #11 is SKIPPED for this
// run (not silently computed from a different field) — see the null-guard below.

import { writeFileSync } from 'fs'
import { BigQuery } from '@google-cloud/bigquery'
import returnAnalysisHandler from '../api/return-analysis.js'

const bq = new BigQuery({ keyFilename: 'sa_key.json' })

// Calls the real /api/return-analysis handler in-process (same code path server.js wires to that
// route) instead of hand-rolling separate SQL — this reuses netRevenueSelectFragment/
// computeNetRevenueMeasures from _bq.js so #6's numbers are guaranteed to reconcile with the live
// Return Analysis page's own Cancel/RTO/CIR/Exchange/Return% cards for the same date range. An
// earlier version of this script hand-wrote a query against `Revenue`/`is_cancelled`/`is_rto`/
// `is_CIR_return`/`is_exchange` columns that don't exist on fact_all_platform_sales_report (the
// real columns are SellingPrice_Inc_GST + Order_Status) — caught during Phase 1 verification
// 2026-10-31 when the query failed with "Unrecognized name: Revenue".
async function callReturnAnalysis(body) {
  return new Promise((resolve, reject) => {
    const req = { method: 'POST', body }
    const res = {
      _status: 200,
      setHeader() { return this },
      status(code) { this._status = code; return this },
      json(payload) { if (this._status >= 400) reject(new Error(JSON.stringify(payload))); else resolve(payload) },
      end() { resolve(null) },
    }
    returnAnalysisHandler(req, res).catch(reject)
  })
}

const fmtLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const today = new Date()
const windowEnd = (daysAgo) => { const d = new Date(today); d.setDate(d.getDate() - daysAgo); return d }

// Logistics: 15-21 days ago inclusive (7 days)
const logEnd = windowEnd(15)
const logStart = windowEnd(21)
const logEndStr = fmtLocal(logEnd)
const logStartStr = fmtLocal(logStart)

// Returns: 14-20 days ago inclusive (7 days)
const retEnd = windowEnd(14)
const retStart = windowEnd(20)
const retEndStr = fmtLocal(retEnd)
const retStartStr = fmtLocal(retStart)

const dateRangeLabel = (startStr, endStr) => {
  const fmtD = s => { const d = new Date(s + 'T00:00:00'); return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })}` }
  return startStr === endStr ? `Orders ${fmtD(startStr)}` : `Orders ${fmtD(startStr).split(' ')[0]}–${fmtD(endStr)}`
}

async function run(sql) {
  // No explicit `location` — matches every other BQ call in this repo (api/_bq.js, api/logistics.js,
  // api/return-analysis.js), which all let the client auto-detect it. A prior pass here hardcoded
  // `location: 'US'`, which failed with "Dataset frido-429506:production was not found in location
  // US" since the real dataset isn't in that region — caught during Phase 1 verification 2026-10-31.
  const [rows] = await bq.query({ query: sql, maximumBytesBilled: '10000000000' })
  return rows
}

async function main() {
  const out = { generatedAt: new Date().toISOString(), logistics: null, returns: null }

  // --- Logistics: #3 Delivery%, #4 RTO%, #11 SLA-breach% (TAT/EDD) --------------------------
  // Mirrors api/logistics.js's base/kpis CTEs: Forward shipments only, order_date-grain window.
  try {
    const logisticsRows = await run(`
WITH base AS (
  SELECT
    c.awb,
    c.shipment_type,
    DATE(c.order_date) AS order_date,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(c.expected_delivery_date_by_courier_partner, 1, 10)) AS edd,
    CASE
      WHEN c.clickpost_unified_status IN ('Delivered') THEN 'Delivered'
      WHEN c.clickpost_unified_status IN ('RTO-Delivered','RTO-Intransit','RTO Initiated','RTO') THEN 'RTO'
      ELSE 'Other'
    END AS unified_status,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(c.delivery_date, 1, 10)) AS delivery_date
  FROM \`frido-429506.production.Clickpost_Shipment_Tracking_Report\` c
  WHERE c.shipment_type = 'Forward'
    AND DATE(c.order_date) BETWEEN '${logStartStr}' AND '${logEndStr}'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY c.awb ORDER BY c.created_at) = 1
)
SELECT
  COUNT(DISTINCT awb) AS total,
  COUNTIF(unified_status = 'Delivered') AS delivered,
  COUNTIF(unified_status = 'RTO') AS rto,
  COUNTIF(delivery_date IS NOT NULL AND edd IS NOT NULL AND delivery_date <= edd) AS on_time,
  COUNTIF(delivery_date IS NOT NULL AND edd IS NOT NULL AND delivery_date > edd) AS sla_breach
FROM base
    `)
    const r = logisticsRows[0] || {}
    const total = parseInt(r.total) || 0
    const delivered = parseInt(r.delivered) || 0
    const rto = parseInt(r.rto) || 0
    const onTime = parseInt(r.on_time) || 0
    const slaBreach = parseInt(r.sla_breach) || 0
    const deliveredWithEdd = onTime + slaBreach // the only correct denominator — NOT lOrdersDeliveredTotal
    out.logistics = {
      windowStart: logStartStr, windowEnd: logEndStr, rangeLabel: dateRangeLabel(logStartStr, logEndStr),
      total, delivered, rto,
      deliveryPct: total > 0 ? +(delivered / total * 100).toFixed(2) : null,
      rtoPct: total > 0 ? +(rto / total * 100).toFixed(2) : null,
      // #11: null (not 0, not a fallback) if there's no delivered-with-edd population to compute a share of —
      // the client must treat null as "skip this alert", never substitute a different field.
      slaBreachPct: deliveredWithEdd > 0 ? +(slaBreach / deliveredWithEdd * 100).toFixed(2) : null,
      slaBreachAvailable: deliveredWithEdd > 0,
    }
  } catch (e) {
    console.error('generate-alerts-cache: logistics window query failed —', e.message)
    out.logistics = null // client must skip #3/#4/#11 this run, not fall back to stale/wrong data
  }

  // --- Returns: #6 D2C return-rate red lines (Shopify, ex Retail Store / Shopify International) ---
  try {
    const resp = await callReturnAnalysis({ start: retStartStr, end: retEndStr })
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

  writeFileSync('public/alerts-data.json', JSON.stringify(out, null, 2))
  console.log('Wrote public/alerts-data.json:', JSON.stringify(out))
}

main().catch(e => { console.error(e); process.exit(1) })
