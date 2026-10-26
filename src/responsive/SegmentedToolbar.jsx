import { C } from '../utils.js'

// Compact segmented toolbar (LOGISTICS_MOBILE_REDESIGN_PROMPT.md §2b, mockup #csCtl): 38px, soft
// background, equal segments split by thin dividers, each a small line icon + value + caret. A
// segment with `active` becomes a raised white pill in Frido green; `badge` shows a count instead
// of the value text. segments: [{ id, icon: 'layers'|'funnel'|'sort', value, badge, active, label, onClick }]
const ICONS = {
  layers: <path d="M12 3 2 8l10 5 10-5-10-5zM2 13l10 5 10-5M2 17.5l10 5 10-5" />,
  funnel: <path d="M3 5h18l-7 8v6l-4-2v-4z" />,
  sort: <path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4" />,
}

export default function SegmentedToolbar({ segments, label = 'View options' }) {
  const M = C.m
  return (
    <div role="toolbar" aria-label={label} style={{ display: 'flex', alignItems: 'stretch', height: 38, background: M.soft, borderRadius: 10, padding: 3, gap: 0 }}>
      {segments.map((s, i) => (
        <span key={s.id} style={{ display: 'flex', flex: '1 1 0', minWidth: 0, alignItems: 'stretch' }}>
          {i > 0 && <span aria-hidden="true" style={{ width: 1, margin: '7px 0', background: s.active || segments[i - 1].active ? 'transparent' : M.g4 }} />}
          <button type="button" aria-label={s.label} aria-haspopup="dialog" onClick={s.onClick}
            style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)',
              fontSize: 12.5, fontWeight: 600, color: s.active ? M.green : M.ink, background: s.active ? '#fff' : 'transparent', boxShadow: s.active ? '0 1px 3px rgba(0,0,0,.10)' : 'none', padding: '0 6px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>{ICONS[s.icon]}</svg>
            {s.badge ? <b style={{ minWidth: 18, height: 18, borderRadius: 9, background: M.green, color: '#fff', fontSize: 11, lineHeight: '18px', textAlign: 'center', padding: '0 5px' }}>{s.badge}</b>
              : <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.value}</span>}
          </button>
        </span>
      ))}
    </div>
  )
}
