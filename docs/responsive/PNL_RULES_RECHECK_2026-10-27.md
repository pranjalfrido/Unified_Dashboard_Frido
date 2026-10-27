# P&L margin watchlist: rule check

Run 2026-10-27T02:14 on the local build of feature/responsive-pnl, after Suraj's P1–P3 decisions (27 Oct). Range = the page default (1–26 Oct 2026), loaded from the live API (/api/bq); previous period 5–30 Sep from the same API (session cache). Every number below is read from the rendered laptop Financial View and watchlist, then each flag is re-derived from those displayed numbers and the bars in src/config/metricTargets.js.

## D2C

Bars (D2C): CM1 < 30% · COGS > 50% · GM < — (off)% · Returns > 25% · CM2 target 15% · ASP down > 10% · Returns up > 3 pts. Materiality: ≥ 2% of gross (₹53.99 L) or ≥ 100 units.

Watchlist header: "68 products need action (2+ rules or loss) · 124 checked". Products in the table: 237 · checked (material): 124 · flagged: 90. Result: **all flags correct** (1 at a rounding edge, see ≈).

| Rule | Tile count | Rows with the flag | Tile ₹ | Σ of listed products (re-derived) | OK |
|---|---|---|---|---|---|
| Loss after ads | 35 | 35 | ₹-37.65 L | ₹-37.55 L | ✓ |
| Below healthy ROAS | 42 | 42 | ₹-59.36 L | ₹-59.48 L | ✓ |
| CM1 < 30% | 31 | 31 | ₹-34.06 L | ₹-34.09 L | ✓ |
| Returns > 25% | 13 | 13 | ₹-44.72 L | ₹-44.73 L | ✓ |
| COGS > 50% | 26 | 26 | ₹-20.44 L | ₹-20.44 L | ✓ |
| ASP down > 10% | 36 | 36 | ₹-131.00 L | ₹-130.81 L | ✓ |
| Returns up > 3 pts | 7 | 7 | ₹-8.16 L | ₹-8.16 L | ✓ |

