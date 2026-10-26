# Return Analysis (Sales → D2C) — mobile: verification

Run 2026-10-26, unattended. Branch `feature/responsive-return-analysis` (from `release/responsive` after merging `origin/main`). Not merged anywhere.
**Preview:** https://vercel.com/pranjal-tripathi-s-projects/frido-navigator/EW2mohvyVuTVo53ZQbQy9FhDyGyi (commit f3579748; the later commit only adds this file)
Plan and all decisions: `docs/responsive/RETURN_ANALYSIS_PLAN.md`.

## What was built
| # | Part | Where |
|---|---|---|
| 2b | **Entry card on Sales → D2C** (phones): "Return analysis ›", Return % with ▲/▼, Cancel / RTO / CIR, a thin stacked bar. Opens the page with the same dates and filters. ‹ back returns to the same D2C sub-tab and scroll spot. Also a "Return analysis" item in the D2C "⋯" menu. | `src/sales/ReturnEntryCard.jsx`, `SalesPage` / `ShopifyTab` (App.jsx) |
| a | **Header**: ‹ back, "Return Analysis" + "D2C · by revenue / by qty", filter icon (existing filter sheet), "⋯" (Show by revenue / qty, Category CSV, Exchange CSV, Back), date pill | `Topnav` (App.jsx) |
| b | **Master card**: hero Total return % "▼34.4% vs 6–30 Sep · ₹3.37 Cr returned of ₹26.85 Cr", daily chart (weekly / monthly in "⋯", the desktop's grouping), 6 tiles: Return, Cancel, RTO, CIR, Exchange, Revenue | `ReturnAnalysisMobile.jsx` |
| c | **By payment type**: Total / Cancel / RTO / CIR / Exch toggle; COD, PPCOD, Prepaid, Overall | 〃 |
| d | **Top products · high returns**: All / COD / PPCOD / Prepaid chips (same re-fetch as the desktop dropdown), top 8 + Show all (search), sheet with the product's Cancel / RTO / CIR / Exchange | 〃 |
| e | **Category breakdown**: Category / Sub-category, 6 sort chips, top 8 + Show all, sheet with sub-categories or SKU variants | 〃 |
| f | **Return reasons (CIR)**: top 6 + Show all, Total line, sub-reasons sheet | 〃 |
| g | **Cancellations · days since order**: stacked by day bucket with a legend, sub-category picker, tap a bar → sheet | 〃 + `src/responsive/StackedBarChart.jsx` |
| h | **Last 12 months**: Oct-26 first "(1–25 Oct, partial)", Cancel / RTO / CIR mini bar, top 6 + Show all 12, sheet | 〃 |
| i | **Exchange deep dive**: Exch qty / % / ₹ sorts, top 10 + Show all (search by SKU), sheet with "Exchanged to" | 〃 |
| 4a | **Maturity note**, mobile (strip in the master card) and laptop (line under the trend tiles): "Returns for orders after 12 Oct are still coming in; recent return % will rise." Uses the existing 14-day Provisional Return % window; no new calculation, no "Mature only" toggle (no mature comparison exists). | both |
| 4b | **Size-swap chip** ("Size swap 91%" on mobile rows, "Size swap" next to Top Exch Product 1 on the laptop), read from the existing top-exchange columns | both |

**Shared components:**
- New, optional props (nothing changes where they aren't used):
  - `RankedRow` / `MobileRankedList` / `FullScreenList`: `valueColor`, `badge`, `renderSheet`
  - `CompactRankRow`: `valueColor`
  - `MobilePageHeader`: `onBack`
- New: `StackedBarChart`.
- The desktop fetch, trend grouping and exchange CSV moved unchanged into `src/sales/returnAnalysisData.js`, so desktop, mobile and the entry card send the identical request.

## Checks
| Check | Result |
|---|---|
| **Numbers, 1–25 Oct 2026** (`check-ra-numbers.mjs`, live API / BigQuery; no static file for this page) | **109 / 109 match**. Covers: 6 KPIs + ▲/▼, payment table (5 metrics × 4 columns + revenue), top 8 products, top 8 sub-categories by revenue and by total return %, every reason + Total (4,463 · ₹1.08 Cr), all 12 months (+ 3 month sheets), top 10 exchange SKUs |
| **Numbers, Sep 2026** | **109 / 109 match** |
| Palette, Chromium + WebKit (`check-palette.mjs`, iPhone 14) | 0 off-palette colours, 0 text under 12px (617 elements); entry card 0 / 0 |
| Tap-through incl. finger scrolling (`check-ra-interact.mjs`, 25 checks) | ALL PASS on Chromium: iPhone 14, iPhone SE, Pixel, small Android, iPhone landscape, iPad portrait (768). ALL PASS on WebKit: iPhone 14 (finger-drag step is Chromium only; WebKit has no touch-drag in Playwright) |
| Entry card: same numbers as the page, same dates, back → same scroll spot | PASS: Return 12.5% / Cancel 4.5% / RTO 4.1% / CIR 4.0% on both; "1 Oct – 25 Oct" both; scroll 1,873 → 1,873 px, back on `/sales/shopify/overall` |
| No resize on tap | PASS: master card (6 tiles), payment (5 toggles), top products (COD chip), category (2 views × 6 sorts), cancellation (picker), exchange (3 sorts) all keep their height |
| No horizontal scroll / no inner scroll | PASS (0 px; 0 inner vertical scroll areas). Screenshots: overflowX false, 0 clipped elements on all 6 devices |
| Laptop 1366 before / after | Sales → D2C: **0 px diff**. Return Analysis: changes only in the trend card (4a line; the chart inside the fixed-height card is slightly shorter) and the exchange table (4b chip; rows with a wrapped chip are taller). Both pre-approved. |
| Sales → D2C mobile before / after | Only the entry card's numbers were added (12.5%, 34.4%, 4.5%, 4.1%, 4.0%); nothing else changed |
| Regression on other pages that use the shared components | `check-ranked-list` (Overview), `check-inv-interact` (Inventory), `check-log-interact` (Logistics): ALL PASS |
| Lint | No new errors (App.jsx 357 before / after, all already there; new files clean) |
| Job-generated files | `git diff origin/main HEAD -- public` is empty |

**Screenshots:**
- `docs/responsive/after/return-analysis/`: iPhone SE, iPhone 14, Pixel, small Android, iPhone landscape, iPad portrait, plus `laptop/`.
- `docs/responsive/before/return-analysis/`: phone and laptop.
- Sales → D2C phone: `docs/responsive/before/sales-d2c/` and `after/sales-d2c/`.

### Design-system checklist (MOBILE_DESIGN_SYSTEM.md §5)
- [x] Uses `MobilePageHeader`, `MobileBottomNav`
- [x] All filters through `FilterSheet` (the existing Sales filter sheet; the chart's sub-category picker uses `FilterPicker`)
- [x] Top of page = `MasterTrendCard`
- [x] Lists/tables mapped per §3; no donuts, no wide tables in page flow
- [x] Palette, type scale, glow, borders per §1 (0 / 0 on both engines)
- [x] No resize on touch; no inner scroll; no horizontal page scroll
- [x] Numbers identical to desktop (Oct and Sep)
- [x] Laptop 1366 unchanged, except 4a / 4b (approved)
- [x] Screenshots iPhone SE / 14 / Pixel / small Android / landscape / iPad portrait

## Section 1 answers (report only)
- **Total Return %**: the code is RTO + CIR + Return-status + prepaid-only Cancel, ÷ gross revenue incl. GST. Exchange is not included. For 1–25 Oct, Cancel + RTO + CIR = 12.55% = Total, so the COD-cancel and Return-status parts are ~0 on D2C. The InfoPopover says this.
- **Return reasons = CIR only**: confirmed. A read-only BigQuery check for 1–25 Oct gives 4,463 orders · ₹1,07,58,871, all CIR. The mobile title is "Return reasons (CIR)".
- **Colours**:
  - Tables: red when Cancel > 3, RTO > 9, CIR > 9, Exchange > 6, Total > 20.
  - Exchange %: ≥ 15 red, ≥ 8 amber.
  - Mobile uses the same thresholds.

## Decisions made without Suraj
All 12 are in `RETURN_ANALYSIS_PLAN.md`. The ones that change what you see:
1. **No previous-period dashed line** on the master chart. The API has no previous-period daily rows, and a second call would double the BigQuery cost.
2. **"vs 6–30 Sep"**, not "vs 1–25 Sep". The API compares with the 25 days just before the range; the label shows the real comparison.
3. **"₹x returned"** in the hero = Total return % × revenue (the numerator the API already divides).
4. **Category view** = the sub-category rows grouped, with percentages weighted exactly like the desktop Total row.
5. **Cancellation chart** stacks by day bucket, with a note that day buckets aren't tracked yet (see backlog).
6. **Qty / Rev** is one page-wide setting in "⋯".
7. **Entry card** always shows all-D2C numbers (the page opens on all D2C) and says "All D2C" on the MyFrido / Mobility sub-tabs.
8. **No alerts bell** in this sub-view's header (no room at 360–375 px). The date pill drops its calendar icon here so the title fits.
9. **Size-swap chip** needs top-1 ≥ 50%.
10. **Pushed `release/responsive`** once at the start, after the weekly main merge, before reading "push only the feature branch". Nothing else went to it. Nothing went to main.

## Logged to docs/BACKLOG.md
- **MEDIUM**: Cancellation · Days Since Order. The query hard-codes `'0-1' AS bucket`, so every cancellation sits in 0–1 days (desktop too). Not fixed: it's a query change.
- **LOW**: there's no previous-period daily series, so the mobile chart can't draw the dashed previous line.

## Not done / open
- The prompt file in the repo is `RETURN_ANALYSIS_MOBILE_PROMPT_1.md` (the name in the instructions has no `_1`). It is untracked and was not committed.
- Nothing is merged. Next step on your OK: merge into `release/responsive`.
