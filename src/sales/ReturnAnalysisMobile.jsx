import { useEffect, useState } from 'react'
import { C, fmt, fmtN, exportCSV } from '../utils.js'
import { useBreakpoint } from '../responsive/useBreakpoint.js'
import MasterTrendCard from '../responsive/MasterTrendCard.jsx'
import InfoStrip from '../responsive/InfoStrip.jsx'
import SegmentToggle from '../responsive/SegmentToggle.jsx'
import CompactRankRow from '../responsive/CompactRankRow.jsx'
import { Card } from '../responsive/CardKit.jsx'
import { useRaBasis, setRaBasis, exportExchangeCsv, groupReturnTrend, immatureSince, maturityText, isRed } from './returnAnalysisData.js'

// Sales → D2C → Return Analysis below 1024px (docs/responsive/RETURN_ANALYSIS_MOBILE_PROMPT_1.md,
// RETURN_ANALYSIS_PLAN.md). Display only: every number is the desktop page's own field from
// /api/return-analysis (same request, see returnAnalysisData.js); this file only lays them out.
const M = C.m
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const p1 = v => `${(v || 0).toFixed(1)}%`
const d0 = s => new Date(`${s}T00:00:00`)
const shortRange = (a, b) => (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
  ? `${a.getDate()}–${b.getDate()} ${MON[b.getMonth()]}` : `${a.getDate()} ${MON[a.getMonth()]} – ${b.getDate()} ${MON[b.getMonth()]}`)
// The API's previous period: the same number of days, ending the day before start.
function prevRangeLabel(start, end) {
  if (!start || !end) return 'prev'
  const s = d0(start), e = d0(end)
  const n = Math.round((e - s) / 86400000) + 1
  const pe = new Date(s); pe.setDate(pe.getDate() - 1)
  const ps = new Date(pe); ps.setDate(ps.getDate() - n + 1)
  return shortRange(ps, pe)
}
// ▲/▼ exactly as the desktop tiles: returnBadge for the rates (none without a previous value),
// the revenue change for Revenue.
const chg = (cur, prev) => (prev ? (cur - prev) / prev * 100 : null)
const rateDef = {
  returnPct: 'Cancellations + RTO + customer returns (CIR) as a share of gross revenue incl. GST. Exchanges are not included.',
  cancelPct: 'Cancelled revenue ÷ gross revenue incl. GST.',
  rtoPct: 'RTO revenue ÷ gross revenue incl. GST.',
  cirPct: 'Customer-initiated return revenue ÷ gross revenue incl. GST.',
  exchangePct: 'Exchanged revenue ÷ gross revenue incl. GST. Not part of Total return %.',
}

// ── Master card: the desktop "Return Metrics Trend" (6 tiles + chart) ──
function MasterCard({ data, filters, layout }) {
  const k = data.kpis
  const vsPrev = `vs ${prevRangeLabel(filters.start, filters.end)}`
  const of = `of ${fmt(k.totalRevenue)}`
  const rate = (key, label, tileLabel, value, prev, sub) => ({
    key, label, tileLabel, def: rateDef[key], value: p1(value), lowerIsBetter: true, sub,
    delta: chg(value, prev), compare: [{ label: vsPrev, delta: chg(value, prev) }],
    point: r => r[key], fmtPoint: p1,
  })
  const metrics = [
    rate('returnPct', 'Total return %', 'Return %', k.returnPct, k.prevReturnPct, `${fmt(k.totalRevenue * k.returnPct / 100)} returned ${of}`),
    rate('cancelPct', 'Cancel %', 'Cancel %', k.cancelPct, k.prevCancelPct, `${of} revenue`),
    rate('rtoPct', 'RTO %', 'RTO %', k.rtoPct, k.prevRtoPct, `${of} revenue`),
    rate('cirPct', 'CIR %', 'CIR %', k.cirPct, k.prevCirPct, `${of} revenue`),
    rate('exchangePct', 'Exchange %', 'Exchange %', k.exchangePct, k.prevExchangePct, `${of} revenue`),
    { key: 'revenue', label: 'Revenue', tileLabel: 'Revenue', def: 'Gross revenue incl. GST.', value: fmt(k.totalRevenue), sub: 'Gross incl. GST',
      delta: k.prevTotalRevenue > 0 ? chg(k.totalRevenue, k.prevTotalRevenue) : null,
      compare: [{ label: vsPrev, delta: k.prevTotalRevenue > 0 ? chg(k.totalRevenue, k.prevTotalRevenue) : null }],
      point: r => r.revenue, fmtPoint: fmt },
  ]
  // The chart's point keys: the API's daily rows carry totalReturnPct for Return %.
  metrics[0].point = r => r.totalReturnPct
  const since = immatureSince(filters.end)
  return (
    <MasterTrendCard metrics={metrics} rawRows={data.dailyTrend || []} groupTrend={groupReturnTrend} start={filters.start} end={filters.end} layout={layout}
      note={since ? <InfoStrip text={maturityText(since)} detail="RTO and customer returns take up to ~2 weeks to arrive, so the last days of the range read low (the same 14-day window as Provisional Return % elsewhere)." /> : null} />
  )
}

