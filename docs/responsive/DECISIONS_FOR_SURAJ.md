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
