# Frido Data Knowledge

## For every question — read this first
1. Find the metric in PULSE_METRICS.md (match the synonyms) and follow PULSE_PLAYBOOK.md (defaults, which page a metric must match, answer format).
2. Order of sources: playbook → PULSE_METRICS.md → the locked SQL below / the dashboard logic for that page (read the file the playbook names with target=repo) → your own logic. **Own logic is always labelled on the first line: `Custom calculation, not from the dashboard:` + the definition in one line** (e.g. "critical = lowest days of inventory, Regular warehouses, avg sale over the last 30 days"). Only use own logic when no locked template or metric fits.
3. **Dates: use the literal IST dates from the "Dates" block.** Never work out dates yourself and never use UTC.
4. **Return raw values from SQL** (never divide by 100000 / 10000000, never alias `_lakhs` / `_cr`). The connector formats ₹ amounts, counts and percentages in the Indian system before you see them — each formatted cell also shows the raw value. **Copy the formatted value; never convert units yourself.**
5. **SKU answers:** select the SKU column as `masterskucode` (or `item_sku_code`). The connector adds `Sub_Category (product name)` and `Category` from the SKU master. Show `SKU · Sub-category · Category · numbers`. Never write a product name yourself; if a SKU is `not in SKU master`, say that.
6. Before filtering on any text column (status, channel, courier, SKU), run SELECT DISTINCT to see the real values.
7. Sanity-check your result before answering — plausible numbers, sensible row counts.
8. **Never write, update, delete or create anything. Never invent numbers.** If asked to change or delete data, refuse in one line.
9. **If a tool or file read is DENIED:** never retry the same thing. After 1 denial switch route: the locked templates, other allowed tables, or your own logic (labelled). Max 2 denials per question, then answer with what you have.
10. **Never finish with only "the data query failed".** If you truly can't answer, say in one line what you tried and what is missing.

## Tables

### BigQuery (project: frido-429506)
| Table | Use for |
|---|---|
| `production.fact_all_platform_sales_report` | All sales, revenue, returns, RTO, CIR, orders, units |
| `production.Clickpost_Shipment_Tracking_Report` | Logistics → Performance: RTO %, delivery rate, TAT, EDD breach, stuck, pending, NDR, courier performance. Courier **cost** is NOT answered from here — it comes from Logistics → Cost (courier invoice ledger); if you can't reach it, say so |
| `production.Aggregated_uniware_sales_report` | Inward/receiving, warehouse movements, **B2C unit sales for OOS/inventory-planning avg daily sale** |
| `production.historical_inventory_till_date_UC` | Daily stock history per SKU per facility — used to find in-stock runs for OOS loss calculation |
| `production.pincode_city_master` | State, city, region, tier mapping by pincode |
| `sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master` | Product master: category, GST rate, weight, dimensions |
| `sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping` | ProductId → MasterSKU aliases |

### Supabase
| Table | Use for |
|---|---|
| `inv_snapshot` | Current inventory by SKU + facility — columns: `item_sku_code`, `facility`, `updated` (timestamp), `rtd_invt`, `raw_invt`, `raw_blocked_invt`, `inventory`, `inventory_blocked`. No `snapshot_at` or `updated_at` column. |
| `sales_window` | Recent sales for avg daily sale calculation |
| `item_master` | Product master (synced hourly from BigQuery) |
| `cogs_ledger` | COGS per SKU per month — columns: `itemskucode`, `month` (text, format `YYYY-MM`), `cogs` (numeric), `category`, `subcategory`, `is_explicit`. **Note: data may lag 1-2 months; check `SELECT DISTINCT month FROM cogs_ledger ORDER BY month DESC LIMIT 3` before assuming current month is available.** |
| `facility_master` | Warehouse metadata, FC status, location |
| `sales_90d` | 90-day aggregates for dead-stock detection |

## Known metrics — reuse these, don't regenerate

Sales percentages (CIR, cancellation, return components) are **REVENUE-BASED** (÷ Gross Revenue Inc GST). **RTO %, delivery rate, TAT, EDD breach, stuck and pending are SHIPMENT-BASED from Clickpost (Logistics → Performance).** Locked SQL is in the sections below — use it directly.

| Metric | Formula location | Key notes |
|---|---|---|
| Gross Revenue (Inc/Exc GST) | locked formula below | SUM(SellingPrice_Inc_GST) / SUM(SellingPrice_Exc_GST) — see "EXACT formula for Gross Revenue" |
| Net Revenue | locked formula below | Gross Exc GST × Retained Share after returns/cancels — see "EXACT formula for Net Revenue" |
| RTO % | locked formula below | **Logistics → Performance only (Clickpost, shipment-based)** — RTO shipments ÷ forward shipments. Sep 2026 = 8.2%. See "EXACT SQL for Logistics Performance". Never the revenue-based version. |
| CIR % | locked formula below | **REVENUE-BASED** — CIR Revenue ÷ Gross Revenue (Inc GST) × 100. NEVER order-count-based. See "EXACT formula for CIR %" section. |
| Returns % | locked formula below | Mature window (today-44d to today-14d), NOT selected date range — see "EXACT SQL for SKU return %" section |
| Delivery Rate, TAT, EDD breach | locked formula below | Same Clickpost base as RTO % — see "EXACT SQL for Logistics Performance" |
| Stuck Shipments | locked formula below | The page's "Critical Stuck" — see "EXACT SQL for Stuck Shipments" |
| DOI | locked formula below | Total inventory / Avg daily sale — use the "EXACT query for total inventory" section, do NOT read _inventory_shared.js |
| Avg Daily Sale (OOS loss / inventory planning) | locked formula below | **DIFFERENT from Inventory Health's Avg Sale** — longest in-stock run method, not recent-days average. See "EXACT formula for Avg Daily Sale (OOS/planning)" section. |
| Channel mapping | locked below | See channel groups section |

## EXACT formula for Gross Revenue — use this, never invent

