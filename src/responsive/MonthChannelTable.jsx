import { C } from '../utils.js'

// Month × item table (laptop), e.g. the last 6 months of ad spend by channel.
//   months  [{ key, label, partial?: string }]   (oldest → newest; a partial month is greyed, "*")
//   rows    [{ key, label, values: { [monthKey]: number|null } }]
//   total   { [monthKey]: number|null } for the Total row (the caller decides how it's derived)
//   change  'neutral' (spend: grey ▲/▼) | 'good-up' (revenue, ROAS: ▲ green, ▼ red) | null
// ▲/▼ compares each full month with the month before; none on the first or a partial month.
const M = C.m

export default function MonthChannelTable({ months = [], rows = [], total = {}, fmt, change = 'neutral', caption }) {
  const badge = (v, p) => {
    if (change == null || v == null || p == null || !(p > 0)) return null
    const d = (v - p) / p * 100
    if (Math.abs(d) < 0.5) return null
    const color = change === 'neutral' ? M.muted : d > 0 ? M.up : M.down
    return <span style={{ marginLeft: 5, fontSize: 11, fontWeight: 600, color }}>{d > 0 ? '▲' : '▼'}{Math.abs(d).toFixed(0)}%</span>
  }
  const cell = (vals, m, j) => {
    const v = vals[m.key]
    const prev = j > 0 && !m.partial ? vals[months[j - 1].key] : null
    return <>{v == null ? '—' : fmt(v)}{badge(v, prev)}</>
  }
  const th = { textAlign: 'right', fontSize: 12, fontWeight: 600, color: M.muted, padding: '6px 8px', borderBottom: `1px solid ${M.line}`, whiteSpace: 'nowrap' }
  const td = { textAlign: 'right', fontSize: 12.5, padding: '7px 8px', borderBottom: `1px solid ${M.line}`, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: M.ink }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={{ ...th, textAlign: 'left' }}>Channel</th>{months.map(m => <th key={m.key} style={th}>{m.label}{m.partial ? '*' : ''}</th>)}</tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key}>
              <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{r.label}</td>
              {months.map((m, j) => <td key={m.key} style={{ ...td, color: m.partial ? M.muted : M.ink }}>{cell(r.values, m, j)}</td>)}
            </tr>
          ))}
          <tr>
            <td style={{ ...td, textAlign: 'left', fontWeight: 700, borderBottom: 'none' }}>Total</td>
            {months.map((m, j) => <td key={m.key} style={{ ...td, fontWeight: 700, borderBottom: 'none', color: m.partial ? M.muted : M.ink }}>{cell(total, m, j)}</td>)}
          </tr>
        </tbody>
      </table>
      {caption && <div style={{ fontSize: 12, color: M.muted, marginTop: 6 }}>{caption}</div>}
    </div>
  )
}
