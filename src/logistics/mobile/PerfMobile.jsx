import { useCallback, useMemo, useState } from 'react'
import { C, fmtBig, COURIER_LOGOS } from '../../utils.js'
import { useBreakpoint } from '../../responsive/useBreakpoint.js'
import MasterTrendCard from '../../responsive/MasterTrendCard.jsx'
import SegmentToggle from '../../responsive/SegmentToggle.jsx'
import SegmentedToolbar from '../../responsive/SegmentedToolbar.jsx'
import StackedBucketRow from '../../responsive/StackedBucketRow.jsx'
import CompactRankRow from '../../responsive/CompactRankRow.jsx'
import BottomSheet from '../../responsive/BottomSheet.jsx'
import ActionMenu from '../../responsive/ActionMenu.jsx'
import { Card, ShowAllButton, KV } from '../../responsive/CardKit.jsx'
import {
  kpiDelta, rtoPctDelta, SCORE_VIEWS, scoreCols, fmtCol, scoreRows, drillRows, monthTone,
  TAT_VIEWS, tatTable, weightRows, fmtSlabValue, GEO_VIEWS, geoRows, rtoAgeingRows, rtoReasonRows, ndrTable, ndrPct,
} from './perfMobileData.js'

// Logistics → Performance below 1024px (LOGISTICS_MOBILE_REDESIGN_PROMPT.md §2, mockup
// logistics_mobile_mockup.html). Display only: every number comes from LogisticsPage's own data and
// the desktop formulas in perfMobileData.js. Page state that also drives desktop (scorecard views,
// tier / payment, RTO ageing basis, NDR payment) is passed in, so both widths stay in step.
const M = C.m
const n = v => (v || 0).toLocaleString('en-IN')
const pct2 = (a, b) => (b ? ((a / b) * 100).toFixed(1) + '%' : '—')
const d1 = v => (v != null ? (+v).toFixed(1) + 'd' : '—')
const fmtGMV = v => (v == null ? '—' : v >= 1e7 ? (v / 1e7).toFixed(2) + ' Cr' : v >= 1e5 ? (v / 1e5).toFixed(1) + ' L' : v.toLocaleString('en-IN'))

