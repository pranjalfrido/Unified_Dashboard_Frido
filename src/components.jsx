import { useState, useRef } from 'react'
import { C, fmt, fmtN, pct } from './utils.js'
import { BarChart, Bar, LineChart, Line, AreaChart, Area, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, LabelList, ResponsiveContainer, PieChart, Pie, Cell, Treemap } from 'recharts'

export { BarChart, Bar, LineChart, Line, AreaChart, Area, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, LabelList, ResponsiveContainer, PieChart, Pie, Cell, Treemap }

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
      <div className="hb-track" style={{ flex: 1 }}><div className="hb-fill" style={{ width: `${width}%`, background: '#FFD600' }} /></div>
      <span className="hb-value" style={{ fontSize: 12, fontWeight: 700, color: C.t1, fontFamily: 'var(--mono)', flexShrink: 0, minWidth: 62, textAlign: 'right' }}>{value}</span>
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
  const labelWidthFor = names => window.innerWidth <= 768 ? 150 : Math.min(260, Math.max(132, Math.max(...names.map(n => n.length), 0) * 7.8 + 8))

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
        {[{ id: 'category', label: 'Category' }, { id: 'subcategory', label: 'Product' }, ...(window.innerWidth > 768 ? [{ id: 'sku', label: 'SKU Code' }] : [])].map(v => (
          <button key={v.id} onClick={() => setView(v.id)} className="cat-rev-btn" style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${view === v.id ? C.acm : C.border}`, background: view === v.id ? C.acc : 'transparent', color: view === v.id ? C.t1 : C.t2, cursor: 'pointer', fontFamily: 'var(--font)' }}>{v.label}</button>
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

// storageKey: identifies this table instance for persisted column order — pass something unique
// per call site (e.g. the table's title/section name). Falls back to a key derived from the
// column set if omitted, so an existing caller that hasn't been updated yet still gets a stable
// (if less human-readable) storage key rather than colliding with every other unkeyed DataTable.
// maxHeight scrolls the body vertically while the header stays put, so a card can hold a long
// table at a fixed height instead of stretching the whole row.
export function DataTable({ columns, rows, maxRows = 50, storageKey, maxHeight, search, searchKeys, searchPlaceholder, style }) {
  // Opt-in search. Long tables (139 weight slabs, ~290 sub-categories) are scroll-only
  // otherwise, so finding one row means dragging through the whole list.
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  // Match the named keys' RAW values, not the rendered cells: a cell may render JSX, and
  // stringifying that would search React internals instead of the data.
  const keys = searchKeys && searchKeys.length ? searchKeys : columns.map(c => c.key)
  const matched = !needle ? rows : rows.filter(r =>
    keys.some(k => String(r?.[k] ?? '').toLowerCase().includes(needle)))
  const visible = matched.slice(0, maxRows)
  const key = storageKey || `datatable-cols:${columns.map(c => c.key).join(',')}`
  const idColumns = columns.map(c => ({ id: c.key, ...c }))
  const reorder = useReorderableColumns(key, idColumns)
  return (
    <>
      {search && (
        <div style={{ marginBottom: 8 }}>
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder={searchPlaceholder || 'Search…'}
            style={{
              fontFamily: 'var(--font)', fontSize: 11.5, padding: '6px 10px', width: 230,
              borderRadius: 7, border: `1.5px solid ${needle ? C.acm : C.border2}`,
              background: needle ? C.acl : C.card, color: C.t1, outline: 'none',
            }} />
          {needle && (
            <span style={{ fontSize: 11, color: C.t3, marginLeft: 9 }}>
              {matched.length} of {rows.length}
              <button onClick={() => setQ('')}
                style={{ marginLeft: 8, border: 'none', background: 'none', color: C.t3, cursor: 'pointer', fontSize: 11, textDecoration: 'underline', padding: 0, fontFamily: 'var(--font)' }}>clear</button>
            </span>
          )}
        </div>
      )}
    <div className="overflow-x-auto" style={{ ...(maxHeight ? { maxHeight, overflowY: 'auto' } : {}), ...( style || {}) }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {reorder.orderedColumns.map(c => (
              <th key={c.key + c.label} draggable onDragStart={reorder.onDragStart(c.id)} onDragOver={reorder.onDragOver} onDrop={reorder.onDrop(c.id)}
                style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, textAlign: c.align === 'right' ? 'right' : c.align === 'center' ? 'center' : 'left', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, cursor: 'grab', userSelect: 'none', ...(c.width ? { width: c.width, minWidth: c.width } : {}), ...(c.sticky ? { position: 'sticky', left: 0, background: C.card, zIndex: 3, borderRight: `1px solid ${C.border}` } : {}), ...(maxHeight ? { position: 'sticky', top: 0, background: C.card, zIndex: c.sticky ? 4 : 1 } : {}) }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((r, i) => (
            <tr key={i} style={{ borderBottom: i < visible.length - 1 ? `1px solid ${C.border}` : 'none' }} onMouseEnter={e => e.currentTarget.style.background = '#FFFBE6'} onMouseLeave={e => e.currentTarget.style.background = ''}>
              {reorder.orderedColumns.map(c => (
                <td key={c.key + c.label} style={{ padding: i < visible.length - 1 ? '5.5px 5px' : '5.5px 5px 14px', color: c.align === 'right' || c.align === 'center' ? C.t1 : C.t2, textAlign: c.align === 'right' ? 'right' : c.align === 'center' ? 'center' : 'left', fontFamily: c.mono ? 'var(--mono)' : 'inherit', fontSize: c.mono ? 11.5 : 12, whiteSpace: 'nowrap', ...(c.sticky ? { position: 'sticky', left: 0, background: C.card, zIndex: 1, borderRight: `1px solid ${C.border}` } : {}) }}>
                  {c.render ? c.render(r[c.key], r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {matched.length > maxRows && <div className="text-xs text-center py-2" style={{ color: C.t3, paddingBottom: 14 }}>Showing {maxRows} of {matched.length}</div>}
      {needle && !matched.length && <div className="text-xs text-center py-2" style={{ color: C.t3, paddingBottom: 14 }}>No rows match “{q}”</div>}
    </div>
    </>
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
  if (groupBy === 'weekly') {
    // Week starting Monday, keyed by that Monday's date — previously this case was missing
    // entirely, so 'weekly' silently fell through to the `return date` default below and behaved
    // exactly like 'daily' (no aggregation happened, just relabeled as "Weekly" in the UI).
    const d = new Date(date + 'T00:00:00Z')
    const day = d.getUTCDay() // 0=Sun..6=Sat
    const diffToMonday = day === 0 ? -6 : 1 - day
    d.setUTCDate(d.getUTCDate() + diffToMonday)
    return d.toISOString().slice(0, 10)
  }
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
export function TrendAnalysisCard({ title, daily, grossColor, grossGradId, revKey = 'rev', excRevKey = 'excRev', boxHeight, cogsPct, sndPct, cogsPctLabel, sndPctLabel, netRatio }) {
  const nDays = daily.length
  const autoGroup = nDays <= 14 ? 'daily' : nDays <= 90 ? 'weekly' : 'monthly'
  const [groupBy, setGroupBy] = useState(autoGroup)
  const selStyle = { fontSize: 11, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, outline: 'none', fontFamily: 'var(--font)', cursor: 'pointer' }

  const showCogs = cogsPct != null
  const showSnd = sndPct != null
  const showNet = netRatio != null

  const grouped = (() => {
    if (groupBy === 'daily') {
      return daily.map(d => {
        const grossR = d[revKey] || 0
        const out = { ...d }
        const netR = grossR * (netRatio ?? 1)
        if (showNet) out._net = netR
        if (showCogs) out._cogs = netR * cogsPct / 100
        if (showSnd) out._snd = netR * sndPct / 100
        return out
      })
    }
    const agg = {}
    daily.forEach(d => {
      const k = getGroupKey(d.date, groupBy)
      if (!agg[k]) agg[k] = { date: k, [revKey]: 0, [excRevKey]: 0, _net: 0, _cogs: 0, _snd: 0 }
      agg[k][revKey] += d[revKey] || 0
      agg[k][excRevKey] += d[excRevKey] || 0
      const grossR = d[revKey] || 0
      const netR = grossR * (netRatio ?? 1)
      if (showNet) agg[k]._net += netR
      if (showCogs) agg[k]._cogs += netR * cogsPct / 100
      if (showSnd) agg[k]._snd += netR * sndPct / 100
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
        <ComposedChart data={grouped} margin={{ top: 4, right: 40, bottom: 30, left: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={grossColor} stopOpacity={0.2} /><stop offset="95%" stopColor={grossColor} stopOpacity={0} /></linearGradient>
            <linearGradient id={gradId + '_net'} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#B8960C" stopOpacity={0.15} /><stop offset="95%" stopColor="#B8960C" stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t1 }} tickFormatter={d => d?.slice(5)} />
          <YAxis yAxisId="rev" tick={{ fontSize: 10, fill: C.t1 }} tickFormatter={fmtTick} width={55} />
          <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 11px', fontSize: 11 }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: C.t2 }}>{label?.slice(5) || label}</div>
              {payload.map(p => {
                const isUnits = p.dataKey === 'units'
                const isCogs = p.dataKey === '_cogs'
                const isSnd = p.dataKey === '_snd'
                const pctLabel = isCogs ? ` (${(cogsPctLabel ?? cogsPct).toFixed(1)}%)` : isSnd ? ` (${(sndPctLabel ?? sndPct).toFixed(1)}%)` : ''
                return (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ color: C.t2 }}>{p.name}: {isUnits ? fmtN(p.value) : fmt(p.value)}{pctLabel}</span>
                  </div>
                )
              })}
            </div>
          ) : null} />
          <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} formatter={v => <span style={{ color: '#111' }}>{v}</span>} />
          <Area yAxisId="rev" type="monotone" dataKey={revKey} name="Gross Revenue" stroke={grossColor} fill={`url(#${gradId})`} strokeWidth={2} dot={false} />
          {showNet && <Area yAxisId="rev" type="monotone" dataKey="_net" name="Net Revenue" stroke="#B8960C" fill={`url(#${gradId}_net)`} strokeWidth={2} dot={false} strokeDasharray="4 2" />}
          {showCogs && <Line yAxisId="rev" type="monotone" dataKey="_cogs" name="COGS" stroke="#F59E0B" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />}
          {showSnd && <Line yAxisId="rev" type="monotone" dataKey="_snd" name="SnD" stroke="#92720A" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />}
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  )
}

// Shared sortable-table hook — click-to-sort column headers with a bidirectional toggle
// (desc first, then asc on repeat click), used by every matrix/leaderboard table across
// Sales/Ads/PnL tabs. `getters` maps sortKey -> row accessor so callers don't need to
// pre-flatten rows into a single sortable shape.
// Drag-to-reorder table columns, persisted to localStorage per table (keyed by `storageKey`) so
// a user's custom order survives refreshes/future visits. `columns` is the table's full,
// canonical column-id list in DEFAULT order — passed fresh on every render (it's fine for this
// to be a new array each time, only the ids are used as the identity). Returns the CURRENT
// order (validated against `columns` so a stale saved order from a since-changed column set
// never produces missing/duplicate/unknown ids) plus drag handlers to spread onto each header
// cell. Reordering only ever changes DISPLAY order — callers still key all cell/sort logic by
// column id, so no per-column rendering code needs to change to support this.
export function useReorderableColumns(storageKey, columns) {
  const defaultOrder = columns.map(c => c.id)
  const [order, setOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
      if (!Array.isArray(saved)) return defaultOrder
      // Validate: every id in the saved order must exist in the current column set, and every
      // current column must appear somewhere — otherwise fall back to default. This is what
      // keeps a saved order from a previous app version from silently hiding/duplicating columns
      // after a table's column set changes.
      const savedSet = new Set(saved)
      const defaultSet = new Set(defaultOrder)
      if (saved.length !== defaultOrder.length) return defaultOrder
      if (!saved.every(id => defaultSet.has(id))) return defaultOrder
      if (!defaultOrder.every(id => savedSet.has(id))) return defaultOrder
      return saved
    } catch { return defaultOrder }
  })
  const dragId = useRef(null)

  const persist = next => {
    setOrder(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* storage unavailable — order still holds for this session via state */ }
  }

  const onDragStart = id => e => {
    dragId.current = id
    e.dataTransfer.effectAllowed = 'move'
  }
  const onDragOver = e => e.preventDefault()
  const onDrop = id => e => {
    e.preventDefault()
    const from = dragId.current
    if (from == null || from === id) return
    const next = [...order]
    const fromIdx = next.indexOf(from)
    const toIdx = next.indexOf(id)
    if (fromIdx === -1 || toIdx === -1) return
    next.splice(fromIdx, 1)
    next.splice(toIdx, 0, from)
    persist(next)
    dragId.current = null
  }
  const resetOrder = () => persist(defaultOrder)

  const orderedColumns = order.map(id => columns.find(c => c.id === id)).filter(Boolean)
  const isDefaultOrder = order.length === defaultOrder.length && order.every((id, i) => id === defaultOrder[i])

  return { orderedColumns, onDragStart, onDragOver, onDrop, resetOrder, isDefaultOrder }
}

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
  // dragProps: optional {onDragStart, onDragOver, onDrop} from useReorderableColumns, spread
  // onto this <th> so the whole header becomes the drag handle (no separate grip icon — the
  // header itself stays clickable for sort; native HTML5 drag only engages on an actual
  // press-and-move gesture, so it doesn't fight with a plain click).
  const Th = ({ label, sortKey, style, align = 'right', children, dragProps }) => (
    <th onClick={() => onSort(sortKey)} draggable={!!dragProps} {...dragProps}
      style={{ ...style, textAlign: align, cursor: dragProps ? 'grab' : 'pointer', userSelect: 'none', whiteSpace: 'nowrap', color: sort?.key === sortKey ? C.t1 : (style?.color ?? C.t1), position: style?.position || 'relative' }}>
      {label}{sort?.key === sortKey ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
      {children}
    </th>
  )
  return { sort, onSort, sortRows, Th }
}
