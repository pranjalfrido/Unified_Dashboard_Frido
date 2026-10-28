# Inventory Tab — Mobile Redesign (Health + Sales & Allocation)

> Follow `docs/responsive/MOBILE_DESIGN_SYSTEM.md` (look & shared components) — this file only says **what** goes on the page.
> Reference mockup: `docs/responsive/mockups/inventory_mobile_mockup.html` (layout/interactions are the target; some values are illustrative).
> Scope: below 1024px. Laptop/desktop unchanged. Display/layout only — no data or logic changes; numbers must match desktop.
> Start only after Sales is verified. Plan first, then build section by section, stop at Verification.

---

## 1. Header (`MobilePageHeader`)
- Title **"Inventory"**, underline sub-tabs **Inventory Health / Sales & Allocation** (replaces the ☰ "Menu & Filters" pop-up and the sidebar sub-menu on phones).
- **Inventory Health: no date picker** (it is a snapshot). Show a small line under the title: "Updated 26 Oct, 7:33 am · sales till 24 Oct" (from the existing snapshot / latest-sales values).
- **Sales & Allocation:** date pill as today, with "Unicommerce · sales till {date}" under the title.
- Filter icon with count on both.
- **Regular / Other facilities toggle: not shown on mobile.** Mobile always uses **Regular** (the existing default). Desktop keeps the toggle unchanged.
- Filters → `FilterSheet`/`FilterPicker`: Location, Stock status, Avg sale window, Facility type, Facility, Category, Sub-category, SKU (Health); Channel + product filters (Sales & Allocation). The per-card "Channel" dropdowns on desktop move here on mobile. Export CSV buttons → "⋯" menu.
- No separate info strip for snapshot/source — it lives in the header line above.

