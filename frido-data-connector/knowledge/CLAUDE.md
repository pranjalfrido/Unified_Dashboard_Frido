# Frido Data Knowledge

## For every question — read this first
1. Find the metric in PULSE_METRICS.md (match the synonyms) and follow PULSE_PLAYBOOK.md (defaults, which page a metric must match, answer format).
2. Order of sources: playbook → PULSE_METRICS.md → the locked SQL below / the dashboard logic for that page (read the file the playbook names with target=repo) → your own logic. **Own logic is always labelled on the first line: `Custom calculation, not from the dashboard:` + the definition in one line** (e.g. "critical = lowest days of inventory, Regular warehouses, avg sale over the last 30 days"). Only use own logic when no locked template or metric fits.
3. **Dates: use the literal IST dates from the "Dates" block.** Never work out dates yourself and never use UTC.
4. **Return raw values from SQL** (never divide by 100000 / 10000000, never alias `_lakhs` / `_cr`). **Always alias money columns with one of these words: rev, revenue, gross, net, amount, value, cost, sales, asp, aov, price** (e.g. `gross_revenue_inc_gst`, `cancellation_rev`) — the connector formats only columns named that way, and an answer containing a ₹ amount or a bare number >= 1,00,000 that is not one of the formatted values is sent back once. The connector formats ₹ amounts, counts and percentages in the Indian system before you see them — each formatted cell also shows the raw value. **Copy the formatted value; never convert units yourself.**
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
| `production.aggregated_uniware_sales_report` (table name is lower-case) | Inward/receiving, warehouse movements, **B2C unit sales for OOS/inventory-planning avg daily sale** |
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
| `product_cogs_monthly` | **COGS per SKU per month — the table the P&L page uses.** Columns: `sku`, `month` (first day of the month, date), `cogs` (per unit, ₹), `category`, `sub_category`, `cogs_source` ('actual' or 'carried_forward'), `carried_from_month`. Real (uploaded) months today: Jun–Sep 2026; every other month is carried forward from the nearest real month (Oct 2026 = carried from Sep 2026; months before Jun 2026 = carried back from Jun). Check `SELECT DISTINCT month, cogs_source, carried_from_month` before answering. |
| `cogs_ledger` | The manual COGS editor table (CogsPage) — **NOT what the P&L uses**, and it only holds Jul 2026. Do not use it to say whether COGS is "loaded". |
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
| Returns % | locked formula below | **The answer period is the period asked** ("last month" = the previous calendar month, "this month", a date range), using the provisional/actual rules in "EXACT SQL for Returns". The mature window (today−43 to today−14) is NEVER the answer period: it only supplies each SKU's rolling rate for the latest 15 days (inside that SQL) and SKU-level return % ranking ("EXACT SQL for SKU return %"). |
| Delivery Rate, TAT, EDD breach | locked formula below | Same Clickpost base as RTO % — see "EXACT SQL for Logistics Performance" |
| Stuck Shipments | locked formula below | The page's "Critical Stuck" — see "EXACT SQL for Stuck Shipments" |
| DOI | Inventory Health logic | DOI = floor(stock ÷ ceil(max(avg sale, order allocation))), avg sale per Location (7/15/30-day page toggle). Stock from the "EXACT query for total inventory" section (Regular + Live). You may read `api/_inventory_shared.js` (target=repo) to follow the page logic exactly. |
| Avg Daily Sale | THREE different methods — say which | **OOS loss** = longest in-stock run (use the `oos_loss` tool). **Planning** (how much to order/transfer/required) = the section "Planning avg daily sale" below. **Inventory Health** = last 7/15/30 days B2C units ÷ days. A bare "avg sale of <SKU>" gets both the planning avg and the Inventory Health avg (see that section). |
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

