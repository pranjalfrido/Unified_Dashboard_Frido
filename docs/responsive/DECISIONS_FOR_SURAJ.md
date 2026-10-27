# Decisions for Suraj

Things found during the unattended runs that change a number, a definition or a rule. Nothing here is in the code unless marked "decided, applied"; the rest wait for your answer.

## P&L Phase 2 (feature/responsive-pnl)

### P1. D2C: "COGS > 50%" and "GM < 50%" always flag the same products
GM % = 100 − COGS % (both on net revenue), so with both bars at 50% on D2C the two rules always list the same products and the same ₹ impact (1–26 Oct: 32 products, −₹21.53 L each). Only D2C has COGS bar + GM bar = 100; on the other channels the two rules differ.
- Option A: keep both (as approved).
- Option B: drop the GM rule on D2C, or move one of the bars (for example GM < 55%).
Today: both shown, as in `PNL_RULE_BARS`.

### P2. The bars flag most of the checked products on several tabs
With the approved bars, 1–26 Oct, the watchlist flags (checked = material products only):

| Tab | Checked | Flagged | Biggest rules |
|---|---|---|---|
| D2C | 153 | 128 | ASP down > 5%: 63 · Returns > 20%: 58 · Below healthy ROAS: 51 |
| Amazon Overall | 119 | 108 | ASP down > 5%: 90 · Returns > 15%: 49 |
| Offline | 43 | 41 | COGS > 45%: 38 · GM < 45%: 34 · CM1 < 30%: 29 |
| EBO | 60 | 46 | COGS > 45%: 27 · ASP down > 5%: 26 |
| Flipkart | 58 | 50 | COGS > 45%: 44 |

When almost everything is flagged, the list stops pointing at the few products that need action.
- Option A: keep the bars (as approved). The ₹ impact sort still puts the biggest problems first.
- Option B: loosen the noisiest bars, for example ASP down > 10% (D2C 63 → fewer), Offline/EBO COGS > 50% / GM < 40%, or raise materiality to ≥ 2% of gross or ≥ 100 units.
Recommendation: B for ASP down (5% catches normal sale-to-no-sale price swings) and the Offline/EBO COGS/GM pair; A for the rest. All bars live in `src/config/metricTargets.js` (`PNL_RULE_BARS`, `PNL_MATERIALITY`), one line each.

### P3. "Others" is a product row with large losses
D2C "Others" (items with no sub-category) shows CM2 −456% (ROAS 0.28x, ₹3.04 L loss) because ad spend tagged to the "Others" sub-category lands on very little revenue. It is real data, but it is a mapping problem rather than a product. Option A: leave it. Option B: exclude "Others" from the watchlist (not from the table). Recommendation: B once the Ads campaign mapping (Ads data step) is settled.

### P1–P3: decided 27 Oct, applied
- **P1 → B:** no GM rule on D2C (`gm: null`); the other channels keep their GM rules.
- **P2 → B:** ASP down > 10% on all channels; EBO / Offline COGS > 50% and GM < 40%; Flipkart COGS > 50% (`PNL_RULE_BAR_OVERRIDES`, the rest of Amazon / Myntra stay at 45%); materiality ≥ 2% of the tab's gross or ≥ 100 units.
- **P3 → B:** "Others" is left out of the watchlist and the margin matrix (`PNL_WATCHLIST_EXCLUDE`). It stays in the Financial View with an ⓘ: "Not a product: sales with no sub-category, plus ad spend not mapped to a product."

Rule check re-run (1–26 Oct, live API, every flag re-derived from the displayed numbers): all flags correct on all 8 views. Flagged / checked per tab:

| Tab | Before (checked → flagged) | After | Flagged % | Biggest rules now |
|---|---|---|---|---|
| D2C | 153 → 128 | 124 → 97 | 78% | Below healthy ROAS 42 · Returns > 20% 41 · ASP down > 10% 36 · Loss 35 |
| Amazon Overall | 119 → 108 | 95 → 73 | 77% | ASP down 39 · Returns > 15% 34 · COGS > 45% 28 |
| Amazon Seller Central | 93 → 81 | 73 → 54 | 74% | Returns 30 · ASP down 23 · COGS 20 |
| Flipkart | 58 → 50 | 34 → 29 | 85% | COGS > 50% 23 · CM1 < 20% 16 · Loss 13 |
| Blinkit | — | 12 → 4 | 33% | CM1 < 18% 4 |
| CRED | — | 6 → 5 | 83% | COGS > 45% 4 |
| Offline | 43 → 41 | 27 → 25 | 93% | COGS > 50% 24 · CM1 < 30% 19 · GM < 40% 19 |
| EBO | 60 → 46 | 33 → 14 | 42% | COGS > 50% 10 · Returns 5 |

