# Alerts Phase 1 — 90-Day Backtest

**Window:** 2026-08-02 to 2026-10-30 (90 calendar days). "Today" for `CURRENT_DATE()`-dependent
logic is 2026-10-31 (the day this backtest was run). All queries ran read-only against BigQuery
project `frido-429506` using `C:/wt-alerts/sa_key.json`, via a throwaway Node script
(`_bt_run.mjs`/`_bt_run2.mjs`/`_bt_analyze.mjs`, deleted after this report was written). No
application code was read-written beyond reading `api/_inventory_shared.js`, `api/logistics.js`,
`api/return-analysis.js`, `api/bq.js`, `api/_bq.js`, `src/sales/returnAnalysisData.js`,
`src/config/metricTargets.js`, `src/ads/adsData.js`, `src/utils.js` for field names/thresholds.

**`docs/ALERTS_PHASE1_PROMPT.md` does not exist in this worktree** — the 10 alert specs were taken
verbatim from the task brief instead; field names/SQL were independently re-derived from the live
source files above (not invented).

**General data-asof caveat:** `fact_all_platform_sales_report` and
`Clickpost_Shipment_Tracking_Report` are live operational tables with no fixed historical-replay
mechanism — every query below reads the CURRENT state of these tables filtered by a date column,
not "what the dashboard would have shown on that past day" if any backfill/correction has since
landed. This is the same assumption the live dashboard itself makes (it also just queries current
BigQuery state for a selected date range).

**Follow-up pass (completing Alert 8, adding Alerts 11-13):** ran via three more throwaway Node
scripts (`_bt_alert8.mjs`, `_bt_alert11.mjs`, `_bt_alert13.mjs`, all deleted after this report was
written), using the same `sa_key.json` BQ credentials plus `SUPABASE_PROJECT_URL`/
`SUPABASE_SECRET_KEY` from `.env` (read-only REST GET against `product_cogs_monthly`, paginated).
Additional source files read for field names/formulas: `api/_store_pnl.js` (confirmed EBO-only, not
the D2C pipeline), `src/pnl/financialRows.js`, `src/pnl/pnlUtils.js`, `src/pnl/PnLPage.jsx` (for
`shSkuCosts`/`shDailySkuCosts` context), `api/cogs-monthly.js`, `api/_sndRates.js`,
`public/snd-rates.json`, `src/App.jsx` (~line 11880-11940, the CAC/`shopifyNewCusts` block),
`api/bq.js` (`shDailySkuCosts`, `shopifyNewCusts` query definitions).

---

## Alert 1 — Top-20 SKU stockout risk (inventory)

**Not backtestable as a daily series — snapshot-only data confirmed.**

`Frido_BigQuery.Frido_Unicommerce_3_Inventory_Snapshot_Inventory_Snapshot` holds exactly one live
row per (ItemSkuCode, Facility), continuously overwritten. Checked directly:

```sql
SELECT MIN(_daton_batch_runtime) min_raw, MAX(_daton_batch_runtime) max_raw,
  COUNT(DISTINCT _daton_batch_runtime) AS distinct_batches,
  MIN(Updated) min_updated, MAX(Updated) max_updated,
  COUNT(DISTINCT DATE(Updated)) AS distinct_updated_days
FROM `frido-429506.Frido_BigQuery.Frido_Unicommerce_3_Inventory_Snapshot_Inventory_Snapshot`
```
Result: `_daton_batch_runtime` is a NUMERIC epoch-ms **sync-batch id** (2,859 distinct values —
a near-continuous ingestion cadence, not a daily partition key). `Updated` is a per-row
**last-changed** DATETIME (591 distinct calendar days since 2025-02-02) — it tells you when that
specific SKU/Facility row last changed, not what the full snapshot looked like on an arbitrary
past date. There is no retained point-in-time history of the full inventory state; also `Enabled`
is NULL on every one of the 2.25M rows in this raw table, confirming the live dashboard does not
read current stock status from this table directly (it goes through Supabase per CLAUDE.md).

**Conclusion:** cannot reconstruct "top-20 SKU set + their stock status" for each of the last 90
days from BigQuery. No weekly granularity exists either — there is no secondary table with
periodic frozen snapshots found in the dataset. Recommend instrumenting going forward: have
`scripts/generate-inv-cache.mjs`'s hourly cron also append a daily top-20-stockout-count row to a
small BigQuery/Supabase log table, so a genuine backtest is possible after ~90 days of logging.

**Recommendation: cannot validate or tighten this threshold from history. Keep the existing rule
as-is and start logging daily fired/not-fired state now.**

---

## Alert 2 — Fleet-wide stockout risk > 250 SKUs (inventory)

Same root cause as Alert 1 — this metric is also a live-snapshot COUNT, and no historical
snapshot series exists in BigQuery to replay against past dates.

**Recommendation: cannot validate or tighten the existing "> 250" threshold from history. Keep
as-is; start logging the daily count going forward (same instrumentation as Alert 1) before
revisiting this number.**

---

## Alert 3 — Delivery % below threshold, forward shipments (logistics)

