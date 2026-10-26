import { useEffect, useState } from 'react'
import { C, fmt, fmtN, exportCSV } from '../utils.js'
import { useBreakpoint } from '../responsive/useBreakpoint.js'
import MasterTrendCard from '../responsive/MasterTrendCard.jsx'
import InfoStrip from '../responsive/InfoStrip.jsx'
import SegmentToggle from '../responsive/SegmentToggle.jsx'
import CompactRankRow from '../responsive/CompactRankRow.jsx'
import MobileRankedList from '../responsive/MobileRankedList.jsx'
import BottomSheet from '../responsive/BottomSheet.jsx'
import FilterPicker from '../responsive/FilterPicker.jsx'
import StackedBarChart from '../responsive/StackedBarChart.jsx'
import MixBar, { MixLegend } from '../responsive/MixBar.jsx'
import { Card, Chips, KV, ShowAllButton, RowText } from '../responsive/CardKit.jsx'
import { useRaBasis, setRaBasis, exportExchangeCsv, groupReturnTrend, immatureSince, maturityText, isRed, exchTone, sizeSwapPct, isSizeSwap } from './returnAnalysisData.js'

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
  // Order as the desktop tiles: Revenue first (the default hero), then Return %, then the rest.
  metrics.unshift(metrics.pop())
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
    <Card title="Category breakdown">
      <SegmentToggle full label="Group by" value={view} onChange={setView} options={[{ id: 'category', label: 'Category' }, { id: 'sub', label: 'Sub-category' }]} style={{ marginBottom: 6 }} />
      <MobileRankedList key={`${view}-${basis}`} title={null} noun={isCat ? 'categories' : 'sub-categories'} items={isCat ? catRows : subRows}
        itemKey={r => (isCat ? r.category : `${r.category}::${r.subCategory}`)} name={r => (isCat ? r.category : r.subCategory)} sub={isCat ? null : r => r.category}
        groupOf={isCat ? null : r => r.category} searchText={r => `${r.category} ${r.subCategory || ''}`} sorts={sorts} topN={8} sheetSubtitle={period} compact={isCat}
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

// ── Return reasons (CIR): the desktop "Return Reasons · Detail" (reason → sub-reasons, Total) ──
// Every reason row is a CIR order (confirmed for 1–25 Oct 2026, RETURN_ANALYSIS_PLAN.md §2).
function ReasonsCard({ reasons = [], period }) {
  const [all, setAll] = useState(false)
  const [sel, setSel] = useState(null)
  const totalCount = reasons.reduce((s, r) => s + r.count, 0)
  const totalRev = reasons.reduce((s, r) => s + (r.revenueImpact || 0), 0)
  const m = {}
  reasons.forEach(r => {
    const g = m[r.reason] || (m[r.reason] = { reason: r.reason, count: 0, revenueImpact: 0, subReasons: [] })
    g.count += r.count; g.revenueImpact += r.revenueImpact; g.subReasons.push(r)
  })
  const grouped = Object.values(m).sort((a, b) => b.count - a.count)
  const shown = all ? grouped : grouped.slice(0, 6)
  const mx = grouped[0]?.count || 1
  const share = c => (totalCount ? (c / totalCount * 100).toFixed(1) : '0.0')
  return (
    <Card title="Return reasons (CIR)" sub="Orders · share · revenue impact">
      {grouped.length ? shown.map((r, i) => (
        <CompactRankRow key={r.reason} name={r.reason} value={fmtN(r.count)} pct={`${share(r.count)}% · ${fmt(r.revenueImpact)}`} barPct={(r.count / mx) * 100}
          last={i === shown.length - 1} onClick={() => setSel(r)} />
      )) : <div style={{ fontSize: 13, color: M.muted, padding: '8px 0' }}>No data for this period</div>}
      {grouped.length > 6 && <ShowAllButton onClick={() => setAll(a => !a)}>{all ? 'Show top 6' : `Show all ${grouped.length} reasons`}</ShowAllButton>}
      {grouped.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 10, padding: '9px 12px', borderRadius: M.radius.tile, background: M.soft, fontSize: M.type.listValue, fontWeight: 700, color: M.ink, fontVariantNumeric: 'tabular-nums' }}>
          <span>Total</span><span>{fmtN(totalCount)} · {fmt(totalRev)}</span>
        </div>
      )}
      <BottomSheet open={!!sel} onClose={() => setSel(null)} title={sel?.reason || ''} subtitle={sel ? `${fmtN(sel.count)} orders · ${share(sel.count)}% · ${fmt(sel.revenueImpact)} · ${period}` : ''}>
        {sel && [...sel.subReasons].sort((a, b) => b.count - a.count).map((s, i, a) => (
          <CompactRankRow key={s.subReason} name={s.subReason} value={fmtN(s.count)} pct={`${share(s.count)}% · ${fmt(s.revenueImpact)}`} barPct={(s.count / (a[0]?.count || 1)) * 100} last={i === a.length - 1} />
        ))}
      </BottomSheet>
    </Card>
  )
}

