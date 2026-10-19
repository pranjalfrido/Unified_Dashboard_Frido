-- Orders, cancellations and refunds — last 30 days.
--
-- Grain is ONE ROW PER LINE ITEM, because "order item value / selling price" is a line-item
-- figure: an order with three products has three different values. Order id, placed and
-- cancelled times repeat down the rows of one order. 30 days is ~320k rows over ~200k
-- orders. To get one row per order instead, see the note at the foot of this file.
--
-- Two things about the refund columns matter:
--
-- 1. refunds_processed_at, refunds_created_at and refund_transaction_status are STRINGs
--    holding a PIPE-DELIMITED LIST, not single values — an order refunded four times
--    carries "ts | ts | ts | ts". Casting the column straight to TIMESTAMP fails on every
--    multi-refund order, and reading it as one value would be wrong even where it parses.
--    They are split and the FIRST and LAST are reported, which is what "when did the refund
--    happen" means when there is more than one.
--
-- 2. A refund row is not automatically a completed refund. refund_transaction_status
--    carries per-refund outcomes, so "refund processed" is defined as having at least one
--    'success' rather than merely having a refund record.
--
-- Times are converted to IST. The source stores UTC (the strings end '+00'), so leaving
-- them would put an evening Indian order on the previous day.

WITH base AS (
  SELECT
    order_id,
    order_name,
    source_system,
    line_item_id,
    sku,
    item_name,
    qty,
    created_at_utc,
    cancelled_at,
    cancel_reason,
    financial_status,
    selling_price_excl_shipping_tax,
    gross_item_value,
    unit_price,
    refunds_processed_at,
    refunds_created_at,
    refund_transaction_status
  FROM `frido-429506.production.fact_shopify_myfrido_mobility_all_orders`
  -- order_date_ist is a DATE and the table is large, so filtering on it rather than on a
  -- derived timestamp keeps the scan down.
  WHERE order_date_ist >= DATE_SUB(CURRENT_DATE('Asia/Kolkata'), INTERVAL 30 DAY)
),

refunds AS (
  SELECT
    order_id,
    line_item_id,
    -- Earliest and latest successful-or-not refund timestamps on this row.
    MIN(ts) AS first_refund_at,
    MAX(ts) AS last_refund_at,
    COUNT(*) AS refund_count
  FROM (
    SELECT
      b.order_id,
      b.line_item_id,
      -- TRIM because the delimiter is " | " with spaces; SAFE.PARSE rather than CAST so a
      -- malformed entry yields NULL instead of failing the whole query.
      SAFE.PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S%Ez', TRIM(p)) AS ts
    FROM base b, UNNEST(SPLIT(b.refunds_processed_at, '|')) p
    WHERE b.refunds_processed_at IS NOT NULL AND TRIM(p) != ''
  )
  WHERE ts IS NOT NULL
  GROUP BY 1, 2
)

SELECT
  b.order_id                                   AS `Order_ID`,
  b.order_name                                 AS `Order_Name`,
  b.source_system                              AS `Store`,

  -- Placed
  DATETIME(b.created_at_utc, 'Asia/Kolkata')   AS `Order_Placed_At_IST`,

  -- Cancelled — NULL when the order was never cancelled
  DATETIME(b.cancelled_at, 'Asia/Kolkata')     AS `Order_Cancelled_At_IST`,
  b.cancel_reason                              AS `Cancel_Reason`,

  -- Item value. selling_price_excl_shipping_tax is the per-line selling price the rest of
  -- the warehouse reports on; gross and unit price are carried alongside so the figure can
  -- be reconciled without a second query.
  b.sku                                        AS `SKU`,
  b.item_name                                  AS `Item_Name`,
  b.qty                                        AS `Qty`,
  b.unit_price                                 AS `Unit_Price`,
  b.gross_item_value                           AS `Gross_Item_Value`,
  b.selling_price_excl_shipping_tax            AS `Selling_Price`,

  -- Refund
  (r.order_id IS NOT NULL
     AND b.refund_transaction_status LIKE '%success%') AS `Refund_Processed`,
  DATETIME(r.first_refund_at, 'Asia/Kolkata')  AS `First_Refund_At_IST`,
  DATETIME(r.last_refund_at,  'Asia/Kolkata')  AS `Last_Refund_At_IST`,
  COALESCE(r.refund_count, 0)                  AS `Refund_Count`,
  b.refund_transaction_status                  AS `Refund_Status`,
  b.financial_status                           AS `Financial_Status`

FROM base b
LEFT JOIN refunds r
  ON  r.order_id     = b.order_id
  AND r.line_item_id = b.line_item_id
ORDER BY `Order_Placed_At_IST` DESC, `Order_ID`, `SKU`

-- One row per ORDER instead of per line item: wrap the above as `t` and
--   SELECT `Order_ID`, ANY_VALUE(`Order_Placed_At_IST`) ..., SUM(`Selling_Price`) ...
--   FROM t GROUP BY `Order_ID`
-- Summing Selling Price is the only safe aggregate here; the rest repeat per row.
