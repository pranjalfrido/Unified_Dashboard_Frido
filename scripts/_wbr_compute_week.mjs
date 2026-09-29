// Computes one WBR week's full metric set, using the exact methodology confirmed for weeks 23-26:
// IST timezone handling for all Clickpost timestamp diffs, CPD = OrderDate+5d, RTO booked to
// ship-week, NDR = 1st-attempt-failed, Pickup->Refund excludes orders with no refund on file,
// Returns/Exchange as single tracked cohorts (order-date and _EX-order-id respectively).
// Usage: node scripts/_wbr_compute_week.mjs <week_no> <start YYYY-MM-DD> <end YYYY-MM-DD>
import { BigQuery } from '@google-cloud/bigquery'
import { writeFileSync } from 'fs'
const bq = new BigQuery({ keyFilename: 'sa_key.json', projectId: 'frido-429506' })

const [, , WK, START, END] = process.argv
if (!WK || !START || !END) {
  console.error('Usage: node scripts/_wbr_compute_week.mjs <week_no> <start> <end>')
  process.exit(1)
}

async function q(sql) {
  const [rows] = await bq.query({ query: sql, maximumBytesBilled: '30000000000' })
  return rows
}
function percentile(sortedArr, p) {
  if (!sortedArr.length) return null
  const idx = Math.min(sortedArr.length - 1, Math.floor(p * sortedArr.length))
  return sortedArr[idx]
}

const w = { wk: parseInt(WK), start: START, end: END }
const r = {}
console.log(`=== Week ${w.wk}: ${w.start} to ${w.end} ===`)

const volRows = await q(`
  SELECT
    COUNT(DISTINCT OrderId) AS orders_placed,
    COUNT(DISTINCT CASE WHEN Dispatch_Date IS NOT NULL THEN OrderId END) AS orders_shipped,
    COUNT(DISTINCT CASE WHEN Dispatch_Date IS NOT NULL AND payment_type='COD' THEN OrderId END) AS cod_shipped
  FROM \`frido-429506.production.fact_all_platform_sales_report\`
  WHERE Channel='Shopify' AND OrderDate BETWEEN '${w.start}' AND '${w.end}' AND NOT (OrderId LIKE '%_EX%')
`)
r.volume = volRows[0]
console.log('Volume:', r.volume)

const promiseRows = await q(`
  WITH orders AS (
    SELECT OrderId, OrderDate, Order_Status
    FROM \`frido-429506.production.fact_all_platform_sales_report\`
    WHERE Channel='Shopify' AND OrderDate BETWEEN '${w.start}' AND '${w.end}' AND NOT (OrderId LIKE '%_EX%')
    GROUP BY OrderId, OrderDate, Order_Status
  ),
  cp AS (
    SELECT order_id, MIN(TIMESTAMP(delivery_date, 'Asia/Kolkata')) AS delivery_ts, MIN(rto_mark_date) AS rto_mark_date
    FROM \`frido-429506.production.Clickpost_Shipment_Tracking_Report\`
    WHERE shipment_type='Forward' AND channel_name='SHOPIFY'
    GROUP BY order_id
  )
  SELECT
    COUNT(DISTINCT o.OrderId) AS cohort_orders,
    COUNT(DISTINCT CASE WHEN cp.delivery_ts IS NOT NULL THEN o.OrderId END) AS delivered,
    COUNT(DISTINCT CASE WHEN cp.delivery_ts IS NOT NULL AND DATE(cp.delivery_ts, 'Asia/Kolkata') <= DATE_ADD(o.OrderDate, INTERVAL 5 DAY) THEN o.OrderId END) AS delivered_on_or_before_cpd,
    COUNT(DISTINCT CASE WHEN o.Order_Status='RTO' OR cp.rto_mark_date IS NOT NULL THEN o.OrderId END) AS rto,
    COUNT(DISTINCT CASE WHEN o.Order_Status='Cancelled' THEN o.OrderId END) AS cancelled
  FROM orders o LEFT JOIN cp ON o.OrderId = cp.order_id
`)
r.promise = promiseRows[0]
console.log('Promise adherence (cohort):', r.promise)

