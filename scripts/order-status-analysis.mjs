// Runs the unified order-status query (Shopify + Uniware + Clickpost forward/reverse) and
// analyses the fulfilment funnel for Aug 1 - Sep 13 2026.
//
// Why this query rather than the Clickpost tables alone: it starts from Shopify order lines,
// so orders that were cancelled before dispatch, or packed and never shipped, are present.
// A Clickpost-only view silently drops those - they never got an AWB - which understates
// both leakage and the money sitting in unresolved states.
//
// The status logic is the user's own, unchanged. This script only adds aggregation.
import { BigQuery } from '@google-cloud/bigquery'
import XLSX from 'xlsx'

const OUT = process.argv[2] || '../order_status_analysis_aug_sep26.xlsx'
const bq = new BigQuery({ keyFilename: 'sa_key.json', projectId: 'frido-429506' })

const BASE = `
WITH shopify_base AS (
  SELECT source_system, source_name, order_name, order_date_ist, cancel_reason,
    processing_method, note, waybill, fulfillment_shipment_status, refunds_created_at,
    refunds_note, refund_transaction_status, tags, voucher_code, financial_status, paid_at,
    total_outstanding, cancelled_at, order_fulfillment_status, shipping_state, shipping_city,
    shipping_pincode, line_item_id, sku, line_fulfillment_status, item_name, qty, unit_price,
    gross_item_value, item_discount_amount, item_discount_percent,
    selling_price_excl_shipping_tax, shipping_methods, allocated_shipping_amount,
    allocated_shipping_tax, gst_rate_percent, item_gst_tax, total_tax_on_item_incl_shipping,
    total_excl_tax, final_total_incl_tax, refunded_qty, refunded_subtotal_excl_tax,
    refunded_total_incl_tax, is_refunded_line
  FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\`
),
clickpost_base_forward AS (
  SELECT STRING_AGG(DISTINCT courier_partner, ',') AS courier_partner,
    ANY_VALUE(awb) AS awb, MAX(created_at) AS created_at, MAX(pickup_date) AS pickup_date,
    STRING_AGG(DISTINCT clickpost_unified_status, ',') AS clickpost_unified_status,
    STRING_AGG(DISTINCT latest_remark, ',') AS latest_remark,
    STRING_AGG(DISTINCT product_sku_code, ',') AS product_sku_code,
    STRING_AGG(DISTINCT payment_mode, ',') AS payment_mode,
    SUM(SAFE_CAST(cod_value AS NUMERIC)) AS cod_value,
    SUM(SAFE_CAST(invoice_value AS NUMERIC)) AS invoice_value,
    STRING_AGG(DISTINCT reason_for_last_failed_delivery, ',') AS reason_for_last_failed_delivery,
    MAX(delivery_date) AS delivery_date, MAX(updated_at) AS updated_at,
    order_id, ANY_VALUE(shipment_type) AS shipment_type, ANY_VALUE(Return_Type) AS Return_Type
  FROM \`frido-429506.production.Clickpost_Shipment_Tracking_Report\`
  WHERE NOT REGEXP_CONTAINS(LOWER(courier_partner), r'reverse')
  GROUP BY order_id
),
clickpost_base_reverse AS (
  SELECT STRING_AGG(DISTINCT clickpost_unified_status, ',') AS clickpost_unified_status,
    STRING_AGG(DISTINCT latest_remark, ',') AS latest_remark,
    order_id, ANY_VALUE(shipment_type) AS shipment_type, ANY_VALUE(Return_Type) AS Return_Type
  FROM \`frido-429506.production.Clickpost_Shipment_Tracking_Report\`
  WHERE REGEXP_CONTAINS(LOWER(courier_partner), r'reverse')
  GROUP BY order_id
),
uniware_base AS (
  SELECT DisplayOrderCode,
    STRING_AGG(DISTINCT SaleOrderItemStatus, ',') AS SaleOrderItemStatus,
    STRING_AGG(DISTINCT ShippingPackageStatusCode, ',') AS ShippingPackageStatusCode,
    STRING_AGG(DISTINCT ShippingTrackingStatus, ',') AS ShippingTrackingStatus,
    STRING_AGG(DISTINCT ShippingCourierStatus, ',') AS ShippingCourierStatus,
    ANY_VALUE(DeliveryTime) AS DeliveryTime, ANY_VALUE(DispatchDate_dtm) AS DispatchDate_dtm,
    CASE WHEN ANY_VALUE(COD_in) = 0 THEN 'Prepaid' WHEN ANY_VALUE(COD_in) = 1 THEN 'COD'
      ELSE 'Unknown' END AS uni_payment_mode
  FROM \`frido-429506.production.Unicommerce_Sale_Orders_Report\`
  GROUP BY DisplayOrderCode
),
base_with_status AS (
  SELECT
    t1.order_name, t1.order_date_ist, t1.sku, t1.item_name,
    -- NUMERIC -> FLOAT64: the BigQuery client returns NUMERIC as a Big object which
    -- serialises to null in xlsx and makes every sum read as zero.
    SAFE_CAST(t1.qty AS FLOAT64) AS qty,
    SAFE_CAST(t1.final_total_incl_tax AS FLOAT64) AS final_total_incl_tax,
    SAFE_CAST(t1.total_excl_tax AS FLOAT64) AS total_excl_tax,
    SAFE_CAST(t1.refunded_total_incl_tax AS FLOAT64) AS refunded_total_incl_tax,
    SAFE_CAST(t1.refunded_qty AS FLOAT64) AS refunded_qty,
    t1.is_refunded_line, t1.financial_status, t1.cancelled_at,
    t1.cancel_reason, t1.order_fulfillment_status, t1.fulfillment_shipment_status,
    t1.refund_transaction_status, t1.refunds_created_at, t1.total_outstanding,
    t1.shipping_state, t1.shipping_city, t1.source_name,
    t3.courier_partner, t3.awb, SAFE_CAST(t3.invoice_value AS FLOAT64) AS invoice_value, SAFE_CAST(t3.cod_value AS FLOAT64) AS cod_value,
    t3.reason_for_last_failed_delivery, t3.updated_at AS cp_updated_at,
    COALESCE(t3.payment_mode, t2.uni_payment_mode) AS payment_mode,
    COALESCE(t3.delivery_date, t2.DeliveryTime) AS delivery_date,
    COALESCE(DATE(t3.pickup_date), t2.DispatchDate_dtm) AS pickup_date,
    t3.clickpost_unified_status AS cp_forward_status,
    t4.clickpost_unified_status AS cp_reverse_status,
    t2.SaleOrderItemStatus, t2.ShippingPackageStatusCode,
    CASE
      WHEN (
        EXISTS (SELECT 1 FROM UNNEST(SPLIT(LOWER(COALESCE(t3.clickpost_unified_status,'')),',')) AS s WHERE TRIM(s)='delivered')
        OR EXISTS (SELECT 1 FROM UNNEST(SPLIT(LOWER(COALESCE(t2.ShippingTrackingStatus,'')),',')) AS s WHERE TRIM(s) LIKE '%delivered%' AND TRIM(s) NOT LIKE '%rto%' AND TRIM(s) NOT LIKE '%undeliver%' AND TRIM(s) NOT LIKE '%failed%')
        OR EXISTS (SELECT 1 FROM UNNEST(SPLIT(LOWER(COALESCE(t2.ShippingCourierStatus,'')),',')) AS s WHERE TRIM(s) LIKE '%delivered%' AND TRIM(s) NOT LIKE '%rto%' AND TRIM(s) NOT LIKE '%undeliver%' AND TRIM(s) NOT LIKE '%failed%')
        OR EXISTS (SELECT 1 FROM UNNEST(SPLIT(LOWER(COALESCE(t2.SaleOrderItemStatus,'')),',')) AS s WHERE TRIM(s)='delivered')
        OR LOWER(COALESCE(t1.order_fulfillment_status,''))='delivered'
        OR LOWER(COALESCE(t1.fulfillment_shipment_status,'')) LIKE '%delivered%'
      ) THEN 'Delivered'
      WHEN (
        EXISTS (SELECT 1 FROM UNNEST(SPLIT(LOWER(COALESCE(t3.clickpost_unified_status,'')),',')) AS s WHERE TRIM(s) LIKE '%rto%' OR TRIM(s)='returned')
        OR EXISTS (SELECT 1 FROM UNNEST(SPLIT(LOWER(COALESCE(t2.ShippingTrackingStatus,'')),',')) AS s WHERE TRIM(s) LIKE '%rto%' OR TRIM(s)='returned')
        OR EXISTS (SELECT 1 FROM UNNEST(SPLIT(LOWER(COALESCE(t2.ShippingCourierStatus,'')),',')) AS s WHERE TRIM(s) LIKE '%rto%' OR TRIM(s)='returned')
        OR EXISTS (SELECT 1 FROM UNNEST(SPLIT(LOWER(COALESCE(t2.ShippingPackageStatusCode,'')),',')) AS s WHERE TRIM(s) LIKE '%rto%' OR TRIM(s)='returned')
      ) THEN 'RTO'
      WHEN (
        EXISTS (SELECT 1 FROM UNNEST(SPLIT(LOWER(COALESCE(t3.clickpost_unified_status,'')),',')) AS s WHERE TRIM(s) LIKE '%cancel%')
        OR EXISTS (SELECT 1 FROM UNNEST(SPLIT(LOWER(COALESCE(t2.SaleOrderItemStatus,'')),',')) AS s WHERE TRIM(s) LIKE '%cancel%')
        OR EXISTS (SELECT 1 FROM UNNEST(SPLIT(LOWER(COALESCE(t2.ShippingPackageStatusCode,'')),',')) AS s WHERE TRIM(s) LIKE '%cancel%')
        OR LOWER(COALESCE(t1.financial_status,'')) LIKE '%cancel%'
        OR LOWER(COALESCE(t1.fulfillment_shipment_status,'')) LIKE '%cancel%'
        OR t1.cancelled_at IS NOT NULL
      ) THEN 'Cancelled'
      WHEN t3.order_id IS NULL THEN 'No Status Found'
      ELSE 'In Transit / Unknown'
    END AS forward_unified_status,
    CASE
      WHEN (EXISTS (SELECT 1 FROM UNNEST(SPLIT(LOWER(COALESCE(t4.clickpost_unified_status,'')),',')) AS s WHERE TRIM(s)='delivered')) THEN 'Delivered'
      WHEN (EXISTS (SELECT 1 FROM UNNEST(SPLIT(LOWER(COALESCE(t4.clickpost_unified_status,'')),',')) AS s WHERE TRIM(s) LIKE '%rto%' OR TRIM(s)='returned')) THEN 'RTO'
      WHEN (EXISTS (SELECT 1 FROM UNNEST(SPLIT(LOWER(COALESCE(t4.clickpost_unified_status,'')),',')) AS s WHERE TRIM(s) LIKE '%cancel%')) THEN 'Cancelled'
      WHEN t4.order_id IS NULL THEN 'No Reverse Shipment'
      ELSE 'In Transit / Unknown'
    END AS reverse_unified_status,
    COALESCE(t3.Return_Type, t4.Return_Type) AS return_type_raw
  FROM shopify_base t1
  LEFT JOIN uniware_base t2 ON t1.order_name = t2.DisplayOrderCode
  LEFT JOIN clickpost_base_forward t3 ON t1.order_name = t3.order_id
  LEFT JOIN clickpost_base_reverse t4 ON t1.order_name = t4.order_id
  WHERE DATE(t1.order_date_ist) BETWEEN '2026-08-01' AND '2026-09-13'
    AND NOT REGEXP_CONTAINS(LOWER(t1.sku), r'coup')
),
final AS (
  SELECT *, COALESCE(return_type_raw, forward_unified_status) AS Final_status,
    DATE_DIFF(CURRENT_DATE(), DATE(order_date_ist), DAY) AS age_days
  FROM base_with_status
)`

