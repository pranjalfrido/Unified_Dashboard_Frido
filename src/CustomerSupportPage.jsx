import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Card, ChartTooltip, chartLegendProps, ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from './components.jsx'
import MixBar from './responsive/MixBar.jsx'
import WatchlistCard from './responsive/WatchlistCard.jsx'
import { computeSupportRules } from './customer/customerRules.js'
import CustomerSupportMobile from './customer/CustomerSupportMobile.jsx'
import { C as BASE_C, fmtN, exportCSV } from './utils.js'
import { yesterdayStillLoading, SUPPORT_LOAD_NOTE, orders7Of, per100, reasonLink, GRAINS, chLabel, trimPunct, dur, hrs, pctF, ratio, int, div, periodLabel, buildModel, avg, PCT_DEFAULT, fcr, sections, changeOf, ttrColumns, ttrRows, AGE_BUCKETS, pendencyRows, pendencyCsv, driverRows, detailedCsv, DOW, MAIN, shiftDay } from './customer/supportModel.js'
import InfoStrip from './responsive/InfoStrip.jsx'

// Customer Support (CC dashboard): Freshdesk tickets + Ozonetel calls + Shopify D2C orders,
// laid out as the CC spec sheet does — KPIs down the side, periods across (Day 1..7,
// Week 1..4, Month 1..2). All numbers come from /api/customer-support; definitions are in the
// header comment of api/customer-support.js and repeated in the row tooltips here.

const C = BASE_C
const API = import.meta.env.VITE_API_URL || ''

// ── UI ──
function Delta({ cur, prev, good, isRate = false }) {
  const c = changeOf(cur, prev, isRate)
  if (!c) return <span style={{ color: C.t3 }}>—</span>
  const better = good === 'up' ? c.v > 0 : good === 'down' ? c.v < 0 : null
  const color = better == null || c.flat ? C.t2 : better ? C.green.tx : C.red.tx
  return <span style={{ color, fontWeight: 600 }}>{c.v > 0 ? '▲' : c.v < 0 ? '▼' : ''} {c.text}</span>
}

// Same segmented "% | Count" control as the other dashboard tables.
function ShareToggle({ mode, setMode }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[{ id: 'pct', label: '%' }, { id: 'count', label: 'Count' }].map((opt, i) => (
        <div key={opt.id} style={{ display: 'flex', alignItems: 'center' }}>
          {i > 0 && <div style={{ width: 1, height: 14, background: C.border2, margin: '0 4px' }} />}
          <button onClick={e => { e.stopPropagation(); setMode(opt.id) }}
            style={{ fontSize: 11, fontWeight: mode === opt.id ? 700 : 500, padding: '3px 9px', borderRadius: 6, border: 'none', outline: 'none',
              background: mode === opt.id ? C.acs : 'transparent', color: mode === opt.id ? C.acd : C.t2, cursor: 'pointer', minWidth: 44, textAlign: 'center' }}>{opt.label}</button>
        </div>
      ))}
    </div>
  )
}

