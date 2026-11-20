# Inward page: mobile view (phone), same data and logic

> Mockup: `inward_mobile_mockup.html` (5 phones). Copy it to `docs/responsive/mockups/` for reference. Follow `MOBILE_DESIGN_SYSTEM.md` (green header, chips, cards, text ≥ 12px, tap targets ≥ 44px) and match the other Inventory mobile pages.

## Rules
- Work in `C:/wt-inward` on the Inward page's branch (create `feat/inward-mobile` from it if it's already merged, else from latest `origin/main`). **Local only: don't push, don't merge.** Preview on port 5199.
- **Layout only**, except the "Small additions" below. No other change to numbers, queries or logic. Apart from those additions, the laptop/desktop view must look exactly as it does now.
- Read-only data. Don't copy `sa_key.json` / `.env` anywhere; use them where they already are. Don't read my stored GitHub credentials.
- Work on your own; if something is unclear, pick the sensible option, note it in the report, and carry on.

## Small additions (laptop + phone)
- **Inward value ₹ tile:** units × COGS per unit from `product_cogs_monthly` (via the existing `/api/cogs-monthly` handler, same COGS rule as the P&L page), ₹ Cr / L format, ▲/▼ vs previous period. Place it as the 2nd tile. Units with no COGS: count them and show "N units without COGS" under the tile.
- **Finished-goods note:** keep raw material / packaging codes excluded (no logic change), but show one small grey line under the KPIs: "Finished goods only · X units of raw material / packaging not shown" (X = the excluded units for the selected range).
- **Vendor bottom sheet:** below "last 10 GRN days", add **"SKUs supplied"** (SKU · sub-category · units in range, top 10, "Show all").
- **Default date range:** this month to date, same as the other Inventory tabs.
- **"– live" pill:** on this page it shows "– live" instead of a count. Fix it so it shows the same number as on other pages.

## Phone layout (≤ 767 px), top to bottom
1. **Header = exactly the same as Inventory → Sales & Allocation on phone** (reuse that component, don't build a new one): "Inventory" title, date pill, filter icon, ⋯ menu (with its notification dot), and the sub-tab row **Inventory Health · Sales & Allocation · Inward** with Inward underlined/active. No source chips in the header (source filter lives in the filter sheet and in Source mix).
2. **Master card = the same pattern as the Sales & Allocation "Revenue" master card** (same component/styles: light green gradient card, label with ⓘ and ⋯, big number, subtitle, area chart inside the card, legend row, then a 2-column grid of white tiles):
   - Label **INWARD UNITS** ⓘ, big value, subtitle "Avg X/day · N GRNs · ▼/▲ % vs <previous period>".
   - Area chart of inward (solid) with sales as a dashed line; legend "■ Inward ┄ Sales" and "Daily · auto" on the right (auto = weekly > 90 days, monthly > 180 days).
   - **6 tiles (2 × 3):** Inward units · GRNs · SKUs received ("N new" underneath) · Active vendors · Inward ÷ sales (amber dot when > 1, "stock building") · Rejection % ("N units"). **Tapping a tile switches the chart to that metric** (selected tile outlined), exactly like Sales & Allocation.
   - **Inward ▲/▼ in neutral grey, not red/green** (more inward isn't good or bad by itself).
3. (Trend is inside the master card; no separate trend card on phone.)
4. **Source mix:** the 4 rows with bars, units and share, "N GRNs · avg X/GRN". Tap = filter (same as the chips).
5. **Top vendors:** card list of the top 5 by units. Each row: name + source tag (coloured: Domestic green, Import blue, Inhouse amber, Unmapped grey); second line "N GRNs · N SKUs · last GRN date"; units on the right. **"View all N vendors →"** opens a full-screen list with search, sort (units / GRNs / last GRN) and the Total row.
6. **SKU detail:** segmented "By SKU / Sub-cat" and a search box. Card rows: SKU code; sub-category (product name) underneath; third line "Stock X · DOI chip · last inward date"; inward units on the right. DOI chip colours follow Inventory Health's bands. Top 5, then **"View all N SKUs →"** full-screen with search and sort.
7. **Product master:** a compact card with "N SKUs" and a search box. Tapping the search opens a full-screen search over all SKUs (rows like SKU detail, plus last inward qty and vendor).
8. **Data quality (admins only):** collapsed card with 3 counts (SKUs not in master · unmapped vendors · zero/negative lines). "Show" expands the existing tables; each table shows max 4 columns on phone with "View full table ⤢" (full screen, sideways scroll, first column fixed). Copy / CSV buttons stay.
9. **Footer source line** stays, small and grey.

## Interactions
- **Tap a vendor or SKU row** → bottom sheet "<name> · last 10 GRN days", subtitle (sub-category · vendor, or source). For SKUs add 4 mini stats (stock, avg sale/day, DOI, inward in range). Table: Date · Units · GRNs. Close with ✕, swipe down or tapping outside.
- **Filter icon** → bottom sheet with chips: Warehouse, Source, Category (top 4 + "+N"), Vendor search. Buttons "Clear" and "Show results". Active filters show a count dot on the icon.
- Every full-screen list or sheet: back/✕ at top, body scrolls, header stays fixed.

## Tablet (768–1023)
- KPI tiles 3 per row; trend and source mix stacked; tables full width with sideways scroll inside the card (no page overflow).

## Checks before reporting
- 375 and 360 wide, Chromium + WebKit: no horizontal page scroll, text ≥ 12px, tap targets ≥ 44px, no overlapping elements, bottom bar visible.
- Numbers on phone = numbers on laptop for the same filters (check KPIs, one vendor, one SKU).
- Laptop 1280 and 1536: unchanged from before (compare screenshots).
- Commit locally. Write `docs/INWARD_MOBILE_REPORT.md` (what was done, any assumptions, screenshot paths for phone 375 + laptop) and reply in under 8 lines with the localhost link.
