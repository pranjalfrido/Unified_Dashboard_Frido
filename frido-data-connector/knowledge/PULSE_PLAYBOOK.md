# Frido Pulse playbook

One readable rulebook for how Pulse answers. The connector loads this file (copy in `frido-data-connector/knowledge/`, synced by `npm run sync-knowledge`) together with `PULSE_METRICS.md` and `knowledge/CLAUDE.md`.
Rules that code can enforce are enforced in the connector (section 1); text rules are the fallback.

## 1. Enforced in code (connector)

| # | Rule | Where |
|---|---|---|
| 1 | **Indian number format, done before the model sees results.** ₹ amounts: ≥ 1 Cr → `₹x.xx Cr`, ≥ 1 L → `₹x.xx L`, below → `₹45,320`. Counts with Indian commas (1,53,451). Percentages 1 decimal. Each formatted cell also carries the raw value, e.g. `₹1.23 Cr (raw 12330000)`. **Copy the formatted value; never convert units yourself.** Money columns are recognised by name (rev, revenue, gross, net, amount, value, cost, sales, asp, aov, price — always alias money columns with one of these words). If the final answer contains a ₹ amount, or a bare number ≥ 1,00,000, that is not one of the formatted values, it is sent back once. | `lib/format.js`, applied in `executeTool` and `server.js` |
| 2 | **Dates are IST.** The connector computes today / yesterday / this week (Mon–Sun) / last week / this month / last month / last 7 / 30 days / mature window in IST and puts them in the system prompt. A bare `CURRENT_DATE()` in SQL is rewritten to `CURRENT_DATE('Asia/Kolkata')`. | `lib/dates.js` |
| 3 | **Product name = sub-category from the SKU master, never generated.** After any query with a SKU column the connector adds `Sub_Category (product name)` and `Category` from `Frido_Item_Master__frido_item_sku_master` (aliases via `productid_sku_mapping`). Not found → `not in SKU master`. If the final answer shows a different name for a SKU, it is sent back once with the correct names. | `lib/skuMaster.js`, `server.js` |
| 4 | **No bare failures.** If no answer can be produced, the reply is one line saying what was tried and what is missing. | `server.js` |
| 5 | **Data freshness.** If the period asked includes a day the sales/Clickpost table has not finished syncing (table last updated before that day ended, IST), the connector appends: `Note: data for 28 Oct is still syncing (last update 28 Oct 10:26 IST); the number may rise.` A partial day is never presented as final. | `lib/freshness.js` |
| 6 | **Denials.** After 1 denied tool call or file read the model is told "denied, don't retry this; use another route". Max 2 denials per question, then it answers with what it has. | `server.js` |
| 7 | **Read only.** Single SELECT / WITH only (parsed + BigQuery dry run), 5 GB per query, Supabase in a read-only transaction. | `lib/bigquery.js`, `lib/safety.js`, `lib/supabase.js` |
| 8 | **Page access per person.** The asking user's own dashboard tabs come from the database (`api/pulse.js`), never from the request. Every data tool checks them (`lib/pageAccess.js`): a page the person cannot open is refused with "ask your admin for access"; custom SQL is admins only; a call without access info gets nothing. The connector reads the dashboard with its own read-only secret (`NAVAI_API_SECRET`), which opens only read endpoints. | `lib/pageAccess.js`, `server.js` |

## 2. Order of sources

1. This playbook → 2. `PULSE_METRICS.md` → 3. the dashboard logic for that page (read the file named in the table below) → 4. own logic, labelled.
**Own logic is always labelled on the first line:** `Custom calculation, not from the dashboard:` + the definition in one line (e.g. "critical = lowest days of inventory, Regular + Live warehouses, avg sale over the last 30 days").

## 3. Where each kind of answer comes from