```sql
SELECT
  SUM(SellingPrice_Inc_GST) AS gross_revenue_inc_gst,
  SUM(SellingPrice_Exc_GST) AS gross_revenue_exc_gst,
  COUNT(DISTINCT OrderId) AS orders,
  SUM(ItemQty) AS units
FROM `frido-429506.production.fact_all_platform_sales_report`
WHERE OrderDate BETWEEN '${start}' AND '${end}'
  AND NOT (OrderId LIKE '%_EX%')
  AND NOT (Channel = 'offline_sales' AND COALESCE(Order_Status, '') = 'Credit Note')
  AND NOT (Channel = 'Amazon' AND COALESCE(Order_Status, '') = 'RTV (Return to vendor)')
```
- Include ALL `Order_Status` values (Delivered, RTO, CIR, Return, Cancelled, etc.) — gross revenue is the full top line before any deductions.
- Add `GROUP BY Channel` or `GROUP BY masterskucode` as needed.

## EXACT formula for Net Revenue — use this, never invent

Net Revenue = Gross Revenue Exc GST × Retained Share, where Retained Share accounts for RTO/CIR/Returns/Cancels using mature-window rates.

**This is an approximation of the Sales page, not the page itself** (the page uses each day's real statuses for days older than 15 days and the SKU's rolling 30-day rate for the last 15, per-channel rules, and deducts the full cancellation incl. COD). Label the answer `Custom calculation, not from the dashboard:` + "net revenue = gross ex GST × (1 − RTO − CIR − Return − prepaid cancel %) using the mature window". The Step 4 `sales_summary` tool replaces this.

```sql
WITH base AS (
  SELECT
    SUM(SellingPrice_Exc_GST) AS gross_exc_gst,
    SUM(SellingPrice_Inc_GST) AS gross_inc_gst,
    SAFE_DIVIDE(
      SUM(CASE WHEN Order_Status = 'RTO'       THEN SellingPrice_Exc_GST ELSE 0 END),
      SUM(SellingPrice_Exc_GST)
    ) AS rto_pct,
    SAFE_DIVIDE(
      SUM(CASE WHEN Order_Status = 'CIR'       THEN SellingPrice_Exc_GST ELSE 0 END),
      SUM(SellingPrice_Exc_GST)
    ) AS cir_pct,
    SAFE_DIVIDE(
      SUM(CASE WHEN Order_Status = 'Return'    THEN SellingPrice_Exc_GST ELSE 0 END),
      SUM(SellingPrice_Exc_GST)
    ) AS return_pct,
    SAFE_DIVIDE(
      SUM(CASE WHEN Order_Status = 'Cancelled' AND payment_type != 'COD'
                                               THEN SellingPrice_Exc_GST ELSE 0 END),
      SUM(SellingPrice_Exc_GST)
    ) AS prepaid_cancel_pct
  FROM `frido-429506.production.fact_all_platform_sales_report`
  -- Mature window for rates (today-43d to today-14d, 30 days) — NOT the user's date range
  WHERE OrderDate BETWEEN '${mature_start}' AND '${mature_end}'  -- literal dates from the Dates block
    AND NOT (OrderId LIKE '%_EX%')
    AND NOT (Channel = 'offline_sales' AND COALESCE(Order_Status, '') = 'Credit Note')
    AND NOT (Channel = 'Amazon' AND COALESCE(Order_Status, '') = 'RTV (Return to vendor)')
),
current_gross AS (
  SELECT SUM(SellingPrice_Exc_GST) AS gross_exc_gst
  FROM `frido-429506.production.fact_all_platform_sales_report`
  WHERE OrderDate BETWEEN '${start}' AND '${end}'
    AND NOT (OrderId LIKE '%_EX%')
    AND NOT (Channel = 'offline_sales' AND COALESCE(Order_Status, '') = 'Credit Note')
    AND NOT (Channel = 'Amazon' AND COALESCE(Order_Status, '') = 'RTV (Return to vendor)')
)
SELECT
  cg.gross_exc_gst AS gross_revenue_exc_gst,
  ROUND(cg.gross_exc_gst * (1 - b.rto_pct - b.cir_pct - b.return_pct - b.prepaid_cancel_pct), 0) AS net_revenue
FROM current_gross cg, base b
```
- Return/cancel rates always come from the **mature window** (today-44d to today-14d), applied against the **current period** gross. Never use current-period rates for net revenue — recent orders haven't settled yet and will give artificially high net revenue.
- COD cancellations are excluded from the cancel deduction (only prepaid cancels are deducted).

## EXACT formula for CIR % — use this, never invent

**CIR % is REVENUE-BASED, not order-count-based.**

Correct formula (matches dashboard):
```
CIR % = SUM(SellingPrice_Inc_GST WHERE Order_Status = 'CIR') / SUM(SellingPrice_Inc_GST) × 100
```

**Wrong formula — never use this:**
```
❌ CIR orders / (Delivered orders + CIR orders)   ← order-count ratio, always wrong
❌ CIR orders / Total orders                       ← order-count ratio, always wrong
```

```sql
SELECT
  ROUND(
    SAFE_DIVIDE(
      SUM(CASE WHEN Order_Status = 'CIR' THEN SellingPrice_Inc_GST ELSE 0 END),
      SUM(SellingPrice_Inc_GST)
    ) * 100, 2
  ) AS cir_pct,
  SUM(CASE WHEN Order_Status = 'CIR' THEN SellingPrice_Inc_GST ELSE 0 END) AS cir_revenue,
  SUM(SellingPrice_Inc_GST) AS gross_revenue_inc_gst
FROM `frido-429506.production.fact_all_platform_sales_report`
WHERE OrderDate BETWEEN '${start}' AND '${end}'
  AND NOT (OrderId LIKE '%_EX%')
  AND NOT (Channel = 'offline_sales' AND COALESCE(Order_Status, '') = 'Credit Note')
  AND NOT (Channel = 'Amazon' AND COALESCE(Order_Status, '') = 'RTV (Return to vendor)')
```
- Denominator is **all rows' revenue** in the period — not just delivered orders.
- Add `GROUP BY Channel` for channel-level breakdown.

## EXACT SQL for Logistics Performance (RTO %, delivery rate, TAT, EDD breach) — use this, never invent