// ── 2a Master card ─────────────────────────────────────────────────────────
function PerfMaster({ data, prevData, start, end, layout }) {
  const k = data?.kpis || {}, pk = prevData?.kpis || {}
  // Daily / weekly / monthly rows are the page's own byDay / byWeek / byMonth (TATs are weighted
  // averages, so they are not re-summed here); the previous period is matched by position.
  const groupTrend = useCallback((d, gran) => {
    const pick = x => (gran === 'daily' ? x?.byDay : gran === 'weekly' ? x?.byWeek : x?.byMonth) || []
    const prev = pick(prevData)
    return pick(d).map((r, i) => ({ ...r, date: r.dt, _prev: prev[i] || null }))
  }, [prevData])
  const rtoShare = r => (r?.total ? (r.rto / r.total) * 100 : null)
  const tat = key => ({ point: r => r[key] ?? null, prevPoint: r => r._prev?.[key] ?? null, fmtPoint: v => `${(+v).toFixed(1)}d` })
  const metrics = [
    { key: 'ship', label: 'Total shipments', tileLabel: 'Shipments', value: n(k.total_shipments), delta: kpiDelta(k.total_shipments, pk.total_shipments),
      sub: `GMV ₹${fmtGMV(k.total_value)} · ${pct2(k.delivered, k.total_shipments)} delivered · ${pct2(k.rto, k.total_shipments)} RTO`,
      def: `Shipments created in the selected dates. Total attempted: ${n(k.total_ofd_attempts)} (${pct2(k.total_ofd_attempts, k.total_shipments)} of shipments).`,
      point: r => r.total, prevPoint: r => r._prev?.total ?? null, fmtPoint: n },
    { key: 'rto', label: 'RTO %', value: pct2(k.rto, k.total_shipments), delta: rtoPctDelta(k, pk), lowerIsBetter: true,
      valueColor: (k.rto / (k.total_shipments || 1)) * 100 > 15 ? M.down : undefined, sub: `${n(k.rto)} RTO shipments`,
      def: 'Returned to origin ÷ shipments. Red above 15%.', point: rtoShare, prevPoint: r => rtoShare(r._prev), fmtPoint: v => `${(+v).toFixed(1)}%` },
    { key: 'zrto', label: 'Z-RTO', value: fmtBig(k.z_rto), delta: kpiDelta(k.z_rto, pk.z_rto), lowerIsBetter: true, sub: `${pct2(k.z_rto, k.total_shipments)} of shipments`,
      def: 'Zero-attempt RTO: returned without any delivery attempt.' },
    { key: 'fasr', label: 'FASR % (of attempted)', tileLabel: 'FASR', value: pct2(k.delivered_1attempt, k.total_ofd_attempts), delta: kpiDelta(k.delivered_1attempt, pk.delivered_1attempt),
      sub: `${pct2(k.delivered_1attempt, k.total_shipments)} of shipments`, def: 'First-attempt success rate: delivered on the 1st attempt ÷ attempted. ▲/▼ as on desktop (change in first-attempt deliveries).' },
    { key: 'rasr', label: 'RASR % (of attempted)', tileLabel: 'RASR', value: pct2(k.delivered_multi, k.total_ofd_attempts), delta: kpiDelta(k.delivered_multi, pk.delivered_multi),
      sub: `${pct2(k.delivered_multi, k.total_shipments)} of shipments`, def: 'Re-attempt success rate: delivered after more than one attempt ÷ attempted.' },
    { key: 'multi', label: 'Multi-attempt deliveries', tileLabel: 'Multi-att', value: fmtBig(k.delivered_multi), delta: kpiDelta(k.delivered_multi, pk.delivered_multi),
      sub: `${pct2(k.delivered_multi, k.total_shipments)} of shipments`, def: 'Shipments delivered after more than one attempt.' },
    { key: 'proc', label: 'Avg processing', tileLabel: 'Processing', value: d1(k.avg_processing), delta: kpiDelta(k.avg_processing, pk.avg_processing), lowerIsBetter: true, sub: 'Order date → shipment creation', def: 'Average days from order date to shipment creation.', ...tat('avg_processing_days') },
    { key: 'pick', label: 'Avg pickup TAT', tileLabel: 'Pickup', value: d1(k.avg_pickup), delta: kpiDelta(k.avg_pickup, pk.avg_pickup), lowerIsBetter: true, sub: 'Shipment creation → pickup', def: 'Average days from shipment creation to pickup.', ...tat('avg_pickup_days') },
    { key: 'transit', label: 'Avg in-transit', tileLabel: 'In-transit', value: d1(k.avg_intransit), delta: kpiDelta(k.avg_intransit, pk.avg_intransit), lowerIsBetter: true, sub: 'Shipment pickup → delivery', def: 'Average days from pickup to delivery.', ...tat('avg_intransit_days') },
    { key: 'fulfil', label: 'Avg fulfilment', tileLabel: 'Fulfilment', value: d1(k.avg_fulfilment), delta: kpiDelta(k.avg_fulfilment, pk.avg_fulfilment), lowerIsBetter: true, sub: 'Order date → delivery date', def: 'Average days from order date to delivery.', ...tat('avg_fulfilment_days') },
  ]
  return <MasterTrendCard metrics={metrics} rawRows={data} groupTrend={groupTrend} start={start} end={end} layout={layout} />
}

// ── 2b Courier scorecard ───────────────────────────────────────────────────
const TIERS = [{ id: 'Tier 1', label: 'Tier I' }, { id: 'Tier 2', label: 'Tier II' }, { id: 'Tier 3', label: 'Tier III' }]
const DEFAULT_SORT = { courier: { col: 'total', dir: 'desc' }, zone: { col: '_name', dir: 'asc' }, facility: { col: 'total', dir: 'desc' }, month: { col: '_name', dir: 'asc' } }
const toneColor = t => (t === 'bad' ? M.down : t === 'watch' ? M.amber : t === 'good' ? M.up : undefined)

