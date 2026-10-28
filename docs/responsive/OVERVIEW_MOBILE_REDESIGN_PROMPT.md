# Overview — Mobile Redesign (consolidated prompt for Claude Code)

> Paste everything below the line into Claude Code (same branch: `feature/responsive-overhaul`).
> First copy these 3 mockups into `docs/responsive/mockups/`:
> `overview_mobile_mockup.html`, `product_performance_mobile_mockup.html`, `logistics_ops_mobile_mockup.html`

---

Redesign the **Overview page for mobile** (xs/sm breakpoints, plus phone landscape where noted). **Desktop and laptop stay exactly as they are.** Open and match the 3 reference mockups in `docs/responsive/mockups/`. Their layout and interactions are the target. Chart shapes, ▲/▼ values, colour bands and definitions in the mockups are **illustrative**; use real data.

## Non-negotiable rules
1. **Display and layout only.** Don't change any data, query, metric formula or number. Values must match `baseline-numbers.json`.
2. Where a design needs a value the page doesn't show yet (e.g. previous-period values for ▲/▼), compute it **only by reusing the existing logic for the previous equal-length period** (the same way the page already computes Prev Period for Gross Revenue). No new formulas. List every such value you add, and verify 3 of them by switching the dashboard's date range to that previous period.
3. Commit work in small, separate commits (one per section below).
4. Stop at the end and show me the results (see "Verification").

## A. Global mobile rules (apply to every section)
- **Type scale** (tokens in the existing `C` theme object):
  - page title 17/600; card title 15–16/700; hero number 30–32/700
  - card main value 18–20/700; secondary values 14–15/600
  - labels 11–12, uppercase, 600, muted; body 13; **minimum 12px** anywhere; inputs ≥16px
- **One font family.** Replace the monospace number font with the main font + `font-variant-numeric: tabular-nums`.
- **Change indicators (▲/▼): all or none.** Every KPI in a group shows ▲/▼ % vs the previous period, or none do.
  - **Position:** on the **right of the value, on the same line**, never wrapping.
  - **Narrow cards:** if the card is too narrow (e.g. 3-column tiles or long ₹ values), put it in the **top-right corner next to the label** instead.
  - **Missing value:** if a metric truly has no previous value, show a grey "—" in the same position.
- **Colour rules:**
  - green = good, red = bad. Direction-aware: Return %, RTO %, NDR %, SLA breach %, CAC are "lower is better".
  - **Status colour edges on tiles (green/amber/red)** come from a config of targets: `src/config/metricTargets.js`. Create it with all targets **empty**. A tile with no target shows **no colour edge** (neutral). I'll fill in the targets later.
- **Alignment:** cards shown side by side use an **identical internal structure** (CSS grid or fixed row heights), so every row lines up across cards.
- **No scroll containers inside the page** on mobile (no inner-scrolling tables or cards).
- **Plain-language labels on mobile**, e.g. FASR → "First attempt", Z-RTO → "Zero-attempt RTO". **Tapping a tile or an info icon** shows the definition in a small popover. Tooltips must work by tap (no hover-only).
- **Human-readable dates:** "10 Sep – 10 Oct", "Updated 25 Oct, 2:33 pm". No ISO dates or seconds on mobile.
- Loading skeletons must **not block taps** (`pointer-events: none`).

## B. Sales Trend card (match `overview_mobile_mockup.html`)
1. **Hero:** one large number (default Gross Revenue) with "▲/▼ x% vs prev period". Remove "Prev Period" as a separate KPI on mobile.
2. **Chart:** full-width and edge-to-edge in the card. **No X- or Y-axis labels**, at most one very faint guide line.
3. **Previous period** as a light dashed line, with the legend "This period / Prev period". It must appear for every metric selected.
4. **Touch-and-drag scrubber:** a vertical guide line + dot follow the finger, and the hero shows that day's value, date and prev-period value. Lifting the finger restores the period total.
5. **No Daily/Weekly/Monthly toggle on mobile.** Pick granularity automatically from the date range: ≤31 days → daily, ≤6 months → weekly, >6 months → monthly. Show a small caption ("Daily · auto"), with a manual override in a "⋯" menu. Use the same aggregation logic as the existing toggle.
6. **KPI chips:** Net Revenue, Orders, Units, AOV, ASP, Return %, in one horizontally swipeable row (scroll-snap, edge fade). Each shows value + ▲/▼ (per the rules in A).
7. **Tapping a chip** switches the hero and chart to that metric, with the selected chip highlighted.
8. **Target:** hero + chart + chips all visible on the first screen of an iPhone SE (375×667).

## C. Channel Scorecard
- Every card uses the same fixed rows:
  1. logo + name
  2. value with ▲/▼ on the right (same line)
  3. share bar
  4. "x% of revenue · orders" (fixed 2-line height)
  5. divider
  6. NET REV / AOV / RETURN % rows
- All rows align across cards. One colour rule for Return % on every card.
- Keep the existing 2/3/4/6-column responsive grid from Phase 1.

