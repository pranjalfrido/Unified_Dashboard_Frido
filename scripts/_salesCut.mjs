// The sales cut of the /api/bq payload: what Overview, Sales and Ads read from the static cache, without the P&L
// detail (SKU cost / S&D rows, pnlAgg, margin inputs). Built from the full payload with the same field tables the live
// staged loading uses (api/_bqPhases.js): 'fast' + 'sales_detail' + 'ads_detail', merged the way the app merges them
// (src/bqPhaseMerge.js). The Ads margin probe (pnl_margin) is not in it: the Ads page loads that group live.
import { getPhaseDef, pickPhaseFields } from '../api/_bqPhases.js'
import { mergePhase } from '../src/bqPhaseMerge.js'

export const SALES_CUT_PHASES = ['fast', 'sales_detail', 'ads_detail']

export function salesCut(full) {
  const { asOf, mtdStart, mtdEnd, subCatFirstOrderMap } = full
  const merged = SALES_CUT_PHASES.reduce((acc, p) => mergePhase(acc, pickPhaseFields(full, getPhaseDef(p))), {})
  return { asOf, mtdStart, mtdEnd, ...(subCatFirstOrderMap ? { subCatFirstOrderMap } : {}), ...merged }
}