<details><summary>Every flagged product</summary>

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ROAS / BE | ASP (prev) | Flags shown | Re-derived | OK |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Cloud Comfort Arch Support Slippers | ₹131.00 L | 15675 | 13.5 (14.2) | 39.6 | 60.4 | 39.3 | 2.2 | 3.12 / 2.94 | 836 (886) | thin | thin | ✓ |
| Orthotics Heel Protector | ₹128.00 L | 16534 | 10.0 (10.8) | 44.1 | 55.9 | 41.0 | -3.0 | 2.52 / 2.71 | 775 (821) | loss | loss | ✓ |
| ErgoLuxe Executive Chair | ₹104.00 L | 334 | 15.2 (12.5) | 50.9 | 49.1 | 31.0 | 6.7 | 4.85 / 3.79 | 31139 (33268) | cogs, thin | thin, cogs | ✓ |
| Men's Comfort Dual Strap Sandals | ₹95.14 L | 4809 | 21.0 (21.4) | 41.1 | 58.9 | 45.2 | 0.1 | 2.8 / 2.79 | 1978 (2215) | asp, thin | thin, asp | ✓ |
| Ultimate Mattress Topper - Standard cover | ₹79.22 L | 1186 | 17.9 (19.5) | 45.3 | 54.7 | 32.0 | -1.9 | 3.58 / 3.8 | 6679 (6983) | loss | loss | ✓ |
| Adjustable Wedge Max Cushion | ₹75.94 L | 2261 | 15.7 (19.0) | 57.2 | 42.8 | 25.2 | -10.1 | 3.35 / 4.7 | 3359 (3523) | loss, cm1, cogs | loss, cm1, cogs | ✓ |
| Ultimate Car Backrest Cushion | ₹53.43 L | 4863 | 16.4 (19.9) | 46.1 | 53.9 | 24.7 | 7.0 | 6.76 / 4.83 | 1099 (1119) | cm1, thin | thin, cm1 | ✓ |
| Ultimate Deep Sleep Pillow | ₹52.50 L | 3700 | 18.5 (18.8) | 54.2 | 45.8 | 17.3 | -7.9 | 4.85 / 7.07 | 1419 (1582) | loss, cm1, cogs, asp | loss, cm1, cogs, asp | ✓ |
| Ultimate Car Wedge Seat Cushion | ₹47.41 L | 4337 | 16.8 (20.3) | 38.5 | 61.5 | 29.3 | 11.0 | 6.56 / 4.09 | 1093 (1126) | cm1, thin | thin, cm1 | ✓ |
| Orthopaedic Heating Belt | ₹46.53 L | 1970 | 12.0 (11.1) | 39.0 | 61.0 | 52.4 | 3.2 | 2.3 / 2.16 | 2362 (2451) | thin | thin | ✓ |
| Travel Neck Pillow | ₹44.46 L | 4093 | 12.0 (13.0) | 48.7 | 51.3 | 34.5 | 14.4 | 5.64 / 3.28 | 1086 (1413) | asp, thin | thin, asp | ✓ |
| Lumbo Sacral Belt | ₹41.90 L | 3196 | 18.3 (19.7) | 38.4 | 61.6 | 50.0 | -5.2 | 2.21 / 2.44 | 1311 (1526) | loss, asp | loss, asp | ✓ |
| 3D Posture Plus Ergonomic Chair | ₹39.99 L | 241 | 23.2 (14.4) | 60.4 | 39.6 | 7.6 | -12.8 | 6.4 / 17.21 | 16591 (19505) | loss, cm1, cogs, retup, asp | loss, cm1, cogs, retup, asp | ✓ |
| Arch Comfort Slides | ₹38.10 L | 3001 | 20.2 (22.1) | 35.5 | 64.5 | 42.5 | 4.9 | 3.33 / 2.94 | 1270 (1289) | thin | thin | ✓ |
| Orthotics Posture Corrector Seat | ₹36.75 L | 1369 | 16.5 (16.9) | 34.3 | 65.7 | 41.7 | 11.6 | 3.97 / 2.86 | 2684 (2726) | thin | thin | ✓ |
| Ultimate Wedge Plus Cushion | ₹34.79 L | 1942 | 14.8 (15.2) | 40.7 | 59.3 | 36.9 | 6.7 | 3.88 / 3.18 | 1791 (2163) | asp, thin | thin, asp | ✓ |
| Arch Support Insoles | ₹29.11 L | 2213 | 12.6 (14.7) | 26.0 | 74.0 | 62.4 | 14.0 | 2.36 / 1.83 | 1315 (1309) | thin | thin | ✓ |
| Ultimate Cozy Pillow | ₹29.08 L | 4970 | 13.7 (14.4) | 43.5 | 56.5 | 10.5 | -2.8 | 8.64 / 10.97 | 585 (658) | loss, cm1, asp | loss, cm1, asp | ✓ |
| Cold & Hot Therapy Cap | ₹25.07 L | 1900 | 13.1 (15.2) | 28.3 | 71.7 | 62.0 | 7.9 | 2.13 / 1.85 | 1319 (1532) | asp, thin | thin, asp | ✓ |
| Men's Cloud Comfort Sandal | ₹24.87 L | 1244 | 22.3 (22.4) | 38.6 | 61.4 | 47.3 | -4.0 | 2.5 / 2.72 | 2000 (2201) | loss | loss | ✓ |
| Active Casual Sneakers - Women's | ₹24.62 L | 961 | 32.5 (33.6) | 48.2 | 51.8 | 36.5 | 14.7 | 6.78 / 4.05 | 2562 (3631) | ret, asp, thin | thin, ret, asp | ✓ |
| Women's Arch Comfort Wedge Sandals - Buckle Strap | ₹24.40 L | 1021 | 26.0 (27.2) | 42.8 | 57.2 | 47.1 | 28.2 | 7.16 / 2.87 | 2389 (2958) | ret, asp | ret, asp | ✓ |
| Women's Cloud Comfort Sandal | ₹23.28 L | 1347 | 20.4 (19.7) | 40.5 | 59.5 | 43.5 | -6.7 | 2.5 / 2.89 | 1728 (1888) | loss | loss | ✓ |
| Ultimate Mattress Topper - Cooling Cover | ₹23.12 L | 231 | 18.6 (19.6) | 42.6 | 57.4 | 40.8 | 6.5 | 3.58 / 3.01 | 10011 (10715) | thin | thin | ✓ |
| Active Casual Sneakers - Men's | ₹22.92 L | 904 | 25.5 (26.3) | 48.6 | 51.4 | 36.4 | 16.6 | 6.78 / 3.68 | 2535 (3607) | ret, asp | ret, asp | ✓ |
| Wallet | ₹21.07 L | 1078 | 22.6 (17.3) | 41.6 | 58.4 | 50.1 | 3.8 | 2.79 / 2.58 | 1954 (2739) | retup, asp, thin | thin, retup, asp | ✓ |
| Active Knee Cap Support | ₹18.40 L | 2177 | 11.7 (15.8) | 37.2 | 62.8 | 50.0 | 6.5 | 2.6 / 2.26 | 845 (873) | thin | thin | ✓ |
| Five Finger Neck Massager | ₹18.24 L | 487 | 20.8 (5.9) | 66.9 | 33.1 | 23.0 | -4.3 | 4.63 / 5.49 | 3746 (3306) | loss, cm1, cogs, retup | loss, cm1, cogs, retup | ✓ |
| Ultimate Mattress Topper - Premium Cover | ₹18.07 L | 209 | 9.0 (10.3) | 47.4 | 52.6 | 36.1 | 5.5 | 3.58 / 3.04 | 8646 (8985) | thin | thin | ✓ |
| Premium Car Backrest Cushion | ₹16.95 L | 1204 | 19.6 (20.6) | 46.8 | 53.2 | 29.5 | 11.8 | 7.03 / 4.22 | 1408 (1421) | cm1, thin | thin, cm1 | ✓ |
| Premium Car Wedge Seat Cushion | ₹16.21 L | 1160 | 20.7 (22.2) | 41.6 | 58.4 | 32.0 | 14.0 | 7.03 / 3.94 | 1397 (1407) | thin | thin | ✓ |
| Women's Ethnic Comfort Flat Sandal | ₹15.91 L | 1216 | 19.5 (18.4) | 51.7 | 48.3 | 28.0 | 10.6 | 7.16 / 4.44 | 1308 (1515) | cm1, cogs, asp, thin | thin, cm1, cogs, asp | ✓ |
| Comfort Formal Shoes | ₹15.86 L | 416 | 27.0 (27.5) | 34.7 | 65.3 | 56.5 | 15.6 | 3.35 / 2.42 | 3813 (4220) | ret | ret | ✓ |
| Barefoot Shoes - Men's | ₹14.64 L | 394 | 23.9 (32.1) | 38.0 | 62.0 | 52.3 | -33.5 | 1.53 / 2.51 | 3717 (3773) | loss | loss | ✓ |
| Women's Arch Support Wedge Sandals | ₹14.06 L | 594 | 25.5 (25.9) | 45.4 | 54.6 | 41.3 | 22.5 | 7.16 / 3.25 | 2367 (2863) | ret, asp | ret, asp | ✓ |
| Maternity Pillow Bundle Plus | ₹13.68 L | 458 | 13.8 (47.9) | 36.3 | 63.7 | 45.6 | -1.2 | 2.47 / 2.54 | 2987 (2752) | loss | loss | ✓ |
| Orthotics Knee Support Wrap | ₹13.63 L | 2326 | 15.9 (17.6) | 31.2 | 68.8 | 51.9 | 8.9 | 2.76 / 2.29 | 586 (657) | asp, thin | thin, asp | ✓ |
| Comfort Formal Shoes with Arch | ₹13.27 L | 316 | 21.7 (31.0) | 31.5 | 68.5 | 60.9 | 22.8 | 3.35 / 2.1 | 4198 (4673) | asp | asp | ✓ |
| Anti-Slip Bath Mat | ₹12.98 L | 1308 | 8.3 (9.7) | 46.7 | 53.3 | 38.7 | -4.6 | 2.51 / 2.81 | 993 (929) | loss | loss | ✓ |
| ErgoSlyd Formal Shoes | ₹12.78 L | 273 | 26.8 (30.2) | 34.2 | 65.8 | 58.5 | 39.4 | 7.16 / 2.33 | 4681 (4761) | ret | ret | ✓ |
| Ultimate Neck Contour Cervical Plus Pillow | ₹12.19 L | 860 | 17.5 (19.6) | 47.3 | 52.7 | 14.6 | 0.6 | 8.64 / 8.27 | 1418 (1579) | cm1, asp, thin | thin, cm1, asp | ✓ |
| Men's Orthotics Dual Strap Sandals | ₹11.41 L | 883 | 23.2 (21.3) | 82.1 | 17.9 | -3.9 | -22.1 | 7.16 / — | 1292 (1840) | loss, cm1, cogs, asp | loss, cm1, cogs, asp | ✓ |
| Foot Alignment Socks | ₹11.27 L | 2154 | 15.6 (22.1) | 25.4 | 74.6 | 55.3 | -4.9 | 1.97 / 2.14 | 523 (520) | loss | loss | ✓ |
| Women's Cloud Comfort Sandal - Toeless | ₹11.22 L | 681 | 26.3 (25.9) | 42.5 | 57.5 | 38.3 | -15.8 | 2.5 / 3.54 | 1648 (1835) | loss, ret, asp | loss, ret, asp | ✓ |
| Cloud Backrest Cushion | ₹11.03 L | 623 | 14.3 (16.7) | 54.1 | 45.9 | 30.6 | 12.8 | 6.53 / 3.81 | 1770 (1827) | cogs, thin | thin, cogs | ✓ |
| Maternity Pillow | ₹10.71 L | 509 | 27.9 (28.9) | 26.9 | 73.1 | 52.8 | -3.2 | 2.47 / 2.63 | 2104 (2080) | loss, ret | loss, ret | ✓ |
| Travel Wheelchair | ₹10.69 L | 108 | 11.7 (14.2) | 61.6 | 38.4 | 24.4 | -4.7 | 3.89 / 4.64 | 9901 (11766) | loss, cm1, cogs, asp | loss, cm1, cogs, asp | ✓ |
| Women's Cloud Comfort Back Strap Sandals | ₹10.43 L | 561 | 23.0 (21.9) | 34.9 | 65.1 | 53.5 | 14.8 | 3.35 / 2.43 | 1858 (2088) | asp, thin | thin, asp | ✓ |
| Active Socks | ₹9.96 L | 3915 | 11.5 (12.2) | 54.3 | 45.7 | 14.2 | -4.4 | 6.08 / 7.96 | 255 (235) | loss, cm1, cogs | loss, cm1, cogs | ✓ |
| Puneri Chappal - Men | ₹9.34 L | 630 | 20.1 (20.3) | 65.4 | 34.6 | 16.1 | -2.4 | 6.76 / 7.78 | 1483 (2128) | loss, cm1, cogs, asp | loss, cm1, cogs, asp | ✓ |
| Glide Ergo Chair | ₹9.01 L | 115 | 14.4 (12.9) | 61.9 | 38.1 | 3.8 | -14.4 | 6.4 / 30.7 | 7832 (7877) | loss, cm1, cogs | loss, cm1, cogs | ✓ |
| ErgoLift Footrest | ₹8.31 L | 353 | 20.1 (15.5) | 44.6 | 55.4 | 41.6 | -44.5 | 1.45 / 3.01 | 2354 (2402) | loss, retup | loss, retup | ✓ |
| Orthotics Toe Separator Pro | ₹8.07 L | 1654 | 11.6 (12.3) | 25.6 | 74.4 | 53.1 | 4.8 | 2.34 / 2.13 | 488 (485) | thin | thin | ✓ |
| Cervical Butterfly Pillow | ₹7.86 L | 429 | 13.6 (20.3) | 46.3 | 53.7 | 25.1 | 11.8 | 8.64 / 4.6 | 1831 (1838) | cm1, thin | thin, cm1 | ✓ |
| Active Walking Shoes - Women's | ₹7.53 L | 336 | 27.5 (34.1) | 67.3 | 32.7 | 16.4 | -2.8 | 7.16 / 8.39 | 2241 (2446) | loss, cm1, cogs, ret | loss, cm1, cogs, ret | ✓ |
| Barefoot Sock Shoe Pro | ₹7.08 L | 497 | 9.9 (10.6) | 32.8 | 67.2 | 59.0 | 15.1 | 2.52 / 1.88 | 1424 (1603) | asp | asp | ✓ |
| Barefoot Sock Shoe Classic | ₹6.89 L | 549 | 13.6 (20.3) | 35.0 | 65.0 | 55.7 | 31.8 | 4.84 / 2.08 | 1255 (1433) | asp | asp | ✓ |
| Men's Cloud Comfort Shoes - Lace Ups - Arch Footbed | ₹6.37 L | 281 | 20.9 (21.3) | 45.8 | 54.2 | 43.2 | 4.4 | 3.25 / 2.92 | 2265 (2321) | thin | thin | ✓ |
| Active Walking Shoes - Men's | ₹5.79 L | 226 | 32.8 (32.4) | 58.7 | 41.3 | 25.9 | 5.1 | 7.16 / 5.74 | 2561 (2588) | cm1, cogs, ret, thin | thin, cm1, cogs, ret | ✓ |
| 3D Eye Mask | ₹5.48 L | 747 | 7.3 (16.7) | 50.6 | 49.4 | 35.9 | 23.5 | 8.69 / 3 | 734 (769) | cogs | cogs | ✓ |
| Arch Support Wedge Sandals - Velcro Strap | ₹4.93 L | 208 | 35.7 (—) | 55.3 | 44.7 | 33.6 | -73.6 | 1.45 / 4.62 | 2369 (—) | loss, cogs, ret | loss, cogs, ret | ✓ |
| Ultimate Lap Desk Pillow | ₹4.90 L | 171 | 20.5 (20.8) | 56.1 | 43.9 | -3.6 | -18.2 | 8.64 / — | 2864 (2687) | loss, cm1, cogs | loss, cm1, cogs | ✓ |
| Five Toe Socks | ₹4.75 L | 1168 | 7.3 (7.9) | 43.9 | 56.1 | 35.4 | -2.0 | 2.88 / 3.04 | 407 (624) | loss, asp | loss, asp | ✓ |
| Men's Cloud Comfort Shoes - Slip Ons  - Flat Footbed | ₹4.74 L | 234 | 19.7 (22.5) | 50.9 | 49.1 | 37.2 | 18.5 | 6.65 / 3.34 | 2026 (2013) | cogs | cogs | ✓ |
| Five Toe Socks - Solid | ₹4.61 L | 1051 | 7.8 (7.3) | 39.7 | 60.3 | 38.5 | 0.9 | 2.88 / 2.81 | 439 (606) | asp, thin | thin, asp | ✓ |
| Orthotics Bunion Corrector | ₹4.60 L | 330 | 10.6 (14.2) | 48.2 | 51.8 | 44.3 | 4.0 | 2.77 / 2.52 | 1393 (1715) | asp, thin | thin, asp | ✓ |
| Orthotics Kids Posture Seat | ₹4.28 L | 295 | 13.9 (11.4) | 29.3 | 70.7 | 41.0 | -15.2 | 2.06 / 2.83 | 1452 (1423) | loss | loss | ✓ |
| Women's Comfort Flat Sandal | ₹4.17 L | 310 | 24.8 (24.8) | 50.4 | 49.6 | 27.5 | 9.0 | 7.16 / 4.83 | 1344 (1487) | cm1, cogs, thin | thin, cm1, cogs | ✓ |
| Ultimate Cozy Classic Pillow | ₹4.11 L | 627 | 18.3 (20.0) | 33.7 | 66.3 | 20.2 | 6.0 | 8.64 / 6.06 | 656 (603) | cm1, thin | thin, cm1 | ✓ |
| Active Casual Sneakers - Leather - Men's | ₹4.09 L | 119 | 33.0 (27.8) | 32.2 | 67.8 | 56.6 | 34.6 | 6.78 / 2.63 | 3437 (4196) | ret, retup, asp | ret, retup, asp | ✓ |
| Dual Gel Insoles | ₹4.04 L | 646 | 12.0 (16.4) | 45.0 | 55.0 | 36.3 | 14.3 | 5.16 / 3.12 | 625 (612) | thin | thin | ✓ |
| Men's Cloud Comfort Shoes - Lace Ups - Flat Footbed | ₹3.43 L | 168 | 23.4 (23.0) | 50.7 | 49.3 | 36.9 | -3.3 | 3.25 / 3.54 | 2039 (2016) | loss, cogs | loss, cogs | ✓ |
| AeroDry Bath Mat | ₹3.02 L | 325 | 12.6 (10.3) | 59.0 | 41.0 | 19.5 | 6.1 | 8.56 / 5.87 | 928 (1436) | cm1, cogs, asp, thin | thin, cm1, cogs, asp | ✓ |
| Nasal Strip Pro | ₹2.86 L | 501 | 13.7 (15.6) | 19.4 | 80.6 | 62.3 | 49.0 | 8.69 / 1.86 | 570 (651) | asp | asp | ✓ |
| Contour Cervical Pillow | ₹2.76 L | 221 | 20.7 (27.2) | 39.3 | 60.7 | 29.9 | 14.4 | 8.13 / 4.21 | 1248 (1295) | cm1, thin | thin, cm1 | ✓ |
| Hot & Cold Therapy Pack | ₹2.73 L | 353 | 14.9 (24.1) | 41.4 | 58.6 | 40.5 | -12.2 | 2.23 / 2.9 | 774 (985) | loss, asp | loss, asp | ✓ |
| Ultimate Wedge Plus Max Cushion | ₹2.49 L | 113 | 13.8 (17.7) | 53.8 | 46.2 | 17.7 | 1.3 | 7.03 / 6.53 | 2204 (2262) | cm1, cogs, thin | thin, cm1, cogs | ✓ |
| Leg Elevation Pillow | ₹2.46 L | 129 | 12.7 (11.5) | 45.2 | 54.8 | 33.0 | -11.1 | 2.59 / 3.47 | 1908 (2000) | loss | loss | ✓ |
| Orthotics Toe Separator | ₹2.43 L | 704 | 10.2 (13.8) | 19.4 | 80.6 | 50.2 | 2.8 | 2.34 / 2.21 | 345 (383) | asp, thin | thin | ≈ |
| Mattress Protector | ₹2.37 L | 289 | 11.7 (18.8) | 54.1 | 45.9 | 19.2 | 6.1 | 8.69 / 5.91 | 820 (1012) | cm1, cogs, asp, thin | thin, cm1, cogs, asp | ✓ |
| Deep Sleep Pillow Cover | ₹2.09 L | 606 | 15.9 (15.8) | 42.0 | 58.0 | 27.5 | 13.8 | 8.69 / 4.32 | 345 (357) | cm1, thin | thin, cm1 | ✓ |
| Orthotics Bamboo Knee Cap | ₹2.01 L | 430 | 22.3 (17.2) | 24.7 | 75.3 | 50.5 | 35.7 | 8.64 / 2.54 | 468 (459) | retup | retup | ✓ |
| Ultimate Pro Face Mask | ₹1.80 L | 530 | 17.9 (16.2) | 105.7 | -5.7 | -31.2 | -45.2 | 8.69 / — | 340 (325) | loss, cm1, cogs | loss, cm1, cogs | ✓ |
| Wedge Neck Rest Pillow | ₹1.80 L | 248 | 21.0 (17.3) | 48.3 | 51.7 | 14.0 | -4.0 | 7.03 / 9.04 | 726 (724) | loss, cm1, retup | loss, cm1, retup | ✓ |
| Crescent Adjustable Pillow | ₹1.76 L | 178 | 18.9 (19.9) | 57.0 | 43.0 | 0.4 | -13.9 | 8.64 / 345.62 | 991 (1397) | loss, cm1, cogs, asp | loss, cm1, cogs, asp | ✓ |
| Five Toe Socks - Patterned | ₹1.67 L | 399 | 7.0 (7.4) | 44.0 | 56.0 | 33.0 | -4.3 | 2.88 / 3.25 | 418 (613) | loss, asp | loss, asp | ✓ |
| Portable Travel Seat Cushion | ₹1.51 L | 130 | 9.1 (9.1) | 32.3 | 67.7 | 47.4 | 4.8 | 2.58 / 2.32 | 1161 (1187) | thin | thin | ✓ |
| Nasal Strips | ₹1.13 L | 248 | 2.3 (5.2) | 22.3 | 77.7 | 56.5 | -44.9 | 1.01 / 1.81 | 454 (560) | loss, asp | loss, asp | ✓ |
| Gel Max Comfort Insole | ₹0.90 L | 146 | 7.5 (13.0) | 56.3 | 43.7 | 25.8 | 4.8 | 5.16 / 4.19 | 613 (626) | cm1, cogs, thin | thin, cm1, cogs | ✓ |
| Latex Pillow Cover | ₹0.69 L | 159 | 31.3 (40.8) | 47.4 | 52.6 | 20.1 | 3.4 | 8.69 / 7.22 | 434 (458) | cm1, ret, thin | thin, cm1, ret | ✓ |

