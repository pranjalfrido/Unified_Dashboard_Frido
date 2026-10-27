import { useState } from 'react'
import { C, fmt, fmtN } from '../utils.js'
import { useBreakpoint } from '../responsive/useBreakpoint.js'
import MasterTrendCard from '../responsive/MasterTrendCard.jsx'
import { groupSumTrend } from '../responsive/trend.js'
import { Card, KV, ShowAllButton } from '../responsive/CardKit.jsx'
import InfoStrip from '../responsive/InfoStrip.jsx'
import SegmentToggle from '../responsive/SegmentToggle.jsx'
import MobileRankedList from '../responsive/MobileRankedList.jsx'
import BottomSheet from '../responsive/BottomSheet.jsx'
import WatchlistCard from '../responsive/WatchlistCard.jsx'
import StackedDailyBars from '../responsive/StackedDailyBars.jsx'
import CompactRankRow from '../responsive/CompactRankRow.jsx'
import MixBar from '../responsive/MixBar.jsx'
import DeltaBadge from '../responsive/DeltaBadge.jsx'
import FullScreenTable from '../responsive/FullScreenTable.jsx'
import { heatBg, heatInk } from '../responsive/heat.js'
import { SEG_META, GRID_PLACEMENT } from './customerDefs.js'
import { pctChg, dailyRows, ledgers, deriveAcquisition, deriveRetention, deriveBehaviour, deriveSegments, deriveDiscounts, paybackMargin, ltvCacOnMargin } from './customerDerive.js'

// Customer Intelligence below 1024px (CUSTOMER_MASTER_PLAN.md Part B §B3, mockups/customer_mockup.html).
// Display only: the same /api/customer response as the laptop tabs, numbers from customerDerive.js (the
// laptop's formulas). The sub-tab comes from the header's second row (App → Topnav → MobilePageHeader).
const M = C.m
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY = d => { const [, m, dd] = String(d).split('-').map(Number); return dd ? `${dd} ${MON[m - 1]}` : d }
const COH = c => { const [y, m] = String(c).split('-').map(Number); return m ? `${MON[m - 1]} ${String(y).slice(2)}` : c }
const x2 = v => (v != null && isFinite(v) ? `${v.toFixed(2)}x` : '—')
const p1 = v => (v != null && isFinite(v) ? `${v.toFixed(1)}%` : '—')
const FMT = { money: fmt, int: fmtN, x: v => `${(v || 0).toFixed(2)}×`, pct: v => `${(v || 0).toFixed(1)}%` }
const Muted = ({ children, style }) => <div style={{ fontSize: 12, color: M.muted, ...style }}>{children}</div>

