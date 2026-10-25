import { C } from '../utils.js'

// One line per item for simple breakdowns (channels, categories, regions, tiers, states):
// name · value · % on one line, a thin Frido-green bar under it. Tappable when onClick is given.
export default function CompactRankRow({ name, value, pct, barPct, onClick, last = false }) {
  const M = C.m
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', alignItems: 'baseline', gap: '3px 8px', width: '100%', padding: '7px 0', border: 'none',
        borderBottom: last ? 'none' : `1px solid ${M.line}`, background: 'transparent', textAlign: 'left', fontFamily: 'var(--font)', color: M.ink, cursor: onClick ? 'pointer' : 'default' }}>
      <span style={{ fontSize: M.type.listValue, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
      <span style={{ fontSize: M.type.listValue, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</span>
      <span style={{ fontSize: 12, color: M.muted, minWidth: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pct}</span>
      <span aria-hidden="true" style={{ gridColumn: '1 / -1', height: 3, background: M.line, borderRadius: 2, overflow: 'hidden', marginTop: 1 }}>
        <i style={{ display: 'block', height: '100%', width: `${Math.max(1, Math.min(100, barPct || 0))}%`, background: M.green, borderRadius: 2 }} />
      </span>
    </Tag>
  )
}