const breachRows = await q(`
  WITH orders AS (
    SELECT OrderId, OrderDate
    FROM \`frido-429506.production.fact_all_platform_sales_report\`
    WHERE Channel='Shopify' AND OrderDate BETWEEN '${w.start}' AND '${w.end}' AND NOT (OrderId LIKE '%_EX%')
    GROUP BY OrderId, OrderDate
  ),
  cp AS (
    SELECT order_id, MIN(TIMESTAMP(delivery_date, 'Asia/Kolkata')) AS delivery_ts
    FROM \`frido-429506.production.Clickpost_Shipment_Tracking_Report\`
    WHERE shipment_type='Forward' AND channel_name='SHOPIFY'
    GROUP BY order_id
  ),
  joined AS (
    SELECT o.OrderId,
      DATE_DIFF(DATE(cp.delivery_ts, 'Asia/Kolkata'), DATE_ADD(o.OrderDate, INTERVAL 5 DAY), DAY) AS breach_days
    FROM orders o JOIN cp ON o.OrderId = cp.order_id
    WHERE cp.delivery_ts IS NOT NULL
  )
  SELECT
    COUNT(*) AS delivered,
    COUNTIF(breach_days = 1) AS d_plus_1,
    COUNTIF(breach_days = 2) AS d_plus_2,
    COUNTIF(breach_days BETWEEN 3 AND 5) AS d_plus_3_5,
    COUNTIF(breach_days > 5) AS d_plus_5_beyond,
    COUNTIF(breach_days <= 0) AS on_time
  FROM joined
`)
r.breach = breachRows[0]
console.log('Forward breach depth:', r.breach)

const opViewRows = await q(`
  WITH cp AS (
    SELECT order_id, MIN(TIMESTAMP(delivery_date, 'Asia/Kolkata')) AS delivery_ts, MIN(order_date) AS cp_order_date
    FROM \`frido-429506.production.Clickpost_Shipment_Tracking_Report\`
    WHERE shipment_type='Forward' AND channel_name='SHOPIFY'
    GROUP BY order_id
  )
  SELECT
    COUNT(DISTINCT order_id) AS delivered_this_week,
    COUNT(DISTINCT CASE WHEN cp_order_date IS NOT NULL AND DATE(delivery_ts, 'Asia/Kolkata') <= DATE_ADD(DATE(cp_order_date), INTERVAL 5 DAY) THEN order_id END) AS on_or_before_promise
  FROM cp
  WHERE DATE(delivery_ts, 'Asia/Kolkata') BETWEEN '${w.start}' AND '${w.end}'
`)
r.opView = opViewRows[0]
console.log('Operational view:', r.opView)

const availRows = await q(`
  SELECT
    COUNT(DISTINCT order_id) AS orders_with_data,
    COUNT(DISTINCT CASE WHEN DATE_DIFF(DATE(created_at), DATE(order_date), DAY) <= 2 THEN order_id END) AS available
  FROM \`frido-429506.production.Clickpost_Shipment_Tracking_Report\`
  WHERE shipment_type='Forward' AND channel_name='SHOPIFY' AND order_date IS NOT NULL
    AND DATE(order_date) BETWEEN '${w.start}' AND '${w.end}'
`)
r.availability = availRows[0]
console.log('Availability proxy:', r.availability)

