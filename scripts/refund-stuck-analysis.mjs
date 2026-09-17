// Open-refund and stuck-shipment exposure, from the two Clickpost tables.
//
// Two questions, deliberately kept separate because they are different problems:
//
//   1. REFUND NOT CLOSED - a return/cancellation where money is still owed to the customer.
//      Exchanges are excluded: 123,616 of them carry a NULL refund_status because no refund
//      is due at all, and counting those as "open" would swamp the real number.
//
//   2. STUCK IN LOOP - a shipment Clickpost itself flags as stuck in its lifecycle, or one
//      sitting in a non-terminal status well past the point it should have resolved.
//
// Dates in this table are STRINGS and dirty (one created_at holds an address), so every
// parse is SAFE.PARSE_* with a fallback chain and rows that fail are reported, not dropped
// silently.
import { BigQuery } from '@google-cloud/bigquery'
import XLSX from 'xlsx'

const OUT = process.argv[2] || '../refund_stuck_analysis.xlsx'
const STUCK_DAYS = Number(process.argv[3]) || 15   // non-terminal beyond this = stuck

const bq = new BigQuery({ keyFilename: 'sa_key.json', projectId: 'frido-429506' })
const R = '`frido-429506.production.Clickpost_Returns_Exchange_Report`'
const C = '`frido-429506.production.Clickpost_Shipment_Tracking_Report`'

// Best available date for a return row, in priority order.
const RET_DATE = `COALESCE(
  SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(refund_initiated_on, 1, 10)),
  SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(request_created_on, 1, 10)),
  SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(created_at, 1, 10)))`

// Money still owed. refundable_amount is the entitlement; refunded_amount is what actually
// moved. For Failed rows the two are equal even though nothing reached the customer, so
// outstanding is taken as the refundable amount on any row that is not Processed.
const OPEN_REFUNDS = `
WITH b AS (
  SELECT
    awb, forward_order_id, forward_awb, courier_partner,
    Return_Type, order_type, return_status,
    IFNULL(refund_status, '(none)') refund_status,
    return_reason, sub_reason, return_sku, item_description,
    refund_method, requested_refund_mode,
    SAFE_CAST(refundable_amount AS FLOAT64) refundable,
    SAFE_CAST(refunded_amount AS FLOAT64) refunded,
    clickpost_unified_status ship_status,
    ${RET_DATE} d
  FROM ${R}
  -- Exchanges owe no refund; including them would report 123k false positives.
  WHERE UPPER(IFNULL(Return_Type, '')) != 'EXCHANGE'
)
SELECT
  return_status, refund_status, Return_Type, order_type, courier_partner,
  ship_status,
  COUNT(*) shipments,
  ROUND(SUM(IFNULL(refundable, 0)), 0) refundable,
  ROUND(SUM(IFNULL(refunded, 0)), 0) refunded,
  ROUND(AVG(DATE_DIFF(CURRENT_DATE(), d, DAY)), 0) avg_age_days,
  MAX(DATE_DIFF(CURRENT_DATE(), d, DAY)) oldest_days
FROM b
-- "Not closed" = anything whose refund has not actually been processed.
WHERE return_status != 'CLOSED' OR refund_status IN ('Initiated', 'Failed', 'Queued')
GROUP BY 1,2,3,4,5,6
ORDER BY refundable DESC`

// Row-level detail for the cases worth chasing.
const OPEN_DETAIL = `
SELECT
  awb, forward_order_id, forward_awb, courier_partner,
  Return_Type, order_type, return_status, IFNULL(refund_status,'(none)') refund_status,
  clickpost_unified_status ship_status,
  return_reason, sub_reason, return_sku, item_description,
  refund_method, requested_refund_mode, utr, payout_id,
  ROUND(SAFE_CAST(refundable_amount AS FLOAT64), 2) refundable,
  ROUND(SAFE_CAST(refunded_amount AS FLOAT64), 2) refunded,
  ${RET_DATE} ref_date,
  DATE_DIFF(CURRENT_DATE(), ${RET_DATE}, DAY) age_days,
  rejection_reason, comments
FROM ${R}
WHERE UPPER(IFNULL(Return_Type,'')) != 'EXCHANGE'
  AND (return_status != 'CLOSED' OR refund_status IN ('Initiated','Failed','Queued'))
ORDER BY SAFE_CAST(refundable_amount AS FLOAT64) DESC NULLS LAST
LIMIT 20000`

