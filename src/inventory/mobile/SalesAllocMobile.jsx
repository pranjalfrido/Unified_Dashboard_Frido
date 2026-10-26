import { useEffect, useMemo, useRef, useState } from 'react'
import { C } from '../../utils.js'
import { fmtNum, fmtInt, fmtCurrency, exportCsv } from '../theme.jsx'
import MasterTrendCard from '../../responsive/MasterTrendCard.jsx'
import { useBreakpoint } from '../../responsive/useBreakpoint.js'
import CompactRankRow from '../../responsive/CompactRankRow.jsx'
import SegmentToggle from '../../responsive/SegmentToggle.jsx'
import { MixLegend } from '../../responsive/MixBar.jsx'
import { Card, Chips, ShowAllButton } from './ui.jsx'
import { TopProductsCard, MoversCard } from './SaRankCards.jsx'
import DailySalesCard from './SaDailySales.jsx'
import { salesMatrixExport } from './saMobileData.js'

// Sales & Allocation below 1024px (docs/responsive/INVENTORY_MOBILE_REDESIGN_PROMPT.md §3). Display
// only: every value comes from SalesAllocationPage's own filteredData / memos (or the shared
// functions in saMobileData.js that the desktop cards use too).
const M = C.m
const pct1 = v => `${v.toFixed(1)}%`

function MasterCard({ fd, revenueAvailable, mix, dateFilters, layout }) {
  const s = fd.summary
  const fill = s.exactFillRate, mom = s.momentumPct
  // The desktop trend's own daily / weekly / monthly rows (filteredData), daily cut to the range.
  const groupTrend = useMemo(() => (_rows, gran) => {
    const series = fd[gran] || fd.daily || []
    const cut = dateFilters?.start && dateFilters?.end && gran === 'daily' ? series.filter(d => d.date >= dateFilters.start && d.date <= dateFilters.end) : series
    return cut.map(d => ({ date: d.date.length === 7 ? `${d.date}-01` : d.date, qty: d.qty, rev: d.rev }))
  }, [fd, dateFilters])
  const metrics = [
    { key: 'rev', label: 'Revenue', value: revenueAvailable ? fmtCurrency(s.totalRevenue) : '—',
      sub: revenueAvailable ? `Avg ${fmtCurrency(s.avgDailyRevenue)}/day · ${fmtNum(s.totalUnits)} units` : 'Pending pipeline sync for recent dates',
      point: revenueAvailable ? r => r.rev : undefined, fmtPoint: fmtCurrency, def: 'Revenue from Unicommerce sales in the selected dates.' },
    { key: 'units', label: 'Units sold', value: fmtNum(s.totalUnits), sub: `Avg ${fmtNum(s.avgDailyUnits)}/day`, point: r => r.qty, fmtPoint: fmtInt, def: 'Units sold in the selected dates.' },
    { key: 'asp', label: 'Avg selling price', tileLabel: 'ASP', value: revenueAvailable ? fmtCurrency(s.avgSellingPrice) : '—', sub: 'Revenue ÷ units',
      point: revenueAvailable ? r => (r.qty > 0 ? Math.round(r.rev / r.qty) : null) : undefined, fmtPoint: fmtCurrency, def: 'Average selling price: revenue ÷ units sold.' },
    { key: 'fill', label: 'Fill rate', value: fill != null ? `${Math.round(fill * 100)}%` : '—', status: fill == null ? undefined : fill >= 0.9 ? 'good' : 'warn',
      sub: 'Nearest-warehouse-correct units ÷ total units', def: 'Fill rate: units shipped from the correct nearest warehouse ÷ all units (PNQ and MUM count as one). Under 90% shows amber.' },
    { key: 'mom', label: 'Momentum', value: mom != null ? `${mom > 0 ? '+' : ''}${mom.toFixed(0)}%` : '—', valueColor: mom != null && mom < 0 ? M.down : undefined,
      sub: 'First vs last day', def: 'Momentum: units on the last day vs the first day of the range, as a % change.' },
    { key: 'mix', label: 'Sales type mix', tileLabel: 'Sales mix', value: mix ? `${mix.b2c}% B2C` : '—', sub: mix ? `${mix.b2b}% B2B · ${mix.po}% PO` : '',
      def: 'Share of B2C orders, B2B orders and purchase orders, by revenue (by units when revenue is not available).' },
  ].map(m => ({ ...m, deltasHidden: true }))
  return <MasterTrendCard metrics={metrics} rawRows={fd.daily || []} groupTrend={groupTrend} start={dateFilters?.start} end={dateFilters?.end} layout={layout} />
}