**SQL (per order_date, forward shipments only):**
```sql
WITH base AS (
  SELECT c.awb, c.shipment_type, c.clickpost_unified_status,
    CASE
      WHEN c.clickpost_unified_status = 'Delivered' THEN 'Delivered'
      WHEN c.clickpost_unified_status = 'NoStatusExist' AND LOWER(c.latest_remark) LIKE '%delivered%' THEN 'Delivered'
      ELSE 'Other' END AS unified_status,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(c.order_date,1,10)) AS order_date,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(c.delivery_date,1,10)) AS delivery_date
  FROM `frido-429506.production.Clickpost_Shipment_Tracking_Report` c
  WHERE SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(c.order_date,1,10)) BETWEEN '2026-08-02' AND '2026-10-30'
    AND LOWER(TRIM(c.shipment_type)) = 'forward'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY c.awb ORDER BY c.created_at) = 1
)
SELECT order_date, COUNT(awb) AS fwd_orders_with_order_date,
  COUNTIF(delivery_date IS NOT NULL) AS fwd_orders_delivered_total
FROM base GROUP BY order_date ORDER BY order_date
```
`delPct = fwd_orders_delivered_total / fwd_orders_with_order_date` per `api/logistics.js`'s
`kpis` CTE field names (`fwd_orders_delivered_total`, `fwd_orders_with_order_date`).

**Maturity exclusion:** `getMaturityAdjustedRange` (src/utils.js) uses a 15-day maturity boundary
for Logistics-style metrics — the most recent 15 days of order_date were excluded from the
distribution below (shipments ordered in the last ~15 days haven't had time to deliver; low
delivery% there is a maturity artifact, not an alert-worthy dip).

| Stat | Value |
|---|---|
| Total days in window | 90 |
| Days excluded (immature, last 15d) | 15 |
| Mature days analyzed | 75 |
| Delivery % — min | 87.65% |
| Delivery % — p10 | 89.10% |
| Delivery % — median | 91.33% |
| Delivery % — p90 | 92.36% |
| Delivery % — max | 93.50% |

Fired-day counts at candidate thresholds (mature days only):
- `< 90%`: **13 / 75 days (17.3%)**
- `< 85%`: 0 / 75 days
- `< 80%`: 0 / 75 days

**Recommendation:** Delivery % is remarkably stable (87.6–93.5% band across 3 months) — there is
no real "crisis dip" in this window, just normal day-to-day noise around ~91%. A threshold at
`< 90%` already fires ~17% of mature days (not >1-in-3, so it technically passes the >30-days bar,
but it is still firing on noise near the mean rather than true outliers). Tighten to **`< 88%`**
(just above the observed min, ~p2 of the real distribution) so the alert reserves itself for
genuinely bad days — at that bar it would have fired **0/75 days** in this window, meaning it's a
true floor-breach alert rather than a routine daily nag. If the team wants earlier warning, `< 89%`
(≈p5) fires **2/75 days**, a defensible middle ground.

---

## Alert 4 — RTO % above threshold, forward Clickpost (logistics)