Source: Logistics → Performance (`api/logistics.js`). **RTO % is shipment-based and comes ONLY from here.** Real column names: `courier_partner` (not courier_partner_name), `shipment_type` values `Forward` / `Reverse` (compare with `LOWER(TRIM(shipment_type))`), dates are STRINGS (`created_at`, `delivery_date`, … — parse with SAFE.PARSE_DATE / SAFE.PARSE_TIMESTAMP as below). One row per AWB.

```sql
WITH base AS (
  SELECT
    c.awb,
    CASE
      WHEN LOWER(c.courier_partner) LIKE '%bluedart%' THEN 'Bluedart'
      WHEN LOWER(c.courier_partner) LIKE '%ekart%' THEN 'Ekart'
      WHEN LOWER(c.courier_partner) LIKE '%elastic%' THEN 'ElasticRun'
      WHEN LOWER(c.courier_partner) LIKE '%delhivery%' AND LEFT(c.awb, 4) = '5448' THEN 'Delhivery NDD'
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
    CASE
      WHEN c.clickpost_unified_status = 'Delivered' THEN 'Delivered'
      WHEN c.clickpost_unified_status = 'NoStatusExist' AND LOWER(c.latest_remark) LIKE '%delivered%' THEN 'Delivered'
      WHEN c.clickpost_unified_status IN ('RTO-Marked','RTO-ShipmentDelay','RTO-InTransit','RTO-Delivered','RTO-Requested','RTO-ContactCustomerCare','RTO-OutForDelivery','RTO-Failed') THEN 'RTO'
      WHEN c.clickpost_unified_status = 'NoStatusExist' AND LOWER(c.latest_remark) LIKE '%rto%' THEN 'RTO'
      WHEN c.clickpost_unified_status IN ('PickupFailed','OutForPickup','PickupPending','OrderPlaced') THEN 'Pickup Pending'
      WHEN c.clickpost_unified_status IN ('ShipmentHeld','ContactCustomerCare','InTransit','DestinationHubIn','FailedDelivery','ShipmentDelayed','PickedUp','OutForDelivery','OriginCityOut','OriginCityIn') THEN 'Intransit'
      WHEN c.clickpost_unified_status = 'Cancelled' THEN 'Cancelled'
      WHEN c.clickpost_unified_status IN ('Lost','Damaged') THEN 'Lost/Damaged'
      ELSE 'Others'
    END AS unified_status,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(c.delivery_date, 1, 10)) AS delivery_date,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(c.expected_delivery_date_by_courier_partner, 1, 10)) AS edd,
    SAFE.PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S', SUBSTR(c.pickup_date, 1, 19)) AS pickup_ts,
    SAFE.PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S', SUBSTR(c.delivery_date, 1, 19)) AS delivery_ts
  FROM `frido-429506.production.Clickpost_Shipment_Tracking_Report` c
  WHERE DATE(c.created_at) BETWEEN '${start}' AND '${end}'      -- shipment CREATED date
    AND LOWER(TRIM(c.shipment_type)) = 'forward'                -- forward only unless reverse is asked
  QUALIFY ROW_NUMBER() OVER (PARTITION BY c.awb ORDER BY c.created_at) = 1
)
SELECT
  courier_group AS courier,
  COUNT(awb) AS total_shipments,
  COUNTIF(unified_status = 'Delivered') AS delivered,
  COUNTIF(unified_status = 'RTO') AS rto_shipments,
  ROUND(SAFE_DIVIDE(COUNTIF(unified_status = 'RTO'), COUNT(awb)) * 100, 2) AS rto_pct,
  ROUND(SAFE_DIVIDE(COUNTIF(unified_status = 'Delivered'), COUNT(awb)) * 100, 2) AS delivery_rate_pct,
  ROUND(AVG(IF(pickup_ts IS NOT NULL AND delivery_ts IS NOT NULL AND TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) BETWEEN 0 AND 28800,
                TIMESTAMP_DIFF(delivery_ts, pickup_ts, MINUTE) / 1440.0, NULL)), 2) AS avg_tat_days,
  COUNTIF(delivery_date IS NOT NULL AND edd IS NOT NULL AND delivery_date > edd) AS delivered_after_edd,
  COUNTIF(delivery_date IS NOT NULL AND edd IS NOT NULL) AS delivered_with_edd,
  ROUND(SAFE_DIVIDE(COUNTIF(delivery_date IS NOT NULL AND edd IS NOT NULL AND delivery_date > edd),
                    COUNTIF(delivery_date IS NOT NULL AND edd IS NOT NULL)) * 100, 2) AS edd_breach_pct
FROM base
GROUP BY courier_group
ORDER BY total_shipments DESC
```
- **For the overall number (not by courier): remove `courier_group` from the SELECT and drop the GROUP BY.**
- RTO % = RTO shipments ÷ ALL forward shipments created in the range (cancelled and in-transit stay in the denominator). Delivery rate uses the same denominator.
- **TAT** on the page = "Avg In-Transit": pickup → delivery in days (kept only if 0–20 days). The page also has fulfilment TAT (order → delivery); say which one you give. **EDD breach %** = delivered after EDD ÷ delivered with an EDD.
- The Logistics page has **no channel filter**: for "RTO for D2C" give the page number and say in the Source line that Logistics → Performance covers all channels' forward shipments.
- Date column is the shipment created date (`DATE(created_at)`), not the order date.
- Reverse shipments: only when asked (`= 'reverse'`).

## EXACT SQL for Stuck Shipments — use this, never invent

The dashboard's definition is **"Critical Stuck"**: a forward shipment that is in transit, whose expected delivery date (EDD) was more than 5 days ago and has no delivery date, within the selected created-date range. (The older "no update for 3+ days" rule is not on the dashboard; do not use it.)

