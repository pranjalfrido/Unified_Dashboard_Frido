import { useState } from 'react'
import { C, fmt, fmtN, pct } from './utils.js'
import { BarChart, Bar, LineChart, Line, AreaChart, Area, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, Treemap } from 'recharts'

export { BarChart, Bar, LineChart, Line, AreaChart, Area, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, Treemap }

export function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null
  const format = formatter || fmt
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 12px', fontSize: 11, boxShadow: '0 4px 16px rgba(0,0,0,.10)' }}>
      <div style={{ fontWeight: 700, color: C.t2, marginBottom: 5 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0, border: p.color === '#FFD600' ? '1px solid #E6C200' : 'none' }} />
          <span style={{ color: C.t2 }}>{p.name}</span>
          <span style={{ fontWeight: 700, color: C.t1, marginLeft: 'auto', paddingLeft: 12, fontFamily: 'var(--mono)' }}>{format(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function KPICard({ label, icon, value, sub, accent, center, badge }) {
  return (
    <div className="kpi-card flex flex-col gap-1" style={center ? { alignItems: 'center', justifyContent: 'center', textAlign: 'center' } : {}}>
      <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: C.t3, justifyContent: center ? 'center' : undefined }}>{icon && <span style={{ fontSize: 13 }}>{icon}</span>}{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <span style={{ fontSize: center ? 28 : 21, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.1, color: accent || C.t1 }}>{value}</span>
        {badge && <span>{badge}</span>}
      </div>
      {sub && <span className="text-xs" style={{ color: C.t3 }}>{sub}</span>}
    </div>
  )
}

export function AlertCard({ type, title, body }) {
  const s = { red: 'al-R', amber: 'al-A', green: 'al-G', blue: 'al-B' }[type] || 'al-B'
  const icon = type === 'green' ? '★' : type === 'blue' ? 'ℹ' : '⚠'
  return (
    <div className={`flex items-start gap-2 p-3 rounded-xl border ${s}`} style={{ marginBottom: 6 }}>
      <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div>
        <div className="text-xs font-bold" style={{ display: 'block', marginBottom: 2 }}>{title}</div>
        <div className="text-xs" style={{ opacity: 0.85, lineHeight: 1.55 }}>{body}</div>
      </div>
    </div>
  )
}

export function HBar({ dot, label, width, value, pctVal, onClick, isSelected, labelWidth = 110 }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 0', borderBottom: `1px solid ${C.border}`, cursor: onClick ? 'pointer' : 'default', background: isSelected ? '#FFFBE6' : 'transparent', borderRadius: isSelected ? 4 : 0 }} className="hbar-row">
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      <span title={label} style={{ fontSize: 12, color: C.t2, flexShrink: 0, width: labelWidth, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <div className="hb-track" style={{ flex: 1 }}><div className="hb-fill" style={{ width: `${width}%`, background: dot }} /></div>
      <span style={{ fontSize: 12, fontWeight: 700, color: C.t1, fontFamily: 'var(--mono)', flexShrink: 0, minWidth: 62, textAlign: 'right' }}>{value}</span>
      <span style={{ fontSize: 11, color: C.t3, flexShrink: 0, width: 36, textAlign: 'right' }}>{pctVal}</span>
    </div>
  )
}

const DOTS = ['#534AB7','#0D9E68','#2E74CC','#CC8A00','#CC4078','#E24B4A','#9B59B6','#FF6B35']

// Compact side-panel Category Revenue card with a Category / Product (sub-category) / SKU Code
// toggle. Heading stays "Category Revenue" regardless of the selected view — only the rows change.
// catRows: [{name, rev}]; subCatRows: [{name, category, rev}]; skuMap: {category: {subCategory: {sku: {rev}}}}.
// view/setView: lift the toggle state up so it can be reset (e.g. on category click) if needed.
export function CategoryRevenueCard({ catRows, subCatRows, skuMap, totalRev, view, setView, onSelectCategory, onSelectSubCategory, onSelectSku, selectedName, height = 242, maxSkuRows = 100 }) {
  const labelWidthFor = names => Math.min(260, Math.max(110, Math.max(...names.map(n => n.length), 0) * 6.5 + 8))

  let rows, maxRev, labelWidth, onClick
  if (view === 'category') {
    rows = catRows
    maxRev = catRows[0]?.rev || 1
    labelWidth = 110
    onClick = r => onSelectCategory?.(r.name)
  } else if (view === 'subcategory') {
    rows = subCatRows
    maxRev = subCatRows[0]?.rev || 1
    labelWidth = labelWidthFor(subCatRows.map(r => r.name))
    onClick = r => onSelectSubCategory?.(r.name)
  } else {
    const prodRows = []
    Object.entries(skuMap || {}).forEach(([cat, scMap]) => {
      Object.entries(scMap).forEach(([sc, skMap]) => {
        Object.entries(skMap).forEach(([sku, v]) => prodRows.push({ name: sku, category: cat, subCategory: sc, rev: v.rev || 0 }))
      })
    })
    prodRows.sort((a, b) => b.rev - a.rev)
    rows = prodRows.slice(0, maxSkuRows)
    maxRev = rows[0]?.rev || 1
    labelWidth = labelWidthFor(rows.map(r => r.name))
    onClick = r => onSelectSku?.(r.name)
  }

  return (
    <Card fill title="Category Revenue" style={{ height, alignSelf: 'start' }} action={
      <div style={{ display: 'flex', gap: 4 }}>
        {[{ id: 'category', label: 'Category' }, { id: 'subcategory', label: 'Product' }, { id: 'sku', label: 'SKU Code' }].map(v => (
          <button key={v.id} onClick={() => setView(v.id)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${view === v.id ? C.t1 : C.border}`, background: view === v.id ? C.t1 : 'transparent', color: view === v.id ? '#fff' : C.t2, cursor: 'pointer', fontFamily: 'var(--font)' }}>{v.label}</button>
        ))}
      </div>
    }>
      <div style={{ height: '100%', overflowY: 'auto' }}>
        {rows.map((r, i) => {
          const isSelected = selectedName ? selectedName === r.name : false
          return <HBar key={`${r.category || ''}::${r.name}`} dot={DOTS[i % DOTS.length]} label={r.name} labelWidth={labelWidth} width={(r.rev / maxRev) * 100} value={fmt(r.rev)} pctVal={totalRev > 0 ? pct(r.rev, totalRev) : '—'} isSelected={isSelected} onClick={() => onClick(r)} />
        })}
      </div>
    </Card>
  )
}

export function DataTable({ columns, rows, maxRows = 50 }) {
  const visible = rows.slice(0, maxRows)
  return (
    <div className="overflow-x-auto">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key + c.label} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, textAlign: c.align === 'right' ? 'right' : 'left', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}` }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((r, i) => (
            <tr key={i} style={{ borderBottom: i < visible.length - 1 ? `1px solid ${C.border}` : 'none' }} onMouseEnter={e => e.currentTarget.style.background = '#FFFBE6'} onMouseLeave={e => e.currentTarget.style.background = ''}>
              {columns.map(c => (
                <td key={c.key + c.label} style={{ padding: i < visible.length - 1 ? '5.5px 5px' : '5.5px 5px 14px', color: c.align === 'right' ? C.t1 : C.t2, textAlign: c.align === 'right' ? 'right' : 'left', fontFamily: c.mono ? 'var(--mono)' : 'inherit', fontSize: c.mono ? 11.5 : 12, whiteSpace: 'nowrap' }}>
                  {c.render ? c.render(r[c.key], r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > maxRows && <div className="text-xs text-center py-2" style={{ color: C.t3, paddingBottom: 14 }}>Showing {maxRows} of {rows.length}</div>}
    </div>
  )
}

export function Card({ title, note, action, children, style, fill }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 13, padding: '16px 18px', height: '100%', boxSizing: 'border-box', display: fill ? 'flex' : undefined, flexDirection: fill ? 'column' : undefined, ...style }}>
      {(title || note || action) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {title && <span style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>{title}</span>}
            {note && <span style={{ fontSize: 11.5, color: C.t3 }}>{note}</span>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {fill ? <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{children}</div> : children}
    </div>
  )
}

export function Badge({ type = 'green', children }) {
  const cls = { green: 'bdg-G', red: 'bdg-R', amber: 'bdg-A', blue: 'bdg-B', grey: 'bdg-N' }[type] || 'bdg-N'
  return <span className={`bdg ${cls}`}>{children}</span>
}

export function RevTrendChart({ dailyArr, channels }) {
  return (
    <ResponsiveContainer width="100%" height={175}>
      <BarChart data={dailyArr} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={d => d?.slice(5)} />
        <YAxis tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => v >= 1e5 ? `${(v / 1e5).toFixed(0)}L` : v} width={40} />
        <Tooltip content={<ChartTooltip />} />
        {channels.map(ch => <Bar key={ch} dataKey={ch} stackId="a" fill={C.ch[ch] || C.acc} />)}
      </BarChart>
    </ResponsiveContainer>
  )
}

export function AreaTrendChart({ data, dataKey = 'rev', color }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={d => d?.slice(5)} />
        <YAxis tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => v >= 1e5 ? `${(v / 1e5).toFixed(0)}L` : v} width={40} />
        <Tooltip content={<ChartTooltip />} />
        <Area type="monotone" dataKey={dataKey} fill={C.acl} stroke={color || C.acc} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function MultiLineChart({ dailyArr, channels }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={dailyArr}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={d => d?.slice(5)} />
        <YAxis tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => v >= 1e5 ? `${(v / 1e5).toFixed(0)}L` : v} width={40} />
        <Tooltip content={<ChartTooltip />} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
        {channels.map(ch => <Line key={ch} type="monotone" dataKey={ch} stroke={C.ch[ch]} strokeWidth={2} dot={false} />)}
      </LineChart>
    </ResponsiveContainer>
  )
}

export const GROUP_OPTS = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
]

// Buckets a date string into the selected granularity. Quarterly follows the Indian
// financial year (Q1=Apr-Jun … Q4=Jan-Mar), not the calendar year.
export function getGroupKey(date, groupBy) {
  if (!date) return '—'
  if (groupBy === 'daily') return date
  if (groupBy === 'monthly') return date.slice(0, 7)
  if (groupBy === 'quarterly') {
    const [y, m] = date.split('-')
    const mo = parseInt(m) // 1-12
    const q = mo >= 4 ? Math.floor((mo - 4) / 3) + 1 : 4
    const fy = mo >= 4 ? parseInt(y) : parseInt(y) - 1
    return `FY${fy}-${String(fy+1).slice(2)} Q${q}`
  }
  return date
}

// Shared Gross/Net Revenue + Units trend chart with a granularity selector — used by every
// Sales-tab channel that doesn't need per-metric-toggle buttons (Amazon quick-commerce family)
// and reused as-is by the PnL tab's per-channel trend card.
export function TrendAnalysisCard({ title, daily, grossColor, grossGradId, revKey = 'rev', excRevKey = 'excRev', boxHeight, cogsPct, sndPct }) {
  const nDays = daily.length
  const autoGroup = nDays <= 14 ? 'daily' : nDays <= 90 ? 'weekly' : 'monthly'
  const [groupBy, setGroupBy] = useState(autoGroup)
  const selStyle = { fontSize: 11, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, outline: 'none', fontFamily: 'var(--font)', cursor: 'pointer' }

  const showCogs = cogsPct != null
  const showSnd = sndPct != null

  const grouped = (() => {
    if (groupBy === 'daily') {
      return daily.map(d => {
        const net = d[excRevKey] || 0
        const out = { ...d }
        if (showCogs) out._cogs = net * cogsPct / 100
        if (showSnd) out._snd = net * sndPct / 100
        return out
      })
    }
    const agg = {}
    daily.forEach(d => {
      const k = getGroupKey(d.date, groupBy)
      if (!agg[k]) agg[k] = { date: k, [revKey]: 0, [excRevKey]: 0, units: 0, _cogs: 0, _snd: 0 }
      agg[k][revKey] += d[revKey] || 0
      agg[k][excRevKey] += d[excRevKey] || 0
      agg[k].units += d.units || 0
      if (showCogs) agg[k]._cogs += (d[excRevKey] || 0) * cogsPct / 100
      if (showSnd) agg[k]._snd += (d[excRevKey] || 0) * sndPct / 100
    })
    return Object.values(agg)
  })()

  const fmtTick = v => v >= 1e5 ? `${(v/1e5).toFixed(1)}L` : v >= 1e3 ? `${(v/1e3).toFixed(0)}k` : String(v)
  const gradId = grossGradId || 'trendGrossGrad'

  return (
    <Card title={title} style={boxHeight ? { height: boxHeight } : undefined} action={
      <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={selStyle}>
        {GROUP_OPTS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
      </select>
    }>
      <ResponsiveContainer width="100%" height="100%" minHeight={220}>
        <ComposedChart data={grouped} margin={{ top: 4, right: 40, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={grossColor} stopOpacity={0.2} /><stop offset="95%" stopColor={grossColor} stopOpacity={0} /></linearGradient>
            <linearGradient id={gradId + '_net'} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#B8960C" stopOpacity={0.15} /><stop offset="95%" stopColor="#B8960C" stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t1 }} tickFormatter={d => d?.slice(5)} />
          <YAxis yAxisId="rev" tick={{ fontSize: 10, fill: C.t1 }} tickFormatter={fmtTick} width={55} />
          <YAxis yAxisId="units" orientation="right" tick={{ fontSize: 10, fill: C.t1 }} tickFormatter={v => fmtN(v)} width={36} />
          <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 11px', fontSize: 11 }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: C.t2 }}>{label?.slice(5) || label}</div>
              {payload.map(p => {
                const isUnits = p.name === 'Units'
                const isCogs = p.dataKey === '_cogs'
                const isSnd = p.dataKey === '_snd'
                const pctLabel = isCogs ? ` (${cogsPct.toFixed(1)}%)` : isSnd ? ` (${sndPct.toFixed(1)}%)` : ''
                return (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ color: C.t2 }}>{p.name}: {isUnits ? fmtN(p.value) : fmt(p.value)}{pctLabel}</span>
                  </div>
                )
              })}
            </div>
          ) : null} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area yAxisId="rev" type="monotone" dataKey={revKey} name="Gross Revenue" stroke={grossColor} fill={`url(#${gradId})`} strokeWidth={2} dot={false} />
          <Area yAxisId="rev" type="monotone" dataKey={excRevKey} name="Net Revenue" stroke="#B8960C" fill={`url(#${gradId}_net)`} strokeWidth={2} dot={false} strokeDasharray="4 2" />
          {showCogs && <Line yAxisId="rev" type="monotone" dataKey="_cogs" name="COGS" stroke="#F59E0B" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />}
          {showSnd && <Line yAxisId="rev" type="monotone" dataKey="_snd" name="SnD" stroke="#92720A" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />}
          <Line yAxisId="units" type="monotone" dataKey="units" name="Units" stroke="#C9A800" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  )
}

// Shared sortable-table hook — click-to-sort column headers with a bidirectional toggle
// (desc first, then asc on repeat click), used by every matrix/leaderboard table across
// Sales/Ads/PnL tabs. `getters` maps sortKey -> row accessor so callers don't need to
// pre-flatten rows into a single sortable shape.
export function useSortableTable(defaultKey = null, defaultDir = 'desc') {
  const [sort, setSort] = useState(defaultKey ? { key: defaultKey, dir: defaultDir } : null)
  const onSort = key => setSort(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' })
  const sortRows = (rows, getters) => {
    if (!sort || !getters[sort.key]) return rows
    const get = getters[sort.key]
    const sign = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = get(a), bv = get(b)
      if (typeof av === 'string') return sign * av.localeCompare(bv)
      return sign * ((av ?? -Infinity) - (bv ?? -Infinity))
    })
  }
  const Th = ({ label, sortKey, style, align = 'right', children }) => (
    <th onClick={() => onSort(sortKey)}
      style={{ ...style, textAlign: align, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', color: sort?.key === sortKey ? C.t1 : (style?.color ?? C.t1), position: style?.position || 'relative' }}>
      {label}{sort?.key === sortKey ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
      {children}
    </th>
  )
  return { sort, onSort, sortRows, Th }
}
