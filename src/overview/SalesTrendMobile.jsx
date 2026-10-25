import { useEffect, useMemo, useRef, useState } from 'react'
import { C } from '../utils.js'
import { Card } from '../components.jsx'

// Overview "Sales Trend" card for phones in portrait (xs/sm, < 768px). Desktop, tablet and phone
// landscape keep the original card. Display only: every total shown is the value the page already
// computed (passed in via `metrics`); the chart plots the same daily rows the desktop chart uses,
// grouped by the same groupTrend() function.
//
//   hero      one metric (default Gross Revenue) + ▲/▼ % vs prev period where the page has one
//   chart     edge-to-edge line, no axes, one faint guide line (the period average);
//             touch-and-drag scrubs a day/week/month into the hero, lifting the finger restores
//             the period total
//   chips     the other KPIs in one swipeable row; tapping one switches hero + chart to it
//   ⋯ menu    granularity override (Auto picks it from the date range)
//
// metrics: [{ key, label, value, delta (number|null), upIsGood, valueColor, point(row) -> number|null,
//             fmtPoint, prevPoint(row) -> number|null }]

// ≤ 31 days → daily, ≤ ~6 months → weekly, longer → monthly.
function autoGranularity(start, end) {
  if (!start || !end) return 'daily'
  const days = Math.round((new Date(end) - new Date(start)) / 86400000) + 1
  return days <= 31 ? 'daily' : days <= 183 ? 'weekly' : 'monthly'
}

const GRAN_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }

function pointLabel(key, gran) {
  if (gran === 'monthly') {
    const d = new Date(`${key}-01T00:00:00`)
    return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
  }
  const d = new Date(`${key}T00:00:00`)
  const s = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  return gran === 'weekly' ? `Week of ${s}` : d.toLocaleDateString('en-IN', { weekday: 'short' }) + ', ' + s
}

