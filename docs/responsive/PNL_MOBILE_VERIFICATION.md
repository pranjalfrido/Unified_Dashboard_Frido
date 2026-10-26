# P&L Phase 2: verification (PNL_MASTER_PLAN.md Part B §10)

Branch `feature/responsive-pnl`, local build. Data path: page default range **1–26 Oct 2026, live API (/api/bq)**, previous period 5–30 Sep from the same API (the hidden summary-only P&L, session cache). Device screenshots and the laptop before/after use **September 2026** (static job file `pnl-data-lastmonth.json`), the same as every earlier page.

Note on EBO stores locally: this machine's API server has no `SUPABASE_SECRET_KEY`, so live EBO store rows are empty here (laptop and mobile alike). The store list and full store table were checked on September (static file, 29 stores) and work on Vercel, which has the key.

## Summary

| Check | Result |
|---|---|
| 1. Rule check: every flagged product re-derived from the displayed numbers (D2C, Amazon Overall + SC, Flipkart, Blinkit, CRED, Offline, EBO), 5 random clear products each | ✓ all flags correct on all 8 views (1 product at a rounding edge on Amazon, ≈) |
| 2. Watchlist totals = Σ listed products (count and ₹, every rule, every view) | ✓ 53 rules on 8 views, all equal (incl. 7 "all clear" rules) |
| 3. Previous period: Σ per-product gross / units / returns = card previous totals, every tab and sub-tab | ✓ 20 of 20 views exact |
| 4. Mobile = laptop (cards ↔ tiles, watchlist counts, top 8 products), 17 tabs / sub-tabs | ✓ all same |
| 5. Laptop 1366 / 1280: before vs after | ✓ changes start at the new watchlist; table fits (no cut-off cells, no sideways scroll) at 1366 and 1280 |
| 6. Tap-through, Chromium (iPhone 14) | ✓ 22 of 22, incl. a real finger swipe (CDP touch) |
| 7. Tap-through, WebKit (iPhone 14 profile) | ✓ 21 of 21 + pan check (Playwright can't swipe on mobile WebKit) |
| 8. Device screenshots SE / 14 / Pixel / small Android / landscape / iPad portrait (D2C, EBO, Offline, CRED, Overall) | ✓ 30 captures: no horizontal overflow, nothing clipped, no errors |
| 9. Production build | ✓ `vite build` passes |

## 1. Rule check

Run 2026-10-26T19:54 on the local build of feature/responsive-pnl. Range = the page default (1–26 Oct 2026), loaded from the live API (/api/bq); previous period 5–30 Sep from the same API (session cache). Every number below is read from the rendered laptop Financial View and watchlist, then each flag is re-derived from those displayed numbers and the bars in src/config/metricTargets.js.

### D2C

Bars (D2C): CM1 < 30% · COGS > 50% · GM < 50% · Returns > 20% · CM2 target 15% · ASP down > 5% · Returns up > 3 pts. Materiality: ≥ 1% of gross (₹26.99 L) or ≥ 50 units.

Watchlist header: "8 of 8 rules triggered · 128 products · 84 small products not checked". Products in the table: 237 · checked (material): 153 · flagged: 128. Result: **all flags correct**.

| Rule | Tile count | Rows with the flag | Tile ₹ | Σ of listed products (re-derived) | OK |
|---|---|---|---|---|---|
| Loss after ads | 42 | 42 | ₹-43.38 L | ₹-43.31 L | ✓ |
| Below healthy ROAS | 51 | 51 | ₹-59.74 L | ₹-59.64 L | ✓ |
| CM1 < 30% | 42 | 42 | ₹-36.99 L | ₹-36.98 L | ✓ |
| Returns > 20% | 58 | 58 | ₹-163.00 L | ₹-163.39 L | ✓ |
| COGS > 50% | 32 | 32 | ₹-21.53 L | ₹-21.56 L | ✓ |
| GM < 50% | 32 | 32 | ₹-21.53 L | ₹-21.56 L | ✓ |
| ASP down > 5% | 63 | 63 | ₹-187.00 L | ₹-187.52 L | ✓ |
| Returns up > 3 pts | 11 | 11 | ₹-8.02 L | ₹-8.01 L | ✓ |

<details><summary>Every flagged product</summary>

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ROAS / BE | ASP (prev) | Flags shown | Re-derived | OK |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Orthotics Posture Corrector | ₹159.00 L | 27582 | 18.6 (18.7) | 28.2 | 71.8 | 49.3 | 18.4 | 3.97 / 2.49 | 577 (609) | asp | asp | ✓ |
| Cloud Comfort Arch Support Slippers | ₹131.00 L | 15675 | 13.4 (14.2) | 39.6 | 60.4 | 39.3 | 2.3 | 3.12 / 2.94 | 836 (886) | asp, thin | thin, asp | ✓ |
| Orthotics Heel Protector | ₹128.00 L | 16534 | 10.0 (10.8) | 44.1 | 55.9 | 41.0 | -3.0 | 2.52 / 2.71 | 775 (821) | loss, asp | loss, asp | ✓ |
| ErgoLuxe Executive Chair | ₹104.00 L | 334 | 14.2 (12.5) | 50.9 | 49.1 | 31.2 | 7.2 | 4.85 / 3.73 | 31139 (33268) | cogs, gm, asp, thin | thin, cogs, gm, asp | ✓ |
| Men's Comfort Dual Strap Sandals | ₹95.14 L | 4809 | 20.8 (21.4) | 41.1 | 58.9 | 45.3 | 0.3 | 2.8 / 2.79 | 1978 (2215) | ret, asp, thin | thin, ret, asp | ✓ |
| Ultimate Mattress Topper - Standard cover | ₹79.22 L | 1186 | 18.4 (19.5) | 45.3 | 54.7 | 31.9 | -2.3 | 3.58 / 3.84 | 6679 (6983) | loss | loss | ✓ |
| Adjustable Wedge Max Cushion | ₹75.94 L | 2261 | 15.7 (19.0) | 57.2 | 42.8 | 25.1 | -10.2 | 3.35 / 4.72 | 3359 (3523) | loss, cm1, cogs, gm | loss, cm1, cogs, gm | ✓ |
| Women's Arch Comfort Sandals | ₹62.39 L | 3233 | 23.7 (24.1) | 36.8 | 63.2 | 51.2 | 20.9 | 4.31 / 2.55 | 1930 (2102) | ret, asp | ret, asp | ✓ |
| Ultimate Car Backrest Cushion | ₹53.43 L | 4863 | 16.4 (19.9) | 46.1 | 53.9 | 24.8 | 7.1 | 6.76 / 4.83 | 1099 (1119) | cm1, thin | thin, cm1 | ✓ |
| Ultimate Deep Sleep Pillow | ₹52.50 L | 3700 | 18.4 (18.8) | 54.3 | 45.7 | 17.3 | -7.9 | 4.85 / 7.06 | 1419 (1582) | loss, cm1, cogs, gm, asp | loss, cm1, cogs, gm, asp | ✓ |
| Ultimate Car Wedge Seat Cushion | ₹47.41 L | 4337 | 16.6 (20.3) | 38.5 | 61.5 | 29.5 | 11.2 | 6.56 / 4.06 | 1093 (1126) | cm1, thin | thin, cm1 | ✓ |
| Orthopaedic Heating Belt | ₹46.53 L | 1970 | 11.7 (11.1) | 39.0 | 61.0 | 52.5 | 3.3 | 2.3 / 2.16 | 2362 (2451) | thin | thin | ✓ |
| Travel Neck Pillow | ₹44.46 L | 4093 | 12.2 (13.0) | 48.7 | 51.3 | 34.5 | 14.3 | 5.64 / 3.3 | 1086 (1413) | asp, thin | thin, asp | ✓ |
| Mobility Transfer Lift | ₹42.14 L | 132 | 21.9 (26.3) | 42.0 | 58.0 | 44.8 | 18.0 | 4.78 / 2.86 | 31924 (32277) | ret | ret | ✓ |
| Lumbo Sacral Belt | ₹41.90 L | 3196 | 18.2 (19.7) | 38.4 | 61.6 | 50.0 | -5.2 | 2.21 / 2.44 | 1311 (1526) | loss, asp | loss, asp | ✓ |
| 3D Posture Plus Ergonomic Chair | ₹39.99 L | 241 | 22.8 (14.4) | 60.5 | 39.5 | 7.6 | -12.6 | 6.4 / 17.12 | 16591 (19505) | loss, cm1, cogs, gm, ret, retup, asp | loss, cm1, cogs, gm, ret, retup, asp | ✓ |
| Arch Comfort Slides | ₹38.10 L | 3001 | 20.1 (22.1) | 35.5 | 64.5 | 42.6 | 5.1 | 3.33 / 2.93 | 1270 (1289) | ret, thin | thin, ret | ✓ |
| Orthotics Posture Corrector Seat | ₹36.75 L | 1369 | 16.6 (16.9) | 34.3 | 65.7 | 41.7 | 11.5 | 3.97 / 2.87 | 2684 (2726) | thin | thin | ✓ |
| Ultimate Wedge Plus Cushion | ₹34.79 L | 1942 | 14.5 (15.2) | 40.7 | 59.3 | 37.0 | 6.9 | 3.88 / 3.16 | 1791 (2163) | asp, thin | thin, asp | ✓ |
| Arch Support Insoles | ₹29.11 L | 2213 | 12.6 (14.7) | 26.0 | 74.0 | 62.4 | 14.0 | 2.36 / 1.83 | 1315 (1309) | thin | thin | ✓ |
| Ultimate Cozy Pillow | ₹29.08 L | 4970 | 14.2 (14.4) | 43.5 | 56.5 | 10.2 | -3.3 | 8.64 / 11.41 | 585 (658) | loss, cm1, asp | loss, cm1, asp | ✓ |
| Cold & Hot Therapy Cap | ₹25.07 L | 1900 | 13.0 (15.2) | 28.3 | 71.7 | 62.0 | 8.0 | 2.13 / 1.85 | 1319 (1532) | asp, thin | thin, asp | ✓ |
| Men's Cloud Comfort Sandal | ₹24.87 L | 1244 | 22.4 (22.4) | 38.6 | 61.4 | 47.3 | -4.2 | 2.5 / 2.72 | 2000 (2201) | loss, ret, asp | loss, ret, asp | ✓ |
| Active Casual Sneakers - Women's | ₹24.62 L | 961 | 33.4 (33.6) | 48.2 | 51.8 | 36.5 | 14.4 | 6.78 / 4.11 | 2562 (3631) | ret, asp, thin | thin, ret, asp | ✓ |
| Women's Arch Comfort Wedge Sandals - Buckle Strap | ₹24.40 L | 1021 | 25.9 (27.2) | 42.8 | 57.2 | 47.1 | 28.2 | 7.16 / 2.86 | 2389 (2958) | ret, asp | ret, asp | ✓ |
| Women's Cloud Comfort Sandal | ₹23.28 L | 1347 | 20.1 (19.7) | 40.5 | 59.5 | 43.5 | -6.5 | 2.5 / 2.87 | 1728 (1888) | loss, ret, asp | loss, ret, asp | ✓ |
| Ultimate Mattress Topper - Cooling Cover | ₹23.12 L | 231 | 20.6 (19.6) | 42.6 | 57.4 | 40.3 | 5.2 | 3.58 / 3.12 | 10011 (10715) | ret, asp, thin | thin, ret, asp | ✓ |
| Active Casual Sneakers - Men's | ₹22.92 L | 904 | 27.5 (26.3) | 48.6 | 51.4 | 36.2 | 15.9 | 6.78 / 3.81 | 2535 (3607) | ret, asp | ret, asp | ✓ |
| Wallet | ₹21.07 L | 1078 | 22.2 (17.3) | 41.6 | 58.4 | 50.2 | 4.2 | 2.79 / 2.56 | 1954 (2739) | ret, retup, asp, thin | thin, ret, retup, asp | ✓ |
| Active Knee Cap Support | ₹18.40 L | 2177 | 11.9 (15.8) | 37.2 | 62.8 | 49.9 | 6.3 | 2.6 / 2.27 | 845 (873) | thin | thin | ✓ |
| Five Finger Neck Massager | ₹18.24 L | 487 | 19.4 (5.9) | 66.9 | 33.1 | 23.2 | -3.6 | 4.63 / 5.34 | 3746 (3306) | loss, cm1, cogs, gm, retup | loss, cm1, cogs, gm, retup | ✓ |
| Ultimate Mattress Topper - Premium Cover | ₹18.07 L | 209 | 8.7 (10.3) | 47.3 | 52.7 | 36.2 | 5.7 | 3.58 / 3.02 | 8646 (8985) | thin | thin | ✓ |
| Premium Car Backrest Cushion | ₹16.95 L | 1204 | 19.7 (20.6) | 46.8 | 53.2 | 29.4 | 11.7 | 7.03 / 4.23 | 1408 (1421) | cm1, thin | thin, cm1 | ✓ |
| Premium Car Wedge Seat Cushion | ₹16.21 L | 1160 | 20.8 (22.2) | 41.6 | 58.4 | 31.9 | 13.9 | 7.03 / 3.96 | 1397 (1407) | ret, thin | thin, ret | ✓ |
| Women's Ethnic Comfort Flat Sandal | ₹15.91 L | 1216 | 18.8 (18.4) | 51.7 | 48.3 | 28.3 | 11.1 | 7.16 / 4.35 | 1308 (1515) | cm1, cogs, gm, asp, thin | thin, cm1, cogs, gm, asp | ✓ |
| Comfort Formal Shoes | ₹15.86 L | 416 | 27.1 (27.5) | 34.7 | 65.3 | 56.5 | 15.5 | 3.35 / 2.43 | 3813 (4220) | ret, asp | ret, asp | ✓ |
| Barefoot Shoes - Men's | ₹14.64 L | 394 | 23.9 (32.1) | 38.0 | 62.0 | 52.2 | -33.5 | 1.53 / 2.51 | 3717 (3773) | loss, ret | loss, ret | ✓ |
| Ultimate Pro Seat Cushion | ₹14.38 L | 1038 | 15.6 (16.0) | 40.0 | 60.0 | 34.2 | 15.7 | 6.42 / 3.47 | 1385 (1530) | asp | asp | ✓ |
| Women's Arch Support Wedge Sandals | ₹14.06 L | 594 | 25.3 (25.9) | 45.5 | 54.5 | 41.3 | 22.6 | 7.16 / 3.24 | 2367 (2863) | ret, asp | ret, asp | ✓ |
| Maternity Pillow Bundle Plus | ₹13.68 L | 458 | 13.5 (47.9) | 36.3 | 63.7 | 45.8 | -0.8 | 2.47 / 2.52 | 2987 (2752) | loss | loss | ✓ |
| Orthotics Knee Support Wrap | ₹13.63 L | 2326 | 15.7 (17.6) | 31.2 | 68.8 | 51.9 | 9.1 | 2.76 / 2.28 | 586 (657) | asp, thin | thin, asp | ✓ |
| Comfort Formal Shoes with Arch | ₹13.27 L | 316 | 22.7 (31.0) | 31.5 | 68.5 | 60.7 | 22.1 | 3.35 / 2.13 | 4198 (4673) | ret, asp | ret, asp | ✓ |
| AeroMesh Ergo Chair | ₹13.25 L | 87 | 10.0 (21.4) | 55.1 | 44.9 | 17.7 | -7.3 | 4.43 / 6.26 | 15236 (15402) | loss, cm1, cogs, gm | loss, cm1, cogs, gm | ✓ |
| Anti-Slip Bath Mat | ₹12.98 L | 1308 | 8.4 (9.7) | 46.7 | 53.3 | 38.7 | -4.7 | 2.51 / 2.82 | 993 (929) | loss | loss | ✓ |
| ErgoSlyd Formal Shoes | ₹12.78 L | 273 | 27.0 (30.2) | 34.2 | 65.8 | 58.4 | 39.3 | 7.16 / 2.34 | 4681 (4761) | ret | ret | ✓ |
| Ultimate Neck Contour Cervical Plus Pillow | ₹12.19 L | 860 | 17.5 (19.6) | 47.3 | 52.7 | 14.7 | 0.7 | 8.64 / 8.22 | 1418 (1579) | cm1, asp, thin | thin, cm1, asp | ✓ |
| Men's Orthotics Dual Strap Sandals | ₹11.41 L | 883 | 23.3 (21.3) | 82.1 | 17.9 | -4.3 | -22.5 | 7.16 / — | 1292 (1840) | loss, cm1, cogs, gm, ret, asp | loss, cm1, cogs, gm, ret, asp | ✓ |
| Foot Alignment Socks | ₹11.27 L | 2154 | 15.7 (22.1) | 25.4 | 74.6 | 55.2 | -5.0 | 1.97 / 2.15 | 523 (520) | loss | loss | ✓ |
| Women's Cloud Comfort Sandal - Toeless | ₹11.22 L | 681 | 27.5 (25.9) | 42.5 | 57.5 | 38.0 | -17.1 | 2.5 / 3.63 | 1648 (1835) | loss, ret, asp | loss, ret, asp | ✓ |
| Cloud Backrest Cushion | ₹11.03 L | 623 | 14.3 (16.7) | 54.1 | 45.9 | 30.9 | 13.1 | 6.53 / 3.77 | 1770 (1827) | cogs, gm, thin | thin, cogs, gm | ✓ |
| Maternity Pillow | ₹10.71 L | 509 | 27.4 (28.9) | 26.9 | 73.1 | 52.9 | -2.6 | 2.47 / 2.6 | 2104 (2080) | loss, ret | loss, ret | ✓ |
| Travel Wheelchair | ₹10.69 L | 108 | 11.5 (14.2) | 61.6 | 38.4 | 24.4 | -4.6 | 3.89 / 4.63 | 9901 (11766) | loss, cm1, cogs, gm, asp | loss, cm1, cogs, gm, asp | ✓ |
| Women's Cloud Comfort Back Strap Sandals | ₹10.43 L | 561 | 23.1 (21.9) | 34.9 | 65.1 | 53.4 | 14.6 | 3.35 / 2.44 | 1858 (2088) | ret, asp, thin | thin, ret, asp | ✓ |
| Foldable Travel Wheelchair | ₹10.12 L | 71 | 6.6 (6.9) | 43.8 | 56.2 | 41.2 | 13.7 | 3.89 / 2.6 | 14254 (14357) | thin | thin | ✓ |
| Active Socks | ₹9.96 L | 3915 | 10.8 (12.2) | 54.2 | 45.8 | 14.6 | -3.9 | 6.08 / 7.69 | 255 (235) | loss, cm1, cogs, gm | loss, cm1, cogs, gm | ✓ |
| Men's Comfort Triple Strap Sandals | ₹9.51 L | 390 | 21.7 (—) | 32.0 | 68.0 | 56.9 | 27.6 | 4.36 / 2.24 | 2439 (—) | ret | ret | ✓ |
| Maternity Pillow - Bundle | ₹9.40 L | 374 | 21.3 (19.0) | 32.4 | 67.6 | 43.7 | 18.7 | 5.07 / 2.9 | 2513 (2649) | ret, asp | ret, asp | ✓ |
| Puneri Chappal - Men | ₹9.34 L | 630 | 20.1 (20.3) | 65.4 | 34.6 | 16.1 | -2.4 | 6.76 / 7.79 | 1483 (2128) | loss, cm1, cogs, gm, ret, asp | loss, cm1, cogs, gm, ret, asp | ✓ |
| Glide Ergo Chair | ₹9.01 L | 115 | 12.9 (12.9) | 61.9 | 38.1 | 4.1 | -13.8 | 6.4 / 27.85 | 7832 (7877) | loss, cm1, cogs, gm | loss, cm1, cogs, gm | ✓ |
| Plantar Fasciitis Pain Relief Ortho Insoles | ₹8.58 L | 663 | 9.8 (13.9) | 34.6 | 65.4 | 51.2 | 29.7 | 5.16 / 2.16 | 1294 (1394) | asp | asp | ✓ |
| ErgoLift Footrest | ₹8.31 L | 353 | 20.1 (15.5) | 44.6 | 55.4 | 41.5 | -44.5 | 1.45 / 3.01 | 2354 (2402) | loss, ret, retup | loss, ret, retup | ✓ |
| Orthotics Toe Separator Pro | ₹8.07 L | 1654 | 11.6 (12.3) | 25.6 | 74.4 | 53.1 | 4.8 | 2.34 / 2.13 | 488 (485) | thin | thin | ✓ |
| Ultimate Pro Posture Corrector | ₹7.97 L | 566 | 18.9 (18.6) | 34.0 | 66.0 | 42.9 | 25.4 | 7.03 / 2.87 | 1408 (1513) | asp | asp | ✓ |
| Cervical Butterfly Pillow | ₹7.86 L | 429 | 13.5 (20.3) | 46.3 | 53.7 | 25.2 | 11.8 | 8.64 / 4.58 | 1831 (1838) | cm1, thin | thin, cm1 | ✓ |
| Active Walking Shoes - Women's | ₹7.53 L | 336 | 26.7 (34.1) | 67.3 | 32.7 | 16.6 | -2.4 | 7.16 / 8.21 | 2241 (2446) | loss, cm1, cogs, gm, ret, asp | loss, cm1, cogs, gm, ret, asp | ✓ |
| Barefoot Sock Shoe Pro | ₹7.08 L | 497 | 9.8 (10.6) | 32.8 | 67.2 | 59.0 | 15.1 | 2.52 / 1.88 | 1424 (1603) | asp | asp | ✓ |
| Barefoot Sock Shoe Classic | ₹6.89 L | 549 | 14.1 (20.3) | 35.0 | 65.0 | 55.6 | 31.6 | 4.84 / 2.09 | 1255 (1433) | asp | asp | ✓ |
| Cloud Comfort Slippers | ₹6.40 L | 851 | 15.4 (19.5) | 38.7 | 61.3 | 37.4 | 16.0 | 5.53 / 3.16 | 752 (812) | asp | asp | ✓ |
| Men's Cloud Comfort Shoes - Lace Ups - Arch Footbed | ₹6.37 L | 281 | 21.5 (21.3) | 45.8 | 54.2 | 43.2 | 4.0 | 3.25 / 2.95 | 2265 (2321) | ret, thin | thin, ret | ✓ |
| Active Walking Shoes - Men's | ₹5.79 L | 226 | 33.4 (32.4) | 58.7 | 41.3 | 25.7 | 4.8 | 7.16 / 5.83 | 2561 (2588) | cm1, cogs, gm, ret, thin | thin, cm1, cogs, gm, ret | ✓ |
| 3D Eye Mask | ₹5.48 L | 747 | 6.8 (16.7) | 50.6 | 49.4 | 36.1 | 23.8 | 8.69 / 2.97 | 734 (769) | cogs, gm | cogs, gm | ✓ |
| Ultimate Neck Contour Cervical Pillow | ₹5.40 L | 417 | 19.7 (17.6) | 34.4 | 65.6 | 36.6 | 21.3 | 8.13 / 3.4 | 1294 (1403) | asp | asp | ✓ |
| Arch Support Wedge Sandals - Velcro Strap | ₹4.93 L | 208 | 41.2 (—) | 55.6 | 44.4 | 32.4 | -84.8 | 1.45 / 5.24 | 2369 (—) | loss, cogs, gm, ret | loss, cogs, gm, ret | ✓ |
| Ultimate Lap Desk Pillow | ₹4.90 L | 171 | 19.5 (20.8) | 55.9 | 44.1 | -3.0 | -17.3 | 8.64 / — | 2864 (2687) | loss, cm1, cogs, gm | loss, cm1, cogs, gm | ✓ |
| Five Toe Socks | ₹4.75 L | 1168 | 7.5 (7.9) | 43.9 | 56.1 | 35.4 | -2.1 | 2.88 / 3.05 | 407 (624) | loss, asp | loss, asp | ✓ |
| Men's Cloud Comfort Shoes - Slip Ons  - Flat Footbed | ₹4.74 L | 234 | 20.0 (22.5) | 51.0 | 49.0 | 37.3 | 18.5 | 6.65 / 3.35 | 2026 (2013) | cogs, gm, ret | cogs, gm, ret | ✓ |
| Five Toe Socks - Solid | ₹4.61 L | 1051 | 8.5 (7.3) | 39.7 | 60.3 | 38.4 | 0.5 | 2.88 / 2.84 | 439 (606) | asp, thin | thin, asp | ✓ |
| Orthotics Bunion Corrector | ₹4.60 L | 330 | 10.9 (14.2) | 48.2 | 51.8 | 44.3 | 3.8 | 2.77 / 2.53 | 1393 (1715) | asp, thin | thin, asp | ✓ |
| Orthotics Kids Posture Seat | ₹4.28 L | 295 | 13.8 (11.4) | 29.3 | 70.7 | 40.9 | -15.3 | 2.06 / 2.83 | 1452 (1423) | loss | loss | ✓ |
| Women's Comfort Flat Sandal | ₹4.17 L | 310 | 25.8 (24.8) | 50.3 | 49.7 | 27.2 | 8.4 | 7.16 / 4.94 | 1344 (1487) | cm1, cogs, gm, ret, asp, thin | thin, cm1, cogs, gm, ret, asp | ✓ |
| Ultimate Cozy Classic Pillow | ₹4.11 L | 627 | 18.9 (20.0) | 33.7 | 66.3 | 19.7 | 5.4 | 8.64 / 6.26 | 656 (603) | cm1, thin | thin, cm1 | ✓ |
| Active Casual Sneakers - Leather - Men's | ₹4.09 L | 119 | 31.6 (27.8) | 32.2 | 67.8 | 56.8 | 35.3 | 6.78 / 2.57 | 3437 (4196) | ret, retup, asp | ret, retup, asp | ✓ |
| Dual Gel Insoles | ₹4.04 L | 646 | 11.8 (16.4) | 45.0 | 55.0 | 36.3 | 14.4 | 5.16 / 3.12 | 625 (612) | thin | thin | ✓ |
| Premium Cervical Pillow | ₹3.93 L | 310 | 21.9 (20.9) | 37.9 | 62.1 | 30.5 | 15.7 | 8.64 / 4.19 | 1266 (1324) | ret | ret | ✓ |
| Wedge Plus Cushion + Neck Rest Pillow | ₹3.79 L | 157 | 21.6 (21.5) | 45.5 | 54.5 | 30.5 | 15.8 | 8.69 / 4.18 | 2417 (2555) | ret, asp | ret, asp | ✓ |
| Men's Cloud Comfort Shoes - Lace Ups - Flat Footbed | ₹3.43 L | 168 | 25.3 (23.0) | 50.7 | 49.3 | 36.5 | -4.6 | 3.25 / 3.66 | 2039 (2016) | loss, cogs, gm, ret | loss, cogs, gm, ret | ✓ |
| Active Casual Sneakers | ₹3.17 L | 95 | 25.0 (—) | 34.5 | 65.5 | 55.4 | 35.8 | 6.78 / 2.4 | 3336 (—) | ret | ret | ✓ |
| AeroDry Bath Mat | ₹3.02 L | 325 | 11.7 (10.3) | 59.1 | 40.9 | 19.5 | 6.2 | 8.56 / 5.81 | 928 (1436) | cm1, cogs, gm, asp, thin | thin, cm1, cogs, gm, asp | ✓ |
| Nasal Strip Pro | ₹2.86 L | 501 | 14.3 (15.6) | 19.4 | 80.6 | 62.1 | 48.7 | 8.69 / 1.88 | 570 (651) | asp | asp | ✓ |
| Portable Floor Chair | ₹2.84 L | 82 | 14.6 (21.4) | 53.9 | 46.1 | -15.1 | -33.4 | 6.4 / — | 3469 (3965) | loss, cm1, cogs, gm, asp | loss, cm1, cogs, gm, asp | ✓ |
| Contour Cervical Pillow | ₹2.76 L | 221 | 20.7 (27.2) | 39.4 | 60.6 | 29.4 | 13.9 | 8.13 / 4.28 | 1248 (1295) | cm1, ret, thin | thin, cm1, ret | ✓ |
| Hot & Cold Therapy Pack | ₹2.73 L | 353 | 14.7 (24.1) | 41.4 | 58.6 | 40.5 | -12.0 | 2.23 / 2.89 | 774 (985) | loss, asp | loss, asp | ✓ |
| Orthotics Sports Knee Cap Support | ₹2.70 L | 297 | 21.1 (23.9) | 40.5 | 59.5 | 45.9 | 31.2 | 8.64 / 2.76 | 908 (931) | ret | ret | ✓ |
| Ultimate Wedge Plus Max Cushion | ₹2.49 L | 113 | 13.5 (17.7) | 53.7 | 46.3 | 17.9 | 1.5 | 7.03 / 6.45 | 2204 (2262) | cm1, cogs, gm, thin | thin, cm1, cogs, gm | ✓ |
| Leg Elevation Pillow | ₹2.46 L | 129 | 12.6 (11.5) | 45.2 | 54.8 | 33.0 | -11.1 | 2.59 / 3.47 | 1908 (2000) | loss | loss | ✓ |
| Orthotics Toe Separator | ₹2.43 L | 704 | 9.8 (13.8) | 19.4 | 80.6 | 50.3 | 3.0 | 2.34 / 2.2 | 345 (383) | asp, thin | thin, asp | ✓ |
| Mattress Protector | ₹2.37 L | 289 | 11.8 (18.8) | 54.0 | 46.0 | 19.2 | 6.2 | 8.69 / 5.9 | 820 (1012) | cm1, cogs, gm, asp, thin | thin, cm1, cogs, gm, asp | ✓ |
| Unisex Orthotics V-Strap Sandals | ₹2.26 L | 121 | 23.5 (31.0) | 36.9 | 63.1 | 48.2 | 30.0 | 7.16 / 2.71 | 1868 (1911) | ret | ret | ✓ |
| Deep Sleep Pillow Cover | ₹2.09 L | 606 | 15.3 (15.8) | 42.0 | 58.0 | 27.6 | 14.1 | 8.69 / 4.27 | 345 (357) | cm1, thin | thin, cm1 | ✓ |
| Barefoot Shoes - Women's | ₹2.02 L | 55 | 24.3 (22.6) | 38.4 | 61.6 | 51.1 | 32.7 | 7.16 / 2.58 | 3676 (3840) | ret | ret | ✓ |
| Orthotics Bamboo Knee Cap | ₹2.01 L | 430 | 24.4 (17.2) | 24.7 | 75.3 | 50.0 | 34.7 | 8.64 / 2.64 | 468 (459) | ret, retup | ret, retup | ✓ |
| Men's Arch Comfort Sandal | ₹2.00 L | 88 | 23.2 (19.5) | 36.2 | 63.8 | 51.2 | 21.0 | 4.31 / 2.54 | 2275 (2169) | ret, retup | ret, retup | ✓ |
| Latex Pillow with Cooling Cover | ₹1.94 L | 72 | 44.9 (33.2) | 45.9 | 54.1 | 25.7 | 4.7 | 8.64 / 7.06 | 2699 (2813) | cm1, ret, retup, thin | thin, cm1, ret, retup | ✓ |
| Ultimate Pro Face Mask | ₹1.80 L | 530 | 18.2 (16.2) | 105.7 | -5.7 | -31.3 | -45.4 | 8.69 / — | 340 (325) | loss, cm1, cogs, gm | loss, cm1, cogs, gm | ✓ |
| Wedge Neck Rest Pillow | ₹1.80 L | 248 | 23.1 (17.3) | 48.3 | 51.7 | 12.2 | -6.3 | 7.03 / 10.65 | 726 (724) | loss, cm1, ret, retup | loss, cm1, ret, retup | ✓ |
| Crescent Adjustable Pillow | ₹1.76 L | 178 | 20.7 (19.9) | 56.9 | 43.1 | -1.0 | -15.6 | 8.64 / — | 991 (1397) | loss, cm1, cogs, gm, ret, asp | loss, cm1, cogs, gm, ret, asp | ✓ |
| Women's Cloud Comfort Shoes - Lace ups | ₹1.76 L | 91 | 20.8 (25.6) | 39.3 | 60.7 | 44.4 | 5.6 | 3.25 / 2.84 | 1935 (1936) | ret, thin | thin, ret | ✓ |
| Men's Orthotics Toe Ring Sandals | ₹1.74 L | 95 | 21.2 (25.4) | 57.9 | 42.1 | 26.8 | 9.1 | 7.16 / 4.73 | 1832 (1879) | cm1, cogs, gm, ret, thin | thin, cm1, cogs, gm, ret | ✓ |
| Five Toe Socks - Patterned | ₹1.67 L | 399 | 7.6 (7.4) | 44.0 | 56.0 | 32.7 | -4.8 | 2.88 / 3.31 | 418 (613) | loss, asp | loss, asp | ✓ |
| Ultimate Car Comfort Bundle | ₹1.67 L | 68 | 22.6 (36.5) | 48.3 | 51.7 | 20.5 | 5.6 | 8.69 / 6.3 | 2450 (2876) | cm1, ret, asp, thin | thin, cm1, ret, asp | ✓ |
| Portable Travel Seat Cushion | ₹1.51 L | 130 | 8.7 (9.1) | 32.3 | 67.7 | 47.5 | 5.1 | 2.58 / 2.3 | 1161 (1187) | thin | thin | ✓ |
| Orthotics Compression Gloves | ₹1.45 L | 180 | 16.0 (30.4) | 43.4 | 56.6 | 42.3 | 28.5 | 8.64 / 2.81 | 805 (860) | asp | asp | ✓ |
| Women's Arch Support Wedge Sandals - Velcro Strap | ₹1.41 L | 62 | 34.0 (32.9) | 57.9 | 42.1 | 26.6 | -77.9 | 1.45 / 5.7 | 2282 (3262) | loss, cm1, cogs, gm, ret, asp | loss, cm1, cogs, gm, ret, asp | ✓ |
| Car Back Rest Cushion Pro | ₹1.31 L | 80 | 35.7 (38.0) | 34.8 | 65.2 | 16.1 | -6.0 | 7.03 / 9.67 | 1633 (1612) | loss, cm1, ret | loss, cm1, ret | ✓ |
| Car Neck Rest Cushion Pro | ₹1.30 L | 85 | 28.5 (30.1) | 22.6 | 77.4 | 48.1 | 32.0 | 8.64 / 2.9 | 1528 (1564) | ret | ret | ✓ |
| Nasal Strips | ₹1.13 L | 248 | 2.1 (5.2) | 22.3 | 77.7 | 56.6 | -44.6 | 1.01 / 1.8 | 454 (560) | loss, asp | loss, asp | ✓ |
| Car Seat Cushion Pro | ₹1.08 L | 67 | 30.7 (37.7) | 38.9 | 61.1 | 22.4 | 2.0 | 7.03 / 6.42 | 1607 (1618) | cm1, ret, thin | thin, cm1, ret | ✓ |
| Others | ₹1.00 L | 124 | 21.9 (54.9) | 70.7 | 29.3 | -2.4 | -456.4 | 0.28 / — | 810 (4542) | loss, cm1, cogs, gm, ret, asp | loss, cm1, cogs, gm, ret, asp | ✓ |
| Mattress Protector - Bamboo Terry Fabric | ₹0.93 L | 57 | 19.0 (17.5) | 65.1 | 34.9 | 18.1 | 3.9 | 8.69 / 6.82 | 1639 (1712) | cm1, cogs, gm, thin | thin, cm1, cogs, gm | ✓ |
| Gel Max Comfort Insole | ₹0.90 L | 146 | 7.8 (13.0) | 56.3 | 43.7 | 25.7 | 4.7 | 5.16 / 4.22 | 613 (626) | cm1, cogs, gm, thin | thin, cm1, cogs, gm | ✓ |
| Kids Travel Neck Pillow | ₹0.89 L | 99 | 22.7 (21.0) | 44.2 | 55.8 | 31.8 | 8.9 | 5.64 / 4.06 | 895 (917) | ret, thin | thin, ret | ✓ |
| Slim Seat Cushion | ₹0.85 L | 73 | 20.3 (27.1) | 38.4 | 61.6 | 38.0 | 20.2 | 7.03 / 3.3 | 1167 (1161) | ret | ret | ✓ |
| Latex Pillow Cover | ₹0.69 L | 159 | 34.3 (40.8) | 47.5 | 52.5 | 18.3 | 0.8 | 8.69 / 8.32 | 434 (458) | cm1, ret, asp, thin | thin, cm1, ret, asp | ✓ |
| Orthotics Sports Elbow Brace | ₹0.62 L | 91 | 17.4 (21.8) | 42.3 | 57.7 | 41.1 | 14.6 | 4.57 / 2.94 | 680 (754) | asp, thin | thin, asp | ✓ |
| Mouse Wrist Support | ₹0.60 L | 96 | 16.3 (10.8) | 25.4 | 74.6 | 54.6 | 38.9 | 7.6 / 2.19 | 623 (635) | retup | retup | ✓ |
| Winter Socks | ₹0.49 L | 83 | 15.0 (19.3) | 45.8 | 54.2 | 36.2 | 19.8 | 7.16 / 3.24 | 585 (647) | asp | asp | ✓ |
| Silicone Gel Insole | ₹0.39 L | 91 | 29.8 (19.2) | 43.2 | 56.8 | 18.4 | -9.1 | 5.16 / 7.72 | 425 (469) | loss, cm1, ret, retup, asp | loss, cm1, ret, retup, asp | ✓ |
| Kids Ear Plug | ₹0.27 L | 56 | 18.0 (—) | 31.2 | 68.8 | 42.8 | -76.9 | 1.02 / 2.85 | 490 (—) | loss | loss | ✓ |

</details>

5 random unflagged (checked) products:

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ASP (prev) | Clear? |
|---|---|---|---|---|---|---|---|---|---|
| Premium Car Neck Rest Pillow | ₹18.74 L | 1438 | 18.8 (21.7) | 34.6 | 65.4 | 45.8 | 29.6 | 1303 (1333) | ✓ |
| Silver Plus Face Mask | ₹0.21 L | 62 | 13.8 (33.9) | 37.4 | 62.6 | 40.5 | 27.2 | 336 (317) | ✓ |
| Maternity Pillow Plus | ₹1.81 L | 75 | 10.4 (33.4) | 33.3 | 66.7 | 46.2 | 24.2 | 2414 (2510) | ✓ |
| Orthopedic Heel Pad Pro Insole | ₹1.09 L | 201 | 10.8 (17.1) | 16.9 | 83.1 | 63.6 | 41.9 | 544 (533) | ✓ |
| Men's Cloud Comfort Shoes - Slip Ons  - Arch Footbed | ₹7.09 L | 311 | 19.6 (23.9) | 45.1 | 54.9 | 44.1 | 25.4 | 2281 (2377) | ✓ |

### Amazon Overall

Bars (Amazon, Flipkart, Myntra): CM1 < 20% · COGS > 45% · GM < 40% · Returns > 15% · CM2 target 10% · ASP down > 5% · Returns up > 3 pts. Materiality: ≥ 1% of gross (₹16.98 L) or ≥ 50 units.

Watchlist header: "8 of 8 rules triggered · 108 products · 62 small products not checked". Products in the table: 181 · checked (material): 119 · flagged: 108. Result: **all flags correct** (1 at a rounding edge, see ≈).

| Rule | Tile count | Rows with the flag | Tile ₹ | Σ of listed products (re-derived) | OK |
|---|---|---|---|---|---|
| Loss after ads | 15 | 15 | ₹-5.02 L | ₹-5.04 L | ✓ |
| Below healthy ROAS | 23 | 23 | ₹-8.60 L | ₹-8.58 L | ✓ |
| CM1 < 20% | 29 | 29 | ₹-14.33 L | ₹-14.32 L | ✓ |
| Returns > 15% | 49 | 49 | ₹-81.67 L | ₹-81.67 L | ✓ |
| COGS > 45% | 37 | 37 | ₹-21.54 L | ₹-21.56 L | ✓ |
| GM < 40% | 3 | 3 | ₹-0.55 L | ₹-0.55 L | ✓ |
| ASP down > 5% | 90 | 90 | ₹-268.00 L | ₹-267.39 L | ✓ |
| Returns up > 3 pts | 10 | 10 | ₹-2.22 L | ₹-2.22 L | ✓ |

<details><summary>Every flagged product</summary>

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ROAS / BE | ASP (prev) | Flags shown | Re-derived | OK |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Cloud Comfort Arch Support Slippers | ₹147.00 L | 19157 | 13.7 (15.5) | 43.2 | 56.8 | 25.9 | 14.5 | 10.22 / 4.47 | 770 (885) | asp | asp | ✓ |
| Orthotics Heel Protector | ₹109.00 L | 13301 | 4.6 (6.0) | 41.9 | 58.1 | 44.2 | 34.8 | 11.17 / 2.37 | 816 (896) | asp | asp | ✓ |
| Ultimate Car Neck Rest Pillow | ₹95.44 L | 11446 | 9.2 (20.8) | 34.9 | 65.1 | 29.1 | 26.3 | 39.32 / 3.78 | 834 (1198) | asp | asp | ✓ |
| Ultimate Car Comfort Bundle | ₹78.69 L | 2592 | 12.5 (24.7) | 38.2 | 61.8 | 29.1 | 16.8 | 9.32 / 3.92 | 3036 (3284) | asp | asp | ✓ |
| Men's Comfort Dual Strap Sandals | ₹74.72 L | 3780 | 11.4 (24.8) | 41.5 | 58.5 | 27.8 | 12.8 | 7.49 / 4.05 | 1977 (2182) | asp | asp | ✓ |
| Ultimate Wedge Plus Cushion | ₹56.45 L | 3299 | 10.1 (15.7) | 42.7 | 57.3 | 21.9 | 9.7 | 9.06 / 5.06 | 1711 (1943) | asp, thin | thin, asp | ✓ |
| 3D Posture Plus Ergonomic Chair | ₹55.92 L | 333 | 3.5 (28.6) | 59.5 | 40.5 | 13.4 | 7.0 | 16.09 / 7.72 | 16792 (21429) | cm1, cogs, asp, thin | thin, cm1, cogs, asp | ✓ |
| Travel Neck Pillow | ₹54.19 L | 4753 | 8.6 (14.9) | 46.4 | 53.6 | 19.1 | 5.0 | 7.76 / 5.71 | 1140 (1623) | cm1, cogs, asp, thin | thin, cm1, cogs, asp | ✓ |
| Active Knee Cap Support | ₹52.94 L | 6695 | 15.0 (17.5) | 40.0 | 60.0 | 41.8 | 30.5 | 10.42 / 2.81 | 791 (882) | ret, asp | ret, asp | ✓ |
| Ultimate Mattress Topper - Premium Cover | ₹40.87 L | 537 | 14.1 (30.0) | 51.4 | 48.6 | 19.2 | 9.5 | 11.96 / 6.06 | 7611 (9041) | cm1, cogs, asp, thin | thin, cm1, cogs, asp | ✓ |
| Ultimate Pro Seating Combo | ₹36.09 L | 1386 | 12.1 (21.9) | 44.6 | 55.4 | 22.7 | 12.3 | 10.87 / 4.99 | 2604 (3002) | asp | asp | ✓ |
| Adjustable Wedge Max Cushion | ₹34.53 L | 943 | 11.4 (21.9) | 52.5 | 47.5 | 14.4 | 9.6 | 23.35 / 7.83 | 3662 (3901) | cm1, cogs, asp, thin | thin, cm1, cogs, asp | ✓ |
| Ultimate Deep Sleep Pillow | ₹31.07 L | 2178 | 14.9 (22.7) | 51.3 | 48.7 | 11.9 | -0.1 | 9.84 / 9.9 | 1426 (1614) | loss, cm1, cogs, asp | loss, cm1, cogs, asp | ✓ |
| Ultimate Neck Contour Cervical Pillow | ₹30.67 L | 3373 | 11.9 (22.2) | 49.4 | 50.6 | 13.8 | -0.3 | 8.08 / 8.23 | 909 (1378) | loss, cm1, cogs, asp | loss, cm1, cogs, asp | ✓ |
| Cloud Comfort Slippers | ₹29.88 L | 4174 | 15.9 (19.7) | 40.8 | 59.2 | 28.2 | 18.2 | 11.92 / 4.21 | 716 (800) | ret, asp | ret, asp | ✓ |
| Cold & Hot Therapy Cap | ₹27.13 L | 1929 | 5.1 (5.8) | 26.5 | 73.5 | 50.8 | 37.8 | 8.08 / 2.07 | 1406 (1582) | asp | asp | ✓ |
| Ultimate Pro Seat Cushion | ₹26.18 L | 1849 | 11.8 (17.7) | 39.2 | 60.8 | 28.4 | 8.7 | 5.74 / 3.98 | 1416 (1556) | asp, thin | thin, asp | ✓ |
| Men's Cloud Comfort Sandal | ₹25.74 L | 1301 | 15.9 (28.3) | 37.9 | 62.1 | 30.9 | 11.8 | 6.21 / 3.84 | 1979 (2171) | ret, asp | ret, asp | ✓ |
| Ultimate Car Wedge Seat Cushion | ₹24.91 L | 2324 | 11.2 (19.9) | 39.5 | 60.5 | 23.7 | 7.3 | 6.89 / 4.75 | 1072 (1457) | asp, thin | thin, asp | ✓ |
| Arch Support Insoles | ₹24.28 L | 1883 | 8.0 (7.8) | 26.4 | 73.6 | 46.3 | 33.4 | 8.43 / 2.34 | 1290 (1441) | asp | asp | ✓ |
| Arch Comfort Slides | ₹22.55 L | 1760 | 15.7 (31.6) | 34.2 | 65.8 | 29.7 | 14.0 | 7.52 / 3.98 | 1281 (1383) | ret, asp | ret, asp | ✓ |
| Dual Gel Insoles | ₹21.44 L | 3433 | 4.0 (5.1) | 44.9 | 55.1 | 30.4 | 17.1 | 7.87 / 3.43 | 625 (690) | asp | asp | ✓ |
| Premium Car Comfort Bundle | ₹20.10 L | 543 | 11.0 (34.1) | 44.1 | 55.9 | 27.1 | 19.5 | 14.68 / 4.14 | 3701 (4420) | asp | asp | ✓ |
| Ultimate Mattress Topper - Standard cover | ₹19.79 L | 304 | 15.5 (26.7) | 45.9 | 54.1 | 22.5 | 14.8 | 15.47 / 5.26 | 6510 (6992) | cogs, ret, asp | cogs, ret, asp | ✓ |
| Women's Cloud Comfort Sandal | ₹18.63 L | 1042 | 19.0 (32.6) | 39.6 | 60.4 | 26.4 | 6.6 | 6.21 / 4.66 | 1788 (1892) | ret, asp, thin | thin, ret, asp | ✓ |
| Leg Elevation Pillow | ₹16.73 L | 954 | 12.1 (16.1) | 49.0 | 51.0 | 15.6 | 2.9 | 8.99 / 7.29 | 1754 (1966) | cm1, cogs, asp, thin | thin, cm1, cogs, asp | ✓ |
| Wedge Plus Cushion + Neck Rest Pillow | ₹15.02 L | 631 | 12.3 (21.1) | 46.3 | 53.7 | 18.2 | 4.2 | 8.13 / 6.26 | 2381 (2742) | cm1, cogs, asp, thin | thin, cm1, cogs, asp | ✓ |
| Maternity Pillow - Bundle | ₹14.67 L | 647 | 40.4 (36.5) | 35.0 | 65.0 | 28.6 | 9.0 | 8.53 / 5.85 | 2268 (2684) | ret, retup, asp, thin | thin, ret, retup, asp | ✓ |
| Dual Gel Pro Insoles | ₹13.30 L | 1651 | 6.4 (7.6) | 36.6 | 63.4 | 31.4 | 16.3 | 7.05 / 3.39 | 806 (895) | asp | asp | ✓ |
| Active Casual Sneakers | ₹12.91 L | 399 | 25.5 (40.7) | 34.0 | 66.0 | 55.1 | 35.9 | 6.98 / 2.43 | 3236 (4004) | ret, asp | ret, asp | ✓ |
| Women's Cloud Comfort Back Strap Sandals | ₹12.87 L | 642 | 23.6 (29.5) | 33.2 | 66.8 | 34.7 | 16.4 | 7.17 / 3.77 | 2005 (2171) | ret, asp | ret, asp | ✓ |
| Women's Ethnic Comfort Flat Sandal | ₹12.71 L | 949 | 26.4 (32.7) | 51.2 | 48.8 | 17.2 | 4.7 | 10.84 / 7.9 | 1339 (1476) | cm1, cogs, ret, asp, thin | thin, cm1, cogs, ret, asp | ✓ |
| Contour Cervical Pillow | ₹12.54 L | 1277 | 16.8 (22.1) | 50.8 | 49.2 | 12.3 | -3.4 | 7.64 / 9.73 | 982 (1238) | loss, cm1, cogs, ret, asp | loss, cm1, cogs, ret, asp | ✓ |
| Ultimate Car Backrest Cushion | ₹12.48 L | 999 | 8.5 (17.5) | 40.6 | 59.4 | 23.3 | 21.4 | 58.06 / 4.68 | 1249 (1463) | asp | asp | ✓ |
| Orthotics Bunion Corrector | ₹12.33 L | 822 | 6.0 (8.4) | 44.7 | 55.3 | 45.2 | 32.7 | 8.45 / 2.35 | 1500 (1838) | asp | asp | ✓ |
| Foldable Travel Wheelchair | ₹12.24 L | 81 | 22.6 (29.3) | 41.8 | 58.2 | 45.3 | 32.2 | 9.83 / 2.85 | 15109 (15998) | ret, asp | ret, asp | ✓ |
| Women's Cloud Comfort Shoes - Lace ups | ₹11.43 L | 613 | 34.9 (39.9) | 41.0 | 59.0 | 27.2 | -9.3 | 4.21 / 5.64 | 1864 (2012) | loss, ret, asp | loss, ret, asp | ✓ |
| Travel Wheelchair | ₹11.06 L | 88 | 13.6 (29.4) | 48.5 | 51.5 | 39.3 | 27.5 | 9.83 / 2.94 | 12571 (12908) | cogs | cogs | ✓ |
| Ultimate Cozy Pillow | ₹11.05 L | 1880 | 9.1 (15.8) | 43.3 | 56.7 | 18.7 | 9.9 | 12.47 / 5.88 | 588 (798) | cm1, asp, thin | thin, cm1, asp | ✓ |
| Orthotics Posture Corrector Seat | ₹10.98 L | 387 | 16.8 (28.3) | 32.4 | 67.6 | 39.5 | 29.1 | 11.59 / 3.04 | 2836 (3023) | ret, asp | ret, asp | ✓ |
| Orthotics Knee Support Wrap | ₹10.22 L | 1659 | 23.2 (26.4) | 30.3 | 69.7 | 41.9 | 27.6 | 9.08 / 3.1 | 616 (645) | ret | ret | ✓ |
| Ultimate Cozy Classic Pillow | ₹9.69 L | 2262 | 10.0 (22.0) | 51.6 | 48.4 | 7.6 | -9.8 | 6.36 / 14.51 | 428 (658) | loss, cm1, cogs, asp | loss, cm1, cogs, asp | ✓ |
| 3D Eye Mask | ₹9.65 L | 1045 | 4.0 (3.3) | 40.2 | 59.8 | 49.0 | 32.1 | 6.12 / 2.12 | 923 (999) | asp | asp | ✓ |
| Anti-Slip Bath Mat | ₹9.53 L | 960 | 6.1 (8.0) | 46.5 | 53.5 | 28.7 | 17.8 | 9.83 / 3.71 | 993 (983) | cogs | cogs | ✓ |
| Ultimate Mattress Topper - Cooling Cover | ₹9.16 L | 90 | 17.8 (18.7) | 43.5 | 56.5 | 26.4 | 14.9 | 10.59 / 4.61 | 10172 (12052) | ret, asp | ret, asp | ✓ |
| Cloud Backrest Cushion | ₹9.01 L | 478 | 12.1 (25.2) | 51.4 | 48.6 | 14.8 | 7.4 | 15.35 / 7.67 | 1885 (1994) | cm1, cogs, asp, thin | thin, cm1, cogs, asp | ✓ |
| Others | ₹8.69 L | 349 | 7.8 (13.5) | 49.7 | 50.3 | 47.7 | 5.5 | 2.55 / 2.26 | 2490 (1396) | cogs, thin | thin, cogs | ✓ |
| Women's Cloud Comfort Sandal - Toeless | ₹8.54 L | 493 | 29.6 (39.9) | 41.8 | 58.2 | 22.8 | -0.1 | 6.21 / 6.23 | 1732 (1841) | loss, ret, asp | loss, ret, asp | ✓ |
| AeroMesh Ergo Chair | ₹8.01 L | 54 | 13.4 (11.7) | 59.6 | 40.4 | 22.6 | 21.9 | 166.25 / 5.11 | 14835 (16999) | cogs, asp | cogs, asp | ✓ |
| Comfort Formal Shoes with Arch | ₹7.00 L | 156 | 15.2 (44.4) | 29.4 | 70.6 | 62.5 | 34.6 | 4.22 / 1.89 | 4488 (4999) | ret, asp | ret, asp | ✓ |
| Comfort Formal Shoes | ₹6.55 L | 164 | 26.0 (44.4) | 33.1 | 66.9 | 56.2 | 24.3 | 4.22 / 2.4 | 3991 (4262) | ret, asp | ret, asp | ✓ |
| Wedge Plus Cushion Cover | ₹6.04 L | 965 | 11.8 (10.2) | 30.9 | 69.1 | 33.0 | 32.9 | 2790.07 / 3.43 | 626 (659) | asp |  | ≈ |
| Maternity Pillow | ₹5.69 L | 306 | 25.8 (28.3) | 30.7 | 69.3 | 35.9 | 20.1 | 8.53 / 3.75 | 1859 (2199) | ret, asp | ret, asp | ✓ |
| Barefoot Shoes - Men's | ₹5.65 L | 150 | 8.9 (0.0) | 37.4 | 62.6 | 57.1 | 29.2 | 3.93 / 1.92 | 3766 (3999) | retup, asp | retup, asp | ✓ |
| Glide Ergo Chair | ₹5.09 L | 77 | 7.0 (16.7) | 72.7 | 27.3 | 5.0 | 1.5 | 30.42 / 21.48 | 6606 (8735) | cm1, cogs, gm, asp, thin | thin, cm1, cogs, gm, asp | ✓ |
| Orthotics Sports Knee Cap Support | ₹4.87 L | 515 | 25.4 (26.2) | 38.7 | 61.3 | 38.5 | 20.8 | 7.58 / 3.48 | 945 (995) | ret | ret | ✓ |
| Portable Floor Chair | ₹4.77 L | 125 | 5.1 (0.0) | 48.2 | 51.8 | 34.4 | 26.3 | 12.96 / 3.06 | 3817 (3999) | cogs, retup | cogs, retup | ✓ |
| Ultra Slim Deep Sleep Pillow | ₹4.76 L | 332 | 28.0 (31.7) | 36.7 | 63.3 | 27.6 | 25.5 | 67.4 / 5.02 | 1433 (1497) | ret | ret | ✓ |
| Women's Arch Comfort Sandal - Soft Footbed | ₹4.62 L | 219 | 25.4 (34.7) | 32.7 | 67.3 | 37.9 | 25.2 | 10.61 / 3.53 | 2112 (2199) | ret | ret | ✓ |
| Puneri Chappal - Men | ₹4.39 L | 258 | 26.5 (28.1) | 57.8 | 42.2 | 15.6 | 8.1 | 18.1 / 8.71 | 1703 (1868) | cm1, cogs, ret, asp, thin | thin, cm1, cogs, ret, asp | ✓ |
| Nasal Strip Pro | ₹4.37 L | 652 | 3.4 (3.8) | 17.5 | 82.5 | 58.1 | 38.5 | 5.27 / 1.78 | 670 (773) | asp | asp | ✓ |
| Nasal Strips | ₹4.34 L | 768 | 3.8 (2.5) | 19.8 | 80.2 | 47.0 | 30.9 | 6.46 / 2.21 | 564 (606) | asp | asp | ✓ |
| Ultimate Neck Contour Cervical Plus Pillow | ₹4.26 L | 267 | 26.0 (22.8) | 42.7 | 57.3 | 16.9 | 16.8 | 2014.53 / 7.99 | 1595 (1694) | cm1, ret, retup, asp | cm1, ret, retup, asp | ✓ |
| Active Walking Shoes - Men's | ₹4.26 L | 149 | 23.1 (34.0) | 51.1 | 48.9 | 23.0 | 8.3 | 8.85 / 5.65 | 2857 (3493) | cogs, ret, asp, thin | thin, cogs, ret, asp | ✓ |
| Women's Arch Support Wedge Sandals | ₹4.25 L | 160 | 21.8 (39.6) | 40.6 | 59.4 | 28.4 | 24.7 | 34.65 / 4.5 | 2653 (3323) | ret, asp | ret, asp | ✓ |
| Premium Neck Contour Cervical Pillow | ₹4.11 L | 264 | 9.9 (16.6) | 38.3 | 61.7 | 41.6 | 36.0 | 19.97 / 2.67 | 1556 (1690) | asp | asp | ✓ |
| Knee Pillow | ₹3.98 L | 368 | 18.3 (15.4) | 25.3 | 74.7 | 37.7 | 16.9 | 5.87 / 3.24 | 1080 (1199) | ret, asp | ret, asp | ✓ |
| Women's Comfort Flat Sandal | ₹3.93 L | 297 | 29.7 (40.7) | 50.6 | 49.4 | 3.0 | -4.6 | 18.62 / 47.63 | 1322 (1427) | loss, cm1, cogs, ret, asp | loss, cm1, cogs, ret, asp | ✓ |
| Active Walking Shoes - Women's | ₹3.62 L | 127 | 19.3 (38.7) | 54.0 | 46.0 | 16.9 | 10.5 | 19.45 / 7.32 | 2848 (3353) | cm1, cogs, ret, asp | cm1, cogs, ret, asp | ✓ |
| Men's Cloud Comfort Shoes - Lace Ups - Arch Footbed | ₹3.49 L | 152 | 24.5 (33.3) | 45.1 | 54.9 | 44.3 | 30.5 | 9.61 / 2.98 | 2295 (2499) | cogs, ret, asp | cogs, ret, asp | ✓ |
| Ultimate Wedge Plus Max Cushion | ₹3.46 L | 146 | 17.8 (27.1) | 49.6 | 50.4 | 14.5 | 14.4 | 2790.06 / 8.39 | 2370 (2499) | cm1, cogs, ret, asp | cm1, cogs, ret, asp | ✓ |
| Orthopedic Heel Pad Insole | ₹3.29 L | 834 | 3.6 (3.8) | 27.2 | 72.8 | 45.9 | 34.4 | 9.06 / 2.26 | 395 (433) | asp | asp | ✓ |
| Cuddle Sleep Pillow | ₹3.18 L | 113 | 6.5 (18.7) | 43.9 | 56.1 | 24.2 | -16.6 | 2.61 / 4.41 | 2815 (3000) | loss, asp | loss, asp | ✓ |
| Men's Cloud Comfort Shoes - Lace Ups - Flat Footbed | ₹3.15 L | 153 | 18.1 (31.3) | 50.1 | 49.9 | 34.8 | 22.1 | 9.61 / 3.51 | 2060 (2199) | cogs, ret, asp | cogs, ret, asp | ✓ |
| Men's Cloud Comfort Shoes - Slip Ons  - Flat Footbed | ₹3.14 L | 155 | 21.3 (30.8) | 50.9 | 49.1 | 33.5 | 16.7 | 7.58 / 3.79 | 2028 (2199) | cogs, ret, asp | cogs, ret, asp | ✓ |
| Men's Cloud Comfort Shoes - Slip Ons  - Arch Footbed | ₹3.14 L | 130 | 20.5 (31.0) | 42.3 | 57.7 | 40.9 | 17.7 | 5.4 / 3.07 | 2416 (2499) | ret | ret | ✓ |
| Premium Car Neck Rest Pillow | ₹3.13 L | 200 | 9.5 (24.4) | 29.2 | 70.8 | 40.5 | -89.4 | 0.85 / 2.72 | 1565 (1799) | loss, asp | loss, asp | ✓ |
| AeroDry Bath Mat | ₹3.04 L | 269 | 6.3 (3.4) | 48.9 | 51.1 | 9.1 | -9.9 | 5.61 / 11.71 | 1131 (1599) | loss, cm1, cogs, asp | loss, cm1, cogs, asp | ✓ |
| Cloud Seat Cushion | ₹2.63 L | 146 | 15.1 (22.3) | 40.6 | 59.4 | 22.9 | -4.1 | 4.36 / 5.13 | 1802 (1899) | loss, ret, asp | loss, ret, asp | ✓ |
| Kids Travel Neck Pillow | ₹2.59 L | 264 | 17.7 (13.4) | 40.7 | 59.3 | 29.7 | 14.1 | 7.76 / 4.08 | 982 (997) | ret, retup | ret, retup | ✓ |
| Hot & Cold Therapy Pack | ₹2.52 L | 289 | 10.8 (7.9) | 39.3 | 60.7 | 38.8 | 1.3 | 2.98 / 2.88 | 872 (1057) | asp, thin | thin, asp | ✓ |
| Ultimate Lap Desk Pillow | ₹2.36 L | 81 | 16.0 (10.5) | 55.6 | 44.4 | 8.2 | 8.2 | 2614.77 / 14.48 | 2910 (3003) | cm1, cogs, ret, retup, thin | thin, cm1, cogs, ret, retup | ✓ |
| Cloud Seating Combo | ₹2.34 L | 68 | 14.5 (27.9) | 46.9 | 53.1 | 23.3 | 21.0 | 51.52 / 5.02 | 3438 (3600) | cogs | cogs | ✓ |
| Ultimate Pro Posture Corrector | ₹2.27 L | 143 | 15.0 (24.6) | 30.1 | 69.9 | 38.7 | 26.2 | 9.41 / 3.04 | 1588 (1744) | ret, asp | ret, asp | ✓ |
| Mattress Protector | ₹2.26 L | 263 | 13.2 (18.2) | 53.5 | 46.5 | 12.9 | -1.1 | 8.21 / 8.88 | 859 (1062) | loss, cm1, cogs, asp | loss, cm1, cogs, asp | ✓ |
| Orthopedic Heel Pad Pro Insole | ₹2.22 L | 403 | 2.8 (2.5) | 16.6 | 83.4 | 67.2 | 29.8 | 2.75 / 1.53 | 550 (594) | asp | asp | ✓ |
| Women's Arch Comfort Wedge Sandals - Buckle Strap | ₹1.97 L | 74 | 14.6 (42.9) | 38.1 | 61.9 | 36.6 | 36.5 | 2823.47 / 3.2 | 2665 (3699) | asp | asp | ✓ |
| Active Socks | ₹1.91 L | 621 | 3.8 (5.4) | 44.1 | 55.9 | 34.9 | 33.2 | 58.53 / 2.97 | 307 (329) | asp | asp | ✓ |
| Walker Prime | ₹1.85 L | 70 | 17.1 (25.9) | 55.6 | 44.4 | 17.0 | 11.4 | 21.22 / 7.07 | 2639 (2693) | cm1, cogs, ret | cm1, cogs, ret | ✓ |
| Arch Support Insoles Rigid + Semi Rigid Combo | ₹1.82 L | 88 | 7.1 (2.9) | 31.9 | 68.1 | 44.2 | 31.5 | 8.43 / 2.43 | 2071 (2291) | retup, asp | retup, asp | ✓ |
| Maternity Pillow Bundle Plus | ₹1.79 L | 61 | 11.8 (19.4) | 37.1 | 62.9 | 13.7 | 1.2 | 9.07 / 8.25 | 2929 (2999) | cm1, thin | thin, cm1 | ✓ |
| Premium Car Backrest Cushion | ₹1.72 L | 95 | 9.2 (18.4) | 37.7 | 62.3 | 30.1 | 21.9 | 13.36 / 3.65 | 1814 (2016) | asp | asp | ✓ |
| Wedge Neck Rest Pillow | ₹1.72 L | 284 | 13.3 (24.4) | 59.4 | 40.6 | 1.9 | 1.8 | 2790.06 / 61.94 | 606 (798) | cm1, cogs, asp, thin | thin, cm1, cogs, asp | ✓ |
| Gel Max Comfort Insole | ₹1.53 L | 235 | 6.4 (7.2) | 53.1 | 46.9 | 12.8 | 12.7 | 2790.06 / 8.34 | 649 (684) | cm1, cogs, asp | cm1, cogs, asp | ✓ |
| Arch Sports Insole | ₹1.53 L | 324 | 7.4 (9.6) | 32.0 | 68.0 | 29.2 | 29.2 | 2790.05 / 3.69 | 471 (504) | asp | asp | ✓ |
| Orthotics Kids Posture Seat | ₹1.50 L | 96 | 24.5 (0.0) | 26.9 | 73.1 | 34.4 | 18.4 | 8.26 / 3.85 | 1567 (1599) | ret, retup | ret, retup | ✓ |
| Slim Seat Cushion | ₹1.36 L | 111 | 23.1 (17.8) | 37.4 | 62.6 | 23.5 | 23.5 | 2790.07 / 5.52 | 1227 (1476) | ret, retup, asp | ret, retup, asp | ✓ |
| Ultimate Tailbone Pain Relief Seat Cushion | ₹1.18 L | 84 | 23.1 (20.8) | 37.7 | 62.3 | 33.9 | 9.4 | 5.31 / 3.83 | 1409 (1496) | ret, asp, thin | thin, ret, asp | ✓ |
| Travel Neck Pillow Without Case | ₹1.15 L | 120 | 15.7 (25.0) | 35.5 | 64.5 | 41.5 | 28.1 | 8.81 / 2.85 | 959 (999) | ret | ret | ✓ |
| Mattress Protector - Bamboo Terry Fabric | ₹1.15 L | 64 | — (8.5) | 60.7 | 39.3 | 8.8 | -3.4 | 8.21 / 11.4 | 1792 (2023) | loss, cm1, cogs, gm, asp | loss, cm1, cogs, gm, asp | ✓ |
| Maternity Belt | ₹1.14 L | 115 | 18.8 (20.3) | 28.0 | 72.0 | 37.5 | 17.4 | 6.12 / 3.28 | 987 (992) | ret | ret | ✓ |
| Women's Cloud Comfort Shoes - Slip Ons | ₹1.09 L | 56 | 18.0 (47.5) | 42.1 | 57.9 | 23.5 | 12.4 | 10.92 / 5.18 | 1949 (2303) | ret, asp | ret, asp | ✓ |
| Orthotics Toe Separator | ₹0.74 L | 210 | 8.2 (7.9) | 19.1 | 80.9 | 23.9 | 10.1 | 7.85 / 4.54 | 351 (399) | asp | asp | ✓ |
| Crescent Adjustable Pillow | ₹0.72 L | 67 | 22.2 (20.0) | 52.1 | 47.9 | -25.1 | -37.8 | 10.13 / — | 1080 (1499) | loss, cm1, cogs, ret, asp | loss, cm1, cogs, ret, asp | ✓ |
| Ortho Memory Foam Pillow | ₹0.64 L | 75 | 11.5 (21.3) | 42.4 | 57.6 | 21.2 | 21.2 | 2790.08 / 5.31 | 850 (997) | asp | asp | ✓ |
| Orthotics Sports Elbow Brace | ₹0.53 L | 71 | 27.2 (23.3) | 38.6 | 61.4 | 38.0 | 38.0 | 2790.09 / 3.61 | 747 (786) | ret, retup | ret, retup | ✓ |
| Ball of Foot Cushions | ₹0.38 L | 163 | 1.3 (0.0) | 70.2 | 29.8 | -6.2 | -6.2 | 2790.09 / — | 230 (688) | loss, cm1, cogs, gm, asp | loss, cm1, cogs, gm, asp | ✓ |
| Deep Sleep Pillow Cover | ₹0.19 L | 52 | 20.0 (33.7) | 41.9 | 58.1 | 25.9 | 25.9 | 2789.99 / 4.82 | 371 (398) | ret, asp | ret, asp | ✓ |

</details>

5 random unflagged (checked) products:

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ASP (prev) | Clear? |
|---|---|---|---|---|---|---|---|---|---|
| Orthotics Toe Separator Pro | ₹1.58 L | 326 | 6.2 (—) | 25.8 | 74.2 | 46.8 | 33.2 | 484 (—) | ✓ |
| Hush Ear Plug | ₹1.18 L | 206 | 8.5 (—) | 26.7 | 73.3 | 68.9 | 23.8 | 574 (—) | ✓ |
| Kinesiology Tape | ₹0.79 L | 130 | 1.8 (3.6) | 40.8 | 59.2 | 30.7 | 18.0 | 608 (579) | ✓ |
| Foot Alignment Socks | ₹2.64 L | 499 | 9.7 (18.8) | 25.5 | 74.5 | 52.7 | 27.8 | 530 (549) | ✓ |
| Plantar Fasciitis Pain Relief Ortho Insoles | ₹14.26 L | 1007 | 3.9 (5.7) | 31.5 | 68.5 | 42.0 | 26.2 | 1416 (1489) | ✓ |

### Amazon Seller Central

Bars (Amazon, Flipkart, Myntra): CM1 < 20% · COGS > 45% · GM < 40% · Returns > 15% · CM2 target 10% · ASP down > 5% · Returns up > 3 pts. Materiality: ≥ 1% of gross (₹7.49 L) or ≥ 50 units.

Watchlist header: "6 of 6 rules triggered · 81 products · 84 small products not checked". Products in the table: 177 · checked (material): 93 · flagged: 81. Result: **all flags correct**.

| Rule | Tile count | Rows with the flag | Tile ₹ | Σ of listed products (re-derived) | OK |
|---|---|---|---|---|---|
| CM1 < 20% | 19 | 19 | ₹-3.58 L | ₹-3.59 L | ✓ |
| Returns > 15% | 46 | 46 | ₹-67.90 L | ₹-67.91 L | ✓ |
| COGS > 45% | 28 | 28 | ₹-4.61 L | ₹-4.60 L | ✓ |
| GM < 40% | 2 | 2 | ₹-0.08 L | ₹-0.08 L | ✓ |
| ASP down > 5% | 55 | 55 | ₹-61.98 L | ₹-62.01 L | ✓ |
| Returns up > 3 pts | 12 | 12 | ₹-2.30 L | ₹-2.30 L | ✓ |

<details><summary>Every flagged product</summary>

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ROAS / BE | ASP (prev) | Flags shown | Re-derived | OK |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Orthotics Heel Protector | ₹109.00 L | 13301 | 4.6 (6.0) | 41.8 | 58.2 | 44.3 | — | — / — | 816 (896) | asp | asp | ✓ |
| Active Knee Cap Support | ₹50.57 L | 6382 | 15.1 (17.7) | 39.9 | 60.1 | 42.6 | — | — / — | 792 (883) | ret, asp | ret, asp | ✓ |
| Cold & Hot Therapy Cap | ₹27.13 L | 1929 | 5.1 (5.8) | 26.5 | 73.5 | 50.9 | — | — / — | 1406 (1582) | asp | asp | ✓ |
| Adjustable Wedge Max Cushion | ₹25.67 L | 689 | 14.6 (17.8) | 51.4 | 48.6 | 13.9 | — | — / — | 3726 (3902) | cm1, cogs | cm1, cogs | ✓ |
| Men's Comfort Dual Strap Sandals | ₹24.04 L | 1194 | 22.9 (27.7) | 40.4 | 59.6 | 26.8 | — | — / — | 2013 (2177) | ret, asp | ret, asp | ✓ |
| Cloud Comfort Arch Support Slippers | ₹22.58 L | 2794 | 16.8 (19.3) | 41.0 | 59.0 | 34.2 | — | — / — | 808 (884) | ret, asp | ret, asp | ✓ |
| Arch Support Insoles | ₹22.37 L | 1744 | 8.7 (8.4) | 26.5 | 73.5 | 46.9 | — | — / — | 1282 (1436) | asp | asp | ✓ |
| Dual Gel Insoles | ₹18.80 L | 3053 | 4.5 (5.6) | 45.6 | 54.4 | 31.4 | — | — / — | 616 (682) | cogs, asp | cogs, asp | ✓ |
| Ultimate Mattress Topper - Premium Cover | ₹14.23 L | 173 | 13.4 (29.1) | 47.7 | 52.3 | 23.0 | — | — / — | 8223 (9414) | cogs, asp | cogs, asp | ✓ |
| Ultimate Mattress Topper - Standard cover | ₹14.20 L | 226 | 21.1 (28.6) | 45.7 | 54.3 | 21.4 | — | — / — | 6283 (7365) | cogs, ret, asp | cogs, ret, asp | ✓ |
| Active Casual Sneakers | ₹12.91 L | 399 | 25.5 (40.7) | 33.9 | 66.1 | 55.2 | — | — / — | 3236 (4004) | ret, asp | ret, asp | ✓ |
| Women's Ethnic Comfort Flat Sandal | ₹12.71 L | 949 | 26.4 (32.7) | 51.1 | 48.9 | 17.3 | — | — / — | 1339 (1476) | cm1, cogs, ret, asp | cm1, cogs, ret, asp | ✓ |
| Orthotics Bunion Corrector | ₹12.33 L | 822 | 6.0 (8.4) | 44.6 | 55.4 | 45.3 | — | — / — | 1500 (1838) | asp | asp | ✓ |
| Foldable Travel Wheelchair | ₹12.24 L | 81 | 22.6 (29.3) | 41.7 | 58.3 | 45.4 | — | — / — | 15109 (15998) | ret, asp | ret, asp | ✓ |
| Dual Gel Pro Insoles | ₹12.17 L | 1513 | 7.0 (8.4) | 36.6 | 63.4 | 31.9 | — | — / — | 804 (895) | asp | asp | ✓ |
| Travel Wheelchair | ₹11.06 L | 88 | 13.6 (29.4) | 48.4 | 51.6 | 39.4 | — | — / — | 12571 (12908) | cogs | cogs | ✓ |
| Orthotics Posture Corrector Seat | ₹10.98 L | 387 | 16.8 (28.3) | 32.3 | 67.7 | 39.6 | — | — / — | 2836 (3023) | ret, asp | ret, asp | ✓ |
| Men's Cloud Comfort Sandal | ₹10.87 L | 548 | 28.5 (29.9) | 37.6 | 62.4 | 29.1 | — | — / — | 1983 (2171) | ret, asp | ret, asp | ✓ |
| Orthotics Knee Support Wrap | ₹10.22 L | 1659 | 23.2 (26.4) | 30.3 | 69.7 | 42.0 | — | — / — | 616 (645) | ret | ret | ✓ |
| Women's Cloud Comfort Shoes - Lace ups | ₹10.19 L | 546 | 39.2 (39.9) | 41.0 | 59.0 | 27.1 | — | — / — | 1866 (2012) | ret, asp | ret, asp | ✓ |
| 3D Eye Mask | ₹9.65 L | 1045 | 4.0 (3.3) | 40.2 | 59.8 | 49.1 | — | — / — | 923 (999) | asp | asp | ✓ |
| Anti-Slip Bath Mat | ₹8.84 L | 886 | 5.8 (9.1) | 45.9 | 54.1 | 30.5 | — | — / — | 998 (997) | cogs | cogs | ✓ |
| Cloud Comfort Slippers | ₹8.34 L | 1104 | 20.4 (21.7) | 38.2 | 61.8 | 34.3 | — | — / — | 755 (799) | ret, asp | ret, asp | ✓ |
| Women's Cloud Comfort Sandal | ₹8.18 L | 451 | 30.3 (33.0) | 38.4 | 61.6 | 22.5 | — | — / — | 1814 (1881) | ret | ret | ✓ |
| Others | ₹7.97 L | 319 | 7.0 (3.1) | 49.6 | 50.4 | 50.4 | — | — / — | 2497 (807) | cogs, retup | cogs, retup | ✓ |
| Arch Comfort Slides | ₹7.73 L | 589 | 32.5 (33.0) | 33.2 | 66.8 | 17.1 | — | — / — | 1313 (1373) | cm1, ret | cm1, ret | ✓ |
| Comfort Formal Shoes with Arch | ₹6.23 L | 139 | 17.1 (44.4) | 29.4 | 70.6 | 64.9 | — | — / — | 4479 (4999) | ret, asp | ret, asp | ✓ |
| Comfort Formal Shoes | ₹6.19 L | 155 | 27.5 (44.4) | 33.1 | 66.9 | 57.4 | — | — / — | 3991 (4262) | ret, asp | ret, asp | ✓ |
| Barefoot Shoes - Men's | ₹5.65 L | 150 | 8.9 (0.0) | 37.3 | 62.7 | 57.2 | — | — / — | 3766 (3999) | retup, asp | retup, asp | ✓ |
| Ultimate Car Comfort Bundle | ₹5.62 L | 174 | 19.2 (19.1) | 35.8 | 64.2 | 22.9 | — | — / — | 3232 (3258) | ret | ret | ✓ |
| Ultimate Deep Sleep Pillow | ₹5.18 L | 314 | 20.9 (16.7) | 47.6 | 52.4 | 13.6 | — | — / — | 1650 (1420) | cm1, cogs, ret, retup | cm1, cogs, ret, retup | ✓ |
| Orthotics Sports Knee Cap Support | ₹4.87 L | 515 | 25.4 (26.2) | 38.7 | 61.3 | 38.6 | — | — / — | 945 (995) | ret | ret | ✓ |
| Portable Floor Chair | ₹4.77 L | 125 | 5.1 (0.0) | 48.1 | 51.9 | 34.5 | — | — / — | 3817 (3999) | cogs, retup | cogs, retup | ✓ |
| Travel Neck Pillow | ₹4.75 L | 407 | 13.1 (18.3) | 45.1 | 54.9 | 23.0 | — | — / — | 1167 (1698) | cogs, asp | cogs, asp | ✓ |
| Women's Arch Comfort Sandal - Soft Footbed | ₹4.62 L | 219 | 25.4 (34.7) | 32.6 | 67.4 | 38.0 | — | — / — | 2112 (2199) | ret | ret | ✓ |
| Nasal Strip Pro | ₹4.37 L | 652 | 3.4 (3.8) | 17.5 | 82.5 | 58.1 | — | — / — | 670 (773) | asp | asp | ✓ |
| Nasal Strips | ₹4.34 L | 768 | 3.8 (2.5) | 19.7 | 80.3 | 47.0 | — | — / — | 564 (606) | asp | asp | ✓ |
| Puneri Chappal - Men | ₹4.15 L | 244 | 27.2 (28.3) | 57.2 | 42.8 | 16.9 | — | — / — | 1700 (1867) | cm1, cogs, ret, asp | cm1, cogs, ret, asp | ✓ |
| Premium Neck Contour Cervical Pillow | ₹4.11 L | 264 | 9.9 (16.6) | 38.2 | 61.8 | 41.7 | — | — / — | 1556 (1690) | asp | asp | ✓ |
| Maternity Pillow - Bundle | ₹3.89 L | 174 | 25.4 (23.5) | 36.5 | 63.5 | 20.8 | — | — / — | 2234 (2691) | ret, asp | ret, asp | ✓ |
| Men's Cloud Comfort Shoes - Lace Ups - Arch Footbed | ₹3.14 L | 138 | 27.2 (33.3) | 45.5 | 54.5 | 47.1 | — | — / — | 2276 (2499) | cogs, ret, asp | cogs, ret, asp | ✓ |
| Ultimate Wedge Plus Cushion | ₹3.12 L | 156 | 16.1 (12.0) | 36.3 | 63.7 | 23.7 | — | — / — | 1999 (2381) | ret, retup, asp | ret, retup, asp | ✓ |
| Women's Comfort Flat Sandal | ₹3.09 L | 232 | 36.3 (40.7) | 50.7 | 49.3 | -3.8 | — | — / — | 1332 (1427) | cm1, cogs, ret, asp | cm1, cogs, ret, asp | ✓ |
| Men's Cloud Comfort Shoes - Slip Ons  - Flat Footbed | ₹2.98 L | 148 | 22.5 (30.8) | 51.3 | 48.7 | 34.2 | — | — / — | 2012 (2199) | cogs, ret, asp | cogs, ret, asp | ✓ |
| Orthopedic Heel Pad Insole | ₹2.97 L | 763 | 4.0 (4.1) | 27.4 | 72.6 | 46.7 | — | — / — | 390 (432) | asp | asp | ✓ |
| Wedge Plus Cushion Cover | ₹2.93 L | 437 | 15.1 (13.0) | 30.4 | 69.6 | 33.9 | — | — / — | 671 (667) | ret | ret | ✓ |
| Men's Cloud Comfort Shoes - Lace Ups - Flat Footbed | ₹2.76 L | 135 | 20.7 (31.3) | 50.6 | 49.4 | 37.4 | — | — / — | 2043 (2199) | cogs, ret, asp | cogs, ret, asp | ✓ |
| Active Walking Shoes - Men's | ₹2.68 L | 97 | 36.6 (34.7) | 55.0 | 45.0 | 22.0 | — | — / — | 2764 (3453) | cogs, ret, asp | cogs, ret, asp | ✓ |
| Women's Arch Support Wedge Sandals | ₹2.58 L | 100 | 24.5 (42.0) | 41.1 | 58.9 | 26.9 | — | — / — | 2580 (3363) | ret, asp | ret, asp | ✓ |
| Men's Cloud Comfort Shoes - Slip Ons  - Arch Footbed | ₹2.56 L | 108 | 25.1 (31.0) | 43.1 | 56.9 | 44.7 | — | — / — | 2374 (2499) | ret, asp | ret, asp | ✓ |
| Women's Cloud Comfort Sandal - Toeless | ₹2.55 L | 149 | 34.2 (45.0) | 41.8 | 58.2 | 11.1 | — | — / — | 1714 (1837) | cm1, ret, asp | cm1, ret, asp | ✓ |
| Hot & Cold Therapy Pack | ₹2.52 L | 289 | 10.8 (7.9) | 39.2 | 60.8 | 38.9 | — | — / — | 872 (1057) | asp | asp | ✓ |
| Orthopedic Heel Pad Pro Insole | ₹2.22 L | 403 | 2.8 (2.5) | 16.6 | 83.4 | 67.3 | — | — / — | 550 (594) | asp | asp | ✓ |
| Cloud Backrest Cushion | ₹2.21 L | 112 | 12.4 (22.6) | 48.5 | 51.5 | 21.4 | — | — / — | 1971 (1993) | cogs | cogs | ✓ |
| Active Walking Shoes - Women's | ₹2.03 L | 68 | 28.6 (41.7) | 49.5 | 50.5 | 26.8 | — | — / — | 2990 (3359) | cogs, ret, asp | cogs, ret, asp | ✓ |
| Wedge Plus Cushion + Neck Rest Pillow | ₹1.99 L | 74 | 25.2 (20.3) | 40.6 | 59.4 | 13.0 | — | — / — | 2692 (2727) | cm1, ret, retup | cm1, ret, retup | ✓ |
| Ultimate Neck Contour Cervical Pillow | ₹1.96 L | 219 | 14.2 (23.8) | 50.0 | 50.0 | 12.6 | — | — / — | 896 (1408) | cm1, cogs, asp | cm1, cogs, asp | ✓ |
| Kids Travel Neck Pillow | ₹1.95 L | 197 | 22.4 (15.8) | 39.9 | 60.1 | 33.6 | — | — / — | 990 (997) | ret, retup | ret, retup | ✓ |
| Active Socks | ₹1.91 L | 621 | 3.8 (5.4) | 44.0 | 56.0 | 35.0 | — | — / — | 307 (329) | asp | asp | ✓ |
| AeroDry Bath Mat | ₹1.87 L | 154 | 10.3 (3.2) | 45.5 | 54.5 | 8.4 | — | — / — | 1212 (1600) | cm1, cogs, retup, asp | cm1, cogs, retup, asp | ✓ |
| Walker Prime | ₹1.85 L | 70 | 17.1 (25.9) | 55.5 | 44.5 | 17.2 | — | — / — | 2639 (2693) | cm1, cogs, ret | cm1, cogs, ret | ✓ |
| Arch Support Insoles Rigid + Semi Rigid Combo | ₹1.82 L | 88 | 7.1 (2.9) | 31.9 | 68.1 | 44.3 | — | — / — | 2071 (2291) | retup, asp | retup, asp | ✓ |
| Premium Car Neck Rest Pillow | ₹1.81 L | 113 | 13.4 (14.3) | 28.1 | 71.9 | 45.8 | — | — / — | 1600 (1801) | asp | asp | ✓ |
| Maternity Pillow Bundle Plus | ₹1.79 L | 61 | 11.8 (19.4) | 37.0 | 63.0 | 13.9 | — | — / — | 2929 (2999) | cm1 | cm1 | ✓ |
| Ultimate Pro Seat Cushion | ₹1.55 L | 93 | 22.1 (17.4) | 33.4 | 66.6 | 26.2 | — | — / — | 1663 (1702) | ret, retup | ret, retup | ✓ |
| Gel Max Comfort Insole | ₹1.53 L | 235 | 6.4 (7.2) | 53.0 | 47.0 | 12.9 | — | — / — | 649 (684) | cm1, cogs, asp | cm1, cogs, asp | ✓ |
| Arch Sports Insole | ₹1.53 L | 324 | 7.4 (9.6) | 31.9 | 68.1 | 29.3 | — | — / — | 471 (504) | asp | asp | ✓ |
| Orthotics Kids Posture Seat | ₹1.50 L | 96 | 24.5 (0.0) | 26.9 | 73.1 | 34.5 | — | — / — | 1567 (1599) | ret, retup | ret, retup | ✓ |
| Ultimate Car Neck Rest Pillow | ₹1.45 L | 178 | 13.6 (11.9) | 35.5 | 64.5 | 29.6 | — | — / — | 814 (1181) | asp | asp | ✓ |
| Ultimate Cozy Pillow | ₹1.20 L | 182 | 6.2 (12.1) | 38.4 | 61.6 | 27.3 | — | — / — | 662 (747) | asp | asp | ✓ |
| Travel Neck Pillow Without Case | ₹1.15 L | 120 | 15.7 (25.0) | 35.4 | 64.6 | 41.6 | — | — / — | 959 (999) | ret | ret | ✓ |
| Maternity Belt | ₹1.14 L | 115 | 18.8 (20.3) | 27.9 | 72.1 | 37.6 | — | — / — | 987 (992) | ret | ret | ✓ |
| Ultimate Car Wedge Seat Cushion | ₹1.10 L | 77 | 22.2 (20.7) | 29.3 | 70.7 | 22.9 | — | — / — | 1434 (1492) | ret | ret | ✓ |
| Ultimate Cozy Classic Pillow | ₹0.76 L | 179 | 9.5 (19.0) | 51.6 | 48.4 | -5.8 | — | — / — | 427 (579) | cm1, cogs, asp | cm1, cogs, asp | ✓ |
| Orthotics Toe Separator | ₹0.74 L | 210 | 8.2 (7.9) | 19.0 | 81.0 | 24.1 | — | — / — | 351 (399) | asp | asp | ✓ |
| Crescent Adjustable Pillow | ₹0.72 L | 67 | 22.2 (20.0) | 52.1 | 47.9 | -24.9 | — | — / — | 1080 (1499) | cm1, cogs, ret, asp | cm1, cogs, ret, asp | ✓ |
| Ultimate Car Backrest Cushion | ₹0.71 L | 50 | 17.9 (22.0) | 35.4 | 64.6 | 13.5 | — | — / — | 1428 (1501) | cm1, ret | cm1, ret | ✓ |
| Mattress Protector | ₹0.55 L | 77 | 18.7 (27.8) | 71.4 | 28.6 | -2.2 | — | — / — | 714 (1097) | cm1, cogs, gm, ret, asp | cm1, cogs, gm, ret, asp | ✓ |
| Orthotics Sports Elbow Brace | ₹0.53 L | 71 | 27.2 (23.3) | 38.5 | 61.5 | 38.1 | — | — / — | 747 (786) | ret, retup | ret, retup | ✓ |
| Wedge Neck Rest Pillow | ₹0.46 L | 60 | 16.5 (19.1) | 46.1 | 53.9 | 13.7 | — | — / — | 761 (799) | cm1, cogs, ret | cm1, cogs, ret | ✓ |
| Ball of Foot Cushions | ₹0.38 L | 163 | 1.3 (0.0) | 70.1 | 29.9 | -6.0 | — | — / — | 230 (688) | cm1, cogs, gm, asp | cm1, cogs, gm, asp | ✓ |

</details>

5 random unflagged (checked) products:

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ASP (prev) | Clear? |
|---|---|---|---|---|---|---|---|---|---|
| Plantar Fasciitis Pain Relief Ortho Insoles | ₹14.26 L | 1007 | 3.9 (5.7) | 31.5 | 68.5 | 42.1 | — | 1416 (1489) | ✓ |
| Hush Ear Plug | ₹1.18 L | 206 | 8.5 (—) | 26.6 | 73.4 | 68.9 | — | 574 (—) | ✓ |
| Ultimate Piles Pain Relief Seat Cushion | ₹1.16 L | 76 | 14.3 (18.3) | 38.9 | 61.1 | 30.1 | — | 1520 (1568) | ✓ |
| Foot Alignment Socks | ₹2.64 L | 499 | 9.7 (18.8) | 25.5 | 74.5 | 52.8 | — | 530 (549) | ✓ |
| Kinesiology Tape | ₹0.79 L | 130 | 1.8 (3.6) | 40.8 | 59.2 | 30.8 | — | 608 (579) | ✓ |

### Flipkart

Bars (Amazon, Flipkart, Myntra): CM1 < 20% · COGS > 45% · GM < 40% · Returns > 15% · CM2 target 10% · ASP down > 5% · Returns up > 3 pts. Materiality: ≥ 1% of gross (₹2.73 L) or ≥ 50 units.

Watchlist header: "8 of 8 rules triggered · 50 products · 91 small products not checked". Products in the table: 149 · checked (material): 58 · flagged: 50. Result: **all flags correct**. The one ✗ below is in this check, not the page: CM2 ₹ isn't a table column, so it is re-derived as CM2 % × Net, but on Flipkart CM2 % is measured on product-level covered net (smaller than Net because of the estimated late-report days), which overstates the re-derived sum. The tile itself matches the sum of its 22 listed products exactly (−₹7.56 L vs −₹7.53 L of rounded values, see "Watchlist totals" below).

| Rule | Tile count | Rows with the flag | Tile ₹ | Σ of listed products (re-derived) | OK |
|---|---|---|---|---|---|
| Loss after ads | 22 | 22 | ₹-7.56 L | ₹-9.66 L | ✗ (check artefact, see above) |
| Below healthy ROAS | 15 | 15 | ₹-4.27 L | ₹-4.28 L | ✓ |
| CM1 < 20% | 26 | 26 | ₹-6.76 L | ₹-6.75 L | ✓ |
| Returns > 15% | 13 | 13 | ₹-13.92 L | ₹-13.92 L | ✓ |
| COGS > 45% | 44 | 44 | ₹-16.95 L | ₹-16.94 L | ✓ |
| GM < 40% | 13 | 13 | ₹-1.68 L | ₹-1.68 L | ✓ |
| ASP down > 5% | 9 | 9 | ₹-5.46 L | ₹-5.46 L | ✓ |
| Returns up > 3 pts | 5 | 5 | ₹-0.94 L | ₹-0.94 L | ✓ |

<details><summary>Every flagged product</summary>

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ROAS / BE | ASP (prev) | Flags shown | Re-derived | OK |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Men's Comfort Dual Strap Sandals | ₹46.79 L | 2467 | 15.7 (32.6) | 54.3 | 45.7 | 19.3 | 5.0 | 10.93 / 8.06 | 1897 (1893) | cm1, cogs, ret, thin | thin, cm1, cogs, ret | ✓ |
| Cloud Comfort Arch Support Slippers | ₹28.23 L | 3892 | 13.1 (27.5) | 58.6 | 41.4 | 29.2 | 9.2 | 7.5 / 5.14 | 725 (678) | cogs, thin | thin, cogs | ✓ |
| Ultimate Car Comfort Bundle | ₹22.89 L | 825 | 10.9 (28.0) | 54.3 | 45.7 | 11.5 | 10.8 | 192.8 / 12.93 | 2774 (2688) | cm1, cogs | cm1, cogs | ✓ |
| Ultimate Car Neck Rest Pillow | ₹11.66 L | 1497 | 7.3 (27.4) | 46.9 | 53.1 | 20.8 | 20.1 | 191.04 / 6.79 | 779 (988) | cogs, asp | cogs, asp | ✓ |
| Men's Cloud Comfort Sandal | ₹8.89 L | 463 | 19.0 (43.2) | 51.0 | 49.0 | 22.7 | 4.0 | 8.81 / 7.26 | 1919 (1901) | cogs, ret, thin | thin, cogs, ret | ✓ |
| Orthotics Heel Protector | ₹7.60 L | 903 | 8.5 (17.2) | 50.8 | 49.2 | 15.4 | 3.0 | 11.44 / 9.21 | 842 (843) | cm1, cogs, thin | thin, cm1, cogs | ✓ |
| Arch Comfort Slides | ₹5.96 L | 498 | 14.6 (36.6) | 45.6 | 54.4 | 22.2 | -13.7 | 4.28 / 6.92 | 1196 (1082) | loss, cogs | loss, cogs | ✓ |
| ErgoLuxe Executive Chair | ₹5.88 L | 15 | 17.4 (9.9) | 51.5 | 48.5 | 45.1 | 13.5 | 5.2 / 3.64 | 39232 (35519) | cogs, ret, retup | cogs, ret, retup | ✓ |
| Women's Cloud Comfort Back Strap Sandals | ₹5.87 L | 318 | 14.0 (35.2) | 43.8 | 56.2 | 30.7 | 3.3 | 5.53 / 4.94 | 1847 (1718) | thin | thin | ✓ |
| Adjustable Wedge Max Cushion | ₹5.54 L | 170 | 14.4 (27.5) | 79.3 | 20.7 | 10.5 | 4.2 | 24.86 / 14.91 | 3261 (3451) | cm1, cogs, gm, asp, thin | thin, cm1, cogs, gm, asp | ✓ |
| Ultimate Deep Sleep Pillow | ₹5.14 L | 274 | 11.5 (27.5) | 50.1 | 49.9 | 31.6 | 13.5 | 8.27 / 4.74 | 1878 (1657) | cogs | cogs | ✓ |
| Women's Cloud Comfort Sandal | ₹4.60 L | 275 | 15.4 (35.6) | 52.8 | 47.2 | 13.3 | -4.4 | 8.81 / 11.74 | 1674 (1557) | loss, cm1, cogs, ret | loss, cm1, cogs, ret | ✓ |
| Men's Cloud Comfort Shoes - Slip Ons | ₹4.19 L | 182 | 14.1 (34.5) | 45.8 | 54.2 | 14.7 | -25.8 | 3.76 / 10.39 | 2301 (2098) | loss, cm1, cogs | loss, cm1, cogs | ✓ |
| Ultimate Pro Seating Combo | ₹4.10 L | 166 | 11.4 (23.4) | 60.5 | 39.5 | 0.9 | 0.1 | 192.98 / 162.41 | 2470 (2477) | cm1, cogs, gm, thin | thin, cm1, cogs, gm | ✓ |
| Active Knee Cap Support | ₹3.96 L | 501 | 12.3 (27.5) | 50.4 | 49.6 | 15.9 | 7.7 | 18.13 / 9.31 | 790 (765) | cm1, cogs, thin | thin, cm1, cogs | ✓ |
| Active Walking Shoes - Men's | ₹3.63 L | 115 | 20.4 (54.8) | 60.4 | 39.6 | -1.7 | -28.8 | 6.37 / — | 3156 (3076) | loss, cm1, cogs, gm, ret | loss, cm1, cogs, gm, ret | ✓ |
| Cold & Hot Therapy Cap | ₹3.49 L | 233 | 10.5 (19.7) | 31.0 | 69.0 | 34.0 | 6.4 | 5.27 / 4.28 | 1500 (1430) | thin | thin | ✓ |
| Others | ₹3.48 L | 197 | 3.4 (32.5) | 55.5 | 44.5 | — | — | 1.33 / — | 1769 (1081) | cogs | cogs | ✓ |
| Cloud Comfort Slippers | ₹3.37 L | 501 | 10.8 (27.2) | 54.4 | 45.6 | 36.4 | 5.6 | 4.7 / 3.97 | 673 (606) | cogs, thin | thin, cogs | ✓ |
| 3D Posture Plus Ergonomic Chair | ₹3.36 L | 18 | 1.2 (13.0) | 67.1 | 32.9 | 29.5 | 12.2 | 7.61 / 4.45 | 18685 (21077) | cogs, gm, asp | cogs, gm, asp | ✓ |
| Dual Gel Insoles | ₹3.08 L | 611 | 11.7 (18.4) | 70.2 | 29.8 | 2.5 | -24.6 | 5.57 / 61.31 | 505 (559) | loss, cm1, cogs, gm, asp | loss, cm1, cogs, gm, asp | ✓ |
| Wedge Plus Cushion + Neck Rest Pillow | ₹3.04 L | 129 | 11.5 (24.2) | 59.8 | 40.2 | 25.5 | 24.7 | 192.98 / 5.9 | 2357 (2407) | cogs | cogs | ✓ |
| Active Casual Sneakers | ₹2.57 L | 79 | 16.9 (41.3) | 43.8 | 56.2 | 16.2 | -51.0 | 2.38 / 9.89 | 3251 (3146) | loss, cm1, ret | loss, cm1, ret | ✓ |
| Men's Cloud Comfort Shoes - Lace Ups - Arch Footbed | ₹2.54 L | 98 | 9.7 (15.5) | 50.2 | 49.8 | 26.7 | 14.7 | 12.26 / 5.5 | 2593 (2361) | cogs | cogs | ✓ |
| Premium Car Comfort Bundle | ₹2.45 L | 60 | 12.6 (47.7) | 51.7 | 48.3 | 11.1 | 10.3 | 192.98 / 13.75 | 4082 (3888) | cm1, cogs | cm1, cogs | ✓ |
| Ultimate Car Wedge Seat Cushion | ₹2.35 L | 224 | 9.3 (20.8) | 51.7 | 48.3 | 9.2 | -28.0 | 3.91 / 15.75 | 1050 (1262) | loss, cm1, cogs, asp | loss, cm1, cogs, asp | ✓ |
| Women's Cloud Comfort Sandal - Toeless | ₹2.23 L | 139 | 16.1 (39.8) | 54.1 | 45.9 | 9.5 | -8.4 | 8.81 / 16.62 | 1608 (1570) | loss, cm1, cogs, ret | loss, cm1, cogs, ret | ✓ |
| Women's Arch Comfort Sandal - Soft Footbed | ₹2.20 L | 113 | 10.9 (7.6) | 45.1 | 54.9 | 33.6 | 32.7 | 175.23 / 4.36 | 1944 (1768) | cogs, retup | cogs, retup | ✓ |
| Ultimate Wedge Plus Cushion | ₹2.16 L | 119 | 8.0 (18.1) | 50.2 | 49.8 | 29.0 | -5.1 | 4.15 / 4.89 | 1814 (1887) | loss, cogs | loss, cogs | ✓ |
| Barefoot Shoes - Men's | ₹2.04 L | 50 | 1.9 (—) | 43.2 | 56.8 | 33.7 | 8.4 | 5.24 / 3.93 | 4089 (—) | thin | thin | ✓ |
| Travel Neck Pillow Without Case | ₹1.96 L | 231 | 12.1 (0.0) | 51.2 | 48.8 | 25.8 | 0.8 | 6.08 / 5.89 | 848 (866) | cogs, retup, thin | thin, cogs, retup | ✓ |
| Cloud Backrest Cushion | ₹1.94 L | 103 | 17.1 (42.3) | 68.3 | 31.7 | -5.7 | -14.8 | 17.91 / — | 1888 (1631) | loss, cm1, cogs, gm, ret | loss, cm1, cogs, gm, ret | ✓ |
| Men's Cloud Comfort Shoes - Lace Ups | ₹1.92 L | 84 | 22.3 (37.9) | 47.1 | 52.9 | 17.1 | -1.3 | 9.37 / 10.06 | 2288 (2046) | loss, cm1, cogs, ret | loss, cm1, cogs, ret | ✓ |
| Ultimate Pro Seat Cushion | ₹1.81 L | 146 | 5.3 (22.1) | 56.1 | 43.9 | 11.3 | -53.4 | 2.08 / 11.89 | 1237 (1078) | loss, cm1, cogs | loss, cm1, cogs | ✓ |
| Women's Cloud Comfort Shoes - Lace ups | ₹1.69 L | 96 | 14.1 (46.8) | 54.9 | 45.1 | 4.8 | 3.9 | 160.52 / 31.49 | 1763 (1781) | cm1, cogs, thin | thin, cm1, cogs | ✓ |
| Women's Ethnic Comfort Flat Sandal | ₹1.64 L | 132 | 11.0 (39.0) | 69.0 | 31.0 | -6.5 | -32.2 | 5.66 / — | 1241 (1182) | loss, cm1, cogs, gm | loss, cm1, cogs, gm | ✓ |
| Women's Arch Comfort Wedge Sandals - Buckle Strap | ₹1.60 L | 60 | 23.4 (49.5) | 50.1 | 49.9 | 23.0 | -38.5 | 2.88 / 7.7 | 2661 (2929) | loss, cogs, ret, asp | loss, cogs, ret, asp | ✓ |
| Travel Neck Pillow | ₹1.56 L | 150 | 9.5 (22.7) | 64.9 | 35.1 | 24.5 | -7.3 | 4.59 / 5.97 | 1043 (1363) | loss, cogs, gm, asp | loss, cogs, gm, asp | ✓ |
| Ultimate Car Backrest Cushion | ₹1.50 L | 126 | 13.4 (24.0) | 52.7 | 47.3 | 14.7 | 13.9 | 188.91 / 10.24 | 1192 (1264) | cm1, cogs, asp | cm1, cogs, asp | ✓ |
| Women's Cloud Comfort Shoes - Slip Ons | ₹1.07 L | 54 | 23.1 (58.1) | 51.2 | 48.8 | -5.7 | -54.1 | 3.64 / — | 1979 (1769) | loss, cm1, cogs, ret | loss, cm1, cogs, ret | ✓ |
| Premium Neck Contour Cervical Pillow | ₹1.03 L | 64 | 13.1 (0.0) | 46.9 | 53.1 | 30.1 | 7.8 | 6.92 / 5.12 | 1617 (1471) | cogs, retup, thin | thin, cogs, retup | ✓ |
| Premium Car Neck Rest Pillow | ₹0.99 L | 70 | 10.4 (35.7) | 39.4 | 60.6 | 36.5 | -253.5 | 0.5 / 3.98 | 1421 (1414) | loss | loss | ✓ |
| Orthotics Knee Support Wrap | ₹0.91 L | 146 | 11.7 (31.2) | 38.7 | 61.3 | 28.9 | -5.1 | 4.36 / 5.14 | 623 (548) | loss | loss | ✓ |
| Orthotics Bunion Corrector | ₹0.82 L | 50 | 12.6 (6.3) | 53.1 | 46.9 | 13.4 | -4.7 | 8.23 / 11.15 | 1647 (1647) | loss, cm1, cogs, retup | loss, cm1, cogs, retup | ✓ |
| Women's Comfort Flat Sandal | ₹0.80 L | 64 | 19.3 (47.1) | 72.5 | 27.5 | -12.2 | -62.0 | 3.32 / — | 1249 (1137) | loss, cm1, cogs, gm, ret | loss, cm1, cogs, gm, ret | ✓ |
| Anti-Slip Bath Mat | ₹0.55 L | 63 | 2.9 (13.3) | 65.5 | 34.5 | 22.0 | 1.0 | 6.37 / 6.08 | 871 (809) | cogs, gm, thin | thin, cogs, gm | ✓ |
| Five Toe Socks | ₹0.45 L | 94 | 2.0 (4.7) | 46.0 | 54.0 | 41.0 | 31.2 | 12.98 / 3.1 | 478 (462) | cogs | cogs | ✓ |
| Gel Max Comfort Insole | ₹0.35 L | 56 | 9.3 (34.8) | 69.2 | 30.8 | 2.3 | -48.4 | 2.89 / 64.41 | 626 (567) | loss, cm1, cogs, gm | loss, cm1, cogs, gm | ✓ |
| Gel Cloud Insoles | ₹0.33 L | 96 | 7.0 (16.3) | 68.0 | 32.0 | 4.7 | -21.8 | 5.29 / 29.7 | 342 (294) | loss, cm1, cogs, gm | loss, cm1, cogs, gm | ✓ |
| Ultimate Cozy Classic Pillow | ₹0.29 L | 62 | 25.5 (40.3) | 61.1 | 38.9 | 11.7 | 10.7 | 191.45 / 16.05 | 473 (546) | cm1, cogs, gm, ret, asp | cm1, cogs, gm, ret, asp | ✓ |

</details>

5 random unflagged (checked) products:

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ASP (prev) | Clear? |
|---|---|---|---|---|---|---|---|---|---|
| Ultimate Neck Contour Cervical Pillow | ₹1.07 L | 62 | 9.5 (22.8) | 32.6 | 67.4 | 25.6 | 24.8 | 1732 (1368) | ✓ |
| Arch Support Insoles | ₹1.68 L | 119 | 12.8 (30.0) | 30.2 | 69.8 | 46.1 | 41.9 | 1414 (1434) | ✓ |
| Plantar Fasciitis Pain Relief Ortho Insoles | ₹0.98 L | 66 | 12.5 (23.4) | 37.3 | 62.7 | 41.9 | 22.5 | 1480 (1342) | ✓ |
| Arch Sports Insole | ₹0.56 L | 131 | 10.3 (20.5) | 44.8 | 55.2 | 29.1 | 28.3 | 430 (393) | ✓ |
| Nasal Strip Pro | ₹0.35 L | 63 | 1.7 (11.5) | 23.7 | 76.3 | 49.6 | 49.0 | 552 (491) | ✓ |

### Blinkit

Bars (Blinkit, Instamart, Zepto): CM1 < 18% · COGS > 45% · GM < 35% · Returns > 5% · CM2 target 8% · ASP down > 5% · Returns up > 2 pts. Materiality: ≥ 1% of gross (₹1.64 L) or ≥ 50 units.

Watchlist header: "1 of 6 rules triggered · 4 products". Products in the table: 14 · checked (material): 14 · flagged: 4. Result: **all flags correct**.

| Rule | Tile count | Rows with the flag | Tile ₹ | Σ of listed products (re-derived) | OK |
|---|---|---|---|---|---|
| Loss after ads | 0 | 0 | — | ₹0.00 L | ✓ |
| Below healthy ROAS | 0 | 0 | — | ₹0.00 L | ✓ |
| CM1 < 18% | 4 | 4 | ₹-2.73 L | ₹-2.74 L | ✓ |
| COGS > 45% | 0 | 0 | — | ₹0.00 L | ✓ |
| GM < 35% | 0 | 0 | — | ₹0.00 L | ✓ |
| ASP down > 5% | 0 | 0 | — | ₹0.00 L | ✓ |

<details><summary>Every flagged product</summary>

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ROAS / BE | ASP (prev) | Flags shown | Re-derived | OK |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Ultimate Deep Sleep Pillow | ₹25.89 L | 1606 | — (0.0) | 44.8 | 55.2 | 10.9 | 8.5 | 41.28 / 9.14 | 1612 (1607) | cm1 | cm1 | ✓ |
| Contour Cervical Pillow | ₹21.00 L | 1814 | — (0.0) | 42.8 | 57.2 | 13.9 | 10.3 | 27.81 / 7.2 | 1158 (1158) | cm1 | cm1 | ✓ |
| Dual Gel Insoles | ₹9.96 L | 1566 | — (0.0) | 44.2 | 55.8 | 15.0 | 10.0 | 20.04 / 6.68 | 636 (636) | cm1 | cm1 | ✓ |
| Mattress Protector | ₹8.94 L | 967 | — (0.0) | 42.6 | 57.4 | 15.7 | 15.6 | 3287.41 / 6.38 | 924 (939) | cm1 | cm1 | ✓ |

</details>

5 random unflagged (checked) products:

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ASP (prev) | Clear? |
|---|---|---|---|---|---|---|---|---|---|
| Ultimate Car Neck Rest Pillow | ₹17.28 L | 1343 | — (0.0) | 22.2 | 77.8 | 36.1 | 36.1 | 1286 (1286) | ✓ |
| Ultimate Wedge Plus Cushion | ₹36.03 L | 1830 | — (0.0) | 36.6 | 63.4 | 20.6 | 20.6 | 1969 (1967) | ✓ |
| Active Knee Cap Support | ₹2.90 L | 316 | — (0.0) | 33.6 | 66.4 | 26.1 | 26.1 | 918 (918) | ✓ |
| Travel Neck Pillow | ₹25.16 L | 1456 | — (0.0) | 30.6 | 69.4 | 28.8 | 23.5 | 1728 (1728) | ✓ |
| Orthotics Heel Protector | ₹0.96 L | 109 | — (—) | 38.3 | 61.7 | 21.2 | 20.2 | 882 (—) | ✓ |

### CRED

Bars (CRED, Firstcry): CM1 < 20% · COGS > 45% · GM < 40% · Returns > 10% · CM2 target 10% · ASP down > 5% · Returns up > 3 pts. Materiality: ≥ 1% of gross (₹0.13 L) or ≥ 50 units.

Watchlist header: "4 of 5 rules triggered · 7 products · 39 small products not checked". Products in the table: 48 · checked (material): 9 · flagged: 7. Result: **all flags correct**.

| Rule | Tile count | Rows with the flag | Tile ₹ | Σ of listed products (re-derived) | OK |
|---|---|---|---|---|---|
| Returns > 10% | 0 | 0 | — | ₹0.00 L | ✓ |
| COGS > 45% | 6 | 6 | ₹-0.69 L | ₹-0.69 L | ✓ |
| GM < 40% | 1 | 1 | ₹-0.01 L | ₹-0.01 L | ✓ |
| ASP down > 5% | 2 | 2 | ₹-0.99 L | ₹-0.99 L | ✓ |
| Returns up > 3 pts | 1 | 1 | ₹-0.01 L | ₹-0.01 L | ✓ |

<details><summary>Every flagged product</summary>

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ROAS / BE | ASP (prev) | Flags shown | Re-derived | OK |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Men's Cloud Comfort Shoes - Lace Ups | ₹3.39 L | 226 | — (—) | 56.3 | 43.7 | — | — | — / — | 1499 (—) | cogs | cogs | ✓ |
| Ultimate Wedge Plus Cushion | ₹3.12 L | 201 | — (0.0) | 48.8 | 51.2 | — | — | — / — | 1551 (1706) | cogs, asp | cogs, asp | ✓ |
| Women's Comfort Flat Sandal | ₹2.26 L | 168 | — (0.0) | 51.6 | 48.4 | — | — | — / — | 1345 (1749) | cogs, asp | cogs, asp | ✓ |
| Orthotics Heel Protector | ₹0.34 L | 54 | 1.8 (2.1) | 54.8 | 45.2 | — | — | — / — | 625 (594) | cogs | cogs | ✓ |
| Orthotics Knee Support Wrap | ₹0.31 L | 62 | 6.2 (1.6) | 36.8 | 63.2 | — | — | — / — | 496 (506) | retup | retup | ✓ |
| Cuddle Sleep Pillow | ₹0.22 L | 12 | — (1.8) | 66.8 | 33.2 | — | — | — / — | 1832 (1502) | cogs, gm | cogs, gm | ✓ |
| Ultimate Back Lumbar Cushion | ₹0.14 L | 14 | — (—) | 59.4 | 40.6 | — | — | — / — | 1028 (—) | cogs | cogs | ✓ |

</details>

5 random unflagged (checked) products:

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ASP (prev) | Clear? |
|---|---|---|---|---|---|---|---|---|---|
| Men's Comfort Dual Strap Sandals | ₹0.74 L | 42 | 4.1 (4.0) | 44.9 | 55.1 | — | — | 1763 (1604) | ✓ |
| Active Casual Sneakers - Men's | ₹0.13 L | 4 | — (0.0) | 38.0 | 62.0 | — | — | 3249 (3166) | ✓ |

### Offline

Bars (EBO, Offline): CM1 < 30% · COGS > 45% · GM < 45% · Returns > 10% · CM2 target —% · ASP down > 5% · Returns up > 3 pts. Materiality: ≥ 1% of gross (₹4.78 L) or ≥ 50 units.

Watchlist header: "6 of 6 rules triggered · 41 products · 122 small products not checked". Products in the table: 165 · checked (material): 43 · flagged: 41. Result: **all flags correct**.

| Rule | Tile count | Rows with the flag | Tile ₹ | Σ of listed products (re-derived) | OK |
|---|---|---|---|---|---|
| CM1 < 30% | 29 | 29 | ₹-48.34 L | ₹-48.35 L | ✓ |
| Returns > 10% | 8 | 8 | ₹-50.22 L | ₹-50.35 L | ✓ |
| COGS > 45% | 38 | 38 | ₹-95.14 L | ₹-95.19 L | ✓ |
| GM < 45% | 34 | 34 | ₹-64.52 L | ₹-64.57 L | ✓ |
| ASP down > 5% | 18 | 18 | ₹-106.00 L | ₹-106.50 L | ✓ |
| Returns up > 3 pts | 9 | 9 | ₹-40.88 L | ₹-40.99 L | ✓ |

<details><summary>Every flagged product</summary>

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ROAS / BE | ASP (prev) | Flags shown | Re-derived | OK |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Others | ₹132.00 L | 1991 | 35.5 (6.7) | 63.5 | 36.5 | 34.7 | — | — / — | 6611 (1782) | cogs, gm, ret, retup | cogs, gm, ret, retup | ✓ |
| Travel Neck Pillow | ₹61.30 L | 8246 | 2.6 (0.5) | 82.2 | 17.8 | 11.0 | — | — / — | 743 (808) | cm1, cogs, gm, asp | cm1, cogs, gm, asp | ✓ |
| 3D Eye Mask | ₹34.95 L | 8304 | 1.0 (0.0) | 99.2 | 0.8 | -7.2 | — | — / — | 421 (672) | cm1, cogs, gm, asp | cm1, cogs, gm, asp | ✓ |
| 3D Posture Plus Ergonomic Chair | ₹29.20 L | 190 | — (0.9) | 72.8 | 27.2 | 9.9 | — | — / — | 15369 (16347) | cm1, cogs, gm, asp | cm1, cogs, gm, asp | ✓ |
| ErgoLuxe Executive Chair | ₹21.36 L | 65 | 3.2 (0.0) | 56.0 | 44.0 | 34.2 | — | — / — | 32863 (33087) | cogs, gm, retup | cogs, gm, retup | ✓ |
| Orthotics Heel Protector | ₹13.74 L | 2960 | 0.2 (0.8) | 83.8 | 16.2 | 7.7 | — | — / — | 464 (510) | cm1, cogs, gm, asp | cm1, cogs, gm, asp | ✓ |
| Ultimate Car Comfort Bundle | ₹11.07 L | 518 | 0.1 (7.5) | 61.0 | 39.0 | 24.0 | — | — / — | 2137 (3173) | cm1, cogs, gm, asp | cm1, cogs, gm, asp | ✓ |
| Prime Plus Electric Wheelchair | ₹10.17 L | 14 | 12.0 (12.1) | 73.5 | 26.5 | 23.4 | — | — / — | 72650 (68200) | cm1, cogs, gm, ret | cm1, cogs, gm, ret | ✓ |
| Foldable Electric Wheelchair | ₹9.18 L | 27 | — (0.0) | 82.3 | 17.7 | 12.8 | — | — / — | 34018 (35733) | cm1, cogs, gm | cm1, cogs, gm | ✓ |
| Ultimate Lap Desk Pillow | ₹7.85 L | 374 | 1.3 (22.1) | 85.2 | 14.8 | -13.6 | — | — / — | 2099 (2642) | cm1, cogs, gm, asp | cm1, cogs, gm, asp | ✓ |
| Cloud Backrest Cushion | ₹7.70 L | 619 | — (0.9) | 84.7 | 15.3 | 9.4 | — | — / — | 1244 (1343) | cm1, cogs, gm, asp | cm1, cogs, gm, asp | ✓ |
| AeroMesh Ergo Chair | ₹7.55 L | 52 | — (0.0) | 69.2 | 30.8 | 14.9 | — | — / — | 14523 (15345) | cm1, cogs, gm, asp | cm1, cogs, gm, asp | ✓ |
| Heavy Duty Recliner Electric Wheelchair | ₹7.03 L | 11 | 8.4 (0.0) | 69.6 | 30.4 | 25.8 | — | — / — | 63891 (58650) | cm1, cogs, gm, retup | cm1, cogs, gm, retup | ✓ |
| AeroMesh Classic Ergo Chair - With Headrest | ₹6.10 L | 45 | — (0.0) | 47.5 | 52.5 | 37.8 | — | — / — | 13566 (10814) | cogs | cogs | ✓ |
| Carbon Fiber Electric Wheelchair | ₹5.80 L | 6 | — (0.0) | 84.0 | 16.0 | 13.8 | — | — / — | 96600 (107100) | cm1, cogs, gm, asp | cm1, cogs, gm, asp | ✓ |
| Ultimate Pro Seating Combo | ₹5.14 L | 273 | — (0.0) | 69.1 | 30.9 | 17.4 | — | — / — | 1882 (2360) | cm1, cogs, gm, asp | cm1, cogs, gm, asp | ✓ |
| Ultimate Deep Sleep Pillow | ₹4.51 L | 335 | 14.5 (4.2) | 71.8 | 28.2 | 12.4 | — | — / — | 1348 (1220) | cm1, cogs, gm, ret, retup | cm1, cogs, gm, ret, retup | ✓ |
| Five Finger Neck Massager | ₹4.19 L | 124 | — (0.0) | 82.9 | 17.1 | 12.9 | — | — / — | 3377 (2430) | cm1, cogs, gm | cm1, cogs, gm | ✓ |
| Everyday Foldable Wheelchair | ₹4.04 L | 99 | 16.6 (0.0) | 96.5 | 3.5 | -29.1 | — | — / — | 4084 (3464) | cm1, cogs, gm, ret, retup | cm1, cogs, gm, ret, retup | ✓ |
| Cloud Comfort Arch Support Slippers | ₹3.85 L | 312 | 5.7 (199.6) | 74.4 | 25.6 | 15.8 | — | — / — | 1234 (—) | cm1, cogs, gm | cm1, cogs, gm | ✓ |
| Men's Comfort Dual Strap Sandals | ₹3.60 L | 264 | 5.2 (151.9) | 70.4 | 29.6 | 24.6 | — | — / — | 1364 (—) | cm1, cogs, gm | cm1, cogs, gm | ✓ |
| Lumbo Sacral Belt | ₹3.38 L | 284 | 12.6 (2.5) | 69.5 | 30.5 | 25.6 | — | — / — | 1188 (1065) | cm1, cogs, gm, ret, retup | cm1, cogs, gm, ret, retup | ✓ |
| Adjustable Wedge Max Cushion | ₹3.18 L | 118 | — (0.0) | 80.0 | 20.0 | 10.9 | — | — / — | 2697 (2220) | cm1, cogs, gm | cm1, cogs, gm | ✓ |
| Contour Cervical Pillow | ₹2.86 L | 379 | 2.6 (—) | 77.8 | 22.2 | 6.7 | — | — / — | 754 (—) | cm1, cogs, gm | cm1, cogs, gm | ✓ |
| Ultimate Car Neck Rest Pillow | ₹2.75 L | 412 | 4.4 (0.3) | 52.3 | 47.7 | 37.2 | — | — / — | 667 (601) | cogs, retup | cogs, retup | ✓ |
| Ultimate Car Backrest Cushion | ₹2.18 L | 225 | 0.7 (0.0) | 59.5 | 40.5 | 30.9 | — | — / — | 970 (1028) | cogs, gm, asp | cogs, gm, asp | ✓ |
| Men's Cloud Comfort Sandal | ₹1.24 L | 91 | 11.7 (369.9) | 79.9 | 20.1 | 14.5 | — | — / — | 1368 (—) | cm1, cogs, gm, ret | cm1, cogs, gm, ret | ✓ |
| Portable Travel Seat Cushion | ₹0.87 L | 111 | — (0.0) | 53.4 | 46.6 | 38.4 | — | — / — | 787 (779) | cogs | cogs | ✓ |
| Dual Gel Insoles | ₹0.81 L | 200 | — (67.5) | 78.7 | 21.3 | 11.5 | — | — / — | 405 (33466) | cm1, cogs, gm, asp | cm1, cogs, gm, asp | ✓ |
| Orthopedic Heel Pad Insole | ₹0.69 L | 185 | 2.3 (43.2) | 34.5 | 65.5 | 55.8 | — | — / — | 376 (422) | asp | asp | ✓ |
| Orthotics Knee Support Wrap | ₹0.64 L | 151 | 14.5 (0.9) | 58.6 | 41.4 | 31.6 | — | — / — | 422 (428) | cogs, gm, ret, retup | cogs, gm, ret, retup | ✓ |
| Arch Comfort Slides | ₹0.57 L | 74 | 4.0 (2.8) | 68.4 | 31.6 | 23.3 | — | — / — | 776 (806) | cm1, cogs, gm | cm1, cogs, gm | ✓ |
| Nasal Strip Pro | ₹0.55 L | 2836 | — (0.0) | 598.7 | -498.7 | -642.5 | — | — / — | 19 (24) | cm1, cogs, gm, asp | cm1, cogs, gm, asp | ✓ |
| Hot and Cold Therapy Knee Wrap | ₹0.47 L | 62 | — (2.9) | 69.9 | 30.1 | 24.1 | — | — / — | 761 (804) | cm1, cogs, gm, asp | cm1, cogs, gm, asp | ✓ |
| Orthotics Posture Corrector | ₹0.42 L | 85 | 69.4 (48.8) | 155.7 | -55.7 | -85.9 | — | — / — | 493 (547) | cm1, cogs, gm, ret, retup, asp | cm1, cogs, gm, ret, retup, asp | ✓ |
| Mouse Wrist Support | ₹0.38 L | 85 | — (0.0) | 39.3 | 60.7 | 52.6 | — | — / — | 451 (538) | asp | asp | ✓ |
| Orthotics Sports Elbow Brace | ₹0.35 L | 75 | — (0.0) | 70.9 | 29.1 | 21.7 | — | — / — | 462 (468) | cm1, cogs, gm | cm1, cogs, gm | ✓ |
| Cloud Comfort Slippers | ₹0.32 L | 60 | 0.8 (1368.8) | 60.7 | 39.3 | 31.3 | — | — / — | 532 (—) | cogs, gm | cogs, gm | ✓ |
| Orthotics Toe Separator | ₹0.17 L | 80 | — (30.9) | 35.6 | 64.4 | 47.8 | — | — / — | 214 (352) | asp | asp | ✓ |
| Orthotics Bamboo Knee Cap | ₹0.17 L | 62 | — (0.0) | 48.1 | 51.9 | 40.4 | — | — / — | 273 (272) | cogs | cogs | ✓ |
| Nasal Strips | ₹0.05 L | 315 | — (243.8) | 763.3 | -663.3 | -866.0 | — | — / — | 15 (—) | cm1, cogs, gm | cm1, cogs, gm | ✓ |

</details>

5 random unflagged (checked) products:

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ASP (prev) | Clear? |
|---|---|---|---|---|---|---|---|---|---|
| Orthotics Posture Corrector Pro | ₹2.14 L | 378 | — (0.6) | 40.4 | 59.6 | 52.1 | — | 565 (552) | ✓ |
| Cold & Hot Therapy Cap | ₹8.31 L | 869 | 0.4 (0.0) | 43.9 | 56.1 | 51.4 | — | 956 (980) | ✓ |

### EBO

Bars (EBO, Offline): CM1 < 30% · COGS > 45% · GM < 45% · Returns > 10% · CM2 target —% · ASP down > 5% · Returns up > 3 pts. Materiality: ≥ 1% of gross (₹2.92 L) or ≥ 50 units.

Watchlist header: "6 of 6 rules triggered · 46 products · 138 small products not checked". Products in the table: 198 · checked (material): 60 · flagged: 46. Result: **all flags correct**.

| Rule | Tile count | Rows with the flag | Tile ₹ | Σ of listed products (re-derived) | OK |
|---|---|---|---|---|---|
| CM1 < 30% | 5 | 5 | ₹-0.90 L | ₹-0.90 L | ✓ |
| Returns > 10% | 14 | 14 | ₹-15.19 L | ₹-15.18 L | ✓ |
| COGS > 45% | 27 | 27 | ₹-8.65 L | ₹-8.64 L | ✓ |
| GM < 45% | 5 | 5 | ₹-1.19 L | ₹-1.19 L | ✓ |
| ASP down > 5% | 26 | 26 | ₹-7.55 L | ₹-7.55 L | ✓ |
| Returns up > 3 pts | 8 | 8 | ₹-4.48 L | ₹-4.47 L | ✓ |

<details><summary>Every flagged product</summary>

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ROAS / BE | ASP (prev) | Flags shown | Re-derived | OK |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ErgoLuxe Executive Chair | ₹28.86 L | 91 | 5.2 (3.0) | 49.8 | 50.2 | 38.1 | 36.6 | — / — | 31714 (33013) | cogs | cogs | ✓ |
| Mobility Transfer Lift | ₹15.51 L | 48 | 16.6 (24.3) | 41.8 | 58.2 | 49.0 | 47.5 | — / — | 32316 (32138) | ret | ret | ✓ |
| Vajra Gaming Chair | ₹14.49 L | 30 | 4.4 (13.6) | 51.2 | 48.8 | 42.3 | 40.8 | — / — | 48290 (44898) | cogs | cogs | ✓ |
| Carbon Fiber X Electric Wheelchair | ₹10.94 L | 8 | 6.9 (13.6) | 46.7 | 53.3 | 51.5 | 50.0 | — / — | 136800 (136281) | cogs | cogs | ✓ |
| AeroMesh Ergo Chair | ₹9.43 L | 60 | 17.8 (23.4) | 52.3 | 47.7 | 26.2 | 24.7 | — / — | 15723 (15452) | cm1, cogs, ret | cm1, cogs, ret | ✓ |
| Carbon Fiber Electric Wheelchair | ₹9.29 L | 8 | 9.7 (14.4) | 62.4 | 37.6 | 35.5 | 34.0 | — / — | 116125 (124369) | cogs, gm, asp | cogs, gm, asp | ✓ |
| Prime Plus Electric Wheelchair | ₹8.47 L | 12 | 19.0 (18.9) | 58.4 | 41.6 | 38.4 | 36.9 | — / — | 70569 (71904) | cogs, gm, ret | cogs, gm, ret | ✓ |
| Men's Comfort Dual Strap Sandals | ₹8.10 L | 395 | 6.9 (4.1) | 40.0 | 60.0 | 51.3 | 49.8 | — / — | 2051 (2237) | asp | asp | ✓ |
| Ergoluxe Electric Standing Desk | ₹7.80 L | 24 | 10.1 (0.0) | 51.9 | 48.1 | 42.7 | 41.2 | — / — | 32511 (33634) | cogs, ret, retup | cogs, ret, retup | ✓ |
| Cloud Comfort Arch Support Slippers | ₹7.04 L | 816 | 1.0 (1.3) | 38.4 | 61.6 | 48.2 | 46.7 | — / — | 863 (910) | asp | asp | ✓ |
| 3D Posture Plus Ergonomic Chair | ₹6.59 L | 38 | 20.3 (3.9) | 57.4 | 42.6 | 20.9 | 19.4 | — / — | 17335 (19502) | cm1, cogs, gm, ret, retup, asp | cm1, cogs, gm, ret, retup, asp | ✓ |
| Adjustable Wedge Max Cushion | ₹6.21 L | 175 | 8.8 (9.3) | 53.9 | 46.1 | 34.1 | 32.6 | — / — | 3549 (3644) | cogs | cogs | ✓ |
| Prime Electric Wheelchair | ₹5.99 L | 9 | 20.0 (0.0) | 51.0 | 49.0 | 45.0 | 43.5 | — / — | 66611 (65802) | cogs, ret, retup | cogs, ret, retup | ✓ |
| Heavy Duty Recliner Electric Wheelchair | ₹5.45 L | 8 | 38.2 (26.3) | 52.8 | 47.2 | 40.3 | 38.8 | — / — | 68156 (68312) | cogs, ret, retup | cogs, ret, retup | ✓ |
| Embrace Ergo Chair | ₹4.88 L | 22 | — (3.9) | 46.5 | 53.5 | 43.6 | 42.1 | — / — | 22173 (22882) | cogs | cogs | ✓ |
| Men's Cloud Comfort Sandal | ₹4.50 L | 217 | 1.7 (2.7) | 37.1 | 62.9 | 55.0 | 53.5 | — / — | 2072 (2202) | asp | asp | ✓ |
| Ultimate Deep Sleep Pillow | ₹4.35 L | 290 | 4.7 (7.3) | 51.3 | 48.7 | 31.0 | 29.5 | — / — | 1499 (1608) | cogs, asp | cogs, asp | ✓ |
| Foldable Electric Wheelchair | ₹4.00 L | 10 | 11.8 (34.8) | 62.1 | 37.9 | 32.8 | 31.3 | — / — | 40005 (38333) | cogs, gm, ret | cogs, gm, ret | ✓ |
| Cruise Mobility Scooter | ₹3.73 L | 7 | — (—) | 50.2 | 49.8 | 45.7 | 44.2 | — / — | 53272 (—) | cogs | cogs | ✓ |
| Ergoluxe Studio Chair | ₹3.47 L | 14 | 5.1 (6.2) | 51.3 | 48.7 | 32.1 | 30.6 | — / — | 24762 (26670) | cogs, asp | cogs, asp | ✓ |
| Cold & Hot Therapy Cap | ₹3.46 L | 250 | 1.2 (1.5) | 27.0 | 73.0 | 66.3 | 64.8 | — / — | 1385 (1508) | asp | asp | ✓ |
| Ultimate Car Neck Rest Pillow | ₹3.15 L | 340 | 1.7 (0.8) | 31.4 | 68.6 | 51.3 | 49.8 | — / — | 927 (992) | asp | asp | ✓ |
| Travel Wheelchair | ₹3.13 L | 29 | 14.9 (28.8) | 56.2 | 43.8 | 32.8 | 31.3 | — / — | 10795 (12014) | cogs, gm, ret, asp | cogs, gm, ret, asp | ✓ |
| Smart Recliner Mattress | ₹2.97 L | 9 | 68.4 (51.8) | 54.7 | 45.3 | 19.9 | 18.4 | — / — | 32995 (31491) | cm1, cogs, ret, retup | cm1, cogs, ret, retup | ✓ |
| Women's Arch Comfort Sandals | ₹2.94 L | 148 | 1.5 (2.2) | 35.7 | 64.3 | 57.9 | 56.4 | — / — | 1986 (2097) | asp | asp | ✓ |
| Ultimate Neck Contour Cervical Plus Pillow | ₹2.40 L | 163 | 5.5 (7.0) | 45.5 | 54.5 | 29.1 | 27.6 | — / — | 1473 (1597) | cm1, cogs, asp | cm1, cogs, asp | ✓ |
| Lumbo Sacral Belt | ₹2.19 L | 162 | 5.6 (6.3) | 39.7 | 60.3 | 53.6 | 52.2 | — / — | 1352 (1531) | asp | asp | ✓ |
| Ultimate Car Backrest Cushion | ₹2.12 L | 182 | 1.0 (3.3) | 43.6 | 56.4 | 38.7 | 37.2 | — / — | 1163 (1230) | asp | asp | ✓ |
| Women's Arch Comfort Wedge Sandals - Buckle Strap | ₹2.04 L | 82 | 2.2 (5.9) | 41.0 | 59.0 | 53.6 | 52.1 | — / — | 2486 (3284) | asp | asp | ✓ |
| Cloud Seating Combo | ₹1.94 L | 61 | 14.8 (12.0) | 48.6 | 51.4 | 39.7 | 38.2 | — / — | 3180 (3356) | cogs, ret, asp | cogs, ret, asp | ✓ |
| Cloud Backrest Cushion | ₹1.82 L | 97 | 3.7 (7.4) | 51.2 | 48.8 | 38.8 | 37.3 | — / — | 1877 (1903) | cogs | cogs | ✓ |
| Women's Cloud Comfort Sandal - Toeless | ₹1.71 L | 96 | 3.8 (3.0) | 39.1 | 60.9 | 51.6 | 50.1 | — / — | 1781 (1893) | asp | asp | ✓ |
| Ultimate Lap Desk Pillow | ₹1.53 L | 50 | 20.4 (19.9) | 52.5 | 47.5 | 15.8 | 14.3 | — / — | 3056 (2835) | cm1, cogs, ret | cm1, cogs, ret | ✓ |
| Active Walking Shoes - Men's | ₹1.51 L | 55 | — (0.0) | 51.0 | 49.0 | 42.3 | 40.8 | — / — | 2747 (2859) | cogs | cogs | ✓ |
| Ultimate Car Comfort Bundle | ₹1.42 L | 50 | 14.1 (4.0) | 40.8 | 59.2 | 40.7 | 39.2 | — / — | 2844 (2918) | ret, retup | ret, retup | ✓ |
| Women's Arch Support Wedge Sandals | ₹1.42 L | 57 | 3.3 (9.6) | 43.2 | 56.8 | 50.0 | 48.5 | — / — | 2492 (3389) | asp | asp | ✓ |
| Ultimate Car Wedge Seat Cushion | ₹1.38 L | 123 | 1.6 (0.0) | 37.5 | 62.5 | 42.9 | 41.4 | — / — | 1122 (1213) | asp | asp | ✓ |
| Women's Cloud Comfort Back Strap Sandals | ₹1.38 L | 71 | 2.5 (4.9) | 33.2 | 66.8 | 60.1 | 58.6 | — / — | 1942 (2125) | asp | asp | ✓ |
| Travel Neck Pillow | ₹1.26 L | 111 | 7.4 (4.0) | 46.2 | 53.8 | 41.3 | 39.8 | — / — | 1136 (1431) | cogs, retup, asp | cogs, retup, asp | ✓ |
| Premium Car Neck Rest Pillow | ₹1.15 L | 80 | 12.5 (5.2) | 31.7 | 68.3 | 54.7 | 53.2 | — / — | 1434 (1580) | ret, retup, asp | ret, retup, asp | ✓ |
| Orthotics Knee Support Wrap | ₹0.94 L | 152 | 2.4 (0.0) | 29.6 | 70.4 | 58.5 | 57.0 | — / — | 620 (683) | asp | asp | ✓ |
| Women's Ethnic Comfort Flat Sandal | ₹0.78 L | 56 | — (5.8) | 47.5 | 52.5 | 41.5 | 40.0 | — / — | 1402 (1620) | cogs, asp | cogs, asp | ✓ |
| Premium Car Backrest Cushion | ₹0.75 L | 50 | — (3.8) | 44.1 | 55.9 | 42.1 | 40.6 | — / — | 1494 (1678) | asp | asp | ✓ |
| 3D Eye Mask | ₹0.71 L | 91 | 2.2 (1.0) | 47.9 | 52.1 | 42.4 | 40.9 | — / — | 777 (780) | cogs | cogs | ✓ |
| Gel Max Comfort Insole | ₹0.68 L | 100 | — (0.0) | 50.4 | 49.6 | 37.6 | 36.1 | — / — | 684 (685) | cogs | cogs | ✓ |
| Nasal Strip Pro | ₹0.44 L | 63 | 0.5 (1.1) | 18.7 | 81.3 | 70.6 | 69.1 | — / — | 694 (762) | asp | asp | ✓ |

</details>

5 random unflagged (checked) products:

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ASP (prev) | Clear? |
|---|---|---|---|---|---|---|---|---|---|
| Cloud Seat Cushion | ₹1.00 L | 58 | 4.8 (6.9) | 41.0 | 59.0 | 45.2 | 43.7 | 1727 (1746) | ✓ |
| Latex Pillow with Cooling Cover | ₹2.75 L | 97 | 1.0 (3.5) | 43.6 | 56.4 | 46.3 | 44.8 | 2836 (2808) | ✓ |
| Arch Comfort Slides | ₹1.72 L | 131 | 1.2 (2.5) | 33.5 | 66.5 | 53.8 | 52.3 | 1311 (1308) | ✓ |
| Orthotics Sports Knee Cap Support | ₹0.56 L | 58 | — (0.0) | 38.0 | 62.0 | 53.9 | 52.4 | 959 (968) | ✓ |
| Orthotics Heel Protector | ₹7.10 L | 896 | 0.5 (0.9) | 43.1 | 56.9 | 46.1 | 44.6 | 792 (823) | ✓ |


## 2. Watchlist totals = sum of the listed products

Mobile (Pixel 412), page default range, live API. For every rule: the tile's ₹ impact and count vs the products in its full-screen list (all pages loaded) and the sum of their ₹ values as displayed (each rounded to 2 decimals of L/Cr/K, so the tolerance is the rounding of the listed values).

| Tab | Rule | Tile count | Listed | Tile ₹ | Σ listed ₹ | OK |
|---|---|---|---|---|---|---|
| D2C | Loss after ads | 42 | 42 | −₹43.38 L | ₹-43.36 L | ✓ |
| D2C | Below healthy ROAS | 51 | 51 | −₹59.74 L | ₹-59.72 L | ✓ |
| D2C | CM1 < 30% | 42 | 42 | −₹36.99 L | ₹-36.98 L | ✓ |
| D2C | Returns > 20% | 58 | 58 | −₹1.63 Cr | ₹-163.39 L | ✓ |
| D2C | COGS > 50% | 32 | 32 | −₹21.53 L | ₹-21.53 L | ✓ |
| D2C | GM < 50% | 32 | 32 | −₹21.53 L | ₹-21.53 L | ✓ |
| D2C | ASP down > 5% | 63 | 63 | −₹1.87 Cr | ₹-187.50 L | ✓ |
| D2C | Returns up > 3 pts | 11 | 11 | −₹8.02 L | ₹-8.02 L | ✓ |
| Amazon Overall | Loss after ads | 15 | 15 | −₹5.02 L | ₹-5.03 L | ✓ |
| Amazon Overall | Below healthy ROAS | 23 | 23 | −₹8.60 L | ₹-8.60 L | ✓ |
| Amazon Overall | CM1 < 20% | 29 | 29 | −₹14.33 L | ₹-14.34 L | ✓ |
| Amazon Overall | Returns > 15% | 49 | 49 | −₹81.67 L | ₹-81.67 L | ✓ |
| Amazon Overall | COGS > 45% | 37 | 37 | −₹21.54 L | ₹-21.54 L | ✓ |
| Amazon Overall | GM < 40% | 3 | 3 | −₹54.90 K | ₹-0.55 L | ✓ |
| Amazon Overall | ASP down > 5% | 90 | 90 | −₹2.68 Cr | ₹-267.53 L | ✓ |
| Amazon Overall | Returns up > 3 pts | 10 | 10 | −₹2.22 L | ₹-2.23 L | ✓ |
| Amazon SC | CM1 < 20% | 19 | 19 | −₹3.58 L | ₹-3.58 L | ✓ |
| Amazon SC | Returns > 15% | 46 | 46 | −₹67.90 L | ₹-67.89 L | ✓ |
| Amazon SC | COGS > 45% | 28 | 28 | −₹4.61 L | ₹-4.61 L | ✓ |
| Amazon SC | GM < 40% | 2 | 2 | −₹8.05 K | ₹-0.08 L | ✓ |
| Amazon SC | ASP down > 5% | 55 | 55 | −₹61.98 L | ₹-61.98 L | ✓ |
| Amazon SC | Returns up > 3 pts | 12 | 12 | −₹2.30 L | ₹-2.30 L | ✓ |
| Flipkart | Loss after ads | 22 | 22 | −₹7.56 L | ₹-7.57 L | ✓ |
| Flipkart | Below healthy ROAS | 15 | 15 | −₹4.27 L | ₹-4.27 L | ✓ |
| Flipkart | CM1 < 20% | 26 | 26 | −₹6.76 L | ₹-6.76 L | ✓ |
| Flipkart | Returns > 15% | 13 | 13 | −₹13.92 L | ₹-13.93 L | ✓ |
| Flipkart | COGS > 45% | 44 | 44 | −₹16.95 L | ₹-16.95 L | ✓ |
| Flipkart | GM < 40% | 13 | 13 | −₹1.68 L | ₹-1.68 L | ✓ |
| Flipkart | ASP down > 5% | 9 | 9 | −₹5.46 L | ₹-5.47 L | ✓ |
| Flipkart | Returns up > 3 pts | 5 | 5 | −₹94.08 K | ₹-0.94 L | ✓ |
| Blinkit | Loss after ads | 0 | — | — | — | ✓ (all clear) |
| Blinkit | Below healthy ROAS | 0 | — | — | — | ✓ (all clear) |
| Blinkit | CM1 < 18% | 4 | 4 | −₹2.73 L | ₹-2.73 L | ✓ |
| Blinkit | COGS > 45% | 0 | — | — | — | ✓ (all clear) |
| Blinkit | GM < 35% | 0 | — | — | — | ✓ (all clear) |
| Blinkit | ASP down > 5% | 0 | — | — | — | ✓ (all clear) |
| CRED | Returns > 10% | 0 | — | — | — | ✓ (all clear) |
| CRED | COGS > 45% | 6 | 6 | −₹69.39 K | ₹-0.69 L | ✓ |
| CRED | GM < 40% | 1 | 1 | −₹1.26 K | ₹-0.01 L | ✓ |
| CRED | ASP down > 5% | 2 | 2 | −₹99.02 K | ₹-0.99 L | ✓ |
| CRED | Returns up > 3 pts | 1 | 1 | −₹1.41 K | ₹-0.01 L | ✓ |
| Offline | CM1 < 30% | 29 | 29 | −₹48.34 L | ₹-48.33 L | ✓ |
| Offline | Returns > 10% | 8 | 8 | −₹50.22 L | ₹-50.22 L | ✓ |
| Offline | COGS > 45% | 38 | 38 | −₹95.14 L | ₹-95.13 L | ✓ |
| Offline | GM < 45% | 34 | 34 | −₹64.52 L | ₹-64.51 L | ✓ |
| Offline | ASP down > 5% | 18 | 18 | −₹1.06 Cr | ₹-106.47 L | ✓ |
| Offline | Returns up > 3 pts | 9 | 9 | −₹40.88 L | ₹-40.88 L | ✓ |
| EBO | CM1 < 30% | 5 | 5 | −₹89.67 K | ₹-0.90 L | ✓ |
| EBO | Returns > 10% | 14 | 14 | −₹15.19 L | ₹-15.18 L | ✓ |
| EBO | COGS > 45% | 27 | 27 | −₹8.65 L | ₹-8.65 L | ✓ |
| EBO | GM < 45% | 5 | 5 | −₹1.19 L | ₹-1.19 L | ✓ |
| EBO | ASP down > 5% | 26 | 26 | −₹7.55 L | ₹-7.55 L | ✓ |
| EBO | Returns up > 3 pts | 8 | 8 | −₹4.48 L | ₹-4.48 L | ✓ |

## 3. Previous period: per-product rows add up to the card totals

For every tab and sub-tab, the previous-period summary (session cache `pnl.prev2.*`, the hidden summary-only P&L run on 5–30 Sep) carries per-product gross, units and returns for the watchlist. Their sums must equal the same summary's gross / units / returns, which the cards' ▲/▼ use.

| Tab | Products | Σ gross | Card gross | Σ units | Card units | Σ returns | Card returns | OK |
|---|---|---|---|---|---|---|---|---|
| all | — | not cached | | | | | | ✗ |
| shopify | 234 | ₹2737.05 L | ₹2737.05 L | 205119 | 205119 | ₹523.79 L | ₹523.79 L | ✓ |
| ebo | 190 | ₹248.68 L | ₹248.68 L | 8511 | 8511 | ₹21.80 L | ₹21.80 L | ✓ |
| amazon | 172 | ₹1218.97 L | ₹1218.97 L | 87017 | 87017 | ₹231.36 L | ₹231.36 L | ✓ |
| flipkart | 139 | ₹169.89 L | ₹169.89 L | 14208 | 14208 | ₹50.54 L | ₹50.54 L | ✓ |
| blinkit | 11 | ₹139.06 L | ₹139.06 L | 11064 | 11064 | ₹0.00 L | ₹0.00 L | ✓ |
| cred | 52 | ₹27.13 L | ₹27.13 L | 2093 | 2093 | ₹1.19 L | ₹1.19 L | ✓ |
| firstcry | 20 | ₹1.33 L | ₹1.33 L | 114 | 114 | ₹0.32 L | ₹0.32 L | ✓ |
| instamart | 18 | ₹17.22 L | ₹17.22 L | 1250 | 1250 | ₹0.00 L | ₹0.00 L | ✓ |
| zepto | 14 | ₹17.10 L | ₹17.10 L | 1298 | 1298 | ₹0.00 L | ₹0.00 L | ✓ |
| myntra | 67 | ₹73.25 L | ₹73.25 L | 4343 | 4343 | ₹14.63 L | ₹14.63 L | ✓ |
| international | 6 | ₹0.02 L | ₹0.02 L | 21 | 21 | ₹0.00 L | ₹0.00 L | ✓ |
| offline | 185 | ₹363.77 L | ₹363.77 L | 25954 | 25954 | ₹37.19 L | ₹37.19 L | ✓ |
| shopify · MyFrido | 199 | ₹2499.91 L | ₹2499.91 L | 204352 | 204352 | ₹455.64 L | ₹455.64 L | ✓ |
| shopify · Mobility | 37 | ₹237.14 L | ₹237.14 L | 767 | 767 | ₹68.15 L | ₹68.15 L | ✓ |
| amazon · SC | 163 | ₹743.08 L | ₹743.08 L | 56867 | 56867 | ₹135.04 L | ₹135.04 L | ✓ |
| amazon · VC | 90 | ₹475.89 L | ₹475.89 L | 30150 | 30150 | ₹96.32 L | ₹96.32 L | ✓ |
| offline · B2B | 158 | ₹228.18 L | ₹228.18 L | 13575 | 13575 | ₹5.66 L | ₹5.66 L | ✓ |
| offline · Stockist | 130 | ₹133.69 L | ₹133.69 L | 12123 | 12123 | ₹31.50 L | ₹31.50 L | ✓ |
| offline · MT GT | 1 | ₹0.15 L | ₹0.15 L | 30 | 30 | ₹0.00 L | ₹0.00 L | ✓ |
| offline · Misc | 54 | ₹1.76 L | ₹1.76 L | 226 | 226 | ₹0.02 L | ₹0.02 L | ✓ |

## 4. Mobile numbers = laptop numbers

Run 2026-10-26T20:27, local build, page default range (1–26 Oct 2026, live API). Laptop 1920 vs iPhone 14 (390). Cards ↔ tiles (value text as rendered), watchlist rule counts, and the top 8 products by revenue (name + gross).

| Tab | Cards = tiles | Watchlist counts | Top 8 products | Notes |
|---|---|---|---|---|
| all | ✓ (4 tiles) | none (hidden) | ✓ |  |
| shopify | ✓ (10 tiles) | ✓ 8 rules | ✓ |  |
| ebo | ✓ (8 tiles) | ✓ 6 rules | ✓ |  |
| amazon | ✓ (10 tiles) | ✓ 8 rules | ✓ |  |
| flipkart | ✓ (10 tiles) | ✓ 8 rules | ✓ |  |
| blinkit | ✓ (10 tiles) | ✓ 6 rules | ✓ |  |
| cred | ✓ (6 tiles) | ✓ 5 rules | ✓ |  |
| firstcry | ✓ (6 tiles) | ✓ 5 rules | ✓ |  |
| instamart | ✓ (10 tiles) | ✓ 6 rules | ✓ |  |
| zepto | ✓ (10 tiles) | ✓ 6 rules | ✓ |  |
| myntra | ✓ (6 tiles) | ✓ 5 rules | ✓ |  |
| international | ✓ (4 tiles) | none (hidden) | ✓ |  |
| offline | ✓ (8 tiles) | ✓ 6 rules | ✓ |  |
| shopify · MyFrido | ✓ (10 tiles) | ✓ 8 rules | ✓ |  |
| amazon · Seller Central | ✓ (8 tiles) | ✓ 6 rules | ✓ |  |
| amazon · Vendor Central | ✓ (8 tiles) | ✓ 6 rules | ✓ |  |
| offline · Stockist | ✓ (8 tiles) | ✓ 6 rules | ✓ |  |

## 5. Laptop before / after

Before = commit 6a0004f2 (release/responsive + fix/pnl-data, before any Phase 2 change), served from a separate worktree; after = this branch. September, 1366 and 1280. Files: `docs/responsive/before/pnl-phase2/` and `docs/responsive/after/pnl-<tab>/laptop-*.png`.

- KPI cards, trend chart and waterfall: unchanged. Live page measured on both builds: tab bar at y 46, sub-tab bar at y 90, identical. (Some full-page captures show the after page 8px lower from the tab bar down: a capture-timing artefact, not in the live layout; on Flipkart 1366 the two captures are pixel-identical down to the end of the trend/waterfall row.)
- New, in order under the waterfall: **Margin watchlist** card, **Margin matrix** (≈60%) + **Biggest fixes** (≈40%) where CM1 exists (not on CRED, Firstcry, Myntra, International, Overall).
- **Financial View**: Product column first, Category second; short headers with the full name on hover; red only on rule breaks (no green); new **BE ROAS** column (real ad spend only) and **Flags** column (1 chip + n, full list on hover); ↗ on row hover / keyboard focus (D2C → Price Simulator, Offline → B2B Costing); flag filter chip. Table layout is now auto: fits its card at 1366 (1228px) and 1280 (1142px) with 0 cut-off cells.
- EBO store table, tools pages: unchanged.

## 6–7. Tap-through (Chromium + WebKit)

Header chips (13, amber dot on Overall/EBO/International/Myntra) · no old tab bar on phones · finger swipe scrolls the page · quadrant → full-screen list · hardware Back closes it · tile switches hero · list ‹ closes · Category toggle → category → its products · product row → sheet (rule-breaking values red, flag chips) · rule → list → product → sheet → Simulate → Price Simulator opens with that product · nothing left open behind it · "‹ Back to D2C" on the tool page · sub-tab MyFrido · chips row scrolls sideways · EBO In-progress strip · Offline → Stockist · Tools card → B2B Costing · no page errors. EBO store list → full store table, store column stays put when scrolled sideways (September, Chromium + WebKit).

## 8. Design-system checklist (MOBILE_DESIGN_SYSTEM.md §5)

- [x] Uses `MobilePageHeader`, `MobileBottomNav`
- [x] All filters through `FilterSheet`: P&L has no slicers today, so no filter icon (nothing to filter)
- [x] Top of page = `MasterTrendCard` (hero 24 / tile 14, chart as the released Overview, prev dashed)
- [x] Lists/tables per §3: ranked lists + full-screen lists; the wide store table only inside a full-screen view with a sticky first column; no donuts
- [x] Palette / type / glow per §1 (red only for loss and rule breaks, amber only for rule dots and In-progress)
- [x] No resize on touch; no inner scroll in page flow; no horizontal page scroll (30 captures)
- [x] Numbers identical to desktop (section 4)
- [x] Laptop 1366: only the listed additions (section 5)
- [x] Screenshots SE / 14 / Pixel / small Android / landscape / iPad portrait (`docs/responsive/after/pnl-*/`)

