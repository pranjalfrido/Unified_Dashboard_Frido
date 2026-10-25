import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { C, fmt } from '../utils.js'
import { fmtCompact, fmtCountCompact } from './format.js'
import { useBreakpoint } from './useBreakpoint.js'

// Shared responsive wrapper for every Recharts chart (docs/responsive/RESPONSIVE_PLAN.md, prompt Phase 5).
//
//   <ChartFrame height={{ mobile: 260, tablet: 300, desktop: 320 }} series={[{ key: 'revenue', name: 'Gross Revenue', color: C.acc }]} loading={!data}>
//     {f => (
//       <ComposedChart data={rows} margin={f.margin}>
//         <XAxis dataKey="date" {...f.xAxis} tickFormatter={...} />
//         <YAxis {...f.yAxis} />
//         <Tooltip {...f.tooltip} content={...} />
//         <Area dataKey="revenue" hide={f.hidden.has('revenue')} ... />
//       </ComposedChart>
//     )}
//   </ChartFrame>
//
// What it gives every chart:
//   - a fixed-height loading skeleton (no layout shift) that never blocks clicks on the page
//     (pointer-events:none: Phase 0 #16/#23 found a loading chart intercepting the date picker)
//   - fewer, non-overlapping ticks and compact ₹ axis labels on mobile (display only)
//   - legend as toggleable chips under the chart (horizontally scrollable on mobile)
//   - tap-to-show / tap-elsewhere-to-close tooltips on touch screens
//   - a full-screen view (Esc, the close button, or the Android back button closes it)
const Y_FORMATS = {
  currency: { full: fmt, compact: fmtCompact },
  count: { full: v => (v || 0).toLocaleString('en-IN'), compact: fmtCountCompact },
  percent: { full: v => `${(+v || 0).toFixed(1)}%`, compact: v => `${Math.round(+v || 0)}%` },
}

