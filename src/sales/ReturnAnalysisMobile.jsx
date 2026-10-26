import { useEffect } from 'react'
import { C, exportCSV } from '../utils.js'
import { useBreakpoint } from '../responsive/useBreakpoint.js'
import { useRaBasis, setRaBasis, exportExchangeCsv } from './returnAnalysisData.js'

// Sales → D2C → Return Analysis below 1024px (docs/responsive/RETURN_ANALYSIS_MOBILE_PROMPT_1.md,
// RETURN_ANALYSIS_PLAN.md). Display only: every number is the desktop page's own field from
// /api/return-analysis (same request, see returnAnalysisData.js); this file only lays them out.
const M = C.m

export default function ReturnAnalysisMobile({ data, loading, error, filters, onMenuExtra }) {
  const bp = useBreakpoint()
  const basis = useRaBasis()
  const layout = bp.isPhoneLandscape ? 'landscape' : bp.width >= 768 ? 'tablet' : 'phone'

  // Header "⋯": page-wide Qty / Rev and the page's CSV exports (the desktop cards' Export buttons).
  useEffect(() => {
    if (!onMenuExtra) return
    onMenuExtra([
      { id: 'basis-revenue', label: `Show by revenue${basis === 'revenue' ? '  ✓' : ''}`, group: 'Show', onSelect: () => setRaBasis('revenue') },
      { id: 'basis-qty', label: `Show by qty${basis === 'qty' ? '  ✓' : ''}`, group: 'Show', onSelect: () => setRaBasis('qty') },
      ...(data ? [
        { id: 'ra-cat-csv', label: 'Category breakdown', group: 'Export (CSV)', onSelect: () => exportCSV(data.categoryTable, 'd2c_return_analysis_category.csv') },
        { id: 'ra-exch-csv', label: 'Exchange deep dive · SKU-wise', group: 'Export (CSV)', onSelect: () => exportExchangeCsv(data.exchangeSkuDetail || [], filters.start, filters.end) },
      ] : []),
    ])
  }, [onMenuExtra, basis, data, filters.start, filters.end])
  useEffect(() => () => onMenuExtra?.(null), [onMenuExtra])

  return (
    <div className="sales-mobile ra-mobile" data-layout={layout} style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 24 }}>
      {error && <div role="alert" style={{ padding: '10px 13px', borderRadius: 12, background: '#fff', border: `1px solid ${M.down}`, color: M.down, fontSize: 13 }}>Couldn't load return analysis: {error}</div>}
      {!data && loading && <div className="skel" style={{ height: 420, borderRadius: M.radius.card, background: M.card, boxShadow: M.cardShadow }} aria-label="Loading return analysis" />}
    </div>
  )
}