const q = async (label, sql) => {
  const [rows] = await bq.query({ query: BASE + sql })
  console.log(`${label}: ${rows.length} rows`)
  return rows
}

const N = v => (v === null || v === undefined ? 0 : Number(v))
const F = n => '₹' + Math.round(n).toLocaleString('en-IN')

// ── 1. funnel by final status ──
const funnel = await q('funnel', `
SELECT Final_status,
  COUNT(*) line_items,
  COUNT(DISTINCT order_name) orders,
  SUM(N(qty)) AS units,
  ROUND(SUM(final_total_incl_tax), 0) order_value,
  ROUND(SUM(refunded_total_incl_tax), 0) refunded,
  ROUND(AVG(age_days), 0) avg_age_days
FROM final GROUP BY 1 ORDER BY order_value DESC`.replace('SUM(N(qty))', 'SUM(qty)'))

// ── 2. the leakage: not delivered, money not returned ──
const leak = await q('unresolved', `
SELECT Final_status, financial_status,
  IFNULL(refund_transaction_status, '(none)') refund_txn,
  COUNT(*) line_items, COUNT(DISTINCT order_name) orders,
  ROUND(SUM(final_total_incl_tax), 0) order_value,
  ROUND(SUM(refunded_total_incl_tax), 0) refunded,
  ROUND(SUM(final_total_incl_tax) - SUM(refunded_total_incl_tax), 0) unrefunded,
  ROUND(AVG(age_days), 0) avg_age_days, MAX(age_days) oldest
FROM final
WHERE Final_status IN ('Cancelled','RTO','In Transit / Unknown','No Status Found')
GROUP BY 1,2,3 HAVING line_items > 5 ORDER BY unrefunded DESC`)