function Scorecard({ data, breakdownSrc, lFilters, sc }) {
  const { cSelected, setCSelected, setCPrimary, cView, cDrill, cTier, setCTier, cPayment, setCPayment } = sc
  const [sheet, setSheet] = useState(null) // 'view' | 'filter' | 'sort' | { row }
  const [sorts, setSorts] = useState(DEFAULT_SORT)
  const [open, setOpen] = useState({})
  const [draft, setDraft] = useState({ tier: null, pay: null })
  const sort = sorts[cView] || DEFAULT_SORT.courier
  const cols = scoreCols(cView)
  const { rows, avgRtoPct } = useMemo(() => scoreRows(cView, data, breakdownSrc), [cView, data, breakdownSrc])
  const sorted = useMemo(() => {
    const c = sort.col
    return [...rows].sort((a, b) => {
      const av = a[c], bv = b[c]
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string') return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sort.dir === 'asc' ? av - bv : bv - av
    })
  }, [rows, sort])
  const sortCol = cols.find(c => c.key === sort.col) || cols.find(c => c.key === 'total')
  const maxVal = Math.max(...sorted.map(r => +r[sortCol.key] || 0), 0) || 1
  const hasActiveFilter = lFilters.couriers?.length > 0 || lFilters.category?.length > 0 || lFilters.subCategory?.length > 0
  const sidebarHasPayment = lFilters.paymentMode?.length > 0
  const viewLabel = id => SCORE_VIEWS.find(v => v.id === id)?.label
  const showing = [cTier && TIERS.find(t => t.id === cTier)?.label, cPayment].filter(Boolean).join(' · ')
  const rtoTone = (r, isDrill) => (cView === 'courier' ? (r._rtoPct > avgRtoPct ? 'bad' : null) : cView === 'month' && !isDrill ? monthTone('_rtoPct', r._rtoPct) : null)

  // Same selection rule as the desktop view toggles: max 2 in order; the first stays primary.
  const toggleView = vl => {
    const isDisabled = hasActiveFilter && vl !== 'courier'
    const active = cSelected.has(vl)
    if (isDisabled || (active && cSelected.size === 1)) return
    setCSelected(prev => {
      const next = new Set(prev)
      if (next.has(vl)) { next.delete(vl); setCPrimary(p => (p === vl ? (['courier', 'zone', 'facility', 'month'].find(x => next.has(x)) || vl) : p)) }
      else { if (next.size >= 2) next.forEach(x => { if (x !== cView) next.delete(x) }); next.add(vl) }
      return next
    })
    setOpen({})
  }
  const rowSub = (r, isDrill) => {
    const tone = rtoTone(r, isDrill)
    return <>{n(r.total)} · del {r._delPct.toFixed(2)}% · RTO <span style={{ color: toneColor(tone) }}>{r._rtoPct.toFixed(2)}%</span></>
  }
  const leaf = (r, isDrill, onClick) => (
    <button type="button" onClick={onClick} className="score-row"
      style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: isDrill ? '8px 0 8px 18px' : '10px 0', borderTop: `1px solid ${M.line}`, fontFamily: 'var(--font)', color: M.ink, cursor: 'pointer' }}>
      <span style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', columnGap: 10, alignItems: 'baseline' }}>
        <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
          {!isDrill && cDrill && <span aria-hidden="true" style={{ fontSize: 10, color: M.muted, transform: open[r._key] ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>}
          {!isDrill && cView === 'courier' && COURIER_LOGOS[r.courier_group] && <img src={COURIER_LOGOS[r.courier_group]} alt="" style={{ width: 18, height: 18, objectFit: 'contain', borderRadius: 4, flexShrink: 0 }} />}
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: isDrill ? 13 : M.type.listValue, fontWeight: isDrill ? 500 : 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r._name}</span>
            <span style={{ display: 'block', fontSize: 12, color: M.muted, fontVariantNumeric: 'tabular-nums' }}>{rowSub(r, isDrill)}</span>
          </span>
        </span>
        <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          <b style={{ display: 'block', fontSize: M.type.listValue, color: cView === 'month' && !isDrill ? toneColor(monthTone(sortCol.key, r[sortCol.key])) : undefined }}>{fmtCol(sortCol, r[sortCol.key])}</b>
          <span style={{ fontSize: 12, color: M.muted }}>{sortCol.label}</span>
        </span>
      </span>
      {!isDrill && <span aria-hidden="true" style={{ display: 'block', height: 3, marginTop: 6, borderRadius: 2, background: M.line }}><i style={{ display: 'block', height: '100%', width: `${Math.max(1, ((+r[sortCol.key] || 0) / maxVal) * 100)}%`, background: M.green, borderRadius: 2 }} /></span>}
    </button>
  )
  const detail = sheet && typeof sheet === 'object' ? sheet.row : null
  return (
    <Card title="Courier scorecard" id="log-scorecard">
      <SegmentedToolbar segments={[
        { id: 'view', icon: 'layers', label: 'View by', value: `${viewLabel(cView)}${cDrill ? ` › ${viewLabel(cDrill)}` : ''}`, active: cView !== 'courier' || !!cDrill, onClick: () => setSheet('view') },
        { id: 'filter', icon: 'funnel', label: 'Filter', value: 'All', badge: (cTier ? 1 : 0) + (cPayment ? 1 : 0) || null, active: !!(cTier || cPayment), onClick: () => { setDraft({ tier: cTier, pay: cPayment }); setSheet('filter') } },
        { id: 'sort', icon: 'sort', label: 'Sort by', value: sort.col === '_name' ? 'Name' : sortCol.label, active: JSON.stringify(sort) !== JSON.stringify(DEFAULT_SORT[cView]), onClick: () => setSheet('sort') },
      ]} />
      {showing && <div style={{ fontSize: 12, color: M.muted, marginTop: 6 }}>Showing {showing}</div>}
      <div style={{ marginTop: 6 }}>
        {!sorted.length && <div style={{ padding: '12px 0', fontSize: 13, color: M.muted }}>No data for this view.</div>}
        {sorted.map(r => (
          <div key={r._key}>
            {leaf(r, false, () => (cDrill ? setOpen(o => ({ ...o, [r._key]: !o[r._key] })) : setSheet({ row: r })))}
            {cDrill && open[r._key] && (
              <>
                {drillRows(cView, cDrill, r, breakdownSrc).map(z => <div key={z._name}>{leaf(z, true, () => setSheet({ row: z, drill: true }))}</div>)}
                <button type="button" onClick={() => setSheet({ row: r })} style={{ display: 'block', margin: '4px 0 8px 18px', border: 'none', background: 'none', color: M.green, fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer', padding: '6px 0' }}>All columns for {r._name} →</button>
              </>
            )}
          </div>
        ))}
      </div>

      <BottomSheet open={sheet === 'view'} onClose={() => setSheet(null)} title="View by" subtitle="Pick up to 2, in order: the 2nd nests under the 1st">
        {SCORE_VIEWS.map(v => {
          const on = cSelected.has(v.id), order = v.id === cView ? 1 : v.id === cDrill ? 2 : null
          const disabled = hasActiveFilter && v.id !== 'courier'
          return (
            <button key={v.id} type="button" disabled={disabled} onClick={() => toggleView(v.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 48, border: 'none', borderTop: `1px solid ${M.line}`, background: 'transparent', fontFamily: 'var(--font)', fontSize: 14, color: disabled ? '#b9bfbb' : M.ink, cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left' }}>
              <span style={{ width: 22, height: 22, borderRadius: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: on ? M.green : 'transparent', color: '#fff', border: on ? 'none' : `1.5px solid ${M.g4}` }}>{order || ''}</span>
              <span style={{ fontWeight: on ? 700 : 500 }}>{v.label}</span>
              {disabled && <span style={{ marginLeft: 'auto', fontSize: 12, color: M.muted }}>clear courier / category filters</span>}
            </button>
          )
        })}
      </BottomSheet>

      <BottomSheet open={sheet === 'filter'} onClose={() => setSheet(null)} title="Show">
        {[{ title: 'City tier', key: 'tier', opts: TIERS }, ...(sidebarHasPayment ? [] : [{ title: 'Payment mode', key: 'pay', opts: [{ id: 'COD', label: 'COD' }, { id: 'Prepaid', label: 'Prepaid' }] }])].map(g => (
          <div key={g.key} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: M.muted, margin: '4px 0 6px' }}>{g.title}</div>
            {g.opts.map(o => (
              <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, borderTop: `1px solid ${M.line}`, fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={draft[g.key] === o.id} onChange={() => setDraft(d => ({ ...d, [g.key]: d[g.key] === o.id ? null : o.id }))} style={{ width: 18, height: 18, accentColor: M.green }} />
                {o.label}
              </label>
            ))}
          </div>
        ))}
        <div style={{ fontSize: 12, color: M.muted, margin: '2px 0 10px' }}>One choice per group, as on desktop.</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={() => setDraft({ tier: null, pay: null })} style={{ flex: 1, minHeight: 46, borderRadius: 12, border: `1px solid ${M.line}`, background: '#fff', color: M.ink, fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' }}>Clear</button>
          <button type="button" onClick={() => { setCTier(draft.tier); if (!sidebarHasPayment) setCPayment(draft.pay); setSheet(null) }}
            style={{ flex: 2, minHeight: 46, borderRadius: 12, border: 'none', background: M.green, color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font)', cursor: 'pointer' }}>Apply{(draft.tier ? 1 : 0) + (draft.pay ? 1 : 0) ? ` (${(draft.tier ? 1 : 0) + (draft.pay ? 1 : 0)})` : ''}</button>
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'sort'} onClose={() => setSheet(null)} title="Sort by">
        {[{ key: '_name', label: cView === 'month' ? 'Month' : viewLabel(cView) }, ...cols].map(c => {
          const on = sort.col === c.key
          return (
            <button key={c.key} type="button" onClick={() => { setSorts(s => ({ ...s, [cView]: { col: c.key, dir: on ? (sort.dir === 'desc' ? 'asc' : 'desc') : c.key === '_name' ? 'asc' : 'desc' } })); setSheet(null) }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 46, border: 'none', borderTop: `1px solid ${M.line}`, background: 'transparent', fontFamily: 'var(--font)', fontSize: 14, color: M.ink, cursor: 'pointer' }}>
              <span style={{ fontWeight: on ? 700 : 500 }}>{c.label}</span>{on && <span style={{ color: M.green, fontWeight: 700 }}>{sort.dir === 'desc' ? '↓ high first' : '↑ low first'}</span>}
            </button>
          )
        })}
      </BottomSheet>

      <BottomSheet open={!!detail} onClose={() => setSheet(null)} title={detail?._name || ''} subtitle={sheet?.drill ? `${viewLabel(cDrill)} under ${viewLabel(cView)} · Vol % of the parent row` : viewLabel(cView)}>
        {detail && <KV items={cols.map(c => ({ label: c.label, value: fmtCol(c, detail[c.key]), color: c.key === '_rtoPct' ? toneColor(rtoTone(detail, !!sheet.drill)) : cView === 'month' && !sheet.drill ? toneColor(monthTone(c.key, detail[c.key])) : undefined }))} />}
      </BottomSheet>
    </Card>
  )
}

// ── 2c Speed (TAT buckets) ─────────────────────────────────────────────────
function SpeedCard({ data }) {
  const [view, setView] = useState('processing')
  const [pick, setPick] = useState(null)
  const v = TAT_VIEWS.find(x => x.id === view)
  const t = useMemo(() => tatTable(view, data), [view, data])
  const row = (r, soft) => <StackedBucketRow key={r.name} name={r.name} soft={soft} right={r.pcts[0] == null ? '—' : `${r.pcts[0]}%`} rightSub={`within ${v.buckets[0]}`} pcts={r.pcts} labels={v.buckets} flags={r.flags} onClick={() => setPick(r)} />
  return (
    <Card title="Speed (TAT buckets)">
      <SegmentToggle full label="Stage" options={TAT_VIEWS.map(x => ({ id: x.id, label: x.label }))} value={view} onChange={setView} />
      <div style={{ fontSize: 12, color: M.muted, margin: '8px 0' }}>{v.def}</div>
      {row(t.total, true)}
      {t.rows.map(r => row(r, false))}
      <BottomSheet open={!!pick} onClose={() => setPick(null)} title={pick?.name || ''} subtitle={`${v.label} · ${v.def}`}>
        {pick && <KV items={v.buckets.map((b, i) => ({ label: b, value: pick.pcts[i] == null ? '—' : `${pick.pcts[i]}%`, color: pick.flags[i] ? M.down : undefined }))} />}
      </BottomSheet>
    </Card>
  )
}

// ── 2d By weight ───────────────────────────────────────────────────────────
function WeightCard({ data }) {
  const [metric, setMetric] = useState('qty')
  const [pick, setPick] = useState(null)
  const rows = useMemo(() => weightRows(data, metric), [data, metric])
  const max = rows[0]?.value || 1
  return (
    <Card title="By weight" right={<SegmentToggle label="Measure" options={[{ id: 'qty', label: 'Qty' }, { id: 'value', label: 'Value' }]} value={metric} onChange={setMetric} />}>
      {rows.map((r, i) => <CompactRankRow key={r.slab} name={r.slab} value={metric === 'qty' ? n(r.value) : fmtSlabValue(r.value)} pct={`${r.pct}%`} barPct={(r.value / max) * 100} last={i === rows.length - 1} onClick={() => setPick(r)} />)}
      <BottomSheet open={!!pick} onClose={() => setPick(null)} title={pick?.slab || ''} subtitle="Delivery performance by weight slab">
        {pick && <KV items={[{ label: 'Shipments', value: n(pick.total) }, { label: 'Value', value: fmtSlabValue(pick.total_value || 0) }, { label: 'In-transit TAT', value: pick.avg_tat != null ? `${pick.avg_tat}d` : '—' }, { label: 'RTO %', value: pick.rto_pct != null ? `${pick.rto_pct}%` : '—' }]} />}
      </BottomSheet>
    </Card>
  )
}

// ── 2e Geography ───────────────────────────────────────────────────────────
function GeoCard({ data }) {
  const [view, setView] = useState('dropCity')
  const [all, setAll] = useState(false)
  const rows = useMemo(() => geoRows(data, view), [data, view])
  const shown = all ? rows : rows.slice(0, 7)
  const max = rows[0]?.total || 1
  return (
    <Card title="Geography">
      <SegmentToggle full label="Geography" options={GEO_VIEWS.map(g => ({ id: g.id, label: g.label }))} value={view} onChange={v => { setView(v); setAll(false) }} />
      <div style={{ marginTop: 6 }}>
        {shown.map((r, i) => <CompactRankRow key={r.name} name={r.name} value={n(r.total)} pct={`${r.pct}%`} barPct={(r.total / max) * 100} last={i === shown.length - 1} />)}
      </div>
      {rows.length > 7 && <ShowAllButton onClick={() => setAll(a => !a)}>{all ? 'Show fewer' : `Show all ${rows.length}`}</ShowAllButton>}
    </Card>
  )
}

// ── 2f RTO shipment analysis ───────────────────────────────────────────────
const RTO_MODES = [{ id: 'ageing', label: 'RTO ageing' }, { id: 'delivery', label: 'Delivery ageing' }, { id: 'reasons', label: 'Reasons' }]
const BASES = [{ id: 'order', label: 'Order creation' }, { id: 'shipment', label: 'Shipment creation' }, { id: 'pickup', label: 'Pickup date' }]
const BUCKET_LABELS = ['0–1d', '2–4d', '5–7d', '8–10d', '10+d']
function RtoCard({ data, kpis, base, setBase }) {
  const [mode, setMode] = useState('ageing')
  const [pick, setPick] = useState(null)
  const [allReasons, setAllReasons] = useState(false)
  const baseLabel = BASES.find(b => b.id === base)?.label.toLowerCase()
  const desc = mode === 'ageing' ? `RTO ageing · ${baseLabel} → RTO mark date` : mode === 'delivery' ? 'RTO delivery ageing · RTO mark date → delivered back' : 'RTO reasons · shipment count & % of total RTO'
  const ageing = useMemo(() => (mode === 'reasons' ? null : rtoAgeingRows(data, mode, base)), [data, mode, base])
  const reasons = useMemo(() => (mode === 'reasons' ? rtoReasonRows(data) : []), [data, mode])
  const share8 = r => (r.total ? `${(((r.counts[3] + r.counts[4]) / r.total) * 100).toFixed(1)}%` : '—')
  const menu = mode === 'ageing' ? BASES.map(b => ({ id: b.id, label: `${b.id === base ? '✓ ' : ''}${b.label}`, group: 'Ageing from', onSelect: () => setBase(b.id) })) : []
  const shownReasons = allReasons ? reasons : reasons.slice(0, 8)
  const maxReason = reasons[0]?.total || 1
  return (
    <Card title="RTO shipment analysis" right={<ActionMenu items={menu} tone="light" title="RTO ageing basis" label="Ageing basis" />}>
      <SegmentToggle full label="RTO view" options={RTO_MODES} value={mode} onChange={setMode} />
      <div style={{ fontSize: 12, color: M.muted, margin: '8px 0 4px' }}><b style={{ color: M.ink, fontWeight: 600 }}>{desc.split(' · ')[0]}</b> · {desc.split(' · ')[1]}</div>
      {ageing && (
        <>
          <div aria-hidden="true" style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 12, color: M.muted, margin: '2px 0 8px' }}>
            {BUCKET_LABELS.map((l, i) => <span key={l}><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, marginRight: 4, background: ['#1f5a3d', '#5f8f75', '#9cc4ad', '#d5dbd7', '#eeebe4'][i] }} />{l}</span>)}
          </div>
          <StackedBucketRow soft name="Total" sub={`${n(ageing.total.total)} RTO${mode === 'ageing' ? ` · avg RTO TAT ${d1(kpis.avg_rto_tat)}` : ''}`} right={share8(ageing.total)} rightSub="8d+" pcts={ageing.total.pcts} onClick={() => setPick(ageing.total)} />
          {ageing.rows.map(r => <StackedBucketRow key={r.name} name={r.name} sub={`${n(r.total)} RTO`} right={share8(r)} rightSub="8d+" pcts={r.pcts} onClick={() => setPick(r)} />)}
        </>
      )}
      {mode === 'reasons' && (
        <>
          {shownReasons.map((r, i) => <CompactRankRow key={r.name} name={r.name} value={`${r.pct}%`} barPct={(r.total / maxReason) * 100} last={i === shownReasons.length - 1} onClick={() => setPick({ reason: r })} />)}
          {reasons.length > 8 && <ShowAllButton onClick={() => setAllReasons(a => !a)}>{allReasons ? 'Show fewer' : `Show all ${reasons.length}`}</ShowAllButton>}
        </>
      )}
      <BottomSheet open={!!pick} onClose={() => setPick(null)} title={pick?.reason ? pick.reason.name : pick?.name || ''} subtitle={pick?.reason ? 'RTO reason' : desc}>
        {pick?.reason && <KV items={[{ label: 'Shipments', value: n(pick.reason.total) }, { label: '% of total RTO', value: `${pick.reason.pct}%` }]} />}
        {pick && !pick.reason && <KV items={[{ label: mode === 'delivery' ? 'Delivered back' : 'Total RTO', value: n(pick.total) }, ...BUCKET_LABELS.map((l, i) => ({ label: l, value: pick.pcts[i] == null ? '—' : `${pick.pcts[i]}%` }))]} />}
      </BottomSheet>
    </Card>
  )
}

