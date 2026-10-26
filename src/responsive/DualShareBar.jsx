import { C } from '../utils.js'

// Two thin bars per row to compare two shares of the same item (e.g. a channel's share of spend vs its
// share of revenue). rows: [{ key, label, a, b, note }] with a / b as % (0–100); labels: [aLabel, bLabel].
// Laptop and mobile use the same rows; `limit` + onAll gives "Show all n".
const M = C.m

export default function DualShareBar({ rows, labels = ['Spend', 'Revenue'], colors = [M.green, M.g3], limit, onAll }) {
  const shown = limit ? rows.slice(0, limit) : rows
  return (
    <div>
      <div style={{ display: 'flex', gap: 14, fontSize: 12, color: M.muted, marginBottom: 6 }}>
        {labels.map((l, i) => <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 10, height: 6, borderRadius: 2, background: colors[i], display: 'inline-block' }} />{l} share</span>)}
      </div>
      {shown.map((r, i) => (
        <div key={r.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(70px, 26%) minmax(0,1fr) 92px', alignItems: 'center', columnGap: 10, padding: '7px 0', borderBottom: i < shown.length - 1 ? `1px solid ${M.line}` : 'none' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: M.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.note || r.label}>{r.label}</span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {[r.a, r.b].map((v, j) => (
              <span key={j} style={{ height: 6, borderRadius: 3, background: M.line, overflow: 'hidden' }}>
                <i style={{ display: 'block', height: '100%', width: `${Math.max(0.5, Math.min(100, v || 0))}%`, background: colors[j], borderRadius: 3 }} />
              </span>
            ))}
          </span>
          <span style={{ textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums', lineHeight: '15px' }}>
            <b style={{ color: M.ink }}>{(r.a || 0).toFixed(1)}%</b><br /><span style={{ color: M.muted }}>{(r.b || 0).toFixed(1)}%</span>
          </span>
        </div>
      ))}
      {limit && rows.length > limit && (
        <button type="button" onClick={onAll} style={{ marginTop: 8, width: '100%', minHeight: 40, borderRadius: 12, border: `1px solid ${M.line}`, background: '#fff', color: M.green, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>Show all {rows.length} →</button>
      )}
    </div>
  )
}