const dispatchRows = await q(`
  SELECT TIMESTAMP_DIFF(TIMESTAMP(pickup_date,'Asia/Kolkata'), TIMESTAMP(created_at,'Asia/Kolkata'), MINUTE)/60.0 AS tat_hrs
  FROM \`frido-429506.production.Clickpost_Shipment_Tracking_Report\`
  WHERE shipment_type='Forward' AND channel_name='SHOPIFY' AND pickup_date IS NOT NULL AND created_at IS NOT NULL
    AND DATE(TIMESTAMP(pickup_date,'Asia/Kolkata'), 'Asia/Kolkata') BETWEEN '${w.start}' AND '${w.end}'
`)
const dispatchTats = dispatchRows.map(x => parseFloat(x.tat_hrs)).filter(v => v != null && !isNaN(v) && v >= 0).sort((a,b)=>a-b)
r.dispatchTat = { count: dispatchTats.length, median: percentile(dispatchTats, 0.5), p90: percentile(dispatchTats, 0.9) }
console.log('Dispatch TAT:', r.dispatchTat)

const dispatchBreach = { d1: 0, d2: 0, d35: 0, d5plus: 0, total: dispatchTats.length }
dispatchTats.forEach(h => {
  const breachHrs = h - 24
  if (breachHrs <= 0) return
  const breachDays = breachHrs / 24
  if (breachDays <= 1) dispatchBreach.d1++
  else if (breachDays <= 2) dispatchBreach.d2++
  else if (breachDays <= 5) dispatchBreach.d35++
  else dispatchBreach.d5plus++
})
r.dispatchBreach = dispatchBreach
console.log('Dispatch breach depth:', dispatchBreach)

const transitRows = await q(`
  SELECT
    TIMESTAMP_DIFF(TIMESTAMP(delivery_date,'Asia/Kolkata'), TIMESTAMP(pickup_date,'Asia/Kolkata'), MINUTE)/1440.0 AS tat_days,
    DATE_DIFF(DATE(TIMESTAMP(delivery_date,'Asia/Kolkata'), 'Asia/Kolkata'), DATE(expected_delivery_date_by_courier_partner), DAY) AS vs_edd_days
  FROM \`frido-429506.production.Clickpost_Shipment_Tracking_Report\`
  WHERE shipment_type='Forward' AND channel_name='SHOPIFY' AND delivery_date IS NOT NULL AND pickup_date IS NOT NULL
    AND DATE(TIMESTAMP(delivery_date,'Asia/Kolkata'), 'Asia/Kolkata') BETWEEN '${w.start}' AND '${w.end}'
`)
const transitTats = transitRows.map(x => parseFloat(x.tat_days)).filter(v => v != null && !isNaN(v) && v >= 0).sort((a,b)=>a-b)
r.transitTat = { count: transitTats.length, median: percentile(transitTats, 0.5), p90: percentile(transitTats, 0.9) }
console.log('Transit TAT:', r.transitTat)

const vsEdd = transitRows.map(x => x.vs_edd_days).filter(v => v != null)
const transitBreach = { total: vsEdd.length, onTime: 0, d1:0, d2:0, d35:0, d5plus:0 }
vsEdd.forEach(d => {
  if (d <= 0) { transitBreach.onTime++; return }
  if (d === 1) transitBreach.d1++
  else if (d === 2) transitBreach.d2++
  else if (d >= 3 && d <= 5) transitBreach.d35++
  else if (d > 5) transitBreach.d5plus++
})
r.transitBreach = transitBreach
console.log('Transit breach vs EDD:', transitBreach)

const rtoRows = await q(`
  WITH ships AS (
    SELECT cp.order_id, cp.created_at, cp.rto_mark_date, f.payment_type
    FROM \`frido-429506.production.Clickpost_Shipment_Tracking_Report\` cp
    JOIN \`frido-429506.production.fact_all_platform_sales_report\` f ON cp.order_id = f.OrderId
    WHERE cp.shipment_type='Forward' AND cp.channel_name='SHOPIFY'
      AND DATE(cp.created_at) BETWEEN '${w.start}' AND '${w.end}'
    GROUP BY cp.order_id, cp.created_at, cp.rto_mark_date, f.payment_type
  )
  SELECT
    COUNT(DISTINCT order_id) AS shipped,
    COUNT(DISTINCT CASE WHEN payment_type='COD' THEN order_id END) AS shipped_cod,
    COUNT(DISTINCT CASE WHEN payment_type!='COD' THEN order_id END) AS shipped_prepaid,
    COUNT(DISTINCT CASE WHEN rto_mark_date IS NOT NULL AND payment_type='COD' THEN order_id END) AS rto_cod,
    COUNT(DISTINCT CASE WHEN rto_mark_date IS NOT NULL AND payment_type!='COD' THEN order_id END) AS rto_prepaid
  FROM ships
`)
r.rto = rtoRows[0]
console.log('RTO (ship-week basis):', r.rto)