### P4. Still far above the 10–30% aim on most tabs (new, needs your call)
The flags are spread across rules, so dropping any one rule doesn't get there (D2C without "Below healthy ROAS" → 70%, without "Returns" → 71%, without "ASP down" → 76%). What drives each tab:
- **Offline:** COGS > 50% flags 24 of 27 products. Offline's normal COGS sits above 50%, so the bar measures the channel, not the product.
- **Flipkart:** COGS > 50% flags 23 of 34, and 13 are loss-making after ads (real).
- **D2C / Amazon:** Returns (> 20% / > 15%) and ASP down each flag about a third of products, and on D2C 35 products lose money after ads (28% of products on that rule alone).
Options:
- a) Show a product only when it trips 2+ rules, or always when it loses money after ads: D2C 78% → 59%, Amazon 77% → 47%, SC 34%, Flipkart 74%, Offline 81%, EBO 21%, CRED 17%, Blinkit 0%.
- b) Set bars per channel from that channel's own median (e.g. flag the worst quarter), so ~25% by design.
- c) Raise the noisy bars per channel: Offline COGS > 60%, Flipkart COGS > 55%, D2C Returns > 25%, Amazon Returns > 20%.
- d) Keep as is; the ₹ impact sort puts the biggest problems first.
Recommendation: c for Offline / Flipkart COGS (the bar is below the channel's normal level), plus b if you want a steady share across tabs. Each is a one-line change in `src/config/metricTargets.js`.

### P4: decided 27 Oct (c, then a), applied
- **c:** Offline COGS > 60%, Flipkart COGS > 55%, D2C Returns > 25%, Amazon (Overall, SC, VC) Returns > 20%.
- **a:** the watchlist header now reads "x products need action (2+ rules or loss) · y checked" and opens that list (laptop: filters the Financial View; phone: full-screen list). Rule tiles keep their full counts.

Rule check re-run (1–26 Oct): all flags correct on all 8 views; the header counts equal a recount from the displayed flags.

| Tab | Checked | Tiles flagged | Needs action | Top 2 rules (tabs above 40%) |
|---|---|---|---|---|
| D2C | 124 | 90 (73%) | 68 (55%) | Below healthy ROAS 42 · ASP down 36 |
| Amazon Overall | 95 | 67 (71%) | 39 (41%) | ASP down 39 · COGS > 45% 28 |
| Amazon SC | 73 | 50 (68%) | 24 (33%) | — |
| Flipkart | 34 | 29 (85%) | 22 (65%) | CM1 < 20% 16 · Loss 13 |
| Blinkit | 12 | 4 (33%) | 0 (0%) | — |
| CRED | 6 | 5 (83%) | 1 (17%) | — |
| Offline | 27 | 23 (85%) | 20 (74%) | CM1 < 30% 19 · COGS > 60% 19 (GM < 40% 19) |
| EBO | 33 | 14 (42%) | 7 (21%) | — |

Still above 40% on "needs action": D2C, Amazon Overall, Flipkart, Offline. No more bars changed (as asked).

### B2B quote rounding (PNL_REVIEW_FIXES.md §5): decided 27 Oct, applied
Round the quoted SP ex-GST up to the next ₹10 (₹504 → ₹510), shown as "₹504 exact · ₹510 quoted", laptop and phone (feature/responsive-pnl c74879dd).

## Ads data (fix/ads-data)

### D2. Unattributed spend: spread it, or show it as its own line?
1–25 Oct: ₹2.86 Cr of ₹8.55 Cr (33%) has no product. 96% is Meta "all products" sale campaigns (`category='all'`, `target_type='all'`), top 10:

| Campaign (Meta) | Spend |
|---|---|
| ABO__DealOfTheDay-All_Products-Videos-New__12092026 | ₹75.96 L |
| ABO__GrandDiwaliSale-Products-StaticAds__09102026 | ₹49.39 L |
| ABO__GrandDiwaliSale-Products-Videos__10102026 | ₹36.77 L |
| ABO__GrandDiwaliSale-PosterTheme-SaleReveal-Videos__09102026 | ₹24.00 L |
| ABO__DealofftheDay-AllProducts-StaticAds__12092026 | ₹22.94 L |
| ABO__PayDaySale-VideoAds__26092026 | ₹11.59 L |
| ABO__GrandDiwaliSale-PosterTheme-80%off-Statics__09102026 | ₹11.33 L |
| ABO__GrandDiwaliSale-Overlay-Videos__10102026 | ₹6.70 L |
| ABO__GrandDiwaliSale-CategoryTheme-Videos__12102026 | ₹5.31 L |
| ABO__DealOfTheDay-All_Products-Videos-Overlays__12092026 | ₹4.78 L |

Plus ₹6.8 L tagged "Socks" (Meta, Google, Amazon, Flipkart), a category that isn't in the item master, and ₹0.6 L with no category.
The two data paths disagree today: the live API spreads "all" spend over products by revenue share; the static file (used for most ranges) leaves it in "Others / Unattributed" at ~0x ROAS.
- **a)** Show it as its own line, "₹2.86 Cr (33%) not linked to a product", and make category / product ROAS attributed-only (ADS_MASTER_PLAN B2). Same on both paths.
- **b)** Spread it by revenue share on both paths (product ROAS falls; D2C Footwear etc. absorb the sale campaigns).
- Recommendation: **a** (it's what Phase 2 B2 already plans); add "Socks" to the item master (data task for your team).

### D3. Card revenue vs table revenue don't tie (A3)
Cards and the Platform overview include CRED and the Flipkart / Myntra late-report estimates; the category / product tables don't. 1–25 Oct: Overall ₹44.40 Cr vs ₹43.85 Cr (CRED ₹11.6 L + Flipkart estimate ₹38.3 L + Myntra estimate ₹5.2 L); Flipkart ₹2.41 Cr vs ₹2.03 Cr; Myntra ₹1.39 Cr vs ₹1.34 Cr; Sep Overall ₹44.90 Cr vs ₹44.64 Cr (CRED).
Also: `api/bq.js:2167` adds Flipkart's estimate **including GST** into an ex-GST revenue (too high by the GST share of the estimate: a few lakh for October, not measured here), and the partial real 22 Oct stays in alongside its estimate.
- **a)** Add labelled rows to the tables: "CRED (not in categories)" and "Flipkart / Myntra estimate (no product detail)", so the Total row equals the card.
- **b)** Take CRED and the estimates out of the card revenue (card = tables).
- Fix the Inc-GST estimate either way (ex-GST estimate instead): Flipkart's October revenue and ROAS drop slightly (also on Sales / P&L wherever `chMap` Flipkart is used).
- Recommendation: **a** + the GST fix.

