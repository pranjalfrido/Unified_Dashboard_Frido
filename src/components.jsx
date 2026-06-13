import { C, fmt, fmtN, pct } from './utils.js'
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export function KPICard({ label, icon, value, sub, accent }) {
  return (
    <div className="kpi-card flex flex-col gap-1">
      <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: C.t3 }}>{icon && <span style={{ fontSize: 13 }}>{icon}</span>}{label}</span>
      <span className="text-xl font-bold leading-tight" style={{ color: accent || C.t1 }}>{value}</span>
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

export function HBar({ dot, label, width, value, pctVal }) {
  return (
    <div className="flex items-center gap-2 py-1 border-b last:border-0" style={{ borderColor: C.border }}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />
      <span className="text-xs flex-shrink-0" style={{ color: C.t2, width: 66 }}>{label}</span>
      <div className="hb-track"><div className="hb-fill" style={{ width: `${width}%`, background: dot }} /></div>
      <span className="text-xs font-semibold text-right flex-shrink-0" style={{ color: C.t1, fontFamily: 'var(--mono)', minWidth: 54 }}>{value}</span>
      <span className="text-xs text-right flex-shrink-0" style={{ color: C.t3, minWidth: 30 }}>{pctVal}</span>
    </div>
  )
}

export function DataTable({ columns, rows, maxRows = 50 }) {
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
          {rows.slice(0, maxRows).map((r, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }} onMouseEnter={e => e.currentTarget.style.background = C.hov || '#F0EFF9'} onMouseLeave={e => e.currentTarget.style.background = ''}>
              {columns.map(c => (
                <td key={c.key + c.label} style={{ padding: '5.5px 5px', color: c.align === 'right' ? C.t1 : C.t2, textAlign: c.align === 'right' ? 'right' : 'left', fontFamily: c.mono ? 'var(--mono)' : 'inherit', fontSize: c.mono ? 11.5 : 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.render ? c.render(r[c.key], r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > maxRows && <div className="text-xs text-center py-2" style={{ color: C.t3 }}>Showing {maxRows} of {rows.length}</div>}
    </div>
  )
}

export function Card({ title, note, children, style }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 13, padding: '16px 18px', ...style }}>
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
        <Tooltip formatter={(v, n) => [fmt(v), n]} />
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
        <Tooltip formatter={v => [fmt(v), 'Revenue']} />
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
        <Tooltip formatter={(v, n) => [fmt(v), n]} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
        {channels.map(ch => <Line key={ch} type="monotone" dataKey={ch} stroke={C.ch[ch]} strokeWidth={2} dot={false} />)}
      </LineChart>
    </ResponsiveContainer>
  )
}
