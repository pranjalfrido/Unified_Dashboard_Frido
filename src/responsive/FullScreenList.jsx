import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { C } from '../utils.js'
import RankedRow from './RankedRow.jsx'

// "Show all" for record lists (mockups/sales_mobile_mockup.html #full): a full-screen page that
// slides in over the current one. Search, the same sort chips, optional group chips (e.g.
// category), a count, 20 rows at a time + "Load more" (fine for 200–1000+ items), and ‹ back -
// which is also what the Android/browser Back button does (opening pushes a history entry).
//   items, sorts, name, sub, secondary, searchText, groupOf: same meaning as MobileRankedList
//   onSelect(item): open the item's detail (the caller's BottomSheet)
const PAGE = 20

export default function FullScreenList({ open, onClose, title, noun = 'items', items, sorts, initialSort, name, sub, secondary, searchText, groupOf, onSelect }) {
  const M = C.m
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState(initialSort || sorts[0].key)
  const [group, setGroup] = useState('All')
  const [shown, setShown] = useState(PAGE)
  const [lastInitial, setLastInitial] = useState(initialSort)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })
  // Opening again from a list sorted differently starts on that sort (adjusted during render).
  if (initialSort !== lastInitial) { setLastInitial(initialSort); setSortKey(initialSort || sorts[0].key) }

  useEffect(() => {
    if (!open) return
    let poppedByBack = false
    window.history.pushState({ fullScreenList: true }, '')
    // Back pops one entry: if our entry is still current, the pop belonged to a sheet opened on top.
    const onPop = () => { if (window.history.state?.fullScreenList) return; poppedByBack = true; closeRef.current() }
    window.addEventListener('popstate', onPop)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('popstate', onPop)
      document.body.style.overflow = prev
      if (!poppedByBack && window.history.state?.fullScreenList) window.history.back()
    }
  }, [open])

  const sort = sorts.find(s => s.key === sortKey) || sorts[0]
  const groups = useMemo(() => (groupOf ? ['All', ...new Set(items.map(groupOf).filter(Boolean))] : []), [items, groupOf])
  const needle = q.trim().toLowerCase()
  const list = useMemo(() => {
    let l = items
    if (groupOf && group !== 'All') l = l.filter(it => groupOf(it) === group)
    if (needle) l = l.filter(it => (searchText ? searchText(it) : name(it)).toLowerCase().includes(needle))
    return [...l].sort((a, b) => (sort.value(b) ?? -Infinity) - (sort.value(a) ?? -Infinity))
  }, [items, groupOf, group, needle, searchText, name, sort])
  const max = Math.max(...list.slice(0, shown).map(it => sort.value(it) || 0), 0) || 1
  const reset = fn => (...a) => { fn(...a); setShown(PAGE) }

  if (!open) return null
  const chip = (on, label, onClick) => (
    <button key={label} type="button" aria-pressed={on} onClick={onClick}
      style={{ flex: '0 0 auto', minHeight: 32, padding: '0 11px', borderRadius: 999, border: `1px solid ${on ? M.green : M.line}`, background: on ? M.green : '#fff', color: on ? '#fff' : M.ink, fontSize: 12.5, fontWeight: on ? 700 : 500, fontFamily: 'var(--font)', cursor: 'pointer' }}>{label}</button>
  )
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className="fullscreen-list"
      style={{ position: 'fixed', inset: 0, zIndex: C.z.modal, background: M.bg, display: 'flex', flexDirection: 'column', paddingTop: 'var(--safe-top)' }}>
      <div style={{ background: '#fff', padding: '12px 14px 10px', borderBottom: `1px solid ${M.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={onClose} aria-label="Back"
            style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: M.soft, color: M.ink, fontSize: 22, lineHeight: 1, cursor: 'pointer' }}>‹</button>
          <span style={{ fontSize: 16, fontWeight: 700, color: M.ink }}>{title}</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: M.muted }}>{list.length} {noun}</span>
        </div>
        <input type="search" value={q} onChange={e => reset(setQ)(e.target.value)} placeholder={`Search ${noun}…`} aria-label={`Search ${noun}`}
          style={{ width: '100%', marginTop: 10, fontSize: 16, padding: '10px 12px', borderRadius: 12, border: `1px solid ${M.line}`, background: M.soft, color: M.ink, outline: 'none', fontFamily: 'var(--font)' }} />
        <div role="group" aria-label="Sort by" style={{ display: 'flex', gap: 6, overflowX: 'auto', marginTop: 8, scrollbarWidth: 'none' }}>
          {sorts.map(s => chip(s.key === sortKey, s.label, reset(() => setSortKey(s.key))))}
        </div>
        {groups.length > 2 && (
          <div role="group" aria-label="Filter by group" style={{ display: 'flex', gap: 6, overflowX: 'auto', marginTop: 8, scrollbarWidth: 'none' }}>
            {groups.map(g => chip(g === group, g, reset(() => setGroup(g))))}
          </div>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', background: '#fff', padding: `4px 14px calc(20px + var(--safe-bottom))` }}>
        {!list.length && <div style={{ padding: 16, textAlign: 'center', color: M.muted, fontSize: 13 }}>No {noun} match.</div>}
        {list.slice(0, shown).map((it, i) => (
          <RankedRow key={i + '-' + name(it)} rank={i + 1} name={name(it)} sub={sub?.(it)} value={sort.format(it)} secondary={secondary?.(it, sortKey)}
            barPct={((sort.value(it) || 0) / max) * 100} barTone={sort.bar} onClick={() => onSelect?.(it)} />
        ))}
        {list.length > shown && (
          <button type="button" onClick={() => setShown(s => s + PAGE)}
            style={{ width: '100%', margin: '12px 0', minHeight: 44, borderRadius: 12, border: `1px solid ${M.line}`, background: '#fff', color: M.green, fontWeight: 600, fontSize: 13.5, fontFamily: 'var(--font)', cursor: 'pointer' }}>
            Load {Math.min(PAGE, list.length - shown)} more · {shown} of {list.length}
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
