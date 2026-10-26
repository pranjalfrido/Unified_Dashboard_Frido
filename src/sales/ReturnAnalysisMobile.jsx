import { useEffect, useState } from 'react'
import { C, fmt, fmtN, exportCSV } from '../utils.js'
import { useBreakpoint } from '../responsive/useBreakpoint.js'
import MasterTrendCard from '../responsive/MasterTrendCard.jsx'
import InfoStrip from '../responsive/InfoStrip.jsx'
import SegmentToggle from '../responsive/SegmentToggle.jsx'
import CompactRankRow from '../responsive/CompactRankRow.jsx'
import MobileRankedList from '../responsive/MobileRankedList.jsx'
import { Card, Chips, KV } from '../responsive/CardKit.jsx'
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

const SheetHeading = ({ children }) => <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: M.muted, margin: '14px 0 6px' }}>{children}</div>
const redIf = (key, v) => (isRed(key, v) ? M.down : undefined)

// ── Top products · high returns: the desktop ranked list (sub-category level, same API order) ──
function TopProductsCard({ data, basis, paymentType, setPaymentType, period }) {
  const opts = [{ id: '', label: 'All' }, ...(data.paymentTypeTable || []).map(p => p.paymentType).filter(Boolean).map(p => ({ id: p, label: p }))]
  const byProduct = {}
  ;(data.categoryTable || []).forEach(r => { byProduct[`${r.category}::${r.subCategory}`] = r })
  const sorts = [
    { key: 'rev', label: '₹ lost', value: r => r.returnRevLost, format: r => fmt(r.returnRevLost) },
    { key: 'qty', label: 'Units lost', value: r => r.returnQtyLost, format: r => `${fmtN(r.returnQtyLost)} units` },
    { key: 'pct', label: '% of gross rev', value: r => r.returnPct, format: r => p1(r.returnPct), bar: 'bad' },
  ]
  return (
    <Card title="Top products · high returns" sub="Revenue lost to returns · % = of the product's gross revenue">
      <Chips label="Payment type" options={opts} value={paymentType || ''} onChange={setPaymentType} />
      <MobileRankedList key={basis} title={null} noun="products" items={data.topProducts || []} itemKey={r => `${r.category}::${r.subCategory}`}
        name={r => r.subCategory} sub={r => `${r.category} · ${p1(r.returnPct)} of gross rev`} groupOf={r => r.category} searchText={r => `${r.subCategory} ${r.category}`}
        sorts={sorts} defaultSort={basis === 'qty' ? 'qty' : 'rev'} topN={8} sheetSubtitle={[period, paymentType || null].filter(Boolean).join(' · ')}
        secondary={(r, k) => (k === 'qty' ? fmt(r.returnRevLost) : `${fmtN(r.returnQtyLost)} units`)}
        details={[{ label: '₹ lost', value: r => fmt(r.returnRevLost) }, { label: 'Units lost', value: r => fmtN(r.returnQtyLost) }, { label: 'Gross revenue', value: r => fmt(r.grossRev) }, { label: '% of gross rev', value: r => p1(r.returnPct) }]}
        renderSheet={r => {
          const c = byProduct[`${r.category}::${r.subCategory}`]
          if (!c) return null
          return (
            <>
              <SheetHeading>By type · all payment types</SheetHeading>
              <KV items={[['cancel', 'Cancel'], ['rto', 'RTO'], ['cir', 'CIR'], ['exchange', 'Exchange']].map(([id, label]) => ({
                label: `${label} %`, value: `${p1(c[`${id}Pct`])} · ${fmt(c[`${id}Rev`])}`, color: redIf(`${id}Pct`, c[`${id}Pct`]) }))} />
            </>
          )
        }} />
    </Card>
  )
}

