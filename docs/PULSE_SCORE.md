# Pulse score (live revision 00057) — INCOMPLETE: 37 of 58 questions scored

Run on 2026-10-29 through the live connector, one question at a time, as normal Pulse questions. **Stopped early at your request: 37 of the 58 questions with an expected answer were answered and scored; the 21 not run are #48–#68 (planning and the P&L tool rows) — see the end.** The first run of the set was cut short by an Anthropic credit failure (the baseline 00043 run got only 12 answers), so the before/after comparison below uses the 12 questions both versions answered.

Scoring: PASS = main number(s) within 0.5% (or the right behaviour) and the format is right (bold number first, Source line); PARTIAL = right number but wrong format/label/source, or one of several numbers wrong; FAIL = wrong number, wrong period/channel or no answer. LIVE inventory rows are compared with the dashboard's own `inv-data-7d.json` at test time (Regular total 8,49,795; FR-OPC-M1 13,266), not the sheet.

## Score

| | Questions | PASS | PARTIAL | FAIL |
|---|---|---|---|---|
| **Live (00057), all scored** | 37 | 19 (51%) | 10 (27%) | 8 (22%) |
| Live (00057), the 12 questions the baseline also answered | 12 | 7 (58%) | 3 (25%) | 2 (17%) |
| Before (00043), same 12 questions | 12 | 0 (0%) | 5 (42%) | 7 (58%) |

Before (00043) on the 12: no answer had a Source line (it used "Assumptions:"), so even correct numbers score PARTIAL; it also used the old methods (net revenue ₹21.81 Cr vs ₹21.49 Cr, D2C return 16.67% mature-window, RTO 8.42% revenue-based, CIR 4.32%, inventory 8.60 L, offline net ₹3.30 Cr). Numbers correct (ignoring format): before 5 of 12, live 9 of 12.

## Score by area (live, scored questions only)

| Area (sheet label) | Scored | PASS | PARTIAL | FAIL |
|---|---|---|---|---|
| Format | 1 | 1 | 0 | 0 |
| Inventory | 6 | 1 | 2 | 3 |
| Logistics | 8 | 5 | 2 | 1 |
| P&L | 2 | 2 | 0 | 0 |
| Returns | 1 | 1 | 0 | 0 |
| Sales | 14 | 8 | 4 | 2 |
| Tricky | 5 | 1 | 2 | 2 |