### D4. CAC: which new customers and which spend? (A9)
1–25 Oct new customers: Ads 94,191 (`fact_shopify_myfrido_mobility_all_orders`: ordered in range, no order before) vs Customer tab 90,342 (sales report, first Shopify order date in range, `_EX` excluded). Ads CAC = Meta + Google ÷ 94,191; Customer CAC = Meta + Google + all D2C additional spend ÷ 90,342.
- **a)** Use the Customer tab's definition everywhere (CAC +4.3% on the same spend).
- **b)** Keep both, label Ads' as "new to Shopify orders table".
- Recommendation: **a**, and decide whether additional spend belongs in CAC (it's ₹0 for Sep / Oct, so no number moves today).
Note: additional spend is ₹0 for Sep and Oct because `markting_spend` has no D2C additional-spend rows after August.

### D5. CRED opened on 1–31 Aug
No CRED-specific date code exists. CRED spend only exists for months with a `markting_spend` CRED row (none for Sep / Oct), and `App.jsx` lets the previous range's `data.cred` override the freshly sliced cache while a fetch is pending or after one fails. Option: make the sliced cache win for CRED (one-line change in `App.jsx` where `AdsTab` is rendered). It can change CRED numbers on screen while a fetch is pending, so it's listed here, not applied. Please also check whether CRED spend for Sep / Oct should exist.

### D6. Ads ROAS vs P&L ROAS (A10)
Same for D2C (3.74x), Amazon (9.23x), Flipkart (7.04x); Zepto 5.86x vs 5.88x. Different: Blinkit 34.26x vs 39.34x, Instamart 13.53x vs 17.05x (P&L only counts spend on sub-categories that have sales in the tab, the same gap as P&L Overall Mktg vs Ads); Myntra 9.64x vs none (P&L has no Myntra spend source). Decide whether P&L should keep unmatched spend in an "Others" row (P&L ROAS would match Ads).

## Ads Phase 2 (feature/responsive-ads)

### D7. "ROAS down ≥ 20%" is noisy after a sale month
Product ROAS here is total sales ÷ spend. When spend on a product drops after a sale month, its previous-period ROAS can be very high, so many products show ROAS down. September vs August: 46 products, "−₹20.96 Cr revenue at the old ROAS". 1–25 Oct vs 6–30 Sep (D2C): 8 products, −₹36.68 L.
- Option a: keep as is (both periods need ≥ ₹10 K spend).
- Option b: also require ≥ ₹50 K spend in both periods, or cap the impact at this period's revenue.
- Recommendation: b (₹50 K floor), one constant in `ADS_RULES`.

### D8. Spending at a loss uses total-sales ROAS
The breakeven ROAS comes from P&L (Gross ex GST ÷ CM1). The product ROAS it is compared with is total sales ÷ ad spend, the same definition P&L uses. So "at a loss" means CM2 < 0 for that product on that channel, as in P&L. No change proposed; noted because Ads' own revenue isn't ad-attributed (A6).

### D2–D5: decided 27 Oct, applied on fix/ads-data
- **D2 → a:** spend not linked to a product is one "Unattributed" row (category and product tables) on both the live and cached paths; category / product ROAS are on attributed spend only; Total rows include everything. 1–26 Oct: Rs 2.79 Cr (32.6% of spend) on All, Rs 2.76 Cr (43.3%) on D2C. P&L unchanged. Data task (BACKLOG, Suraj's team): map sale campaigns to products where possible; add "Socks" to the item master. Commit 28efb977.
- **D3 → a + GST fix:** labelled rows "CRED (not in categories)" and "Flipkart / Myntra estimate (no product detail)"; Total = card on every tab. Flipkart's estimate is added ex GST: Flipkart gross ex GST 1–25 Oct Rs 241.32 L → Rs 237.75 L, net Rs 205.24 L → Rs 202.20 L, overall net Rs 4,384.18 L → Rs 4,381.14 L (Sales Overall / Flipkart and P&L Flipkart / Overall move by the same amounts). Commit b137317c.
- **D4 → a:** Ads CAC = Customer tab definition: 1–26 Oct Rs 672 → Rs 700 (90,930 new customers, = Customer tab). Commit 788869d7.
- **D5:** CRED tab follows the global dates (commit bbaf290c). Data task: check whether CRED spend for Sep / Oct should exist.

### D7: decided 27 Oct (b), applied on feature/responsive-ads
"ROAS down ≥ 20%" needs ≥ ₹50 K spend in both periods (`ADS_RULES.roasDropMinSpend`). Sep vs Aug: D2C 32 → 26 products (−₹25.61 Cr → −₹22.00 Cr at the old ROAS), All 46 → 29 (−₹20.96 Cr → −₹17.90 Cr). D2 display (the "not linked to a product" line) also on feature/responsive-ads. D8: noted, no change.

### Decisions made without Suraj (Ads, 27 Oct)
- **D5, narrower fix:** "the sliced cache wins" was applied only when the live CRED data is from another date range. Always preferring the cache would have changed Sep CRED from Rs 26.39 L / 2,075 orders to Rs 26.97 L / 2,357 orders (the cache adds up per-product orders), so the option that changes fewest numbers was taken.
- **D2, Socks:** the live query name-matches the "Socks" target (Rs 6.8 L, 1–25 Oct) to a category, the cache leaves it unattributed, so Unattributed is Rs 2.79 Cr live vs Rs 2.86 Cr cached. Left as is (fixed by the data task: add "Socks" to the item master).
- **D3, partial day:** Flipkart's partially-synced last day still sits in chMap next to its full-day estimate (noted in D3); not changed, as the answer covered only the GST fix.

### D6: answered 27 Oct, not built yet
Answer: keep unmatched quick-commerce spend in an "Unmatched ad spend" row on the P&L table, included in the card Mktg and CM2 (P&L ROAS = Ads ROAS), out of the watchlist; Myntra unchanged. To be built on fix/pnl-unmatched-spend from main once PR #25 is merged; PR #25 was still open on 27 Oct, so it was skipped.

## Customer data (fix/customer-data)

### C1. Inactive 90+ counts customers whose last order is after the end date
Q8 (customer.js:316-327) has no `<= end` bound, so for a past range, customers who ordered after the end date get a negative gap and land in "Active". Option a: add the bound (the count becomes "as of the end date"; it changes for any range not ending yesterday). Option b: keep and label "as of today". Recommendation: a.

### C2. One payback definition
Acquisition shows orders to pay back (CAC ÷ (AOV × 35%), now labelled "1.1 orders"); Spend & Discounts shows months on revenue without margin (CAC ÷ monthly revenue per customer = 3.7 mo). Option a: both in months at 35% margin (Spend & Discounts would go from 3.7 mo to ~10.6 mo for the same data). Option b: keep both, renamed (orders vs months on revenue). Recommendation: a, with the margin from P&L D2C CM1 % instead of a fixed 35% once you agree.

### C3. Additional spend and CAC
Customer counts all D2C additional spend (prorated by days) and puts it in CAC; Ads counts only product-tagged additional spend (prorated by revenue) and leaves it out of CAC; new customers come from different tables (1–25 Oct: Customer 90,342, Ads 94,191). Option a: Customer's definition everywhere (one CAC). Option b: keep both, labelled. Recommendation: a (see Ads D4).

### C4. LTV on revenue
LTV = revenue per customer over 12 months, and LTV:CAC "Healthy" uses a 3x bar meant for margin LTV. Option a: show LTV:CAC on CM1 (P&L D2C CM1 % × LTV) next to it. Option b: keep, labelled "on revenue" (done). Recommendation: a once C3 is decided.

### C5. Cross-sell lift includes the same-category diagonal
The diagonal is now greyed and out of the colour scale (display), but it is still in the row / column totals that the lift is computed from. Option a: exclude it from the lift maths too (lift values for other pairs change). Option b: keep. Recommendation: a. Also: the query is all-time with LIMIT 500 (totals truncated).

### C6. RFM mapping
"Others" = last order 90+ days ago, 1 order in 12 months, ≥ ₹5,000 spent; the ELSE branch also puts customers who bought 61–90 days ago with low frequency into "Hibernating". Option a: map those to "About To Sleep" (a segment the UI already defines but the SQL never produces). Option b: keep. Recommendation: a.

### C7. Support's default day before 11:00 IST
The default view is yesterday, but `cs_dashboard_unified` rebuilds at 11:00 IST, so before 11:00 yesterday is nearly empty (26 Oct at 02:30: 100 interactions vs ~3,500) and every card shows a ▼95%+ drop. Option a: before 11:00 IST default to the day before yesterday. Option b: keep yesterday and show "data loads at 11:00" when the day is still loading. Recommendation: b (an InfoStrip, no number change).

## Customer Phase 2 (feature/responsive-customer)

### C8. Agent FRT target for the Support watchlist
The "Agent FRT above target" rule uses each channel's loosest SLA target (chat 40 s, email / social 15 min). Real chat agent FRT is ~30 min (23 Oct: 1,927 s on 713 replies), so chat and email flag every day and the rule says little. Option a: set FRT targets from the team's real goal (e.g. chat 5 min, email 2 h) in `SUPPORT_RULES.frtTargetSec`. Option b: keep the SLA-based targets. Recommendation: a; a one-line change in metricTargets.js once you give the numbers.

### C9. Repurchase due (B2.3) needs one new query
"Customers whose last order in a category is 1–2× that category's median repurchase cycle" needs each customer's last order per category, which no current query returns. Option a: add one cached query to /api/customer (all-time, grouped to category × days-since-last-order buckets, so the response stays small). Option b: skip. Not built; the Behaviour tab says so in one line.

### C10. "Revenue at risk" counts more segments than its tooltip says
Segments KPI "Revenue at risk" sums every WIN-BACK / URGENT SAVE segment (About To Sleep, At Risk, Hibernating, Lost, Cannot Lose Them: ₹185.68 Cr for 1–26 Oct), but its tooltip says "Hibernating + Cannot Lose Them". The new watchlist "Win-back pool" uses exactly Hibernating + Cannot Lose Them (as the master plan says). Option a: change the tooltip to list all win-back segments. Option b: make the KPI Hibernating + Cannot Lose Them only (number changes). Recommendation: a (label only).

### Customer answers (27 Oct): decided, applied on fix/customer-data
- **C1 → a:** inactivity counted as of the end date, labelled "as of {date}" (1ba9fe46). As of 30 Sep: Active 280,913 → 154,809; 90+ days 1,981,015 → 2,006,992.
- **C2 → a:** one payback, in months, on margin, same on Acquisition and Spend & Discounts (f05b31ab). 1–26 Oct at a fixed 35%: "1.1 orders" / 3.7 mo → 10.5 mo.
- **C3 (= D4):** no change needed here: Customer CAC already = (Meta + Google + D2C additional spend) ÷ new customers (first Shopify order in range, `_EX` excluded). The Ads side moves to it on fix/ads-data.
- **C4:** display, on feature/responsive-customer.
- **C5 → a:** diagonal out of the lift totals; totals from every pair (17,030), the 500-row limit kept only for display rows (ef604f16). Top 5 changes in the commit message.
- **C6 → a:** 61–90 day low-frequency customers → "About To Sleep" (61720c08). As of 26 Oct: Hibernating 992,658 → 860,401; About To Sleep 0 → 132,257.
- **C7:** display, on feature/responsive-customer.
- **C9 → a (query):** Repurchase due, one cached aggregated query (49e242e0); Pillows 68,704 and Orthotics 67,811 due, both equal to a direct BigQuery count.

### Decisions made without Suraj (Customer, 27 Oct)
- **C2 margin (Suraj 27 Oct, later message):** fixed 35%, labelled "35% margin, P&L CM1 link later"; no P&L data on the Customer page. Using the P&L D2C CM1 % is logged in docs/BACKLOG.md.
- **C5 sub-category totals:** the API buckets sub-categories into the 8 biggest by volume + "Other" (the heatmap's own top-8 rule) instead of sending all 17,030 pairs; category grain is sent in full.
- **C9 definition:** "category" = the order's category as in the repurchase-cycle chart (Q17); median = the same all-time median days to 2nd purchase; "due" = last order in that category, up to the end date, 1–2× the median (both ends included). Cached 6 h per end date in the API instance.

### Customer answers (27 Oct): decided, applied on feature/responsive-customer
- **C2 (display):** payback the same on laptop and phone (one shared helper), fixed 35% margin, "35% margin, P&L CM1 link later" (P&L CM1 link in docs/BACKLOG.md).
- **C4 → a (label only, per your later message):** "LTV:CAC on margin" shown next to the revenue one at the same fixed 35% (1–26 Oct: 3.28x on revenue, 1.15x on margin → "Watch"); the Healthy bar reads the margin version (d27a0b9c).
- **C7 → b:** before 11:00 IST the Day view keeps yesterday, shows "Yesterday's support data loads at 11:00 IST" and grey changes (laptop + phone) (a4c3b7e0).
- **C8 → a:** FRT targets chat 15 min, social 30 min, email 4 h in `SUPPORT_RULES.frtTargetSec` (f23c0c34).
- **C9 → a (display):** Repurchase due card on Purchase Behavior, laptop + phone (e3a4fdd0).
- **C10 → a:** "Revenue at risk" tooltip lists every win-back segment; number unchanged (₹185.68 Cr) (96171e69).
- The phone view was brought in line with the fix/customer-data numbers after the merge (310fe54f).

### Decisions made without Suraj (Customer display, 27 Oct)
- **C4 watchlist rule:** "LTV:CAC below 3x" in the Customer health watchlist still reads the revenue value (changing it would raise a new flag; you asked for a label only). Move it to the margin version together with the P&L CM1 link (BACKLOG).
- **C9 total:** the "due now" total adds up the categories, so one customer can count in more than one; the card says so.