const asOf = end => (end ? new Date(`${end}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'the end date')

export default function CustomerMobileView({ custData: cd, tab, setTab, start, end, watch }) {
  const bp = useBreakpoint()
  const layout = bp.isPhoneLandscape ? 'landscape' : bp.width >= 768 ? 'tablet' : 'phone'
  const rows = dailyRows(cd)
  const pay = paybackMargin() // C2: fixed 35% for now
  const props = { cd, rows, start, end, layout, pay }
  const openRule = id => { const t = watch?.rules.find(r => r.id === id)?.target; if (t) { setTab(t); document.querySelector('.page-scroll')?.scrollTo?.({ top: 0 }) } }
  return (
    <div className="cust-mobile ov-mobile" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 24 }}>
      {tab === 'overview' && <Overview {...props} watch={watch} onOpenRule={openRule} />}
      {tab === 'trends' && <Acquisition {...props} />}
      {tab === 'cohort' && <Retention {...props} />}
      {tab === 'purchase' && <Behaviour {...props} />}
      {tab === 'rfm' && <Segments {...props} />}
      {tab === 'spend' && <Discounts {...props} />}
    </div>
  )
}

// ── Overview ──
function Overview({ cd, rows, start, end, layout, watch, onOpenRule }) {
  const k = cd.kpis || {}, p = cd.prevKpis || {}
  const [sel, setSel] = useState(null)
  const metrics = [
    { key: 'gross', label: 'Gross sales', value: fmt(k.grossSales), sub: `${fmtN(k.totalOrders || 0)} orders · AOV ${fmt(k.aov)}`, delta: pctChg(k.grossSales, p.grossSales), point: r => r.gross, fmtPoint: fmt, def: 'Shopify D2C gross sales incl. GST, _EX orders excluded' },
    { key: 'cust', label: 'Customers', value: fmtN(k.totalCustomers), sub: `${fmtN(k.newCustomers || 0)} new · ${fmtN(k.returningCustomers || 0)} returning`, delta: pctChg(k.totalCustomers, p.totalCustomers), point: r => r.newC + r.repC, fmtPoint: fmtN, def: 'Unique customers with an order in the period (the chart adds up daily customers)' },
    { key: 'new', label: 'New customers', tileLabel: 'New', value: fmtN(k.newCustomers), delta: pctChg(k.newCustomers, p.newCustomers), point: r => r.newC, fmtPoint: fmtN },
    { key: 'ret', label: 'Returning customers', tileLabel: 'Returning', value: fmtN(k.returningCustomers), delta: pctChg(k.returningCustomers, p.returningCustomers), point: r => r.repC, fmtPoint: fmtN },
    { key: 'spend', label: 'Ad spend', value: fmt(k.totalSpend), sub: `Meta ${fmt(k.metaSpend)} · Google ${fmt(k.googleSpend)} · Add. ${fmt(k.additionalSpend || 0)}`, delta: pctChg(k.totalSpend, p.totalSpend), point: r => r.spend, fmtPoint: fmt, lowerIsBetter: false },
    { key: 'roas', label: 'ROAS', value: `${(k.roas || 0).toFixed(2)}x`, sub: 'Gross rev (ex GST) ÷ ad spend', delta: pctChg(k.roas, p.roas), point: r => (r.spend > 0 ? r.gross / r.spend : null), fmtPoint: x2 },
    { key: 'cac', label: 'CAC', value: fmt(k.cac), sub: 'Total spend (incl. offline) ÷ new customers', delta: pctChg(k.cac, p.cac), lowerIsBetter: true, point: r => (r.newC > 0 ? r.spend / r.newC : null), fmtPoint: fmt },
    { key: 'rep', label: 'Repeat revenue %', tileLabel: 'Repeat rev %', value: `${((k.repeatRevenueRate || 0) * 100).toFixed(1)}%`, sub: `${fmt(k.repeatRevenue || 0)} of gross sales`, delta: pctChg(k.repeatRevenueRate, p.repeatRevenueRate), point: r => (r.gross > 0 ? r.repRev / r.gross * 100 : null), fmtPoint: p1 },
  ]
  const L = ledgers(k, p)
  return (
    <>
      <MasterTrendCard metrics={metrics} rawRows={rows} groupTrend={groupSumTrend} start={start} end={end} layout={layout} />
      {watch && <WatchlistCard result={watch} channel="Customer" variant="mobile" title="Customer health" onOpenRule={onOpenRule} />}
      {L.map(t => (
        <Card key={t.title} title={t.title} right={<span style={{ fontSize: 12, color: M.muted }}>tap for previous</span>}>
          {t.rows.map((r, i) => (
            <button key={r.label} type="button" onClick={() => setSel(r)}
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto 64px', alignItems: 'center', gap: 8, width: '100%', minHeight: 44, padding: '6px 0', border: 'none', borderBottom: i < t.rows.length - 1 ? `1px solid ${M.line}` : 'none', background: 'transparent', fontFamily: 'var(--font)', color: M.ink, textAlign: 'left', cursor: 'pointer' }}>
              <span style={{ fontSize: 13.5 }}>{r.label}</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{FMT[r.f](r.cur)}</span>
              <span style={{ textAlign: 'right' }}>{r.noPrev ? <span style={{ fontSize: 12, color: M.muted }}>n/a</span> : <DeltaBadge delta={pctChg(r.cur, r.prev)} lowerIsBetter={r.lowerBetter} />}</span>
            </button>
          ))}
        </Card>
      ))}
      <BottomSheet open={!!sel} onClose={() => setSel(null)} title={sel?.label || ''} subtitle="This period vs the previous period">
        {sel && <KV items={[
          { label: 'Current', value: FMT[sel.f](sel.cur) },
          { label: 'Previous', value: sel.noPrev ? 'n/a (not calculated)' : sel.prev ? FMT[sel.f](sel.prev) : '—' },
        ]} />}
      </BottomSheet>
    </>
  )
}

// ── Acquisition ──
function Acquisition({ cd, rows, start, end, layout, pay }) {
  const a = deriveAcquisition(cd, pay.margin)
  const { k, p } = a
  const [acqMode, setAcqMode] = useState('cust')
  const [nrMode, setNrMode] = useState('customers')
  const [crMode, setCrMode] = useState('cac')
  const [dowMode, setDowMode] = useState('customers')
  const [spMode, setSpMode] = useState('spend')
  const metrics = [
    { key: 'new', label: 'New customers', tileLabel: 'New', value: fmtN(k.newCustomers), sub: `${fmtN(k.returningCustomers || 0)} returning`, delta: pctChg(k.newCustomers, p.newCustomers), point: r => r.newC, fmtPoint: fmtN },
    { key: 'cac', label: 'CAC', value: fmt(k.cac), sub: 'Total spend (incl. offline) ÷ new customers', delta: pctChg(k.cac, p.cac), lowerIsBetter: true, point: r => (r.newC > 0 && r.spend > 0 ? r.spend / r.newC : null), fmtPoint: fmt },
    { key: 'roas', label: 'ROAS', value: `${(k.roas || 0).toFixed(2)}x`, sub: 'Gross rev (ex GST) ÷ spend', delta: pctChg(k.roas, p.roas), point: r => (r.spend > 0 ? r.gross / r.spend : null), fmtPoint: x2 },
    { key: 'acq', label: 'Acquisition rate', value: `${(a.acqRate * 100).toFixed(1)}%`, sub: 'New ÷ total customers', delta: pctChg(a.acqRate, a.pAcqRate), point: r => (r.newC + r.repC > 0 ? r.newC / (r.newC + r.repC) * 100 : null), fmtPoint: p1 },
    { key: 'ltvcac', label: 'LTV : CAC', value: a.ltvCac > 0 ? `${a.ltvCac.toFixed(2)}x` : '—', sub: ltvCacOnMargin(a.k) != null ? `On margin ${ltvCacOnMargin(a.k).toFixed(2)}x · ${ltvCacOnMargin(a.k) >= 3 ? 'Healthy' : 'Watch'} (35% margin, P&L CM1 link later)` : 'Needs LTV data', delta: pctChg(a.ltvCac, a.pLtvCac) },
    { key: 'payback', label: 'Payback', value: a.paybackMonths != null ? `${a.paybackMonths.toFixed(1)} mo` : '—', sub: `Months of customer margin to recover CAC, at ${pay.label}`, delta: null, lowerIsBetter: true },
  ]
  const days = a.enriched.filter(r => r.date)
  const G = [M.green, M.g3]
  const nrKeys = { customers: ['newCustomers', 'repeatCustomers'], orders: ['newOrders', 'repeatOrders'], sales: ['newSales', 'repeatSales'] }[nrMode]
  const nrFmt = nrMode === 'sales' ? fmt : fmtN
  const dowKey = { customers: 'avg', revenue: 'avgRev', orders: 'avgOrders' }[dowMode]
  const dowMax = Math.max(...a.dow.map(d => d[dowKey]), 1)
  const dowTot = a.dow.reduce((s, d) => s + d[dowKey], 0)
  return (
    <>
      <MasterTrendCard metrics={metrics} rawRows={rows} groupTrend={groupSumTrend} start={start} end={end} layout={layout} />
      <Card title="Acquisition over time" sub="New customers / gross sales per day">
        <SegmentToggle options={[{ id: 'cust', label: 'Customers' }, { id: 'sales', label: 'Sales' }]} value={acqMode} onChange={setAcqMode} label="Acquisition view" full />
        <div style={{ height: 8 }} />
        <StackedDailyBars variant="mobile" fmt={acqMode === 'sales' ? fmt : fmtN} ariaLabel="Acquisition per day"
          series={[{ key: 'v', label: acqMode === 'sales' ? 'Gross sales' : 'New customers', color: M.green }]}
          bars={days.map(r => ({ key: r.date, label: DAY(r.date), segs: { v: acqMode === 'sales' ? r.grossSales || 0 : r.newCustomers || 0 } }))} />
      </Card>
      <Card title="New vs repeat" sub="Per day, stacked">
        <SegmentToggle options={[{ id: 'customers', label: 'Customers' }, { id: 'orders', label: 'Orders' }, { id: 'sales', label: 'Sales' }]} value={nrMode} onChange={setNrMode} label="New vs repeat view" full />
        <div style={{ height: 8 }} />
        <StackedDailyBars variant="mobile" fmt={nrFmt} ariaLabel="New vs repeat per day"
          series={[{ key: 'n', label: 'New', color: G[0] }, { key: 'r', label: 'Repeat', color: G[1] }]}
          bars={days.map(r => ({ key: r.date, label: DAY(r.date), segs: { n: r[nrKeys[0]] || 0, r: (nrMode === 'sales' ? r.repeatSales || r.repeatRevenue : r[nrKeys[1]]) || 0 } }))} />
      </Card>
      <Card title="CAC vs ROAS" sub="Daily acquisition cost and return on ad spend">
        <SegmentToggle options={[{ id: 'cac', label: 'CAC' }, { id: 'roas', label: 'ROAS' }]} value={crMode} onChange={setCrMode} label="CAC or ROAS" full />
        <div style={{ height: 8 }} />
        <StackedDailyBars variant="mobile" fmt={crMode === 'cac' ? fmt : x2} ariaLabel={`${crMode.toUpperCase()} per day`}
          series={[{ key: 'v', label: crMode === 'cac' ? 'CAC' : 'ROAS', color: M.green }]}
          bars={days.filter(r => r.cac > 0 || r.roas > 0).map(r => ({ key: r.date, label: DAY(r.date), segs: { v: crMode === 'cac' ? Math.round(r.cac) : +r.roas.toFixed(2) } }))} />
      </Card>
      <Card title="Day of week" sub={a.dowInsufficient ? 'Needs at least 7 days' : `Average per weekday, last ${a.dowWeeks} full week${a.dowWeeks === 1 ? '' : 's'}`}>
        <SegmentToggle options={[{ id: 'customers', label: 'New cust.' }, { id: 'revenue', label: 'Revenue' }, { id: 'orders', label: 'Orders' }]} value={dowMode} onChange={setDowMode} label="Day of week metric" full />
        <div style={{ height: 6 }} />
        {a.dow.map((d, i) => <CompactRankRow key={d.day} name={d.day} value={dowMode === 'revenue' ? fmt(d[dowKey]) : fmtN(d[dowKey])} pct={dowTot > 0 ? `${(d[dowKey] / dowTot * 100).toFixed(1)}%` : ''} barPct={d[dowKey] / dowMax * 100} last={i === 6} />)}
      </Card>
      <Card title="Spend vs sales · CAC" sub={`CAC efficiency: ${a.efficient} days efficient · ${a.costly} costly (avg ${fmt(a.cacAvg)} ± ${fmt(a.cacStd)})`}>
        <SegmentToggle options={[{ id: 'spend', label: 'Spend' }, { id: 'sales', label: 'Sales' }, { id: 'cac', label: 'CAC' }]} value={spMode} onChange={setSpMode} label="Spend view" full />
        <div style={{ height: 8 }} />
        <StackedDailyBars variant="mobile" fmt={fmt} ariaLabel={`${spMode} per day`}
          series={[{ key: 'v', label: { spend: 'Ad spend', sales: 'Gross sales', cac: 'CAC' }[spMode], color: M.green }]}
          bars={days.map(r => ({ key: r.date, label: DAY(r.date), segs: { v: spMode === 'spend' ? r.spend : spMode === 'sales' ? r.grossSales || 0 : Math.round(r.cac) } }))} />
        <Muted style={{ marginTop: 6 }}>Efficient = CAC below the average minus one standard deviation; costly = above the average plus one.</Muted>
      </Card>
    </>
  )
}

// ── Retention ──
function Retention({ cd, layout, end }) {
  const r = deriveRetention(cd)
  const [allCurve, setAllCurve] = useState(false)
  const [heat, setHeat] = useState(false)
  const metrics = [
    { key: 'm1', label: 'M1 retention', value: `${r.avgM1.toFixed(1)}%`, sub: 'Size-weighted, all cohorts', delta: pctChg(r.avgM1, r.prevAvgM1) },
    { key: 'm1t', label: 'M1 retention', tileLabel: 'M1', value: `${r.avgM1.toFixed(1)}%` },
    { key: 'm6', label: 'M6 retention', tileLabel: 'M6', value: `${r.avgM6.toFixed(1)}%` },
    { key: 'lost', label: 'Inactive 90+', value: fmtN(r.lost90), def: `D2C customers with no order in the 90 days before ${asOf(end)}` },
    { key: 'opc', label: 'Orders / customer', value: r.avgOrdersPerCust > 0 ? r.avgOrdersPerCust.toFixed(2) : '—', def: 'Orders ÷ customers, selected period' },
  ]
  const curve = allCurve ? r.curve : r.curve.slice(0, 12)
  const cMax = Math.max(...r.curve.map(c => c.pct), 1)
  const latest = [...r.rows].reverse().slice(0, 12)
  const cols = Array.from({ length: r.maxIdx + 1 }, (_, i) => `M${i}`)
  return (
    <>
      <MasterTrendCard metrics={metrics} layout={layout} summary={<Muted style={{ margin: '4px 0 10px' }}>Hero vs the earlier half of the cohorts (as on laptop). Customers basis.</Muted>} />
      <Card title="Retention curve" sub="Share of a cohort that came back in month n (M0 excluded)">
        {curve.map((c, i) => <CompactRankRow key={c.month} name={c.month} value={`${c.pct.toFixed(1)}%`} barPct={c.pct / cMax * 100} last={i === curve.length - 1} />)}
        {r.curve.length > 12 && <ShowAllButton onClick={() => setAllCurve(v => !v)}>{allCurve ? 'Show M1–M12' : `Show all ${r.curve.length}`}</ShowAllButton>}
      </Card>
      <Card title="Cohorts" sub="Latest first · size · M1 · M3 · M6">
        {latest.map((c, i) => (
          <div key={c.cohort} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) repeat(3, 52px)', alignItems: 'center', gap: 6, minHeight: 44, borderBottom: i < latest.length - 1 ? `1px solid ${M.line}` : 'none' }}>
            <span><span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: M.ink }}>{COH(c.cohort)}</span><span style={{ fontSize: 12, color: M.muted }}>{fmtN(c.size)} customers</span></span>
            {[1, 3, 6].map(idx => { const v = c.pct(idx); return <span key={idx} style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 600, borderRadius: 999, padding: '3px 0', background: v == null ? 'transparent' : heatBg(v, r.heatCeiling), color: v == null ? M.muted : heatInk(v, r.heatCeiling), fontVariantNumeric: 'tabular-nums' }}>{v == null ? '—' : `${v.toFixed(1)}%`}</span> })}
          </div>
        ))}
        <ShowAllButton onClick={() => setHeat(true)}>Full heatmap →</ShowAllButton>
      </Card>
      <FullScreenTable open={heat} onClose={() => setHeat(false)} title="Cohort heatmap" note="% of each cohort that ordered in month n. M0 is always 100% (greyed)." head="Cohort" cols={['Size', ...cols]}
        rows={r.rows.slice().reverse().map(c => ({ key: c.cohort, label: COH(c.cohort), cells: [{ text: fmtN(c.size) }, ...cols.map((_, idx) => { const v = c.pct(idx); return v == null ? { text: '' } : idx === 0 ? { text: '100%', bg: M.soft, color: M.muted } : { text: `${v.toFixed(1)}%`, bg: heatBg(v, r.heatCeiling), color: heatInk(v, r.heatCeiling) } })] }))} />
    </>
  )
}

// ── Behaviour ──
function Behaviour({ cd, layout }) {
  const b = deriveBehaviour(cd)
  const [heat, setHeat] = useState(false)
  const { pb, basket } = b
  const metrics = [
    { key: 'rr', label: 'Repeat purchase rate', value: pb.repeatRate != null ? `${pb.repeatRate}%` : '—', sub: `${fmtN(pb.repeatCustomers || 0)} of ${fmtN(pb.totalCustomers || 0)} D2C customers (lifetime)`, deltasHidden: true },
    { key: 'opc', label: 'Orders / customer', value: pb.avgOrdersPerCustomer ? pb.avgOrdersPerCustomer.toFixed(2) : '—', def: 'Lifetime, to the end date' },
    { key: 'gap', label: 'Days between orders', value: pb.avgDaysBetweenOrders ? `${pb.avgDaysBetweenOrders}d` : '—', def: "Average gap between a customer's orders" },
    { key: 'multi', label: 'Multi-category', value: pb.multiCatRate != null ? `${pb.multiCatRate}%` : '—', def: 'Customers who bought 2+ categories ever' },
    { key: 'cpo', label: 'Categories / order', value: basket.avgCategoriesPerOrder ? basket.avgCategoriesPerOrder.toFixed(2) : '—', def: `${basket.avgItemsPerOrder ? basket.avgItemsPerOrder.toFixed(1) : '—'} items per order` },
  ]
  const cyMax = Math.max(...b.cycle.map(c => c.medianDays), 1)
  const d2Max = Math.max(...b.days2.map(c => c.customers), 1)
  const fqMax = Math.max(...b.freq.map(c => c.customers), 1)
  const aoMax = Math.max(...b.aovByOrder.map(c => c.aov), 1)
  const tpMax = Math.max(...b.topPairs.map(c => c.customers), 1)
  const ord = v => (v === '1' ? '1st' : v === '2' ? '2nd' : v === '3' ? '3rd' : v === '6+' ? '6th+' : `${v}th`)
  const mx = b.matrix
  const liftMax = 4
  return (
    <>
      <MasterTrendCard metrics={metrics} layout={layout} summary={<div style={{ height: 6 }} />} />
      <Card title="Top cross-sell opportunities" sub="First category → next category, lift vs average (same-category pairs left out)">
        {b.top5.length ? b.top5.map((x, i) => <CompactRankRow key={x.f + x.s} name={`${x.f} → ${x.s}`} value={`${x.lift}×`} pct={`${fmtN(x.count)} cust.`} barPct={Math.min(100, x.lift / (b.top5[0].lift || 1) * 100)} last={i === b.top5.length - 1} />) : <Muted>No pair with enough customers.</Muted>}
        <ShowAllButton onClick={() => setHeat(true)}>Full heatmap →</ShowAllButton>
      </Card>
      <FullScreenTable open={heat} onClose={() => setHeat(false)} title="Cross-sell lift" note="Rows = first purchase, columns = next purchase. Lift = how much more likely than average; same category greyed." head="First →" cols={mx.cols}
        rows={mx.rows.map(f => ({ key: f, label: f, cells: mx.cols.map(s => { const lv = mx.lift(f, s); return f === s ? { text: lv != null ? `${lv}×` : '—', bg: M.soft, color: M.muted } : { text: lv != null ? `${lv}×` : '—', bg: lv != null && lv >= 1 ? heatBg(lv, liftMax) : 'transparent', color: lv != null && lv >= 1 ? heatInk(lv, liftMax) : M.muted, title: `${fmtN(mx.count(f, s))} customers · ${mx.rate(f, s)}%` } }) }))} />
      {b.cycle.length > 0 && (
        <Card title="Repurchase cycle" sub="Median days to repurchase, by first category">
          {b.cycle.map((c, i) => <CompactRankRow key={c.category} name={c.category} value={`${c.medianDays}d`} pct={`${fmtN(c.repeatCustomers)}`} barPct={c.medianDays / cyMax * 100} last={i === b.cycle.length - 1} />)}
        </Card>
      )}
      {b.days2.length > 0 && (
        <Card title="Days to 2nd purchase" sub="Repeat customers by gap">
          {b.days2.map((c, i) => <CompactRankRow key={c.bucket} name={c.bucket} value={fmtN(c.customers)} pct={`${c.pct}%`} barPct={c.customers / d2Max * 100} last={i === b.days2.length - 1} />)}
        </Card>
      )}
      {b.freq.length > 0 && (
        <Card title="Order frequency" sub={`${b.oneTimePct}% of customers ordered once`}>
          {b.freq.map((c, i) => <CompactRankRow key={c.orderCount} name={`${ord(c.orderCount)} time`} value={fmtN(c.customers)} pct={`${c.pct}%`} barPct={c.customers / fqMax * 100} last={i === b.freq.length - 1} />)}
        </Card>
      )}
      {b.aovByOrder.length > 0 && (
        <Card title="AOV by order number" sub="AOV ex GST · customers">
          {b.aovByOrder.map((c, i) => <CompactRankRow key={c.orderLabel} name={`${c.orderLabel} order`} value={fmt(c.aov)} pct={fmtN(c.customers)} barPct={c.aov / aoMax * 100} last={i === b.aovByOrder.length - 1} />)}
        </Card>
      )}
      {basket.totalOrders > 0 && (
        <Card title="Basket composition" sub={`${fmtN(basket.totalOrders)} orders`}>
          <MixBar height={10} legend fmt={fmtN} label="Basket split" parts={[
            { key: 's', label: 'Single-category', value: basket.singleCatOrders || 0, color: M.g3 },
            { key: 'm', label: 'Multi-category', value: basket.multiCatOrders || 0, color: M.green },
          ]} />
          <div style={{ height: 10 }} />
          <KV items={[
            { label: 'Categories / order', value: basket.avgCategoriesPerOrder?.toFixed(2) || '—' },
            { label: 'SKUs / order', value: basket.avgSkusPerOrder?.toFixed(2) || '—' },
            { label: 'Items / order', value: basket.avgItemsPerOrder?.toFixed(1) || '—' },
            { label: 'Multi-category cust.', value: pb.multiCatCustomers != null ? fmtN(pb.multiCatCustomers) : '—' },
          ]} />
        </Card>
      )}
      {b.topPairs.length > 0 && (
        <Card title="Top category pairs" sub="First purchase → then bought, customers">
          {b.topPairs.map((c, i) => <CompactRankRow key={c.first + c.second} name={`${c.first || '—'} → ${c.second || '—'}`} value={fmtN(c.customers)} barPct={c.customers / tpMax * 100} last={i === b.topPairs.length - 1} />)}
        </Card>
      )}
      <InfoStrip text="Repurchase due: not built yet" detail="Needs each customer's last order per category, which no current query returns (logged for Suraj)." />
    </>
  )
}

// ── Segments ──
function Segments({ cd, layout, end }) {
  const s = deriveSegments(cd)
  const [cell, setCell] = useState(null)
  const metrics = [
    { key: 'cust', label: 'Customers analysed', value: fmtN(s.totalCust), sub: 'D2C customers with an order in the last 12 months', deltasHidden: true },
    { key: 'risk', label: 'Revenue at risk', value: fmt(s.atRiskRev), def: `${s.atRiskSegs.length} win-back segments` },
    { key: 'healthy', label: 'Healthy base revenue', tileLabel: 'Healthy base rev', value: fmt(s.healthyRev), def: 'Champions + Loyal Customers' },
    { key: 'life', label: 'Lifetime revenue', value: fmt(s.totalRev), def: 'All segments combined' },
    { key: 'wbc', label: 'Win-back customers', value: fmtN(s.atRiskCust), def: 'Customers in WIN-BACK / URGENT SAVE segments' },
  ]
  const grid = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => []))
  for (const seg of cd.rfm || []) { const pl = GRID_PLACEMENT[seg.segment]; if (pl) grid[pl.row][pl.col].push(seg) }
  const chip = a => <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: a === 'URGENT SAVE' ? 'rgba(192,57,43,.1)' : M.soft, color: a === 'URGENT SAVE' ? M.down : M.green, whiteSpace: 'nowrap' }}>{a}</span>
  const meta = n => SEG_META[n] || { action: 'REVIEW', desc: '' }
  const inact = cd.inactivity || [], fd = cd.freqDist || [], md = cd.monetaryDist || []
  const iMax = Math.max(...inact.map(x => x.customers), 1), fMax = Math.max(...fd.map(x => x.customers), 1), mMax = Math.max(...md.map(x => x.customers), 1)
  const iTot = inact.reduce((a, x) => a + x.customers, 0)
  return (
    <>
      <InfoStrip text={`${fmtN(s.atRiskCust)} customers (${s.totalCust > 0 ? (s.atRiskCust / s.totalCust * 100).toFixed(1) : 0}%) in win-back segments · ${fmt(s.atRiskRev)} at risk`}
        detail={`Healthy segments (Champions + Loyal) hold ${fmt(s.healthyRev)} (${s.totalRev > 0 ? (s.healthyRev / s.totalRev * 100).toFixed(1) : 0}% of lifetime revenue). RFM = the 12 months up to the end date.`} />
      <MasterTrendCard metrics={metrics} layout={layout} summary={<div style={{ height: 6 }} />} />
      <Card title="Segments" sub="Sorted by lifetime revenue · tap for the action">
        <MobileRankedList noun="segments" items={s.sorted} itemKey={r => r.segment} topN={8}
          sorts={[{ key: 'rev', label: 'Revenue', value: r => r.totalRevenue || 0, format: r => fmt(r.totalRevenue || 0) }, { key: 'cust', label: 'Customers', value: r => r.customers || 0, format: r => fmtN(r.customers || 0) }]}
          name={r => r.segment} sub={r => `${fmtN(r.customers || 0)} customers · ${s.totalRev > 0 ? ((r.totalRevenue || 0) / s.totalRev * 100).toFixed(1) : 0}% of revenue`}
          secondary={r => meta(r.segment).action}
          renderSheet={r => (
            <div>
              <div style={{ marginBottom: 10 }}>{chip(meta(r.segment).action)}</div>
              <div style={{ fontSize: 13.5, color: M.ink, marginBottom: 6 }}>{meta(r.segment).desc}</div>
              {meta(r.segment).tooltip && <Muted style={{ marginBottom: 12 }}>{meta(r.segment).tooltip}</Muted>}
              <KV items={[{ label: 'Customers', value: fmtN(r.customers || 0) }, { label: 'Lifetime revenue', value: fmt(r.totalRevenue || 0) }, { label: 'Share of revenue', value: s.totalRev > 0 ? `${((r.totalRevenue || 0) / s.totalRev * 100).toFixed(1)}%` : '—' }, { label: 'Share of customers', value: s.totalCust > 0 ? `${((r.customers || 0) / s.totalCust * 100).toFixed(1)}%` : '—' }]} />
            </div>
          )} />
      </Card>
      <Card title="RFM grid" sub="Rows: frequency · columns: recency">
        <div style={{ display: 'grid', gridTemplateColumns: '64px repeat(3, minmax(0,1fr))', gap: 4 }}>
          <span />{['Recent', 'Mid', 'Long ago'].map(c => <span key={c} style={{ fontSize: 12, color: M.muted, textAlign: 'center' }}>{c}</span>)}
          {['Frequent', 'Mid', 'Rare'].map((rl, ri) => [
            <span key={rl} style={{ fontSize: 12, color: M.muted, alignSelf: 'center' }}>{rl}</span>,
            ...grid[ri].map((segs, ci) => {
              const n = segs.reduce((a, x) => a + (x.customers || 0), 0)
              return (
                <button key={`${ri}${ci}`} type="button" disabled={!segs.length} onClick={() => setCell(segs)}
                  style={{ minHeight: 56, borderRadius: 10, border: `1px solid ${M.tileBorder}`, background: segs.length ? M.soft : '#fff', padding: 6, textAlign: 'left', fontFamily: 'var(--font)', cursor: segs.length ? 'pointer' : 'default' }}>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: M.ink, lineHeight: 1.25 }}>{segs.map(x => x.segment).join(' · ') || '—'}</span>
                  {segs.length > 0 && <span style={{ fontSize: 12, color: M.muted }}>{fmtN(n)}</span>}
                </button>
              )
            }),
          ])}
        </div>
      </Card>
      <BottomSheet open={!!cell} onClose={() => setCell(null)} title={cell?.map(x => x.segment).join(' · ') || ''} subtitle="RFM grid cell">
        {cell?.map(x => (
          <div key={x.segment} style={{ padding: '8px 0', borderBottom: `1px solid ${M.line}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}><b style={{ fontSize: 14 }}>{x.segment}</b>{chip(meta(x.segment).action)}</div>
            <Muted style={{ marginTop: 2 }}>{meta(x.segment).desc}</Muted>
            <div style={{ fontSize: 13, marginTop: 4 }}>{fmtN(x.customers || 0)} customers · {fmt(x.totalRevenue || 0)}</div>
          </div>
        ))}
      </BottomSheet>
      {fd.length > 0 && <Card title="Purchase frequency" sub="Customers by order count">{fd.map((x, i) => <CompactRankRow key={x.label} name={x.label} value={fmtN(x.customers)} pct={`${fmtN(x.totalOrders)} ord.`} barPct={x.customers / fMax * 100} last={i === fd.length - 1} />)}</Card>}
      {md.length > 0 && <Card title="Monetary distribution" sub="Customers by lifetime spend tier">{md.map((x, i) => <CompactRankRow key={x.bucket} name={x.bucket} value={fmtN(x.customers)} pct={fmt(x.revenue)} barPct={x.customers / mMax * 100} last={i === md.length - 1} />)}</Card>}
      {inact.length > 0 && <Card title="Inactivity" sub={`Days since last purchase, as of ${asOf(end)}`}>{inact.map((x, i) => <CompactRankRow key={x.bucket} name={x.bucket} value={fmtN(x.customers)} pct={iTot > 0 ? `${(x.customers / iTot * 100).toFixed(1)}%` : ''} barPct={x.customers / iMax * 100} last={i === inact.length - 1} />)}</Card>}
    </>
  )
}