**This is an approximation of the Sales page, not the page itself** (the page uses each day's real statuses for days older than 15 days and the SKU's rolling 30-day rate for the last 15, per-channel rules, and deducts the full cancellation incl. COD). Label the answer `Custom calculation, not from the dashboard:` + "net revenue = gross ex GST × (1 − RTO − CIR − Return − prepaid cancel %) using the mature window". The Step 4 `sales_summary` tool replaces this. **Net revenue on the dashboard uses the provisional return rate for the latest 15 days** (see "EXACT SQL for Returns"): say so in the answer when the period includes the latest 15 days.

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
SELECT COALESCE(
    NULLIF(REGEXP_REPLACE(UPPER(TRIM(masterskucode)), r'[^A-Z0-9-]', ''), ''),
    NULLIF(REGEXP_REPLACE(UPPER(TRIM(ChannelSKUCode)), r'[^A-Z0-9-]', ''), ''),
    NULLIF(REGEXP_REPLACE(UPPER(TRIM(ProductId)), r'[^A-Z0-9-]', ''), '')) AS masterskucode,   -- the dashboard's MasterSKU (api/_bq.js)
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
- The SKU is the **dashboard's MasterSKU**: masterskucode, else ChannelSKUCode, else ProductId, cleaned (upper-case, only A-Z 0-9 -). Some Shopify rows land with a NULL masterskucode and a corrupted ChannelSKUCode; the dashboard backfills them (api/_bq.js, 2026-10-23), so Pulse does too. Group by the aliased expression exactly as above.
- A row that still has no SKU after this stays unmapped (shown as "(no master SKU)").

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

## EXACT SQL for Returns — PROVISIONAL (as on Sales) and ACTUAL (Return Analysis)

**The period of the answer is always the period asked** — "last month" = the previous calendar month from the Dates block (e.g. 1–30 Sep 2026), "this month" = month to date, or the date range given. Never answer a returns question with the mature window (that is only inside the SQL, for the latest 15 days). Use `${start}`/`${end}` = the asked period.

Two definitions exist on the dashboard; show both when they differ.
- **PROVISIONAL return % = what Sales, P&L, Overview and net revenue show** (`api/_returnComponents.js`, `computeNetRevenueMeasures` in `api/_bq.js`). Days older than 15 days use each SKU's REAL status revenue; the **latest 15 days** (`d >= mature_end` from the Dates block) use that SKU's rolling 30-day rate from the mature window (`mature_start`..`mature_end`) times that day's own gross (capped at the day's gross). **Total = RTO + CIR + Return-status + full Cancellations (COD included)** — the tile says "RTO+CIR+Cancelled rev"; Exchange is shown separately and is NOT in the total. SKU = the dashboard's MasterSKU (masterskucode, else ChannelSKUCode, else ProductId, cleaned).
- **ACTUAL return % = the Return Analysis page** (`api/return-analysis.js`): actual statuses only, total = RTO + CIR + Return-status + **prepaid-only** cancellations.

