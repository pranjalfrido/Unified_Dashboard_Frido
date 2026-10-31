# Bell-icon alerts — plan notes

## Parked: #8 (D2C CM1%/COGS%) and #12 (D2C SnD%)

**Status: parked, not abandoned.** Do not build these by re-deriving the CM1/COGS/SnD formula a third time.

Two independent re-derivation attempts (2026-10-31) both produced numbers that didn't match the
live P&L page for the same period:
- Attempt 1: CM1% ~48-57%, COGS% ~35-44% — reconciled against the live page (~43.5% CM1) and
  found to differ chiefly because it used total Net Revenue as CM1%'s denominator instead of the
  live page's actual convention (CM1% is denominated only over the "covered-net" subset — rows
  where both COGS and SnD are known, `cm1NetCovered` in `src/pnl/PnLPage.jsx`'s `kpiSummary`).
- Attempt 2 (after fixing the covered-net denominator): CM1% ~40%, COGS% close, but SnD% still
  ran ~17-21% against the live page's ~15% for the same month, for a cause that was narrowed but
  not identified before time ran out.

**When this is revisited**: reuse the P&L calculation logic already implemented in the Frido data
connector's P&L tool (the `frido-data-connector/` service referenced elsewhere in this repo's
ecosystem), for an exact match by construction, rather than re-deriving the CM1/COGS/SnD formula
from `pnlUtils.js`/`PnLPage.jsx`/`snd-rates.json`/`product_cogs_monthly` a third time. Call into
the existing correct logic (or export/import the connector's computation as a shared function)
instead of hand-rewriting it again — every hand-rewrite so far has drifted from the live page in
a different, hard-to-spot way.

Once #8/#12 are wired to that shared logic:
1. Confirm the output matches the live P&L page for a known month (e.g. October 2026: CM1
   ~43.5%, COGS ~41.7%, SnD ~15.1%) before trusting any backtest run against it.
2. Re-run the rolling-7-day distribution (84 windows, same 90-day window convention as the other
   alerts) and propose bars from the real distribution, same methodology as #3/#4/#6/#11/#13.
3. Approved-but-not-yet-built bars from the last (unreconciled) distribution pass, kept here for
   reference only — do NOT use these until the SnD discrepancy above is resolved and the
   distribution is re-run against the corrected formula: CM1% < 38.5%, COGS% > 43%. SnD% bar was
   never approved (distribution was known-wrong at the time).
