import { C } from '../utils.js'

// Laptop-only row × column heat table (e.g. channel × day spend). Each cell's shade = its value relative
// to that ROW's own max, so small channels still show their pattern. rows: [{ key, label, cells: [v],
// total, marks?: Set(colIndex) }], cols: [label]; fmt for titles and the row total; a mark (◌) flags a
// cell (e.g. revenue pending). Scrolls sideways inside its card only if it can't fit.
const M = C.m

export default function HeatTable({ rows = [], cols = [], fmt = v => String(v), totalLabel = 'Total', markLabel }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 2, fontSize: 11, tableLayout: 'fixed', minWidth: 120 + cols.length * 26 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', color: M.muted, fontWeight: 600, width: 96, padding: '2px 4px' }}></th>
            {cols.map((c, i) => <th key={i} style={{ color: M.muted, fontWeight: 600, padding: '2px 0', textAlign: 'center' }}>{c}</th>)}
            <th style={{ color: M.muted, fontWeight: 600, width: 78, textAlign: 'right', padding: '2px 4px' }}>{totalLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const max = Math.max(1e-9, ...r.cells.map(v => v || 0))
            return (
              <tr key={r.key}>
                <td style={{ fontWeight: 600, color: M.ink, padding: '0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.label}>{r.label}</td>
                {r.cells.map((v, i) => {
                  const a = 0.06 + 0.86 * ((v || 0) / max)
                  return (
                    <td key={i} title={`${r.label} · ${cols[i]} · ${fmt(v || 0)}${r.marks?.has(i) && markLabel ? ` · ${markLabel}` : ''}`}
                      style={{ height: 20, borderRadius: 3, background: `rgba(31,90,61,${a.toFixed(2)})`, color: a > 0.55 ? '#fff' : M.ink, textAlign: 'center' }}>
                      {r.marks?.has(i) ? '◌' : ''}
                    </td>
                  )
                })}
                <td style={{ textAlign: 'right', fontWeight: 700, color: M.ink, padding: '0 4px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmt(r.total)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
