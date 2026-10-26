# Logistics Tab — Mobile Redesign (Performance + Cost)

> Follow `docs/responsive/MOBILE_DESIGN_SYSTEM.md` (look & shared components). This file says **what** goes on the page.
> Reference mockups: `docs/responsive/mockups/logistics_mobile_mockup.html` (page) and `docs/responsive/mockups/month_picker_mockup.html` (Cost month picker). Copy both into the repo first. Layout and interactions are the target; chart shapes and a few values are illustrative.
> Scope: below 1024px only. Laptop/desktop unchanged, **except the Cost sub-tab month picker (section 1a)**. Display/layout only — no data/logic changes; numbers must match desktop.
> New branch `feature/responsive-logistics` from latest main. Plan first (section 6), then build, stop at Verification.

---

## 0. Global for this page
- No orange/blue focus outline on any chip or toggle when tapped (outline: none; keep a visible focus ring only for keyboard focus via :focus-visible).
- **All segmented toggles are equal-width** (buttons share the full card width evenly), no focus outline on tap.

## 1. Header (`MobilePageHeader`)
- Title **"Logistics"**, underline sub-tabs **Performance / Cost** (replaces the sidebar sub-menu on phones).
- Line under the title: Performance → current direction · shipment type ("Forward · Regular shipments"); Cost → "Billing months · Apr – Jul 2026" (from the selection).
- Date pill: Performance = date range; Cost = billing months via the shared **`MonthRangePicker`** (see 1a).
- Cost only: **Overview · B2C · FTL/PTL · 3PL** as a **slim, minimal row** (≈26px tall, 4 evenly spaced text tabs, 12px semibold): inactive = plain soft-white text with no background or border; active = white bold text with a **short 2px white underline (≈24px, centred)**, the same selection style as the Performance / Cost tabs but smaller, so the two levels read as main and sub tabs. No boxes or pills. A hairline divider separates the two rows.
- Filter icon with count → `FilterSheet`:
  - Performance: Courier (multi-select with logos, `FilterPicker` with search), Courier direction (Forward/Reverse toggle), Shipment type (Regular/SDD-NDD toggle), Pickup state, Drop state, Drop city, Payment, Category, Sub-category, Weight slab.
  - Cost: existing Cost filters (the "1 filter" chip, sub-category, Allocation view if applicable).
- Refresh, Export, Allocation and the info (i) → "⋯" menu (mobile only; on laptop they stay in the toolbar).

