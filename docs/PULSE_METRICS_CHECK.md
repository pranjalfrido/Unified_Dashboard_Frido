# Pulse metrics check — Step 2 (sheet definitions vs dashboard code)

Source: `docs/PULSE_METRICS.xlsx` (44 metric rows). Checked against the code on `feature/pulse-tools` (from `origin/main` 6ae1d3be).
Legend: ✅ same · ⚠️ different (how) · ❓ not on any page · 🔶 sheet says "To confirm"/empty: what the code does is written for you to confirm.

## Counts

| ✅ same | ⚠️ different | ❓ not on any page | 🔶 to confirm (code described) | Total |
|---|---|---|---|---|
| 15 | 10 | 3 | 16 | 44 |

## Cross-cutting findings (affect many rows)

1. **IST is not applied to dates.** `OrderDate` is a plain DATE compared with `BETWEEN start AND end` (`api/_bq.js:547`), and "today", the previous period and the mature window use server UTC (`api/bq.js:225-238, 299-301`). The sheet says "OrderDate, IST". Pulse can only match if the table already stores IST dates.
2. **The mature window is today−43 to today−14 (30 days),** not today−44 to −14 as the sheet says (`api/bq.js:299-301`).
3. **Shopify International** is added to Sales totals from a different table (`fact_shopify_international_orders`).
4. **The same metric differs by page.** Net revenue and Returns % on the Sales "All" tab are sums of per-channel engines, with their own overrides for Mobility, Flipkart and Myntra.
5. **Flipkart and Myntra orders/units include estimated recent days** (`adjNOrders`).

## Table

