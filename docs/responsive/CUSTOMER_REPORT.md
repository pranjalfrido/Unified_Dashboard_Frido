# Customer Phase 2 report (laptop fixes, new insights, mobile)

Branch `feature/responsive-customer` (pushed, not merged) = `release/responsive` + `fix/customer-data` (Phase 1) + `feature/responsive-ads` (which holds `feature/responsive-pnl`), for the shared pieces. Merge order: P&L → Ads → Customer. Plan: `CUSTOMER_PLAN.md` (self-approved, all §3 boxes ticked). Verification: `CUSTOMER_VERIFICATION.md`.

**Preview:** https://vercel.com/pranjal-tripathi-s-projects/frido-navigator/8evbh94n6WNKXZ3fWZCg6sK88nf2 (Vercel deployment of b5bc2578, status success)

## Laptop: Customer Intelligence (every section kept)
- **Customer health watchlist** on Overview, 6 rules (`CUSTOMER_RULES` in metricTargets.js): acquisition getting expensive, LTV:CAC below 3x, M1 retention slipping, repeat revenue share down, discount dependence, win-back pool. Click a rule → the sub-tab that explains it.
- **No donuts:** Basket composition and Discounted vs non-discounted are split bars with numbers.
- **No rotated labels:** Repurchase cycle and Category-wise discount are horizontal bars with labels on the left; the category chart shows one series at a time (toggle above it).
- **One bar series + one line:** Spend vs Sales, Discount distribution and Spend vs Sales vs RoAS pick their line with a toggle (no orange / blue / black lines).
- Cohort heatmap: M0 greyed, colour scale from M1. Trend lines dark green.
- The RFM Segments list already is the segment actions table (segment, customers, ₹, rev %, action). No "last 90 days revenue" or export exists, so none added.

## Laptop: Customer Support
- **Support watchlist** under the KPI cards, 4 rules (`SUPPORT_RULES`): pending > 8 days, agent FRT above target, escalation rate up, contacts per 100 orders up. Click → the section.
- **Detailed KPIs no longer cut off:** the tables and ageing tables grow to fit; TTR opens on the latest day with a scroll hint and a sticky resolver column; full resolver names on hover.
- **Channel mix:** split bar + rows instead of a donut.
- **Top volume drivers:** contacts per 100 orders (Daily view) and links to Logistics / Return Analysis.

## Mobile (below 1024px)
- **Header:** "Customers", date pill, ⋯ (Refresh; Export on Support). Underline tabs Intelligence | Support; on Intelligence a slim scrolling row of six sub-tabs.
- **Overview:** master card (Gross sales + 8 tiles), health watchlist, the two ledgers (tap → previous).
- **Acquisition:** master card (6 tiles), daily bars with toggles (acquisition, new vs repeat, CAC / ROAS, spend / sales / CAC with the efficiency line), day of week.
- **Retention:** summary card (M1 + 4 tiles), retention curve (M1–M12, show all), cohort rows with M1 / M3 / M6 chips, full heatmap.
- **Behaviour:** summary card, top 5 cross-sell + full heatmap, repurchase cycle, days to 2nd purchase, order frequency, AOV by order, basket split, top pairs.
- **Segments:** win-back strip, summary card, segment list → sheet with action, 3 × 3 RFM grid → sheet, frequency / monetary / inactivity bars.
- **Discounts:** summary card (6 tiles), spend vs sales bars, discount bands, discounted vs full price, category-wise rows.
- **Support:** Daily / Weekly / Monthly toggle, master card (Interactions + 8 tiles, rates in points), watchlist, volume + channel split, agent FRT + SLA rows, calls, busiest hours + full heatmap, orders vs interactions, drivers, agent leaderboard, pending Parent / Child cards + all groups.
- **Detailed KPIs (B4a):** one row per section → a sheet built from the laptop's own `sections()` output: group chips, % / Count where the laptop has it, value + change + mini bars per period, "Closed" on Sundays. TTR (Parent / Child, groups, full table) and Volume drivers (top 8 + all 15). Nothing hard-coded from the mockup.

## Verification (all pass)
- **Detailed KPIs phone = laptop:** Day, Week and Month; every section, metric, period and "vs prev", Count and %; TTR and all 15 drivers. 0 mismatches, 0 missing.
- **Customer Intelligence phone = laptop:** 360 of 366 numbers; the other 6 are phone-only shares (listed).
- **Watchlist rules** recomputed from the API = app (flagged and clear examples).
- **Laptop 1366:** every existing number unchanged; changes only in the B1 / B2 areas.
- **Design system:** 0 off-palette colours, 0 text < 12px, no donuts, no page sideways scroll, no inner scroll (Chromium + WebKit).
- **Tap-through:** 35 / 35 on Chromium and WebKit, incl. finger scroll.
- **Screenshots:** SE / 14 / Pixel / small Android / landscape / iPad portrait, no overflow.
- **Build** passes; lint unchanged.

## New shared pieces (`src/responsive/`)
- `FullScreenTable` (wide table / heatmap in a full-screen view, sticky first column) + `heat.js`; `MiniBars`.
- `WatchlistCard`: optional rule `target` (tap jumps to a section) and `headerText`.
- `DeltaBadge` / `KpiTile` / `MasterTrendCard`: `deltaPts` (changes in points) and `deltaNeutral` (grey, for volumes).
- `MobilePageHeader`: `subTabs2Scroll` (second row scrolls sideways).
- MOBILE_DESIGN_SYSTEM.md §2 isn't edited on this branch: Suraj's working copy has uncommitted edits to that file. Please add these lines there.
- Customer modules (`src/customer/`): `supportModel.js` (moved unchanged from the Support page), `customerRules.js`, `customerDefs.js`, `customerDerive.js`, the two phone views.

## Not done / notes
- **Repurchase due** (B2.3): needs a new customer-level query → DECISIONS C9.
- **Backlog trend** (B2.6): no daily snapshot history; today only → BACKLOG.
- **FRT rule** flags chat and email every day with the SLA-based targets → DECISIONS C8.
- **"Revenue at risk"** tooltip lists fewer segments than it sums → DECISIONS C10.
- Retention phone tiles M1 / M6 / Inactive / Orders per customer have no ▲/▼ (summary card); the hero has the laptop's ▲/▼.
- Support data for "yesterday" is empty before 11:00 IST (DECISIONS C7); checks ran at 05:00 IST, so the phone = laptop checks used the same partial day on both.