One query returns both (use the `${scope}` line for D2C or for all channels; copy the percentages and totals from the result, never re-add components yourself):
```sql
WITH fx AS (
  SELECT f.Channel, f.OrderDate AS d, f.SellingPrice_Inc_GST AS rev, f.Order_Status AS st, COALESCE(f.payment_type, '') AS pay,
    -- the dashboard's MasterSKU (api/_bq.js): masterskucode, else ChannelSKUCode, else ProductId, upper-cased and cleaned
    COALESCE(
      NULLIF(REGEXP_REPLACE(UPPER(TRIM(f.masterskucode)), r'[^A-Z0-9-]', ''), ''),
      NULLIF(REGEXP_REPLACE(UPPER(TRIM(f.ChannelSKUCode)), r'[^A-Z0-9-]', ''), ''),
      NULLIF(REGEXP_REPLACE(UPPER(TRIM(f.ProductId)), r'[^A-Z0-9-]', ''), '')) AS sku
  FROM `frido-429506.production.fact_all_platform_sales_report` f
  WHERE NOT (f.OrderId LIKE '%_EX%')
    AND NOT (f.Channel = 'offline_sales' AND COALESCE(f.Order_Status, '') = 'Credit Note')
    AND NOT (f.Channel = 'Amazon' AND COALESCE(f.Order_Status, '') = 'RTV (Return to vendor)')
    ${scope}
),
daily AS (   -- per channel, SKU and day: real revenue by status
  SELECT Channel, sku, d, SUM(rev) AS gross,
    SUM(IF(st = 'RTO', rev, 0)) AS rto, SUM(IF(st = 'CIR', rev, 0)) AS cir, SUM(IF(st = 'Return', rev, 0)) AS ret,
    SUM(IF(st = 'Cancelled', rev, 0)) AS cancel, SUM(IF(st = 'Cancelled' AND pay != 'COD', rev, 0)) AS cancel_prepaid,
    SUM(IF(st = 'Exchange', rev, 0)) AS exch
  FROM fx WHERE d BETWEEN '${start}' AND '${end}' AND sku IS NOT NULL GROUP BY Channel, sku, d
),
roll AS (    -- each SKU's own rate in the mature window (the 30 days ending 14 days ago)
  SELECT Channel, sku,
    SAFE_DIVIDE(SUM(IF(st = 'RTO', rev, 0)), SUM(rev)) AS rto_r, SAFE_DIVIDE(SUM(IF(st = 'CIR', rev, 0)), SUM(rev)) AS cir_r,
    SAFE_DIVIDE(SUM(IF(st = 'Return', rev, 0)), SUM(rev)) AS ret_r, SAFE_DIVIDE(SUM(IF(st = 'Cancelled', rev, 0)), SUM(rev)) AS cancel_r,
    SAFE_DIVIDE(SUM(IF(st = 'Exchange', rev, 0)), SUM(rev)) AS exch_r
  FROM fx WHERE d BETWEEN '${mature_start}' AND '${mature_end}' AND sku IS NOT NULL GROUP BY Channel, sku HAVING SUM(rev) > 0
),
res AS (     -- days older than 15: real; the latest 15 days (d >= mature_end): the SKU's rolling rate x that day's own gross
  SELECT d.Channel, d.gross, d.d >= '${mature_end}' AS immature,
    IF(d.d >= '${mature_end}', IFNULL(r.rto_r, 0) * d.gross, d.rto) AS rto_x,
    IF(d.d >= '${mature_end}', IFNULL(r.cir_r, 0) * d.gross, d.cir) AS cir_x,
    IF(d.d >= '${mature_end}', IFNULL(r.ret_r, 0) * d.gross, d.ret) AS ret_x,
    IF(d.d >= '${mature_end}', IFNULL(r.cancel_r, 0) * d.gross, d.cancel) AS cancel_x,
    IF(d.d >= '${mature_end}', IFNULL(r.exch_r, 0) * d.gross, d.exch) AS exch_x,
    d.rto AS rto_a, d.cir AS cir_a, d.ret AS ret_a, d.cancel_prepaid AS cancel_prepaid_a
  FROM daily d LEFT JOIN roll r USING (Channel, sku)
),
capped AS (  -- an estimated day never returns more than its own gross
  SELECT *, IF(immature AND gross > 0 AND rto_x + cir_x + ret_x + cancel_x > gross, gross / (rto_x + cir_x + ret_x + cancel_x), 1) AS sc FROM res
),
t AS (
  SELECT Channel, SUM(gross) AS gross_inc_gst,
    SUM(cancel_x * sc) AS cancellation_rev, SUM(rto_x * sc) AS rto_rev, SUM(cir_x * sc) AS cir_rev,
    SUM(ret_x * sc) AS return_status_rev, SUM(exch_x) AS exchange_rev,
    SUM((rto_x + cir_x + ret_x + cancel_x) * sc) AS total_return_rev,                 -- PROVISIONAL (Sales / P&L / Overview)
    SUM(rto_a + cir_a + ret_a + cancel_prepaid_a) AS actual_total_return_rev,         -- ACTUAL (Return Analysis): actual statuses, prepaid-only cancel
    LOGICAL_OR(immature) AS includes_latest_15_days
  FROM capped GROUP BY ROLLUP(Channel)
)
SELECT IFNULL(Channel, 'ALL CHANNELS') AS channel, includes_latest_15_days,
  gross_inc_gst, cancellation_rev, rto_rev, cir_rev, return_status_rev, exchange_rev, total_return_rev, actual_total_return_rev,
  ROUND(SAFE_DIVIDE(cancellation_rev, gross_inc_gst) * 100, 1) AS cancellation_pct,
  ROUND(SAFE_DIVIDE(rto_rev, gross_inc_gst) * 100, 1) AS rto_in_returns_pct,
  ROUND(SAFE_DIVIDE(cir_rev, gross_inc_gst) * 100, 1) AS cir_pct,
  ROUND(SAFE_DIVIDE(exchange_rev, gross_inc_gst) * 100, 1) AS exchange_pct,
  ROUND(SAFE_DIVIDE(return_status_rev, gross_inc_gst) * 100, 1) AS return_status_pct,
  ROUND(SAFE_DIVIDE(total_return_rev, gross_inc_gst) * 100, 1) AS provisional_total_return_pct,
  ROUND(SAFE_DIVIDE(actual_total_return_rev, gross_inc_gst) * 100, 1) AS actual_total_return_pct
FROM t
ORDER BY gross_inc_gst DESC
```
`${scope}` is one of:
- D2C: `AND f.Channel = 'Shopify' AND f.SubChannel NOT IN ('Shopify International', 'Retail Store')` (take the row `Shopify`)
- All channels: `AND f.Channel NOT IN ('Blinkit', 'Zepto', 'Instamart')` (quick commerce has no order status; take the `ALL CHANNELS` row and list each channel row)