function PairsCard({ rows }) {
  const max = Math.max(1, ...rows.flatMap(r => [r.sales, r.allocation]))
  const total = rows.reduce((a, r) => a + r.allocation, 0)
  return (
    <Card title="Sales vs allocation" right={<span style={{ fontSize: 12, color: M.muted }}>by location · units</span>}>
      <MixLegend parts={[{ key: 's', label: 'Sales (region demand)', color: M.green }, { key: 'a', label: 'Allocation (shipped from here)', color: M.g3 }]} style={{ marginBottom: 6 }} />
      {rows.map(r => (
        <div key={r.location} className="sa-pair" style={{ display: 'grid', gridTemplateColumns: '40px minmax(0,1fr) auto', columnGap: 10, alignItems: 'center', minHeight: 48, borderTop: `1px solid ${M.line}` }}>
          <b style={{ fontSize: 13.5 }}>{r.location}</b>
          <span aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <i style={{ display: 'block', height: 5, borderRadius: 3, width: `${Math.max(0.5, (r.sales / max) * 100)}%`, background: M.green }} />
            <i style={{ display: 'block', height: 5, borderRadius: 3, width: `${Math.max(0.5, (r.allocation / max) * 100)}%`, background: M.g3 }} />
          </span>
          <span style={{ textAlign: 'right' }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtInt(r.sales)} / {fmtInt(r.allocation)}</span>
            <span style={{ display: 'block', fontSize: 12, color: M.muted, whiteSpace: 'nowrap' }}>{pct1(total > 0 ? (r.allocation / total) * 100 : 0)} of shipped</span>
          </span>
        </div>
      ))}
    </Card>
  )
}

function ContributionCard({ channels, categories, revenueAvailable }) {
  const [view, setView] = useState('ch')
  const [metric, setMetric] = useState('qty')
  const [all, setAll] = useState(false)
  const src = view === 'ch' ? channels : categories
  const rows = src.map(r => ({ name: r.name, value: r[metric] })).sort((a, b) => b.value - a.value)
  const total = rows.reduce((a, r) => a + r.value, 0)
  const max = rows[0]?.value || 1
  const shown = all ? rows : rows.slice(0, 6)
  return (
    <Card title="Contribution" right={<SegmentToggle label="Contribution by" options={[{ id: 'ch', label: 'Channel' }, { id: 'cat', label: 'Category' }]} value={view} onChange={v => { setView(v); setAll(false) }} />}>
      <Chips label="Measure" options={[{ id: 'qty', label: 'Units' }, ...(revenueAvailable ? [{ id: 'rev', label: 'Revenue' }] : [])]} value={metric} onChange={setMetric} />
      {shown.map((r, i) => (
        <CompactRankRow key={r.name} name={r.name} value={metric === 'rev' ? fmtCurrency(r.value) : fmtInt(r.value)} pct={pct1(total > 0 ? (r.value / total) * 100 : 0)}
          barPct={(r.value / max) * 100} last={i === shown.length - 1} />
      ))}
      {rows.length > 6 && <ShowAllButton onClick={() => setAll(a => !a)}>{all ? 'Show top 6' : `Show all ${rows.length}`}</ShowAllButton>}
    </Card>
  )
}

export default function SalesAllocMobile({ fd, filters, dateFilters, revenueAvailable, mix, locationRows, channels, categories, onMenu }) {
  const [movers, setMovers] = useState(null) // the Biggest movers card's current rows, for its CSV export
  const bp = useBreakpoint()
  const layout = bp.isPhoneLandscape ? 'landscape' : bp.width >= 768 ? 'tablet' : 'phone'
  // Header "⋯": the desktop Export CSV buttons (Sales trend: the daily rows). Registered once; the
  // current values are read from a ref when an item is tapped (no parent re-render loop).
  const cur = useRef(null)
  useEffect(() => { cur.current = { fd, movers, dateFilters, filters } })
  useEffect(() => {
    onMenu?.([
      { id: 'trend', group: 'Export CSV', label: 'Sales trend (daily)', onSelect: () => exportCsv('sales_trend.csv', [{ label: 'Date', key: 'date' }, { label: 'Units', key: 'qty' }, { label: 'Revenue', key: 'rev' }], cur.current.fd.daily || []) },
      { id: 'matrix', group: 'Export CSV', label: 'Sales matrix (date × SKU × channel)', onSelect: () => { const c = cur.current; const x = salesMatrixExport({ filteredData: c.fd, data: c.fd, dateFilters: c.dateFilters, filters: c.filters }); exportCsv(x.filename, x.columns, x.rows) } },
      { id: 'movers', group: 'Export CSV', label: 'Biggest movers (as shown)', onSelect: () => { const m = cur.current.movers; if (m) exportCsv('drastic_movers.csv', m.columns, m.rows) } },
    ])
  }, [onMenu])
  useEffect(() => () => onMenu?.([]), [onMenu])
  return (
    <div className="inv-mobile sa-mobile ov-mobile" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, flex: 1, background: M.bg, color: M.ink, padding: '12px max(12px, var(--safe-right)) 24px max(12px, var(--safe-left))' }}>
      <MasterCard fd={fd} revenueAvailable={revenueAvailable} mix={mix} dateFilters={dateFilters} layout={layout} />
      <PairsCard rows={locationRows} />
      <ContributionCard channels={channels} categories={categories} revenueAvailable={revenueAvailable} />
      <TopProductsCard fd={fd} channels={filters.topChannel} revenueAvailable={revenueAvailable} />
      <MoversCard fd={fd} revenueAvailable={revenueAvailable} onRows={setMovers} />
      <DailySalesCard fd={fd} revenueAvailable={revenueAvailable} />
    </div>
  )
}
