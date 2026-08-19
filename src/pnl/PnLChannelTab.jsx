import { useState, useRef, useEffect } from 'react'
import { C, fmt, fmtN, pct } from '../utils.js'
import { KPICard, Card, GROUP_OPTS, getGroupKey, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from '../components.jsx'
import PnLFinancialTable from './PnLFinancialTable.jsx'

// Metric registry for the trend chart's slicer — order here is the canonical order everywhere
// (legend, tooltip, checklist) so it always matches PnLFinancialTable.jsx's column order
// (Gross(Inc) → Gross(Ex) → Units → Returns% → COGS% → GM% → SnD% → CM1% → CM2%). `axis: 'rev'`
// (₹, left axis) / `'units'` (right axis) / `'pct'` (%, hidden right axis) groups lines with
// compatible scales — a %-metric plotted against a ₹-axis would look flat/invisible next to
// crore-sized numbers, so each axis only ever holds metrics of the same kind.
const TREND_METRICS = [
  { key: 'rev', label: 'Gross Revenue', axis: 'rev', color: null, isArea: true }, // color resolved to grossColor at render time
  { key: 'excRev', label: 'Net Revenue', axis: 'rev', color: '#0D9E68', isArea: true, dash: '4 2' },
  { key: 'units', label: 'Units', axis: 'units', color: '#2E74CC' },
  { key: 'returnPct', label: 'Returns %', axis: 'pct', color: '#B91C1C' },
  { key: 'cogsPct', label: 'COGS %', axis: 'pct', color: '#8B5E3C', dash: '5 2' },
  { key: 'gmPct', label: 'GM %', axis: 'pct', color: '#0D9E68', dash: '4 2' },
  { key: 'sndPct', label: 'SnD %', axis: 'pct', color: '#E8930A' },
  { key: 'cm1Pct', label: 'CM1 %', axis: 'pct', color: '#9B56B6', dash: '2 2' },
  { key: 'cm2Pct', label: 'CM2 %', axis: 'pct', color: '#CC4078', dash: '6 2' },
]
const DEFAULT_METRIC_KEYS = ['rev', 'excRev', 'units', 'sndPct', 'gmPct', 'cm1Pct', 'cm2Pct']

// Compact multi-select checklist dropdown — click to open, click outside to close, checkboxes
// toggle individual metrics. Kept local to this file since it's PnL-trend-specific (metric
// labels/keys), not a generic reusable dropdown the rest of the app would want.
function MetricPicker({ options, selected, onToggle, onSelectAll, onClearAll }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const onClick = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])
  const btnStyle = { fontSize: 11, padding: '3px 10px', borderRadius: 6, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, outline: 'none', fontFamily: 'var(--font)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }
  const allSelected = options.length > 0 && options.every(m => selected.includes(m.key))
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button style={btnStyle} onClick={() => setOpen(o => !o)}>
        Metrics ({selected.length}) <span style={{ fontSize: 9, color: C.t3 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,.12)', padding: 6, zIndex: 20, minWidth: 150 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 7px', borderRadius: 5, fontSize: 12, fontWeight: 600, color: C.t1, cursor: 'pointer', userSelect: 'none', borderBottom: `1px solid ${C.border}`, marginBottom: 3 }}
            onMouseEnter={e => e.currentTarget.style.background = C.bg} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <input type="checkbox" checked={allSelected} onChange={() => (allSelected ? onClearAll() : onSelectAll())} style={{ accentColor: '#FFD600', cursor: 'pointer' }} />
            Select All
          </label>
          {options.map(m => (
            <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 7px', borderRadius: 5, fontSize: 12, color: C.t1, cursor: 'pointer', userSelect: 'none' }}
              onMouseEnter={e => e.currentTarget.style.background = C.bg} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <input type="checkbox" checked={selected.includes(m.key)} onChange={() => onToggle(m.key)} style={{ accentColor: '#FFD600', cursor: 'pointer' }} />
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color || '#FFD600', flexShrink: 0 }} />
              {m.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// Trend chart for PnL only — same Gross/Net/Units base as the shared TrendAnalysisCard
// (deliberately NOT extending that component: it's shared with the Sales tab, and adding %-based
// margin lines there would risk changing Sales tab charts too) plus a metric slicer letting the
// user pick any combination of Gross/Net/Returns%/COGS%/GM%/SnD%/CM1%/CM2%/Units to plot, auto-
// split across ₹/units/% axes by metric type. dailyPnL (day-wise settlement/margin-slab
// attribution — see amzSC.dailyPnLBySku / amzVCMatrix.dailyPnLBySku in api/bq.js) supplies the
// %-based metrics; only Amazon populates it today, so the %-metric checkboxes are simply absent
// (not shown, not just disabled) for any channel without it — nothing to slice that doesn't exist.
function PnLTrendCard({ title, daily, dailyPnL, grossColor, grossGradId, boxHeight, showMarketing = true, hideUnits = false }) {
  const nDays = daily.length
  const autoGroup = nDays <= 14 ? 'daily' : nDays <= 90 ? 'weekly' : 'monthly'
  const [groupBy, setGroupBy] = useState(autoGroup)
  // CM2% depends on marketing spend, which is only mapped on the combined "All" SC+VC view (see
  // showMarketing's own gating everywhere else — KPI cards, Financial View table) — Seller
  // Central/Vendor Central individually never have a real CM2, so it's excluded from the slicer
  // entirely there rather than showing an option that would always plot as empty.
  // hideUnits: Amazon's All/SC/VC views don't want a Units line on this chart at all (confirmed
  // with the user) — removed from the picker entirely, not just unchecked by default.
  const availableMetrics = TREND_METRICS.filter(m => (m.axis !== 'pct' || (dailyPnL && dailyPnL.length > 0)) && (m.key !== 'cm2Pct' || showMarketing) && (m.key !== 'units' || !hideUnits))
  const [selectedKeys, setSelectedKeys] = useState(() => DEFAULT_METRIC_KEYS.filter(k => availableMetrics.some(m => m.key === k)))
  // PnLTrendCard stays mounted across the All/SC/VC toggle (same component instance, only props
  // change) — availableMetrics narrows when switching to SC/VC (CM2% drops out), so any
  // previously-selected key that's no longer valid must be dropped too, or it'd keep plotting a
  // "ghost" line/legend entry that isn't even in the dropdown anymore.
  useEffect(() => {
    setSelectedKeys(prev => prev.filter(k => availableMetrics.some(m => m.key === k)))
  }, [showMarketing, !!dailyPnL, hideUnits])
  const toggleMetric = key => setSelectedKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  const selectAllMetrics = () => setSelectedKeys(availableMetrics.map(m => m.key))
  const clearAllMetrics = () => setSelectedKeys([])
  const selStyle = { fontSize: 11, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, outline: 'none', fontFamily: 'var(--font)', cursor: 'pointer' }

  const pnlByDate = {}
  ;(dailyPnL || []).forEach(d => { pnlByDate[d.date] = d })
  const merged = daily.map(d => ({ ...d, ...(pnlByDate[d.date] || {}) }))

  const PCT_KEYS = ['returnPct', 'cogsPct', 'gmPct', 'sndPct', 'cm1Pct', 'cm2Pct']
  const grouped = (() => {
    if (groupBy === 'daily') return merged
    // Grouping %-based metrics by simple averaging across the days in each bucket — a weighted-
    // by-net average would be more precise, but daily granularity (the default for any range
    // under 2 weeks) already covers the common case exactly.
    const agg = {}
    const counts = {}
    merged.forEach(d => {
      const k = getGroupKey(d.date, groupBy)
      if (!agg[k]) {
        agg[k] = { date: k, rev: 0, excRev: 0, units: 0 }
        PCT_KEYS.forEach(pk => { agg[k][pk] = 0 })
        counts[k] = {}
        PCT_KEYS.forEach(pk => { counts[k][pk] = 0 })
      }
      agg[k].rev += d.rev || 0
      agg[k].excRev += d.excRev || 0
      agg[k].units += d.units || 0
      PCT_KEYS.forEach(pk => { if (d[pk] != null) { agg[k][pk] += d[pk]; counts[k][pk]++ } })
    })
    return Object.entries(agg).map(([k, v]) => {
      const out = { ...v }
      PCT_KEYS.forEach(pk => { out[pk] = counts[k][pk] > 0 ? v[pk] / counts[k][pk] : null })
      return out
    })
  })()

  const fmtTick = v => v >= 1e5 ? `${(v/1e5).toFixed(1)}L` : v >= 1e3 ? `${(v/1e3).toFixed(0)}k` : String(v)
  const gradId = grossGradId || 'trendGrossGrad'
  const selectedMetrics = TREND_METRICS.filter(m => selectedKeys.includes(m.key))
  const hasAxis = axis => selectedMetrics.some(m => m.axis === axis)

  return (
    <Card fill title={title} style={boxHeight ? { height: boxHeight, width: '100%' } : undefined} action={
      <div style={{ display: 'flex', gap: 6 }}>
        <MetricPicker options={availableMetrics} selected={selectedKeys} onToggle={toggleMetric} onSelectAll={selectAllMetrics} onClearAll={clearAllMetrics} />
        <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={selStyle}>
          {GROUP_OPTS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </div>
    }>
      {selectedMetrics.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.t3, fontSize: 12 }}>Select at least one metric to plot</div>
      ) : (
      <ResponsiveContainer width="100%" height="100%" minHeight={220}>
        <ComposedChart data={grouped} margin={{ top: 4, right: 40, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={grossColor} stopOpacity={0.2} /><stop offset="95%" stopColor={grossColor} stopOpacity={0} /></linearGradient>
            <linearGradient id={gradId + '_net'} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0D9E68" stopOpacity={0.1} /><stop offset="95%" stopColor="#0D9E68" stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={d => d?.slice(5)} />
          {hasAxis('rev') && <YAxis yAxisId="rev" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={fmtTick} width={55} />}
          {hasAxis('units') && <YAxis yAxisId="units" orientation="right" tick={{ fontSize: 10, fill: '#2E74CC' }} tickFormatter={v => fmtN(v)} width={36} />}
          {hasAxis('pct') && <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10, fill: '#9B56B6' }} tickFormatter={v => `${v.toFixed(0)}%`} width={40} hide={hasAxis('units')} />}
          <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 11px', fontSize: 11 }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: C.t2 }}>{label?.slice(5) || label}</div>
              {payload.map(p => (
                <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ color: C.t2 }}>{p.name}: {p.name === 'Units' ? fmtN(p.value) : p.name.endsWith('%') ? (p.value != null ? `${p.value.toFixed(1)}%` : '—') : fmt(p.value)}</span>
                </div>
              ))}
            </div>
          ) : null} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {/* Rendered in TREND_METRICS' fixed order (matches PnLFinancialTable.jsx's column
              order) regardless of the order metrics were checked, so the tooltip/legend order
              never depends on click sequence. */}
          {selectedMetrics.map(m => m.isArea ? (
            <Area key={m.key} yAxisId={m.axis} type="monotone" dataKey={m.key} name={m.label}
              stroke={m.color || grossColor} fill={`url(#${m.key === 'rev' ? gradId : gradId + '_net'})`}
              strokeWidth={2} dot={false} strokeDasharray={m.dash} />
          ) : (
            <Line key={m.key} yAxisId={m.axis} type="monotone" dataKey={m.key} name={m.label}
              stroke={m.color} strokeWidth={2} dot={false} strokeDasharray={m.dash} connectNulls />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      )}
    </Card>
  )
}

