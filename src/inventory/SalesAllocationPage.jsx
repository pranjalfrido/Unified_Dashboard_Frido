import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar,
} from 'recharts'
import {
  IC, fmtNum, fmtInt, fmtCurrency, GlassCard, KpiTile, ChartTip, SearchableMultiSelect, ExportButton,
} from './theme.jsx'

const SLICER_HEIGHT = 32
const SIDEBAR_WIDTH = 220

function ChangeBadge({ pct }) {
  if (pct == null) return null
  const up = pct >= 0
  const color = up ? IC.acc : IC.status.Critical.c
  return <span style={{ fontSize: 11, fontWeight: 700, color }}>{up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%</span>
}

// ── Tiny inline sparkline (single series, no axes/legend — the mark IS the label) ──
function Sparkline({ values, width = 90, height = 26, color = IC.acc }) {
  if (!values || values.length < 2) return <span style={{ fontSize: 11, color: IC.t3 }}>—</span>
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = Math.max(max - min, 1)
  const stepX = width / (values.length - 1)
  const points = values.map((v, i) => `${i * stepX},${height - ((v - min) / range) * height}`).join(' ')
  const last = values[values.length - 1]
  const lastY = height - ((last - min) / range) * height
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(values.length - 1) * stepX} cy={lastY} r={2.5} fill={color} />
    </svg>
  )
}