// ── 3. packed but never delivered ──
const stuck = await q('stuck in flight', `
SELECT Final_status, IFNULL(cp_forward_status,'(no clickpost)') cp_status,
  IFNULL(courier_partner,'(none)') courier,
  COUNT(*) line_items, COUNT(DISTINCT order_name) orders,
  ROUND(SUM(final_total_incl_tax), 0) order_value,
  ROUND(AVG(age_days), 0) avg_age_days, MAX(age_days) oldest
FROM final
WHERE Final_status IN ('In Transit / Unknown','No Status Found')
  AND age_days > 15
GROUP BY 1,2,3 ORDER BY order_value DESC LIMIT 200`)

// ── 4. by product ──
const prod = await q('by product', `
SELECT item_name, sku,
  COUNT(*) line_items,
  SUM(CASE WHEN Final_status='Delivered' THEN 1 ELSE 0 END) delivered,
  SUM(CASE WHEN Final_status='RTO' THEN 1 ELSE 0 END) rto,
  SUM(CASE WHEN Final_status='Cancelled' THEN 1 ELSE 0 END) cancelled,
  SUM(CASE WHEN Final_status IN ('In Transit / Unknown','No Status Found') THEN 1 ELSE 0 END) unresolved,
  ROUND(SUM(final_total_incl_tax),0) order_value,
  ROUND(SUM(CASE WHEN Final_status!='Delivered' THEN final_total_incl_tax ELSE 0 END),0) not_delivered_value
FROM final GROUP BY 1,2 HAVING line_items >= 20
ORDER BY not_delivered_value DESC LIMIT 300`)