</details>

5 random unflagged (checked) products:

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ASP (prev) | Clear? |
|---|---|---|---|---|---|---|---|---|---|
| Cloud Comfort Slippers | ₹6.40 L | 851 | 15.5 (19.5) | 38.7 | 61.3 | 37.5 | 16.1 | 752 (812) | ✓ |
| Women's Arch Comfort Sandals | ₹62.39 L | 3233 | 23.7 (24.1) | 36.8 | 63.2 | 51.3 | 20.9 | 1930 (2102) | ✓ |
| Maternity Pillow - Bundle | ₹9.40 L | 374 | 20.9 (19.0) | 32.4 | 67.6 | 43.9 | 18.9 | 2513 (2649) | ✓ |
| Travel Neck Pillow Without Case | ₹47.99 L | 5390 | 14.8 (17.9) | 38.3 | 61.7 | 41.0 | 20.1 | 890 (933) | ✓ |
| Orthotics Sports Knee Cap Support | ₹2.70 L | 297 | 18.9 (23.9) | 40.4 | 59.6 | 46.1 | 31.9 | 908 (931) | ✓ |

## Amazon Overall

Bars (Amazon): CM1 < 20% · COGS > 45% · GM < 40% · Returns > 20% · CM2 target 10% · ASP down > 10% · Returns up > 3 pts. Materiality: ≥ 2% of gross (₹33.95 L) or ≥ 100 units.

Watchlist header: "39 products need action (2+ rules or loss) · 95 checked". Products in the table: 181 · checked (material): 95 · flagged: 67. Result: **all flags correct** (1 at a rounding edge, see ≈).

| Rule | Tile count | Rows with the flag | Tile ₹ | Σ of listed products (re-derived) | OK |
|---|---|---|---|---|---|
| Loss after ads | 11 | 11 | ₹-4.65 L | ₹-4.66 L | ✓ |
| Below healthy ROAS | 20 | 20 | ₹-10.49 L | ₹-10.49 L | ✓ |
| CM1 < 20% | 23 | 23 | ₹-13.02 L | ₹-13.06 L | ✓ |
| Returns > 20% | 19 | 19 | ₹-40.05 L | ₹-40.06 L | ✓ |
| COGS > 45% | 28 | 28 | ₹-18.50 L | ₹-18.52 L | ✓ |
| GM < 40% | 1 | 1 | ₹-0.03 L | ₹-0.03 L | ✓ |
| ASP down > 10% | 39 | 39 | ₹-210.00 L | ₹-210.01 L | ✓ |
| Returns up > 3 pts | 4 | 4 | ₹-1.23 L | ₹-1.23 L | ✓ |