const firstAttemptRows = await q(`
  SELECT
    COUNT(DISTINCT order_id) AS delivered_this_week,
    COUNT(DISTINCT CASE WHEN CAST(out_for_delivery_attempts AS INT64) <= 1 THEN order_id END) AS first_attempt_success
  FROM \`frido-429506.production.Clickpost_Shipment_Tracking_Report\`
  WHERE shipment_type='Forward' AND channel_name='SHOPIFY' AND delivery_date IS NOT NULL
    AND DATE(TIMESTAMP(delivery_date,'Asia/Kolkata'), 'Asia/Kolkata') BETWEEN '${w.start}' AND '${w.end}'
    AND SAFE_CAST(out_for_delivery_attempts AS INT64) IS NOT NULL
`)
r.firstAttempt = firstAttemptRows[0]
console.log('First attempt success:', r.firstAttempt)

const ndrRows = await q(`
  SELECT
    order_id, delivery_date, rto_mark_date,
    SAFE_CAST(out_for_delivery_attempts AS INT64) AS attempts,
    pickup_date, created_at,
    TIMESTAMP_DIFF(TIMESTAMP(delivery_date,'Asia/Kolkata'), TIMESTAMP(pickup_date,'Asia/Kolkata'), MINUTE)/1440.0 AS ndr_tat_days
  FROM \`frido-429506.production.Clickpost_Shipment_Tracking_Report\`
  WHERE shipment_type='Forward' AND channel_name='SHOPIFY'
    AND DATE(created_at) BETWEEN '${w.start}' AND '${w.end}'
    AND SAFE_CAST(out_for_delivery_attempts AS INT64) >= 1
`)
const ndrOrders = ndrRows.filter(x => (x.attempts || 0) >= 2)
const attemptBuckets = { attempt2: 0, attempt3: 0, attempt4plus: 0, neverDelivered: 0 }
ndrOrders.forEach(x => {
  if (!x.delivery_date) { attemptBuckets.neverDelivered++; return }
  const a = x.attempts
  if (a === 2) attemptBuckets.attempt2++
  else if (a === 3) attemptBuckets.attempt3++
  else attemptBuckets.attempt4plus++
})
const ndrTats = ndrOrders.filter(x => x.delivery_date && x.pickup_date && x.ndr_tat_days != null && x.ndr_tat_days >= 0)
  .map(x => parseFloat(x.ndr_tat_days)).sort((a,b)=>a-b)
r.ndr = {
  totalShipmentsWithAttemptData: ndrRows.length,
  ndrCount: ndrOrders.length, attemptBuckets,
  ndrShipmentsTat: { count: ndrTats.length, median: percentile(ndrTats, 0.5), p90: percentile(ndrTats, 0.9) }
}
console.log('NDR:', JSON.stringify(r.ndr))