Use the `base` CTE from "EXACT SQL for Logistics Performance" (same filters and `unified_status`), then:
```sql
SELECT
  courier_group AS courier,
  COUNTIF(edd IS NOT NULL AND edd < DATE_SUB(CURRENT_DATE('Asia/Kolkata'), INTERVAL 5 DAY)
          AND delivery_date IS NULL AND unified_status = 'Intransit') AS critical_stuck_shipments
FROM base
GROUP BY courier_group
ORDER BY critical_stuck_shipments DESC
```
For the total, remove `courier_group` and the GROUP BY. "EDD breached" (a separate card) = not Delivered/RTO-Delivered, has a pickup date and EDD, and today is after EDD.

**Pending shipments** = Pickup Pending + Intransit (status groups in the CTE above), shipments created in the range.

## EXACT SQL template for SKU-level revenue — use this, never invent
```sql
SELECT masterskucode,
  SUM(SellingPrice_Inc_GST) AS gross_revenue_inc_gst,
  SUM(SellingPrice_Exc_GST) AS gross_revenue_exc_gst,
  COUNT(DISTINCT OrderId) AS orders,
  SUM(ItemQty) AS units
FROM `frido-429506.production.fact_all_platform_sales_report`
WHERE OrderDate BETWEEN '${start}' AND '${end}'
  AND NOT (OrderId LIKE '%_EX%')
GROUP BY masterskucode
ORDER BY gross_revenue_inc_gst DESC
LIMIT 10
```
- GROUP BY `masterskucode` only — never COALESCE with ChannelSKUCode or ProductId
- Never REGEXP_REPLACE or UPPER/TRIM the SKU column — use it as-is

## EXACT SQL template for revenue by channel — use this, never invent filters
```sql
SELECT Channel, 
  SUM(SellingPrice_Inc_GST) AS gross_revenue_inc_gst,
  SUM(SellingPrice_Exc_GST) AS gross_revenue_exc_gst,
  COUNT(DISTINCT OrderId) AS orders,
  SUM(ItemQty) AS units
FROM `frido-429506.production.fact_all_platform_sales_report`
WHERE OrderDate BETWEEN '${start}' AND '${end}'
  AND NOT (OrderId LIKE '%_EX%')
GROUP BY Channel
ORDER BY gross_revenue_inc_gst DESC
```
- Only 1 filter needed: exclude `_EX` orders. Nothing else.
- Do NOT add RTV filters, Credit Note filters, Order_Type filters, payment_type filters, or any channel-level exclusions
- All 12 channels appear naturally: Shopify, Amazon, offline_sales, Retail, Flipkart, Blinkit, Myntra, Instamart, Zepto, CRED, Firstcry, International

## EXACT query for total inventory — use this, never invent

Total inventory lives in Supabase `inv_snapshot`. You MUST join against `facility_master` and filter `fcs_status_for_invt = 'Live'` — without this filter you include ~40 retired/Not-Live facilities and get a number ~7x too high.

```sql
-- Total sellable inventory across all Live facilities
SELECT
  SUM(
    CASE
      -- Vadgaon_OPS and Frido_Sudhawadi: pre-computed RTD/Raw split, use as-is (no pack-qty scaling)
      WHEN i.facility IN ('Vadgaon_OPS', 'Frido_Sudhawadi')
        THEN COALESCE(i.rtd_invt, 0) + COALESCE(i.raw_invt, 0) + COALESCE(i.raw_blocked_invt, 0)
      -- All other Live facilities: scale by pack_qty only for RAW SKUs
      -- RAW SKU = item_sku_code contains 'RAW', or matches standalone '-RW'/'-RWA' segment
      WHEN i.item_sku_code ~* 'RAW|[_-]RWA?([_-]|$)'
        THEN (COALESCE(i.inventory, 0) + COALESCE(i.inventory_blocked, 0))
             * COALESCE(NULLIF(CAST(regexp_match(i.item_sku_code, 'P[O0][_\s]*(\d+)')[1] AS INT), 0), 1)
      -- RTD SKUs: inventory (available) + inventory_blocked, no scaling
      ELSE COALESCE(i.inventory, 0) + COALESCE(i.inventory_blocked, 0)
    END
  ) AS total_inventory_units
FROM inv_snapshot i
JOIN facility_master f ON i.facility = f.facility
WHERE f.fcs_status_for_invt = 'Live'
  AND f.facility_type = 'Regular'
  AND i.item_sku_code NOT ILIKE '%COUP%'
  AND i.item_sku_code NOT ILIKE '%DFA%'
  AND EXISTS (
    SELECT 1 FROM item_master m
    WHERE m.product_code = REGEXP_REPLACE(i.item_sku_code, '(_RAW)?(_PO[0-9]+)?$', '')
  )  -- exclude Uncategorized SKUs (not in item_master) — dashboard excludes these too, ~48K units / 652 SKUs
```

**Critical rules — never break these:**
- `fcs_status_for_invt = 'Live'` is MANDATORY. Omitting it inflates total by ~7x (includes WareIQ, Zippee, old Vadgaon, FBA, factory facilities).
- **Always also filter `facility_type = 'Regular'`** (total, by warehouse, by SKU, DOI, critical) — this matches the dashboard's "Regular" tab (8 main WHs). Without it, EBO stores (~3K units), Dark Stores, and Frido stores (~15K units) are included and the total will be ~9.3L instead of the correct ~8.69L. Never include EBO, dark stores, Frido stores, FBA or non-live facilities. Say "as of <time>" using `MAX(updated)` of `inv_snapshot`.
- Pack-qty scaling (`× PO##`) applies ONLY to RAW SKUs — SKU contains 'RAW', standalone '-RW'/'-RWA', OR facility is `myfrido-Vadgaon_ITEM` (always raw). Never apply pack-qty to RTD SKUs.
- `Vadgaon_OPS` and `Frido_Sudhawadi` have pre-computed RTD/Raw/RawBlocked columns — use those as-is, do NOT apply pack-qty logic.
- Exclude pseudo-SKUs: `COUP` and `DFA` in item_sku_code.
- The 8 Live Regular WH locations are: PNQ (Vadgaon_OPS, Frido_Sudhawadi), GGN (Hexalog_GGN2), BLR (myfrido-BLR_Hexalog), MUM (Beyond_Mum), KOL (Aaj_Kol_Item), HYD (Losung_Hyderabad), CHN (Losung_Chennai).
- "Unmapped" facility rows (facility not in facility_master) = not Live, exclude them.
- **For warehouse-wise inventory question**, add `GROUP BY i.facility` to the locked SQL above and also join `facility_master` to get the location name.