<details><summary>Every flagged product</summary>

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ROAS / BE | ASP (prev) | Flags shown | Re-derived | OK |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Cloud Comfort Arch Support Slippers | ₹147.00 L | 19157 | 13.8 (15.5) | 43.2 | 56.8 | 25.8 | 14.4 | 10.22 / 4.5 | 770 (885) | asp | asp | ✓ |
| Ultimate Car Neck Rest Pillow | ₹95.44 L | 11446 | 8.7 (20.8) | 34.9 | 65.1 | 29.1 | 26.3 | 39.32 / 3.76 | 834 (1198) | asp | asp | ✓ |
| Ultimate Wedge Plus Cushion | ₹56.45 L | 3299 | 9.8 (15.7) | 42.7 | 57.3 | 21.9 | 9.7 | 9.06 / 5.05 | 1711 (1943) | asp, thin | thin, asp | ✓ |
| 3D Posture Plus Ergonomic Chair | ₹55.92 L | 333 | 3.7 (28.6) | 59.5 | 40.5 | 13.4 | 7.0 | 16.09 / 7.72 | 16792 (21429) | cm1, cogs, asp, thin | thin, cm1, cogs, asp | ✓ |
| Travel Neck Pillow | ₹54.19 L | 4753 | 8.4 (14.9) | 46.4 | 53.6 | 19.1 | 5.1 | 7.76 / 5.7 | 1140 (1623) | cm1, cogs, asp, thin | thin, cm1, cogs, asp | ✓ |
| Active Knee Cap Support | ₹52.94 L | 6695 | 14.6 (17.5) | 40.0 | 60.0 | 41.8 | 30.6 | 10.42 / 2.79 | 791 (882) | asp | asp | ✓ |
| Ultimate Mattress Topper - Premium Cover | ₹40.87 L | 537 | 14.2 (30.0) | 51.6 | 48.4 | 19.1 | 9.3 | 11.96 / 6.1 | 7611 (9041) | cm1, cogs, asp, thin | thin, cm1, cogs, asp | ✓ |
| Ultimate Pro Seating Combo | ₹36.09 L | 1386 | 11.3 (21.9) | 44.6 | 55.4 | 22.8 | 12.4 | 10.87 / 4.95 | 2604 (3002) | asp | asp | ✓ |
| Adjustable Wedge Max Cushion | ₹34.53 L | 943 | 11.1 (21.9) | 52.5 | 47.5 | 14.6 | 9.8 | 23.35 / 7.67 | 3662 (3901) | cm1, cogs, thin | thin, cm1, cogs | ✓ |
| Ultimate Deep Sleep Pillow | ₹31.07 L | 2178 | 14.1 (22.7) | 51.3 | 48.7 | 11.8 | 0.0 | 9.84 / 9.83 | 1426 (1614) | cm1, cogs, asp, thin | thin, cm1, cogs, asp | ✓ |
| Ultimate Neck Contour Cervical Pillow | ₹30.67 L | 3373 | 11.5 (22.2) | 49.4 | 50.6 | 13.8 | -0.2 | 8.08 / 8.17 | 909 (1378) | loss, cm1, cogs, asp | loss, cm1, cogs, asp | ✓ |
| Cloud Comfort Slippers | ₹29.88 L | 4174 | 15.8 (19.7) | 40.9 | 59.1 | 28.0 | 18.1 | 11.92 / 4.23 | 716 (800) | asp | asp | ✓ |
| Cold & Hot Therapy Cap | ₹27.13 L | 1929 | 5.0 (5.8) | 26.5 | 73.5 | 50.8 | 37.8 | 8.08 / 2.07 | 1406 (1582) | asp | asp | ✓ |
| Ultimate Pro Seat Cushion | ₹26.18 L | 1849 | 11.6 (17.7) | 39.2 | 60.8 | 28.4 | 8.8 | 5.74 / 3.97 | 1416 (1556) | thin | thin | ✓ |
| Ultimate Car Wedge Seat Cushion | ₹24.91 L | 2324 | 10.7 (19.9) | 39.5 | 60.5 | 23.6 | 7.4 | 6.89 / 4.73 | 1072 (1457) | asp, thin | thin, asp | ✓ |
| Arch Support Insoles | ₹24.28 L | 1883 | 7.5 (7.8) | 26.4 | 73.6 | 46.2 | 33.4 | 8.43 / 2.33 | 1290 (1441) | asp | asp | ✓ |
| Premium Car Comfort Bundle | ₹20.10 L | 543 | 10.2 (34.1) | 44.1 | 55.9 | 27.1 | 19.6 | 14.68 / 4.1 | 3701 (4420) | asp | asp | ✓ |
| Ultimate Mattress Topper - Standard cover | ₹19.79 L | 304 | 15.2 (26.7) | 45.9 | 54.1 | 22.7 | 15.1 | 15.47 / 5.19 | 6510 (6992) | cogs | cogs | ✓ |
| Women's Cloud Comfort Sandal | ₹18.63 L | 1042 | 20.2 (32.6) | 39.7 | 60.3 | 26.2 | 6.0 | 6.21 / 4.78 | 1788 (1892) | ret, thin | thin, ret | ✓ |
| Leg Elevation Pillow | ₹16.73 L | 954 | 11.7 (16.1) | 49.0 | 51.0 | 15.7 | 3.1 | 8.99 / 7.2 | 1754 (1966) | cm1, cogs, asp, thin | thin, cm1, cogs, asp | ✓ |
| Wedge Plus Cushion + Neck Rest Pillow | ₹15.02 L | 631 | 11.4 (21.1) | 46.3 | 53.7 | 18.3 | 4.4 | 8.13 / 6.16 | 2381 (2742) | cm1, cogs, asp, thin | thin, cm1, cogs, asp | ✓ |
| Maternity Pillow - Bundle | ₹14.67 L | 647 | 39.8 (36.5) | 35.0 | 65.0 | 28.6 | 9.2 | 8.53 / 5.79 | 2268 (2684) | ret, retup, asp, thin | thin, ret, retup, asp | ✓ |
| Dual Gel Pro Insoles | ₹13.30 L | 1651 | 6.3 (7.6) | 36.6 | 63.4 | 31.7 | 16.6 | 7.05 / 3.36 | 806 (895) | asp |  | ≈ |
| Active Casual Sneakers | ₹12.91 L | 399 | 24.0 (40.7) | 34.0 | 66.0 | 55.6 | 36.8 | 6.98 / 2.36 | 3236 (4004) | ret, asp | ret, asp | ✓ |
| Women's Cloud Comfort Back Strap Sandals | ₹12.87 L | 642 | 23.9 (29.5) | 34.0 | 66.0 | 33.0 | 14.7 | 7.17 / 3.98 | 2005 (2171) | ret | ret | ✓ |
| Women's Ethnic Comfort Flat Sandal | ₹12.71 L | 949 | 25.8 (32.7) | 51.3 | 48.7 | 17.4 | 5.0 | 10.84 / 7.73 | 1339 (1476) | cm1, cogs, ret, thin | thin, cm1, cogs, ret | ✓ |
| Contour Cervical Pillow | ₹12.54 L | 1277 | 16.3 (22.1) | 50.8 | 49.2 | 12.2 | -3.4 | 7.64 / 9.76 | 982 (1238) | loss, cm1, cogs, asp | loss, cm1, cogs, asp | ✓ |
| Ultimate Car Backrest Cushion | ₹12.48 L | 999 | 8.0 (17.5) | 40.6 | 59.4 | 23.3 | 21.4 | 58.06 / 4.67 | 1249 (1463) | asp | asp | ✓ |
| Orthotics Bunion Corrector | ₹12.33 L | 822 | 5.9 (8.4) | 44.7 | 55.3 | 45.5 | 32.9 | 8.45 / 2.33 | 1500 (1838) | asp | asp | ✓ |
| Women's Cloud Comfort Shoes - Lace ups | ₹11.43 L | 613 | 34.5 (39.9) | 41.0 | 59.0 | 27.3 | -8.9 | 4.21 / 5.58 | 1864 (2012) | loss, ret | loss, ret | ✓ |
| Ultimate Cozy Pillow | ₹11.05 L | 1880 | 9.1 (15.8) | 43.3 | 56.7 | 18.7 | 9.9 | 12.47 / 5.86 | 588 (798) | cm1, asp, thin | thin, cm1, asp | ✓ |
| Orthotics Knee Support Wrap | ₹10.22 L | 1659 | 21.6 (26.4) | 30.3 | 69.7 | 42.9 | 28.9 | 9.08 / 2.97 | 616 (645) | ret | ret | ✓ |
| Ultimate Cozy Classic Pillow | ₹9.69 L | 2262 | 8.5 (22.0) | 51.6 | 48.4 | 7.5 | -9.6 | 6.36 / 14.52 | 428 (658) | loss, cm1, cogs, asp | loss, cm1, cogs, asp | ✓ |
| Anti-Slip Bath Mat | ₹9.53 L | 960 | 6.3 (8.0) | 46.5 | 53.5 | 28.7 | 17.9 | 9.83 / 3.71 | 993 (983) | cogs | cogs | ✓ |
| Cloud Backrest Cushion | ₹9.01 L | 478 | 11.2 (25.2) | 51.4 | 48.6 | 14.8 | 7.5 | 15.35 / 7.57 | 1885 (1994) | cm1, cogs, thin | thin, cm1, cogs | ✓ |
| Women's Cloud Comfort Sandal - Toeless | ₹8.54 L | 493 | 25.8 (39.9) | 42.0 | 58.0 | 23.0 | 1.3 | 6.21 / 5.85 | 1732 (1841) | ret, thin | thin, ret | ✓ |
| Comfort Formal Shoes with Arch | ₹7.00 L | 156 | 14.6 (44.4) | 29.4 | 70.6 | 62.7 | 35.0 | 4.22 / 1.86 | 4488 (4999) | asp | asp | ✓ |
| Comfort Formal Shoes | ₹6.55 L | 164 | 25.2 (44.4) | 33.1 | 66.9 | 56.6 | 25.0 | 4.22 / 2.36 | 3991 (4262) | ret | ret | ✓ |
| Maternity Pillow | ₹5.69 L | 306 | 25.2 (28.3) | 30.7 | 69.3 | 35.8 | 20.2 | 8.53 / 3.72 | 1859 (2199) | ret, asp | ret, asp | ✓ |
| Barefoot Shoes - Men's | ₹5.65 L | 150 | 7.3 (0.0) | 37.4 | 62.6 | 57.2 | 29.8 | 3.93 / 1.88 | 3766 (3999) | retup | retup | ✓ |
| Orthotics Sports Knee Cap Support | ₹4.87 L | 515 | 24.9 (26.2) | 38.7 | 61.3 | 38.8 | 21.2 | 7.58 / 3.43 | 945 (995) | ret | ret | ✓ |
| Portable Floor Chair | ₹4.77 L | 125 | 4.7 (0.0) | 48.2 | 51.8 | 34.7 | 26.6 | 12.96 / 3.02 | 3817 (3999) | cogs, retup | cogs, retup | ✓ |
| Ultra Slim Deep Sleep Pillow | ₹4.76 L | 332 | 27.2 (31.7) | 36.7 | 63.3 | 27.6 | 25.6 | 67.4 / 4.96 | 1433 (1497) | ret | ret | ✓ |
| Women's Arch Comfort Sandal - Soft Footbed | ₹4.62 L | 219 | 24.2 (34.7) | 32.7 | 67.3 | 37.7 | 25.2 | 10.61 / 3.5 | 2112 (2199) | ret | ret | ✓ |
| Puneri Chappal - Men | ₹4.39 L | 258 | 26.8 (28.1) | 57.9 | 42.1 | 15.5 | 8.0 | 18.1 / 8.78 | 1703 (1868) | cm1, cogs, ret, thin | thin, cm1, cogs, ret | ✓ |
| Nasal Strip Pro | ₹4.37 L | 652 | 3.2 (3.8) | 17.5 | 82.5 | 57.9 | 38.3 | 5.27 / 1.78 | 670 (773) | asp | asp | ✓ |
| Ultimate Neck Contour Cervical Plus Pillow | ₹4.26 L | 267 | 24.0 (22.8) | 42.7 | 57.3 | 16.8 | 16.7 | 2014.53 / 7.83 | 1595 (1694) | cm1, ret | cm1, ret | ✓ |
| Active Walking Shoes - Men's | ₹4.26 L | 149 | 22.2 (34.0) | 51.1 | 48.9 | 23.1 | 8.6 | 8.85 / 5.55 | 2857 (3493) | cogs, ret, asp, thin | thin, cogs, ret, asp | ✓ |
| Women's Arch Support Wedge Sandals | ₹4.25 L | 160 | 20.7 (39.6) | 40.6 | 59.4 | 30.7 | 27.1 | 34.65 / 4.1 | 2653 (3323) | ret, asp | ret, asp | ✓ |
| Women's Comfort Flat Sandal | ₹3.93 L | 297 | 27.4 (40.7) | 50.9 | 49.1 | 5.4 | -2.0 | 18.62 / 25.62 | 1322 (1427) | loss, cm1, cogs, ret | loss, cm1, cogs, ret | ✓ |
| Active Walking Shoes - Women's | ₹3.62 L | 127 | 19.6 (38.7) | 54.0 | 46.0 | 17.0 | 10.6 | 19.45 / 7.3 | 2848 (3353) | cm1, cogs, asp | cm1, cogs, asp | ✓ |
| Men's Cloud Comfort Shoes - Lace Ups - Arch Footbed | ₹3.49 L | 152 | 24.4 (33.3) | 45.2 | 54.8 | 43.9 | 30.2 | 9.61 / 3.01 | 2295 (2499) | cogs, ret | cogs, ret | ✓ |
| Ultimate Wedge Plus Max Cushion | ₹3.46 L | 146 | 18.5 (27.1) | 49.6 | 50.4 | 13.5 | 13.5 | 2790.06 / 9.05 | 2370 (2499) | cm1, cogs | cm1, cogs | ✓ |
| Cuddle Sleep Pillow | ₹3.18 L | 113 | 6.5 (18.7) | 43.9 | 56.1 | 24.2 | -16.7 | 2.61 / 4.41 | 2815 (3000) | loss | loss | ✓ |
| Men's Cloud Comfort Shoes - Lace Ups - Flat Footbed | ₹3.15 L | 153 | 18.2 (31.3) | 50.1 | 49.9 | 34.4 | 21.7 | 9.61 / 3.55 | 2060 (2199) | cogs | cogs | ✓ |
| Men's Cloud Comfort Shoes - Slip Ons  - Flat Footbed | ₹3.14 L | 155 | 19.5 (30.8) | 50.8 | 49.2 | 33.5 | 17.1 | 7.58 / 3.7 | 2028 (2199) | cogs | cogs | ✓ |
| Premium Car Neck Rest Pillow | ₹3.13 L | 200 | 10.1 (24.4) | 29.4 | 70.6 | 40.8 | -89.8 | 0.85 / 2.72 | 1565 (1799) | loss, asp | loss, asp | ✓ |
| AeroDry Bath Mat | ₹3.04 L | 269 | 6.2 (3.4) | 48.9 | 51.1 | 9.6 | -9.3 | 5.61 / 11.07 | 1131 (1599) | loss, cm1, cogs, asp | loss, cm1, cogs, asp | ✓ |
| Cloud Seat Cushion | ₹2.63 L | 146 | 14.1 (22.3) | 40.6 | 59.4 | 22.9 | -3.8 | 4.36 / 5.07 | 1802 (1899) | loss | loss | ✓ |
| Kids Travel Neck Pillow | ₹2.59 L | 264 | 18.0 (13.4) | 40.9 | 59.1 | 29.1 | 13.4 | 7.76 / 4.18 | 982 (997) | retup | retup | ✓ |
| Hot & Cold Therapy Pack | ₹2.52 L | 289 | 10.4 (7.9) | 39.3 | 60.7 | 39.0 | 1.7 | 2.98 / 2.86 | 872 (1057) | asp, thin | thin, asp | ✓ |
| Mattress Protector | ₹2.26 L | 263 | 12.1 (18.2) | 53.7 | 46.3 | 13.0 | -0.9 | 8.21 / 8.75 | 859 (1062) | loss, cm1, cogs, asp | loss, cm1, cogs, asp | ✓ |
| Wedge Neck Rest Pillow | ₹1.72 L | 284 | 11.9 (24.4) | 59.4 | 40.6 | 1.9 | 1.8 | 2790.06 / 61 | 606 (798) | cm1, cogs, asp, thin | thin, cm1, cogs, asp | ✓ |
| Gel Max Comfort Insole | ₹1.53 L | 235 | 6.1 (7.2) | 53.1 | 46.9 | 12.7 | 12.7 | 2790.06 / 8.35 | 649 (684) | cm1, cogs | cm1, cogs | ✓ |
| Slim Seat Cushion | ₹1.36 L | 111 | 20.0 (17.8) | 37.3 | 62.7 | 23.8 | 23.7 | 2790.07 / 5.24 | 1227 (1476) | asp | asp | ✓ |
| Orthotics Toe Separator | ₹0.74 L | 210 | 7.2 (7.9) | 19.1 | 80.9 | 27.5 | 13.8 | 7.85 / 3.91 | 351 (399) | asp | asp | ✓ |
| Ball of Foot Cushions | ₹0.38 L | 163 | 2.1 (0.0) | 70.1 | 29.9 | -6.4 | -6.4 | 2790.09 / — | 230 (688) | loss, cm1, cogs, gm, asp | loss, cm1, cogs, gm, asp | ✓ |

