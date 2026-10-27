# Mobile headers: Ivory — report

Branch `feature/responsive-profile`. Prompt: `HEADER_MOBILE_PROMPT.md`. Mockup: `mockups/header_mockup.html` (final Ivory).
Layout only: same data, filters and routes. Laptop unchanged. Login keeps its green band; bottom sheets keep their own sheet header.

## 0. "Filtered" strip with nothing filtered

**Where the default came from:** opening Sales → D2C → Overall (or a link to `/sales/shopify/overall`) sets
`filters.subChannel = 'ShopifyIndia'` through `d2cSubChannelFromUrl` in `src/App.jsx`. That is how the D2C
"Overall" sub-tab is selected (it means "all Indian D2C stores"), not a filter the user picked. `filters` is shared
across pages, so Overview's filter icon and "Filtered:" strip (both built from `activeSalesFilters()` in
`src/overview/salesFilters.js`) counted it as one active filter: "Sub-channel: ShopifyIndia ✕ Clear" and a "1".
The P&L page cache already treated `ShopifyIndia` as "no filter".

**Fix:** `SALES_FILTERS` now gives each filter its default (`subChannel: ShopifyIndia`), and `activeSalesFilters()`
/ `salesFilterCount()` leave default values out. Every page that shows the strip or a count uses those helpers (or,
for Inventory and Logistics, their own state that starts empty), so the rule holds everywhere: only filters that
differ from the page's default show. Checked: Overview with nothing filtered has no strip and no count, also after
opening D2C Overall; a Category filter shows strip + "1"; Clear removes both (`check-header-filters.mjs`, 12/12).

## 1. Every phone screen in the code

All phone screens come from `Topnav` (src/App.jsx) or a full-screen view; each now renders the one shared
`src/responsive/MobilePageHeader.jsx`. Rows: 1 = title · context · date · filter · ⋯, 2 = chips, 3 = sub-tabs, 3b = second sub-tab row.