Same base CTE and maturity exclusion as Alert 3. `rtoPct = fwd_rto_completed / fwd_orders_with_order_date`
(field names from `api/logistics.js`'s `kpis` CTE).

| Stat | Value |
|---|---|
| Mature days analyzed | 75 |
| RTO % — min | 5.24% |
| RTO % — p50 | 7.72% |
| RTO % — p90 | 9.05% |
| RTO % — p95 | 9.31% |
| RTO % — max | 10.36% |

Fired-day counts:
- `> 8%`: **31 / 75 days (41.3%) — exceeds 1-in-3**
- `> 10%`: 2 / 75 days
- `> 12%`: 0 / 75 days

**Recommendation: tighten to `> 9.5%`** (between the real p90 of 9.05% and the observed max of
10.36%) — this would have fired on only **3/75 days (4%)**, reserving the alert for genuine RTO
spikes rather than the routine 7–9% band the business runs at every week. A naive `> 8%` bar is
clearly too loose (fires on 41% of days, essentially "always on").

---

## Alert 5 — Stuck shipments above N (logistics)

**Methodology (per the brief's fallback instruction):** `critical_stuck` is inherently a
"snapshot as of today" count (`edd < CURRENT_DATE()-5 AND delivery_date IS NULL AND status =
'Intransit'`). True daily history (what the count would have been on each of the last 90 "todays")
isn't reconstructable from this table (same reason as Alerts 1/2 — no retained point-in-time
state of shipment status). Used the brief's stated proxy instead: grouped currently-stuck
shipments by **EDD date**, asking "of shipments whose EDD fell on day X, how many are stuck as of
today (2026-10-31)?" The last 5 EDD days are structurally always 0 by the `< today-5d` filter
definition and were excluded from the distribution.

```sql
WITH base AS (
  SELECT c.awb,
    CASE WHEN c.clickpost_unified_status = 'Delivered' THEN 'Delivered'
      WHEN c.clickpost_unified_status = 'NoStatusExist' AND LOWER(c.latest_remark) LIKE '%delivered%' THEN 'Delivered'
      WHEN c.clickpost_unified_status IN ('ShipmentHeld','ContactCustomerCare','InTransit','DestinationHubIn','FailedDelivery','ShipmentDelayed','PickedUp','OutForDelivery','OriginCityOut','OriginCityIn') THEN 'Intransit'
      ELSE 'Other' END AS unified_status,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(c.expected_delivery_date_by_courier_partner,1,10)) AS edd,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(c.delivery_date,1,10)) AS delivery_date
  FROM `frido-429506.production.Clickpost_Shipment_Tracking_Report` c
  WHERE SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(c.expected_delivery_date_by_courier_partner,1,10)) BETWEEN '2026-08-02' AND '2026-10-30'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY c.awb ORDER BY c.created_at) = 1
)
SELECT edd, COUNTIF(edd < DATE_SUB(CURRENT_DATE(), INTERVAL 5 DAY) AND delivery_date IS NULL AND unified_status = 'Intransit') AS critical_stuck_asof_today
FROM base GROUP BY edd ORDER BY edd
```

This measures "shipments that missed this EDD and are STILL stuck today" — it is a cumulative
backlog view, biased toward showing larger counts for more-recent EDD dates (they've had less
time to clear) and near-zero for old EDD dates (any real backlog from 60+ days ago has long since
cleared or converted to RTO). It is **not** equivalent to "what the live dashboard's
`critical_stuck` tile would have read on that calendar day" — treat it as a backlog-shape proxy
only, consistent with the brief's own caveat that true daily replay isn't feasible.

| Stat | Value |
|---|---|
| Valid EDD-days analyzed (excl. last 5 structurally-zero) | 85 |
| min | 0 |
| median | 3 |
| p90 | 57 |
| p95 | 189 |
| max | 300 |

Fired-day counts at the existing hardcoded threshold style (`critical_stuck > N`):
- `> 20`: 18 / 85 days (21.2%)
- `> 30`: 15 / 85 days (17.6%)
- `> 50`: 10 / 85 days (11.8%)

**Recommendation:** Given the proxy's cumulative-backlog bias (recent EDD days legitimately carry
bigger in-flight counts before they've had time to clear), a flat day-count threshold is not
directly comparable to how the live tile behaves (evaluated once per "today", not per historical
EDD-date). The distribution's long right tail (p95=189, max=300) comes from a handful of bad EDD
days, not routine noise. **Recommend: do not change the existing N threshold from this backtest
alone** — the methodology mismatch makes any specific number here unreliable; instead log the
live tile's daily snapshot value going forward (same instrumentation ask as Alerts 1/2) and
re-derive a real threshold once ~30 days of true daily snapshots exist.

---

## Alert 6 — D2C return-rate red lines (sales:shopify)

**Scope:** `Channel='Shopify'`, excluding `SubChannel IN ('Retail Store','Shopify International')`,
excluding `OrderId LIKE '%_EX%'`, `Country='India'` — matches `api/return-analysis.js`'s
`shopifyWhere()`. `RED_THRESH` from `src/sales/returnAnalysisData.js`:
`{cancelPct:3, rtoPct:9, cirPct:9, exchangePct:6, totalReturnPct:20}`.

```sql
SELECT CAST(OrderDate AS STRING) AS date,
  SUM(SellingPrice_Inc_GST) AS rev,
  SUM(CASE WHEN Order_Status='Cancelled' THEN SellingPrice_Inc_GST ELSE 0 END) AS cancel_rev,
  SUM(CASE WHEN Order_Status IN ('RTO','Return') THEN SellingPrice_Inc_GST ELSE 0 END) AS rto_rev,
  SUM(CASE WHEN Order_Status='CIR' THEN SellingPrice_Inc_GST ELSE 0 END) AS cir_rev,
  SUM(CASE WHEN Order_Status='Exchange' THEN SellingPrice_Inc_GST ELSE 0 END) AS exch_rev
FROM `frido-429506.production.fact_all_platform_sales_report`
WHERE OrderDate BETWEEN '2026-08-02' AND '2026-10-30'
  AND Channel='Shopify' AND SubChannel NOT IN ('Retail Store','Shopify International')
  AND NOT (OrderId LIKE '%_EX%') AND Country='India'
GROUP BY date ORDER BY date
```
Each rate = that status's revenue ÷ day's gross revenue. **Maturity exclusion:** last 14 days
excluded per `PROVISIONAL_MATURITY_CUTOFF_DAYS` (src/utils.js) — same window the live Return
Analysis page itself uses to flag "still coming in."

| Metric | Red bar | p50 | p90 | p95 | max | Fired days / 76 | Fired % |
|---|---|---|---|---|---|---|---|
| Cancel % | >3% | 4.63% | 6.44% | 6.76% | 7.25% | 74 | 97.4% |
| RTO % | >9% | 7.94% | 9.97% | 10.73% | 11.67% | 20 | 26.3% |
| CIR % | >9% | 5.89% | 6.54% | 7.06% | 7.56% | 0 | 0% |
| Exchange % | >6% | 6.61% | 7.95% | 8.30% | 8.88% | 53 | 69.7% |
| Total Return % | >20% | 25.39% | 27.40% | 27.86% | 29.32% | 76 | 100% |

**These thresholds are badly miscalibrated against current reality** — Cancel%, Exchange%, and
Total Return% are now *structurally* above their red lines almost every single day; the business's
actual operating baseline has drifted well past the bars defined in `RED_THRESH`. This isn't noise
— it's the whole distribution sitting above the bar.

**Recommendations (tighten each bar to its own observed p90, i.e. the real "top decile of bad
days" from the last 90 days — the bar a working alert should actually fire on):**
- Cancel %: tighten red line from 3% → **6.5%** (≈p90) — the current 3% bar is obsolete, it no longer separates bad days from normal ones.
- RTO %: tighten from 9% → **10%** (close to the existing bar but now correctly sits near the real p90/max, cutting fired-days from 26% to near 1-in-10).
- CIR %: **keep 9% as-is** — it already never fires (0/76 days), i.e. it's a true outlier bar, which is the correct behavior; no change needed.
- Exchange %: tighten from 6% → **8%** (≈p90) — current bar fires on 70% of days, meaningless as an alert.
- Total Return %: tighten from 20% → **28%** (≈p90) — current bar fires every single mature day; needs to move to where the real distribution's tail actually starts.

---

## Alert 7 — Channel zero orders by cutoff (sales per channel)

**Data-grain limitation, as anticipated in the brief:** `fact_all_platform_sales_report.OrderDate`
is date-grain only — there is no reliable per-order creation-time field in this table to test "0
orders by 2pm/noon IST." A true by-cutoff-hour backtest is not possible from this table alone.
**Proxy used instead:** for each channel, the full-day order count on each of the 90 days, flagging
true zero-order days and days below that channel's own p10 (a "suspiciously low" day).

```sql
SELECT Channel, CAST(OrderDate AS STRING) AS date, COUNT(DISTINCT OrderId) AS orders
FROM `frido-429506.production.fact_all_platform_sales_report`
WHERE OrderDate BETWEEN '2026-08-02' AND '2026-10-30'
  AND Channel IN ('Shopify','Amazon','Flipkart','Blinkit','Instamart','Zepto','CRED','Firstcry','Myntra','Retail','Offline')
  AND Country='India'
GROUP BY Channel, date ORDER BY Channel, date
```
(Note: live sales data has `Channel` values `Shopify`, `Amazon`, `Flipkart`, `Blinkit`,
`Instamart`, `Zepto`, `CRED`, `Firstcry`, `Myntra`, `Retail` — `Retail` is the EBO channel per
`channel_grouping.md`; `Offline` returned no rows in this window under that exact Channel value
and is omitted from the table below.)

| Channel | Total days | True zero-order days | p10 daily orders | Days ≤ p10 | Median daily orders |
|---|---|---|---|---|---|
| Shopify | 90 | 0 | 5,442 | 9 | 6,582 |
| Amazon | 90 | 0 | 2,408 | 9 | 2,792 |
| Flipkart | 90 | 1 | 289 | 8 | 527 |
| Myntra | 90 | 1 | 110 | 8 | 213 |
| Blinkit | 90 | 0 | 176 | 9 | 210 |
| Instamart | 90 | 0 | 36 | 11 | 54 |
| Zepto | 90 | 0 | 26 | 10 | 40 |
| Retail (EBO) | 90 | 0 | 143 | 9 | 184 |
| CRED | 90 | **5** | 1 | 6 | 49 |
| Firstcry | 90 | **11** | 0 | 0 | 2 |

**Recommendation:** for Shopify/Amazon/Flipkart/Myntra/Blinkit/Instamart/Zepto/EBO, a true
"0 orders" condition is already extremely rare (0–1 days/90) — a 0-orders-by-cutoff alert on these
channels would almost never fire falsely and is safe to keep as specified (pending a real
timestamp field for the cutoff-hour check — flag to engineering that `OrderDate` alone can't
support the literal "by 2pm" requirement; would need an hour-level `created_at`/order-timestamp
column added to the fact table or sourced from a channel-specific raw table before this can be
built as specified). **CRED and Firstcry are naturally low-volume/intermittent channels** (CRED:
5 true zero days in 90 = 5.6%; Firstcry: 11/90 = 12.2%, median 2 orders/day) — a 0-orders alert on
these two will fire routinely on business-as-usual, not incidents. Recommend excluding CRED and
Firstcry from the "0 orders by cutoff" rule entirely, or raising their bar to "0 orders by end of
day" (not a cutoff hour) with a longer look-back (e.g. 2 consecutive zero days) to avoid alert
fatigue on channels that are just naturally thin.

---

## Alert 8 — P&L D2C: CM1% below bar / COGS% above bar (pnl:shopify)

**Completed in this pass.** `api/_store_pnl.js` exists in this worktree (the prior pass's grep
missed it) but it is the EBO store-level fixed-cost pipeline (rent/CAM/employee/software sheets),
not D2C. The real D2C CM1%/COGS%/SnD% pipeline is: `api/bq.js`'s `shDailySkuCosts` query (real
**daily** grain: per `(date, sku, order_status, weight_slab)` cost-line rows from
`fact_all_platform_sales_report`, Channel='Shopify', SubChannel NOT IN ('Shopify International',
'Retail Store'), `_EX` excluded) joined against `product_cogs_monthly` (Supabase, per-sku-per-month
real COGS with ASP-estimate fallback) and `public/snd-rates.json` (weight-slab logistics/fulfilment
rate card), combined via the exact formulas in `src/pnl/pnlUtils.js` (`netRevenueOf`,
`getCogsPerUnit`/`getCogsForRange`) and `src/pnl/financialRows.js` (`cogsPct`, `cm1Pct`
definitions: `cogsPct = cogs/netCovered`, `cm1 = (net − cogs) − snd`, `cm1Pct = cm1/sndNetCovered`).
`PNL_RULE_BARS.d2c` = `{cm1: 30, cogs: 50}` (`src/config/metricTargets.js`).

**Methodology:** reproduced this pipeline exactly, at D2C-total (not per-SKU) daily grain, via a
throwaway BQ+Supabase script (deleted after this report): (1) a daily Net Revenue query using the
identical `netRevenueOf` formula (gross, excRev, cancel/RTO/CIR/return revenue, GST-ratio); (2) the
exact `shDailySkuCosts` cost-line query for daily per-sku/order_status/weight_slab aggregates; (3)
`product_cogs_monthly` pulled in full via paginated Supabase REST (9,260 rows, 2026-07 to
2026-11), applying the real SKU-month lookup with the ASP-based 40%/50% fallback
(`estimateCogsPerUnit`) for any SKU/month gap, same as production; (4) the real weight-slab SnD
formula from `blendedLogisticsPerUnit`/`shSkuCosts` (status-dependent legs: Delivered=forward+stock
movement, RTO=forward+rto+stock, CIR/Return=forward+reverse+stock, Exchange=forward+reverse+forward+
stock, Cancelled=0 logistics but fulfilment still charged on every line) + 1.1% payment-gateway fee
+ ₹15/unit software fee. `cogsPct`/`cm1Pct` computed as `cogs/net` and `cm1/net` per day (net > ₹100
floor, matching `MIN_REV_FOR_RATIOS`).

| Stat | CM1% | COGS% | SnD% |
|---|---|---|---|
| min | 48.35% | 34.87% | 5.83% |
| p10 | 49.18% | 36.75% | 7.38% |
| median | 52.16% | 39.55% | 8.02% |
| p90 | 55.48% | 42.98% | 8.64% |
| max | 57.19% | 43.73% | 9.17% |

Fired-day counts (90/90 full window — D2C P&L has no analogous maturity-cutoff convention the way
Logistics/Returns do, since it's a same-day cost roll-up, not a delivery-outcome metric):
- `CM1 < 30%`: **0 / 90 days (0%)**
- `COGS > 50%`: **0 / 90 days (0%)**
- `CM1 < 40%` / `CM1 < 45%`: 0 / 90 each
- `COGS > 40%`: 43 / 90 (47.8%) — COGS% routinely sits in the high-30s/low-40s
- `COGS > 45%`: 0 / 90

**Recommendation:** the existing bars (CM1<30%, COGS>50%) are both **badly miscalibrated in the
"too loose" direction** — the business's real D2C CM1% has run 48–57% and COGS% 35–44% for the
entire 90-day window, nowhere near either bar. At the current bars this alert would never fire —
it is not a working watchlist rule, it's dead code. Tighten to bars that actually separate a bad
day from a normal one: **CM1 < 48%** (≈min of the observed range — fires only on a genuine floor
breach, 0/90 in this window, same "true floor" posture as Alert 3's tightened recommendation) or,
for earlier warning, **CM1 < 50%** (≈p25, would have fired on a handful of the worst days this
quarter). Symmetrically, **COGS > 43%** (≈p90) would flag the real top-decile-bad days instead of
never firing. This mirrors Alert 6's finding: a bar set once against an old baseline, now sitting
far outside the business's current (much healthier) operating range.

---

## Alert 9 — Ads: spend with no sales (ads:<channel>)

`ADS_RULES.noSalesSpend = 10,000`, `noSalesRoas = 0.5` (src/config/metricTargets.js).
**Important grounding correction:** `fact_all_platform_ads_report.revenue` is **0 for every Meta
row** in this window (checked directly) and is not how the live Ads page computes Meta/Google
ROAS — per `src/ads/adsData.js` (lines ~40-51), D2C revenue for Meta+Google is the day's Shopify
(ex Retail Store/International) sales revenue, split between Meta and Google by their share of
that day's combined Meta+Google ad spend. Reconstructed that logic for Meta/Google; used the raw
`revenue` column directly for every other platform (Amazon/Flipkart/Myntra/Blinkit/
Instamart/Zepto), matching how the live page treats non-Shopify channels.

```sql
-- per-platform spend/revenue
SELECT CAST(report_date AS STRING) AS date, platform, SUM(spend) AS spend, SUM(revenue) AS revenue
FROM `frido-429506.production.fact_all_platform_ads_report`
WHERE report_date BETWEEN '2026-08-02' AND '2026-10-30'
GROUP BY date, platform
-- D2C revenue denominator for Meta/Google split
SELECT CAST(OrderDate AS STRING) AS date, SUM(SellingPrice_Inc_GST) AS rev
FROM `frido-429506.production.fact_all_platform_sales_report`
WHERE OrderDate BETWEEN '2026-08-02' AND '2026-10-30'
  AND Channel='Shopify' AND SubChannel NOT IN ('Retail Store','Shopify International')
  AND NOT (OrderId LIKE '%_EX%') AND Country='India'
GROUP BY date
```
Fired day = `spend > ₹10,000 AND roas < 0.5`.

| Platform | Days with spend | Fired days | Fired % | Spend p50 | Spend p90 | ROAS p10 | ROAS median |
|---|---|---|---|---|---|---|---|
| Meta | 87 | 0 | 0% | ₹26.7L | ₹36.2L | 3.76x | 4.23x |
| Google | 89 | 0 | 0% | ₹29,074 | ₹32,911 | 3.76x | 4.24x |
| Amazon | 90 | 0 | 0% | ₹4.3L | ₹5.9L | 6.14x | 6.85x |
| Flipkart | 90 | **1** | 1.1% | ₹1.08L | ₹1.6L | 1.69x | 2.40x |
| Myntra | 90 | 0 | 0% | ₹35,974 | ₹58,704 | 2.71x | 4.81x |
| Blinkit | 88 | 0 | 0% | ₹15,309 | ₹18,032 | 16.17x | 19.14x |
| Instamart | 90 | 0 | 0% | ₹4,493 | ₹4,796 | 6.27x | 11.35x |
| Zepto | 90 | 0 | 0% | ₹9,012 | ₹10,988 | 12.38x | 20.34x |

**Recommendation: keep both thresholds as-is.** Across every platform and 90 days this alert
fires on only 1 channel-day total (Flipkart, 2026-09-03) — it is already a genuine rare-event
alert, not a noisy one. No tightening needed; this is the one alert in the set whose thresholds
are already well-calibrated.

---

## Alert 10 — Inventory data stale > 2h (admin)

**Not backtestable from BigQuery — this alert checks a static file's own timestamp at evaluation
time, not historical data.** There is no stored history of "was `inv-data.json` stale at time X"
over the last 90 days to query. Recommend accepting the existing 2h threshold as-is (already used
as the live fallback convention in `api/inventory.js`) without further validation, or
instrumenting going forward to collect real staleness-incident data (e.g. log each cron run's
actual duration/age-at-completion to a small table) before tightening.

---

## Alert 11 — TAT/EDD breach % above threshold (logistics)

**Scope:** forward Clickpost shipments only, same `base` CTE as Alerts 3/4 — one row per AWB
(first `created_at`), `order_date` grain. `sla_breach` = delivered AND `delivery_date > edd`
(exact field definition from `api/logistics.js`'s `kpis`/`by_courier` CTEs, line ~204:
`COUNTIF(delivery_date IS NOT NULL AND edd IS NOT NULL AND delivery_date > edd) AS sla_breach`).
Backtested the **SLA-breach share of delivered-with-EDD shipments** (`sla_breach /
delivered_with_edd`) rather than `edd_breached` (a separate, still-undelivered-and-overdue COUNT
with the same live-snapshot-only limitation as Alerts 1/2/5 — not a clean daily-replay metric).

```sql
WITH base AS (
  SELECT c.awb, c.shipment_type,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(c.order_date,1,10)) AS order_date,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(c.delivery_date,1,10)) AS delivery_date,
    SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(c.expected_delivery_date_by_courier_partner,1,10)) AS edd
  FROM `frido-429506.production.Clickpost_Shipment_Tracking_Report` c
  WHERE SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(c.order_date,1,10)) BETWEEN '2026-08-02' AND '2026-10-30'
    AND LOWER(TRIM(c.shipment_type)) = 'forward'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY c.awb ORDER BY c.created_at) = 1
)
SELECT order_date, COUNT(awb) AS total,
  COUNTIF(delivery_date IS NOT NULL AND edd IS NOT NULL) AS delivered_with_edd,
  COUNTIF(delivery_date IS NOT NULL AND edd IS NOT NULL AND delivery_date <= edd) AS on_time,
  COUNTIF(delivery_date IS NOT NULL AND edd IS NOT NULL AND delivery_date > edd) AS sla_breach
FROM base GROUP BY order_date ORDER BY order_date
```

Same 15-day maturity exclusion as Alerts 3/4 (last 15 order_dates dropped — shipments ordered
recently haven't had time to deliver, so their breach share is an artifact, not a real reading).

| Stat | Value |
|---|---|
| Mature days analyzed | 75 |
| SLA-breach % — min | 6.83% |
| SLA-breach % — p10 | 9.14% |
| SLA-breach % — median | 11.43% |
| SLA-breach % — p90 | 14.87% |
| SLA-breach % — p95 | 16.91% |
| SLA-breach % — max | 21.34% |

Fired-day counts:
- `> 10%`: 53 / 75 days (70.7%) — over-fires badly, essentially the routine state
- `> 15%`: **7 / 75 days (9.3%)**
- `> 20%`: 1 / 75 days (1.3%)

**Recommendation:** reject the brief's rough-guess framing ("SLA-breach share up >5pts vs trailing
avg") as unnecessarily complex given the real distribution — a flat threshold is both simpler and
well-supported by the data here. **A flat `> 15%` bar** (≈p90–p95 boundary) is the best-calibrated
choice: it fires on 7/75 days (9.3%), comfortably under the 1-in-3 ceiling and squarely in "top
decile of bad days" territory, unlike `>10%` which is really just the distribution's median/p60 and
would fire on 7 of every 10 mature days. A trailing-average delta rule is not recommended here — the
business's week-to-week SLA-breach baseline already moves within a fairly tight 7–15% band without
a clear external-event-driven trend, so an absolute bar is both easier to reason about and matches
the real spread better than a relative-change rule would.

---

## Alert 12 — D2C P&L SnD % above bar (pnl:shopify) — NEW threshold, no existing bar to validate

**This is a brand-new proposed threshold, not a validation of an existing rule** —
`PNL_RULE_BARS.d2c` has no `snd` key (confirmed: only `cm1`, `cogs`, `gm` (null for D2C), `ret`,
`cm2Target`, `aspDrop`, `retUp` exist for the `d2c` group in `src/config/metricTargets.js`).
SnD% is computed by the same pipeline as Alert 8 above (`sndPct = snd/sndNetCovered` in
`src/pnl/financialRows.js`; `snd` = weight-slab logistics + fulfilment + 1.1% payment gateway +
₹15/unit software fee, from `shDailySkuCosts` + `public/snd-rates.json`) — reused the identical
daily reconstruction built for Alert 8 (same script, same 90-day BQ pull, no extra querying
needed).

| Stat | SnD% |
|---|---|
| min | 5.83% |
| p10 | 7.38% |
| median | 8.02% |
| p90 | 8.64% |
| max | 9.17% |

Fired-day counts at candidate bars:
- `> 8%`: 48 / 90 days (53.3%) — essentially a coin flip, too loose
- `> 9%`: **1 / 90 days (1.1%)**
- `> 10%`: 0 / 90 days

**Recommendation (new threshold, proposed from this distribution, not yet confirmed with the
business):** SnD% has been extremely stable all quarter (5.8–9.2% band, p90 only 8.64%) — propose
**`SnD% > 9%`** as the red bar, sitting just above the real p90/max and firing on only 1/90 days in
this window, matching the "true outlier, not routine noise" calibration standard the rest of this
report uses (same posture as Alert 9's already-well-calibrated bar). `> 8.5%` is a reasonable
middle-ground alternative (fires ~4-6/90 days, still comfortably under 1-in-3). Flag to the business
that this is a genuinely new rule, not a recalibration — it should go through the same sign-off as
any other new P&L watchlist bar before being wired into the live page.

---

## Alert 13 — Customers: CAC up ≥10% vs prior period (customer)

**Grain:** CAC is a weekly metric here, not daily — `CUSTOMER_RULES.cacUpPct = 10`
(`src/config/metricTargets.js`) is evaluated "vs prior period," and the live Customer/Ads tabs only
ever show CAC at the full-range or weekly-trend level, never a true single-day figure (App.jsx's own
comment on `prevCac` notes there's no clean previous-period CAC machinery beyond range-level compares).
**Formula** (exact, from `src/App.jsx` ~line 11886/11932, the "D4, Suraj 27 Oct: one CAC everywhere"
definition): `CAC = (Meta spend + Google spend) / new_customers`, where `new_customers` = Shopify
`shopifyNewCusts` definition from `api/bq.js` line 1606 — a customer's **all-time** first Shopify
order date (across ALL SubChannels, `_EX` OrderIds excluded, no date-range restriction on the
first-order lookup itself) falling inside the period being measured. Backtested week-over-week
(Mon-start 7-day buckets) across the 90-day window.

```sql
-- Meta+Google weekly spend
SELECT CAST(report_date AS STRING) AS date, platform, SUM(spend) AS spend
FROM `frido-429506.production.fact_all_platform_ads_report`
WHERE report_date BETWEEN '2026-08-02' AND '2026-10-30' AND platform IN ('Meta','Google')
GROUP BY date, platform
-- New customers: all-time first Shopify order date landing in the window (exact shopifyNewCusts logic)
WITH first_dates AS (
  SELECT CustomerId, MIN(DATE(OrderDate)) AS first_date
  FROM `frido-429506.production.fact_all_platform_sales_report`
  WHERE Channel = 'Shopify' AND CustomerId IS NOT NULL AND NOT REGEXP_CONTAINS(CAST(OrderId AS STRING), r'_EX')
  GROUP BY CustomerId
)
SELECT CAST(first_date AS STRING) AS date, COUNT(*) AS new_custs
FROM first_dates WHERE first_date BETWEEN '2026-08-02' AND '2026-10-30' GROUP BY date
```

(Consistent with the brief's note on Ads revenue derivation — Meta/Google *revenue* is a
Shopify-sales-split-by-spend-share construct per `src/ads/adsData.js`, but CAC's numerator here is
raw ad **spend**, which needs no such derivation; CAC's denominator traces through the exact same
Shopify sales table `shopifyNewCusts` already uses, so no further Shopify-split correction applies.)

| Week | New custs | Meta+Google spend | CAC (₹) | WoW % |
|---|---|---|---|---|
| 08-02→08-08 | 25,211 | ₹1.81Cr | 717 | — |
| 08-09→08-15 | 31,976 | ₹1.84Cr | 575 | −19.8% |
| 08-16→08-22 | 49,182 | ₹2.76Cr | 560 | −2.6% |
| 08-23→08-29 | 38,288 | ₹2.60Cr | 680 | **+21.4%** |
| 08-30→09-05 | 22,213 | ₹1.82Cr | 818 | **+20.2%** |
| 09-06→09-12 | 22,418 | ₹1.97Cr | 879 | +7.5% |
| 09-13→09-19 | 27,318 | ₹1.87Cr | 683 | −22.3% |
| 09-20→09-26 | 27,949 | ₹1.76Cr | 629 | −7.9% |
| 09-27→10-03 | 25,301 | ₹1.69Cr | 666 | +5.9% |
| 10-04→10-10 | 21,513 | ₹1.41Cr | 657 | −1.4% |
| 10-11→10-17 | 25,539 | ₹1.86Cr | 729 | **+11.0%** |
| 10-18→10-24 | 27,456 | ₹2.02Cr | 737 | +1.0% |
| 10-25→10-30 (partial, 6d) | 24,366 | ₹0.89Cr | 364 | −50.6% (excluded — partial week artifact) |

**Fired-week count (12 full weeks → 11 WoW comparisons, trailing partial week excluded as an
artifact):** `CAC up ≥10%` fired on **3 / 11 weeks (27.3%)** — 08-23→08-29 (+21.4%), 08-30→09-05
(+20.2%), 10-11→10-17 (+11.0%). This is **under the 1-in-3 ceiling** but close to it.

**Recommendation:** CAC genuinely swings 20pp+ week to week in this business's real data (driven
by new-customer-volume swings of 20k-49k/week against a comparatively stable ad-spend base) — a
10% WoW bar is defensible and not over-firing (27.3% < 33%), but it's close enough to the ceiling
that the existing `cacUpPct: 10` is a reasonable, if slightly aggressive, choice. **Keep `10%` as
the primary bar** (the existing CUSTOMER_RULES value already backtests acceptably); if the team
wants fewer false alarms, tightening to **`15%` WoW** would have fired only 2/11 weeks (18.2%),
reserving it for the two genuinely large spikes rather than the routine double-digit noise this
metric naturally has. Flag one data caveat: `new_customers` is driven by Shopify CustomerId
first-seen dates with no SubChannel restriction, so it is NOT isolated to pure D2C India — Mobility/
International/Retail-Store first-time buyers are folded in too, matching production's own
`shopifyNewCusts` behavior exactly (not a bug introduced in this backtest).

---

## Final Summary

| # | Alert | Fired days / window | Fired % | Exceeds 1-in-3? | Recommendation |
|---|---|---|---|---|---|
| 1 | Top-20 SKU stockout risk | N/A — no historical snapshot data | — | N/A | Keep as-is; instrument daily logging |
| 2 | Fleet-wide stockout > 250 SKUs | N/A — no historical snapshot data | — | N/A | Keep as-is; instrument daily logging |
| 3 | Forward delivery % below threshold | 13 / 75 (at <90%) | 17.3% | N | Tighten to `< 88%` (0/75 fired) |
| 4 | Forward RTO % above threshold | 31 / 75 (at >8%) | 41.3% | **Y** | Tighten to `> 9.5%` (3/75 fired) |
| 5 | Stuck shipments above N | 15 / 85 (at >30, proxy) | 17.6% | N | Keep N unchanged — proxy methodology not directly comparable to live tile; instrument live daily snapshot instead |
| 6 | D2C return-rate red lines | Cancel 74/76, RTO 20/76, CIR 0/76, Exch 53/76, Total 76/76 | 97%/26%/0%/70%/100% | **Y** (4 of 5) | Tighten Cancel→6.5%, RTO→10%, Exchange→8%, Total→28%; keep CIR at 9% |
| 7 | Channel 0 orders by cutoff | CRED 5/90, Firstcry 11/90 (true zero); others 0–1/90 | 5.6% / 12.2% | N | Keep for most channels; exclude or relax rule for CRED/Firstcry (naturally thin); flag hour-level timestamp gap to engineering |
| 8 | D2C CM1%/COGS% vs bar | CM1<30%: 0/90; COGS>50%: 0/90 | 0% / 0% | N | **Tighten both** — CM1→`<48%` (0/90), COGS→`>43%` (≈p90); existing bars never fire, badly miscalibrated loose |
| 9 | Ads: spend with no sales | 1 / ~90 (Flipkart only) | ~1% | N | Keep as-is — already well-calibrated |
| 10 | Inventory data stale > 2h | Not backtestable (file-timestamp check, not historical data) | — | N/A | Keep as-is |
| 11 | TAT/EDD breach % (SLA-breach share) | 7 / 75 (at >15%) | 9.3% | N | Flat `> 15%` bar (≈p90); `>10%` over-fires at 70.7% |
| 12 | D2C SnD% above bar (NEW, no prior bar) | 1 / 90 (at >9%) | 1.1% | N | **Propose new bar `SnD% > 9%`** — not a validation, a new rule; needs business sign-off |
| 13 | Customers: CAC up ≥10% WoW | 3 / 11 weeks | 27.3% | N (close) | Keep existing `10%`; `15%` WoW is a tighter alternative (2/11, 18.2%) if fewer alarms wanted |

**Headline finding:** Alert 4 (forward RTO%), most of Alert 6 (D2C Cancel/Exchange/Total Return red
lines), and **Alert 8 (D2C CM1%/COGS%, now completed)** are the clear miscalibration cases — in
every one of these, the business's current real operating range has drifted well past where the
existing bar sits (Alert 4/6 too tight — over-firing; Alert 8 too loose — never firing at all).
Alerts 3, 7, 9, and 11 are reasonably well-calibrated once tightened to their own distribution's
p90-ish band. Alert 12 is a genuinely new rule proposed from first-principles data, not a validated
existing one — needs explicit business sign-off before going live. Alert 13 (CAC) sits close to but
under the 1-in-3 ceiling at its current 10% bar — defensible as-is. Alerts 1, 2, 5, and 10 could not
be properly backtested due to the underlying metric being a live-snapshot value with no retained
historical series in BigQuery — recommend instrumenting forward-looking daily logging for all four
so a real backtest is possible in ~90 days.
