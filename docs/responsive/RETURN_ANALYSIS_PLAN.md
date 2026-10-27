# Return Analysis (Sales → D2C) — mobile plan

Prompt: `docs/responsive/RETURN_ANALYSIS_MOBILE_PROMPT_1.md` (the file named `RETURN_ANALYSIS_MOBILE_PROMPT.md` in the instructions does not exist; `_1` is the only one).
Branch: `feature/responsive-return-analysis`, from `release/responsive` after merging `origin/main` (67c6a467) into it; no `public/` differences vs main after the merge.
Run mode: unattended. This plan was committed and the build continued without waiting.

## 1. Code map

| Section (prompt §0 / §2) | Desktop code today | Data (one call: `POST /api/return-analysis`) |
|---|---|---|
| Page | `src/sales/D2CReturnAnalysisTab.jsx` (default export), shown by `ChannelTab` in `App.jsx` when `shopifyView === 'returns'` (URL `/sales/shopify/return_analysis`) | body `{ start, end, subChannel, category, subCategory, topProductsPaymentType }`; product-age turns into a sub-category list |
| 1 Header | `SalesPage` fbar: "D2C · Return Analysis", "← Back to Overview", Export ▾ (D2C exports), Filters (`SalesFilterButton`) | — |
| 2 Return Metrics Trend | `ReturnTrendChart`: 6 tiles + dual-axis chart, Daily / Weekly / Monthly (weekly/monthly = plain average of the daily %) | `kpis` (cur + prev), `dailyTrend` |
| 3 Top Products · High Returns | `TopReturnedProductsCard` (payment type dropdown re-fetches the page, Qty / Rev) | `topProducts` (sub-category level: gross ₹, ₹ lost, qty lost) |
| 4 Category-wise Return Breakdown | `ReturnBreakdownTable` (components.jsx), rows = category + sub-category pairs, ▶ expands to **SKU variants**, search, Export CSV | `categoryTable`, `skuVariants` |
| 5 Last 12 Months Summary | `ReturnBreakdownTable` by month | `monthlyTable` (12 months, Nov-25 → Oct-26) |
| 6 Payment Type-wise | `PaymentTypeTransposedTable` (Overall = revenue-weighted) | `paymentTypeTable` (COD, PPCOD, Prepaid) |
| 7 Return Reasons · Detail | `ReturnReasonsTable` (reason ▶ sub-reasons, Total row) | `returnReasons` (reason, sub-reason, orders, ₹) |
| 8 Cancellation · Days Since Order | `CancelBucketChart`: last 6 months (ignores the date picker), bars stacked **by category** (12 colours), sub-category multi-select, day buckets only in the tooltip | `cancelByBucket` |
| 9 Exchange Deep Dive · SKU-wise | `ExchangeDeepDiveCard` (wide table, search, Export CSV) | `exchangeSkuDetail` (top 200 SKUs) |
| Not on the page | `ExchangeSpotlightCard`, `ExchangeFlowCard` are defined but not rendered; `exchangeByProduct`, `exchangeReasons`, `exchangeFlow` are fetched but unused | — |

The prompt's §0 list matches the code; nothing missing. Only difference: the desktop order is Trend + Top products, Category + 12 months, Payment + Reasons + Cancellation, Exchange.

**Sales → D2C on mobile** is `ShopifyTab` (App.jsx) → `SalesMobileView channel="shopify"` (`src/sales/SalesMobileView.jsx`). Its last card is "Top states & cities" (`mobileChannelConfig.js` sections). The 2b entry card goes after it. On phones the "⋯" menu has no Return Analysis item today (it was hidden on purpose until this page had a mobile layout). It gets one now.