## EXACT SQL for Returns (D2C breakdown and all channels)

Follows the Sales page (`computeNetRevenueMeasures` in `api/_bq.js`): every % is ÷ gross revenue Inc GST; **Total return = RTO + CIR + Return-status + prepaid-only cancellation**; Cancellations are shown at the full amount (COD incl.); Exchange is shown separately and is not part of Total return. Over the selected range with each order's actual status (the page also adds a rolling estimate for the last 15 days — say "actual statuses" in the Source line).

One query for both (the percentages and Total return are computed IN SQL — copy them, never re-add components yourself; the bold first-line total must equal the table):
```sql
WITH t AS (
  SELECT
    Channel,
    SUM(SellingPrice_Inc_GST) AS gross_inc_gst,
    SUM(IF(Order_Status = 'Cancelled', SellingPrice_Inc_GST, 0)) AS cancellation_rev,
    SUM(IF(Order_Status = 'RTO', SellingPrice_Inc_GST, 0)) AS rto_rev,
    SUM(IF(Order_Status = 'CIR', SellingPrice_Inc_GST, 0)) AS cir_rev,
    SUM(IF(Order_Status = 'Exchange', SellingPrice_Inc_GST, 0)) AS exchange_rev,
    SUM(IF(Order_Status = 'Return', SellingPrice_Inc_GST, 0)) AS return_status_rev,
    -- Total return = RTO + CIR + Return-status + prepaid-only cancellation (Exchange is NOT included)
    SUM(IF(Order_Status IN ('RTO', 'CIR', 'Return')
           OR (Order_Status = 'Cancelled' AND COALESCE(payment_type, '') != 'COD'), SellingPrice_Inc_GST, 0)) AS total_return_rev
  FROM `frido-429506.production.fact_all_platform_sales_report`
  WHERE OrderDate BETWEEN '${start}' AND '${end}'
    AND NOT (OrderId LIKE '%_EX%')
    AND NOT (Channel = 'offline_sales' AND COALESCE(Order_Status, '') = 'Credit Note')
    AND NOT (Channel = 'Amazon' AND COALESCE(Order_Status, '') = 'RTV (Return to vendor)')
    -- D2C only: add  AND Channel = 'Shopify' AND SubChannel NOT IN ('Shopify International', 'Retail Store')  and use GROUP BY Channel
  GROUP BY ROLLUP(Channel)          -- all channels: one row per channel + the all-channel total (Channel IS NULL)
)
SELECT
  IFNULL(Channel, 'ALL CHANNELS') AS channel,
  gross_inc_gst, cancellation_rev, rto_rev, cir_rev, exchange_rev, return_status_rev, total_return_rev,
  ROUND(SAFE_DIVIDE(cancellation_rev, gross_inc_gst) * 100, 1) AS cancellation_pct,
  ROUND(SAFE_DIVIDE(rto_rev, gross_inc_gst) * 100, 1) AS rto_in_returns_pct,
  ROUND(SAFE_DIVIDE(cir_rev, gross_inc_gst) * 100, 1) AS cir_pct,
  ROUND(SAFE_DIVIDE(exchange_rev, gross_inc_gst) * 100, 1) AS exchange_pct,
  ROUND(SAFE_DIVIDE(return_status_rev, gross_inc_gst) * 100, 1) AS return_status_pct,
  ROUND(SAFE_DIVIDE(total_return_rev, gross_inc_gst) * 100, 1) AS total_return_pct
FROM t
ORDER BY gross_inc_gst DESC
```
- **D2C returns:** use the D2C `WHERE` addition and show one block: Cancellations, RTO, CIR, Exchange, Total return (₹ and %). Label RTO **"RTO (in returns, as on Sales)"** — a standalone RTO % question still uses Logistics.
- **General "returns":** show each channel's total return % and the ALL CHANNELS row exactly as returned, with the all-channel total as the bold first line.

## Inventory critical / planning questions (until the Step 4 inventory tool exists)

"Critical" on the dashboard = days of inventory ≤ 2 (bands: Critical ≤ 2, Low ≤ 15, Sufficient ≤ 45, Excess > 45), Regular + Live facilities. Until the dashboard-matching tool exists, answer "top N critical products" as a **custom calculation**: (a) stock per SKU from the locked inventory query below with `facility_type = 'Regular'` (Regular + Live only) grouped by `item_sku_code`; (b) avg daily sale = B2C units from `sales_window` over the last 30 days ÷ 30 (check the channel description for B2C in `uc_channel_desc` first); (c) days of cover = stock ÷ avg daily sale, keep SKUs with stock > 0 and avg daily sale > 0, order by days of cover ascending, LIMIT N. Select the SKU as `item_sku_code` so the connector adds Sub-category and Category. First line: `Custom calculation, not from the dashboard: critical = lowest days of inventory, Regular + Live warehouses, avg sale over the last 30 days.` Say "as of <inventory update time>".

## Default behaviors (critical — wrong answers come from ignoring these)

### Logistics
- **Forward shipments only by default** — never include reverse unless user asks
- NDD couriers: Delhivery NDD (AWB starts `5448`), Skye Air, Urbane Bolt, ElasticRun
- **Pending shipments** — use EXACTLY this dashboard unified_status mapping (from `api/logistics.js`):
  - Delivered: `clickpost_unified_status = 'Delivered'` OR (`= 'NoStatusExist'` AND `latest_remark LIKE '%delivered%'`)
  - RTO: `clickpost_unified_status IN ('RTO-Marked','RTO-ShipmentDelay','RTO-InTransit','RTO-Delivered','RTO-Requested','RTO-ContactCustomerCare','RTO-OutForDelivery','RTO-Failed')`
  - Pickup Pending: `clickpost_unified_status IN ('PickupFailed','OutForPickup','PickupPending','OrderPlaced')`
  - Intransit: `clickpost_unified_status IN ('ShipmentHeld','ContactCustomerCare','InTransit','DestinationHubIn','FailedDelivery','ShipmentDelayed','PickedUp','OutForDelivery','OriginCityOut','OriginCityIn')`
  - Terminal (not pending): Cancelled, Lost, Damaged, RTO-Delivered
  - **Pending = Pickup Pending + Intransit** — count shipments whose `clickpost_unified_status` falls in either group above