## 2. Health
**a. Summary card** (MasterTrendCard in *summary mode* — no chart, it's a snapshot)
- Hero: Total inventory (units) + "N days of inventory · latest sales {date}".
- RTD / RAW / Blocked split bar (green shades) with legend.
- 6 `KpiTile`s: RTD, RAW, Blocked RAW, Avg sale (B2C)/day, Total avg sale/day, Days of inventory. No ▲/▼ (desktop has none).

**b. Warehouse health** — legend at the top ("■ RTD (ready to dispatch) ■ RAW") so the bar colours are explained; 7 compact rows instead of the swipe carousel: location code · total units · status dot + label · RTD/RAW mini bar · DOI (bold) · allocation %. Tap → `BottomSheet` with RTD, RAW, avg sale, allocation and a "See {location} stock" button that opens the explorer filtered to that location.

**c. Stock explorer** — replaces both **Inventory Detail** (4,121 SKUs) and **Location-wise Inventory & Avg Sale** (7-location matrix) on mobile:
- **Drill-down**: default view = **Category** rows → tap → **Sub-category** rows → tap → **SKU** rows → tap → SKU detail sheet. Breadcrumb at the top ("All categories › Orthotics › …") to go back up; Android Back also goes up one level.
- **Location chips**: All, PNQ, GGN, BLR, MUM, KOL, HYD, CHN — switch every level to that location's inventory and avg sale (same numbers as the desktop location matrix).
- **Status filter in a "⋯" button** at the top-right of the card (bottom sheet: All / Critical / Low / Sufficient / Excess; existing status logic). When a status is active the button shows it ("⋯ Critical"). No status chip row.
- Category/sub-category row: name · total units · "avg sale x/day · DOI y d" · thin **status-mix bar** (share of SKUs per status, from existing statuses), with a one-line legend above the list ("Bar = SKUs by status: Critical / Low / Sufficient / Excess").
- SKU row: product ID · total units · status dot + label · avg sale · DOI.
- SKU sheet: RTD, RAW, RAW blocked, Total, Avg sale (B2C), DOI, Status, Website status, and inventory/avg sale per location.
- Search (behind 🔍) across category / sub-category / SKU; "Show all 4,121 SKUs" → `FullScreenList` (sort by units, DOI, avg sale; status chips; 20 at a time / virtualised).
- Build the drill-down as a reusable **`DrillDownList`** in `src/responsive/` (levels, breadcrumb, back handling) — other pages (Sales matrix, P&L lines) will reuse it.

**d. Ageing stock** — **exclude the Spare Parts category from both Slow moving and Dead stock, on mobile AND desktop/laptop** (display filter only; separate small commit; desktop tables lose the Spare Parts rows, nothing else changes). One card with `SegmentToggle` **Slow moving / Dead stock** (replaces the two side-by-side tables). Rows: full name (no "…"), category under the name, total units, DOI, avg sale/day. Top 8 + "Show all" → `FullScreenList` with search. Tap → sheet (existing drill/expand content from desktop).

## 3. Sales & Allocation
**a. Master card** (`MasterTrendCard`): hero Revenue + "Avg ₹x/day · units"; chart = existing Sales Trend (daily units & revenue → one line at a time, switched by tiles; auto granularity, D/W/M override in "⋯"); 6 tiles: Revenue, Units sold, Avg selling price, Fill rate, Momentum, Sales type mix. Existing colour logic: Fill rate status dot (amber when low), Momentum negative in red. Definitions in InfoPopover (fill rate, momentum, mix).

**b. Sales vs allocation** — per location: two thin bars (dark green = sales/demand, light green = allocation/shipped) + "sales / allocation" and % of shipped. Same order and values as desktop.

**c. Contribution** — one card with `SegmentToggle` **Channel / Category** + Units / Revenue chips (replaces Channel-wise Sales and Category Contribution). `CompactRankRow`s, top 6 + "Show all 11".

**d. Top products** — `MobileRankedList` with SKU / Sub-cat / Category toggle + Units / Revenue chips; channel filter via FilterSheet; top 10 + "Show all 232" → `FullScreenList`.

**e. Biggest movers** (Drastic Sales Change) — `SegmentToggle` ▲ Risers / ▼ Fallers; chips: Last vs 2nd-last day / Last vs 7th-last day, Units / Revenue, SKU / Sub-cat / Category. Rows: name, "before → now", change % (green/red). Search → FullScreenList.

**f. Daily sales by product** (Product-wise Sales Matrix) — `DrillDownList` Category → Sub-category → SKU; each row shows a **7-point sparkline + total** instead of date columns; tap a leaf → sheet with the per-day/week/month values. Units / Revenue and Date / Week / Month in "⋯". Desktop matrix unchanged.

## 4. Status colours (palette rule)
Critical = red dot, Low = amber dot, Sufficient = green dot, **Excess = muted grey dot** (no blue). Status shown as dot + label, not coloured pills. Allocation % and other numbers in normal ink unless an existing threshold says otherwise.

## 5. Plan to send first (then wait for OK)
1. Every card/table/filter found in code for both sub-tabs and how each maps to the sections above.
2. Confirm the explorer's location numbers come from the same data as the desktop location matrix, and the status-mix uses existing status logic.
3. New shared components (`DrillDownList`, summary mode for `MasterTrendCard`, sparkline row) and where they live.
4. Anything that doesn't fit (e.g. Inward tab still hidden; confirm mobile is locked to Regular facilities).

## 6. Verification (then STOP)
- Ageing lists: Spare Parts absent on mobile and desktop; all other rows unchanged.
- Numbers identical to desktop (Regular) for both sub-tabs (2 locations; 2 stock statuses).
- Section 5 checklist of the design system, **Chromium + WebKit**.
- Interaction check: sub-tabs, filter sheet, drill-down down/up + Android Back, location and status chips, SKU sheet, full-screen lists (4,121 SKUs smooth), ageing toggle, master card tile switching + scrub (no resize), contribution toggle, movers toggles, daily-sales drill + sparklines.
- Screenshots SE / 14 / Pixel / small Android / landscape / iPad portrait + 1366 laptop unchanged; preview link.
