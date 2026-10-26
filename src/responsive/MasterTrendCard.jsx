import { useEffect, useMemo, useRef, useState } from 'react'
import { C } from '../utils.js'
import DeltaBadge from './DeltaBadge.jsx'
import InfoPopover from './InfoPopover.jsx'
import KpiTile from './KpiTile.jsx'

// Master trend card (docs/responsive/MOBILE_DESIGN_SYSTEM.md §2, mockups/sales_mobile_mockup.html #master).
// Shared by every page that has KPIs + a trend: the page passes its metrics, this card only lays
// them out. Display only - totals come in pre-formatted; the chart plots the page's own rows,
// grouped by the page's own groupTrend().
//   hero   one metric (the first by default), 28px, with a FIXED two-line sub-line (▲/▼ vs prev +
//          the metric's `sub` text), so nothing below moves when it changes
//   chart  120px, edge to edge, no axes, one faint guide line (the period average), previous period
//          dashed; touch-and-drag scrubs a point into the hero (date · prev value); lifting the finger
//          restores the period total. Metrics without a daily series show "No daily breakdown".
//   tiles  even 2-column KpiTile grid (3 on tablet; 2 beside the chart on a phone in landscape);
//          tapping one switches hero + chart, the selected tile glows
//   ⋯      granularity override; Auto picks daily ≤ 31 days, weekly ≤ ~6 months, else monthly
//
// metrics: [{ key, label, tileLabel, def, value, sub, delta, deltaLoading, deltasHidden, lowerIsBetter,
//             status, point(row) → number|null, prevPoint(row) → number|null, fmtPoint,
//             compare: [{ label, delta }] → labelled ▲/▼ in the hero instead of "vs prev" (e.g. MoM, YoY) }]
// layout:  'phone' | 'tablet' | 'landscape'
// note:    optional slim info strip at the top of the card (data availability etc.)

function autoGranularity(start, end) {
  if (!start || !end) return 'daily'
  const days = Math.round((new Date(end) - new Date(start)) / 86400000) + 1
  return days <= 31 ? 'daily' : days <= 183 ? 'weekly' : 'monthly'
}
const GRAN_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function pointLabel(key, gran) {
  const [y, m, d] = key.split('-').map(Number)
  if (gran === 'monthly') return `${MONTHS[m - 1]} ${y}`
  return `${gran === 'weekly' ? 'Week of ' : ''}${d} ${MONTHS[m - 1]}`
}

const CHART_H = 120