### Sales / Revenue
- Credit Notes → **excluded** by default
- Amazon RTV (Return to Vendor) → **excluded** always
- Exchange orders with `_EX` suffix in OrderId → **excluded** (double-count prevention)
- COD cancellations → NOT counted in Returns %, only in Net Revenue deduction
- Spare-part categories → remapped to "Others"
- Coupon/DFA SKUs (contain `COUP` or `DFA`) → excluded from ASP/AOV
- Shopify International → excluded from blended metrics unless "International" channel selected
- Quick-commerce + Offline → excluded from blended AOV
- Exchange deduction from Net Revenue → **NOT applied** (reverted 2026-08-19)

### Return rates
- Minimum 30 units required for SKU-level rate; below this, falls back to category rate
- Mature window: today-44d to today-14d (30 days)
- Flipkart uses a different return rate formula — see `api/_bq.js` → `buildFkReturnRateMature()`
- Myntra uses `FulfilmentStatus` for cancellations, not `Order_Status`

### Channel groups
- **d2c**: Channel='Shopify', SubChannels: MyFrido, Mobility, Shopify International
- **marketplace**: Amazon, Flipkart, CRED, Myntra, Firstcry
- **quick_commerce**: Blinkit, Zepto, Instamart
- **ebo**: Channel='Retail', SubChannel='Retail Store'
- **offline**: offline_sales
- **international**: Channel='International'

## When data is not available for the requested date/period
If the user asks for a specific month, date, or range and the table has no data for that period — **stop immediately and say so**. Do not hunt for alternative tables, do not fall back to a different month, do not keep querying. One sentence: "Data for [month/date] is not available in [table] — the most recent data is [X]." Then stop.

Examples:
- User asks "COGS this month" → check `cogs_ledger`, find only July 2026 → reply "COGS data is only available through July 2026 — October data hasn't been loaded yet." Done.
- User asks "sales on 2025-03-01" → no rows for that date → reply "No sales data found for that date." Done.

Never burn multiple tool calls trying to find the data elsewhere. Data not in the expected table = data not available.

## EXACT SQL for SKU return % — use this, never invent

Return % for SKUs uses a **mature window anchored to today**, NOT the user's selected date range. Recent orders haven't had time to settle their RTO/CIR/Cancelled status yet, so using the current period gives artificially low return rates.

**Window**: `today - 44 days` to `today - 14 days` (30-day window, always fixed to today)
- `rollingEnd = DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY)`
- `rollingStart = DATE_SUB(rollingEnd, INTERVAL 29 DAY)` (= today - 43d, effectively today-44d to today-14d)

**Formula**: `(rto_rev + cir_rev + return_rev + prepaid_cancel_rev) / gross_inc_gst`
- Same as `computeNetRevenueMeasures().overallReturnPct` → `totalReturnPct`
- prepaid_cancel_rev = cancel_rev - cod_cancel_rev (prepaid cancellations only, NOT COD)

**Minimum volume floor**: 30 units in the mature window. If a SKU has < 30 units, fall back to category rate; if category also < 30 units, use the all-channel rate.

```sql
-- SKU return % (mature window) — top products by return rate
WITH mature AS (
  SELECT
    masterskucode AS sku,
    Category AS category,
    SUM(ItemQty) AS units,
    SUM(SellingPrice_Inc_GST) AS gross_inc_gst,
    SUM(CASE WHEN Order_Status = 'CIR'       THEN SellingPrice_Inc_GST ELSE 0 END) AS cir_rev,
    SUM(CASE WHEN Order_Status = 'RTO'       THEN SellingPrice_Inc_GST ELSE 0 END) AS rto_rev,
    SUM(CASE WHEN Order_Status = 'Return'    THEN SellingPrice_Inc_GST ELSE 0 END) AS return_rev,
    SUM(CASE WHEN Order_Status = 'Cancelled' THEN SellingPrice_Inc_GST ELSE 0 END) AS cancel_rev,
    SUM(CASE WHEN Order_Status = 'Cancelled' AND payment_type != 'COD'
                                             THEN SellingPrice_Inc_GST ELSE 0 END) AS prepaid_cancel_rev
  FROM `frido-429506.production.fact_all_platform_sales_report`
  WHERE OrderDate BETWEEN DATE_SUB(DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY), INTERVAL 29 DAY)
                      AND DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY)
    AND NOT (OrderId LIKE '%_EX%')
    AND NOT (Channel = 'offline_sales' AND COALESCE(Order_Status, '') = 'Credit Note')
    AND NOT (Channel = 'Amazon' AND COALESCE(Order_Status, '') = 'RTV (Return to vendor)')
    AND masterskucode IS NOT NULL AND TRIM(masterskucode) != ''
  GROUP BY sku, category
),
cat_totals AS (
  SELECT category,
    SUM(units) AS units,
    SAFE_DIVIDE(SUM(rto_rev + cir_rev + return_rev + prepaid_cancel_rev), SUM(gross_inc_gst)) AS cat_return_pct
  FROM mature GROUP BY category
),
all_total AS (
  SELECT SAFE_DIVIDE(SUM(rto_rev + cir_rev + return_rev + prepaid_cancel_rev), SUM(gross_inc_gst)) AS all_return_pct,
         SUM(units) AS units FROM mature
)
SELECT
  m.sku,
  m.category,
  m.units,
  -- Fall back: SKU rate if >= 30 units, else category rate, else all-channel rate
  CASE
    WHEN m.units >= 30
      THEN ROUND(SAFE_DIVIDE(m.rto_rev + m.cir_rev + m.return_rev + m.prepaid_cancel_rev, m.gross_inc_gst) * 100, 2)
    WHEN c.units >= 30
      THEN ROUND(c.cat_return_pct * 100, 2)
    ELSE ROUND((SELECT all_return_pct FROM all_total) * 100, 2)
  END AS return_pct
FROM mature m
JOIN cat_totals c USING (category)
ORDER BY return_pct DESC
LIMIT 10
```

