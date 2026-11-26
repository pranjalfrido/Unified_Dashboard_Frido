# Inventory Health: phone view of "Inventory cost detail"

Branch `feat/inventory-cost-mobile` (from `origin/main`), local only, not pushed. Layout only: no number, query or rule changed.
Phone = width up to 767 px (or a phone turned sideways). Laptop and tablet are untouched.

## What was done

| File | Change |
|---|---|
| `src/inventory/mobile/InventoryCostMobile.jsx` (new) | The phone card: header with square bordered 🔍 and ⋯ menu, subtitle, three summary tiles, status chips + Category chip, top 10 rows, "View all N SKUs →", full-screen list, category sheet, row detail sheet, "not valued" definition sheet. |
| `src/inventory/InventoryCostTable.jsx` | New optional prop `phoneLayout`. On the mobile Inventory Health page at phone width it renders the new card from the table's own `rows` / `cogs` / filters; otherwise the old code runs unchanged. The CSV column list moved to `costExport.js` (same columns). |
| `src/inventory/costExport.js` (new) | CSV columns shared by the laptop button and the phone "Export CSV". |
| `src/inventory/mobile/InventoryHealthMobile.jsx` | Passes `phoneLayout`. |
| `src/responsive/FullScreenList.jsx` | Four **opt-in** props (default off, other pages unchanged): `renderRow`, `extraControls`, `footer(list)`, `tallChips`. |
| `src/responsive/ActionMenu.jsx` | Optional `size` (default 34, unchanged) so this card can have a 44 px ⋯ button. |

Reused as they are: `Card`, `ShowAllButton`, `KV` (CardKit), `FullScreenList`, `BottomSheet`, `ActionMenu`, `fmtCompact`, the status colours from `invStatus.js`.

### Layout as built
- **Header:** "Inventory cost detail", 🔍 (44 px square) and ⋯ with *Export CSV* and *Unmapped COGS (N) · no own COGS* (admins only, same rule as laptop). Subtitle: `N SKUs · COGS as of <Mon YYYY> · M not valued`.
- **Tiles (from the Total row):** Inv. value (₹ Cr/L), Units, Not valued (amber). Tapping "Not valued" explains it (see check 1).
- **Chips (one line, scroll sideways):** All · the statuses that exist · Slow Moving · Dead Stock · Category ▾. The 32 px chips sit inside 44 px buttons.
- **Rows:** 2-column grid (left grows, right 88 px, min height 64, 12 px padding, thin divider). Left: sub-category name (bold, 2 lines max), `SKU · category`, `₹/unit · units · /day`. Right: value in ₹ L/Cr and the DOI chip in the status colour ("No demand" when DOI is blank). Sorted by value, top 10, then "View all N SKUs →".
- **Full-screen list (🔍 or View all):** back arrow, "All SKUs" with the live count, search box focused, sort chips Value ↓ · Units · DOI · Avg sale · COGS/unit, the same status and Category chips, rows as above, and a pinned bar: SKUs · ₹ value, units · avg sale/day · missing COGS. The Android/phone Back button closes it.
- **Row tap:** bottom sheet with Category, Sub-category, SKU, COGS/unit, Total inventory, Avg sale (B2C), Total value, DOI, Status, COGS status. Closes with ✕, swipe down, tap outside, or Back.
- **Unmapped COGS (N):** opens the full list already filtered to SKUs without their own COGS, with a "Show all" link to clear it.