**Answer format**
- **Always show both numbers, labelled by page, for any period.** X = `provisional_total_return_pct`, Y = `actual_total_return_pct`.
  - If the period includes the latest 15 days (`includes_latest_15_days` = true): first line `**Returns (provisional, as on Sales): X%** · Return Analysis: Y%`.
  - Otherwise: first line `**Returns (as on Sales): X%** · Return Analysis: Y%`.
  - Then ONE short line explaining the difference: *Sales counts full cancellations (COD included) and, for the latest 15 days, an estimate from each SKU's rolling 30-day rate; Return Analysis counts actual statuses only and only prepaid cancellations.*
  - Then the breakdown for the Sales view: Cancellation, RTO (in returns, as on Sales), CIR, Exchange, Total — ₹ and %.
- (The old rule "show only one number when the period is older than 15 days" is replaced by the bullet above: always show both.)
- A standalone "RTO %" question still uses Logistics → Performance, never this.
- Net revenue: say it uses the provisional return rate for the latest 15 days.

## Inventory critical / planning questions (until the Step 4 inventory tool exists)

"Critical" on the dashboard = days of inventory ≤ 2 (bands: Critical ≤ 2, Low ≤ 15, Sufficient ≤ 45, Excess > 45), Regular + Live facilities. Until the dashboard-matching tool exists, answer "top N critical products" as a **custom calculation**: (a) stock per SKU from the locked inventory query below with `facility_type = 'Regular'` (Regular + Live only) grouped by `item_sku_code`; (b) avg daily sale = B2C units from `sales_window` over the last 30 days ÷ 30 (check the channel description for B2C in `uc_channel_desc` first); (c) days of cover = stock ÷ avg daily sale, keep SKUs with stock > 0 and avg daily sale > 0, order by days of cover ascending, LIMIT N. Select the SKU as `item_sku_code` so the connector adds Sub-category and Category. First line: `Custom calculation, not from the dashboard: critical = lowest days of inventory, Regular + Live warehouses, avg sale over the last 30 days.` Say "as of <inventory update time>".

## COGS and P&L answers