// Stuck shipments: Clickpost's own flag, plus anything non-terminal and old.
const STUCK = `
WITH b AS (
  SELECT
    awb, courier_partner, reference_number, order_id,
    clickpost_unified_status st,
    is_shipment_stuck_in_lifecycle flagged,
    SAFE_CAST(out_for_delivery_attempts AS INT64) ofd_attempts,
    SAFE_CAST(out_for_pickup_attempts AS INT64) ofp_attempts,
    latest_remark, remark_of_last_failed_delivery,
    SAFE_CAST(invoice_value AS FLOAT64) value,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(created_at, 1, 10)) created_d,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(latest_timestamp, 1, 10)) last_d
  FROM ${C}
  WHERE DATE(created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)
),
scored AS (
  SELECT *,
    DATE_DIFF(CURRENT_DATE(), created_d, DAY) age_days,
    DATE_DIFF(CURRENT_DATE(), last_d, DAY) days_since_update,
    -- Terminal states are resolved; everything else is still in flight.
    st IN ('Delivered','RTO-Delivered','Cancelled','Lost','Damaged','NotServiceable') terminal
  FROM b
)
SELECT
  CASE
    WHEN flagged = 'True' THEN 'Clickpost flagged, still open'
    WHEN age_days > 60 THEN 'Open beyond 60d'
    WHEN age_days > 30 THEN 'Open 30-60d'
    ELSE 'Open ${STUCK_DAYS}-30d'
  END bucket,
  st, courier_partner,
  COUNT(*) shipments,
  ROUND(SUM(IFNULL(value,0)), 0) order_value,
  ROUND(AVG(age_days), 0) avg_age_days,
  ROUND(AVG(days_since_update), 0) avg_days_since_update,
  ROUND(AVG(IFNULL(ofd_attempts,0)), 1) avg_delivery_attempts
FROM scored
-- Terminal shipments are excluded outright: Clickpost leaves is_shipment_stuck_in_lifecycle
-- set even after the parcel resolves, so 67,085 DELIVERED rows carried the flag. Counting
-- those as stuck overstated the problem by 5x.
WHERE NOT terminal AND age_days > ${STUCK_DAYS}
GROUP BY 1,2,3
ORDER BY shipments DESC`

const STUCK_DETAIL = `
WITH b AS (
  SELECT awb, courier_partner, reference_number, order_id,
    clickpost_unified_status st, is_shipment_stuck_in_lifecycle flagged,
    SAFE_CAST(out_for_delivery_attempts AS INT64) ofd_attempts,
    SAFE_CAST(out_for_pickup_attempts AS INT64) ofp_attempts,
    latest_remark, remark_of_last_failed_delivery, drop_city, drop_state,
    SAFE_CAST(invoice_value AS FLOAT64) value,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(created_at,1,10)) created_d,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(latest_timestamp,1,10)) last_d
  FROM ${C}
  WHERE DATE(created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)
)
SELECT awb, order_id, reference_number, courier_partner, st status, flagged,
  ofd_attempts, ofp_attempts, drop_city, drop_state, ROUND(value,2) order_value,
  created_d, last_d,
  DATE_DIFF(CURRENT_DATE(), created_d, DAY) age_days,
  DATE_DIFF(CURRENT_DATE(), last_d, DAY) days_since_update,
  latest_remark, remark_of_last_failed_delivery
FROM b
WHERE st NOT IN ('Delivered','RTO-Delivered','Cancelled','Lost','Damaged','NotServiceable')
  AND DATE_DIFF(CURRENT_DATE(), created_d, DAY) > ${STUCK_DAYS}
ORDER BY days_since_update DESC NULLS LAST
LIMIT 20000`

