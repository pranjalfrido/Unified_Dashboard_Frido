# Logistics mobile — verification

Branch `feature/responsive-logistics`, 26 Oct 2026. Local Vite + API; Chromium and WebKit (Playwright).
Screenshots are in `docs/responsive/after/logistics-*` (not committed); `report.json` files are.

## Data paths used
| Check | Path |
|---|---|
| Performance, default range (1–25 Oct) | static file `logistics-data*.json` (1.5 h old, accepted ≤ 7 h) |
| Performance, Sept 2026 | live `/api/logistics` (BigQuery) |
| Cost, all sub-tabs | static file `logistics-cost-data.json` (1.4 h old, accepted ≤ 48 h) |

Desktop and mobile read the same data in every comparison.

## Results
| Step | Check | Result |
|---|---|---|
| Numbers | Performance mobile vs desktop (`check-log-perf-numbers.mjs`): default, Reverse, Bluedart only, Sept 2026 — KPI tiles (value + ▲/▼), scorecard rows, 4 TAT tables (+ totals), weight, geography, RTO counts, NDR | ALL MATCH (4 scenarios) |
| Numbers | Cost mobile vs desktop (`check-log-cost-numbers.mjs`), each tab at its default months — tiles, hero + ▲/▼, partners, couriers, zone / leg, rate-card bands, billed slabs, drift, product categories, like-for-like, transporters, vehicle types, freight types, 3PL sites | ALL MATCH (4 sub-tabs) |
| Month picker | Old dropdown (commit 9a0667c9: bug fixes, before the picker) vs new picker, laptop, every sub-tab: Latest · Last 3M · All · Apr + Jun + Sep (`check-log-month-picker.mjs`) | 16 / 16 identical (content text under the toolbar) |
| Design | Palette + text size (`check-palette.mjs`), Chromium + WebKit × iPhone 14 / SE × Performance + 4 Cost tabs | 0 off-palette colours, 0 text under 12px |
| Design | Touch (`check-touch.mjs`, Performance master card), Chromium + WebKit | ALL PASS (scrub, no resize, sheet fits, safe areas) |
| Tap-through | `check-log-interact.mjs`: iPhone SE, iPhone 14, Pixel, iPad (Chromium) + iPhone 14 (WebKit), incl. finger scrolling on both pages | ALL PASS on all 5 |
| Laptop 1366 | Original main (8f324928) vs branch, scrollbars hidden in both | Performance: only the Z-RTO badge colour (fix 5c). Cost: the toolbar (new month pill) + 468 px on two trend lines that differ by ≤ 3/255 in colour (chart paths, dots and axis labels identical) |
| Other pages | Phone (iPhone 14) Overview, Sales, Inventory Health, Inventory S&A vs main | 0 px on the back-to-back run (a first Overview run differed only by the live "Updated" time). After this, the heading size fix changes Inventory's title (14 → 17px, same as Overview / Sales) |

## Fixed in this branch (own commits)
- 5a `526bd61f` Cost "All" months: FTL/PTL and 3PL totals now follow the selection (Overview and the 3PL tab).
- 5b `f438c91c` Performance top-bar Refresh reloads Logistics, not Sales.
- 5c `cf916c66` Z-RTO ▲/▼: a rise shows red.
- 5d `3dfa23df` 3PL badge reads "vs Aug" on mobile.
- Scrollbars light Frido green (`2e7c8fd2`).
- Found during checks: the Performance phone view did not scroll by finger (`b5c471ae`, its own scroll container; the tap-through now checks finger scrolling on both pages).
- On request during review: no line under the "Logistics" title on Performance or Cost; one page-title size (17px) on every phone header.