export default function MasterTrendCard({ metrics, rawRows, groupTrend, start, end, layout = 'phone', note = null }) {
  const M = C.m
  const [selKey, setSelKey] = useState(metrics[0].key)
  const [granOverride, setGranOverride] = useState('auto')
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrub, setScrub] = useState(null)
  const menuRef = useRef(null)

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

  const scrubRow = scrub != null ? (rows[scrub] ?? null) : null
  const scrubVal = scrubRow && hasSeries ? m.point(scrubRow) : null
  const scrubPrev = scrubRow && m.prevPoint ? m.prevPoint(scrubRow) : null
  const prevAvailable = hasSeries && m.prevPoint && rows.some(r => m.prevPoint(r) != null)

  const hero = (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: M.type.label, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: M.muted, whiteSpace: 'nowrap' }}>{m.label}</span>
          {m.def && <InfoPopover title={m.label} text={m.def} />}
        </span>
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button type="button" onClick={() => setMenuOpen(o => !o)} aria-label="Chart options" aria-haspopup="menu" aria-expanded={menuOpen}
            style={{ width: 40, height: 30, marginRight: -10, border: 'none', background: 'transparent', color: M.muted, fontSize: 20, lineHeight: 1, cursor: 'pointer', borderRadius: 8 }}>⋯</button>
          {menuOpen && (
            <div role="menu" style={{ position: 'absolute', right: -6, top: '100%', zIndex: C.z.dropdown, background: '#fff', border: `1px solid ${M.line}`, borderRadius: 12, boxShadow: C.sh3, padding: 6, minWidth: 200 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: M.muted, padding: '6px 10px 4px' }}>Show as</div>
              {[['auto', `Auto (${GRAN_LABEL[auto]})`], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']].map(([id, label]) => (
                <button key={id} type="button" role="menuitemradio" aria-checked={granOverride === id}
                  onClick={() => { setGranOverride(id); setScrub(null); setMenuOpen(false) }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 44, padding: '0 10px', border: 'none', borderRadius: 8, background: granOverride === id ? M.soft : 'transparent', color: M.ink, fontSize: 14, fontWeight: granOverride === id ? 700 : 500, fontFamily: 'var(--font)', cursor: 'pointer', textAlign: 'left' }}>
                  {label}{granOverride === id && <span aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div aria-live="polite">
        <div style={{ fontSize: M.type.hero, fontWeight: 700, color: M.ink, letterSpacing: '-.02em', lineHeight: 1.2, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
          {scrubRow && hasSeries ? (scrubVal == null ? '—' : m.fmtPoint(scrubVal)) : m.value}
        </div>
        {/* Fixed two-line sub-line: the chart and tiles never move when it changes. */}
        <div style={{ fontSize: 12.5, lineHeight: '18px', height: 36, overflow: 'hidden', color: M.muted }}>
          {scrubRow
            ? <>{pointLabel(scrubRow.date, gran)}{scrubPrev != null && <> · prev {m.fmtPoint(scrubPrev)}</>}</>
            : m.compare && !m.deltasHidden
              ? <>{m.compare.map((c, i) => <span key={c.label}>{i > 0 && ' · '}<DeltaBadge delta={c.delta} lowerIsBetter={m.lowerIsBetter} size={12.5} /> {c.label}</span>)}{m.sub && <> · {m.sub}</>}</>
              : <>{!m.deltasHidden && <><DeltaBadge delta={m.delta} loading={m.deltaLoading} lowerIsBetter={m.lowerIsBetter} size={12.5} /> vs prev</>}{m.sub ? <>{!m.deltasHidden ? ' · ' : ''}{m.sub}</> : (!m.deltasHidden ? ' period' : '')}</>}
        </div>
      </div>
    </div>
  )

  const chart = (
    <div style={{ margin: layout === 'landscape' ? '6px 0 0' : '6px -16px 0' }}>
      {hasSeries
        ? <ScrubChart rows={rows} point={m.point} prevPoint={prevAvailable ? m.prevPoint : null} scrub={scrub} setScrub={setScrub} label={`${m.label}, ${GRAN_LABEL[gran].toLowerCase()}`} />
        : <div style={{ height: CHART_H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: M.muted, fontSize: 13 }}>No daily breakdown</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: layout === 'landscape' ? '6px 0 0' : '6px 16px 0', fontSize: 12, color: M.muted, minHeight: 24 }}>
        {hasSeries && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: M.green, display: 'inline-block' }} />This period</span>}
        {hasSeries && prevAvailable && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: M.prev, display: 'inline-block' }} />Prev period</span>}
        <span style={{ marginLeft: 'auto' }}>{GRAN_LABEL[gran]}{granOverride === 'auto' ? ' · auto' : ''}</span>
      </div>
    </div>
  )

  const n = metrics.length
  // Tablet: 4 or 3 columns so rows fill evenly where they can (8 → 4, 6 → 3); never 5 - at 768px
  // five tiles across cut their labels.
  const cols = layout === 'tablet' ? (n % 3 === 0 && n % 4 !== 0 ? 3 : 4) : 2
  const tiles = (
    <div role="group" aria-label="Choose metric" className="master-tiles" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 8, marginTop: layout === 'landscape' ? 0 : 10 }}>
      {metrics.map(x => (
        <KpiTile key={x.key} label={x.tileLabel || x.label} value={x.value} delta={x.delta} deltaLoading={x.deltaLoading} deltaHidden={x.deltasHidden}
          lowerIsBetter={x.lowerIsBetter} status={x.status} onGradient selected={x.key === m.key}
          onSelect={() => { setSelKey(x.key); setScrub(null) }} />
      ))}
    </div>
  )

  return (
    <div className="master-card" style={{ background: M.masterGrad, border: `1px solid ${M.masterBorder}`, borderRadius: M.radius.card, padding: 16, boxShadow: M.cardShadow, overflow: 'hidden' }}>
      {note && <div style={{ marginBottom: 10 }}>{note}</div>}
      {layout === 'landscape'
        ? <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}><div>{hero}{chart}</div>{tiles}</div>
        : <>{hero}{chart}{tiles}</>}
    </div>
  )
}

// SVG line chart with no axes. Pointer down/move maps the finger's x to the nearest point;
// touch-action pan-y keeps vertical page scrolling working while horizontal drags scrub.
function ScrubChart({ rows, point, prevPoint, scrub, setScrub, label }) {
  const M = C.m
  const H = CHART_H, PAD_T = 8, PAD_B = 8
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
  const max = vals.length ? Math.max(...vals) * 1.05 : 1
  const min = vals.length ? Math.min(...vals) * 0.9 : 0
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
  const dragging = useRef(false)
  const onDown = e => { if (!n) return; dragging.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); setScrub(idxAt(e.clientX)) }
  const onMove = e => { if (n && (dragging.current || e.pointerType === 'mouse')) setScrub(idxAt(e.clientX)) }
  const end = () => { dragging.current = false; setScrub(null) }

  const sv = scrub != null ? cur[scrub] : null
  return (
    <div ref={boxRef} role="img" aria-label={`${label} trend. Touch and drag to see each value.`}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={end} onPointerCancel={end} onPointerLeave={end}
      style={{ height: H, position: 'relative', touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'crosshair' }}>
      {w > 0 && (
        <svg width={w} height={H} style={{ display: 'block', overflow: 'visible' }}>
          <defs>
            <linearGradient id="mtcGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={M.green} stopOpacity={0.18} />
              <stop offset="1" stopColor={M.green} stopOpacity={0} />
            </linearGradient>
          </defs>
          {avg != null && <line x1={0} x2={w} y1={y(avg)} y2={y(avg)} stroke={M.line} strokeWidth={1} />}
          {areaPath && <path d={areaPath} fill="url(#mtcGrad)" />}
          {prevPoint && <path d={path(prev)} fill="none" stroke={M.prev} strokeWidth={1.5} strokeDasharray="4 4" />}
          <path d={curPath} fill="none" stroke={M.green} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
          {scrub != null && (
            <g>
              <line x1={x(scrub)} x2={x(scrub)} y1={0} y2={H} stroke={M.ink} strokeOpacity={0.3} strokeWidth={1} />
              {sv != null && <circle cx={x(scrub)} cy={y(sv)} r={5} fill="#fff" stroke={M.green} strokeWidth={2.5} />}
            </g>
          )}
        </svg>
      )}
    </div>
  )
}