export function ChartFrame({ height = 300, series = [], loading = false, empty = false, emptyText = 'No data for this period', yFormat = 'currency', title, children, style }) {
  const bp = useBreakpoint()
  const [hidden, setHidden] = useState(() => new Set())
  const [fullscreen, setFullscreen] = useState(false)
  const [tipOpen, setTipOpen] = useState(false)
  const frameRef = useRef(null)
  const fsRef = useRef(null)

  const h = typeof height === 'number' ? height
    : bp.isMobile ? (height.mobile ?? 260) : bp.isTablet ? (height.tablet ?? height.desktop ?? 300) : (height.desktop ?? 300)

  // Touch: a tap opens the tooltip, a tap anywhere outside the chart closes it.
  useEffect(() => {
    if (!bp.isTouch) return
    const onDown = e => {
      const inside = frameRef.current?.contains(e.target) || fsRef.current?.contains(e.target)
      setTipOpen(!!inside)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [bp.isTouch])

  // Full screen: Esc closes; the Android/browser back button closes it instead of leaving the page.
  useEffect(() => {
    if (!fullscreen) return
    const onKey = e => { if (e.key === 'Escape') history.back() }
    const onPop = () => setFullscreen(false)
    window.history.pushState({ chartFullscreen: true }, '')
    window.addEventListener('keydown', onKey)
    window.addEventListener('popstate', onPop)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('popstate', onPop)
      document.body.style.overflow = prevOverflow
    }
  }, [fullscreen])

  const fmtY = typeof yFormat === 'function' ? yFormat : (Y_FORMATS[yFormat] || Y_FORMATS.currency)[bp.isMobile ? 'compact' : 'full']
  const ctx = (chartHeight, large) => ({
    hidden,
    isMobile: bp.isMobile && !large,
    height: chartHeight,
    margin: bp.isMobile && !large ? { top: 4, right: 8, bottom: 0, left: 0 } : { top: 4, right: 20, bottom: 4, left: 0 },
    // Desktop keeps Recharts' own tick choices (so existing charts read exactly as before);
    // phones get fewer, well-spaced ticks.
    xAxis: {
      tick: { fontSize: 10, fill: C.t3 },
      ...(bp.isMobile && !large ? { minTickGap: 22, interval: 'preserveStartEnd' } : {}),
    },
    yAxis: {
      tick: { fontSize: 10, fill: C.t3 },
      tickFormatter: large ? (typeof yFormat === 'function' ? yFormat : (Y_FORMATS[yFormat] || Y_FORMATS.currency).full) : fmtY,
      width: bp.isMobile && !large ? 46 : 54,
      ...(bp.isMobile && !large ? { tickCount: 4 } : {}),
    },
    grid: { strokeDasharray: '3 3', stroke: C.border, vertical: false },
    tooltip: {
      trigger: bp.isTouch ? 'click' : 'hover',
      ...(bp.isTouch && !tipOpen ? { active: false } : {}),
      allowEscapeViewBox: { x: false, y: false },
      wrapperStyle: { zIndex: 60, outline: 'none' },
    },
  })

  const toggle = key => setHidden(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    // Never let every series be switched off - an empty plot reads as "no data".
    return next.size >= series.length ? prev : next
  })

  // Chip row also hosts the full-screen button, so it renders even for a single-series chart.
  const chips = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
      <div className="chart-legend-chips" role="group" aria-label="Show or hide series"
        style={{ display: 'flex', gap: 6, flex: 1, minWidth: 0, overflowX: 'auto', flexWrap: bp.isMobile ? 'nowrap' : 'wrap', justifyContent: bp.isMobile ? 'flex-start' : 'center', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
        {series.map(s => {
          const off = hidden.has(s.key)
          return (
            <button key={s.key} type="button" onClick={() => toggle(s.key)} aria-pressed={!off}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, minHeight: bp.isTouch ? 36 : 26, padding: '3px 10px', borderRadius: 999, border: `1px solid ${off ? C.border : C.border2}`, background: off ? 'transparent' : C.card, color: off ? C.t3 : C.t1, fontSize: 11, fontFamily: 'var(--font)', cursor: 'pointer', textDecoration: off ? 'line-through' : 'none', whiteSpace: 'nowrap' }}>
              <span style={{ width: 10, height: s.dashed ? 0 : 10, borderRadius: s.dashed ? 0 : '50%', background: s.dashed ? 'transparent' : s.color, borderTop: s.dashed ? `2px dashed ${s.color}` : 'none', opacity: off ? 0.35 : 1, flexShrink: 0 }} />
              {s.name}
            </button>
          )
        })}
      </div>
      {!loading && !empty && (
        <button type="button" onClick={() => setFullscreen(true)} aria-label="Open chart full screen" title="Full screen"
          style={{ flexShrink: 0, minWidth: bp.isTouch ? 36 : 26, minHeight: bp.isTouch ? 36 : 26, borderRadius: 8, border: `1px solid ${C.border2}`, background: C.card, color: C.t2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
        </button>
      )}
    </div>
  )

  let body
  if (loading) {
    body = (
      <div className="chart-skeleton" aria-busy="true" aria-label="Loading chart" style={{ height: h, borderRadius: 10, pointerEvents: 'none', position: 'relative', overflow: 'hidden', background: `linear-gradient(180deg, ${C.hov} 0%, ${C.card} 100%)` }}>
        {[0.25, 0.5, 0.75].map(p => <div key={p} style={{ position: 'absolute', left: 0, right: 0, top: `${p * 100}%`, borderTop: `1px dashed ${C.border}` }} />)}
      </div>
    )
  } else if (empty) {
    body = <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.t3, fontSize: 12 }}>{emptyText}</div>
  } else {
    const content = children(ctx(h, false))
    body = <div style={{ height: h, minWidth: 0 }}>{content}</div>
  }

  return (
    <div ref={frameRef} style={{ minWidth: 0, ...style }}>
      {body}
      {chips}
      {fullscreen && createPortal(
        <div ref={fsRef} role="dialog" aria-modal="true" aria-label={title ? `${title}, full screen` : 'Chart, full screen'}
          style={{ position: 'fixed', inset: 0, zIndex: C.z.modal, background: C.card, display: 'flex', flexDirection: 'column', padding: 'max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.t1 }}>{title || ''}</span>
            <button type="button" onClick={() => history.back()} aria-label="Close full screen"
              style={{ minWidth: 40, minHeight: 40, borderRadius: 10, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, fontSize: 18, cursor: 'pointer' }}>×</button>
          </div>
          <FullscreenBody render={hgt => children(ctx(hgt, true))} />
          {chips}
        </div>,
        document.body,
      )}
    </div>
  )
}

// Measures the space left in the full-screen sheet so the chart fills it (and re-fits on rotation).
function FullscreenBody({ render }) {
  const ref = useRef(null)
  const [hgt, setHgt] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setHgt(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return <div ref={ref} style={{ flex: 1, minHeight: 0 }}>{hgt > 0 && <div style={{ height: hgt }}>{render(hgt)}</div>}</div>
}