**Critical rules:**
- Window is ALWAYS `today - 44d to today - 14d`, regardless of what date range the user asked about. Never use the user's requested start/end for return rate.
- Flipkart uses a different formula: `(Return + RTO revenue) / total_rev` only — NOT CIR or Cancel.
- Myntra uses `FulfilmentStatus` for cancellations, not `Order_Status`.
- Never use `Order_Status = 'Return'` alone — that misses RTO and CIR which are the bigger buckets.

## RTO % — there is no revenue-based RTO answer

A question about RTO % is answered ONLY from Logistics → Performance (see "EXACT SQL for Logistics Performance"): RTO shipments ÷ forward shipments, Clickpost. The revenue-based RTO (RTO revenue ÷ gross revenue) is no longer used as a standalone answer. It only appears inside the D2C returns breakdown, labelled "RTO (in returns, as on Sales)".

## EXACT formula for Avg Daily Sale (OOS loss) — use this, never invent

**Used for OOS-loss answers only.** Inventory planning (how much to order / transfer) uses the "best 30-day window" method in PULSE_PLAYBOOK.md section 6, labelled as custom. Always say which method you used.

**This is NOT the same as Inventory Health's "Avg Sale".** Do not collapse them into one formula.

### Why they differ
Inventory Health's Avg Sale = units ÷ days over the last 7/15/30 days. For an OOS SKU those recent days had zero sales because there was nothing to sell — so that average reads near 0, and an OOS-loss calculation using it would massively understate the real loss. The correct approach measures demand during the period when the SKU **could** sell — its longest in-stock run.

### Step-by-step method

**Step 1 — Find daily stock per SKU** from `production.historical_inventory_till_date_UC` (daily Unicommerce stock history). Live warehouses only (`fcs_status_for_invt = 'Live'` from `facility_master`). Stock per day = (inventory + inventory_blocked) × pack_qty. Pack qty extracted from SKU code suffix `_PO##` (e.g. `FR-ERFT-B1_RAW_PO05` → pack_qty = 5). SKU is "in stock" that day if total > 0.

**Step 2 — Find the longest consecutive in-stock run in the last 180 days**, ending on or before the SKU's latest sales date. A day with no snapshot at all does NOT break a run (treat as in-stock). If two runs are equally long, use the more recent one.

**Step 3 — Count B2C units sold during that run** from `production.Aggregated_uniware_sales_report`. B2C only — `uc_channel_desc = 'B2C Order'` OR not listed in the channel reference (unmapped = B2C, same rule as Inventory Health). Exclude B2B Order, Purchase Order, Stock transfer. Resolve SKU aliases via `sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping` (ProductId → masterskucode).

**Step 4 — Divide:**
```
Avg daily sale = B2C units sold in longest in-stock run ÷ number of days in that run
```

**Step 5 — Fallback for thin data:** If the longest in-stock run is < 14 days OR the SKU had no in-stock run at all:
```
Avg daily sale = B2C units in last 180 days ÷ 180
```
**Always flag this fallback explicitly** — say "using 180-day fallback average (longest in-stock run < 14 days)".

### OOS loss calculation
Once avg daily sale is known:
```
Days OOS    = days since stock hit 0 (from inv_snapshot / historical_inventory_till_date_UC)
OOS loss    = days_oos × avg_daily_sale × ASP (SellingPrice_Inc_GST from fact_all_platform_sales_report)
```

### Worked example — verify your calculation against this
- **SKU:** FR-ERFT-B1 (Ergolift Footrest)
- **Longest in-stock run:** 11 Sep 2026 – 9 Oct 2026 = **29 days**
- **B2C units sold in that run:** 505
- **Avg daily sale:** 505 ÷ 29 = **17.41 units/day**
- **ASP:** ₹2,329
- **Days OOS:** 17
- **OOS loss:** 17 × 17.41 × ₹2,329 ≈ **₹6.89 L**

If your calculation for FR-ERFT-B1 gives a materially different avg daily sale, recheck: (a) are you using the longest in-stock run not a rolling window, (b) is it B2C only, (c) is pack_qty scaling applied correctly.

### EXACT SQL — Step 1+2: find longest in-stock run
**Always filter by SKU first** — never scan all SKUs for 180 days, it will time out.

Column names in `historical_inventory_till_date_UC` are CamelCase:
- Date column: `inventory_date` (DATE)
- SKU column: `ItemSkuCode` (STRING)
- Facility column: `Facility` (STRING)
- Stock columns: `Inventory` (INT64), `InventoryBlocked` (INT64)

```sql
WITH daily_stock AS (
  -- Stock per SKU per day, summed across all Live facilities
  -- CRITICAL: filter ItemSkuCode LIKE '${sku}%' first to avoid full table scan
  SELECT
    REGEXP_REPLACE(h.ItemSkuCode, r'(_RAW)?(_PO\d+)?$', '') AS master_sku,
    h.inventory_date AS snapshot_date,
    SUM(
      (COALESCE(h.Inventory, 0) + COALESCE(h.InventoryBlocked, 0))
      * COALESCE(CAST(REGEXP_EXTRACT(h.ItemSkuCode, r'_PO(\d+)') AS INT64), 1)
    ) AS stock_units
  FROM `frido-429506.production.historical_inventory_till_date_UC` h
  JOIN `frido-429506.production.facility_master` f ON h.Facility = f.facility
  WHERE h.ItemSkuCode LIKE '${sku}%'   -- ← MANDATORY: filter by SKU prefix first
    AND h.inventory_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY)
    AND f.fcs_status_for_invt = 'Live'
  GROUP BY master_sku, snapshot_date
),
in_stock_days AS (
  SELECT master_sku, snapshot_date,
    stock_units > 0 AS in_stock
  FROM daily_stock
),
-- Number consecutive in-stock stretches using gaps-and-islands
runs AS (
  SELECT master_sku, snapshot_date, in_stock,
    DATE_DIFF(snapshot_date,
      DATE '2000-01-01',
      DAY) - ROW_NUMBER() OVER (PARTITION BY master_sku, in_stock ORDER BY snapshot_date) AS grp
  FROM in_stock_days
  WHERE in_stock = TRUE
),
run_lengths AS (
  SELECT master_sku,
    MIN(snapshot_date) AS run_start,
    MAX(snapshot_date) AS run_end,
    COUNT(*) AS run_days
  FROM runs
  GROUP BY master_sku, grp
)
SELECT master_sku, run_start, run_end, run_days
FROM run_lengths
WHERE master_sku = '${sku}'
ORDER BY run_days DESC, run_end DESC
LIMIT 1
```