// ── 5. row-level detail for the unresolved ──
const detail = await q('unresolved detail', `
SELECT order_name, order_date_ist, age_days, Final_status, forward_unified_status,
  reverse_unified_status, cp_forward_status, cp_reverse_status,
  financial_status, refund_transaction_status, cancel_reason,
  courier_partner, awb, payment_mode, sku, item_name, qty,
  ROUND(final_total_incl_tax,2) order_value,
  ROUND(refunded_total_incl_tax,2) refunded,
  ROUND(final_total_incl_tax - IFNULL(refunded_total_incl_tax,0),2) unrefunded,
  shipping_state, shipping_city, reason_for_last_failed_delivery
FROM final
WHERE Final_status != 'Delivered'
  AND (refunded_total_incl_tax IS NULL OR refunded_total_incl_tax < final_total_incl_tax)
ORDER BY (final_total_incl_tax - IFNULL(refunded_total_incl_tax,0)) DESC
LIMIT 30000`)

const wb = XLSX.utils.book_new()
const add = (n, r) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r), n)
add('Funnel', funnel)
add('Unresolved Summary', leak)
add('Stuck In Flight', stuck)
add('By Product', prod)
add('Unresolved Detail', detail)
XLSX.writeFile(wb, OUT)

const tot = funnel.reduce((a, r) => a + N(r.order_value), 0)
const totLines = funnel.reduce((a, r) => a + N(r.line_items), 0)
console.log('\n── FUNNEL (Aug 1 – Sep 13 2026) ──')
console.log('status'.padEnd(24) + 'lines'.padStart(9) + 'orders'.padStart(9) + 'value'.padStart(16) + 'share'.padStart(8) + 'avg age'.padStart(9))
for (const r of funnel) {
  console.log(String(r.Final_status).padEnd(24) + String(N(r.line_items)).padStart(9) +
    String(N(r.orders)).padStart(9) + F(N(r.order_value)).padStart(16) +
    ((N(r.order_value) / tot) * 100).toFixed(1).padStart(7) + '%' + String(N(r.avg_age_days)).padStart(9))
}
console.log('TOTAL'.padEnd(24) + String(totLines).padStart(9) + ' '.repeat(9) + F(tot).padStart(16))

const unref = leak.reduce((a, r) => a + N(r.unrefunded), 0)
console.log('\n── NOT DELIVERED, NOT REFUNDED ──')
console.log('exposure: ' + F(unref))
console.log('\ntop 10 by unrefunded value:')
for (const r of leak.slice(0, 10)) {
  console.log('  ' + String(r.Final_status).padEnd(20) + String(r.financial_status || '-').padEnd(14) +
    String(r.refund_txn).padEnd(14) + String(N(r.line_items)).padStart(7) + F(N(r.unrefunded)).padStart(14) +
    String(N(r.avg_age_days)).padStart(6) + 'd')
}
console.log('\nwritten: ' + OUT)