// `hidden` leading periods are context only: not shown as columns, but the change pill still
// compares against them. With a single period on screen the previous one is shown beside it
// (PREV | CURRENT | VS PREV); with several, the earlier ones are muted and the latest is bold.
// back: how many periods earlier the change compares with (7 = same weekday last week in Day view, CA10).
function Matrix({ rows, model, grain, deltaLabel, mode = 'count', hidden = 0, back = 1 }) {
  const th = { padding: '10px 12px', fontSize: 11, fontWeight: 700, color: C.t1, textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap', borderBottom: `1px solid ${C.border2}`, position: 'sticky', top: 0, zIndex: 1, background: C.card }
  const td = { padding: '13px 12px', fontSize: 13, borderTop: `1px solid ${C.border}`, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }
  const shownModel = model.slice(hidden)
  const withPrev = shownModel.length === 1 && model.length > 1       // show the day before beside the single column
  const cols = withPrev ? model.slice(-2) : shownModel
  let lastGroup = null
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 240 + (cols.length + 1) * 96 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left', minWidth: 190 }}>Metric</th>
            {cols.map((p, j) => {
              const isLast = j === cols.length - 1
              const lbl = withPrev ? (isLast ? 'Current' : 'Prev') : periodLabel(grain, p.key)
              return <th key={p.key} title={periodLabel(grain, p.key)} style={{ ...th, textAlign: 'right', color: isLast ? C.t1 : C.t3 }}>{lbl}</th>
            })}
            <th style={{ ...th, textAlign: 'right' }}>vs Prev</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            // A row with a `pct` getter shows its share of the base in % mode; the other rows stay as they are.
            const asPct = mode === 'pct' && r.pct
            const vals = model.map(p => (asPct ? r.pct(p) : r.get(p)))
            const fmtV = asPct ? pctF : r.fmt
            const showGroup = r.group && r.group !== lastGroup
            lastGroup = r.group
            const shown = withPrev ? vals.slice(-2) : vals.slice(hidden)
            return [
              showGroup && (
                <tr key={`g${i}`}><td colSpan={cols.length + 2} style={{ ...td, padding: '9px 12px', fontWeight: 700, color: C.acd, background: C.acl, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.06em' }}>{r.group}</td></tr>
              ),
              <tr key={i} title={r.hint || ''}>
                <td style={{ ...td, paddingLeft: r.group ? 24 : 12, fontWeight: r.strong ? 700 : 500, color: C.t1, cursor: r.hint ? 'help' : undefined }}>
                  {r.label}{r.hint && <span style={{ color: C.t3, fontSize: 10, marginLeft: 4 }}>ⓘ</span>}
                </td>
                {shown.map((v, j) => {
                  const isLast = j === shown.length - 1
                  const closed = v == null && r.closedSunday && grain === 'day' && new Date(`${cols[j]?.key}T00:00:00`).getDay() === 0
                  return <td key={j} title={closed ? 'Inbound line is closed on Sundays' : undefined} style={{ ...td, textAlign: 'right', fontSize: isLast ? 14 : 12.5, fontWeight: isLast || r.strong ? 700 : 400, color: v == null ? C.t3 : isLast ? C.t1 : C.t3 }}>{closed ? 'Closed' : fmtV(v)}</td>
                })}
                <td style={{ ...td, textAlign: 'right' }}><DeltaPill cur={vals.at(-1)} prev={vals.length > back ? vals.at(-1 - back) : null} good={asPct && r.goodPct ? r.goodPct : r.good} title={deltaLabel} isRate={asPct || r.fmt === pctF} /></td>
              </tr>,
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}


// Day-on-day comparison in one table: a row per resolver group (after parent and child tickets in
// total), and for every period in view four sub-columns: Created, Resolved, Pending, Avg TTR.
// Pending and TTR are coloured by whether they improved on the previous period (lower is better),
// Resolved the other way round; Created is neutral. Hover a figure for the previous value.
function TtrTable({ data, model, grain, hidden }) {
  const shown = model.slice(hidden)
  const cols = useMemo(() => ttrColumns(data), [data])
  const box = useRef(null)
  const [scrolls, setScrolls] = useState(false)
  useEffect(() => {
    const el = box.current
    if (!el) return
    el.scrollLeft = el.scrollWidth
    setScrolls(el.scrollWidth > el.clientWidth + 4)
  }, [shown.length, cols.length])
  const SUB = [
    { id: 'created', label: 'Created', get: x => x.c, fmt: int, good: null },
    { id: 'resolved', label: 'Resolved', get: x => x.n, fmt: int, good: 'up' },
    { id: 'pending', label: 'Pending', get: x => x.c - x.n, fmt: int, good: 'down' },
    { id: 'ttr', label: 'TTR', get: x => (x.n ? x.h / x.n : null), fmt: hrs, good: 'down' },
  ]
  const W = 62
  const head = { padding: '8px 6px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t1, textAlign: 'center', borderBottom: `1px solid ${C.border2}`, position: 'sticky', zIndex: 1, background: C.card }
  const cell = { padding: '10px 6px', fontSize: 12.5, borderTop: `1px solid ${C.border}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', minWidth: W }
  const tone = (good, cur, prev) => {
    if (!good || cur == null || prev == null || prev === 0 || cur === prev) return C.t1
    const better = good === 'up' ? cur > prev : cur < prev
    return better ? C.green.tx : C.red.tx
  }
  return (
    <>
    {scrolls && <div style={{ fontSize: 11.5, color: C.t3, padding: '8px 4px 2px' }}>← Scroll sideways for earlier {grain === 'day' ? 'days' : grain === 'week' ? 'weeks' : 'months'} (latest on the right)</div>}
    <div ref={box} style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 230 + shown.length * SUB.length * W }}>
        <thead>
          <tr>
            <th rowSpan={2} style={{ ...head, top: 0, textAlign: 'left', minWidth: 200, position: 'sticky', left: 0, background: C.card, zIndex: 3, verticalAlign: 'bottom' }}>Resolver group</th>
            {shown.map((p, i) => (
              <th key={p.key} colSpan={SUB.length} style={{ ...head, top: 0, background: i === shown.length - 1 ? C.ach : C.acl, borderLeft: `2px solid ${C.card}` }}>{periodLabel(grain, p.key)}</th>
            ))}
          </tr>
          <tr>
            {shown.flatMap((p, i) => SUB.map((m, j) => (
              <th key={`${p.key}-${m.id}`} style={{ ...head, top: 33, fontSize: 9.5, color: C.t3, borderLeft: j === 0 ? `2px solid ${C.card}` : undefined, background: i === shown.length - 1 ? 'rgba(' + C.accRgb + ',0.07)' : C.card }}>{m.label}</th>
            )))}
          </tr>
        </thead>
        <tbody>
          {cols.map((col, ci) => {
            const first = ci === 0 || (col.kind === 'group' && cols[ci - 1].kind === 'type')
            return (
              <tr key={col.label}>
                <td title={col.label} style={{ ...cell, textAlign: 'left', fontWeight: col.kind === 'type' ? 700 : 500, color: C.t1, position: 'sticky', left: 0, background: col.kind === 'type' ? C.acl : C.card, zIndex: 1, borderTop: first && col.kind === 'group' ? `2px solid ${C.border2}` : cell.borderTop, maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis' }}>{col.label}</td>
                {shown.map((p, i) => {
                  const idx = hidden + i
                  const x = col.v[p.key], px = idx > 0 ? col.v[model[idx - 1].key] : null
                  return SUB.map((m, j) => {
                    const cur = x ? m.get(x) : (m.id === 'ttr' ? null : 0)
                    const prev = px ? m.get(px) : null
                    const delta = cur != null && prev ? ` (${cur >= prev ? '+' : ''}${(((cur - prev) / Math.abs(prev)) * 100).toFixed(1)}%)` : ''
                    return (
                      <td key={`${p.key}-${m.id}`} title={prev != null ? `Previous: ${m.fmt(prev)}${delta}` : ''}
                        style={{ ...cell, borderLeft: j === 0 ? `2px solid ${C.card}` : undefined, fontWeight: m.id === 'ttr' ? 700 : 400,
                          color: cur == null ? C.t3 : tone(m.good, cur, prev),
                          background: col.kind === 'type' ? C.acl : i === shown.length - 1 ? 'rgba(' + C.accRgb + ',0.05)' : 'transparent',
                          borderTop: first && col.kind === 'group' ? `2px solid ${C.border2}` : cell.borderTop }}>{m.fmt(cur)}</td>
                    )
                  })
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
    </>
  )
}

function PendencyTable({ data, kind }) {
  const { rows, all, total } = useMemo(() => pendencyRows(data, kind), [data, kind])
  if (!total) return <div style={{ color: C.t3, fontSize: 12.5, padding: 20 }}>No pending {kind.toLowerCase()} tickets.</div>
  const max = Math.max(...rows.flatMap(r => Object.values(r.v)), 1)
  const th = { padding: '9px 10px', fontSize: 10.5, fontWeight: 700, color: C.t1, textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'right', borderBottom: `1px solid ${C.border2}`, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1, background: C.card }
  const td = { padding: '10px', fontSize: 12.5, borderTop: `1px solid ${C.border}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  const heat = (n) => (n ? `rgba(${C.accRgb},${(0.08 + 0.5 * (n / max)).toFixed(2)})` : 'transparent')
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 240 + (AGE_BUCKETS.length + 1) * 84 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left', minWidth: 210 }}>Resolver group</th>
            {AGE_BUCKETS.map(([k, l]) => <th key={k} style={th}>{l}</th>)}
            <th style={{ ...th, background: C.acl }}>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: C.t1, background: C.acl }}>All resolver groups</td>
            {AGE_BUCKETS.map(([k]) => <td key={k} style={{ ...td, fontWeight: 700, color: C.t1, background: C.acl }}>{fmtN(all[k] || 0)}</td>)}
            <td style={{ ...td, fontWeight: 800, color: C.t1, background: C.acl }}>{fmtN(total)}</td>
          </tr>
          {rows.map(r => (
            <tr key={r.grp}>
              <td title={r.grp} style={{ ...td, textAlign: 'left', color: C.t1, fontWeight: 500 }}>{r.grp}</td>
              {AGE_BUCKETS.map(([k]) => <td key={k} style={{ ...td, background: heat(r.v[k] || 0), color: r.v[k] ? C.t1 : C.t3 }}>{r.v[k] ? fmtN(r.v[k]) : '—'}</td>)}
              <td style={{ ...td, fontWeight: 700, color: C.t1 }}>{fmtN(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}


function Drivers({ data, model, grain, deltaLabel, mode, hidden, back = 1 }) {
  const rows = useMemo(() => driverRows(data, model), [data, model])
  return <Matrix rows={rows} model={model} grain={grain} deltaLabel={deltaLabel} mode={mode} hidden={hidden} back={back} />
}


// Export dropdown for the top bar. `data` = what the page registered: { items:[{id,title}], run(id), view, busy }.
export function ExportMenu({ data }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const disabled = !data || data.busy || !data.items.length
  const pick = (id) => { setOpen(false); data.run(id) }
  const row = { display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12.5, color: C.t1, background: 'transparent', border: 'none', borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap' }
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => !disabled && setOpen(o => !o)} disabled={disabled} title="Export the detailed KPI tables as CSV"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, padding: '7px 14px', borderRadius: 10, border: `1px solid ${C.border2}`, background: C.card, color: C.acc, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
        ⤓ Export <span style={{ fontSize: 9 }}>▾</span>
      </button>
      {open && !disabled && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 1000, minWidth: 300, maxHeight: 420, overflowY: 'auto', background: C.card, border: `1px solid ${C.border2}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: 6 }}>
          <div style={{ padding: '6px 12px 8px', fontSize: 10.5, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.06em' }}>Detailed KPI tables · {data.view}</div>
          <button onClick={() => pick('all')} style={{ ...row, fontWeight: 700, color: C.acd, background: C.acl }}>All tables (one CSV)</button>
          <div style={{ height: 1, background: C.border, margin: '6px 4px' }} />
          {data.items.map(it => (
            <button key={it.id} onClick={() => pick(it.id)} style={row}
              onMouseEnter={e => { e.currentTarget.style.background = C.bg }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>{it.title}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── visual layer ──────────────────────────────────────────────────────────────

// Every colour reads the active theme at render time (C.* are getters), so switching theme
// recolours the page. Channels take steps of the theme's accent ramp (dark -> light, spaced
// on lightness so they stay distinguishable); escalations and missed calls keep the fixed
// semantic red, because they mean "bad" in every theme.
const ramp = (i) => C.ramp[Math.min(i, C.ramp.length - 1)]
const chColor = (ch) => ({
  Inbound: ramp(0), Chat: ramp(2), Email: ramp(3), 'Social media': ramp(4), Escalation: C.red.tx,
}[ch] || C.t3)
const axis = { fontSize: 10.5, fill: C.t3 }
const kfmt = (v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)


function SectionTitle({ children, note, right, id }) {
  return (
    <div id={id} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 -4px', scrollMarginTop: 12 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: C.t2, letterSpacing: '.06em', textTransform: 'uppercase' }}>{children}</span>
      {note && <span style={{ fontSize: 11.5, color: C.t3 }}>{note}</span>}
      <div style={{ flex: 1, height: 1, background: C.border }} />
      {right}
    </div>
  )
}

// Change pill: coloured tint + arrow + %, green when the move is good, red when bad, grey when
// the KPI has no good direction (volumes), too small to matter, or has no previous value.
// neutral: grey whatever the direction (C7: yesterday still loading before 11:00 IST)
function DeltaPill({ cur, prev, good, title, isRate = false, neutral = false }) {
  const c = changeOf(cur, prev, isRate)
  const ch = c ? c.v : null
  const flat = !c || c.flat
  const better = flat || !good || neutral ? null : good === 'up' ? ch > 0 : ch < 0
  const tone = better == null ? { bg: C.bg, tx: C.t2 } : better ? C.green : C.red
  return (
    <span title={title} style={{ background: tone.bg, color: tone.tx, fontSize: 11.5, fontWeight: 700, padding: '3px 8px', borderRadius: 8, whiteSpace: 'nowrap', flexShrink: 0 }}>
      {ch == null ? '—' : `${ch > 0 ? '▲' : ch < 0 ? '▼' : ''} ${c.text}`}
    </span>
  )
}

// KPI card: label, big value with the change pill beside it, one line of context, and a
// full-width sparkline over the visible periods. Every card has the same rows so a row of
// cards lines up. `detail` = the counts behind the value; without it the previous value shows.
function KpiCard({ label, values, f, good, prevLabel, detail, noPrev, back = 1, neutral = false }) {
  // back = 7: Day view compares with the same weekday last week (CA10); the sparkline shows the last 7 days
  const cur = values.at(-1), prev = values.length > back ? values.at(-1 - back) : null
  const series = (back > 1 ? values.slice(-back) : values).map((v, i) => ({ i, v: v == null || !isFinite(v) ? null : v }))
  const gid = `sp-${label.replace(/\W/g, '')}`
  const hasCur = cur != null && isFinite(cur), hasPrev = prev != null && isFinite(prev)
  const line = detail || (hasPrev ? `Previous: ${f(prev)}` : '\u00a0')
  const pillTitle = hasCur && !hasPrev ? (noPrev || `No data ${prevLabel}`) : prevLabel
  return (
    <div className="kpi-card" style={{ background: C.card, borderRadius: C.r.lg, boxShadow: C.sh1, padding: '12px 16px 8px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, overflow: 'hidden' }}>
      <div title={label} style={{ fontSize: 10.5, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: C.t1, letterSpacing: '-.01em', lineHeight: 1.15 }}>{f(cur)}</div>
        <DeltaPill cur={cur} prev={prev} good={good} title={pillTitle} isRate={f === pctF} neutral={neutral} />
      </div>
      <div title={hasCur && !hasPrev && noPrev ? `${line} · ${noPrev}` : line} style={{ fontSize: 11.5, color: C.t2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line}</div>
      <div style={{ height: 34, marginTop: 'auto', paddingTop: 4 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.acc} stopOpacity={0.3} />
                <stop offset="100%" stopColor={C.acc} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="v" stroke={C.acc} strokeWidth={1.8} fill={`url(#${gid})`} connectNulls isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function ChannelTrend({ model, grain }) {
  const data = model.map(p => ({ name: periodLabel(grain, p.key), ...Object.fromEntries(MAIN.map(ch => [ch, p.t(ch)?.interactions || 0])) }))
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={C.border} vertical={false} />
        <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} />
        <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={kfmt} />
        <Tooltip content={<ChartTooltip formatter={int} />} cursor={{ fill: C.hov }} />
        <Legend {...chartLegendProps()} />
        {MAIN.map((ch, i) => (
          <Bar key={ch} dataKey={ch} name={chLabel(ch)} stackId="a" fill={chColor(ch)} radius={i === MAIN.length - 1 ? [5, 5, 0, 0] : 0} maxBarSize={56} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// B1: no donut. Total, one split bar, then a row per channel.
function ChannelMix({ latest }) {
  const data = MAIN.map(ch => ({ name: ch, value: latest.t(ch)?.interactions || 0 })).filter(d => d.value > 0)
  const total = data.reduce((s, d) => s + d.value, 0)
  const sorted = [...data].sort((a, b) => b.value - a.value)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 260 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: C.t1, fontVariantNumeric: 'tabular-nums' }}>{fmtN(total)}</span>
          <span style={{ fontSize: 12, color: C.t3 }}>interactions</span>
        </div>
        <MixBar height={12} label="Channel mix" fmt={fmtN} parts={sorted.map(d => ({ key: d.name, label: chLabel(d.name), value: d.value, color: chColor(d.name) }))} />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sorted.map(d => (
          <div key={d.name}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.t2 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: chColor(d.name) }} />{chLabel(d.name)}</span>
              <span style={{ color: C.t1 }}><b>{((d.value / total) * 100).toFixed(1)}%</b> <span style={{ color: C.t3 }}>· {fmtN(d.value)}</span></span>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: C.bg }}><div style={{ height: '100%', width: `${(d.value / total) * 100}%`, borderRadius: 3, background: chColor(d.name) }} /></div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FrtTrend({ model, grain }) {
  const chans = ['Chat', 'Email', 'Social media', 'Escalation']
  const data = model.map(p => ({
    name: periodLabel(grain, p.key),
    ...Object.fromEntries(chans.map(ch => { const s = avg(p.t(ch), 'afrt_sum', 'afrt_n'); return [ch, s == null ? null : s / 60] })),
  }))
  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -6 }}>
        <CartesianGrid stroke={C.border} vertical={false} />
        <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} />
        <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={v => (v >= 60 ? `${(v / 60).toFixed(0)}h` : `${v.toFixed(0)}m`)} />
        <Tooltip content={<ChartTooltip formatter={v => dur(v * 60)} sortByValue />} />
        <Legend {...chartLegendProps()} />
        {chans.map(ch => <Line key={ch} type="monotone" dataKey={ch} stroke={chColor(ch)} strokeWidth={2.2} dot={{ r: 3 }} connectNulls />)}
      </LineChart>
    </ResponsiveContainer>
  )
}

// Progress bars per SLA target: latest period, previous period as a tick mark.
function SlaBars({ latest, prev }) {
  const rows = [
    ['Chat', 'sla_20s', '< 20 sec'], ['Chat', 'sla_40s', '< 40 sec'],
    ['Email', 'sla_10m', '< 10 min'], ['Email', 'sla_15m', '< 15 min'],
    ['Social media', 'sla_10m', '< 10 min'], ['Social media', 'sla_15m', '< 15 min'],
  ]
  const val = (p, ch, k) => (p ? div(p.t(ch)?.[k], p.t(ch)?.afrt_n) : null)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 2px' }}>
      {rows.map(([ch, k, lbl]) => {
        const v = val(latest, ch, k), pv = val(prev, ch, k)
        const color = v == null ? C.t3 : C.acd
        return (
          <div key={ch + k}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: C.t2 }}><b style={{ color: C.t1 }}>{ch}</b> {lbl}</span>
              <span><b style={{ color }}>{pctF(v)}</b> <span style={{ fontSize: 10.5 }}><Delta cur={v} prev={pv} good="up" isRate /></span></span>
            </div>
            <div style={{ position: 'relative', height: 8, borderRadius: 4, background: C.bg }}>
              <div style={{ height: '100%', width: `${Math.min((v || 0) * 100, 100)}%`, borderRadius: 4, background: `linear-gradient(90deg, ${C.acd}, ${C.acc})` }} />
              {pv != null && <div title={`previous ${pctF(pv)}`} style={{ position: 'absolute', top: -3, bottom: -3, width: 2, left: `${Math.min(pv * 100, 100)}%`, background: C.t2, borderRadius: 1 }} />}
            </div>
          </div>
        )
      })}
      <div style={{ fontSize: 10.5, color: C.t3 }}>Bar = latest period, tick = previous. Share of tickets whose first agent reply met the target.</div>
    </div>
  )
}

function OrdersVsInteractions({ model, grain }) {
  const data = model.map(p => ({
    name: periodLabel(grain, p.key),
    Orders: p.orders?.orders || 0,
    Interactions: p.t('All')?.interactions || 0,
    ITO: div(p.t('All')?.interactions, p.orders?.orders),
  }))
  return (
    <div style={{ height: '100%', minHeight: 300 }}>
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} barCategoryGap="8%" barGap={3}>
        <CartesianGrid stroke={C.border} vertical={false} />
        <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} />
        <YAxis yAxisId="l" width={34} tick={axis} axisLine={false} tickLine={false} tickFormatter={kfmt} />
        <YAxis yAxisId="r" orientation="right" width={30} tick={axis} axisLine={false} tickLine={false} tickFormatter={v => v.toFixed(1)} />
        <Tooltip content={<ChartTooltip formatter={v => (v != null && v < 50 ? ratio(v) : int(v))} />} cursor={{ fill: C.hov }} />
        <Legend {...chartLegendProps()} />
        <Bar yAxisId="l" dataKey="Orders" fill={C.acc} radius={[5, 5, 0, 0]} maxBarSize={64} />
        <Bar yAxisId="l" dataKey="Interactions" fill={ramp(4)} radius={[5, 5, 0, 0]} maxBarSize={64} />
        <Line yAxisId="r" type="monotone" dataKey="ITO" name="ITO (interactions per order)" stroke={ramp(0)} strokeWidth={2.4} dot={{ r: 3.5, fill: ramp(0) }} />
      </ComposedChart>
    </ResponsiveContainer>
    </div>
  )
}

// Funnel of the latest period's inbound calls.
function CallFunnel({ calls }) {
  if (!calls) return <div style={{ color: C.t3, fontSize: 12.5, padding: 20 }}>No inbound calls in this period (Ozonetel data starts 1 Oct 2026; the inbound line is closed on Sundays and holidays).</div>
  const steps = [
    { label: 'Total calls', v: calls.total_calls, color: ramp(0) },
    { label: 'Answered', v: calls.answered_calls, color: ramp(2) },
    { label: 'Unique callers', v: calls.unique_calls, color: ramp(3) },
    { label: 'Unique answered', v: calls.unique_answered, color: ramp(4) },
    { label: 'Unique missed', v: calls.unique_missed, color: C.red.tx },
  ]
  const max = Math.max(...steps.map(s => s.v || 0), 1)
  const stats = [
    { label: 'Answer rate', v: pctF(div(calls.answered_calls, calls.total_calls)) },
    { label: 'AHT', v: dur(avg(calls, 'aht_sum', 'ans_n')) },
    { label: 'ACW', v: dur(avg(calls, 'acw_sum', 'ans_n')) },
  ]
  // Fills the card's height (the card sits beside the taller by-hour chart): bars spread out
  // evenly and the three call stats become tiles pinned to the bottom.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 14, height: '100%', minHeight: 250 }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10, flex: 1 }}>
        {steps.map(s => (
          <div key={s.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(84px, 112px) minmax(0, 1fr) 52px', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
            <span style={{ color: C.t2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
            <div style={{ height: 24, borderRadius: 6, background: C.bg, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${((s.v || 0) / max) * 100}%`, background: s.color, borderRadius: 6 }} />
            </div>
            <span style={{ textAlign: 'right', fontWeight: 700, color: C.t1, fontVariantNumeric: 'tabular-nums' }}>{int(s.v)}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {stats.map(t => (
          <div key={t.label} style={{ background: C.bg, borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.05em' }}>{t.label}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.t1 }}>{t.v}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CallsByHour({ rows }) {
  const data = [...(rows || [])].sort((a, b) => a.hr - b.hr).map(r => ({
    name: `${String(r.hr).padStart(2, '0')}:00`, Answered: r.answered, Missed: r.total - r.answered, 'Answer rate': r.total ? r.answered / r.total : null,
  }))
  if (!data.length) return <div style={{ color: C.t3, fontSize: 12.5, padding: 20 }}>No inbound calls in this window.</div>
  return (
    <ResponsiveContainer width="100%" height={250}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={C.border} vertical={false} />
        <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} />
        <YAxis yAxisId="l" tick={axis} axisLine={false} tickLine={false} tickFormatter={kfmt} />
        <YAxis yAxisId="r" orientation="right" tick={axis} axisLine={false} tickLine={false} domain={[0, 1]} tickFormatter={v => `${Math.round(v * 100)}%`} />
        <Tooltip content={<ChartTooltip formatter={v => (v != null && v <= 1 ? pctF(v) : int(v))} />} cursor={{ fill: C.hov }} />
        <Legend {...chartLegendProps()} />
        <Bar yAxisId="l" dataKey="Answered" stackId="c" fill={C.acc} maxBarSize={28} />
        <Bar yAxisId="l" dataKey="Missed" stackId="c" fill={C.red.tx} fillOpacity={0.75} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Line yAxisId="r" type="monotone" dataKey="Answer rate" stroke={ramp(0)} strokeWidth={2.2} dot={{ r: 2.5, fill: ramp(0) }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// Weekday x hour heatmap of interactions (IST), Monday first.
function ContactHeatmap({ rows }) {
  const grid = {}
  let max = 0
  for (const r of rows || []) { grid[`${r.dow}-${r.hr}`] = r.n; max = Math.max(max, r.n) }
  const days = [2, 3, 4, 5, 6, 7, 1]
  const hours = Array.from({ length: 24 }, (_, h) => h)
  const cell = (n) => (!n ? C.bg : `rgba(${C.accRgb},${(0.12 + 0.88 * (n / max)).toFixed(2)})`)
  return (
    <div style={{ overflowX: 'auto', height: '100%', minHeight: 300, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '38px repeat(24, minmax(18px, 1fr))', gridTemplateRows: 'auto repeat(7, minmax(26px, 1fr))', gap: 3, minWidth: 560, flex: 1 }}>
        <div />
        {hours.map(h => <div key={h} style={{ fontSize: 9.5, color: C.t3, textAlign: 'center' }}>{h % 3 === 0 ? h : ''}</div>)}
        {days.map(d => [
          <div key={`l${d}`} style={{ fontSize: 11, color: C.t2, alignSelf: 'center' }}>{DOW[d - 1]}</div>,
          ...hours.map(h => {
            const n = grid[`${d}-${h}`] || 0
            return <div key={`${d}-${h}`} title={`${DOW[d - 1]} ${String(h).padStart(2, '0')}:00 — ${fmtN(n)} interactions`}
              style={{ borderRadius: 4, background: cell(n) }} />
          }),
        ])}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 10.5, color: C.t3 }}>
        less {[0.15, 0.35, 0.55, 0.75, 1].map(a => <span key={a} style={{ width: 16, height: 10, borderRadius: 3, background: `rgba(${C.accRgb},${a})` }} />)} more
        <span style={{ marginLeft: 'auto' }}>Busiest hour-slot: {fmtN(max)} interactions</span>
      </div>
    </div>
  )
}

// Always the last 7 days (to the "up to" date) vs the 7 days before - see dispo7 in the API.
function DriversChart({ data, orders7, onNavigate }) {
  const rows = useMemo(() => (data.dispo7 || [])
    .filter(r => r.dispo !== '(blank)')
    .map(r => ({ name: trimPunct(r.dispo), cur: Number(r.cur) || 0, prev: Number(r.prev) || 0 }))
    .sort((a, b) => b.cur - a.cur).slice(0, 12), [data])
  const max = Math.max(...rows.map(r => r.cur), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8, padding: '2px', height: '100%', minHeight: 360 }}>
      {rows.map(r => (
        <div key={r.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 190px) 1fr 58px 70px', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
          <span style={{ overflow: 'hidden' }}>
            <span style={{ display: 'block', color: C.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name}>{r.name}</span>
            <span style={{ display: 'block', fontSize: 11, color: C.t3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {orders7 > 0 ? `${per100(r.cur, orders7)} per 100 orders` : ''}
              {reasonLink(r.name) && onNavigate && <>{orders7 > 0 ? ' · ' : ''}<button type="button" onClick={() => onNavigate(reasonLink(r.name).dest)} style={{ border: 'none', background: 'none', padding: 0, color: C.acc, fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>{reasonLink(r.name).label} →</button></>}
            </span>
          </span>
          <div style={{ height: 16, borderRadius: 5, background: C.bg }}>
            <div style={{ height: '100%', width: `${(r.cur / max) * 100}%`, borderRadius: 5, background: `linear-gradient(90deg, ${C.acd}, ${C.acc})` }} />
          </div>
          <span style={{ textAlign: 'right', fontWeight: 700, color: C.t1 }}>{fmtN(r.cur)}</span>
          <span style={{ textAlign: 'right', fontSize: 11 }}><Delta cur={r.cur} prev={r.prev} good="down" /></span>
        </div>
      ))}
      <div style={{ fontSize: 10.5, color: C.t3 }}>Last 7 days vs the 7 days before. Rising drivers (red) are where extra volume is coming from.{orders7 > 0 ? ` Per 100 orders = contacts ÷ ${fmtN(orders7)} Shopify D2C orders in the same 7 days.` : ' Per 100 orders shows in the Daily view (orders for the same 7 days).'}</div>
    </div>
  )
}

function AgentBoard({ rows }) {
  const list = (rows || []).filter(r => r.agent && r.agent !== 'Unassigned').slice(0, 12)
  const unassigned = (rows || []).find(r => r.agent === 'Unassigned')
  const max = Math.max(...list.map(r => r.interactions), 1)
  const th = { fontSize: 10.5, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.04em', padding: '0 6px 6px', textAlign: 'right' }
  const td = { padding: '5px 6px', fontSize: 12, borderTop: `1px solid ${C.border}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          <th style={{ ...th, textAlign: 'left' }}>Agent</th><th style={{ ...th, textAlign: 'left' }}>Main channel</th>
          <th style={th}>Interactions</th><th style={th}>Agent FRT</th><th style={th}>ART</th>
        </tr></thead>
        <tbody>
          {list.map((r, i) => (
            <tr key={r.agent}>
              <td style={{ ...td, textAlign: 'left', color: C.t1, fontWeight: 600 }}>
                <span style={{ display: 'inline-block', width: 18, color: C.t3, fontWeight: 500 }}>{i + 1}</span>{r.agent}
              </td>
              <td style={{ ...td, textAlign: 'left' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, color: C.acd, background: C.acl }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: chColor(r.main_channel) }} />{chLabel(r.main_channel)}
                </span>
              </td>
              <td style={td}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                  <div style={{ width: 60, height: 5, borderRadius: 3, background: C.bg }}><div style={{ height: '100%', width: `${(r.interactions / max) * 100}%`, background: C.acc, borderRadius: 3 }} /></div>
                  {fmtN(r.interactions)}
                </div>
              </td>
              {/* CA13: phone tickets get no public agent reply and are closed when logged, so Agent FRT / ART
                  don't apply to inbound (voice) agents: say so instead of '—' / 0.0h */}
              <td style={td} title={r.main_channel === 'Inbound' ? 'Phone tickets have no agent reply in Freshdesk' : undefined}>{r.main_channel === 'Inbound' ? <span style={{ color: C.t3 }}>n/a (voice)</span> : dur(avg(r, 'afrt_sum', 'afrt_n'))}</td>
              <td style={td} title={r.main_channel === 'Inbound' ? 'Phone tickets are closed when logged, so resolution time is ~0' : undefined}>{r.main_channel === 'Inbound' ? <span style={{ color: C.t3 }}>n/a (voice)</span> : hrs(avg(r, 'res_sum', 'resolved'))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {unassigned && <div style={{ fontSize: 10.5, color: C.t3, marginTop: 8 }}>{fmtN(unassigned.interactions)} interactions in this window have no assigned agent (mostly bot-closed chats) and are left out of the ranking.</div>}
    </div>
  )
}

// `toggle` = { default } adds the % / Count switch; children is then a function of the mode.
function Collapsible({ title, note, children, defaultOpen = false, toggle }) {
  const [open, setOpen] = useState(defaultOpen)
  const [mode, setMode] = useState(toggle?.default || 'count')
  const flip = () => setOpen(o => !o)
  const action = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {toggle && open && <ShareToggle mode={mode} setMode={setMode} />}
      <button onClick={flip} style={{ fontSize: 11.5, fontWeight: 700, color: C.acc, background: 'transparent', border: `1px solid ${C.border2}`, borderRadius: 14, padding: '2px 10px', cursor: 'pointer' }}>{open ? 'Hide' : 'Show'}</button>
    </div>
  )
  if (open) {
    return (
      <div style={{ background: C.card, borderRadius: C.r.lg, boxShadow: C.sh1, overflow: 'hidden' }}>
        <div style={{ background: C.ach, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div onClick={flip} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minWidth: 0 }}>
            <span style={{ width: 4, height: 18, borderRadius: 2, background: C.acd, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: C.t1, textTransform: 'uppercase', letterSpacing: '.08em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
          </div>
          {action}
        </div>
        {note && <div style={{ padding: '10px 18px', fontSize: 12.5, fontStyle: 'italic', color: C.t2, borderBottom: `1px solid ${C.border}` }}>{note}</div>}
        <div style={{ padding: '0 8px 8px' }}>{typeof children === 'function' ? children(mode) : children}</div>
      </div>
    )
  }
  // Collapsed: a slim one-line bar instead of a full card with room for a table underneath.
  return (
    <div className="card-hoverable" onClick={flip}
      style={{ background: C.card, borderRadius: C.r.lg, boxShadow: C.sh1, padding: '9px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.t1, whiteSpace: 'nowrap' }}>▸ {title}</span>
        {note && <span style={{ fontSize: 11.5, color: C.t3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{note}</span>}
      </div>
      <div onClick={e => e.stopPropagation()}>{action}</div>
    </div>
  )
}

const row2 = (a, b) => ({ display: 'grid', gridTemplateColumns: `minmax(0, ${a}fr) minmax(0, ${b}fr)`, gap: 14 })

// The date range lives in App so the shared date-range picker can sit in the top bar; the top
// bar's Refresh button bumps `refreshTick` to bypass the API's 30-minute cache.
export default function CustomerSupportPage({ dateRange, refreshTick = 0, onExportReady, onNavigate }) {
  const [grain, setGrain] = useState('day')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1100)
  const [vw, setVw] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1600))

  useEffect(() => {
    const onResize = () => { setNarrow(window.innerWidth < 1100); setVw(window.innerWidth) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const ctl = new AbortController()
    setLoading(true); setError(null)
    fetch(`${API}/api/customer-support`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
      body: JSON.stringify({ grain, start: dateRange?.start, end: dateRange?.end, refresh: refreshTick > 0 || undefined }),
    })
      .then(async r => {
        const text = await r.text()
        let j = null
        try { j = text ? JSON.parse(text) : null } catch { /* non-JSON error page */ }
        if (!r.ok || !j) throw new Error(j?.error || `the API returned ${r.status}${text ? '' : ' with an empty body'} — is the backend running with the customer-support route?`)
        return j
      })
      .then(j => setData(j))
      .catch(e => { if (e.name !== 'AbortError') setError(e.message) })
      .finally(() => setLoading(false))
    return () => ctl.abort()
  }, [grain, dateRange?.start, dateRange?.end, refreshTick])

  const g = GRAINS.find(x => x.id === grain)
  const model = useMemo(() => (data ? buildModel(data) : []), [data])

  // The detailed KPI tables have their own view: last 7 days (default), week-on-week or
  // month-on-month, all ending on the chosen end date. Fetched separately from the page above.
  const [dGrain, setDGrain] = useState('day')
  const [dData, setDData] = useState(null)
  const [dLoading, setDLoading] = useState(false)
  const [dError, setDError] = useState(null)
  useEffect(() => {
    const ctl = new AbortController()
    const end = dateRange?.end
    const body = dGrain === 'day' && end ? { grain: 'day', start: shiftDay(end, -7), end }
      : { grain: dGrain, end, periods: dGrain === 'week' ? 4 : 3 }
    setDLoading(true); setDError(null)
    fetch(`${API}/api/customer-support`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
      body: JSON.stringify({ ...body, refresh: refreshTick > 0 || undefined }),
    })
      .then(async r => {
        const text = await r.text()
        let j = null
        try { j = text ? JSON.parse(text) : null } catch { /* non-JSON error page */ }
        if (!r.ok || !j) throw new Error(j?.error || `the API returned ${r.status}`)
        return j
      })
      .then(setDData)
      .catch(e => { if (e.name !== 'AbortError') setDError(e.message) })
      .finally(() => setDLoading(false))
    return () => ctl.abort()
  }, [dGrain, dateRange?.end, refreshTick])
  const dModel = useMemo(() => (dData ? buildModel(dData) : []), [dData])
  const secs = useMemo(() => (dModel.length ? sections(dModel) : []), [dModel])
  const gd = GRAINS.find(x => x.id === dGrain)
  // Day view: 8 days fetched, the first is only the comparison base for the 7th (same weekday last week)
  const dHidden = dGrain === 'day' ? 1 : (dData?.hidden || 0)
  const dBack = dGrain === 'day' ? 7 : 1
  // Hands the top bar's Export menu its list of tables and a function that downloads one (or all).
  const exportTables = useMemo(() => (dData ? [
    ...secs.map(sec => ({ id: sec.id, title: sec.title, rows: sec.rows })),
    { id: 'ttr', title: 'TTR - time to resolve, parent and child tickets', rows: ttrRows(dData) },
    { id: 'drivers', title: 'Volume drivers - top 15 by sub category level 2', rows: driverRows(dData, dModel) },
    // Snapshot tables (as of now): own CSV shape, so they are exported on their own, never in "All tables".
    { id: 'pend-parent', title: 'Pending ageing - Parent tickets', csv: () => pendencyCsv(data, 'Parent') },
    { id: 'pend-child', title: 'Pending ageing - Child tickets', csv: () => pendencyCsv(data, 'Child') },
  ] : []), [secs, dData, dModel, data])
  useEffect(() => {
    if (!onExportReady) return
    onExportReady({
      view: `${gd.label} view`,
      busy: dLoading,
      items: exportTables.map(({ id, title }) => ({ id, title })),
      run: (id) => {
        const one = exportTables.find(t => t.id === id)
        if (one?.csv) { exportCSV(one.csv(), `customer_support_${id}_${new Date().toISOString().slice(0, 10)}.csv`); return }
        const tables = (id === 'all' ? exportTables : exportTables.filter(t => t.id === id)).filter(t => t.rows)
        if (!tables.length || !dData) return
        exportCSV(detailedCsv(tables, dModel, dGrain === 'day' ? 1 : (dData.hidden || 0)), `customer_support_${id === 'all' ? 'detailed_kpis' : id}_${dGrain}_${dData.end}.csv`)
      },
    })
    return () => onExportReady(null)
  }, [exportTables, dGrain, dLoading])
  // `hidden` = context periods the API adds so a single day still has a day-before to compare with.
  const hidden = data?.hidden || 0
  const view = model.slice(hidden)
  // Day view (a single day + 7 context days): compare with the same weekday last week (CA10)
  const back = grain === 'day' && hidden >= 7 ? 7 : 1
  const latest = model.at(-1), prev = model.length > back ? model.at(-1 - back) : null
  const trendModel = back > 1 ? model.slice(-7) : model
  // B2.5: Shopify D2C orders of the 7 days the drivers cover (dispo7 = last 7 days to the end date); Day view only
  const orders7 = grain === 'day' ? orders7Of(model) : 0
  const watch = useMemo(() => computeSupportRules(data, model, back, grain), [data, model, back, grain])
  const dayLoading = yesterdayStillLoading(grain, latest?.key) // C7
  const goRule = id => {
    const target = watch?.rules.find(r => r.id === id)?.target
    document.getElementById(`cs-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const kpis = latest ? [
    { label: 'Interactions', values: model.map(p => p.t('All')?.interactions), f: int, good: null, accent: C.acc },
    { label: 'Unique customers', values: model.map(p => p.t('All')?.unique_int), f: int, good: null, accent: ramp(3) },
    // Support load per unit sold (Shopify D2C units): lower = fewer contacts / tasks per unit.
    { label: 'Interactions per unit (ITU)', values: model.map(p => div(p.t('All')?.interactions, p.orders?.units)), f: ratio, good: 'down', accent: ramp(1),
      detail: `${int(latest.t('All')?.interactions)} interactions / ${int(latest.orders?.units)} units` },
    // Same measure per order: contacts per Shopify D2C order (lower is better).
    { label: 'Interactions per order (ITO)', values: model.map(p => div(p.t('All')?.interactions, p.orders?.orders)), f: ratio, good: 'down', accent: ramp(1),
      detail: `${int(latest.t('All')?.interactions)} interactions / ${int(latest.orders?.orders)} orders` },
    { label: 'Tasks per unit', values: model.map(p => div(p.t('All')?.tasks, p.orders?.units)), f: ratio, good: 'down', accent: ramp(2),
      detail: `${int(latest.t('All')?.tasks)} tasks / ${int(latest.orders?.units)} units` },
    { label: 'Tasks per order', values: model.map(p => div(p.t('All')?.tasks, p.orders?.orders)), f: ratio, good: 'down', accent: ramp(2),
      detail: `${int(latest.t('All')?.tasks)} tasks / ${int(latest.orders?.orders)} orders` },
    // Multiple-contact / first-contact resolution: how many contacts needed a follow-up task.
    { label: 'MCR (multiple contact)', values: model.map(p => div(p.t('All')?.tasks, p.t('All')?.interactions)), f: pctF, good: 'down', accent: ramp(2),
      detail: `${int(latest.t('All')?.tasks)} child / ${int(latest.t('All')?.interactions)} parent + blank` },
    { label: 'FCR (first contact)', values: model.map(p => fcr(p.t('All'))), f: pctF, good: 'up', accent: ramp(1),
      detail: `${int(Math.max(0, (latest.t('All')?.interactions || 0) - (latest.t('All')?.tasks || 0)))} of ${int(latest.t('All')?.interactions)} needed no task` },
    { label: 'Chat agent FRT', values: model.map(p => avg(p.t('Chat'), 'afrt_sum', 'afrt_n')), f: dur, good: 'down', accent: ramp(2) },
    // Two views of the inbound line: did each CUSTOMER get through (unique callers), and how
    // many of all calls were picked up (a caller who rings 3 times counts 3 times).
    { label: 'Calls answered (unique)', values: model.map(p => div(p.calls?.unique_answered, p.calls?.unique_calls)), f: pctF, good: 'up', accent: ramp(0),
      detail: latest.calls ? `${int(latest.calls.unique_answered)} of ${int(latest.calls.unique_calls)} callers` : 'no calls',
      noPrev: prev ? `No inbound calls on ${periodLabel(grain, prev.key)}` : '' },
    { label: 'Calls answered (overall)', values: model.map(p => div(p.calls?.answered_calls, p.calls?.total_calls)), f: pctF, good: 'up', accent: ramp(1),
      detail: latest.calls ? `${int(latest.calls.answered_calls)} of ${int(latest.calls.total_calls)} calls` : 'no calls',
      noPrev: prev ? `No inbound calls on ${periodLabel(grain, prev.key)}` : '' },
    { label: 'Escalation rate', values: model.map(p => div(p.t('All')?.escalations, p.t('All')?.interactions)), f: pctF, good: 'down', accent: C.red.tx,
      detail: `${int(latest.t('All')?.escalations)} of ${int(latest.t('All')?.interactions)} interactions` },
  ] : []

  // Below 1024px: the phone view (CUSTOMER_MASTER_PLAN.md Part B §B4), same data and model
  if (vw < 1024) {
    if (error) return <div style={{ margin: 12, background: C.red.bg, color: C.red.tx, padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>Couldn't load support data: {error}</div>
    if (!data || !latest) return <div aria-busy="true" style={{ margin: 12, height: 360, borderRadius: 18, background: C.m.soft }} />
    return (
      <div style={{ padding: '12px 12px 0' }}>
        <CustomerSupportMobile data={data} grain={grain} setGrain={setGrain} latest={latest} prev={prev} trendModel={trendModel} watch={watch} orders7={orders7} onNavigate={onNavigate} loading={loading}
          dData={dData} dModel={dModel} dGrain={dGrain} setDGrain={setDGrain} dHidden={dHidden} dBack={dBack} secs={secs} dLoading={dLoading} dError={dError} />
      </div>
    )
  }

  const btn = (active) => ({ padding: '6px 14px', fontSize: 12.5, fontWeight: 700, borderRadius: 20, cursor: 'pointer',
    border: `1.5px solid ${active ? C.acc : C.border2}`, background: active ? C.acc : C.card, color: active ? C.onAcc : C.t2 })
  const grid = (a, b) => (narrow ? { display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 14 } : row2(a, b))
  const dim = { opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }
  const range = data ? (view.length > 1 ? `${periodLabel(grain, view[0].key)} – ${periodLabel(grain, view.at(-1).key)}` : periodLabel(grain, view[0].key)) : ''
  const win = data ? `${data.start} → ${data.end}` : ''

  return (
    <div style={{ padding: '18px 22px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>Freshdesk · Ozonetel · Shopify D2C</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.t1, letterSpacing: -0.5 }}>Customer Support</div>
          {data && <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>{g.label} view · {range}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, background: C.card, padding: 4, borderRadius: 24, boxShadow: C.sh1 }}>
            {GRAINS.map(x => <button key={x.id} style={{ ...btn(grain === x.id), border: 'none' }} onClick={() => setGrain(x.id)}>{x.label}</button>)}
          </div>
        </div>
      </div>

      {error && <div style={{ background: C.red.bg, color: C.red.tx, border: `1px solid ${C.red.bd}`, padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>Couldn't load support data: {error}</div>}
      {!data && loading && <div style={{ color: C.t3, fontSize: 13 }}>Loading support data…</div>}

      {data && latest && (
        <>
          {dayLoading && <InfoStrip icon="◔" text={SUPPORT_LOAD_NOTE} detail="The support table rebuilds at 11:00 IST; until then yesterday's numbers are partial, so their changes are shown in grey." />}
          <div id="cs-top" style={{ display: 'grid', gridTemplateColumns: `repeat(${vw < 760 ? 2 : vw < 1100 ? 3 : vw < 1500 ? 4 : 6}, minmax(0, 1fr))`, gap: 12, scrollMarginTop: 12, ...dim }}>
            {kpis.map(k => <KpiCard key={k.label} {...k} back={back} neutral={dayLoading} prevLabel={prev ? `vs ${periodLabel(grain, prev.key)}` : ''} />)}
          </div>

          {watch && <div style={dim}><WatchlistCard result={watch} channel="Support" title="Support watchlist" onRule={goRule} /></div>}

          <SectionTitle note="what came in, on which channel">Volume</SectionTitle>
          <div style={{ ...grid(2, 1), ...dim }}>
            <Card title="Interactions by channel" note={g.label.toLowerCase()}><ChannelTrend model={trendModel} grain={grain} /></Card>
            <Card title="Channel mix" note={periodLabel(grain, latest.key)}><ChannelMix latest={latest} /></Card>
          </div>

          <SectionTitle id="cs-speed" note="how fast we respond">Speed & SLA</SectionTitle>
          <div style={{ ...grid(3, 2), ...dim }}>
            <Card title="Agent first response time" note="first reply from a real agent, business hours, by channel"><FrtTrend model={trendModel} grain={grain} /></Card>
            <Card title="SLA attainment" note={periodLabel(grain, latest.key)}><SlaBars latest={latest} prev={prev} /></Card>
          </div>

          <SectionTitle note="Ozonetel inbound line">Calls</SectionTitle>
          <div style={{ ...grid(2, 3), ...dim }}>
            <Card fill title="Inbound call funnel" note={periodLabel(grain, latest.key)}><CallFunnel calls={latest.calls} /></Card>
            <Card title="Answered vs missed by hour" note={win}><CallsByHour rows={data.callsHourly} /></Card>
          </div>

          <SectionTitle id="cs-demand" note="when customers contact us, and why">Demand</SectionTitle>
          <div style={{ ...grid(3, 2), ...dim }}>
            <Card fill title="Contact heatmap" note={`interactions by weekday × hour (IST), ${data.trendStart || data.start} → ${data.end}`}><ContactHeatmap rows={data.heat} /></Card>
            <Card fill title="Orders vs interactions" note="Shopify D2C orders against support interactions"><OrdersVsInteractions model={trendModel} grain={grain} /></Card>
          </div>
          <div style={{ ...grid(1, 1), ...dim }}>
            <Card fill title="Top volume drivers" note={`dispositions, last 7 days to ${periodLabel('day', data.end)}`}><DriversChart data={data} orders7={orders7} onNavigate={onNavigate} /></Card>
            <Card title="Agent leaderboard" note={`assigned interactions, ${win}`}><AgentBoard rows={data.agentBoard} /></Card>
          </div>

          <SectionTitle id="cs-pending" note="as of now, whatever dates are chosen">Pending tickets — ageing</SectionTitle>
          <div style={dim}>
            <Collapsible defaultOpen title="Parent tickets" note="Association type Parent or none. Created in the last 45 days and not Resolved / Closed (Junk, i.e. discarded spam, is left out). Age = today − created date; tickets created today count under 1 day.">
              <PendencyTable data={data} kind="Parent" />
            </Collapsible>
          </div>
          <div style={dim}>
            <Collapsible defaultOpen title="Child tickets" note="Association type Child, by the resolver group they were raised to. Same rules: created in the last 45 days, not Resolved / Closed, age = today − created date.">
              <PendencyTable data={data} kind="Child" />
            </Collapsible>
          </div>

          <SectionTitle
            note={dGrain === 'day' ? 'every KPI from the CC sheet, last 7 days' : `every KPI from the CC sheet, ${gd.label.toLowerCase()} — the latest ${dGrain} may be partial`}
            right={(
              <div style={{ display: 'flex', gap: 4, background: C.card, padding: 3, borderRadius: 20, boxShadow: C.sh1 }}>
                {[{ id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }].map(x => (
                  <button key={x.id} onClick={() => setDGrain(x.id)} title={x.id === 'day' ? 'Last 7 days (DoD)' : x.id === 'week' ? 'Last 4 weeks (WoW)' : 'Last 3 months (MoM)'}
                    style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 12px', borderRadius: 16, border: 'none', cursor: 'pointer',
                      background: dGrain === x.id ? C.acc : 'transparent', color: dGrain === x.id ? C.onAcc : C.t2 }}>{x.label}</button>
                ))}
              </div>
            )}>Detailed KPIs</SectionTitle>
          {dError && <div style={{ background: C.red.bg, color: C.red.tx, border: `1px solid ${C.red.bd}`, padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>Couldn't load the detailed tables: {dError}</div>}
          {!dData && dLoading && <div style={{ color: C.t3, fontSize: 13 }}>Loading detailed tables…</div>}
          {dData && (
            <>
              {secs.map((sec, i) => (
                <div key={sec.id} style={{ opacity: dLoading ? 0.6 : 1, transition: 'opacity .2s' }}>
                  <Collapsible title={sec.title} note={sec.note} defaultOpen={i === 0}
                    toggle={sec.rows.some(r => r.pct) ? { default: PCT_DEFAULT[sec.id] || 'count' } : null}>
                    {mode => <Matrix rows={sec.rows} model={dModel} grain={dGrain} deltaLabel={gd.delta} mode={mode} hidden={dHidden} back={dBack} />}
                  </Collapsible>
                </div>
              ))}
              <div style={{ opacity: dLoading ? 0.6 : 1, transition: 'opacity .2s' }}>
                <Collapsible title="TTR — time to resolve, parent and child tickets"
                  note="Parent and child tickets, then each resolver group (top 12), period by period: tickets created, resolved / closed, still pending (as of now) and TTR = average hours from Created to Resolved / Closed. Green = better than the previous period, red = worse.">
                  <TtrTable data={dData} model={dModel} grain={dGrain} hidden={dHidden} />
                </Collapsible>
              </div>
              <div style={{ opacity: dLoading ? 0.6 : 1, transition: 'opacity .2s' }}>
                <Collapsible title="Volume drivers — top 15 by sub category level 2" note={`ranked on the latest period; each row is Sub category 2 · its disposition (hover for the full path); % = share of that period's interactions`} toggle={{ default: 'count' }}>
                  {mode => <Drivers data={dData} model={dModel} grain={dGrain} deltaLabel={gd.delta} mode={mode} hidden={dHidden} back={dBack} />}
                </Collapsible>
              </div>
            </>
          )}

          <div style={{ fontSize: 11, color: C.t3 }}>
            Periods {win}{grain !== 'day' ? '; the latest period may be partial' : ''}. Data as of {new Date(data.asOf).toLocaleString('en-IN')}.
            Not shown yet: CSAT (no survey data in BigQuery) and revenue / order / item plans (no plan source).
          </div>
        </>
      )}
    </div>
  )
}