| # | Metric | Suraj's definition (sheet) | What the code does | Result | Question for Suraj |
|---|---|---|---|---|---|
| 1 | Gross revenue | SUM(SellingPrice_Inc_GST), all statuses, excl `_EX`, offline Credit Notes, Amazon RTV | `api/bq.js` `totals`/`byChannel`: same sum and exclusions. Shopify Intl added from another table. | ✅ | Should Gross include Shopify International? The page does. |
| 2 | Net revenue | Gross Exc GST × (1 − RTO − CIR − Return − prepaid Cancel %), rates from mature window | `computeNetRevenueMeasures` (`_bq.js`) and `resolveDailySkuComponents`: days older than 15 use that day's real statuses, last 15 days use the SKU's rolling 30-day rate. Per-channel rules (Shopify: RTO+CIR+all Cancel; Amazon/Flipkart/Myntra/Retail: +Return; CRED/Firstcry: Return only; Blinkit/Zepto/Instamart: none). Cancel is the **full** amount (COD included). Result is ex-GST. | ⚠️ | Apply the mature window to the whole range (sheet) or "real for old days, rolling for last 15 days" (page)? Page deducts full Cancel, sheet says prepaid only. |
| 3 | Orders | COUNT(DISTINCT OrderId) | Same. Flipkart/Myntra add estimated days. | ✅ | Include Flipkart/Myntra estimates? |
| 4 | Units | SUM(ItemQty) | Same, plus the Flipkart/Myntra estimates. | ✅ | — |
| 5 | AOV | Gross ÷ orders; QC + Offline excluded; excl COUP/DFA | Sales page `aspAovTotals`: only Shopify (not Intl), Amazon Seller Central, Myntra, Flipkart, Firstcry, CRED. Vendor Central is also out. A different all-channel "blended AOV" is on Overview and the mobile tile. | ⚠️ | Which AOV is "the" AOV, and is Vendor Central out? |
| 6 | ASP | Gross ÷ units; excl COUP/DFA | Same six-channel scope as AOV. COUP/DFA removed from the unit count only, not from revenue. | ⚠️ | Remove COUP/DFA revenue from the numerator too? Six channels only? |
| 7 | Returns % | (RTO+CIR+Return+prepaid Cancel) ÷ gross Inc GST, mature window | Sales tile uses the per-channel engine over the **selected range** (real + rolling estimate), full Cancel. Only return-trackable channels count. Prepaid-only cancel exists only in `overallReturnPct` and the category table. Return Analysis (D2C) uses the selected range, no mature window. 30-unit SKU→category fallback matches. | ⚠️ | Which Returns % is the answer: tile, mature-window, or Return Analysis? Prepaid-only or full Cancel? |
| 8 | CIR % | CIR revenue ÷ gross Inc GST | Same. Only D2C and Retail have a CIR status. | ✅ | — |
| 9 | Cancellation % | CONFIRM | Cancelled revenue ÷ gross Inc GST (revenue, not order count). Shown on Overview and Return Analysis (full) and in the Sales category table (D2C, prepaid-only). No Sales tile. | 🔶 | Order count or revenue %? Include COD? |
| 10 | Revenue by channel | Gross grouped by Channel | `byChannel`. D2C is Channel 'Shopify', EBO is 'Retail'. | ✅ | — |
| 11 | Revenue by category | Gross by category; Spare parts → Others | `shCategory`/`catMap`. Any category containing "spare" → Others. | ✅ | — |
| 12 | Top SKUs | Gross by masterskucode, top N | Per-channel SKU lists, nested under category. No all-channel top-N tile. | ⚠️ | Build an all-channel top-N, or answer from a channel's SKU table? |
| 13 | DRR | CONFIRM: revenue ÷ days elapsed? | **Units** ÷ calendar days in the range (min 1), only as a column in the category/SKU table. No revenue DRR. | 🔶 | Units/day or revenue/day, over what window? |
| 14 | Growth vs previous | Same-length previous period | Same, plus MoM/YoY keys. Dates built with UTC. | ✅ | — |
| 15 | RTO % | Logistics page definition only | `api/logistics.js` `kpis`: RTO shipments ÷ all shipments created in range, forward (page default). All channels in Clickpost, not D2C only. **Reproduced: 18,695 / 228,645 = 8.18% (Sep 2026).** | ✅ | Limit to D2C channels? (sheet col H) |
| 16 | Delivery rate | Delivered ÷ forward shipments | Same. Denominator includes cancelled and in-transit. Courier Allocation page uses a different base. | ✅ | — |
| 17 | TAT | CONFIRM | Several TATs: transit (pickup→delivery, kept 0–20 d), fulfilment (order→delivery), pickup, processing, RTO. Per-courier averages exist. | 🔶 | Which is "delivery TAT": pickup→delivery or order→delivery? |
| 18 | Stuck shipments | Forward, not terminal, no update 3+ days, last 30 days | Page has "Critical Stuck": Intransit, EDD > 5 days ago, no delivery date, within the selected range, not bucketed. The 3-day no-update rule exists only in the connector CLAUDE.md. | ⚠️ | Use the page's Critical Stuck (EDD+5d) or the 3-day no-update rule? |
| 19 | Pending shipments | Pickup Pending + Intransit groups | Same status groups, counted over shipments created in the selected range. | ✅ | — |
| 20 | NDR | CONFIRM | NDR tab: ≥1 out-for-delivery attempt and not (1 attempt and Delivered). `kpis.ndr_count` uses ≥2 attempts. Both over created-date range, so "NDRs today" is not answerable. | 🔶 | Which NDR definition? |
| 21 | Courier comparison | Delivery rate, RTO %, TAT by courier | Per-courier table, forward only. No "best courier" ranking. Delhivery split into NDD and normal. | ✅ | Ask "by volume or performance?" as the sheet says. |
| 22 | Logistics cost | CONFIRM (Clickpost cost columns) | Logistics → Cost uses the **invoice ledger** (`logistics_invoices_b2c`, B2B, 3PL warehousing), ex-GST, by billing month. Not Clickpost columns. The connector CLAUDE.md also says Clickpost is the only cost table. | ⚠️ | Invoices (page) or Clickpost? |
| 23 | Cost per shipment | CONFIRM | Cost ÷ invoice rows per courier, includes Forward, RTO and Reverse legs unless filtered. | 🔶 | Forward legs only? |
| 24 | Logistics cost % of revenue | CONFIRM | B2C cost ÷ declared `shipment_value` on invoice lines. Not Sales revenue. | 🔶 | Accept invoice shipment value, or use Sales revenue? |
| 25 | Total inventory | Locked SQL, Regular + Live, excl COUP/DFA/Uncategorized | Cache build keeps Live facilities, drops COUP/DFA and Uncategorized. The page's Regular view matches. The headline summary also counts Dark Store, Frido Store, Internal Store. | ✅ | Regular only (page toggle) or all Live? |
| 26 | Inventory by warehouse | GROUP BY facility | Same data. The page groups by Location (city) with Facility underneath. | ✅ | Warehouse = Location or raw Facility code? |
| 27 | SKU stock | By SKU and warehouse | Same, alias SKUs roll into master SKU. | ✅ | — |
| 28 | DOI | Stock ÷ avg daily sale | DOI = floor(stock ÷ ceil(max(avgSale, order allocation))), avg sale rounded up per Location. Null if stock > 0 and no demand. Bands: Critical ≤2, Low ≤15, Sufficient ≤45, Excess >45. | ⚠️ | For "<7 days", exclude zero-demand SKUs? Rounded-up avg sale OK? |
| 29 | Avg daily sale (Inv. Health) | 7/15/30 — CONFIRM | Page toggle 7/15/30, default 7. Window ends at the latest sales date, B2C units only, per Location. | 🔶 | Follow the page toggle (default 7) or fix one window? |
| 30 | Dead / slow stock | CONFIRM (sales_90d) | SKU status "Dead": stock > 0, no sale in 90 days, not a new launch. The Dead Stock **card** is different (sub-category DOI > 200 or nothing selling with stock > 200). | 🔶 | Which meaning? |
| 31 | OOS SKUs | No stock in live Regular WHs, sold B2C in 180 days | Stock ≤ 0 on latest snapshot, B2C units in 180 days > 0, all **Live** facilities (not Regular only). Uncategorized not dropped. Page hides never-in-stock SKUs. | ⚠️ | Regular only? Exclude Uncategorized as on Inventory Health? |
| 32 | OOS loss | Days out × avg daily sale (longest in-stock run) × ASP; <14-day run → 180-day avg | Same. Plus: days-out clock can start from the D2C sales stop; ASP falls back to Unicommerce B2C. | ✅ | Use the D2C-sales-stop start date, or stock-only? |
| 33 | Replenishment priority | new tool | Not on any page. Can reuse `buildOos`, `Lead_Time`, per-Location avgSale, `OpenPurchase`/`PutawayPending` (possible "on the way"). `requiredStock` is a different rule. | ❓ | — |
| 34 | Plan qty for X days | new tool | Not on any page. Same building blocks as #33. | ❓ | — |
| 35 | Ad spend | CONFIRM | SUM(spend) from `fact_all_platform_ads_report`, plus CRED additional spend (Overall) and D2C additional spend. The monthly table excludes additional spend. | 🔶 | Include additional D2C and CRED spend? |
| 36 | ROAS | Revenue ÷ spend — CONFIRM | Total-sales ROAS: channel net revenue ex GST ÷ spend, not ad-attributed. | 🔶 | Is total-sales ROAS intended? |
| 37 | ACoS / TACoS | CONFIRM | **Not in the code** (no ACoS or TACoS anywhere). | ❓ | Define ACoS and TACoS? |
| 38 | CM1 / CM1 % | CONFIRM | CM1 = net revenue − COGS − SnD (before marketing). CM1 % over covered net revenue ex GST only. | 🔶 | Confirm CM1 is before marketing. |
| 39 | COGS | cogs_ledger by month; say if month not loaded | P&L COGS = per-unit blended rate × net units, from `product_cogs_monthly`. Months not loaded are carried forward (flagged), with a 40%/50% of ASP fallback. No "not loaded" message. | ⚠️ | Report carried-forward months as an estimate rather than "not loaded"? |
| 40 | Marketing % | CONFIRM | Spend ÷ net revenue ex GST. Channels with no spend source show "Not available". | 🔶 | % of net or gross? |
| 41 | CAC | CONFIRM (₹700 unified) | (Meta + Google + D2C additional spend) ÷ new Shopify customers in range. No ₹700 constant in code. | 🔶 | Where does ₹700 come from, and should it override? |
| 42 | New vs repeat | CONFIRM | Returning = first order before range start, among customers ordering in range. A second cut (customers with >1 order) also exists. | 🔶 | Which is "repeat"? |
| 43 | LTV / LTV:CAC | CONFIRM (on margin) | LTV = trailing-365-day revenue per customer (not margin). Margin variant uses a fixed 35%, not real CM1. | 🔶 | Revenue-based or 35%-margin number? |
| 44 | Support tickets | CONFIRM | Open tickets created in the last 45 days, age buckets 1,2,3,4–5,6–8,9–10,11–15,15+. "Older than 9 days" can only be ≥9. | 🔶 | ≥9 days and the 45-day cap OK? |

## RTO check (known case)

- **Logistics → Performance, 1–30 Sep 2026, forward shipments (the page default): 18,695 RTO of 228,645 = 8.18%, shown as 8.2%. Reproduced: yes**, by running the `api/logistics.js` handler against live BigQuery (SELECT only).
- Without the forward filter (all directions): 18,697 / 259,841 = 7.20%.
- Other forward counts: delivered 207,285 (90.66%), in transit 1,675, pickup pending 280, cancelled 557, lost/damaged 101.
- **Why Pulse said 4.7%:** the connector CLAUDE.md formula divides RTO order **revenue** by **gross revenue across all platforms** (from `fact_all_platform_sales_report`). The Logistics page counts Clickpost **shipments**, where the COD-heavy D2C RTO sits. I did not run the 4.7% query; this is from reading the formulas.
- **Not yet done (Step 3):** remove the revenue-based RTO from Pulse and the connector CLAUDE.md. This waits for your "go".
