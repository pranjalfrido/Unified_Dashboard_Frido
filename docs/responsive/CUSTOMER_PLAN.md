# Customer Phase C2 plan (CUSTOMER_MASTER_PLAN.md Part B), self-approved under OVERNIGHT_RUN_ADS_CUSTOMER.md §3

Branch `feature/responsive-customer` = `release/responsive` + `fix/customer-data` (C1) + `feature/responsive-ads` (which already holds `feature/responsive-pnl`), merged locally so the shared pieces (`WatchlistCard`, `MasterTrendCard`, `MobileRankedList`, `FullScreenList`, `BottomSheet`, `SegmentToggle`, `MixBar`, `CompactRankRow`, `HeatTable`, `StackedDailyBars`) are reused, not copied. Merge order for Suraj: P&L → Ads → Customer.

## 1. Data (code wins)

| Need | Source today | Notes |
|---|---|---|
| Customer Intelligence, every sub-tab | one live `POST /api/customer {start, end}` (unchanged) | mobile reads the same `custData`; derived numbers use the laptop's formulas (`src/customer/customerDerive.js`), checked value by value in §6 |
| Support cards, charts, ageing | live `POST /api/customer-support {grain, start, end}` (unchanged) | |
| Support Detailed KPIs | second `POST /api/customer-support` (Day = 8 days, Week = 4, Month = 3) (unchanged) | **mobile renders the laptop's own `sections()` / `ttrColumns()` / `driverRows()` output**, exported from `CustomerSupportPage.jsx`: same sections, rows, names, order, days and "vs prev"; nothing hard-coded from the mockup |
| Customer health watchlist | `kpis`, `prevKpis`, `cohort`, `rfm`, `discountRepeatRate` | no new source |
| Support watchlist | `pendency`, ticket rows, orders | no new source |
| Contacts per 100 orders by reason | `dispo7` (last 7 days to the end date) ÷ Shopify D2C orders of the same 7 days (Day view: the 7 days in the page model) | Week / Month view: counts only (orders for exactly those 7 days are not in that response) |
| Repurchase due (B2.3) | none: needs each customer's last order per category | **skipped and logged** (would be a new all-customer query) |
| Backlog trend (B2.6) | no snapshot history | **today only** (pending total on the ageing cards) and logged |

No new API, no new query.

## 2. Sections → components

### Customer Intelligence

