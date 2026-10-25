import { useEffect, useMemo, useRef, useState } from 'react'
import { C } from '../utils.js'
import DeltaBadge from '../responsive/DeltaBadge.jsx'
import InfoPopover from '../responsive/InfoPopover.jsx'

// Overview "Sales Trend" card on mobile (< 1024px, and phones in landscape) - matches
// docs/responsive/mockups/overview_mobile_mockup.html. Display only: every total is a value the page
// already computed (passed in via `metrics`); the chart plots the same rows the desktop chart uses,
// grouped by the same groupTrend() function.
//
//   hero      one metric (default Gross Revenue) + ▲/▼ vs the previous period
//   chart     edge-to-edge line, no axes, one faint guide line (the period average); the previous
//             period as a dashed line. Touch-and-drag scrubs a day/week/month into the hero; lifting
//             the finger restores the period total. Metrics with no daily series (Return %) show
//             their value with a "No daily breakdown" note instead of a chart.
//   chips     every KPI; tapping one switches hero + chart. Phones: one swipeable row. Tablet: a
//             3-column grid. Phone landscape: chips sit in a 2-column grid beside the chart.
//   ⋯ menu    granularity override (Auto picks it from the date range)
//
// metrics: [{ key, label, chipLabel, def, value, delta, deltaLoading, deltasHidden, lowerIsBetter,
//             valueColor, point(row) → number|null, prevPoint(row) → number|null, fmtPoint }]
// layout:  'phone' | 'tablet' | 'landscape'

// ≤ 31 days → daily, ≤ ~6 months → weekly, longer → monthly.
function autoGranularity(start, end) {
  if (!start || !end) return 'daily'
  const days = Math.round((new Date(end) - new Date(start)) / 86400000) + 1
  return days <= 31 ? 'daily' : days <= 183 ? 'weekly' : 'monthly'
}

const GRAN_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }

