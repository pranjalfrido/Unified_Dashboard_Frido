# Ads Phase 2 report (new sections + mobile)

Branch `feature/responsive-ads` (pushed, not merged) = `release/responsive` + `fix/ads-data` (Phase 1) + `feature/responsive-pnl` (shared watchlist pieces). Merge order: P&L → Ads. Plan: `ADS_PLAN.md` (self-approved, all §3 boxes ticked). Verification: `ADS_VERIFICATION.md`.

## Laptop (added under the trend / platform overview; existing cards, trend and tables kept)
- **Ads watchlist**:
  - Spending at a loss: ROAS below the product's breakeven ROAS, from the P&L Financial View CM1 via a hidden P&L run on the same data. D2C, Amazon, Flipkart and quick commerce only.
  - Spend, no sales: spend > ₹10 K and ROAS < 0.5x.
  - Unattributed spend: more than 20% of spend.
  - ROAS down ≥ 20% vs the previous period (cached path only).
  - CPC up ≥ 15% (channel level).
  - Clicking a tile filters By product, with a "Flag: … ✕" chip.
- **Daily spend by channel**: stacked bars with a Spend / Revenue / ROAS toggle, plus a day × channel heat table. Pending-revenue days show ◌.
- **Last 6 months**: fixed window, from one extra cached query. Spend / Revenue / ROAS toggle, ▲/▼ vs the month before, current month marked partial.
- **Month pacing**: run rate only; no budget source exists.
- **Spend share vs revenue share** (Overall).
- **B2 changes**:
  - Unattributed spend is one line above the lists; Total rows still include it.
  - Amazon donut → split bar.
  - ROAS is plain text, red only below 1x or below the product's breakeven.
  - ROAS is labelled **total-sales ROAS**: revenue is channel sales, not ad-attributed.

## Mobile (below 1024px)
- **Header:** Ads, date, ⋯, 9 channel chips.
- **Master card:** the released Overview card, 8 tiles. D2C: Spend, Meta, Google, Ad revenue, ROAS, Orders, CAC, CTR. Others: Spend, Ad revenue, ROAS, Orders, Cost / order, CTR, CPC, CPM.
- **Sections, in order:**
  - Watchlist → list → product sheet.
  - Daily bars → day sheet.
  - 6 months → month sheet.
  - Share bars.
  - Pacing.
  - Platform overview.
  - Amazon split.
  - Unattributed line.
  - Category / product ranked lists with flag dots and sheet.

## Verification (all pass)
- **Mobile = laptop:** 8 of 8 values on all 8 tabs.
- **Totals:** daily bars = each channel's spend; 6-month current month = card spend on every tab.
- **Watchlist rule check:** every listed product meets its rule; 5 clear products per tab.
- **Tap-through:** Chromium + WebKit.
- **Screenshots:** 24 captures with no overflow.
- **Build:** production build passes.
- **Data path:** 1–25 Oct static files; 6-month view from the live API.

## New shared components (`src/responsive/`)
- `StackedDailyBars`, `HeatTable`, `MonthChannelTable`, `MonthRows`, `PacingBar`, `DualShareBar`.
- `WatchlistCard` / `FlagChips` gained optional props; P&L output is unchanged.
- MOBILE_DESIGN_SYSTEM.md §2 isn't edited on this branch: Suraj's working copy has uncommitted edits to that file. Please add these 6 lines there.

## Not done / notes
- **CRED on phones** keeps its current view (separate data path); not redesigned in this run.
- **ROAS down** is noisy after a sale month (Sep vs Aug: 46 products, −₹20.96 Cr "revenue at the old ROAS"). See DECISIONS D7.
- **Mobile filters:** the category / product slicers are laptop-only; mobile has search + group chips in the full-screen lists.
- **Local limits:**
  - No Postgres secret, so CRED spend shows ₹0 locally.
  - Laptop full-page captures show empty Recharts charts (capture artefact; the live page is fine).
