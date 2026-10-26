# Decisions for Suraj

Things found during the unattended runs that change a number, a definition or a rule. Nothing here is in the code; each one waits for your answer.

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