## 2. Definitions (report only, nothing changed)
- **Total Return %**: the code (`computeNetRevenueMeasures` in `api/_bq.js`) is **(RTO + CIR + Return-status + prepaid-only Cancel) ÷ gross revenue incl. GST**. Exchange is not included. For 1–25 Oct, Cancel 4.50 + RTO 4.06 + CIR 3.99 = 12.55 = Total 12.55, so the COD-cancel and Return-status parts are ~0 on D2C here. The InfoPopover says: "Cancellations + RTO + customer returns (CIR) as a share of gross revenue incl. GST. Exchanges are not included." The monthly and category tables use the same `withPct()` fields.
- **Return reasons = CIR only: confirmed.** The query takes RTO / Return / CIR orders that have a `Customer_Return_Reason`. A read-only BigQuery check for 1–25 Oct gives `CIR 4,463 orders · ₹1,07,58,871` and no RTO or Return rows. The mobile card title is **"Return reasons (CIR)"**.
- **Colour rules (desktop):**
  - Category / 12-month / payment tables: red when Cancel % > 3, RTO % > 9, CIR % > 9, Exchange % > 6, Total % > 20 (`RED_THRESH`, same in both components).
  - Exchange deep dive: Exch % ≥ 15 red, ≥ 8 amber.
  - KPI badges: `returnBadge`, where a rise is red and a fall is green.
  - Mobile uses the same thresholds with the design-system red (`M.down`) and amber (`M.amber`).

## 3. Cancellation buckets, sub-reasons
- **Day buckets**: the desktop tooltip lists 0-1, 2-4, 5-7, 8-10, 10+. But the query hard-codes `'0-1' AS bucket`, so every cancellation is in "0–1 days" and the other buckets are always 0. That's a data bug → **logged in docs/BACKLOG.md, not fixed.** On mobile, the bars stack by bucket with a legend, as asked. An InfoStrip says the days-since-order split isn't tracked yet (all counted as 0–1 days), so nobody reads it as a real finding.
- **Sub-reasons**: exist (`subReason`). Tapping a reason shows them in a sheet.

## 4. Maturity (4a) and size swap (4b)
- **4a**: the existing maturity check is `rangeTouchesImmatureWindow(end)` (`src/utils.js`, 14-day cutoff, `PROVISIONAL_MATURITY_CUTOFF_DAYS`).
  - There is **no mature-only comparison** in `/api/return-analysis`. So only the text strip is added, no toggle and no new calculation.
  - Text: "Returns for orders after {today − 14 days} are still coming in; recent return % will rise." It shows only when the range ends inside the window.
  - Mobile: an InfoStrip in the master card. Laptop: one line under the Return Metrics Trend tiles.
- **4b**: yes, from the existing columns only.
  - A SKU's top exchanged-to SKU (`top1Sku`) is a **size swap** when the two SKU codes differ in exactly one dash-separated part and both parts are sizes (S/M/L/XL/XXL/XS/3XL…, or a 1–2 digit size), with an optional trailing digit.
  - Examples: FR-OPC-M1 → FR-OPC-L1, FR-CCASS-08-CB1 → FR-CCASS-07-CB1. A colour change like FR-OHP-BK → GN is not a size swap.
  - Chip "Size swap 91%" when `top1Pct` ≥ 50 (most exchanges), on the mobile row and next to Top Exch Product 1 on the laptop table.

## 5. Components
**Reused**: MobilePageHeader, ActionMenu, SalesFilterButton (existing FilterSheet), MasterTrendCard, KpiTile, DeltaBadge, SegmentToggle, CompactRankRow, MobileRankedList, FullScreenList, BottomSheet, InfoStrip, InfoPopover, FilterPicker, CardKit (Card, ShowAllButton, Chips), MixBar.

**New / changed (shared):**
- `MobilePageHeader`: optional `onBack` (‹ before the title).
- `StackedMiniBar` was not needed: `MixBar` already draws a thin stacked bar with a legend.
- `src/responsive/StackedBarChart.jsx`: a small SVG stacked bar chart with a legend, tap a bar → callback.

**New (page):**
- `src/sales/returnAnalysisData.js`: the fetch hook, moved out of the desktop component unchanged, so desktop, mobile and the entry card share one request shape and the API cache. Also the desktop trend grouping (moved, unchanged), `RED_THRESH`, size-swap matcher, maturity date, shared Qty / Rev store.
- `src/sales/ReturnAnalysisMobile.jsx`: the page sections.
- `src/sales/ReturnEntryCard.jsx`: the 2b card.

**Doesn't fit / changed from the prompt:**
- The master chart has **no previous-period dashed line**: the API returns daily rows for the current period only. Adding it would mean a second API call per view (doubling the BigQuery cost), so it was left out. ▲/▼ on the tiles come from the API's previous-period KPIs, as on desktop.
- Payment type: desktop has COD / PPCOD / Prepaid + Overall. Mobile shows the same four rows.

