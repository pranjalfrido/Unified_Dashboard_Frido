import { useEffect, useRef } from 'react'
import FilteredStrip from './FilteredStrip.jsx'
import ActionMenu from './ActionMenu.jsx'
import { useFeedback } from '../feedback/feedbackCtx.js'

// Phone page header, deep green (docs/responsive/HEADER_GREEN_PROMPT.md, mockups/header_green_mockup.html;
// MOBILE_DESIGN_SYSTEM.md §2). One header for every phone screen: the top bar (Topnav) and full-screen
// views (‹ back + title). Styles live in index.css (.mph*). It has one fixed height per page, the same
// before and after scrolling (no collapse). Every row below the first is optional and thin:
//   row 1  48px: [‹ back] title 17px white + context 13px mint-grey (`sub`), then always date · filter · ⋯.
//          date / filter: nodes (the page's date pill, its filter icon); a control the page doesn't
//          have is absent, the others never move. ⋯ = ActionMenu(menu) with "Notifications (n)" first
//          when `notifications` = { count, onOpen } is given; a red dot on ⋯ while count > 0.
//          onBack: ‹ before the title (backLabel names where it goes, for screen readers).
//          right: anything else a full-screen view needs at the end (e.g. "+ Add").
//          lead: an icon button before the title instead of ‹ back (Pulse: history); tag: a small chip
//          after the title (Pulse: the conversation's category).
//   row 2  chips: 36px row of 26px channel chips, selected = white fill + green text, scrolled into view.
//   row 3  subTabs: 32px underline tabs (spread when ≤ 4, scroll when more).
//   row 3b subTabs2: 30px second level on a darker band (Logistics Cost, Customers Intelligence).
//   strip  the "Filtered:" strip (FilteredStrip props), only when a non-default filter is active; it sits
//          under the green bar (.mph-bar) on the light page background.
// Totals 48 / 84 / 116px (+30 for a second sub-tab row); dividers are inset shadows, so they add no height.
const BackIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>

export default function MobilePageHeader({ onBack, backLabel, lead, tag, title, sub, caption, date, filter, menu, notifications, right, chips, activeChip, onChip, subTabs, activeSub, onSub, subTabs2, activeSub2, onSub2, subTabs2Scroll = false, strip }) {
  const chipRow = useRef(null)
  // Keep the active chip in view (e.g. after opening a channel from a link).
  useEffect(() => {
    const el = chipRow.current?.querySelector('[aria-pressed="true"]')
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [activeChip])

  const hasStrip = !!strip?.items?.length
  const n = notifications?.count || 0
  const fbk = useFeedback()
  const items = [
    ...(notifications ? [{ id: 'notifications', label: `Notifications (${n})`, onSelect: notifications.onOpen }] : []),
    ...(menu?.items || []),
    { id: 'send-feedback', label: 'Send feedback', onSelect: () => fbk.open(), group: menu?.items?.length ? 'Help' : '' },
  ]
  const more = (items.length || menu?.note)
    ? <ActionMenu items={items} title={menu?.title || 'More'} note={menu?.note} dot={n > 0} label={n > 0 ? `More, ${n} notifications` : 'More actions'} />
    : null
  const context = sub || caption
  return (
    <div className="mph">
      <div className="mph-bar">
        <div className={`mph-r1${onBack || lead ? ' mph-has-back' : ''}`}>
          {onBack && <button type="button" className="mph-ib mph-back" onClick={onBack} aria-label={backLabel ? `Back to ${backLabel}` : 'Back'}>{BackIcon}</button>}
          {lead}
          <div className="mph-title"><b>{title}</b>{tag && <i className="mph-tag">{tag}</i>}{context && <span>{context}</span>}</div>
          <div className="mph-ctl">
            {date && <span className="mph-date">{date}</span>}
            {filter && <span className="mph-filter" data-ctl="filter">{filter}</span>}
            {right}
            {more}
          </div>
        </div>
        {chips?.length > 0 && (
          <div ref={chipRow} role="group" aria-label="Choose" className="mph-r2">
            {chips.map(c => (
              <button key={c.id} type="button" className="mph-chip" aria-pressed={c.id === activeChip} disabled={c.disabled} onClick={() => onChip(c.id)}>{c.label}</button>
            ))}
          </div>
        )}
        {subTabs?.length > 0 && (
          <div role="tablist" aria-label="View" className={`mph-r3${subTabs.length <= 4 ? ' mph-even' : ''}`}>
            {subTabs.map(t => (
              <button key={t.id} type="button" role="tab" className="mph-tab" aria-selected={t.id === activeSub} onClick={() => onSub(t.id)}>{t.label}</button>
            ))}
          </div>
        )}
        {subTabs2?.length > 0 && (
          <div role="tablist" aria-label="Section" className={`mph-r3 mph-r3b${subTabs2Scroll ? '' : ' mph-even'}`}>
            {subTabs2.map(t => (
              <button key={t.id} type="button" role="tab" className="mph-tab" aria-selected={t.id === activeSub2} onClick={() => onSub2(t.id)}>{t.label}</button>
            ))}
          </div>
        )}
      </div>
      {hasStrip && <FilteredStrip {...strip} tone="light" />}
    </div>
  )
}