- COGS comes from `product_cogs_monthly` (per-unit cost per SKU per month), exactly as the P&L page does. Fallback order on the page for a SKU: that month's row (actual or carried forward) → average COGS of the SKU's sub-category that month → 40% of ASP (ASP < ₹5,000) or 50% of ASP.
- **Every P&L / COGS answer says which COGS month was used**, e.g. `COGS for Oct uses Sep 2026 per-SKU cost (carried forward; latest actual month)`. Get it from `cogs_source` and `carried_from_month`.
- **P&L, COGS totals, CM1, CM1 %, margins, marketing % → the `pnl` tool** (one channel and period at a time; `month` = `YYYY-MM`, or `start`/`end`; `breakdown: true` adds top/bottom product margins). It runs the P&L page's own code, so the numbers are the page's: gross, net revenue, COGS, COGS % of net, gross margin, SnD, CM1, CM1 % (CM1 ÷ covered net revenue), marketing spend and %, CM2. Never compute these yourself.
- The tool output has an `ACCURACY:` line. If it says "Approximate, check the P&L page", your answer MUST say exactly that, in one line under the first line. If it says "matches the P&L page", say nothing extra.
- The tool output has a `COGS month used:` line — copy it into the answer (e.g. "COGS for Oct uses Sep 2026 per-SKU cost (carried forward)").
- First line: the main number asked for (bold, copied from the tool's formatted value). Last line: `Source: P&L → <channel> · <dates, IST> · COGS: <month used>`.
- **Overall P&L stays "not available yet"** — answer one channel at a time; if asked for Overall, say it is not available yet and offer the channels.
- The first call for a period can take up to about 90 seconds; calls for the same period are then cached for 30 minutes.

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
- Mature window: today−43 to today−14 (30 days) — used only for rolling rates of the latest 15 days and SKU-level return % ranking, never as the period of an answer
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
- User asks "COGS this month" -> check `product_cogs_monthly` (NOT `cogs_ledger`): this month has rows with `cogs_source = 'carried_forward'` -> answer from them and say which month's cost is used, e.g. "COGS for Oct 2026 uses Sep 2026 per-SKU cost (carried forward; latest actual month)." Only say data is missing when a SKU or month has no row at all.
- User asks "sales on 2025-03-01" → no rows for that date → reply "No sales data found for that date." Done.

Never burn multiple tool calls trying to find the data elsewhere. Data not in the expected table = data not available.

## EXACT SQL for SKU return % — use this, never invent

**This section is ONLY for SKU-level return % (ranking SKUs / categories by return rate).** It does NOT answer "what is the return % for last month / this month / a date range" — for any asked period use "EXACT SQL for Returns" over exactly that period. For SKU ranking, return % uses a **mature window anchored to today** because recent orders haven't settled their RTO/CIR/Cancelled status yet, so the current period gives artificially low return rates.

**Window**: the mature window from the Dates block — `'${mature_start}'` to `'${mature_end}'` (today−43 to today−14, 30 days, IST). Use those literal dates; never `CURRENT_DATE()` arithmetic.

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
  WHERE OrderDate BETWEEN '${mature_start}'
                      AND '${mature_end}'
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

**OOS questions (OOS SKUs, OOS loss, days out of stock, "loss of sales") are answered with the `oos_loss` tool.** It runs the Inventory Health "OOS loss" page's own SQL (`api/data/inventory_oos.sql`) and per-day maths (`api/inventory-oos.js`), so the numbers match that page. Do not rebuild the calculation with run_command. Optional arguments: `limit` (top N by loss, default 10) and `sku`. Answer: first line = the page's SKU count and total loss so far; then the top-N table `SKU | Sub-category | Category | days out | avg daily sale | ASP | daily loss | loss so far | loss till restock`; Source line: `Source: Inventory Health → OOS loss · as of <date>`. Mention `oos_source` / `basis` when a row says "D2C sales stop" or a 180-day average.

**Everything below in this OOS section — the step-by-step method and both SQL blocks — is REFERENCE ONLY** (it explains how the page works). Never run it instead of the `oos_loss` tool. Inventory planning (how much to order / transfer) uses the "Planning avg daily sale" section, labelled custom. Always say which method you used.

**This is NOT the same as Inventory Health's "Avg Sale".** Do not collapse them into one formula.

### Why they differ
Inventory Health's Avg Sale = units ÷ days over the last 7/15/30 days. For an OOS SKU those recent days had zero sales because there was nothing to sell — so that average reads near 0, and an OOS-loss calculation using it would massively understate the real loss. The correct approach measures demand during the period when the SKU **could** sell — its longest in-stock run.

### Step-by-step method

**Step 1 — Find daily stock per SKU** from `production.historical_inventory_till_date_UC` (daily Unicommerce stock history). Live warehouses only (`fcs_status_for_invt = 'Live'` from `facility_master`). Stock per day = (inventory + inventory_blocked) × pack_qty. Pack qty extracted from SKU code suffix `_PO##` (e.g. `FR-ERFT-B1_RAW_PO05` → pack_qty = 5). SKU is "in stock" that day if total > 0.

**Step 2 — Find the longest consecutive in-stock run in the last 180 days**, ending on or before the SKU's latest sales date. A day with no snapshot at all does NOT break a run (treat as in-stock). If two runs are equally long, use the more recent one.

**Step 3 — Count B2C units sold during that run** from `production.aggregated_uniware_sales_report`. B2C only — `uc_channel_desc = 'B2C Order'` OR not listed in the channel reference (unmapped = B2C, same rule as Inventory Health). Exclude B2B Order, Purchase Order, Stock transfer. Resolve SKU aliases via `sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping` (ProductId → masterskucode).

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
FROM `frido-429506.production.aggregated_uniware_sales_report` s
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
- B2C only — exclude B2B Order, Purchase Order, Stock transfer from `aggregated_uniware_sales_report`.
- Apply the 14-day minimum run length fallback — a 1–3 day run gives a wildly misleading daily rate.
- Always flag when 180-day fallback is used.
- OOS loss uses ASP from `fact_all_platform_sales_report`, not a hardcoded price.

**Wrong patterns — never use:**
```
❌ Avg daily sale = units in last 30 days ÷ 30  ← uses OOS days as zero-sale days, understates demand
❌ Avg daily sale = sales_window total ÷ window_days  ← sales_window only has ~30 days, misses OOS period
❌ Using total units (B2C + B2B + PO) instead of B2C only
```

## Planning avg daily sale (planning questions: how much to order / transfer / plan, replenishment)

**Method (PULSE_PLAYBOOK.md section 6):** B2C daily sales (Unicommerce, B2C Order or unmapped channels), aliases resolved to the master SKU. **The best window is searched in the LAST 90 DAYS only.** Spike days (a day above 3× the window's median) are removed. Every window of 7 to 30 days is considered; the highest average is the best, and **if a longer window's average is within 10% of the best, the longest such window is used**. Windows need at least 7 selling days. The query also returns the **recent run rate** = units on the in-stock days of the last 30 days ÷ number of in-stock days (Live + Regular stock from `historical_inventory_till_date_UC`), and `show_two_quantities` (TRUE when the best-window average is MORE THAN 2× the recent run rate).

Run this query (`${sku}` = master SKU, `${end}` = the IST yesterday from the Dates block). **For one warehouse** add `AND s.Facility = '<warehouse>'` in `raw_sales` and `AND h.Facility = '<warehouse>'` in `stock_days` (BLR = `myfrido-BLR_Hexalog`; look warehouse names up in `inventory_sales_allocation.facility_master`):
```sql

WITH sku_map AS (
  SELECT REGEXP_REPLACE(UPPER(TRIM(productid)), r'[\s_]+', '') AS k, ANY_VALUE(REGEXP_REPLACE(UPPER(TRIM(masterskucode)), r'[\s_]+', '')) AS master
  FROM `frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping`
  WHERE TRIM(masterskucode) NOT IN ('', 'not found') AND REGEXP_REPLACE(UPPER(TRIM(productid)), r'[\s_]+', '') != ''
  GROUP BY 1
),
b2c_channel AS (
  SELECT UPPER(TRIM(uniware_channels)) AS ch, ANY_VALUE(channel_description) AS descr
  FROM `frido-429506.inventory_sales_allocation.uc_channel_desc` GROUP BY 1
),
raw_sales AS (
  SELECT s.order_date AS d, s.total_quantity AS qty, REGEXP_REPLACE(UPPER(TRIM(TRIM(REPLACE(SUBSTR(s.final_sku, 1, LEAST(
      IF(STRPOS(s.final_sku, '_') > 0, STRPOS(s.final_sku, '_') - 1, LENGTH(s.final_sku)),
      IF(STRPOS(LOWER(s.final_sku), '-raw') > 0, STRPOS(LOWER(s.final_sku), '-raw') - 1, LENGTH(s.final_sku)))), '_', ' ')))), r'[\s_]+', '') AS k0
  FROM `frido-429506.production.aggregated_uniware_sales_report` s
  LEFT JOIN b2c_channel c ON c.ch = UPPER(TRIM(s.channel))
  WHERE s.order_date BETWEEN DATE_SUB('${end}', INTERVAL 179 DAY) AND '${end}'
    AND (c.descr = 'B2C Order' OR c.descr IS NULL)
),
sales_day AS (
  SELECT r.d, SUM(r.qty) AS u
  FROM raw_sales r LEFT JOIN sku_map m ON m.k = r.k0
  WHERE COALESCE(m.master, r.k0) = REGEXP_REPLACE(UPPER(TRIM('${sku}')), r'[\s_]+', '')
  GROUP BY r.d
),
daily AS (
  SELECT d, IFNULL(u, 0) AS u
  FROM UNNEST(GENERATE_DATE_ARRAY(DATE_SUB('${end}', INTERVAL 179 DAY), '${end}')) AS d
  LEFT JOIN sales_day USING (d)
),
stock_days AS (   -- days in the last 30 on which the SKU had stock (Live + Regular)
  SELECT h.inventory_date AS d
  FROM `frido-429506.production.historical_inventory_till_date_UC` h
  JOIN `frido-429506.inventory_sales_allocation.facility_master` f ON f.Facility = h.Facility
  LEFT JOIN sku_map m ON m.k = REGEXP_REPLACE(UPPER(TRIM(TRIM(REPLACE(SUBSTR(h.ItemSkuCode, 1, LEAST(
      IF(STRPOS(h.ItemSkuCode, '_') > 0, STRPOS(h.ItemSkuCode, '_') - 1, LENGTH(h.ItemSkuCode)),
      IF(STRPOS(LOWER(h.ItemSkuCode), '-raw') > 0, STRPOS(LOWER(h.ItemSkuCode), '-raw') - 1, LENGTH(h.ItemSkuCode)))), '_', ' ')))), r'[\s_]+', '')
  WHERE h.inventory_date BETWEEN DATE_SUB('${end}', INTERVAL 29 DAY) AND '${end}'
    AND f.FCs_Status_for_Invt = 'Live' AND f.FacilityType = 'Regular'
    AND COALESCE(m.master, REGEXP_REPLACE(UPPER(TRIM(TRIM(REPLACE(SUBSTR(h.ItemSkuCode, 1, LEAST(
      IF(STRPOS(h.ItemSkuCode, '_') > 0, STRPOS(h.ItemSkuCode, '_') - 1, LENGTH(h.ItemSkuCode)),
      IF(STRPOS(LOWER(h.ItemSkuCode), '-raw') > 0, STRPOS(LOWER(h.ItemSkuCode), '-raw') - 1, LENGTH(h.ItemSkuCode)))), '_', ' ')))), r'[\s_]+', '')) = REGEXP_REPLACE(UPPER(TRIM('${sku}')), r'[\s_]+', '')
  GROUP BY h.inventory_date
  HAVING SUM((COALESCE(h.Inventory, SAFE_CAST(h.Inventory_st AS INT64), 0) + COALESCE(h.InventoryBlocked, SAFE_CAST(h.InventoryBlocked_st AS INT64), 0))
             * COALESCE(SAFE_CAST(REGEXP_EXTRACT(UPPER(h.ItemSkuCode), r'P[O0][_\s]*(\d+)') AS INT64), 1)) > 0
),
recent AS (   -- current run rate: units on the in-stock days of the last 30 days / number of in-stock days
  SELECT COUNT(*) AS in_stock_days_30, SAFE_DIVIDE(SUM(dl.u), COUNT(*)) AS recent_run_rate_per_day
  FROM stock_days sd JOIN daily dl ON dl.d = sd.d
),
lens AS (SELECT L FROM UNNEST(GENERATE_ARRAY(7, 30)) AS L),
w AS (   -- every window of 7-30 days that starts inside the LAST 90 DAYS
  SELECT a.d AS s, l.L, b.u
  FROM daily a CROSS JOIN lens l
  JOIN daily b ON b.d BETWEEN a.d AND DATE_ADD(a.d, INTERVAL l.L - 1 DAY)
  WHERE a.d >= DATE_SUB('${end}', INTERVAL 89 DAY) AND DATE_ADD(a.d, INTERVAL l.L - 1 DAY) <= '${end}'
),
med AS (SELECT s, L, APPROX_QUANTILES(u, 2)[OFFSET(1)] AS med FROM w GROUP BY s, L),
agg AS (
  SELECT w.s, w.L, SUM(w.u) AS units_raw,
    SUM(IF(m.med > 0 AND w.u > 3 * m.med, 0, w.u)) AS units_kept,
    COUNTIF(NOT (m.med > 0 AND w.u > 3 * m.med)) AS days_kept,
    COUNTIF(m.med > 0 AND w.u > 3 * m.med) AS spike_days,
    COUNTIF(w.u > 0) AS selling_days
  FROM w JOIN med m USING (s, L) GROUP BY w.s, w.L
),
cand AS (SELECT *, SAFE_DIVIDE(units_kept, days_kept) AS avg_per_day FROM agg WHERE selling_days >= 7),
best AS (SELECT MAX(avg_per_day) AS best_avg FROM cand),
pick AS (   -- longest window whose average is within 10% of the best
  SELECT c.* FROM cand c, best b WHERE c.avg_per_day >= 0.9 * b.best_avg
  ORDER BY c.L DESC, c.avg_per_day DESC, c.s DESC LIMIT 1
),
tot AS (SELECT SUM(u) AS units_180d, COUNTIF(u > 0) AS selling_days_180d FROM daily),
trend AS (
  SELECT STRING_AGG(FORMAT('%s %d', FORMAT_DATE('%b', m), u), ' · ' ORDER BY m) AS monthly_units
  FROM (SELECT DATE_TRUNC(d, MONTH) AS m, SUM(u) AS u FROM daily GROUP BY m)
)
SELECT CAST(p.s AS STRING) AS window_start, CAST(DATE_ADD(p.s, INTERVAL p.L - 1 DAY) AS STRING) AS window_end, p.L AS window_days,
  p.units_raw AS window_units, p.spike_days AS spike_days_removed, p.units_kept AS units_used, p.days_kept AS days_used,
  ROUND(p.avg_per_day, 2) AS planning_avg_per_day,
  r.in_stock_days_30, ROUND(r.recent_run_rate_per_day, 2) AS recent_run_rate_per_day,
  p.avg_per_day > 2 * r.recent_run_rate_per_day AS show_two_quantities,   -- TRUE: best window is more than 2x the current rate
  o.units_180d, o.selling_days_180d, t.monthly_units
FROM tot o CROSS JOIN trend t CROSS JOIN recent r LEFT JOIN pick p ON TRUE
```
Answer with: **window dates and length** (`window_start`–`window_end`, `window_days`), units (`window_units`, spike days removed), **planning avg per day**, the **recent run rate**, and the 6-month monthly trend (`monthly_units`) in one line. Say which method was used ("planning avg").

**Plan quantity:** `planning avg × (X days + lead time) − stock − on the way` (lead time 7 + 3 safety until measured; never below 0; say "stock on the way not included").
- If `show_two_quantities` is FALSE: show one quantity.
- If `show_two_quantities` is TRUE: show **two quantities** and a one-line warning. `Plan (best window): <qty>` (uses the planning avg) and `If current rate continues: <qty>` (uses `recent_run_rate_per_day` in the same formula). Warning line: "The best window (<dates>) sold <ratio>× the current rate; confirm which demand to plan for."
- If the query returns no window (`window_start` is NULL = fewer than 7 selling days in 90 days) use `units_180d` ÷ the number of days the SKU was in stock (if you cannot get it, ÷ 180) and say clearly that it is a fallback.
Planning questions use ONLY these numbers.

**"avg sale / avg daily sale of <SKU>" with no context:** give both in one line — first `Planning avg: X/day (best window <dates>, N days)` from the query above, then `Inventory Health avg (last 30 days): Y/day` from this query (B2C units over the 30 days ending at the latest sales date ÷ 30; the page's own source `inventory_sales_window`):
```sql
WITH sku_map AS (
  SELECT REGEXP_REPLACE(UPPER(TRIM(productid)), r'[\s_]+', '') AS k, ANY_VALUE(REGEXP_REPLACE(UPPER(TRIM(masterskucode)), r'[\s_]+', '')) AS master
  FROM `frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping`
  WHERE TRIM(masterskucode) NOT IN ('', 'not found') AND REGEXP_REPLACE(UPPER(TRIM(productid)), r'[\s_]+', '') != ''
  GROUP BY 1
),
b2c_channel AS (
  SELECT UPPER(TRIM(uniware_channels)) AS ch, ANY_VALUE(channel_description) AS descr
  FROM `frido-429506.inventory_sales_allocation.uc_channel_desc` GROUP BY 1
),
latest AS (SELECT MAX(order_date) AS asof FROM `frido-429506.production.inventory_sales_window`)
SELECT CAST(l.asof AS STRING) AS sales_as_of, SUM(s.qty) AS units_30d, ROUND(SUM(s.qty) / 30, 2) AS inventory_health_avg_per_day
FROM `frido-429506.production.inventory_sales_window` s
CROSS JOIN latest l
LEFT JOIN b2c_channel c ON c.ch = UPPER(TRIM(s.channel))
LEFT JOIN sku_map m ON m.k = REGEXP_REPLACE(UPPER(TRIM(s.final_sku)), r'[\s_]+', '')
WHERE s.order_date BETWEEN DATE_SUB(l.asof, INTERVAL 29 DAY) AND l.asof
  AND (c.descr = 'B2C Order' OR c.descr IS NULL)
  AND COALESCE(m.master, REGEXP_REPLACE(UPPER(TRIM(s.final_sku)), r'[\s_]+', '')) = REGEXP_REPLACE(UPPER(TRIM('${sku}')), r'[\s_]+', '')
GROUP BY l.asof
```
(OOS loss avg is a third, different number: use the `oos_loss` tool only when OOS loss is asked.)

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
- Money columns are formatted by the connector only when aliased with rev / revenue / gross / net / amount / value / cost / sales / asp / aov / price.
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
- SKU grouping uses the dashboard's MasterSKU expression (masterskucode, else ChannelSKUCode, else ProductId, cleaned) — see "EXACT SQL template for SKU-level revenue". Never invent a different fallback.
- BQ payment column is `payment_type`, not `PaymentMode`
- Supabase inventory columns: `rtd_invt`, `raw_invt`, `raw_blocked_invt` (not rtd_qty etc.)
- **Net Revenue ALWAYS uses mature window rates, not current-period rates** — compute RTO/CIR/Cancel% from today-44d to today-14d window, then apply those rates against current-period gross exc GST. Using current-period rates will give wrong (lower) net rev because recent orders haven't had time to return yet. Confirmed matches dashboard at ₹17.71 Cr vs ₹17.81 Cr (Oct 1-23 2026 D2C).
- D2C shNetCalc filter: `Channel='Shopify' AND SubChannel != 'Shopify International' AND SubChannel != 'Retail Store'`