// ── Cancellations · days since order: the desktop chart (last 6 months, not the date range) ──
// Stacked by the day buckets the desktop tooltip lists (green shades, fastest darkest).
const BUCKETS = ['0-1', '2-4', '5-7', '8-10', '10+']
function CancelCard({ rows = [] }) {
  const [subs, setSubs] = useState([]) // [] = all sub-categories (desktop default)
  const [pick, setPick] = useState(false)
  const [sel, setSel] = useState(null)
  const colors = [M.greenDark, M.green, M.g2, M.g3, M.g4]
  const series = BUCKETS.map((b, i) => ({ key: b, label: `${b} days`, color: colors[i] }))
  const monthMap = {}
  rows.forEach(r => { monthMap[r.monthDt] = r.month })
  const months = Object.entries(monthMap).sort((a, b) => a[0].localeCompare(b[0])).map(([, l]) => l)
  const subOptions = [...new Set(rows.map(r => r.subCategory))].sort()
  const bars = months.map(month => {
    const values = Object.fromEntries(BUCKETS.map(b => [b, 0]))
    rows.filter(r => r.month === month && (subs.length === 0 || subs.includes(r.subCategory))).forEach(r => { values[r.bucket] = (values[r.bucket] || 0) + r.cancelCount })
    return { key: month, label: (month || '').split(' ')[0], full: month, values }
  })
  const onlyFirstBucket = rows.length > 0 && rows.every(r => r.bucket === '0-1')
  const selTotal = sel ? BUCKETS.reduce((s, b) => s + (sel.values[b] || 0), 0) : 0
  return (
    <Card title="Cancellations · days since order" sub="Last 6 months (not the selected dates) · each cancelled order counted once, under its main product">
      {onlyFirstBucket && <InfoStrip text="Days since order isn't tracked yet: every cancellation is counted as 0–1 days." style={{ marginBottom: 8 }} />}
      <button type="button" onClick={() => setPick(true)}
        style={{ marginBottom: 10, minHeight: 32, maxWidth: '100%', padding: '0 12px', borderRadius: 999, border: `1px solid ${subs.length ? M.green : M.line}`, background: subs.length ? 'rgba(31,90,61,.08)' : '#fff', color: M.ink, fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {subs.length === 0 ? 'All sub-categories' : subs.length === 1 ? subs[0] : `${subs[0]} +${subs.length - 1}`} ▾
      </button>
      {bars.length ? <StackedBarChart label="Cancellations by month" bars={bars} series={series} fmt={fmtN} onBar={setSel} height={170} />
        : <div style={{ fontSize: 13, color: M.muted, padding: '8px 0' }}>No cancellation data</div>}
      <BottomSheet open={!!sel} onClose={() => setSel(null)} title={sel ? `${sel.full} · ${fmtN(selTotal)} cancellations` : ''}>
        {sel && BUCKETS.map((b, i) => (
          <CompactRankRow key={b} name={`${b} days`} value={fmtN(sel.values[b] || 0)} pct={`${selTotal ? ((sel.values[b] || 0) / selTotal * 100).toFixed(0) : 0}%`}
            barPct={selTotal ? ((sel.values[b] || 0) / selTotal) * 100 : 0} last={i === BUCKETS.length - 1} />
        ))}
      </BottomSheet>
      <BottomSheet open={pick} onClose={() => setPick(false)} title="Sub-category">
        <FilterPicker title="Sub-category" noun="sub-categories" multi options={subOptions.map(v => ({ value: v }))} selected={subs}
          onBack={() => setPick(false)} onApply={v => { setSubs(v); setPick(false) }} />
      </BottomSheet>
    </Card>
  )
}

// ── Last 12 months: the desktop "Last 12 Months Summary", newest first ──
const monthLabel = key => { const [y, m] = (key || '').split('-'); return y && m ? `${MON[parseInt(m, 10) - 1]}-${y.slice(2)}` : key }
function MonthsCard({ rows = [], basis, end }) {
  const [all, setAll] = useState(false)
  const [sel, setSel] = useState(null)
  const suffix = basis === 'qty' ? 'PctQty' : 'Pct'
  const sorted = [...rows].sort((a, b) => b.month.localeCompare(a.month))
  const shown = all ? sorted : sorted.slice(0, 6)
  const maxTotal = Math.max(...sorted.map(r => r[`totalReturn${suffix}`] || 0), 0) || 1
  // The range's last month is partial unless the range ends on its last day.
  const endD = end ? d0(end) : null
  const partialKey = endD && new Date(endD.getFullYear(), endD.getMonth() + 1, 0).getDate() !== endD.getDate() ? end.slice(0, 7) : null
  const label = r => (r.month === partialKey ? `${monthLabel(r.month)} (1–${endD.getDate()} ${MON[endD.getMonth()]}, partial)` : monthLabel(r.month))
  const parts = r => [{ key: 'cancel', label: 'Cancel', value: r[`cancel${suffix}`], color: M.green }, { key: 'rto', label: 'RTO', value: r[`rto${suffix}`], color: M.g2 }, { key: 'cir', label: 'CIR', value: r[`cir${suffix}`], color: M.g3 }]
  const amount = r => (basis === 'qty' ? `${fmtN(r.qty)} units` : `Rev ${fmt(r.revenue)}`)
  return (
    <Card title="Last 12 months" sub={`Total return % by month · ${basis === 'qty' ? 'by qty' : 'by revenue'}`}>
      <MixLegend parts={parts({})} prefix="Bar:" style={{ marginBottom: 6 }} />
      {sorted.length ? shown.map(r => (
        <button key={r.month} type="button" onClick={() => setSel(r)}
          style={{ display: 'block', width: '100%', padding: '8px 0', border: 'none', borderBottom: `1px solid ${M.line}`, background: 'transparent', textAlign: 'left', fontFamily: 'var(--font)', color: M.ink, cursor: 'pointer' }}>
          <RowText name={label(r)} sub={amount(r)} value={p1(r[`totalReturn${suffix}`])} valueColor={redIf('totalReturnPct', r[`totalReturn${suffix}`])} />
          <div style={{ width: `${Math.max(2, ((r[`totalReturn${suffix}`] || 0) / maxTotal) * 100)}%`, marginTop: 6 }}>
            <MixBar parts={parts(r)} height={4} label={`${monthLabel(r.month)}: Cancel, RTO, CIR`} fmt={p1} />
          </div>
        </button>
      )) : <div style={{ fontSize: 13, color: M.muted, padding: '8px 0' }}>No data</div>}
      {sorted.length > 6 && <ShowAllButton onClick={() => setAll(a => !a)}>{all ? 'Show last 6' : `Show all ${sorted.length}`}</ShowAllButton>}
      <BottomSheet open={!!sel} onClose={() => setSel(null)} title={sel ? label(sel) : ''}>
        {sel && <KV items={[{ label: basis === 'qty' ? 'Qty' : 'Revenue', value: basis === 'qty' ? fmtN(sel.qty) : fmt(sel.revenue) },
          ...RATE_COLS.map(([id, l]) => ({ label: l, value: p1(sel[`${id}${suffix}`]), color: redIf(`${id}Pct`, sel[`${id}${suffix}`]) }))]} />}
      </BottomSheet>
    </Card>
  )
}

// ── Exchange deep dive: the desktop SKU-wise table as a ranked list ──
export function SizeSwapChip({ pct }) {
  return <span style={{ display: 'inline-block', marginRight: 6, padding: '0 6px', borderRadius: 999, background: 'rgba(31,90,61,.08)', color: M.green, fontSize: 12, fontWeight: 600, lineHeight: '15px' }}>Size swap {pct.toFixed(0)}%</span>
}
function ExchangeCard({ rows = [], period }) {
  const toneColor = v => ({ bad: M.down, warn: M.amber }[exchTone(v)])
  const sorts = [
    { key: 'exchQty', label: 'Exch qty', value: r => r.exchQty, format: r => fmtN(r.exchQty) },
    { key: 'exchPct', label: 'Exch %', value: r => r.exchPct, format: r => p1(r.exchPct), bar: 'bad' },
    { key: 'exchRev', label: 'Exch ₹', value: r => r.exchRev, format: r => fmt(r.exchRev) },
  ]
  return (
    <Card title="Exchange deep dive" sub="SKUs by exchanges · tap for what they were exchanged to">
      <MobileRankedList title={null} noun="SKUs" items={rows} itemKey={r => r.sku} name={r => r.sku} sub={r => r.subCategory}
        groupOf={r => r.category} searchText={r => `${r.sku} ${r.subCategory} ${r.category}`} sorts={sorts} topN={10} sheetSubtitle={period}
        valueColor={(r, k) => (k === 'exchPct' ? toneColor(r.exchPct) : undefined)}
        badge={r => { const s = sizeSwapPct(r); return s != null ? <SizeSwapChip pct={s} /> : null }}
        secondary={(r, k) => (k === 'exchQty' ? `${p1(r.exchPct)} · ${fmt(r.exchRev)}` : `${fmtN(r.exchQty)} exch · of ${fmtN(r.totalQty)}`)}
        details={[{ label: 'Exch qty', value: r => fmtN(r.exchQty) }, { label: 'Exch %', value: r => p1(r.exchPct) }, { label: 'Exch ₹', value: r => fmt(r.exchRev) }, { label: 'Units sold', value: r => fmtN(r.totalQty) }]}
        renderSheet={r => {
          const to = [[r.top1Sku, r.top1Pct], [r.top2Sku, r.top2Pct], [r.top3Sku, r.top3Pct]].filter(([s]) => s)
          return (
            <>
              <SheetHeading>Exchanged to</SheetHeading>
              {to.length ? to.map(([s, p], i) => (
                <CompactRankRow key={s} name={`${s}${isSizeSwap(r.sku, s) ? ' · other size' : ''}`} value={p != null ? p1(p) : '—'} pct="" barPct={p || 0} last={i === to.length - 1} />
              )) : <div style={{ fontSize: 13, color: M.muted, padding: '4px 0' }}>No exchange-to data</div>}
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
      {data && <ReasonsCard reasons={data.returnReasons} period={period} />}
      {data && <CancelCard rows={data.cancelByBucket} />}
      {data && <MonthsCard rows={data.monthlyTable} basis={basis} end={filters.end} />}
      {data && <ExchangeCard rows={data.exchangeSkuDetail} period={period} />}
      {!data && loading && <div className="skel" style={{ height: 420, borderRadius: M.radius.card, background: M.card, boxShadow: M.cardShadow }} aria-label="Loading return analysis" />}
    </div>
  )
}
