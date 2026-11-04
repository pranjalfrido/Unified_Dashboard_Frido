# P&L mobile + margin watchlist — plan (PNL_MASTER_PLAN.md Part B §9)

Branch `feature/responsive-pnl` = `release/responsive` (latest main merged in, main's job files kept) + `fix/pnl-data` (PR #25) merged locally, so this builds on the corrected numbers. New commits on PR #25 get merged in again.
Inputs: PNL_MASTER_PLAN.md Part B, `mockups/pnl_mockup.html`, MOBILE_DESIGN_SYSTEM.md. Hero card and chart = the released Overview (`MasterTrendCard` as-is; hero 24 / tile 14, the 26 Oct one-size rule). Overall stays "In progress": no new calculations there.

## 1. Section 2 confirmed from the code (the code wins where it differs)

| Tab / sub-tab | Columns that exist (code) | Spend per product? | Rules | Mobile tiles | ↗ opens |
|---|---|---|---|---|---|
| **D2C** Overall / MyFrido / Mobility | all incl. Mktg, ROAS, CM2 | yes — `pnlAdSpendMap`, by sub-category (= the FV's product grain) | all 8 | 10 | Price Simulator |
| **Amazon** Overall (SC + VC) | all incl. Mktg, ROAS, CM2 | yes — `amzAdSpendMap`, by sub-category (rescaled to the category totals) | all 8 | 10 | — (no Amazon tool) |
| **Amazon** SC / VC | up to CM1 (no spend) | — | `cm1`, `cogs`, `gm`, `ret`, `retup`, `asp` | 8 | — |
| **Flipkart** | all incl. Mktg, ROAS, CM2 | yes — `fkAdSpendMap`, by sub-category | all 8 | 10 | — |
| **Blinkit, Instamart, Zepto** | all incl. Mktg, ROAS, CM2; returns not captured | yes — `qcAdSpendMap`, by sub-category | all except `ret`, `retup` | 10 (Units instead of Returns) | — |
| **CRED, Firstcry** | up to GM (no SnD / CM1 / spend) | — | `cogs`, `gm`, `ret`, `retup`, `asp` | 6 | — |
| **Myntra** | up to GM (no SnD / CM1 / spend) + estimated late-report days | — | `cogs`, `gm`, `ret`, `retup`, `asp` + "In progress" strip | 6 | — |
| **EBO** | up to CM2, spend = allocated 1.5% (labelled since fix/pnl-data) | allocation only | `cm1`, `cogs`, `gm`, `ret`, `retup`, `asp` (no ad flags) | **8** (see §6) | — |
| **Offline** Overall / B2B / Stockist / MT GT / Misc | up to CM1 (no spend); credit notes allocated since fix/pnl-data | — | `cm1`, `cogs`, `gm`, `ret`, `retup`, `asp` | 8 | B2B Costing Calculator |
| **International** | revenue, returns, units; COGS "In progress" (fix/pnl-data) | — | **none** (In progress) | 4: Gross, Net, Returns, Units | — |
| **Overall** | revenue, returns, units; COGS→CM2 "In progress" | — | **none**; no watchlist / matrix / fixes (no new calculations) | 4: Gross, Net, Returns, Units | — |

Differences from Part B §2:
- **Amazon VC now has a previous period** (fix 4b + the previous-period loader), so `retup` / `asp` work there too.
- **Spend is at sub-category grain on every channel that has it.** That matches the Financial View's product rows, so `loss` / `thin` show per product (not channel-level only).
- **Matrix and Biggest fixes** need CM1. They show on D2C, Amazon (all views), Flipkart, quick commerce, EBO and Offline. They're hidden on CRED, Firstcry, Myntra, International and Overall.
- **Hidden rather than "0 products".** A rule whose inputs are missing on a tab is hidden. The watchlist is hidden entirely on Overall and International.

## 2. Bars in `src/config/metricTargets.js` (new `PNL_RULE_BARS` + `PNL_MATERIALITY`)

| Channel group | CM1 < | COGS > | GM < | Returns > | CM2 target | ASP ↓ | Returns ↑ |
|---|---|---|---|---|---|---|---|
| D2C (Overall, MyFrido, Mobility) | 30% | 50% | 50% | 20% | 15% | 5% | 3 pts |
| Amazon, Flipkart, Myntra | 20% | 45% | 40% | 15% | 10% | 5% | 3 pts |
| Blinkit, Instamart, Zepto | 18% | 45% | 35% | — (not captured) | 8% | 5% | — |
| CRED, Firstcry | 20% | 45% | 40% | 10% | — (no CM2) | 5% | 3 pts |
| EBO, Offline (all sub-tabs) | 30% | 45% | 45% | 10% | — | 5% | 3 pts |

- D2C is yours. The rest are your proposals as written, editable in one place.
- **Materiality:** a product is checked only if it has **≥ 1% of the tab's gross revenue or ≥ 50 units**. Below that, the header says "n small products not checked".
- **Formulas reused, not rewritten:** Breakeven ROAS = Gross ex GST ÷ CM1 ₹, and ROAS for the CM2 target = Gross ex GST ÷ (CM1 ₹ − target × Net). Both are moved out of `BreakevenRoasCalculator.jsx` into `pnlUtils.js` unchanged, and the calculator imports them back.

## 3. Previous-period ASP / returns
- **Source:** the previous-period loader from fix/pnl-data (a hidden summary-only P&L instance on the previous equal-length range's payload, session-cached). It exists for every tab, because it's the same request and pipeline as the page.
- **Extension:** today it reports channel totals only. It will also report each Financial View product row's gross, units and returns. Those are the same numbers the previous period's own Financial View would show, so no new calculation.
- **Rules that need it** (`retup`, `asp`) show a skeleton until it arrives, and are hidden if it fails.
- The existing `subCatPrevMap` (revenue only) isn't enough for ASP or returns, so it isn't used.

## 4. Mobile tiles (even) and daily series

| Tab | Tiles | Daily series (switch the chart; previous period dashed from the previous payload's daily rows) |
|---|---|---|
| D2C, Amazon Overall, Flipkart | 10: Gross, Net, Returns, COGS, GM, SnD, CM1, Mktg, ROAS, CM2 | Gross; Net (the day's net from the same daily loop, exposed); Returns %, COGS %, GM %, SnD %, CM1 %, CM2 % (`dailyPnL`). Mktg and ROAS show "No daily breakdown" |
| Amazon SC / VC | 8: Gross, ASP, Net, Returns, COGS, GM, SnD, CM1 | as above (`dailyPnL`); ASP = day's gross ÷ units |
| Blinkit, Instamart, Zepto | 10: Gross, Net, Units, COGS, GM, SnD, CM1, Mktg, ROAS, CM2 | Gross, Net (= ex GST here), Units; the rest "No daily breakdown" |
| CRED, Firstcry, Myntra | 6: Gross, Net, Returns, COGS, GM, Units | Gross, Units |
| EBO | 8: Gross, Net, Returns, COGS, GM, SnD, CM1, Units | Gross, Units |
| Offline (each sub-tab) | 8: Gross, ASP, Net, Returns (credit notes), COGS, GM, SnD, CM1 | Gross, Units-based ASP |
| International, Overall | 4: Gross, Net, Returns, Units | Gross, Units |

- **Margin tiles** (COGS, GM, SnD, CM1, CM2) show ₹ with the % beside it, as in the mockup. Their chart plots the daily %, labelled "GM %, daily".
- **Hero:** Gross (inc GST), with the sub-line "Net ₹x · CM2 y% · ROAS z" (only what exists) and the real ▲/▼ from fix/pnl-data.
- **Cards left out on mobile:** any card that only says "Not available", with one InfoStrip saying what's missing.

## 5. Tools (↗)
| Tool | Channels | ↗ in this phase |
|---|---|---|
| Price Simulator | D2C only (its product list is the D2C sub-tab's products) | opens the tool with the product selected (a small `initialProduct` prop; the URL pre-fill is Part C) |
| Breakeven ROAS | D2C only | Tools card only |
| B2B Costing Calculator | Offline (all sub-channels' products) | opens with the product selected |
| PO Approval Checker | Offline | Tools card only |
| — | Amazon, Flipkart, quick commerce, CRED, Firstcry, Myntra, EBO, International | ↗ hidden (no tool supports them) |

## 6. Anything that doesn't fit / decisions for you
1. **EBO tiles:** Part B says 6 (Gross, Net, Returns, COGS, GM, CM1), but EBO has a real SnD. I propose 8: those six plus SnD and Units. CM2 is left out because its spend is an allocation.
2. **Overall channel league:** I propose leaving it out in this phase, since Overall stays "In progress" with no new calculations.
3. **Table colours to replace** (current decorative rules in `PnLFinancialTable.jsx`), with rule colours (red only, per channel bar) instead:
   - Returns % red > 20
   - COGS % red > 60
   - GM % red < 0, green ≥ 40
   - SnD % red > 25
   - CM1 % red < 0, green ≥ 30
   - RoAS red < 1, green ≥ 3
   - CM2 % red < 0, green ≥ 20
4. **Flag names** follow the mockup: Loss after ads · Below healthy ROAS · CM1 < bar · COGS > bar · GM < bar · Returns > bar · Returns up · ASP down. "Loss after ads" (CM2 < 0) and "ROAS below breakeven" are the same test, so they're one flag showing both numbers.
5. **Fitting the table at 1366 / 1280:**
   - Two new columns (BE ROAS, Flags) plus ↗ on row hover.
   - Shorter headers with full names on hover.
   - Product column first, as in the mockup (today it's Category → Product).
   - Below 1280 it scrolls inside the card.
6. **Laptop additions** sit under the existing cards, trend and waterfall, which are unchanged.
7. **Tablets (768–1023px)** get the mobile layout, like Sales. The phone header applies at ≤ 768px and in phone landscape, as on other pages.
8. **New shared components** (`src/responsive/`, shared by laptop and mobile, EBO and Offline included): `useMarginRules`, `WatchlistCard`, `MarginMatrix`, `BiggestFixes`, `FlagChips`.

## 7. Build order (one commit each), then Verification §10
1. Rule engine + bars + materiality.
2. Previous-period per-product rows.
3. Laptop: watchlist, matrix, biggest fixes.
4. Laptop: Financial View flags / BE ROAS / ↗ / colours / fit.
5. Mobile: header (chips + sub-tabs).
6. Mobile: master card.
7. Mobile: watchlist.
8. Mobile: matrix + fixes.
9. Mobile: ladder.
10. Mobile: Financial View list.
11. Mobile: EBO store list + In-progress tabs.
12. Mobile: tools card.
