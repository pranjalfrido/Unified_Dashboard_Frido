# Decisions for Suraj

Things found during the unattended runs that change a number, a definition or a rule. Nothing here is in the code; each one waits for your answer.

## P&L Phase 2 (feature/responsive-pnl)

### P1. D2C: "COGS > 50%" and "GM < 50%" always flag the same products
GM % = 100 − COGS % (both on net revenue), so with both bars at 50% on D2C the two rules always list the same products and the same ₹ impact (1–26 Oct: 32 products, −₹21.53 L each). Only D2C has COGS bar + GM bar = 100; on the other channels the two rules differ.
- Option A: keep both (as approved).
- Option B: drop the GM rule on D2C, or move one of the bars (for example GM < 55%).
Today: both shown, as in `PNL_RULE_BARS`.