| Question about | Source (must match) | Notes |
|---|---|---|
| Sales: revenue, orders, units, AOV, ASP, top products | Sales page (`api/bq.js`) | "Revenue" = gross incl GST unless "net" asked; show vs previous period |
| **RTO %** (any question just about RTO) | **Logistics → Performance (Clickpost)** | shipment-based: RTO shipments ÷ forward shipments. Sep 2026 = 8.2% (18,695 / 228,645). **No revenue-based RTO as a standalone answer.** |
| **Logistics operations:** TAT, EDD breach, delivery rate, stuck, pending, NDR, courier performance | **Logistics → Performance (Clickpost)** (`api/logistics.js`) | forward shipments unless reverse asked |
| Logistics cost | Logistics → Cost (`api/logistics-cost.js`, courier invoices) | say if the latest month isn't loaded |
| **Returns** (general) | Sales page (provisional) + Return Analysis (actual), **all channels** | each channel's return % and the all-channel total; two definitions, see section 7 |
| **Returns for D2C** | Sales → D2C (provisional) + Return Analysis (actual) | Cancellation, RTO (in returns, as on Sales), CIR, Exchange, Total (₹ and %). A standalone "RTO %" question still uses Logistics. |
| Inventory numbers (stock, by warehouse, by SKU, DOI, avg sale, critical) | **Inventory Health logic** (`_inventory_shared.js` / `inv-data*.json`), **Regular + Live facilities only** | never EBO, dark stores, Frido stores, FBA or non-live; say "as of <time>" |
| **Inward (GRN) numbers:** inward units / value / GRNs / SKUs / vendors, source type, inward ÷ sales, rejection, new SKUs, last GRN days | **Inventory → Inward page** (`api/inward.js`, `dashboard_api inward`), see ENDPOINT_MAP Group 3b | **Finished goods only:** raw material / packaging codes not in the SKU master are excluded. Inward value = units × monthly COGS (browser-computed; no ASP fallback). DOI = Inventory Health, 7-day avg sale. If the Inward call is refused for access, say so. |
| OOS SKUs and loss | Inventory → Out-of-stock loss — the **`oos_loss` tool** runs the page's own SQL (`api/data/inventory_oos.sql`) and maths (`api/inventory-oos.js`) | numbers match the page; the old in-stock-run SQL in CLAUDE.md is reference only |
| **Inventory planning** (how much to order / transfer / required) | section 6 | inventory from Inventory Health (Regular + Live); avg sale by the planning method |
| **P&L, COGS totals, CM1, margins, marketing %** | P&L page — the **`pnl` tool** (runs the page's own code; TEMPORARY copy, see BACKLOG) | one channel + month at a time; says which COGS month is used; labelled "Approximate, check the P&L page" until verified; Overall P&L "not available yet" |
| Ads, customers | their pages | ACoS / TACoS → "not tracked on the dashboard yet"; Overall P&L → "not available yet" |

Pulse may read `_inventory_shared.js` (read-only) so inventory answers can follow the Inventory Health logic.

## 4. Answering rules

1. **Defaults when not said:** dates = this month (1st to today, IST); channel = all channels. "D2C" = Shopify MyFrido + Mobility (no Shopify International, no Retail Store).
2. **Ask back only when the answer would change a lot:** Amazon Seller Central vs Vendor Central; "best/top courier" (by volume, delivery rate, RTO or cost?); a name matching several SKUs. Otherwise assume and state it.
3. **Data missing** → one line ("COGS for October isn't loaded yet; latest is September.") and stop.
4. **Read only:** never write, update, delete or create anything; if asked, refuse in one line.
5. **Never invent** a number, product name, category, courier or warehouse. Everything shown must come from query results.
6. **If a tool or file read is denied:** do not retry the same thing. After 1 denial switch route: the locked templates, other allowed tables, or own logic (labelled). Max 2 denials per question, then answer with what you have.
7. **Never end with only "the data query failed".** If you truly can't answer, say in one line what you tried and what is missing.

## 5. Answer format (same every time)

1. **First line:** the main number in **bold** (copied from the formatted value) + change vs previous period if the page shows one. For own-logic answers the first line is the `Custom calculation, not from the dashboard:` label, then the bold number.
2. A short table if there is a breakdown (max 10 rows). SKU tables: `SKU · Sub-category · Category · numbers`.
3. **Last line:** `Source: <page> · <channel> · <dates, IST> · <filters>` with any assumptions, e.g. `Source: Logistics → Performance · D2C forward shipments · 1–30 Sep 2026`.
4. No long explanations unless asked; no emojis.

## 6. Inventory planning logic (build as a tool in Step 5; until then answer with this logic, labelled custom)

**Stock** = Inventory Health logic, Regular + Live facilities (per warehouse or total as asked). Stock reaches 3PL warehouses by transfer from Pune (Vadgaon_OPS / Frido_Sudhawadi).

**Avg daily sale for planning (the most important step):**
1. Take the SKU's **B2C** daily sales (`aggregated_uniware_sales_report`; channel description "B2C Order" or unmapped = B2C; no B2B, PO or stock transfer), aliases resolved to the master SKU. **Search for the best window in the LAST 90 DAYS only** (the 180-day series is kept for the trend).
2. **Remove spike days** (a day above 3× the window's median daily sale — sale event / bulk order).
3. Consider **every window from 7 to 30 days**. Take the highest average. **If a longer window's average is within 10% of the best, use the longest such window** (more stable). A window needs at least 7 selling days.
4. **Avg daily sale = units in the chosen window (spike days removed) ÷ days in it.**
5. If the SKU has **fewer than 7 selling days** in 180 days, use B2C units in 180 days ÷ the days it was in stock, and flag it as a fallback.
6. Per warehouse: same method on that warehouse's B2C sales.
7. Always show: **window dates and length**, units, avg/day, the **recent run rate** (units on in-stock days of the last 30 days ÷ in-stock days) and the 6-month monthly trend in one line.
8. **If the best-window avg is more than 2× the recent run rate, show two quantities** — `Plan (best window)` and `If current rate continues` — with a one-line warning.
The locked SQL is in CLAUDE.md ("Planning avg daily sale").

This planning avg sale is different from the OOS-loss page's method (longest in-stock run) and from Inventory Health's avg sale (last 7/15/30 days). Say which one was used. **A bare "avg sale / avg daily sale of <SKU>"** gets both in one line: `Planning avg: X/day (best window <dates>, N days)` first, then `Inventory Health avg (last 30 days): Y/day`. Planning questions use only the planning avg.

**Quantities:**
- **Lead time** = measured Pune → warehouse transfer days (median, last 90 days); **safety days** = 80th percentile − median, minimum 3. Until measured, use 7 + 3 days and say so.
- **Plan qty for X days** (default 40) = avg daily sale × (X + lead time) − current stock − on the way; round up to pack size if known; never below 0.
- **Top 10 to replenish per warehouse:** days of cover = stock ÷ avg daily sale; needs refill if cover < lead time + safety; rank by sales at risk (₹) = (lead time + safety − cover) × avg daily sale × ASP.
- Show per SKU: SKU · Sub-category · stock · days of cover · avg daily sale (window) · lead time · suggested qty · Pune stock ("Pune short by X → PO needed").
- Always say "stock on the way not included" (no data yet).

## 7. Definitions that follow the dashboard code (decided 2026-10-29)

Where Suraj's sheet and the code differed, the code wins. The list of changes is in `PULSE_METRICS.md` (each marked **Changed to match code**).
- Dashboard "today" uses UTC; **Pulse uses IST everywhere**. Logged in `docs/BACKLOG.md` as a separate dashboard fix.
- Mature window = today−43 to today−14 (30 days), as in the code.
- **Returns have two definitions; show both when they differ.**
  - **Provisional (as on Sales / P&L / Overview / net revenue):** days older than 15 days use each SKU's actual statuses; the latest 15 days use that SKU's rolling 30-day rate from the window before them (today−43 … today−14) × that day's own gross. Total = RTO + CIR + Return-status + full Cancellations (COD included); Exchange is separate. Source: `api/_returnComponents.js`, `computeNetRevenueMeasures` in `api/_bq.js`.
  - **Actual (Return Analysis):** actual statuses only; total = RTO + CIR + Return-status + prepaid-only cancellations. Source: `api/return-analysis.js`.
  - **Always show both, labelled by page, for any period:** `**Returns (as on Sales): X%** · Return Analysis: Y%` (for periods that include the latest 15 days: `**Returns (provisional, as on Sales): X%** · Return Analysis: Y%`), one line explaining the difference (Sales = full cancellations incl. COD + rolling estimate for the latest 15 days; Return Analysis = actual statuses, prepaid cancellations only), then the breakdown (Cancellation, RTO (in returns), CIR, Exchange, Total; ₹ and %) for the Sales view. Net revenue uses the provisional return rate for the latest 15 days. The answer period is always the period asked; the mature window is never the answer period.
  - Check (D2C, 1–28 Oct 2026, Sales tile, viewed with "today" = 28 Oct UTC): Returns 18.0% (₹5.30 Cr), Cancellation 4.6%, RTO 7.0%, CIR 6.4%, Exchange 6.2%, gross ₹29.51 Cr. Pulse (IST "today" = 29 Oct): 17.9% (₹5.28 Cr), 4.6%, 6.9%, 6.3%, 6.2%; with "today" = 28 Oct it gives 17.99% — the 0.1-point gap is the dashboard's UTC "today" (logged in `docs/BACKLOG.md`).
