# Frido Pulse playbook

One readable rulebook for how Pulse answers. The connector loads this file (copy in `frido-data-connector/knowledge/`, synced by `npm run sync-knowledge`) together with `PULSE_METRICS.md` and `knowledge/CLAUDE.md`.
Rules that code can enforce are enforced in the connector (section 1); text rules are the fallback.

## 1. Enforced in code (connector)

| # | Rule | Where |
|---|---|---|
| 1 | **Indian number format, done before the model sees results.** ₹ amounts: ≥ 1 Cr → `₹x.xx Cr`, ≥ 1 L → `₹x.xx L`, below → `₹45,320`. Counts with Indian commas (1,53,451). Percentages 1 decimal. Each formatted cell also carries the raw value, e.g. `₹1.23 Cr (raw 12330000)`. **Copy the formatted value; never convert units yourself.** | `lib/format.js`, applied in `executeTool` |
| 2 | **Dates are IST.** The connector computes today / yesterday / this week (Mon–Sun) / last week / this month / last month / last 7 / 30 days / mature window in IST and puts them in the system prompt. A bare `CURRENT_DATE()` in SQL is rewritten to `CURRENT_DATE('Asia/Kolkata')`. | `lib/dates.js` |
| 3 | **Product name = sub-category from the SKU master, never generated.** After any query with a SKU column the connector adds `Sub_Category (product name)` and `Category` from `Frido_Item_Master__frido_item_sku_master` (aliases via `productid_sku_mapping`). Not found → `not in SKU master`. If the final answer shows a different name for a SKU, it is sent back once with the correct names. | `lib/skuMaster.js`, `server.js` |
| 4 | **No bare failures.** If no answer can be produced, the reply is one line saying what was tried and what is missing. | `server.js` |
| 5 | **Data freshness.** If the period asked includes a day the sales/Clickpost table has not finished syncing (table last updated before that day ended, IST), the connector appends: `Note: data for 28 Oct is still syncing (last update 28 Oct 10:26 IST); the number may rise.` A partial day is never presented as final. | `lib/freshness.js` |
| 6 | **Denials.** After 1 denied tool call or file read the model is told "denied, don't retry this; use another route". Max 2 denials per question, then it answers with what it has. | `server.js` |
| 7 | **Read only.** Single SELECT / WITH only (parsed + BigQuery dry run), 5 GB per query, Supabase in a read-only transaction. | `lib/bigquery.js`, `lib/safety.js`, `lib/supabase.js` |

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
| **Returns** (general) | Sales page + Return Analysis, **all channels** | each channel's return % and the all-channel total |
| **Returns for D2C** | Sales → D2C | Cancellations, RTO, CIR, Exchange, Total return (₹ and %). Inside this breakdown RTO is the returns-component RTO; label it "RTO (in returns, as on Sales)". A standalone "RTO %" question still uses Logistics. |
| Inventory numbers (stock, by warehouse, by SKU, DOI, avg sale, critical) | **Inventory Health logic** (`_inventory_shared.js` / `inv-data*.json`), **Regular + Live facilities only** | never EBO, dark stores, Frido stores, FBA or non-live; say "as of <time>" |
| OOS SKUs and loss | Inventory → Out-of-stock loss (`api/inventory-oos.js`) | page method, unchanged |
| **Inventory planning** (how much to order / transfer / required) | section 6 | inventory from Inventory Health (Regular + Live); avg sale by the planning method |
| Ads, P&L, customers | their pages | ACoS / TACoS → "not tracked on the dashboard yet"; Overall P&L → "not available yet" |

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
1. Take the SKU's **B2C** sales (`Aggregated_uniware_sales_report`; B2C Order or unmapped = B2C; no B2B, PO or stock transfer) for the **last 6 months (180 days)**, daily, aliases resolved to the master SKU.
2. Find the **best sales window**: the 30-day stretch (rolling) with the highest B2C units per day.
3. **Avg daily sale = B2C units in that best window ÷ 30.**
4. Guards (flag each in the answer):
   - If the best window has one day with more than 3× the window's median daily sale (sale event / bulk order), drop that day and use the remaining days.
   - If the SKU has fewer than 30 days with sales in 180 days, use B2C units in 180 days ÷ number of days it was in stock; say so.
   - Per warehouse: same method on that warehouse's B2C sales.
5. Always show: the window used (dates), units in it, the avg daily sale, and the 6-month trend in one line (e.g. monthly units: May 120 · Jun 140 · …).

This planning avg sale is different from the OOS-loss page's method (longest in-stock run). OOS-loss answers keep the page method; planning answers use this one. Say which one was used.

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
