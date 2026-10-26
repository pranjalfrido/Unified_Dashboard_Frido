import { C } from '../utils.js'

// Status as a coloured dot + plain label (docs/responsive/INVENTORY_MOBILE_REDESIGN_PROMPT.md §4:
// no coloured pills). The page maps its own statuses to colours.
export default function StatusDot({ color, label, size = 8, fontSize = 12.5, muted = false }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, fontSize, fontWeight: 600, color: muted ? C.m.muted : C.m.ink, whiteSpace: 'nowrap' }}>
      <span aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </span>
  )
}