### 1a. Cost sub-tab month selection — `MonthRangePicker` (laptop AND mobile)
Mockup: `docs/responsive/mockups/month_picker_mockup.html`. **This is the one desktop change on this page**; it replaces the current date pill + "4 of 9 ▲" checkbox dropdown (Last 1 / All 9, Search month…, month checklist) on Cost Analytics.
- **Trigger**: one pill, "📅 Apr – Jul 2026  [4 mo] ▾" (laptop); "📅 Apr – Jul 26" in the mobile header. Line under the title: "Billing months · Apr – Jul 2026". Non-contiguous picks read "Apr, Jun 2026" (≤3) or "5 months".
- **Laptop placement**: the one pill sits exactly where the two controls are today, in the sub-tab toolbar between **Allocation** and **Export**, with the same height and border as its neighbours. Sub-tabs (Overview / B2C / FTL/PTL / 3PL), "4 filters", ⓘ, Allocation and Export stay unchanged. The popover opens right-aligned to the pill so it doesn't run off the screen.
- **Laptop**: popover (~580px) under the pill. Left: **Quick pick** list, each with its range on the right — Latest month, Last 3 months, Last 6 months, FY to date (Apr → latest), All available. Right: **Range | Pick months** toggle, year header with ‹ ›, **4×3 month grid** (Jan–Dec). Footer: selection in words + "n billing months", Clear, Cancel, Apply.
- **Mobile**: `BottomSheet` (fits without scrolling): title "Billing months" + "n selected", preset chips (Latest, Last 3M, Last 6M, FY to date, All available), year ‹ ›, the 4×3 grid **always visible** (≥40px targets), sticky "Apply · Apr – Jul 26". **Range only on mobile: no Range/Pick months toggle.** If the current selection is non-contiguous (picked on laptop), the pill reads "5 months", those months show as selected, and the first tap starts a new range. Header pill text = "Apr – Jul 26" (single month: "Sep 2026").
- **Range** (default): click start month, then end month; months between fill with a soft green band, ends solid Frido green; hover previews the band. A third click starts a new range. **Pick months**: click toggles single months (same as today's checkboxes). Switching modes keeps the current months.
- Months with no billing data are **greyed and disabled** (list = the months the page already loads; today's "9"). Latest month gets a thin ring. Selected preset row/chip uses the soft glow.
- **Nothing reloads until Apply**; Esc / click outside / Cancel discards. Apply is disabled with 0 months.
- **Output = the same array of billing months the current dropdown passes** (same keys/format, same state/URL param). No query, calculation or default change; default selection stays what it is today. Search box removed (≤ 24 months doesn't need it); if the list can exceed 24 months, keep year paging.
- **Scope: Logistics → Cost sub-tab only.** Each sub-tab keeps **its own months, as today** (Overview, B2C, FTL/PTL and 3PL each have their own selection and default; decided 2026-10-26). The pill, the line under the title and the picker show and offer only the open tab's months. Performance keeps its date range; no other page's month or date control changes. Build it as `src/responsive/MonthRangePicker.jsx` (popover ≥1024px, BottomSheet below), used only here. Keyboard: arrows move across months, Enter selects, focus-visible ring only.
- Verification: same months selected → identical numbers before/after on Cost Overview, B2C, FTL/PTL, 3PL; laptop screenshots of the closed pill and open popover.

## 2. Performance

**a. Master card** (`MasterTrendCard`): hero **Total shipments** with desktop ▲/▼; fixed sub-line "GMV ₹x · y% delivered · z% RTO"; chart = Shipment trend (Total; tiles switch to Del %, RTO %, and the TAT averages where a daily series exists; otherwise "No daily breakdown"). Auto granularity (Daily/Weekly/Monthly override in "⋯").
- Tiles (**10, even**): Shipments, **RTO %** (instead of Total attempted — Attempted stays in the Shipments tile's InfoPopover/sheet), Z-RTO, FASR, RASR, Multi-att, Processing, Pickup, In-transit, Fulfilment. **Avg RTO TAT** moves into the RTO card's total row. RTO % ▲/▼: use the existing previous-period RTO % if the code has it; otherwise tell me (all-or-none rule — don't invent a calculation). Short labels on tiles, full names in the hero/InfoPopover (e.g. "FASR % (of attempted)").
- ▲/▼ colours exactly as desktop (direction-aware: TAT down = green; pickup TAT up = red).
- "Shipment volume & TAT trend" chart: covered by the tile switching (no second chart on mobile).

**b. Courier scorecard** (Courier-wise breakdown) — no separate "All couriers" total box (the KPIs already cover it).
- **One compact segmented toolbar** (38px, soft background, 3 equal segments with thin dividers, each = small line icon + value + caret), replacing the chip rows: **View** (layers icon) "Courier › Zone" · **Filter** (funnel icon) "All" or a count badge when active · **Sort** (up/down arrows icon) "Total". An active segment becomes a raised white pill in Frido green (like a selected segmented control). Match the mockup.
  - **View** → bottom sheet: Courier / Zone / Facility / Month, pick up to 2 **in order** (numbered 1, 2). Level 2 **nests**: each level-1 row is collapsible (▸/▾) and expands into its level-2 rows (e.g. Courier → Zone). Uses the existing desktop group-by data; if a nested combination isn't available, tell me in the plan.
  - **Filter** → bottom sheet with grouped checkboxes: *City tier* (Tier I / II / III) and *Payment mode* (COD / Prepaid); **single choice, exactly as desktop** (one tier or one payment mode, not combined; decided 2026-10-26), line under the bar: "Showing Tier I"; Clear / Apply. Same filter logic as desktop.
  - **Sort** → bottom sheet listing all 13 columns.
  - Columns: Vol %, Total, Del %, RTO %, Canc %, FASR %, RASR %, EDD breach %, Avg processing, Avg pickup, Avg S2D, Avg O2D, Avg RTO TAT.
- Rows: name (+ small logo), "volume · del % · RTO %" (existing red highlights), sort value on the right, thin bar. Leaf rows tap → BottomSheet with all columns. Export in "⋯".

**c. Speed (TAT buckets)** — one card replacing the 4 tables: **equal-width** segmented toggle Processing / Pickup / In-transit / Fulfilment; one-line definition ("Order creation → shipment creation · by facility").
- Roomy rows (≈12px vertical padding): name left; right "**76.2%** within 0–1d"; a **10px stacked bucket bar** (green shades, fastest darkest, 2px gaps); under it **all bucket values in 4 aligned columns** ("0–1d 79.7% · 2–3d 16.6% · 4–5d 2.7% · 5+d 1.0%") — no separate legend needed. Total row first on a soft background. Tap → sheet.
- Existing red cell rules: the flagged bucket value shows in red in that 4-column line.

**d. By weight** — Qty / Value toggle; compact rows (slab, count, %). Tap → sheet with In-transit TAT and RTO % for that slab (data from "Delivery performance by weight slab").

**e. Geography** — `SegmentToggle` Drop city / Pickup city / Drop state; top 7–10 compact rows + "Show all".

**f. RTO shipment analysis** (card title) — equal-width toggle **RTO ageing / Delivery ageing / Reasons**, with a description line under it that changes per toggle: "RTO ageing · pickup date → RTO mark date", "RTO delivery ageing · RTO mark date → delivered back", "RTO reasons · shipment count & % of total RTO". (The ageing basis Order creation / Shipment creation / Pickup date is in the card's "⋯"; the description shows the selected basis.)
- Ageing: basis (Order creation / Shipment creation / Pickup date) in the card's "⋯"; rows per courier with total RTO count and a **stacked ageing bar** (0–1d, 2–4d, 5–7d, 8–10d, 10+d); right value = share 8d+; Total row (+ Avg RTO TAT). Tap → all buckets.
- Delivery ageing: same pattern (RTO mark → delivered back).
- Reasons: ranked list (reason, % of total RTO, count in sheet) — **no rotated chart labels**; top 8 + "Show all 16".

**g. NDR** — All / COD / Prepaid toggle; **summary block** as an aligned 3-column grid (NDR % · → Delivered (green) · → RTO (red)) with a footer line "All couriers · 16,340 NDR | avg 2.68 attempts"; courier rows (NDR %, count, → del / → RTO); tap → sheet with all columns (Del 2nd/3rd/3+ att, Avg att, Avg S2D, Avg O2D).

## 3. Cost — Overview
- Master card: split bar **B2C / FTL/PTL / 3PL** + legend; hero Total logistics cost with "x% of shipment value · parcels · trips"; chart = Monthly trend (3M/6M/12M/All in "⋯"); 6 tiles: Total cost, B2C courier, FTL/PTL freight, 3PL warehousing, Partners, Logistics % of value. Tiles switch the chart series.
- **Partners** card with `SegmentToggle` B2C couriers / FTL-PTL / 3PL: ranked rows (cost, share bar, key unit rate). Replaces the 3 partner card grids. Rental fixed vehicle appears as a row in FTL with "fixed".

## 4. Cost — B2C
- Master card: hero ₹ cost + ▲/▼ MoM; sub "x% of GMV · invoices · kg billed"; 6 tiles: B2C cost, Shipment value, Cost/kg, Cost/shipment, Surcharge %, Wasted freight (returns, red as desktop). Chart = monthly freight spend; Cost/kg and Cost/shipment tiles switch to their lines. The monthly table goes into "Show table" (FullScreenList).
- **Couriers**: ranked rows; sort chips Cost / ₹ per shipment / ₹ per kg / Over-weight; red over-weight highlights as desktop; tap → all columns.
- **Where the money goes**: `SegmentToggle` By zone / By leg; rows with shipments, avg ₹/shipment, ₹/kg, share. Sub-category selector → FilterSheet. No donut.
- **Weight slabs** (Weight slab detail + Rate card slab table): ranked rows (spend, avg/shipment, ₹/kg, forward/reverse/RTO in sheet, overbilled %); search in "⋯"; "Show all slabs" → FullScreenList.
- **Rate drift by courier**: rows "first → latest ₹/kg", drift % (red when rising, as desktop), months. Multi-line chart hidden on mobile; tap → sheet with that courier's monthly line.
- **Cost by product**: `DrillDownList` Category → Sub-category (shipments, spend, cost/order, over/under weight in sheet).
- **Like-for-like courier cost**: Zone / Weight slab / Leg / Specific slab as chips that open pickers; ranked rows (avg ₹, ₹/kg, shipments, "vs cheapest" with green "cheapest" / red +₹).

## 5. Cost — FTL/PTL and 3PL
**FTL/PTL**
- Master card: hero Total freight cost + ▲/▼ MoM; sub "trips · lanes"; tiles (**8 incl. the hero tile, even**): Freight cost, Avg cost/trip, Rental vehicles, Dearest vehicle, Top transporter (red as desktop), Top 3 lanes, Single-sourced, Transporters. **Vehicle types is dropped on mobile** (the Vehicle types card below covers it). Short tile labels; full names in the hero/InfoPopover. Chart = monthly freight spend; Avg cost/trip switches to its line; FTL share in sheet/table.
- **Transporters**: ranked rows (spend, trips, ₹/trip, share). Transporter trend multi-line → tap a transporter for its monthly line.
- **Vehicle types**: `SegmentToggle` Total spend / Cost per trip; rows; "Show all 9".
- **Lanes**: ranked rows "From → To · vehicle" (total, trips, ₹/trip, min–max in sheet); search; "Show all 34" → FullScreenList.
- **Rate consistency**: rows lane · vehicle with spread % (red).
- **Freight type mix**: split bar FTL / PTL (no donut).

**3PL**
- Master card: split bar **Operations / Rental** (+ "Other" if non-zero); hero Total warehousing cost with the desktop badge ("▲ 55.3% ₹/parcel vs Aug" in red) on the sub-line; tiles (8): Warehousing, Cost/parcel, Cost/kg, Avg parcel weight, Cost/site/month, Operations, Rental, Warehousing % of value. Chart = monthly total spend; Cost/parcel, Operations and Rental tiles switch to their lines.
- **Partners**: ranked rows (spend, sites, ₹/parcel, ₹/kg) with **two thin bars: % of spend vs % of parcels** (replaces "Spend vs volume" and "Cost per parcel by partner"); sort chips Spend / ₹ per parcel / ₹ per kg; legend "spend > parcels = above blended rate".
- **Warehouses (sites)**: rows facility (partner · location/pincode · parcels), total, ₹/parcel, ₹/kg; search; outliers already red on desktop stay red (e.g. ₹554.5/parcel).
- **Site trend**: one site at a time via chips, line vs blended rate (replaces the 6-line chart).

## 6. Plan to send first (then wait for OK)
1. Every card/table/chart/filter found in code for Performance and all 4 Cost sub-tabs, mapped to sections 2–5.
2. `MonthRangePicker`: where the current month state lives, its exact format, and the list of available months (source), so the output matches 1:1.
3. Final tile list per view (even count), what moves where (e.g. Avg RTO TAT), and which tiles have a daily/monthly series for chart switching.
4. Which existing red/green highlight rules apply where on mobile.
5. Reused shared components and any new ones (e.g. `StackedBucketRow`, `DualShareBar`).
6. Anything that doesn't fit.

## 7. Verification (then STOP)
- Numbers identical to desktop for Performance (2 date ranges, 1 courier filter, Forward + Reverse) and all Cost sub-tabs (Sept 2026).
- MOBILE_DESIGN_SYSTEM checklist on **Chromium + WebKit**.
- Interaction check: sub-tabs + cost chips, filter sheet (courier picker search), tile switching + scrub (no resize), scorecard view toggle + sorts + sheet, TAT toggle + stacked bars, RTO toggles + basis menu, NDR toggle, partner toggles, drill-downs, full-screen lists, "⋯" exports.
- Screenshots SE / 14 / Pixel / small Android / landscape / iPad portrait + 1366 laptop unchanged except the Cost month picker (screenshots of it closed and open); preview link.
