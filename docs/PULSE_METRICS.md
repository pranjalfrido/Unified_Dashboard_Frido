# Pulse metrics rulebook

Built from `docs/PULSE_METRICS.xlsx` and the code check in `docs/PULSE_METRICS_CHECK.md`. Decisions of 2026-10-29: every ⚠️ row follows the dashboard code (each such change is marked **Changed to match code**); #33 / #34 are built in Step 5; #37 ACoS/TACoS answers "not tracked on the dashboard yet"; Pulse uses IST; the mature window is today−43 to today−14.
Defaults (from the playbook): dates = this month to date (IST); channel = all; D2C = Shopify MyFrido + Mobility.
Format per entry: **Name** (also called) · *Answer from* · Definition · Channels / dates / exclusions · Answer shows.

## Sales — answer from the Sales page (`api/bq.js`, `api/_bq.js`)

1. **Gross revenue** (sales, revenue, GMV, topline) · *Sales → channel → Overall* · SUM(SellingPrice_Inc_GST), all order statuses · All channels by default; Shopify International is added from its own table, as the page does · Selected range (OrderDate, IST) · Excl `_EX` orders, offline Credit Notes, Amazon RTV · ₹ Cr/L + vs previous period %.
2. **Net revenue** (net sales, realised revenue) · *Sales → Net Rev tile* · **Changed to match code:** the page uses each day's real statuses for days older than 15 days and the SKU's rolling 30-day rate for the last 15 days; it deducts the **full** cancellation (COD included), and the result is ex-GST. Per-channel rules apply (Shopify: RTO+CIR+Cancel; Amazon/Flipkart/Myntra/Retail: +Return; CRED/Firstcry: Return only; Blinkit/Zepto/Instamart: no rates) · **uses the provisional return rate for the latest 15 days (say so)** · ₹ + vs previous %.
3. **Orders** (order count) · COUNT(DISTINCT OrderId) · Flipkart/Myntra include the page's estimates for missing recent days (say so) · count + vs prev %.
4. **Units** (quantity, qty sold) · SUM(ItemQty), same note as Orders · count + vs prev %.
5. **AOV** (average order value) · *Sales → AOV tile* · **Changed to match code:** revenue Inc GST ÷ distinct orders over Shopify (not Intl), Amazon Seller Central, Myntra, Flipkart, Firstcry, CRED only. Vendor Central, quick commerce and offline are out · ₹ + vs prev %.
6. **ASP** (average selling price) · *Sales → ASP tile* · **Changed to match code:** gross Inc GST ÷ units with COUP/DFA SKUs removed from the unit count only (revenue still includes them), same six-channel scope as AOV · ₹.
7. **Returns %** (return rate) · *Sales → Returns tile (provisional) and Return Analysis (actual)* · **Two definitions, show both when they differ.** Provisional (Sales / P&L / Overview): actual statuses for days older than 15 days, each SKU's rolling 30-day rate for the latest 15 days; total = RTO + CIR + Return-status + full Cancellations (COD included); Exchange separate. Actual (Return Analysis, D2C): actual statuses only, prepaid-only cancellations. Format: `**Returns (provisional, as on Sales): X%** · Actual so far (Return Analysis): Y%`, one explaining line, then Cancellation / RTO (in returns) / CIR / Exchange / Total in ₹ and %. Fully older than 15 days: one number, provisional = actual. **The period is always the period asked** ("last month" = previous calendar month, e.g. 1–30 Sep 2026; "this month"; a date range) — never the mature window. The mature window (today−43 to today−14) is used only for each SKU's rolling rate (latest 15 days of the period) and for SKU-level return % ranking. Test: "Want to know the d2c last month return%" → D2C, 1–30 Sep 2026, provisional = actual (older than 15 days), full cancellations, ₹ formatted by code.
8. **CIR %** (customer initiated return) · CIR revenue ÷ gross Inc GST · Only D2C and Retail carry a CIR status · %.
9. **Cancellation %** (cancel rate) · *Overview and Return Analysis tiles* · Cancelled revenue ÷ gross Inc GST (revenue, not order count; full amount, COD included; the Sales category table shows D2C prepaid-only) · %.
10. **Revenue by channel** · `byChannel` · Gross grouped by Channel/SubChannel; D2C = Channel 'Shopify', EBO = Channel 'Retail' · table.
11. **Revenue by category** · `catMap`/`shCategory` · Gross grouped by category; any category containing "spare" → Others · top N table with share %.
12. **Top SKUs** (best sellers) · **Changed to match code:** the Sales page has per-channel SKU lists, no single all-channel top-N tile. Answer from the SKU grouping of the asked channel (or all channels, labelled) · top N table: SKU · Sub-category · Category · ₹.
13. **DRR** (daily run rate) · **Changed to match code:** units ÷ calendar days in the range (only a column in the category/SKU table). No revenue DRR on the page; a revenue run rate is a custom calculation.
14. **Growth vs previous period** (growth, MoM, WoW) · Same-length previous period immediately before the range · % change.

## Logistics — answer from Logistics → Performance (`api/logistics.js`, Clickpost)

