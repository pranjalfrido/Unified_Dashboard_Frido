# Decisions for Suraj

Things found during the unattended runs that change a number, a definition or a rule. Nothing here is in the code; each one waits for your answer. (This branch's copy holds the Ads section; the P&L section is on `feature/responsive-pnl`.)

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

### D2–D5: decided 27 Oct, applied on fix/ads-data
- **D2 → a:** spend not linked to a product is one "Unattributed" row (category and product tables) on both the live and cached paths; category / product ROAS are on attributed spend only; Total rows include everything. 1–26 Oct: Rs 2.79 Cr (32.6% of spend) on All, Rs 2.76 Cr (43.3%) on D2C. P&L unchanged. Data task (BACKLOG, Suraj's team): map sale campaigns to products where possible; add "Socks" to the item master. Commit 28efb977.
- **D3 → a + GST fix:** labelled rows "CRED (not in categories)" and "Flipkart / Myntra estimate (no product detail)"; Total = card on every tab. Flipkart's estimate is added ex GST: Flipkart gross ex GST 1–25 Oct Rs 241.32 L → Rs 237.75 L, net Rs 205.24 L → Rs 202.20 L, overall net Rs 4,384.18 L → Rs 4,381.14 L (Sales Overall / Flipkart and P&L Flipkart / Overall move by the same amounts). Commit b137317c.
- **D4 → a:** Ads CAC = Customer tab definition: 1–26 Oct Rs 672 → Rs 700 (90,930 new customers, = Customer tab). Commit 788869d7.
- **D5:** CRED tab follows the global dates (commit bbaf290c). Data task: check whether CRED spend for Sep / Oct should exist.

### Decisions made without Suraj (Ads, 27 Oct)
- **D5, narrower fix:** "the sliced cache wins" was applied only when the live CRED data is from another date range. Always preferring the cache would have changed Sep CRED from Rs 26.39 L / 2,075 orders to Rs 26.97 L / 2,357 orders (the cache adds up per-product orders), so the option that changes fewest numbers was taken.
- **D2, Socks:** the live query name-matches the "Socks" target (Rs 6.8 L, 1–25 Oct) to a category, the cache leaves it unattributed, so Unattributed is Rs 2.79 Cr live vs Rs 2.86 Cr cached. Left as is (fixed by the data task: add "Socks" to the item master).
- **D3, partial day:** Flipkart's partially-synced last day still sits in chMap next to its full-day estimate (noted in D3); not changed, as the answer covered only the GST fix.