## D. Product Performance (match `product_performance_mobile_mockup.html`)
- Replace the squeezed table on mobile with a **ranked list**. Each row has:
  - rank, full name (wraps to max 2 lines, no "…")
  - the selected metric in bold, secondary info (share % · Net Rev)
  - a share bar
- **Sort chips** for the table's existing columns (replacing "Columns (3/7)").
- **Tap a row** → bottom sheet with all 7 columns for that item.
- **Top 10 + "Show all N"**; search behind a 🔍 icon. No inner scroll.
- Build it as a **reusable `MobileRankedList` component**, because the same pattern will be used for record-style tables on other pages later.

## E. Logistics & Ops (match `logistics_ops_mobile_mockup.html`)
- **One title** ("Logistics & Ops"); remove the duplicated section header + card title on mobile.
- **Date note** as a small badge: "Showing 10 Sep – 10 Oct · latest complete data", replacing the long "(selected range too recent — showing last mature 30 days)" text. Same logic, only the wording and format change.
- **Hero:** Total shipments, plus a Delivered % ring.
- **Grouped tiles** (2 columns, value + ▲/▼ on the same line):
  - **Delivery health:** RTO %, Zero-attempt RTO %, NDR %, NDR resolved %
  - **Courier quality:** First attempt (FASR), Reattempt (RASR), SLA breach %, Delivered %
- **"Speed & SLA" card** with **Forward / RTO / Reverse** segmented tabs. Each tab shows:
  - **End-to-end days** as the big number: Forward = Order→Del; RTO = RTO mark→Del; Reverse = RVP→Del.
  - **Stage averages** as small horizontal bars, side by side, **not** as a chain that adds up (they're computed on different shipment sets). Forward: Order→Pickup, Order→Dispatch, Pickup→Del. Reverse: RVP→Pickup, RVP Pickup→Del.
  - **SLA met** as progress bars with the "x of y" counts underneath:
    - Forward: Processed ≤24h, Picked up ≤24h, Del ≤3d of pickup, Del ≤5d of order
    - RTO: RTO ≤5d of mark, RTO ≤10d of mark
    - Reverse: RVP ≤2d of created, RVP del ≤5d of done
  - An info popover explaining that stage averages don't add up to the total.
- All 8 TAT metrics and all SLA thresholds must still be present. Nothing removed, only regrouped.

## F. State of the Business
- **Customers · D2C:**
  - New vs Repeat customer revenue as **one split bar**, with both values and their % share.
  - Then **one even row of 3 tiles:** Customers (with "x new" underneath), Repeat rate, LTV. ▲/▼ goes in the top-right corner on these narrow tiles.
  - No orphan card and no empty gap.
- **Inventory alerts:**
  - Stockout-risk SKUs and Dead stock as **tappable rows** that open Inventory Health already filtered (Critical + Low stock / no sale in 90 days), using existing filters.
  - Header shows "Updated 25 Oct, 2:33 pm".

## G2. Collapsible section headings
Section headings ("WHERE REVENUE CAME FROM", "LOGISTICS & OPS PERFORMANCE", "STATE OF THE BUSINESS", etc.) become **tappable expand/collapse headers**.
- **The whole heading row is the tap target** (min 44px tall), with a chevron on the right (▾ expanded / ▸ collapsed) and a smooth height animation (respect `prefers-reduced-motion`).
- **A collapsed section shows a one-line summary** under its heading, using values already on the page. For example:
  - "12 channels · D2C 45.9% of revenue"
  - "2,54,115 shipments · 90.0% delivered"
  - "1,28,477 customers · 406 stockout-risk SKUs"
- **Default state on mobile:** the first two sections (Sales Trend, Where Revenue Came From) expanded; the rest collapsed.
- **Desktop/laptop:** headings are collapsible too, but **all expanded by default**.
- **Remember each user's open/closed choice per section** in localStorage, wrapped in try/catch, with the default used if storage is unavailable.
- **Collapsed content must not load or render heavy charts** until expanded (lazy render). Data fetching logic stays as it is.
- **Accessibility:** a `<button>` with `aria-expanded` and `aria-controls`, keyboard operable.
- **Reusable:** build it as a `CollapsibleSection` component so other pages can use it later.

## G. Phone landscape and tablet
- Phone landscape keeps the Phase 1 icon rail. The sections above use a 2-column card layout where it fits.
- Tablet portrait: KPI chips can show as a 3-column grid instead of a swipe row. Everything else follows the mobile designs at a larger size.

## Verification (then STOP)
1. Build passes; no new lint errors.
2. Numbers identical to `baseline-numbers.json`. Give me a list of the new previous-period values you added, with the 3 spot-checks.
3. Before/after **full-page** screenshots of Overview at iPhone SE, iPhone 14, Pixel, small Android, phone landscape, iPad portrait and 1366 laptop (the laptop must be unchanged).
4. Interaction check: chart scrubbing, chip switching, the scorecard alignment, list sorting + row sheet, Speed & SLA tabs, tile definition popovers, that the inventory alert rows navigate correctly, and that section expand/collapse works (summaries correct, state remembered after reload).
5. Update the Vercel **preview** (not production) and send me the link.