| Screen (route) | Row 1 | Row 2 chips | Row 3 / 3b |
|---|---|---|---|
| Overview `/overview` | Overview · date · filter (only while a Sales filter is set) · ⋯ | — | — |
| Sales `/sales/<channel>` | Sales · channel · date · filter · ⋯ | Overall, D2C, EBO, Amazon, Flipkart, Blinkit, CRED, Firstcry, Instamart, Zepto, Myntra, International, Offline Sales | D2C: Overall / MyFrido / Mobility · Amazon: Overall / Seller Central / Vendor Central · Offline: Overall / B2B / Stockist / MT GT / Miscellaneous |
| Sales → Return analysis `/sales/shopify/return_analysis` | ‹ D2C · Return analysis · D2C · date · filter · ⋯ | — | — |
| P&L `/pnl/<channel>` | P&L · channel · date · ⋯ | 13 channels, amber dot = in progress (Overall, EBO, Myntra, International) | as Sales (Offline: … / Misc) |
| P&L tools: Price Simulator, Breakeven ROAS (D2C), B2B Costing, PO Approval (Offline) | ‹ · tool title · D2C / Offline · ⋯ (Reset when the tool has one) | — | — |
| P&L → Store P&L (full screen) | ‹ · Store P&L · n stores | — | — |
| Inventory `/inventory/...` | Inventory · date (Sales & Allocation only) · filter · ⋯ | — | Inventory Health / Sales & Allocation |
| Logistics Performance `/logistics/performance_analytics` | Logistics · date · filter · ⋯ | — | Performance / Cost |
| Logistics Cost `/logistics/cost_analytics` | Logistics · month pill · filter · ⋯ | — | Performance / Cost; 3b Overview / B2C / FTL/PTL / 3PL |
| Courier Allocation `/logistics/courier_allocation` | ‹ Logistics cost · Courier Allocation · ⋯ | — | — |
| Ads `/ads` | Ads · channel · date · ⋯ | Overall, D2C, Amazon, Flipkart, Myntra, Blinkit, Zepto, Instamart, CRED | — |
| Customers Intelligence `/customer` | Customers · date · ⋯ | — | Intelligence / Support; 3b Overview / Acquisition / Retention / Behaviour / Segments / Discounts |
| Customers Support `/customer-support` | Customers · date · ⋯ | — | Intelligence / Support (Daily / Weekly / Monthly stays in the page) |
| Profile `/profile` | Profile · ⋯ (Notifications, Theme, Sign out) | — | — |
| Profile → Team members, Member page (full screen) | ‹ · Team members (+ Add) / member name | — | — |
| Documents `/documents` | Documents · ⋯ | — | — |
| Frido Pulse `/ask` | Frido Pulse · ⋯ (the history panel's own "Frido Pulse" title is hidden on phones) | — | — |
| COGS Ledger, Logistics Bill Ledger, Purchase Ledger, Packaging BOM | ‹ Documents · title · ⋯ | — | — |
| Financial MIS `/financial-mis` | ‹ Sales · Financial MIS · date · ⋯ | — | — |
| Intelligence `/intelligence` (not in the navigation) | Intelligence · date · ⋯ | — | — |
| Full-screen lists ("Show all …", FullScreenList) | ‹ · title · n items | — | search and sort chips stay under the header |
| Full-screen tables / heatmaps (FullScreenTable: cohort, cross-sell, contact heatmap, pending tickets, TTR) | ‹ · title · n rows | — | note line under the header |
| Full-screen chart (ChartFrame) | ‹ · chart title | — | — |
| Login `/login` | unchanged (green band) | — | — |
| Bottom sheets (filters, ⋯ menus, date range, notifications) | unchanged: own sheet header (title + ✕) | — | — |

## 2. What changed

- **One header** (`MobilePageHeader`): Ivory `#fbfaf7`, 1px `#eae7df` bottom line, title 17/650 ink, context 13/500 `#8a938e`.
  Controls are props (`date`, `filter`, `menu`, `notifications`), so the order date · filter · ⋯ is fixed in one place.
- **⋯** (`ActionMenu`, header tone): borderless icon, red 7px dot while there are alerts; its first item is
  "Notifications (n)", which opens the same alerts list as the laptop bell (now a bottom sheet, `AlertsSheet`).
  The separate bell and the second-row ⋯ (Sales D2C / Amazon / Offline, P&L D2C / Amazon / Offline) are gone; their actions are in the row-1 ⋯.
- **Filter icon**: one shared `HeaderFilterButton` (borderless, 16px, green 14px count) used by Overview, Sales, Inventory, Logistics.
- **Date pill**: the existing date picker's trigger, restyled in the header only: 32px mint `#eef5f0`, green 12.5/600, short form
  ("Sep 2026", "1–26 Oct", "28 Sep – 26 Oct") + chevron. The Logistics Cost month pill uses the same look.
- **Chips** 28px text chips, selected = green fill; **sub-tabs** 34px with a 2px green underline the label's width; second row 30px on `#f6f4ef`.
- **Collapse**: after ~80px of downward scroll the header folds to one 42px translucent bar ("Title · context · sub-tab", date, ⋯);
  scrolling up restores it. The scroll position moves by the height change in the same frame, so content does not jump; no animation with reduced motion.
  Short pages that can't scroll that far keep the full header.
- **Full-screen views** (lists, tables/heatmaps, chart, Store P&L, Profile sub-screens) use the same header with ‹ back.
- `theme-color` `#fbfaf7` on phones (`index.html`); `C.m.hdr` tokens in `src/utils.js`; `MOBILE_DESIGN_SYSTEM.md` §1–2 updated.

## 3. Choices made (least change)

- **Overview filter icon** shows only while a Sales filter is set (as before): Overview has no filters of its own.
- **Notifications on every page's ⋯**, not only where the bell was (Overview, Sales, Documents, tools): the mockup shows the dot on every page and the alerts are global.
- **Sub-tabs "evenly spread"** = `space-around` when ≤ 4 tabs (two tabs such as Performance / Cost sit in the two halves rather than at the far edges).
- **Filter count** text is 12px (mockup 9px) to keep the 12px minimum; the circle stays 14px.
- **Full-screen lists keep their search field** under the header instead of a search icon in row 1 (no behaviour change).
- **In-page back links** that some tools already had ("← Back to Documents" on COGS etc.) are left in the page content.
- **Return Analysis** on this branch has no "by qty / by revenue" caption (that lives on `feature/responsive-return-analysis`); the preview-all merge keeps that branch's caption as the context text.

## 4. Screens that couldn't be migrated

None. Every screen in §1 uses the shared header.

## 5. Verification

Scripts: `scripts/responsive/check-header.mjs` (every screen: heights expanded / collapsed, control order, one-line
title, header text ≥ 12px, no tap focus box, no sideways overflow, scroll up restores) and
`check-header-filters.mjs` (§0 strip / count / Clear, notifications). Logged in through the login page as a temporary
test user (created and deleted with the service key; nobody else's access touched).

**Measured header heights at 375px (Chromium), px.** Measured heights include the 1px bottom line and the 1px dividers between rows (48 → 49, 86 → 87, 120 → 122). "Before" is the old dark-green header. A collapsed value equal to the expanded one means the page is too short to scroll far enough to collapse.

| Screen | Before | After (expanded) | After (collapsed) | Target |
|---|---|---|---|---|
| overview | 46 | 49 | 43 | 48 |
| sales-Overall | 88 | 87 | 43 | 86 |
| sales-D2C | 132 | 122 | 43 | 120 |
| sales-EBO | 88 | 87 | 43 | 86 |
| sales-Amazon | 132 | 122 | 43 | 120 |
| sales-Flipkart | 88 | 87 | 43 | 86 |
| sales-Blinkit | 88 | 87 | 43 | 86 |
| sales-CRED | 88 | 87 | 43 | 86 |
| sales-Firstcry | 88 | 87 | 43 | 86 |
| sales-Instamart | 88 | 87 | 43 | 86 |
| sales-Zepto | 88 | 87 | 43 | 86 |
| sales-Myntra | 88 | 87 | 43 | 86 |
| sales-International | 88 | 87 | 87 | 86 |
| sales-Offline Sales | 132 | 122 | 43 | 120 |
| sales-D2C-MyFrido | 132 | 122 | 43 | 120 |
| sales-D2C-Mobility | 132 | 122 | 43 | 120 |
| sales-Amazon-SC | 132 | 122 | 43 | 120 |
| sales-Amazon-VC | 132 | 122 | 43 | 120 |
| sales-Offline-B2B | 132 | 122 | 43 | 120 |
| sales-Offline-Stockist | 132 | 122 | 43 | 120 |
| sales-Offline-MT GT | 132 | 122 | 43 | 120 |
| sales-Offline-Miscellaneous | 132 | 122 | 43 | 120 |
| sales-return-analysis | 88 | 49 | 43 | 48 |
| pnl-Overall | 88 | 87 | 43 | 86 |
| pnl-D2C | 132 | 122 | 43 | 120 |
| pnl-EBO | 88 | 87 | 43 | 86 |
| pnl-Amazon | 132 | 122 | 43 | 120 |
| pnl-Flipkart | 88 | 87 | 43 | 86 |
| pnl-Blinkit | 88 | 87 | 43 | 86 |
| pnl-CRED | 88 | 87 | 43 | 86 |
| pnl-Firstcry | 88 | 87 | 43 | 86 |
| pnl-Instamart | 88 | 87 | 43 | 86 |
| pnl-Zepto | 88 | 87 | 43 | 86 |
| pnl-Myntra | 88 | 87 | 43 | 86 |
| pnl-International | 88 | 87 | 43 | 86 |
| pnl-Offline | 132 | 122 | 43 | 120 |
| pnl-D2C-MyFrido | 132 | 122 | 43 | 120 |
| pnl-Amazon-VC | 132 | 122 | 43 | 120 |
| pnl-Offline-B2B | 132 | 122 | 43 | 120 |
| pnl-tool-price-simulator | 46 | 49 | 49 | 48 |
| pnl-tool-breakeven-roas | 46 | 49 | 43 | 48 |
| pnl-tool-b2b-costing | 46 | 49 | 49 | 48 |
| pnl-tool-po-approval | 46 | 49 | 49 | 48 |
| inventory-health | 74 | 84 | 43 | 48+34 |
| inventory-sales | 74 | 84 | 43 | 48+34 |
| logistics-performance | 74 | 84 | 43 | 48+34 |
| logistics-cost-Overview | 98 | 115 | 43 | 48+34+30 |
| logistics-cost-B2C | 98 | 115 | 43 | 48+34+30 |
| logistics-cost-FTLPTL | 98 | 115 | 43 | 48+34+30 |
| logistics-cost-3PL | 98 | 115 | 43 | 48+34+30 |
| ads-Overall | 88 | 87 | 43 | 86 |
| ads-D2C | 88 | 87 | 43 | 86 |
| ads-Amazon | 88 | 87 | 43 | 86 |
| ads-Flipkart | 88 | 87 | 43 | 86 |
| ads-Myntra | 88 | 87 | 43 | 86 |
| ads-Blinkit | 88 | 87 | 43 | 86 |
| ads-Zepto | 88 | 87 | 43 | 86 |
| ads-Instamart | 88 | 87 | 43 | 86 |
| ads-CRED | 88 | 87 | 43 | 86 |
| customers-Overview | 98 | 115 | 115 | 48+34+30 |
| customers-Acquisition | 98 | 115 | 43 | 48+34+30 |
| customers-Retention | 98 | 115 | 43 | 48+34+30 |
| customers-Behaviour | 98 | 115 | 43 | 48+34+30 |
| customers-Segments | 98 | 115 | 43 | 48+34+30 |
| customers-Discounts | 98 | 115 | 43 | 48+34+30 |
| customers-support | 74 | 84 | 43 | 48+34 |
| profile | 46 | 49 | 49 | 48 |
| profile-team | 56 | 49 | — (full-screen view) | 48 |
| profile-member | 56 | 49 | — (full-screen view) | 48 |
| documents | 46 | 49 | 43 | 48 |
| frido-pulse | 48 | 49 | 49 | 48 |
| cogs | 46 | 49 | 43 | 48 |
| logistics-ledger | 46 | 49 | 43 | 48 |
| purchase-ledger | 46 | 49 | 49 | 48 |
| packaging-bom | 46 | 49 | 49 | 48 |
| courier-allocation | 46 | 49 | 49 | 48 |
| financial-mis | 46 | 49 | 49 | 48 |
| full-list | 155 | 49 | — (full-screen view) | 48 |
| full-table | 101 | 49 | — (full-screen view) | 48 |

Runs:
- chromium-iphoneSE-375x667: 468/468 checks pass, 79 screens
- chromium-smallAndroid-360x800: 466/466 checks pass, 79 screens
- webkit-iphoneSE-375x667: 466/466 checks pass, 79 screens
- webkit-smallAndroid-360x800: 466/466 checks pass, 79 screens
- check-header-filters (Chromium 375): 12/12 (no strip / count unfiltered, strip + count with a filter, Clear, Notifications (n) first in ⋯ with the laptop bell's count, red dot, list opens).
- check-palette (Overview, Sales D2C, P&L Offline, Logistics Cost, Customers, Documents): 0 colours outside the palette, 0 text under 12px.
- Laptop (1440): Sales header unchanged.

Test-only flakes, re-run and passed: Ads Flipkart in WebKit 375 (chip tapped while data was still loading); Profile member page (the check's own focus test opened "+ Add" on the previous screen; it now taps ⋯ only).

Screenshots: `docs/responsive/after/header/<engine>-<viewport>__<screen>.png` (expanded) and `…--collapsed.png`;
before: `docs/responsive/before/header/` (local files: `docs/responsive/**/*.png` is git-ignored, as for every page). Examples:

| Screen | Before | After | Collapsed |
|---|---|---|---|
| Overview | ![](before/header/chromium-iphoneSE-375x667__overview.png) | ![](after/header/chromium-iphoneSE-375x667__overview.png) | ![](after/header/chromium-iphoneSE-375x667__overview--collapsed.png) |
| Sales D2C | ![](before/header/chromium-iphoneSE-375x667__sales-D2C.png) | ![](after/header/chromium-iphoneSE-375x667__sales-D2C.png) | ![](after/header/chromium-iphoneSE-375x667__sales-D2C--collapsed.png) |
| P&L D2C | ![](before/header/chromium-iphoneSE-375x667__pnl-D2C.png) | ![](after/header/chromium-iphoneSE-375x667__pnl-D2C.png) | ![](after/header/chromium-iphoneSE-375x667__pnl-D2C--collapsed.png) |
| P&L Price Simulator | ![](before/header/chromium-iphoneSE-375x667__pnl-tool-price-simulator.png) | ![](after/header/chromium-iphoneSE-375x667__pnl-tool-price-simulator.png) | — |
| Return analysis | ![](before/header/chromium-iphoneSE-375x667__sales-return-analysis.png) | ![](after/header/chromium-iphoneSE-375x667__sales-return-analysis.png) | ![](after/header/chromium-iphoneSE-375x667__sales-return-analysis--collapsed.png) |
| Inventory | ![](before/header/chromium-iphoneSE-375x667__inventory-health.png) | ![](after/header/chromium-iphoneSE-375x667__inventory-health.png) | ![](after/header/chromium-iphoneSE-375x667__inventory-health--collapsed.png) |
| Logistics Cost · B2C | ![](before/header/chromium-iphoneSE-375x667__logistics-cost-B2C.png) | ![](after/header/chromium-iphoneSE-375x667__logistics-cost-B2C.png) | ![](after/header/chromium-iphoneSE-375x667__logistics-cost-B2C--collapsed.png) |
| Ads Amazon | ![](before/header/chromium-iphoneSE-375x667__ads-Amazon.png) | ![](after/header/chromium-iphoneSE-375x667__ads-Amazon.png) | ![](after/header/chromium-iphoneSE-375x667__ads-Amazon--collapsed.png) |
| Customers Retention | ![](before/header/chromium-iphoneSE-375x667__customers-Retention.png) | ![](after/header/chromium-iphoneSE-375x667__customers-Retention.png) | ![](after/header/chromium-iphoneSE-375x667__customers-Retention--collapsed.png) |
| Profile → Team members | ![](before/header/chromium-iphoneSE-375x667__profile-team.png) | ![](after/header/chromium-iphoneSE-375x667__profile-team.png) | — |
| Documents | ![](before/header/chromium-iphoneSE-375x667__documents.png) | ![](after/header/chromium-iphoneSE-375x667__documents.png) | ![](after/header/chromium-iphoneSE-375x667__documents--collapsed.png) |
| Frido Pulse | ![](before/header/chromium-iphoneSE-375x667__frido-pulse.png) | ![](after/header/chromium-iphoneSE-375x667__frido-pulse.png) | — |
| COGS Ledger | ![](before/header/chromium-iphoneSE-375x667__cogs.png) | ![](after/header/chromium-iphoneSE-375x667__cogs.png) | ![](after/header/chromium-iphoneSE-375x667__cogs--collapsed.png) |
| Full-screen list | ![](before/header/chromium-iphoneSE-375x667__full-list.png) | ![](after/header/chromium-iphoneSE-375x667__full-list.png) | — |
| Full-screen heatmap | ![](before/header/chromium-iphoneSE-375x667__full-table.png) | ![](after/header/chromium-iphoneSE-375x667__full-table.png) | — |
| Overview, filtered | — | ![](after/header/chromium-iphoneSE-375x667__overview-filtered.png) | — |
| ⋯ menu / notifications | — | ![](after/header/chromium-iphoneSE-375x667__menu-notifications.png) | ![](after/header/chromium-iphoneSE-375x667__notifications.png) |

## Update 27 Oct: one fixed height, no collapse

Collapse on scroll removed. The header is sticky with one fixed height (former collapsed look, 15px title, translucent Ivory with blur + shadow, inset-shadow dividers): row 1 48px, chips row 36px (26px chips), sub-tabs 32px, second sub-tab row 30px. Icon tap targets 44×44. Bottom bar 48px + safe-area inset; selected tile 34×30, icons 20px.

Measured (header top / after scrolling · bottom bar), identical in Chromium + WebKit at 375 and 360: Overview 48/48 · 48, Sales Overall 84/84 · 48, Sales D2C 116/116 · 48, Logistics Cost 110/110 · 48, Customers 110/110 · 48 (check-header.mjs, 49/49 per run).

## Update 27 Oct: deep green header (C1)

Branch `feature/header-green` from `main` (PR #28 was already merged). Prompt `HEADER_GREEN_PROMPT.md`, mockup
`mockups/header_green_mockup.html`. Display only: same data, filters and routes; structure, heights and control order unchanged.

**What changed**
- `MobilePageHeader`: rows 1–3b sit in a new `.mph-bar` with the green gradient and shadow, so the "Filtered:" strip
  stays light under it. White 17/650 title, `#a9c9b6` context, `#d8e8de` icons, white-fill selected chip (no ring),
  sub-tab bands `rgba(0,0,0,.08)` / `.14` with white active label + mint underline, mint filter count, red dot with a green ring.
- Date pill: translucent white, 5px gap, a 9×6 SVG chevron (stroke 1.6, 70%) centred with the text (App.jsx date
  trigger and the Logistics Cost month pill; the chevron is hidden on laptop as before).
- Bottom bar: `#fbfaf7`, hairline + soft shadow on top instead of the 1px border; selected tile unchanged.
- `theme-color` on phones `#1a4d34`. Profile "+ Add" on the green header: translucent white, white text.
- Tokens: `C.m.hdr` (green header) and `C.m.nav` (bottom bar) in `src/utils.js`; `MOBILE_DESIGN_SYSTEM.md` updated.
- Not changed: bottom sheets, the launcher, login, laptop, master cards (12px under the header already).

**One deviation:** inactive chip text is `#c8dfd1`, not the mockup's `#b9d4c4`. On the light end of the gradient
(`#266b49`) `#b9d4c4` measures 4.05:1, below the 4.5:1 the prompt asks for; `#c8dfd1` measures 4.55:1 there and
looks the same at a glance.

**Verification** (`check-header.mjs`, now also checking contrast, selected-chip ring and chevron centring), 19 screens:
Sales Overall / D2C (+ MyFrido, Mobility) / Amazon (+ SC, VC), Return analysis, P&L D2C (+ MyFrido), Price Simulator,
Inventory Health, Logistics Cost (2 sub-tab rows), Ads, Customers Intelligence, Profile, Team members, member page,
full-screen list.

| Engine · width | Checks | Lowest contrast (title, chips, active tab) |
|---|---|---|
| Chromium 375 | 175/175 | 4.55 (inactive chip, right edge) |
| Chromium 360 | 175/175 | 4.55 |
| WebKit 375 | 175/175 | 4.55 |
| WebKit 360 | 175/175 | 4.55 |

Heights unchanged (48 / 80 / 84 / 110 / 116 and bar 48, the same after scrolling); chevron centred (≤ 1px); no ring on
the selected chip; no tap focus box; no sideways overflow. Laptop 1366: no `.mph-bar`, no visible chevron, phone
`theme-color` not applied. Build passes; lint unchanged against `main`.

**Screenshots** (local, not committed; `docs/responsive/**/*.png` is ignored):
- Before / after header: `docs/responsive/before/header/chromium-iphoneSE-375x667__<screen>.png` and
  `docs/responsive/after/header/<engine>-<viewport>__<screen>.png` (plus `--scrolled`).
- Full screens (375, 2×): `docs/responsive/after/header-green/green-sales-d2c.png`, `green-sales-filtered.png`
  (filter count + strip), `green-logistics-cost.png`, `green-pnl-tool.png`, `green-customers.png`, `green-full-list.png`.
