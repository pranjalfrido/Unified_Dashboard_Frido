-- OUT-OF-STOCK LOSS — one row per master SKU that is out of stock today and sold in the last
-- 180 days. Used by api/inventory-oos.js (this file lives in api/data/ so the deploy bundles it) (Inventory Health > "OOS loss" view).
--
-- SKU key: the same resolution the Inventory Health page uses (api/_inventory_shared.js):
--   parseFinalSku  cut the code at the first "_" or "-raw"           (FR-ABC_RAW_PO24 -> FR-ABC)
--   normSku        upper-case, drop spaces and underscores
--   productid_sku_mapping  alias -> master SKU, else the code itself
-- Pseudo SKUs (COUP*, *DFA*) and bundles / COMBO are excluded, as on the page.
--
-- Stock (production.historical_inventory_till_date_UC, one snapshot per day since May-24):
--   Live facilities only (facility_master.FCs_Status_for_Invt = 'Live').
--   units = (Inventory + InventoryBlocked) x pack qty ("_PO24" = carton of 24), the page's total.
--   A SKU is in stock on a snapshot date when its units across live facilities > 0. Dates with
--   no snapshot at all are skipped (not counted as out of stock).
--
-- Out of stock today: no stock on the latest snapshot date (this decides WHICH SKUs are listed).
--
-- OOS since - from when Shopify D2C sales stopped, where that is a clear signal:
--   The SKU sold on D2C (fact_all_platform_sales_report, Channel = 'Shopify', any order placed) on
--   at least 20 of the 30 days up to its last D2C sale - i.e. it was selling continuously - and
--   has had no D2C sale since for longer than it normally goes without one:
--     silent days >= GREATEST(3, CEIL(3 x 30 / sale-days-in-those-30))
--   (a daily seller is "stopped" after 3 silent days; one selling every other day after 6).
--   Then OOS since = the day after that last D2C sale (oos_source 'D2C sales stop').
--   Otherwise - irregular sellers, or still selling - the stock date: the day after the last
--   in-stock snapshot (oos_source 'Stock').
--   days_oos         calendar days from OOS since to the snapshot date, inclusive
--   stock_days_oos   the stock-based figure (181 = not in stock in 180 d), kept for the never-
--                    in-stock check
--
-- Avg daily sale: B2C Unicommerce units (aggregated_uniware_sales_report, channels whose
-- uc_channel_desc is 'B2C Order' or unmapped - same rule as the page's Avg Sale) over the
-- SKU's LONGEST unbroken in-stock run in the last 180 days, i.e. demand while it could sell.
--
-- ASP: fact_all_platform_sales_report, last 180 days, Order_Status <> 'Cancelled', priced lines
-- only: SUM(SellingPrice_Inc_GST) / SUM(ItemQty), by master SKU. Falls back to Unicommerce
-- B2C revenue / units when the SKU is not in that fact (asp_source says which).
--
-- No in-stock run in 180 d (stock only outside live facilities, or never): the API falls back
-- to units_180 / 180 and labels the basis.
--
-- Loss of sale opportunity = days_oos x avg daily sale x ASP.

-- The calculation date: the LATEST SALES DATE - the same date Inventory Health shows as "Latest
-- sales" (max order_date of production.inventory_sales_window, which the page's sales come from) -
-- capped at the latest stock snapshot. Stock state, days OOS and the windows all end on it.
DECLARE asof DATE DEFAULT LEAST(
  (SELECT MAX(order_date) FROM `frido-429506.production.inventory_sales_window`),
  (SELECT MAX(inventory_date) FROM `frido-429506.production.historical_inventory_till_date_UC`
   WHERE inventory_date >= DATE_SUB(CURRENT_DATE('Asia/Kolkata'), INTERVAL 7 DAY)));
DECLARE win_start DATE DEFAULT DATE_SUB(asof, INTERVAL 179 DAY);

CREATE TEMP FUNCTION norm_sku(s STRING) AS (REGEXP_REPLACE(UPPER(TRIM(s)), r'[\s_]+', ''));
CREATE TEMP FUNCTION final_sku(s STRING) AS (TRIM(REPLACE(SUBSTR(s, 1, LEAST(
  IF(STRPOS(s, '_') > 0, STRPOS(s, '_') - 1, LENGTH(s)),
  IF(STRPOS(LOWER(s), '-raw') > 0, STRPOS(LOWER(s), '-raw') - 1, LENGTH(s)))), '_', ' ')));

WITH
sku_map AS (
  SELECT norm_sku(productid) AS k, ANY_VALUE(norm_sku(masterskucode)) AS master
  FROM `frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping`
  WHERE TRIM(masterskucode) NOT IN ('', 'not found') AND norm_sku(productid) != ''
  GROUP BY 1
),
item AS (
  SELECT norm_sku(Product_Code) AS k,
         ANY_VALUE(TRIM(Product_Code)) AS sku_code, ANY_VALUE(TRIM(Name)) AS product_name,
         ANY_VALUE(TRIM(Category_Name)) AS category, ANY_VALUE(TRIM(Sub_category)) AS sub_category,
         ANY_VALUE(SAFE_CAST(Lead_Time AS FLOAT64)) AS lead_time, ANY_VALUE(Product_Source) AS product_source,
         LOGICAL_OR(UPPER(TRIM(Type)) = 'BUNDLE' OR UPPER(TRIM(Category_Name)) = 'COMBO') AS is_bundle
  FROM `frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master`
  WHERE Product_Code IS NOT NULL
  GROUP BY 1
),
live AS (
  SELECT DISTINCT Facility FROM `frido-429506.inventory_sales_allocation.facility_master`
  WHERE FCs_Status_for_Invt = 'Live'
),

-- ---------------- daily stock per master SKU ----------------
inv_rows AS (
  SELECT h.inventory_date AS d, h.ItemSkuCode AS code,
         (COALESCE(h.Inventory, SAFE_CAST(h.Inventory_st AS INT64), 0)
          + COALESCE(h.InventoryBlocked, SAFE_CAST(h.InventoryBlocked_st AS INT64), 0))
         * COALESCE(SAFE_CAST(REGEXP_EXTRACT(UPPER(h.ItemSkuCode), r'P[O0][_\s]*(\d+)') AS INT64), 1) AS units,
         COALESCE(h.OpenPurchase, SAFE_CAST(h.OpenPurchase_st AS INT64), 0) AS open_po,
         COALESCE(h.PutawayPending, SAFE_CAST(h.PutawayPending_st AS INT64), 0) AS putaway
  FROM `frido-429506.production.historical_inventory_till_date_UC` h
  JOIN live USING (Facility)
  WHERE h.inventory_date BETWEEN win_start AND asof
    AND NOT REGEXP_CONTAINS(UPPER(h.ItemSkuCode), r'COUP|DFA')
  QUALIFY ROW_NUMBER() OVER (PARTITION BY h.inventory_date, h.Facility, h.ItemSkuCode ORDER BY h.Updated DESC) = 1
),
inv_keyed AS (
  SELECT d, COALESCE(m.master, norm_sku(final_sku(code))) AS k, units, open_po, putaway
  FROM inv_rows LEFT JOIN sku_map m ON m.k = norm_sku(final_sku(code))
),
stock_day AS (
  SELECT k, d, SUM(units) AS units, SUM(open_po) AS open_po, SUM(putaway) AS putaway
  FROM inv_keyed WHERE k != '' GROUP BY k, d
),
cal AS (   -- snapshot dates that exist, numbered so runs can span a missing day
  SELECT d, ROW_NUMBER() OVER (ORDER BY d) AS idx FROM (SELECT DISTINCT d FROM inv_rows)
),
in_stock AS (
  SELECT s.k, s.d, c.idx FROM stock_day s JOIN cal c USING (d) WHERE s.units > 0
),
runs AS (   -- gaps-and-islands over snapshot dates
  SELECT k, MIN(d) AS run_start, MAX(d) AS run_end, COUNT(*) AS snap_days
  FROM (SELECT k, d, idx - ROW_NUMBER() OVER (PARTITION BY k ORDER BY d) AS grp FROM in_stock)
  GROUP BY k, grp
),
longest AS (
  SELECT k, run_start, run_end, DATE_DIFF(run_end, run_start, DAY) + 1 AS run_days
  FROM runs
  QUALIFY ROW_NUMBER() OVER (PARTITION BY k ORDER BY snap_days DESC, run_end DESC) = 1
),
stock_summary AS (
  SELECT k,
         MAX(IF(units > 0, d, NULL)) AS last_in_stock,
         COUNTIF(units > 0) AS in_stock_days_180,
         SUM(IF(d = asof, units, 0)) AS units_today,
         SUM(IF(d = asof, open_po, 0)) AS open_po_today,
         SUM(IF(d = asof, putaway, 0)) AS putaway_today
  FROM stock_day GROUP BY k
),

-- ---------------- Shopify D2C: when did continuous selling stop? ----------------
d2c_day AS (
  SELECT COALESCE(m.master, norm_sku(f.masterskucode)) AS k, f.OrderDate AS d
  FROM `frido-429506.production.fact_all_platform_sales_report` f
  LEFT JOIN sku_map m ON m.k = norm_sku(f.masterskucode)
  WHERE f.Channel = 'Shopify' AND f.ItemQty > 0
    AND f.OrderDate BETWEEN DATE_SUB(win_start, INTERVAL 30 DAY) AND asof
  GROUP BY 1, 2
),
d2c_last AS (SELECT k, MAX(d) AS last_sale FROM d2c_day GROUP BY k),
d2c_stop AS (
  SELECT l.k, l.last_sale,
         COUNT(*) AS sale_days_30,
         GREATEST(3, CAST(CEIL(3 * 30 / COUNT(*)) AS INT64)) AS stop_after_days,
         DATE_DIFF(asof, l.last_sale, DAY) AS silent_days
  FROM d2c_last l JOIN d2c_day x ON x.k = l.k AND x.d BETWEEN DATE_SUB(l.last_sale, INTERVAL 29 DAY) AND l.last_sale
  GROUP BY l.k, l.last_sale
),

-- ---------------- B2C Unicommerce sales per master SKU per day ----------------
b2c_channel AS (
  SELECT UPPER(TRIM(uniware_channels)) AS ch, ANY_VALUE(channel_description) AS descr
  FROM `frido-429506.inventory_sales_allocation.uc_channel_desc` GROUP BY 1
),
sales_day AS (
  SELECT COALESCE(m.master, norm_sku(final_sku(s.final_sku))) AS k, s.order_date AS d, SUM(s.total_quantity) AS qty, SUM(s.total_revenue) AS rev
  FROM `frido-429506.production.aggregated_uniware_sales_report` s
  LEFT JOIN b2c_channel c ON c.ch = UPPER(TRIM(s.channel))
  LEFT JOIN sku_map m ON m.k = norm_sku(final_sku(s.final_sku))
  WHERE s.order_date BETWEEN win_start AND asof
    AND (c.descr = 'B2C Order' OR c.descr IS NULL)
    AND NOT REGEXP_CONTAINS(UPPER(s.final_sku), r'COUP|DFA')
  GROUP BY 1, 2
),
window_sales AS (
  SELECT l.k, SUM(sd.qty) AS window_units
  FROM longest l JOIN sales_day sd ON sd.k = l.k AND sd.d BETWEEN l.run_start AND l.run_end
  GROUP BY l.k
),
sales_summary AS (
  SELECT k, SUM(qty) AS units_180, MAX(IF(qty > 0, d, NULL)) AS last_sale,
         SAFE_DIVIDE(SUM(IF(rev > 0, rev, 0)), SUM(IF(rev > 0, qty, 0))) AS uc_asp
  FROM sales_day GROUP BY k
),

-- ---------------- ASP from the all-platform sales fact ----------------
asp AS (
  SELECT COALESCE(m.master, norm_sku(f.masterskucode)) AS k,
         SAFE_DIVIDE(SUM(f.SellingPrice_Inc_GST), SUM(f.ItemQty)) AS asp
  FROM `frido-429506.production.fact_all_platform_sales_report` f
  LEFT JOIN sku_map m ON m.k = norm_sku(f.masterskucode)
  WHERE f.OrderDate BETWEEN win_start AND asof
    AND IFNULL(f.Order_Status, '') != 'Cancelled'
    AND f.ItemQty > 0 AND f.SellingPrice_Inc_GST > 0
  GROUP BY 1
)

SELECT
  ss.k                                                         AS sku_key,
  COALESCE(i.sku_code, ss.k)                                   AS sku,
  i.product_name, IFNULL(i.category, 'Uncategorized') AS category, IFNULL(i.sub_category, 'Uncategorized') AS sub_category,
  i.product_source, i.lead_time,
  CAST(asof AS STRING)                                         AS as_of,
  CAST(st.last_in_stock AS STRING)                             AS last_in_stock,
  IF(st.last_in_stock IS NULL, 181, DATE_DIFF(asof, st.last_in_stock, DAY)) AS stock_days_oos,
  IF(ds.sale_days_30 >= 20 AND ds.silent_days >= ds.stop_after_days, 'D2C sales stop', 'Stock') AS oos_source,
  IF(ds.sale_days_30 >= 20 AND ds.silent_days >= ds.stop_after_days,
     ds.silent_days,
     IF(st.last_in_stock IS NULL, 181, DATE_DIFF(asof, st.last_in_stock, DAY)))  AS days_oos,
  CAST(ds.last_sale AS STRING) AS d2c_last_sale, ds.sale_days_30 AS d2c_sale_days_30, ds.stop_after_days AS d2c_stop_after_days,
  st.in_stock_days_180,
  CAST(l.run_start AS STRING) AS window_start, CAST(l.run_end AS STRING) AS window_end, l.run_days AS window_days,
  IFNULL(ws.window_units, 0) AS window_units,
  sa.units_180, CAST(sa.last_sale AS STRING) AS last_sale,
  ROUND(COALESCE(a.asp, sa.uc_asp), 2)                         AS asp,
  CASE WHEN a.asp IS NOT NULL THEN 'Sales report' WHEN sa.uc_asp IS NOT NULL THEN 'Unicommerce' END AS asp_source
FROM (SELECT k FROM stock_summary UNION DISTINCT SELECT k FROM sales_summary) ss
LEFT JOIN stock_summary st USING (k)
LEFT JOIN sales_summary sa USING (k)
LEFT JOIN longest l USING (k)
LEFT JOIN window_sales ws USING (k)
LEFT JOIN d2c_stop ds USING (k)
LEFT JOIN asp a USING (k)
LEFT JOIN item i USING (k)
WHERE IFNULL(st.units_today, 0) <= 0          -- out of stock on the latest snapshot
  AND IFNULL(sa.units_180, 0) > 0              -- and had B2C demand in the last 180 days
  AND NOT IFNULL(i.is_bundle, FALSE)
