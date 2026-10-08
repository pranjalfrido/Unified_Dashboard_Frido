-- Cross-system order exceptions — Shopify vs Unicommerce vs Clickpost.
--
-- Finds orders where the three systems disagree in ways that indicate a real operational
-- problem rather than a normal in-flight state. Built to run daily: change the date window
-- at the foot of the `base` CTE to shorten it.
--
-- Source is fact_all_platform_sales_report, NOT fact_shopify_myfrido_mobility_all_orders.
-- The latter carries only Shopify's own view — no Unicommerce or Clickpost status — so four
-- of these five checks cannot be expressed against it.
--
-- Two of the requested rules name statuses this data does not use. Mapped to what exists:
--   "ready to ship in UC"  -> DISPATCHED is the only pre-delivery UC state here; there is
--                             no READY_TO_SHIP value in the column.
--   "Pickup_exception"     -> PickupFailed, the actual Clickpost value.
--
-- Grain is one row per ORDER. The table is line-item level, so statuses are collapsed with
-- ANY_VALUE — they are order-level attributes repeated down the lines.

WITH base AS (
  SELECT
    OrderId,
    ANY_VALUE(Channel)             AS channel,
    MIN(OrderDate)                 AS order_date,
    ANY_VALUE(Order_Status)        AS shopify_status,
    ANY_VALUE(Unicommerce_Status)  AS uc_status,
    ANY_VALUE(Clickpost_Status)    AS cp_status,
    ANY_VALUE(FinancialStatus)     AS financial_status,
    ANY_VALUE(FulfilmentStatus)    AS fulfilment_status,
    ANY_VALUE(Dispatch_Date)       AS dispatch_date,
    ANY_VALUE(Delivered_Date)      AS delivered_date,
    SUM(SellingPrice_Inc_GST)      AS order_value,
    COUNT(*)                       AS line_items
  FROM `frido-429506.production.fact_all_platform_sales_report`
  WHERE OrderDate BETWEEN DATE_TRUNC(DATE_SUB(CURRENT_DATE('Asia/Kolkata'), INTERVAL 1 MONTH), MONTH)
                      AND LAST_DAY(DATE_SUB(CURRENT_DATE('Asia/Kolkata'), INTERVAL 1 MONTH))
    AND Channel = 'Shopify'          -- the only channel flowing through UC + Clickpost
    AND OrderId IS NOT NULL
  GROUP BY OrderId
),

flagged AS (
  SELECT *,
    CASE
      -- 1. Placed on Shopify, never created in Unicommerce. Cancellations are excluded:
      --    an order cancelled before it syncs legitimately never reaches UC.
      WHEN uc_status IS NULL
           AND COALESCE(shopify_status,'') NOT IN ('Cancelled')
        THEN '1. Not synced to Unicommerce'

      -- 2. Delivered per Clickpost but UC still shows it as pre-delivery. The courier has
      --    completed the job and the warehouse record never moved — manifest not closed.
      WHEN cp_status = 'Delivered' AND uc_status = 'DISPATCHED'
        THEN '2. Delivered in Clickpost, still DISPATCHED in UC'

      -- 3. Dispatched in UC but the courier never picked it up. The parcel is sitting at the
      --    warehouse against a record that says it left.
      WHEN uc_status = 'DISPATCHED' AND cp_status IN ('PickupFailed','PickupScheduled','PickupException')
        THEN '3. Dispatched in UC, pickup failed in Clickpost'

      -- 4. Delivered per Clickpost but Shopify disagrees. Excludes RTO and returns, which
      --    are genuine post-delivery states rather than a mismatch.
      WHEN cp_status = 'Delivered'
           AND COALESCE(shopify_status,'') NOT IN ('Delivered','Exchange','CIR','Return','RTO','Credit Note')
        THEN '4. Delivered in Clickpost, Shopify says otherwise'

      -- 5. Cancelled on Shopify with the money still held. voided is excluded — an
      --    authorisation released without capture needs no refund.
      WHEN shopify_status = 'Cancelled'
           AND COALESCE(financial_status,'') IN ('paid','partially_paid')
        THEN '5. Cancelled but not refunded'

      -- 6. Cancelled on Shopify after the courier already delivered it. Money and goods are
      --    both out; this is the most expensive mismatch of the set.
      WHEN shopify_status = 'Cancelled' AND cp_status = 'Delivered'
        THEN '6. Cancelled on Shopify but delivered by courier'

      -- 7. UC cancelled while the shipment is still moving — nobody has recalled the parcel.
      WHEN uc_status = 'CANCELLED'
           AND cp_status IN ('InTransit','OutForDelivery','DestinationHubIn','ShipmentDelayed')
        THEN '7. Cancelled in UC but shipment still in transit'

      -- 8. In Clickpost, absent from UC. The reverse of (1): shipped without a warehouse
      --    record, so inventory will not have been decremented.
      WHEN cp_status IS NOT NULL AND uc_status IS NULL
           AND COALESCE(shopify_status,'') NOT IN ('Cancelled')
        THEN '8. In Clickpost but missing from UC'
    END AS exception_type
  FROM base
)

SELECT
  exception_type   AS Exception,
  OrderId          AS Order_ID,
  order_date       AS Order_Date,
  shopify_status   AS Shopify_Status,
  uc_status        AS Unicommerce_Status,
  cp_status        AS Clickpost_Status,
  financial_status AS Financial_Status,
  dispatch_date    AS Dispatch_Date,
  delivered_date   AS Delivered_Date,
  ROUND(order_value, 2) AS Order_Value,
  line_items       AS Line_Items
FROM flagged
WHERE exception_type IS NOT NULL
ORDER BY Exception, Order_Date DESC, Order_ID

-- Counts per exception type, for a daily summary:
--   SELECT Exception, COUNT(*) orders, ROUND(SUM(Order_Value)) value
--   FROM ( <the query above> ) GROUP BY 1 ORDER BY 2 DESC
