import { useEffect, useRef, useState } from 'react'
import { C } from '../utils.js'

// Drill-down list (mockups/inventory_mobile_mockup.html "Stock explorer", "Daily sales by product"):
// level 0 rows → tap → level 1 rows → … → tap a leaf → onLeaf (the page's detail sheet). A breadcrumb
// at the top goes back up; the Android/browser Back button goes up one level (each level down
// pushes a history entry, like BottomSheet / FullScreenList). Display only - the page computes rows.
//   rootLabel        breadcrumb label for level 0 ("All categories")
//   getRows(path)    rows for the level under `path` (path = the rows tapped so far)
//   rowKey(row)      stable key; rowLabel(row): breadcrumb label
//   renderRow(row, depth)  the row's content (the list adds the tap target + ›)
//   canOpen(row, depth)    true → tapping drills down; otherwise tapping calls onLeaf(row, path)
//   resetKey         change it to jump back to level 0 (e.g. a new filter)
//   onPathChange(path)     optional: lets the page show level-specific counts
//   crumbRight       optional node at the breadcrumb's right end (e.g. "📍 PNQ")
//   limit            rows shown per level before a "Show more" button (default: all)
let nextId = 0

export default function DrillDownList({ rootLabel = 'All', getRows, rowKey, rowLabel, renderRow, canOpen, onLeaf, resetKey, onPathChange, crumbRight, emptyText = 'Nothing to show', limit, footer }) {
  const M = C.m
  const [path, setPath] = useState([])
  const [shown, setShown] = useState(limit || Infinity)
  const [id] = useState(() => `dd${++nextId}`)

  // A new level starts with its first `limit` rows again.
  const [lastDepth, setLastDepth] = useState(0)
  if (path.length !== lastDepth) { setLastDepth(path.length); setShown(limit || Infinity) }
  const [lastReset, setLastReset] = useState(resetKey)
  if (resetKey !== lastReset) { setLastReset(resetKey); if (path.length) setPath([]) }
  const changeRef = useRef(onPathChange)
  useEffect(() => { changeRef.current = onPathChange })
  useEffect(() => { changeRef.current?.(path) }, [path])

  // Back: the entry under the popped one tells how deep we now are (ours → its depth, else 0).
  useEffect(() => {
    const onPop = () => {
      const st = window.history.state
      const d = st?.drillDown === id ? st.depth : 0
      setPath(p => (d < p.length ? p.slice(0, d) : p))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [id])
  // Leaving the page while drilled in: drop our history entries.
  useEffect(() => () => {
    const st = window.history.state
    if (st?.drillDown === id && st.depth > 0) window.history.go(-st.depth)
  }, [id])

  const open = row => {
    const next = [...path, row]
    window.history.pushState({ drillDown: id, depth: next.length }, '')
    setPath(next)
  }
  // Breadcrumb: going up k levels = k Back steps, so history and the list stay in step.
  const upTo = depth => { const k = path.length - depth; if (k > 0) window.history.go(-k) }

  const rows = getRows(path)
  const depth = path.length
  return (
    <div className="drill-down">
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', minHeight: 28, fontSize: 12.5, color: M.muted }}>
        {[{ label: rootLabel }, ...path.map(p => ({ label: rowLabel(p) }))].map((c, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            {i > 0 && <span aria-hidden="true">›</span>}
            {i < depth
              ? <button type="button" onClick={() => upTo(i)} style={{ border: 'none', background: 'none', padding: '4px 0', color: M.green, fontWeight: 600, fontSize: 12.5, fontFamily: 'var(--font)', cursor: 'pointer', textAlign: 'left' }}>{c.label}</button>
              : <span style={{ color: M.ink, fontWeight: 600 }}>{c.label}</span>}
          </span>
        ))}
        {crumbRight && <span style={{ marginLeft: 'auto' }}>{crumbRight}</span>}
      </div>
      {!rows.length && <div style={{ padding: '14px 0', textAlign: 'center', color: M.muted, fontSize: 13 }}>{emptyText}</div>}
      {rows.slice(0, shown).map(r => {
        const drills = canOpen(r, depth)
        return (
          <button key={rowKey(r)} type="button" onClick={() => (drills ? open(r) : onLeaf?.(r, path))}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 48, padding: '8px 0', border: 'none', borderTop: `1px solid ${M.line}`, background: 'transparent', textAlign: 'left', fontFamily: 'var(--font)', color: M.ink, cursor: 'pointer' }}>
            <span style={{ flex: 1, minWidth: 0 }}>{renderRow(r, depth)}</span>
            {drills && <span aria-hidden="true" style={{ color: M.muted, fontSize: 18, lineHeight: 1 }}>›</span>}
          </button>
        )
      })}
      {rows.length > shown && (
        <button type="button" onClick={() => setShown(s => s + (limit || rows.length))}
          style={{ width: '100%', marginTop: 8, minHeight: 44, borderRadius: 12, border: `1px solid ${M.line}`, background: '#fff', color: M.green, fontWeight: 600, fontSize: 13.5, fontFamily: 'var(--font)', cursor: 'pointer' }}>
          Show {Math.min(limit, rows.length - shown)} more · {shown} of {rows.length}
        </button>
      )}
      {footer?.(path)}
    </div>
  )
}