</details>

5 random unflagged (checked) products:

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ASP (prev) | Clear? |
|---|---|---|---|---|---|---|---|---|---|
| Men's Comfort Dual Strap Sandals | ₹74.72 L | 3780 | 11.3 (24.8) | 41.5 | 58.5 | 27.8 | 12.8 | 1977 (2182) | ✓ |
| Nasal Strips | ₹4.34 L | 768 | 3.7 (2.5) | 19.8 | 80.2 | 47.1 | 31.1 | 564 (606) | ✓ |
| Premium Neck Contour Cervical Pillow | ₹4.11 L | 264 | 8.9 (16.6) | 38.3 | 61.7 | 42.4 | 36.9 | 1556 (1690) | ✓ |
| Active Socks | ₹1.91 L | 621 | 3.7 (5.4) | 44.1 | 55.9 | 35.2 | 33.4 | 307 (329) | ✓ |
| Foot Alignment Socks | ₹2.64 L | 499 | 9.3 (18.8) | 25.5 | 74.5 | 52.4 | 27.6 | 530 (549) | ✓ |

## Amazon Seller Central

Bars (Amazon): CM1 < 20% · COGS > 45% · GM < 40% · Returns > 20% · CM2 target 10% · ASP down > 10% · Returns up > 3 pts. Materiality: ≥ 2% of gross (₹14.99 L) or ≥ 100 units.

Watchlist header: "24 products need action (2+ rules or loss) · 73 checked". Products in the table: 177 · checked (material): 73 · flagged: 50. Result: **all flags correct**.

| Rule | Tile count | Rows with the flag | Tile ₹ | Σ of listed products (re-derived) | OK |
|---|---|---|---|---|---|
| CM1 < 20% | 12 | 12 | ₹-2.79 L | ₹-2.79 L | ✓ |
| Returns > 20% | 24 | 24 | ₹-42.84 L | ₹-42.84 L | ✓ |
| COGS > 45% | 20 | 20 | ₹-3.55 L | ₹-3.55 L | ✓ |
| GM < 40% | 1 | 1 | ₹-0.03 L | ₹-0.03 L | ✓ |
| ASP down > 10% | 23 | 23 | ₹-33.70 L | ₹-33.74 L | ✓ |
| Returns up > 3 pts | 6 | 6 | ₹-1.18 L | ₹-1.18 L | ✓ |

<details><summary>Every flagged product</summary>

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ROAS / BE | ASP (prev) | Flags shown | Re-derived | OK |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Active Knee Cap Support | ₹50.57 L | 6382 | 14.7 (17.7) | 39.9 | 60.1 | 42.6 | — | — / — | 792 (883) | asp | asp | ✓ |
| Cold & Hot Therapy Cap | ₹27.13 L | 1929 | 5.0 (5.8) | 26.5 | 73.5 | 50.9 | — | — / — | 1406 (1582) | asp | asp | ✓ |
| Adjustable Wedge Max Cushion | ₹25.67 L | 689 | 13.8 (17.8) | 51.4 | 48.6 | 14.4 | — | — / — | 3726 (3902) | cm1, cogs | cm1, cogs | ✓ |
| Men's Comfort Dual Strap Sandals | ₹24.04 L | 1194 | 21.4 (27.7) | 40.4 | 59.6 | 27.2 | — | — / — | 2013 (2177) | ret | ret | ✓ |
| Arch Support Insoles | ₹22.37 L | 1744 | 8.1 (8.4) | 26.5 | 73.5 | 46.8 | — | — / — | 1282 (1436) | asp | asp | ✓ |
| Dual Gel Insoles | ₹18.80 L | 3053 | 4.3 (5.6) | 45.6 | 54.4 | 31.5 | — | — / — | 616 (682) | cogs | cogs | ✓ |
| Ultimate Mattress Topper - Premium Cover | ₹14.23 L | 173 | 13.3 (29.1) | 47.7 | 52.3 | 23.3 | — | — / — | 8223 (9414) | cogs, asp | cogs, asp | ✓ |
| Ultimate Mattress Topper - Standard cover | ₹14.20 L | 226 | 20.7 (28.6) | 45.7 | 54.3 | 21.7 | — | — / — | 6283 (7365) | cogs, ret, asp | cogs, ret, asp | ✓ |
| Active Casual Sneakers | ₹12.91 L | 399 | 24.0 (40.7) | 33.9 | 66.1 | 55.7 | — | — / — | 3236 (4004) | ret, asp | ret, asp | ✓ |
| Women's Ethnic Comfort Flat Sandal | ₹12.71 L | 949 | 25.8 (32.7) | 51.2 | 48.8 | 17.6 | — | — / — | 1339 (1476) | cm1, cogs, ret | cm1, cogs, ret | ✓ |
| Orthotics Bunion Corrector | ₹12.33 L | 822 | 5.9 (8.4) | 44.7 | 55.3 | 45.5 | — | — / — | 1500 (1838) | asp | asp | ✓ |
| Dual Gel Pro Insoles | ₹12.17 L | 1513 | 6.9 (8.4) | 36.6 | 63.4 | 32.1 | — | — / — | 804 (895) | asp | asp | ✓ |
| Men's Cloud Comfort Sandal | ₹10.87 L | 548 | 27.9 (29.9) | 37.7 | 62.3 | 28.9 | — | — / — | 1983 (2171) | ret | ret | ✓ |
| Orthotics Knee Support Wrap | ₹10.22 L | 1659 | 21.6 (26.4) | 30.3 | 69.7 | 43.0 | — | — / — | 616 (645) | ret | ret | ✓ |
| Women's Cloud Comfort Shoes - Lace ups | ₹10.19 L | 546 | 38.7 (39.9) | 40.9 | 59.1 | 27.3 | — | — / — | 1866 (2012) | ret | ret | ✓ |
| Anti-Slip Bath Mat | ₹8.84 L | 886 | 5.8 (9.1) | 46.0 | 54.0 | 30.5 | — | — / — | 998 (997) | cogs | cogs | ✓ |
| Cloud Comfort Slippers | ₹8.34 L | 1104 | 20.2 (21.7) | 38.2 | 61.8 | 34.2 | — | — / — | 755 (799) | ret | ret | ✓ |
| Women's Cloud Comfort Sandal | ₹8.18 L | 451 | 29.6 (33.0) | 38.4 | 61.6 | 22.6 | — | — / — | 1814 (1881) | ret | ret | ✓ |
| Arch Comfort Slides | ₹7.73 L | 589 | 31.5 (33.0) | 33.4 | 66.6 | 17.9 | — | — / — | 1313 (1373) | cm1, ret | cm1, ret | ✓ |
| Comfort Formal Shoes with Arch | ₹6.23 L | 139 | 16.4 (44.4) | 29.5 | 70.5 | 65.1 | — | — / — | 4479 (4999) | asp | asp | ✓ |
| Comfort Formal Shoes | ₹6.19 L | 155 | 26.6 (44.4) | 33.1 | 66.9 | 57.8 | — | — / — | 3991 (4262) | ret | ret | ✓ |
| Barefoot Shoes - Men's | ₹5.65 L | 150 | 7.3 (0.0) | 37.4 | 62.6 | 57.2 | — | — / — | 3766 (3999) | retup | retup | ✓ |
| Ultimate Deep Sleep Pillow | ₹5.18 L | 314 | 20.0 (16.7) | 47.6 | 52.4 | 13.3 | — | — / — | 1650 (1420) | cm1, cogs, ret, retup | cm1, cogs, ret, retup | ✓ |
| Orthotics Sports Knee Cap Support | ₹4.87 L | 515 | 24.9 (26.2) | 38.7 | 61.3 | 38.9 | — | — / — | 945 (995) | ret | ret | ✓ |
| Portable Floor Chair | ₹4.77 L | 125 | 4.7 (0.0) | 48.1 | 51.9 | 34.8 | — | — / — | 3817 (3999) | cogs, retup | cogs, retup | ✓ |
| Travel Neck Pillow | ₹4.75 L | 407 | 13.1 (18.3) | 45.1 | 54.9 | 22.8 | — | — / — | 1167 (1698) | cogs, asp | cogs, asp | ✓ |
| Women's Arch Comfort Sandal - Soft Footbed | ₹4.62 L | 219 | 24.2 (34.7) | 32.6 | 67.4 | 37.7 | — | — / — | 2112 (2199) | ret | ret | ✓ |
| Nasal Strip Pro | ₹4.37 L | 652 | 3.2 (3.8) | 17.5 | 82.5 | 57.9 | — | — / — | 670 (773) | asp | asp | ✓ |
| Puneri Chappal - Men | ₹4.15 L | 244 | 27.4 (28.3) | 57.3 | 42.7 | 16.9 | — | — / — | 1700 (1867) | cm1, cogs, ret | cm1, cogs, ret | ✓ |
| Maternity Pillow - Bundle | ₹3.89 L | 174 | 25.3 (23.5) | 36.5 | 63.5 | 20.3 | — | — / — | 2234 (2691) | ret, asp | ret, asp | ✓ |
| Men's Cloud Comfort Shoes - Lace Ups - Arch Footbed | ₹3.14 L | 138 | 27.1 (33.3) | 45.6 | 54.4 | 46.7 | — | — / — | 2276 (2499) | cogs, ret | cogs, ret | ✓ |
| Ultimate Wedge Plus Cushion | ₹3.12 L | 156 | 15.6 (12.0) | 36.3 | 63.7 | 23.2 | — | — / — | 1999 (2381) | retup, asp | retup, asp | ✓ |
| Women's Comfort Flat Sandal | ₹3.09 L | 232 | 33.1 (40.7) | 50.8 | 49.2 | 0.4 | — | — / — | 1332 (1427) | cm1, cogs, ret | cm1, cogs, ret | ✓ |
| Men's Cloud Comfort Shoes - Slip Ons  - Flat Footbed | ₹2.98 L | 148 | 20.6 (30.8) | 51.3 | 48.7 | 34.2 | — | — / — | 2012 (2199) | cogs, ret | cogs, ret | ✓ |
| Men's Cloud Comfort Shoes - Lace Ups - Flat Footbed | ₹2.76 L | 135 | 20.8 (31.3) | 50.6 | 49.4 | 36.9 | — | — / — | 2043 (2199) | cogs, ret | cogs, ret | ✓ |
| Women's Arch Support Wedge Sandals | ₹2.58 L | 100 | 23.1 (42.0) | 41.2 | 58.8 | 30.8 | — | — / — | 2580 (3363) | ret, asp | ret, asp | ✓ |
| Men's Cloud Comfort Shoes - Slip Ons  - Arch Footbed | ₹2.56 L | 108 | 23.1 (31.0) | 43.4 | 56.6 | 44.5 | — | — / — | 2374 (2499) | ret | ret | ✓ |
| Women's Cloud Comfort Sandal - Toeless | ₹2.55 L | 149 | 33.6 (45.0) | 41.8 | 58.2 | 12.8 | — | — / — | 1714 (1837) | cm1, ret | cm1, ret | ✓ |
| Hot & Cold Therapy Pack | ₹2.52 L | 289 | 10.4 (7.9) | 39.3 | 60.7 | 39.1 | — | — / — | 872 (1057) | asp | asp | ✓ |
| Cloud Backrest Cushion | ₹2.21 L | 112 | 11.9 (22.6) | 48.5 | 51.5 | 21.5 | — | — / — | 1971 (1993) | cogs | cogs | ✓ |
| Ultimate Neck Contour Cervical Pillow | ₹1.96 L | 219 | 12.6 (23.8) | 50.0 | 50.0 | 13.3 | — | — / — | 896 (1408) | cm1, cogs, asp | cm1, cogs, asp | ✓ |
| Kids Travel Neck Pillow | ₹1.95 L | 197 | 22.4 (15.8) | 39.9 | 60.1 | 33.2 | — | — / — | 990 (997) | ret, retup | ret, retup | ✓ |
| AeroDry Bath Mat | ₹1.87 L | 154 | 10.1 (3.2) | 45.5 | 54.5 | 9.3 | — | — / — | 1212 (1600) | cm1, cogs, retup, asp | cm1, cogs, retup, asp | ✓ |
| Premium Car Neck Rest Pillow | ₹1.81 L | 113 | 13.5 (14.3) | 28.1 | 71.9 | 47.0 | — | — / — | 1600 (1801) | asp | asp | ✓ |
| Gel Max Comfort Insole | ₹1.53 L | 235 | 6.1 (7.2) | 53.0 | 47.0 | 12.9 | — | — / — | 649 (684) | cm1, cogs | cm1, cogs | ✓ |
| Ultimate Car Neck Rest Pillow | ₹1.45 L | 178 | 14.3 (11.9) | 35.5 | 64.5 | 28.4 | — | — / — | 814 (1181) | asp | asp | ✓ |
| Ultimate Cozy Pillow | ₹1.20 L | 182 | 5.8 (12.1) | 38.4 | 61.6 | 27.7 | — | — / — | 662 (747) | asp | asp | ✓ |
| Ultimate Cozy Classic Pillow | ₹0.76 L | 179 | 10.1 (19.0) | 51.6 | 48.4 | -8.4 | — | — / — | 427 (579) | cm1, cogs, asp | cm1, cogs, asp | ✓ |
| Orthotics Toe Separator | ₹0.74 L | 210 | 7.2 (7.9) | 19.0 | 81.0 | 27.6 | — | — / — | 351 (399) | asp | asp | ✓ |
| Ball of Foot Cushions | ₹0.38 L | 163 | 2.1 (0.0) | 70.0 | 30.0 | -6.2 | — | — / — | 230 (688) | cm1, cogs, gm, asp | cm1, cogs, gm, asp | ✓ |

