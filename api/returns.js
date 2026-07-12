import { getBQ } from './_bq.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { start, end } = req.body
  if (!start || !end) return res.status(400).json({ error: 'Missing start or end' })

  const query = `
WITH base AS (
  SELECT
    awb,
    courier_partner,
    order_type,
    return_status,
    clickpost_unified_status,
    return_reason,
    sub_reason,
    item_description,
    return_sku,
    refund_status,
    refund_method,
    pickup_state,
    pickup_city,
    SAFE_CAST(refunded_amount AS FLOAT64) AS refunded_amount,
    SAFE_CAST(item_price AS FLOAT64) AS item_price,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(created_at, 1, 10)) AS created_date,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(pickup_date, 1, 10)) AS pickup_date,
    Return_Type
  FROM \`frido-429506.production.Clickpost_Returns_Exchange_Report\`
  WHERE SUBSTR(created_at, 1, 10) BETWEEN '${start}' AND '${end}'
    AND created_at IS NOT NULL AND created_at != ''
),
kpis AS (
  SELECT
    COUNT(awb) AS total_requests,
    COUNTIF(Return_Type = 'Return') AS total_returns,
    COUNTIF(Return_Type = 'Exchange') AS total_exchanges,
    COUNTIF(clickpost_unified_status IN ('Delivered','PickedUp','InTransit','OutForDelivery')) AS pickup_success,
    COUNTIF(clickpost_unified_status = 'PickupFailed') AS pickup_failed,
    COUNTIF(clickpost_unified_status = 'Cancelled') AS cancelled,
    COUNTIF(refund_status = 'Processed') AS refund_processed,
    COUNTIF(refund_status IN ('Initiated','Queued')) AS refund_initiated,
    ROUND(AVG(IF(refunded_amount > 0, refunded_amount, NULL)), 0) AS avg_refund_amount,
    ROUND(SUM(IF(refunded_amount > 0, refunded_amount, NULL)), 0) AS total_refunded
  FROM base
),
by_reason AS (
  SELECT
    return_reason AS reason,
    COUNT(awb) AS total,
    ROUND(COUNT(awb) * 100.0 / NULLIF((SELECT COUNT(*) FROM base WHERE return_reason IS NOT NULL AND return_reason != ''), 0), 2) AS pct
  FROM base
  WHERE return_reason IS NOT NULL AND return_reason != ''
  GROUP BY 1 ORDER BY 2 DESC LIMIT 15
),
by_sub_reason AS (
  SELECT
    sub_reason AS reason,
    COUNT(awb) AS total,
    ROUND(COUNT(awb) * 100.0 / NULLIF((SELECT COUNT(*) FROM base WHERE sub_reason IS NOT NULL AND sub_reason != ''), 0), 2) AS pct
  FROM base
  WHERE sub_reason IS NOT NULL AND sub_reason != ''
  GROUP BY 1 ORDER BY 2 DESC LIMIT 15
),
by_product AS (
  SELECT
    item_description AS product,
    COUNT(awb) AS total,
    ROUND(COUNT(awb) * 100.0 / NULLIF((SELECT COUNT(*) FROM base WHERE item_description IS NOT NULL AND item_description != ''), 0), 2) AS pct
  FROM base
  WHERE item_description IS NOT NULL AND item_description != ''
  GROUP BY 1 ORDER BY 2 DESC LIMIT 10
),
by_day AS (
  SELECT
    FORMAT_DATE('%d %b', created_date) AS label,
    created_date AS dt,
    COUNT(awb) AS total,
    COUNTIF(Return_Type = 'Return') AS returns,
    COUNTIF(Return_Type = 'Exchange') AS exchanges,
    COUNTIF(clickpost_unified_status IN ('Delivered','PickedUp','InTransit','OutForDelivery')) AS pickup_success,
    ROUND(COUNTIF(clickpost_unified_status IN ('Delivered','PickedUp','InTransit','OutForDelivery')) * 100.0 / NULLIF(COUNT(awb), 0), 2) AS pickup_pct
  FROM base WHERE created_date IS NOT NULL GROUP BY 1,2 ORDER BY 2
),
by_week AS (
  SELECT
    FORMAT_DATE('W%V %Y', created_date) AS label,
    DATE_TRUNC(created_date, WEEK) AS dt,
    COUNT(awb) AS total,
    COUNTIF(Return_Type = 'Return') AS returns,
    COUNTIF(Return_Type = 'Exchange') AS exchanges,
    COUNTIF(clickpost_unified_status IN ('Delivered','PickedUp','InTransit','OutForDelivery')) AS pickup_success,
    ROUND(COUNTIF(clickpost_unified_status IN ('Delivered','PickedUp','InTransit','OutForDelivery')) * 100.0 / NULLIF(COUNT(awb), 0), 2) AS pickup_pct
  FROM base WHERE created_date IS NOT NULL GROUP BY 1,2 ORDER BY 2
),
by_month AS (
  SELECT
    FORMAT_DATE('%b-%y', created_date) AS label,
    DATE_TRUNC(created_date, MONTH) AS dt,
    COUNT(awb) AS total,
    COUNTIF(Return_Type = 'Return') AS returns,
    COUNTIF(Return_Type = 'Exchange') AS exchanges,
    COUNTIF(clickpost_unified_status IN ('Delivered','PickedUp','InTransit','OutForDelivery')) AS pickup_success,
    ROUND(COUNTIF(clickpost_unified_status IN ('Delivered','PickedUp','InTransit','OutForDelivery')) * 100.0 / NULLIF(COUNT(awb), 0), 2) AS pickup_pct
  FROM base WHERE created_date IS NOT NULL GROUP BY 1,2 ORDER BY 2
),
by_courier AS (
  SELECT
    courier_partner,
    COUNT(awb) AS total,
    COUNTIF(clickpost_unified_status IN ('Delivered','PickedUp','InTransit','OutForDelivery')) AS pickup_success,
    ROUND(COUNTIF(clickpost_unified_status IN ('Delivered','PickedUp','InTransit','OutForDelivery')) * 100.0 / NULLIF(COUNT(awb), 0), 2) AS pickup_pct
  FROM base WHERE courier_partner IS NOT NULL AND courier_partner != '' GROUP BY 1 ORDER BY 2 DESC
),
by_refund_method AS (
  SELECT
    COALESCE(NULLIF(refund_method, ''), 'Unknown') AS method,
    COUNT(awb) AS total,
    COUNTIF(refund_status = 'Processed') AS processed,
    COUNTIF(refund_status IN ('Initiated','Queued')) AS initiated,
    COUNTIF(refund_status = 'Failed') AS failed
  FROM base WHERE refund_method IS NOT NULL AND refund_method != '' GROUP BY 1 ORDER BY 2 DESC
)
SELECT
  TO_JSON_STRING((SELECT AS STRUCT * FROM kpis)) AS kpis,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM by_reason)) AS by_reason,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM by_sub_reason)) AS by_sub_reason,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM by_product)) AS by_product,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM by_day)) AS by_day,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM by_week)) AS by_week,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM by_month)) AS by_month,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM by_courier)) AS by_courier,
  TO_JSON_STRING(ARRAY(SELECT AS STRUCT * FROM by_refund_method)) AS by_refund_method
`

  try {
    const bq = getBQ()
    const [rows] = await bq.query({ query, maximumBytesBilled: '10000000000' })
    if (!rows.length) return res.json({})
    const r = rows[0]
    res.json({
      kpis: JSON.parse(r.kpis),
      byReason: JSON.parse(r.by_reason),
      bySubReason: JSON.parse(r.by_sub_reason),
      byProduct: JSON.parse(r.by_product),
      byDay: JSON.parse(r.by_day),
      byWeek: JSON.parse(r.by_week),
      byMonth: JSON.parse(r.by_month),
      byCourier: JSON.parse(r.by_courier),
      byRefundMethod: JSON.parse(r.by_refund_method),
    })
  } catch (e) {
    console.error('[returns]', e.message)
    res.status(500).json({ error: e.message })
  }
}
