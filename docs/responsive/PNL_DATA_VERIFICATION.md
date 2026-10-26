# P&L data fixes (Phase 1) — verification

Branch `fix/pnl-data` from main (01cf0d5d). Not merged. Plan: `docs/responsive/PNL_MASTER_PLAN.md` Part A; decisions from 2026-10-26.

**Data path:** current period = static job files (`public/pnl-data.json` = 1–25 Oct, `public/pnl-data-lastmonth.json` = Sep 2026). Previous period (new ▲/▼) = live `/api/bq` through the shared loader (6–30 Sep and 2–31 Aug aren't static windows). EBO store-table numbers were checked with payloads generated locally from this branch's API (served in place of the static files in the test browser; `public/` untouched) — production shows them after the hourly job regenerates the files from main. Read-only BigQuery checks for root causes.

## Fixes (one commit each)
| # | Fix | Commit |
|---|---|---|
| 1 | Real previous-period ▲/▼ on every card; "—" while loading / failed / not comparable | 9776ebbb, session cache 42a7642c |
| 4b | Amazon VC previous period (Overall Gross ▲137.4% → ▲45.1%) | e4d1f098 |
| 2 | Flipkart/Myntra margins on actual product data, estimated days labelled; CM1/CM2 on the same base | 82c7f29a |
| 2 | Offline credit notes allocated to products (sub-tab + sub-category, else sub-tab), "Credit notes" waterfall step, ⓘ note | c24de08e |
| 3 | Overall + International "In progress"; negatives in Indian format (P&L only) | 66a86391, b079c7c0 |
| 4 | EBO store table: Unmapped/Ignored rows, no rescale, pro-rated rent/utilities, "Not available", partial EBITDA | 121b1977 |
| 4c | Quick-commerce returns "Not available" | 5ab6a7d9 |
| 4d | Mktg "Not available" without a spend source | 562861c6 |
| 6b | EBO spend "allocated 1.5% of Net", RoAS hidden | ea530a4f |
| 5 | Price Simulator current price, ROAS base, "mature-normalised" | 8a45f2b3 |
| — | Breakeven ROAS "Already launched" uses the product's GST | ef2aa66c |
| 6 | PO Approval Checker minus signs | b7672158 |
| — | BACKLOG (fixes + data tasks) | 5f1a5546 |

## Checks
| Check | Result |
|---|---|
| Card totals = Financial View Total (Gross, Net, COGS %, GM %, CM1 %, CM2 %), every tab and sub-tab except Overall | 1–25 Oct: 110 checks, all equal · Sep: 111 checks, all equal |
| Waterfall % = card % (GM, CM1, CM2) | equal on every tab (waterfall now prints the cards' %) |
| GM ₹ = Net − COGS | holds on Offline (credit notes allocated); Flipkart/Myntra on actual net (estimated days labelled) |
| ▲/▼ | every card has its own real ▲/▼ or "—"; previous period ~16 s cold, instant after (session cache, 0 requests on reload) |
| Laptop 1366 before/after (`docs/responsive/before|after/pnl-data/oct`) | changes only in KPI cards, waterfall, Financial View header/columns, EBO store table and the three tools; pages with a new strip/row are taller (Overall, International, EBO, Flipkart, Myntra, quick commerce) |
| Lint | no new errors in changed files (several fewer than main in PnLPage) |

## Reports
**EBO store EBITDA bridge, 1–25 Oct** (measured on the page, each step alone):

| Step | EBITDA | Δ |
|---|---|---|
| Before (main) | +₹13.50 L | |
| 1. Remove the ×1.12 net rescale (mapped stores, own net ₹2.13 Cr) | −₹11.81 L | −₹25.31 L |
| 2. Add Unmapped / Other (₹38.10 L) and Ignored (UTSAV) (₹1.87 L) rows — revenue/margins only, no EBITDA | −₹11.81 L | ₹0 |
| 3. Pro-rate rent (₹93.67 L → ₹76.22 L) and utilities (₹11.19 L → ₹9.03 L) to 25 of 31 days (15%-of-net fallback rent not pro-rated) | +₹7.81 L | +₹19.62 L |
The findings' "about −₹11.9 L" was step 1 alone. Sep (full month, no pro-rating): −₹2.85 L → −₹11.70 L.

**Offline credit notes by original sale month** — the data has no original-invoice field (credit notes carry their own date; none of the 296 Oct credit notes shares an OrderId with a sale). Approximation: each credit-note line matched to the same customer's most recent earlier sale of the same SKU.

| 1–25 Oct credit notes (₹66.76 L) | Oct sales | Sep sales | Aug or earlier | No earlier sale found |
|---|---|---|---|---|
| B2B (₹47.90 L) | ₹46.27 L | ₹1.45 L | — | ₹0.18 L |
| Stockist (₹18.81 L) | ₹1.24 L | ₹0.97 L | ₹5.10 L (Mar–Aug) | ₹11.51 L |
| Misc (₹0.05 L) | ₹0.01 L | ₹0.04 L | — | ₹0.01 L |
| **Overall** | **₹47.52 L** | **₹2.45 L** | **₹5.10 L** | **₹11.70 L** |

| Sep credit notes (₹39.86 L) | Sep sales | Aug or earlier | No earlier sale found |
|---|---|---|---|
| B2B (₹7.60 L) | ₹5.49 L | ₹2.03 L (Apr–Aug) | ₹0.05 L |
| Stockist (₹32.27 L) | ₹1.49 L | ₹6.19 L (Nov-25–Aug) | ₹24.59 L |
So about ₹7.6 L of Oct's ₹66.76 L matches Sep-or-earlier sales; most Stockist credit notes can't be matched (customer naming differs between credit notes and sales, or the sale predates the data) — logged as a data task.

## Every changed card, before → after (generated from the page)

### 1–25 Oct 2026 (previous period 6–30 Sep)

| Tab | Card | Before | After |
|---|---|---|---|
| all | NET REVENUE | ₹43.72 Cr ▲ 19.7% 75.7% of gross | ₹43.72 Cr ▲ 24.3% 75.7% of gross |
| all | RETURNS | ₹3.32 Cr ▲ 35.2% 5.7% of Gross | ₹3.32 Cr ▲ 3.2% 5.7% of Gross |
| all | COGS | ₹22.27 Cr ▲ 2.4% — of Net Rev | — — of Net Rev |
| all | GROSS MARGIN | ₹-22,27,20,131 GM% — | — GM% — |
| all | MKTG SPEND | ₹0 0.0% of Net Rev | Not available No ad spend source |
| all | Waterfall | Gross Revenue ₹57.74 Cr Net Revenue 100.0% ₹43.72 Cr Gross Margin -50.9% −₹22.27 Cr | Gross Revenue ₹57.74 Cr Net Revenue 100.0% ₹43.72 Cr |
| shopify:Overall | NET REVENUE | ₹19.62 Cr ▲ 2.1% 73.1% of gross | ₹19.62 Cr ▲ 4.0% 73.1% of gross |
| shopify:Overall | RETURNS | ₹4.74 Cr ▲ 15.0% 17.7% of Gross | ₹4.74 Cr ▼ 6.0% 17.7% of Gross |
| shopify:Overall | COGS | ₹8.17 Cr ▼ 15.9% 41.6% of Net Rev | ₹8.17 Cr ▲ 13.3% 41.6% of Net Rev |
| shopify:Overall | GROSS MARGIN | ₹11.45 Cr ▼ 15.9% GM% 58.4% | ₹11.45 Cr ▼ 1.8% GM% 58.4% |
| shopify:Overall | SND COST | ₹3.66 Cr ▼ 15.9% 18.6% of Net Rev | ₹3.66 Cr ▲ 4.1% 18.6% of Net Rev |
| shopify:Overall | CM1 | ₹7.80 Cr ▼ 15.9% CM1% 39.7% | ₹7.80 Cr ▼ 4.4% CM1% 39.7% |
| shopify:Overall | MKTG SPEND | ₹6.37 Cr ▼ 15.9% 32.4% of Net Rev | ₹6.37 Cr ▼ 2.6% 32.4% of Net Rev |
| shopify:Overall | ROAS | 3.74x ▲ 21.5% Gross Rev (Ex GST) / Spend | 3.74x ▲ 4.8% Gross Rev (Ex GST) / Spend |
| shopify:Overall | CM2 | ₹1.43 Cr ▼ 15.9% CM2% 7.3% | ₹1.43 Cr ▼ 11.6% CM2% 7.3% |
| shopify:MyFrido | NET REVENUE | ₹18.22 Cr ▲ 1.6% 72.9% of gross | ₹18.22 Cr ▲ 5.1% 72.9% of gross |
| shopify:MyFrido | RETURNS | ₹4.35 Cr ▲ 15.0% 17.4% of Gross | ₹4.35 Cr ▼ 0.9% 17.4% of Gross |
| shopify:MyFrido | COGS | ₹7.43 Cr ▼ 16.1% 40.8% of Net Rev | ₹7.43 Cr ▲ 15.6% 40.8% of Net Rev |
| shopify:MyFrido | GROSS MARGIN | ₹10.79 Cr ▼ 16.1% GM% 59.2% | ₹10.79 Cr ▼ 1.1% GM% 59.2% |
| shopify:MyFrido | SND COST | ₹3.52 Cr ▼ 16.1% 19.3% of Net Rev | ₹3.52 Cr ▲ 4.9% 19.3% of Net Rev |
| shopify:MyFrido | CM1 | ₹7.27 Cr ▼ 16.1% CM1% 39.9% | ₹7.27 Cr ▼ 3.8% CM1% 39.9% |
| shopify:MyFrido | MKTG SPEND | ₹5.94 Cr ▼ 16.1% 32.6% of Net Rev | ₹5.94 Cr ▼ 3.7% 32.6% of Net Rev |
| shopify:MyFrido | ROAS | 3.71x ▲ 21.1% Gross Rev (Ex GST) / Spend | 3.71x ▲ 8.0% Gross Rev (Ex GST) / Spend |
| shopify:MyFrido | CM2 | ₹1.33 Cr ▼ 16.1% CM2% 7.3% | ₹1.33 Cr ▼ 4.2% CM2% 7.3% |
| shopify:Mobility | NET REVENUE | ₹1.33 Cr ▲ 8.9% 71.1% of gross | ₹1.33 Cr ▼ 3.9% 71.1% of gross |
| shopify:Mobility | RETURNS | ₹39.12 L ▲ 15.0% 21.0% of Gross | ₹39.12 L ▼ 39.9% 21.0% of Gross |
| shopify:Mobility | COGS | ₹73.77 L ▼ 18.3% 55.7% of Net Rev | ₹73.77 L ▼ 5.7% 55.7% of Net Rev |
| shopify:Mobility | GROSS MARGIN | ₹58.74 L ▼ 18.3% GM% 44.3% | ₹58.74 L ▼ 1.4% GM% 44.3% |
| shopify:Mobility | SND COST | ₹13.38 L ▼ 18.3% 10.1% of Net Rev | ₹13.38 L ▼ 13.0% 10.1% of Net Rev |
| shopify:Mobility | CM1 | ₹45.36 L ▼ 18.3% CM1% 34.2% | ₹45.36 L ▲ 2.6% CM1% 34.2% |
| shopify:Mobility | MKTG SPEND | ₹46.97 L ▼ 18.3% 35.4% of Net Rev | ₹46.97 L ▲ 1.3% 35.4% of Net Rev |
| shopify:Mobility | ROAS | 3.76x ▲ 33.2% Gross Rev (Ex GST) / Spend | 3.76x ▼ 18.5% Gross Rev (Ex GST) / Spend |
| shopify:Mobility | CM2 | ₹-1,60,807 CM2% -1.2% | −₹1.61 L — CM2% -1.2% |
| ebo | NET REVENUE | ₹2.39 Cr ▲ 23.2% 81.8% of gross | ₹2.39 Cr ▲ 24.2% 81.8% of gross |
| ebo | RETURNS | ₹24.54 L ▲ 37.9% 8.4% of Gross | ₹24.54 L ▲ 12.8% 8.4% of Gross |
| ebo | COGS | ₹1.09 Cr ▲ 16.3% 45.7% of Net Rev | ₹1.09 Cr ▲ 31.1% 45.7% of Net Rev |
| ebo | GROSS MARGIN | ₹1.30 Cr ▲ 10.0% GM% 54.3% | ₹1.30 Cr ▲ 19.0% GM% 54.3% |
| ebo | SND COST | ₹24.45 L ▲ 12.8% 10.2% of Net Rev | ₹24.45 L ▲ 19.3% 10.2% of Net Rev |
| ebo | CM1 | ₹1.05 Cr ▲ 12.8% CM1% 44.1% | ₹1.05 Cr ▲ 18.9% CM1% 44.1% |
| ebo | MKTG SPEND | ₹3.58 L ▲ 12.8% 1.5% of Net Rev | (hidden) |
| ebo | ROAS | 72.82x ▲ 9.2% Gross Rev (Ex GST) / Spend | (hidden) |
| ebo | CM2 | ₹1.02 Cr ▲ 12.8% CM2% 42.6% | ₹1.02 Cr ▲ 18.7% CM2% 42.6% |
| ebo | MKTG (ALLOCATED 1.5% OF NET) | (none) | ₹3.58 L ▲ 24.2% 1.5% of Net Rev |
| amazon:Overall | GROSS REVENUE INC GST | ₹16.94 Cr ▲ 137.4% 1,31,918 units · SC + VC | ₹16.94 Cr ▲ 45.1% 1,31,918 units · SC + VC |
| amazon:Overall | NET REVENUE | ₹13.12 Cr ▲ 134.1% 77.4% of gross | ₹13.12 Cr ▲ 56.5% 77.4% of gross |
| amazon:Overall | RETURNS | ₹2.09 Cr ▲ 165.0% 12.3% of Gross | ₹2.09 Cr ▼ 5.9% 12.3% of Gross |
| amazon:Overall | COGS | ₹5.53 Cr ▲ 105.2% 42.2% of Net Rev | ₹5.53 Cr ▲ 80.2% 42.2% of Net Rev |
| amazon:Overall | GROSS MARGIN | ₹7.59 Cr ▲ 105.2% GM% 57.8% | ₹7.59 Cr ▲ 42.8% GM% 57.8% |
| amazon:Overall | SND COST | ₹3.74 Cr ▲ 105.2% 28.5% of Net Rev | ₹3.74 Cr ▲ 60.0% 28.5% of Net Rev |
| amazon:Overall | CM1 | ₹3.85 Cr ▲ 105.2% CM1% 29.3% | ₹3.85 Cr ▲ 29.3% CM1% 29.3% |
| amazon:Overall | MKTG SPEND | ₹1.62 Cr ▲ 105.2% 12.4% of Net Rev | ₹1.62 Cr ▲ 71.0% 12.4% of Net Rev |
| amazon:Overall | ROAS | 9.23x ▲ 14.1% Gross Rev (Ex GST) / Spend | 9.23x ▼ 15.5% Gross Rev (Ex GST) / Spend |
| amazon:Overall | CM2 | ₹2.23 Cr ▲ 105.2% CM2% 17.0% | ₹2.23 Cr ▲ 9.8% CM2% 17.0% |
| amazon:Overall | Waterfall | Gross Revenue ₹16.94 Cr Net Revenue 100.0% ₹13.12 Cr Gross Margin 57.9% ₹7.59 Cr CM1 29.3% ₹3.85 Cr CM2 17.0% ₹2.23 Cr | Gross Revenue ₹16.94 Cr Net Revenue 100.0% ₹13.12 Cr Gross Margin 57.8% ₹7.59 Cr CM1 29.3% ₹3.85 Cr CM2 17.0% ₹2.23 Cr |
| amazon:Seller Central | NET REVENUE | ₹5.71 Cr ▲ 3.5% 76.5% of gross | ₹5.71 Cr ▲ 9.1% 76.5% of gross |
| amazon:Seller Central | RETURNS | ₹1.02 Cr ▲ 16.6% 13.7% of Gross | ₹1.02 Cr ▼ 21.1% 13.7% of Gross |
| amazon:Seller Central | COGS | ₹2.28 Cr ▼ 10.7% 40.0% of Net Rev | ₹2.28 Cr ▲ 20.9% 40.0% of Net Rev |
| amazon:Seller Central | GROSS MARGIN | ₹3.42 Cr ▼ 10.7% GM% 60.0% | ₹3.42 Cr ▲ 2.4% GM% 60.0% |
| amazon:Seller Central | SND COST | ₹1.29 Cr ▼ 10.7% 22.7% of Net Rev | ₹1.29 Cr ▲ 3.9% 22.7% of Net Rev |
| amazon:Seller Central | CM1 | ₹2.13 Cr ▼ 10.7% CM1% 37.3% | ₹2.13 Cr ▲ 1.6% CM1% 37.3% |
| amazon:Vendor Central | GROSS REVENUE INC GST | ₹9.49 Cr 71,994 units · 56.0% of total | ₹9.49 Cr ▲ 108.9% 71,994 units · 56.0% of total |
| amazon:Vendor Central | NET REVENUE | ₹7.41 Cr 78.1% of gross | ₹7.41 Cr ▲ 134.9% 78.1% of gross |
| amazon:Vendor Central | RETURNS | ₹1.07 Cr 11.3% of Gross | ₹1.07 Cr ▲ 15.4% 11.3% of Gross |
| amazon:Vendor Central | COGS | ₹3.25 Cr 43.8% of Net Rev | ₹3.25 Cr ▲ 175.0% 43.8% of Net Rev |
| amazon:Vendor Central | GROSS MARGIN | ₹4.17 Cr GM% 56.2% | ₹4.17 Cr ▲ 110.8% GM% 56.2% |
| amazon:Vendor Central | SND COST | ₹2.45 Cr 33.1% of Net Rev | ₹2.45 Cr ▲ 123.7% 33.1% of Net Rev |
| amazon:Vendor Central | CM1 | ₹1.72 Cr CM1% 23.2% | ₹1.72 Cr ▲ 94.8% CM1% 23.1% |
| amazon:Vendor Central | Waterfall | Gross Revenue ₹9.49 Cr Net Revenue 100.0% ₹7.41 Cr Gross Margin 56.2% ₹4.17 Cr CM1 23.2% ₹1.72 Cr | Gross Revenue ₹9.49 Cr Net Revenue 100.0% ₹7.41 Cr Gross Margin 56.2% ₹4.17 Cr CM1 23.1% ₹1.72 Cr |
| flipkart | NET REVENUE | ₹2.03 Cr ▲ 61.8% 77.1% of gross | ₹2.03 Cr ▲ 93.4% incl. ₹36.80 L estimated (8 days, no product detail) |
| flipkart | RETURNS | ₹35.56 L ▲ 76.7% 13.5% of Gross | ₹35.56 L ▼ 26.4% 13.5% of Gross |
| flipkart | COGS | ₹87.75 L ▲ 36.2% 52.7% of Net Rev | ₹87.75 L ▲ 89.2% 52.7% of actual net |
| flipkart | GROSS MARGIN | ₹78.69 L ▲ 36.2% GM% 47.3% | ₹78.69 L ▲ 34.0% GM% 47.3% on actual net |
| flipkart | SND COST | ₹42.20 L ▲ 36.2% 25.7% of Net Rev | ₹42.20 L ▲ 53.1% 25.7% of actual net |
| flipkart | CM1 | ₹35.47 L ▲ 36.2% CM1% 17.7% | ₹35.47 L ▲ 14.2% CM1% 21.6% on actual net |
| flipkart | MKTG SPEND | ₹34.30 L ▲ 36.2% 16.9% of Net Rev | ₹34.30 L ▲ 9.6% 16.9% of Net Rev |
| flipkart | ROAS | 7.04x ▲ 18.7% Gross Rev (Ex GST) / Spend | 7.04x ▲ 47.7% Gross Rev (Ex GST) / Spend |
| flipkart | CM2 | ₹1.17 L ▲ 36.2% CM2% 0.6% | ₹1.17 L — CM2% 0.7% on actual net |
| flipkart | Waterfall | Gross Revenue ₹2.64 Cr Net Revenue 100.0% ₹2.03 Cr Gross Margin 38.7% ₹78.69 L CM1 17.5% ₹35.47 L CM2 0.6% ₹1.17 L | Gross Revenue ₹2.64 Cr Net Revenue 122.1% ₹2.03 Cr Net Revenue, actual (product detail) 100.0% ₹1.66 Cr Gross Margin 47.3% ₹78.69 L CM1 21.6% ₹35.47 L CM2 0.7% ₹1.17 L |
| blinkit | NET REVENUE | ₹1.40 Cr ▲ 24.3% 85.5% of gross | ₹1.40 Cr ▲ 24.3% = Gross ex GST (returns not captured) |
| blinkit | RETURNS | ₹0 0.0% of Gross | Not available Not captured for this channel |
| blinkit | COGS | ₹50.94 L ▲ 24.3% 36.3% of Net Rev | ₹50.94 L ▲ 20.6% 36.3% of Net Rev |
| blinkit | GROSS MARGIN | ₹89.29 L ▲ 24.3% GM% 63.7% | ₹89.29 L ▲ 26.5% GM% 63.7% |
| blinkit | SND COST | ₹59.57 L ▲ 24.3% 42.5% of Net Rev | ₹59.57 L ▲ 23.5% 42.5% of Net Rev |
| blinkit | CM1 | ₹29.72 L ▲ 24.3% CM1% 21.2% | ₹29.72 L ▲ 33.0% CM1% 21.2% |
| blinkit | MKTG SPEND | ₹3.56 L ▲ 24.3% 2.5% of Net Rev | ₹3.56 L ▲ 11.8% 2.5% of Net Rev |
| blinkit | ROAS | 39.34x ▲ 0.0% Gross Rev (Ex GST) / Spend | 39.34x ▲ 11.2% Gross Rev (Ex GST) / Spend |
| blinkit | CM2 | ₹26.15 L ▲ 24.3% CM2% 18.6% | ₹26.15 L ▲ 36.5% CM2% 18.6% |
| cred | NET REVENUE | ₹11.51 L ▼ 52.3% 90.0% of gross | ₹11.51 L ▼ 50.6% 90.0% of gross |
| cred | RETURNS | ₹12.56 K ▼ 47.5% 1.0% of Gross | ₹12.56 K ▼ 89.3% 1.0% of Gross |
| cred | COGS | ₹5.84 L ▼ 52.8% 50.7% of Net Rev | ₹5.84 L ▼ 54.8% 50.7% of Net Rev |
| cred | GROSS MARGIN | ₹5.67 L ▼ 52.8% GM% 49.3% | ₹5.67 L ▼ 45.4% GM% 49.3% |
| cred | MKTG SPEND | ₹0 0.0% of Net Rev | Not available No ad spend source |
| firstcry | NET REVENUE | ₹44.67 K ▼ 59.1% 87.4% of gross | ₹44.67 K ▼ 46.5% 87.4% of gross |
| firstcry | RETURNS | ₹1.29 K ▼ 54.3% 2.5% of Gross | ₹1.29 K ▼ 95.9% 2.5% of Gross |
| firstcry | COGS | ₹20.17 K ▼ 60.1% 45.1% of Net Rev | ₹20.17 K ▼ 43.1% 45.1% of Net Rev |
| firstcry | GROSS MARGIN | ₹24.50 K ▼ 60.1% GM% 54.9% | ₹24.50 K ▼ 49.0% GM% 54.9% |
| firstcry | MKTG SPEND | ₹0 0.0% of Net Rev | Not available No ad spend source |
| instamart | NET REVENUE | ₹15.32 L ▲ 8.5% 85.1% of gross | ₹15.32 L ▲ 8.5% = Gross ex GST (returns not captured) |
| instamart | RETURNS | ₹0 0.0% of Gross | Not available Not captured for this channel |
| instamart | COGS | ₹4.96 L ▲ 8.5% 32.4% of Net Rev | ₹4.96 L ▲ 5.2% 32.4% of Net Rev |
| instamart | GROSS MARGIN | ₹10.36 L ▲ 8.5% GM% 67.6% | ₹10.36 L ▲ 10.1% GM% 67.6% |
| instamart | SND COST | ₹4.53 L ▲ 8.5% 29.6% of Net Rev | ₹4.53 L ▲ 7.4% 29.6% of Net Rev |
| instamart | CM1 | ₹5.83 L ▲ 8.5% CM1% 38.0% | ₹5.83 L ▲ 12.1% CM1% 38.0% |
| instamart | MKTG SPEND | ₹89.89 K ▲ 8.5% 5.9% of Net Rev | ₹89.89 K ▲ 0.5% 5.9% of Net Rev |
| instamart | ROAS | 17.05x ▲ 0.0% Gross Rev (Ex GST) / Spend | 17.05x ▲ 7.9% Gross Rev (Ex GST) / Spend |
| instamart | CM2 | ₹4.93 L ▲ 8.5% CM2% 32.2% | ₹4.93 L ▲ 14.5% CM2% 32.2% |
| zepto | NET REVENUE | ₹12.89 L ▼ 8.2% 86.5% of gross | ₹12.89 L ▼ 8.2% = Gross ex GST (returns not captured) |
| zepto | RETURNS | ₹0 0.0% of Gross | Not available Not captured for this channel |
| zepto | COGS | ₹4.71 L ▼ 8.2% 36.5% of Net Rev | ₹4.71 L ▼ 9.0% 36.5% of Net Rev |
| zepto | GROSS MARGIN | ₹8.18 L ▼ 8.2% GM% 63.5% | ₹8.18 L ▼ 7.7% GM% 63.5% |
| zepto | SND COST | ₹3.91 L ▼ 8.2% 30.3% of Net Rev | ₹3.91 L ▼ 9.1% 30.3% of Net Rev |
| zepto | CM1 | ₹4.28 L ▼ 8.2% CM1% 33.2% | ₹4.28 L ▼ 6.5% CM1% 33.2% |
| zepto | MKTG SPEND | ₹2.19 L ▼ 8.2% 17.0% of Net Rev | ₹2.19 L ▲ 12.9% 17.0% of Net Rev |
| zepto | ROAS | 5.88x ▲ 0.0% Gross Rev (Ex GST) / Spend | 5.88x ▼ 18.7% Gross Rev (Ex GST) / Spend |
| zepto | CM2 | ₹2.09 L ▼ 8.2% CM2% 16.2% | ₹2.09 L ▼ 20.7% CM2% 16.2% |
| myntra | NET REVENUE | ₹1.16 Cr ▲ 124.2% 74.0% of gross | ₹1.16 Cr ▲ 134.6% incl. ₹5.15 L estimated (1 day, no product detail) |
| myntra | RETURNS | ₹25.03 L ▲ 153.0% 15.9% of Gross | ₹25.03 L ▲ 78.6% 15.9% of Gross |
| myntra | COGS | ₹50.60 L ▲ 87.1% 45.5% of Net Rev | ₹50.60 L ▲ 152.3% 45.5% of actual net |
| myntra | GROSS MARGIN | ₹60.52 L ▲ 87.1% GM% 54.5% | ₹60.52 L ▲ 105.0% GM% 54.5% on actual net |
| myntra | MKTG SPEND | ₹0 0.0% of Net Rev | Not available No ad spend source |
| myntra | Waterfall | Gross Revenue ₹1.57 Cr Net Revenue 100.0% ₹1.16 Cr Gross Margin 52.1% ₹60.52 L | Gross Revenue ₹1.57 Cr Net Revenue 104.6% ₹1.16 Cr Net Revenue, actual (product detail) 100.0% ₹1.11 Cr Gross Margin 54.5% ₹60.52 L |
| international | NET REVENUE | ₹4.19 K ▲ 206.0% 85.3% of gross | ₹4.19 K ▲ 206.4% 85.3% of gross |
| international | RETURNS | ₹0 0.0% of Gross | ₹0 — 0.0% of Gross |
| international | COGS | ₹27.85 K ▲ 206.0% 664.4% of Net Rev | — — of Net Rev |
| international | GROSS MARGIN | ₹-23,660 GM% -564.4% | — GM% — |
| international | Waterfall | Gross Revenue ₹4.92 K Net Revenue 100.0% ₹4.19 K Gross Margin -564.5% −₹23.66 K | Gross Revenue ₹4.92 K Net Revenue 100.0% ₹4.19 K |
| offline:Overall | NET REVENUE | ₹3.59 Cr ▲ 33.4% 75.3% of gross | ₹3.59 Cr ▲ 28.9% 75.3% of gross |
| offline:Overall | RETURNS | ₹66.76 L ▲ 52.9% 14.0% of Gross | ₹66.76 L ▲ 80.0% 14.0% of Gross |
| offline:Overall | COGS | ₹2.62 Cr ▲ 15.1% 63.5% of Net Rev | ₹2.62 Cr ▲ 42.5% 73.6% of Net Rev |
| offline:Overall | GROSS MARGIN | ₹1.51 Cr ▲ 15.1% GM% 36.5% | (hidden) |
| offline:Overall | SND COST | ₹28.01 L ▲ 15.1% 6.7% of Net Rev | ₹28.01 L ▲ 29.7% 7.8% of Net Rev |
| offline:Overall | CM1 | ₹1.23 Cr ▲ 15.1% CM1% 34.0% | (hidden) |
| offline:Overall | GROSS MARGIN i | (none) | ₹94.29 L ▼ 3.0% GM% 26.4% |
| offline:Overall | CM1 i ₹66.11 L | (none) | ▼ 11.9% CM1% 18.5% |
| offline:Overall | Waterfall | Gross Revenue ₹4.77 Cr Net Revenue 100.0% ₹3.59 Cr Gross Margin 42.0% ₹1.51 Cr CM1 34.2% ₹1.23 Cr | Gross Revenue ₹4.77 Cr Credit notes -14.0% −₹66.76 L Net Revenue 100.0% ₹3.59 Cr Gross Margin i 26.4% ₹94.29 L CM1 i 18.5% ₹66.11 L |
| offline:B2B | NET REVENUE | ₹3.17 Cr ▲ 83.4% 77.2% of gross | ₹3.17 Cr ▲ 66.5% 77.2% of gross |
| offline:B2B | RETURNS | ₹47.90 L ▲ 110.5% 11.7% of Gross | ₹47.90 L ▲ 761.5% 11.7% of Gross |
| offline:B2B | COGS | ₹2.26 Cr ▲ 62.4% 63.3% of Net Rev | ₹2.26 Cr ▲ 100.6% 71.7% of Net Rev |
| offline:B2B | GROSS MARGIN | ₹1.31 Cr ▲ 62.4% GM% 36.7% | (hidden) |
| offline:B2B | SND COST | ₹23.10 L ▲ 62.4% 6.5% of Net Rev | ₹23.10 L ▲ 75.5% 7.3% of Net Rev |
| offline:B2B | CM1 | ₹1.08 Cr ▲ 62.4% CM1% 34.0% | (hidden) |
| offline:B2B | GROSS MARGIN i | (none) | ₹89.17 L ▲ 15.0% GM% 28.3% |
| offline:B2B | CM1 i ₹66.07 L | (none) | ▲ 2.7% CM1% 21.0% |
| offline:B2B | Waterfall | Gross Revenue ₹4.10 Cr Net Revenue 100.0% ₹3.17 Cr Gross Margin 41.3% ₹1.31 Cr CM1 34.0% ₹1.08 Cr | Gross Revenue ₹4.10 Cr Credit notes -11.7% −₹47.90 L Net Revenue 100.0% ₹3.17 Cr Gross Margin i 28.3% ₹89.17 L CM1 i 21.0% ₹66.07 L |
| offline:Stockist | NET REVENUE | ₹40.10 L ▼ 50.6% 62.1% of gross | ₹40.10 L ▼ 53.6% 62.1% of gross |
| offline:Stockist | RETURNS | ₹18.81 L ▼ 44.2% 29.1% of Gross | ₹18.81 L ▼ 40.3% 29.1% of Gross |
| offline:Stockist | COGS | ₹35.89 L ▼ 65.3% 65.2% of Net Rev | ₹35.89 L ▼ 50.2% 88.5% of Net Rev |
| offline:Stockist | GROSS MARGIN | ₹19.13 L ▼ 65.3% GM% 34.8% | (hidden) |
| offline:Stockist | SND COST | ₹4.62 L ▼ 65.3% 8.1% of Net Rev | ₹4.62 L ▼ 43.8% 11.4% of Net Rev |
| offline:Stockist | CM1 | ₹14.21 L ▼ 65.3% CM1% 32.0% | (hidden) |
| offline:Stockist | GROSS MARGIN i | (none) | ₹4.66 L ▼ 76.4% GM% 11.5% |
| offline:Stockist | CM1 i −₹25.96  | (none) | K ▼ 102.5% CM1% -0.6% |
| offline:Stockist | Waterfall | Gross Revenue ₹64.59 L Net Revenue 100.0% ₹40.10 L Gross Margin 47.7% ₹19.13 L CM1 35.4% ₹14.21 L | Gross Revenue ₹64.59 L Credit notes -29.1% −₹18.81 L Net Revenue 100.0% ₹40.10 L Gross Margin i 11.5% ₹4.66 L CM1 i -0.6% −₹25.96 K |
| offline:MT GT | NET REVENUE | ₹0 | ₹0 ▼ 100.0% |
| offline:MT GT | RETURNS | ₹0 0% of Gross | ₹0 — 0% of Gross |
| offline:MT GT | GROSS MARGIN | — GM% — | (hidden) |
| offline:MT GT | CM1 | — CM1% — | (hidden) |
| offline:MT GT | GROSS MARGIN i | (none) | — GM% — |
| offline:MT GT | CM1 i — CM1% — | (none) |  |
| offline:MT GT | Waterfall | Gross Revenue ₹0 Net Revenue 0.0% ₹0 | Gross Revenue ₹0 Credit notes 0.0% ₹0 Net Revenue 0.0% ₹0 |
| offline:Miscellaneous | NET REVENUE | ₹1.94 L ▲ 37.8% 85.3% of gross | ₹1.94 L ▲ 36.7% 85.3% of gross |
| offline:Miscellaneous | RETURNS | ₹5.16 K ▲ 57.9% 2.3% of Gross | ₹5.16 K ▲ 116.4% 2.3% of Gross |
| offline:Miscellaneous | COGS | ₹1.93 L ▲ 34.7% 98.2% of Net Rev | ₹1.93 L ▲ 28.9% 100.3% of Net Rev |
| offline:Miscellaneous | GROSS MARGIN | ₹3.46 K ▲ 34.7% GM% 1.8% | (hidden) |
| offline:Miscellaneous | SND COST | ₹29.14 K ▲ 34.7% 14.7% of Net Rev | ₹29.14 K ▲ 50.2% 15.0% of Net Rev |
| offline:Miscellaneous | CM1 | ₹-25,671 CM1% -13.2% | (hidden) |
| offline:Miscellaneous | GROSS MARGIN i | (none) | −₹612 — GM% -0.3% |
| offline:Miscellaneous | CM1 i −₹29.75  | (none) | K — CM1% -15.4% |
| offline:Miscellaneous | Waterfall | Gross Revenue ₹2.27 L Net Revenue 100.0% ₹1.94 L Gross Margin 1.8% ₹3.46 K CM1 -13.2% −₹25.67 K | Gross Revenue ₹2.27 L Credit notes -2.3% −₹5.16 K Net Revenue 100.0% ₹1.94 L Gross Margin i -0.3% −₹612 CM1 i -15.4% −₹29.75 K |

### Sep 2026 (previous period 2–31 Aug)

| Tab | Card | Before | After |
|---|---|---|---|
| all | NET REVENUE | ₹42.33 Cr ▼ 19.0% 73.1% of gross | ₹42.33 Cr ▼ 18.7% 73.1% of gross |
| all | RETURNS | ₹3.79 Cr ▼ 8.5% 6.6% of Gross | ₹3.79 Cr ▼ 10.7% 6.6% of Gross |
| all | COGS | ₹20.47 Cr ▼ 33.1% — of Net Rev | — — of Net Rev |
| all | GROSS MARGIN | ₹-20,46,64,390 GM% — | — GM% — |
| all | MKTG SPEND | ₹0 0.0% of Net Rev | Not available No ad spend source |
| all | Waterfall | Gross Revenue ₹57.87 Cr Net Revenue 100.0% ₹42.33 Cr Gross Margin -48.4% −₹20.47 Cr | Gross Revenue ₹57.87 Cr Net Revenue 100.0% ₹42.33 Cr |
| shopify:Overall | RETURNS | ₹5.97 Cr ▼ 18.1% 19.0% of Gross | ₹5.97 Cr ▼ 27.0% 19.0% of Gross |
| shopify:Overall | COGS | ₹8.61 Cr ▼ 41.2% 38.2% of Net Rev | ₹8.61 Cr ▼ 29.6% 38.2% of Net Rev |
| shopify:Overall | GROSS MARGIN | ₹13.95 Cr ▼ 41.2% GM% 61.8% | ₹13.95 Cr ▼ 26.0% GM% 61.8% |
| shopify:Overall | SND COST | ₹4.13 Cr ▼ 41.2% 18.3% of Net Rev | ₹4.13 Cr ▼ 28.6% 18.3% of Net Rev |
| shopify:Overall | CM1 | ₹9.82 Cr ▼ 41.2% CM1% 43.5% | ₹9.82 Cr ▼ 24.9% CM1% 43.5% |
| shopify:Overall | MKTG SPEND | ₹7.76 Cr ▼ 41.2% 34.4% of Net Rev | ₹7.76 Cr ▼ 27.4% 34.4% of Net Rev |
| shopify:Overall | ROAS | 3.59x ▲ 23.5% Gross Rev (Ex GST) / Spend | 3.59x ▲ 0.1% Gross Rev (Ex GST) / Spend |
| shopify:Overall | CM2 | ₹2.06 Cr ▼ 41.2% CM2% 9.1% | ₹2.06 Cr ▼ 13.3% CM2% 9.1% |
| shopify:MyFrido | NET REVENUE | ₹20.63 Cr ▼ 27.9% 72.0% of gross | ₹20.63 Cr ▼ 28.2% 72.0% of gross |
| shopify:MyFrido | RETURNS | ₹5.22 Cr ▼ 18.1% 18.2% of Gross | ₹5.22 Cr ▼ 30.1% 18.2% of Gross |
| shopify:MyFrido | COGS | ₹7.62 Cr ▼ 41.0% 36.9% of Net Rev | ₹7.62 Cr ▼ 30.7% 36.9% of Net Rev |
| shopify:MyFrido | GROSS MARGIN | ₹13.01 Cr ▼ 41.0% GM% 63.1% | ₹13.01 Cr ▼ 26.7% GM% 63.1% |
| shopify:MyFrido | SND COST | ₹3.94 Cr ▼ 41.0% 19.1% of Net Rev | ₹3.94 Cr ▼ 29.2% 19.1% of Net Rev |
| shopify:MyFrido | CM1 | ₹9.07 Cr ▼ 41.0% CM1% 44.0% | ₹9.07 Cr ▼ 25.6% CM1% 44.0% |
| shopify:MyFrido | MKTG SPEND | ₹7.33 Cr ▼ 41.0% 35.6% of Net Rev | ₹7.33 Cr ▼ 26.4% 35.6% of Net Rev |
| shopify:MyFrido | ROAS | 3.44x ▲ 22.3% Gross Rev (Ex GST) / Spend | 3.44x ▼ 3.0% Gross Rev (Ex GST) / Spend |
| shopify:MyFrido | CM2 | ₹1.74 Cr ▼ 41.0% CM2% 8.4% | ₹1.74 Cr ▼ 21.7% CM2% 8.4% |
| shopify:Mobility | NET REVENUE | ₹1.73 Cr ▼ 22.3% 62.4% of gross | ₹1.73 Cr ▼ 17.0% 62.4% of gross |
| shopify:Mobility | RETURNS | ₹75.57 L ▼ 18.1% 27.3% of Gross | ₹75.57 L ▲ 5.9% 27.3% of Gross |
| shopify:Mobility | COGS | ₹98.62 L ▼ 48.9% 57.2% of Net Rev | ₹98.62 L ▼ 19.5% 57.2% of Net Rev |
| shopify:Mobility | GROSS MARGIN | ₹73.92 L ▼ 48.9% GM% 42.8% | ₹73.92 L ▼ 13.4% GM% 42.8% |
| shopify:Mobility | SND COST | ₹18.99 L ▼ 48.9% 11.0% of Net Rev | ₹18.99 L ▼ 12.8% 11.0% of Net Rev |
| shopify:Mobility | CM1 | ₹54.93 L ▼ 48.9% CM1% 31.8% | ₹54.93 L ▼ 13.6% CM1% 31.8% |
| shopify:Mobility | MKTG SPEND | ₹55.01 L ▼ 48.9% 31.9% of Net Rev | ₹55.01 L ▼ 35.6% 31.9% of Net Rev |
| shopify:Mobility | ROAS | 4.77x ▲ 52.1% Gross Rev (Ex GST) / Spend | 4.77x ▲ 36.5% Gross Rev (Ex GST) / Spend |
| shopify:Mobility | CM2 | ₹-7,543 CM2% -0.0% | −₹7.54 K — CM2% -0.0% |
| ebo | NET REVENUE | ₹2.20 Cr ▼ 11.4% 80.6% of gross | ₹2.20 Cr ▼ 14.3% 80.6% of gross |
| ebo | RETURNS | ₹25.60 L ▼ 0.4% 9.4% of Gross | ₹25.60 L ▲ 30.6% 9.4% of Gross |
| ebo | COGS | ₹95.07 L ▼ 23.8% 43.1% of Net Rev | ₹95.07 L ▼ 17.1% 43.1% of Net Rev |
| ebo | GROSS MARGIN | ₹1.25 Cr ▼ 16.3% GM% 56.9% | ₹1.25 Cr ▼ 12.1% GM% 56.9% |
| ebo | SND COST | ₹23.62 L ▼ 19.7% 10.7% of Net Rev | ₹23.62 L ▼ 20.6% 10.7% of Net Rev |
| ebo | CM1 | ₹1.02 Cr ▼ 19.7% CM1% 46.2% | ₹1.02 Cr ▼ 9.9% CM1% 46.2% |
| ebo | MKTG SPEND | ₹3.31 L ▼ 19.7% 1.5% of Net Rev | (hidden) |
| ebo | ROAS | 73.58x ▲ 10.3% Gross Rev (Ex GST) / Spend | (hidden) |
| ebo | CM2 | ₹98.46 L ▼ 19.7% CM2% 44.7% | ₹98.46 L ▼ 9.7% CM2% 44.7% |
| ebo | MKTG (ALLOCATED 1.5% OF NET) | (none) | ₹3.31 L ▼ 14.4% 1.5% of Net Rev |
| amazon:Overall | GROSS REVENUE INC GST | ₹14.15 Cr ▲ 46.3% 1,00,721 units · SC + VC | ₹14.15 Cr ▼ 12.3% 1,00,721 units · SC + VC |
| amazon:Overall | NET REVENUE | ₹10.19 Cr ▲ 44.1% 72.0% of gross | ₹10.19 Cr ▼ 13.0% 72.0% of gross |
| amazon:Overall | RETURNS | ₹2.65 Cr ▲ 62.7% 18.8% of Gross | ₹2.65 Cr ▼ 6.7% 18.8% of Gross |
| amazon:Overall | COGS | ₹3.73 Cr ▲ 17.1% 36.6% of Net Rev | ₹3.73 Cr ▼ 16.7% 36.6% of Net Rev |
| amazon:Overall | GROSS MARGIN | ₹6.46 Cr ▲ 17.1% GM% 63.4% | ₹6.46 Cr ▼ 10.7% GM% 63.4% |
| amazon:Overall | SND COST | ₹2.83 Cr ▲ 17.1% 27.7% of Net Rev | ₹2.83 Cr ▼ 12.2% 27.7% of Net Rev |
| amazon:Overall | CM1 | ₹3.63 Cr ▲ 17.1% CM1% 35.7% | ₹3.63 Cr ▼ 9.6% CM1% 35.7% |
| amazon:Overall | MKTG SPEND | ₹1.14 Cr ▲ 17.1% 11.2% of Net Rev | ₹1.14 Cr ▼ 13.2% 11.2% of Net Rev |
| amazon:Overall | ROAS | 11.01x ▲ 23.1% Gross Rev (Ex GST) / Spend | 11.01x ▲ 1.6% Gross Rev (Ex GST) / Spend |
| amazon:Overall | CM2 | ₹2.49 Cr ▲ 17.1% CM2% 24.5% | ₹2.49 Cr ▼ 7.8% CM2% 24.5% |
| amazon:Seller Central | RETURNS | ₹1.55 Cr ▼ 1.7% 18.1% of Gross | ₹1.55 Cr ▼ 11.6% 18.1% of Gross |
| amazon:Seller Central | COGS | ₹2.27 Cr ▼ 27.8% 36.1% of Net Rev | ₹2.27 Cr ▼ 14.2% 36.1% of Net Rev |
| amazon:Seller Central | GROSS MARGIN | ₹4.01 Cr ▼ 27.8% GM% 63.9% | ₹4.01 Cr ▼ 10.4% GM% 63.9% |
| amazon:Seller Central | SND COST | ₹1.48 Cr ▼ 27.8% 23.5% of Net Rev | ₹1.48 Cr ▼ 10.5% 23.5% of Net Rev |
| amazon:Seller Central | CM1 | ₹2.54 Cr ▼ 27.8% CM1% 40.4% | ₹2.54 Cr ▼ 10.4% CM1% 40.4% |
| amazon:Vendor Central | GROSS REVENUE INC GST | ₹5.60 Cr 34,760 units · 39.6% of total | ₹5.60 Cr ▼ 13.4% 34,760 units · 39.6% of total |
| amazon:Vendor Central | NET REVENUE | ₹3.91 Cr 69.8% of gross | ₹3.91 Cr ▼ 14.8% 69.8% of gross |
| amazon:Vendor Central | RETURNS | ₹1.10 Cr 19.7% of Gross | ₹1.10 Cr ▲ 1.1% 19.7% of Gross |
| amazon:Vendor Central | COGS | ₹1.46 Cr 37.4% of Net Rev | ₹1.46 Cr ▼ 20.3% 37.4% of Net Rev |
| amazon:Vendor Central | GROSS MARGIN | ₹2.45 Cr GM% 62.6% | ₹2.45 Cr ▼ 11.1% GM% 62.6% |
| amazon:Vendor Central | SND COST | ₹1.35 Cr 34.5% of Net Rev | ₹1.35 Cr ▼ 13.9% 34.5% of Net Rev |
| amazon:Vendor Central | CM1 | ₹1.10 Cr CM1% 28.1% | ₹1.10 Cr ▼ 7.3% CM1% 28.1% |
| flipkart | NET REVENUE | ₹1.20 Cr ▼ 4.6% 63.3% of gross | ₹1.20 Cr ▲ 0.3% 63.3% of gross |
| flipkart | RETURNS | ₹58.18 L ▲ 4.7% 30.6% of Gross | ₹58.18 L ▼ 14.9% 30.6% of Gross |
| flipkart | COGS | ₹52.98 L ▼ 33.8% 44.0% of Net Rev | ₹52.98 L ▲ 3.2% 44.0% of Net Rev |
| flipkart | GROSS MARGIN | ₹67.45 L ▼ 33.8% GM% 56.0% | ₹67.45 L ▼ 1.9% GM% 56.0% |
| flipkart | SND COST | ₹31.59 L ▼ 33.8% 26.3% of Net Rev | ₹31.59 L ▲ 9.1% 26.3% of Net Rev |
| flipkart | CM1 | ₹35.77 L ▼ 33.8% CM1% 29.7% | ₹35.77 L ▼ 9.7% CM1% 29.7% |
| flipkart | MKTG SPEND | ₹36.78 L ▼ 33.8% 30.5% of Net Rev | ₹36.78 L ▲ 12.4% 30.5% of Net Rev |
| flipkart | ROAS | 4.72x ▲ 44.0% Gross Rev (Ex GST) / Spend | 4.72x ▼ 15.1% Gross Rev (Ex GST) / Spend |
| flipkart | CM2 | ₹-1,00,925 CM2% -0.8% | −₹1.01 L ▼ 114.6% CM2% -0.8% |
| blinkit | NET REVENUE | ₹1.39 Cr ▲ 3.7% 85.5% of gross | ₹1.39 Cr ▲ 3.7% = Gross ex GST (returns not captured) |
| blinkit | RETURNS | ₹0 0.0% of Gross | Not available Not captured for this channel |
| blinkit | COGS | ₹51.93 L ▲ 3.7% 37.4% of Net Rev | ₹51.93 L ▲ 2.7% 37.4% of Net Rev |
| blinkit | GROSS MARGIN | ₹87.00 L ▲ 3.7% GM% 62.6% | ₹87.00 L ▲ 4.3% GM% 62.6% |
| blinkit | SND COST | ₹59.40 L ▲ 3.7% 42.8% of Net Rev | ₹59.40 L ▲ 3.2% 42.8% of Net Rev |
| blinkit | CM1 | ₹27.59 L ▲ 3.7% CM1% 19.9% | ₹27.59 L ▲ 6.7% CM1% 19.9% |
| blinkit | MKTG SPEND | ₹3.85 L ▲ 3.7% 2.8% of Net Rev | ₹3.85 L ▲ 1.8% 2.8% of Net Rev |
| blinkit | ROAS | 36.07x ▲ 0.0% Gross Rev (Ex GST) / Spend | 36.07x ▲ 1.8% Gross Rev (Ex GST) / Spend |
| blinkit | CM2 | ₹23.74 L ▲ 3.7% CM2% 17.1% | ₹23.74 L ▲ 7.5% CM2% 17.1% |
| cred | NET REVENUE | ₹25.21 L ▼ 49.7% 86.5% of gross | ₹25.21 L ▼ 49.0% 86.5% of gross |
| cred | RETURNS | ₹1.30 L ▼ 44.5% 4.5% of Gross | ₹1.30 L ▼ 62.5% 4.5% of Gross |
| cred | COGS | ₹13.86 L ▼ 52.0% 55.0% of Net Rev | ₹13.86 L ▼ 51.2% 55.0% of Net Rev |
| cred | GROSS MARGIN | ₹11.35 L ▼ 52.0% GM% 45.0% | ₹11.35 L ▼ 46.1% GM% 45.0% |
| cred | MKTG SPEND | ₹0 0.0% of Net Rev | Not available No ad spend source |
| firstcry | NET REVENUE | ₹1.07 L ▲ 31.4% 70.3% of gross | ₹1.07 L ▲ 30.6% 70.3% of gross |
| firstcry | RETURNS | ₹33.83 K ▲ 45.4% 22.2% of Gross | ₹33.83 K ▲ 32.4% 22.2% of Gross |
| firstcry | COGS | ₹45.12 K ▲ 2.2% 42.2% of Net Rev | ₹45.12 K ▲ 26.7% 42.2% of Net Rev |
| firstcry | GROSS MARGIN | ₹61.88 K ▲ 2.2% GM% 57.8% | ₹61.88 K ▲ 33.7% GM% 57.8% |
| firstcry | MKTG SPEND | ₹0 0.0% of Net Rev | Not available No ad spend source |
| instamart | NET REVENUE | ₹17.11 L ▼ 37.7% 85.0% of gross | ₹17.11 L ▼ 37.7% = Gross ex GST (returns not captured) |
| instamart | RETURNS | ₹0 0.0% of Gross | Not available Not captured for this channel |
| instamart | COGS | ₹5.69 L ▼ 37.7% 33.3% of Net Rev | ₹5.69 L ▼ 39.2% 33.3% of Net Rev |
| instamart | GROSS MARGIN | ₹11.42 L ▼ 37.7% GM% 66.7% | ₹11.42 L ▼ 37.0% GM% 66.7% |
| instamart | SND COST | ₹5.11 L ▼ 37.7% 29.9% of Net Rev | ₹5.11 L ▼ 38.6% 29.9% of Net Rev |
| instamart | CM1 | ₹6.32 L ▼ 37.7% CM1% 36.9% | ₹6.32 L ▼ 35.5% CM1% 36.9% |
| instamart | MKTG SPEND | ₹1.09 L ▼ 37.7% 6.4% of Net Rev | ₹1.09 L ▼ 7.5% 6.4% of Net Rev |
| instamart | ROAS | 15.71x ▲ 0.0% Gross Rev (Ex GST) / Spend | 15.71x ▼ 32.7% Gross Rev (Ex GST) / Spend |
| instamart | CM2 | ₹5.23 L ▼ 37.7% CM2% 30.6% | ₹5.23 L ▼ 39.3% CM2% 30.6% |
| zepto | NET REVENUE | ₹17.33 L ▼ 8.3% 86.5% of gross | ₹17.33 L ▼ 8.3% = Gross ex GST (returns not captured) |
| zepto | RETURNS | ₹0 0.0% of Gross | Not available Not captured for this channel |
| zepto | COGS | ₹6.42 L ▼ 8.3% 37.1% of Net Rev | ₹6.42 L ▼ 7.4% 37.1% of Net Rev |
| zepto | GROSS MARGIN | ₹10.90 L ▼ 8.3% GM% 62.9% | ₹10.90 L ▼ 8.9% GM% 62.9% |
| zepto | SND COST | ₹5.32 L ▼ 8.3% 30.7% of Net Rev | ₹5.32 L ▼ 7.9% 30.7% of Net Rev |
| zepto | CM1 | ₹5.59 L ▼ 8.3% CM1% 32.2% | ₹5.59 L ▼ 9.8% CM1% 32.2% |
| zepto | MKTG SPEND | ₹2.45 L ▼ 8.3% 14.1% of Net Rev | ₹2.45 L ▼ 15.0% 14.1% of Net Rev |
| zepto | ROAS | 7.09x ▲ 0.0% Gross Rev (Ex GST) / Spend | 7.09x ▲ 7.9% Gross Rev (Ex GST) / Spend |
| zepto | CM2 | ₹3.14 L ▼ 8.3% CM2% 18.1% | ₹3.14 L ▼ 5.3% CM2% 18.1% |
| myntra | NET REVENUE | ₹63.05 L ▼ 21.2% 71.9% of gross | ₹63.05 L ▼ 10.2% 71.9% of gross |
| myntra | RETURNS | ₹17.37 L ▼ 12.1% 19.8% of Gross | ₹17.37 L ▼ 46.8% 19.8% of Gross |
| myntra | COGS | ₹25.45 L ▼ 36.8% 40.4% of Net Rev | ₹25.45 L ▼ 1.0% 40.4% of Net Rev |
| myntra | GROSS MARGIN | ₹37.61 L ▼ 36.8% GM% 59.6% | ₹37.61 L ▼ 15.4% GM% 59.6% |
| myntra | MKTG SPEND | ₹0 0.0% of Net Rev | Not available No ad spend source |
| myntra | Waterfall | Gross Revenue ₹87.67 L Net Revenue 100.0% ₹63.05 L Gross Margin 59.7% ₹37.61 L | Gross Revenue ₹87.67 L Net Revenue 100.0% ₹63.05 L Gross Margin 59.6% ₹37.61 L |
| international | RETURNS | ₹0 0.0% of Gross | ₹0 — 0.0% of Gross |
| international | COGS | ₹5.45 K ▼ 50.8% 345.2% of Net Rev | — — of Net Rev |
| international | GROSS MARGIN | ₹-3,869 GM% -245.2% | — GM% — |
| international | Waterfall | Gross Revenue ₹1.82 K Net Revenue 100.0% ₹1.58 K Gross Margin -245.2% −₹3.87 K | Gross Revenue ₹1.82 K Net Revenue 100.0% ₹1.58 K |
| offline:Overall | NET REVENUE | ₹3.55 Cr ▲ 38.7% 79.7% of gross | ₹3.55 Cr ▲ 43.7% 79.7% of gross |
| offline:Overall | RETURNS | ₹39.86 L ▲ 58.1% 9.0% of Gross | ₹39.86 L ▲ 3.5% 9.0% of Gross |
| offline:Overall | COGS | ₹2.31 Cr ▲ 26.0% 59.8% of Net Rev | ₹2.31 Cr ▲ 36.5% 64.6% of Net Rev |
| offline:Overall | GROSS MARGIN | ₹1.55 Cr ▲ 26.0% GM% 40.2% | (hidden) |
| offline:Overall | SND COST | ₹28.64 L ▲ 26.0% 7.3% of Net Rev | ₹28.64 L ▲ 15.4% 8.1% of Net Rev |
| offline:Overall | CM1 | ₹1.26 Cr ▲ 26.0% CM1% 35.3% | (hidden) |
| offline:Overall | GROSS MARGIN i | (none) | ₹1.26 Cr ▲ 62.7% GM% 35.4% |
| offline:Overall | CM1 i ₹96.95 L | (none) | ▲ 84.8% CM1% 27.2% |
| offline:Overall | Waterfall | Gross Revenue ₹4.45 Cr Net Revenue 100.0% ₹3.55 Cr Gross Margin 43.8% ₹1.55 Cr CM1 35.6% ₹1.26 Cr | Gross Revenue ₹4.45 Cr Credit notes -9.0% −₹39.86 L Net Revenue 100.0% ₹3.55 Cr Gross Margin i 35.4% ₹1.26 Cr CM1 i 27.2% ₹96.95 L |
| offline:B2B | NET REVENUE | ₹2.37 Cr ▲ 119.9% 85.2% of gross | ₹2.37 Cr ▲ 143.3% 85.2% of gross |
| offline:B2B | RETURNS | ₹7.56 L ▲ 151.4% 2.7% of Gross | ₹7.56 L ▼ 46.0% 2.7% of Gross |
| offline:B2B | COGS | ₹1.41 Cr ▲ 114.1% 58.1% of Net Rev | ₹1.41 Cr ▲ 151.1% 59.7% of Net Rev |
| offline:B2B | GROSS MARGIN | ₹1.02 Cr ▲ 114.1% GM% 41.9% | (hidden) |
| offline:B2B | SND COST | ₹17.80 L ▲ 114.1% 7.3% of Net Rev | ₹17.80 L ▲ 100.8% 7.5% of Net Rev |
| offline:B2B | CM1 | ₹84.11 L ▲ 114.1% CM1% 35.5% | (hidden) |
| offline:B2B | GROSS MARGIN i | (none) | ₹95.57 L ▲ 132.8% GM% 40.3% |
| offline:B2B | CM1 i ₹77.76 L | (none) | ▲ 141.6% CM1% 32.8% |
| offline:B2B | Waterfall | Gross Revenue ₹2.78 Cr Net Revenue 100.0% ₹2.37 Cr Gross Margin 43.0% ₹1.02 Cr CM1 35.5% ₹84.11 L | Gross Revenue ₹2.78 Cr Credit notes -2.7% −₹7.56 L Net Revenue 100.0% ₹2.37 Cr Gross Margin i 40.3% ₹95.57 L CM1 i 32.8% ₹77.76 L |
| offline:Stockist | NET REVENUE | ₹1.16 Cr ▼ 12.4% 70.1% of gross | ₹1.16 Cr ▼ 21.6% 70.1% of gross |
| offline:Stockist | RETURNS | ₹32.27 L ▼ 0.5% 19.6% of Gross | ₹32.27 L ▲ 54.6% 19.6% of Gross |
| offline:Stockist | COGS | ₹89.19 L ▼ 30.3% 63.3% of Net Rev | ₹89.19 L ▼ 14.5% 74.8% of Net Rev |
| offline:Stockist | GROSS MARGIN | ₹51.80 L ▼ 30.3% GM% 36.7% | (hidden) |
| offline:Stockist | SND COST | ₹10.59 L ▼ 30.3% 7.3% of Net Rev | ₹10.59 L ▼ 26.6% 9.1% of Net Rev |
| offline:Stockist | CM1 | ₹40.34 L ▼ 30.3% CM1% 33.4% | (hidden) |
| offline:Stockist | GROSS MARGIN i | (none) | ₹30.00 L ▼ 31.2% GM% 25.2% |
| offline:Stockist | CM1 i ₹18.55 L | (none) | ▼ 35.7% CM1% 15.6% |
| offline:Stockist | Waterfall | Gross Revenue ₹1.65 Cr Net Revenue 100.0% ₹1.16 Cr Gross Margin 44.8% ₹51.80 L CM1 34.9% ₹40.34 L | Gross Revenue ₹1.65 Cr Credit notes -19.6% −₹32.27 L Net Revenue 100.0% ₹1.16 Cr Gross Margin i 25.2% ₹30.00 L CM1 i 15.6% ₹18.55 L |
| offline:MT GT | NET REVENUE | ₹14.29 K ▼ 96.2% 95.2% of gross | ₹14.29 K ▲ 12.3% 95.2% of gross |
| offline:MT GT | RETURNS | ₹0 0.0% of Gross | ₹0 ▼ 100.0% 0.0% of Gross |
| offline:MT GT | COGS | ₹8.83 K ▼ 96.2% 61.8% of Net Rev | ₹8.83 K ▼ 99.0% 61.8% of Net Rev |
| offline:MT GT | GROSS MARGIN | ₹5.46 K ▼ 96.2% GM% 38.2% | (hidden) |
| offline:MT GT | SND COST | ₹723 ▼ 96.2% 5.1% of Net Rev | ₹723 ▼ 99.5% 5.1% of Net Rev |
| offline:MT GT | CM1 | ₹4.73 K ▼ 96.2% CM1% 33.1% | (hidden) |
| offline:MT GT | GROSS MARGIN i | (none) | ₹5.46 K — GM% 38.2% |
| offline:MT GT | CM1 i ₹4.73 K  | (none) | — CM1% 33.1% |
| offline:MT GT | Waterfall | Gross Revenue ₹15.00 K Net Revenue 100.0% ₹14.29 K Gross Margin 38.2% ₹5.46 K CM1 33.1% ₹4.73 K | Gross Revenue ₹15.00 K Credit notes 0.0% ₹0 Net Revenue 100.0% ₹14.29 K Gross Margin i 38.2% ₹5.46 K CM1 i 33.1% ₹4.73 K |
| offline:Miscellaneous | NET REVENUE | ₹1.74 L ▲ 20.7% 86.3% of gross | ₹1.74 L ▲ 22.6% 86.3% of gross |
| offline:Miscellaneous | RETURNS | ₹2.38 K ▲ 38.2% 1.2% of Gross | ₹2.38 K ▼ 41.5% 1.2% of Gross |
| offline:Miscellaneous | COGS | ₹1.82 L ▲ 19.2% 103.1% of Net Rev | ₹1.82 L ▲ 16.8% 104.3% of Net Rev |
| offline:Miscellaneous | GROSS MARGIN | ₹-5,413 GM% -3.1% | (hidden) |
| offline:Miscellaneous | SND COST | ₹23.85 K ▲ 19.2% 13.5% of Net Rev | ₹23.85 K ▲ 54.7% 13.7% of Net Rev |
| offline:Miscellaneous | CM1 | ₹-29,265 CM1% -16.8% | (hidden) |
| offline:Miscellaneous | GROSS MARGIN i | (none) | −₹7.56 K — GM% -4.3% |
| offline:Miscellaneous | CM1 i −₹31.41  | (none) | K — CM1% -18.0% |
| offline:Miscellaneous | Waterfall | Gross Revenue ₹2.02 L Net Revenue 100.0% ₹1.74 L Gross Margin -3.1% −₹5.41 K CM1 -16.8% −₹29.26 K | Gross Revenue ₹2.02 L Credit notes -1.2% −₹2.38 K Net Revenue 100.0% ₹1.74 L Gross Margin i -4.3% −₹7.56 K CM1 i -18.0% −₹31.41 K |