</details>

5 random unflagged (checked) products:

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ASP (prev) | Clear? |
|---|---|---|---|---|---|---|---|---|---|
| Leg Elevation Pillow | ₹4.36 L | 208 | 10.2 (14.6) | 40.7 | 59.3 | 25.1 | — | 2096 (2188) | ✓ |
| Active Socks | ₹1.91 L | 621 | 3.7 (5.4) | 44.1 | 55.9 | 35.2 | — | 307 (329) | ✓ |
| Plantar Fasciitis Pain Relief Ortho Insoles | ₹14.26 L | 1007 | 3.9 (5.7) | 31.5 | 68.5 | 41.9 | — | 1416 (1489) | ✓ |
| Orthopaedic Heating Belt | ₹29.18 L | 1204 | 9.0 (10.3) | 37.9 | 62.1 | 45.7 | — | 2424 (2551) | ✓ |
| Orthotics Bamboo Knee Cap | ₹1.59 L | 343 | 11.4 (13.1) | 25.2 | 74.8 | 55.3 | — | 463 (485) | ✓ |

## Flipkart

Bars (Flipkart): CM1 < 20% · COGS > 55% · GM < 40% · Returns > 15% · CM2 target 10% · ASP down > 10% · Returns up > 3 pts. Materiality: ≥ 2% of gross (₹5.46 L) or ≥ 100 units.

Watchlist header: "22 products need action (2+ rules or loss) · 34 checked". Products in the table: 149 · checked (material): 34 · flagged: 29. Result: **1 FAIL**.

| Rule | Tile count | Rows with the flag | Tile ₹ | Σ of listed products (re-derived) | OK |
|---|---|---|---|---|---|
| Loss after ads | 13 | 13 | ₹-4.06 L | ₹-5.18 L | ✗ |
| Below healthy ROAS | 11 | 11 | ₹-3.70 L | ₹-3.70 L | ✓ |
| CM1 < 20% | 16 | 16 | ₹-5.59 L | ₹-5.58 L | ✓ |
| Returns > 15% | 4 | 4 | ₹-3.68 L | ₹-3.68 L | ✓ |
| COGS > 55% | 10 | 10 | ₹-3.04 L | ₹-3.03 L | ✓ |
| GM < 40% | 6 | 6 | ₹-1.31 L | ₹-1.31 L | ✓ |
| ASP down > 10% | 3 | 3 | ₹-4.08 L | ₹-4.08 L | ✓ |
| Returns up > 3 pts | 2 | 2 | ₹-0.66 L | ₹-0.66 L | ✓ |

<details><summary>Every flagged product</summary>

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ROAS / BE | ASP (prev) | Flags shown | Re-derived | OK |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Men's Comfort Dual Strap Sandals | ₹46.79 L | 2467 | 14.7 (32.6) | 54.1 | 45.9 | 19.6 | 5.6 | 10.93 / 7.81 | 1897 (1893) | cm1, thin | thin, cm1 | ✓ |
| Cloud Comfort Arch Support Slippers | ₹28.23 L | 3892 | 12.4 (27.5) | 58.5 | 41.5 | 29.4 | 9.5 | 7.5 / 5.06 | 725 (678) | cogs, thin | thin, cogs | ✓ |
| Ultimate Car Comfort Bundle | ₹22.89 L | 825 | 10.1 (28.0) | 54.3 | 45.7 | 11.6 | 10.9 | 192.8 / 12.65 | 2774 (2688) | cm1 | cm1 | ✓ |
| Ultimate Car Neck Rest Pillow | ₹11.66 L | 1497 | 6.5 (27.4) | 46.9 | 53.1 | 21.0 | 20.2 | 191.04 / 6.67 | 779 (988) | asp | asp | ✓ |
| Men's Cloud Comfort Sandal | ₹8.89 L | 463 | 17.2 (43.2) | 50.7 | 49.3 | 22.9 | 4.8 | 8.81 / 6.97 | 1919 (1901) | ret, thin | thin, ret | ✓ |
| Orthotics Heel Protector | ₹7.60 L | 903 | 8.2 (17.2) | 50.7 | 49.3 | 15.6 | 3.3 | 11.44 / 9.04 | 842 (843) | cm1, thin | thin, cm1 | ✓ |
| Arch Comfort Slides | ₹5.96 L | 498 | 13.1 (36.6) | 45.5 | 54.5 | 22.3 | -12.7 | 4.28 / 6.71 | 1196 (1082) | loss | loss | ✓ |
| ErgoLuxe Executive Chair | ₹5.88 L | 15 | 17.4 (9.9) | 51.4 | 48.6 | 45.2 | 13.7 | 5.2 / 3.63 | 39232 (35519) | ret, retup | ret, retup | ✓ |
| Women's Cloud Comfort Back Strap Sandals | ₹5.87 L | 318 | 13.1 (35.2) | 43.7 | 56.3 | 30.9 | 3.9 | 5.53 / 4.84 | 1847 (1718) | thin | thin | ✓ |
| Adjustable Wedge Max Cushion | ₹5.54 L | 170 | 13.0 (27.5) | 78.6 | 21.4 | 11.3 | 5.1 | 24.86 / 13.57 | 3261 (3451) | cm1, cogs, gm, thin | thin, cm1, cogs, gm | ✓ |
| Women's Cloud Comfort Sandal | ₹4.60 L | 275 | 13.7 (35.6) | 52.7 | 47.3 | 13.3 | -3.9 | 8.81 / 11.38 | 1674 (1557) | loss, cm1 | loss, cm1 | ✓ |
| Men's Cloud Comfort Shoes - Slip Ons | ₹4.19 L | 182 | 13.8 (34.5) | 45.7 | 54.3 | 14.8 | -25.4 | 3.76 / 10.2 | 2301 (2098) | loss, cm1 | loss, cm1 | ✓ |
| Ultimate Pro Seating Combo | ₹4.10 L | 166 | 10.4 (23.4) | 60.3 | 39.7 | 1.1 | 0.4 | 192.98 / 129.33 | 2470 (2477) | cm1, cogs, gm, thin | thin, cm1, cogs, gm | ✓ |
| Active Knee Cap Support | ₹3.96 L | 501 | 11.8 (27.5) | 50.4 | 49.6 | 15.9 | 7.8 | 18.13 / 9.2 | 790 (765) | cm1, thin | thin, cm1 | ✓ |
| Active Walking Shoes - Men's | ₹3.63 L | 115 | 21.2 (54.8) | 59.8 | 40.2 | -1.0 | -28.4 | 6.37 / — | 3156 (3076) | loss, cm1, cogs, ret | loss, cm1, cogs, ret | ✓ |
| Cold & Hot Therapy Cap | ₹3.49 L | 233 | 10.2 (19.7) | 31.0 | 69.0 | 34.1 | 6.7 | 5.27 / 4.24 | 1500 (1430) | thin | thin | ✓ |
| Cloud Comfort Slippers | ₹3.37 L | 501 | 10.8 (27.2) | 54.4 | 45.6 | 36.4 | 5.8 | 4.7 / 3.96 | 673 (606) | thin | thin | ✓ |
| Dual Gel Insoles | ₹3.08 L | 611 | 11.3 (18.4) | 70.7 | 29.3 | 2.0 | -24.9 | 5.57 / 74.55 | 505 (559) | loss, cm1, cogs, gm | loss, cm1, cogs, gm | ✓ |
| Wedge Plus Cushion + Neck Rest Pillow | ₹3.04 L | 129 | 12.7 (24.2) | 59.7 | 40.3 | 25.6 | 24.8 | 192.98 / 5.97 | 2357 (2407) | cogs | cogs | ✓ |
| Ultimate Car Wedge Seat Cushion | ₹2.35 L | 224 | 8.7 (20.8) | 51.5 | 48.5 | 9.6 | -27.3 | 3.91 / 15.09 | 1050 (1262) | loss, cm1, asp | loss, cm1, asp | ✓ |
| Women's Cloud Comfort Sandal - Toeless | ₹2.23 L | 139 | 15.9 (39.8) | 54.1 | 45.9 | 9.6 | -8.2 | 8.81 / 16.37 | 1608 (1570) | loss, cm1, ret | loss, cm1, ret | ✓ |
| Ultimate Wedge Plus Cushion | ₹2.16 L | 119 | 6.6 (18.1) | 50.1 | 49.9 | 29.2 | -4.2 | 4.15 / 4.76 | 1814 (1887) | loss | loss | ✓ |
| Travel Neck Pillow Without Case | ₹1.96 L | 231 | 11.0 (0.0) | 51.1 | 48.9 | 26.0 | 1.4 | 6.08 / 5.75 | 848 (866) | retup, thin | thin, retup | ✓ |
| Cloud Backrest Cushion | ₹1.94 L | 103 | 14.5 (42.3) | 67.7 | 32.3 | -5.1 | -13.9 | 17.91 / — | 1888 (1631) | loss, cm1, cogs, gm | loss, cm1, cogs, gm | ✓ |
| Ultimate Pro Seat Cushion | ₹1.81 L | 146 | 4.4 (22.1) | 56.1 | 43.9 | 11.4 | -52.5 | 2.08 / 11.67 | 1237 (1078) | loss, cm1, cogs | loss, cm1, cogs | ✓ |
| Women's Ethnic Comfort Flat Sandal | ₹1.64 L | 132 | 11.2 (39.0) | 68.9 | 31.1 | -6.3 | -32.0 | 5.66 / — | 1241 (1182) | loss, cm1, cogs, gm | loss, cm1, cogs, gm | ✓ |
| Travel Neck Pillow | ₹1.56 L | 150 | 9.0 (22.7) | 64.7 | 35.3 | 24.7 | -6.8 | 4.59 / 5.85 | 1043 (1363) | loss, cogs, gm, asp | loss, cogs, gm, asp | ✓ |
| Ultimate Car Backrest Cushion | ₹1.50 L | 126 | 12.9 (24.0) | 52.6 | 47.4 | 14.9 | 14.1 | 188.91 / 10.04 | 1192 (1264) | cm1 | cm1 | ✓ |
| Orthotics Knee Support Wrap | ₹0.91 L | 146 | 12.4 (31.2) | 38.5 | 61.5 | 29.2 | -5.1 | 4.36 / 5.13 | 623 (548) | loss | loss | ✓ |