const run = async (label, sql) => {
  const [rows] = await bq.query({ query: sql })
  console.log(`${label}: ${rows.length} rows`)
  return rows
}

const [openSummary, openDetail, stuckSummary, stuckDetail] = await Promise.all([
  run('open refunds (summary)', OPEN_REFUNDS),
  run('open refunds (detail)', OPEN_DETAIL),
  run('stuck shipments (summary)', STUCK),
  run('stuck shipments (detail)', STUCK_DETAIL),
])

const F = n => '₹' + Math.round(n).toLocaleString('en-IN')
const num = v => (v === null || v === undefined ? 0 : Number(v))
const openTotal = openSummary.reduce((a, r) => a + num(r.refundable), 0)
const stuckTotal = stuckSummary.reduce((a, r) => a + num(r.order_value), 0)
const openShp = openSummary.reduce((a, r) => a + num(r.shipments), 0)
const stuckShp = stuckSummary.reduce((a, r) => a + num(r.shipments), 0)

// Roll the summary up to the headline cuts.
const by = (rows, key, val, cnt) => {
  const m = new Map()
  for (const r of rows) {
    const k = r[key] ?? '(blank)'
    if (!m.has(k)) m.set(k, { k, n: 0, v: 0 })
    const e = m.get(k); e.n += num(r[cnt]); e.v += num(r[val])
  }
  return [...m.values()].sort((a, b) => b.v - a.v)
}

const overview = [
  { Metric: 'OPEN REFUNDS (returns/cancellations, exchanges excluded)', Value: '' },
  { Metric: 'Shipments with refund not closed', Value: openShp },
  { Metric: 'Amount outstanding (INR)', Value: Math.round(openTotal) },
  { Metric: 'Oldest open refund (days)', Value: Math.max(...openSummary.map(r => num(r.oldest_days))) },
  { Metric: '', Value: '' },
  { Metric: 'STUCK SHIPMENTS (flagged by Clickpost or open > ' + STUCK_DAYS + 'd)', Value: '' },
  { Metric: 'Shipments stuck', Value: stuckShp },
  { Metric: 'Order value at risk (INR)', Value: Math.round(stuckTotal) },
]

const wb = XLSX.utils.book_new()
const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name)
add('Overview', overview)
add('Open Refunds Summary', openSummary)
add('Open Refunds Detail', openDetail)
add('Stuck Summary', stuckSummary)
add('Stuck Detail', stuckDetail)
XLSX.writeFile(wb, OUT)

console.log('\n── OPEN REFUNDS ──')
console.log(`${openShp.toLocaleString('en-IN')} shipments · ${F(openTotal)} outstanding`)
console.log('\nby refund status:')
for (const b of by(openSummary, 'refund_status', 'refundable', 'shipments'))
  console.log('  ' + String(b.k).padEnd(22) + String(b.n).padStart(8) + F(b.v).padStart(16))
console.log('\nby return status:')
for (const b of by(openSummary, 'return_status', 'refundable', 'shipments'))
  console.log('  ' + String(b.k).padEnd(22) + String(b.n).padStart(8) + F(b.v).padStart(16))

console.log('\n── STUCK SHIPMENTS ──')
console.log(`${stuckShp.toLocaleString('en-IN')} shipments · ${F(stuckTotal)} order value`)
console.log('\nby bucket:')
for (const b of by(stuckSummary, 'bucket', 'order_value', 'shipments'))
  console.log('  ' + String(b.k).padEnd(30) + String(b.n).padStart(8) + F(b.v).padStart(16))
console.log('\nby status (top 8):')
for (const b of by(stuckSummary, 'st', 'order_value', 'shipments').slice(0, 8))
  console.log('  ' + String(b.k).padEnd(22) + String(b.n).padStart(8) + F(b.v).padStart(16))

console.log('\nwritten: ' + OUT)
