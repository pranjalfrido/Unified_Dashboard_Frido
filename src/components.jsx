import { useState, useRef, Fragment, useEffect } from 'react'
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
  const mobCard = window.innerWidth <= 768
  const labelWidthFor = names => mobCard ? 150 : Math.min(260, Math.max(132, Math.max(...names.map(n => n.length), 0) * 7.8 + 8))

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

  const ROW_H = 32
  const CARD_CHROME = 52 // title row + padding
  const mobFixedH = mobCard ? (catRows.length * ROW_H + CARD_CHROME) : undefined

  return (
    <Card fill title="Category Revenue" style={{ height: mobCard ? mobFixedH : height, alignSelf: 'start' }} action={
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

export function Card({ title, note, action, children, style, fill, titleNoWrap }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 13, padding: '16px 18px', height: '100%', boxSizing: 'border-box', display: fill ? 'flex' : undefined, flexDirection: fill ? 'column' : undefined, ...style }}>
      {(title || note || action) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {title && <span style={{ fontSize: 13, fontWeight: 600, color: C.t1, whiteSpace: titleNoWrap ? 'nowrap' : undefined }}>{title}</span>}
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
  const [isMob, setIsMob] = useState(window.innerWidth <= 768)
  useEffect(() => { const h = () => setIsMob(window.innerWidth <= 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h) }, [])
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
    <Card title={title} style={boxHeight ? { height: isMob ? 'auto' : boxHeight } : undefined} action={
      <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={selStyle}>
        {GROUP_OPTS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
      </select>
    }>
      <div style={isMob ? { margin: '0 -28px' } : {}}>
      <ResponsiveContainer width="100%" height={isMob ? 220 : '100%'} minHeight={220}>
        <ComposedChart data={grouped} margin={{ top: 4, right: isMob ? 44 : 40, bottom: isMob ? 20 : 30, left: isMob ? 44 : 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={grossColor} stopOpacity={0.2} /><stop offset="95%" stopColor={grossColor} stopOpacity={0} /></linearGradient>
            <linearGradient id={gradId + '_net'} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#B8960C" stopOpacity={0.15} /><stop offset="95%" stopColor="#B8960C" stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={d => d?.slice(5)} ticks={(() => { const k = grouped.map(d => d.date); const n = k.length; if (n <= 4) return k; return [k[0], k[Math.floor(n/3)], k[Math.floor(2*n/3)], k[n-1]] })()} height={isMob ? 24 : 20} />
          <YAxis yAxisId="rev" hide={isMob} tick={{ fontSize: 10, fill: C.t1 }} tickFormatter={fmtTick} width={isMob ? 0 : 55} />
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
          {!isMob && <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} formatter={v => <span style={{ color: '#111' }}>{v}</span>} />}
          <Area yAxisId="rev" type="monotone" dataKey={revKey} name="Gross Revenue" stroke={grossColor} fill={`url(#${gradId})`} strokeWidth={2} dot={false} />
          {showNet && <Area yAxisId="rev" type="monotone" dataKey="_net" name="Net Revenue" stroke="#B8960C" fill={`url(#${gradId}_net)`} strokeWidth={2} dot={false} strokeDasharray="4 2" />}
          {showCogs && <Line yAxisId="rev" type="monotone" dataKey="_cogs" name="COGS" stroke="#F59E0B" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />}
          {showSnd && <Line yAxisId="rev" type="monotone" dataKey="_snd" name="SnD" stroke="#92720A" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />}
        </ComposedChart>
      </ResponsiveContainer>
      </div>
      {isMob && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 12px', marginTop: 6 }}>
          {[{ name: 'Gross Revenue', color: grossColor }, ...(showNet ? [{ name: 'Net Revenue', color: '#B8960C' }] : []), ...(showCogs ? [{ name: 'COGS', color: '#F59E0B' }] : []), ...(showSnd ? [{ name: 'SnD', color: '#92720A' }] : [])].map(it => (
            <span key={it.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#111' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: it.color, display: 'inline-block', flexShrink: 0 }} />{it.name}
            </span>
          ))}
        </div>
      )}
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

// Small pill toggle switching a table's basis between 'qty' and 'revenue' — used by the D2C
// Return Analysis page's Top Products widget and its Category/Month/Payment-type tables so the
// Revenue column AND every Cancel/RTO/CIR/Exchange/Total-Return % column switch basis together
// (qty mode = % of units returned, revenue mode = % of revenue lost — never a mix of the two).
export function QtyRevToggle({ value, onChange }) {
  const btnStyle = v => ({ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${value === v ? C.acm : C.border}`, background: value === v ? C.acc : 'transparent', color: value === v ? C.t1 : C.t2, cursor: 'pointer', fontFamily: 'var(--font)' })
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <button style={btnStyle('qty')} onClick={() => onChange('qty')}>Qty</button>
      <button style={btnStyle('revenue')} onClick={() => onChange('revenue')}>Rev</button>
    </div>
  )
}

// Return-badge helper — "higher is worse" for return-type metrics, so a rise shows red and a
// fall shows green (inverted vs a normal revenue badge). Shared by every KPI/table on the D2C
// Return Analysis page — see api/_bq.js's computeNetRevenueMeasures for the underlying formula
// this colors, and App.jsx's ShopifyTab (D2C Overview) for the original inline version this was
// lifted from, kept byte-for-byte identical so both pages agree on what counts as an improvement.
export function returnBadge(curPct, prevPct) {
  if (!prevPct) return null
  const p = (curPct - prevPct) / prevPct * 100
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p > 0 ? C.red.bg : C.green.bg, color: p > 0 ? C.red.tx : C.green.tx, flexShrink: 0 }}>{p > 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span>
}

// Shared 8-column return-breakdown table: {rowLabel col(s)} + Revenue/Qty + Cancel%/RTO%/CIR%/
// Exchange%/Total Return% — used for D2C Return Analysis sections 4 (Category), 5 (Last 6
// months), and 6 (Payment-type). `rows` items must carry the *Pct fields from
// api/return-analysis.js's withPct() plus whatever labelCols name (e.g. category+subCategory,
// or month, or paymentType). `basis`: 'qty' | 'revenue' selects which Revenue/%% fields render.
// `labelCols`: [{key, label, render?}] — one or two leading columns identifying the row. Each
// entry may carry an optional `render(value, row)` to reformat the display text (e.g. an ISO
// '2026-07' month key rendered as 'Jul-26') without changing the underlying value sorting keys
// off of — `key` itself always stays the raw, lexicographically-sortable field.
// `getVariants(row)` (optional): returns that row's SKU/variant rows (same shape as `rows`
// items) — when supplied, the last labelCol becomes clickable with a rotating ▶ chevron (same
// interaction as App.jsx's FlatCategoryProductMatrix) that expands indented variant rows below,
// e.g. "Posture Corrector" → its S/M/L/XL SKUs. Omit for tables with no natural drill-down (the
// Monthly and Payment-type tables).
export function ReturnBreakdownTable({ title, rows, labelCols, basis, search, onSearchChange, onExport, getVariants, maxHeight = 420, action, defaultSortKey = 'revenue', defaultSortDir = 'desc' }) {
  const { sortRows, Th } = useSortableTable(defaultSortKey, defaultSortDir)
  const [expanded, setExpanded] = useState({})
  const revKey = basis === 'qty' ? 'qty' : 'revenue'
  const pctSuffix = basis === 'qty' ? 'PctQty' : 'Pct'
  const rowKey = r => labelCols.map(c => r[c.key]).join('::')
  const filtered = search
    ? rows.filter(r => labelCols.some(c => String(r[c.key] || '').toLowerCase().includes(search.toLowerCase())))
    : rows
  const getters = {
    revenue: r => r[revKey],
    cancelPct: r => r[`cancel${pctSuffix}`],
    rtoPct: r => r[`rto${pctSuffix}`],
    cirPct: r => r[`cir${pctSuffix}`],
    exchangePct: r => r[`exchange${pctSuffix}`],
    totalReturnPct: r => r[`totalReturn${pctSuffix}`],
    // Also expose each label column as its own sort key (e.g. 'month', 'category') so a caller
    // can default-sort by it (Monthly table → latest-to-oldest) and its <th> becomes clickable.
    ...Object.fromEntries(labelCols.map(c => [c.key, r => r[c.key]])),
  }
  const sortedRows = sortRows(filtered, getters)
  const thStyle = { fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: C.t3, padding: '3px 4px 7px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'normal', lineHeight: 1.25, position: 'sticky', top: 0, background: C.card, zIndex: 1 }
  const fmtPct = v => `${(v || 0).toFixed(1)}%`
  // Conditional formatting: only flag numbers PAST the agreed bad threshold in red — every
  // other value (including 0%, which is good) stays plain ink. Never colors a "good" number.
  const RED_THRESH = { cancelPct: 3, rtoPct: 9, cirPct: 9, exchangePct: 6, totalReturnPct: 20 }
  const cellColor = (key, val) => (val || 0) > RED_THRESH[key] ? '#B91C1C' : C.t1
  const metricCells = (r, mono, size) => (
    <>
      <td style={{ padding: '5.5px 5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: size ?? 11.5, color: C.t1, whiteSpace: 'nowrap' }}>{basis === 'qty' ? fmtN(r.qty) : fmt(r.revenue)}</td>
      <td style={{ padding: '5.5px 5px', textAlign: 'right', fontSize: size, color: cellColor('cancelPct', getters.cancelPct(r)), whiteSpace: 'nowrap' }}>{fmtPct(getters.cancelPct(r))}</td>
      <td style={{ padding: '5.5px 5px', textAlign: 'right', fontSize: size, color: cellColor('rtoPct', getters.rtoPct(r)), whiteSpace: 'nowrap' }}>{fmtPct(getters.rtoPct(r))}</td>
      <td style={{ padding: '5.5px 5px', textAlign: 'right', fontSize: size, color: cellColor('cirPct', getters.cirPct(r)), whiteSpace: 'nowrap' }}>{fmtPct(getters.cirPct(r))}</td>
      <td style={{ padding: '5.5px 5px', textAlign: 'right', fontSize: size, color: cellColor('exchangePct', getters.exchangePct(r)), whiteSpace: 'nowrap' }}>{fmtPct(getters.exchangePct(r))}</td>
      <td style={{ padding: '5.5px 5px', textAlign: 'right', fontSize: size, fontWeight: 700, color: cellColor('totalReturnPct', getters.totalReturnPct(r)), whiteSpace: 'nowrap' }}>{fmtPct(getters.totalReturnPct(r))}</td>
    </>
  )

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 13, padding: '14px 16px', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11, gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {action}
          {onSearchChange && (
            <input value={search} onChange={e => onSearchChange(e.target.value)} placeholder="Search..." style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.border2}`, background: '#fff', color: C.t1, outline: 'none', fontFamily: 'var(--font)', width: 150 }} />
          )}
          {onExport && <button onClick={onExport} style={{ fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)' }}>Export CSV</button>}
        </div>
      </div>
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight, flex: 1, minHeight: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 12 }}>
          <colgroup>
            {/* Label columns get a fixed share; when there are two (Category + Sub-category),
                the first gets a narrow fixed slice (short words like "Footwear") and the second
                — the one with the longer, more variable names — gets the rest of the label
                budget. The 6 metric columns split the remainder, with Total Return % given extra
                room since it's the longest header + carries the boldest value. */}
            {(() => {
              const labelShare = labelCols.length === 1 ? 22 : 40
              const metricShare = 100 - labelShare
              const totalReturnShare = metricShare * 0.22
              const otherMetricShare = (metricShare - totalReturnShare) / 5
              const firstLabelShare = labelCols.length === 2 ? 12 : labelShare
              return (
                <>
                  {labelCols.map((c, i) => (
                    <col key={c.key} style={{ width: `${labelCols.length === 2 ? (i === 0 ? firstLabelShare : labelShare - firstLabelShare) : labelShare / labelCols.length}%` }} />
                  ))}
                  <col style={{ width: `${otherMetricShare}%` }} />
                  <col style={{ width: `${otherMetricShare}%` }} />
                  <col style={{ width: `${otherMetricShare}%` }} />
                  <col style={{ width: `${otherMetricShare}%` }} />
                  <col style={{ width: `${otherMetricShare}%` }} />
                  <col style={{ width: `${totalReturnShare}%` }} />
                </>
              )
            })()}
          </colgroup>
          <thead>
            <tr>
              {labelCols.map(c => <Th key={c.key} label={c.label} sortKey={c.key} style={thStyle} align="left" />)}
              <Th label={basis === 'qty' ? 'Qty' : 'Revenue'} sortKey="revenue" style={thStyle} align="right" />
              <Th label="Cancel %" sortKey="cancelPct" style={thStyle} align="right" />
              <Th label="RTO %" sortKey="rtoPct" style={thStyle} align="right" />
              <Th label="CIR %" sortKey="cirPct" style={thStyle} align="right" />
              <Th label="Exchange %" sortKey="exchangePct" style={thStyle} align="right" />
              <Th label="Total Return %" sortKey="totalReturnPct" style={thStyle} align="right" />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r, i) => {
              const key = rowKey(r)
              const variants = getVariants ? getVariants(r) : null
              const hasVariants = variants && variants.length > 0
              const isOpen = expanded[key]
              return (
                <Fragment key={key}>
                  <tr style={{ borderBottom: (i < sortedRows.length - 1 && !isOpen) ? `1px solid ${C.border}` : 'none' }} onMouseEnter={e => e.currentTarget.style.background = '#FFFBE6'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                    {labelCols.map((c, ci) => {
                      const displayVal = c.render ? c.render(r[c.key], r) : (r[c.key] ?? '—')
                      return (
                        <td key={c.key} style={{ padding: '5.5px 5px', color: C.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(r[c.key] ?? '')}>
                          {ci === labelCols.length - 1 && hasVariants ? (
                            <span onClick={() => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))} style={{ cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600, color: C.t1, maxWidth: '100%' }}>
                              <span style={{ fontSize: 9, color: C.t3, display: 'inline-block', flexShrink: 0, transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>▶</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayVal}</span>
                            </span>
                          ) : displayVal}
                        </td>
                      )
                    })}
                    {metricCells(r)}
                  </tr>
                  {isOpen && variants.map((v, vi) => (
                    <tr key={v.sku} style={{ background: C.bg, borderBottom: (vi < variants.length - 1 || i < sortedRows.length - 1) ? `1px solid ${C.border}` : 'none' }} onMouseEnter={e => e.currentTarget.style.background = '#FFFBE6'} onMouseLeave={e => e.currentTarget.style.background = C.bg}>
                      {labelCols.map((c, ci) => (
                        <td key={c.key} style={{ padding: '4px 5px', color: C.t3, fontFamily: ci === labelCols.length - 1 ? 'var(--mono)' : 'inherit', fontSize: 11, paddingLeft: ci === labelCols.length - 1 ? 22 : 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ci === labelCols.length - 1 ? v.sku : ''}>
                          {ci === labelCols.length - 1 ? `↳ ${v.sku}` : ''}
                        </td>
                      ))}
                      {metricCells(v, true, 11)}
                    </tr>
                  ))}
                </Fragment>
              )
            })}
            {sortedRows.length === 0 && (
              <tr><td colSpan={labelCols.length + 6} style={{ padding: '20px 5px', textAlign: 'center', color: C.t3, fontSize: 12 }}>No data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
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