### Choices I made where the brief was open
1. **"Category ▾" chip = product category** (Mobility, Orthotics, …), as a checkbox sheet. The laptop's dropdown called "Category" is really *status + Slow Moving / Dead Stock*, so those are the chips; they behave exactly like that dropdown (one at a time on the phone).
2. **Name on the row = sub-category.** The data has no product-name field, only SKU, category, sub-category.
3. **Tags:** "No COGS" for SKUs with no cost at all; **"Avg COGS"** for SKUs valued at the sub-category average (they are unmapped too, but they do have a value, so "No COGS" would be wrong).
4. **Header count:** the shared list header shows "All SKUs  964 SKUs" (title + live count), not "All SKUs · N".
5. **Export unmapped CSV** (laptop's ⬇ Unmapped button) is not on the phone: on the phone that menu item opens the list instead, as asked. The laptop button still exports.
6. DOI chip colours follow the mobile palette (`invStatus.js`): Excess grey, Sufficient green, Low amber, Critical red, No demand light grey.
7. The "Not valued" definition opens from the tile (a 44 px target) instead of a small ⓘ popover (28 px).

## The three things to check (reported, nothing changed)

### 1. "Unmapped COGS (N)" vs "M not valued"
**Unmapped COGS = every SKU without its own COGS row; Not valued = only those that also have no sub-category average, so their stock gets no ₹ value.** The difference is the SKUs valued at the sub-category average. It is not about having stock.
Today's local data: Unmapped 2,290 = 1,808 not valued + 482 at sub-category average. (Your earlier 759 / 567 differ by 192 the same way; the absolute numbers move with the data and the filter.)
Phone wording: subtitle says "M not valued"; the menu says "Unmapped COGS (N) · no own COGS"; the tile sheet explains both; the unmapped list shows "N SKUs without their own COGS (M not valued + K at sub-category average)"; rows are tagged "No COGS" / "Avg COGS".

### 2. "COGS as of 2026-10": actual or carried forward?
**Carried forward from September.** `product_cogs_monthly` (2,315 SKUs per month): Jun, Jul, Aug, Sep 2026 = `actual`; Oct 2026 and Nov 2026 = `carried_forward` from 2026-09-01. October's real COGS sheet is not loaded.
The label shows the latest calendar month the card asks for (the current month), not the month the cost was uploaded, so it reads "as of Nov 2026" today while the rates are September's. Suggested later fix (not done, to keep parity with the laptop): label it "COGS from Sep 2026 (carried forward)" using the `carriedFromMonth` the API already returns.

### 3. NavAI sync (CLAUDE.md rule): can NavAI answer questions about this card?
**Not reliably.** The card is computed in the browser: per SKU, stock (the Inventory Health file) × the SKU's latest-month COGS, else the sub-category average, else not valued. NavAI's knowledge has no description of that rule, so it cannot reproduce the card's totals.
Updates needed (report only, connector untouched):
- `frido-data-connector/knowledge/ENDPOINT_MAP.md`: add an "Inventory cost detail" section with the valuation rule above, the two sources (`inv-data-*` and `cogs-monthly`), the "not valued" vs "unmapped" definitions, and the carried-forward caveat (the card is only as current as the latest uploaded COGS month).
- Either a read-only tool like `cn_received` / `pnl` that runs the same arithmetic, or a documented recipe: today it would have to join two raw files by hand.
- `frido-data-connector/lib/pageAccess.js`: `cogs-monthly` is allowed only for `pnl:*` and `inventory:inward`. Someone with `inventory:cost` but no P&L access cannot get the COGS side. Add `inventory:cost` (and check `inv-data-*` is covered for them).
- `knowledge/repo-scope.json`: add `src/inventory/InventoryCostTable.jsx`.
- Test questions: total inventory value; number of SKUs not valued; top 5 SKUs by value; value of one category.
- Then a canary redeploy (connector changes need one).

## Checks run (Chromium and WebKit, 375 and 360 wide)

Script runs against the local app (`VITE_FEEDBACK_LOCAL=1`, test admin) with live data. For the card, the category sheet, the ⋯ menu, the full-screen list and the row sheet: no horizontal page scroll, every text at least 12 px, tap targets at least 44 px, chips not wrapped, nothing overlapping; plus behaviour (status chip filters, ⋯ menu items, Unmapped COGS opens the filtered list, search is focused, sort chips present, Total bar present and narrows with search, header stays fixed while the body scrolls, row sheet shows all ten fields, tap outside closes it, phone Back closes the list). **148 checks passed, 0 failed.**

One exception: the shared `BottomSheet` ✕ button is 36 × 36 px (all sheets in the app). I did not change it; swipe down, tap outside and Back also close every sheet.

### Phone numbers = laptop numbers (same filter, today's data)
| Check | Laptop 1280 | Phone 375 |
|---|---|---|
| SKUs | 4,536 | 4,536 |
| Total units | 10,22,188 | 10,22,188 |
| Total inventory value | ₹42.51 Cr | ₹42.51 Cr |
| Not valued SKUs | 1,808 | 1,808 |
| One SKU (FR-UCBU-B1): COGS/unit, inventory, avg sale, value, DOI | ₹429, 16,421, 185, ₹70,51,972, 75d | same |
| One category (Orthotics): SKUs, units, value | 224, 3,01,105, ₹7.19 Cr | same |
| COGS month label | 2026-11 | Nov 2026 |

### Laptop unchanged
1280 and 1536 screenshots before and after are **pixel-identical**, and the card's table text is byte-identical.

## Screenshots (`docs/inventory-cost-mobile/`)
- Before: `before_laptop_1280.png`, `before_laptop_1536.png`, `before_phone_chromium_375_card.png`
- After laptop: `after_laptop_1280.png`, `after_laptop_1536.png`
- After phone card: `after_phone_{chromium,webkit}_{375,360}_card.png`
- After phone views: `after_{chromium,webkit}_{375,360}_{category_sheet,menu,unmapped_list,full_list,row_sheet}.png`
- Table text used for the equality check: `{before,after}_laptop_{1280,1536}_table.txt`

## How to see it
`VITE_FEEDBACK_LOCAL=1 npx vite --port 5175` (needs the `VITE_SUPABASE_*` values from your `.env.local` in the environment, and the COGS endpoint on port 3001), then open `http://127.0.0.1:5175/inventory/inventory_health?as=admin` and narrow the window to phone width (or use the browser's phone mode).