function pointLabel(key, gran) {
  if (gran === 'monthly') return new Date(`${key}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
  const s = new Date(`${key}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  return gran === 'weekly' ? `Week of ${s}` : s
}

export default function SalesTrendMobile({ metrics, rawRows, groupTrend, start, end, layout = 'phone' }) {
  const [selKey, setSelKey] = useState(metrics[0].key)
  const [granOverride, setGranOverride] = useState('auto')
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrub, setScrub] = useState(null) // row index while a finger is down
  const menuRef = useRef(null)
  const chipRowRef = useRef(null)

  const auto = autoGranularity(start, end)
  const gran = granOverride === 'auto' ? auto : granOverride
  const rows = useMemo(() => groupTrend(rawRows, gran), [rawRows, gran, groupTrend])
  const m = metrics.find(x => x.key === selKey) || metrics[0]
  const hasSeries = typeof m.point === 'function'

  useEffect(() => {
    if (!menuOpen) return
    const close = e => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menuOpen])

  // Keep the selected chip fully in view (a chip tapped at the faded edge would stay cut off).
  useEffect(() => {
    const row = chipRowRef.current
    const chip = row?.querySelector('[aria-pressed="true"]')
    if (!row || !chip || layout !== 'phone') return
    const left = chip.offsetLeft - 16, right = chip.offsetLeft + chip.offsetWidth + 28 - row.clientWidth
    if (row.scrollLeft > left) row.scrollTo({ left, behavior: 'smooth' })
    else if (row.scrollLeft < right) row.scrollTo({ left: right, behavior: 'smooth' })
  }, [selKey, layout])

  // rows can shrink under a stale index (range or granularity changed mid-scrub) - treat as no scrub.
  const scrubRow = scrub != null ? (rows[scrub] ?? null) : null
  const scrubVal = scrubRow && hasSeries ? m.point(scrubRow) : null
  const scrubPrev = scrubRow && m.prevPoint ? m.prevPoint(scrubRow) : null
  const prevAvailable = hasSeries && m.prevPoint && rows.some(r => m.prevPoint(r) != null)

  const hero = (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: C.t3, whiteSpace: 'nowrap' }}>{m.label}</span>
          {m.def && <InfoPopover title={m.label} text={m.def} />}
        </span>
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button type="button" onClick={() => setMenuOpen(o => !o)} aria-label="Chart options" aria-haspopup="menu" aria-expanded={menuOpen}
            style={{ width: 40, height: 32, marginRight: -10, border: 'none', background: 'transparent', color: C.t3, fontSize: 20, lineHeight: 1, cursor: 'pointer', borderRadius: 8 }}>⋯</button>
          {menuOpen && (
            <div role="menu" style={{ position: 'absolute', right: -6, top: '100%', zIndex: C.z.dropdown, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: C.sh3, padding: 6, minWidth: 200 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, padding: '6px 10px 4px' }}>Show as</div>
              {[['auto', `Auto (${GRAN_LABEL[auto]})`], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']].map(([id, label]) => (
                <button key={id} type="button" role="menuitemradio" aria-checked={granOverride === id}
                  onClick={() => { setGranOverride(id); setScrub(null); setMenuOpen(false) }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 44, padding: '0 10px', border: 'none', borderRadius: 8, background: granOverride === id ? C.acl : 'transparent', color: C.t1, fontSize: 14, fontWeight: granOverride === id ? 700 : 500, fontFamily: 'var(--font)', cursor: 'pointer', textAlign: 'left' }}>
                  {label}{granOverride === id && <span aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div aria-live="polite">
        <div style={{ fontSize: C.type.hero.size, fontWeight: C.type.hero.weight, color: scrubRow ? C.t1 : (m.valueColor || C.t1), letterSpacing: '-.02em', lineHeight: 1.15, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
          {scrubRow && hasSeries ? (scrubVal == null ? '—' : m.fmtPoint(scrubVal)) : m.value}
        </div>
        <div style={{ fontSize: 13, color: C.t3, marginTop: 2, minHeight: 20, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap', whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {scrubRow
            ? <><span>{pointLabel(scrubRow.date, gran)}</span>{scrubPrev != null && <span>· prev {m.fmtPoint(scrubPrev)}</span>}</>
            : !m.deltasHidden && <><DeltaBadge delta={m.delta} loading={m.deltaLoading} lowerIsBetter={m.lowerIsBetter} size={13} /><span>vs prev period</span></>}
        </div>
      </div>
    </div>
  )

  const chart = (
    <div style={{ margin: layout === 'landscape' ? '8px 0 0' : '8px -16px 0' }}>
      {hasSeries
        ? <ScrubChart rows={rows} point={m.point} prevPoint={prevAvailable ? m.prevPoint : null} scrub={scrub} setScrub={setScrub} label={`${m.label}, ${GRAN_LABEL[gran].toLowerCase()}`} height={layout === 'tablet' ? 200 : 150} />
        : <div style={{ height: layout === 'tablet' ? 200 : 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px', textAlign: 'center', color: C.t3, fontSize: 13, background: `linear-gradient(180deg, ${C.hov}, ${C.card})` }}>
            No daily breakdown
          </div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: layout === 'landscape' ? '6px 0 0' : '6px 16px 0', fontSize: 12, color: C.t3 }}>
        {hasSeries && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 16, borderTop: `2.5px solid ${C.acc}`, display: 'inline-block' }} />This period</span>}
        {hasSeries && prevAvailable && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 16, borderTop: `2px dashed ${C.border2}`, display: 'inline-block' }} />Prev period</span>}
        <span style={{ marginLeft: 'auto' }}>{GRAN_LABEL[gran]}{granOverride === 'auto' ? ' · auto' : ''}</span>
      </div>
    </div>
  )

  const chipButtons = metrics.map(x => {
    const sel = x.key === m.key
    return (
      <button key={x.key} type="button" aria-pressed={sel} onClick={() => { setSelKey(x.key); setScrub(null) }}
        style={{ flex: layout === 'phone' ? '0 0 auto' : undefined, scrollSnapAlign: 'start', minWidth: layout === 'phone' ? 124 : 0, minHeight: 60, padding: '9px 12px', borderRadius: 14, textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font)',
          border: `1.5px solid ${sel ? C.acc : 'transparent'}`, background: sel ? C.card : C.hov, boxShadow: sel ? `0 0 0 3px rgba(${C.accRgb},.12)` : 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* narrow card: ▲/▼ sits top-right next to the label */}
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: C.t3, whiteSpace: 'nowrap' }}>{x.chipLabel || x.label}</span>
          {!x.deltasHidden && <DeltaBadge delta={x.delta} loading={x.deltaLoading} lowerIsBetter={x.lowerIsBetter} size={12} />}
        </span>
        <span style={{ fontSize: 16, fontWeight: 700, color: x.valueColor || C.t1, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{x.value}</span>
      </button>
    )
  })
  const chips = layout === 'phone'
    ? <div ref={chipRowRef} className="trend-chip-row" role="group" aria-label="Choose metric"
        style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', margin: '14px -16px 0', padding: '2px 16px 4px', scrollPaddingLeft: 16,
          WebkitMaskImage: 'linear-gradient(90deg, #000 88%, transparent)', maskImage: 'linear-gradient(90deg, #000 88%, transparent)' }}>{chipButtons}</div>
    : <div role="group" aria-label="Choose metric" style={{ display: 'grid', gridTemplateColumns: `repeat(${layout === 'tablet' ? 3 : 2}, minmax(0,1fr))`, gap: 8, marginTop: layout === 'landscape' ? 0 : 14 }}>{chipButtons}</div>

  return (
    <div style={{ background: C.card, borderRadius: 18, padding: '16px 16px 14px', boxShadow: C.sh1, overflow: 'hidden' }}>
      {layout === 'landscape'
        ? <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.25fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}><div>{hero}{chart}</div>{chips}</div>
        : <>{hero}{chart}{chips}</>}
    </div>
  )
}

