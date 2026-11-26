import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { C } from '../utils.js'
import RankedRow from './RankedRow.jsx'
import MobilePageHeader from './MobilePageHeader.jsx'
import { rankItems, barMax, barPctOf } from './rankSort.js'

// "Show all" for record lists (mockups/sales_mobile_mockup.html #full): a full-screen page that
// slides in over the current one. Search, the same sort chips, optional group chips (e.g.
// category), a count, 20 rows at a time + "Load more" (fine for 200–1000+ items), and ‹ back -
// which is also what the Android/browser Back button does (opening pushes a history entry).
//   items, sorts, name, sub, secondary, searchText, groupOf: same meaning as MobileRankedList
//   onSelect(item): open the item's detail (the caller's BottomSheet)
//   flipOnRetap / initialDir, scopeFor / initialScopeAll, rowLayout: as in MobileRankedList (opt-in)
//   menu: { title, items } for the header's ⋯ (same shape MobilePageHeader takes)
//   tallChips: sort/group chips keep their look but get a 44px tap area (opt-in)
//   renderRow(item, index, sortKey) (own row instead of RankedRow), extraControls (node under the sort chips, e.g. filter
//   chips) and footer(list) (node pinned under the scrolling list, given the rows currently listed): all opt-in, e.g. Inventory cost detail
const PAGE = 20

