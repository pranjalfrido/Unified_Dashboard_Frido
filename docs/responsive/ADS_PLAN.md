# Ads Phase 2 plan (ADS_MASTER_PLAN.md Part B §8), self-approved under OVERNIGHT_RUN_ADS_CUSTOMER.md §3

Branch `feature/responsive-ads` = `release/responsive` + `fix/ads-data` (Ads Phase 1) + `feature/responsive-pnl` (for the shared P&L pieces: `WatchlistCard`, `FlagChips`, ranked lists with flag dots, `MasterTrendCard` tile values), all merged locally. Merge order for Suraj: P&L → Ads.

## 1. Data per tab (code wins)

| Need | Source today | Notes |
|---|---|---|
| Cards, trend | `ads` (cached `ads-data.json` sliced to the range, or live `/api/bq`) + `data.chMap` | unchanged |
| Daily spend per channel (Overall stacked bars, heat table) | `ads.daily` (platform × day spend / clicks / impressions) | exists on both paths |
| Daily revenue per channel | `ads.channelDailyExcRev` (cached) / `data.<channel>.daily` + Shopify daily | exists; Flipkart / Myntra pending days from Phase 1 A7 |
| D2C sub-type split (Meta / Google) | `ads.daily` platform Meta / Google | exists |
| Amazon sub-type split (SP / SB / SD) per day | none per day (only range totals, `byAdType`) | **day split not available**: Amazon daily bars are one colour; the SP/SB/SD split is the range split bar (B2) |
| Last 6 months | none (cache = 90 days) | **one extra query** (below), cached for the session |
| Budget | none (`MONTHLY_BUDGET = null` TODO in App.jsx) | **no budget line** in pacing |
| Product spend / revenue / ROAS | `ads.allSpendDetail` / `spendDetailByPlatform` subCategoryRows | exists |
| Previous-period product spend / revenue (ROAS down) | cached path: sliced from `adsDailyByCategory` / `salesDailyByCategory` for the same-length window (as Phase 1 A1); live path: none | rule hidden on the live path (all-or-none) |
| Breakeven ROAS per product | P&L: Gross ex GST ÷ CM1 ₹ per product, from the P&L Financial View rows | via a hidden summary-only P&L instance on the same payload (the P&L previous-period pattern), one per channel tab that has CM1: D2C, Amazon, Flipkart, Blinkit, Zepto, Instamart. Not Overall (no P&L CM1), Myntra / CRED (no CM1) |

**6-month query (B1.2):** `POST /api/bq` with `{ adsMonthly: true }` → one BigQuery query: monthly spend / clicks / impressions per platform from `fact_all_platform_ads_report` + monthly sales ex GST per channel from `fact_all_platform_sales_report`, for the 5 full months before the current one + the current month to yesterday. Same channel mapping as `chMap` (Shopify incl. International; Amazon SC + VC). No late-report estimates (raw sales), so the current month's Flipkart / Myntra revenue can sit below the card: caption says so. Cached per session (`sessionStorage`). No new function file (Hobby 12-function limit).

## 2. Revenue type (A6)
Every Ads revenue is **total channel sales ex GST**, not ad-attributed (D2C, Amazon, Flipkart, Myntra, quick commerce, CRED). So ROAS is labelled **"Total-sales ROAS"** on cards, tables, the platform overview and share bars, with one InfoPopover explaining it. Share-of-revenue bars compare total-sales shares on every channel (no per-channel marking needed: all the same type).

## 3. Sections → components

| # | Section | Laptop | Mobile | Component (src/responsive/) |
|---|---|---|---|---|
| B3 | Header | unchanged | `MobilePageHeader` "Ads", date, ⋯ (Refresh, Export), channel chips | existing |
| B3 | Master card | unchanged | `MasterTrendCard`, 8 tiles (below) | existing |
| B1.5 | Ads watchlist | tiles in one row; click filters By product | rows → `FullScreenList` → product sheet | `WatchlistCard` (generalised: rule lines passed in, P&L unchanged) + new `useAdsRules` |
| B1.1 | Daily spend by channel | stacked bars, Spend / Revenue / ROAS toggle, hover → every channel; heat table under it (◌ = pending revenue) | stacked bars, Spend / Revenue toggle, legend top 4 + "n more", tap a day → `BottomSheet` | new `StackedDailyBars`, `HeatTable` |
| B1.2 | Last 6 months | month × channel table, Spend / Revenue / ROAS toggle, ▲/▼ vs month before (spend grey), Total row, current month "* 1–N, partial" | one row per month, newest first, stacked bar, tap → sheet | new `MonthChannelTable`, `MonthRows` |
| B1.3 | Month pacing | spent so far + month-end at today's run rate (no budget source) | same card | new `PacingBar` |
| B1.4 | Spend share vs revenue share (Overall) | per channel two bars + %s, top 5 + Show all | same | new `DualShareBar` |
| — | Platform overview (Overall) | unchanged | `CompactRankRow` list | existing |
| B2 | Amazon SP / SB / SD | donut → split bar | split bar | `MixBar` (existing) |
| B2 | Unattributed | one line above the lists ("₹2.86 Cr (33%) not linked to a product"); category / product lists without it; Total row still all spend (caption) | same line above the lists | — |
| B2 | ROAS cells | red only below the product's breakeven ROAS (where known), else red only < 1x; decorative green chips dropped | same rule in the sheet | — |
| B3 | By category / By product | unchanged tables (minus Unattributed row, new ROAS colours) | `MobileRankedList` with Category / Product toggle, sort chips Spend, ROAS ↑, Revenue, flag dots, sheet; top 8 + Show all | existing (`MobileRankedList` with badge / valueColor / renderSheet from P&L) |
| B1.6 | Total-sales ROAS label | cards, tables, overview | same | `InfoPopover` |

