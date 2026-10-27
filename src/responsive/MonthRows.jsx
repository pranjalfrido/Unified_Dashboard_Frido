import { C } from '../utils.js'

// Mobile month list (newest first): month, value, a grey sub-line and a thin stacked bar of its parts.
// months: [{ key, label, partial?: string, value: string, sub: string, parts: [{ key, value, color }] }];
// tap → onSelect(month) (the caller's sheet).
const M = C.m

export default function MonthRows({ months = [], onSelect }) {
  return months.map((m, i) => {
    const tot = m.parts.reduce((s, p) => s + Math.max(0, p.value || 0), 0) || 1
    return (
      <button key={m.key} type="button" onClick={() => onSelect?.(m)}
        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 0', minHeight: 56, border: 'none', borderBottom: i < months.length - 1 ? `1px solid ${M.line}` : 'none', background: 'transparent', fontFamily: 'var(--font)', color: M.ink, cursor: onSelect ? 'pointer' : 'default' }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13.5 }}>
          <span><b>{m.label}</b>{m.partial && <span style={{ fontSize: 12, color: M.muted }}> ({m.partial})</span>}</span>
          <b style={{ fontVariantNumeric: 'tabular-nums' }}>{m.value}</b>
        </span>
        <span style={{ display: 'block', fontSize: 12, color: M.muted, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>{m.sub}</span>
        <span aria-hidden="true" style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 6, background: M.line }}>
          {m.parts.map(p => <i key={p.key} style={{ width: `${Math.max(0, p.value || 0) / tot * 100}%`, background: p.color, display: 'block' }} />)}
        </span>
      </button>
    )
  })
}
