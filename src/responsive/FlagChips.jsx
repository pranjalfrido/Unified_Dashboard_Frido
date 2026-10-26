import { C } from '../utils.js'
import { RULES } from './useMarginRules.js'

// A product's watchlist flags (useMarginRules flagsByKey, already in chip order: Loss, CM1, COGS, GM,
// Returns, Returns ↑, ASP ↓, ROAS). Laptop: named chips, max `max` (default 2) + "+n", hover shows the full list.
// Mobile: up to 3 dots (red = Loss, amber = the rest) with the list as the accessible label.
const M = C.m
const CHIP_LABEL = Object.fromEntries(RULES.map(r => [r.id, r.chip]))

export default function FlagChips({ ids = [], names = {}, variant = 'laptop', max = 2 }) {
  if (!ids.length) return variant === 'mobile' ? null : <span style={{ color: C.t3 }}>—</span>
  const full = ids.map(id => names[id] || CHIP_LABEL[id]).join(' · ')
  if (variant === 'mobile') {
    return (
      <span role="img" aria-label={`Flags: ${full}`} title={full} style={{ display: 'inline-flex', gap: 3, marginRight: 6, verticalAlign: 'middle' }}>
        {ids.slice(0, 3).map(id => <i key={id} style={{ width: 7, height: 7, borderRadius: '50%', background: id === 'loss' ? M.down : M.amber, display: 'inline-block' }} />)}
      </span>
    )
  }
  const chip = id => (
    <span key={id} style={{ fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 999, whiteSpace: 'nowrap',
      background: id === 'loss' ? C.red.bg : 'rgba(200,134,10,.12)', color: id === 'loss' ? C.red.tx : '#8a5a00' }}>{CHIP_LABEL[id]}</span>
  )
  return (
    <span title={full} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', overflow: 'hidden', maxWidth: '100%' }}>
      {ids.slice(0, max).map(chip)}
      {ids.length > max && <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 999, background: C.bg, color: C.t2 }}>+{ids.length - max}</span>}
    </span>
  )
}