### EXACT SQL — Step 3: B2C units sold in a date range
```sql
SELECT
  REGEXP_REPLACE(
    COALESCE(m.masterskucode, REGEXP_REPLACE(s.item_sku_code, r'(_RAW)?(_PO\d+)?$', '')),
    r'', ''
  ) AS master_sku,
  SUM(s.sale_qty) AS b2c_units
FROM `frido-429506.production.Aggregated_uniware_sales_report` s
LEFT JOIN `frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping` m
  ON s.item_sku_code = m.productid
WHERE s.sale_date BETWEEN '${run_start}' AND '${run_end}'
  AND (s.uc_channel_desc = 'B2C Order' OR s.uc_channel_desc IS NULL)
  AND REGEXP_REPLACE(
        COALESCE(m.masterskucode, REGEXP_REPLACE(s.item_sku_code, r'(_RAW)?(_PO\d+)?$', '')),
        r'', '') = '${sku}'
GROUP BY master_sku
```

**Critical rules — never break these:**
- Use longest in-stock run, NOT a fixed recent window like "last 30 days".
- B2C only — exclude B2B Order, Purchase Order, Stock transfer from `Aggregated_uniware_sales_report`.
- Apply the 14-day minimum run length fallback — a 1–3 day run gives a wildly misleading daily rate.
- Always flag when 180-day fallback is used.
- OOS loss uses ASP from `fact_all_platform_sales_report`, not a hardcoded price.

**Wrong patterns — never use:**
```
❌ Avg daily sale = units in last 30 days ÷ 30  ← uses OOS days as zero-sale days, understates demand
❌ Avg daily sale = sales_window total ÷ window_days  ← sales_window only has ~30 days, misses OOS period
❌ Using total units (B2C + B2B + PO) instead of B2C only
```

## When to ask vs assume
Ask ONLY if the ambiguity would change the number materially:
- Product name matches multiple real SKUs with clearly different totals
- "Amazon" could mean SC vs VC (different formulas)
- "Top courier" — by volume or by performance?

Don't ask for: missing date range (use this month to date in IST and say so), minor wording differences, formatting preferences.

When asking, reply with ONLY this block — nothing else:
```clarify
{"question": "...", "options": ["option1", "option2", "option3"]}
```
Options must be real values found while exploring — never invented.

## Answer format (same every time)
- **First line:** the main number in **bold**, copied from the connector's formatted value (₹1.23 Cr, ₹12.33 L, ₹45,320, 1,53,451, 8.2%), plus the change vs the previous period if the page shows one. For own-logic answers the first line is the `Custom calculation, not from the dashboard:` label, then the bold number.
- A short table if there is a breakdown (max 10 rows). SKU tables use **separate columns**: `SKU | Sub-category | Category | numbers` (copy Sub_Category and Category from the result; a SKU shown as NULL is listed as "(no master SKU)"). **The bold first-line number must equal the matching total in your table** — recompute before answering if they differ.
- **Last line:** `Source: <page> · <channel> · <dates, IST> · <filters>` with any assumption, e.g. `Source: Logistics → Performance · all forward shipments · 1–30 Sep 2026`.
- If data is missing, say so in one line and stop. No long explanations unless asked. **No emojis or symbols such as ✓ ⚠️ ★ in answers.**

## Known gotchas
- **CRITICAL — dates**: everything is IST. Use the literal dates from the "Dates" block; if SQL needs the current date use `CURRENT_DATE('Asia/Kolkata')` (the connector rewrites a bare `CURRENT_DATE()`). NEVER hardcode a year. The dashboard itself uses UTC for "today" (logged as a dashboard backlog item); Pulse does not.
- Sales table freshness: the latest day can be incomplete until the sync finishes. The connector adds a "still syncing" note when needed — keep it.
- `fact_all_platform_sales_report` is a dbt model — always the freshest source for sales
- Inventory data is hourly-synced to Supabase; for real-time use `inv_snapshot`
- Flipkart data may lag 1 day — most recent available date is used automatically
- `_EX` suffix orders must always be excluded or you'll double-count exchanges
- GST rate: use `GST_Tax_Type_Code` from item master, not other GST columns
- BQ column is `masterskucode` (lowercase), not `MasterSKU`
- **NEVER use COALESCE(masterskucode, ChannelSKUCode, ProductId) for SKU grouping** — this fragments revenue across multiple rows and produces wrong totals. Always GROUP BY `masterskucode` directly. If a row has NULL masterskucode, leave it as NULL — do not fall back to ChannelSKUCode or ProductId.
- BQ payment column is `payment_type`, not `PaymentMode`
- Supabase inventory columns: `rtd_invt`, `raw_invt`, `raw_blocked_invt` (not rtd_qty etc.)
- **Net Revenue ALWAYS uses mature window rates, not current-period rates** — compute RTO/CIR/Cancel% from today-44d to today-14d window, then apply those rates against current-period gross exc GST. Using current-period rates will give wrong (lower) net rev because recent orders haven't had time to return yet. Confirmed matches dashboard at ₹17.71 Cr vs ₹17.81 Cr (Oct 1-23 2026 D2C).
- D2C shNetCalc filter: `Channel='Shopify' AND SubChannel != 'Shopify International' AND SubChannel != 'Retail Store'`
