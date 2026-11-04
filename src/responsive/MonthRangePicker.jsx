import { useEffect, useMemo, useRef, useState } from 'react'
import { C } from '../utils.js'
import BottomSheet from './BottomSheet.jsx'
import { MON, ym, key, contiguous, monthsLabel, monthsCount } from './monthRange.js'

// Billing-month picker (docs/responsive/LOGISTICS_MOBILE_REDESIGN_PROMPT.md §1a, mockup
// month_picker_mockup.html). Laptop: pill + ~580px popover (quick picks, Range | Pick months, year
// grid). Phone: the parent's header pill opens a BottomSheet with preset chips and the grid (range
// only). Output is exactly what the old checkbox dropdown sent: 'YYYY-MM' strings, [] = all months
// (only via "All available" or by selecting every month on offer); nothing applies until Apply.
const M = C.m
// Quick picks, all drawn from the months on offer. Latest = the old "Last 1" (newest month on offer).
function presets(months) {
  if (!months.length) return []
  const last = months.at(-1), [ly, lm] = ym(last)
  const fyStart = key(lm >= 3 ? ly : ly - 1, 3)
  const fy = months.filter(k => k >= fyStart)
  const fyLabel = `FY ${String(lm >= 3 ? ly : ly - 1).slice(2)}–${String((lm >= 3 ? ly : ly - 1) + 1).slice(2)} to date`
  return [
    { id: 'latest', label: 'Latest month', chip: 'Latest', sel: [last] },
    { id: 'l3', label: 'Last 3 months', chip: 'Last 3M', sel: months.slice(-3) },
    { id: 'l6', label: 'Last 6 months', chip: 'Last 6M', sel: months.slice(-6) },
    { id: 'fy', label: fyLabel, chip: fyLabel, sel: fy },
    { id: 'all', label: 'All available', chip: 'All available', sel: [...months], all: true },
  ]
}

// Shared state machine: draft selection, range anchor, mode, year page.
function usePicker(months, value, open) {
  const [draft, setDraft] = useState(() => new Set(value?.length ? value : months))
  const [anchor, setAnchor] = useState(null)
  const [mode, setMode] = useState('range')
  const [hover, setHover] = useState(null)
  const years = useMemo(() => [...new Set(months.map(k => ym(k)[0]))].sort(), [months])
  const [year, setYear] = useState(() => (months.length ? ym(months.at(-1))[0] : new Date().getFullYear()))
  // Each opening starts from the applied selection (Cancel / outside / Esc discard the draft).
  const [openedFor, setOpenedFor] = useState(null)
  if (open && openedFor !== value) {
    setOpenedFor(value)
    setDraft(new Set(value?.length ? value : months)); setAnchor(null); setHover(null)
    setYear(months.length ? ym([...(value?.length ? value : months)].sort().at(-1))[0] : year)
  }
  if (!open && openedFor !== null) setOpenedFor(null)
  const avail = useMemo(() => new Set(months), [months])
  const between = (a, b) => months.filter(k => k >= (a < b ? a : b) && k <= (a < b ? b : a))
  const tap = k => {
    if (!avail.has(k)) return
    if (mode === 'pick') { setDraft(d => { const n = new Set(d); if (n.has(k)) n.delete(k); else n.add(k); return n }); return }
    if (!anchor) { setAnchor(k); setDraft(new Set([k])); return }
    setDraft(new Set(between(anchor, k))); setAnchor(null)
  }
  const preview = mode === 'range' && anchor && hover ? new Set(between(anchor, hover)) : null
  const sorted = [...draft].sort()
  // [] only when every month on offer is selected (same as the old dropdown).
  const output = sorted.length === months.length ? [] : sorted
  return { draft, setDraft, anchor, setAnchor, mode, setMode, hover, setHover, years, year, setYear, avail, tap, preview, sorted, output }
}

function Grid({ p, months, big, onKeyNav }) {
  const latest = months.at(-1)
  const lo = p.sorted[0], hi = p.sorted.at(-1)
  const showBand = p.mode === 'range' && p.sorted.length > 1 && contiguous(p.sorted.filter(k => p.avail.has(k)))
  return (
    <div role="grid" aria-label={`Months of ${p.year}`} onKeyDown={onKeyNav}
      style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', rowGap: 6, columnGap: 0 }}>
      {MON.map((name, m) => {
        const k = key(p.year, m)
        const ok = p.avail.has(k)
        const on = (p.preview || p.draft).has(k)
        const end = on && (p.preview ? (k === [...p.preview].sort()[0] || k === [...p.preview].sort().at(-1)) : (!showBand || k === lo || k === hi))
        const inBand = on && !end
        return (
          <div key={k} role="gridcell" style={{ background: inBand ? 'rgba(31,90,61,.10)' : 'transparent', borderRadius: inBand ? 0 : 10 }}>
            <button type="button" data-month={k} disabled={!ok} aria-pressed={on} aria-label={`${name} ${p.year}`}
              onClick={() => p.tap(k)} onMouseEnter={() => p.setHover(k)} onFocus={() => p.setHover(k)}
              className="mrp-month"
              style={{ width: '100%', minHeight: big ? 44 : 36, borderRadius: 10, fontFamily: 'var(--font)', fontSize: 13, cursor: ok ? 'pointer' : 'default',
                fontWeight: end ? 700 : 500,
                border: k === latest && !end ? `1px solid ${M.g3}` : '1px solid transparent',
                background: end ? M.green : 'transparent', color: end ? '#fff' : ok ? M.ink : '#c4c9c5' }}>{name}</button>
          </div>
        )
      })}
    </div>
  )
}