| Laptop section | Laptop change (B1/B2) | Mobile (below 1024px) | Component |
|---|---|---|---|
| Sub-tab bar | — | header second row: Overview · Acquisition · Retention · Behaviour · Segments · Discounts | `MobilePageHeader` `subTabs2` |
| Overview 8 hero cards | — | `MasterTrendCard`, hero Gross sales; tiles Gross sales, Customers, New, Returning, Ad spend, ROAS, CAC, Repeat rev % | `MasterTrendCard` |
| (new) Customer health watchlist | added under the hero cards | rows; tap → the sub-tab that explains it | `WatchlistCard` + `useCustomerRules` |
| Ad Spend & Acquisition / Revenue & LTV tables | — | two compact cards: metric · current · ▲/▼; tap a row → sheet with previous | `Card` + `BottomSheet` |
| Performance trend | palette | covered by the master card's chart (Revenue / Customers / AOV are tiles) | — |
| Acquisition 6 KPI cards | — | master card hero New customers; tiles New, CAC, ROAS, Acquisition rate, LTV:CAC, Payback | `MasterTrendCard` |
| Acquisition over time · New vs repeat · CAC vs ROAS | palette | one card each: daily bars + `SegmentToggle` | `StackedDailyBars` |
| Day-of-week | — | 7 bars, toggle Customers / Revenue / Orders | `CompactRankRow` |
| Spend vs Sales vs ROAS / Spend vs CAC / CAC efficiency | palette; 3-series chart → bars + one line, extra series via toggle | one card, toggle Spend vs sales / CAC; efficiency sub-line "n days efficient · n costly" | `StackedDailyBars` |
| Retention 4 KPI cards | — | master card (summary mode: no daily series), hero M1; tiles M1, M6, Inactive 90+, Orders / customer | `MasterTrendCard summary` |
| Retention curve · Cohort quality · Size vs retention | palette | curve bars M1–M12 + "Show all"; quality / size as ranked rows | `CompactRankRow`, `FullScreenList` |
| Cohort heatmap | sticky Cohort + Size columns, M0 greyed, colour scale from M1 | "Cohorts" rows (size · M1 · M3 · M6, latest first, top 12) + "Full heatmap →" | `FullScreenList` + `HeatTable` |
| Purchase Behavior KPI cards | — | master card summary, hero Repeat purchase rate; tiles Repeat rate, Orders / customer, Days between orders, Multi-category % | `MasterTrendCard summary` |
| Cross-sell heatmap | — (C1 already greyed the diagonal) | top 5 pairs + "Full heatmap →" | `CompactRankRow`, `FullScreenList` |
| Repurchase cycle | rotated labels → horizontal bars | horizontal bars | `CompactRankRow` |
| Days to 2nd purchase · Order frequency · AOV by order number | palette | ranked rows | `CompactRankRow` |
| Basket composition | donut → split bar + numbers | split bar + 3 numbers | `MixBar` |
| Cross-category customers · Top category pairs | — | ranked rows | `CompactRankRow` |
| Segments KPI strip | — | `InfoStrip` (win-back sentence) + summary master card: Customers analysed, Revenue at risk, Healthy base revenue, Lifetime revenue | `InfoStrip`, `MasterTrendCard summary` |
| RFM segments | palette (C1) + **Segment actions** column set (segment, customers, ₹ lifetime, action) | `MobileRankedList` (name, customers, ₹, rev %, action chip) → sheet | `MobileRankedList` |
| RFM grid | — | 3 × 3 compact cells → sheet | small grid in the page view |
| Purchase frequency · Monetary · Inactivity | — | horizontal bars | `CompactRankRow` |
| Spend & Discounts KPI cards | — | summary master card: Total spend, Blended ROAS, CAC, Payback, Discounted order share, Avg discount / order (hero Total spend + 5 tiles → 6 tiles incl. hero metric) | `MasterTrendCard` |
| Spend vs sales (4 series) | bars + one line, toggle Spend / Sales / Discount | daily bars + toggle | `StackedDailyBars` |
| Discount distribution (dual axis, 5 series) | bars by band + one line, toggle AOV / Repeat % | ranked rows by band + toggle | `CompactRankRow` |
| Discounted vs non-discounted | donut → split bar + numbers | split bar + AOV + repeat rate side by side | `MixBar` |
| Category-wise discount | rotated labels / overlapping legend → horizontal bars, legend above, 2 series max + toggle | ranked rows: category, % discounted, avg discount, repeat % | `CompactRankRow` |

### Customer Support

| Laptop section | Laptop change | Mobile | Component |
|---|---|---|---|
| Daily / Weekly / Monthly | — | `SegmentToggle` under the header | `SegmentToggle` |
| 12 KPI cards | — | `MasterTrendCard` summary: hero Interactions; 8 tiles Interactions, Unique customers, ITO, ITU, MCR, FCR, Chat agent FRT, Escalation rate (12 → 8: Tasks per unit / order and the two Calls answered % move to the Calls card and Detailed KPIs) | `MasterTrendCard summary` |
| (new) Support watchlist | added under the KPI cards | rows → section | `WatchlistCard` |
| Interactions by channel + Channel mix | **donut → split bar** | stacked bars + split bar | `StackedDailyBars`, `MixBar` |
| Agent FRT · SLA attainment | — | FRT by channel (toggle) + SLA rows (bar, tick, pts) | `SegmentToggle`, page rows |
| Call funnel · Answered vs missed by hour | — | funnel rows + hourly bars | `CompactRankRow`, `StackedDailyBars` |
| Contact heatmap | — | "Busiest hours" (24 bars, weekday toggle) + "Full heatmap →" | `StackedDailyBars`, `FullScreenList` |
| Orders vs interactions | — | bars per period + ITO line as text | `StackedDailyBars` |
| Top volume drivers | + **contacts per 100 orders** sub-line, links to Logistics / Return Analysis | ranked rows | `CompactRankRow` |
| Agent leaderboard | — | `MobileRankedList` → sheet | `MobileRankedList` |
| Pending ageing (Parent / Child) | inner 300px scroll removed | two cards: total + ageing split bar + top 5 groups (9+ days red) + "All groups →" | `MixBar`, `FullScreenList` |
| Detailed KPIs (9 sections + TTR + Volume drivers) | **cards grow to fit (no 300px inner scroll), Total rows visible**, TTR fits 1366 (sticky group column, scroll hint), full resolver names on hover | one row per section → sheet: per metric today's value, change vs same weekday last week, 7 mini bars, % / Count toggle where laptop has it; TTR Parent / Child cards + groups → sheet; drivers top 8 + All 15 | `BottomSheet`, `SegmentToggle` |