const rcRows = await q(`
  SELECT
    TIMESTAMP_DIFF(TIMESTAMP(pickup_date,'Asia/Kolkata'), TIMESTAMP(created_at,'Asia/Kolkata'), MINUTE)/60.0 AS tat_hrs,
    pickup_date
  FROM \`frido-429506.production.Clickpost_Shipment_Tracking_Report\`
  WHERE shipment_type='Reverse' AND DATE(created_at) BETWEEN '${w.start}' AND '${w.end}'
`)
const rcTotal = rcRows.length
const rcWithPickup = rcRows.filter(x => x.pickup_date)
const rcTats = rcWithPickup.map(x => parseFloat(x.tat_hrs)).filter(v => v != null && !isNaN(v) && v >= 0).sort((a,b)=>a-b)
const rcBuckets = { d0:0, d1:0, d2:0, d35:0, d5plus:0 }
rcTats.forEach(h => {
  const days = h / 24
  if (days <= 0) rcBuckets.d0++
  else if (days <= 1) rcBuckets.d1++
  else if (days <= 2) rcBuckets.d2++
  else if (days <= 5) rcBuckets.d35++
  else rcBuckets.d5plus++
})
r.reversePickup = { total: rcTotal, pickedUp: rcWithPickup.length, tat: { count: rcTats.length, median: percentile(rcTats,0.5), p90: percentile(rcTats,0.9) }, buckets: rcBuckets }
console.log('Reverse pickup [RC2P]:', JSON.stringify(r.reversePickup))

const pickupRefundRows = await q(`
  WITH rev AS (
    SELECT order_id, MIN(TIMESTAMP(pickup_date, 'Asia/Kolkata')) AS pickup_ts
    FROM \`frido-429506.production.Clickpost_Shipment_Tracking_Report\`
    WHERE shipment_type='Reverse' AND pickup_date IS NOT NULL
      AND DATE(pickup_date) BETWEEN '${w.start}' AND '${w.end}'
    GROUP BY order_id
  ),
  refund AS (
    SELECT forward_order_id, MIN(TIMESTAMP(refund_processed_on)) AS refund_ts
    FROM \`frido-429506.production.stg_clickpost_returns_exchange\`
    WHERE refund_status = 'Processed'
    GROUP BY forward_order_id
  )
  SELECT rev.order_id,
    TIMESTAMP_DIFF(refund.refund_ts, rev.pickup_ts, MINUTE)/1440.0 AS diff_days,
    refund.refund_ts IS NOT NULL AS has_refund
  FROM rev LEFT JOIN refund ON rev.order_id = refund.forward_order_id
`)
const pickedUpTotal = pickupRefundRows.length
const withRefund = pickupRefundRows.filter(x => x.has_refund && x.diff_days != null)
const prBuckets = { d0:0, d1:0, d2:0, d35:0, d5plus:0 }
const prDays = []
withRefund.forEach(x => {
  const days = parseFloat(x.diff_days)
  if (days < 0) return
  prDays.push(days)
  if (days <= 0) prBuckets.d0++
  else if (days <= 1) prBuckets.d1++
  else if (days <= 2) prBuckets.d2++
  else if (days <= 5) prBuckets.d35++
  else prBuckets.d5plus++
})
prDays.sort((a,b)=>a-b)
r.pickupToRefund = { pickedUpTotal, refundedCount: prDays.length, buckets: prBuckets, tat: { median: percentile(prDays, 0.5), p90: percentile(prDays, 0.9) } }
console.log('Pickup->Refund:', JSON.stringify(r.pickupToRefund))

// Returns (single cohort, order-date basis, tracked forward) -- includes both fixes from the start
const returnsRows = await q(`
  WITH cir AS (
    SELECT DISTINCT OrderId
    FROM \`frido-429506.production.fact_all_platform_sales_report\`
    WHERE Channel='Shopify' AND Order_Status='CIR' AND OrderDate BETWEEN '${w.start}' AND '${w.end}'
      AND NOT (OrderId LIKE '%_EX%')
  ),
  re AS (
    SELECT forward_order_id,
      MIN(shipment_picked_up_on) AS picked_up_on,
      MIN(CASE WHEN refund_status='Processed' THEN refund_processed_on END) AS refund_processed_on
    FROM \`frido-429506.production.stg_clickpost_returns_exchange\`
    WHERE Return_Type = 'Return'
    GROUP BY forward_order_id
  )
  SELECT
    COUNT(DISTINCT cir.OrderId) AS returns_initiated,
    COUNT(DISTINCT CASE WHEN re.picked_up_on IS NOT NULL THEN cir.OrderId END) AS picked_up,
    COUNT(DISTINCT CASE WHEN re.refund_processed_on IS NOT NULL THEN cir.OrderId END) AS refunded
  FROM cir LEFT JOIN re ON cir.OrderId = re.forward_order_id
`)
r.returnsCohort = returnsRows[0]
console.log('Returns (true cohort):', r.returnsCohort)

