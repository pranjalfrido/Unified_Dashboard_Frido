# Customer Phase C1: findings and fixes (CUSTOMER_MASTER_PLAN.md Part A)

Branch `fix/customer-data` (from `main`, not merged). Run unattended under `OVERNIGHT_RUN_ADS_CUSTOMER.md` §2: only safe fixes are in code; anything that changes a total or a definition is in `DECISIONS_FOR_SURAJ.md` (Customer section).

**Data path.** Customer Intelligence = one live `POST /api/customer {start, end}` (22 BigQuery queries on `fact_all_platform_sales_report`, Channel = Shopify, `CustomerId`, `_EX` orders excluded, + Postgres `markting_spend`). Customer Support = live `POST /api/customer-support` on `production.cs_dashboard_unified` (rebuilt daily at 11:00 IST). No static files. Checks: 1–26 Oct 2026 (Intelligence), default day Mon 26 Oct and 20–26 Oct (Support), local API.

## Findings

| # | Root cause (file:line on main) | Class | Done |
|---|---|---|---|
| CA1 date | No fixed August default: Customer uses the global range (App.jsx:20164, `getDefaultDates`). 1–31 Aug was carried over from another page. The Segments & RFM tab greyed the picker out as "all-time", but RFM is the 12 months up to the **end** date (customer.js:247). | label / UI | **Fixed** 6fe4f575 (picker usable, note corrected) |
| CA2 bases | Inactive 90+ = all-time Shopify customers, **no `<= end` bound** (customer.js:316-327); Customers analysed = customers with an order in the 12 months to end (customer.js:239-280; one-time buyers included); repeat rate base = all customers up to end (customer.js:664-716). | labels safe; end bound needs Suraj | **Labels fixed** 6fe4f575; C1 |
| CA3 orders / customer | 1.11 = period orders ÷ period customers; 1.44 = lifetime average to end. "Median repurchase gap" is actually a mean of means. | label | **Fixed** 6fe4f575 |
| CA4 payback | Acquisition "1d" = `round(CAC ÷ (AOV × 35%))` = **orders** to pay back, not days (App.jsx:17517-17543; AOV inc GST vs spend ex GST). Spend & Discounts "3.7 mo" = CAC ÷ (12-month revenue per customer ÷ 12), no margin. | units label safe; one definition needs Suraj | **"1.1 orders"** 6fe4f575; C2 |
| CA5 ad spend | Customer additional spend = all D2C additional spend in `markting_spend`, prorated by days; Ads = product-only, prorated by revenue. Sep / Oct have none. Customer CAC includes it, Ads CAC doesn't; new customers from different tables (90,342 vs Ads 94,191 for 1–25 Oct). **Bug:** previous-period Total Spend left additional spend out. | comparison fix safe; scope needs Suraj | **Previous spend fixed** 91fb15a9; C3 |
| CA6 LTV | `ltv12` = revenue per customer over the trailing 12 months (customer.js:890-894), not margin, not lifetime. "Maturing" always showed because no previous LTV is computed. | label safe; margin LTV needs Suraj | **Labels fixed** 6fe4f575; C4 |
| CA7 trend | Granularity defaulted to monthly whatever the range; Ad Spend bar hard-coded blue. | display | **Fixed** b731a213 |
| CA8 cross-sell | Same-category diagonal included in colours (and in lift denominators). | colour safe; lift maths needs Suraj | **Diagonal greyed, out of the colour scale** b731a213; C5 |
| CA9 RFM | Badge colours off palette. "Others" = last order 90+ days ago, one order in 12 months, ≥ ₹5,000 (customer.js:258-270); the ELSE branch also puts 61–90-day low-frequency buyers into Hibernating. | colours safe; cell mapping needs Suraj | **Palette** b731a213; C6 |
| CA10 daily compare | Cards / tables compared with the calendar day before (CustomerSupportPage.jsx:1059, :283). | comparison window | **Fixed** 640617b1: same weekday last week; Sunday calls "Closed" |
| CA11 % of % | Every change was relative, rates included (DeltaPill / Delta). | format | **Fixed** 574d3439: rates in points |
| CA12 inbound | "Inbound" = Freshdesk tickets with source Phone (logged any time, Sundays too); calls = Ozonetel line. **Tue 20 Oct is Dussehra**: every source is low (phone tickets 458, all tickets 1,991, calls 201 vs ~2,500), the same pattern as a Sunday, so it's not a data gap. | label | **Fixed** 679bb39e: "Inbound (tickets)" / "Calls (Ozonetel)" |
| CA13 leaderboard | Agent FRT = first public agent reply (none on phone tickets) → "—"; ART = Freshdesk resolution time (phone tickets closed when logged) → 0.0h. | label | **Fixed** 679bb39e: "n/a (voice)" with reason |
| CA14 colours | Polarities already match the plan except UITU / UITO / CITU / CITO (units or orders per contact: higher is better, were neutral). Customer Intelligence badges already treat CAC as lower-is-better (`CpDelta` is unused). | display | **Fixed** be379af1 |
| CA15 dots | Only the disposition's trailing "." was trimmed, not sub categories; the top-drivers card used raw names. | display | **Fixed** 679bb39e |

Also seen (not changed):
- **Support's default day is yesterday, but the table only rebuilds at 11:00 IST**, so before 11:00 "yesterday" is nearly empty (Mon 26 Oct at 02:30: 100 interactions vs ~3,500), and every card shows ▼95%+. → C7.
- Inactive 90+ sparkline plots cohort sizes, not inactivity → BACKLOG.
- Cross-sell query is all-time and `LIMIT 500` (totals truncated) → BACKLOG.
- 14-day backlog trend (Part B B2.6): no snapshot history exists; it can only be approximated from created / resolved dates → logged for Phase C2.
- Repurchase due (B2.3): needs customer-level last order per category, which no current query returns → needs one new query (Phase C2 plan).

## Before / after (labels and comparisons only; every value unchanged)

| Item | Before | After |
|---|---|---|
| Acquisition payback | PAYBACK PERIOD · 1d · "Approx. at 35% margin" | PAYBACK (ORDERS) · 1.1 orders · "Orders to recover CAC at ~35% margin" |
| Retention orders / customer | "Total orders ÷ unique customers" | "Orders ÷ customers, selected period" |
| Inactive 90+ | "Customers not seen in 90d" | "All-time D2C customers, last order 90+ days ago" |
| Purchase Behavior repeat rate | "6,78,018 of 25,80,591 customers" | "… D2C customers (lifetime, to the end date)" |
| Segments customers analysed | "All RFM segments combined" | "D2C customers with an order in the last 12 months" |
| Overview LTV | LIFETIME VALUE · "All-time avg rev / customer" · prev "Maturing" | LTV (12-MO REVENUE) · "Revenue per customer, last 12 months" · prev "n/a" |
| Overview trend | monthly (one bar for October) | daily (26 bars) |
| Support Escalation rate card | ▼100.0% | ▼0.6 pts |
| Support Detailed KPIs Day | 7 days, vs previous day ("DoD") | 7 days, vs same weekday last week; Sunday Ozonetel cells "Closed" |
| Support Interactions card (Mon 26 Oct) | vs Sun 25 Oct | vs Mon 19 Oct (3,576) |
