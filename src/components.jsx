import { C, fmt, fmtN, pct } from './utils.js'
import { useEffect, useRef } from 'react'
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer }

export function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 12px', fontSize: 11, boxShadow: '0 4px 16px rgba(0,0,0,.10)' }}>
      <div style={{ fontWeight: 700, color: C.t2, marginBottom: 5 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0, border: p.color === '#FFD600' ? '1px solid #E6C200' : 'none' }} />
          <span style={{ color: C.t2 }}>{p.name}</span>
          <span style={{ fontWeight: 700, color: C.t1, marginLeft: 'auto', paddingLeft: 12, fontFamily: 'var(--mono)' }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

function Sparkline({ id, data, color }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !data?.length) return
    const ctx = canvas.getContext('2d')
    canvas.width = 72; canvas.height = 32
    const min = Math.min(...data), max = Math.max(...data)
    const range = max - min || 1
    const w = 72, h = 32, pad = 3
    const pts = data.map((v, i) => [
      pad + (i / (data.length - 1)) * (w - pad * 2),
      h - pad - ((v - min) / range) * (h - pad * 2)
    ])
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    pts.slice(1).forEach(([x, y]) => ctx.lineTo(x, y))
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.lineTo(pts[pts.length - 1][0], h); ctx.lineTo(pts[0][0], h); ctx.closePath()
    ctx.fillStyle = color + '22'; ctx.fill()
  }, [data, color])
  return <canvas ref={ref} style={{ width: 72, height: 32, flexShrink: 0 }} />
}

export function KPICard({ label, icon, value, sub, accent, center, sparkline, sparkColor, trend, trendLabel, borderColor, dotColor }) {
  if (sparkline) {
    const isUp = trend > 0
    return (
      <div className="hero-kpi">
        <div className="hero-kpi-top">
          <div className="hero-kpi-body">
            <div className="kpi-label">{label}</div>
            <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-.02em', lineHeight: 1.1, color: accent || C.t1, marginTop: 2 }}>{value}</div>
          </div>
          <Sparkline data={sparkline} color={sparkColor || C.acc} />
        </div>
        <div className="hero-kpi-foot">
          <span style={{ fontSize: 10.5, color: C.t3 }}>vs prior 3 days</span>
          <span className={`trend ${isUp ? 'up' : 'dn'}`}>{isUp ? '↑' : '↓'} {trendLabel}</span>
        </div>
      </div>
    )
  }
  return (
    <div className="kpi-card flex flex-col gap-1" style={{ ...(center ? { alignItems: 'center', justifyContent: 'center', textAlign: 'center' } : {}), ...(borderColor ? { borderTopColor: borderColor, borderTopWidth: 2 } : {}) }}>
      <span className="kpi-label flex items-center gap-1" style={{ justifyContent: center ? 'center' : undefined }}>{icon && <span style={{ fontSize: 13 }}>{icon}</span>}{label}</span>
      <span style={{ fontSize: center ? 26 : 22, fontWeight: 500, letterSpacing: '-.02em', lineHeight: 1.1, color: accent || C.t1 }}>{value}</span>
      {sub && <span className="kpi-sub">{dotColor && <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, display: 'inline-block', marginRight: 4, verticalAlign: 'middle', flexShrink: 0 }} />}{sub}</span>}
    </div>
  )
}

export function AlertCard({ type, title, body }) {
  const s = { red: 'al-R', amber: 'al-A', green: 'al-G', blue: 'al-B' }[type] || 'al-B'
  const icon = type === 'green' ? '★' : type === 'blue' ? 'ℹ' : '⚠'
  return (
    <div className={`flex items-start gap-2 ${s}`}>
      <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 11.5, opacity: 0.75, lineHeight: 1.55 }}>{body}</div>
      </div>
    </div>
  )
}

export function HBar({ dot, label, width, value, pctVal }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 0', borderBottom: `1px solid ${C.border}` }} className="hbar-row">
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: C.t2, flexShrink: 0, width: 110 }}>{label}</span>
      <div className="hb-track" style={{ flex: 1 }}><div className="hb-fill" style={{ width: `${width}%`, background: dot }} /></div>
      <span style={{ fontSize: 12, fontWeight: 700, color: C.t1, fontFamily: 'var(--mono)', flexShrink: 0, minWidth: 62, textAlign: 'right' }}>{value}</span>
      <span style={{ fontSize: 11, color: C.t3, flexShrink: 0, width: 36, textAlign: 'right' }}>{pctVal}</span>
    </div>
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

export function Card({ title, note, children, style }) {
  return (
    <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 13, padding: '16px 18px', height: '100%', boxSizing: 'border-box', ...style }}>
      {(title || note) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
          {title && <span style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>{title}</span>}
          {note && <span style={{ fontSize: 11.5, color: C.t3 }}>{note}</span>}
        </div>
      )}
      {children}
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