// ── By payment type: the desktop "Payment Type-wise Return Breakdown", one metric at a time ──
const PAY_METRICS = [{ id: 'totalReturn', label: 'Total' }, { id: 'cancel', label: 'Cancel' }, { id: 'rto', label: 'RTO' }, { id: 'cir', label: 'CIR' }, { id: 'exchange', label: 'Exch' }]
const PAY_ORDER = ['COD', 'PPCOD', 'Prepaid']
function PaymentCard({ rows = [], basis }) {
  const [metric, setMetric] = useState('totalReturn')
  const suffix = basis === 'qty' ? 'PctQty' : 'Pct'
  const denomKey = basis === 'qty' ? 'qty' : 'revenue'
  const totalDenom = rows.reduce((s, r) => s + (r[denomKey] || 0), 0)
  // "Overall" exactly as the desktop column: each type's % weighted by its own revenue (or qty).
  const weighted = id => (totalDenom > 0 ? rows.reduce((s, r) => s + (r[denomKey] || 0) * (r[`${id}${suffix}`] || 0), 0) / totalDenom : 0)
  const overall = { paymentType: 'Overall', revenue: rows.reduce((s, r) => s + (r.revenue || 0), 0), qty: rows.reduce((s, r) => s + (r.qty || 0), 0) }
  PAY_METRICS.forEach(m => { overall[`${m.id}${suffix}`] = weighted(m.id) })
  const ordered = [...rows].sort((a, b) => ((PAY_ORDER.indexOf(a.paymentType) + 1 || 9) - (PAY_ORDER.indexOf(b.paymentType) + 1 || 9)))
  const list = [...ordered, overall]
  const val = r => r[`${metric}${suffix}`] || 0
  const max = Math.max(...list.map(val), 0) || 1
  return (
    <Card title="By payment type" sub={basis === 'qty' ? 'Share of units sold' : 'Share of gross revenue'}>
      <SegmentToggle full label="Metric" value={metric} onChange={setMetric} options={PAY_METRICS} style={{ marginBottom: 6 }} />
      {rows.length ? list.map((r, i) => (
        <CompactRankRow key={r.paymentType} name={r.paymentType} value={p1(val(r))} valueColor={isRed(`${metric}Pct`, val(r)) ? M.down : undefined}
          pct={`${basis === 'qty' ? `${fmtN(r.qty)} units` : fmt(r.revenue)} · ${totalDenom > 0 ? ((r[denomKey] || 0) / totalDenom * 100).toFixed(1) : '0.0'}%`}
          barPct={(val(r) / max) * 100} last={i === list.length - 1} />
      )) : <div style={{ fontSize: 13, color: M.muted, padding: '8px 0' }}>No data for this period</div>}
    </Card>
  )
}

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
      {data && <MasterCard data={data} filters={filters} layout={layout} />}
      {data && <PaymentCard rows={data.paymentTypeTable} basis={basis} />}
      {!data && loading && <div className="skel" style={{ height: 420, borderRadius: M.radius.card, background: M.card, boxShadow: M.cardShadow }} aria-label="Loading return analysis" />}
    </div>
  )
}
