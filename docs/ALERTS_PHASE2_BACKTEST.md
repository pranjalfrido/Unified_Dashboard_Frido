# Alerts Phase 2 — 90-day backtest (Step 1)

**Status: backtest only. Nothing is built. Waiting for Suraj's OK before Step 2.**
Branch `feat/alerts-phase2` (from `feat/alerts-phase1`), worktree `C:/wt-alerts`. Not pushed, not merged.

**Window:** 2026-08-05 → 2026-11-02 (90 days; run on 2026-11-03). All access read-only (BigQuery, Supabase `product_cogs_monthly` read through the page's own `/api/cogs-monthly` handler). `sa_key.json` was used where it already sits in the worktree; it was not copied anywhere.

**How every number was produced.** Each alert's value comes from the page's own code or handler, called in-process (same pattern as Phase 1's `callHandler`), never from re-derived SQL:

| Family | Page logic reused |
|---|---|
| Revenue, returns (#1, #2, #5, #6) | `api/bq.js` handler payload: `chMap` / `prevChMap` / `dailyArr` (Overview revenue), `resolvedDailySKU` (Sales-tab Return %), `offline.totalsBySub` (Offline credit-note %) |
| P&L (#8–#11) | **`src/pnl/PnLPage.jsx` itself**, rendered headlessly per tab in `summaryOnly` mode (the way the connector's `pnl` tool does it), reading the page's own `kpiSummary` (CM1 %, GM %, COGS %, SnD %). Bundled from this worktree's source; the page's `/api/cogs-monthly` and `/snd-rates.json` fetches were served from the real handler / file |
| Ads (#12, #13) | `/api/bq` `ads.*` + the Ads tab's own ROAS formula (`App.jsx` ~11830–11900) |
| D2C returns (#4, #7) | `api/return-analysis.js` handler |
| Fill rate, allocation (#3, #15) | `api/sales-allocation.js` handler (`fillRateByWarehouse`, `facilityAllocation`) |
| OOS loss (#14) | `api/data/inventory_oos.sql` replayed with a past as-of date + the same per-SKU maths as `api/inventory-oos.js` |
| Logistics (#16–#21) | `api/logistics.js` handler (forward shipments, AWB created-date grain, `shipmentType:'forward'`) |
| Courier cost (#22–#25) | `trendAll` in the page's own `public/logistics-cost-data.json` (the cost page only keeps monthly history; no weekly series exists) |
| Customer (#26–#28) | `api/customer.js` handler (`kpis`, `prevKpis`, `discountRepeatRateByFirst`) |
| Support (#29–#31) | `api/customer-support.js` handler + the page's own `buildModel` / `computeSupportRules` and `SUPPORT_RULES` (targets read from there, not hard-coded) |

**Windows.** Delivery, returns and P&L use only **mature** windows (orders ≥ 15 days old, i.e. ending on or before 19 Oct); the latest 2 weeks are listed as "latest (immature)" where useful. "Days" are rolling 7-day windows (one per day); "weeks" are non-overlapping 7-day windows. Where the data only allows weekly or monthly grain, the unit says so.

---

## Summary table

Kind: **S** = spike alert (ring when worse than usual), **T** = target alert (fixed business target). "Fired" = how many windows the rule would have fired. ⚑ = breached on more than 1 in 3 windows (see "Targets missed" and "Decisions").

| # | Alert and rule | Scope | Kind | Unit (n) | Fired | Page value vs alert value (same dates) | Verdict / proposal |
|---|---|---|---|---|---|---|---|
| 1 | Revenue down > 10% vs previous equal period | Overall + 11 channels | S | days (78) | Overall 10 (13%) · Shopify 19 (24%) · Amazon 21 (27%) · Blinkit 11 (14%) · EBO 26 (33%) · Flipkart 30 ⚑ (38%) · Offline 26 ⚑ · Zepto 39 ⚑ · Instamart 36 ⚑ · Myntra 39 ⚑ · CRED 37 ⚑ · Firstcry 40 ⚑ (weekly: Overall 1/13) | 27 Oct–2 Nov: page `chMap` vs daily sum: Amazon ₹4,35,26,520 vs ₹4,35,26,521; Flipkart ₹51,93,801 = ₹51,93,801; Shopify ₹8,05,68,283 vs ₹8,05,67,956 (₹327 gap, incl. International) | Keep 10% for Overall, Shopify, Amazon, Blinkit, EBO. Flipkart and Myntra at 20% (21% / 32% of days). Skip Zepto, Instamart, CRED, Firstcry (under ₹5 L a week: > 25% of days even at 30%). Offline is lumpy B2B (22/78 even at 30%): skip or evaluate monthly |
| 2 | Return % > 20% | Channels with returns data | S | days (71, mature) | Shopify 8 (11%) · Amazon 13 (18%) · Myntra 38 ⚑ (54%) · Flipkart 51 ⚑ (72%, median 33.6%) · Firstcry 24 ⚑ (34%, thin) · CRED 1 · EBO 0 (see #5) | Sales-tab tile vs P&L page `returnRev/gross`, 29 Sep–5 Oct: Shopify 16.9 = 16.9, Amazon 17.4 = 17.4, Flipkart 13.5 = 13.5, EBO 6.9 = 6.9, Myntra 27.3 = 27.3 | Keep 20% for Shopify and Amazon. Flipkart's normal is above the bar: propose > 38% (≈ p90 + 1). Myntra > 40%. Firstcry: add a volume floor or skip. **Skipped:** Blinkit, Zepto, Instamart (no `Order_Status`, no returns data) |
| 3 | Warehouse fill rate < 80% | 7 warehouses | T | weeks (13) | **13/13 for every warehouse** ⚑ | Same handler field the page uses. Page's own Fill Rate tile: 34–46% all 13 weeks (amber below 90) | Target-type: goes to "Targets missed". Medians: PNQ 61.6, MUM 60.7, GGN 35.4, BLR 20.8, KOL 12.1, HYD 9.7, CHN 0.2 (%). No number change |
| 4 | D2C cancel > 6.5 / RTO > 10 / CIR > 9 / exchange > 8 | D2C | S | weeks (11, mature) | Cancel 0 · RTO 1 (10.1%) · CIR 0 · Exchange 0 | Same `return-analysis` handler the page calls | Keep as is, grouped. Ranges seen: cancel 3.7–5.4, RTO 6.3–10.1, CIR 5.4–6.3, exchange 5.7–7.8 |
| 5 | EBO return % > 10% | EBO | S | days (71) | 7 (10%); weekly 2/11 | EBO tile = P&L `returnRev/gross` (6.9 = 6.9) | Keep. Median 7.7, p90 9.8, max 12.2 |
| 6 | Offline credit-note rate > 10% | Offline | S | weeks (13) | 4 (31%) | Offline tab `cnRev/revSales` = Overview ratio, all 13 weeks identical | Keep (just under 1 in 3). Credit notes are lumpy: 1.6% to 21.5% |
| 7 | D2C sub-category return % > 1.5× trailing 4-week avg, returns ≥ ₹50 k | D2C sub-categories | S | weeks (11) | **11/11 weeks** ⚑ (63 sub-category-weeks of 1,869) | Same `return-analysis` `categoryTable` rows | Too noisy as specified. 2× and ₹1.5 L floor: 7/11 weeks, 11 sub-category-weeks. 2.5× and ₹1 L: 7/11, 8. Recommend 2× / ₹1.5 L, top 3 by returns ₹, evaluated weekly. Wheelchair SKUs recur |
| 8 | CM1 % below bar | P&L channels with CM1 | S | weeks (11, mature) | D2C < 38.5: 0 · Amazon < 20: 0 · Flipkart < 20: 0 · Blinkit/Zepto/Instamart < 18: 0 · EBO < 30: 0 · **Offline < 30: 11/11** ⚑ | The P&L page's own `kpiSummary` (see "P&L reconciliation") | D2C bar sits at the recent low (see note below). Offline bar: Targets missed. **Skipped:** CRED, Firstcry, Myntra (no SnD, so CM1 is null) |
| 9 | GM % below bar | P&L channels with a GM bar | S | weeks (11) | Amazon, Flipkart, EBO, Blinkit, Zepto, Instamart, Firstcry, Myntra: 0 · CRED < 40: 2 · **Offline < 40: 11/11** ⚑ | Same | Offline: Targets missed. **Skipped:** D2C (no GM bar; GM = 100 − COGS, covered by #10) |
| 10 | COGS % above bar | Every P&L channel | S | weeks (11) | D2C > 43: 0 (max 42.7) · Amazon > 45: 0 · Flipkart > 55: 0 · EBO > 50: 0 · QC > 45: 0 · Myntra 2 · Firstcry 2 · **CRED 9/11** ⚑ · **Offline > 60: 11/11** ⚑ | Same | CRED and Offline: Targets missed. D2C bar note below |
| 11 | SnD % high | P&L channels with SnD | S | weeks (11) | Proposed bars fire 0/11 by construction | D2C SnD from the page's own code: 16.0–19.8%, median 18.8 | Proposed bars below. **Skipped:** CRED, Firstcry, Myntra |
| 12 | ROAS down ≥ 20% vs previous period, spend ≥ ₹50 k both | Ads-page tabs | S | weeks (13) | D2C 1 · Amazon 0 · Blinkit 0 · Flipkart 1 · Zepto 3 · Myntra 4 (31%) | Page's own ROAS (channel ex-GST sales ÷ spend); uses the same `data.ads`, `chMap`, `prevChMap` | Keep. **Skipped:** Instamart (spend under ₹50 k in all 13 weeks), CRED (no ad spend or previous revenue in the page's maps) |
| 13 | Unattributed spend > 20% (admin only) | All ads | S | weeks (13) | **9/13 overall** ⚑. Meta 10/13 (latest 3 weeks 46–52%) · Zepto 13/13 (46–57%) · Google 0 (11–15%) · all others 0 | Page's `allSpendDetail` 'Unattributed' row ÷ total spend | Targets missed (admin). Mostly Meta and Zepto |
| 14 | OOS loss above a ₹ band | Overall + top categories | S | weekly as-of dates (13) | Proposed bands: overall > ₹35 L 5/13, > ₹40 L 0/13 | **Exact match:** page logic today ₹28,10,650 / 54 SKUs = replay at the same as-of ₹28,10,650 / 54 SKUs | Proposed bands below. Weekly replay only (daily would be 90 heavy SQL runs) |
| 15 | Allocation < 80% warning, < 60% critical | Each warehouse and channel | T | weeks (13) | See "#15 detail". BLR 13 (10 critical) · MUM 13 (13) · HYD 13 (13) · CHN 12 (12) · PNQ 1 · GGN 0 · KOL 0 | Same handler field (`facilityAllocation.allocationPct`) | Four warehouses breach every week ⚑: Targets missed. The page has no 80/60 bars (only amber < 90 on Fill Rate). Metric-definition caveat in "Decisions" |
| 16 | Courier RTO or delivery % > 2 sd from its own normal | All couriers, grouped | S | days (42) | **23/42 days** ⚑ at 2 sd | Per-courier `byCourier` rows of the same handler | Too noisy. 2.5 sd, ≥ 1,000 shipments, ≥ 2 pts off normal: 8/42 (19%). 3 sd and 3 pts: 5/42. Recommend 2.5 sd / 1,000 / 2 pts |
| 17 | RTO % > 8% (replaces Phase 1's > 9.5%) | Overall forward | T | days (70) | **33/70 (47%)** ⚑ | Handler `kpis.rto ÷ total_shipments` (what the Performance page shows) | Targets missed. For reference Phase 1's 9.5% fires 4/70. Range 6.98–10.36, median 7.98 |
| 18 | COD RTO % > 17% | COD forward | T | days (70) | **70/70** ⚑ | Handler's own `paymentMode:'COD'` filter = daily series, exact on 3 windows (e.g. 22.55% = 3,373/14,955) | Targets missed. Range 21.1–29.1, median 23.3 |
| 19 | Prepaid RTO % > 2% | Prepaid forward | T | days (70) | **27/70 (39%)** ⚑ | Handler's `paymentMode:'Prepaid'` = daily series, exact (e.g. 1.63% = 602/36,976) | Targets missed. Range 1.55–2.26, median 1.96 |
| 20 | Delivered ≤ 3 days after pickup < 80% | Forward | T | days (70) | **70/70** ⚑ | Handler `delivered_within_3d_of_pickup ÷ orders_delivered_total` (the Overview "Speed & SLA" card's formula; the Logistics Performance page itself doesn't show it) | Targets missed. Range 52.7–66.5, median 61.8 |
| 21 | Delivered ≤ 5 days after order < 80% | Forward | T | days (70) | **70/70** ⚑ | Same, `delivered_within_5d_of_order` | Targets missed. Range 45.8–76.2, median 63.0 |
| 22 | Cost per shipment > ₹90 | B2C courier cost | T | months (3 in window; 9 loaded) | **3/3 (9/9 since Jan)** ⚑ | Page's `cost ÷ n` from `trendAll` (ex-GST, not floored; the headline floors negatives at 0) | Targets missed. ₹127.6 (Jan) → ₹111.0 (Jul) → ₹102.5 (Aug) → ₹91.4 (Sep): falling, close to clearing |
| 23 | Cost per kg > 10% above trailing 3-month avg | B2C courier cost | S | months (6 evaluable) | **4/6** ⚑: Jun +14.6%, Jul +14.1%, Aug +16.2%, Sep +21.6% | Weighted as the page does (Σ cost ÷ Σ charged kg) | Proposed bar > 20% (fires Sep only, 1/6). ₹28.5/kg (Apr) → ₹42.3/kg (Sep) |
| 24 | Courier invoice not loaded, or coverage < 95% | Each B2C courier | S | point-in-time (no load dates exist) | Now: **Safexpress** has no September data (loaded Mar–Aug); **Ekart** none since April; **no courier has October yet** (normal, 3 days into November) | `trendAll` rows per courier and month | Not backtestable (the ledger has no load timestamp). Needs a grace date and a coverage definition, see "Decisions" |
| 25 | Freight % of GMV > 1.5 pts above trailing 3-month avg | B2C courier | S | months (6) | 0/6 (largest rise +0.08 pts) | Page's `cost ÷ shipment value`: Sep 5.68% vs 5.85% | Keep. Sep 5.68, Aug 5.89, Jul 5.40 |
| 26 | LTV:CAC < 3×, held 2 periods | D2C customers | S | 28-day windows (10) | Single window 1 (2.9× on 21 Sep) · held 2 periods: 0 | Handler `kpis.ltvCac`; now 3.3× | Keep |
| 27 | Repeat revenue share down ≥ 2 pts, held 2 periods | D2C customers | S | 28-day windows (10) | 0 (it is rising: +1.5 to +2.6 pts) | Handler `kpis` vs `prevKpis` | Keep |
| 28 | Discount dependence gap ≥ 5 pts | D2C customers | S | 28-day windows (10) | **6/10** ⚑ (gap 4.8–5.5 pts; 4.8 now, falling) | Handler `discountRepeatRateByFirst` | Hovering at the bar. Targets missed, or raise to 6 pts (0/10). Page's own rule is strictly `> 5`, the brief says `≥ 5` |
| 29 | First response time above channel target | Support channels | T | days (72) / weeks (13) | **Chat 70/72 days, 13/13 weeks** ⚑ (26–58 min vs 15) · Email 17/72 (24%), 3/13 · Social 15/72 (21%), 1/13 | `computeSupportRules` + `SUPPORT_RULES.frtTargetSec`, read live | Chat: Targets missed. Email and Social stay as spike alerts. Because the logic will be revised, the alert reads target and formula from the page's code; Inbound and Escalation have no target |
| 30 | Escalation rate up ≥ 0.3 pts | Support | S | days (72) / weeks (12 full) | 6/72 days (8%) · 0/12 weeks | Page's `esc` rule | Keep. Page has no volume floor: propose ≥ 200 interactions in both periods (all 6 firing days already meet it) |
| 31 | Contacts per 100 orders up ≥ 10% | Support | S | days (72) / weeks (13) | 20/72 days (28%) · 5/13 weeks (4/12 without the current partial week = exactly 1 in 3) | Page's `per100` rule | Keep, evaluate weekly on complete weeks only; add a floor (page has none) |

Phase 1 alerts not in this list stay as they are.

---

## Targets missed (breached on more than 1 in 3 windows)

Per your rule these are not dropped and the numbers are not changed: they go to a separate **"Targets missed"** section of the bell, refreshed weekly, same severity colours. Applies to:

| Alert | Breach rate | Range seen |
|---|---|---|
| #17 RTO > 8% | 47% of days | 7.0–10.4% |
| #18 COD RTO > 17% | 100% | 21–29% |
| #19 Prepaid RTO > 2% | 39% | 1.6–2.3% |
| #20 Delivered ≤ 3d of pickup < 80% | 100% | 53–66% |
| #21 Delivered ≤ 5d of order < 80% | 100% | 46–76% |
| #22 Cost per shipment > ₹90 | 100% of months | ₹91.4 (Sep) |
| #3 Warehouse fill rate < 80% | 100% (all 7 warehouses) | 0.2–62% |
| #15 Allocation < 80 / < 60 | 100% for BLR, MUM, HYD, CHN | see detail |
| #29 Chat first response | 97% of days | 26–58 min vs 15 |

Not labelled as targets in your list, but also breached on > 1 in 3 windows: **#13** unattributed spend (69% of weeks, admin), **#8/#9/#10 for Offline** and **#10 for CRED**, **#28** discount gap (60%), **#2 for Flipkart/Myntra** (72% / 54%), **#7**, **#16**, **#1 for small channels**. I have proposed either a materiality floor, a looser bar, or Targets missed for each (see the table). Your call on which way, because you said not to change targets.

---

## Proposed bars where no number was given

**#11 SnD % high** (weekly values from the P&L page's own code; bar ≈ p90 + about 1 pt, rounded. Only 11 mature weeks, so treat as a first proposal):

| Channel | Weekly range | p90 | Proposed bar |
|---|---|---|---|
| D2C | 16.0–19.8 | 19.1 | **> 20%** |
| Amazon | 27.0–29.8 | 29.8 | > 31% |
| Flipkart | 23.0–26.6 | 26.4 | > 28% |
| EBO | 9.7–12.0 | 11.7 | > 13% |
| Offline | 5.6–11.2 | 10.3 | > 12% |
| Blinkit | 42.4–43.0 | 43.0 | > 45% |
| Zepto | 30.0–31.2 | 31.0 | > 33% |
| Instamart | 29.0–30.5 | 30.3 | > 32% |
| CRED, Firstcry, Myntra | not computed by the page | | skipped |

**#14 OOS loss bands** (weekly as-of replay, stocked SKUs; values by week ₹39.6 L, 37.6, 29.6, 37.0, 35.5, 38.2, 10.3, 9.3, 8.2, 13.1, 22.5, 34.6, 26.1):
- Overall: **warning > ₹35 L** (5/13 weeks), **critical > ₹40 L** (0/13; above anything seen). For reference > ₹30 L fires 6/13 and > ₹37 L 3/13.
- Per category (any single category): **warning > ₹12 L** (4/13), **critical > ₹15 L** (1/13). Largest categories by average loss: Mattress Topper (p90 ₹14.0 L), Footwear (₹8.9 L), Cushions (₹13.9 L), Mobility (₹6.4 L), Covers (₹7.6 L), Ergo Furniture (₹5.8 L). Alert lists the top 3 above the band.

**#23 cost per kg:** propose **> 20%** above the trailing 3-month average (fires Sep only, 1/6 months). At your 10% it fires 4 of the 6 months because cost per kg has climbed steadily (₹28.5 to ₹42.3).

---

## P&L reconciliation (please read)

- The P&L alerts use the page's own code, so they match the page by construction.
- To check the pipeline I rendered the page from its own static `public/pnl-data.json` (1–30 Oct, as of 31 Oct) and from a fresh in-process `/api/bq` call (1–31 Oct). **D2C: CM1 39.3 / COGS 41.9 / SnD 18.8** (static) vs **39.2 / 41.9 / 18.9** (fresh): the pipeline is consistent.
- **The Phase 1 notes (`docs/ALERTS_PLAN.md`) quote 43.5 / 41.7 / 15.1 for the live D2C page. I cannot reproduce CM1 and SnD.** COGS agrees (41.9 vs 41.7). Trying the "MyFrido" (39.5/41.0/19.5) and "Mobility" (34.9/55.2/10.0) sub-channel views does not give them either. 43.5% is EBO's CM1 on that file (43.6%), so the earlier reading may have been a different tab. I could not read the live page (no login, as agreed). **Please read the live D2C P&L tab for 1–30 Oct (CM1 %, COGS %, SnD %) and tell me.** If it shows 43.5 / 15.1 the headless render is missing an input and I will fix that before Step 2; if it shows ~39 / ~19, the Phase 1 notes were wrong.
- **D2C bars (38.5 CM1, 43 COGS)** are in your brief and `docs/ALERTS_PLAN.md`; `PNL_RULE_BARS` currently has 30 / 50 for D2C, so Step 2 will set 38.5 / 43 in `ALERT_RULES`. On the 11 mature weeks they fire 0 times (CM1 min 38.5, COGS max 42.7), but the trend is moving toward them: the two latest weeks (still immature, estimated) read CM1 37.9 and 36.2 and COGS 43.0 and 44.0, so **both would fire right now**.
- Sub-channel views (D2C MyFrido/Mobility, Amazon SC/VC, Offline sub-tabs) are not alerted separately; the all-views total is used.

---

## #15 detail (allocation % by warehouse and channel)

`allocationPct` = qty shipped from a warehouse ÷ the demand of the region it sits in (capped at 1). Weeks below 80 / below 60 out of 13:

| Warehouse | < 80 | < 60 | Median |
|---|---|---|---|
| PNQ | 1 | 0 | 100% |
| GGN | 0 | 0 | 100% |
| KOL | 0 | 0 | 100% |
| BLR | 13 | 10 | 39.6% |
| MUM | 13 | 13 | 19.0% |
| HYD | 13 | 13 | 18.9% |
| CHN | 12 | 12 | 0.6% |

By channel (channel-filtered handler calls, weeks < 80 / < 60): Shopify BLR 13/10, MUM 13/13, HYD 13/13, CHN 11/11, GGN 11/2 · Amazon Flex BLR 13/11, MUM 13/13, HYD 6/6 · B2B PNQ 8/6, BLR 10/10, MUM 9/9 · Shopify Mobility GGN 11/11, BLR 12/12, MUM 12/12 · Flipkart BLR 11/6 · Myntra BLR 9/9 · Amazon Etrade BLR 6/4 · Cocoblue BLR 5/5 · Blinkit, Retailez, KOL: 0 or 1.

---

## Skipped channel–metric pairs (page doesn't compute them)

| Metric | Skipped channels | Reason |
|---|---|---|
| #2 Return % | Blinkit, Zepto, Instamart (and International) | `Order_Status` is NULL for quick commerce; no returns data |
| #8 CM1 % | CRED, Firstcry, Myntra | No SnD, so the page's CM1 is null |
| #9 GM % | D2C | No GM bar (GM = 100 − COGS; #10 covers it) |
| #11 SnD % | CRED, Firstcry, Myntra | Page computes no SnD |
| #8–#11 | Overall and International tabs | Flagged "in progress" in the page (all margins null) |
| #12 ROAS down | Instamart, CRED | Instamart spend under ₹50 k in every week; CRED has no ad spend or previous revenue in the page's maps. EBO and Offline have no ads |
| #1 (proposed) | Zepto, Instamart, CRED, Firstcry (and Offline) | Too small or lumpy to be meaningful |

---

## Decisions needed from Suraj before Step 2

1. **D2C P&L reconciliation** (above): what does the live D2C tab show for 1–30 Oct?
2. **Targets missed:** confirm the list above, and whether you want #13, Offline P&L bars, CRED COGS and #28 handled the same way.
3. **#3 and #15 definitions.** Fill rate counts an order as "correct" only if it ships from its nearest warehouse (so it will always be low while stock isn't held everywhere). Allocation % divides by the *region's* demand, so where a region has several warehouses (South: BLR, HYD, CHN) they cannot all reach 80%. Do you want these definitions as they are (Targets missed), or a different measure?
4. **#1:** apply the channel materiality floor and the 20% bar for Flipkart and Myntra?
5. **#2:** Flipkart > 38% and Myntra > 40%, or keep 20% and let them ring?
6. **#7 and #16:** adopt the tighter rules (2× and ₹1.5 L, top 3; 2.5 sd, 1,000 shipments, 2 pts)?
7. **Bars:** #11 SnD table, #14 OOS bands, #23 at 20%.
8. **#24:** which "expected month" and grace date (September data was present by 31 Oct, so something like "month M−1 is expected from the 25th of month M"), and which coverage ratio: the ledger's AWB join is 98.1% (1,701,347 / 1,735,053) but category coverage is 87.0%, which would fire permanently at 95%.
9. **#28:** `≥ 5` (fires 6/10) or the page's `> 5`, or a 6-pt bar?

---

## Caveats

- Reads current table state, not what the dashboard showed on past days (same assumption as Phase 1). Item-master attributes in the OOS replay are current.
- Fill rate, allocation, OOS and P&L were evaluated weekly (13 weeks; P&L 11 mature), not daily: fire counts are in weeks.
- Cost alerts are monthly: the cost page keeps no weekly or invoice-date series, and October invoices aren't loaded yet.
- #1 compares gross revenue incl. GST as the Overview does; Flipkart/Myntra days with a pending report carry the page's estimate in the current period but not the previous (same asymmetry as the page).
- D2C ROAS: the page includes manager-entered "additional spend" in the current period's denominator and not the previous period's; reproduced as is.
- Support weekly periods start Monday; the 2 Nov week holds one day and is left out of weekly counts where noted.
- The throwaway scripts and raw outputs sit untracked in `C:/wt-alerts/_bt2/` (excluded from git locally). Nothing was committed except this file.

---

## Step 2 build notes (2026-11-03)

Decisions applied as approved (all bars in `ALERT_RULES`, `src/config/metricTargets.js`). Data: `scripts/generate-alerts-phase2.mjs` → `public/alerts-phase2.json` (hourly step added to `precompute-inventory.yml`, `continue-on-error`); rules and per-user grouping: `src/alerts/phase2Rules.js`; bell with Critical / Warnings / **Targets missed** sections: `AlertGroups` in `src/App.jsx` (laptop bell and phone Notifications sheet).

- **#8–#11 P&L are built but switched off** (`ALERT_RULES.pnlAlertsEnabled = false`) until the live D2C P&L for 1–30 Oct is read against the headless numbers. With the switch on, D2C CM1 on the latest mature week reads 38.4% (bar 38.5%), so it would ring immediately.
- Phase 1's RTO > 9.5% alert and the two live-range "Delivered ≤3d / ≤5d" alerts are removed: #17, #20 and #21 replace them as Targets missed.
- `precompute-inventory.yml`'s commit step did not list `public/alerts-data.json` (Phase 1's file), so the cron never committed it; it now lists it with `alerts-phase2.json`.
- jsdom 26 (not 30) and esbuild are dev dependencies: the workflow runs Node 20 and jsdom 30 needs Node 22+.
- Flipkart/Myntra return % target (20%) and the 38 / 40 spikes, #28 at the page's `> 5`, #24 per decision 8 (it already finds Safexpress with no September invoices and Shadowfax invoiced for 1.9% of its September shipments).