function rangeLabel(start, end) {
  if (!start || !end) return ''
  const f = (s, o) => new Date(`${s}T00:00:00`).toLocaleDateString('en-IN', o)
  return `${f(start, { day: 'numeric', month: 'short' })} – ${f(end, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

function Delta({ value, upIsGood = true, size = 11 }) {
  if (value == null || !isFinite(value)) return null
  const up = value >= 0
  const good = up === upIsGood
  return (
    <span style={{ fontSize: size, fontWeight: 700, color: good ? C.green.tx : C.red.tx, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
      {up ? '▲' : '▼'}{Math.abs(value).toFixed(1)}%
    </span>
  )
}

export default function SalesTrendMobile({ metrics, rawRows, groupTrend, start, end }) {
  const [selKey, setSelKey] = useState(metrics[0].key)
  const [granOverride, setGranOverride] = useState('auto')
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrub, setScrub] = useState(null) // index into rows while a finger is down
  const menuRef = useRef(null)
  const chipRowRef = useRef(null)

  const auto = autoGranularity(start, end)
  const gran = granOverride === 'auto' ? auto : granOverride
  const rows = useMemo(() => groupTrend(rawRows, gran), [rawRows, gran, groupTrend])
  const m = metrics.find(x => x.key === selKey) || metrics[0]
  const hasSeries = typeof m.point === 'function'

  // Keep the selected chip fully in view (a chip tapped at the faded edge would otherwise stay cut off).
  useEffect(() => {
    const row = chipRowRef.current
    const chip = row?.querySelector('[aria-pressed="true"]')
    if (!row || !chip) return
    const left = chip.offsetLeft - 16, right = chip.offsetLeft + chip.offsetWidth + 28 - row.clientWidth
    if (row.scrollLeft > left) row.scrollTo({ left, behavior: 'smooth' })
    else if (row.scrollLeft < right) row.scrollTo({ left: right, behavior: 'smooth' })
  }, [selKey])

  useEffect(() => {
    if (!menuOpen) return
    const close = e => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menuOpen])

  // rows can shrink under a stale index (range or granularity changed mid-scrub) - treat as no scrub.
  const scrubRow = scrub != null ? (rows[scrub] ?? null) : null
  const heroValue = scrubRow && hasSeries ? (m.point(scrubRow) == null ? '—' : m.fmtPoint(m.point(scrubRow))) : m.value
  const scrubPrev = scrubRow && m.prevPoint ? m.prevPoint(scrubRow) : null

  return (
    <Card style={{ padding: '14px 16px 12px', overflow: 'hidden' }}>
      {/* header: title + ⋯ (granularity override) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>Sales Trend</span>
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button type="button" onClick={() => setMenuOpen(o => !o)} aria-label="Chart options" aria-haspopup="menu" aria-expanded={menuOpen}
            style={{ width: 36, height: 30, marginRight: -8, border: 'none', background: 'transparent', color: C.t2, fontSize: 18, lineHeight: 1, cursor: 'pointer', borderRadius: 8 }}>⋯</button>
          {menuOpen && (
            <div role="menu" style={{ position: 'absolute', right: -4, top: '100%', zIndex: C.z.dropdown, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: C.sh3, padding: 6, minWidth: 190 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, padding: '6px 10px 4px' }}>Show as</div>
              {[['auto', `Auto (${GRAN_LABEL[auto]})`], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']].map(([id, label]) => (
                <button key={id} type="button" role="menuitemradio" aria-checked={granOverride === id}
                  onClick={() => { setGranOverride(id); setScrub(null); setMenuOpen(false) }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 40, padding: '0 10px', border: 'none', borderRadius: 8, background: granOverride === id ? C.acl : 'transparent', color: C.t1, fontSize: 13, fontWeight: granOverride === id ? 700 : 500, fontFamily: 'var(--font)', cursor: 'pointer', textAlign: 'left' }}>
                  {label}{granOverride === id && <span aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* hero */}
      <div aria-live="polite" style={{ minHeight: 70 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3 }}>
          {m.label}{scrubRow ? <span style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: C.t2 }}> · {pointLabel(scrubRow.date, gran)}</span> : null}
        </div>
        <div style={{ fontSize: 30, fontWeight: 700, color: scrubRow ? C.t1 : (m.valueColor || C.t1), letterSpacing: '-.02em', lineHeight: 1.15, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{heroValue}</div>
        <div style={{ fontSize: 11.5, color: C.t3, marginTop: 3, minHeight: 16, display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
          {scrubRow
            ? (scrubPrev != null ? <span>Prev period: <b style={{ color: C.t2, fontWeight: 600 }}>{m.fmtPoint(scrubPrev)}</b></span> : <span>{GRAN_LABEL[gran]} value</span>)
            : (m.delta != null
              ? <><Delta value={m.delta} upIsGood={m.upIsGood} size={12} /><span>vs prev period</span></>
              : <span>{rangeLabel(start, end)}</span>)}
        </div>
      </div>

      {/* chart, edge to edge */}
      <div style={{ margin: '8px -16px 0' }}>
        {hasSeries
          ? <ScrubChart rows={rows} point={m.point} prevPoint={m.prevPoint} scrub={scrub} setScrub={setScrub} label={`${m.label}, ${GRAN_LABEL[gran].toLowerCase()}`} />
          : <div style={{ height: 132, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px', textAlign: 'center', color: C.t3, fontSize: 12, background: `linear-gradient(180deg, ${C.hov}, ${C.card})` }}>
              No daily breakdown for {m.label} — the period total is shown above.
            </div>}
      </div>

      {/* legend + granularity caption */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6, fontSize: 10.5, color: C.t3 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          {hasSeries && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ width: 12, height: 2, background: C.acc, borderRadius: 1, display: 'inline-block' }} />This period</span>}
          {hasSeries && m.prevPoint && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ width: 12, borderTop: `2px dashed ${C.border2}`, display: 'inline-block' }} />Prev period</span>}
        </span>
        <span>{GRAN_LABEL[gran]}{granOverride === 'auto' ? ' · auto' : ''}</span>
      </div>

      {/* KPI chips */}
      <div ref={chipRowRef} className="trend-chip-row" role="group" aria-label="Choose metric"
        style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', margin: '10px -16px 0', padding: '2px 16px 2px', scrollPaddingLeft: 16,
          WebkitMaskImage: 'linear-gradient(90deg, transparent 0, #000 14px, #000 calc(100% - 28px), transparent 100%)', maskImage: 'linear-gradient(90deg, transparent 0, #000 14px, #000 calc(100% - 28px), transparent 100%)' }}>
        {metrics.map(x => {
          const sel = x.key === m.key
          return (
            <button key={x.key} type="button" aria-pressed={sel} onClick={() => { setSelKey(x.key); setScrub(null) }}
              style={{ flex: '0 0 auto', scrollSnapAlign: 'start', minWidth: 96, minHeight: 52, padding: '7px 11px', borderRadius: 12, textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font)',
                border: `1.5px solid ${sel ? C.acc : C.border}`, background: sel ? C.acl : C.card, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: sel ? C.acd : C.t3, whiteSpace: 'nowrap' }}>{x.chipLabel || x.label}</span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: x.valueColor || C.t1, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{x.value}</span>
                <Delta value={x.delta} upIsGood={x.upIsGood} size={10.5} />
              </span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

// SVG line chart with no axes. Scrubbing: pointer down/move maps the finger's x to the nearest
// point; touch-action pan-y keeps vertical page scrolling working while horizontal drags scrub.
function ScrubChart({ rows, point, prevPoint, scrub, setScrub, label }) {
  const H = 132, PAD_T = 10, PAD_B = 8
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
              <stop offset="0%" stopColor={C.acc} stopOpacity={0.20} />
              <stop offset="100%" stopColor={C.acc} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          {avg != null && <line x1={0} x2={w} y1={y(avg)} y2={y(avg)} stroke={C.border} strokeWidth={1} strokeDasharray="2 4" />}
          {prevPoint && <path d={path(prev)} fill="none" stroke={C.border2} strokeWidth={1.5} strokeDasharray="4 4" />}
          {areaPath && <path d={areaPath} fill="url(#ovMobGrad)" />}
          <path d={curPath} fill="none" stroke={C.acc} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
          {scrub != null && (
            <g>
              <line x1={x(scrub)} x2={x(scrub)} y1={0} y2={H} stroke={C.t2} strokeWidth={1} />
              {pv != null && <circle cx={x(scrub)} cy={y(pv)} r={3.5} fill={C.card} stroke={C.border2} strokeWidth={1.5} />}
              {sv != null && <circle cx={x(scrub)} cy={y(sv)} r={5} fill={C.acc} stroke={C.card} strokeWidth={2} />}
            </g>
          )}
        </svg>
      )}
    </div>
  )
}