// ── 2g NDR ─────────────────────────────────────────────────────────────────
function NdrCard({ data, pay, setPay }) {
  const [pick, setPick] = useState(null)
  const { rows, total } = useMemo(() => ndrTable(data, pay), [data, pay])
  if (!(data?.ndrByCourier || []).length) return null
  const cell = (label, value, color) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em', color: M.muted }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || M.ink, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
  return (
    <Card title="NDR" right={<SegmentToggle label="Payment" options={[{ id: 'All', label: 'All' }, { id: 'COD', label: 'COD' }, { id: 'PREPAID', label: 'Prepaid' }]} value={pay} onChange={setPay} />}>
      <div style={{ background: M.soft, borderRadius: 12, padding: '10px 12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
          {cell('NDR %', ndrPct(total.ndr_count, total.total_shipments))}
          {cell('→ Delivered', ndrPct(total.ndr_del, total.ndr_count), M.up)}
          {cell('→ RTO', ndrPct(total.ndr_rto, total.ndr_count), M.down)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, borderTop: `1px solid ${M.line}`, marginTop: 8, paddingTop: 7, fontSize: 12, color: M.muted }}>
          <span>All couriers · {n(total.ndr_count)} NDR</span><span>avg {total.avg_att ?? '—'} attempts</span>
        </div>
      </div>
      <div style={{ marginTop: 4 }}>
        {rows.map(r => (
          <button key={r.courier} type="button" onClick={() => setPick(r)} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', columnGap: 10, width: '100%', textAlign: 'left', border: 'none', borderTop: `1px solid ${M.line}`, background: 'transparent', padding: '10px 0', fontFamily: 'var(--font)', color: M.ink, cursor: 'pointer' }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: M.type.listValue, fontWeight: 700 }}>{r.courier}</span>
              <span style={{ display: 'block', fontSize: 12, color: M.muted, fontVariantNumeric: 'tabular-nums' }}>{n(r.ndr_count)} NDR · → del {ndrPct(r.ndr_del, r.ndr_count)} · → RTO {ndrPct(r.ndr_rto, r.ndr_count)}</span>
            </span>
            <span style={{ textAlign: 'right' }}><b style={{ display: 'block', fontSize: M.type.listValue }}>{ndrPct(r.ndr_count, r.total_shipments)}</b><span style={{ fontSize: 12, color: M.muted }}>NDR</span></span>
          </button>
        ))}
      </div>
      <BottomSheet open={!!pick} onClose={() => setPick(null)} title={pick?.courier || ''} subtitle={`NDR · ${pay === 'PREPAID' ? 'Prepaid' : pay}`}>
        {pick && <KV items={[
          { label: 'Total shipments', value: n(pick.total_shipments) }, { label: 'NDR count', value: n(pick.ndr_count) },
          { label: 'NDR %', value: ndrPct(pick.ndr_count, pick.total_shipments) }, { label: '→ Delivered %', value: ndrPct(pick.ndr_del, pick.ndr_count) },
          { label: '→ RTO %', value: ndrPct(pick.ndr_rto, pick.ndr_count) }, { label: 'Del 2nd att', value: n(pick.del_att2) },
          { label: 'Del 3rd att', value: n(pick.del_att3) }, { label: 'Del 3+ att', value: n(pick.del_att3plus) },
          { label: 'Avg att', value: pick.avg_att ?? '—' }, { label: 'Avg S2D', value: pick.avg_intransit_days != null ? `${pick.avg_intransit_days}d` : '—' },
          { label: 'Avg O2D', value: pick.avg_o2d != null ? `${pick.avg_o2d}d` : '—' },
        ]} />}
      </BottomSheet>
    </Card>
  )
}

export default function PerfMobile({ data, prevData, breakdownSrc, filters, lFilters, sc, rtoAgeingBase, setRtoAgeingBase, ndrPayFilter, setNdrPayFilter }) {
  const bp = useBreakpoint()
  const layout = bp.isPhoneLandscape ? 'landscape' : bp.width >= 768 ? 'tablet' : 'phone'
  return (
    <div className="log-mobile ov-mobile" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, flex: 1, background: M.bg, color: M.ink, padding: '12px max(12px, var(--safe-right)) 24px max(12px, var(--safe-left))' }}>
      <PerfMaster data={data} prevData={prevData} start={filters.start} end={filters.end} layout={layout} />
      <Scorecard data={data} breakdownSrc={breakdownSrc} lFilters={lFilters} sc={sc} />
      <SpeedCard data={data} />
      <WeightCard data={data} />
      <GeoCard data={data} />
      <RtoCard data={data} kpis={data?.kpis || {}} base={rtoAgeingBase} setBase={setRtoAgeingBase} />
      <NdrCard data={data} pay={ndrPayFilter} setPay={setNdrPayFilter} />
    </div>
  )
}