## 6. Mobile layout (built in this order, one commit each)
1. **Entry card on Sales → D2C** (2b): after the last card. "Return analysis ›", one line "Return x% · Cancel · RTO · CIR" with ▲/▼ on Return %, and a Cancel / RTO / CIR stacked bar. Same request as the page (cached by the API), opens the page; back restores the D2C sub-tab and scroll position. Also a "Return analysis" item in the D2C "⋯" menu.
2. **Header**: ‹ back, "Return Analysis · D2C", filter icon, "⋯" (Show by Qty / Revenue; exports), date pill. The sub-line shows "· by qty" when Qty is chosen.
3. **Master card**: 6 tiles in this order: Return %, Cancel %, RTO %, CIR %, Exchange %, Revenue. Hero sub-line "▼x% vs {prev dates} · ₹x returned of ₹y". Daily chart, with the desktop's own weekly / monthly grouping in "⋯". 4a strip on top.
4. **By payment type**: SegmentToggle Total / Cancel / RTO / CIR / Exch; rows COD, PPCOD, Prepaid, Overall.
5. **Top products**: payment chips (All / COD / PPCOD / Prepaid, same re-fetch as desktop), top 8 + Show all, sheet.
6. **Category breakdown**: Category / Sub-category toggle, 6 sort chips, top 8 + Show all (search), sheet with sub-categories (category) or SKU variants (sub-category).
7. **Return reasons (CIR)**: top 6 + Show all, Total line, sheet with sub-reasons.
8. **Cancellation · days since order**: stacked by bucket, legend, sub-category picker, tap bar → sheet.
9. **Last 12 months**: Oct-26 first (partial label), top 6 + Show all 12, Cancel / RTO / CIR mini bar, sheet.
10. **Exchange deep dive**: sort chips Exch qty / Exch % / Exch ₹, top 10 + Show all (search), sheet with "Exchanged to".
11. **4a** (laptop line) and **4b** (laptop chip).

## Decisions made without Suraj
1. **Prompt file name**: used `RETURN_ANALYSIS_MOBILE_PROMPT_1.md` (the only one present).
2. **No previous-period dashed line** on the master chart (no data for it; a second API call would double the BigQuery cost). ▲/▼ stay as desktop.
3. **Hero sub-line ₹ returned** = Total Return % × revenue. It's the same numerator the API divides by, shown as ₹; no new formula.
4. **Category view** of the category card groups the API's category + sub-category rows by category: revenue / qty summed, percentages weighted by revenue (or qty). That's the same weighting the desktop table's Total row uses, and it can be checked on desktop by searching the category name (the Total row then shows the same numbers).
5. **Cancellation chart** stacks by day bucket as asked. Because the query puts everything in 0–1 days (backlog), an InfoStrip says so. The desktop's category stacking is not shown on mobile (12 decorative colours; the design system allows green shades only).
6. **Qty / Rev** is one page-wide setting on mobile (default Revenue, like desktop). It applies to the payment, top products, category and 12-month cards (the four desktop cards that have it).
7. **Entry card numbers** are always all-D2C: the Return Analysis page always opens on all D2C (it clears the MyFrido / Mobility sub-tab today). On a MyFrido / Mobility sub-tab the card says "All D2C" so the numbers aren't mistaken for that sub-tab's.
8. **Header** on the Return Analysis view has no alerts bell (row 1 has no room at 375px with ‹, title, filter, ⋯ and date). The bell is one tap away on every other page.
9. **Size-swap chip** uses `top1` only and needs ≥ 50% (the prompt's example, 91%, is top1).
10. **"vs" period in the hero** reads "vs 6–30 Sep" for 1–25 Oct, not "vs 1–25 Sep" as in the prompt: the API compares with the same number of days just before the range (25 days ending 30 Sep), and the ▲/▼ on desktop and mobile come from that period. The label shows the real comparison; nothing changed in the calculation.
11. **Laptop 4b chip** reads "Size swap" (the % is already next to the SKU in that cell); the mobile chip reads "Size swap 91%".
12. **Pushed `release/responsive`** once, after merging main into it at the start (standing weekly-merge rule), before reading that this run should push only the feature branch. Nothing else was pushed to it.