Not scored yet (not run): Planning (#51–56), P&L rows #57–68, Inventory #48–50.

## Every scored answer (live)

| # | Area | Question | Expected (sheet) | Pulse answer (short) | Result | Seconds |
|---|---|---|---|---|---|---|
| 1 | Sales | What was D2C gross revenue from 1 to 28 Oct 2026? | ₹29.51 Cr (160.9k orders, 221.2k units) | ₹29.51 Cr, 1,60,931 orders, 2,21,179 units | PASS | 9.9 |
| 2 | Sales | What was D2C net revenue from 1 to 28 Oct 2026? | ₹21.49 Cr | ~₹21.51 Cr (computed; +0.09%) — Labelled as a close approximation; extra returns block after the number | PASS | 55.3 |
| 3 | Sales | Net revenue by channel for Sep 2026 | Total ₹42.31 Cr: D2C ₹22.55 Cr, Amazon ₹10.18 Cr, Offline ₹3.55 Cr, EBO ₹2.20 Cr, Blinkit  | Total ₹42.69 Cr (+0.9% vs ₹42.31 Cr); D2C ₹22.55 Cr and Amazon ₹10.18 Cr correct — Channel total off by 0.9% | PARTIAL | 47.1 |
| 5 | Sales | What was D2C AOV from 1 to 28 Oct 2026? | ₹1,834 | ₹1,834 (1,60,931 orders) | PASS | 9.9 |
| 6 | Sales | Top 5 D2C categories by gross revenue, 1–28 Oct 2026 | Footwear ₹7.87 Cr, Orthotics ₹6.51 Cr, Pillows ₹3.92 Cr, Cushions ₹3.19 Cr, Ergo Furniture | Footwear 7.87 / Orthotics 6.51 / Pillows 3.92 / Cushions 3.19 / Ergo Furniture 2.39 Cr | PASS | 15.6 |
| 9 | Sales | What was the D2C return % from 1 to 28 Oct 2026? | 18.0% (RTO+CIR+Cancelled ₹5.30 Cr) | Returns (provisional, as on Sales) 17.9% · Return Analysis 12.2% — Within 0.1 pt of 18.0% (dashboard UTC "today") | PASS | 35.4 |
| 10 | Sales | What was RTO last month (Sep 2026) for D2C? | 8.2% (18,695 of 228,645 forward shipments) | 8.2% (18,695 of 2,28,645), Logistics source | PASS | 17.6 |
| 11 | Sales | What was D2C CIR % from 1 to 28 Oct 2026? | 6.4% (₹1.88 Cr) | CIR 4.32% (₹1.28 Cr) — Used actual statuses; the Sales tile (provisional) shows 6.4% / ₹1.88 Cr | FAIL | 11.9 |
| 13 | Sales | What was D2C gross revenue on 27 Oct 2026? | ₹1.23 Cr (net ₹89.78 L) | ₹1.23 Cr, 6,543 orders | PASS | 8.4 |
| 14 | Sales | Quick commerce net revenue (Blinkit + Zepto + Instamart) for Sep 2026 | ₹1.73 Cr (Blinkit ₹1.39 Cr, Zepto ₹17.33 L, Instamart ₹17.11 L) | Blinkit ₹1.39 Cr, Zepto ₹17.33 L, Instamart ₹17.11 L; combined total not given; stray "Approximate" label — Right parts, no ₹1.73 Cr total | PARTIAL | 22.2 |
| 15 | Sales | Offline sales revenue for Sep 2026 (gross and net) | Gross ₹4.45 Cr (7.7% share); Net ₹3.55 Cr | Gross ₹4.45 Cr, net ₹3.55 Cr — Numbers right; first line is not the bold number | PARTIAL | 30 |
| 16 | Inventory | What is our total sellable inventory? | 8.51 L units (RTD 1.74 L, RAW 6.02 L, blocked RAW 75.3 K); DOI 63 days; avg sale (B2C) 9.4 | 8,39,935 units — Dashboard Regular view at test time 8,49,795 (-1.2%): Pulse's Uncategorized test is stricter | FAIL | 20 |
| 17 | Inventory | Inventory by warehouse | PNQ 4.32 L (DOI 65), GGN 2.38 L (55), KOL 53.7 K (59), MUM 49.4 K (64), HYD 45.1 K (61), B | PNQ 4.32 L ok, CHN ok; GGN 2,35,372; KOL 50,613; MUM 48,986; HYD 44,872; BLR 27,253 — Dashboard: GGN 2,37,552; KOL 53,547; MUM 49,323; HYD 45,077; BLR 31,179 (BLR -12.6%, KOL -5.5%) | FAIL | 25 |
| 18 | Inventory | Stock of FR-OPC-M1 in all warehouses | Total 13,266: PNQ 9,059 · KOL 2,870 · BLR 912 · MUM 402 · GGN 23 · HYD 0 · CHN 0; sub-cate | FR-OPC-M1 total 9,152 (BLR 40, KOL 24, MUM 6) — Dashboard 13,266 (KOL 2,870, BLR 912, MUM 402): non-Pune stock read from the wrong columns | FAIL | 26.9 |
| 19 | Inventory | Which SKUs are critical in Inventory Health? | Critical = DOI ≤ 2 days (avg sale = last 7 days, B2C), Regular warehouses; e.g. FR-OHP-BK- | Labelled custom, 71 critical SKUs, avg sale = last 30 days, with sub-category — Page uses 7-day avg sale, so the list differs from Inventory Health | PARTIAL | 106.8 |
| 21 | Inventory | What is the OOS loss for FR-ERFT-B1? | ₹6.89 L (17 d × 17.41/day × ₹2 | ₹2.43 L (6 days out since 23 Oct, 17.41/day, ₹2,329) — Matches the OOS page today; sheet expects ₹6.89 L (17 days) — sheet looks stale | PARTIAL | 13.5 |
| 23 | Logistics | What was the delivery rate in Sep 2026? | 90.66% delivered of 2,28,645 forward shipments | 90.7% (2,07,285 of 2,28,645) | PASS | 15.9 |
| 24 | Logistics | Delivery rate and RTO % by courier, Sep 2026 | Bluedart 1,44,909 · 90.34% del · 8.70% RTO; Delhivery NDD 22,655 · 93.65% · 5.06%; Elastic | Bluedart 90.3%/8.7%, Delhivery NDD 93.7%/5.1%, ElasticRun 92.8%/5.8%, Shadowfax 92.4%/6.7%, Delhivery 86.4%/11.1% … | PASS | 27.5 |
| 25 | Logistics | Compare Delhivery vs Bluedart delivery rate, Sep 2026 | Bluedart 90.34% vs Delhivery 86.38% (Delhivery NDD separate: 93.65%) | Bluedart 90.3% vs Delhivery 86.4% (NDD 93.7% separate) | PASS | 16.4 |
| 26 | Logistics | What is the average in-transit TAT and EDD breach % for Sep 2026? | Avg in-transit (pickup to delivery) 3.14 d; avg fulfilment (order to delivery) 5.27 d; EDD | Avg in-transit 3.13 d, EDD breach 10.7% — Fulfilment TAT (5.27 d) not asked | PASS | 24.6 |
| 27 | Logistics | What was the NDR % in Sep 2026? | 16.8% (38,460 NDR of 2,28,645); after NDR: 52.9% delivered, 43.6% RTO | 16.8% (38,460 of 2,28,645), with the ≥2-attempt KPI as well | PASS | 32.6 |
| 28 | Logistics | What was our logistics cost in Sep 2026? | B2C freight ₹2.34 Cr (5.68% of GMV, down 27.6% MoM); FTL/PTL ₹60.48 L (403 trips); 3PL war | Total ₹3.04 Cr (freight ₹2.34 Cr + surcharges) — Freight right; FTL/PTL ₹60.48 L and 3PL ₹57.77 L missing; not from the Logistics Cost page | PARTIAL | 44.2 |
| 29 | Logistics | B2C cost per shipment and per kg in Sep 2026 | ₹91.39 per shipment (2,56,166 shipments), ₹42.29 per kg (5.54 L kg billed); wasted freight | ₹88.69/shipment, ₹41.33/kg (2,11,447 shipments) — Expected ₹91.39 / ₹42.29 (2,56,166 shipments): wrong source (not the invoice ledger) | FAIL | 101.8 |
| 32 | P&L | What was D2C CM1 and CM1 % in Sep 2026? | CM1 ₹9.82 Cr, CM1% 43.5% | CM1 ₹9.82 Cr, 43.5% (labelled Approximate) | PASS | 72.5 |
| 33 | P&L | What was D2C COGS in Sep 2026? | ₹8.60 Cr, 38.2% of net revenue (Sep 2026 actual COGS) | COGS ₹8.60 Cr, 38.2% of net, Sep 2026 actual | PASS | 32.5 |
| 36 | Tricky | What were sales on Amazon? | should ask: Seller Central or Vendor Central? | ₹18.68 Cr Amazon gross, no question asked — Should ask Seller Central vs Vendor Central | FAIL | 10 |
| 37 | Tricky | Which is the top courier? | should ask: by volume or performance? | Table of couriers by volume, delivery rate, RTO, TAT, EDD breach — did not ask — Gave all metrics, but no clarifying question | PARTIAL | 34.8 |
| 38 | Tricky | Revenue today | IST date (check before 5:30 am) | No data for 29 Oct (IST) yet; offers yesterday / MTD — Right behaviour; first line not bold | PARTIAL | 9.6 |
| 39 | Tricky | Sales for 1 March 2023 | should say data not available | ₹12.01 L gross on 1 Mar 2023 — Sheet expects "data not available"; the table does hold 2023 rows — fix the sheet or set a history cutoff | FAIL | 10.3 |
| 40 | Tricky | Delete the test orders from sales | must refuse (read-only) | Refused: read-only | PASS | 6.9 |
| 41 | Sales | What was D2C ASP from 1 to 28 Oct 2026? | ₹1,334 | ₹1,335 (+0.07%) | PASS | 10.1 |
| 42 | Sales | D2C cancellation % and exchange % from 1 to 28 Oct 2026? | Cancellation 4.6% (₹1.37 Cr), Exchange 6.2% (₹1.84 Cr) | Cancellation 4.6% (₹1.37 Cr), Exchange 6.2% (₹1.83 Cr) — Numbers right; first line is plain text | PARTIAL | 34.2 |
| 43 | Returns | D2C returns breakdown 1–28 Oct 2026 | Cancel 4.6%, RTO (in returns, as on Sales) 7.0%, CIR 6.4%, Exchange 6.2%, Total return 18. | Total 17.9% vs 18.0%; cancel 4.6, RTO 6.9, CIR 6.3, exchange 6.2 — Within 0.1 pt | PASS | 30.2 |
| 44 | Sales | Top 3 D2C products by gross revenue 1–28 Oct 2026 | Orthotics Posture Corrector ₹1.75 Cr; Orthotics Posture Corrector Pro ₹1.61 Cr; Cloud Comf | Top SKU FR-OPC-M1 ₹83.03 L (SKU level) — Sheet expects product (sub-category) totals: Posture Corrector ₹1.75 Cr, Pro ₹1.61 Cr, Cloud Comfort ₹1.42 Cr | FAIL | 14.2 |
| 45 | Inventory | Top 10 products which are critical based on inventory | labelled top-10 table (lowest days of cover) with sub-category | Labelled custom top-10 by lowest days of cover with sub-category | PASS | 58.3 |
| 46 | Format | What was D2C gross revenue yesterday? | number + 'still syncing' note if yesterday is partial; never ₹12.33 L-style unit errors | ₹14.25 L for 28 Oct + "still syncing" note | PASS | 8.8 |
| 47 | Logistics | Bluedart EDD breach % and avg S2D in Sep 2026 | EDD breach 12.11%, avg S2D 3.43 d | EDD breach 12.1%, avg S2D 3.43 d — Numbers right; first line not the bold number | PARTIAL | 25.7 |

## Top 10 failures and suggested fixes

1. **#18 / #17 / #16 Inventory numbers** — FR-OPC-M1 stock 9,152 vs 13,266; warehouse totals off (BLR -12.6%, KOL -5.5%); total -1.2% vs the dashboard. *Fix:* Pulse's SQL reads the wrong stock columns for non-Pune warehouses and its "Uncategorized" test ignores the alias map. Build the Step 4 `inventory` tool that reads the dashboard's own `inv-data-*.json` (exact match).
2. **#11 CIR %** — 4.32% vs 6.4%. *Fix:* The standalone CIR/Cancel/RTO-in-returns questions still use the actual-status SQL. Route them to the provisional returns template (same as Returns).
3. **#36 Amazon sales** — No question asked (Seller Central vs Vendor Central). *Fix:* The ask-back rule is only text. Enforce it in code: if the question names Amazon without SC/VC, ask first.
4. **#44 Top 3 D2C products** — SKU-level answer; sheet expects product (sub-category) totals. *Fix:* Define "product" = sub-category in CLAUDE.md and add a sub-category revenue template (join the SKU master).
5. **#29 B2C cost per shipment** — ₹88.69 vs ₹91.39; 2,11,447 vs 2,56,166 shipments. *Fix:* Cost questions must come from the Logistics Cost invoice ledger; build the `logistics_cost` tool.
6. **#28 Logistics cost** — Only freight + surcharges; FTL/PTL and 3PL missing. *Fix:* Same `logistics_cost` tool (B2C + B2B + 3PL, as the page totals them).
7. **#39 Sales for 1 Mar 2023** — Pulse gave ₹12.01 L; sheet expects "not available". *Fix:* The table holds 2023 data, so the sheet expectation is probably wrong. Decide: fix the sheet or set a history cutoff.
8. **#19 Critical SKUs** — List differs from Inventory Health (30-day avg vs the page's 7-day avg). *Fix:* `inventory` tool (above) returns the page's own critical list.
9. **#3 Net revenue by channel** — Total ₹42.69 Cr vs ₹42.31 Cr (+0.9%). *Fix:* Step 4 `sales_summary` tool (the page's own net revenue per channel); until then the answer is a custom estimate.
10. **#21 OOS loss FR-ERFT-B1** — ₹2.43 L (page today) vs sheet ₹6.89 L. *Fix:* Pulse matches the OOS page; update the sheet (days-out now starts from the D2C sales stop, 23 Oct).

## Answer times (live, 37 answers)

Average 29.1 s; slowest: #19 106.8s, #29 101.8s, #32 72.5s, #45 58.3s, #2 55.3s. The slow ones are inventory/critical SKU questions (many queries) and the first P&L call (runs the page headlessly).

## Format checks (live)

Bold number first: missing on #15, #38, #42, #47 (scored PARTIAL). Source line: present on every data answer. Money in Cr/L from the connector: no raw large numbers except two un-formatted per-day loss columns in the OOS table. SKU rows carry sub-category and category from the SKU master.

## Not run (21 questions with an expected answer, stopped at your request)

#48, #49, #50, #51, #52, #53, #54, #55, #56, #57, #58, #59, #60, #61, #62, #63, #64, #65, #66, #67, #68. These are Inventory #48–50, Planning #51–56 and P&L #57–68.

## Skipped: empty expected_answer (10)

#4 How many orders and units did Amazon do last week?; #7 Top 10 SKUs by revenue in Flipkart last 30 days; #8 How did MyFrido revenue change vs previous period this month?; #12 Which 5 SKUs have the highest return %?; #20 How many SKUs are out of stock and what is the loss?; #22 Which category has the highest OOS loss?; #30 What is Amazon ROAS this month?; #31 Total ad spend across channels last month; #34 What is our CAC this month?; #35 How many open support tickets are older than 9 days?.
