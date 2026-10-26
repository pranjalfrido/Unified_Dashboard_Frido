import { useEffect, useRef } from 'react'
import { C } from '../utils.js'
import FilteredStrip from './FilteredStrip.jsx'

// Phone page header (docs/responsive/MOBILE_DESIGN_SYSTEM.md §2, mockups/sales_mobile_mockup.html
// .top). Rendered inside the app's top bar (Topnav adds class `m-header`; index.css draws the dark
// green gradient and restyles the date pill / bell for it). Every row below the first is optional:
//   row 1  title (+ " · sub" in soft white) and `right` (bell, filter icon, date pill, "⋯");
//          `caption`: optional small line under the title inside the same row ("Updated … · sales till …")
//   row 2  chips: horizontally scrolling choices (channels, platforms…), active = white chip;
//          `chipsRight` sits at the row's end (the filter icon with its count)
//   row 3  subTabs: underline tabs, only when the current choice has them; `subRight` at the end ("⋯")
//   row 4  strip: the "Filtered:" strip (FilteredStrip props), only when filters are active
// The first row keeps the plain top bar's height and spacing, so a page that only uses row 1 looks
// exactly like it did before this component.
export default function MobilePageHeader({ title, sub, caption, right, chips, activeChip, onChip, chipsRight, subTabs, activeSub, onSub, subRight, strip }) {
  const chipRow = useRef(null)
  // Keep the active chip in view (e.g. after opening a channel from a link).
  useEffect(() => {
    const el = chipRow.current?.querySelector('[aria-pressed="true"]')
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [activeChip])
  const hasStrip = !!strip?.items?.length
  return (
    <>
      {/* Side padding and gap come from index.css (.mph-row1 / .mph-pad): the same values as the plain bar. */}
      <div className="mph-row1 mph-pad" style={{ display: 'flex', alignItems: 'center', height: 'var(--nav)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative', minWidth: 0, flex: 1 }}>
          {caption
            ? <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span className="tnav-title">{title}{sub && <span style={{ color: 'rgba(255,255,255,.75)', fontWeight: 500 }}> · {sub}</span>}</span>
                <span className="mph-caption" style={{ fontSize: 12, lineHeight: '15px', color: 'rgba(255,255,255,.72)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>{caption}</span>
              </span>
            : <span className="tnav-title">{title}{sub && <span style={{ color: 'rgba(255,255,255,.75)', fontWeight: 500 }}> · {sub}</span>}</span>}
        </div>
        {right}
      </div>
      {chips?.length > 0 && (
        <div className="mph-pad" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: -2 }}>
          <div ref={chipRow} role="group" aria-label="Choose" className="mph-chips"
            style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', flex: 1, minWidth: 0, padding: '2px 0',
              WebkitMaskImage: 'linear-gradient(90deg,#000 85%,transparent)', maskImage: 'linear-gradient(90deg,#000 85%,transparent)' }}>
            {chips.map(c => {
              const on = c.id === activeChip
              return (
                <button key={c.id} type="button" aria-pressed={on} disabled={c.disabled} onClick={() => onChip(c.id)}
                  style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 32, padding: '0 11px', borderRadius: 999, fontSize: 13, fontFamily: 'var(--font)', cursor: c.disabled ? 'not-allowed' : 'pointer', opacity: c.disabled ? 0.4 : 1,
                    background: on ? '#fff' : 'rgba(255,255,255,.10)', color: on ? C.m.greenDark : '#e9f1ec', fontWeight: on ? 700 : 500, border: `1px solid ${on ? '#fff' : 'rgba(255,255,255,.14)'}` }}>
                  {c.label}
                </button>
              )
            })}
          </div>
          {chipsRight}
        </div>
      )}
      {subTabs?.length > 0 && (
        <div className="mph-pad" style={{ display: 'flex', alignItems: 'flex-end', gap: 8, paddingTop: 6 }}>
          <div role="tablist" aria-label="View" className="mph-chips" style={{ display: 'flex', gap: 16, overflowX: 'auto', scrollbarWidth: 'none', flex: 1, minWidth: 0 }}>
            {subTabs.map(t => {
              const on = t.id === activeSub
              return (
                <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => onSub(t.id)}
                  style={{ flex: '0 0 auto', minHeight: 32, border: 'none', background: 'none', padding: '2px 0 6px', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer',
                    color: on ? '#fff' : 'rgba(255,255,255,.65)', borderBottom: `2px solid ${on ? '#fff' : 'transparent'}` }}>{t.label}</button>
              )
            })}
          </div>
          {subRight && <div style={{ paddingBottom: 4 }}>{subRight}</div>}
        </div>
      )}
      {hasStrip && <FilteredStrip {...strip} tone="dark" />}
      {(chips?.length > 0 || subTabs?.length > 0) && !hasStrip && <div aria-hidden="true" style={{ height: 8 }} />}
    </>
  )
}
