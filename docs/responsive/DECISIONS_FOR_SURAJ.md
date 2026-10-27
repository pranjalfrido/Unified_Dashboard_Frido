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