function YearBar({ p }) {
  const i = p.years.indexOf(p.year)
  const btn = (dir, dis) => (
    <button type="button" aria-label={dir < 0 ? 'Previous year' : 'Next year'} disabled={dis} onClick={() => p.setYear(p.years[i + dir])} className="mrp-month"
      style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${M.line}`, background: '#fff', color: dis ? '#c4c9c5' : M.ink, cursor: dis ? 'default' : 'pointer', fontSize: 14 }}>{dir < 0 ? '‹' : '›'}</button>
  )
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '2px 0 8px' }}>
      {btn(-1, i <= 0)}<b style={{ fontSize: 14, color: M.ink }}>{p.year}</b>{btn(1, i < 0 || i >= p.years.length - 1)}
    </div>
  )
}

// Arrow keys move focus across the 12 months (and across years at the edges); Enter / Space select.
function useKeyNav(p) {
  return e => {
    const k = e.target?.dataset?.month
    if (!k) return
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[e.key]
    if (!step) return
    e.preventDefault()
    const [y, m] = ym(k)
    const t = y * 12 + m + step, ny = Math.floor(t / 12)
    if (ny !== p.year) { if (!p.years.includes(ny)) return; p.setYear(ny) }
    requestAnimationFrame(() => document.querySelector(`.mrp-month[data-month="${key(ny, t % 12)}"]`)?.focus())
  }
}

const words = (sorted, months) => (sorted.length ? monthsLabel(sorted.length === months.length ? [] : sorted, months) : 'No months selected')

// open / onClose given → controlled, no pill (the phone header has its own); otherwise the picker
// renders its own pill (laptop popover, or a tablet pill that opens the sheet).
export default function MonthRangePicker({ months, value, onApply, variant = 'popover', open: openProp, onClose, title = 'Billing months' }) {
  const [openLocal, setOpenLocal] = useState(false)
  const sheet = variant === 'sheet'
  const controlled = openProp !== undefined
  const open = controlled ? !!openProp : openLocal
  const close = () => (controlled ? onClose?.() : setOpenLocal(false))
  const p = usePicker(months, value, open)
  const keyNav = useKeyNav(p)
  const list = useMemo(() => presets(months), [months])
  const wrap = useRef(null)
  useEffect(() => {
    if (sheet || !open) return
    const out = e => { if (wrap.current && !wrap.current.contains(e.target)) setOpenLocal(false) }
    const esc = e => { if (e.key === 'Escape') setOpenLocal(false) }
    document.addEventListener('mousedown', out); document.addEventListener('touchstart', out); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('touchstart', out); document.removeEventListener('keydown', esc) }
  }, [sheet, open])
  const presetOn = pr => (pr.all ? p.sorted.length === months.length : p.sorted.length === pr.sel.length && pr.sel.every(k => p.draft.has(k)))
  const choose = pr => { p.setDraft(new Set(pr.sel)); p.setAnchor(null); if (pr.sel.length) p.setYear(ym(pr.sel.at(-1))[0]) }
  const apply = () => { if (!p.sorted.length) return; onApply(p.output); close() }
  const glow = { border: '1px solid rgba(31,90,61,.22)', boxShadow: '0 0 10px 1px rgba(31,90,61,.10)' }
  const hint = p.anchor ? 'Tap the end month.' : 'Tap a month to start a new range.'

  const n = monthsCount(value, months)
  const pill = (
    <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpenLocal(o => !o)} className="mrp-pill"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600, color: C.t1, fontFamily: 'var(--font)', background: open ? C.acl : C.card,
        border: `1px solid ${open ? C.acm : C.border2}`, borderRadius: 8, padding: '4px 9px 4px 11px', whiteSpace: 'nowrap', cursor: 'pointer' }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 11h18" /></svg>
      {monthsLabel(value, months)}
      <span style={{ fontSize: 10.5, fontWeight: 700, color: M.green, background: 'rgba(31,90,61,.10)', borderRadius: 999, padding: '1px 7px' }}>{n} mo</span>
      <span aria-hidden="true" style={{ fontSize: 7, color: C.t3, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }}>▼</span>
    </button>
  )

  if (sheet) {
    return (
      <>
      {!controlled && pill}
      <BottomSheet open={open} onClose={close} title={title} subtitle={`${p.sorted.length} selected`}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {list.map(pr => (
            <button key={pr.id} type="button" onClick={() => choose(pr)} className="mrp-month"
              style={{ minHeight: 32, padding: '0 12px', borderRadius: 999, fontSize: 12.5, fontFamily: 'var(--font)', cursor: 'pointer', color: M.ink, background: '#fff', fontWeight: presetOn(pr) ? 700 : 500, ...(presetOn(pr) ? glow : { border: `1px solid ${M.line}` }) }}>{pr.chip}</button>
          ))}
        </div>
        <YearBar p={p} />
        <Grid p={p} months={months} big onKeyNav={keyNav} />
        <div style={{ fontSize: 12, color: M.muted, margin: '8px 0 4px' }}>{hint}</div>
        <div style={{ position: 'sticky', bottom: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0 2px', background: '#fff', borderTop: `1px solid ${M.line}` }}>
          <button type="button" onClick={() => { p.setDraft(new Set()); p.setAnchor(null) }} className="mrp-month"
            style={{ minHeight: 44, padding: '0 12px', border: 'none', background: 'transparent', color: M.muted, fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' }}>Clear</button>
          <button type="button" disabled={!p.sorted.length} onClick={apply} className="mrp-month"
            style={{ flex: 1, minHeight: 46, borderRadius: 12, border: 'none', background: p.sorted.length ? M.green : M.g4, color: '#fff', fontSize: 14.5, fontWeight: 700, fontFamily: 'var(--font)', cursor: p.sorted.length ? 'pointer' : 'default' }}>
            {p.sorted.length ? `Apply · ${monthsLabel(p.output, months, { short: true })}` : 'Pick at least one month'}
          </button>
        </div>
      </BottomSheet>
      </>
    )
  }

  return (
    <div ref={wrap} style={{ position: 'relative', display: 'inline-flex' }}>
      {pill}
      {open && (
        <div role="dialog" aria-label={title} style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: C.z.dropdown, width: 580, maxWidth: 'calc(100vw - 24px)', background: '#fff',
          border: `1px solid ${M.line}`, borderRadius: 14, boxShadow: '0 12px 32px rgba(0,0,0,.14)', overflow: 'hidden', fontFamily: 'var(--font)', fontVariantNumeric: 'tabular-nums' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr' }}>
            <div style={{ padding: '12px 8px', borderRight: `1px solid ${M.line}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: M.muted, padding: '0 10px 6px' }}>Quick pick</div>
              {list.map(pr => (
                <button key={pr.id} type="button" onClick={() => choose(pr)} className="mrp-month"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', minHeight: 34, padding: '0 10px', borderRadius: 9, background: presetOn(pr) ? '#fff' : 'transparent',
                    fontSize: 12.5, color: M.ink, fontWeight: presetOn(pr) ? 700 : 500, fontFamily: 'var(--font)', cursor: 'pointer', ...(presetOn(pr) ? glow : { border: '1px solid transparent' }) }}>
                  <span>{pr.label}</span><span style={{ fontSize: 11.5, color: M.muted, fontWeight: 500 }}>{monthsLabel(pr.sel, months, { short: pr.sel.length > 1 })}</span>
                </button>
              ))}
            </div>
            <div style={{ padding: 12 }}>
              <div role="tablist" aria-label="Selection mode" style={{ display: 'flex', background: M.soft, borderRadius: 10, padding: 3, marginBottom: 10 }}>
                {[['range', 'Range'], ['pick', 'Pick months']].map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={p.mode === id} onClick={() => { p.setMode(id); p.setAnchor(null) }} className="mrp-month"
                    style={{ flex: 1, minHeight: 30, border: 'none', borderRadius: 8, background: p.mode === id ? '#fff' : 'transparent', boxShadow: p.mode === id ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
                      fontSize: 12.5, fontWeight: p.mode === id ? 700 : 500, color: p.mode === id ? M.ink : M.muted, fontFamily: 'var(--font)', cursor: 'pointer' }}>{label}</button>
                ))}
              </div>
              <YearBar p={p} />
              <div onMouseLeave={() => p.setHover(null)}><Grid p={p} months={months} onKeyNav={keyNav} /></div>
              <div style={{ fontSize: 12, color: M.muted, marginTop: 8 }}>{p.mode === 'pick' ? 'Click months to add or remove them.' : hint.replace('Tap', 'Click')}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderTop: `1px solid ${M.line}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: M.ink }}>{words(p.sorted, months)}</div>
              <div style={{ fontSize: 12, color: M.muted }}>{p.sorted.length} billing month{p.sorted.length === 1 ? '' : 's'}</div>
            </div>
            <button type="button" onClick={() => { p.setDraft(new Set()); p.setAnchor(null) }} className="mrp-month" style={{ minHeight: 32, padding: '0 10px', border: 'none', background: 'transparent', color: M.muted, fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' }}>Clear</button>
            <button type="button" onClick={close} className="mrp-month" style={{ minHeight: 32, padding: '0 10px', border: 'none', background: 'transparent', color: M.muted, fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' }}>Cancel</button>
            <button type="button" disabled={!p.sorted.length} onClick={apply} className="mrp-month"
              style={{ minHeight: 32, padding: '0 16px', borderRadius: 9, border: 'none', background: p.sorted.length ? M.green : M.g4, color: '#fff', fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font)', cursor: p.sorted.length ? 'pointer' : 'default' }}>Apply</button>
          </div>
        </div>
      )}
    </div>
  )
}