</details>

5 random unflagged (checked) products:

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ASP (prev) | Clear? |
|---|---|---|---|---|---|---|---|---|---|
| Active Socks | ₹1.36 L | 301 | 5.9 (22.2) | 37.7 | 62.3 | 49.1 | 35.2 | 453 (407) | ✓ |
| Ultimate Deep Sleep Pillow | ₹5.14 L | 274 | 10.8 (27.5) | 50.0 | 50.0 | 31.7 | 13.8 | 1878 (1657) | ✓ |
| Arch Sports Insole | ₹0.56 L | 131 | 9.0 (20.5) | 44.4 | 55.6 | 29.6 | 28.8 | 430 (393) | ✓ |
| Women's Arch Comfort Sandal - Soft Footbed | ₹2.20 L | 113 | 9.3 (7.6) | 45.0 | 55.0 | 33.7 | 32.8 | 1944 (1768) | ✓ |
| Arch Support Insoles | ₹1.68 L | 119 | 13.1 (30.0) | 30.1 | 69.9 | 46.2 | 41.9 | 1414 (1434) | ✓ |

## Blinkit

Bars (Blinkit, Instamart, Zepto): CM1 < 18% · COGS > 45% · GM < 35% · Returns > 5% · CM2 target 8% · ASP down > 10% · Returns up > 2 pts. Materiality: ≥ 2% of gross (₹3.28 L) or ≥ 100 units.

Watchlist header: "0 products need action (2+ rules or loss) · 12 checked". Products in the table: 14 · checked (material): 12 · flagged: 4. Result: **all flags correct**.

| Rule | Tile count | Rows with the flag | Tile ₹ | Σ of listed products (re-derived) | OK |
|---|---|---|---|---|---|
| Loss after ads | 0 | 0 | — | ₹0.00 L | ✓ |
| Below healthy ROAS | 0 | 0 | — | ₹0.00 L | ✓ |
| CM1 < 18% | 4 | 4 | ₹-2.73 L | ₹-2.74 L | ✓ |
| COGS > 45% | 0 | 0 | — | ₹0.00 L | ✓ |
| GM < 35% | 0 | 0 | — | ₹0.00 L | ✓ |
| ASP down > 10% | 0 | 0 | — | ₹0.00 L | ✓ |

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
| Ultimate Cozy Pillow | ₹7.71 L | 1043 | — (0.0) | 34.4 | 65.6 | 20.0 | 12.2 | 739 (674) | ✓ |
| Ultimate Car Wedge Seat Cushion | ₹3.73 L | 239 | — (0.0) | 27.0 | 73.0 | 30.4 | 26.1 | 1562 (1562) | ✓ |
| Nasal Strip Pro | ₹0.71 L | 138 | — (—) | 18.8 | 81.2 | 41.1 | 41.0 | 514 (—) | ✓ |
| Travel Neck Pillow | ₹25.16 L | 1456 | — (0.0) | 30.6 | 69.4 | 28.8 | 23.5 | 1728 (1728) | ✓ |
| Ultimate Car Neck Rest Pillow | ₹17.28 L | 1343 | — (0.0) | 22.2 | 77.8 | 36.1 | 36.1 | 1286 (1286) | ✓ |

## CRED

Bars (CRED, Firstcry): CM1 < 20% · COGS > 45% · GM < 40% · Returns > 10% · CM2 target 10% · ASP down > 10% · Returns up > 3 pts. Materiality: ≥ 2% of gross (₹0.26 L) or ≥ 100 units.

Watchlist header: "1 product needs action (2+ rules or loss) · 6 checked". Products in the table: 48 · checked (material): 6 · flagged: 5. Result: **all flags correct**.

| Rule | Tile count | Rows with the flag | Tile ₹ | Σ of listed products (re-derived) | OK |
|---|---|---|---|---|---|
| Returns > 10% | 0 | 0 | — | ₹0.00 L | ✓ |
| COGS > 45% | 4 | 4 | ₹-0.63 L | ₹-0.63 L | ✓ |
| GM < 40% | 0 | 0 | — | ₹0.00 L | ✓ |
| ASP down > 10% | 1 | 1 | ₹-0.68 L | ₹-0.68 L | ✓ |
| Returns up > 3 pts | 1 | 1 | ₹-0.01 L | ₹-0.01 L | ✓ |

<details><summary>Every flagged product</summary>

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ROAS / BE | ASP (prev) | Flags shown | Re-derived | OK |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Men's Cloud Comfort Shoes - Lace Ups | ₹3.39 L | 226 | — (—) | 56.3 | 43.7 | — | — | — / — | 1499 (—) | cogs | cogs | ✓ |
| Ultimate Wedge Plus Cushion | ₹3.12 L | 201 | — (0.0) | 48.8 | 51.2 | — | — | — / — | 1551 (1706) | cogs | cogs | ✓ |
| Women's Comfort Flat Sandal | ₹2.26 L | 168 | 2.7 (0.0) | 51.6 | 48.4 | — | — | — / — | 1345 (1749) | cogs, asp | cogs, asp | ✓ |
| Orthotics Heel Protector | ₹0.34 L | 54 | 1.9 (2.1) | 54.8 | 45.2 | — | — | — / — | 625 (594) | cogs | cogs | ✓ |
| Orthotics Knee Support Wrap | ₹0.31 L | 62 | 6.2 (1.6) | 36.8 | 63.2 | — | — | — / — | 496 (506) | retup | retup | ✓ |

</details>

5 random unflagged (checked) products:

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ASP (prev) | Clear? |
|---|---|---|---|---|---|---|---|---|---|
| Men's Comfort Dual Strap Sandals | ₹0.74 L | 42 | 4.1 (4.0) | 44.9 | 55.1 | — | — | 1763 (1604) | ✓ |

## Offline

Bars (Offline): CM1 < 30% · COGS > 60% · GM < 40% · Returns > 10% · CM2 target —% · ASP down > 10% · Returns up > 3 pts. Materiality: ≥ 2% of gross (₹9.55 L) or ≥ 100 units.

Watchlist header: "20 products need action (2+ rules or loss) · 27 checked". Products in the table: 165 · checked (material): 27 · flagged: 23. Result: **all flags correct**.

| Rule | Tile count | Rows with the flag | Tile ₹ | Σ of listed products (re-derived) | OK |
|---|---|---|---|---|---|
| CM1 < 30% | 19 | 19 | ₹-42.43 L | ₹-42.44 L | ✓ |
| Returns > 10% | 4 | 4 | ₹-2.39 L | ₹-2.39 L | ✓ |
| COGS > 60% | 19 | 19 | ₹-41.53 L | ₹-41.56 L | ✓ |
| GM < 40% | 19 | 19 | ₹-41.53 L | ₹-41.56 L | ✓ |
| ASP down > 10% | 7 | 7 | ₹-95.89 L | ₹-95.89 L | ✓ |
| Returns up > 3 pts | 5 | 5 | ₹-1.70 L | ₹-1.70 L | ✓ |

