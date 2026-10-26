import { C } from '../utils.js'

// One record row (mockups/sales_mobile_mockup.html .row.prod) - shared by MobileRankedList and
// FullScreenList so both look identical. Fixed 74px height: rank + name (max 2 lines, cut without
// "…"), sub-label (e.g. category) under the name, the sorted value + a secondary value on the
// right, and a thin bar pinned to the bottom. compact: height follows the content (rows with no
// sub-label, e.g. Inventory Top products) instead of the fixed 74px.
export default function RankedRow({ rank, name, sub, value, secondary, barPct, barTone, onClick, compact = false }) {
  const M = C.m
  return (
    <button type="button" onClick={onClick}
      style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', columnGap: 10, alignContent: 'start', width: '100%', ...(compact ? { minHeight: 46, padding: '6px 0 11px' } : { height: 74, padding: '8px 0 12px' }), border: 'none',
        borderBottom: `1px solid ${M.line}`, background: 'transparent', textAlign: 'left', fontFamily: 'var(--font)', color: M.ink, cursor: 'pointer', overflow: 'hidden' }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: M.type.listValue, fontWeight: 600, lineHeight: '17px', maxHeight: 34, overflow: 'hidden', overflowWrap: 'anywhere' }}>{rank}. {name}</span>
        {sub && <span style={{ display: 'block', fontSize: 12, lineHeight: '15px', color: M.muted, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>}
      </span>
      <span style={{ textAlign: 'right' }}>
        <span style={{ display: 'block', fontSize: M.type.listValue, fontWeight: 700, lineHeight: '17px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        {secondary && <span style={{ display: 'block', fontSize: 12, lineHeight: '15px', color: M.muted, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{secondary}</span>}
      </span>
      <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 5, height: 3, background: M.line, borderRadius: 2, overflow: 'hidden' }}>
        <i style={{ display: 'block', height: '100%', width: `${Math.max(1, Math.min(100, barPct || 0))}%`, background: barTone === 'bad' ? M.down : M.green, borderRadius: 2 }} />
      </span>
    </button>
  )
}