const returnCancelledRows = await q(`
  WITH cir AS (
    SELECT DISTINCT OrderId
    FROM \`frido-429506.production.fact_all_platform_sales_report\`
    WHERE Channel='Shopify' AND Order_Status='CIR' AND OrderDate BETWEEN '${w.start}' AND '${w.end}'
      AND NOT (OrderId LIKE '%_EX%')
  ),
  re AS (
    SELECT forward_order_id, MAX(CASE WHEN return_status='SUCCESS' THEN 1 ELSE 0 END) AS was_cancelled
    FROM \`frido-429506.production.stg_clickpost_returns_exchange\`
    WHERE Return_Type = 'Return'
    GROUP BY forward_order_id
  )
  SELECT COUNT(DISTINCT cir.OrderId) AS cancelled
  FROM cir JOIN re ON cir.OrderId = re.forward_order_id
  WHERE re.was_cancelled = 1
`)
r.returnsCancelled = returnCancelledRows[0].cancelled
console.log('Return Cancelled:', r.returnsCancelled)

// Exchange (_EX order-id cohort throughout)
const exRows = await q(`
  WITH ex AS (
    SELECT OrderId, OrderDate, Order_Status
    FROM \`frido-429506.production.fact_all_platform_sales_report\`
    WHERE Channel='Shopify' AND OrderId LIKE '%_EX%' AND OrderDate BETWEEN '${w.start}' AND '${w.end}'
    GROUP BY OrderId, OrderDate, Order_Status
  ),
  cp AS (
    SELECT order_id, MIN(TIMESTAMP(delivery_date, 'Asia/Kolkata')) AS delivery_ts, MIN(rto_mark_date) AS rto_mark_date
    FROM \`frido-429506.production.Clickpost_Shipment_Tracking_Report\`
    WHERE shipment_type='Forward' AND channel_name='SHOPIFY'
    GROUP BY order_id
  )
  SELECT
    COUNT(DISTINCT ex.OrderId) AS initiated,
    COUNT(DISTINCT CASE WHEN cp.delivery_ts IS NOT NULL THEN ex.OrderId END) AS delivered,
    COUNT(DISTINCT CASE WHEN cp.delivery_ts IS NOT NULL AND DATE(cp.delivery_ts, 'Asia/Kolkata') <= DATE_ADD(ex.OrderDate, INTERVAL 5 DAY) THEN ex.OrderId END) AS delivered_on_or_before_cpd,
    COUNT(DISTINCT CASE WHEN cp.rto_mark_date IS NOT NULL THEN ex.OrderId END) AS rto,
    COUNT(DISTINCT CASE WHEN ex.Order_Status='Cancelled' THEN ex.OrderId END) AS cancelled
  FROM ex LEFT JOIN cp ON ex.OrderId = cp.order_id
`)
r.exchangeCohort = exRows[0]
console.log('Exchange (_EX cohort):', r.exchangeCohort)

const OUT = `C:/Users/SURAJS~1/AppData/Local/Temp/claude/c--Users-SurajSingh-OneDrive---Arcatron-Mobility-Pvt-Ltd-Desktop-mis02-Unified-Dashboard-Frido/bb76bf7d-ce9a-4d7d-9b9c-32de4e425b2f/scratchpad/wbr_week${w.wk}.json`
writeFileSync(OUT, JSON.stringify(r, null, 2))
console.log('\nSaved to', OUT)