// SVG line chart with no axes. Scrubbing: pointer down/move maps the finger's x to the nearest
// point; touch-action pan-y keeps vertical page scrolling working while horizontal drags scrub.
function ScrubChart({ rows, point, prevPoint, scrub, setScrub, label, height: H }) {
  const PAD_T = 12, PAD_B = 10
  const boxRef = useRef(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const cur = rows.map(point)
  const prev = prevPoint ? rows.map(prevPoint) : []
  const vals = [...cur, ...prev].filter(v => v != null && isFinite(v))
  const max = vals.length ? Math.max(...vals) : 1
  const min = vals.length ? Math.min(0, ...vals) : 0
  const n = rows.length
  const x = i => (n <= 1 ? w / 2 : (i / (n - 1)) * w)
  const y = v => PAD_T + (1 - (v - min) / ((max - min) || 1)) * (H - PAD_T - PAD_B)
  const path = arr => {
    let d = '', pen = false
    arr.forEach((v, i) => {
      if (v == null || !isFinite(v)) { pen = false; return }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
      pen = true
    })
    return d
  }
  const curPath = path(cur)
  const firstIdx = cur.findIndex(v => v != null), lastIdx = cur.length - 1 - [...cur].reverse().findIndex(v => v != null)
  const areaPath = curPath && firstIdx >= 0 ? `${curPath}L${x(lastIdx).toFixed(1)},${H}L${x(firstIdx).toFixed(1)},${H}Z` : ''
  const nonNull = cur.filter(v => v != null && isFinite(v))
  const avg = nonNull.length ? nonNull.reduce((s, v) => s + v, 0) / nonNull.length : null

  const idxAt = clientX => {
    const r = boxRef.current.getBoundingClientRect()
    const t = Math.min(1, Math.max(0, (clientX - r.left) / (r.width || 1)))
    return Math.round(t * (n - 1))
  }
  // Finger down → scrub follows it; lifted (or the browser takes over for a vertical scroll, which
  // fires pointercancel) → back to the period total. A mouse scrubs on hover.
  const dragging = useRef(false)
  const onDown = e => { if (!n) return; dragging.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); setScrub(idxAt(e.clientX)) }
  const onMove = e => { if (n && (dragging.current || e.pointerType === 'mouse')) setScrub(idxAt(e.clientX)) }
  const end = () => { dragging.current = false; setScrub(null) }

  const sv = scrub != null ? cur[scrub] : null
  const pv = scrub != null && prevPoint ? prev[scrub] : null
  return (
    <div ref={boxRef} role="img" aria-label={`${label} trend. Touch and drag to see each value.`}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={end} onPointerCancel={end} onPointerLeave={end}
      style={{ height: H, position: 'relative', touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'crosshair' }}>
      {w > 0 && (
        <svg width={w} height={H} style={{ display: 'block', overflow: 'visible' }}>
          <defs>
            <linearGradient id="ovMobGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.acc} stopOpacity={0.22} />
              <stop offset="100%" stopColor={C.acc} stopOpacity={0} />
            </linearGradient>
          </defs>
          {avg != null && <line x1={0} x2={w} y1={y(avg)} y2={y(avg)} stroke={C.border} strokeWidth={1} />}
          {areaPath && <path d={areaPath} fill="url(#ovMobGrad)" />}
          {prevPoint && <path d={path(prev)} fill="none" stroke={C.border2} strokeWidth={1.6} strokeDasharray="4 4" />}
          <path d={curPath} fill="none" stroke={C.acc} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
          {scrub != null && (
            <g>
              <line x1={x(scrub)} x2={x(scrub)} y1={0} y2={H} stroke={C.t1} strokeOpacity={0.35} strokeWidth={1} />
              {pv != null && <circle cx={x(scrub)} cy={y(pv)} r={3.5} fill={C.card} stroke={C.border2} strokeWidth={1.5} />}
              {sv != null && <circle cx={x(scrub)} cy={y(sv)} r={5} fill={C.card} stroke={C.acc} strokeWidth={2.5} />}
            </g>
          )}
        </svg>
      )}
    </div>
  )
}