Dropped on mobile (laptop keeps them): the Performance trend's separate granularity pills (the master card has its own ⋯), and the Acquisition "spend donut" (not rendered on laptop either).

## 3. Watchlist rules (`src/config/metricTargets.js` → `CUSTOMER_RULES`, `SUPPORT_RULES`)

Customer health: CAC ▲ ≥ 10% while ROAS ▼ · LTV:CAC < 3x · M1 of the latest complete cohort < its 12-cohort average − 0.5 pts · Repeat revenue % ▼ ≥ 2 pts · Discount dependence (repeat rate discounted − non-discounted > 5 pts) · Win-back pool (Hibernating + Cannot Lose Them, customers and ₹ lifetime). Materiality: cohort rule needs ≥ 1,000 customers in the cohort; rules needing a previous period are hidden when the previous value is 0.

Support: pending > 8 days (count, top resolver group) · Agent FRT above the channel's loosest SLA target (chat 40 s, email / social 15 min) · escalation rate ▲ ≥ 0.3 pts · interactions per 100 orders ▲ ≥ 10% (same weekday last week in Day view). Materiality: channel FRT needs ≥ 20 agent replies.

## 4. Header (B3)
"Customers" with underline tabs **Intelligence | Support** (white bold, full-width underline, as Inventory) and, on Intelligence, the slim second row of sub-tabs (as Logistics Cost). The date range is a pill in row 1, as on the released Inventory Sales & Allocation tab (the plan's "date in the filter sheet" assumed Inventory had none; Customer has no other filters, so there is no filter icon). "⋯": Refresh (+ Export on Support).

## 5. Self-approval (§3)
- [x] Every section on the current page is mapped to a mobile section (two dropped items listed above with the reason).
- [x] Only shared components in `src/responsive/`; `WatchlistCard` gains an optional rule `target` (tap without a product list) and `headerText`, documented in the component.
- [x] Hero card and chart exactly as the released Overview (`MasterTrendCard`).
- [x] Even tile counts (8 / 6 / 4 / 4 / 4 / 6; Support 8); no donuts; no wide tables in page flow (heatmaps and the ageing / TTR tables only in full-screen views); no inner scroll except full-screen views.
- [x] New sections only read existing data (no extra query; Repurchase due skipped, backlog trend today only).
- [x] Laptop changes limited to B1 / B2 of the master plan.
- [x] Watchlist rules have thresholds in `metricTargets.js` and materiality filters.

## 6. Verification (B6)
Mobile = laptop per sub-tab and Support section (cards, top rows, totals) on the same live path; Detailed KPIs value-by-value table (every section, metric, day and "vs prev"; zero metrics missing); watchlist rule-check table; laptop 1366 before / after; design-system checks on Chromium + WebKit; tap-through with finger scroll; screenshots SE / 14 / Pixel / small Android / landscape / iPad portrait. Results in `docs/responsive/CUSTOMER_VERIFICATION.md`.
