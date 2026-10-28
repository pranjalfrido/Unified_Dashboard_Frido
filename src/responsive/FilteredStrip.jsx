import { C } from '../utils.js'

// Slim "Filtered:" strip (docs/responsive/MOBILE_DESIGN_SYSTEM.md §2): one chip per active filter,
// ✕ on a chip clears that filter, Clear clears them all. Scrolls sideways when there are many.
// Renders nothing when no filter is active.
//   items: [{ key, label, text }]; tone 'dark' = on the green phone header, 'light' = on the page
export default function FilteredStrip({ items, onRemove, onClear, tone = 'dark' }) {
  if (!items?.length) return null
  const dark = tone === 'dark'
  const M = C.m
  return (
    <div className="filtered-strip" role="region" aria-label="Active filters"
      style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', padding: '6px 16px 8px',
        background: dark ? '#1c4630' : M.soft, borderBottom: dark ? 'none' : `1px solid ${M.line}` }}>
      <span style={{ flex: '0 0 auto', fontSize: 12, fontWeight: 600, color: dark ? 'rgba(255,255,255,.65)' : M.muted }}>Filtered:</span>
      {items.map(i => (
        <button key={i.key} type="button" onClick={() => onRemove(i.key)} aria-label={`Remove filter ${i.label}: ${i.text}`}
          style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 28, maxWidth: 220, padding: '0 10px', borderRadius: M.radius.chip, fontSize: 12, fontFamily: 'var(--font)', cursor: 'pointer',
            background: dark ? 'rgba(255,255,255,.12)' : '#fff', color: dark ? '#fff' : M.ink, border: `1px solid ${dark ? 'rgba(255,255,255,.25)' : M.line}` }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><b style={{ fontWeight: 600 }}>{i.label}:</b> {i.text}</span>
          <span aria-hidden="true" style={{ opacity: .8 }}>✕</span>
        </button>
      ))}
      <button type="button" onClick={onClear}
        style={{ flex: '0 0 auto', minHeight: 28, fontSize: 12, fontFamily: 'var(--font)', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', color: dark ? 'rgba(255,255,255,.75)' : M.green }}>Clear</button>
    </div>
  )
}
