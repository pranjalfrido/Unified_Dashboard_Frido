# Inventory Health: phone view of "Inventory cost"

Branch `feat/inventory-cost-mobile`. Design reference: `docs/responsive/mockups/inventory_cost_mobile_mockup.html`.
Phone = width up to 767 px (or a phone turned sideways). Layout only: the valuation logic is untouched (COGS rate, sub-category-average rule, DOI formula, status bands). Laptop is unchanged except the COGS label (round 2, item 2).

## Round 2 (this update)

**Rebase:** `git fetch` + rebase on `origin/main` (`eb994c0d`): clean, no conflicts.

### What changed
| Area | Now |
|---|---|
| Header (screen 1) | "Inventory cost" on the left; on the right a 36 × 36 🔍 and the Product / SKU toggle (the Inward `Seg` component, now shared from `src/inventory/Seg.jsx`; Inward looks the same). One line, vertically centred, nothing wraps. The ⋯ is gone from the card. Subtitle: "Top 10 of 280 products · by value" ("… SKUs …" in SKU view). Both the 🔍 and the toggle keep a 44 px tap area around the 36 / 30 px visual. |
| ⋯ menu | Moved into the full-screen list's header ⋯: *Export CSV* and *No COGS list (N)*. |
| COGS label (phone and laptop) | Shows the month the rates were really uploaded for: "ⓘ COGS rates: **Sep 2026, carried forward**" (amber) when the current month reuses an older month; plain "COGS rates: Nov 2026" when not. On the phone the ⓘ line opens a one-line explanation; on the laptop the ⓘ text has a hover tooltip. |
| Tiles | Inv. value ("at cost") · Units ("in stock", lakh format, e.g. 10.22 L) · **No COGS ⓘ** (amber: SKU count, and "SKUs · 52.6K u"). No border by default; labels on one line; the No COGS tile opens screen 4. |
| Product view (default) | One row per product = all SKUs with the same sub-category name. Row: name (2 lines) / "Category · N variants" / "₹/unit · N u · N/day"; right: value + DOI chip. Value, units, avg sale = sums; COGS/unit = value ÷ units; DOI = ⌊units ÷ avg sale⌋ ("No demand" when avg sale is 0); status chip uses the same bands as SKU status (Critical ≤ 2d, Low ≤ 15d, Sufficient ≤ 45d, else Excess) on the product's DOI. Status chips and Category filter work on products. Top 10, "View all N products →". |
| Product sheet (screen 2) | Name, "Category · N variants", 4 stat boxes (value, units, avg sale, DOI + coloured status chip), then every variant as a row (SKU, sub-category as the variant label, ₹/unit · u · /day, value, DOI chip, "Avg COGS" / "No COGS" tag). Tap a variant → the SKU detail sheet, where **Status is now a coloured chip**. |
| SKU view (screen 3) | Main line = SKU code (+ tag), second line = product name, third = "₹/unit · u · /day". The toggle choice is remembered on the device (`localStorage` key `frido.invCostView`). |
| No COGS (screen 4) | Tap the tile: "SKUs without their own COGS · In stock only · N SKUs", split into *Valued at sub-cat avg* (N SKUs, "included in ₹X") and *Not valued* (N SKUs, N units, "₹0 counted"), the "Why / Fix" note, then the not-valued SKUs by units (top 10, "View all N →", Export CSV for admins like the laptop's Unmapped button). |
| Full-screen list | Search (product name or any SKU code inside it), sort chips Value ↓ · Units · DOI · Avg sale (SKU view adds COGS/unit), status + Category chips, pinned green total bar, header ⋯ menu. |

Files: `src/inventory/mobile/InventoryCostMobile.jsx` (rewritten), `src/inventory/costGroup.js` (new: product roll-up, totals, COGS label text), `src/inventory/Seg.jsx` (new, moved from Inward, `hit44` opt-in), `src/inventory/InventoryCostTable.jsx` (laptop note label; `valueRow` shared by laptop rows and phone; month the rates come from), `src/inventory/InwardPage.jsx` (imports `Seg`), `src/responsive/FullScreenList.jsx` (opt-in `menu` prop added to round 1's opt-ins).

### 4,536 SKUs vs 2,945: why, and the count check
**Cause: the laptop card (unchanged code) lists every SKU row, including SKUs with zero stock, and the round-1 phone card copied that.** With today's local data: 4,536 rows = **2,500 with stock + 2,036 with zero stock**. Zero-stock rows add nothing to value or units but inflate the SKU counts and the "missing COGS" counts.

| | Laptop card as it is | Phone now (stock > 0 only) |
|---|---|---|
| SKUs | 4,536 | 2,500 (SKU view) |
| Not valued (no own COGS and no sub-category average) | 1,808 | **288** |
| Unmapped COGS (not valued + valued at sub-cat avg) | 2,290 | **449** = 288 + 161 |
| Inventory value / units | ₹42.51 Cr / 10,22,188 | same (zero-stock rows add 0) |

So the phone's tile = its "Not valued" number = 288, and "Valued at sub-cat avg 161" + "Not valued 288" = "In stock only · 449 SKUs": the three agree with each other and with the laptop table filtered to units > 0 (checked row by row below). I could **not** reproduce your 2,945 / 567 / 759 from the data available here (most likely a different day's snapshot: the COGS month has since rolled to Nov and the stock list changed); in this data the laptop shows 4,536 / 1,808 / 2,290. The laptop label "N not valued" still counts zero-stock SKUs; making the laptop count only SKUs with stock would be a one-line change but it would change the laptop view, so I left it. Say if you want it.

### Checks (Chromium and WebKit, 375 and 360)
- **216 checks passed, 0 failed:** header on one line and centred; no truncated tile labels; no wrapped chips or toggle text; no horizontal scroll; text ≥ 12 px; tap targets ≥ 44 px; nothing overlapping; for the card (both views), product sheet, SKU sheet, No COGS sheet, full list and ⋯ menu. Plus behaviour: status chip filters products; search by a variant SKU code finds its product; list header ⋯ has Export CSV + No COGS list; the phone Back button closes lists and sheets; toggle remembered after reload.
- **Exception:** the shared sheet ✕ button is 36 × 36 (allowed).
- **Phone = laptop for the same filter (18 of 18 equal):** total value ₹42.51 Cr; units 10.22 L; not valued 288 (laptop rows with stock) and 52.6K units; unmapped in stock 449 = 288 + 161; one product (Ultimate Car Backrest Cushion, 2 variants): value ₹78,13,814 vs laptop sum ₹78,13,813 (the laptop rounds each row), units 18,195, avg sale 227, DOI 80d; one SKU (FR-UCBU-B1): COGS ₹429, 16,421 units, avg 185, value ₹70,51,972, DOI 75d. **Product view totals = SKU view totals** (all three tiles identical).
- **Laptop 1280 / 1536:** table text unchanged; the screenshots differ only inside the one-line note under the title (the new COGS label), nothing else (pixel diff region 328 × 13 px).
- **Local test login:** `?as=admin` only works under `vite` dev: `LOCAL_MODE = import.meta.env.DEV && VITE_FEEDBACK_LOCAL === '1'`, and `DEV` is false in every build. I built production with `VITE_FEEDBACK_LOCAL=1` set (worst case) and found none of its code in the bundle (`admin@local.test`, "Local test mode", `fb_local_as`: 0 hits); `?as=admin` showed the normal sign-in page and set nothing in `sessionStorage`. I did not touch the LOCAL_MODE files.

### Choices where the brief was open
1. "included in ₹X" shows what the sub-cat-average SKUs add to the value (₹X), not the whole total (the mockup shows the total in its sample).
2. The variant label in the product sheet is the sub-category (the data has no colour / size field).
3. Status filter in Product view: a product matches by its own DOI status; "Slow Moving" / "Dead Stock" match when any variant is on that list.
4. DOI chips follow the mockup colours (Excess blue, Sufficient green, Low amber, Critical red, No demand grey), as the mockup shows.
5. Export CSV on the list exports the SKU rows in scope (laptop columns); the not-valued export in the sheet is admin-only like the laptop's Unmapped button.

### NavAI sync (CLAUDE.md rule), still open
The card is browser-computed (stock × latest COGS, else sub-category average, else not valued) and is not in NavAI's knowledge, so NavAI can't answer "inventory value" or "SKUs without COGS" reliably. It also needs the new definitions: **only SKUs with stock count on the phone card**, and "COGS rates: Sep 2026, carried forward". To do (connector, not changed here): `ENDPOINT_MAP.md` section for Inventory cost; a read-only tool or documented recipe; `pageAccess.js` `cogs-monthly` allow `inventory:cost`; `repo-scope.json` add `InventoryCostTable.jsx`; test questions; canary redeploy.

## Screenshots (`docs/inventory-cost-mobile/`)
Round 2, per browser and width (`r2_{chromium,webkit}_{375,360}_…`):
- screen 1 `…_1_card_product.png` · screen 2 `…_2_product_sheet.png` (+ `…_2b_sku_sheet.png`) · screen 3 `…_3_card_sku.png` · screen 4 `…_4_nocogs_sheet.png` (+ `…_4b_nocogs_list.png`)
- full list `…_5_full_list_products.png` · list header menu `…_5b_list_menu.png`
- Laptop: `before_laptop_{1280,1536}.png`, `r2_laptop_{1280,1536}.png` (+ `_table.txt`)
- Round 1 phone card before: `before_phone_chromium_375_card.png`

## Round 1 (kept for reference)
Phone card with 🔍 and ⋯, summary tiles, status chips, SKU rows, full-screen list with sort chips and a total bar, SKU detail sheet, category sheet. Opt-in additions to shared components: `FullScreenList` (`renderRow`, `extraControls`, `footer`, `tallChips`), `ActionMenu` (`size`). Round-1 answers: *Unmapped COGS vs not valued* = every SKU without its own COGS vs only those also without a sub-category average (now explained inside the phone sheet); *COGS "as of"* = the Sep 2026 sheet carried forward (Jun–Sep actual; Oct and Nov carried), which is what the new label now says.

## How to see it
`VITE_FEEDBACK_LOCAL=1 npx vite --port 5175` (the `VITE_SUPABASE_*` values in the environment, and a read-only COGS endpoint on port 3001), then open `http://127.0.0.1:5175/inventory/inventory_health?as=admin` at phone width.