function FacilityAllocationBar({ rows }) {
  const maxQty = Math.max(1, ...rows.map(r => r.qty))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map(r => {
        const pct = r.allocationPct
        const color = pct == null ? IC.t3 : pct < 0.7 ? IC.status.Critical.c : pct < 0.9 ? IC.status.Low.c : IC.acc
        return (
          <div key={r.location} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 70px 60px', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: IC.t1 }}>{r.location}</span>
            <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, (r.qty / maxQty) * 100)}%`, height: '100%', background: IC.categorical[0] }} />
            </div>
            <span style={{ fontSize: 11.5, color: IC.t2, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtInt(r.qtyPerDay)}/d</span>
            <span style={{ fontSize: 12, fontWeight: 700, color, textAlign: 'right' }}>{pct == null ? '—' : `${Math.round(pct * 100)}%`}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Left filter sidebar — same pattern/component set as Inventory Health, for consistency ──
function FilterSidebar({ data, filters, setFilters, open }) {
  const opts = data.filterOptions
  const set = (key, arr) => setFilters(f => ({ ...f, [key]: arr }))
  const anyActive = ['category', 'subCategory', 'sku', 'channel', 'channelType', 'facility', 'region']
    .some(k => filters[k]?.length)

  return (
    <div style={{
      width: open ? SIDEBAR_WIDTH : 0, minWidth: open ? SIDEBAR_WIDTH : 0, transition: 'width .2s ease, min-width .2s ease',
      overflow: 'hidden', borderRight: `1px solid ${IC.border}`, flexShrink: 0,
      position: 'sticky', top: 0, alignSelf: 'flex-start', maxHeight: '100vh', overflowY: 'auto',
    }}>
      <div style={{ width: SIDEBAR_WIDTH, padding: '2px 12px 12px 2px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: IC.t3, letterSpacing: '.06em', textTransform: 'uppercase' }}>Filters</div>
        <SearchableMultiSelect label="Category" options={opts.categories} selected={filters.category || []} onChange={v => set('category', v)}
          width={SIDEBAR_WIDTH - 14} height={SLICER_HEIGHT} />
        <SearchableMultiSelect label="Sub-category" options={opts.subCategories} selected={filters.subCategory || []} onChange={v => set('subCategory', v)}
          width={SIDEBAR_WIDTH - 14} height={SLICER_HEIGHT} />
        <SearchableMultiSelect label="Product ID" options={opts.skus} selected={filters.sku || []} onChange={v => set('sku', v)}
          width={SIDEBAR_WIDTH - 14} height={SLICER_HEIGHT} />
        <div style={{ height: 1, background: IC.border, margin: '2px 0' }} />
        <SearchableMultiSelect label="Channel" options={opts.channels} selected={filters.channel || []} onChange={v => set('channel', v)}
          width={SIDEBAR_WIDTH - 14} height={SLICER_HEIGHT} />
        <SearchableMultiSelect label="Channel Type" options={opts.channelTypes} selected={filters.channelType || []} onChange={v => set('channelType', v)}
          width={SIDEBAR_WIDTH - 14} height={SLICER_HEIGHT} />
        <div style={{ height: 1, background: IC.border, margin: '2px 0' }} />
        <SearchableMultiSelect label="Facility" options={opts.facilities} selected={filters.facility || []} onChange={v => set('facility', v)}
          getKey={o => o.facility} getLabel={o => o.facility} width={SIDEBAR_WIDTH - 14} height={SLICER_HEIGHT} />
        <SearchableMultiSelect label="Region" options={opts.regions} selected={filters.region || []} onChange={v => set('region', v)}
          width={SIDEBAR_WIDTH - 14} height={SLICER_HEIGHT} />
        <div style={{ height: 1, background: IC.border, margin: '2px 0' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: IC.t2, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!filters.comparePrevious} onChange={e => setFilters(f => ({ ...f, comparePrevious: e.target.checked }))} />
          Compare to previous period
        </label>
        {anyActive && (
          <button onClick={() => setFilters(f => ({ comparePrevious: f.comparePrevious, momentumWindow: f.momentumWindow }))}
            style={{ fontSize: 11, color: IC.t3, background: 'none', border: `1px solid ${IC.border}`, borderRadius: 6, padding: '5px 0', cursor: 'pointer' }}>
            ✕ Clear all
          </button>
        )}
      </div>
    </div>
  )
}

// `variants` are the raw duplicate/alias SKU codes rolled into this master SKU — expandable
// only when there's more than one, since a single-variant row has nothing new to reveal.
function MoversTable({ rows, valueKey, expanded, setExpanded }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rows.length === 0 && <div style={{ fontSize: 12, color: IC.t3 }}>No data for this period.</div>}
      {rows.map((r, i) => {
        const hasVariants = r.variants && r.variants.length > 1
        const isOpen = expanded === r.skuKey
        return (
          <div key={r.skuKey || i}>
            <div onClick={() => hasVariants && setExpanded(isOpen ? null : r.skuKey)}
              style={{
                display: 'grid', gridTemplateColumns: '18px 1fr 90px 70px', alignItems: 'center', gap: 10, padding: '5px 0',
                borderBottom: !isOpen && i < rows.length - 1 ? `1px solid ${IC.border}` : 'none', cursor: hasVariants ? 'pointer' : 'default',
              }}>
              <span style={{ fontSize: 11, color: IC.t3 }}>{i + 1}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11.5, color: IC.t1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {hasVariants && <span style={{ color: IC.t3, fontSize: 9, display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>}
                  {r.sku}
                </div>
                <div style={{ fontSize: 10, color: IC.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.category}{r.subCategory ? ` · ${r.subCategory}` : ''}</div>
              </div>
              <Sparkline values={r.sparkline} color={valueKey === 'rev' ? IC.categorical[0] : IC.acc} />
              <span style={{ fontSize: 12, fontWeight: 700, color: IC.t1, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {valueKey === 'rev' ? fmtCurrency(r.rev) : fmtInt(r.qty)}
              </span>
            </div>
            {isOpen && (
              <div style={{ borderBottom: i < rows.length - 1 ? `1px solid ${IC.border}` : 'none', paddingBottom: 4 }}>
                {r.variants.map(v => (
                  <div key={v.sku} style={{ display: 'grid', gridTemplateColumns: '18px 1fr 90px 70px', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                    <span />
                    <span style={{ fontSize: 10.5, color: IC.t2, paddingLeft: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>↳ {v.sku}</span>
                    <span />
                    <span style={{ fontSize: 11, color: IC.t2, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {valueKey === 'rev' ? fmtCurrency(v.rev) : fmtInt(v.qty)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function SalesAllocationPage({ data, filters, setFilters }) {
  const [trendGranularity, setTrendGranularity] = useState('daily') // 'daily' | 'weekly' | 'monthly'
  const [trendMetric, setTrendMetric] = useState('qty') // 'qty' | 'rev'
  const [topMoversMetric, setTopMoversMetric] = useState('qty') // 'qty' | 'rev'
  const [expandedMover, setExpandedMover] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const dailyChart = useMemo(() => {
    if (!data) return []
    const series = data[trendGranularity] || data.daily
    return series.map((d, i, arr) => {
      const windowStart = Math.max(0, i - 6)
      const windowArr = arr.slice(windowStart, i + 1)
      const rollingAvg = windowArr.reduce((s, x) => s + x[trendMetric], 0) / windowArr.length
      const label = trendGranularity === 'monthly' ? d.date : d.date.slice(5)
      return { date: label, value: d[trendMetric], rollingAvg: Math.round(rollingAvg) }
    })
  }, [data, trendGranularity, trendMetric])

  const categoryRollup = useMemo(() => {
    if (!data) return []
    return data.categorySales.slice(0, 12).map(c => ({ name: c.category, qty: c.qty, rev: c.rev }))
  }, [data])

  // Sums the FULL sub-category list, not just the top-20 rows shown in the table —
  // this is the true total, labeled as such so it doesn't read as "sum of visible rows."
  const subCategoryTotals = useMemo(() => {
    if (!data) return { qty: 0, rev: 0 }
    return data.subCategorySales.reduce((acc, r) => ({ qty: acc.qty + r.qty, rev: acc.rev + r.rev }), { qty: 0, rev: 0 })
  }, [data])

  const channelTrendChart = useMemo(() => {
    if (!data) return []
    return data.channelTrend.map(d => ({ ...d, date: d.date.slice(5) }))
  }, [data])

  if (!data) return null
  const revenueAvailable = data.summary.totalRevenue > 0
  const mv = data.momentum?.requested || { risers: [], fallers: [] }
  const topMovers = topMoversMetric === 'qty' ? data.topMoversByQty : data.topMoversByRevenue

  return (
    <div style={{ display: 'flex', gap: 0 }}>
      <FilterSidebar data={data} filters={filters} setFilters={setFilters} open={sidebarOpen} />
      <button onClick={() => setSidebarOpen(o => !o)} style={{
        width: 16, alignSelf: 'flex-start', marginTop: 4, height: 48, border: `1px solid ${IC.border}`, borderLeft: 'none',
        background: IC.surface, cursor: 'pointer', borderRadius: '0 8px 8px 0', display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: IC.t3, fontSize: 12, flexShrink: 0, position: 'sticky', top: 4,
      }}>
        {sidebarOpen ? '‹' : '›'}
      </button>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18, paddingLeft: 16 }}>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <KpiTile label="Units Sold" value={fmtNum(data.summary.totalUnits)} unit="units"
            sub={data.previousPeriod ? <ChangeBadge pct={data.previousPeriod.unitsChangePct} /> : undefined} icon="📦" />
          <KpiTile label="Revenue" value={revenueAvailable ? fmtCurrency(data.summary.totalRevenue) : '—'}
            sub={revenueAvailable ? (data.previousPeriod ? <ChangeBadge pct={data.previousPeriod.revenueChangePct} /> : undefined) : 'Pending pipeline sync for recent dates'} icon="₹" />
          <KpiTile label="Avg Selling Price" value={revenueAvailable ? fmtCurrency(data.summary.avgSellingPrice) : '—'} icon="🏷" />
          <KpiTile label="Fill Rate" value={data.summary.fillRate != null ? `${Math.round(data.summary.fillRate * 100)}%` : '—'} sub="region-correct facility ÷ demand" accent={data.summary.fillRate >= 0.9 ? IC.acc : IC.status.Low.c} icon="⚖" />
          <KpiTile label="Momentum" value={data.summary.momentumPct != null ? `${data.summary.momentumPct > 0 ? '+' : ''}${data.summary.momentumPct.toFixed(0)}%` : '—'} sub="first vs last day" accent={data.summary.momentumPct >= 0 ? IC.acc : IC.status.Critical.c} icon={data.summary.momentumPct >= 0 ? '↗' : '↘'} />
        </div>

        {/* Sales trend */}
        <GlassCard title="Sales Trend" note={`${trendGranularity} ${trendMetric === 'rev' ? 'revenue' : 'units'}, with rolling average`}
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[{ k: 'qty', label: 'Units' }, { k: 'rev', label: 'Revenue' }].map(m => (
                  <button key={m.k} disabled={m.k === 'rev' && !revenueAvailable} onClick={() => setTrendMetric(m.k)}
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, cursor: m.k === 'rev' && !revenueAvailable ? 'not-allowed' : 'pointer', opacity: m.k === 'rev' && !revenueAvailable ? 0.4 : 1, background: trendMetric === m.k ? IC.accDim : IC.surface, color: trendMetric === m.k ? IC.acc : IC.t3, border: `1px solid ${trendMetric === m.k ? IC.accBorder : IC.border}` }}>
                    {m.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[{ k: 'daily', label: 'Daily' }, { k: 'weekly', label: 'Weekly' }, { k: 'monthly', label: 'Monthly' }].map(g => (
                  <button key={g.k} onClick={() => setTrendGranularity(g.k)}
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, cursor: 'pointer', background: trendGranularity === g.k ? IC.accDim : IC.surface, color: trendGranularity === g.k ? IC.acc : IC.t3, border: `1px solid ${trendGranularity === g.k ? IC.accBorder : IC.border}` }}>
                    {g.label}
                  </button>
                ))}
              </div>
              <ExportButton filename="sales_trend.csv" rows={data[trendGranularity]} columns={[{ label: 'Date', key: 'date' }, { label: 'Units', key: 'qty' }, { label: 'Revenue', key: 'rev' }]} />
            </div>
          }>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={dailyChart} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={IC.border} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: IC.t3 }} axisLine={{ stroke: IC.border2 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: IC.t3 }} tickFormatter={trendMetric === 'rev' ? fmtCurrency : fmtNum} axisLine={{ stroke: IC.border2 }} tickLine={false} width={44} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="value" name={trendMetric === 'rev' ? 'Revenue' : 'Units Sold'} fill="rgba(52,211,153,0.18)" stroke={IC.acc} strokeWidth={2} />
              {trendGranularity === 'daily' && <Line type="monotone" dataKey="rollingAvg" name="7d Rolling Avg" stroke={IC.categorical[0]} strokeWidth={2} dot={false} strokeDasharray="4 3" />}
            </ComposedChart>
          </ResponsiveContainer>
        </GlassCard>

        {/* Channel-wise sales: revenue+qty table, channel-type split, trend */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 14 }}>
          <GlassCard title="Channel-Wise Sales" note="revenue & units by unified channel"
            action={<ExportButton filename="channel_sales.csv" rows={data.channelSales} columns={[{ label: 'Channel', key: 'channel' }, { label: 'Units', key: 'qty' }, { label: 'Revenue', key: 'rev' }]} />}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
              {data.channelSales.map((c, i) => (
                <div key={c.channel} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 100px', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: i < data.channelSales.length - 1 ? `1px solid ${IC.border}` : 'none' }}>
                  <span style={{ fontSize: 12, color: IC.t1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.channel}</span>
                  <span style={{ fontSize: 11.5, color: IC.t2, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtInt(c.qty)} u</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: IC.t1, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{revenueAvailable ? fmtCurrency(c.rev) : '—'}</span>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard title="Channel Type Split" note="B2C / B2B / Purchase Order / Stock Transfer">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.channelTypeSales.map(t => {
                const maxQty = Math.max(1, ...data.channelTypeSales.map(x => x.qty))
                return (
                  <div key={t.type}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: IC.t2, marginBottom: 3 }}>
                      <span>{t.type}</span>
                      <span style={{ fontWeight: 700, color: IC.t1 }}>{fmtInt(t.qty)} u</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                      <div style={{ width: `${(t.qty / maxQty) * 100}%`, height: '100%', background: IC.acc }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </GlassCard>
        </div>

        {/* Channel trend (top channels, units/day) */}
        <GlassCard title="Channel Trend" note="units/day, top 6 channels by revenue">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={channelTrendChart} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={IC.border} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: IC.t3 }} axisLine={{ stroke: IC.border2 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: IC.t3 }} tickFormatter={fmtNum} axisLine={{ stroke: IC.border2 }} tickLine={false} width={44} />
              <Tooltip content={<ChartTip />} />
              {data.topChannelNames.map((ch, i) => (
                <Line key={ch} type="monotone" dataKey={ch} name={ch} stroke={IC.categorical[i % IC.categorical.length]} strokeWidth={2} dot={false} />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8 }}>
            {data.topChannelNames.map((ch, i) => (
              <span key={ch} style={{ fontSize: 11, color: IC.t2, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: IC.categorical[i % IC.categorical.length] }} />
                {ch}
              </span>
            ))}
          </div>
        </GlassCard>

        {/* Demand vs allocation + facility allocation % */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <GlassCard title="Regional Demand vs Allocation" note="units/day · fill rate = allocation ÷ demand · same regional basis as Page 1's DOI">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.regionComparison.map(r => {
                const maxVal = Math.max(1, ...data.regionComparison.flatMap(x => [x.demand, x.allocation]))
                const demandPct = (r.demand / maxVal) * 100
                const allocPct = (r.allocation / maxVal) * 100
                const gap = r.demand - r.allocation
                const underAllocated = gap > 0
                return (
                  <div key={r.region} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 90px', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: IC.t2, textAlign: 'right' }}>{r.region}</span>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <div style={{ width: `${demandPct}%`, height: 16, background: IC.categorical[0], borderRadius: '4px 0 0 4px', minWidth: demandPct > 0 ? 3 : 0 }} title={`Demand: ${r.demand}/day`} />
                    </div>
                    <div>
                      <div style={{ width: `${allocPct}%`, height: 16, background: IC.acc, borderRadius: '0 4px 4px 0', minWidth: allocPct > 0 ? 3 : 0 }} title={`Allocation: ${r.allocation}/day`} />
                    </div>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: underAllocated ? IC.status.Critical.c : IC.acc, textAlign: 'right' }}>
                      {r.fillRate != null ? `${Math.round(r.fillRate * 100)}% fill` : '—'}
                    </span>
                  </div>
                )
              })}
              <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 11, color: IC.t3 }}>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, background: IC.categorical[0], borderRadius: 2, marginRight: 5 }} />Demand (units/day)</span>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, background: IC.acc, borderRadius: 2, marginRight: 5 }} />Allocation (units/day)</span>
              </div>
            </div>
          </GlassCard>

          <GlassCard title="Facility-Location Allocation %" note="units landed at facility ÷ total demand in its region">
            <FacilityAllocationBar rows={data.facilityAllocation} />
          </GlassCard>
        </div>

        {/* Momentum */}
        <GlassCard title="Momentum — Top Risers & Fallers"
          note={mv.lastDate ? `${mv.compareDate} → ${mv.lastDate}` : 'not enough days in range for this window'}
          action={
            <div style={{ display: 'flex', gap: 4 }}>
              {[2, 7, 14, 30].map(w => (
                <button key={w} onClick={() => setFilters(f => ({ ...f, momentumWindow: w }))}
                  style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, cursor: 'pointer', background: (filters.momentumWindow || 7) === w ? IC.accDim : IC.surface, color: (filters.momentumWindow || 7) === w ? IC.acc : IC.t3, border: `1px solid ${(filters.momentumWindow || 7) === w ? IC.accBorder : IC.border}` }}>
                  {w}-day
                </button>
              ))}
            </div>
          }>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: IC.acc, marginBottom: 10 }}>Top Risers</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {mv.risers.length === 0 && <div style={{ fontSize: 12, color: IC.t3 }}>No data for this window.</div>}
                {mv.risers.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: IC.t3, width: 16, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 11.5, color: IC.t2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sku}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: IC.acc, width: 62, textAlign: 'right', flexShrink: 0 }}>+{r.pctChange.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: IC.status.Critical.c, marginBottom: 10 }}>Top Fallers</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {mv.fallers.length === 0 && <div style={{ fontSize: 12, color: IC.t3 }}>No data for this window.</div>}
                {mv.fallers.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: IC.t3, width: 16, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 11.5, color: IC.t2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sku}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: IC.status.Critical.c, width: 62, textAlign: 'right', flexShrink: 0 }}>{r.pctChange.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Category sales */}
        <GlassCard title="Category Sales Breakdown" note="by units sold, top 12"
          action={<ExportButton filename="category_sales.csv" rows={data.categorySales} columns={[{ label: 'Category', key: 'category' }, { label: 'Units', key: 'qty' }, { label: 'Revenue', key: 'rev' }]} />}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={categoryRollup} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={IC.border} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: IC.t3 }} tickFormatter={fmtNum} axisLine={{ stroke: IC.border2 }} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10.5, fill: IC.t2 }} width={150} axisLine={{ stroke: IC.border2 }} tickLine={false} />
              <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="qty" name="Units Sold" fill={IC.acc} radius={[0, 4, 4, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>

        {/* Sub-category breakdown table */}
        <GlassCard title="Sub-Category Breakdown" note="top 20 by revenue"
          action={<ExportButton filename="subcategory_sales.csv" rows={data.subCategorySales} columns={[{ label: 'Category', key: 'category' }, { label: 'Sub-category', key: 'subCategory' }, { label: 'Units', key: 'qty' }, { label: 'Revenue', key: 'rev' }]} />}>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: IC.surfaceHi }}>
                <tr>
                  <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: IC.t3, padding: '6px 10px', borderBottom: `1px solid ${IC.border2}` }}>Category</th>
                  <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: IC.t3, padding: '6px 10px', borderBottom: `1px solid ${IC.border2}` }}>Sub-category</th>
                  <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: IC.t3, padding: '6px 10px', borderBottom: `1px solid ${IC.border2}` }}>Units</th>
                  <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: IC.t3, padding: '6px 10px', borderBottom: `1px solid ${IC.border2}` }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.subCategorySales.slice(0, 20).map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${IC.border}` }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '6px 10px', color: IC.t2 }}>{r.category}</td>
                    <td style={{ padding: '6px 10px', color: IC.t1, fontWeight: 600 }}>{r.subCategory}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtInt(r.qty)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{revenueAvailable ? fmtCurrency(r.rev) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ position: 'sticky', bottom: 0, background: IC.surfaceHi, borderTop: `2px solid ${IC.border2}` }}>
                  <td colSpan={2} style={{ padding: '7px 10px', fontWeight: 700, color: IC.acc }}>Total (all sub-categories)</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: IC.acc }}>{fmtInt(subCategoryTotals.qty)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: IC.acc }}>{revenueAvailable ? fmtCurrency(subCategoryTotals.rev) : '—'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </GlassCard>

        {/* Top movers (with sparkline) + Dead stock */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <GlassCard title="Top Movers" note={`top ${data.topN || 10} SKUs, 14-day trend — click a row with variants to expand`}
            action={
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {[{ k: 'qty', label: 'By Units' }, { k: 'rev', label: 'By Revenue' }].map(m => (
                  <button key={m.k} onClick={() => setTopMoversMetric(m.k)}
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, cursor: 'pointer', background: topMoversMetric === m.k ? IC.accDim : IC.surface, color: topMoversMetric === m.k ? IC.acc : IC.t3, border: `1px solid ${topMoversMetric === m.k ? IC.accBorder : IC.border}` }}>
                    {m.label}
                  </button>
                ))}
                <select value={filters.topN || 10} onChange={e => setFilters(f => ({ ...f, topN: Number(e.target.value) }))}
                  style={{ fontSize: 11, padding: '4px 6px', borderRadius: 7, background: IC.surface, color: IC.t2, border: `1px solid ${IC.border}`, cursor: 'pointer' }}>
                  {[5, 10, 20, 30, 50].map(n => <option key={n} value={n}>Top {n}</option>)}
                </select>
              </div>
            }>
            <MoversTable rows={topMovers} valueKey={topMoversMetric} expanded={expandedMover} setExpanded={setExpandedMover} />
          </GlassCard>
          <GlassCard title="Dead Stock Candidates" note="has inventory, zero sales this period"
            action={<ExportButton filename="dead_stock_candidates.csv" rows={data.deadStock} columns={[{ label: 'SKU', key: 'sku' }, { label: 'Total Invt', key: 'totalInvt' }]} />}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {data.deadStock.length === 0 && <div style={{ fontSize: 12, color: IC.t3 }}>No dead stock candidates for this period.</div>}
              {data.deadStock.map((r, i) => {
                const maxVal = Math.max(1, ...data.deadStock.map(x => x.totalInvt))
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: IC.t3, width: 16, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 11.5, color: IC.t2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sku}</span>
                    <div style={{ width: 70, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', flexShrink: 0 }}>
                      <div style={{ width: `${(r.totalInvt / maxVal) * 100}%`, height: '100%', background: IC.status.Critical.c }} />
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: IC.t1, width: 62, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtInt(r.totalInvt)}</span>
                  </div>
                )
              })}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  )
}
