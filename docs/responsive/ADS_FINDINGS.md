# Ads Phase 1: findings and fixes (ADS_MASTER_PLAN.md Part A)

Branch `fix/ads-data` (from `main`, not merged). Run unattended under `OVERNIGHT_RUN_ADS_CUSTOMER.md` §2: only "safe class" fixes are in code; everything that changes a total or a definition is in `DECISIONS_FOR_SURAJ.md` (Ads section), code unchanged.

**Data path.** The Ads numbers come from the static job file `public/ads-data.json` (rolling 90 days, 28 Jul → 25 Oct) whenever the selected end date is inside it; everything else on the page (channel revenue, orders, customers, CRED) comes from `pnl-data.json` / `pnl-data-lastmonth.json` for MTD / last month, else the live `/api/bq`. All checks below: **1–25 Oct 2026** (reproduced as on 26 Oct, the screenshots' view) and **September 2026**, both static files. The figures in the plan (₹8.55 Cr ▼66.4%, ₹44.40 Cr / 5.20x, ₹4.26 Cr split…) reproduce exactly on `main` before the fixes.

## Findings

| # | Root cause | Class | Done |
|---|---|---|---|
| A1 ▲/▼ | Cached path compared against the generator's `prevTotals` = the 90 days before the whole cache window (`scripts/generate-ads-cache.mjs:19-25, 52`; never replaced in `injectAdsFromCache`, `App.jsx`). CAC's previous value divided last period's spend by **this** period's new customers. | safe (wrong previous window) | **Fixed** 9f6091c8 |
| A2 Unattributed | ₹2.86 Cr of ₹8.55 Cr (1–25 Oct) has `category='all'` or a category not in the item master, or a blank product. 96% is Meta "all products" sale campaigns (`target_type='all'`); ₹6.8 L is a "Socks" category missing from the item master. The live API spreads `'all'` spend over products by revenue share (`api/bq.js` adsCategoryBreakdown); the static-file path leaves it in "Others", so the two paths disagree. | needs Suraj (definition) | D2 |
| A3 Totals don't tie | Card / Platform overview revenue = channel sales incl. **CRED** and the **Flipkart / Myntra late-report estimates**; category / product tables = cached daily channel sales without CRED or estimates. 1–25 Oct gap ₹0.55 Cr = CRED ₹11.6 L + Flipkart estimate ₹38.3 L + Myntra estimate ₹5.2 L. | needs Suraj (definition) | D3 |
| A4 Amazon split | `byAdType` on the cached path is the cache's 90-day total, never sliced (₹4.26 Cr for any range). | safe (date filter) | **Fixed** b9ccfa22 |
| A5 CRED | ROAS 9.10x on every row: CRED spend is one monthly manager-entered figure spread by revenue share, so every row = channel ROAS. Colours hard-coded `#6366F1 / #10B981 / #F59E0B`. **1–31 Aug**: no CRED-specific date code exists; CRED spend only exists for months with a `markting_spend` CRED row (Sep and Oct have none), and `App.jsx` lets the previous range's `data.cred` override the sliced cache while a fetch is pending. | labels + palette safe; date: report | **Fixed** 7c1fca3e (labels, palette); D5 |
| A6 Revenue | Every Ads "Revenue" / ROAS is **total channel sales ex GST ÷ ad spend** (D2C = Shopify incl. International, Amazon = SC + VC, Flipkart / Myntra incl. estimates, CRED all sales). Ad-attributed revenue is loaded (`totals[].revenue`) but nothing shows it; Meta's is 0 in the source. | label (Phase 2 B1.6) | Phase 2 |
| A7 Late revenue | The trend used raw daily channel sales; Flipkart's last real day 21 Oct (₹48 K partial on 22 Oct, then ₹0), Myntra's 24 Oct. The late-report fields already exist (`latestRealDate`, `estimatedDays`). | safe ("pending") | **Fixed** 0f0b6e3e |
| A8 Tiny values | Rounding residual: channel totals and category rows are rounded separately; any ₹1+ difference created an "Others" row (Zepto ₹2, Instamart ₹4, Blinkit ₹0). Zepto ~90x on 20 Oct is one high-revenue day on ₹1–2 K spend (real). | safe (formatting) | **Fixed** 706851dd |
| A9 D2C | Additional spend ₹0 is real for Sep / Oct: `markting_spend` has no D2C additional-spend rows after Aug (cache has Jul–Aug only). New customers: Ads uses `fact_shopify_myfrido_mobility_all_orders` (in range, no order before) = **94,191**; the Customer tab uses the sales report's first Shopify order date (no `_EX`) = **90,342** for 1–25 Oct. Ads CAC also excludes additional spend; Customer CAC includes all of it. | needs Suraj (definition) | D4 |
| A10 ROAS vs P&L | 1–25 Oct: D2C 3.74x = 3.74x, Amazon 9.23x = 9.23x, Flipkart 7.04x = 7.04x, Zepto 5.86x vs 5.88x, **Blinkit 34.26x vs 39.34x**, **Instamart 13.53x vs 17.05x**, Myntra 9.64x vs — (P&L has no Myntra spend), CRED none. Quick commerce: P&L only counts spend on sub-categories with sales in the tab (the "Mktg vs Ads" gap already logged for P&L Overall). | report | D6 |

Also fixed (same safe classes, found while tracing):
- **044fc655**: with a category filter on D2C, Total Spend and the trend added additional spend for every date in the map (whole months after the live payload), not only the selected dates. No change for Sep / Oct (no additional spend those months).
- **7a94732c**: the Orders card drew the clicks sparkline.

Seen, not changed (logged):
- `api/bq.js:2167` adds Flipkart's **Inc-GST** estimate into an **Ex-GST** revenue (≈ ₹3.6 L too high for Oct) → D3.
- Cached path has no clicks / impressions / orders per category, so those cards show 0 with a category filter → BACKLOG.
- Overall "Orders" counts every sales channel (EBO, offline…), so Overall cost per order mixes scopes → BACKLOG.
- Blinkit clicks ▲62,600% (1–25 Oct vs 6–30 Sep) and ▼99.7% for Sep vs Aug: the previous-period Blinkit click / impression counts in `ads-data.json` are tiny compared with the current ones, so it compares the data as stored; worth checking the Blinkit clicks feed → BACKLOG (data task).

## Before / after

**A1: ▲/▼ on the spend card (values unchanged).** Previous spend per platform for 6–30 Sep = `pnl-data.json` `ads.prevTotals` to the rupee (Google 7,61,358 · Amazon 94,74,432 · Meta 6,45,83,967 · Flipkart 31,30,426 …).

| Tab | 1–25 Oct before → after | Sep before → after |
|---|---|---|
| Overall | ▼66.4% → ▲8.0% | ▼62.9% → ▼17.6% |
| D2C | ▼66.7% → ▼2.6% | ▼59.4% → ▼19.1% |
| Amazon | ▼66.9% → ▲71.0% | ▼76.8% → ▼13.2% |
| Flipkart | ▼59.2% → ▲9.6% | ▼56.3% → ▲12.4% |
| Blinkit | ▼81.7% → ▲10.9% | ▼80.2% → ▼1.3% |
| Zepto | ▼81.8% → ▲12.9% | ▼79.7% → ▼14.8% |
| Instamart | ▼74.2% → ▲4.1% | ▼70.1% → ▼4.1% |
| Myntra | ▼9.7% → ▲181.9% | ▼55.9% → ▼39.5% |
| CAC (D2C) | ▼66.7% → no badge | ▼59.4% → no badge |

Clicks, impressions, CTR, CPC, CPM and cost per order badges move the same way (they used the same wrong previous totals); orders badges unchanged (already correct).

**A4: Amazon split.** 1–25 Oct ₹4.26 Cr (SP 3.00 Cr · SB 90.82 L · SD 35.89 L) → **₹1.62 Cr** (SP 1.21 Cr · SB 30.18 L · SD 10.99 L) = Amazon spend. Sep ₹4.26 Cr → **₹1.14 Cr** (SP 80.84 L · SB 25.18 L · SD 7.88 L) = Amazon spend.

**A5:** CRED tables: "Spend" → "Spend (allocated)", "ROAS" → "ROAS (allocated)" with a hover note; chart in the Frido palette. No numbers change.

**A7:** Flipkart trend: revenue / ROAS end on 21 Oct, "4 days pending" (were ₹48 K, then ₹0 for 22–25 Oct); Myntra ends 24 Oct, "1 day pending".

**A8:** Zepto "Others ₹2", Instamart "Others ₹4" (category and product) and Blinkit "Others ₹0" rows gone; every table Total unchanged.

## Card totals vs table totals (after the fixes)

| Tab | 1–25 Oct spend card = table | 1–25 Oct revenue card vs table | Sep spend | Sep revenue |
|---|---|---|---|---|
| Overall | ₹8.55 Cr = ₹8.55 Cr | ₹44.40 Cr vs ₹43.85 Cr (A3) | ✓ ₹9.42 Cr | ₹44.90 Cr vs ₹44.64 Cr (A3: CRED) |
| D2C | ✓ ₹6.37 Cr | ✓ ₹23.83 Cr | ✓ ₹7.76 Cr | ✓ ₹27.85 Cr |
| Amazon | ✓ ₹1.62 Cr | ✓ ₹14.96 Cr | ✓ ₹1.14 Cr | ✓ ₹12.54 Cr |
| Flipkart | ✓ ₹34.30 L | ₹2.41 Cr vs ₹2.03 Cr (A3: estimate) | ✓ ₹36.78 L | ✓ ₹1.73 Cr |
| Myntra | ✓ ₹14.45 L | ₹1.39 Cr vs ₹1.34 Cr (A3: estimate) | ✓ ₹7.05 L | ✓ ₹78.63 L |
| Blinkit / Zepto / Instamart | ✓ | ✓ | ✓ | ✓ |
| CRED | ✓ ₹0 | ₹11.63 L vs ₹11.77 L (two CRED sources) | ✓ ₹0 | ₹26.39 L vs ₹26.97 L |

Spend ties everywhere. Every revenue difference is the A3 definition question (CRED and late-report estimates in the card, not in the tables; CRED card vs table read two different CRED sources). Not changed: it changes a total.

## Notes
- Local API has no Supabase / Postgres secrets, so CRED spend (Postgres `markting_spend`) is ₹0 locally and the 9.10x case can't be reproduced here; the label fix is display-only.
- Laptop screenshots (1366, Sep): before `C:/wtp2/cap-before/ads` (Overall, on main); after `C:/wtp2/cap-after/ads*` (local only; PNGs are git-ignored).