<details><summary>Every flagged product</summary>

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ROAS / BE | ASP (prev) | Flags shown | Re-derived | OK |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Travel Neck Pillow | ₹61.30 L | 8246 | 2.6 (0.5) | 82.2 | 17.8 | 11.0 | — | — / — | 743 (808) | cm1, cogs, gm | cm1, cogs, gm | ✓ |
| 3D Eye Mask | ₹34.95 L | 8304 | 1.0 (0.0) | 99.2 | 0.8 | -7.2 | — | — / — | 421 (672) | cm1, cogs, gm, asp | cm1, cogs, gm, asp | ✓ |
| 3D Posture Plus Ergonomic Chair | ₹29.20 L | 190 | — (0.9) | 72.8 | 27.2 | 9.9 | — | — / — | 15369 (16347) | cm1, cogs, gm | cm1, cogs, gm | ✓ |
| ErgoLuxe Executive Chair | ₹21.36 L | 65 | 3.2 (0.0) | 56.0 | 44.0 | 34.2 | — | — / — | 32863 (33087) | retup | retup | ✓ |
| Orthotics Heel Protector | ₹13.74 L | 2960 | 0.2 (0.8) | 83.8 | 16.2 | 7.7 | — | — / — | 464 (510) | cm1, cogs, gm | cm1, cogs, gm | ✓ |
| Ultimate Car Comfort Bundle | ₹11.07 L | 518 | 0.1 (7.5) | 61.0 | 39.0 | 24.0 | — | — / — | 2137 (3173) | cm1, cogs, gm, asp | cm1, cogs, gm, asp | ✓ |
| Prime Plus Electric Wheelchair | ₹10.17 L | 14 | 12.0 (12.1) | 73.5 | 26.5 | 23.4 | — | — / — | 72650 (68200) | cm1, cogs, gm, ret | cm1, cogs, gm, ret | ✓ |
| Ultimate Lap Desk Pillow | ₹7.85 L | 374 | 1.3 (22.1) | 85.2 | 14.8 | -13.6 | — | — / — | 2099 (2642) | cm1, cogs, gm, asp | cm1, cogs, gm, asp | ✓ |
| Cloud Backrest Cushion | ₹7.70 L | 619 | — (0.9) | 84.7 | 15.3 | 9.4 | — | — / — | 1244 (1343) | cm1, cogs, gm | cm1, cogs, gm | ✓ |
| Ultimate Pro Seating Combo | ₹5.14 L | 273 | — (0.0) | 69.1 | 30.9 | 17.4 | — | — / — | 1882 (2360) | cm1, cogs, gm, asp | cm1, cogs, gm, asp | ✓ |
| Ultimate Deep Sleep Pillow | ₹4.51 L | 335 | 14.5 (4.2) | 71.8 | 28.2 | 12.4 | — | — / — | 1348 (1220) | cm1, cogs, gm, ret, retup | cm1, cogs, gm, ret, retup | ✓ |
| Five Finger Neck Massager | ₹4.19 L | 124 | — (0.0) | 82.9 | 17.1 | 12.9 | — | — / — | 3377 (2430) | cm1, cogs, gm | cm1, cogs, gm | ✓ |
| Cloud Comfort Arch Support Slippers | ₹3.85 L | 312 | 5.7 (199.6) | 74.4 | 25.6 | 15.8 | — | — / — | 1234 (—) | cm1, cogs, gm | cm1, cogs, gm | ✓ |
| Men's Comfort Dual Strap Sandals | ₹3.60 L | 264 | 5.2 (151.9) | 70.4 | 29.6 | 24.6 | — | — / — | 1364 (—) | cm1, cogs, gm | cm1, cogs, gm | ✓ |
| Lumbo Sacral Belt | ₹3.38 L | 284 | 12.6 (2.5) | 69.5 | 30.5 | 25.6 | — | — / — | 1188 (1065) | cm1, cogs, gm, ret, retup | cm1, cogs, gm, ret, retup | ✓ |
| Adjustable Wedge Max Cushion | ₹3.18 L | 118 | — (0.0) | 80.0 | 20.0 | 10.9 | — | — / — | 2697 (2220) | cm1, cogs, gm | cm1, cogs, gm | ✓ |
| Contour Cervical Pillow | ₹2.86 L | 379 | 2.6 (—) | 77.8 | 22.2 | 6.7 | — | — / — | 754 (—) | cm1, cogs, gm | cm1, cogs, gm | ✓ |
| Ultimate Car Neck Rest Pillow | ₹2.75 L | 412 | 4.4 (0.3) | 52.3 | 47.7 | 37.2 | — | — / — | 667 (601) | retup | retup | ✓ |
| Dual Gel Insoles | ₹0.81 L | 200 | — (67.5) | 78.7 | 21.3 | 11.5 | — | — / — | 405 (33466) | cm1, cogs, gm, asp | cm1, cogs, gm, asp | ✓ |
| Orthopedic Heel Pad Insole | ₹0.69 L | 185 | 2.3 (43.2) | 34.5 | 65.5 | 55.8 | — | — / — | 376 (422) | asp | asp | ✓ |
| Orthotics Knee Support Wrap | ₹0.64 L | 151 | 14.5 (0.9) | 58.6 | 41.4 | 31.6 | — | — / — | 422 (428) | ret, retup | ret, retup | ✓ |
| Nasal Strip Pro | ₹0.55 L | 2836 | — (0.0) | 598.7 | -498.7 | -642.5 | — | — / — | 19 (24) | cm1, cogs, gm, asp | cm1, cogs, gm, asp | ✓ |
| Nasal Strips | ₹0.05 L | 315 | — (243.8) | 763.3 | -663.3 | -866.0 | — | — / — | 15 (—) | cm1, cogs, gm | cm1, cogs, gm | ✓ |

</details>

5 random unflagged (checked) products:

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ASP (prev) | Clear? |
|---|---|---|---|---|---|---|---|---|---|
| Portable Travel Seat Cushion | ₹0.87 L | 111 | — (0.0) | 53.4 | 46.6 | 38.4 | — | 787 (779) | ✓ |
| Orthotics Posture Corrector Pro | ₹2.14 L | 378 | — (0.6) | 40.4 | 59.6 | 52.1 | — | 565 (552) | ✓ |
| Ultimate Car Backrest Cushion | ₹2.18 L | 225 | 0.7 (0.0) | 59.5 | 40.5 | 30.9 | — | 970 (1028) | ✓ |
| Cold & Hot Therapy Cap | ₹8.31 L | 869 | 0.4 (0.0) | 43.9 | 56.1 | 51.4 | — | 956 (980) | ✓ |

## EBO

Bars (EBO, Offline): CM1 < 30% · COGS > 50% · GM < 40% · Returns > 10% · CM2 target —% · ASP down > 10% · Returns up > 3 pts. Materiality: ≥ 2% of gross (₹5.84 L) or ≥ 100 units.

Watchlist header: "7 products need action (2+ rules or loss) · 33 checked". Products in the table: 198 · checked (material): 33 · flagged: 14. Result: **all flags correct**.

| Rule | Tile count | Rows with the flag | Tile ₹ | Σ of listed products (re-derived) | OK |
|---|---|---|---|---|---|
| CM1 < 30% | 3 | 3 | ₹-0.68 L | ₹-0.68 L | ✓ |
| Returns > 10% | 5 | 5 | ₹-8.24 L | ₹-8.24 L | ✓ |
| COGS > 50% | 10 | 10 | ₹-2.57 L | ₹-2.58 L | ✓ |
| GM < 40% | 1 | 1 | ₹-0.20 L | ₹-0.19 L | ✓ |
| ASP down > 10% | 3 | 3 | ₹-1.44 L | ₹-1.44 L | ✓ |
| Returns up > 3 pts | 4 | 4 | ₹-2.98 L | ₹-2.98 L | ✓ |

<details><summary>Every flagged product</summary>

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ROAS / BE | ASP (prev) | Flags shown | Re-derived | OK |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Mobility Transfer Lift | ₹15.51 L | 48 | 16.1 (24.3) | 41.7 | 58.3 | 49.1 | 47.6 | — / — | 32316 (32138) | ret | ret | ✓ |
| Vajra Gaming Chair | ₹14.49 L | 30 | 4.4 (13.6) | 51.2 | 48.8 | 42.3 | 40.8 | — / — | 48290 (44898) | cogs | cogs | ✓ |
| AeroMesh Ergo Chair | ₹9.43 L | 60 | 18.2 (23.4) | 52.3 | 47.7 | 26.1 | 24.6 | — / — | 15723 (15452) | cm1, cogs, ret | cm1, cogs, ret | ✓ |
| Carbon Fiber Electric Wheelchair | ₹9.29 L | 8 | 8.6 (14.4) | 62.4 | 37.6 | 35.5 | 34.0 | — / — | 116125 (124369) | cogs, gm | cogs, gm | ✓ |
| Prime Plus Electric Wheelchair | ₹8.47 L | 12 | 17.3 (18.9) | 58.5 | 41.5 | 38.4 | 36.9 | — / — | 70569 (71904) | cogs, ret | cogs, ret | ✓ |
| Ergoluxe Electric Standing Desk | ₹7.80 L | 24 | 8.3 (0.0) | 51.9 | 48.1 | 42.8 | 41.3 | — / — | 32511 (33634) | cogs, retup | cogs, retup | ✓ |
| 3D Posture Plus Ergonomic Chair | ₹6.59 L | 38 | 23.0 (3.9) | 57.3 | 42.7 | 20.4 | 18.9 | — / — | 17335 (19502) | cm1, cogs, ret, retup, asp | cm1, cogs, ret, retup, asp | ✓ |
| Adjustable Wedge Max Cushion | ₹6.21 L | 175 | 8.2 (9.3) | 53.9 | 46.1 | 34.2 | 32.7 | — / — | 3549 (3644) | cogs | cogs | ✓ |
| Prime Electric Wheelchair | ₹5.99 L | 9 | 17.4 (0.0) | 51.0 | 49.0 | 45.2 | 43.7 | — / — | 66611 (65802) | cogs, ret, retup | cogs, ret, retup | ✓ |
| Ultimate Deep Sleep Pillow | ₹4.35 L | 290 | 4.7 (7.3) | 51.4 | 48.6 | 31.0 | 29.5 | — / — | 1499 (1608) | cogs | cogs | ✓ |
| Ultimate Neck Contour Cervical Plus Pillow | ₹2.40 L | 163 | 5.2 (7.0) | 45.5 | 54.5 | 29.2 | 27.7 | — / — | 1473 (1597) | cm1 | cm1 | ✓ |
| Lumbo Sacral Belt | ₹2.19 L | 162 | 4.8 (6.3) | 39.7 | 60.3 | 53.6 | 52.1 | — / — | 1352 (1531) | asp | asp | ✓ |
| Travel Neck Pillow | ₹1.26 L | 111 | 7.3 (4.0) | 46.3 | 53.7 | 41.3 | 39.8 | — / — | 1136 (1431) | retup, asp | retup, asp | ✓ |
| Gel Max Comfort Insole | ₹0.68 L | 100 | — (0.0) | 50.4 | 49.6 | 37.5 | 36.0 | — / — | 684 (685) | cogs | cogs | ✓ |

</details>

5 random unflagged (checked) products:

| Product | Gross | Units | Ret % (prev) | COGS % | GM % | CM1 % | CM2 % | ASP (prev) | Clear? |
|---|---|---|---|---|---|---|---|---|---|
| Orthotics Posture Corrector Pro | ₹5.24 L | 574 | 1.0 (0.7) | 21.3 | 78.7 | 69.1 | 67.6 | 913 (845) | ✓ |
| Orthotics Knee Support Wrap | ₹0.94 L | 152 | 2.3 (0.0) | 29.6 | 70.4 | 58.5 | 57.0 | 620 (683) | ✓ |
| Arch Support Insoles | ₹2.64 L | 197 | 0.4 (1.1) | 25.5 | 74.5 | 67.1 | 65.6 | 1341 (1373) | ✓ |
| Carbon Fiber X Electric Wheelchair | ₹10.94 L | 8 | — (13.6) | 46.8 | 53.2 | 51.6 | 50.1 | 136800 (136281) | ✓ |
| ErgoLuxe Executive Chair | ₹28.86 L | 91 | 5.1 (3.0) | 49.8 | 50.2 | 38.1 | 36.6 | 31714 (33013) | ✓ |

## Previous period: per-product rows add up to the card totals

For every tab and sub-tab, the previous-period summary (session cache `pnl.prev2.*`, the hidden summary-only P&L run on 5–30 Sep) carries per-product gross, units and returns for the watchlist. Their sums must equal the same summary's gross / units / returns, which the cards' ▲/▼ use.

| Tab | Products | Σ gross | Card gross | Σ units | Card units | Σ returns | Card returns | OK |
|---|---|---|---|---|---|---|---|---|
| all | 200 | ₹4997.83 L | ₹5013.47 L | 367840 | 369190 | ₹840.18 L | ₹332.85 L | ✗ |
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