## 4. Tiles (8 each, even)

| Tab | Tiles |
|---|---|
| Overall, Amazon, Flipkart, Myntra, Blinkit, Zepto, Instamart | Spend, Ad revenue (total sales), ROAS, Orders, Cost / order, CTR, CPC, CPM |
| D2C | Spend, Meta, Google, Ad revenue, ROAS, Orders, CAC, CTR |
| CRED | Spend, Gross ex GST, ROAS, Orders, Units, ASP, AOV, Cost / order |

Hero = Total spend; sub-line "▲x% vs prev · Ad rev ₹x · ROAS y". Tiles with no daily series show "No daily breakdown" (MasterTrendCard). CAC has no ▲/▼ (no previous new-customer count, Phase 1). A tile whose value doesn't exist on a tab (e.g. CTR when clicks are 0) is dropped and the last tile with it, to keep the count even (logged on that tab).

## 5. Ads watchlist rules (`metricTargets.js` `ADS_RULES`, materiality: products < ₹10 K spend not flagged)

| Rule | Test | Where it shows |
|---|---|---|
| Spending at a loss (red) | product Total-sales ROAS < its P&L breakeven ROAS | channel tabs with P&L CM1 (D2C, Amazon, Flipkart, Blinkit, Zepto, Instamart) |
| Spend, no sales (red) | spend > ₹10 K and ROAS < 0.5x | every tab |
| Unattributed spend (amber) | unattributed > 20% of spend | every tab (channel-level tile, not a product list) |
| ROAS down (amber) | product ROAS ▼ ≥ 20% vs previous period | cached path only (previous product data exists there); hidden on the live path |
| CPC up (amber) | channel CPC ▲ ≥ 15% vs previous period | channel level (no product clicks in the data) |

## 6. Doesn't fit / decisions
- Amazon SP / SB / SD per day doesn't exist: the Amazon daily bars are spend per day (one colour), the split is the range split bar.
- No budget source: pacing shows run rate only.
- "Spending at a loss" needs P&L CM1, so it is hidden on Overall, Myntra and CRED.
- The 6-month current month uses raw sales (no late-report estimate), so Flipkart / Myntra current-month revenue can be below the card; caption says so.
- Unattributed line follows ADS_MASTER_PLAN B2 (decision D2 option a); if Suraj picks option b, the line becomes 0 and disappears.

## 7. Build order (one commit each)
Shared components → laptop watchlist → daily spend (+ heat) → 6 months (+ API) → pacing → share → B2 changes → mobile header → mobile master card → mobile sections → verification (B9).

## 8. §3 self-approval
- [x] Every section on the current page is mapped (table above); nothing dropped. Campaign / ad-type tables: not on the current page.
- [x] Only shared components in `src/responsive/`; new ones (`StackedDailyBars`, `HeatTable`, `MonthChannelTable`, `MonthRows`, `PacingBar`, `DualShareBar`, `useAdsRules`) are generic and get a line in MOBILE_DESIGN_SYSTEM §2.
- [x] Hero card and chart exactly as the released Overview (`MasterTrendCard` as-is).
- [x] Even tile counts (8); no donuts (Amazon donut → split bar); no wide tables in page flow (heat table and month table are laptop-only; mobile uses rows); no inner scroll except full-screen views.
- [x] New sections only read existing data, plus one cached extra query (6 months, named above).
- [x] Laptop changes limited to Part B: new sections under the trend / platform overview, Unattributed line, ROAS colours, Amazon split bar, Total-sales ROAS label.
- [x] Watchlist thresholds in `metricTargets.js` with a ₹10 K materiality filter.