// ── Discounts ──
function Discounts({ cd, layout, pay }) {
  const d = deriveDiscounts(cd, pay.margin)
  const { k } = d
  const [sMode, setSMode] = useState('totalSpend')
  const [bMode, setBMode] = useState('totalOrders')
  const [cMode, setCMode] = useState('discountedOrderPct')
  const metrics = [
    { key: 'spend', label: 'Total spend', value: fmt(k.totalSpend || 0), sub: `Meta ${fmt(k.metaSpend || 0)} · Google ${fmt(k.googleSpend || 0)}${k.additionalSpend > 0 ? ` · Add. ${fmt(k.additionalSpend)}` : ''}`, deltasHidden: true },
    { key: 'spend2', label: 'Total spend', value: fmt(k.totalSpend || 0) },
    { key: 'roas', label: 'Blended ROAS', value: `${(k.roas || 0).toFixed(2)}x`, def: 'Gross rev (ex GST) ÷ spend' },
    { key: 'cac', label: 'Blended CAC', value: fmt(k.cac || 0), def: 'Total spend ÷ new customers' },
    { key: 'pb', label: 'Payback', value: d.paybackMonths != null ? `${d.paybackMonths.toFixed(1)} mo` : '—', def: `CAC ÷ monthly margin per customer, at ${pay.label} (same as Acquisition)` },
    { key: 'share', label: 'Discounted orders', value: d.allOrders > 0 ? `${(d.discOrders / d.allOrders * 100).toFixed(1)}%` : '—', def: d.allOrders > 0 ? `${fmtN(d.discOrders)} of ${fmtN(d.allOrders)} orders` : 'No data' },
    { key: 'dpo', label: 'Avg discount / order', value: d.discPerOrder != null ? fmt(d.discPerOrder) : '—', def: d.avgDiscPct != null ? `${d.avgDiscPct.toFixed(1)}% avg discount on discounted orders` : '' },
  ]
  const bandKey = { totalOrders: 'totalOrders', aov: 'aovExc', repeat: 'repeatPct', disc: 'avgDiscPct' }[bMode]
  const bandFmt = v => (bMode === 'totalOrders' ? fmtN(v) : bMode === 'aov' ? fmt(v) : `${v}%`)
  const bMax = Math.max(...d.bands.map(x => x[bandKey] || 0), 1)
  const cats = [...d.cats].sort((a, b) => (b[cMode] || 0) - (a[cMode] || 0))
  const cMax = Math.max(...cats.map(x => x[cMode] || 0), 1)
  const side = (name, orders, aov, rep) => (
    <div style={{ background: M.soft, borderRadius: M.radius.tile, padding: '10px 12px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: M.muted, textTransform: 'uppercase' }}>{name}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: M.ink, fontVariantNumeric: 'tabular-nums' }}>{fmtN(orders)}</div>
      <div style={{ fontSize: 12.5, color: M.ink, marginTop: 2 }}>AOV {fmt(aov)}</div>
      <div style={{ fontSize: 12.5, color: M.ink }}>Repeat {rep ? `${rep.repeatRate}%` : '—'}</div>
    </div>
  )
  return (
    <>
      <MasterTrendCard metrics={metrics} layout={layout} summary={<div style={{ height: 6 }} />} />
      <Card title="Spend vs sales" sub="Per day">
        <SegmentToggle options={[{ id: 'totalSpend', label: 'Spend' }, { id: 'grossSalesExcGst', label: 'Sales' }, { id: 'discountGiven', label: 'Discount' }]} value={sMode} onChange={setSMode} label="Spend vs sales view" full />
        <div style={{ height: 8 }} />
        <StackedDailyBars variant="mobile" fmt={fmt} ariaLabel="Spend vs sales per day" series={[{ key: 'v', label: { totalSpend: 'Total spend', grossSalesExcGst: 'Gross sales (ex GST)', discountGiven: 'Discount given' }[sMode], color: M.green }]}
          bars={d.days.filter(x => /^\d{4}-/.test(x.date)).map(x => ({ key: x.date, label: DAY(x.date), segs: { v: x[sMode] || 0 } }))} />
      </Card>
      <Card title="Discount distribution" sub="By actual % off MRP">
        <SegmentToggle options={[{ id: 'totalOrders', label: 'Orders' }, { id: 'aov', label: 'AOV' }, { id: 'repeat', label: 'Repeat %' }]} value={bMode} onChange={setBMode} label="Discount band metric" full />
        <div style={{ height: 6 }} />
        {d.bands.map((x, i) => <CompactRankRow key={x.bucket} name={x.bucket} value={bandFmt(x[bandKey] || 0)} pct={`${x.revPct}% rev`} barPct={(x[bandKey] || 0) / bMax * 100} last={i === d.bands.length - 1} />)}
      </Card>
      {d.allOrders > 0 && (
        <Card title="Discounted vs full price" sub={`${fmtN(d.allOrders)} orders`}>
          <MixBar height={10} legend fmt={fmtN} label="Discounted vs non-discounted orders" parts={[{ key: 'd', label: 'Discounted', value: d.discOrders, color: M.green }, { key: 'n', label: 'Full price', value: d.nonOrders, color: M.g3 }]} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
            {side('Discounted', d.discOrders, d.discAov, d.discRepeat)}
            {side('Full price', d.nonOrders, d.nonAov, d.nonRepeat)}
          </div>
          <Muted style={{ marginTop: 6 }}>Repeat = customers whose first order was discounted / full price and came back.</Muted>
        </Card>
      )}
      {cats.length > 0 && (
        <Card title="Category-wise discount" sub="% orders discounted · avg discount · repeat order %">
          <SegmentToggle options={[{ id: 'discountedOrderPct', label: '% disc.' }, { id: 'avgDiscPct', label: 'Avg disc' }, { id: 'repeatOrderPct', label: 'Repeat %' }]} value={cMode} onChange={setCMode} label="Category metric" full />
          <div style={{ height: 6 }} />
          {cats.map((x, i) => <CompactRankRow key={x.category} name={x.category} value={`${x[cMode]}%`} pct={`${fmtN(x.totalOrders)} ord.`} barPct={(x[cMode] || 0) / cMax * 100} last={i === cats.length - 1} />)}
        </Card>
      )}
    </>
  )
}