// One channel's PnL subtab: KPI row → Trend chart → Financial View table. Same layout order
// the user asked for ("firstly the KPIs then trend then financial view table"), same visual
// chrome as the Sales tab (KPICard, TrendAnalysisCard, C palette) so PnL reads as part of the
// same product, not a bolted-on new design.
// kpiSummary: optional {net, cogs, gm, snd, cm1, spend, cm2, roas, cogsPct, gmPct, sndPct,
// cm1Pct, spendPct, cm2Pct} — whole-range ₹ amounts + %-of-Net-Revenue (same numbers the
// Financial View table's Total row computes), surfaced as KPI cards. Only Amazon populates this
// today (Seller Central, Vendor Central, and the combined "All" view). Two tiers: any channel
// with kpiSummary gets the 7-card P&L walkthrough (Gross → Net → Returns → COGS → GM → SnD →
// CM1); showMarketing (true only on the combined "All" SC+VC view, since marketing spend is only
// mapped there) additionally appends Mktg Spend/ROAS/CM2 — Seller Central/Vendor Central
// individually stop at CM1, per the same channel-scoping the Financial View table already uses.
// Every other (non-Amazon) channel has no kpiSummary at all and falls through to the original
// simpler 5-card row (Gross/Net/Returns/Orders/AOV-ASP), unchanged.
// dailyPnL: optional day-wise series (see api/bq.js amzSC.dailyPnLBySku/amzVCMatrix.dailyPnLBySku)
// that adds SnD%/GM%/CM1% lines to the trend chart — both currently only populated for Amazon.
export default function PnLChannelTab({ title, note, gross, excRev, net, units, orders, returnRev, subCatData, skuData, adSpendMap, sndBySku, daily, dailyPnL, kpiSummary, grossOfTotalPct, grossColor = '#FFD600', gradId = 'pnlGrossGrad', showMarketing = true, noReturnAccent = false, includeUnmatched = false, mobilityNetBySubCat = {}, netScale = 1, hideTrendUnits = false }) {
  const returnPct = pct(returnRev, gross)
  const aov = orders > 0 ? gross / orders : 0
  const asp = units > 0 ? gross / units : 0
  const fmtPctSub = v => v != null ? `${v.toFixed(1)}%` : '—'
  const negAccent = v => v != null && v < 0 ? '#7A1A1A' : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {kpiSummary ? (
        <div className="g-kpi5" style={{ gridTemplateColumns: `repeat(${showMarketing ? 10 : 8},1fr)` }}>
          <KPICard label="Gross Revenue" value={fmt(gross)} sub={grossOfTotalPct != null ? `${fmtN(units)} units · ${grossOfTotalPct.toFixed(1)}% of total` : `${fmtN(units)} units`} />
          {!showMarketing && <KPICard label="ASP" value={`₹${Math.round(asp).toLocaleString('en-IN')}`} sub="ASP Inc GST" />}
          <KPICard label="Returns" value={fmt(returnRev)} sub={`${returnPct} of Gross`} accent={!noReturnAccent && parseFloat(returnPct) > 15 ? '#7A1A1A' : undefined} />
          <KPICard label="Net Revenue" value={fmt(net)} sub="Ex GST, after returns" />
          <KPICard label="COGS" value={kpiSummary.cogs != null ? fmt(kpiSummary.cogs) : '—'} sub={`${fmtPctSub(kpiSummary.cogsPct)} of Net Rev`} />
          <KPICard label="Gross Margin" value={kpiSummary.gm != null ? fmt(kpiSummary.gm) : '—'} sub={`GM% ${fmtPctSub(kpiSummary.gmPct)}`} />
          <KPICard label="SnD Cost" value={kpiSummary.snd != null ? fmt(kpiSummary.snd) : '—'} sub={`${fmtPctSub(kpiSummary.sndPct)} of Net Rev`} />
          <KPICard label="CM1" value={kpiSummary.cm1 != null ? fmt(kpiSummary.cm1) : '—'} sub={`CM1% ${fmtPctSub(kpiSummary.cm1Pct)}`} accent={negAccent(kpiSummary.cm1)} />
          {showMarketing && <>
            <KPICard label="Mktg Spend" value={fmt(kpiSummary.spend)} sub={`${fmtPctSub(kpiSummary.spendPct)} of Net Rev`} />
            <KPICard label="ROAS" value={kpiSummary.roas != null ? `${kpiSummary.roas.toFixed(2)}x` : '—'} sub="Gross Rev (Ex GST) / Spend" accent={kpiSummary.roas != null ? (kpiSummary.roas >= 2 ? '#0D9E68' : kpiSummary.roas >= 1 ? '#D97706' : '#B91C1C') : undefined} />
            <KPICard label="CM2" value={kpiSummary.cm2 != null ? fmt(kpiSummary.cm2) : '—'} sub={`CM2% ${fmtPctSub(kpiSummary.cm2Pct)}`} accent={negAccent(kpiSummary.cm2)} />
          </>}
        </div>
      ) : (
        <div className="g-kpi5">
          <KPICard label="Gross Revenue" value={fmt(gross)} sub={note} />
          <KPICard label="Net Revenue" value={fmt(net)} sub="Ex GST, after returns/cancellations" />
          <KPICard label="Returns" value={fmt(returnRev)} sub={`${returnPct} of gross`} accent={parseFloat(returnPct) > 15 ? '#7A1A1A' : undefined} />
          <KPICard label="Orders" value={fmtN(orders)} sub={`${fmtN(units)} units`} />
          <KPICard label="AOV / ASP" value={`₹${Math.round(aov).toLocaleString('en-IN')}`} sub={`ASP ₹${Math.round(asp).toLocaleString('en-IN')}`} />
        </div>
      )}
      <PnLTrendCard title={`${title}${note ? ` · ${note}` : ''} — Revenue Trend`} daily={daily} dailyPnL={dailyPnL} grossColor={grossColor} grossGradId={gradId} boxHeight={360} showMarketing={showMarketing} hideUnits={hideTrendUnits} />
      <PnLFinancialTable subCatData={subCatData} skuData={skuData} adSpendMap={adSpendMap} sndBySku={sndBySku} title={`Financial View · ${title}${note ? ` · ${note}` : ''}`} showMarketing={showMarketing} includeUnmatched={includeUnmatched} mobilityNetBySubCat={mobilityNetBySubCat} netScale={netScale} />
    </div>
  )
}
