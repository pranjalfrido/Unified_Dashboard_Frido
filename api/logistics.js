import { getBQ } from './_bq.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { start, end, courier, shipmentType, sddNdd, paymentMode, zone, pickupState, dropState, dropCity, category, subCategory } = req.body
  if (!start || !end) return res.status(400).json({ error: 'Missing start or end' })

  // NDD split: show Delhivery NDD as separate row when Forward selected OR NDD chip selected
  const nddSelected = courier?.includes('Delhivery NDD')
  const splitNDD = true

  const filters = []
  if (courier?.length) {
    const COURIER_LIKE = {
      'Bluedart':        `LOWER(c.courier_partner) LIKE '%bluedart%'`,
      'Delhivery':       `(LOWER(c.courier_partner) LIKE '%delhivery%' AND LEFT(c.awb, 4) != '5448')`,
      'Delhivery NDD':   `(LOWER(c.courier_partner) LIKE '%delhivery%' AND LEFT(c.awb, 4) = '5448')`,
      'Ekart':           `LOWER(c.courier_partner) LIKE '%ekart%'`,
      'ElasticRun':      `LOWER(c.courier_partner) LIKE '%elastic%'`,
      'Safexpress':      `LOWER(c.courier_partner) LIKE '%safexpress%'`,
      'Shadowfax':       `LOWER(c.courier_partner) LIKE '%shadowfax%'`,
      'Shiprocket':      `LOWER(c.courier_partner) LIKE '%shiprocket%'`,
      'Skye Air':        `(LOWER(c.courier_partner) LIKE '%sky air%' OR LOWER(c.courier_partner) LIKE '%skye air%')`,
      'Swift':           `LOWER(c.courier_partner) LIKE '%swift%'`,
      'Urbane Bolt':     `(LOWER(c.courier_partner) LIKE '%urbane bolt%' OR LOWER(c.courier_partner) LIKE '%urbanbolt%')`,
    }
    const clauses = courier.map(v => COURIER_LIKE[v] || `LOWER(c.courier_partner) LIKE '%${v.toLowerCase().replace(/'/g, "\\'")}%'`)
    filters.push(`(${clauses.join(' OR ')})`)
  }
  if (shipmentType && shipmentType !== 'all') filters.push(`LOWER(TRIM(c.shipment_type)) = '${shipmentType.toLowerCase()}'`)
  if (sddNdd && sddNdd !== 'all') {
    if (sddNdd === 'SDD/NDD') filters.push(`SAFE_CAST(c.committed_sla AS INT64) <= 1`)
    else filters.push(`(c.committed_sla IS NULL OR SAFE_CAST(c.committed_sla AS INT64) > 1)`)
  }
  if (paymentMode) filters.push(`LOWER(c.payment_mode) = '${paymentMode.toLowerCase()}'`)
  if (zone) filters.push(`c.zone = '${zone.replace(/'/g, "\\'")}'`)
  if (pickupState) filters.push(`LOWER(c.pickup_state) = LOWER('${pickupState.replace(/'/g, "\\'")}')`  )
  if (dropState) filters.push(`LOWER(c.drop_state) = LOWER('${dropState.replace(/'/g, "\\'")}')`)
  if (dropCity) filters.push(`LOWER(c.drop_city) = LOWER('${dropCity.replace(/'/g, "\\'")}')`)
  if (category?.length) filters.push(`im.CategoryName IN (${category.map(v => `'${v.replace(/'/g, "\\'")}'`).join(',')})`)
  if (subCategory?.length) filters.push(`im.Sub_category IN (${subCategory.map(v => `'${v.replace(/'/g, "\\'")}'`).join(',')})`)

  const whereClause = filters.length ? `AND ${filters.join(' AND ')}` : ''

  const query = `
WITH base AS (
  SELECT
    c.awb,
    c.courier_partner,
    c.shipment_type,
    c.payment_mode,
    c.zone,
    c.pickup_city,
    c.pickup_state,
    c.drop_city,
    c.drop_state,
    c.clickpost_unified_status,
    CASE
      WHEN c.clickpost_unified_status = 'Delivered' THEN 'Delivered'
      WHEN c.clickpost_unified_status = 'NoStatusExist' AND LOWER(c.latest_remark) LIKE '%delivered%' THEN 'Delivered'
      WHEN c.clickpost_unified_status IN ('RTO-Marked','RTO-ShipmentDelay','RTO-InTransit','RTO-Delivered','RTO-Requested','RTO-ContactCustomerCare','RTO-OutForDelivery','RTO-Failed') THEN 'RTO'
      WHEN c.clickpost_unified_status = 'NoStatusExist' AND LOWER(c.latest_remark) LIKE '%rto%' THEN 'RTO'
      WHEN c.clickpost_unified_status IN ('PickupFailed','OutForPickup','PickupPending','OrderPlaced') THEN 'Pickup Pending'
      WHEN c.clickpost_unified_status IN ('ShipmentHeld','ContactCustomerCare','InTransit','DestinationHubIn','FailedDelivery','ShipmentDelayed','PickedUp','OutForDelivery','OriginCityOut','OriginCityIn') THEN 'Intransit'
      WHEN c.clickpost_unified_status = 'Cancelled' THEN 'Cancelled'
      WHEN c.clickpost_unified_status = 'Lost' THEN 'Lost'
      WHEN c.clickpost_unified_status = 'Damaged' THEN 'Damaged'
      WHEN c.clickpost_unified_status = 'NoStatusExist' THEN 'Undelivered'
      WHEN c.clickpost_unified_status = 'ReShippedOnNewWaybill' THEN 'Reshipped'
      WHEN c.clickpost_unified_status = 'NotServiceable' THEN 'Non-Serviceable'
      ELSE 'Others'
    END AS unified_status,
    CASE
      WHEN LOWER(c.courier_partner) LIKE '%bluedart%' THEN 'Bluedart'
      WHEN LOWER(c.courier_partner) LIKE '%ekart%' THEN 'Ekart'
      WHEN LOWER(c.courier_partner) LIKE '%elastic%' THEN 'ElasticRun'
      WHEN LOWER(c.courier_partner) LIKE '%delhivery%' AND LEFT(c.awb, 4) = '5448' AND ${splitNDD} THEN 'Delhivery NDD'
      WHEN LOWER(c.courier_partner) LIKE '%delhivery%' THEN 'Delhivery'
      WHEN LOWER(c.courier_partner) LIKE '%safexpress%' THEN 'Safexpress'
      WHEN LOWER(c.courier_partner) LIKE '%shadowfax%' THEN 'Shadowfax'
      WHEN LOWER(c.courier_partner) LIKE '%shiprocket%' THEN 'Shiprocket'
      WHEN LOWER(c.courier_partner) LIKE '%sky air%' OR LOWER(c.courier_partner) LIKE '%skye air%' THEN 'Skye Air'
      WHEN LOWER(c.courier_partner) LIKE '%swift%' THEN 'Swift'
      WHEN LOWER(c.courier_partner) LIKE '%urbane bolt%' OR LOWER(c.courier_partner) LIKE '%urbanbolt%' THEN 'Urbane Bolt'
      WHEN LOWER(c.courier_partner) LIKE '%wareiq%' THEN 'WareIQ'
      WHEN LOWER(c.courier_partner) LIKE '%zippee%' THEN 'Zippee'
      ELSE c.courier_partner
    END AS courier_group,
    SAFE_CAST(c.invoice_value AS FLOAT64) AS invoice_value,
    SAFE_CAST(c.committed_sla AS FLOAT64) AS committed_sla,
    SAFE_CAST(c.out_for_delivery_attempts AS INT64) AS ofd_attempts,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(c.created_at, 1, 10)) AS created_date,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(c.delivery_date, 1, 10)) AS delivery_date,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(c.expected_delivery_date_by_courier_partner, 1, 10)) AS edd,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(c.pickup_date, 1, 10)) AS pickup_date,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(c.rto_mark_date, 1, 10)) AS rto_mark_date,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(c.out_for_delivery_1st_attempt, 1, 10)) AS ofd1_date,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(c.order_date, 1, 10)) AS order_date,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(c.latest_timestamp, 1, 10)) AS latest_ts_date,
    SAFE.PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S', SUBSTR(c.created_at, 1, 19)) AS created_ts,
    SAFE.PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S', SUBSTR(c.pickup_date, 1, 19)) AS pickup_ts,
    SAFE.PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S', SUBSTR(c.delivery_date, 1, 19)) AS delivery_ts,
    c.reason_for_last_failed_delivery,
    c.latest_remark,
    c.channel_name,
    im.CategoryName AS category,
    im.Sub_category AS sub_category
  FROM \`frido-429506.production.Clickpost_Shipment_Tracking_Report\` c
  LEFT JOIN \`frido-429506.production.Unicommerce_Item_Master\` im
    ON TRIM(c.product_sku_code) = TRIM(im.ProductCode)
  WHERE SUBSTR(c.created_at, 1, 10) BETWEEN '${start}' AND '${end}'
  ${whereClause}
),
kpis AS (
  SELECT
    COUNT(awb) AS total_shipments,
    SUM(invoice_value) AS total_value,
    COUNTIF(unified_status = 'Delivered') AS delivered,
    COUNTIF(unified_status = 'RTO') AS rto,
    COUNTIF(unified_status = 'Intransit') AS in_transit,
    COUNTIF(unified_status = 'Pickup Pending') AS pickup_pending,
    COUNTIF(unified_status = 'Cancelled') AS cancelled,
    COUNTIF(unified_status IN ('Lost','Damaged')) AS lost_damaged,
    COUNTIF(delivery_date IS NOT NULL AND edd IS NOT NULL AND delivery_date <= edd) AS on_time,
    COUNTIF(delivery_date IS NOT NULL AND edd IS NOT NULL AND delivery_date > edd) AS sla_breach,
    COUNTIF(edd IS NOT NULL AND edd < DATE_SUB(CURRENT_DATE(), INTERVAL 5 DAY) AND delivery_date IS NULL AND unified_status = 'Intransit') AS critical_stuck,
    COUNTIF(rto_mark_date IS NOT NULL AND clickpost_unified_status NOT IN ('RTO-Delivered','Delivered') AND DATE_DIFF(CURRENT_DATE(), rto_mark_date, DAY) > 10) AS rto_10plus,
    COUNTIF(clickpost_unified_status NOT IN ('Delivered','RTO-Delivered') AND pickup_date IS NOT NULL AND edd IS NOT NULL AND CURRENT_DATE() > edd) AS edd_breached,
    COUNTIF(unified_status = 'RTO' AND COALESCE(ofd_attempts, 0) = 0) AS z_rto,
    COUNTIF(ofd_attempts = 1 AND unified_status = 'Delivered') AS delivered_1attempt,
    COUNTIF(ofd_attempts > 1 AND unified_status = 'Delivered') AS delivered_multi,
    COUNTIF(ofd_attempts IS NOT NULL AND ofd_attempts != 0) AS total_ofd_attempts,
    COUNTIF(unified_status = 'RTO' AND clickpost_unified_status NOT IN ('RTO-Delivered')) AS rto_undelivered,
    COUNTIF(ofd_attempts > 1 AND unified_status = 'RTO') AS delivered_2attempt_rto,
    ROUND(AVG(IF(pickup_ts IS NOT NULL AND delivery_ts IS NOT NULL AND TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) BETWEEN 0 AND 28800, TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) / 1440.0, NULL)), 2) AS avg_intransit,
    ROUND(AVG(IF(pickup_ts IS NOT NULL AND created_ts IS NOT NULL AND TIMESTAMP_DIFF(pickup_ts, created_ts, MINUTE) BETWEEN 0 AND 14400, TIMESTAMP_DIFF(pickup_ts, created_ts, MINUTE) / 1440.0, NULL)), 2) AS avg_pickup,
    ROUND(AVG(IF(delivery_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(delivery_date, order_date, DAY) BETWEEN 0 AND 20, DATE_DIFF(delivery_date, order_date, DAY), NULL)), 1) AS avg_fulfilment,
    ROUND(AVG(IF(clickpost_unified_status='RTO-Delivered' AND rto_mark_date IS NOT NULL AND latest_ts_date IS NOT NULL AND DATE_DIFF(latest_ts_date, rto_mark_date, DAY) BETWEEN 0 AND 20, DATE_DIFF(latest_ts_date, rto_mark_date, DAY), NULL)), 1) AS avg_rto_tat,
    ROUND(AVG(IF(ofd1_date IS NOT NULL AND pickup_date IS NOT NULL, DATE_DIFF(ofd1_date, pickup_date, DAY), NULL)), 1) AS avg_s2a,
    ROUND(AVG(IF(created_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(created_date, order_date, DAY) BETWEEN 0 AND 10, DATE_DIFF(created_date, order_date, DAY), NULL)), 1) AS avg_processing,
    ROUND(AVG(committed_sla), 1) AS avg_sla
  FROM base
),
by_courier AS (
  SELECT
    courier_group,
    COUNT(awb) AS total,
    COUNTIF(unified_status='Delivered') AS delivered,
    COUNTIF(unified_status='RTO') AS rto,
    COUNTIF(unified_status='Cancelled') AS cancelled,
    COUNTIF(unified_status='RTO' AND COALESCE(ofd_attempts,0)=0) AS z_rto,
    COUNTIF(ofd_attempts=1 AND unified_status='Delivered') AS d1,
    COUNTIF(ofd_attempts > 1 AND unified_status='Delivered') AS rasr_num,
    COUNTIF(ofd_attempts IS NOT NULL AND ofd_attempts != 0) AS ofd_total,
    ROUND(AVG(IF(pickup_ts IS NOT NULL AND delivery_ts IS NOT NULL AND TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) BETWEEN 0 AND 28800, TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) / 1440.0, NULL)), 2) AS avg_tat,
    ROUND(AVG(IF(pickup_ts IS NOT NULL AND delivery_ts IS NOT NULL AND TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) BETWEEN 0 AND 28800, TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) / 1440.0, NULL)), 2) AS avg_intransit_days,
    ROUND(AVG(IF(delivery_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(delivery_date, order_date, DAY) BETWEEN 0 AND 20, DATE_DIFF(delivery_date, order_date, DAY), NULL)), 2) AS avg_fulfilment_days,
    ROUND(AVG(IF(pickup_ts IS NOT NULL AND created_ts IS NOT NULL AND TIMESTAMP_DIFF(pickup_ts, created_ts, MINUTE) BETWEEN 0 AND 14400, TIMESTAMP_DIFF(pickup_ts, created_ts, MINUTE) / 1440.0, NULL)), 2) AS avg_pickup_days,
    ROUND(AVG(IF(created_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(created_date, order_date, DAY) BETWEEN 0 AND 10, DATE_DIFF(created_date, order_date, DAY), NULL)), 2) AS avg_processing_days,
    ROUND(AVG(IF(ofd1_date IS NOT NULL AND pickup_date IS NOT NULL, DATE_DIFF(ofd1_date, pickup_date, DAY), NULL)), 2) AS avg_s2a_days,
    ROUND(AVG(IF(clickpost_unified_status='RTO-Delivered' AND rto_mark_date IS NOT NULL AND latest_ts_date IS NOT NULL AND DATE_DIFF(latest_ts_date, rto_mark_date, DAY) BETWEEN 0 AND 20, DATE_DIFF(latest_ts_date, rto_mark_date, DAY), NULL)), 2) AS avg_rto_tat_days
  FROM base GROUP BY 1
),
by_courier_day AS (
  SELECT
    courier_group,
    FORMAT_DATE('%d %b', created_date) AS period_label,
    created_date AS period_dt,
    COUNT(awb) AS total,
    COUNTIF(unified_status='Delivered') AS delivered,
    COUNTIF(unified_status='RTO') AS rto,
    COUNTIF(unified_status='Cancelled') AS cancelled,
    COUNTIF(unified_status='RTO' AND COALESCE(ofd_attempts,0)=0) AS z_rto,
    COUNTIF(ofd_attempts=1 AND unified_status='Delivered') AS d1,
    COUNTIF(ofd_attempts > 1 AND unified_status='Delivered') AS rasr_num,
    COUNTIF(ofd_attempts IS NOT NULL AND ofd_attempts != 0) AS ofd_total,
    ROUND(AVG(IF(pickup_ts IS NOT NULL AND delivery_ts IS NOT NULL AND TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) BETWEEN 0 AND 28800, TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) / 1440.0, NULL)), 2) AS avg_intransit_days,
    ROUND(AVG(IF(delivery_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(delivery_date, order_date, DAY) BETWEEN 0 AND 20, DATE_DIFF(delivery_date, order_date, DAY), NULL)), 2) AS avg_fulfilment_days,
    ROUND(AVG(IF(pickup_ts IS NOT NULL AND created_ts IS NOT NULL AND TIMESTAMP_DIFF(pickup_ts, created_ts, MINUTE) BETWEEN 0 AND 14400, TIMESTAMP_DIFF(pickup_ts, created_ts, MINUTE) / 1440.0, NULL)), 2) AS avg_pickup_days,
    ROUND(AVG(IF(created_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(created_date, order_date, DAY) BETWEEN 0 AND 10, DATE_DIFF(created_date, order_date, DAY), NULL)), 2) AS avg_processing_days,
    ROUND(AVG(IF(ofd1_date IS NOT NULL AND pickup_date IS NOT NULL, DATE_DIFF(ofd1_date, pickup_date, DAY), NULL)), 2) AS avg_s2a_days,
    ROUND(AVG(IF(clickpost_unified_status='RTO-Delivered' AND rto_mark_date IS NOT NULL AND latest_ts_date IS NOT NULL AND DATE_DIFF(latest_ts_date, rto_mark_date, DAY) BETWEEN 0 AND 20, DATE_DIFF(latest_ts_date, rto_mark_date, DAY), NULL)), 2) AS avg_rto_tat_days
  FROM base WHERE created_date IS NOT NULL GROUP BY 1,2,3
),
by_courier_week AS (
  SELECT
    courier_group,
    FORMAT_DATE('W%V %Y', created_date) AS period_label,
    DATE_TRUNC(created_date, WEEK) AS period_dt,
    COUNT(awb) AS total,
    COUNTIF(unified_status='Delivered') AS delivered,
    COUNTIF(unified_status='RTO') AS rto,
    COUNTIF(unified_status='Cancelled') AS cancelled,
    COUNTIF(unified_status='RTO' AND COALESCE(ofd_attempts,0)=0) AS z_rto,
    COUNTIF(ofd_attempts=1 AND unified_status='Delivered') AS d1,
    COUNTIF(ofd_attempts > 1 AND unified_status='Delivered') AS rasr_num,
    COUNTIF(ofd_attempts IS NOT NULL AND ofd_attempts != 0) AS ofd_total,
    ROUND(AVG(IF(pickup_ts IS NOT NULL AND delivery_ts IS NOT NULL AND TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) BETWEEN 0 AND 28800, TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) / 1440.0, NULL)), 2) AS avg_intransit_days,
    ROUND(AVG(IF(delivery_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(delivery_date, order_date, DAY) BETWEEN 0 AND 20, DATE_DIFF(delivery_date, order_date, DAY), NULL)), 2) AS avg_fulfilment_days,
    ROUND(AVG(IF(pickup_ts IS NOT NULL AND created_ts IS NOT NULL AND TIMESTAMP_DIFF(pickup_ts, created_ts, MINUTE) BETWEEN 0 AND 14400, TIMESTAMP_DIFF(pickup_ts, created_ts, MINUTE) / 1440.0, NULL)), 2) AS avg_pickup_days,
    ROUND(AVG(IF(created_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(created_date, order_date, DAY) BETWEEN 0 AND 10, DATE_DIFF(created_date, order_date, DAY), NULL)), 2) AS avg_processing_days,
    ROUND(AVG(IF(ofd1_date IS NOT NULL AND pickup_date IS NOT NULL, DATE_DIFF(ofd1_date, pickup_date, DAY), NULL)), 2) AS avg_s2a_days,
    ROUND(AVG(IF(clickpost_unified_status='RTO-Delivered' AND rto_mark_date IS NOT NULL AND latest_ts_date IS NOT NULL AND DATE_DIFF(latest_ts_date, rto_mark_date, DAY) BETWEEN 0 AND 20, DATE_DIFF(latest_ts_date, rto_mark_date, DAY), NULL)), 2) AS avg_rto_tat_days
  FROM base WHERE created_date IS NOT NULL GROUP BY 1,2,3
),
by_courier_month AS (
  SELECT
    courier_group,
    FORMAT_DATE('%b-%y', created_date) AS month_label,
    DATE_TRUNC(created_date, MONTH) AS month_dt,
    COUNT(awb) AS total,
    COUNTIF(unified_status='Delivered') AS delivered,
    COUNTIF(unified_status='RTO') AS rto,
    COUNTIF(unified_status='Cancelled') AS cancelled,
    COUNTIF(unified_status='RTO' AND COALESCE(ofd_attempts,0)=0) AS z_rto,
    COUNTIF(ofd_attempts=1 AND unified_status='Delivered') AS d1,
    COUNTIF(ofd_attempts > 1 AND unified_status='Delivered') AS rasr_num,
    COUNTIF(ofd_attempts IS NOT NULL AND ofd_attempts != 0) AS ofd_total,
    ROUND(AVG(IF(pickup_ts IS NOT NULL AND delivery_ts IS NOT NULL AND TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) BETWEEN 0 AND 28800, TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) / 1440.0, NULL)), 2) AS avg_intransit_days,
    ROUND(AVG(IF(delivery_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(delivery_date, order_date, DAY) BETWEEN 0 AND 20, DATE_DIFF(delivery_date, order_date, DAY), NULL)), 2) AS avg_fulfilment_days,
    ROUND(AVG(IF(pickup_ts IS NOT NULL AND created_ts IS NOT NULL AND TIMESTAMP_DIFF(pickup_ts, created_ts, MINUTE) BETWEEN 0 AND 14400, TIMESTAMP_DIFF(pickup_ts, created_ts, MINUTE) / 1440.0, NULL)), 2) AS avg_pickup_days,
    ROUND(AVG(IF(created_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(created_date, order_date, DAY) BETWEEN 0 AND 10, DATE_DIFF(created_date, order_date, DAY), NULL)), 2) AS avg_processing_days,
    ROUND(AVG(IF(ofd1_date IS NOT NULL AND pickup_date IS NOT NULL, DATE_DIFF(ofd1_date, pickup_date, DAY), NULL)), 2) AS avg_s2a_days,
    ROUND(AVG(IF(clickpost_unified_status='RTO-Delivered' AND rto_mark_date IS NOT NULL AND latest_ts_date IS NOT NULL AND DATE_DIFF(latest_ts_date, rto_mark_date, DAY) BETWEEN 0 AND 20, DATE_DIFF(latest_ts_date, rto_mark_date, DAY), NULL)), 2) AS avg_rto_tat_days
  FROM base WHERE created_date IS NOT NULL GROUP BY 1,2,3
),
by_month_all AS (
  SELECT
    FORMAT_DATE('%b-%y', created_date) AS month_label,
    DATE_TRUNC(created_date, MONTH) AS month_dt,
    COUNT(awb) AS total,
    COUNTIF(unified_status='Delivered') AS delivered,
    COUNTIF(unified_status='RTO') AS rto,
    COUNTIF(unified_status='Cancelled') AS cancelled,
    COUNTIF(unified_status='RTO' AND COALESCE(ofd_attempts,0)=0) AS z_rto,
    COUNTIF(ofd_attempts=1 AND unified_status='Delivered') AS d1,
    COUNTIF(ofd_attempts > 1 AND unified_status='Delivered') AS rasr_num,
    COUNTIF(ofd_attempts IS NOT NULL AND ofd_attempts != 0) AS ofd_total,
    ROUND(AVG(IF(pickup_ts IS NOT NULL AND delivery_ts IS NOT NULL AND TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) BETWEEN 0 AND 28800, TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) / 1440.0, NULL)), 2) AS avg_intransit_days,
    ROUND(AVG(IF(delivery_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(delivery_date, order_date, DAY) BETWEEN 0 AND 20, DATE_DIFF(delivery_date, order_date, DAY), NULL)), 2) AS avg_fulfilment_days,
    ROUND(AVG(IF(pickup_ts IS NOT NULL AND created_ts IS NOT NULL AND TIMESTAMP_DIFF(pickup_ts, created_ts, MINUTE) BETWEEN 0 AND 14400, TIMESTAMP_DIFF(pickup_ts, created_ts, MINUTE) / 1440.0, NULL)), 2) AS avg_pickup_days,
    ROUND(AVG(IF(created_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(created_date, order_date, DAY) BETWEEN 0 AND 10, DATE_DIFF(created_date, order_date, DAY), NULL)), 2) AS avg_processing_days,
    ROUND(AVG(IF(ofd1_date IS NOT NULL AND pickup_date IS NOT NULL, DATE_DIFF(ofd1_date, pickup_date, DAY), NULL)), 2) AS avg_s2a_days,
    ROUND(AVG(IF(clickpost_unified_status='RTO-Delivered' AND rto_mark_date IS NOT NULL AND latest_ts_date IS NOT NULL AND DATE_DIFF(latest_ts_date, rto_mark_date, DAY) BETWEEN 0 AND 20, DATE_DIFF(latest_ts_date, rto_mark_date, DAY), NULL)), 2) AS avg_rto_tat_days
  FROM base WHERE created_date IS NOT NULL GROUP BY 1,2
),
by_status AS (
  SELECT unified_status, COUNT(awb) AS total FROM base GROUP BY 1
),
by_zone AS (
  SELECT zone, COUNT(awb) AS total,
    COUNTIF(unified_status='Delivered') AS delivered,
    COUNTIF(unified_status='RTO') AS rto
  FROM base WHERE zone IS NOT NULL GROUP BY 1
),
by_payment_detail AS (
  SELECT
    payment_mode,
    COUNT(awb) AS total,
    COUNTIF(unified_status='Delivered') AS delivered,
    COUNTIF(unified_status='RTO') AS rto,
    COUNTIF(unified_status='Cancelled') AS cancelled,
    COUNTIF(unified_status='Intransit') AS in_transit,
    COUNTIF(unified_status='RTO' AND COALESCE(ofd_attempts,0)=0) AS z_rto,
    ROUND(AVG(IF(delivery_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(delivery_date, order_date, DAY) BETWEEN 0 AND 20, DATE_DIFF(delivery_date, order_date, DAY), NULL)), 2) AS avg_fulfilment_days,
    ROUND(AVG(IF(pickup_ts IS NOT NULL AND delivery_ts IS NOT NULL AND TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) BETWEEN 0 AND 28800, TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) / 1440.0, NULL)), 2) AS avg_intransit_days,
    ROUND(AVG(IF(pickup_ts IS NOT NULL AND created_ts IS NOT NULL AND TIMESTAMP_DIFF(pickup_ts, created_ts, MINUTE) BETWEEN 0 AND 14400, TIMESTAMP_DIFF(pickup_ts, created_ts, MINUTE) / 1440.0, NULL)), 2) AS avg_pickup_days,
    ROUND(AVG(IF(created_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(created_date, order_date, DAY) BETWEEN 0 AND 10, DATE_DIFF(created_date, order_date, DAY), NULL)), 2) AS avg_processing_days,
    ROUND(AVG(SAFE_CAST(invoice_value AS FLOAT64)), 0) AS avg_order_value
  FROM base WHERE payment_mode IS NOT NULL GROUP BY 1
),
by_payment_day AS (
  SELECT
    payment_mode,
    FORMAT_DATE('%d %b', created_date) AS period_label,
    created_date AS period_dt,
    COUNT(awb) AS total,
    COUNTIF(unified_status='Delivered') AS delivered,
    COUNTIF(unified_status='RTO') AS rto,
    ROUND(COUNTIF(unified_status='Delivered') * 100.0 / NULLIF(COUNT(awb),0), 2) AS del_pct,
    ROUND(COUNTIF(unified_status='RTO') * 100.0 / NULLIF(COUNT(awb),0), 2) AS rto_pct,
    ROUND(AVG(IF(delivery_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(delivery_date, order_date, DAY) BETWEEN 0 AND 20, DATE_DIFF(delivery_date, order_date, DAY), NULL)), 2) AS avg_fulfilment_days,
    ROUND(AVG(IF(created_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(created_date, order_date, DAY) BETWEEN 0 AND 10, DATE_DIFF(created_date, order_date, DAY), NULL)), 2) AS avg_processing_days
  FROM base WHERE payment_mode IS NOT NULL AND created_date IS NOT NULL GROUP BY 1,2,3
),
by_payment_week AS (
  SELECT
    payment_mode,
    FORMAT_DATE('W%V %Y', created_date) AS period_label,
    DATE_TRUNC(created_date, WEEK) AS period_dt,
    COUNT(awb) AS total,
    COUNTIF(unified_status='Delivered') AS delivered,
    COUNTIF(unified_status='RTO') AS rto,
    ROUND(COUNTIF(unified_status='Delivered') * 100.0 / NULLIF(COUNT(awb),0), 2) AS del_pct,
    ROUND(COUNTIF(unified_status='RTO') * 100.0 / NULLIF(COUNT(awb),0), 2) AS rto_pct,
    ROUND(AVG(IF(delivery_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(delivery_date, order_date, DAY) BETWEEN 0 AND 20, DATE_DIFF(delivery_date, order_date, DAY), NULL)), 2) AS avg_fulfilment_days,
    ROUND(AVG(IF(created_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(created_date, order_date, DAY) BETWEEN 0 AND 10, DATE_DIFF(created_date, order_date, DAY), NULL)), 2) AS avg_processing_days
  FROM base WHERE payment_mode IS NOT NULL AND created_date IS NOT NULL GROUP BY 1,2,3
),
by_payment_month AS (
  SELECT
    payment_mode,
    FORMAT_DATE('%b-%y', created_date) AS period_label,
    DATE_TRUNC(created_date, MONTH) AS period_dt,
    COUNT(awb) AS total,
    COUNTIF(unified_status='Delivered') AS delivered,
    COUNTIF(unified_status='RTO') AS rto,
    ROUND(COUNTIF(unified_status='Delivered') * 100.0 / NULLIF(COUNT(awb),0), 2) AS del_pct,
    ROUND(COUNTIF(unified_status='RTO') * 100.0 / NULLIF(COUNT(awb),0), 2) AS rto_pct,
    ROUND(AVG(IF(delivery_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(delivery_date, order_date, DAY) BETWEEN 0 AND 20, DATE_DIFF(delivery_date, order_date, DAY), NULL)), 2) AS avg_fulfilment_days,
    ROUND(AVG(IF(created_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(created_date, order_date, DAY) BETWEEN 0 AND 10, DATE_DIFF(created_date, order_date, DAY), NULL)), 2) AS avg_processing_days
  FROM base WHERE payment_mode IS NOT NULL AND created_date IS NOT NULL GROUP BY 1,2,3
),
by_day AS (
  SELECT
    FORMAT_DATE('%d %b', created_date) AS label,
    created_date AS dt,
    COUNT(awb) AS total,
    COUNTIF(unified_status='RTO') AS rto,
    COUNTIF(unified_status='Delivered') AS delivered,
    ROUND(COUNTIF(unified_status='RTO') * 100.0 / NULLIF(COUNT(awb),0), 1) AS rto_pct,
    ROUND(SUM(invoice_value), 0) AS total_value,
    ROUND(SUM(IF(unified_status='Delivered', invoice_value, 0)), 0) AS delivered_value,
    ROUND(SUM(IF(unified_status='RTO', invoice_value, 0)), 0) AS rto_value,
    ROUND(SUM(IF(unified_status='RTO', invoice_value, 0)) * 100.0 / NULLIF(SUM(invoice_value),0), 1) AS rto_value_pct,
    ROUND(SUM(IF(unified_status='Delivered', invoice_value, 0)) * 100.0 / NULLIF(SUM(invoice_value),0), 1) AS del_value_pct,
    ROUND(AVG(IF(pickup_ts IS NOT NULL AND created_ts IS NOT NULL AND TIMESTAMP_DIFF(pickup_ts, created_ts, MINUTE) BETWEEN 0 AND 14400, TIMESTAMP_DIFF(pickup_ts, created_ts, MINUTE) / 1440.0, NULL)), 2) AS avg_pickup_days,
    ROUND(AVG(IF(created_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(created_date, order_date, DAY) BETWEEN 0 AND 10, DATE_DIFF(created_date, order_date, DAY), NULL)), 2) AS avg_processing_days,
    ROUND(AVG(IF(pickup_ts IS NOT NULL AND delivery_ts IS NOT NULL AND TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) BETWEEN 0 AND 28800, TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) / 1440.0, NULL)), 2) AS avg_intransit_days,
    ROUND(AVG(IF(delivery_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(delivery_date, order_date, DAY) BETWEEN 0 AND 20, DATE_DIFF(delivery_date, order_date, DAY), NULL)), 2) AS avg_fulfilment_days
  FROM base WHERE created_date IS NOT NULL GROUP BY 1,2 ORDER BY 2
),
by_week AS (
  SELECT
    FORMAT_DATE('W%V %Y', created_date) AS label,
    DATE_TRUNC(created_date, WEEK) AS dt,
    COUNT(awb) AS total,
    COUNTIF(unified_status='RTO') AS rto,
    COUNTIF(unified_status='Delivered') AS delivered,
    ROUND(COUNTIF(unified_status='RTO') * 100.0 / NULLIF(COUNT(awb),0), 1) AS rto_pct,
    ROUND(SUM(invoice_value), 0) AS total_value,
    ROUND(SUM(IF(unified_status='Delivered', invoice_value, 0)), 0) AS delivered_value,
    ROUND(SUM(IF(unified_status='RTO', invoice_value, 0)), 0) AS rto_value,
    ROUND(SUM(IF(unified_status='RTO', invoice_value, 0)) * 100.0 / NULLIF(SUM(invoice_value),0), 1) AS rto_value_pct,
    ROUND(SUM(IF(unified_status='Delivered', invoice_value, 0)) * 100.0 / NULLIF(SUM(invoice_value),0), 1) AS del_value_pct,
    ROUND(AVG(IF(pickup_ts IS NOT NULL AND created_ts IS NOT NULL AND TIMESTAMP_DIFF(pickup_ts, created_ts, MINUTE) BETWEEN 0 AND 14400, TIMESTAMP_DIFF(pickup_ts, created_ts, MINUTE) / 1440.0, NULL)), 2) AS avg_pickup_days,
    ROUND(AVG(IF(created_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(created_date, order_date, DAY) BETWEEN 0 AND 10, DATE_DIFF(created_date, order_date, DAY), NULL)), 2) AS avg_processing_days,
    ROUND(AVG(IF(pickup_ts IS NOT NULL AND delivery_ts IS NOT NULL AND TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) BETWEEN 0 AND 28800, TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) / 1440.0, NULL)), 2) AS avg_intransit_days,
    ROUND(AVG(IF(delivery_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(delivery_date, order_date, DAY) BETWEEN 0 AND 20, DATE_DIFF(delivery_date, order_date, DAY), NULL)), 2) AS avg_fulfilment_days
  FROM base WHERE created_date IS NOT NULL GROUP BY 1,2 ORDER BY 2
),
by_month AS (
  SELECT
    FORMAT_DATE('%b %Y', created_date) AS label,
    DATE_TRUNC(created_date, MONTH) AS dt,
    COUNT(awb) AS total,
    COUNTIF(unified_status='RTO') AS rto,
    COUNTIF(unified_status='Delivered') AS delivered,
    ROUND(COUNTIF(unified_status='RTO') * 100.0 / NULLIF(COUNT(awb),0), 1) AS rto_pct,
    ROUND(SUM(invoice_value), 0) AS total_value,
    ROUND(SUM(IF(unified_status='Delivered', invoice_value, 0)), 0) AS delivered_value,
    ROUND(SUM(IF(unified_status='RTO', invoice_value, 0)), 0) AS rto_value,
    ROUND(SUM(IF(unified_status='RTO', invoice_value, 0)) * 100.0 / NULLIF(SUM(invoice_value),0), 1) AS rto_value_pct,
    ROUND(SUM(IF(unified_status='Delivered', invoice_value, 0)) * 100.0 / NULLIF(SUM(invoice_value),0), 1) AS del_value_pct,
    ROUND(AVG(IF(pickup_ts IS NOT NULL AND created_ts IS NOT NULL AND TIMESTAMP_DIFF(pickup_ts, created_ts, MINUTE) BETWEEN 0 AND 14400, TIMESTAMP_DIFF(pickup_ts, created_ts, MINUTE) / 1440.0, NULL)), 2) AS avg_pickup_days,
    ROUND(AVG(IF(created_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(created_date, order_date, DAY) BETWEEN 0 AND 10, DATE_DIFF(created_date, order_date, DAY), NULL)), 2) AS avg_processing_days,
    ROUND(AVG(IF(pickup_ts IS NOT NULL AND delivery_ts IS NOT NULL AND TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) BETWEEN 0 AND 28800, TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) / 1440.0, NULL)), 2) AS avg_intransit_days,
    ROUND(AVG(IF(delivery_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(delivery_date, order_date, DAY) BETWEEN 0 AND 20, DATE_DIFF(delivery_date, order_date, DAY), NULL)), 2) AS avg_fulfilment_days
  FROM base WHERE created_date IS NOT NULL GROUP BY 1,2 ORDER BY 2
),
rto_reasons AS (
  SELECT reason_for_last_failed_delivery AS reason, COUNT(awb) AS total
  FROM base WHERE reason_for_last_failed_delivery IS NOT NULL AND unified_status='RTO'
  GROUP BY 1 ORDER BY 2 DESC
),
top_drop_states AS (
  SELECT
    CONCAT(UPPER(SUBSTR(drop_state,1,1)), LOWER(SUBSTR(drop_state,2))) AS state,
    COUNT(awb) AS total
  FROM base WHERE drop_state IS NOT NULL AND drop_state != '' GROUP BY 1 ORDER BY 2 DESC LIMIT 10
),
top_drop_cities AS (
  SELECT
    CONCAT(UPPER(SUBSTR(drop_city,1,1)), LOWER(SUBSTR(drop_city,2))) AS city,
    COUNT(awb) AS total
  FROM base WHERE drop_city IS NOT NULL AND drop_city != '' GROUP BY 1 ORDER BY 2 DESC LIMIT 10
),
top_pickup_cities AS (
  SELECT
    CONCAT(UPPER(SUBSTR(pickup_city,1,1)), LOWER(SUBSTR(pickup_city,2))) AS city,
    COUNT(awb) AS total
  FROM base WHERE pickup_city IS NOT NULL AND pickup_city != '' GROUP BY 1 ORDER BY 2 DESC LIMIT 10
),
by_payment AS (
  SELECT payment_mode, COUNT(awb) AS total FROM base WHERE payment_mode IS NOT NULL GROUP BY 1
),
tat_by_courier AS (
  SELECT
    courier_group,
    COUNT(awb) AS total,
    COUNTIF(unified_status='Delivered') AS delivered,
    COUNTIF(pickup_ts IS NOT NULL AND delivery_ts IS NOT NULL AND TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) BETWEEN 0 AND 2880) AS bucket_0_1,
    COUNTIF(pickup_ts IS NOT NULL AND delivery_ts IS NOT NULL AND TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) BETWEEN 2881 AND 5760) AS bucket_2_3,
    COUNTIF(pickup_ts IS NOT NULL AND delivery_ts IS NOT NULL AND TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) BETWEEN 5761 AND 7200) AS bucket_4_5,
    COUNTIF(pickup_ts IS NOT NULL AND delivery_ts IS NOT NULL AND TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) > 7200) AS bucket_5plus
  FROM base WHERE unified_status='Delivered' GROUP BY 1
),
tat_by_month AS (
  SELECT
    FORMAT_DATE('%b-%y', created_date) AS month_label,
    DATE_TRUNC(created_date, MONTH) AS month_dt,
    COUNT(awb) AS total,
    COUNTIF(unified_status='Delivered') AS delivered,
    COUNTIF(pickup_ts IS NOT NULL AND delivery_ts IS NOT NULL AND TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) BETWEEN 0 AND 2880) AS bucket_0_1,
    COUNTIF(pickup_ts IS NOT NULL AND delivery_ts IS NOT NULL AND TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) BETWEEN 2881 AND 5760) AS bucket_2_3,
    COUNTIF(pickup_ts IS NOT NULL AND delivery_ts IS NOT NULL AND TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) BETWEEN 5761 AND 7200) AS bucket_4_5,
    COUNTIF(pickup_ts IS NOT NULL AND delivery_ts IS NOT NULL AND TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) > 7200) AS bucket_5plus
  FROM base WHERE unified_status='Delivered' AND created_date IS NOT NULL GROUP BY 1,2
),
tat_by_facility AS (
  SELECT
    CASE
      WHEN UPPER(TRIM(pickup_city)) IN ('DELHI','GURGAON','GURUGRAM','HARYANA') THEN 'Delhi'
      WHEN UPPER(TRIM(pickup_city)) IN ('MUMBAI','BHIWANDI') THEN 'Mumbai'
      WHEN UPPER(TRIM(pickup_city)) IN ('PUNE','MAVAL') THEN 'Pune'
      WHEN UPPER(TRIM(pickup_city)) IN ('BANGALORE','BENGALURU') THEN 'Bengaluru'
      WHEN UPPER(TRIM(pickup_city)) IN ('KOLKATA','HOWRAH','HOOGHLY') THEN 'Kolkata'
      WHEN UPPER(TRIM(pickup_city)) = 'CHENNAI' THEN 'Chennai'
      WHEN UPPER(TRIM(pickup_city)) = 'HYDERABAD' THEN 'Hyderabad'
      ELSE TRIM(pickup_city)
    END AS facility,
    COUNT(awb) AS total,
    COUNTIF(unified_status='Delivered') AS delivered,
    -- Processing to Pickup buckets (hours)
    COUNTIF(pickup_ts IS NOT NULL AND created_ts IS NOT NULL AND TIMESTAMP_DIFF(pickup_ts, created_ts, MINUTE) BETWEEN 0 AND 720) AS proc_0_12h,
    COUNTIF(pickup_ts IS NOT NULL AND created_ts IS NOT NULL AND TIMESTAMP_DIFF(pickup_ts, created_ts, MINUTE) BETWEEN 721 AND 1440) AS proc_12_24h,
    COUNTIF(pickup_ts IS NOT NULL AND created_ts IS NOT NULL AND TIMESTAMP_DIFF(pickup_ts, created_ts, MINUTE) BETWEEN 1441 AND 2880) AS proc_24_48h,
    COUNTIF(pickup_ts IS NOT NULL AND created_ts IS NOT NULL AND TIMESTAMP_DIFF(pickup_ts, created_ts, MINUTE) > 2880) AS proc_48plus,
    -- Order to Delivery buckets (days)
    COUNTIF(delivery_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(delivery_date, order_date, DAY) BETWEEN 0 AND 1) AS ord_0_1,
    COUNTIF(delivery_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(delivery_date, order_date, DAY) BETWEEN 2 AND 3) AS ord_2_3,
    COUNTIF(delivery_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(delivery_date, order_date, DAY) BETWEEN 4 AND 5) AS ord_4_5,
    COUNTIF(delivery_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(delivery_date, order_date, DAY) > 5) AS ord_5plus
  FROM base WHERE pickup_city IS NOT NULL GROUP BY 1
),
failed_delivery_reasons AS (
  SELECT
    reason_for_last_failed_delivery AS reason,
    COUNT(awb) AS total
  FROM base
  WHERE reason_for_last_failed_delivery IS NOT NULL
    AND reason_for_last_failed_delivery != ''
    AND ofd_attempts > 1
  GROUP BY 1 ORDER BY 2 DESC
),
by_zone_detail AS (
  SELECT
    zone,
    COUNT(awb) AS total,
    COUNTIF(unified_status='Delivered') AS delivered,
    COUNTIF(unified_status='RTO') AS rto,
    COUNTIF(unified_status='Cancelled') AS cancelled,
    ROUND(AVG(IF(delivery_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(delivery_date, order_date, DAY) BETWEEN 0 AND 20, DATE_DIFF(delivery_date, order_date, DAY), NULL)), 2) AS avg_fulfilment_days,
    ROUND(AVG(IF(pickup_ts IS NOT NULL AND delivery_ts IS NOT NULL AND TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) BETWEEN 0 AND 28800, TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) / 1440.0, NULL)), 2) AS avg_intransit_days
  FROM base WHERE zone IS NOT NULL AND zone != '' GROUP BY 1
),
by_channel AS (
  SELECT
    channel_name AS channel,
    COUNT(awb) AS total,
    COUNTIF(unified_status='Delivered') AS delivered,
    COUNTIF(unified_status='RTO') AS rto,
    COUNTIF(unified_status='Cancelled') AS cancelled,
    COUNTIF(unified_status='Intransit') AS in_transit,
    ROUND(AVG(IF(delivery_date IS NOT NULL AND order_date IS NOT NULL AND DATE_DIFF(delivery_date, order_date, DAY) BETWEEN 0 AND 20, DATE_DIFF(delivery_date, order_date, DAY), NULL)), 2) AS avg_fulfilment_days,
    ROUND(AVG(IF(pickup_ts IS NOT NULL AND delivery_ts IS NOT NULL AND TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) BETWEEN 0 AND 28800, TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) / 1440.0, NULL)), 2) AS avg_intransit_days,
    ROUND(AVG(SAFE_CAST(invoice_value AS FLOAT64)), 0) AS avg_gmv
  FROM base WHERE channel_name IS NOT NULL AND channel_name != '' GROUP BY 1
),
filter_opts AS (
  SELECT
    ARRAY_AGG(DISTINCT courier_partner IGNORE NULLS ORDER BY courier_partner) AS couriers,
    ARRAY_AGG(DISTINCT zone IGNORE NULLS ORDER BY zone) AS zones,
    ARRAY_AGG(DISTINCT CONCAT(UPPER(SUBSTR(pickup_state,1,1)), LOWER(SUBSTR(pickup_state,2))) IGNORE NULLS ORDER BY CONCAT(UPPER(SUBSTR(pickup_state,1,1)), LOWER(SUBSTR(pickup_state,2)))) AS pickup_states,
    ARRAY_AGG(DISTINCT CONCAT(UPPER(SUBSTR(drop_state,1,1)), LOWER(SUBSTR(drop_state,2))) IGNORE NULLS ORDER BY CONCAT(UPPER(SUBSTR(drop_state,1,1)), LOWER(SUBSTR(drop_state,2)))) AS drop_states,
    ARRAY_AGG(DISTINCT CONCAT(UPPER(SUBSTR(drop_city,1,1)), LOWER(SUBSTR(drop_city,2))) IGNORE NULLS ORDER BY CONCAT(UPPER(SUBSTR(drop_city,1,1)), LOWER(SUBSTR(drop_city,2)))) AS drop_cities,
    ARRAY_AGG(DISTINCT category IGNORE NULLS ORDER BY category) AS categories,
    ARRAY_AGG(DISTINCT sub_category IGNORE NULLS ORDER BY sub_category) AS sub_categories
  FROM base
)
SELECT
  TO_JSON_STRING((SELECT AS STRUCT * FROM kpis)) AS kpis,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM by_courier ORDER BY total DESC)) AS by_courier,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM by_status)) AS by_status,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM by_zone ORDER BY total DESC)) AS by_zone,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM by_day)) AS by_day,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM by_week)) AS by_week,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM by_month)) AS by_month,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM rto_reasons)) AS rto_reasons,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM top_drop_states)) AS top_drop_states,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM top_drop_cities)) AS top_drop_cities,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM top_pickup_cities)) AS top_pickup_cities,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM by_payment)) AS by_payment,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM by_courier_day ORDER BY courier_group, period_dt)) AS by_courier_day,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM by_courier_week ORDER BY courier_group, period_dt)) AS by_courier_week,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM by_courier_month ORDER BY courier_group, month_dt)) AS by_courier_month,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM by_month_all ORDER BY month_dt)) AS by_month_all,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM by_payment_detail ORDER BY total DESC)) AS by_payment_detail,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM by_payment_day ORDER BY payment_mode, period_dt)) AS by_payment_day,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM by_payment_week ORDER BY payment_mode, period_dt)) AS by_payment_week,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM by_payment_month ORDER BY payment_mode, period_dt)) AS by_payment_month,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM failed_delivery_reasons)) AS failed_delivery_reasons,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM by_zone_detail ORDER BY total DESC)) AS by_zone_detail,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM by_channel ORDER BY total DESC)) AS by_channel,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM tat_by_courier ORDER BY total DESC)) AS tat_by_courier,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM tat_by_month ORDER BY month_dt)) AS tat_by_month,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM tat_by_facility ORDER BY total DESC)) AS tat_by_facility,
  TO_JSON_STRING((SELECT AS STRUCT * FROM filter_opts)) AS filter_opts
`

  try {
    const bq = getBQ()
    const [rows] = await bq.query({ query, maximumBytesBilled: '10000000000' })
    if (!rows.length) return res.json({})
    const r = rows[0]
    res.json({
      kpis: JSON.parse(r.kpis),
      byCourier: JSON.parse(r.by_courier),
      byStatus: JSON.parse(r.by_status),
      byZone: JSON.parse(r.by_zone),
      byDay: JSON.parse(r.by_day),
      byWeek: JSON.parse(r.by_week),
      byMonth: JSON.parse(r.by_month),
      rtoReasons: JSON.parse(r.rto_reasons),
      topDropStates: JSON.parse(r.top_drop_states),
      topDropCities: JSON.parse(r.top_drop_cities),
      topPickupCities: JSON.parse(r.top_pickup_cities),
      byPayment: JSON.parse(r.by_payment),
      byCourierDay: JSON.parse(r.by_courier_day),
      byCourierWeek: JSON.parse(r.by_courier_week),
      byCourierMonth: JSON.parse(r.by_courier_month),
      byMonthAll: JSON.parse(r.by_month_all),
      byPaymentDetail: JSON.parse(r.by_payment_detail),
      byPaymentDay: JSON.parse(r.by_payment_day),
      byPaymentWeek: JSON.parse(r.by_payment_week),
      byPaymentMonth: JSON.parse(r.by_payment_month),
      failedDeliveryReasons: JSON.parse(r.failed_delivery_reasons),
      byZoneDetail: JSON.parse(r.by_zone_detail),
      byChannel: JSON.parse(r.by_channel),
      tatByCourier: JSON.parse(r.tat_by_courier),
      tatByMonth: JSON.parse(r.tat_by_month),
      tatByFacility: JSON.parse(r.tat_by_facility),
      filterOpts: JSON.parse(r.filter_opts),
    })
  } catch (e) {
    console.error('[logistics]', e.message)
    res.status(500).json({ error: e.message })
  }
}
