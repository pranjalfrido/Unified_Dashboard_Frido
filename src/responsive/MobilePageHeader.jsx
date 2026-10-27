import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import FilteredStrip from './FilteredStrip.jsx'
import ActionMenu from './ActionMenu.jsx'

// Phone page header, Ivory (docs/responsive/HEADER_MOBILE_PROMPT.md, mockups/header_mockup.html;
// MOBILE_DESIGN_SYSTEM.md §2). One header for every phone screen: the top bar (Topnav) and full-screen
// views (‹ back + title). Styles live in index.css (.mph*). Every row below the first is optional:
//   row 1  48px: [‹ back] title 17px + context 13px grey (`sub`), then always date · filter · ⋯.
//          date / filter: nodes (the page's date pill, its filter icon); a control the page doesn't
//          have is absent, the others never move. ⋯ = ActionMenu(menu) with "Notifications (n)" first
//          when `notifications` = { count, onOpen } is given; a red dot on ⋯ while count > 0.
//          onBack: ‹ before the title (backLabel names where it goes, for screen readers).
//          right: anything else a full-screen view needs at the end (e.g. a row count).
//   row 2  chips: 28px channel chips, selected = Frido green fill; the selected one scrolls into view.
//   row 3  subTabs: 34px underline tabs (spread when ≤ 4, scroll when more).
//   row 3b subTabs2: 30px second level on a darker band (Logistics Cost, Customers Intelligence).
//   strip  the "Filtered:" strip (FilteredStrip props), only when a non-default filter is active.
// collapsible (the top bar only): after ~80px of downward scroll rows 2–3 and the strip fold into one
// 42px bar ("Title · context · sub-tab" + date + ⋯); scrolling up restores it. The scroll position is
// shifted by the height change in the same frame, so the content never jumps.
const BackIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>

export default function MobilePageHeader({ onBack, backLabel, title, sub, caption, date, filter, menu, notifications, right, chips, activeChip, onChip, subTabs, activeSub, onSub, subTabs2, activeSub2, onSub2, subTabs2Scroll = false, strip, collapsible = false }) {
  const rootRef = useRef(null)
  const chipRow = useRef(null)
  const [collapsed, setCollapsed] = useState(false)
  const collapsedRef = useRef(false)
  const pending = useRef(null)
  const lastTop = useRef(new WeakMap())
  // Keep the active chip in view (e.g. after opening a channel from a link).
  useEffect(() => {
    const el = chipRow.current?.querySelector('[aria-pressed="true"]')
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [activeChip, collapsed])
  // A new page / channel / tab starts expanded.
  const viewKey = [typeof title === 'string' ? title : '', typeof sub === 'string' ? sub : '', activeChip, activeSub, activeSub2].join('|')
  const [seenKey, setSeenKey] = useState(viewKey)
  if (seenKey !== viewKey) { setSeenKey(viewKey); if (collapsed) setCollapsed(false) }
  useEffect(() => { collapsedRef.current = collapsed }, [collapsed])
  useEffect(() => {
    if (!collapsible) return
    const onScroll = e => {
      const el = e.target
      if (!(el instanceof Element) || !el.closest('.app-main') || el.closest('[role=dialog], .mph')) return
      const st = el.scrollTop, map = lastTop.current
      const prev = map.has(el) ? map.get(el) : st
      map.set(el, st)
      if (st === prev || pending.current) return // sideways scroll, or our own correction
      const head = rootRef.current
      if (!head) return
      if (!collapsedRef.current) {
        const delta = head.offsetHeight - 42
        if (delta > 0 && st > prev && st > Math.max(80, delta + 40) && el.scrollHeight - el.clientHeight > delta + 120) {
          pending.current = { el, before: head.offsetHeight }; collapsedRef.current = true; setCollapsed(true)
        }
      } else if (st < prev - 4 || st <= 0) {
        pending.current = { el, before: head.offsetHeight }; collapsedRef.current = false; setCollapsed(false)
      }
    }
    document.addEventListener('scroll', onScroll, true)
    return () => document.removeEventListener('scroll', onScroll, true)
  }, [collapsible])
  useLayoutEffect(() => {
    const p = pending.current
    if (!p) return
    const diff = (rootRef.current?.offsetHeight || p.before) - p.before
    p.el.scrollTop += diff
    lastTop.current.set(p.el, p.el.scrollTop)
    requestAnimationFrame(() => { pending.current = null })
  }, [collapsed])

  const hasStrip = !!strip?.items?.length
  const n = notifications?.count || 0
  const items = [
    ...(notifications ? [{ id: 'notifications', label: `Notifications (${n})`, onSelect: notifications.onOpen }] : []),
    ...(menu?.items || []),
  ]
  const more = (items.length || menu?.note)
    ? <ActionMenu items={items} title={menu?.title || 'More'} note={menu?.note} dot={n > 0} label={n > 0 ? `More, ${n} notifications` : 'More actions'} />
    : null
  const subLabel = subTabs?.find(t => t.id === activeSub)?.label
  const sub2Label = subTabs2?.find(t => t.id === activeSub2)?.label
  const context = collapsed
    ? [sub || caption, typeof subLabel === 'string' ? subLabel : null, typeof sub2Label === 'string' ? sub2Label : null].filter(Boolean).join(' · ')
    : (sub || caption)
  return (
    <div ref={rootRef} className={`mph${collapsed ? ' mph-collapsed' : ''}`}>
      <div className={`mph-r1${onBack ? ' mph-has-back' : ''}`}>
        {onBack && <button type="button" className="mph-ib mph-back" onClick={onBack} aria-label={backLabel ? `Back to ${backLabel}` : 'Back'}>{BackIcon}</button>}
        <div className="mph-title"><b>{title}</b>{context && <span>{context}</span>}</div>
        <div className="mph-ctl">
          {date && <span className="mph-date">{date}</span>}
          {filter && !collapsed && <span className="mph-filter" data-ctl="filter">{filter}</span>}
          {right}
          {more}
        </div>
      </div>
      {!collapsed && chips?.length > 0 && (
        <div ref={chipRow} role="group" aria-label="Choose" className="mph-r2">
          {chips.map(c => (
            <button key={c.id} type="button" className="mph-chip" aria-pressed={c.id === activeChip} disabled={c.disabled} onClick={() => onChip(c.id)}>{c.label}</button>
          ))}
        </div>
      )}
      {!collapsed && subTabs?.length > 0 && (
        <div role="tablist" aria-label="View" className={`mph-r3${subTabs.length <= 4 ? ' mph-even' : ''}`}>
          {subTabs.map(t => (
            <button key={t.id} type="button" role="tab" className="mph-tab" aria-selected={t.id === activeSub} onClick={() => onSub(t.id)}>{t.label}</button>
          ))}
        </div>
      )}
      {!collapsed && subTabs2?.length > 0 && (
        <div role="tablist" aria-label="Section" className={`mph-r3 mph-r3b${subTabs2Scroll ? '' : ' mph-even'}`}>
          {subTabs2.map(t => (
            <button key={t.id} type="button" role="tab" className="mph-tab" aria-selected={t.id === activeSub2} onClick={() => onSub2(t.id)}>{t.label}</button>
          ))}
        </div>
      )}
      {!collapsed && hasStrip && <FilteredStrip {...strip} tone="light" />}
    </div>
  )
}