// ── Category breakdown: the desktop "Category-wise Return Breakdown" (category + sub-category rows) ──
const RATE_COLS = [['totalReturn', 'Total return %'], ['cancel', 'Cancel %'], ['rto', 'RTO %'], ['cir', 'CIR %'], ['exchange', 'Exchange %']]
function CategoryCard({ data, basis, period }) {
  const [view, setView] = useState('category')
  const suffix = basis === 'qty' ? 'PctQty' : 'Pct'
  const revKey = basis === 'qty' ? 'qty' : 'revenue'
  const subRows = data.categoryTable || []
  // Category view: the sub-category rows summed, each % weighted by revenue (or qty) — the same
  // weighting the desktop table's Total row uses (search a category there to see these numbers).
  const groups = {}
  subRows.forEach(r => {
    const g = groups[r.category] || (groups[r.category] = { category: r.category, revenue: 0, qty: 0, subs: [] })
    g.revenue += r.revenue || 0; g.qty += r.qty || 0; g.subs.push(r)
  })
  const catRows = Object.values(groups).map(g => {
    const denom = g.subs.reduce((s, r) => s + (r[revKey] || 0), 0)
    const out = { ...g }
    RATE_COLS.forEach(([id]) => { out[`${id}${suffix}`] = denom > 0 ? g.subs.reduce((s, r) => s + (r[revKey] || 0) * (r[`${id}${suffix}`] || 0), 0) / denom : 0 })
    return out
  })
  const amount = r => (basis === 'qty' ? `${fmtN(r.qty)} units` : fmt(r.revenue))
  const sorts = [
    { key: 'rev', label: basis === 'qty' ? 'Qty' : 'Revenue', value: r => r[revKey], format: amount },
    ...RATE_COLS.map(([id, label]) => ({ key: id, label, value: r => r[`${id}${suffix}`], format: r => p1(r[`${id}${suffix}`]), bar: 'bad' })),
  ]
  const isCat = view === 'category'
  return (
    <Card title="Category breakdown" right={<SegmentToggle label="Group by" value={view} onChange={setView} options={[{ id: 'category', label: 'Category' }, { id: 'sub', label: 'Sub-category' }]} />}>
      <MobileRankedList key={`${view}-${basis}`} title={null} noun={isCat ? 'categories' : 'sub-categories'} items={isCat ? catRows : subRows}
        itemKey={r => (isCat ? r.category : `${r.category}::${r.subCategory}`)} name={r => (isCat ? r.category : r.subCategory)} sub={isCat ? null : r => r.category}
        groupOf={isCat ? null : r => r.category} searchText={r => `${r.category} ${r.subCategory || ''}`} sorts={sorts} topN={8} sheetSubtitle={period}
        valueColor={(r, k) => (k === 'rev' ? undefined : redIf(`${k}Pct`, r[`${k}${suffix}`]))}
        secondary={(r, k) => (k === 'rev' ? `Return ${p1(r[`totalReturn${suffix}`])}` : `${basis === 'qty' ? '' : 'Rev '}${amount(r)} · Return ${p1(r[`totalReturn${suffix}`])}`)}
        details={[{ label: basis === 'qty' ? 'Qty' : 'Revenue', value: amount }, ...RATE_COLS.map(([id, label]) => ({ label, value: r => p1(r[`${id}${suffix}`]) }))]}
        renderSheet={r => {
          const list = isCat ? [...r.subs].sort((a, b) => (b[revKey] || 0) - (a[revKey] || 0)).map(s => ({ key: s.subCategory, name: s.subCategory, row: s }))
            : (data.skuVariants?.[`${r.category}::${r.subCategory}`] || []).slice().sort((a, b) => (b[revKey] || 0) - (a[revKey] || 0)).map(s => ({ key: s.sku, name: s.sku, row: s }))
          if (!list.length) return null
          const mx = Math.max(...list.map(x => x.row[`totalReturn${suffix}`] || 0), 0) || 1
          return (
            <>
              <SheetHeading>{isCat ? 'Sub-categories' : 'SKUs'} · total return %</SheetHeading>
              {list.map((x, i) => (
                <CompactRankRow key={x.key} name={x.name} value={p1(x.row[`totalReturn${suffix}`])} valueColor={redIf('totalReturnPct', x.row[`totalReturn${suffix}`])}
                  pct={amount(x.row)} barPct={((x.row[`totalReturn${suffix}`] || 0) / mx) * 100} last={i === list.length - 1} />
              ))}
            </>
          )
        }} />
    </Card>
  )
}

export default function ReturnAnalysisMobile({ data, loading, error, filters, onMenuExtra, topProductsPaymentType, setTopProductsPaymentType }) {
  const bp = useBreakpoint()
  const basis = useRaBasis()
  const layout = bp.isPhoneLandscape ? 'landscape' : bp.width >= 768 ? 'tablet' : 'phone'
  const period = filters.start && filters.end ? shortRange(d0(filters.start), d0(filters.end)) : ''

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
      {data && <TopProductsCard data={data} basis={basis} paymentType={topProductsPaymentType} setPaymentType={setTopProductsPaymentType} period={period} />}
      {data && <CategoryCard data={data} basis={basis} period={period} />}
      {!data && loading && <div className="skel" style={{ height: 420, borderRadius: M.radius.card, background: M.card, boxShadow: M.cardShadow }} aria-label="Loading return analysis" />}
    </div>
  )
}