15. **RTO %** (return to origin) · *Logistics → Performance only* (decision: never the revenue version) · RTO shipments ÷ forward shipments created in the range; RTO = the 8 `RTO-*` statuses or `NoStatusExist` with "rto" in the remark; one row per AWB · All channels in Clickpost (not D2C only), forward only · Sep 2026 = 8.2% (18,695 / 228,645) · % + RTO shipments / total.
16. **Delivery rate** · Delivered ÷ total forward shipments (includes cancelled / in transit in the denominator) · %.
17. **TAT** (delivery time) · **Confirm pending:** the page shows several TATs. Default "delivery TAT" = Avg In-Transit (pickup → delivery, 0–20 days) by courier; "fulfilment TAT" = order → delivery. State which one.
18. **Stuck shipments** · **Changed to match code:** the page's "Critical Stuck" = in transit, EDD more than 5 days ago, no delivery date, within the selected created-date range. (The old 3-day no-update rule is not on the page.)
19. **Pending shipments** · Pickup Pending (PickupFailed, OutForPickup, PickupPending, OrderPlaced) + Intransit statuses, shipments created in the range.
20. **NDR** · Shipment with ≥1 out-for-delivery attempt that is not (1 attempt and Delivered) on the NDR tab; the KPI field uses ≥2 attempts. Counted over the created-date range, so "NDRs today" cannot be answered.
21. **Courier comparison** (best courier) · per-courier table: total, delivered %, RTO %, avg TAT, EDD breach %. EDD breach % = delivered after EDD ÷ delivered with an EDD. Ask back: by volume, delivery rate, RTO or cost?
22. **Logistics cost** · **Changed to match code:** *Logistics → Cost* uses the courier **invoice ledger** (not Clickpost cost columns), ex-GST, by billing month. Say if the latest month isn't loaded.
23. **Cost per shipment** · Cost ÷ invoice rows per courier (Forward, RTO and Reverse legs unless filtered).
24. **Logistics cost % of revenue** · B2C cost ÷ declared invoice shipment value (not Sales revenue); say so.

## Inventory — Regular + Live facilities only

25. **Total inventory** (stock, sellable inventory) · *Inventory Health (Regular view)* · Live facilities, excl COUP/DFA/Uncategorized, Regular type only · "as of <time>" · units.
26. **Inventory by warehouse** · same data; the page groups by Location (PNQ, GGN, BLR, MUM, KOL, HYD, CHN) with the Facility underneath.
27. **SKU stock** · same, by SKU and warehouse; alias SKUs roll up to the master SKU.
28. **DOI** (days of inventory) · (read `api/_inventory_shared.js` to follow the page exactly) · **Changed to match code:** DOI = floor(stock ÷ ceil(max(avg sale, order allocation))), avg sale rounded up per Location; null when stock > 0 and no demand. Bands: Critical ≤ 2, Low ≤ 15, Sufficient ≤ 45, Excess > 45.
29. **Avg daily sale (Inventory Health)** · follows the page toggle: 7 days by default (15 / 30 available), B2C units, per Location; window ends at the latest sales date.
30. **Dead / slow stock** · SKU status "Dead" = stock > 0, no sale in 90 days, not a new launch. The page's Dead Stock card (sub-category DOI > 200) is different; say which one.
31. **OOS SKUs** · *Inventory → Out-of-stock loss* · **Changed to match code:** stock ≤ 0 on the latest snapshot across all Live facilities, B2C units in 180 days > 0.
32. **OOS loss** · answered by the **`oos_loss` tool**, which runs the Out-of-stock loss page's own SQL and maths: days out × avg daily sale (longest in-stock run) × ASP; run < 14 days → 180-day average (flagged) · ₹ + top SKUs. Page details: days-out clock can start from the D2C sales stop; ASP falls back to Unicommerce B2C.

## Planning (new tools, Step 5)

29a. **Avg sale of <SKU> (no context)** · one line with both: `Planning avg: X/day (best window <dates>, N days)` then `Inventory Health avg (last 30 days): Y/day`.

33. **Replenishment priority** · see playbook section 6 (planning avg = every window 7–30 days, spike days removed, highest average, longest window within 10% of the best; show window dates, length, units, avg/day, 6-month trend; < 7 selling days → 180-day units ÷ in-stock days, flagged).
34. **Plan qty for X days** · see playbook section 6, same planning avg.

## Ads, P&L, Customers

35. **Ad spend** · *Ads → Overall* · headline includes CRED and D2C additional spend (the monthly table does not).
36. **ROAS** · total-sales ROAS: channel net revenue ex GST ÷ ad spend (not platform-attributed).
37. **ACoS / TACoS** · answer: "ACoS / TACoS are not tracked on the dashboard yet."
38. **CM1 / CM1 %** · *P&L → channel* · CM1 = net revenue − COGS − SnD, before marketing; CM1 % over covered net revenue ex GST. Overall P&L: "not available yet".
39. **COGS** · **Changed to match code:** P&L COGS = per-unit blended rate × net units from `product_cogs_monthly`; months not uploaded are carried forward from the last uploaded month (say it is an estimate). If a month has no data at all: "COGS for <month> isn't loaded yet; latest is <month>."
40. **Marketing %** · spend ÷ net revenue ex GST; channels with no spend source show "Not available".
41. **CAC** · (Meta + Google + D2C additional spend) ÷ new Shopify customers in the range. No fixed ₹700 in the code.
42. **New vs repeat** · returning = first order before the range start, among customers ordering in the range.
43. **LTV / LTV:CAC** · LTV = trailing-365-day revenue per customer (revenue, not margin); a 35%-margin variant exists.
44. **Support tickets** · open tickets created in the last 45 days, age buckets 1, 2, 3, 4–5, 6–8, 9–10, 11–15, 15+; "older than 9 days" = ≥ 9 days.
