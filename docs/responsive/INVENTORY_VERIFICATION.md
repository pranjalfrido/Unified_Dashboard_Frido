# Inventory mobile — verification (step 10)

Branch `feature/responsive-inventory`, 26 Oct 2026. Local Vite + API; Chromium and WebKit (Playwright).
Screenshots are in `docs/responsive/after/inventory-*` (not committed); `report.json` files are.

## Results

| Step | Check | Result |
|---|---|---|
| 1 | Screens, Chromium, all viewports, both views | Done |
| 2 | Screens, WebKit: iPhone SE / 14 / 14 landscape | Done |
| 3 | Palette + text size (`check-palette`, `.inv-mobile`), Chromium + WebKit × iPhone 14 / SE × both views | PASS: 0 off-palette colours, 0 text under 12px (after the ink fix below) |
| 4 | Touch on the S&A master card (`check-touch`), Chromium + WebKit | PASS (9/9 each) |
| 5 | Tap-through (`check-inv-interact`): Chromium iPhone 14, SE, Pixel, small Android, 14 landscape, tablet 768; WebKit iPhone 14, SE, 14 landscape | ALL PASS on all 9. Full-screen SKU list opens in 450–650 ms |
| 6 | Numbers, mobile vs desktop on the same data (`check-inv-numbers`, `check-sa-numbers`, `check-inv-ageing`) | ALL MATCH (details below) |
| 7 | Laptop 1366, original code (45f9c91a) vs this branch, same data, back to back | Health 0.0094% (Snapshot clock only), S&A 0% |

## Step 6 detail

Inventory Health, static data path (the one production uses; `STATIC_INV=1`):
summary (Total 8.31L, RTD 1.62L, RAW 6.08L, Blocked RAW 61.0K, Avg sale B2C 11.6K, Total avg sale 16.2K,
DOI 51), all 7 warehouses (units · status · DOI · allocation), Stock explorer categories at All / PNQ / GGN
(11/11 each), status Critical (62 · 2,533 · 903) and Excess (727 · 5,16,421 · 3,227) — all match.

Sales & Allocation: Revenue ₹12.46Cr, Units 1.17L, ASP ₹1.1K, Fill rate 37%, Momentum −16%, Sales mix 92% B2C,
Avg ₹1.78Cr/day, sales vs allocation rows, channel and category contribution, top 10 products, biggest
movers, daily totals per category and grand total 1,17,268 — all match.

Ageing: Slow moving 155 of 156 rows, Dead stock 47 of 48 — the one Spare Parts row is hidden on laptop and
phone, nothing else missing or extra.

`baseline-numbers.json` (25 Oct, September range) has no Sales & Allocation entry and inventory is an hourly
snapshot, so today's stock cannot equal it; the like-for-like checks above (mobile vs desktop, and original
vs branch on the same data) are the number proof.

## Found and fixed during verification

- **S&A text colour** — location codes, sales/allocation figures and mover names inherited the desktop
  text colour `#16211D`. The mobile S&A container now sets the mobile ink `C.m.ink` (#1c2420). Mobile only.
- **Laptop capture** — Chromium's full-page screenshot briefly resizes the window to 1×1 px; the branch
  (correctly) switches to the mobile layout for that instant and the desktop chart re-mounts with its
  line animation frozen. `laptop-same.mjs` now grows the viewport to the page height at 1366 instead.
  Users never see this. With the fixed capture the S&A laptop diff is 0.
- **Local data note** — when the local `inv-data-7d.json` is older than 2 hours the page uses `/api/inventory`,
  which has no per-facility-type breakdown, so the desktop Location-wise table shows "—" for stock. Same on
  the original code. `STATIC_INV=1` on the check scripts serves the static file with only `asOf` moved to now.
- **Check script** — `check-sa-numbers` clicked an ambiguous "Category" tab; now scoped to the Contribution card.

## Regular facilities only (follow-up, 26 Oct)

Reported: the phone showed a DEL warehouse (Frido Store only). Cause: the live-API fallback
(`/api/inventory`, used when the hourly static file is over 2 hours old) never applied the Regular-only
rule that `scripts/generate-inv-cache.mjs` applies — DEL was listed and every total counted Frido Store /
Dark Store / Internal Store stock, on desktop and mobile alike. The static file was already correct.

Fix (approved): `api/inventory.js` now returns the same Regular split as the static file — per-SKU
`facilities` (with location), per-location `byFacilityType` with no-Regular locations dropped, and
`byFacilityType` per Location-table cell. Cache key bumped to `inv2|`. No query or metric changes.

Proof:
- Old vs new API code, same data, one process: summary, all 2,722 SKUs, ageing lists, status counts,
  lead-time risk, filter options, kept warehouse rows and Location table identical; only the new fields
  added and DEL dropped. New splits add up exactly to the existing totals.
- Mobile vs desktop on the API path: ALL MATCH — 7 warehouses (no DEL), PNQ 4.39L Regular (was 4.48L),
  total 8.38L = sum of the 7 Regular warehouses; Stock explorer All / PNQ / GGN 11/11.
- Static path re-checked: ALL MATCH, unchanged.