export default function FullScreenList({ open, onClose, title, noun = 'items', items, sorts, initialSort, name, sub, secondary, searchText, groupOf, onSelect, badge, subBadge, valueColor, flipOnRetap = false, initialDir = 'desc', scopeFor, initialScopeAll = false, rowLayout, autoFocusSearch = false, renderRow, extraControls, footer, tallChips = false, menu }) {
  const M = C.m
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState(initialSort || sorts[0].key)
  const [dir, setDir] = useState(initialDir)
  const [scopeAll, setScopeAll] = useState(initialScopeAll)
  const [lastOpen, setLastOpen] = useState(open)
  // Each opening starts from the caller's current direction / scope (adjusted during render).
  if (open !== lastOpen) { setLastOpen(open); if (open) { setDir(initialDir); setScopeAll(initialScopeAll) } }
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
  const scope = scopeFor?.(sort.key) || null
  const groups = useMemo(() => (groupOf ? ['All', ...new Set(items.map(groupOf).filter(Boolean))] : []), [items, groupOf])
  const needle = q.trim().toLowerCase()
  const list = useMemo(() => {
    let l = items
    if (scope && !scopeAll) l = l.filter(scope.keep)
    if (groupOf && group !== 'All') l = l.filter(it => groupOf(it) === group)
    if (needle) l = l.filter(it => (searchText ? searchText(it) : name(it)).toLowerCase().includes(needle))
    return rankItems(l, sort.value, dir)
  }, [items, scope, scopeAll, groupOf, group, needle, searchText, name, sort, dir])
  const max = barMax(list.slice(0, shown), sort.value)
  const pickSort = key => { if (key === sortKey) { if (flipOnRetap) setDir(d => (d === 'desc' ? 'asc' : 'desc')) } else { setSortKey(key); setDir('desc') } }
  const reset = fn => (...a) => { fn(...a); setShown(PAGE) }

  if (!open) return null
  const chip = (on, label, onClick) => tallChips ? (
    <button key={label} type="button" aria-pressed={on} onClick={onClick}
      style={{ flex: '0 0 auto', minHeight: 44, padding: '0 2px', border: 'none', background: 'none', fontFamily: 'var(--font)', cursor: 'pointer' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', height: 32, padding: '0 11px', borderRadius: 999, whiteSpace: 'nowrap', border: `1px solid ${on ? M.green : M.line}`, background: on ? M.green : '#fff', color: on ? '#fff' : M.ink, fontSize: 12.5, fontWeight: on ? 700 : 500 }}>{label}</span>
    </button>
  ) : (
    <button key={label} type="button" aria-pressed={on} onClick={onClick}
      style={{ flex: '0 0 auto', minHeight: 32, padding: '0 11px', borderRadius: 999, border: `1px solid ${on ? M.green : M.line}`, background: on ? M.green : '#fff', color: on ? '#fff' : M.ink, fontSize: 12.5, fontWeight: on ? 700 : 500, fontFamily: 'var(--font)', cursor: 'pointer' }}>{label}</button>
  )
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className="fullscreen-list"
      style={{ position: 'fixed', inset: 0, zIndex: C.z.modal, background: M.bg, display: 'flex', flexDirection: 'column', paddingTop: 'var(--safe-top)' }}>
      <MobilePageHeader onBack={onClose} title={title} sub={`${list.length} ${noun}`} menu={menu} />
      <div style={{ background: '#fff', padding: '10px 14px 10px', borderBottom: `1px solid ${M.line}` }}>
        <input type="search" value={q} onChange={e => reset(setQ)(e.target.value)} placeholder={`Search ${noun}…`} aria-label={`Search ${noun}`}
          autoFocus={autoFocusSearch && open}
          style={{ width: '100%', marginTop: 0, fontSize: 16, padding: '10px 12px', borderRadius: 12, border: `1px solid ${M.line}`, background: M.soft, color: M.ink, outline: 'none', fontFamily: 'var(--font)' }} />
        <div role="group" aria-label="Sort by" style={{ display: 'flex', gap: 6, overflowX: 'auto', marginTop: 8, scrollbarWidth: 'none' }}>
          {sorts.map(s => chip(s.key === sortKey, s.label, reset(() => pickSort(s.key))))}
        </div>
        {(flipOnRetap || scope) && (
          <div style={{ fontSize: 12, color: M.muted, marginTop: 6 }}>
            by {sort.label}{flipOnRetap ? (dir === 'desc' ? ' · highest first' : ' · lowest first') : ''}
            {scope && <> · {scopeAll ? `all ${noun}` : scope.label} · <button type="button" onClick={reset(() => setScopeAll(a => !a))}
              style={{ border: 'none', background: 'none', padding: 0, color: M.green, fontWeight: 600, fontSize: 12, fontFamily: 'var(--font)', cursor: 'pointer' }}>{scopeAll ? `${scope.label} only` : 'Show all'}</button></>}
          </div>
        )}
        {extraControls}
        {groups.length > 2 && (
          <div role="group" aria-label="Filter by group" style={{ display: 'flex', gap: 6, overflowX: 'auto', marginTop: 8, scrollbarWidth: 'none' }}>
            {groups.map(g => chip(g === group, g, reset(() => setGroup(g))))}
          </div>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', background: '#fff', padding: `4px 14px calc(20px + var(--safe-bottom))` }}>
        {!list.length && <div style={{ padding: 16, textAlign: 'center', color: M.muted, fontSize: 13 }}>No {noun} match.</div>}
        {list.slice(0, shown).map((it, i) => renderRow ? <div key={i + '-' + name(it)}>{renderRow(it, i, sortKey)}</div> : (
          <RankedRow key={i + '-' + name(it)} rank={i + 1} name={name(it)} sub={sub?.(it, sortKey)} value={sort.format(it)} secondary={secondary?.(it, sortKey)}
            barPct={barPctOf(it, sort.value, max)} barTone={sort.bar} onClick={() => onSelect?.(it)} badge={badge?.(it)} subBadge={subBadge?.(it)} valueColor={valueColor?.(it, sortKey)} layout={rowLayout} />
        ))}
        {list.length > shown && (
          <button type="button" onClick={() => setShown(s => s + PAGE)}
            style={{ width: '100%', margin: '12px 0', minHeight: 44, borderRadius: 12, border: `1px solid ${M.line}`, background: '#fff', color: M.green, fontWeight: 600, fontSize: 13.5, fontFamily: 'var(--font)', cursor: 'pointer' }}>
            Load {Math.min(PAGE, list.length - shown)} more · {shown} of {list.length}
          </button>
        )}
      </div>
      {footer?.(list)}
    </div>,
    document.body,
  )
}
