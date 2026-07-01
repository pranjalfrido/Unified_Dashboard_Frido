import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from 'react'
import { C, fmt, fmtN, pct, processData, detectAlerts, exportCSV, getDefaultDates } from './utils.js'
import { KPICard, AlertCard, HBar, DataTable, Card, Badge, RevTrendChart, AreaTrendChart, MultiLineChart, ChartTooltip, BarChart, Bar, LineChart, Line, AreaChart, Area, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, Treemap } from './components.jsx'
import { ReferenceLine } from 'recharts'

// ── Sidebar ───────────────────────────────────────────────────
const SvgIcon = ({ d, size = 18, stroke = 'currentColor', fill = 'none', strokeWidth = 1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
)

function Sidebar({ page, setPage }) {
  const items = [
    { id: 'overview', label: 'Overview', icon: <SvgIcon d={['M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z','M9 22V12h6v10']} /> },
    { id: 'sales', label: 'Sales', icon: <SvgIcon d={['M18 20V10','M12 20V4','M6 20v-6']} /> },
    { id: 'intelligence', label: 'Intel', icon: <SvgIcon d={['M12 2a7 7 0 017 7c0 3.5-2 5.5-2 8H7c0-2.5-2-4.5-2-8a7 7 0 017-7z','M9 21h6','M9.5 17.5h5']} /> },
  ]
  const dims = [
    { label: 'P&L', icon: <SvgIcon d={['M12 1v22','M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6']} /> },
    { label: 'Inventory', icon: <SvgIcon d={['M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z','M3.27 6.96L12 12.01l8.73-5.05','M12 22.08V12']} /> },
    { label: 'Courier', icon: <SvgIcon d={['M1 3h15v13H1z','M16 8h4l3 3v5h-7V8z','M5.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z','M18.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z']} /> },
    { label: 'Marketing', icon: <SvgIcon d={['M22 12h-4l-3 9L9 3l-3 9H2']} /> },
  ]
  return (
    <nav className="sidebar">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 14, gap: 2 }}>
        <img src="/frido-logo.png" alt="Frido" style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover' }} />
        <span style={{ fontSize: 7.5, fontWeight: 600, color: C.t3, letterSpacing: '.04em', textTransform: 'uppercase', lineHeight: 1, textAlign: 'center' }}>Analytics</span>
      </div>
      {items.map(item => (
        <div key={item.id} onClick={() => setPage(item.id)}
          className={`sb-item${page === item.id ? ' active' : ''}`}>
          <span className="sb-icon">{item.icon}</span>
          <span className="sb-label">{item.label}</span>
        </div>
      ))}
      <div className="sb-div" />
      {dims.map(d => (
        <div key={d.label} className="sb-item dim">
          <span className="sb-icon">{d.icon}</span>
          <span className="sb-label">{d.label}</span>
        </div>
      ))}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <div className="sb-div" />
        {[
          { label: 'Settings', icon: <SvgIcon d={['M12 15a3 3 0 100-6 3 3 0 000 6z', 'M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z']} /> },
          { label: 'Profile', icon: <SvgIcon d={['M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2', 'M12 11a4 4 0 100-8 4 4 0 000 8z']} /> },
        ].map(b => (
          <div key={b.label} className="sb-item">
            <span className="sb-icon">{b.icon}</span>
            <span className="sb-label">{b.label}</span>
          </div>
        ))}
      </div>
    </nav>
  )
}

// ── Bottom Nav (mobile) ───────────────────────────────────────
function BottomNav({ page, setPage }) {
  const items = [
    { id: 'overview', label: 'Overview', icon: <SvgIcon d={['M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z','M9 22V12h6v10']} size={22} /> },
    { id: 'sales', label: 'Sales', icon: <SvgIcon d={['M18 20V10','M12 20V4','M6 20v-6']} size={22} /> },
    { id: 'intelligence', label: 'Intel', icon: <SvgIcon d={['M12 2a7 7 0 017 7c0 3.5-2 5.5-2 8H7c0-2.5-2-4.5-2-8a7 7 0 017-7z','M9 21h6','M9.5 17.5h5']} size={22} /> },
  ]
  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        {items.map(item => (
          <div key={item.id} onClick={() => setPage(item.id)} className={`bn-item${page === item.id ? ' active' : ''}`}>
            <span className="bn-icon">{item.icon}</span>
            <span className="bn-label">{item.label}</span>
          </div>
        ))}
      </div>
    </nav>
  )
}

// ── Topnav ─────────────────────────────────────────────────────
function DateRangePicker({ filters, setFilters }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ start: filters.start, end: filters.end })
  const [selecting, setSelecting] = useState('start')
  const [hover, setHover] = useState(null)
  const [dropPos, setDropPos] = useState({ top: 0, right: 0 })
  const ref = useRef(null)
  const btnRef = useRef(null)

  const today = new Date(); today.setHours(0,0,0,0)
  const fmt0 = d => { const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}` }
  const parseD = s => { const d = new Date(s + 'T00:00:00'); return isNaN(d) ? null : d }

  const [leftMonth, setLeftMonth] = useState(() => { const d = parseD(filters.start) || today; return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [rightMonth, setRightMonth] = useState(() => { const d = parseD(filters.start) || today; return new Date(d.getFullYear(), d.getMonth() + 1, 1) })
  const [monthPickerSide, setMonthPickerSide] = useState(null) // 'left' | 'right' | null
  const monthPickerOpen = monthPickerSide !== null
  const [yearInput, setYearInput] = useState(() => (parseD(filters.start) || today).getFullYear())

  const PRESETS = [
    { label: 'Today', fn: () => { const d = fmt0(today); return { start: d, end: d } } },
    { label: 'Yesterday', fn: () => { const d = new Date(today); d.setDate(d.getDate()-1); const s = fmt0(d); return { start: s, end: s } } },
    { label: 'Last 7 Days', fn: () => { const s = new Date(today); s.setDate(s.getDate()-6); return { start: fmt0(s), end: fmt0(today) } } },
    { label: 'Last 15 Days', fn: () => { const s = new Date(today); s.setDate(s.getDate()-14); return { start: fmt0(s), end: fmt0(today) } } },
    { label: 'Last 30 Days', fn: () => { const s = new Date(today); s.setDate(s.getDate()-29); return { start: fmt0(s), end: fmt0(today) } } },
    { label: 'Last 90 Days', fn: () => { const s = new Date(today); s.setDate(s.getDate()-89); return { start: fmt0(s), end: fmt0(today) } } },
    { label: 'This Week', fn: () => { const s = new Date(today); s.setDate(s.getDate()-s.getDay()); return { start: fmt0(s), end: fmt0(today) } } },
    { label: 'Last Week', fn: () => { const s = new Date(today); s.setDate(s.getDate()-s.getDay()-7); const e = new Date(s); e.setDate(e.getDate()+6); return { start: fmt0(s), end: fmt0(e) } } },
    { label: 'This Month', fn: () => { const s = new Date(today.getFullYear(), today.getMonth(), 1); return { start: fmt0(s), end: fmt0(today) } } },
    { label: 'Last Month', fn: () => { const s = new Date(today.getFullYear(), today.getMonth()-1, 1); const e = new Date(today.getFullYear(), today.getMonth(), 0); return { start: fmt0(s), end: fmt0(e) } } },
    { label: 'This Quarter', fn: () => { const q = Math.floor(today.getMonth()/3); const s = new Date(today.getFullYear(), q*3, 1); return { start: fmt0(s), end: fmt0(today) } } },
    { label: 'Last Quarter', fn: () => { const q = Math.floor(today.getMonth()/3); const s = new Date(today.getFullYear(), (q-1)*3, 1); const e = new Date(today.getFullYear(), q*3, 0); return { start: fmt0(s), end: fmt0(e) } } },
    ...(() => {
      // Current FY starts Apr of this year if month>=3, else Apr of last year
      const fyStart = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
      return [0, 1, 2].map(offset => {
        const fy = fyStart - offset
        const label = offset === 0 ? 'This FY' : offset === 1 ? 'Last FY' : `FY ${fy}-${String(fy+1).slice(2)}`
        return { label, fn: () => ({ start: fmt0(new Date(fy, 3, 1)), end: offset === 0 ? fmt0(today) : fmt0(new Date(fy+1, 2, 31)) }) }
      })
    })(),
  ]

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const apply = (s, e) => {
    const start = s || draft.start, end = e || draft.end
    if (start && end) { setFilters(f => ({ ...f, start, end })); setOpen(false) }
  }

  const getDays = (monthStart) => {
    const days = []
    const first = new Date(monthStart)
    const startDow = first.getDay()
    for (let i = 0; i < startDow; i++) days.push(null)
    const m = monthStart.getMonth()
    const d = new Date(monthStart)
    while (d.getMonth() === m) { days.push(new Date(d)); d.setDate(d.getDate()+1) }
    return days
  }

  const inRange = (day) => {
    if (!day) return false
    const ds = parseD(draft.start), de = parseD(draft.end)
    const hd = hover ? parseD(hover) : null
    if (ds && selecting === 'end' && hd) return day >= Math.min(ds, hd) && day <= Math.max(ds, hd)
    if (ds && de) return day >= ds && day <= de
    return false
  }
  const isStart = day => day && fmt0(day) === draft.start
  const isEnd = day => day && fmt0(day) === draft.end

  const fmtDisplay = s => { if (!s) return '—'; const d = parseD(s); if (!d) return s; return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) }

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  const renderMonth = (monthStart) => {
    const days = getDays(monthStart)
    return (
      <div style={{ flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
          {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d} style={{ fontSize: 10, fontWeight: 600, color: C.t3, textAlign: 'center', padding: '2px 0' }}>{d}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
          {days.map((day, i) => {
            if (!day) return <div key={i} />
            const ds = fmt0(day)
            const sel = isStart(day) || isEnd(day)
            const inR = inRange(day)
            const isToday = fmt0(day) === fmt0(today)
            return (
              <div key={i} onClick={() => {
                if (selecting === 'start') { setDraft({ start: ds, end: '' }); setSelecting('end') }
                else {
                  const s = parseD(draft.start)
                  if (day < s) { setDraft({ start: ds, end: draft.start }); setSelecting('start') }
                  else { setDraft(d => ({ ...d, end: ds })); setSelecting('start') }
                }
              }}
              onMouseEnter={() => selecting === 'end' && setHover(ds)}
              onMouseLeave={() => setHover(null)}
              style={{ textAlign: 'center', padding: '4px 1px', borderRadius: 5, fontSize: 12, cursor: 'pointer', fontWeight: sel ? 700 : isToday ? 600 : 400, background: sel ? C.acc : inR ? '#FFF9CC' : 'transparent', color: sel ? '#13121A' : isToday ? C.acc : C.t1, border: isToday && !sel ? `1px solid ${C.acc}` : '1px solid transparent' }}>
                {day.getDate()}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const displayLabel = filters.start && filters.end ? `${fmtDisplay(filters.start)}  →  ${fmtDisplay(filters.end)}` : 'Select date range'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button ref={btnRef} onClick={() => { const r = btnRef.current?.getBoundingClientRect(); if (r) setDropPos({ top: r.bottom + 6, right: window.innerWidth - r.right }); setDraft({ start: filters.start, end: filters.end }); setSelecting('start'); setOpen(o => !o) }}
        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <rect x="1" y="2.5" width="14" height="12.5" rx="2" stroke={C.t2} strokeWidth="1.4" fill="none"/>
          <path d="M1 6h14" stroke={C.t2} strokeWidth="1.4"/>
          <path d="M5 1v3M11 1v3" stroke={C.t2} strokeWidth="1.4" strokeLinecap="round"/>
          <rect x="4" y="8.5" width="2" height="2" rx=".4" fill={C.t2}/>
          <rect x="7.5" y="8.5" width="2" height="2" rx=".4" fill={C.t2}/>
          <rect x="11" y="8.5" width="2" height="2" rx=".4" fill={C.t2}/>
          <rect x="4" y="11.5" width="2" height="2" rx=".4" fill={C.t2}/>
          <rect x="7.5" y="11.5" width="2" height="2" rx=".4" fill={C.t2}/>
        </svg>
        {displayLabel}
      </button>
      {open && (
        <div style={{ position: 'fixed', top: dropPos.top, right: dropPos.right, zIndex: 9999, background: C.card, border: `1px solid ${C.border2}`, borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,.15)', display: 'flex', minWidth: 680 }}>
          {/* Preset list */}
          <div style={{ width: 140, borderRight: `1px solid ${C.border}`, padding: '8px 0', flexShrink: 0 }}>
            {PRESETS.map(p => (
              <div key={p.label} onClick={() => { const r = p.fn(); setDraft(r); apply(r.start, r.end) }}
                style={{ padding: '5px 14px', fontSize: 12, color: C.t2, cursor: 'pointer', whiteSpace: 'nowrap' }}
                onMouseEnter={e => e.currentTarget.style.background = C.bg}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                {p.label}
              </div>
            ))}
          </div>
          {/* Calendar */}
          <div style={{ flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Selected range display */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1, padding: '6px 10px', border: `1.5px solid ${selecting === 'start' ? C.acc : C.border}`, borderRadius: 7, fontSize: 12, color: draft.start ? C.t1 : C.t3 }}>{draft.start ? fmtDisplay(draft.start) : 'Start date'}</div>
              <span style={{ color: C.t3, fontSize: 13 }}>→</span>
              <div style={{ flex: 1, padding: '6px 10px', border: `1.5px solid ${selecting === 'end' ? C.acc : C.border}`, borderRadius: 7, fontSize: 12, color: draft.end ? C.t1 : C.t3 }}>{draft.end ? fmtDisplay(draft.end) : 'End date'}</div>
            </div>
            {monthPickerOpen ? (
              /* ── Month/Year quick-jump overlay ── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <button onClick={() => setYearInput(y => y - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: C.t2, padding: '2px 8px', fontFamily: 'var(--font)' }}>‹</button>
                  <span style={{ fontSize: 15, fontWeight: 700, color: C.t1, minWidth: 48, textAlign: 'center' }}>{yearInput}</span>
                  <button onClick={() => setYearInput(y => y + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: C.t2, padding: '2px 8px', fontFamily: 'var(--font)' }}>›</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5 }}>
                  {MONTH_NAMES.map((mn, i) => {
                    const refMonth = monthPickerSide === 'right' ? rightMonth : leftMonth
                    const isCurrent = refMonth.getFullYear() === yearInput && refMonth.getMonth() === i
                    return (
                      <button key={mn} onClick={() => {
                        const picked = new Date(yearInput, i, 1)
                        if (monthPickerSide === 'right') setRightMonth(picked)
                        else setLeftMonth(picked)
                        setMonthPickerSide(null)
                      }}
                        style={{ padding: '6px 4px', borderRadius: 6, border: isCurrent ? `2px solid ${C.acc}` : `1px solid ${C.border}`, background: isCurrent ? C.acl : 'transparent', color: C.t1, cursor: 'pointer', fontSize: 12, fontWeight: isCurrent ? 700 : 400, fontFamily: 'var(--font)' }}>
                        {mn}
                      </button>
                    )
                  })}
                </div>
                <div style={{ textAlign: 'center', marginTop: 2 }}>
                  <button onClick={() => setMonthPickerSide(null)} style={{ padding: '3px 14px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.t3, cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font)' }}>← back</button>
                </div>
              </div>
            ) : (
              /* ── Dual calendar view ── */
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: -4 }}>
                  <button onClick={() => { setLeftMonth(m => new Date(m.getFullYear(), m.getMonth()-1, 1)); setRightMonth(m => new Date(m.getFullYear(), m.getMonth()-1, 1)) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: C.t2, padding: '2px 8px' }}>‹</button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setYearInput(leftMonth.getFullYear()); setMonthPickerSide('left') }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: C.t1, padding: '2px 6px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 3 }}>
                      {leftMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} <span style={{ fontSize: 10, color: C.t3 }}>▾</span>
                    </button>
                    <span style={{ color: C.border2, fontSize: 16 }}>|</span>
                    <button onClick={() => { setYearInput(rightMonth.getFullYear()); setMonthPickerSide('right') }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: C.t1, padding: '2px 6px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 3 }}>
                      {rightMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} <span style={{ fontSize: 10, color: C.t3 }}>▾</span>
                    </button>
                  </div>
                  <button onClick={() => { setLeftMonth(m => new Date(m.getFullYear(), m.getMonth()+1, 1)); setRightMonth(m => new Date(m.getFullYear(), m.getMonth()+1, 1)) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: C.t2, padding: '2px 8px' }}>›</button>
                </div>
                <div style={{ display: 'flex', gap: 24 }}>
                  {renderMonth(leftMonth)}
                  <div style={{ width: 1, background: C.border }} />
                  {renderMonth(rightMonth)}
                </div>
              </>
            )}
            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 6, borderTop: `1px solid ${C.border}`, marginTop: 'auto' }}>
              <button onClick={() => setOpen(false)} style={{ padding: '6px 16px', borderRadius: 7, border: `1px solid ${C.border2}`, background: 'transparent', color: C.t2, cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font)' }}>Cancel</button>
              <button onClick={() => apply()} disabled={!draft.start || !draft.end} style={{ padding: '6px 16px', borderRadius: 7, border: 'none', background: draft.start && draft.end ? C.acc : C.border, color: '#13121A', cursor: draft.start && draft.end ? 'pointer' : 'default', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)' }}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Topnav({ page, alerts, onRefresh, loading, filters, setFilters, rawRows }) {
  const titles = { overview: 'Overview', sales: 'Sales Analytics', intelligence: 'Intelligence' }
  const critical = alerts.filter(a => a.type === 'red').length
  return (
    <div className="topnav">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: C.t1, letterSpacing: '-.02em', lineHeight: 1 }}>Frido</span>
        <span style={{ fontSize: 10, color: C.t3, fontWeight: 600, lineHeight: 1, letterSpacing: '.04em', textTransform: 'uppercase' }}>Analytics</span>
      </div>
      <div className="tnav-sep" />
      <span className="tnav-title">{titles[page]}</span>
      <div className="tnav-right">
        <DateRangePicker filters={filters} setFilters={setFilters} />
        <button onClick={onRefresh} className="tnav-btn">
          <span style={{ display: 'inline-block', animation: loading ? 'spin 1s linear infinite' : 'none', fontSize: 14 }}>↻</span> Refresh
        </button>
      </div>
    </div>
  )
}

// ── HeroKPICard ───────────────────────────────────────────────
function HeroKPICard({ label, value, sub, chg, sparkData, dataKey = 'cur', color, gradId }) {
  return (
    <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div className="kpi-label">{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="kpi-value">{value}</div>
        {chg !== null && chg !== undefined && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: chg >= 0 ? '#E6F4E0' : '#FDE8E8', color: chg >= 0 ? '#286010' : '#7A1A1A' }}>{chg >= 0 ? '▲' : '▼'} {Math.abs(chg).toFixed(1)}%</span>}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
      {sparkData?.length > 0 && (
        <ResponsiveContainer width="100%" height={32}>
          <AreaChart data={sparkData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs><linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={color} stopOpacity={0.25} /><stop offset="95%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
            <Area type="monotone" dataKey={dataKey} name="Current" stroke={color} strokeWidth={1.5} fill={`url(#${gradId})`} dot={false} connectNulls />
            <Area type="monotone" dataKey="prev" name="Prev" stroke="#94939F" strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
            <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: '#fff', border: '1px solid #E8E6DC', borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ color: p.name === 'Current' ? '#13121A' : '#94939F' }}>{p.name}: {p.value != null ? `₹${(p.value >= 1e7 ? (p.value/1e7).toFixed(2)+' Cr' : p.value >= 1e5 ? (p.value/1e5).toFixed(1)+' L' : Math.round(p.value).toLocaleString('en-IN'))}` : '—'}</div>)}</div> : null} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ── Overview Page ─────────────────────────────────────────────
function OverviewPage({ data, alerts }) {
  const { totalRev, totalExcRev, gstCollected, nOrders, totalQty, blendedAOV, nDays, chMap, catMap, subCatMap, stateMap, nCusts, repeatCusts, dailyArr, orders, htCount, htRev, multiItemOrders } = data
  const [selectedCat, setSelectedCat] = useState(null)
  const shopifyRev = chMap['Shopify']?.rev || 0
  const d2cPct = totalRev ? (shopifyRev / totalRev * 100).toFixed(1) : '0'
  const mktPct = (100 - parseFloat(d2cPct)).toFixed(1)
  const qcChs = ['Blinkit', 'Instamart', 'Zepto']
  const qcRev = qcChs.reduce((s, c) => s + (chMap[c]?.rev || 0), 0)
  const qcOrds = qcChs.reduce((s, c) => s + (chMap[c]?.orders || 0), 0)
  const qcAOV = qcOrds ? Math.round(qcRev / qcOrds) : 0
  const repeatRate = nCusts ? (repeatCusts / nCusts * 100).toFixed(1) : '0'
  const sortedCh = Object.entries(chMap).filter(([, v]) => v.rev > 0).sort((a, b) => b[1].rev - a[1].rev)
  const maxChRev = sortedCh[0]?.[1].rev || 1
  const bestAOV = sortedCh.reduce((b, [ch, v]) => { const a = v.orders ? v.rev / v.orders : 0; return a > b.aov ? { ch, aov: a } : b }, { ch: '', aov: 0 })
  const allCats = Object.entries(catMap).map(([k, v]) => ({ name: k, rev: v.rev, orders: v.orders.size, aov: v.orders.size ? v.rev / v.orders.size : 0 })).sort((a, b) => b.rev - a.rev)
  const channels = Object.keys(C.ch).filter(ch => chMap[ch] && chMap[ch].rev > 0)
  const voucherOrders = orders.filter(o => o.voucher).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero row */}
      <div className="g-hero">
        <div className="hero-grad" style={{ borderRadius: 16, padding: '24px 26px', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(0,0,0,.5)', marginBottom: 8 }}>Gross Revenue · Inc. GST</div>
            <div className="hero-val" style={{ fontSize: 42, fontWeight: 700, color: '#13121A', letterSpacing: '-.04em', lineHeight: 1, marginBottom: 6 }}>{totalRev >= 1e7 ? `₹${(totalRev / 1e7).toFixed(2)} Cr` : `₹${(totalRev / 1e5).toFixed(1)} L`}</div>
            <div style={{ fontSize: 12.5, color: 'rgba(0,0,0,.55)', lineHeight: 1.7 }}>Net {fmt(totalExcRev)} · GST {fmt(gstCollected)}<br />{nDays}d · {Object.keys(chMap).length} channels · {fmtN(nOrders)} orders</div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 5, background: 'rgba(0,0,0,.1)', color: '#13121A', marginTop: 10, width: 'fit-content' }}>
            Daily avg {fmt(totalRev / nDays)}
          </div>
          <div style={{ position: 'absolute', right: -10, bottom: -20, fontSize: 100, color: 'rgba(0,0,0,.04)', pointerEvents: 'none' }}>₹</div>
        </div>
        <KPICard center label="Orders" value={fmtN(nOrders)} sub={`${fmtN(totalQty)} units · ${(totalQty / (nOrders || 1)).toFixed(1)}/order`} />
        <KPICard center label="Blended AOV" value={`₹${Math.round(blendedAOV).toLocaleString('en-IN')}`} sub={`Best: ${bestAOV.ch} ₹${Math.round(bestAOV.aov).toLocaleString('en-IN')}`} />
        <KPICard center label="Unique Customers" value={fmtN(nCusts)} sub={`${repeatRate}% repeat`} />
      </div>

      {/* 9 KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 10 }}>
        <KPICard label="Daily avg revenue" value={fmt(totalRev / nDays)} sub={`${nDays} days`} />
        <KPICard label="D2C Share" value={`${d2cPct}%`} sub={`Shopify ${fmt(shopifyRev)}`} />
        <KPICard label="Q-commerce Share" value={pct(qcRev, totalRev)} sub={`${fmt(qcRev)} · Blinkit+Instamart+Zepto`} />
        <KPICard label="Marketplace Share" value={`${(100 - parseFloat(d2cPct) - parseFloat(pct(qcRev, totalRev))).toFixed(1)}%`} sub={`Amazon+Flipkart+others ${fmt(totalRev - shopifyRev - qcRev)}`} />
        <KPICard label="Multi-item rate" value={pct(multiItemOrders, nOrders)} sub="+AOV premium" />
        <KPICard label="Voucher penetration" value={pct(voucherOrders, nOrders)} sub={`${fmtN(voucherOrders)} orders`} />
        <KPICard label="High-ticket ≥₹10K" value={fmtN(htCount)} sub={fmt(htRev)} />
      </div>

      {/* Trend + Channels */}
      <div className="g-21">
        <Card title="Revenue trend · daily" note="₹ stacked by channel">
          <RevTrendChart dailyArr={dailyArr} channels={channels} />
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: C.t3, marginBottom: 7 }}>D2C vs Q-Commerce vs Marketplace</div>
            {(() => {
              const qcP = totalRev ? qcRev / totalRev * 100 : 0
              const d2cP = parseFloat(d2cPct)
              const mktP = Math.max(0, 100 - d2cP - qcP)
              const segs = [
                { pct: d2cP, bg: C.acc, color: '#13121A', label: `${d2cP.toFixed(1)}% D2C` },
                { pct: qcP,  bg: '#0D9E68', color: '#fff', label: `${qcP.toFixed(1)}% QC` },
                { pct: mktP, bg: '#B0ADB8', color: '#13121A', label: `${mktP.toFixed(1)}% Mkt` },
              ]
              return (
                <div>
                  <div className="spbar">
                    {segs.map((s, i) => (
                      <div key={i} style={{ width: `${s.pct}%`, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: s.color, overflow: 'hidden', whiteSpace: 'nowrap', minWidth: s.pct > 0 ? 4 : 0 }}>
                        {s.pct >= 8 ? s.label : ''}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8 }}>
              {sortedCh.slice(0, 6).map(([ch, v]) => (
                <div key={ch} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: C.t2 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.ch[ch] || C.acc, display: 'inline-block', border: C.ch[ch] === '#FFD600' ? '1px solid #E6C200' : 'none' }} />
                  {ch} {fmt(v.rev)}
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card title="Channel breakdown">
          {sortedCh.map(([ch, v]) => <HBar key={ch} dot={C.ch[ch] || C.acm} label={ch} width={(v.rev / maxChRev) * 100} value={fmt(v.rev)} pctVal={pct(v.rev, totalRev)} />)}
        </Card>
      </div>

      {/* Scorecard row — scorecard + new vs repeat side by side, stretch to same height */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
        <Card title="Channel scorecard" style={{ flexShrink: 0, width: 'fit-content', minWidth: 520 }}>
          <DataTable columns={[
            { key: 'ch', label: 'Channel' },
            { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
            { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) },
            { key: 'aov', label: 'AOV', align: 'right', mono: true, render: v => `₹${Math.round(v).toLocaleString('en-IN')}` },
          ]} rows={Object.keys(C.ch).filter(ch => chMap[ch] && chMap[ch].rev > 0).map(ch => { const v = chMap[ch]; return { ch, rev: v.rev, orders: v.orders, aov: v.orders ? v.rev / v.orders : 0 } })} />
        </Card>
        <div style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 13, padding: '16px 18px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>New vs Repeat Customers</span>
            <span style={{ fontSize: 11.5, color: C.t3 }}>{fmtN(nCusts)} total</span>
          </div>
          {(() => {
            const newCusts = nCusts - repeatCusts
            const donutData = [
              { name: 'New', value: newCusts, color: C.acc },
              { name: 'Repeat', value: repeatCusts, color: '#0D9E68' },
            ]
            const totalOrders = dailyArr.map(d => ({ date: d.date, orders: Object.entries(d).filter(([k]) => k.endsWith('_o')).reduce((s, [, v]) => s + (v || 0), 0) }))
            const newPct = nCusts ? newCusts / nCusts * 100 : 0
            const repPct = nCusts ? repeatCusts / nCusts * 100 : 0
            const avgOrdersPerDay = totalOrders.length ? (totalOrders.reduce((s, d) => s + d.orders, 0) / totalOrders.length).toFixed(0) : 0
            const peakDay = totalOrders.reduce((a, b) => b.orders > a.orders ? b : a, { orders: 0, date: '' })
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Top: donut + stats */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <PieChart width={140} height={140}>
                      <Pie data={donutData} cx={68} cy={68} innerRadius={44} outerRadius={66} dataKey="value" paddingAngle={3}>
                        {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                    </PieChart>
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.t1, lineHeight: 1 }}>{fmtN(nCusts)}</div>
                      <div style={{ fontSize: 8.5, color: C.t3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 2 }}>Total</div>
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 28, marginBottom: 12 }}>
                      {donutData.map(d => (
                        <div key={d.name}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: C.t3 }}>{d.name}</span>
                          </div>
                          <div style={{ fontSize: 24, fontWeight: 700, color: C.t1, letterSpacing: '-.02em', lineHeight: 1 }}>{fmtN(d.value)}</div>
                          <div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>{nCusts ? (d.value / nCusts * 100).toFixed(1) : 0}% of total</div>
                        </div>
                      ))}
                    </div>
                    {/* New vs Repeat split bar */}
                    <div style={{ height: 6, borderRadius: 4, overflow: 'hidden', display: 'flex', background: C.border }}>
                      <div style={{ width: `${newPct}%`, background: C.acc, transition: 'width .5s' }} />
                      <div style={{ width: `${repPct}%`, background: '#0D9E68', transition: 'width .5s' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: C.t3 }}>New {newPct.toFixed(1)}%</span>
                      <span style={{ fontSize: 10, color: C.t3 }}>Repeat {repPct.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>

                {/* Mini stat row */}
                <div style={{ display: 'flex', gap: 0, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: '10px 0' }}>
                  {[
                    { label: 'Avg Orders/Day', value: fmtN(avgOrdersPerDay) },
                    { label: 'Peak Day', value: peakDay.date ? peakDay.date.slice(5) : '—' },
                    { label: 'Peak Orders', value: fmtN(peakDay.orders) },
                    { label: 'Repeat Rate', value: repPct.toFixed(1) + '%' },
                  ].map((s, i, arr) => (
                    <div key={s.label} style={{ flex: 1, textAlign: 'center', borderRight: i < arr.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Daily orders trend */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, marginBottom: 6 }}>Daily Orders Trend</div>
                  <ResponsiveContainer width="100%" height={90}>
                    <AreaChart data={totalOrders} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="ordGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={C.acc} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={C.acc} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: C.t3 }} tickFormatter={d => d?.slice(5)} />
                      <YAxis hide />
                      <Tooltip content={<ChartTooltip formatter={fmtN} />} />
                      <Area type="monotone" dataKey="orders" name="Orders" stroke={C.acc} strokeWidth={2} fill="url(#ordGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Category + Sub-category full width row */}
      <div className="g-2">
          {/* Category table */}
          <Card title="Category Revenue" note={selectedCat ? <span style={{ cursor: 'pointer', color: C.acc, fontWeight: 600 }} onClick={() => setSelectedCat(null)}>✕ Clear</span> : `${allCats.length} total`}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Category','Revenue','Orders','AOV'].map((h, i) => (
                      <th key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, textAlign: i === 0 ? 'left' : 'right', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allCats.map((row, i) => {
                    const active = selectedCat === row.name
                    return (
                      <tr key={row.name} onClick={() => setSelectedCat(s => s === row.name ? null : row.name)}
                        style={{ cursor: 'pointer', background: active ? C.acl : 'transparent', borderBottom: i < allCats.length - 1 ? `1px solid ${C.border}` : 'none' }}
                        onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#FFFBE6' }}
                        onMouseLeave={e => { e.currentTarget.style.background = active ? C.acl : 'transparent' }}>
                        <td style={{ padding: '5.5px 5px', color: active ? C.t1 : C.t2, fontWeight: active ? 700 : 400 }}>{row.name}</td>
                        <td style={{ padding: '5.5px 5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t1 }}>{fmt(row.rev)}</td>
                        <td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t1 }}>{fmtN(row.orders)}</td>
                        <td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t1 }}>₹{Math.round(row.aov).toLocaleString('en-IN')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          {/* Sub-category table — always visible, filters on click */}
          {(() => {
            const subRows = Object.entries(subCatMap || {})
              .filter(([k]) => !selectedCat || k.startsWith(selectedCat + '::'))
              .map(([k, v]) => ({ name: k.split('::')[1], cat: k.split('::')[0], rev: v.rev, orders: v.orders.size, aov: v.orders.size ? v.rev / v.orders.size : 0 }))
              .sort((a, b) => b.rev - a.rev)
            return (
              <PaginatedCard title={selectedCat ? `Sub-categories · ${selectedCat}` : 'Sub-categories'} rows={subRows} columns={[
                { key: 'name', label: 'Sub-category' },
                { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
                { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) },
                { key: 'aov', label: 'AOV', align: 'right', render: v => `₹${Math.round(v).toLocaleString('en-IN')}` },
              ]} pageSize={15} />
            )
          })()}
        </div>
    </div>
  )
}

// ── Sales sub-tabs ────────────────────────────────────────────
const TABS = [
  { id: 'all', label: 'All Channels' },
  { id: 'shopify', label: 'Shopify', ch: 'Shopify', logo: '/logo-shopify.png' },
  { id: 'amazon', label: 'Amazon', ch: 'Amazon', logo: '/logo-amazon.png' },
  { id: 'flipkart', label: 'Flipkart', ch: 'Flipkart', logo: '/logo-flipkart.png' },
  { id: 'blinkit', label: 'Blinkit', ch: 'Blinkit', logo: '/logo-blinkit.png' },
  { id: 'cred', label: 'CRED', ch: 'CRED', logo: '/logo-cred.png' },
  { id: 'firstcry', label: 'Firstcry', ch: 'Firstcry', logo: '/logo-firstcry.png' },
  { id: 'instamart', label: 'Instamart', ch: 'Instamart', logo: '/logo-instamart.png' },
  { id: 'zepto', label: 'Zepto', ch: 'Zepto', logo: '/logo-zepto.png' },
  { id: 'myntra', label: 'Myntra', ch: 'Myntra', logo: '/logo-myntra.png' },
  { id: 'offline', label: 'Offline Sales', ch: 'offline_sales' },
]

function PaginatedCard({ title, rows, columns, pageSize = 10 }) {
  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [rows])
  const totalPages = Math.ceil(rows.length / pageSize)
  const visible = rows.slice(page * pageSize, (page + 1) * pageSize)
  return (
    <Card title={title} style={{ display: 'flex', flexDirection: 'column' }}>
      <DataTable columns={columns} rows={visible} />
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 11, color: C.t3 }}>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, rows.length)} of {rows.length}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: `1px solid ${C.border2}`, background: page === 0 ? C.bg : C.card, color: page === 0 ? C.t3 : C.t1, cursor: page === 0 ? 'default' : 'pointer', fontFamily: 'var(--font)' }}>← Prev</button>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: `1px solid ${C.border2}`, background: page === totalPages - 1 ? C.bg : C.card, color: page === totalPages - 1 ? C.t3 : C.t1, cursor: page === totalPages - 1 ? 'default' : 'pointer', fontFamily: 'var(--font)' }}>Next →</button>
          </div>
        </div>
      )}
    </Card>
  )
}


// ── Multi-select Voucher Dropdown ────────────────────────────
function VoucherDropdown({ voucherList, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState(null)
  const ref = useRef(null)
  const selectedArr = selected ? selected.split(',').map(s => s.trim()).filter(Boolean) : []
  const staged = pending !== null ? pending : selectedArr
  const filtered = (voucherList || []).filter(({ code }) => code.toLowerCase().includes(search.toLowerCase()))

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setPending(null); setSearch('') } }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = code => {
    const next = staged.includes(code) ? staged.filter(v => v !== code) : [...staged, code]
    setPending(next)
  }

  const apply = () => { onChange((pending !== null ? pending : staged).join(',')); setPending(null); setOpen(false); setSearch('') }
  const clear = () => { setPending([]) }

  const label = selectedArr.length === 0 ? 'All Vouchers' : selectedArr.length === 1 ? selectedArr[0] : `${selectedArr.length} vouchers selected`

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <div onClick={() => { setPending(null); setOpen(o => !o) }} className="fsel" style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', minWidth: 160, maxWidth: 200, background: selectedArr.length ? '#FFF9CC' : undefined, borderColor: selectedArr.length ? C.acm : undefined }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5 }}>{label}</span>
        <span style={{ fontSize: 8, color: C.t3, flexShrink: 0 }}>▼</span>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 200, background: C.card, border: `1px solid ${C.border2}`, borderRadius: 9, boxShadow: '0 8px 28px rgba(0,0,0,.14)', width: 240 }}>
          <div style={{ padding: '7px 8px', borderBottom: `1px solid ${C.border}` }}>
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)} onMouseDown={e => e.stopPropagation()} placeholder="Search voucher…" style={{ width: '100%', fontSize: 11.5, padding: '4px 8px', border: `1px solid ${C.border2}`, borderRadius: 6, outline: 'none', fontFamily: 'var(--font)', background: C.bg }} />
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {filtered.map(({ code }) => {
              const checked = staged.includes(code)
              return (
                <div key={code} onClick={() => toggle(code)} style={{ padding: '5px 10px', fontSize: 11.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, background: checked ? C.acl : undefined }}>
                  <span style={{ width: 13, height: 13, borderRadius: 3, border: `1.5px solid ${checked ? C.acm : C.border2}`, background: checked ? C.acc : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 8, fontWeight: 700 }}>{checked ? '✓' : ''}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{code}</span>
                </div>
              )
            })}
            {filtered.length === 0 && <div style={{ padding: '10px', fontSize: 11.5, color: C.t3, textAlign: 'center' }}>No results</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, padding: '8px', borderTop: `1px solid ${C.border}` }}>
            <button onMouseDown={e => e.stopPropagation()} onClick={clear} style={{ flex: 1, fontSize: 11.5, fontWeight: 600, padding: '5px 0', borderRadius: 6, border: `1.5px solid ${C.border2}`, background: 'transparent', color: C.t2, cursor: 'pointer', fontFamily: 'var(--font)' }}>Clear</button>
            <button onMouseDown={e => e.stopPropagation()} onClick={apply} style={{ flex: 1, fontSize: 11.5, fontWeight: 700, padding: '5px 0', borderRadius: 6, border: 'none', background: C.t1, color: '#fff', cursor: 'pointer', fontFamily: 'var(--font)' }}>Apply</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Searchable single-select dropdown ────────────────────────
function SearchableSelect({ options, value, onChange, placeholder, dropdownWidth, multi }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState(null) // staged selection before Apply (multi only)
  const ref = useRef(null)
  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
  const selected = multi ? (value || []) : value
  // while dropdown is open, work on pending; on close without apply, discard
  const staged = multi ? (pending !== null ? pending : selected) : selected

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setPending(null); setSearch('') } }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const openDropdown = () => { setPending(null); setOpen(o => !o) }

  const toggle = v => {
    if (!multi) { onChange(v); setSearch(''); setOpen(false); return }
    const arr = staged.includes(v) ? staged.filter(x => x !== v) : [...staged, v]
    setPending(arr)
  }

  const apply = () => { onChange(pending !== null ? pending : staged); setPending(null); setOpen(false); setSearch('') }
  const clear = () => { if (multi) { setPending([]) } else { onChange(''); setOpen(false) } }

  const hasValue = multi ? selected.length > 0 : !!selected
  const label = multi
    ? (selected.length === 0 ? placeholder : selected.length === 1 ? selected[0] : `${selected[0]} +${selected.length - 1}`)
    : (selected || placeholder)

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <div onClick={openDropdown} className="fsel" style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', minWidth: 140, background: hasValue ? '#FFF9CC' : undefined, borderColor: hasValue ? C.acm : undefined }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5 }}>{label}</span>
        <span style={{ fontSize: 8, color: C.t3, flexShrink: 0 }}>▼</span>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 200, background: C.card, border: `1px solid ${C.border2}`, borderRadius: 9, boxShadow: '0 8px 28px rgba(0,0,0,.14)', width: dropdownWidth || 220 }}>
          <div style={{ padding: '7px 8px', borderBottom: `1px solid ${C.border}` }}>
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)} onMouseDown={e => e.stopPropagation()} placeholder={`Search ${placeholder?.toLowerCase() || ''}…`} style={{ width: '100%', fontSize: 11.5, padding: '4px 8px', border: `1px solid ${C.border2}`, borderRadius: 6, outline: 'none', fontFamily: 'var(--font)', background: C.bg }} />
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {filtered.map(opt => {
              const active = multi ? staged.includes(opt) : staged === opt
              return (
                <div key={opt} onClick={() => toggle(opt)} style={{ padding: '5px 10px', fontSize: 11.5, cursor: 'pointer', background: active ? C.acl : undefined, color: active ? C.t1 : C.t2, fontWeight: active ? 600 : 400, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 7 }}>
                  {multi && <span style={{ width: 13, height: 13, borderRadius: 3, border: `1.5px solid ${active ? C.acm : C.border2}`, background: active ? C.acm : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{active && <span style={{ color: '#fff', fontSize: 9, lineHeight: 1 }}>✓</span>}</span>}
                  {opt}
                </div>
              )
            })}
            {filtered.length === 0 && <div style={{ padding: '10px', fontSize: 11.5, color: C.t3, textAlign: 'center' }}>No results</div>}
          </div>
          {multi && (
            <div style={{ display: 'flex', gap: 6, padding: '8px', borderTop: `1px solid ${C.border}` }}>
              <button onMouseDown={e => e.stopPropagation()} onClick={clear} style={{ flex: 1, fontSize: 11.5, fontWeight: 600, padding: '5px 0', borderRadius: 6, border: `1.5px solid ${C.border2}`, background: 'transparent', color: C.t2, cursor: 'pointer', fontFamily: 'var(--font)' }}>Clear</button>
              <button onMouseDown={e => e.stopPropagation()} onClick={() => setPending(filtered)} style={{ flex: 1, fontSize: 11.5, fontWeight: 600, padding: '5px 0', borderRadius: 6, border: `1.5px solid ${C.border2}`, background: 'transparent', color: C.t2, cursor: 'pointer', fontFamily: 'var(--font)' }}>Select All</button>
              <button onMouseDown={e => e.stopPropagation()} onClick={apply} style={{ flex: 1, fontSize: 11.5, fontWeight: 700, padding: '5px 0', borderRadius: 6, border: 'none', background: C.t1, color: '#fff', cursor: 'pointer', fontFamily: 'var(--font)' }}>Apply</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const CHART_METRICS = [
  { id: 'rev', label: 'Revenue', key: ch => ch },
  { id: 'units', label: 'Units', key: ch => ch + '_u' },
]
const CHART_TYPES = [
  { id: 'line', label: 'Line' },
  { id: 'bar', label: 'Bar' },
  { id: 'area', label: 'Area' },
]

function ChannelTrendCard({ dailyArr, channels }) {
  const [metric, setMetric] = useState('rev')
  const chartType = 'line'
  const m = CHART_METRICS.find(x => x.id === metric)
  const dataKey = m.key
  const fmtTick = v => v >= 1e5 ? `${(v / 1e5).toFixed(0)}L` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v
  const selStyle = { fontSize: 11.5, padding: '4px 8px', borderRadius: 7, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, outline: 'none', fontFamily: 'var(--font)', cursor: 'pointer' }

  const nDays = dailyArr.length
  const autoGroup = nDays <= 14 ? 'daily' : nDays <= 90 ? 'weekly' : 'monthly'
  const [groupBy, setGroupBy] = useState(autoGroup)

  const grouped = groupDailyArr(dailyArr, channels, groupBy)
  const enrichedDaily = grouped.map(row => {
    const total = channels.reduce((s, ch) => s + (row[dataKey(ch)] || 0), 0)
    return { ...row, _total: total }
  })

  const totalTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const row = payload[0]?.payload || {}
    const total = row._total || 0
    const chEntries = channels.map(ch => ({ ch, val: row[dataKey(ch)] || 0 })).filter(x => x.val > 0).sort((a, b) => b.val - a.val)
    const fmtV = v => metric === 'units' ? fmtN(v) : fmt(v)
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 11, minWidth: 160, boxShadow: '0 2px 8px rgba(0,0,0,.12)' }}>
        <div style={{ fontWeight: 700, color: C.t2, marginBottom: 5 }}>{label?.slice(5) || label}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontWeight: 700, color: C.t1, marginBottom: 5, paddingBottom: 5, borderBottom: `1px solid ${C.border}` }}>
          <span>Total</span><span style={{ fontFamily: 'var(--mono)' }}>{fmtV(total)}</span>
        </div>
        {chEntries.map(({ ch, val }) => (
          <div key={ch} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, color: C.t2, marginBottom: 2 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: C.ch[ch] || C.acc, display: 'inline-block', flexShrink: 0 }} />{ch}</span>
            <span style={{ fontFamily: 'var(--mono)', color: C.t1 }}>{fmtV(val)}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>{GROUP_OPTS.find(x => x.id === groupBy)?.label} {m.label} by Channel</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={selStyle}>
            {GROUP_OPTS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
          <select value={metric} onChange={e => setMetric(e.target.value)} style={selStyle}>
            {CHART_METRICS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={enrichedDaily} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="chTotalGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={C.acm} stopOpacity={0.18} />
              <stop offset="95%" stopColor={C.acm} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={d => d?.slice(5)} />
          <YAxis tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={fmtTick} width={40} />
          <Tooltip content={totalTooltip} />
          <Area type="monotone" dataKey="_total" name="Total" stroke={C.acm} strokeWidth={2.5} fill="url(#chTotalGrad)" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  )
}

const DAILY_METRICS = [
  { id: 'rev', label: 'Revenue' },
  { id: 'units', label: 'Units' },
]

const GROUP_OPTS = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
]

function getGroupKey(date, groupBy) {
  if (!date) return '—'
  if (groupBy === 'daily') return date
  if (groupBy === 'weekly') {
    const d = new Date(date)
    const jan1 = new Date(d.getFullYear(), 0, 1)
    const weekNum = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7)
    const mon = d.toLocaleString('en-IN', { month: 'short' })
    const yr = String(d.getFullYear()).slice(2)
    return `${mon}-${yr} W${weekNum}`
  }
  if (groupBy === 'monthly') return date.slice(0, 7)
  if (groupBy === 'quarterly') {
    const [y, m] = date.split('-')
    const q = Math.ceil(parseInt(m) / 3)
    return `${y} Q${q}`
  }
  return date
}

function groupDailyArr(dailyArr, channels, groupBy) {
  if (groupBy === 'daily') return dailyArr
  const map = {}
  dailyArr.forEach(d => {
    const key = getGroupKey(d.date, groupBy)
    if (!map[key]) { map[key] = { date: key }; channels.forEach(ch => { map[key][ch] = 0; map[key][ch + '_o'] = 0; map[key][ch + '_u'] = 0 }) }
    channels.forEach(ch => {
      map[key][ch] = (map[key][ch] || 0) + (d[ch] || 0)
      map[key][ch + '_o'] = (map[key][ch + '_o'] || 0) + (d[ch + '_o'] || 0)
      map[key][ch + '_u'] = (map[key][ch + '_u'] || 0) + (d[ch + '_u'] || 0)
    })
  })
  return Object.values(map)
}

function DailyChannelTable({ dailyArr, channels, nDays = 7 }) {
  const autoGroup = nDays <= 14 ? 'daily' : nDays <= 90 ? 'weekly' : 'monthly'
  const [metric, setMetric] = useState('rev')
  const [groupBy, setGroupBy] = useState(autoGroup)
  useEffect(() => { setGroupBy(autoGroup) }, [nDays])
  const m = DAILY_METRICS.find(x => x.id === metric)
  const grouped = groupDailyArr(dailyArr, channels, groupBy)

  const getVal = (d, ch) => {
    if (metric === 'rev') return d[ch] || 0
    if (metric === 'orders') return d[ch + '_o'] || 0
    if (metric === 'units') return d[ch + '_u'] || 0
    if (metric === 'aov') { const o = d[ch + '_o'] || 0; return o ? (d[ch] || 0) / o : 0 }
    if (metric === 'asp') { const u = d[ch + '_u'] || 0; return u ? (d[ch] || 0) / u : 0 }
    return 0
  }
  const fmtVal = v => {
    if (metric === 'rev') return fmt(v)
    if (metric === 'aov' || metric === 'asp') return v > 0 ? `₹${Math.round(v).toLocaleString('en-IN')}` : '—'
    return fmtN(v)
  }
  const getTotalVal = d => {
    if (metric === 'rev') return channels.reduce((s, ch) => s + (d[ch] || 0), 0)
    if (metric === 'orders') return channels.reduce((s, ch) => s + (d[ch + '_o'] || 0), 0)
    if (metric === 'units') return channels.reduce((s, ch) => s + (d[ch + '_u'] || 0), 0)
    if (metric === 'aov') { const o = channels.reduce((s, ch) => s + (d[ch + '_o'] || 0), 0); const r = channels.reduce((s, ch) => s + (d[ch] || 0), 0); return o ? r / o : 0 }
    if (metric === 'asp') { const u = channels.reduce((s, ch) => s + (d[ch + '_u'] || 0), 0); const r = channels.reduce((s, ch) => s + (d[ch] || 0), 0); return u ? r / u : 0 }
    return 0
  }

  const selStyle = { fontSize: 11.5, padding: '4px 8px', borderRadius: 7, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, outline: 'none', fontFamily: 'var(--font)', cursor: 'pointer' }

  // Peak row = highest total
  const peakIdx = grouped.reduce((pi, d, i) => getTotalVal(d) > getTotalVal(grouped[pi]) ? i : pi, 0)

  // Column totals
  const colTotals = {}
  channels.forEach(ch => { colTotals[ch] = grouped.reduce((s, d) => s + getVal(d, ch), 0) })
  const grandTotal = channels.reduce((s, ch) => s + colTotals[ch], 0)

  const fmtDate = d => {
    if (!d || d.length < 8) return d
    if (groupBy !== 'daily') return d
    const dt = new Date(d + 'T00:00:00')
    return dt.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  const thStyle = (ch) => ({ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: ch ? (C.ch[ch] || C.t2) : C.t1, textAlign: 'right', padding: '5px 8px 7px', borderBottom: `2px solid ${ch ? (C.ch[ch] || C.border) : C.border}`, whiteSpace: 'nowrap', background: C.card })

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>{GROUP_OPTS.find(x => x.id === groupBy).label} {m.label} by Channel</span>
          <span style={{ fontSize: 11, color: C.t3 }}>{grouped.length} {groupBy === 'daily' ? 'days' : groupBy === 'weekly' ? 'weeks' : 'periods'} of data</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={selStyle}>
            {GROUP_OPTS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
          <select value={metric} onChange={e => setMetric(e.target.value)} style={selStyle}>
            {DAILY_METRICS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </div>
      </div>
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 380 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 700, width: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
            <tr>
              <th style={{ ...thStyle(null), textAlign: 'left', minWidth: 110 }}>Period</th>
              {channels.map(ch => <th key={ch} style={thStyle(ch)}>{ch}</th>)}
              <th style={thStyle(null)}>Total</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((d, i) => {
              const isPeak = i === peakIdx
              const rowTotal = getTotalVal(d)
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }} onMouseEnter={e => e.currentTarget.style.background = '#FFFDF0'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '6px 8px', color: C.t2, whiteSpace: 'nowrap', fontWeight: isPeak ? 700 : 400 }}>
                    <span>{fmtDate(d.date)}</span>
                    {isPeak && <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: C.acl, color: C.t1, border: `1px solid ${C.acm}` }}>Peak</span>}
                  </td>
                  {channels.map(ch => {
                    const v = getVal(d, ch)
                    const sharePct = rowTotal && v ? (v / rowTotal * 100).toFixed(1) : null
                    return (
                      <td key={ch} style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11.5, color: v ? C.t1 : C.t3, borderLeft: `1px solid ${C.border}` }}>
                        {v ? <>{fmtVal(v)}<span style={{ fontSize: 10, color: C.t3, fontWeight: 400, marginLeft: 4 }}>{sharePct}%</span></> : '—'}
                      </td>
                    )
                  })}
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t1, borderLeft: `1px solid ${C.border}` }}>
                    {fmtVal(rowTotal)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${C.border}`, background: C.bg }}>
              <td style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, color: C.t1 }}>Total <span style={{ fontSize: 9.5, fontWeight: 400, color: C.t3 }}>(channel share)</span></td>
              {channels.map(ch => (
                <td key={ch} style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t1, borderLeft: `1px solid ${C.border}` }}>
                  {fmtVal(colTotals[ch])}
                  {metric === 'rev' && grandTotal ? <span style={{ fontSize: 10, fontWeight: 400, color: C.t3, marginLeft: 4 }}>{(colTotals[ch] / grandTotal * 100).toFixed(1)}%</span> : null}
                </td>
              ))}
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t1, borderLeft: `1px solid ${C.border}` }}>{fmtVal(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  )
}

function CategoryChannelMatrix({ heatData, channels, maxHeat, subCatChannelMap = {}, skuChannelMap = {} }) {
  const [expanded, setExpanded] = useState({})
  const [expandedSC, setExpandedSC] = useState({})
  const toggle = cat => setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }))
  const toggleSC = key => setExpandedSC(prev => ({ ...prev, [key]: !prev[key] }))

  const renderCell = (v, rowTotal) => {
    const intensity = rowTotal > 0 ? v / rowTotal : 0
    const share = rowTotal > 0 ? (v / rowTotal * 100).toFixed(0) : 0
    const cls = intensity === 0 ? 'h0' : intensity < 0.1 ? 'h1' : intensity < 0.3 ? 'h2' : intensity < 0.6 ? 'h3' : 'h4'
    return { cls, content: v > 0 ? <>{fmt(v)}<span style={{ fontSize: 9, fontWeight: 500, color: 'rgba(0,0,0,0.38)', marginLeft: 3 }}>{share}%</span></> : '—' }
  }

  return (
    <Card title="Category × Channel Revenue Matrix" note="₹ shading = intensity">
      <div className="tbl-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 700 }}>
          <thead style={{ position: 'sticky', top: 0, background: C.card, zIndex: 1 }}>
            <tr>
              <th style={{ textAlign: 'left', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, color: C.t3, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Category</th>
              {channels.map(ch => <th key={ch} style={{ textAlign: 'right', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, color: C.ch[ch], fontSize: 10, fontWeight: 700 }}>{ch}</th>)}
              <th style={{ textAlign: 'right', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, color: C.t1, fontSize: 10, fontWeight: 700 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {heatData.map((row, i) => {
              const rowTotal = channels.reduce((s, ch) => s + (row[ch] || 0), 0)
              const isOpen = expanded[row.cat]
              const subCats = Object.entries(subCatChannelMap[row.cat] || {}).sort((a, b) => {
                const ta = channels.reduce((s, ch) => s + (b[1][ch] || 0), 0)
                const tb = channels.reduce((s, ch) => s + (a[1][ch] || 0), 0)
                return ta - tb
              })
              const hasSubCats = subCats.length > 0
              return (
                <Fragment key={i}>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '5px', fontWeight: 600, color: C.t1 }}>
                      <span
                        onClick={() => hasSubCats && toggle(row.cat)}
                        style={{ cursor: hasSubCats ? 'pointer' : 'default', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                      >
                        {hasSubCats && <span style={{ fontSize: 9, color: C.t3, display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>▶</span>}
                        {row.cat}
                      </span>
                    </td>
                    {channels.map(ch => {
                      const v = row[ch] || 0
                      const { cls, content } = renderCell(v, rowTotal)
                      return <td key={ch} className={cls} style={{ padding: '5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11 }}>{content}</td>
                    })}
                    <td style={{ padding: '5px', textAlign: 'right', fontWeight: 700, color: C.t1, fontFamily: 'var(--mono)', fontSize: 11 }}>{fmt(rowTotal)}</td>
                  </tr>
                  {isOpen && subCats.map(([sc, chData]) => {
                    const scTotal = channels.reduce((s, ch) => s + (chData[ch] || 0), 0)
                    const scKey = `${row.cat}::${sc}`
                    const skus = Object.entries(skuChannelMap[row.cat]?.[sc] || {}).sort((a, b) => {
                      const ta = channels.reduce((s, ch) => s + (b[1][ch] || 0), 0)
                      const tb = channels.reduce((s, ch) => s + (a[1][ch] || 0), 0)
                      return ta - tb
                    })
                    const hasSkus = skus.length > 0
                    const scOpen = expandedSC[scKey]
                    return (
                      <Fragment key={sc}>
                        <tr style={{ borderBottom: `1px solid ${C.border}`, background: '#FAFAF7' }}>
                          <td style={{ padding: '4px 5px 4px 20px', color: C.t2, fontSize: 10.5 }}>
                            <span onClick={() => hasSkus && toggleSC(scKey)} style={{ cursor: hasSkus ? 'pointer' : 'default', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              {hasSkus && <span style={{ fontSize: 8, color: C.t3, display: 'inline-block', transform: scOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>▶</span>}
                              └ {sc}
                            </span>
                          </td>
                          {channels.map(ch => {
                            const v = chData[ch] || 0
                            const { cls, content } = renderCell(v, scTotal)
                            return <td key={ch} className={cls} style={{ padding: '4px 5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 10.5 }}>{content}</td>
                          })}
                          <td style={{ padding: '4px 5px', textAlign: 'right', fontWeight: 600, color: C.t2, fontFamily: 'var(--mono)', fontSize: 10.5 }}>{fmt(scTotal)}</td>
                        </tr>
                        {scOpen && skus.map(([sku, skuChData]) => {
                          const skuTotal = channels.reduce((s, ch) => s + (skuChData[ch] || 0), 0)
                          return (
                            <tr key={sku} style={{ borderBottom: `1px solid ${C.border}`, background: '#F5F5F0' }}>
                              <td style={{ padding: '3px 5px 3px 36px', color: C.t3, fontSize: 10, fontFamily: 'var(--mono)' }}>└ {sku}</td>
                              {channels.map(ch => {
                                const v = skuChData[ch] || 0
                                const { cls, content } = renderCell(v, skuTotal)
                                return <td key={ch} className={cls} style={{ padding: '3px 5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 10 }}>{content}</td>
                              })}
                              <td style={{ padding: '3px 5px', textAlign: 'right', fontWeight: 500, color: C.t3, fontFamily: 'var(--mono)', fontSize: 10 }}>{fmt(skuTotal)}</td>
                            </tr>
                          )
                        })}
                      </Fragment>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="ins-box" style={{ marginTop: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#7A6000', whiteSpace: 'nowrap' }}>⚡ Gap analysis</span>
        <span style={{ fontSize: 11, color: C.t2 }}>— cells = zero revenue. Find high-performing categories missing on a channel.</span>
      </div>
    </Card>
  )
}

function AmazonCategoryMatrix({ channels, catChannel, subCatChannel, skuChannel, title }) {
  const [expanded, setExpanded] = useState({})
  const [expandedSC, setExpandedSC] = useState({})
  const [metric, setMetric] = useState('rev')
  const toggle = cat => setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }))
  const toggleSC = key => setExpandedSC(prev => ({ ...prev, [key]: !prev[key] }))

  const fmtVal = v => metric === 'rev' ? fmt(v) : fmtN(v)
  const getVal = obj => obj ? (metric === 'rev' ? obj.rev : metric === 'units' ? obj.units : obj.orders) : 0

  // Build sorted category list
  const cats = Object.entries(catChannel || {}).map(([cat, chData]) => {
    const total = channels.reduce((s, ch) => s + getVal(chData[ch]), 0)
    return { cat, chData, total }
  }).sort((a, b) => b.total - a.total)

  const colTotals = {}
  channels.forEach(ch => { colTotals[ch] = cats.reduce((s, r) => s + getVal(r.chData[ch]), 0) })
  const grandTotal = channels.reduce((s, ch) => s + (colTotals[ch] || 0), 0)

  const renderCell = (v, rowTotal) => {
    const intensity = rowTotal > 0 ? v / rowTotal : 0
    const share = rowTotal > 0 ? (v / rowTotal * 100).toFixed(0) : 0
    const cls = intensity === 0 ? 'h0' : intensity < 0.1 ? 'h1' : intensity < 0.3 ? 'h2' : intensity < 0.6 ? 'h3' : 'h4'
    return { cls, content: v > 0 ? <>{fmtVal(v)}<span style={{ fontSize: 9, fontWeight: 500, color: 'rgba(0,0,0,0.38)', marginLeft: 3 }}>{share}%</span></> : '—' }
  }

  const CH_COLORS = { FBA: '#E8930A', MFN: '#2E74CC', 'Seller Central': '#E8930A', 'Vendor Central': '#2E74CC' }

  return (
    <Card title={title || 'Category × Channel Revenue Matrix'} note="₹ shading = intensity" action={
      <div style={{ display: 'flex', gap: 3 }}>
        {[['rev','Revenue'],['units','Units'],['orders','Orders']].map(([k,l]) => (
          <button key={k} onClick={() => setMetric(k)} style={{ fontSize: 10, fontWeight: metric===k?700:500, padding: '2px 8px', borderRadius: 4, border: `1px solid ${metric===k?C.acm:C.border}`, background: metric===k?C.acc:'transparent', color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)' }}>{l}</button>
        ))}
      </div>
    }>
      <div className="tbl-wrap" style={{ maxHeight: 560, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 500, fontWeight: 400 }}>
          <thead style={{ position: 'sticky', top: 0, background: C.card, zIndex: 1 }}>
            <tr>
              <th style={{ textAlign: 'left', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, color: C.t3, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Category</th>
              {channels.map(ch => <th key={ch} style={{ textAlign: 'right', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, color: CH_COLORS[ch] || C.t2, fontSize: 10, fontWeight: 700 }}>{ch}</th>)}
              <th style={{ textAlign: 'right', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, color: C.t1, fontSize: 10, fontWeight: 700 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {cats.map((row, i) => {
              const isOpen = expanded[row.cat]
              const subCats = Object.entries(subCatChannel?.[row.cat] || {}).map(([sc, chData]) => ({
                sc, chData, total: channels.reduce((s, ch) => s + getVal(chData[ch]), 0)
              })).sort((a, b) => b.total - a.total)
              const hasSubCats = subCats.length > 0
              return (
                <Fragment key={row.cat}>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '5px', color: C.t1 }}>
                      <span onClick={() => hasSubCats && toggle(row.cat)} style={{ cursor: hasSubCats ? 'pointer' : 'default', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        {hasSubCats && <span style={{ fontSize: 9, color: C.t3, display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>▶</span>}
                        {row.cat}
                      </span>
                    </td>
                    {channels.map(ch => {
                      const v = getVal(row.chData[ch])
                      const { cls, content } = renderCell(v, row.total)
                      return <td key={ch} className={cls} style={{ padding: '5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 400 }}>{content}</td>
                    })}
                    <td style={{ padding: '5px', textAlign: 'right', fontWeight: 600, color: C.t1, fontFamily: 'var(--mono)', fontSize: 11 }}>{fmtVal(row.total)}</td>
                  </tr>
                  {isOpen && subCats.map(({ sc, chData, total: scTotal }) => {
                    const scKey = `${row.cat}::${sc}`
                    const skus = Object.entries(skuChannel?.[row.cat]?.[sc] || {}).map(([sku, chD]) => ({
                      sku, chD, total: channels.reduce((s, ch) => s + getVal(chD[ch]), 0)
                    })).sort((a, b) => b.total - a.total)
                    const hasSkus = skus.length > 0
                    const scOpen = expandedSC[scKey]
                    return (
                      <Fragment key={sc}>
                        <tr style={{ borderBottom: `1px solid ${C.border}`, background: '#FAFAF7' }}>
                          <td style={{ padding: '4px 5px 4px 20px', color: C.t2, fontSize: 10.5 }}>
                            <span onClick={() => hasSkus && toggleSC(scKey)} style={{ cursor: hasSkus ? 'pointer' : 'default', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              {hasSkus && <span style={{ fontSize: 8, color: C.t3, display: 'inline-block', transform: scOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>▶</span>}
                              └ {sc}
                            </span>
                          </td>
                          {channels.map(ch => {
                            const v = getVal(chData[ch])
                            const { cls, content } = renderCell(v, scTotal)
                            return <td key={ch} className={cls} style={{ padding: '4px 5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 400 }}>{content}</td>
                          })}
                          <td style={{ padding: '4px 5px', textAlign: 'right', fontWeight: 500, color: C.t2, fontFamily: 'var(--mono)', fontSize: 10.5 }}>{fmtVal(scTotal)}</td>
                        </tr>
                        {scOpen && skus.map(({ sku, chD, total: skuTotal }) => (
                          <tr key={sku} style={{ borderBottom: `1px solid ${C.border}`, background: '#F5F5F0' }}>
                            <td style={{ padding: '3px 5px 3px 36px', color: C.t3, fontSize: 10, fontFamily: 'var(--mono)' }}>└ {sku}</td>
                            {channels.map(ch => {
                              const v = getVal(chD[ch])
                              const { cls, content } = renderCell(v, skuTotal)
                              return <td key={ch} className={cls} style={{ padding: '3px 5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 400 }}>{content}</td>
                            })}
                            <td style={{ padding: '3px 5px', textAlign: 'right', fontWeight: 400, color: C.t3, fontFamily: 'var(--mono)', fontSize: 10 }}>{fmtVal(skuTotal)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${C.border}`, background: C.bg }}>
              <td style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, color: C.t1 }}>Total</td>
              {channels.map(ch => (
                <td key={ch} style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t1, borderLeft: `1px solid ${C.border}` }}>
                  {fmtVal(colTotals[ch])}
                  {metric === 'rev' && grandTotal ? <span style={{ fontSize: 10, fontWeight: 400, color: C.t3, marginLeft: 4 }}>{(colTotals[ch] / grandTotal * 100).toFixed(1)}%</span> : null}
                </td>
              ))}
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t1, borderLeft: `1px solid ${C.border}` }}>{fmtVal(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  )
}

// FinancialCategoryMatrix: Gross Rev, Units, ASP, GST, Cancel, RTO, CIR, Exch, Net Rev
function FinancialCategoryMatrix({ catData, subCatData, skuData, title, showReturns = true, neutral = false, showShare = false }) {
  const grossColor = neutral ? C.t1 : '#286010'
  const netColor = neutral ? C.t1 : '#2E74CC'
  const [expanded, setExpanded] = useState({})
  const [expandedSC, setExpandedSC] = useState({})
  const toggle = cat => setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }))
  const toggleSC = key => setExpandedSC(prev => ({ ...prev, [key]: !prev[key] }))

  const mapRow = (d) => ({
    gross: d.rev || 0,
    net: d.excRev || 0,
    gst: (d.rev || 0) - (d.excRev || 0),
    units: d.units || 0,
    orders: (d.orders?.size ?? d.orders) || 0,
    cancelled: d.cancelled || 0,
    rto: d.rto || 0,
    cir: d.cir || 0,
    exch: d.exch || 0,
  })

  const cats = Object.entries(catData || {}).map(([cat, d]) => ({ cat, ...mapRow(d) })).sort((a, b) => b.gross - a.gross)

  const tot = cats.reduce((s, r) => ({
    gross: s.gross + r.gross, net: s.net + r.net, gst: s.gst + r.gst,
    units: s.units + r.units, orders: s.orders + r.orders,
    cancelled: s.cancelled + r.cancelled, rto: s.rto + r.rto, cir: s.cir + r.cir, exch: s.exch + r.exch,
  }), { gross: 0, net: 0, gst: 0, units: 0, orders: 0, cancelled: 0, rto: 0, cir: 0, exch: 0 })

  const hasCancelData = cats.some(r => r.cancelled > 0 || r.rto > 0 || r.cir > 0 || r.exch > 0)

  const colHdr = { textAlign: 'right', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }
  const cell = (fs = 11) => ({ padding: '5px 5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: fs, fontWeight: 400 })
  const pctSpan = (n, d, warn = 15) => { if (!d || !n) return null; const p = (n / d * 100).toFixed(1); const col = parseFloat(p) > warn ? '#B91C1C' : C.t3; return <span style={{ fontSize: 9, color: col, marginLeft: 3 }}>{p}%</span> }

  return (
    <Card title={title || 'Category Revenue Matrix'} note="Gross = incl. GST · Net = excl. GST">
      <div className="tbl-wrap" style={{ maxHeight: 560, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontWeight: 400 }}>
          <thead style={{ position: 'sticky', top: 0, background: C.card, zIndex: 1 }}>
            <tr>
              <th style={{ textAlign: 'left', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, color: C.t3, fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase' }}>Category</th>
              <th style={{ ...colHdr, color: grossColor }}>Gross Rev{showShare ? ' / Share' : ''}</th>
              <th style={{ ...colHdr, color: C.t2 }}>Units</th>
              <th style={{ ...colHdr, color: C.t3 }}>ASP</th>
              <th style={{ ...colHdr, color: C.t2 }}>GST</th>
              {hasCancelData && <>
                <th style={{ ...colHdr, color: '#B91C1C' }}>Cancel</th>
                <th style={{ ...colHdr, color: '#E24B4A' }}>RTO</th>
                <th style={{ ...colHdr, color: '#2E74CC' }}>CIR</th>
                <th style={{ ...colHdr, color: '#9B59B6' }}>Exch</th>
                {showReturns && <th style={{ ...colHdr, color: '#7A1A1A' }}>Returns</th>}
              </>}
              <th style={{ ...colHdr, color: netColor }}>Net Rev</th>
            </tr>
          </thead>
          <tbody>
            {cats.map(row => {
              const isOpen = expanded[row.cat]
              const subCats = Object.entries(subCatData?.[row.cat] || {}).map(([sc, d]) => ({ sc, ...mapRow(d) })).sort((a, b) => b.gross - a.gross)
              const hasSubs = subCats.length > 0
              return (
                <Fragment key={row.cat}>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '5px', color: C.t1, fontSize: 11 }}>
                      <span onClick={() => hasSubs && toggle(row.cat)} style={{ cursor: hasSubs ? 'pointer' : 'default', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        {hasSubs && <span style={{ fontSize: 9, color: C.t3, display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>▶</span>}
                        {row.cat}
                      </span>
                    </td>
                    <td style={{ ...cell(), color: grossColor, fontWeight: 600 }}>{fmt(row.gross)}{showShare && tot.gross > 0 ? <span style={{ fontSize: 9.5, color: C.t3, marginLeft: 6, fontWeight: 400 }}>({(row.gross / tot.gross * 100).toFixed(1)}%)</span> : null}</td>
                    <td style={{ ...cell(), color: C.t2 }}>{fmtN(row.units)}</td>
                    <td style={{ ...cell(), color: C.t3 }}>₹{(row.units > 0 ? Math.round(row.gross / row.units) : 0).toLocaleString('en-IN')}</td>
                    <td style={{ ...cell(), color: C.t2 }}>{fmt(row.gst)}</td>
                    {hasCancelData && <>
                      <td style={{ ...cell(), color: '#B91C1C' }}>{row.cancelled > 0 ? <>{fmtN(row.cancelled)}{pctSpan(row.cancelled, row.orders)}</> : <span style={{ color: C.t3 }}>—</span>}</td>
                      <td style={{ ...cell(), color: '#E24B4A' }}>{row.rto > 0 ? <>{fmtN(row.rto)}{pctSpan(row.rto, row.orders)}</> : <span style={{ color: C.t3 }}>—</span>}</td>
                      <td style={{ ...cell(), color: '#2E74CC' }}>{row.cir > 0 ? <>{fmtN(row.cir)}{pctSpan(row.cir, row.orders)}</> : <span style={{ color: C.t3 }}>—</span>}</td>
                      <td style={{ ...cell(), color: '#9B59B6' }}>{row.exch > 0 ? <>{fmtN(row.exch)}{pctSpan(row.exch, row.orders)}</> : <span style={{ color: C.t3 }}>—</span>}</td>
                      {showReturns && <td style={{ ...cell(), color: '#7A1A1A', fontWeight: 600 }}>{(row.rto + row.cir) > 0 ? <>{fmtN(row.rto + row.cir)}{pctSpan(row.rto + row.cir, row.orders)}</> : <span style={{ color: C.t3 }}>—</span>}</td>}
                    </>}
                    <td style={{ ...cell(), color: netColor, fontWeight: 600 }}>{fmt(row.net)}</td>
                  </tr>
                  {isOpen && subCats.map(sr => {
                    const scKey = `${row.cat}::${sr.sc}`
                    const scOpen = expandedSC[scKey]
                    const skus = Object.entries(skuData?.[row.cat]?.[sr.sc] || {}).map(([sku, d]) => ({ sku, ...mapRow(d) })).sort((a, b) => b.gross - a.gross)
                    const hasSkus = skus.length > 0
                    return (
                      <Fragment key={sr.sc}>
                        <tr style={{ borderBottom: `1px solid ${C.border}`, background: '#FAFAF7' }}>
                          <td style={{ padding: '4px 5px 4px 20px', color: C.t2, fontSize: 10.5 }}>
                            <span onClick={() => hasSkus && toggleSC(scKey)} style={{ cursor: hasSkus ? 'pointer' : 'default', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              {hasSkus && <span style={{ fontSize: 8, color: C.t3, display: 'inline-block', transform: scOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>▶</span>}
                              └ {sr.sc}
                            </span>
                          </td>
                          <td style={{ ...cell(10.5), color: grossColor }}>{fmt(sr.gross)}{showShare && tot.gross > 0 ? <span style={{ fontSize: 9, color: C.t3, marginLeft: 5 }}>({(sr.gross / tot.gross * 100).toFixed(1)}%)</span> : null}</td>
                          <td style={{ ...cell(10.5), color: C.t2 }}>{fmtN(sr.units)}</td>
                          <td style={{ ...cell(10.5), color: C.t3 }}>₹{(sr.units > 0 ? Math.round(sr.gross / sr.units) : 0).toLocaleString('en-IN')}</td>
                          <td style={{ ...cell(10.5), color: C.t2 }}>{fmt(sr.gst)}</td>
                          {hasCancelData && <>
                            <td style={{ ...cell(10.5), color: '#B91C1C' }}>{sr.cancelled > 0 ? <>{fmtN(sr.cancelled)}{pctSpan(sr.cancelled, sr.orders)}</> : <span style={{ color: C.t3 }}>—</span>}</td>
                            <td style={{ ...cell(10.5), color: '#E24B4A' }}>{sr.rto > 0 ? <>{fmtN(sr.rto)}{pctSpan(sr.rto, sr.orders)}</> : <span style={{ color: C.t3 }}>—</span>}</td>
                            <td style={{ ...cell(10.5), color: '#2E74CC' }}>{sr.cir > 0 ? <>{fmtN(sr.cir)}{pctSpan(sr.cir, sr.orders)}</> : <span style={{ color: C.t3 }}>—</span>}</td>
                            <td style={{ ...cell(10.5), color: '#9B59B6' }}>{sr.exch > 0 ? <>{fmtN(sr.exch)}{pctSpan(sr.exch, sr.orders)}</> : <span style={{ color: C.t3 }}>—</span>}</td>
                            {showReturns && <td style={{ ...cell(10.5), color: '#7A1A1A', fontWeight: 600 }}>{(sr.rto + sr.cir) > 0 ? <>{fmtN(sr.rto + sr.cir)}{pctSpan(sr.rto + sr.cir, sr.orders)}</> : <span style={{ color: C.t3 }}>—</span>}</td>}
                          </>}
                          <td style={{ ...cell(10.5), color: netColor }}>{fmt(sr.net)}</td>
                        </tr>
                        {scOpen && skus.map(sk => (
                          <tr key={sk.sku} style={{ borderBottom: `1px solid ${C.border}`, background: '#F5F5F0' }}>
                            <td style={{ padding: '3px 5px 3px 36px', color: C.t3, fontSize: 10, fontFamily: 'var(--mono)' }}>└ {sk.sku}</td>
                            <td style={{ ...cell(10), color: grossColor }}>{fmt(sk.gross)}{showShare && tot.gross > 0 ? <span style={{ fontSize: 8.5, color: C.t3, marginLeft: 5 }}>({(sk.gross / tot.gross * 100).toFixed(1)}%)</span> : null}</td>
                            <td style={{ ...cell(10), color: C.t2 }}>{fmtN(sk.units)}</td>
                            <td style={{ ...cell(10), color: C.t3 }}>₹{(sk.units > 0 ? Math.round(sk.gross / sk.units) : 0).toLocaleString('en-IN')}</td>
                            <td style={{ ...cell(10), color: C.t2 }}>{fmt(sk.gst)}</td>
                            {hasCancelData && <>
                              <td style={{ ...cell(10), color: '#B91C1C' }}>{sk.cancelled > 0 ? <>{fmtN(sk.cancelled)}{pctSpan(sk.cancelled, sk.orders)}</> : <span style={{ color: C.t3 }}>—</span>}</td>
                              <td style={{ ...cell(10), color: '#E24B4A' }}>{sk.rto > 0 ? <>{fmtN(sk.rto)}{pctSpan(sk.rto, sk.orders)}</> : <span style={{ color: C.t3 }}>—</span>}</td>
                              <td style={{ ...cell(10), color: '#2E74CC' }}>{sk.cir > 0 ? <>{fmtN(sk.cir)}{pctSpan(sk.cir, sk.orders)}</> : <span style={{ color: C.t3 }}>—</span>}</td>
                              <td style={{ ...cell(10), color: '#9B59B6' }}>{sk.exch > 0 ? <>{fmtN(sk.exch)}{pctSpan(sk.exch, sk.orders)}</> : <span style={{ color: C.t3 }}>—</span>}</td>
                              {showReturns && <td style={{ ...cell(10), color: '#7A1A1A', fontWeight: 600 }}>{(sk.rto + sk.cir) > 0 ? <>{fmtN(sk.rto + sk.cir)}{pctSpan(sk.rto + sk.cir, sk.orders)}</> : <span style={{ color: C.t3 }}>—</span>}</td>}
                            </>}
                            <td style={{ ...cell(10), color: netColor }}>{fmt(sk.net)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${C.border}`, background: C.bg }}>
              <td style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, color: C.t1 }}>Total</td>
              <td style={{ padding: '5px 5px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5, color: grossColor }}>{fmt(tot.gross)}{showShare ? <span style={{ fontSize: 9.5, color: C.t3, marginLeft: 6, fontWeight: 400 }}>(100%)</span> : null}</td>
              <td style={{ padding: '5px 5px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t2 }}>{fmtN(tot.units)}</td>
              <td style={{ padding: '5px 5px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t3 }}>₹{tot.units > 0 ? Math.round(tot.gross / tot.units).toLocaleString('en-IN') : '—'}</td>
              <td style={{ padding: '5px 5px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t2 }}>{fmt(tot.gst)}</td>
              {hasCancelData && <>
                <td style={{ padding: '5px 5px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5, color: '#B91C1C' }}>{fmtN(tot.cancelled)}{pctSpan(tot.cancelled, tot.orders)}</td>
                <td style={{ padding: '5px 5px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5, color: '#E24B4A' }}>{fmtN(tot.rto)}{pctSpan(tot.rto, tot.orders)}</td>
                <td style={{ padding: '5px 5px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5, color: '#2E74CC' }}>{fmtN(tot.cir)}{pctSpan(tot.cir, tot.orders)}</td>
                <td style={{ padding: '5px 5px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5, color: '#9B59B6' }}>{fmtN(tot.exch)}{pctSpan(tot.exch, tot.orders)}</td>
                {showReturns && <td style={{ padding: '5px 5px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5, color: '#7A1A1A' }}>{fmtN(tot.rto + tot.cir)}{pctSpan(tot.rto + tot.cir, tot.orders)}</td>}
              </>}
              <td style={{ padding: '5px 5px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5, color: netColor }}>{fmt(tot.net)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  )
}

function VCCategoryMatrix({ catData, subCatData, skuData, title }) {
  const [expanded, setExpanded] = useState({})
  const [expandedSC, setExpandedSC] = useState({})
  const toggle = cat => setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }))
  const toggleSC = key => setExpandedSC(prev => ({ ...prev, [key]: !prev[key] }))

  const cats = Object.entries(catData || {}).map(([cat, d]) => ({ cat, d, total: d.rev || 0 })).sort((a, b) => b.total - a.total)
  const totUnits = cats.reduce((s, r) => s + (r.d.units || 0), 0)
  const totRev = cats.reduce((s, r) => s + (r.d.rev || 0), 0)

  const intensity = (v, tot) => { if (!tot || !v) return 'h0'; const r = v / tot; return r < 0.1 ? 'h1' : r < 0.3 ? 'h2' : r < 0.6 ? 'h3' : 'h4' }

  return (
    <Card title={title || 'Category Revenue Matrix · Vendor Central'}>
      <div className="tbl-wrap" style={{ maxHeight: 560, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontWeight: 400 }}>
          <thead style={{ position: 'sticky', top: 0, background: C.card, zIndex: 1 }}>
            <tr>
              <th style={{ textAlign: 'left', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, color: C.t3, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Category</th>
              <th style={{ textAlign: 'right', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, color: '#2E74CC', fontSize: 10, fontWeight: 700 }}>Ordered Qty</th>
              <th style={{ textAlign: 'right', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}`, color: '#2E74CC', fontSize: 10, fontWeight: 700 }}>Ordered Rev</th>
            </tr>
          </thead>
          <tbody>
            {cats.map(({ cat, d }) => {
              const isOpen = expanded[cat]
              const scs = Object.entries(subCatData?.[cat] || {}).map(([sc, sd]) => ({ sc, sd })).sort((a, b) => (b.sd.rev||0) - (a.sd.rev||0))
              const hasSC = scs.length > 0
              return (
                <Fragment key={cat}>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '5px', color: C.t1 }}>
                      <span onClick={() => hasSC && toggle(cat)} style={{ cursor: hasSC ? 'pointer' : 'default', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        {hasSC && <span style={{ fontSize: 9, color: C.t3, display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>▶</span>}
                        {cat}
                      </span>
                    </td>
                    <td className={intensity(d.units, totUnits)} style={{ padding: '5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 400 }}>{d.units > 0 ? fmtN(d.units) : '—'}</td>
                    <td className={intensity(d.rev, totRev)} style={{ padding: '5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 400 }}>{d.rev > 0 ? fmt(d.rev) : '—'}</td>
                  </tr>
                  {isOpen && scs.map(({ sc, sd }) => {
                    const scKey = `${cat}::${sc}`
                    const skus = Object.entries(skuData?.[cat]?.[sc] || {}).map(([sku, kd]) => ({ sku, kd })).sort((a, b) => (b.kd.rev||0) - (a.kd.rev||0))
                    const hasSkus = skus.length > 0
                    const scOpen = expandedSC[scKey]
                    return (
                      <Fragment key={sc}>
                        <tr style={{ borderBottom: `1px solid ${C.border}`, background: '#FAFAF7' }}>
                          <td style={{ padding: '4px 5px 4px 20px', color: C.t2, fontSize: 10.5 }}>
                            <span onClick={() => hasSkus && toggleSC(scKey)} style={{ cursor: hasSkus ? 'pointer' : 'default', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              {hasSkus && <span style={{ fontSize: 8, color: C.t3, display: 'inline-block', transform: scOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>▶</span>}
                              └ {sc}
                            </span>
                          </td>
                          <td style={{ padding: '4px 5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 400 }}>{sd.units > 0 ? fmtN(sd.units) : '—'}</td>
                          <td style={{ padding: '4px 5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 400 }}>{sd.rev > 0 ? fmt(sd.rev) : '—'}</td>
                        </tr>
                        {scOpen && skus.map(({ sku, kd }) => (
                          <tr key={sku} style={{ borderBottom: `1px solid ${C.border}`, background: '#F5F5F0' }}>
                            <td style={{ padding: '3px 5px 3px 36px', color: C.t3, fontSize: 10, fontFamily: 'var(--mono)' }}>└ {sku}</td>
                            <td style={{ padding: '3px 5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 400 }}>{kd.units > 0 ? fmtN(kd.units) : '—'}</td>
                            <td style={{ padding: '3px 5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 400 }}>{kd.rev > 0 ? fmt(kd.rev) : '—'}</td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${C.border}`, background: C.bg }}>
              <td style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, color: C.t1 }}>Total</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t1, borderLeft: `1px solid ${C.border}` }}>{fmtN(totUnits)}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t1, borderLeft: `1px solid ${C.border}` }}>{fmt(totRev)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  )
}

const REGION_COLORS = ['#534AB7','#0D9E68','#E8930A','#CC4078','#2E74CC','#CC8A00']
const TIER_COLORS = ['#FFD600','#7AB4EE','#9DD470']

function RegionTierDonutRow({ regionRows, tierRows }) {
  const [regionMetric, setRegionMetric] = useState('rev')
  const [tierMetric, setTierMetric] = useState('rev')

  const metricVal = (r, m) => m === 'rev' ? r.rev : m === 'orders' ? r.orders : m === 'units' ? r.units : (r.orders ? Math.round(r.rev / r.orders) : 0)
  const fmtK = v => v >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : fmtN(v)
  const metricFmt = (v, m) => m === 'aov' ? `₹${v.toLocaleString('en-IN')}` : m === 'rev' ? fmt(v) : fmtK(v)

  const selStyle = active => ({ fontSize: 11, fontWeight: active ? 700 : 500, padding: '3px 9px', borderRadius: 5, border: `1px solid ${active ? C.acm : C.border}`, background: active ? C.acc : 'transparent', color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)' })

  const regionData = regionRows.map((r, i) => ({ name: r.region, value: metricVal(r, regionMetric), color: REGION_COLORS[i % REGION_COLORS.length], raw: r }))
  const TIER_NAMES = { '1': 'Tier I', '2': 'Tier II', '3': 'Tier III', 'I': 'Tier I', 'II': 'Tier II', 'III': 'Tier III' }
  const tierData = tierRows.map((r, i) => {
    const key = String(r.tier).replace(/^tier\s*/i, '').trim()
    const name = TIER_NAMES[key] || r.label || `Tier ${key}`
    return { name, value: metricVal(r, tierMetric), color: TIER_COLORS[i % TIER_COLORS.length], raw: r }
  })

  const DonutCard = ({ title, data, metric, setMetric }) => {
    const total = data.reduce((s, d) => s + d.value, 0)
    return (
      <Card title={title} action={
        <div style={{ display: 'flex', gap: 3 }}>
          {[['rev','Revenue'],['orders','Orders'],['units','Units'],['aov','AOV']].map(([k,l]) => (
            <button key={k} onClick={() => setMetric(k)} style={selStyle(metric === k)}>{l}</button>
          ))}
        </div>
      }>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <ResponsiveContainer width={180} height={180}>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={52} outerRadius={80} dataKey="value" paddingAngle={2}>
                {data.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px', fontSize: 12, color: '#111', fontWeight: 600 }}>{payload[0].name} : {metricFmt(payload[0].value, metric)}</div> : null} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: C.t2, flex: 1 }}>{d.name}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.t1, fontFamily: 'var(--mono)' }}>{metricFmt(d.value, metric)}</span>
                <span style={{ fontSize: 11, color: C.t3, minWidth: 36, textAlign: 'right' }}>{total ? (d.value / total * 100).toFixed(1) : 0}%</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="g-2" style={{ alignItems: 'stretch' }}>
      {regionRows.length > 0 && <DonutCard title="Revenue by Region" data={regionData} metric={regionMetric} setMetric={setRegionMetric} />}
      {tierRows.length > 0 && <DonutCard title="City Tier Breakdown" data={tierData} metric={tierMetric} setMetric={setTierMetric} />}
    </div>
  )
}

function AllTab({ data }) {
  const { totalRev, totalExcRev, gstCollected, nOrders, totalQty, blendedAOV, nDays, dailyArr, chMap, catMap, subCatMap, stateMap, cityRows = [], regionRows = [], tierRows = [], buckets, bucketRev, rows, orders, orderStatusRevMap = {}, orderStatusMap = {}, catChannelMap = {}, subCatChannelMap: serverSubCatChannelMap = {}, skuRows: allSkuRows = [], prevRev = 0, prevExcRev = 0, prevOrders = 0, prevQty = 0, prevDailyArr = [], prevChMap = {}, nCusts = 0, repeatCusts = 0, rtoRev = 0, cirRev = 0, cancellRev = 0, netRevenueCalc = 0, momRev = 0, yoyRev = 0, momPeriod = '', yoyPeriod = '', prevRtoOrders = 0, prevCirOrders = 0 } = data
  const channels = Object.keys(C.ch).filter(ch => chMap[ch] && chMap[ch].rev > 0)
  const sortedCh = Object.entries(chMap).filter(([, v]) => v.rev > 0).sort((a, b) => b[1].rev - a[1].rev)
  const maxChRev = sortedCh[0]?.[1].rev || 1
  const [selectedCat, setSelectedCat] = useState(null)
  const [catView, setCatView] = useState('table')
  const [subCatView, setSubCatView] = useState('table')
  const catRows = Object.entries(catMap).map(([k, v]) => { const orders = v.orders?.size ?? v.orders ?? 0; return { name: k, rev: v.rev, excRev: v.excRev || 0, orders, units: v.units || 0, aov: orders ? v.rev / orders : 0, asp: (v.units || 0) ? v.rev / v.units : 0 } }).sort((a, b) => b.rev - a.rev)
  const allSubCatRows = Object.entries(subCatMap).map(([k, v]) => { const orders = v.orders?.size ?? v.orders ?? 0; return { name: k.split('::')[1] || k, category: k.split('::')[0] || '', rev: v.rev, orders, units: v.units || 0, aov: orders ? v.rev / orders : 0, asp: (v.units || 0) ? v.rev / v.units : 0 } }).sort((a, b) => b.rev - a.rev)
  const subCatRows = selectedCat ? allSubCatRows.filter(r => r.category === selectedCat) : allSubCatRows
  const stateRows = Object.entries(stateMap).map(([k, v]) => ({ state: k, rev: v.rev, orders: v.orders, aov: v.orders ? v.rev / v.orders : 0, cities: v.cities.size })).sort((a, b) => b.rev - a.rev)
  const bucketData = Object.entries(buckets).map(([k, v]) => ({ name: k, orders: v, rev: bucketRev[k] }))
  const allCats = catRows.slice(0, 8).map(r => r.name)
  const heatData = allCats.map(cat => {
    const row = { cat }
    channels.forEach(ch => { row[ch] = catChannelMap[cat]?.[ch] || 0 })
    return row
  })
  const maxHeat = Math.max(...heatData.flatMap(r => channels.map(ch => r[ch] || 0)), 1)
  const subCatChannelMap = serverSubCatChannelMap
  const skuChannelMap = {}
  allSkuRows.forEach(x => {
    const cat = x.category || 'Unknown'
    const sc = x.subCategory || 'Unknown'
    const sku = x.sku
    const ch = x.channel
    if (!sku || !ch) return
    if (!skuChannelMap[cat]) skuChannelMap[cat] = {}
    if (!skuChannelMap[cat][sc]) skuChannelMap[cat][sc] = {}
    if (!skuChannelMap[cat][sc][sku]) skuChannelMap[cat][sc][sku] = {}
    skuChannelMap[cat][sc][sku][ch] = (skuChannelMap[cat][sc][sku][ch] || 0) + x.rev
  })

  const grossMarginPct = totalRev > 0 ? ((totalRev - totalExcRev) / totalRev * 100) : 0
  const revPerUnit = totalQty > 0 ? totalExcRev / totalQty : 0
  const shopifyOrders = orders.filter(o => o.channel === 'Shopify')
  const atRiskRev = (orderStatusRevMap['RTO'] || 0) + (orderStatusRevMap['Cancelled'] || 0) + (cirRev || 0)
  const deliveredCount = orders.filter(o => o.orderStatus === 'Delivered').length
  const rtoCount = orders.filter(o => o.orderStatus === 'RTO' || o.isRTO).length
  const cancelCount = orders.filter(o => o.orderStatus === 'Cancelled' || o.isCancelled).length
  const fulfilmentBase = deliveredCount + rtoCount + cancelCount
  const fulfilmentRate = fulfilmentBase > 0 ? (deliveredCount / fulfilmentBase * 100) : 0
  const unitsPerOrder = nOrders > 0 ? totalQty / nOrders : 0
  const rtoOrders = orderStatusMap['RTO'] || 0
  const cirOrderCount = orders.filter(o => o.isCIR).length
  const returnPct = nOrders > 0 ? ((rtoOrders + cirOrderCount) / nOrders * 100) : 0
  const asp = totalQty > 0 ? totalExcRev / totalQty : 0
  const deliveredOrders = orderStatusMap['Delivered'] || 0
  const fulfilmentPct = nOrders > 0 ? (deliveredOrders / nOrders * 100) : 0

  // prev period derived values
  const prevAOV = prevOrders > 0 ? prevRev / prevOrders : 0
  const prevDailyAvg = prevRev > 0 ? prevRev / nDays : 0
  const prevASP = prevQty > 0 ? prevExcRev / prevQty : 0
  const prevGST = prevRev - prevExcRev
  const prevUPO = prevOrders > 0 && prevQty > 0 ? prevQty / prevOrders : 0
  const prevAtRisk = 0 // not tracked in prev period
  const chgBadge = (cur, prev) => {
    if (!prev || Math.abs(prev) < 1) return null
    const pct = (cur - prev) / prev * 100
    if (Math.abs(pct) > 999) return null
    return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: pct >= 0 ? C.green.bg : C.red.bg, color: pct >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%</span>
  }

  const revChg = prevRev > 0 ? ((totalRev - prevRev) / prevRev * 100) : null
  const ordChg = prevOrders > 0 ? ((nOrders - prevOrders) / prevOrders * 100) : null
  // Sparkline: normalise both periods to index 0..n-1 for comparison
  const sparkData = Array.from({ length: Math.max(dailyArr.length, prevDailyArr.length) }, (_, i) => {
    const cur = dailyArr[i]
    const pre = prevDailyArr[i]
    const curRev = cur ? Object.entries(cur).filter(([k]) => k !== 'date' && !k.endsWith('_o')).reduce((s, [, v]) => s + (v || 0), 0) : null
    return { i, cur: curRev, prev: pre?.rev ?? null }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
        {/* Gross Revenue hero — tall left column */}
        <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
          <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue · Inc. GST</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(totalRev)}</div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              {revChg !== null && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: revChg >= 0 ? C.green.bg : C.red.bg, color: revChg >= 0 ? C.green.tx : C.red.tx }}>{revChg >= 0 ? '▲' : '▼'} {Math.abs(revChg).toFixed(1)}% <span style={{ fontWeight: 400, opacity: 0.7 }}>WoW</span></span>}
              {momRev > 0 && (() => { const p = (totalRev - momRev) / momRev * 100; return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}% <span style={{ fontWeight: 400, opacity: 0.7 }}>MoM</span></span> })()}
              {yoyRev > 0 && (() => { const p = (totalRev - yoyRev) / yoyRev * 100; return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}% <span style={{ fontWeight: 400, opacity: 0.7 }}>YoY</span></span> })()}
            </div>
          </div>
          <div className="kpi-sub" style={{ fontSize: 13 }}>{nOrders >= 1000 ? (nOrders/1000).toFixed(1).replace(/\.0$/,'')+'k' : fmtN(nOrders)} orders · {totalQty >= 1000 ? (totalQty/1000).toFixed(1).replace(/\.0$/,'')+'k' : fmtN(totalQty)} units</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs><linearGradient id="curGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.acc} stopOpacity={0.25} /><stop offset="95%" stopColor={C.acc} stopOpacity={0} /></linearGradient></defs>
                <Area type="monotone" dataKey="cur" name="Current" stroke={C.acc} strokeWidth={2} fill="url(#curGrad)" dot={false} connectNulls />
                <Area type="monotone" dataKey="prev" name="Prev" stroke={C.t3} strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ color: p.name === 'Current' ? C.t1 : C.t3 }}>{p.name}: {fmt(p.value)}</div>)}</div> : null} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        {/* Right: 2 rows of 5 KPIs each */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Row 1 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, flex: 1 }}>
            {(() => {
              const excChg = prevExcRev > 0 ? ((totalExcRev - prevExcRev) / prevExcRev * 100) : null
              return (
                <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 13px' }}>
                  <div className="kpi-label">Net (Exc GST)</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div className="kpi-value">{fmt(totalExcRev)}</div>
                    {excChg !== null && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: excChg >= 0 ? C.green.bg : C.red.bg, color: excChg >= 0 ? C.green.tx : C.red.tx }}>{excChg >= 0 ? '▲' : '▼'} {Math.abs(excChg).toFixed(1)}%</span>}
                  </div>
                  <div className="kpi-sub">{totalRev > 0 ? (totalExcRev / totalRev * 100).toFixed(1) : 0}% of gross · GST {fmt(gstCollected)}</div>
                </div>
              )
            })()}
            {[
              { label: 'Return %', value: `${returnPct.toFixed(1)}%`, sub: `${fmtN(rtoOrders)} RTO · ${fmtN(cirOrderCount)} CIR`, accent: returnPct > 10 ? '#7A1A1A' : undefined, badge: (() => { if (!prevOrders) return null; const prev = (prevRtoOrders + prevCirOrders) / prevOrders * 100; if (!prev) return null; const p = (returnPct - prev) / prev * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.red.bg : C.green.bg, color: p >= 0 ? C.red.tx : C.green.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> })() },
              { label: 'AOV', value: `₹${Math.round(blendedAOV).toLocaleString('en-IN')}`, sub: `Gross rev ÷ orders`, badge: chgBadge(blendedAOV, prevAOV) },
              { label: 'Daily Avg', value: fmt(totalRev / nDays), sub: `over ${nDays} days`, badge: chgBadge(totalRev / nDays, prevDailyAvg) },
            ].map(k => (
              <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
                <div className="kpi-label">{k.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <div className="kpi-value" style={{ fontSize: 17, ...(k.accent ? { color: k.accent } : {}) }}>{k.value}</div>
                  {k.badge}
                </div>
                {k.sub && <div className="kpi-sub">{k.sub}</div>}
              </div>
            ))}
          </div>
          {/* Row 2 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, flex: 1 }}>
            {[
              { label: 'ASP', value: `₹${Math.round(asp).toLocaleString('en-IN')}`, sub: 'Net rev ÷ units sold', badge: chgBadge(asp, prevASP) },
              { label: 'GST Collected', value: fmt(gstCollected), sub: `${totalRev > 0 ? ((gstCollected / totalRev) * 100).toFixed(1) : 0}% of gross rev`, badge: chgBadge(gstCollected, prevGST) },
              { label: 'Revenue at Risk', value: fmt(atRiskRev), sub: `${totalRev > 0 ? (atRiskRev / totalRev * 100).toFixed(1) : 0}% of gross · RTO + Cancel + CIR`, accent: atRiskRev > 0 ? '#7A4000' : undefined, badge: (() => { const prevAtRiskEst = prevOrders > 0 ? (prevRtoOrders + prevCirOrders) / prevOrders * prevRev : 0; if (!prevAtRiskEst) return null; const p = (atRiskRev - prevAtRiskEst) / prevAtRiskEst * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p > 0 ? C.red.bg : C.green.bg, color: p > 0 ? C.red.tx : C.green.tx, flexShrink: 0 }}>{p > 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> })() },
              { label: 'Units per Order', value: unitsPerOrder.toFixed(2), sub: 'Avg basket size', badge: chgBadge(unitsPerOrder, prevUPO) },
            ].map(k => (
              <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
                <div className="kpi-label">{k.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <div className="kpi-value" style={{ fontSize: 17, ...(k.accent ? { color: k.accent } : {}) }}>{k.value}</div>
                  {k.badge}
                </div>
                {k.sub && <div className="kpi-sub">{k.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="g-21">
        <ChannelTrendCard dailyArr={dailyArr} channels={channels} />
        <Card title="Channel Share">
          {sortedCh.map(([ch, v]) => {
            const prevChRev = prevChMap[ch] || 0
            const chg = prevChRev > 1 ? ((v.rev - prevChRev) / prevChRev * 100) : null
            return (
              <div key={ch} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.ch[ch] || C.acm, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: C.t2, width: 90, flexShrink: 0 }}>{ch}</span>
                <div style={{ flex: 1, height: 5, background: C.bg, borderRadius: 3 }}>
                  <div style={{ height: '100%', borderRadius: 3, background: C.ch[ch] || C.acm, width: `${(v.rev / maxChRev) * 100}%`, transition: 'width .5s' }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.t1, minWidth: 72, textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(v.rev)}</span>
                <span style={{ fontSize: 11, color: C.t3, minWidth: 36, textAlign: 'right' }}>{pct(v.rev, totalRev)}</span>
                {chg !== null
                  ? <span style={{ fontSize: 10.5, fontWeight: 700, width: 76, flexShrink: 0, textAlign: 'center', padding: '2px 0', borderRadius: 4, background: chg >= 0 ? '#E6F4E0' : '#FDE8E8', color: chg >= 0 ? '#286010' : '#7A1A1A', display: 'inline-block' }}>{chg >= 0 ? '▲' : '▼'} {Math.abs(chg).toFixed(1)}%</span>
                  : <span style={{ width: 76, flexShrink: 0 }} />}
              </div>
            )
          })}
        </Card>
      </div>
      {(regionRows.length > 0 || tierRows.length > 0) && (
        <RegionTierDonutRow regionRows={regionRows} tierRows={tierRows} />
      )}
      <DailyChannelTable dailyArr={dailyArr} channels={channels} nDays={nDays} />
      <CategoryChannelMatrix heatData={heatData} channels={channels} maxHeat={maxHeat} subCatChannelMap={subCatChannelMap} skuChannelMap={skuChannelMap} />
      <div className="g-2" style={{ alignItems: 'stretch' }}>
        {(() => {
          const colorOf = () => '#FFD600'
          const btnStyle = v => ({ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${catView === v ? C.t1 : C.border}`, background: catView === v ? C.t1 : 'transparent', color: catView === v ? '#fff' : C.t2, cursor: 'pointer', fontFamily: 'var(--font)' })
          const FIXED_H = 420
          return (
            <Card title="Category Revenue" note={selectedCat ? <span style={{ cursor: 'pointer', color: C.acc, fontWeight: 600 }} onClick={() => setSelectedCat(null)}>✕ Clear</span> : `${catRows.length} total`}
              action={<div style={{ display: 'flex', gap: 4 }}>
                <button style={btnStyle('table')} onClick={() => setCatView('table')}>Table</button>
                <button style={btnStyle('bar')} onClick={() => setCatView('bar')}>Bar</button>
              </div>}>
              {catView === 'table' && (() => {
                const totalCatRev = catRows.reduce((s, r) => s + r.rev, 0)
                return (
                  <div style={{ overflowY: 'auto', maxHeight: FIXED_H }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead style={{ position: 'sticky', top: 0, background: C.card, zIndex: 1 }}><tr>{[{ label: 'Category' }, { label: 'Revenue / % Share', align: 'right' }, { label: 'Units Sold', align: 'right' }, { label: 'ASP', align: 'right' }].map(c => <th key={c.label} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, textAlign: c.align || 'left', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}` }}>{c.label}</th>)}</tr></thead>
                      <tbody>{catRows.map((r, i) => { const isSelected = selectedCat === r.name; const share = totalCatRev ? (r.rev / totalCatRev * 100).toFixed(1) + '%' : '—'; return <tr key={r.name} onClick={() => setSelectedCat(isSelected ? null : r.name)} style={{ borderBottom: i < catRows.length - 1 ? `1px solid ${C.border}` : 'none', background: isSelected ? C.acl : '', cursor: 'pointer' }} onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#FFFBE6' }} onMouseLeave={e => { e.currentTarget.style.background = isSelected ? C.acl : '' }}><td style={{ padding: '5.5px 5px', color: C.t2 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: colorOf(r.name), marginRight: 6 }} />{isSelected ? <strong>{r.name}</strong> : r.name}</td><td style={{ padding: '5.5px 5px', textAlign: 'right' }}><span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t1 }}>{fmt(r.rev)}</span><span style={{ fontSize: 10, color: C.t3, marginLeft: 5 }}>({share})</span></td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>{fmtN(r.units)}</td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>₹{Math.round(r.asp).toLocaleString('en-IN')}</td></tr> })}</tbody>
                    </table>
                  </div>
                )
              })()}
              {catView === 'bar' && (
                <ResponsiveContainer width="100%" height={FIXED_H}>
                  <BarChart data={catRows} layout="vertical" margin={{ top: 0, right: 60, bottom: 0, left: 100 }}>
                    <XAxis type="number" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => v >= 1e7 ? `${(v/1e7).toFixed(1)}Cr` : v >= 1e5 ? `${(v/1e5).toFixed(0)}L` : fmt(v)} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: C.t2 }} width={95} />
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                    <Tooltip formatter={v => fmt(v)} />
                    <Bar dataKey="rev" name="Revenue" radius={[0,4,4,0]} onClick={r => setSelectedCat(selectedCat === r.name ? null : r.name)}>
                      {catRows.map((r) => <Cell key={r.name} fill={colorOf(r.name)} opacity={selectedCat && selectedCat !== r.name ? 0.35 : 1} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          )
        })()}
        {(() => {
          const scColorOf = () => '#FFD600'
          const btnStyle = v => ({ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${subCatView === v ? C.t1 : C.border}`, background: subCatView === v ? C.t1 : 'transparent', color: subCatView === v ? '#fff' : C.t2, cursor: 'pointer', fontFamily: 'var(--font)' })
          const FIXED_H = 420
          return (
            <Card title={selectedCat ? `Sub-categories · ${selectedCat}` : 'Sub-categories'} note={`${subCatRows.length} total`}
              action={<div style={{ display: 'flex', gap: 4 }}>
                <button style={btnStyle('table')} onClick={() => setSubCatView('table')}>Table</button>
                <button style={btnStyle('bar')} onClick={() => setSubCatView('bar')}>Bar</button>
              </div>}>
              {subCatView === 'table' && (() => {
                const totalSubRev = subCatRows.reduce((s, r) => s + r.rev, 0)
                return (
                  <div style={{ overflowY: 'auto', maxHeight: FIXED_H }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead style={{ position: 'sticky', top: 0, background: C.card, zIndex: 1 }}><tr>{[{ label: 'Sub-category' }, { label: 'Revenue / % Share', align: 'right' }, { label: 'Units Sold', align: 'right' }, { label: 'ASP', align: 'right' }].map(c => <th key={c.label} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, textAlign: c.align || 'left', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}` }}>{c.label}</th>)}</tr></thead>
                      <tbody>{subCatRows.map((r, i) => { const share = totalSubRev ? (r.rev / totalSubRev * 100).toFixed(1) + '%' : '—'; return <tr key={r.name} style={{ borderBottom: i < subCatRows.length - 1 ? `1px solid ${C.border}` : 'none' }} onMouseEnter={e => e.currentTarget.style.background = '#FFFBE6'} onMouseLeave={e => e.currentTarget.style.background = ''}><td style={{ padding: '5.5px 5px', color: C.t2 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: scColorOf(r.name, i), marginRight: 6 }} />{r.name}</td><td style={{ padding: '5.5px 5px', textAlign: 'right' }}><span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t1 }}>{fmt(r.rev)}</span><span style={{ fontSize: 10, color: C.t3, marginLeft: 5 }}>({share})</span></td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>{fmtN(r.units)}</td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>₹{Math.round(r.asp).toLocaleString('en-IN')}</td></tr> })}</tbody>
                    </table>
                  </div>
                )
              })()}
              {subCatView === 'bar' && (
                <div style={{ overflowY: 'auto', maxHeight: FIXED_H }}>
                  <ResponsiveContainer width="100%" height={Math.max(FIXED_H, subCatRows.length * 26)}>
                    <BarChart data={subCatRows} layout="vertical" margin={{ top: 0, right: 60, bottom: 0, left: 140 }}>
                      <XAxis type="number" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => v >= 1e7 ? `${(v/1e7).toFixed(1)}Cr` : v >= 1e5 ? `${(v/1e5).toFixed(0)}L` : fmt(v)} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: C.t2 }} width={135} />
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                      <Tooltip formatter={v => fmt(v)} />
                      <Bar dataKey="rev" name="Revenue" radius={[0,4,4,0]}>{subCatRows.map((r, i) => <Cell key={r.name} fill={scColorOf(r.name, i)} />)}</Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          )
        })()}
      </div>
      <div className="g-2" style={{ alignItems: 'stretch' }}>
        <PaginatedCard title="Top States" rows={stateRows} columns={[{ key: 'state', label: 'State', render: v => v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : v }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'aov', label: 'ASP', align: 'right', render: v => `₹${Math.round(v).toLocaleString('en-IN')}` }, { key: 'cities', label: 'Cities' }]} pageSize={15} />
        <PaginatedCard title="Top Cities" rows={cityRows} columns={[{ key: 'city', label: 'City', render: v => v ? v.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : v }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'aov', label: 'AOV', align: 'right', render: (_, r) => `₹${r.orders ? Math.round(r.rev / r.orders).toLocaleString('en-IN') : 0}` }]} pageSize={15} />
      </div>
    </div>
  )
}

const PIE_COLORS = ['#534AB7','#0D9E68','#2E74CC','#CC8A00','#CC4078','#E24B4A','#9B59B6']
const BUCKET_ORDER = ['<₹500','₹500-1K','₹1K-2.5K','₹2.5K-5K','₹5K-10K','₹10K-25K','₹25K+']

function OrderValuePieCard({ buckets, bucketRev }) {
  const [metric, setMetric] = useState('orders')
  const data = BUCKET_ORDER.filter(k => buckets[k] !== undefined).map((k, i) => ({
    name: k,
    value: metric === 'orders' ? (buckets[k] || 0) : (bucketRev[k] || 0),
    color: PIE_COLORS[i % PIE_COLORS.length]
  })).filter(d => d.value > 0)
  const total = data.reduce((s, d) => s + d.value, 0)
  const selStyle = { fontSize: 11.5, padding: '3px 8px', borderRadius: 7, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, outline: 'none', fontFamily: 'var(--font)', cursor: 'pointer' }
  return (
    <Card title="Order Value Distribution" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8, marginTop: -4 }}>
        <select style={selStyle} value={metric} onChange={e => setMetric(e.target.value)}>
          <option value="orders">By Orders</option>
          <option value="revenue">By Revenue</option>
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <ResponsiveContainer width={180} height={180}>
          <PieChart>
            <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
              {data.map((d, i) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip formatter={(v) => metric === 'orders' ? fmtN(v) : fmt(v)} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {data.map(d => (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
              <span style={{ flex: 1, color: C.t2 }}>{d.name}</span>
              <span style={{ fontFamily: 'var(--mono)', color: C.t1, fontSize: 11 }}>{metric === 'orders' ? fmtN(d.value) : fmt(d.value)}</span>
              <span style={{ color: C.t3, fontSize: 10, minWidth: 34, textAlign: 'right' }}>{total ? ((d.value / total) * 100).toFixed(1) : 0}%</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

const CAT_PALETTE = ['#534AB7','#0D9E68','#2E74CC','#CC8A00','#CC4078','#E24B4A','#9B59B6','#FF6B35','#00B4D8','#06D6A0','#E8930A','#FFD600']
const colorOf = (name, rows) => { const idx = rows.findIndex(r => r.name === name); return CAT_PALETTE[idx >= 0 ? idx % CAT_PALETTE.length : 0] }

function CatSubCatRow({ catRows, subCatRows, title = 'Category Revenue', selectedCat: externalSelectedCat, onSelectCat, selectedSubCat: externalSelectedSubCat, onSelectSubCat }) {
  return null
  // eslint-disable-next-line no-unreachable
  const [catView, setCatView] = useState('table')
  const [subCatView, setSubCatView] = useState('table')
  const [internalSelectedCat, setInternalSelectedCat] = useState(null)
  const [internalSelectedSubCat, setInternalSelectedSubCat] = useState(null)
  const isControlled = onSelectCat !== undefined
  const selectedCat = isControlled ? externalSelectedCat : internalSelectedCat
  const selectedSubCat = isControlled ? externalSelectedSubCat : internalSelectedSubCat
  const setSelectedCat = isControlled ? onSelectCat : v => { setInternalSelectedCat(v); setInternalSelectedSubCat(null) }
  const setSelectedSubCat = isControlled ? onSelectSubCat : setInternalSelectedSubCat
  const filteredSubCat = selectedCat ? subCatRows.filter(r => r.category === selectedCat) : subCatRows
  const btnStyle = v => ({ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${v === catView ? C.t1 : C.border}`, background: v === catView ? C.t1 : 'transparent', color: v === catView ? '#fff' : C.t2, cursor: 'pointer', fontFamily: 'var(--font)' })
  const scBtnStyle = v => ({ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${v === subCatView ? C.t1 : C.border}`, background: v === subCatView ? C.t1 : 'transparent', color: v === subCatView ? '#fff' : C.t2, cursor: 'pointer', fontFamily: 'var(--font)' })
  const FIXED_H = 420
  const totalCatRev = catRows.reduce((s, r) => s + r.rev, 0)
  const totalSubRev = filteredSubCat.reduce((s, r) => s + r.rev, 0)
  if (!catRows.length) return null
  return (
    <div className="g-2" style={{ alignItems: 'stretch' }}>
      <Card title={title} note={selectedCat ? <span style={{ cursor: 'pointer', color: C.acc, fontWeight: 600 }} onClick={() => setSelectedCat(null)}>✕ Clear</span> : `${catRows.length} total`}
        action={<div style={{ display: 'flex', gap: 4 }}><button style={btnStyle('table')} onClick={() => setCatView('table')}>Table</button><button style={btnStyle('bar')} onClick={() => setCatView('bar')}>Bar</button></div>}>
        {catView === 'table' && (
          <div style={{ overflowY: 'auto', maxHeight: FIXED_H }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, background: C.card, zIndex: 1 }}><tr>{[{ label: 'Category' }, { label: 'Revenue / % Share', align: 'right' }, { label: 'Orders', align: 'right' }, { label: 'Units', align: 'right' }, { label: 'ASP', align: 'right' }].map(c => <th key={c.label} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, textAlign: c.align || 'left', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}` }}>{c.label}</th>)}</tr></thead>
              <tbody>{catRows.map((r, i) => { const isSelected = selectedCat === r.name; const share = totalCatRev ? (r.rev / totalCatRev * 100).toFixed(1) + '%' : '—'; return <tr key={r.name} onClick={() => setSelectedCat(isSelected ? null : r.name)} style={{ borderBottom: i < catRows.length - 1 ? `1px solid ${C.border}` : 'none', background: isSelected ? C.acl : '', cursor: 'pointer' }} onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#FFFBE6' }} onMouseLeave={e => { e.currentTarget.style.background = isSelected ? C.acl : '' }}><td style={{ padding: '5.5px 5px', color: C.t2 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#FFD600', marginRight: 6 }} />{isSelected ? <strong>{r.name}</strong> : r.name}</td><td style={{ padding: '5.5px 5px', textAlign: 'right' }}><span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t1 }}>{fmt(r.rev)}</span><span style={{ fontSize: 10, color: C.t3, marginLeft: 5 }}>({share})</span></td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>{fmtN(r.orders)}</td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>{fmtN(r.units)}</td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>₹{Math.round(r.rev / Math.max(r.units, 1)).toLocaleString('en-IN')}</td></tr> })}</tbody>
            </table>
          </div>
        )}
        {catView === 'bar' && (
          <ResponsiveContainer width="100%" height={FIXED_H}>
            <BarChart data={catRows} layout="vertical" margin={{ top: 0, right: 60, bottom: 0, left: 100 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => v >= 1e7 ? `${(v/1e7).toFixed(1)}Cr` : v >= 1e5 ? `${(v/1e5).toFixed(0)}L` : fmt(v)} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: C.t2 }} width={95} />
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
              <Tooltip formatter={v => fmt(v)} cursor={{ fill: 'transparent' }} />
              <Bar dataKey="rev" name="Revenue" radius={[0,4,4,0]} onClick={r => setSelectedCat(selectedCat === r.name ? null : r.name)}>
                {catRows.map(r => <Cell key={r.name} fill="#FFD600" opacity={selectedCat && selectedCat !== r.name ? 0.35 : 1} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
      <Card title={selectedCat ? `Sub-categories · ${selectedCat}` : 'Sub-categories'} note={selectedSubCat ? <span style={{ cursor: 'pointer', color: C.acc, fontWeight: 600 }} onClick={() => setSelectedSubCat(null)}>✕ Clear</span> : `${filteredSubCat.length} total`}
        action={<div style={{ display: 'flex', gap: 4 }}><button style={scBtnStyle('table')} onClick={() => setSubCatView('table')}>Table</button><button style={scBtnStyle('bar')} onClick={() => setSubCatView('bar')}>Bar</button></div>}>
        {subCatView === 'table' && (
          <div style={{ overflowY: 'auto', maxHeight: FIXED_H }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, background: C.card, zIndex: 1 }}><tr>{[{ label: 'Sub-category' }, { label: 'Revenue / % Share', align: 'right' }, { label: 'Orders', align: 'right' }, { label: 'Units', align: 'right' }, { label: 'ASP', align: 'right' }].map(c => <th key={c.label} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, textAlign: c.align || 'left', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}` }}>{c.label}</th>)}</tr></thead>
              <tbody>{filteredSubCat.map((r, i) => { const isScSelected = selectedSubCat === r.name && selectedCat === r.category; const share = totalSubRev ? (r.rev / totalSubRev * 100).toFixed(1) + '%' : '—'; return <tr key={r.name + r.category} onClick={() => { if (setSelectedSubCat) { if (!selectedCat || selectedCat !== r.category) setSelectedCat(r.category); setSelectedSubCat(isScSelected ? null : r.name) } }} style={{ borderBottom: i < filteredSubCat.length - 1 ? `1px solid ${C.border}` : 'none', background: isScSelected ? C.acl : '', cursor: setSelectedSubCat ? 'pointer' : 'default' }} onMouseEnter={e => { if (!isScSelected) e.currentTarget.style.background = '#FFFBE6' }} onMouseLeave={e => { e.currentTarget.style.background = isScSelected ? C.acl : '' }}><td style={{ padding: '5.5px 5px', color: C.t2 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#FFD600', marginRight: 6 }} />{isScSelected ? <strong>{r.name}</strong> : r.name}</td><td style={{ padding: '5.5px 5px', textAlign: 'right' }}><span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t1 }}>{fmt(r.rev)}</span><span style={{ fontSize: 10, color: C.t3, marginLeft: 5 }}>({share})</span></td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>{fmtN(r.orders)}</td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>{fmtN(r.units)}</td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>₹{Math.round(r.rev / Math.max(r.units, 1)).toLocaleString('en-IN')}</td></tr> })}</tbody>
            </table>
          </div>
        )}
        {subCatView === 'bar' && (
          <div style={{ overflowY: 'auto', maxHeight: FIXED_H }}>
            <ResponsiveContainer width="100%" height={Math.max(FIXED_H, filteredSubCat.length * 26)}>
              <BarChart data={filteredSubCat} layout="vertical" margin={{ top: 0, right: 60, bottom: 0, left: 140 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => v >= 1e7 ? `${(v/1e7).toFixed(1)}Cr` : v >= 1e5 ? `${(v/1e5).toFixed(0)}L` : fmt(v)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: C.t2 }} width={135} />
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                <Tooltip formatter={v => fmt(v)} />
                <Bar dataKey="rev" name="Revenue" radius={[0,4,4,0]}>{filteredSubCat.map((r, i) => <Cell key={r.name} fill="#FFD600" />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  )
}

function ShopifyGeoDonutRow({ regionRows, tierRows, topStates, allStateRows, useUnits = false }) {
  const [metric, setMetric] = useState(useUnits ? 'units' : 'rev')
  const REGION_COLORS = ['#534AB7','#0D9E68','#2E74CC','#CC8A00','#CC4078','#E24B4A']
  const TIER_COLORS = ['#FFD600','#FF6B35','#9B59B6']
  const STATE_COLORS = ['#0D9E68','#2E74CC','#534AB7','#CC8A00','#E24B4A','#9B59B6']
  const metricVal = (r, m) => m === 'rev' ? r.rev : m === 'units' ? (r.units || 0) : m === 'orders' ? r.orders : (r.orders ? Math.round(r.rev / r.orders) : 0)
  const metricFmt = v => metric === 'rev' ? fmt(v) : metric === 'aov' ? `₹${v.toLocaleString('en-IN')}` : fmtN(v)
  const selStyle = active => ({ fontSize: 10, fontWeight: active ? 700 : 500, padding: '2px 8px', borderRadius: 4, border: `1px solid ${active ? C.acm : C.border}`, background: active ? C.acc : 'transparent', color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)' })

  const SmallDonut = ({ title, data, colors, grandTotal }) => {
    const total = grandTotal || data.reduce((s, d) => s + d.value, 0)
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.t2, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ResponsiveContainer width={110} height={110}>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={32} outerRadius={50} dataKey="value" paddingAngle={2}>
                {data.map((d, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
              </Pie>
              <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 11, color: '#111', fontWeight: 600 }}>{payload[0].name}: {metricFmt(payload[0].value)}</div> : null} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors[i % colors.length], flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: C.t2, whiteSpace: 'nowrap' }}>{d.name}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.t1, fontFamily: 'var(--mono)', marginLeft: 4 }}>{metricFmt(d.value)}</span>
                <span style={{ fontSize: 10, color: C.t3 }}>{total ? (d.value / total * 100).toFixed(0) : 0}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const TIER_NAMES = { '1': 'Tier I', '2': 'Tier II', '3': 'Tier III', 'I': 'Tier I', 'II': 'Tier II', 'III': 'Tier III' }
  const regionData = regionRows.map((r, i) => ({ name: r.region, value: metricVal(r, metric) }))
  const tierData = tierRows.map(r => { const key = String(r.tier).replace(/^tier\s*/i, '').trim(); return { name: TIER_NAMES[key] || r.label || `Tier ${key}`, value: metricVal(r, metric) } })
  const stateData = topStates.map(r => ({ name: r.name ? r.name.charAt(0).toUpperCase() + r.name.slice(1).toLowerCase() : r.name, value: metricVal(r, metric) }))
  const allStateGrandTotal = (allStateRows || []).reduce((s, r) => s + metricVal(r, metric), 0) || null

  if (!regionData.length && !tierData.length) return null

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <Card title="Geography Breakdown" action={
        <div style={{ display: 'flex', gap: 3 }}>
          {(useUnits ? [['rev','Revenue'],['units','Units']] : [['rev','Revenue'],['orders','Orders']]).map(([k,l]) => <button key={k} onClick={() => setMetric(k)} style={selStyle(metric === k)}>{l}</button>)}
        </div>
      }>
        <div style={{ display: 'flex', gap: 16 }}>
          {regionData.length > 0 && <SmallDonut title="By Region" data={regionData} colors={REGION_COLORS} />}
          {tierData.length > 0 && <SmallDonut title="By City Tier" data={tierData} colors={TIER_COLORS} />}
        </div>
      </Card>
    </div>
  )
}

function TopSubCatBar({ subCatRows }) {
  const top10 = (subCatRows || []).slice(0, 10)
  const BAR_COLORS = ['#534AB7','#0D9E68','#2E74CC','#CC8A00','#CC4078','#E24B4A','#9B59B6','#FF6B35','#00B4D8','#06D6A0']
  const chartData = top10.map((r, i) => ({ name: r.name, rev: r.rev, color: BAR_COLORS[i % BAR_COLORS.length] }))
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <Card title="Top 10 Sub-categories · Revenue">
        {top10.length === 0
          ? <div style={{ fontSize: 12, color: C.t3, textAlign: 'center', padding: '12px 0' }}>No data</div>
          : <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 90, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={true} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: C.t2 }} interval={0} angle={-45} textAnchor="end" />
                <YAxis tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => v >= 1e5 ? `${(v/1e5).toFixed(0)}L` : fmt(v)} width={48} />
                <Tooltip content={({ active, payload }) => active && payload?.length ? (
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 10px', fontSize: 11 }}>
                    <div style={{ fontWeight: 700, color: C.t1, marginBottom: 2 }}>{payload[0].payload.name}</div>
                    <div style={{ color: payload[0].payload.color }}>{fmt(payload[0].value)}</div>
                  </div>
                ) : null} />
                <Bar dataKey="rev" radius={[4, 4, 0, 0]}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
        }
      </Card>
    </div>
  )
}

function ShopifyGeoRichTable({ title, rows, firstKey, firstLabel, formatFirst }) {
  const [page, setPage] = useState(0)
  const pageSize = 15
  useEffect(() => { setPage(0) }, [rows])
  const maxRev = rows[0]?.rev || 1
  const totalPages = Math.ceil(rows.length / pageSize)
  const visible = rows.slice(page * pageSize, (page + 1) * pageSize)
  const th = { fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, padding: '4px 6px 8px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }
  const td = { padding: '6px 6px', fontSize: 11, color: C.t1, whiteSpace: 'nowrap' }
  const momCell = m => {
    if (m === null || m === undefined) return <span style={{ color: C.t3 }}>—</span>
    const positive = m >= 0
    return <span style={{ fontSize: 10, fontWeight: 700, color: positive ? '#0D9E68' : '#B91C1C' }}>{positive ? '↗' : '↘'} {Math.abs(m).toFixed(1)}%</span>
  }
  const rtoChip = pct => {
    let bg = '#E6F4EA', tx = '#0A6E4A'
    if (pct >= 25) { bg = '#FDE8E8'; tx = '#B91C1C' }
    else if (pct >= 15) { bg = '#FFF4E0'; tx = '#A66608' }
    return <span style={{ fontSize: 10, fontWeight: 700, background: bg, color: tx, padding: '2px 7px', borderRadius: 10 }}>{pct.toFixed(0)}%</span>
  }
  return (
    <Card title={title} note={`${rows.length} total`}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left', width: 24 }}>#</th>
              <th style={{ ...th, textAlign: 'left' }}>{firstLabel}</th>
              <th style={{ ...th, textAlign: 'left' }}>Revenue</th>
              <th style={{ ...th, textAlign: 'right' }}>% Share</th>
              <th style={{ ...th, textAlign: 'right' }}>Cum %</th>
              <th style={{ ...th, textAlign: 'right' }}>Orders</th>
              <th style={{ ...th, textAlign: 'right' }}>AOV</th>
              <th style={{ ...th, textAlign: 'right' }}>MoM</th>
              <th style={{ ...th, textAlign: 'right' }}>RTO %</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const idx = page * pageSize + i + 1
              const barPct = (r.rev / maxRev) * 100
              return (
                <tr key={r[firstKey] + '|' + i} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ ...td, color: C.t3 }}>{idx}</td>
                  <td style={td}>{formatFirst ? formatFirst(r[firstKey]) : r[firstKey]}</td>
                  <td style={{ ...td, minWidth: 140 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, background: C.border, borderRadius: 3, height: 6, overflow: 'hidden', minWidth: 50 }}>
                        <div style={{ width: `${barPct}%`, background: '#2E74CC', height: '100%', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: C.t1, minWidth: 64, textAlign: 'right' }}>{fmt(r.rev)}</span>
                    </div>
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)', color: C.t2 }}>{r.sharePct.toFixed(1)}%</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)', color: C.t2 }}>{r.cumPct.toFixed(1)}%</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtN(r.orders)}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)' }}>₹{Math.round(r.aov || 0).toLocaleString('en-IN')}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{momCell(r.mom)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{rtoChip(r.rtoPct || 0)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 11, color: C.t3 }}>
          <div>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, rows.length)} of {rows.length}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ padding: '3px 10px', fontSize: 11, border: `1px solid ${C.border2}`, background: C.card, color: C.t2, borderRadius: 5, cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.4 : 1 }}>← Prev</button>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ padding: '3px 10px', fontSize: 11, border: `1px solid ${C.border2}`, background: C.card, color: C.t2, borderRadius: 5, cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', opacity: page >= totalPages - 1 ? 0.4 : 1 }}>Next →</button>
          </div>
        </div>
      )}
    </Card>
  )
}

function ShopifyTab({ data, filters, setFilters }) {
  // region toggle drives subChannel filter via API — all aggregated data is correct
  const isIntl = filters.subChannel === 'International'

  const subChannelMap = data.subChannelMap || {}
  const paymentModeMap = data.paymentModeMap || {}
  const { orderStatusMap = {}, orderStatusRevMap = {}, nOrders, nCusts, repeatCusts, dailyArr, cityRows = [], voucherMap = {}, financialStatusMap = {}, fulfilmentStatusMap = {}, refundTrend = [] } = data

  // Shopify-only category/state maps from server-side queries
  const sh = data.shopify || {}
  const catMap = sh.catMap || {}
  const subCatMap = sh.subCatMap || {}
  const stateMap = sh.stateMap || {}
  const shCityRows = sh.cityRows || []
  const statePrevMap = sh.statePrevMap || {}
  const cityPrevMap = sh.cityPrevMap || {}
  const paymentTypes = sh.paymentTypes || []

  // Use Shopify-specific totals that EXCLUDE Shopify B2B sub-channel
  const shCh = sh.totals || {}
  const totalRev = shCh.rev || 0                          // Gross Revenue (Inc. GST), Shopify India+International EXCLUDING B2B
  const totalExcRevRaw = shCh.excRev || 0
  const totalQty = shCh.qty || 0
  // Subtract Cancelled + RTO + CIR revenue from Gross, then strip GST → final Net Revenue
  const cancelledRev = data.orderStatusRevMap?.['Cancelled'] || 0
  const rtoRev = data.orderStatusRevMap?.['RTO'] || 0
  const cirRev = data.cirRev || 0
  const grossAfterReturns = totalRev - cancelledRev - rtoRev - cirRev
  // Use the effective GST ratio observed across all Shopify orders to strip GST from the trimmed total
  const gstRatio = totalRev > 0 ? (totalRev - totalExcRevRaw) / totalRev : 0
  const netRev = grossAfterReturns * (1 - gstRatio)
  const gst = grossAfterReturns - netRev
  // Keep `totalExcRev` available as alias for backward-compat; it now equals true Net Revenue
  const totalExcRev = netRev

  const prevRev = sh.prevRev || 0
  const prevExcRevRaw = sh.prevExcRev || 0
  const prevOrders = sh.prevOrders || 0
  const prevUnits = sh.prevUnits || 0
  const prevRtoOrders = sh.prevRtoOrders || 0
  const prevCirOrders = sh.prevCirOrders || 0
  const prevExchangeOrders = sh.prevExchangeOrders || 0
  const prevCancelledOrders = sh.prevCancelledOrders || 0
  const prevDailyArr = sh.prevDaily || []
  // Apply the same shrink ratio to previous period for an apples-to-apples Net Revenue change
  const prevReturnsShrink = totalRev > 0 ? (cancelledRev + rtoRev + cirRev) / totalRev : 0
  const prevGrossAfterReturns = prevRev * (1 - prevReturnsShrink)
  const prevGstRatio = prevRev > 0 ? (prevRev - prevExcRevRaw) / prevRev : gstRatio
  const prevNetRev = prevGrossAfterReturns * (1 - prevGstRatio)
  const prevExcRev = prevNetRev  // alias for backward-compat

  const shRevChg = prevRev > 0 ? ((totalRev - prevRev) / prevRev * 100) : null
  const shNOrders = shCh.orders || 0
  const shOrdChg = prevOrders > 0 ? ((shNOrders - prevOrders) / prevOrders * 100) : null
  const shExcChg = prevNetRev > 0 ? ((netRev - prevNetRev) / prevNetRev * 100) : null
  const shChgBadge = (cur, prev) => {
    if (!prev) return null
    const p = (cur - prev) / prev * 100
    return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span>
  }
  // For return/cancel metrics: higher is worse, so invert colors
  const shReturnBadge = (curPct, prevPct) => {
    if (!prevPct) return null
    const p = (curPct - prevPct) / prevPct * 100
    return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p > 0 ? C.red.bg : C.green.bg, color: p > 0 ? C.red.tx : C.green.tx, flexShrink: 0 }}>{p > 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span>
  }
  const shDailyArr = sh.daily || []
  const shSparkData = Array.from({ length: Math.max(shDailyArr.length, prevDailyArr.length) }, (_, i) => {
    const cur = shDailyArr[i]
    const pre = prevDailyArr[i]
    return { i, cur: cur ? cur.rev : null, prev: pre?.rev ?? null }
  })
  const nDays = sh.nDays || data.nDays || 1
  const dailyAvg = nDays ? totalRev / nDays : 0
  const aov = shNOrders ? totalRev / shNOrders : 0
  const asp = totalQty ? totalExcRev / totalQty : 0
  const deliveredOrders = orderStatusMap['Delivered'] || 0
  const rtoOrders = orderStatusMap['RTO'] || 0
  const fulfilmentPct = shNOrders ? (deliveredOrders / shNOrders * 100) : 0
  const rtoPct = shNOrders ? (rtoOrders / shNOrders * 100) : 0
  const atRiskRev = (orderStatusRevMap['RTO'] || 0) + (orderStatusRevMap['Cancelled'] || 0) + (data.cirRev || 0)
  const returnRevPct = totalRev > 0 ? (((data.rtoRevDirect || 0) + (data.cirRev || 0)) / totalRev * 100) : 0
  const repeatRate = nCusts ? (repeatCusts / nCusts * 100).toFixed(1) : '0'

  // Sub-channel breakdown — India excludes International, Intl shows only International
  const indiaSubChMap = Object.fromEntries(Object.entries(subChannelMap).filter(([k]) => k !== 'International' && k !== 'Shopify B2B'))
  const intlSubChMap = subChannelMap['International'] ? { International: subChannelMap['International'] } : {}
  const activeSubChMap = isIntl ? intlSubChMap : indiaSubChMap
  const activeSubChKeys = Object.keys(activeSubChMap).sort((a, b) => activeSubChMap[b].rev - activeSubChMap[a].rev)
  const maxSubChRev = Math.max(...Object.values(activeSubChMap).map(v => v.rev), 1)

  // India sub-channel keys for dropdown (excl International)
  const indiaSubChKeys = Object.keys(indiaSubChMap)

  const [subChOpen, setSubChOpen] = useState(false)
  const [pendingSubCh, setPendingSubCh] = useState([])
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [pendingPayment, setPendingPayment] = useState([])
  const [intlCountry, setIntlCountry] = useState(null)
  const [selectedCat, setSelectedCat] = useState(null)
  const [shTrendGroup, setShTrendGroup] = useState('daily')
  const [shCatView, setShCatView] = useState('table')
  const [shSubCatView, setShSubCatView] = useState('table')
  const catRows = Object.entries(catMap).map(([k, v]) => { const orders = v.orders?.size ?? v.orders ?? 0; return { name: k, rev: v.rev, excRev: v.excRev || 0, orders, units: v.units || 0, aov: orders ? v.rev / orders : 0, asp: (v.units || 0) ? v.rev / v.units : 0 } }).sort((a, b) => b.rev - a.rev)
  const allSubCatRows = Object.entries(subCatMap).map(([k, v]) => { const orders = v.orders?.size ?? v.orders ?? 0; return { name: k.split('::')[1] || k, category: k.split('::')[0] || '', rev: v.rev, orders, units: v.units || 0, aov: orders ? v.rev / orders : 0, asp: (v.units || 0) ? v.rev / v.units : 0 } }).sort((a, b) => b.rev - a.rev)
  const subCatRows = selectedCat ? allSubCatRows.filter(r => r.category === selectedCat) : allSubCatRows
  const stateRows = (() => {
    const totalRevAll = Object.values(stateMap).reduce((s, v) => s + (v.rev || 0), 0)
    const sorted = Object.entries(stateMap).map(([k, v]) => {
      const ord = v.orders instanceof Set ? v.orders.size : v.orders
      const prev = statePrevMap[k] || { rev: 0, orders: 0 }
      return {
        state: k,
        rev: v.rev,
        orders: ord,
        aov: ord ? v.rev / ord : 0,
        cities: v.cities?.size || 0,
        rtoOrders: v.rtoOrders || 0,
        rtoPct: ord ? ((v.rtoOrders || 0) / ord * 100) : 0,
        prevRev: prev.rev,
        prevOrders: prev.orders,
        mom: prev.rev > 0 ? ((v.rev - prev.rev) / prev.rev * 100) : null,
        sharePct: totalRevAll > 0 ? (v.rev / totalRevAll * 100) : 0,
      }
    }).sort((a, b) => b.rev - a.rev)
    // cumulative share
    let cum = 0
    sorted.forEach(r => { cum += r.sharePct; r.cumPct = cum })
    return sorted
  })()
  const enrichedCityRows = (() => {
    const totalRevAll = shCityRows.reduce((s, c) => s + (c.rev || 0), 0)
    const sorted = shCityRows.map(c => {
      const key = `${c.city}|${c.state || ''}`
      const prev = cityPrevMap[key] || { rev: 0, orders: 0 }
      return {
        ...c,
        rtoPct: c.orders ? ((c.rtoOrders || 0) / c.orders * 100) : 0,
        prevRev: prev.rev,
        prevOrders: prev.orders,
        mom: prev.rev > 0 ? ((c.rev - prev.rev) / prev.rev * 100) : null,
        sharePct: totalRevAll > 0 ? (c.rev / totalRevAll * 100) : 0,
      }
    }).sort((a, b) => b.rev - a.rev)
    let cum = 0
    sorted.forEach(r => { cum += r.sharePct; r.cumPct = cum })
    return sorted
  })()

  const toggleStyle = active => ({ fontSize: 12, fontWeight: active ? 700 : 500, padding: '5px 18px', borderRadius: 7, border: `1.5px solid ${active ? C.acm : C.border2}`, background: active ? C.acc : C.card, color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all .12s' })
  const selStyle = { fontSize: 11.5, padding: '4px 10px', borderRadius: 7, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, outline: 'none', fontFamily: 'var(--font)', cursor: 'pointer' }

  const switchRegion = toIntl => {
    setIntlCountry(null)
    setFilters(f => ({ ...f, subChannel: toIntl ? 'International' : '', country: '', voucher: '' }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* India / International toggle + sub-channel dropdown + tiles on right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Left: region toggles + sub-channel dropdown */}
        <button style={{ ...toggleStyle(!isIntl), display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => switchRegion(false)}><img src="https://flagcdn.com/w20/in.png" width="18" style={{ borderRadius: 2, flexShrink: 0 }} /> India</button>
        <button style={toggleStyle(isIntl)} onClick={() => switchRegion(true)}><span style={{ fontFamily: 'sans-serif' }}>🌐</span> International</button>
        {!isIntl && indiaSubChKeys.length > 0 && (() => {
          const sel = filters.subChannel ? filters.subChannel.split(',').map(x => x.trim()).filter(Boolean) : []
          return (
            <div style={{ position: 'relative' }}>
              <button
                style={{ ...selStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                onClick={() => { setPendingSubCh(sel); setSubChOpen(o => !o) }}
              >
                {sel.length === 0 ? 'All Sub-channels' : `${sel.length} selected`}
                <span style={{ fontSize: 10 }}>{subChOpen ? '▲' : '▼'}</span>
              </button>
              {subChOpen && (
                <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 200, background: C.card, border: `1px solid ${C.border2}`, borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.12)', minWidth: 180, padding: '8px 0' }}>
                  {indiaSubChKeys.map(k => (
                    <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', cursor: 'pointer', fontSize: 12, color: C.t1 }}>
                      <input type="checkbox" checked={pendingSubCh.includes(k)} onChange={e => setPendingSubCh(prev => e.target.checked ? [...prev, k] : prev.filter(v => v !== k))} style={{ accentColor: C.acm }} />
                      {k}
                    </label>
                  ))}
                  <div style={{ display: 'flex', gap: 6, padding: '8px 14px 4px', borderTop: `1px solid ${C.border}`, marginTop: 4 }}>
                    <button style={{ flex: 1, fontSize: 11, padding: '4px 0', borderRadius: 5, border: `1px solid ${C.border2}`, background: C.card, color: C.t2, cursor: 'pointer' }} onClick={() => { setFilters(f => ({ ...f, subChannel: '' })); setPendingSubCh([]); setSubChOpen(false) }}>Clear</button>
                    <button style={{ flex: 1, fontSize: 11, padding: '4px 0', borderRadius: 5, border: 'none', background: C.acm, color: '#fff', cursor: 'pointer', fontWeight: 700 }} onClick={() => { setFilters(f => ({ ...f, subChannel: pendingSubCh.join(',') })); setSubChOpen(false) }}>Apply</button>
                  </div>
                </div>
              )}
            </div>
          )
        })()}
        {!isIntl && paymentTypes.length > 0 && (() => {
          const sel = filters.paymentType ? filters.paymentType.split(',').map(x => x.trim()).filter(Boolean) : []
          return (
            <div style={{ position: 'relative' }}>
              <button
                style={{ ...selStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                onClick={() => { setPendingPayment(sel); setPaymentOpen(o => !o) }}
              >
                {sel.length === 0 ? 'All Payment Types' : sel.length === 1 ? sel[0] : `${sel.length} selected`}
                <span style={{ fontSize: 10 }}>{paymentOpen ? '▲' : '▼'}</span>
              </button>
              {paymentOpen && (
                <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 200, background: C.card, border: `1px solid ${C.border2}`, borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.12)', minWidth: 200, padding: '8px 0', maxHeight: 320, overflowY: 'auto' }}>
                  {paymentTypes.map(p => (
                    <label key={p.paymentType} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', cursor: 'pointer', fontSize: 12, color: C.t1 }}>
                      <input type="checkbox" checked={pendingPayment.includes(p.paymentType)} onChange={e => setPendingPayment(prev => e.target.checked ? [...prev, p.paymentType] : prev.filter(v => v !== p.paymentType))} style={{ accentColor: C.acm }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.paymentType}</span>
                    </label>
                  ))}
                  <div style={{ display: 'flex', gap: 6, padding: '8px 14px 4px', borderTop: `1px solid ${C.border}`, marginTop: 4 }}>
                    <button style={{ flex: 1, fontSize: 11, padding: '4px 0', borderRadius: 5, border: `1px solid ${C.border2}`, background: C.card, color: C.t2, cursor: 'pointer' }} onClick={() => { setFilters(f => ({ ...f, paymentType: '' })); setPendingPayment([]); setPaymentOpen(false) }}>Clear</button>
                    <button style={{ flex: 1, fontSize: 11, padding: '4px 0', borderRadius: 5, border: 'none', background: C.acm, color: '#fff', cursor: 'pointer', fontWeight: 700 }} onClick={() => { setFilters(f => ({ ...f, paymentType: pendingPayment.join(',') })); setPaymentOpen(false) }}>Apply</button>
                  </div>
                </div>
              )}
            </div>
          )
        })()}
        {isIntl && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4, border: `1.5px solid ${C.border2}`, borderRadius: 8, overflow: 'hidden', background: C.card }}>
            {[{ id: null, label: 'All' }, { id: 'UAE', label: '🇦🇪 UAE' }, { id: 'UK', label: '🇬🇧 UK' }, { id: 'US', label: '🇺🇸 US' }].map(opt => (
              <button key={String(opt.id)} onClick={() => {
                setIntlCountry(opt.id)
                setFilters(f => ({ ...f, country: opt.id || '' }))
              }} style={{ fontSize: 12, fontWeight: intlCountry === opt.id ? 700 : 500, padding: '5px 14px', border: 'none', borderRight: `1px solid ${C.border2}`, background: intlCountry === opt.id ? C.acc : 'transparent', color: intlCountry === opt.id ? C.t1 : C.t2, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all .12s' }}>{opt.label}</button>
            ))}
          </div>
        )}

        {/* Right: sub-channel tiles pushed to far right */}
        {!isIntl && indiaSubChKeys.length > 0 && (() => {
          const totalSubRev = Object.values(indiaSubChMap).reduce((s, x) => s + x.rev, 0)
          const sel = filters.subChannel ? filters.subChannel.split(',').map(x => x.trim()).filter(Boolean) : []
          return (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 0, border: `1.5px solid ${C.border2}`, borderRadius: 8, overflow: 'hidden', background: C.card }}>
              {indiaSubChKeys.map((k, i) => {
                const v = indiaSubChMap[k]
                const isActive = sel.includes(k)
                return (
                  <button
                    key={k}
                    onClick={() => {
                      const cur = filters.subChannel ? filters.subChannel.split(',').map(x => x.trim()).filter(Boolean) : []
                      const next = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k]
                      setFilters(f => ({ ...f, subChannel: next.join(',') }))
                    }}
                    style={{
                      display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8,
                      padding: '6px 14px', cursor: 'pointer', fontFamily: 'var(--font)',
                      borderLeft: i > 0 ? `1px solid ${C.border2}` : 'none',
                      border: 'none',
                      background: isActive ? C.acc : 'transparent',
                      transition: 'background .12s', whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{ fontSize: 10, color: isActive ? C.acm : C.t3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{k}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.t1, fontFamily: 'var(--mono)' }}>{fmt(v.rev)}</span>
                    <span style={{ fontSize: 11, color: isActive ? C.acm : C.t3 }}>{totalSubRev ? pct(v.rev, totalSubRev) : '—'}</span>
                  </button>
                )
              })}
              {sel.length > 0 && (
                <button onClick={() => setFilters(f => ({ ...f, subChannel: '' }))} style={{ fontSize: 11, padding: '6px 10px', borderLeft: `1px solid ${C.border2}`, border: 'none', borderLeft: `1px solid ${C.border2}`, background: 'transparent', color: C.t3, cursor: 'pointer' }}>✕</button>
              )}
            </div>
          )
        })()}
      </div>
      {(filters.category?.length > 0 || filters.subCategory?.length > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: C.acl, borderRadius: 8, border: `1px solid ${C.acm}`, fontSize: 12 }}>
          <span style={{ color: C.t3, fontWeight: 600 }}>Filtered by:</span>
          {filters.category?.length > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: C.acc, border: `1px solid ${C.acm}`, borderRadius: 5, padding: '2px 8px', fontWeight: 700, color: C.t1 }}>
              Category: {filters.category.join(', ')}
              <span style={{ cursor: 'pointer', color: C.t2, marginLeft: 2 }} onClick={() => { setSelectedCat(null); setFilters(f => ({ ...f, category: [], subCategory: [] })) }}>✕</span>
            </span>
          )}
          {filters.subCategory?.length > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: C.acc, border: `1px solid ${C.acm}`, borderRadius: 5, padding: '2px 8px', fontWeight: 700, color: C.t1 }}>
              Sub-cat: {filters.subCategory.join(', ')}
              <span style={{ cursor: 'pointer', color: C.t2, marginLeft: 2 }} onClick={() => setFilters(f => ({ ...f, subCategory: [] }))}>✕</span>
            </span>
          )}
          <span style={{ marginLeft: 'auto', color: C.t3, fontSize: 11 }}>All KPIs & charts reflect this filter</span>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
        {/* Hero card */}
        <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
          <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue · Inc. GST</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(totalRev)}</div>
            {shRevChg !== null && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: shRevChg >= 0 ? C.green.bg : C.red.bg, color: shRevChg >= 0 ? C.green.tx : C.red.tx }}>{shRevChg >= 0 ? '▲' : '▼'} {Math.abs(shRevChg).toFixed(1)}%</span>}
          </div>
          <div className="kpi-sub" style={{ fontSize: 13 }}>{shNOrders >= 1000 ? (shNOrders/1000).toFixed(1).replace(/\.0$/,'')+'k' : fmtN(shNOrders)} orders · {totalQty >= 1000 ? (totalQty/1000).toFixed(1).replace(/\.0$/,'')+'k' : fmtN(totalQty)} units</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={shSparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs><linearGradient id="shGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#FFD600" stopOpacity={0.25} /><stop offset="95%" stopColor="#FFD600" stopOpacity={0} /></linearGradient></defs>
                <Area type="monotone" dataKey="cur" name="Current" stroke="#FFD600" strokeWidth={2} fill="url(#shGrad)" dot={false} connectNulls />
                <Area type="monotone" dataKey="prev" name="Prev" stroke={C.t3} strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ color: p.name === 'Current' ? C.t1 : C.t3 }}>{p.name}: {fmt(p.value)}</div>)}</div> : null} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        {/* Right: 2 rows of 5 KPIs */}
        {(() => {
          const cirOrders = data.cirOrders || 0
          const exchangeOrders = data.exchangeOrders || 0
          const cancelledOrders = orderStatusMap['Cancelled'] || 0
          const cancelPct = shNOrders ? (cancelledOrders / shNOrders * 100) : 0
          const cirPct = shNOrders ? (cirOrders / shNOrders * 100) : 0
          const exchangePct = shNOrders ? (exchangeOrders / shNOrders * 100) : 0
          const excChg = prevExcRev > 0 ? ((totalExcRev - prevExcRev) / prevExcRev * 100) : null
          const prevGst = prevGrossAfterReturns - prevNetRev
          const row1 = [
            {
              label: 'Net Revenue',
              value: fmt(netRev),
              sub: 'Gross − Cancel − RTO − CIR − GST',
              badge: excChg !== null ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: excChg >= 0 ? C.green.bg : C.red.bg, color: excChg >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{excChg >= 0 ? '▲' : '▼'} {Math.abs(excChg).toFixed(1)}%</span> : null,
            },
            { label: 'GST Collected', value: fmt(gst), sub: grossAfterReturns > 0 ? `${((gst / grossAfterReturns) * 100).toFixed(1)}% of net sales` : '—', badge: shChgBadge(gst, prevGst) },
            { label: 'Daily Avg', value: fmt(dailyAvg), sub: `over ${nDays} days`, badge: shChgBadge(dailyAvg, prevRev > 0 ? prevRev / nDays : 0) },
            { label: 'AOV', value: `₹${Math.round(aov).toLocaleString('en-IN')}`, sub: 'Gross rev ÷ orders', badge: shChgBadge(aov, prevOrders > 0 ? prevRev / prevOrders : 0) },
            { label: 'ASP', value: `₹${Math.round(asp).toLocaleString('en-IN')}`, sub: 'Net rev ÷ units sold', badge: shChgBadge(asp, prevUnits > 0 ? prevNetRev / prevUnits : 0) },
          ]
          const prevCancelPct = prevOrders > 0 ? prevCancelledOrders / prevOrders * 100 : 0
          const prevCirPct = prevOrders > 0 ? prevCirOrders / prevOrders * 100 : 0
          const prevExchangePct = prevOrders > 0 ? prevExchangeOrders / prevOrders * 100 : 0
          const prevRtoPct = prevOrders > 0 ? prevRtoOrders / prevOrders * 100 : 0
          const prevReturnRevPct = prevRev > 0 ? ((prevRtoOrders + prevCirOrders) / prevOrders * 100) : 0
          const row2 = [
            { label: 'Cancellation %', value: `${cancelPct.toFixed(1)}%`, sub: `${fmtN(cancelledOrders)} cancelled`, accent: cancelPct > 5 ? '#7A1A1A' : undefined, badge: shReturnBadge(cancelPct, prevCancelPct) },
            { label: 'CIR %', value: `${cirPct.toFixed(1)}%`, sub: `${fmtN(cirOrders)} CIR orders`, badge: shReturnBadge(cirPct, prevCirPct) },
            { label: 'Exchange %', value: `${exchangePct.toFixed(1)}%`, sub: `${fmtN(exchangeOrders)} exchange orders`, badge: shReturnBadge(exchangePct, prevExchangePct) },
            { label: 'RTO %', value: `${rtoPct.toFixed(1)}%`, sub: `${fmtN(rtoOrders)} RTO orders`, accent: rtoPct > 10 ? '#7A1A1A' : undefined, badge: shReturnBadge(rtoPct, prevRtoPct) },
            { label: 'Return %', value: `${returnRevPct.toFixed(1)}%`, sub: `${fmt((data.rtoRevDirect || 0) + (data.cirRev || 0))} RTO+CIR rev`, accent: returnRevPct > 5 ? '#7A1A1A' : undefined, badge: shReturnBadge(returnRevPct, prevReturnRevPct) },
          ]
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, flex: 1 }}>
                {row1.map(k => (
                  <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
                    <div className="kpi-label">{k.label}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                      <div className="kpi-value" style={{ fontSize: 17 }}>{k.value}</div>
                      {k.badge}
                    </div>
                    {k.sub && <div className="kpi-sub">{k.sub}</div>}
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, flex: 1 }}>
                {row2.map(k => (
                  <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
                    <div className="kpi-label">{k.label}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                      <div className="kpi-value" style={{ fontSize: 17, ...(k.accent ? { color: k.accent } : {}) }}>{k.value}</div>
                      {k.badge}
                    </div>
                    {k.sub && <div className="kpi-sub">{k.sub}</div>}
                  </div>
                ))}
              </div>
            </div>
          )
        })()}
      </div>
      <div className="g-2">
        {(() => {
          const returnTrendMap = {}
          ;(data.dailyReturnTrend || []).forEach(x => { returnTrendMap[x.date] = x })
          // Net Revenue line: apply the same period-level shrink as the KPI
          // (Gross − Cancel − RTO − CIR, then strip GST)
          const netShrinkFactor = totalRev > 0 ? (grossAfterReturns / totalRev) * (1 - gstRatio) : (1 - gstRatio)
          // Use Shopify-specific daily (EXCLUDES Shopify B2B)
          const rawDaily = (sh.daily || []).map(d => {
            const grossRev = d.rev || 0
            const rt = returnTrendMap[d.date] || {}
            return { date: d.date, grossRev, netRev: grossRev > 0 ? grossRev * netShrinkFactor : 0, rtoPct: rt.rtoPct || 0, exchPct: rt.exchPct || 0, cirPct: rt.cirPct || 0, cancelPct: rt.cancelPct || 0 }
          }).filter(d => d.grossRev > 0)

          const grouped = (() => {
            if (shTrendGroup === 'daily') return rawDaily
            const buckets = {}
            rawDaily.forEach(d => {
              const dt = new Date(d.date)
              let key
              if (shTrendGroup === 'weekly') {
                const day = dt.getDay(), diff = dt.getDate() - day + (day === 0 ? -6 : 1)
                key = new Date(dt.setDate(diff)).toISOString().slice(0, 10)
              } else if (shTrendGroup === 'monthly') {
                key = d.date.slice(0, 7)
              } else {
                const m = parseInt(d.date.slice(5, 7))
                const q = Math.ceil(m / 3)
                key = `${d.date.slice(0, 4)}-Q${q}`
              }
              if (!buckets[key]) buckets[key] = { date: key, grossRev: 0, netRev: 0, rtoPct: 0, exchPct: 0, cirPct: 0, cancelPct: 0, _n: 0 }
              buckets[key].grossRev += d.grossRev
              buckets[key].netRev += d.netRev
              buckets[key].rtoPct += d.rtoPct
              buckets[key].exchPct += d.exchPct
              buckets[key].cirPct += d.cirPct
              buckets[key].cancelPct += d.cancelPct
              buckets[key]._n += 1
            })
            return Object.values(buckets).map(b => ({ ...b, rtoPct: b._n ? b.rtoPct / b._n : 0, exchPct: b._n ? b.exchPct / b._n : 0, cirPct: b._n ? b.cirPct / b._n : 0, cancelPct: b._n ? b.cancelPct / b._n : 0 })).sort((a, b) => a.date.localeCompare(b.date))
          })()

          const xFmt = d => shTrendGroup === 'daily' ? d?.slice(5) : shTrendGroup === 'monthly' ? d?.slice(0, 7) : d
          return (
            <Card title="Revenue & Returns Trend" action={
              <select value={shTrendGroup} onChange={e => setShTrendGroup(e.target.value)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', outline: 'none' }}>
                {['daily','weekly','monthly','quarterly'].map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
              </select>
            }>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={grouped} margin={{ top: 4, right: 50, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="shGrossGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FFD600" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#FFD600" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="shNetGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0D9E68" stopOpacity={0.32} />
                      <stop offset="95%" stopColor="#0D9E68" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={xFmt} />
                  <YAxis yAxisId="rev" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => fmt(v)} width={60} />
                  <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => `${v.toFixed(1)}%`} width={40} />
                  <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 11px', fontSize: 11 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4, color: C.t2 }}>{xFmt(label)}</div>
                      {payload.map(p => <div key={p.name} style={{ color: p.color }}>{p.name}: {(p.yAxisId === 'pct' || p.name.endsWith('%')) ? `${Number(p.value).toFixed(1)}%` : fmt(p.value)}</div>)}
                    </div>
                  ) : null} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area yAxisId="rev" type="monotone" dataKey="grossRev" name="Gross Revenue" stroke="#E0B800" fill="url(#shGrossGrad)" strokeWidth={2.5} dot={false} />
                  <Area yAxisId="rev" type="monotone" dataKey="netRev" name="Net Revenue" stroke="#0D9E68" fill="url(#shNetGrad)" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                  <Line yAxisId="pct" type="monotone" dataKey="rtoPct" name="RTO %" stroke="#E24B4A" strokeWidth={1.5} dot={false} />
                  <Line yAxisId="pct" type="monotone" dataKey="cirPct" name="CIR %" stroke="#2E74CC" strokeWidth={1.5} dot={false} strokeDasharray="5 3" />
                  <Line yAxisId="pct" type="monotone" dataKey="exchPct" name="Exchange %" stroke="#9B59B6" strokeWidth={1.5} dot={false} strokeDasharray="3 2" />
                  <Line yAxisId="pct" type="monotone" dataKey="cancelPct" name="Cancellation %" stroke="#B91C1C" strokeWidth={1.5} dot={false} strokeDasharray="6 2" />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          )
        })()}
        <Card title="Category Revenue">
          {catRows.slice(0, 8).map((r, i) => { const dots = ['#534AB7','#0D9E68','#2E74CC','#CC8A00','#CC4078','#E24B4A','#9B59B6','#FF6B35']; const isSelected = (filters.category || []).includes(r.name); return <HBar key={r.name} dot={dots[i % dots.length]} label={r.name} width={(r.rev / (catRows[0]?.rev || 1)) * 100} value={fmt(r.rev)} pctVal={totalRev ? pct(r.rev, totalRev) : '—'} isSelected={isSelected} onClick={() => { const next = isSelected ? [] : [r.name]; setSelectedCat(next[0] || null); setFilters(f => ({ ...f, category: next, subCategory: [] })) }} /> })}
        </Card>
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
        <ShopifyGeoDonutRow regionRows={sh.regionRows || []} tierRows={sh.tierRows || []} topStates={sh.topStates || []} allStateRows={Object.entries(sh.stateMap || {}).map(([k, v]) => ({ name: k, rev: v.rev, orders: v.orders?.size || 0 }))} />
        <TopSubCatBar subCatRows={allSubCatRows} />
      </div>
      {/* Category Revenue Matrix · Shopify */}
      {(() => {
        const catData = {}
        Object.entries(sh.catMap || {}).forEach(([cat, v]) => {
          catData[cat] = { rev: v.rev || 0, excRev: v.excRev || 0, units: v.units || 0 }
        })
        const subCatData = {}
        Object.entries(sh.subCatMap || {}).forEach(([key, v]) => {
          const [cat, sc] = key.split('::')
          if (!subCatData[cat]) subCatData[cat] = {}
          subCatData[cat][sc] = { rev: v.rev || 0, excRev: v.excRev || 0, units: v.units || 0 }
        })
        const skuData = {}
        Object.entries(sh.skuMap || {}).forEach(([cat, scMap]) => {
          skuData[cat] = {}
          Object.entries(scMap).forEach(([sc, skuMap_]) => {
            skuData[cat][sc] = {}
            Object.entries(skuMap_).forEach(([sku, v]) => {
              skuData[cat][sc][sku] = { rev: v.rev || 0, excRev: v.excRev || 0, units: v.units || 0 }
            })
          })
        })
        return <FinancialCategoryMatrix catData={catData} subCatData={subCatData} skuData={skuData} title={`Category Revenue Matrix · Shopify ${isIntl ? 'International' : 'India'}`} neutral={true} showShare={true} />
      })()}
      {false && <div className="g-2" style={{ alignItems: 'stretch' }}>
        {(() => {
          const FIXED_H = 420
          const CAT_COLORS = ['#534AB7','#0D9E68','#2E74CC','#CC8A00','#CC4078','#E24B4A','#9B59B6','#FF6B35','#00B4D8','#06D6A0']
          const colorOf = name => { const idx = catRows.findIndex(r => r.name === name); return CAT_COLORS[idx >= 0 ? idx % CAT_COLORS.length : 0] }
          const btnStyle = v => ({ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${shCatView === v ? C.acm : C.border}`, background: shCatView === v ? C.acc : 'transparent', color: shCatView === v ? C.t1 : C.t2, cursor: 'pointer', fontFamily: 'var(--font)' })
          const totalCatRev = catRows.reduce((s, r) => s + r.rev, 0)
          return (
            <Card title="Category Revenue" note={selectedCat ? <span style={{ cursor: 'pointer', color: C.acc, fontWeight: 600 }} onClick={() => { setSelectedCat(null); setFilters(f => ({ ...f, category: [], subCategory: [] })) }}>✕ Clear</span> : `${catRows.length} total`}
              action={<div style={{ display: 'flex', gap: 4 }}>
                <button style={btnStyle('table')} onClick={() => setShCatView('table')}>Table</button>
                <button style={btnStyle('bar')} onClick={() => setShCatView('bar')}>Bar</button>
              </div>}>
              {shCatView === 'table' && (
                <div style={{ overflowY: 'auto', maxHeight: FIXED_H }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead style={{ position: 'sticky', top: 0, background: C.card, zIndex: 1 }}><tr>{[{ label: 'Category' }, { label: 'Revenue / % Share', align: 'right' }, { label: 'Orders', align: 'right' }, { label: 'Units', align: 'right' }, { label: 'ASP', align: 'right' }].map(c => <th key={c.label} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, textAlign: c.align || 'left', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}` }}>{c.label}</th>)}</tr></thead>
                    <tbody>{catRows.map((r, i) => { const isSelected = selectedCat === r.name; const share = totalCatRev ? (r.rev / totalCatRev * 100).toFixed(1) + '%' : '—'; return <tr key={r.name} onClick={() => { const next = isSelected ? null : r.name; setSelectedCat(next); setFilters(f => ({ ...f, category: next ? [next] : [], subCategory: [] })) }} style={{ borderBottom: i < catRows.length - 1 ? `1px solid ${C.border}` : 'none', background: isSelected ? C.acl : '', cursor: 'pointer' }} onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#FFFBE6' }} onMouseLeave={e => { e.currentTarget.style.background = isSelected ? C.acl : '' }}><td style={{ padding: '5.5px 5px', color: C.t2 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: colorOf(r.name), marginRight: 6 }} />{isSelected ? <strong>{r.name}</strong> : r.name}</td><td style={{ padding: '5.5px 5px', textAlign: 'right' }}><span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t1 }}>{fmt(r.rev)}</span><span style={{ fontSize: 10, color: C.t3, marginLeft: 5 }}>({share})</span></td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>{fmtN(r.orders)}</td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>{fmtN(r.units)}</td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>₹{Math.round(r.asp).toLocaleString('en-IN')}</td></tr> })}</tbody>
                  </table>
                </div>
              )}
              {shCatView === 'bar' && (
                <ResponsiveContainer width="100%" height={FIXED_H}>
                  <BarChart data={catRows} layout="vertical" margin={{ top: 0, right: 60, bottom: 0, left: 100 }}>
                    <XAxis type="number" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => v >= 1e7 ? `${(v/1e7).toFixed(1)}Cr` : v >= 1e5 ? `${(v/1e5).toFixed(0)}L` : fmt(v)} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: C.t2 }} width={95} />
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                    <Tooltip formatter={v => fmt(v)} />
                    <Bar dataKey="rev" name="Revenue" radius={[0,4,4,0]} onClick={r => { const next = selectedCat === r.name ? null : r.name; setSelectedCat(next); setFilters(f => ({ ...f, category: next ? [next] : [], subCategory: [] })) }}>
                      {catRows.map(r => <Cell key={r.name} fill="#FFD600" opacity={selectedCat && selectedCat !== r.name ? 0.35 : 1} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          )
        })()}
        {(() => {
          const FIXED_H = 420
          const scColorOf = () => '#FFD600'
          const btnStyle = v => ({ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${shSubCatView === v ? C.acm : C.border}`, background: shSubCatView === v ? C.acc : 'transparent', color: shSubCatView === v ? C.t1 : C.t2, cursor: 'pointer', fontFamily: 'var(--font)' })
          const totalSubRev = subCatRows.reduce((s, r) => s + r.rev, 0)
          return (
            <Card title={selectedCat ? `Sub-categories · ${selectedCat}` : 'Sub-categories'} note={`${subCatRows.length} total`}
              action={<div style={{ display: 'flex', gap: 4 }}>
                <button style={btnStyle('table')} onClick={() => setShSubCatView('table')}>Table</button>
                <button style={btnStyle('bar')} onClick={() => setShSubCatView('bar')}>Bar</button>
              </div>}>
              {shSubCatView === 'table' && (
                <div style={{ overflowY: 'auto', maxHeight: FIXED_H }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead style={{ position: 'sticky', top: 0, background: C.card, zIndex: 1 }}><tr>{[{ label: 'Sub-category' }, { label: 'Revenue / % Share', align: 'right' }, { label: 'Orders', align: 'right' }, { label: 'Units', align: 'right' }, { label: 'ASP', align: 'right' }].map(c => <th key={c.label} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, textAlign: c.align || 'left', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}` }}>{c.label}</th>)}</tr></thead>
                    <tbody>{subCatRows.map((r, i) => { const isSelSub = (filters.subCategory || []).includes(r.name); const share = totalSubRev ? (r.rev / totalSubRev * 100).toFixed(1) + '%' : '—'; return <tr key={r.name} onClick={() => { const next = isSelSub ? [] : [r.name]; setFilters(f => ({ ...f, subCategory: next })) }} style={{ borderBottom: i < subCatRows.length - 1 ? `1px solid ${C.border}` : 'none', background: isSelSub ? C.acl : '', cursor: 'pointer' }} onMouseEnter={e => { if (!isSelSub) e.currentTarget.style.background = '#FFFBE6' }} onMouseLeave={e => { e.currentTarget.style.background = isSelSub ? C.acl : '' }}><td style={{ padding: '5.5px 5px', color: C.t2 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: scColorOf(), marginRight: 6 }} />{isSelSub ? <strong>{r.name}</strong> : r.name}</td><td style={{ padding: '5.5px 5px', textAlign: 'right' }}><span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t1 }}>{fmt(r.rev)}</span><span style={{ fontSize: 10, color: C.t3, marginLeft: 5 }}>({share})</span></td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>{fmtN(r.orders)}</td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>{fmtN(r.units)}</td><td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>₹{Math.round(r.asp).toLocaleString('en-IN')}</td></tr> })}</tbody>
                  </table>
                </div>
              )}
              {shSubCatView === 'bar' && (
                <div style={{ overflowY: 'auto', maxHeight: FIXED_H }}>
                  <ResponsiveContainer width="100%" height={Math.max(FIXED_H, subCatRows.length * 26)}>
                    <BarChart data={subCatRows} layout="vertical" margin={{ top: 0, right: 60, bottom: 0, left: 140 }}>
                      <XAxis type="number" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => v >= 1e7 ? `${(v/1e7).toFixed(1)}Cr` : v >= 1e5 ? `${(v/1e5).toFixed(0)}L` : fmt(v)} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: C.t2 }} width={135} />
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                      <Tooltip formatter={v => fmt(v)} />
                      <Bar dataKey="rev" name="Revenue" radius={[0,4,4,0]}>{subCatRows.map((r, i) => <Cell key={r.name} fill={scColorOf(r.name, i)} />)}</Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          )
        })()}
      </div>}
      <div className="g-2" style={{ alignItems: 'stretch' }}>
        <ShopifyGeoRichTable title="Top States" rows={stateRows} firstKey="state" firstLabel="State" formatFirst={v => v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : v} />
        <ShopifyGeoRichTable title="Top Cities" rows={enrichedCityRows} firstKey="city" firstLabel="City" formatFirst={v => v ? v.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : v} />
      </div>
    </div>
  )
}

function AmazonTab({ data, region = 'india', setRegion = () => {} }) {
  const [subView, setSubView] = useState('overview') // 'overview' | 'sc' | 'vc'
  const [intlMetric, setIntlMetric] = useState('rev')
  const [selectedCat, setSelectedCat] = useState(null)
  const [selectedSubCat, setSelectedSubCat] = useState(null)
  const amzSC = data.amzSC || {}
  const amzVC = data.amzVC || {}
  const amzVCMatrix = data.amzVCMatrix || {}
  const amzIntl = data.amzIntl || {}

  const toggleStyle = active => ({ fontSize: 12, fontWeight: active ? 700 : 500, padding: '5px 18px', borderRadius: 7, border: `1.5px solid ${active ? C.acm : C.border2}`, background: active ? C.acc : C.card, color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all .12s' })
  const subToggleStyle = active => ({ fontSize: 12, fontWeight: 700, padding: '5px 16px', borderRadius: 7, border: `1.5px solid ${active ? C.t1 : C.border}`, background: active ? C.t1 : C.card, color: active ? '#fff' : C.t1, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all .15s', boxShadow: active ? '0 2px 6px rgba(0,0,0,.15)' : 'none' })

  // Rolling 30d return rate — data is pre-filtered to reliable dates (latest_settlement - 15 days)
  const returnRateReliable = (amzSC.returnRate?.daily || []).length > 0

  // ── Seller Central calcs ──
  const scFBA = amzSC.fulfillment?.find(f => f.type === 'FBA') || { orders: 0, rev: 0, excRev: 0, units: 0 }
  const scMFN = amzSC.fulfillment?.find(f => f.type === 'MFN') || { orders: 0, rev: 0, excRev: 0, units: 0 }
  const scTotalRev = scFBA.rev + scMFN.rev
  const scTotalExcRev = (scFBA.excRev || 0) + (scMFN.excRev || 0)
  const scTotalOrders = scFBA.orders + scMFN.orders
  const scAOV = scTotalOrders ? scTotalRev / scTotalOrders : 0
  const scTotalUnits = scFBA.units + scMFN.units
  const scCancelOrders = amzSC.status?.find(s => s.status === 'Cancelled')?.orders || 0
  const scStatusTotal = (amzSC.status || []).reduce((s, x) => s + x.orders, 0)
  const scCancelRate = scStatusTotal ? (scCancelOrders / scStatusTotal * 100) : 0
  const scPending = amzSC.status?.find(s => s.status === 'Pending')?.orders || 0
  // Daily SC - pivot FBA/MFN into single daily array
  const [scChartMetric, setScChartMetric] = useState('rev')
  const [scTrendGroup, setScTrendGroup] = useState('daily')
  const [ovTrendMetric, setOvTrendMetric] = useState('rev')
  const [ovTrendGroup, setOvTrendGroup] = useState('daily')
  const [vcTrendMetric, setVcTrendMetric] = useState('rev')
  const [vcTrendGroup, setVcTrendGroup] = useState('daily')
  const scDailyMap = {}
  ;(amzSC.daily || []).forEach(d => {
    if (!scDailyMap[d.date]) scDailyMap[d.date] = { date: d.date, FBA: 0, MFN: 0, FBA_orders: 0, MFN_orders: 0, FBA_units: 0, MFN_units: 0 }
    scDailyMap[d.date][d.type] = d.rev
    scDailyMap[d.date][d.type + '_orders'] = d.orders
    scDailyMap[d.date][d.type + '_units'] = d.units || 0
  })
  const scDailyArr = Object.values(scDailyMap).sort((a, b) => a.date.localeCompare(b.date))
  const maxStateRev = Math.max(...(amzSC.states || []).map(s => s.rev), 1)

  // ── Vendor Central calcs ──
  const vcTotalOrdered = amzVC.accounts?.reduce((s, a) => s + a.orderedRev, 0) || 0
  const vcTotalOrderedExcRev = amzVC.accounts?.reduce((s, a) => s + (a.orderedExcRev || 0), 0) || 0
  const vcTotalShipped = amzVC.accounts?.reduce((s, a) => s + a.shippedRev, 0) || 0
  const vcTotalOrderedUnits = amzVC.accounts?.reduce((s, a) => s + a.orderedUnits, 0) || 0
  const vcTotalShippedUnits = amzVC.accounts?.reduce((s, a) => s + a.shippedUnits, 0) || 0
  const vcTotalReturns = amzVC.accounts?.reduce((s, a) => s + a.returns, 0) || 0
  const vcFillRate = vcTotalOrderedUnits ? (vcTotalShippedUnits / vcTotalOrderedUnits * 100) : 0
  const vcReturnRate = vcTotalShippedUnits ? (vcTotalReturns / vcTotalShippedUnits * 100) : 0
  const vcMaxRev = Math.max(...(amzVC.accounts || []).map(a => a.orderedRev), 1)

  // ── Category filter overrides ──
  const scDailyCatFiltered = selectedCat ? (amzSC.dailyCat || []).filter(x => selectedSubCat ? x.category === selectedCat && x.subcategory === selectedSubCat : x.category === selectedCat) : null
  const vcDailyCatFiltered = selectedCat ? (amzVCMatrix.dailyCat || []).filter(x => selectedSubCat ? x.category === selectedCat && x.subcategory === selectedSubCat : x.category === selectedCat) : null
  const scCatRev = scDailyCatFiltered ? scDailyCatFiltered.reduce((s, x) => s + x.rev, 0) : scTotalRev
  const scCatExcRev = scDailyCatFiltered ? scDailyCatFiltered.reduce((s, x) => s + x.excRev, 0) : scTotalExcRev
  const scCatOrders = scDailyCatFiltered ? scDailyCatFiltered.reduce((s, x) => s + x.orders, 0) : scTotalOrders
  const scCatUnits = scDailyCatFiltered ? scDailyCatFiltered.reduce((s, x) => s + x.units, 0) : scTotalUnits
  const vcCatRev = vcDailyCatFiltered ? vcDailyCatFiltered.reduce((s, x) => s + x.rev, 0) : vcTotalOrdered
  const vcCatExcRev = vcDailyCatFiltered ? vcDailyCatFiltered.reduce((s, x) => s + x.excRev, 0) : vcTotalOrderedExcRev
  const vcCatOrders = vcDailyCatFiltered ? vcDailyCatFiltered.reduce((s, x) => s + x.orders, 0) : 0
  const vcCatUnits = vcDailyCatFiltered ? vcDailyCatFiltered.reduce((s, x) => s + x.units, 0) : vcTotalOrderedUnits
  const scDailyCatArr = scDailyCatFiltered
    ? (() => { const m = {}; scDailyCatFiltered.forEach(x => { if (!m[x.date]) m[x.date] = { date: x.date, FBA: 0, MFN: 0, FBA_orders: 0, MFN_orders: 0, FBA_units: 0, MFN_units: 0 }; m[x.date][(x.ch||'FBA')] = (m[x.date][(x.ch||'FBA')]||0) + x.rev; m[x.date][(x.ch||'FBA')+'_orders'] = (m[x.date][(x.ch||'FBA')+'_orders']||0) + x.orders; m[x.date][(x.ch||'FBA')+'_units'] = (m[x.date][(x.ch||'FBA')+'_units']||0) + x.units }); return Object.values(m).sort((a,b) => a.date.localeCompare(b.date)) })()
    : scDailyArr

  // ── Amazon prev-period for HeroKPICard ──
  const amzPrevSCRev = amzSC.prevRev || 0
  const amzPrevVCRev = amzVC.prevRev || 0
  const amzPrevTotalRev = amzPrevSCRev + amzPrevVCRev
  const amzTotalRev = scTotalRev + vcTotalOrdered
  const amzTotalChg = amzPrevTotalRev > 0 ? ((amzTotalRev - amzPrevTotalRev) / amzPrevTotalRev * 100) : null
  const amzSCChg = amzPrevSCRev > 0 ? ((scTotalRev - amzPrevSCRev) / amzPrevSCRev * 100) : null
  const amzVCChg = amzPrevVCRev > 0 ? ((vcTotalOrdered - amzPrevVCRev) / amzPrevVCRev * 100) : null
  const amzPrevDailyArr = amzSC.prevDaily || []
  const amzSparkData = Array.from({ length: Math.max(scDailyCatArr.length, amzPrevDailyArr.length) }, (_, i) => {
    const cur = scDailyCatArr[i]
    const pre = amzPrevDailyArr[i]
    return { i, cur: cur ? (cur.FBA || 0) + (cur.MFN || 0) : null, prev: pre?.rev ?? null }
  })

  // ── International calcs ──
  const intlTotalRev = amzIntl.countries?.reduce((s, c) => s + c.rev, 0) || 0
  const intlTotalOrders = amzIntl.countries?.reduce((s, c) => s + c.orders, 0) || 0
  const intlAOV = intlTotalOrders ? intlTotalRev / intlTotalOrders : 0
  const intlDots = { UAE: '#E8930A', UK: '#2E74CC', US: '#0D9E68', Unknown: C.t3 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Region + sub-view in one row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {/* Pill toggle: India / International */}
        <div style={{ display: 'flex', background: C.bg, borderRadius: 9, padding: 3, border: `1px solid ${C.border}`, gap: 0 }}>
          {[{ id: 'india', label: 'India', img: 'https://flagcdn.com/w20/in.png' }, { id: 'intl', label: 'International', emoji: '🌍' }].map(opt => (
            <button key={opt.id} onClick={() => { setRegion(opt.id); setSubView('overview') }} style={{ fontSize: 12, fontWeight: region === opt.id ? 700 : 500, padding: '5px 16px', borderRadius: 7, border: 'none', background: region === opt.id ? C.acc : 'transparent', color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all .15s', boxShadow: region === opt.id ? '0 1px 4px rgba(0,0,0,.10)' : 'none', display: 'flex', alignItems: 'center', gap: 5 }}>{opt.img ? <img src={opt.img} width="18" style={{ verticalAlign: 'middle', borderRadius: 2 }} /> : <span style={{ fontFamily: 'sans-serif' }}>{opt.emoji}</span>}{opt.label}</button>
          ))}
        </div>
        {/* Divider */}
        {region === 'india' && <span style={{ color: C.border2, fontSize: 18, lineHeight: 1 }}>│</span>}
        {/* Sub-toggle: SC / VC — India only */}
        {region === 'india' && (
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ id: 'sc', label: 'Seller Central' }, { id: 'vc', label: 'Vendor Central' }].map(opt => (
              <button key={opt.id} onClick={() => { setSubView(opt.id); setSelectedCat(null); setSelectedSubCat(null) }} style={subToggleStyle(subView === opt.id)}>{opt.label}</button>
            ))}
          </div>
        )}
      </div>

      {/* ── INDIA · OVERVIEW (SC + VC combined) ── */}
      {region === 'india' && subView === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* KPI layout: hero + 2 rows of 4 */}
          {(() => {
            const amzChgBadge = (cur, prev) => { if (!prev || Math.abs(prev) < 1) return null; const p = (cur - prev) / prev * 100; if (Math.abs(p) > 999) return null; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> }
            const amzPrevOrders = amzSC.prevOrders || 0
            const amzPrevUnits = amzSC.prevUnits || 0
            const amzPrevFbaRev = amzSC.prevFbaRev || 0
            const amzPrevCancelledOrders = amzSC.prevCancelledOrders || 0
            const amzPrevAOV = amzPrevOrders > 0 ? amzPrevSCRev / amzPrevOrders : 0
            const amzPrevASP = amzPrevUnits > 0 ? amzPrevSCRev / amzPrevUnits : 0
            const amzPrevDailyAvg = amzPrevTotalRev > 0 ? amzPrevTotalRev / (data.nDays || 1) : 0
            const amzPrevFbaShare = amzPrevSCRev > 0 ? (amzPrevFbaRev / amzPrevSCRev * 100) : 0
            const amzPrevCancelRate = amzPrevOrders > 0 ? (amzPrevCancelledOrders / amzPrevOrders * 100) : 0
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
                <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
                  <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue · SC + VC{selectedCat ? ` · ${selectedSubCat || selectedCat}` : ''}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                    <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(scCatRev + vcCatRev)}</div>
                    {amzTotalChg !== null && !selectedCat && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: amzTotalChg >= 0 ? C.green.bg : C.red.bg, color: amzTotalChg >= 0 ? C.green.tx : C.red.tx }}>{amzTotalChg >= 0 ? '▲' : '▼'} {Math.abs(amzTotalChg).toFixed(1)}%</span>}
                  </div>
                  <div className="kpi-sub" style={{ fontSize: 13 }}>{fmtN(scCatOrders + vcCatOrders)} orders · {fmtN(scCatUnits + vcCatUnits)} units</div>
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={amzSparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                        <defs><linearGradient id="amzGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#FFD600" stopOpacity={0.25} /><stop offset="95%" stopColor="#FFD600" stopOpacity={0} /></linearGradient></defs>
                        <Area type="monotone" dataKey="cur" name="Current" stroke="#FFD600" strokeWidth={2} fill="url(#amzGrad)" dot={false} connectNulls />
                        <Area type="monotone" dataKey="prev" name="Prev" stroke={C.t3} strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
                        <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ color: p.name === 'Current' ? C.t1 : C.t3 }}>{p.name}: {fmt(p.value)}</div>)}</div> : null} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, flex: 1 }}>
                    {[
                      { label: 'SC Revenue', value: fmt(scCatRev), sub: 'Seller Central', badge: selectedCat ? null : amzChgBadge(scTotalRev, amzPrevSCRev) },
                      { label: 'VC Revenue', value: fmt(vcCatRev), sub: 'Vendor Central', badge: selectedCat ? null : amzChgBadge(vcTotalOrdered, amzPrevVCRev) },
                      { label: 'Net Revenue', value: fmt(scCatExcRev + vcCatExcRev), sub: 'SC + VC excl. GST', badge: selectedCat ? null : amzChgBadge(scTotalExcRev + vcTotalOrderedExcRev, (amzSC.prevExcRev || 0) + (amzVC.prevExcRev || 0)) },
                      { label: 'GST Collected', value: fmt((scCatRev - scCatExcRev) + (vcCatRev - vcCatExcRev)), sub: 'SC + VC GST', badge: selectedCat ? null : amzChgBadge((scTotalRev - scTotalExcRev) + (vcTotalOrdered - vcTotalOrderedExcRev), ((amzSC.prevRev || 0) - (amzSC.prevExcRev || 0)) + ((amzVC.prevRev || 0) - (amzVC.prevExcRev || 0))) },
                    ].map(k => (
                      <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
                        <div className="kpi-label">{k.label}</div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}><div className="kpi-value" style={{ fontSize: 17 }}>{k.value}</div>{k.badge}</div>
                        {k.sub && <div className="kpi-sub">{k.sub}</div>}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, flex: 1 }}>
                    {[
                      { label: 'Daily Avg', value: fmt((scCatRev + vcCatRev) / (data.nDays || 1)), sub: 'SC + VC per day', badge: selectedCat ? null : amzChgBadge((scTotalRev + vcTotalOrdered) / (data.nDays || 1), amzPrevDailyAvg) },
                      { label: 'ASP', value: `₹${scCatUnits ? Math.round(scCatRev / scCatUnits).toLocaleString('en-IN') : 0}`, sub: 'SC avg selling price / unit', badge: selectedCat ? null : amzChgBadge(scTotalUnits ? scTotalRev / scTotalUnits : 0, amzPrevASP) },
                      { label: 'Cancellation Rate', value: `${scCancelRate.toFixed(1)}%`, sub: `${fmtN(scCancelOrders)} cancelled`, accent: scCancelRate > 10 ? '#7A1A1A' : undefined, badge: amzPrevCancelRate ? (() => { const p = (scCancelRate - amzPrevCancelRate) / amzPrevCancelRate * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p > 0 ? C.red.bg : C.green.bg, color: p > 0 ? C.red.tx : C.green.tx, flexShrink: 0 }}>{p > 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> })() : null },
                      { label: 'Return% (SC)', value: returnRateReliable ? `${(amzSC.returnRate?.pct || 0).toFixed(1)}%` : 'N/A', sub: returnRateReliable ? `Rolling 30d · ${fmtN(amzSC.returnRate?.rollReturned || 0)} of ${fmtN(amzSC.returnRate?.rollOrders || 0)} orders` : 'No reliable data', accent: returnRateReliable && (amzSC.returnRate?.pct || 0) > 18 ? '#7A1A1A' : undefined },
                    ].map(k => (
                      <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
                        <div className="kpi-label">{k.label}</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                          <div className="kpi-value" style={{ fontSize: 17, ...(k.accent ? { color: k.accent } : {}) }}>{k.value}</div>
                          {k.badge}
                        </div>
                        {k.sub && <div className="kpi-sub">{k.sub}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })()}
          {/* Overview Trend Analysis: SC + VC combined */}
          {(() => {
            const vcDailyMap = {}
            if (selectedCat) {
              vcDailyCatFiltered?.forEach(d => { if (!vcDailyMap[d.date]) vcDailyMap[d.date] = { orderedRev: 0, orderedUnits: 0 }; vcDailyMap[d.date].orderedRev += d.rev; vcDailyMap[d.date].orderedUnits += d.units })
            } else {
              ;(amzVC.daily || []).forEach(d => { vcDailyMap[d.date] = { orderedRev: d.orderedRev || 0, orderedUnits: d.orderedUnits || 0 } })
            }
            const gstRate = scTotalRev > 0 ? (scTotalRev - scTotalExcRev) / scTotalRev : 0
            const allDates = [...new Set([...scDailyCatArr.map(d => d.date), ...Object.keys(vcDailyMap)])].sort()
            const rawDaily = allDates.map(date => {
              const sc = scDailyCatArr.find(d => d.date === date) || {}
              const vc = vcDailyMap[date] || { orderedRev: 0, orderedUnits: 0 }
              const scRev = (sc.FBA || 0) + (sc.MFN || 0)
              const vcRev = vc.orderedRev
              const gross = scRev + vcRev
              const scO = (sc.FBA_orders || 0) + (sc.MFN_orders || 0)
              const scU = (sc.FBA_units || 0) + (sc.MFN_units || 0)
              const vcU = vc.orderedUnits
              return {
                date,
                grossRev: gross, netRev: gross * (1 - gstRate),
                scRev, vcRev,
                scShare: gross > 0 ? scRev / gross * 100 : null,
                scOrders: scO, vcOrders: vcU,
                totalOrders: scO + vcU,
                scOrderShare: (scO + vcU) > 0 ? scO / (scO + vcU) * 100 : null,
                scUnits: scU, vcUnits: vcU,
                totalUnits: scU + vcU,
                scUnitShare: (scU + vcU) > 0 ? scU / (scU + vcU) * 100 : null,
              }
            })
            const grouped = (() => {
              if (ovTrendGroup === 'daily') return rawDaily
              const buckets = {}
              rawDaily.forEach(d => {
                const dt = new Date(d.date)
                let key
                if (ovTrendGroup === 'weekly') {
                  const day = dt.getDay(), diff = dt.getDate() - day + (day === 0 ? -6 : 1)
                  key = new Date(new Date(d.date).setDate(diff)).toISOString().slice(0, 10)
                } else if (ovTrendGroup === 'monthly') {
                  key = d.date.slice(0, 7)
                } else {
                  key = `${d.date.slice(0, 4)}-Q${Math.ceil(parseInt(d.date.slice(5, 7)) / 3)}`
                }
                if (!buckets[key]) buckets[key] = { date: key, grossRev: 0, netRev: 0, scRev: 0, vcRev: 0, scOrders: 0, vcOrders: 0, totalOrders: 0, scUnits: 0, vcUnits: 0, totalUnits: 0 }
                buckets[key].grossRev += d.grossRev; buckets[key].netRev += d.netRev
                buckets[key].scRev += d.scRev; buckets[key].vcRev += d.vcRev
                buckets[key].scOrders += d.scOrders; buckets[key].vcOrders += d.vcOrders; buckets[key].totalOrders += d.totalOrders
                buckets[key].scUnits += d.scUnits; buckets[key].vcUnits += d.vcUnits; buckets[key].totalUnits += d.totalUnits
              })
              return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date)).map(b => ({
                ...b,
                scShare: b.grossRev > 0 ? b.scRev / b.grossRev * 100 : null,
                scOrderShare: b.totalOrders > 0 ? b.scOrders / b.totalOrders * 100 : null,
                scUnitShare: b.totalUnits > 0 ? b.scUnits / b.totalUnits * 100 : null,
              }))
            })()
            const groupedWithRet = grouped.map(d => ({ ...d }))
            const xFmt = d => ovTrendGroup === 'daily' ? d?.slice(5) : ovTrendGroup === 'monthly' ? d?.slice(0, 7) : d
            const isRev = ovTrendMetric === 'rev', isOrders = ovTrendMetric === 'orders'
            const mainFmt = isRev ? (v => v >= 1e5 ? `${(v/1e5).toFixed(1)}L` : fmt(v)) : (v => fmtN(v))
            const ttFmt = isRev ? fmt : fmtN
            const dk = isRev
              ? { total: 'grossRev', totalName: 'Gross Revenue', sub: 'netRev', subName: 'Net Revenue', a: 'scRev', aName: 'SC Rev', b: 'vcRev', bName: 'VC Rev', share: 'scShare', shareName: 'SC Share %' }
              : isOrders
              ? { total: 'totalOrders', totalName: 'Total Orders', sub: null, a: 'scOrders', aName: 'SC Orders', b: 'vcOrders', bName: 'VC Orders', share: 'scOrderShare', shareName: 'SC Share %' }
              : { total: 'totalUnits', totalName: 'Total Units', sub: null, a: 'scUnits', aName: 'SC Units', b: 'vcUnits', bName: 'VC Units', share: 'scUnitShare', shareName: 'SC Share %' }
            const scRevTotal = grouped.reduce((s, d) => s + (d.scRev || 0), 0)
            const vcRevTotal = grouped.reduce((s, d) => s + (d.vcRev || 0), 0)
            const splitData = [
              { name: 'Seller Central', value: scRevTotal, color: '#E8930A' },
              { name: 'Vendor Central', value: vcRevTotal, color: '#2E74CC' },
            ]
            const statusColors = { Shipped: '#2E74CC', Pending: '#E8930A', Cancelled: '#E24B4A', Shipping: '#9B59B6' }
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 14, alignItems: 'stretch' }}>
                <Card title="Trend Analysis · SC + VC" action={
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[{ v: 'rev', label: 'Revenue' }, { v: 'orders', label: 'Orders' }, { v: 'units', label: 'Units' }].map(opt => (
                        <button key={opt.v} onClick={() => setOvTrendMetric(opt.v)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${ovTrendMetric === opt.v ? C.t1 : C.border}`, background: ovTrendMetric === opt.v ? C.t1 : 'transparent', color: ovTrendMetric === opt.v ? '#fff' : C.t2, cursor: 'pointer', fontFamily: 'var(--font)' }}>{opt.label}</button>
                      ))}
                    </div>
                    <select value={ovTrendGroup} onChange={e => setOvTrendGroup(e.target.value)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', outline: 'none' }}>
                      {['daily','weekly','monthly','quarterly'].map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
                    </select>
                  </div>
                }>
                  <ResponsiveContainer width="100%" height={190}>
                    <ComposedChart data={groupedWithRet} margin={{ top: 4, right: 44, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={xFmt} />
                      <YAxis yAxisId="main" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={mainFmt} width={58} />
                      <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => `${v?.toFixed(0)}%`} domain={[0, 30]} width={36} />
                      <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 11px', fontSize: 11 }}>
                          <div style={{ fontWeight: 700, marginBottom: 4, color: C.t2 }}>{xFmt(label)}</div>
                          {payload.filter(p => p.dataKey !== '_ret').map(p => <div key={p.name} style={{ color: p.color }}>{p.name}: {ttFmt(p.value)}</div>)}
                          {payload.find(p => p.dataKey === '_ret' && p.value != null) && <div style={{ color: '#E24B4A' }}>30d Return Rate: {payload.find(p => p.dataKey === '_ret').value?.toFixed(1)}%</div>}
                        </div>
                      ) : null} />
                      <Legend wrapperStyle={{ fontSize: 10 }} formatter={v => v} />
                      <Area yAxisId="main" type="monotone" dataKey={dk.total} name={dk.totalName} stroke="#FFD600" fill="#FFD60022" strokeWidth={2} dot={false} />
                      {isRev && <Area yAxisId="main" type="monotone" dataKey={dk.sub} name={dk.subName} stroke="#0D9E68" fill="#0D9E6811" strokeWidth={2} dot={false} strokeDasharray="4 2" />}
                      <Line yAxisId="main" type="monotone" dataKey={dk.a} name={dk.aName} stroke="#E8930A" strokeWidth={1.5} dot={false} />
                      <Line yAxisId="main" type="monotone" dataKey={dk.b} name={dk.bName} stroke="#2E74CC" strokeWidth={1.5} dot={false} strokeDasharray="3 2" />
                      <Line yAxisId="pct" dataKey={() => null} dot={false} stroke="none" legendType="none" name=" " />
                      {(amzSC.returnRate?.pct || 0) > 0 && <ReferenceLine yAxisId="pct" y={amzSC.returnRate?.pct || 0} stroke="#E24B4A" strokeWidth={1.5} strokeDasharray="5 3" label={{ value: `Return ${(amzSC.returnRate?.pct || 0).toFixed(1)}%`, position: 'insideTopRight', fontSize: 10, fill: '#E24B4A' }} />}
                    </ComposedChart>
                  </ResponsiveContainer>
                </Card>
                <Card title="SC vs VC · Revenue Split">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
                    <ResponsiveContainer width={140} height={140}>
                      <PieChart>
                        <Pie data={splitData} cx="50%" cy="50%" innerRadius={42} outerRadius={62} dataKey="value" paddingAngle={3}>
                          {splitData.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                        <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 9px', fontSize: 11 }}><div style={{ color: payload[0].payload.color, fontWeight: 600 }}>{payload[0].name}</div><div style={{ color: C.t1 }}>{fmt(payload[0].value)} · {(payload[0].value / (scRevTotal + vcRevTotal) * 100).toFixed(1)}%</div></div> : null} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {splitData.map(s => (
                        <div key={s.name} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: C.t2 }}>{s.name}</span>
                          </div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: C.t1, fontFamily: 'var(--mono)', paddingLeft: 15 }}>{fmt(s.value)}</div>
                          <div style={{ fontSize: 11, color: C.t3, paddingLeft: 15 }}>{(scRevTotal + vcRevTotal) > 0 ? ((s.value / (scRevTotal + vcRevTotal)) * 100).toFixed(1) : 0}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              </div>
            )
          })()}
          <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
            <ShopifyGeoDonutRow regionRows={amzSC.regionRows || []} tierRows={amzSC.tierRows || []} topStates={amzSC.topStates || []} allStateRows={amzSC.topStates || []} />
            <TopSubCatBar subCatRows={(() => { const rows = []; Object.entries(amzSC.subCatChannel || {}).forEach(([cat, scMap]) => { Object.entries(scMap).forEach(([sc, chData]) => { const rev = (chData.FBA?.rev||0)+(chData.MFN?.rev||0); rows.push({ name: sc, rev }) }) }); return rows.sort((a,b) => b.rev - a.rev) })()} />
          </div>
          {(() => {
            const pickRet = (...chs) => { for (const c of chs) if (c?.totalOrdersForReturn) return { returned: c.returned||0, totalOrdersForReturn: c.totalOrdersForReturn } ; return { returned: 0, totalOrdersForReturn: 0 } }
            const allCats = new Set([...Object.keys(amzSC.catChannel || {}), ...Object.keys(amzVCMatrix.catData || {})])
            const catData = {}
            allCats.forEach(cat => {
              const scChData = amzSC.catChannel?.[cat] || {}
              const vc = amzVCMatrix.catData?.[cat] || {}
              catData[cat] = { rev: (scChData.FBA?.rev||0)+(scChData.MFN?.rev||0)+(vc.rev||0), excRev: (scChData.FBA?.excRev||0)+(scChData.MFN?.excRev||0)+(vc.excRev||0), units: (scChData.FBA?.units||0)+(scChData.MFN?.units||0)+(vc.units||0), ...pickRet(scChData.FBA, scChData.MFN) }
            })
            const allScSub = amzSC.subCatChannel || {}
            const allVcSub = amzVCMatrix.subCatData || {}
            const subCatData = {}
            const allCatsForSub = new Set([...Object.keys(allScSub), ...Object.keys(allVcSub)])
            allCatsForSub.forEach(cat => {
              subCatData[cat] = {}
              const allSubs = new Set([...Object.keys(allScSub[cat]||{}), ...Object.keys(allVcSub[cat]||{})])
              allSubs.forEach(sc => {
                const scChD = allScSub[cat]?.[sc] || {}
                const vcD = allVcSub[cat]?.[sc] || {}
                subCatData[cat][sc] = { rev: (scChD.FBA?.rev||0)+(scChD.MFN?.rev||0)+(vcD.rev||0), excRev: (scChD.FBA?.excRev||0)+(scChD.MFN?.excRev||0)+(vcD.excRev||0), units: (scChD.FBA?.units||0)+(scChD.MFN?.units||0)+(vcD.units||0), ...pickRet(scChD.FBA, scChD.MFN) }
              })
            })
            const allScSku = amzSC.skuChannel || {}
            const allVcSku = amzVCMatrix.skuData || {}
            const skuData = {}
            const allCatsForSku = new Set([...Object.keys(allScSku), ...Object.keys(allVcSku)])
            allCatsForSku.forEach(cat => {
              skuData[cat] = {}
              const allSubs = new Set([...Object.keys(allScSku[cat]||{}), ...Object.keys(allVcSku[cat]||{})])
              allSubs.forEach(sc => {
                skuData[cat][sc] = {}
                const allSkus = new Set([...Object.keys(allScSku[cat]?.[sc]||{}), ...Object.keys(allVcSku[cat]?.[sc]||{})])
                allSkus.forEach(sku => {
                  const scChD = allScSku[cat]?.[sc]?.[sku] || {}
                  const vcD = allVcSku[cat]?.[sc]?.[sku] || {}
                  skuData[cat][sc][sku] = { rev: (scChD.FBA?.rev||0)+(scChD.MFN?.rev||0)+(vcD.rev||0), excRev: (scChD.FBA?.excRev||0)+(scChD.MFN?.excRev||0)+(vcD.excRev||0), units: (scChD.FBA?.units||0)+(scChD.MFN?.units||0)+(vcD.units||0), ...pickRet(scChD.FBA, scChD.MFN) }
                })
              })
            })
            return <FinancialCategoryMatrix catData={catData} subCatData={subCatData} skuData={skuData} title="Category Revenue Matrix · Amazon India" showReturns={false} />
          })()}
          {(() => {
            const pickRet = (...chs) => { for (const c of chs) if (c?.totalOrdersForReturn) return { returned: c.returned||0, totalOrdersForReturn: c.totalOrdersForReturn }; return { returned: 0, totalOrdersForReturn: 0 } }
            const allCats = new Set([...Object.keys(amzSC.catChannel || {}), ...Object.keys(amzVCMatrix.catData || {})])
            const catRows = Array.from(allCats).map(cat => {
              const scD = amzSC.catChannel?.[cat] || {}; const vc = amzVCMatrix.catData?.[cat] || {}
              const rev = (scD.FBA?.rev||0)+(scD.MFN?.rev||0)+(vc.rev||0); const units = (scD.FBA?.units||0)+(scD.MFN?.units||0)+(vc.units||0); const orders = (scD.FBA?.orders||0)+(scD.MFN?.orders||0)+(vc.orders||0)
              return { name: cat, rev, units, orders }
            }).sort((a,b) => b.rev - a.rev)
            const allScSub = amzSC.subCatChannel || {}; const allVcSub = amzVCMatrix.subCatData || {}
            const subCatSet = new Set([...Object.keys(allScSub).flatMap(cat => Object.keys(allScSub[cat]||{}).map(sc => cat+'::'+sc)), ...Object.keys(allVcSub).flatMap(cat => Object.keys(allVcSub[cat]||{}).map(sc => cat+'::'+sc))])
            const subCatRows = Array.from(subCatSet).map(key => {
              const [cat, sc] = key.split('::'); const scD = allScSub[cat]?.[sc] || {}; const vc = allVcSub[cat]?.[sc] || {}
              const rev = (scD.FBA?.rev||0)+(scD.MFN?.rev||0)+(vc.rev||0); const units = (scD.FBA?.units||0)+(scD.MFN?.units||0)+(vc.units||0); const orders = (scD.FBA?.orders||0)+(scD.MFN?.orders||0)+(vc.orders||0)
              return { name: sc, category: cat, rev, units, orders }
            }).sort((a,b) => b.rev - a.rev)
            return <CatSubCatRow catRows={catRows} subCatRows={subCatRows} title="Category Revenue · Amazon India" selectedCat={selectedCat} onSelectCat={v => { setSelectedCat(v); setSelectedSubCat(null) }} selectedSubCat={selectedSubCat} onSelectSubCat={setSelectedSubCat} />
          })()}
          <div className="g-2" style={{ alignItems: 'stretch' }}>
            <PaginatedCard title="Top States" rows={(amzSC.states || []).map(s => ({ ...s, state: s.state ? s.state.charAt(0).toUpperCase() + s.state.slice(1).toLowerCase() : s.state, aov: s.orders ? Math.round(s.rev / s.orders) : 0 }))} columns={[
              { key: 'state', label: 'State' },
              { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
              { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) },
              { key: 'aov', label: 'ASP', align: 'right', render: v => `₹${v.toLocaleString('en-IN')}` },
            ]} pageSize={15} />
            <PaginatedCard title="Top Cities" rows={(amzSC.cities || []).map(c => ({ ...c, city: c.city ? c.city.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : c.city, aov: c.orders ? Math.round(c.rev / c.orders) : 0 }))} columns={[
              { key: 'city', label: 'City' },
              { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
              { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) },
              { key: 'aov', label: 'ASP', align: 'right', render: v => `₹${v.toLocaleString('en-IN')}` },
            ]} pageSize={15} />
          </div>
        </div>
      )}

      {/* ── INDIA · SELLER CENTRAL ── */}
      {region === 'india' && subView === 'sc' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Hero + KPI rows */}
          {(() => {
            const scChgBadge = (cur, prev) => { if (!prev || Math.abs(prev) < 1) return null; const p = (cur - prev) / prev * 100; if (Math.abs(p) > 999) return null; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> }
            const prevSCRev = amzSC.prevRev || 0
            const prevSCExcRev = amzSC.prevExcRev || 0
            const prevSCOrders = amzSC.prevOrders || 0
            const prevSCUnits = amzSC.prevUnits || 0
            const prevSCAOV = prevSCOrders > 0 ? prevSCRev / prevSCOrders : 0
            const prevSCASP = prevSCUnits > 0 ? prevSCRev / prevSCUnits : 0
            const prevSCDailyAvg = prevSCRev > 0 ? prevSCRev / (data.nDays || 1) : 0
            const prevSCFbaRev = amzSC.prevFbaRev || 0
            const prevSCFbaShare = prevSCRev > 0 ? prevSCFbaRev / prevSCRev * 100 : 0
            const scSparkData = Array.from({ length: Math.max(scDailyArr.length, (amzSC.prevDaily || []).length) }, (_, i) => {
              const cur = scDailyArr[i]
              const pre = (amzSC.prevDaily || [])[i]
              return { i, cur: cur ? (cur.FBA || 0) + (cur.MFN || 0) : null, prev: pre?.rev ?? null }
            })
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
                <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
                  <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue · Seller Central</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                    <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(scTotalRev)}</div>
                    {scChgBadge(scTotalRev, prevSCRev)}
                  </div>
                  <div className="kpi-sub" style={{ fontSize: 13 }}>{fmtN(amzSC.totalOrders || 0)} orders · {fmtN(amzSC.totalUnits || 0)} units</div>
                  <div style={{ flex: 1, minHeight: 60 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={scSparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                        <defs><linearGradient id="scGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#FFD600" stopOpacity={0.25} /><stop offset="95%" stopColor="#FFD600" stopOpacity={0} /></linearGradient></defs>
                        <Area type="monotone" dataKey="cur" name="Current" stroke="#FFD600" strokeWidth={2} fill="url(#scGrad)" dot={false} connectNulls />
                        <Area type="monotone" dataKey="prev" name="Prev" stroke={C.t3} strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
                        <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ color: p.name === 'Current' ? C.t1 : C.t3 }}>{p.name}: {fmt(p.value)}</div>)}</div> : null} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridAutoRows: '1fr', gap: 10 }}>
                  {[
                    { label: 'Net Revenue (Exc GST)', value: fmt(scTotalExcRev), sub: 'Net after GST deduction', badge: scChgBadge(scTotalExcRev, prevSCExcRev) },
                    { label: 'GST Collected', value: fmt(scTotalRev - scTotalExcRev), sub: 'Gross − Net revenue', badge: scChgBadge(scTotalRev - scTotalExcRev, prevSCRev - prevSCExcRev) },
                    { label: 'AOV', value: `₹${Math.round(scAOV).toLocaleString('en-IN')}`, sub: 'Revenue / Orders', badge: scChgBadge(scAOV, prevSCAOV) },
                    { label: 'ASP', value: `₹${scTotalUnits ? Math.round(scTotalRev / scTotalUnits).toLocaleString('en-IN') : 0}`, sub: 'Revenue / Units', badge: scChgBadge(scTotalRev / (scTotalUnits || 1), prevSCASP) },
                    { label: 'Daily Avg Revenue', value: fmt(scTotalRev / (data.nDays || 1)), sub: 'Revenue per day', badge: scChgBadge(scTotalRev / (data.nDays || 1), prevSCDailyAvg) },
                    { label: 'Order Status', value: (() => { const shipped = amzSC.status?.find(s => s.status === 'Shipped')?.orders || 0; const total = amzSC.totalOrders || 0; return `${total ? (shipped / total * 100).toFixed(1) : 0}% Shipped` })(), sub: `${fmtN(amzSC.totalOrders || 0)} total · ${fmtN(scPending)} pending`, badge: (() => { const shipped = amzSC.status?.find(s => s.status === 'Shipped')?.orders || 0; const total = amzSC.totalOrders || 0; const curPct = total ? shipped / total * 100 : 0; const prevPct = prevSCOrders ? (amzSC.prevShippedOrders || 0) / prevSCOrders * 100 : 0; return scChgBadge(curPct, prevPct) })() },
                    { label: 'Cancellation Rate', value: `${scCancelRate.toFixed(1)}%`, sub: `${fmtN(scCancelOrders)} cancelled`, accent: scCancelRate > 10 ? '#7A1A1A' : undefined, badge: (amzSC.prevCancelledOrders && prevSCOrders) ? (() => { const prevRate = amzSC.prevCancelledOrders / prevSCOrders * 100; const p = (scCancelRate - prevRate) / prevRate * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p > 0 ? C.red.bg : C.green.bg, color: p > 0 ? C.red.tx : C.green.tx, flexShrink: 0 }}>{p > 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> })() : null },
                    { label: 'Return Rate', value: returnRateReliable ? `${(amzSC.returnRate?.pct || 0).toFixed(1)}%` : 'N/A', sub: returnRateReliable ? `Rolling 30d · ${fmtN(amzSC.returnRate?.rollReturned || 0)} of ${fmtN(amzSC.returnRate?.rollOrders || 0)} orders returned` : 'No reliable data', accent: returnRateReliable && (amzSC.returnRate?.pct || 0) > 18 ? '#7A1A1A' : undefined },
                  ].map(k => (
                    <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
                      <div className="kpi-label">{k.label}</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}><div className="kpi-value" style={{ fontSize: 17, ...(k.accent ? { color: k.accent } : {}) }}>{k.value}</div>{k.badge}</div>
                      {k.sub && <div className="kpi-sub">{k.sub}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
          {/* Trend Analysis */}
          {(() => {
            const gstRate = scTotalRev > 0 ? (scTotalRev - scTotalExcRev) / scTotalRev : 0
            const rawDaily = scDailyArr.map(d => {
              const gross = (d.FBA || 0) + (d.MFN || 0)
              const fbaO = d.FBA_orders || 0, mfnO = d.MFN_orders || 0
              const fbaU = d.FBA_units || 0, mfnU = d.MFN_units || 0
              const totalO = fbaO + mfnO, totalU = fbaU + mfnU
              return {
                date: d.date,
                grossRev: gross,
                netRev: gross * (1 - gstRate),
                fbaRev: d.FBA || 0,
                mfnRev: d.MFN || 0,
                fbaShare: gross > 0 ? (d.FBA || 0) / gross * 100 : null,
                totalOrders: totalO, fbaOrders: fbaO, mfnOrders: mfnO,
                fbaOrderShare: totalO > 0 ? fbaO / totalO * 100 : null,
                totalUnits: totalU, fbaUnits: fbaU, mfnUnits: mfnU,
                fbaUnitShare: totalU > 0 ? fbaU / totalU * 100 : null,
              }
            })
            const grouped = (() => {
              if (scTrendGroup === 'daily') return rawDaily
              const buckets = {}
              rawDaily.forEach(d => {
                const dt = new Date(d.date)
                let key
                if (scTrendGroup === 'weekly') {
                  const day = dt.getDay(), diff = dt.getDate() - day + (day === 0 ? -6 : 1)
                  key = new Date(new Date(d.date).setDate(diff)).toISOString().slice(0, 10)
                } else if (scTrendGroup === 'monthly') {
                  key = d.date.slice(0, 7)
                } else {
                  key = `${d.date.slice(0, 4)}-Q${Math.ceil(parseInt(d.date.slice(5, 7)) / 3)}`
                }
                if (!buckets[key]) buckets[key] = { date: key, grossRev: 0, netRev: 0, fbaRev: 0, mfnRev: 0, totalOrders: 0, fbaOrders: 0, mfnOrders: 0, totalUnits: 0, fbaUnits: 0, mfnUnits: 0 }
                buckets[key].grossRev += d.grossRev; buckets[key].netRev += d.netRev
                buckets[key].fbaRev += d.fbaRev; buckets[key].mfnRev += d.mfnRev
                buckets[key].totalOrders += d.totalOrders; buckets[key].fbaOrders += d.fbaOrders; buckets[key].mfnOrders += d.mfnOrders
                buckets[key].totalUnits += d.totalUnits; buckets[key].fbaUnits += d.fbaUnits; buckets[key].mfnUnits += d.mfnUnits
              })
              return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date)).map(b => ({
                ...b,
                fbaShare: b.grossRev > 0 ? b.fbaRev / b.grossRev * 100 : null,
                fbaOrderShare: b.totalOrders > 0 ? b.fbaOrders / b.totalOrders * 100 : null,
                fbaUnitShare: b.totalUnits > 0 ? b.fbaUnits / b.totalUnits * 100 : null,
              }))
            })()
            const groupedWithRet2 = grouped.map(d => ({ ...d }))
            const xFmt = d => scTrendGroup === 'daily' ? d?.slice(5) : scTrendGroup === 'monthly' ? d?.slice(0, 7) : d
            const isRev = scChartMetric === 'rev', isOrders = scChartMetric === 'orders'
            const mainFmt = isRev ? (v => v >= 1e5 ? `${(v/1e5).toFixed(1)}L` : fmt(v)) : (v => fmtN(v))
            const tooltipFmt = isRev ? fmt : fmtN
            const dataKeys = isRev
              ? { total: 'grossRev', totalName: 'Gross Revenue', sub1: 'netRev', sub1Name: 'Net Revenue', fba: 'fbaRev', fbaName: 'FBA Rev', mfn: 'mfnRev', mfnName: 'MFN Rev', share: 'fbaShare' }
              : isOrders
              ? { total: 'totalOrders', totalName: 'Total Orders', sub1: null, fba: 'fbaOrders', fbaName: 'FBA Orders', mfn: 'mfnOrders', mfnName: 'MFN Orders', share: 'fbaOrderShare' }
              : { total: 'totalUnits', totalName: 'Total Units', sub1: null, fba: 'fbaUnits', fbaName: 'FBA Units', mfn: 'mfnUnits', mfnName: 'MFN Units', share: 'fbaUnitShare' }
            return (
              <Card title="Trend Analysis · Seller Central" action={
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[{ v: 'rev', label: 'Revenue' }, { v: 'orders', label: 'Orders' }, { v: 'units', label: 'Units' }].map(opt => (
                      <button key={opt.v} onClick={() => setScChartMetric(opt.v)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${scChartMetric === opt.v ? C.t1 : C.border}`, background: scChartMetric === opt.v ? C.t1 : 'transparent', color: scChartMetric === opt.v ? '#fff' : C.t2, cursor: 'pointer', fontFamily: 'var(--font)' }}>{opt.label}</button>
                    ))}
                  </div>
                  <select value={scTrendGroup} onChange={e => setScTrendGroup(e.target.value)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', outline: 'none' }}>
                    {['daily','weekly','monthly','quarterly'].map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
                  </select>
                </div>
              }>
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={groupedWithRet2} margin={{ top: 4, right: 44, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={xFmt} />
                    <YAxis yAxisId="main" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={mainFmt} width={60} />
                    <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => `${v?.toFixed(0)}%`} domain={[0, 30]} width={36} />
                    <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 11px', fontSize: 11 }}>
                        <div style={{ fontWeight: 700, marginBottom: 4, color: C.t2 }}>{xFmt(label)}</div>
                        {payload.filter(p => p.dataKey !== '_ret').map(p => <div key={p.name} style={{ color: p.color }}>{p.name}: {tooltipFmt(p.value)}</div>)}
                        {payload.find(p => p.dataKey === '_ret' && p.value != null) && <div style={{ color: '#E24B4A' }}>30d Return Rate: {payload.find(p => p.dataKey === '_ret').value?.toFixed(1)}%</div>}
                      </div>
                    ) : null} />
                    <Legend wrapperStyle={{ fontSize: 11 }} formatter={v => v} />
                    <Area yAxisId="main" type="monotone" dataKey={dataKeys.total} name={dataKeys.totalName} stroke="#FFD600" fill="#FFD60022" strokeWidth={2} dot={false} />
                    {isRev && <Area yAxisId="main" type="monotone" dataKey={dataKeys.sub1} name={dataKeys.sub1Name} stroke="#0D9E68" fill="#0D9E6811" strokeWidth={2} dot={false} strokeDasharray="4 2" />}
                    <Line yAxisId="main" type="monotone" dataKey={dataKeys.fba} name={dataKeys.fbaName} stroke="#E8930A" strokeWidth={1.5} dot={false} />
                    <Line yAxisId="main" type="monotone" dataKey={dataKeys.mfn} name={dataKeys.mfnName} stroke="#2E74CC" strokeWidth={1.5} dot={false} strokeDasharray="3 2" />
                    <Line yAxisId="pct" dataKey={() => null} dot={false} stroke="none" legendType="none" name=" " />
                    {(amzSC.returnRate?.pct || 0) > 0 && <ReferenceLine yAxisId="pct" y={amzSC.returnRate?.pct || 0} stroke="#E24B4A" strokeWidth={1.5} strokeDasharray="5 3" label={{ value: `Return ${(amzSC.returnRate?.pct || 0).toFixed(1)}%`, position: 'insideTopRight', fontSize: 10, fill: '#E24B4A' }} />}
                  </ComposedChart>
                </ResponsiveContainer>
              </Card>
            )
          })()}
          <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
            <ShopifyGeoDonutRow regionRows={amzSC.regionRows || []} tierRows={amzSC.tierRows || []} topStates={amzSC.topStates || []} allStateRows={amzSC.topStates || []} />
            <TopSubCatBar subCatRows={(() => { const rows = []; Object.entries(amzSC.subCatChannel || {}).forEach(([cat, scMap]) => { Object.entries(scMap).forEach(([sc, chData]) => { const rev = (chData.FBA?.rev||0)+(chData.MFN?.rev||0); rows.push({ name: sc, rev }) }) }); return rows.sort((a,b) => b.rev - a.rev) })()} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 14, alignItems: 'stretch' }}>
            {(() => {
              const pickRet = (...chs) => { for (const c of chs) if (c?.totalOrdersForReturn) return { returned: c.returned||0, totalOrdersForReturn: c.totalOrdersForReturn }; return { returned: 0, totalOrdersForReturn: 0 } }
              const catData = {}
              Object.entries(amzSC.catChannel || {}).forEach(([cat, chData]) => {
                catData[cat] = { rev: (chData.FBA?.rev||0)+(chData.MFN?.rev||0), excRev: (chData.FBA?.excRev||0)+(chData.MFN?.excRev||0), units: (chData.FBA?.units||0)+(chData.MFN?.units||0), ...pickRet(chData.FBA, chData.MFN) }
              })
              const subCatData = {}
              Object.entries(amzSC.subCatChannel || {}).forEach(([cat, scMap]) => {
                subCatData[cat] = {}
                Object.entries(scMap).forEach(([sc, chData]) => {
                  subCatData[cat][sc] = { rev: (chData.FBA?.rev||0)+(chData.MFN?.rev||0), excRev: (chData.FBA?.excRev||0)+(chData.MFN?.excRev||0), units: (chData.FBA?.units||0)+(chData.MFN?.units||0), ...pickRet(chData.FBA, chData.MFN) }
                })
              })
              const skuData = {}
              Object.entries(amzSC.skuChannel || {}).forEach(([cat, scMap]) => {
                skuData[cat] = {}
                Object.entries(scMap).forEach(([sc, skuMap]) => {
                  skuData[cat][sc] = {}
                  Object.entries(skuMap).forEach(([sku, chData]) => {
                    skuData[cat][sc][sku] = { rev: (chData.FBA?.rev||0)+(chData.MFN?.rev||0), excRev: (chData.FBA?.excRev||0)+(chData.MFN?.excRev||0), units: (chData.FBA?.units||0)+(chData.MFN?.units||0), ...pickRet(chData.FBA, chData.MFN) }
                  })
                })
              })
              return <FinancialCategoryMatrix catData={catData} subCatData={subCatData} skuData={skuData} title="Category Revenue Matrix · Seller Central" showReturns={false} />
            })()}
            <Card title="FBA vs MFN · Seller Central">
              {[{ label: 'FBA (Fulfilled by Amazon)', ...scFBA }, { label: 'MFN (Merchant Fulfilled)', ...scMFN }].map((r, i) => (
                <div key={r.label} style={{ padding: '10px 0', borderBottom: i === 0 ? `1px solid ${C.border}` : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.t1 }}>{r.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.t1, fontFamily: 'var(--mono)' }}>{fmt(r.rev)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: C.t3 }}>Orders: <strong style={{ color: C.t1 }}>{fmtN(r.orders)}</strong></span>
                    <span style={{ fontSize: 11, color: C.t3 }}>Units: <strong style={{ color: C.t1 }}>{fmtN(r.units)}</strong></span>
                    <span style={{ fontSize: 11, color: C.t3 }}>AOV: <strong style={{ color: C.t1 }}>₹{r.orders ? Math.round(r.rev / r.orders).toLocaleString('en-IN') : 0}</strong></span>
                    <span style={{ fontSize: 11, color: C.t3 }}>Share: <strong style={{ color: C.t1 }}>{scTotalRev ? (r.rev / scTotalRev * 100).toFixed(1) : 0}%</strong></span>
                  </div>
                  <div style={{ marginTop: 7, height: 6, background: C.bg, borderRadius: 3 }}>
                    <div style={{ height: '100%', borderRadius: 3, background: i === 0 ? '#E8930A' : '#2E74CC', width: `${scTotalRev ? (r.rev / scTotalRev * 100) : 0}%`, transition: 'width .5s' }} />
                  </div>
                </div>
              ))}
            </Card>
          </div>
          {(() => {
            const catRows = Object.entries(amzSC.catChannel || {}).map(([cat, chData]) => ({ name: cat, rev: (chData.FBA?.rev||0)+(chData.MFN?.rev||0), units: (chData.FBA?.units||0)+(chData.MFN?.units||0), orders: (chData.FBA?.orders||0)+(chData.MFN?.orders||0) })).sort((a,b) => b.rev-a.rev)
            const subCatRows = Object.entries(amzSC.subCatChannel || {}).flatMap(([cat, scMap]) => Object.entries(scMap).map(([sc, chData]) => ({ name: sc, category: cat, rev: (chData.FBA?.rev||0)+(chData.MFN?.rev||0), units: (chData.FBA?.units||0)+(chData.MFN?.units||0), orders: (chData.FBA?.orders||0)+(chData.MFN?.orders||0) }))).sort((a,b) => b.rev-a.rev)
            return <CatSubCatRow catRows={catRows} subCatRows={subCatRows} title="Category Revenue · Seller Central" selectedCat={selectedCat} onSelectCat={v => { setSelectedCat(v); setSelectedSubCat(null) }} selectedSubCat={selectedSubCat} onSelectSubCat={setSelectedSubCat} />
          })()}
          <div className="g-2" style={{ alignItems: 'stretch' }}>
            <PaginatedCard title="Top States" rows={(amzSC.states || []).map(s => ({ ...s, state: s.state ? s.state.charAt(0).toUpperCase() + s.state.slice(1).toLowerCase() : s.state, aov: s.orders ? Math.round(s.rev / s.orders) : 0 }))} columns={[
              { key: 'state', label: 'State' },
              { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
              { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) },
              { key: 'aov', label: 'ASP', align: 'right', render: v => `₹${v.toLocaleString('en-IN')}` },
            ]} pageSize={15} />
            <PaginatedCard title="Top Cities" rows={(amzSC.cities || []).map(c => ({ ...c, city: c.city ? c.city.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : c.city, aov: c.orders ? Math.round(c.rev / c.orders) : 0 }))} columns={[
              { key: 'city', label: 'City' },
              { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
              { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) },
              { key: 'aov', label: 'ASP', align: 'right', render: v => `₹${v.toLocaleString('en-IN')}` },
            ]} pageSize={15} />
          </div>
        </div>
      )}

      {/* ── INDIA · VENDOR CENTRAL ── */}
      {region === 'india' && subView === 'vc' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Hero + KPI rows */}
          {(() => {
            const vcChgBadge = (cur, prev) => { if (!prev) return null; const p = (cur - prev) / prev * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> }
            const prevVCRev = amzVC.prevRev || 0
            const prevVCExcRev = amzVC.prevExcRev || 0
            const prevVCUnits = amzVC.prevUnits || 0
            const prevVCASP = prevVCUnits > 0 ? prevVCRev / prevVCUnits : 0
            const prevVCDailyAvg = prevVCRev > 0 ? prevVCRev / (data.nDays || 1) : 0
            const prevVCGST = prevVCRev - prevVCExcRev
            const vcGST = vcTotalOrdered - vcTotalOrderedExcRev
            const vcSparkData = (amzVC.daily || []).map((d, i) => ({ i, cur: d.orderedRev || null }))
            const kpis = [
              { label: 'Gross Revenue · Vendor Central', value: fmt(vcTotalOrdered), sub: `${fmtN(vcTotalOrderedUnits)} ordered · ${fmtN(vcTotalShippedUnits)} shipped`, badge: vcChgBadge(vcTotalOrdered, prevVCRev), hero: true },
              { label: 'Net Revenue (Exc GST)', value: fmt(vcTotalOrderedExcRev), sub: 'Ordered excl. GST', badge: vcChgBadge(vcTotalOrderedExcRev, prevVCExcRev) },
              { label: 'GST Collected', value: fmt(vcGST), sub: 'Gross − Net', badge: vcChgBadge(vcGST, prevVCGST) },
              { label: 'Shipped Units', value: fmtN(vcTotalShippedUnits), sub: 'Units shipped by Amazon', badge: vcChgBadge(vcTotalShippedUnits, prevVCUnits) },
              { label: 'Fill Rate', value: `${vcFillRate.toFixed(1)}%`, sub: 'Shipped / Ordered', accent: vcFillRate < 90 ? '#7A4000' : undefined },
              { label: 'ASP', value: `₹${vcTotalOrderedUnits ? Math.round(vcTotalOrdered / vcTotalOrderedUnits).toLocaleString('en-IN') : 0}`, sub: 'Ordered rev / units', badge: vcChgBadge(vcTotalOrderedUnits ? vcTotalOrdered / vcTotalOrderedUnits : 0, prevVCASP) },
              { label: 'Daily Avg Ordered', value: fmt(vcTotalOrdered / (data.nDays || 1)), sub: 'Revenue per day', badge: vcChgBadge(vcTotalOrdered / (data.nDays || 1), prevVCDailyAvg) },
            ]
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
                <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
                  <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue · Vendor Central</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                    <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(vcTotalOrdered)}</div>
                    {vcChgBadge(vcTotalOrdered, prevVCRev)}
                  </div>
                  <div className="kpi-sub" style={{ fontSize: 13 }}>{fmtN(vcTotalOrderedUnits)} ordered · {fmtN(vcTotalShippedUnits)} shipped</div>
                  <div style={{ flex: 1, minHeight: 60 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={vcSparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                        <defs><linearGradient id="vcGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2E74CC" stopOpacity={0.25} /><stop offset="95%" stopColor="#2E74CC" stopOpacity={0} /></linearGradient></defs>
                        <Area type="monotone" dataKey="cur" name="Ordered" stroke="#2E74CC" strokeWidth={2} fill="url(#vcGrad)" dot={false} connectNulls />
                        <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ color: C.t1 }}>{p.name}: {fmt(p.value)}</div>)}</div> : null} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, gridAutoRows: '1fr' }}>
                  {kpis.slice(1).map(k => (
                    <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
                      <div className="kpi-label">{k.label}</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}><div className="kpi-value" style={{ fontSize: 17, ...(k.accent ? { color: k.accent } : {}) }}>{k.value}</div>{k.badge}</div>
                      {k.sub && <div className="kpi-sub">{k.sub}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
          {/* VC Trend Analysis */}
          {(() => {
            const vcGstRate = vcTotalOrdered > 0 ? (vcTotalOrdered - vcTotalOrderedExcRev) / vcTotalOrdered : 0
            const vcLatestDate = amzVC.latestVCDate || null
            const rawDaily = (amzVC.daily || []).map(d => ({
              date: d.date,
              grossRev: d.orderedRev || 0,
              netRev: (d.orderedRev || 0) * (1 - vcGstRate),
              orderedUnits: d.orderedUnits || 0,
              shippedUnits: d.shippedUnits || 0,
              fillRate: d.orderedUnits ? (d.shippedUnits / d.orderedUnits * 100) : null,
              returnedOrders: d.returnedOrders || 0,
              returnPct: (d.orderedUnits || 0) > 0 ? (d.returnedOrders || 0) / d.orderedUnits * 100 : null,
              estimated: d.estimated || false,
            }))
            const grouped = (() => {
              if (vcTrendGroup === 'daily') return rawDaily
              const buckets = {}
              rawDaily.forEach(d => {
                const dt = new Date(d.date)
                let key
                if (vcTrendGroup === 'weekly') {
                  const day = dt.getDay(), diff = dt.getDate() - day + (day === 0 ? -6 : 1)
                  key = new Date(new Date(d.date).setDate(diff)).toISOString().slice(0, 10)
                } else if (vcTrendGroup === 'monthly') {
                  key = d.date.slice(0, 7)
                } else {
                  key = `${d.date.slice(0, 4)}-Q${Math.ceil(parseInt(d.date.slice(5, 7)) / 3)}`
                }
                if (!buckets[key]) buckets[key] = { date: key, grossRev: 0, netRev: 0, orderedUnits: 0, shippedUnits: 0, returnedOrders: 0 }
                buckets[key].grossRev += d.grossRev; buckets[key].netRev += d.netRev
                buckets[key].orderedUnits += d.orderedUnits; buckets[key].shippedUnits += d.shippedUnits
                buckets[key].returnedOrders += d.returnedOrders
              })
              return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date)).map(b => ({
                ...b,
                fillRate: b.orderedUnits > 0 ? b.shippedUnits / b.orderedUnits * 100 : null,
                returnPct: b.orderedUnits > 0 ? b.returnedOrders / b.orderedUnits * 100 : null,
              }))
            })()
            const xFmt = d => vcTrendGroup === 'daily' ? d?.slice(5) : vcTrendGroup === 'monthly' ? d?.slice(0, 7) : d
            const isRev = vcTrendMetric === 'rev', isOrders = vcTrendMetric === 'orders'
            const mainFmt = isRev ? (v => v >= 1e5 ? `${(v/1e5).toFixed(1)}L` : fmt(v)) : (v => fmtN(v))
            const tooltipFmt = isRev ? fmt : fmtN
            return (
              <Card title="Trend Analysis · Vendor Central" action={
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[{ v: 'rev', label: 'Revenue' }, { v: 'units', label: 'Units' }].map(opt => (
                      <button key={opt.v} onClick={() => setVcTrendMetric(opt.v)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${vcTrendMetric === opt.v ? C.t1 : C.border}`, background: vcTrendMetric === opt.v ? C.t1 : 'transparent', color: vcTrendMetric === opt.v ? '#fff' : C.t2, cursor: 'pointer', fontFamily: 'var(--font)' }}>{opt.label}</button>
                    ))}
                  </div>
                  <select value={vcTrendGroup} onChange={e => setVcTrendGroup(e.target.value)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', outline: 'none' }}>
                    {['daily','weekly','monthly','quarterly'].map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
                  </select>
                </div>
              }>
                {vcLatestDate && vcTrendGroup === 'daily' && (() => {
                  const estDays = rawDaily.filter(d => d.estimated).length
                  return estDays > 0 ? (
                    <div style={{ fontSize: 11, color: '#92600A', background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: 6, padding: '5px 10px', marginBottom: 8 }}>
                      ⏳ VC data available till {vcLatestDate} · Last {estDays} day{estDays > 1 ? 's' : ''} shown as 7-day rolling avg estimate
                    </div>
                  ) : null
                })()}
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={grouped} margin={{ top: 4, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={xFmt} />
                    <YAxis tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={mainFmt} width={60} />
                    <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 11px', fontSize: 11 }}>
                        <div style={{ fontWeight: 700, marginBottom: 4, color: C.t2 }}>{xFmt(label)}</div>
                        {payload.map(p => <div key={p.name} style={{ color: p.color }}>{p.name}: {tooltipFmt(p.value)}</div>)}
                      </div>
                    ) : null} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {isRev ? (<>
                      <Area type="monotone" dataKey="grossRev" name="Gross Revenue" stroke="#2E74CC" fill="#2E74CC22" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="netRev" name="Net Revenue" stroke="#0D9E68" fill="#0D9E6811" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                    </>) : (<>
                      <Area type="monotone" dataKey="orderedUnits" name="Ordered Units" stroke="#2E74CC" fill="#2E74CC22" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="shippedUnits" name="Shipped Units" stroke="#0D9E68" strokeWidth={1.5} dot={false} />
                    </>)}
                  </ComposedChart>
                </ResponsiveContainer>
              </Card>
            )
          })()}
          <div className="g-2" style={{ alignItems: 'stretch' }}>
            <Card title="Vendor Account Breakdown">
              {(amzVC.accounts || []).map((a, i) => {
                const dots = ['#E8930A','#2E74CC','#0D9E68']
                return (
                  <div key={a.account} style={{ padding: '10px 0', borderBottom: i < (amzVC.accounts.length - 1) ? `1px solid ${C.border}` : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.t1 }}>{a.account}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.t1, fontFamily: 'var(--mono)' }}>{fmt(a.orderedRev)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: C.t3 }}>Ordered: <strong style={{ color: C.t1 }}>{fmtN(a.orderedUnits)} units</strong></span>
                      <span style={{ fontSize: 11, color: C.t3 }}>Shipped: <strong style={{ color: C.t1 }}>{fmtN(a.shippedUnits)} units</strong></span>
                      <span style={{ fontSize: 11, color: C.t3 }}>Fill: <strong style={{ color: a.orderedUnits ? (a.shippedUnits/a.orderedUnits >= 0.95 ? '#286010' : '#7A4000') : C.t1 }}>{a.orderedUnits ? (a.shippedUnits/a.orderedUnits*100).toFixed(1) : 0}%</strong></span>
                      <span style={{ fontSize: 11, color: C.t3 }}>Returns: <strong style={{ color: a.returns > 0 ? '#7A1A1A' : C.t1 }}>{fmtN(a.returns)}</strong></span>
                    </div>
                    <div style={{ marginTop: 6, height: 5, background: C.bg, borderRadius: 3 }}>
                      <div style={{ height: '100%', borderRadius: 3, background: dots[i % 3], width: `${vcMaxRev ? (a.orderedRev / vcMaxRev * 100) : 0}%` }} />
                    </div>
                  </div>
                )
              })}
            </Card>
            <FinancialCategoryMatrix catData={amzVCMatrix.catData} subCatData={amzVCMatrix.subCatData} skuData={amzVCMatrix.skuData} title="Category Revenue Matrix · Vendor Central" showReturns={false} />
          </div>
          {(() => {
            const catRows = Object.entries(amzVCMatrix.catData || {}).map(([cat, v]) => ({ name: cat, rev: v.rev||0, units: v.units||0, orders: v.orders||0 })).sort((a,b) => b.rev-a.rev)
            const subCatRows = Object.entries(amzVCMatrix.subCatData || {}).flatMap(([cat, scMap]) => Object.entries(scMap).map(([sc, v]) => ({ name: sc, category: cat, rev: v.rev||0, units: v.units||0, orders: v.orders||0 }))).sort((a,b) => b.rev-a.rev)
            return <CatSubCatRow catRows={catRows} subCatRows={subCatRows} title="Category Revenue · Vendor Central" selectedCat={selectedCat} onSelectCat={v => { setSelectedCat(v); setSelectedSubCat(null) }} selectedSubCat={selectedSubCat} onSelectSubCat={setSelectedSubCat} />
          })()}
        </div>
      )}

      {/* ── INTERNATIONAL · SELLER CENTRAL ── */}
      {region === 'intl' && (subView === 'overview' || subView === 'sc') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(() => {
            const intlTotalUnits = (amzIntl.countries || []).reduce((s, c) => s + (c.units || 0), 0)
            const intlTotalNetRev = (amzIntl.countries || []).reduce((s, c) => s + (c.netRev || 0), 0)
            const intlTotalTax = (amzIntl.countries || []).reduce((s, c) => s + (c.tax || 0), 0)
            const intlASP = intlTotalUnits ? Math.round(intlTotalRev / intlTotalUnits) : 0
            const prevRev = amzIntl.prevRev || 0
            const prevNetRev = amzIntl.prevNetRev || 0
            const prevOrders = amzIntl.prevOrders || 0
            const prevUnits = amzIntl.prevUnits || 0
            const prevAOV = prevOrders > 0 ? prevRev / prevOrders : 0
            const prevASP = prevUnits > 0 ? prevRev / prevUnits : 0
            const prevDailyAvg = prevRev > 0 ? prevRev / (data.nDays || 1) : 0
            const chgBadge = (cur, prev) => {
              if (!prev) return null
              const p = (cur - prev) / prev * 100
              return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span>
            }
            // sparkline: daily totals
            const intlDailyMap = {}
            ;(amzIntl.daily || []).forEach(d => {
              intlDailyMap[d.date] = (intlDailyMap[d.date] || 0) + d.rev
            })
            const sparkData = Object.entries(intlDailyMap).sort(([a],[b]) => a.localeCompare(b)).map(([date, rev]) => ({ date, rev }))
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
                <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
                  <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue · International SC</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                    <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(intlTotalRev)}</div>
                    {chgBadge(intlTotalRev, prevRev)}
                  </div>
                  <div className="kpi-sub" style={{ fontSize: 13 }}>{fmtN(intlTotalOrders)} orders · {fmtN(intlTotalUnits)} units</div>
                  <div style={{ flex: 1, minHeight: 60 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={sparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                        <defs><linearGradient id="intlGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#E8930A" stopOpacity={0.25} /><stop offset="95%" stopColor="#E8930A" stopOpacity={0} /></linearGradient></defs>
                        <Area type="monotone" dataKey="rev" stroke="#E8930A" strokeWidth={2} fill="url(#intlGrad)" dot={false} />
                        <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{fmt(payload[0].value)}</div> : null} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridAutoRows: '1fr', gap: 10 }}>
                  {[
                    { label: 'Net Revenue', value: fmt(intlTotalNetRev), sub: `Tax: ${fmt(intlTotalTax)}`, badge: chgBadge(intlTotalNetRev, prevNetRev) },
                    { label: 'Total Orders', value: fmtN(intlTotalOrders), sub: `${(amzIntl.countries||[]).length} markets`, badge: chgBadge(intlTotalOrders, prevOrders) },
                    { label: 'Total Units', value: fmtN(intlTotalUnits), sub: 'Units sold', badge: chgBadge(intlTotalUnits, prevUnits) },
                    { label: 'AOV', value: `₹${Math.round(intlAOV).toLocaleString('en-IN')}`, sub: 'Gross / Orders', badge: chgBadge(intlAOV, prevAOV) },
                    { label: 'ASP', value: `₹${intlASP.toLocaleString('en-IN')}`, sub: 'Gross / Units', badge: chgBadge(intlASP, prevASP) },
                    { label: 'Daily Avg Revenue', value: fmt(intlTotalRev / (data.nDays || 1)), sub: 'Gross per day', badge: chgBadge(intlTotalRev / (data.nDays||1), prevDailyAvg) },
                  ].map(k => (
                    <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
                      <div className="kpi-label">{k.label}</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}><div className="kpi-value" style={{ fontSize: 17 }}>{k.value}</div>{k.badge}</div>
                      {k.sub && <div className="kpi-sub">{k.sub}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
          {/* Trend Analysis · International SC */}
          {(() => {
            const intlCountryColors = { UAE: '#E8930A', UK: '#2E74CC', US: '#0D9E68' }
            const intlDailyMap = {}
            ;(amzIntl.daily || []).forEach(d => {
              if (!intlDailyMap[d.date]) intlDailyMap[d.date] = { date: d.date, _totalRev: 0, _totalNet: 0, _totalOrders: 0, _totalUnits: 0 }
              const key = d.country
              intlDailyMap[d.date][key + '_rev'] = (intlDailyMap[d.date][key + '_rev'] || 0) + (d.rev || 0)
              intlDailyMap[d.date][key + '_net'] = (intlDailyMap[d.date][key + '_net'] || 0) + (d.netRev || 0)
              intlDailyMap[d.date][key + '_orders'] = (intlDailyMap[d.date][key + '_orders'] || 0) + (d.orders || 0)
              intlDailyMap[d.date][key + '_units'] = (intlDailyMap[d.date][key + '_units'] || 0) + (d.units || 0)
              intlDailyMap[d.date]._totalRev += d.rev || 0
              intlDailyMap[d.date]._totalNet += d.netRev || 0
              intlDailyMap[d.date]._totalOrders += d.orders || 0
              intlDailyMap[d.date]._totalUnits += d.units || 0
            })
            const intlDailyArr = Object.values(intlDailyMap).sort((a, b) => a.date.localeCompare(b.date))
            const intlCountries = [...new Set((amzIntl.daily || []).map(d => d.country).filter(Boolean))]
            const suffix = intlMetric === 'rev' ? '_rev' : intlMetric === 'net' ? '_net' : intlMetric === 'orders' ? '_orders' : '_units'
            const totalKey = intlMetric === 'rev' ? '_totalRev' : intlMetric === 'net' ? '_totalNet' : intlMetric === 'orders' ? '_totalOrders' : '_totalUnits'
            const yFmt = v => intlMetric === 'rev' || intlMetric === 'net' ? (v >= 1e5 ? `${(v/1e5).toFixed(1)}L` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v) : fmtN(v)
            const btnSt = k => ({ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, border: `1px solid ${intlMetric===k?C.acm:C.border}`, background: intlMetric===k?C.acc:'transparent', color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)' })
            return (
              <Card title="Trend Analysis · International SC" action={
                <div style={{ display: 'flex', gap: 3 }}>
                  {[['rev','Gross Rev'],['net','Net Rev'],['orders','Orders'],['units','Units']].map(([k,l]) => <button key={k} style={btnSt(k)} onClick={() => setIntlMetric(k)}>{l}</button>)}
                </div>
              }>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={intlDailyArr} margin={{ top: 4, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={d => d?.slice(5)} />
                    <YAxis tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={yFmt} width={44} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                    <Area type="monotone" dataKey={totalKey} name="Total" stroke="#FFD600" fill="#FFD60022" strokeWidth={2} dot={false} />
                    {intlCountries.map(ct => <Line key={ct} type="monotone" dataKey={ct + suffix} name={ct} stroke={intlCountryColors[ct] || C.t3} strokeWidth={1.5} dot={false} />)}
                  </ComposedChart>
                </ResponsiveContainer>
              </Card>
            )
          })()}
          <div className="g-2" style={{ alignItems: 'stretch' }}>
            {/* Country Breakdown with donut */}
            {(() => {
              const countries = amzIntl.countries || []
              const donutData = countries.map(c => ({ name: c.country, value: c.rev }))
              const RCOLORS = ['#E8930A','#2E74CC','#0D9E68','#9B59B6','#E24B4A']
              return (
                <Card title="Country Breakdown">
                  {countries.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                      <PieChart width={160} height={140}>
                        <Pie data={donutData} cx={75} cy={65} innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={2}>
                          {donutData.map((_, i) => <Cell key={i} fill={RCOLORS[i % RCOLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={v => fmt(v)} />
                      </PieChart>
                    </div>
                  )}
                  {countries.map((c, i) => (
                    <HBar key={c.country} dot={intlDots[c.country] || RCOLORS[i % RCOLORS.length]} label={c.country} width={intlTotalRev ? (c.rev / intlTotalRev * 100) : 0} value={fmt(c.rev)} pctVal={fmtN(c.orders) + ' ord'} />
                  ))}
                  {countries.length === 0 && <div style={{ fontSize: 12, color: C.t3, padding: '20px 0', textAlign: 'center' }}>No international orders in this period</div>}
                </Card>
              )
            })()}
            {/* Category Revenue Matrix · International */}
            {(() => {
              const pickRet = (...chs) => { for (const c of chs) if (c?.totalOrdersForReturn) return { returned: c.returned||0, totalOrdersForReturn: c.totalOrdersForReturn }; return { returned: 0, totalOrdersForReturn: 0 } }
              const catData = {}
              Object.entries(amzIntl.catChannel || {}).forEach(([cat, chData]) => {
                const allCh = Object.values(chData)
                catData[cat] = { rev: allCh.reduce((s,c)=>s+(c.rev||0),0), excRev: allCh.reduce((s,c)=>s+(c.excRev||0),0), units: allCh.reduce((s,c)=>s+(c.units||0),0), ...pickRet(...allCh) }
              })
              const subCatData = {}
              Object.entries(amzIntl.subCatChannel || {}).forEach(([cat, scMap]) => {
                subCatData[cat] = {}
                Object.entries(scMap).forEach(([sc, chData]) => {
                  const allCh = Object.values(chData)
                  subCatData[cat][sc] = { rev: allCh.reduce((s,c)=>s+(c.rev||0),0), excRev: allCh.reduce((s,c)=>s+(c.excRev||0),0), units: allCh.reduce((s,c)=>s+(c.units||0),0), ...pickRet(...allCh) }
                })
              })
              const skuData = {}
              Object.entries(amzIntl.skuChannel || {}).forEach(([cat, scMap]) => {
                skuData[cat] = {}
                Object.entries(scMap).forEach(([sc, skuMap]) => {
                  skuData[cat][sc] = {}
                  Object.entries(skuMap).forEach(([sku, chData]) => {
                    const allCh = Object.values(chData)
                    skuData[cat][sc][sku] = { rev: allCh.reduce((s,c)=>s+(c.rev||0),0), excRev: allCh.reduce((s,c)=>s+(c.excRev||0),0), units: allCh.reduce((s,c)=>s+(c.units||0),0), ...pickRet(...allCh) }
                  })
                })
              })
              return <FinancialCategoryMatrix catData={catData} subCatData={subCatData} skuData={skuData} title="Category Revenue Matrix · International SC" showReturns={false} />
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

function FlipkartTab({ data }) {
  const [subView, setSubView] = useState('overview')
  const [fkTrendGroup, setFkTrendGroup] = useState('daily')
  const [fkTrendMetric, setFkTrendMetric] = useState('rev')
  const [selectedCat, setSelectedCat] = useState(null)
  const [selectedSubCat, setSelectedSubCat] = useState(null)
  const subToggleStyle = active => ({ fontSize: 12, fontWeight: 700, padding: '5px 16px', borderRadius: 7, border: `1.5px solid ${active ? C.t1 : C.border}`, background: active ? C.t1 : C.card, color: active ? '#fff' : C.t1, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all .15s', boxShadow: active ? '0 2px 6px rgba(0,0,0,.15)' : 'none' })

  const fk = data.flipkart || {}
  const nDays = data.nDays || 1
  const statusColors = { Delivered: C.green.tx, Dispatched: C.blue.tx, RTO: C.amber.tx, Cancelled: C.red.tx, Shipped: '#2E74CC', Pending: '#E8930A', Return: '#9B59B6' }

  // Filter all arrays by subView
  const filterSub = arr => subView === 'overview' ? arr : arr.filter(x => x.sub === (subView === 'fbf' ? 'FBF' : 'NON-FBF'))

  // When cat/subcat selected, derive totals+daily from dailyCat
  const dailyCat = fk.dailyCat || []
  const filtDailyCat = selectedSubCat
    ? filterSub(dailyCat.filter(x => x.category === selectedCat && x.subcategory === selectedSubCat))
    : selectedCat
    ? filterSub(dailyCat.filter(x => x.category === selectedCat))
    : null

  const totals = filtDailyCat
    ? (() => { const agg = {}; filtDailyCat.forEach(x => { const s = x.sub || 'ALL'; if (!agg[s]) agg[s] = { sub: s, rev: 0, excRev: 0, orders: 0, units: 0, returns: 0 }; agg[s].rev += x.rev; agg[s].excRev += x.excRev; agg[s].orders += x.orders; agg[s].units += x.units }); return Object.values(agg) })()
    : filterSub(fk.totals || [])
  const rev = totals.reduce((s, x) => s + x.rev, 0)
  const nOrders = totals.reduce((s, x) => s + x.orders, 0)
  const qty = totals.reduce((s, x) => s + x.units, 0)
  const excRev = totals.reduce((s, x) => s + x.excRev, 0)
  const aov = nOrders ? rev / nOrders : 0
  const asp = qty ? rev / qty : 0

  const fbfT = (fk.totals || []).find(x => x.sub === 'FBF') || { rev: 0, orders: 0, units: 0 }
  const nfbfT = (fk.totals || []).find(x => x.sub === 'NON-FBF') || { rev: 0, orders: 0, units: 0 }
  const allRev = fbfT.rev + nfbfT.rev

  const fkPrevRev = fk.prevRev || data.prevRev || 0
  const fkPrevExcRev = fk.prevExcRev || data.prevExcRev || 0
  const fkPrevOrders = fk.prevOrders || 0
  const fkPrevUnits = fk.prevUnits || 0
  const fkPrevFbfRev = fk.prevFbfRev || 0
  const fkPrevNonFbfRev = fk.prevNonFbfRev || 0
  const fkPrevGST = fkPrevRev - fkPrevExcRev
  const fkPrevDailyArr = fk.prevDaily || data.prevDailyArr || []
  const fkRevChg = fkPrevRev > 0 ? ((rev - fkPrevRev) / fkPrevRev * 100) : null
  const fkExcChg = fkPrevExcRev > 0 ? ((excRev - fkPrevExcRev) / fkPrevExcRev * 100) : null
  const fkChgBadge = (cur, prev) => { if (!prev) return null; const p = (cur - prev) / prev * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> }

  // Daily chart
  const [chartMetric, setChartMetric] = useState('rev')
  const fkEstimatedDays = fk.estimatedDays || 0
  const fkLatestReal = fk.latestRealDate || null
  const dailyMap = {}
  ;(fk.daily || []).forEach(x => {
    if (!dailyMap[x.date]) dailyMap[x.date] = { date: x.date, FBF: 0, NonFBF: 0, FBF_orders: 0, NonFBF_orders: 0, FBF_units: 0, NonFBF_units: 0, FBF_returns: 0, NonFBF_returns: 0, estimated: x.estimated || false }
    if (x.sub === 'FBF') { dailyMap[x.date].FBF = x.rev; dailyMap[x.date].FBF_orders = x.orders; dailyMap[x.date].FBF_units = x.units || 0; dailyMap[x.date].FBF_returns = x.returns || 0 }
    else { dailyMap[x.date].NonFBF = x.rev; dailyMap[x.date].NonFBF_orders = x.orders; dailyMap[x.date].NonFBF_units = x.units || 0; dailyMap[x.date].NonFBF_returns = x.returns || 0 }
    if (x.estimated) dailyMap[x.date].estimated = true
  })
  const dailyArr = Object.values(dailyMap).sort((a, b) => a.date?.localeCompare(b.date))
  const subDailyArr = (filtDailyCat
    ? filtDailyCat.map(x => ({ date: x.date, rev: x.rev, orders: x.orders, returns: 0 }))
        .reduce((acc, x) => { const e = acc.find(a => a.date === x.date); if (e) { e.rev += x.rev; e.orders += x.orders } else acc.push({ ...x }); return acc }, [])
    : filterSub(fk.daily || []).map(x => ({ date: x.date, rev: x.rev, orders: x.orders, returns: x.returns || 0 }))
        .reduce((acc, x) => { const e = acc.find(a => a.date === x.date); if (e) { e.rev += x.rev; e.returns += x.returns } else acc.push({ ...x }); return acc }, [])
  ).sort((a, b) => a.date?.localeCompare(b.date))
  const fkSparkData = Array.from({ length: Math.max(subDailyArr.length, fkPrevDailyArr.length) }, (_, i) => {
    const cur = subDailyArr[i]
    const pre = fkPrevDailyArr[i]
    return { i, cur: cur?.rev ?? null, prev: pre?.rev ?? null }
  })

  // Status
  const statusFiltered = filterSub(fk.status || [])
  const statusAgg = {}
  statusFiltered.forEach(x => { statusAgg[x.status] = (statusAgg[x.status] || 0) + x.orders })
  const statusTotal = Object.values(statusAgg).reduce((s, v) => s + v, 0)

  // Categories
  const catFiltered = filterSub(fk.categories || [])
  const catAgg = {}
  catFiltered.forEach(x => {
    if (!catAgg[x.category]) catAgg[x.category] = { name: x.category, rev: 0, orders: 0, units: 0 }
    catAgg[x.category].rev += x.rev; catAgg[x.category].orders += x.orders; catAgg[x.category].units += x.units
  })
  const catRows = Object.values(catAgg).map(v => ({ ...v, aov: v.orders ? v.rev / v.orders : 0 })).sort((a, b) => b.rev - a.rev)

  // SKUs
  const skuFiltered = filterSub(fk.skus || [])
  const skuAgg = {}
  skuFiltered.forEach(x => {
    if (!skuAgg[x.sku]) skuAgg[x.sku] = { sku: x.sku, rev: 0, orders: 0, units: 0, sub: x.sub }
    skuAgg[x.sku].rev += x.rev; skuAgg[x.sku].orders += x.orders; skuAgg[x.sku].units += x.units
  })
  const skuRows = Object.values(skuAgg).sort((a, b) => b.rev - a.rev).slice(0, 20)

  // States
  const stateFiltered = filterSub(fk.states || [])
  const stateAgg = {}
  stateFiltered.forEach(x => {
    if (!stateAgg[x.state]) stateAgg[x.state] = { state: x.state, rev: 0, orders: 0 }
    stateAgg[x.state].rev += x.rev; stateAgg[x.state].orders += x.orders
  })
  const stateRows = Object.values(stateAgg).sort((a, b) => b.rev - a.rev)
  const maxStateRev = Math.max(...stateRows.map(s => s.rev), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', background: C.bg, borderRadius: 9, padding: 3, border: `1px solid ${C.border}` }}>
          <button onClick={() => { setSubView('overview'); setSelectedCat(null); setSelectedSubCat(null) }} style={{ fontSize: 12, fontWeight: subView === 'overview' ? 700 : 500, padding: '5px 16px', borderRadius: 7, border: 'none', background: subView === 'overview' ? C.acc : 'transparent', color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all .15s' }}>Overview</button>
        </div>
        <span style={{ color: C.border2, fontSize: 18 }}>│</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {[{ id: 'fbf', label: 'FBF' }, { id: 'nonfbf', label: 'Non-FBF' }].map(opt => (
            <button key={opt.id} onClick={() => { setSubView(opt.id); setSelectedCat(null); setSelectedSubCat(null) }} style={subToggleStyle(subView === opt.id)}>{opt.label}</button>
          ))}
        </div>
      </div>

      {/* KPI layout: hero + 2 rows of 4 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
        <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
          <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue · Inc. GST</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(rev)}</div>
            {fkRevChg !== null && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: fkRevChg >= 0 ? C.green.bg : C.red.bg, color: fkRevChg >= 0 ? C.green.tx : C.red.tx }}>{fkRevChg >= 0 ? '▲' : '▼'} {Math.abs(fkRevChg).toFixed(1)}%</span>}
          </div>
          <div className="kpi-sub" style={{ fontSize: 13 }}>{fmtN(nOrders)} orders · {fmtN(qty)} units</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fkSparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs><linearGradient id="fkGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#FFD600" stopOpacity={0.25} /><stop offset="95%" stopColor="#FFD600" stopOpacity={0} /></linearGradient></defs>
                <Area type="monotone" dataKey="cur" name="Current" stroke="#FFD600" strokeWidth={2} fill="url(#fkGrad)" dot={false} connectNulls />
                <Area type="monotone" dataKey="prev" name="Prev" stroke={C.t3} strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ color: p.name === 'Current' ? C.t1 : C.t3 }}>{p.name}: {fmt(p.value)}</div>)}</div> : null} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, flex: 1 }}>
            {(() => { const excChg = fkPrevExcRev > 0 ? ((excRev - fkPrevExcRev) / fkPrevExcRev * 100) : null; return (
              <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 13px' }}>
                <div className="kpi-label">Net (Exc GST)</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="kpi-value">{fmt(excRev)}</div>
                  {excChg !== null && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: excChg >= 0 ? C.green.bg : C.red.bg, color: excChg >= 0 ? C.green.tx : C.red.tx }}>{excChg >= 0 ? '▲' : '▼'} {Math.abs(excChg).toFixed(1)}%</span>}
                </div>
                <div className="kpi-sub">{rev > 0 ? (excRev / rev * 100).toFixed(1) : 0}% of gross · GST {fmt(rev - excRev)}</div>
              </div>
            )})()}
            {[
              { label: 'Daily Avg', value: fmt(rev / nDays), sub: `over ${nDays} days`, badge: fkChgBadge(rev / nDays, fkPrevRev > 0 ? fkPrevRev / nDays : 0) },
              { label: 'AOV', value: `₹${Math.round(aov).toLocaleString('en-IN')}`, sub: 'Avg order value', badge: fkChgBadge(aov, fkPrevOrders > 0 ? fkPrevRev / fkPrevOrders : 0) },
            ].map(k => (
              <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
                <div className="kpi-label">{k.label}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}><div className="kpi-value" style={{ fontSize: 17 }}>{k.value}</div>{k.badge}</div>
                {k.sub && <div className="kpi-sub">{k.sub}</div>}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, flex: 1 }}>
            {[
              { label: 'ASP', value: `₹${Math.round(asp).toLocaleString('en-IN')}`, sub: 'Gross rev ÷ units', badge: fkChgBadge(asp, fkPrevUnits > 0 ? fkPrevRev / fkPrevUnits : 0) },
              { label: 'GST Collected', value: fmt(rev - excRev), sub: 'Inc GST − Exc GST', badge: fkChgBadge(rev - excRev, fkPrevGST) },
              { label: 'Total Units', value: fmtN(qty), sub: `${fmtN(nOrders)} orders`, badge: fkChgBadge(qty, fkPrevUnits) },
            ].map(k => (
              <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
                <div className="kpi-label">{k.label}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}><div className="kpi-value" style={{ fontSize: 17 }}>{k.value}</div>{k.badge}</div>
                {k.sub && <div className="kpi-sub">{k.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trend Analysis + FBF Breakdown side by side */}
      <div className="g-2" style={{ alignItems: 'stretch' }}>
      {(() => {
        const subLabel = subView === 'overview' ? 'FBF + Non-FBF' : subView === 'fbf' ? 'FBF' : 'Non-FBF'
        const rawDaily = subView === 'overview'
          ? dailyArr.map(d => ({ date: d.date, grossRev: d.FBF + d.NonFBF, netRev: (d.FBF + d.NonFBF) * (excRev > 0 && rev > 0 ? excRev / rev : 1), orders: d.FBF_orders + d.NonFBF_orders, units: d.FBF_units + d.NonFBF_units, returns: d.FBF_returns + d.NonFBF_returns, estimated: d.estimated }))
          : subDailyArr.map(d => ({ date: d.date, grossRev: d.rev, netRev: d.rev * (excRev > 0 && rev > 0 ? excRev / rev : 1), orders: d.orders, units: 0, returns: d.returns || 0, estimated: false }))
        const totalReturns = subView === 'overview' ? ((fbfT.returns || 0) + (nfbfT.returns || 0)) : subView === 'fbf' ? (fbfT.returns || 0) : (nfbfT.returns || 0)
        const grouped = (() => {
          if (fkTrendGroup === 'daily') return rawDaily
          const buckets = {}
          rawDaily.forEach(d => {
            const dt = new Date(d.date)
            let key
            if (fkTrendGroup === 'weekly') { const day = dt.getDay(), diff = dt.getDate() - day + (day === 0 ? -6 : 1); key = new Date(new Date(d.date).setDate(diff)).toISOString().slice(0, 10) }
            else if (fkTrendGroup === 'monthly') { key = d.date.slice(0, 7) }
            else { key = `${d.date.slice(0, 4)}-Q${Math.ceil(parseInt(d.date.slice(5, 7)) / 3)}` }
            if (!buckets[key]) buckets[key] = { date: key, grossRev: 0, netRev: 0, orders: 0, units: 0, returns: 0 }
            buckets[key].grossRev += d.grossRev; buckets[key].netRev += d.netRev
            buckets[key].orders += d.orders; buckets[key].units += d.units; buckets[key].returns += d.returns || 0
          })
          return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date))
        })()
        const isRev = fkTrendMetric === 'rev'
        const xFmt = d => fkTrendGroup === 'daily' ? d?.slice(5) : fkTrendGroup === 'monthly' ? d?.slice(0, 7) : d
        const yFmt = v => isRev ? (v >= 1e5 ? `${(v/1e5).toFixed(1)}L` : fmt(v)) : fmtN(v)
        const btnSt = k => ({ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${fkTrendMetric===k?C.t1:C.border}`, background: fkTrendMetric===k?C.t1:'transparent', color: fkTrendMetric===k?'#fff':C.t2, cursor: 'pointer', fontFamily: 'var(--font)' })
        return (
          <Card title={`Trend Analysis · ${subLabel}`} action={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[['rev','Revenue'],['orders','Orders'],['units','Units']].map(([k,l]) => <button key={k} style={btnSt(k)} onClick={() => setFkTrendMetric(k)}>{l}</button>)}
              </div>
              <select value={fkTrendGroup} onChange={e => setFkTrendGroup(e.target.value)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', outline: 'none' }}>
                {['daily','weekly','monthly','quarterly'].map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
              </select>
            </div>
          }>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
              {fkEstimatedDays > 0 && fkTrendGroup === 'daily' && (
                <div style={{ fontSize: 11, color: '#92600A', background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: 6, padding: '5px 10px' }}>
                  ⏳ Data available till {fkLatestReal} · Last {fkEstimatedDays} day{fkEstimatedDays > 1 ? 's' : ''} shown as 7-day rolling avg estimate
                </div>
              )}
              {totalReturns > 0 && (
                <div style={{ fontSize: 11, color: C.t2, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  Returns: <strong style={{ color: '#E24B4A' }}>{fmtN(totalReturns)}</strong>
                  {nOrders > 0 && <span style={{ color: C.t3, fontSize: 10 }}>{(totalReturns / nOrders * 100).toFixed(1)}%</span>}
                </div>
              )}
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={grouped} margin={{ top: 4, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={xFmt} />
                <YAxis tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={yFmt} width={60} />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0]?.payload
                  const retCount = d?.returns || 0
                  const retPct = d?.orders > 0 ? (retCount / d.orders * 100).toFixed(1) : null
                  return (
                    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 11px', fontSize: 11 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4, color: C.t2 }}>{xFmt(label)}</div>
                      {payload.map(p => <div key={p.name} style={{ color: p.color }}>{p.name}: {isRev ? fmt(p.value) : fmtN(p.value)}</div>)}
                      <div style={{ marginTop: 4, color: C.t1 }}>Returns: <strong>{fmtN(retCount)}</strong>{retPct !== null && <span style={{ color: C.t3, fontSize: 10, marginLeft: 4 }}>{retPct}%</span>}</div>
                    </div>
                  )
                }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {isRev ? (<>
                  <Area type="monotone" dataKey="grossRev" name="Gross Revenue" stroke="#E8930A" fill="#E8930A22" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="netRev" name="Net Revenue" stroke="#0D9E68" fill="#0D9E6811" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                </>) : fkTrendMetric === 'orders' ? (
                  <Area type="monotone" dataKey="orders" name="Orders" stroke="#E8930A" fill="#E8930A22" strokeWidth={2} dot={false} />
                ) : (
                  <Area type="monotone" dataKey="units" name="Units" stroke="#E8930A" fill="#E8930A22" strokeWidth={2} dot={false} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
        )
      })()}
      {/* FBF vs Non-FBF Breakdown beside trend */}
      <Card title="FBF vs Non-FBF Breakdown">
        {[{ label: 'FBF (Fulfilled by Flipkart)', ...fbfT }, { label: 'Non-FBF (Seller Fulfilled)', ...nfbfT }].map((r, i) => (
          <div key={r.label} style={{ padding: '10px 0', borderBottom: i === 0 ? `1px solid ${C.border}` : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.t1 }}>{r.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.t1, fontFamily: 'var(--mono)' }}>{fmt(r.rev)}</span>
            </div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 7 }}>
              <span style={{ fontSize: 11, color: C.t3 }}>Orders: <strong style={{ color: C.t1 }}>{fmtN(r.orders)}</strong></span>
              <span style={{ fontSize: 11, color: C.t3 }}>AOV: <strong style={{ color: C.t1 }}>₹{r.orders ? Math.round(r.rev / r.orders).toLocaleString('en-IN') : 0}</strong></span>
              <span style={{ fontSize: 11, color: C.t3 }}>Share: <strong style={{ color: C.t1 }}>{allRev ? (r.rev / allRev * 100).toFixed(1) : 0}%</strong></span>
            </div>
            <div style={{ height: 6, background: C.bg, borderRadius: 3 }}>
              <div style={{ height: '100%', borderRadius: 3, background: i === 0 ? '#E8930A' : '#2E74CC', width: `${allRev ? (r.rev / allRev * 100) : 0}%`, transition: 'width .5s' }} />
            </div>
          </div>
        ))}
      </Card>
      </div>

      {/* Geography Breakdown */}
      {(() => {
        const regionAgg = {}
        filterSub(fk.regions || []).forEach(x => { if (!regionAgg[x.region]) regionAgg[x.region] = { region: x.region, rev: 0, orders: 0 }; regionAgg[x.region].rev += x.rev; regionAgg[x.region].orders += x.orders })
        const regionRows = Object.values(regionAgg).sort((a, b) => b.rev - a.rev).map(r => ({ ...r, name: r.region }))
        const topStateRows = stateRows.slice(0, 6).map(s => ({ ...s, name: s.state?.charAt(0).toUpperCase() + s.state?.slice(1).toLowerCase() }))
        return <ShopifyGeoDonutRow regionRows={regionRows} tierRows={[]} topStates={topStateRows} allStateRows={stateRows} />
      })()}

      {/* Category Revenue Matrix */}
      {(() => {
        const catAggMatrix = {}
        filterSub(fk.categories || []).forEach(x => {
          if (!catAggMatrix[x.category]) catAggMatrix[x.category] = { rev: 0, excRev: 0, units: 0, returned: 0, totalOrdersForReturn: 0 }
          catAggMatrix[x.category].rev += x.rev; catAggMatrix[x.category].excRev += x.excRev || 0; catAggMatrix[x.category].units += x.units
          catAggMatrix[x.category].returned += x.returns || 0; catAggMatrix[x.category].totalOrdersForReturn += x.orders || 0
        })
        const subCatData = {}
        filterSub(fk.subCategories || []).forEach(x => {
          if (!subCatData[x.category]) subCatData[x.category] = {}
          if (!subCatData[x.category][x.subcategory]) subCatData[x.category][x.subcategory] = { rev: 0, excRev: 0, units: 0, returned: 0, totalOrdersForReturn: 0 }
          subCatData[x.category][x.subcategory].rev += x.rev; subCatData[x.category][x.subcategory].excRev += x.excRev || 0; subCatData[x.category][x.subcategory].units += x.units
          subCatData[x.category][x.subcategory].returned += x.returns || 0; subCatData[x.category][x.subcategory].totalOrdersForReturn += x.orders || 0
        })
        const skuData = {}
        Object.entries(fk.skuMatrix || {}).forEach(([cat, scMap]) => {
          skuData[cat] = {}
          Object.entries(scMap).forEach(([sc, skuMap]) => {
            skuData[cat][sc] = {}
            Object.entries(skuMap).forEach(([sku, v]) => {
              skuData[cat][sc][sku] = { rev: v.rev, excRev: v.excRev, units: v.units }
            })
          })
        })
        const title = subView === 'overview' ? 'Category Revenue Matrix · Flipkart' : subView === 'fbf' ? 'Category Revenue Matrix · FBF' : 'Category Revenue Matrix · Non-FBF'
        return <FinancialCategoryMatrix catData={catAggMatrix} subCatData={subCatData} skuData={skuData} title={title} />
      })()}
      {(() => {
        const catRows = Object.entries((() => { const m = {}; filterSub(fk.categories || []).forEach(x => { if (!m[x.category]) m[x.category] = { rev: 0, units: 0, orders: 0 }; m[x.category].rev += x.rev; m[x.category].units += x.units; m[x.category].orders += x.orders }); return m })()||{}).map(([cat, v]) => ({ name: cat, rev: v.rev, units: v.units, orders: v.orders })).sort((a,b) => b.rev-a.rev)
        const subCatRows = (() => { const m = {}; filterSub(fk.subCategories || []).forEach(x => { const k = x.category+'::'+x.subcategory; if (!m[k]) m[k] = { name: x.subcategory, category: x.category, rev: 0, units: 0, orders: 0 }; m[k].rev += x.rev; m[k].units += x.units; m[k].orders += x.orders }); return Object.values(m).sort((a,b) => b.rev-a.rev) })()
        const tableTitle = subView === 'overview' ? 'Category Revenue · Flipkart' : subView === 'fbf' ? 'Category Revenue · FBF' : 'Category Revenue · Non-FBF'
        return <CatSubCatRow catRows={catRows} subCatRows={subCatRows} title={tableTitle} selectedCat={selectedCat} onSelectCat={v => { setSelectedCat(v); setSelectedSubCat(null) }} selectedSubCat={selectedSubCat} onSelectSubCat={setSelectedSubCat} />
      })()}

      {/* Top States paginated */}
      <PaginatedCard title="Top States" rows={stateRows.map(s => ({ ...s, state: s.state?.charAt(0).toUpperCase() + s.state?.slice(1).toLowerCase(), aov: s.orders ? Math.round(s.rev / s.orders) : 0 }))} columns={[{ key: 'state', label: 'State' }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'aov', label: 'AOV', align: 'right', render: v => `₹${v.toLocaleString('en-IN')}` }]} pageSize={15} />
    </div>
  )
}

function TrendAnalysisCard({ title, daily, grossColor, grossGradId, revKey = 'rev', excRevKey = 'excRev' }) {
  const nDays = daily.length
  const autoGroup = nDays <= 14 ? 'daily' : nDays <= 90 ? 'weekly' : 'monthly'
  const [groupBy, setGroupBy] = useState(autoGroup)
  const selStyle = { fontSize: 11, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, outline: 'none', fontFamily: 'var(--font)', cursor: 'pointer' }

  const grouped = (() => {
    if (groupBy === 'daily') return daily
    const agg = {}
    daily.forEach(d => {
      const k = getGroupKey(d.date, groupBy)
      if (!agg[k]) agg[k] = { date: k, [revKey]: 0, [excRevKey]: 0, units: 0 }
      agg[k][revKey] += d[revKey] || 0
      agg[k][excRevKey] += d[excRevKey] || 0
      agg[k].units += d.units || 0
    })
    return Object.values(agg)
  })()

  const fmtTick = v => v >= 1e5 ? `${(v/1e5).toFixed(1)}L` : v >= 1e3 ? `${(v/1e3).toFixed(0)}k` : String(v)
  const gradId = grossGradId || 'trendGrossGrad'

  return (
    <Card title={title} action={
      <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={selStyle}>
        {GROUP_OPTS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
      </select>
    }>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={grouped} margin={{ top: 4, right: 40, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={grossColor} stopOpacity={0.2} /><stop offset="95%" stopColor={grossColor} stopOpacity={0} /></linearGradient>
            <linearGradient id={gradId + '_net'} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0D9E68" stopOpacity={0.1} /><stop offset="95%" stopColor="#0D9E68" stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={d => d?.slice(5)} />
          <YAxis yAxisId="rev" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={fmtTick} width={55} />
          <YAxis yAxisId="units" orientation="right" tick={{ fontSize: 10, fill: '#2E74CC' }} tickFormatter={v => fmtN(v)} width={36} />
          <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 11px', fontSize: 11 }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: C.t2 }}>{label?.slice(5) || label}</div>
              {payload.map(p => <div key={p.name} style={{ color: p.color }}>{p.name}: {p.name === 'Units' ? fmtN(p.value) : fmt(p.value)}</div>)}
            </div>
          ) : null} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area yAxisId="rev" type="monotone" dataKey={revKey} name="Gross Revenue" stroke={grossColor} fill={`url(#${gradId})`} strokeWidth={2} dot={false} />
          <Area yAxisId="rev" type="monotone" dataKey={excRevKey} name="Net Revenue" stroke="#0D9E68" fill={`url(#${gradId}_net)`} strokeWidth={2} dot={false} strokeDasharray="4 2" />
          <Line yAxisId="units" type="monotone" dataKey="units" name="Units" stroke="#2E74CC" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  )
}

function BlinkitTab({ data }) {
  const bl = data.blinkit || {}
  const t = bl.totals || {}
  const nDays = t.days || 1
  const [selectedCat, setSelectedCat] = useState(null)

  const allCats = bl.categories || []
  const allSubCats = bl.subCategories || []
  const filtCats = selectedCat ? allCats.filter(c => c.category === selectedCat) : allCats
  const filtSubCats = selectedCat ? allSubCats.filter(c => c.category === selectedCat) : allSubCats

  const rev = filtCats.reduce((s, c) => s + c.rev, 0) || t.rev || 0
  const excRev = filtCats.reduce((s, c) => s + (c.excRev||0), 0) || t.excRev || 0
  const units = filtCats.reduce((s, c) => s + c.units, 0) || t.units || 0
  const skus = t.skus || 0
  const cities = t.cities || 0
  const asp = units ? excRev / units : 0
  const dailyAvg = nDays ? rev / nDays : 0

  const daily = bl.daily || []
  const blPrevRev = bl.prevRev || 0
  const blPrevExcRev = bl.prevExcRev || 0
  const blPrevUnits = bl.prevUnits || 0
  const blPrevSkus = bl.prevSkus || 0
  const blPrevCities = bl.prevCities || 0
  const blPrevDailyArr = bl.prevDaily || []
  const blRevChg = blPrevRev > 0 ? ((rev - blPrevRev) / blPrevRev * 100) : null
  const blChgBadge = (cur, prev) => { if (!prev) return null; const p = (cur - prev) / prev * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> }
  const blSparkData = Array.from({ length: Math.max(daily.length, blPrevDailyArr.length) }, (_, i) => ({
    i, cur: daily[i]?.rev ?? null, prev: blPrevDailyArr[i]?.rev ?? null
  }))

  const cityRows = bl.cities || []
  const stateRows = bl.states || []

  const catMatrixData = {}
  filtCats.forEach(c => { catMatrixData[c.category] = { rev: c.rev, excRev: c.excRev||0, units: c.units } })
  const subCatMatrixData = {}
  filtSubCats.forEach(x => {
    if (!subCatMatrixData[x.category]) subCatMatrixData[x.category] = {}
    subCatMatrixData[x.category][x.subcategory] = { rev: x.rev, excRev: x.excRev||0, units: x.units }
  })

  const catRowsForCatSubCat = allCats.map(c => ({ name: c.category, rev: c.rev, units: c.units, orders: 0 }))
  const subCatRowsForCatSubCat = allSubCats.map(x => ({ name: x.subcategory, category: x.category, rev: x.rev, units: x.units, orders: 0 }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {selectedCat && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
          <span style={{ color: C.t2 }}>Filtered by category:</span>
          <strong style={{ color: C.t1 }}>{selectedCat}</strong>
          <button onClick={() => setSelectedCat(null)} style={{ marginLeft: 'auto', fontSize: 11, color: C.acc, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>✕ Clear</button>
        </div>
      )}
      {/* KPI layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
        <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
          <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue · MRP</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(rev)}</div>
            {blRevChg !== null && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: blRevChg >= 0 ? C.green.bg : C.red.bg, color: blRevChg >= 0 ? C.green.tx : C.red.tx }}>{blRevChg >= 0 ? '▲' : '▼'} {Math.abs(blRevChg).toFixed(1)}%</span>}
          </div>
          <div className="kpi-sub" style={{ fontSize: 13 }}>{fmtN(units)} units · {fmtN(cities)} cities</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={blSparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs><linearGradient id="blGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#FFD600" stopOpacity={0.25} /><stop offset="95%" stopColor="#FFD600" stopOpacity={0} /></linearGradient></defs>
                <Area type="monotone" dataKey="cur" name="Current" stroke="#FFD600" strokeWidth={2} fill="url(#blGrad)" dot={false} connectNulls />
                <Area type="monotone" dataKey="prev" name="Prev" stroke={C.t3} strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ color: p.name === 'Current' ? C.t1 : C.t3 }}>{p.name}: {fmt(p.value)}</div>)}</div> : null} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, flex: 1 }}>
            {[
              { label: 'Net Revenue (Exc GST)', value: fmt(excRev), sub: `GST ${fmt(rev - excRev)}`, badge: blChgBadge(excRev, blPrevExcRev) },
              { label: 'Daily Avg', value: fmt(dailyAvg), sub: `over ${nDays} days`, badge: blChgBadge(dailyAvg, blPrevRev > 0 ? blPrevRev / nDays : 0) },
            ].map(k => (
              <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
                <div className="kpi-label">{k.label}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}><div className="kpi-value" style={{ fontSize: 17 }}>{k.value}</div>{k.badge}</div>
                {k.sub && <div className="kpi-sub">{k.sub}</div>}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, flex: 1 }}>
            {[
              { label: 'ASP', value: `₹${Math.round(asp).toLocaleString('en-IN')}`, sub: 'Avg selling price', badge: blChgBadge(asp, blPrevUnits > 0 ? blPrevExcRev / blPrevUnits : 0) },
              { label: 'Active Products', value: fmtN(skus), sub: 'Product types sold', badge: blChgBadge(skus, blPrevSkus) },
            ].map(k => (
              <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
                <div className="kpi-label">{k.label}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}><div className="kpi-value" style={{ fontSize: 17 }}>{k.value}</div>{k.badge}</div>
                {k.sub && <div className="kpi-sub">{k.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trend Analysis */}
      <TrendAnalysisCard title="Trend Analysis · Blinkit" daily={daily} grossColor="#FFD600" grossGradId="blGrossGrad2" />

      {/* Geography */}
      {(() => {
        const regAgg = {}; cityRows.forEach(c => { if (!c.region) return; if (!regAgg[c.region]) regAgg[c.region] = { name: c.region, region: c.region, rev: 0, orders: 0, units: 0 }; regAgg[c.region].rev += c.rev; regAgg[c.region].orders += c.units; regAgg[c.region].units += c.units })
        const tierAgg = {}; cityRows.forEach(c => { if (!c.cityTier) return; const k = `Tier ${c.cityTier}`; if (!tierAgg[k]) tierAgg[k] = { name: k, tier: c.cityTier, rev: 0, orders: 0, units: 0 }; tierAgg[k].rev += c.rev; tierAgg[k].orders += c.units; tierAgg[k].units += c.units })
        const regionRows = Object.values(regAgg).sort((a, b) => b.rev - a.rev)
        const tierRows = Object.values(tierAgg).sort((a, b) => b.rev - a.rev)
        const topStates = stateRows.slice(0, 6).map(s => ({ ...s, name: s.state }))
        return <ShopifyGeoDonutRow regionRows={regionRows} tierRows={tierRows} topStates={topStates} allStateRows={stateRows} />
      })()}

      {/* Category Matrix */}
      <FinancialCategoryMatrix catData={catMatrixData} subCatData={subCatMatrixData} skuData={bl.skuMatrix || {}} title="Category Revenue Matrix · Blinkit" />

      {/* Cat + SubCat table */}
      <CatSubCatRow
        catRows={catRowsForCatSubCat}
        subCatRows={subCatRowsForCatSubCat}
        title="Category Revenue · Blinkit"
        selectedCat={selectedCat}
        onSelectCat={setSelectedCat}
      />

      {/* Cities + States */}
      <div className="g-2">
        <PaginatedCard title="All Cities" rows={cityRows} columns={[
          { key: 'city', label: 'City' },
          { key: 'region', label: 'Region', render: v => v || '—' },
          { key: 'cityTier', label: 'Tier', render: v => v ? `Tier ${v}` : '—' },
          { key: 'units', label: 'Units', align: 'right', render: v => fmtN(v) },
          { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
          { key: 'skus', label: 'SKUs', align: 'right', render: v => fmtN(v) },
        ]} pageSize={15} />
        <PaginatedCard title="Top States" rows={stateRows} columns={[
          { key: 'state', label: 'State' },
          { key: 'units', label: 'Units', align: 'right', render: v => fmtN(v) },
          { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
        ]} pageSize={15} />
      </div>
    </div>
  )
}

function InstaTab({ data }) {
  const ins = data.instamart || {}
  const t = ins.totals || {}
  const nDays = t.days || 1
  const [selectedCat, setSelectedCat] = useState(null)

  const allCats = ins.categories || []
  const allSubCats = ins.subCategories || []
  const filtCats = selectedCat ? allCats.filter(c => c.category === selectedCat) : allCats
  const filtSubCats = selectedCat ? allSubCats.filter(c => c.category === selectedCat) : allSubCats

  const rev = filtCats.reduce((s, c) => s + c.rev, 0) || t.rev || 0
  const excRev = filtCats.reduce((s, c) => s + (c.excRev||0), 0) || t.excRev || 0
  const units = filtCats.reduce((s, c) => s + c.units, 0) || t.units || 0
  const skus = t.skus || 0
  const cities = t.cities || 0
  const asp = units ? excRev / units : 0
  const dailyAvg = nDays ? rev / nDays : 0

  const daily = ins.daily || []
  const insPrevRev = ins.prevRev || 0
  const insPrevExcRev = ins.prevExcRev || 0
  const insPrevUnits = ins.prevUnits || 0
  const insPrevSkus = ins.prevSkus || 0
  const insPrevCities = ins.prevCities || 0
  const insPrevDailyArr = ins.prevDaily || []
  const insRevChg = insPrevRev > 0 ? ((rev - insPrevRev) / insPrevRev * 100) : null
  const insSparkData = Array.from({ length: Math.max(daily.length, insPrevDailyArr.length) }, (_, i) => ({
    i, cur: daily[i]?.rev ?? null, prev: insPrevDailyArr[i]?.rev ?? null
  }))

  const cityRows = ins.cities || []
  const stateRows = ins.states || []

  const catMatrixData = {}
  filtCats.forEach(c => { catMatrixData[c.category] = { rev: c.rev, excRev: c.excRev||0, units: c.units } })
  const subCatMatrixData = {}
  filtSubCats.forEach(x => {
    if (!subCatMatrixData[x.category]) subCatMatrixData[x.category] = {}
    subCatMatrixData[x.category][x.subcategory] = { rev: x.rev, excRev: x.excRev||0, units: x.units }
  })

  const catRowsForCatSubCat = allCats.map(c => ({ name: c.category, rev: c.rev, units: c.units, orders: 0 }))
  const subCatRowsForCatSubCat = allSubCats.map(x => ({ name: x.subcategory, category: x.category, rev: x.rev, units: x.units, orders: 0 }))

  const insChgBadge = (cur, prev) => { if (!prev) return null; const p = (cur - prev) / prev * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {selectedCat && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
          <span style={{ color: C.t2 }}>Filtered by category:</span>
          <strong style={{ color: C.t1 }}>{selectedCat}</strong>
          <button onClick={() => setSelectedCat(null)} style={{ marginLeft: 'auto', fontSize: 11, color: C.acc, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>✕ Clear</button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
        <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
          <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue · Inc. GST</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(rev)}</div>
            {insRevChg !== null && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: insRevChg >= 0 ? C.green.bg : C.red.bg, color: insRevChg >= 0 ? C.green.tx : C.red.tx }}>{insRevChg >= 0 ? '▲' : '▼'} {Math.abs(insRevChg).toFixed(1)}%</span>}
          </div>
          <div className="kpi-sub" style={{ fontSize: 13 }}>{nDays} days · {fmtN(units)} units</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={insSparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs><linearGradient id="inGrossGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#FF6B35" stopOpacity={0.25} /><stop offset="95%" stopColor="#FF6B35" stopOpacity={0} /></linearGradient></defs>
                <Area type="monotone" dataKey="cur" name="Current" stroke="#FF6B35" strokeWidth={2} fill="url(#inGrossGrad)" dot={false} connectNulls />
                <Area type="monotone" dataKey="prev" name="Prev" stroke={C.t3} strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ color: p.name === 'Current' ? C.t1 : C.t3 }}>{p.name}: {fmt(p.value)}</div>)}</div> : null} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, flex: 1 }}>
            {[
              { label: 'Net Revenue (Exc GST)', value: fmt(excRev), sub: `GST ${fmt(rev - excRev)}`, badge: insChgBadge(excRev, insPrevExcRev) },
              { label: 'Daily Avg Revenue', value: fmt(dailyAvg), sub: `Inc GST / day`, badge: insChgBadge(dailyAvg, insPrevRev > 0 ? insPrevRev / nDays : 0) },
            ].map(k => (
              <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
                <div className="kpi-label">{k.label}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}><div className="kpi-value" style={{ fontSize: 17 }}>{k.value}</div>{k.badge}</div>
                {k.sub && <div className="kpi-sub">{k.sub}</div>}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, flex: 1 }}>
            {[
              { label: 'ASP (Inc GST)', value: `₹${Math.round(asp).toLocaleString('en-IN')}`, sub: 'Avg selling price', badge: insChgBadge(asp, insPrevUnits > 0 ? insPrevExcRev / insPrevUnits : 0) },
              { label: 'Active Products', value: fmtN(skus), sub: 'Product types sold', badge: insChgBadge(skus, insPrevSkus) },
            ].map(k => (
              <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
                <div className="kpi-label">{k.label}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}><div className="kpi-value" style={{ fontSize: 17 }}>{k.value}</div>{k.badge}</div>
                {k.sub && <div className="kpi-sub">{k.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <TrendAnalysisCard title="Trend Analysis · Instamart" daily={daily} grossColor="#FF6B35" grossGradId="inGrossGrad2" />

      {(() => {
        const regAgg = {}; cityRows.forEach(c => { if (!c.region) return; if (!regAgg[c.region]) regAgg[c.region] = { name: c.region, region: c.region, rev: 0, orders: 0, units: 0 }; regAgg[c.region].rev += c.rev; regAgg[c.region].orders += c.units; regAgg[c.region].units += c.units })
        const tierAgg = {}; cityRows.forEach(c => { if (!c.cityTier) return; const k = `Tier ${c.cityTier}`; if (!tierAgg[k]) tierAgg[k] = { name: k, tier: c.cityTier, rev: 0, orders: 0, units: 0 }; tierAgg[k].rev += c.rev; tierAgg[k].orders += c.units; tierAgg[k].units += c.units })
        const regionRows = Object.values(regAgg).sort((a, b) => b.rev - a.rev)
        const tierRows = Object.values(tierAgg).sort((a, b) => b.rev - a.rev)
        const topStates = stateRows.slice(0, 6).map(s => ({ ...s, name: s.state }))
        return <ShopifyGeoDonutRow regionRows={regionRows} tierRows={tierRows} topStates={topStates} allStateRows={stateRows} />
      })()}

      <FinancialCategoryMatrix catData={catMatrixData} subCatData={subCatMatrixData} skuData={ins.skuMatrix || {}} title="Category Revenue Matrix · Instamart" />

      <CatSubCatRow
        catRows={catRowsForCatSubCat}
        subCatRows={subCatRowsForCatSubCat}
        title="Category Revenue · Instamart"
        selectedCat={selectedCat}
        onSelectCat={setSelectedCat}
      />

      <div className="g-2">
        <PaginatedCard title="All Cities" rows={cityRows} columns={[
          { key: 'city', label: 'City' },
          { key: 'region', label: 'Region', render: v => v || '—' },
          { key: 'cityTier', label: 'Tier', render: v => v ? `Tier ${v}` : '—' },
          { key: 'units', label: 'Units', align: 'right', render: v => fmtN(v) },
          { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
          { key: 'skus', label: 'SKUs', align: 'right', render: v => fmtN(v) },
        ]} pageSize={15} />
        <PaginatedCard title="Top States" rows={stateRows} columns={[
          { key: 'state', label: 'State' },
          { key: 'units', label: 'Units', align: 'right', render: v => fmtN(v) },
          { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
        ]} pageSize={15} />
      </div>
    </div>
  )
}

function ZeptoTab({ data }) {
  const zp = data.zepto || {}
  const t = zp.totals || {}
  const nDays = t.days || 1
  const orders = t.orders || 0
  const [selectedCat, setSelectedCat] = useState(null)

  const allCats = zp.categories || []
  const allSubCats = zp.subCategories || []
  const filtCats = selectedCat ? allCats.filter(c => c.category === selectedCat) : allCats
  const filtSubCats = selectedCat ? allSubCats.filter(c => c.category === selectedCat) : allSubCats

  const rev = filtCats.reduce((s, c) => s + c.rev, 0) || t.rev || 0
  const excRev = filtCats.reduce((s, c) => s + (c.excRev||0), 0) || t.excRev || 0
  const units = filtCats.reduce((s, c) => s + c.units, 0) || t.units || 0
  const skus = t.skus || 0
  const cities = t.cities || 0
  const asp = units ? excRev / units : 0
  const dailyAvg = nDays ? rev / nDays : 0

  const daily = zp.daily || []
  const zpPrevRev = zp.prevRev || 0
  const zpPrevExcRev = zp.prevExcRev || 0
  const zpPrevUnits = zp.prevUnits || 0
  const zpPrevSkus = zp.prevSkus || 0
  const zpPrevCities = zp.prevCities || 0
  const zpPrevDailyArr = zp.prevDaily || []
  const zpRevChg = zpPrevRev > 0 ? ((rev - zpPrevRev) / zpPrevRev * 100) : null
  const zpSparkData = Array.from({ length: Math.max(daily.length, zpPrevDailyArr.length) }, (_, i) => ({
    i, cur: daily[i]?.rev ?? null, prev: zpPrevDailyArr[i]?.rev ?? null
  }))

  const cityRows = zp.cities || []
  const stateRows = zp.states || []

  const catMatrixData = {}
  filtCats.forEach(c => { catMatrixData[c.category] = { rev: c.rev, excRev: c.excRev||0, units: c.units } })
  const subCatMatrixData = {}
  filtSubCats.forEach(x => {
    if (!subCatMatrixData[x.category]) subCatMatrixData[x.category] = {}
    subCatMatrixData[x.category][x.subcategory] = { rev: x.rev, excRev: x.excRev||0, units: x.units }
  })

  const catRowsForCatSubCat = allCats.map(c => ({ name: c.category, rev: c.rev, units: c.units, orders: 0 }))
  const subCatRowsForCatSubCat = allSubCats.map(x => ({ name: x.subcategory, category: x.category, rev: x.rev, units: x.units, orders: 0 }))

  const zpChgBadge = (cur, prev) => { if (!prev) return null; const p = (cur - prev) / prev * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {selectedCat && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
          <span style={{ color: C.t2 }}>Filtered by category:</span>
          <strong style={{ color: C.t1 }}>{selectedCat}</strong>
          <button onClick={() => setSelectedCat(null)} style={{ marginLeft: 'auto', fontSize: 11, color: C.acc, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>✕ Clear</button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
        <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
          <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue · Inc. GST</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(rev)}</div>
            {zpRevChg !== null && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: zpRevChg >= 0 ? C.green.bg : C.red.bg, color: zpRevChg >= 0 ? C.green.tx : C.red.tx }}>{zpRevChg >= 0 ? '▲' : '▼'} {Math.abs(zpRevChg).toFixed(1)}%</span>}
          </div>
          <div className="kpi-sub" style={{ fontSize: 13 }}>{nDays} days · {fmtN(orders)} orders · {fmtN(units)} units</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={zpSparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs><linearGradient id="zpGrossGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.25} /><stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} /></linearGradient></defs>
                <Area type="monotone" dataKey="cur" name="Current" stroke="#8B5CF6" strokeWidth={2} fill="url(#zpGrossGrad)" dot={false} connectNulls />
                <Area type="monotone" dataKey="prev" name="Prev" stroke={C.t3} strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ color: p.name === 'Current' ? C.t1 : C.t3 }}>{p.name}: {fmt(p.value)}</div>)}</div> : null} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, flex: 1 }}>
            {[
              { label: 'Net Revenue (Exc GST)', value: fmt(excRev), sub: `GST ${fmt(rev - excRev)}`, badge: zpChgBadge(excRev, zpPrevExcRev) },
              { label: 'Daily Avg Revenue', value: fmt(dailyAvg), sub: 'Inc GST / day', badge: zpChgBadge(dailyAvg, zpPrevRev > 0 ? zpPrevRev / nDays : 0) },
            ].map(k => (
              <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
                <div className="kpi-label">{k.label}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}><div className="kpi-value" style={{ fontSize: 17 }}>{k.value}</div>{k.badge}</div>
                {k.sub && <div className="kpi-sub">{k.sub}</div>}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, flex: 1 }}>
            {[
              { label: 'ASP (Inc GST)', value: `₹${Math.round(asp).toLocaleString('en-IN')}`, sub: 'Avg selling price', badge: zpChgBadge(asp, zpPrevUnits > 0 ? zpPrevExcRev / zpPrevUnits : 0) },
              { label: 'Active Products', value: fmtN(skus), sub: 'Product types sold', badge: zpChgBadge(skus, zpPrevSkus) },
            ].map(k => (
              <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
                <div className="kpi-label">{k.label}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}><div className="kpi-value" style={{ fontSize: 17 }}>{k.value}</div>{k.badge}</div>
                {k.sub && <div className="kpi-sub">{k.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <TrendAnalysisCard title="Trend Analysis · Zepto" daily={daily} grossColor="#8B5CF6" grossGradId="zpGrossGrad2" />

      {(() => {
        const regAgg = {}; cityRows.forEach(c => { if (!c.region) return; if (!regAgg[c.region]) regAgg[c.region] = { name: c.region, region: c.region, rev: 0, orders: 0, units: 0 }; regAgg[c.region].rev += c.rev; regAgg[c.region].orders += c.units; regAgg[c.region].units += c.units })
        const tierAgg = {}; cityRows.forEach(c => { if (!c.cityTier) return; const k = `Tier ${c.cityTier}`; if (!tierAgg[k]) tierAgg[k] = { name: k, tier: c.cityTier, rev: 0, orders: 0, units: 0 }; tierAgg[k].rev += c.rev; tierAgg[k].orders += c.units; tierAgg[k].units += c.units })
        const regionRows = Object.values(regAgg).sort((a, b) => b.rev - a.rev)
        const tierRows = Object.values(tierAgg).sort((a, b) => b.rev - a.rev)
        const topStates = stateRows.slice(0, 6).map(s => ({ ...s, name: s.state }))
        return <ShopifyGeoDonutRow regionRows={regionRows} tierRows={tierRows} topStates={topStates} allStateRows={stateRows} />
      })()}

      <FinancialCategoryMatrix catData={catMatrixData} subCatData={subCatMatrixData} skuData={zp.skuMatrix || {}} title="Category Revenue Matrix · Zepto" />

      <CatSubCatRow
        catRows={catRowsForCatSubCat}
        subCatRows={subCatRowsForCatSubCat}
        title="Category Revenue · Zepto"
        selectedCat={selectedCat}
        onSelectCat={setSelectedCat}
      />

      <div className="g-2">
        <PaginatedCard title="All Cities" rows={cityRows} columns={[
          { key: 'city', label: 'City' },
          { key: 'region', label: 'Region', render: v => v || '—' },
          { key: 'cityTier', label: 'Tier', render: v => v ? `Tier ${v}` : '—' },
          { key: 'units', label: 'Units', align: 'right', render: v => fmtN(v) },
          { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
          { key: 'skus', label: 'SKUs', align: 'right', render: v => fmtN(v) },
        ]} pageSize={15} />
        <PaginatedCard title="Top States" rows={stateRows} columns={[
          { key: 'state', label: 'State' },
          { key: 'units', label: 'Units', align: 'right', render: v => fmtN(v) },
          { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
        ]} pageSize={15} />
      </div>
    </div>
  )
}

function CredTab({ data }) {
  const cr = data.cred || {}
  const t = cr.totals || {}
  const nDays = t.days || 1
  const rev = t.rev || 0
  const excRev = t.excRev || 0
  const orders = t.orders || 0
  const units = t.units || 0
  const skus = t.skus || 0
  const asp = units ? rev / units : 0
  const dailyAvg = nDays ? rev / nDays : 0

  const crPrevRev = cr.prevRev || 0
  const crPrevExcRev = cr.prevExcRev || 0
  const crPrevOrders = cr.prevOrders || 0
  const crPrevUnits = cr.prevUnits || 0
  const crPrevDailyArr = cr.prevDaily || []
  const crRevChg = crPrevRev > 0 ? ((rev - crPrevRev) / crPrevRev * 100) : null
  const crExcChg = crPrevExcRev > 0 ? ((excRev - crPrevExcRev) / crPrevExcRev * 100) : null

  const [selectedCat, setSelectedCat] = useState(null)
  const [selectedSubCat, setSelectedSubCat] = useState(null)
  const daily = cr.daily || []
  const stateRows = cr.states || []
  const cityRows = cr.cities || []

  const crChgBadge = (cur, prev) => { if (!prev) return null; const p = (cur - prev) / prev * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> }

  // Trend analysis data
  const trendData = daily.map((d, i) => ({
    date: d.date,
    grossRev: d.rev,
    netRev: d.excRev || 0,
    units: d.units,
    prev: crPrevDailyArr[i]?.rev ?? null,
  }))

  // Category / subcategory rows for CatSubCatRow
  const allCats = cr.categories || []
  const allSubCats = cr.subCategories || []
  const catRows = allCats.map(c => ({ name: c.category, rev: c.rev, excRev: c.excRev || 0, units: c.units, orders: c.orders }))
  const subCatRows = allSubCats.map(s => ({ name: s.subcategory, category: s.category, rev: s.rev, excRev: s.excRev || 0, units: s.units, orders: s.orders }))

  // Category matrix data
  const catMatrixData = {}
  allCats.forEach(c => { catMatrixData[c.category] = { rev: c.rev, excRev: c.excRev || 0, units: c.units } })
  const subCatMatrixData = {}
  allSubCats.forEach(s => {
    if (!subCatMatrixData[s.category]) subCatMatrixData[s.category] = {}
    subCatMatrixData[s.category][s.subcategory] = { rev: s.rev, excRev: s.excRev || 0, units: s.units }
  })

  const crSparkData = Array.from({ length: Math.max(daily.length, crPrevDailyArr.length) }, (_, i) => ({
    i, cur: daily[i]?.rev ?? null, prev: crPrevDailyArr[i]?.rev ?? null
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero + 2×2 KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
        <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
          <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue · Inc. GST</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(rev)}</div>
            {crRevChg !== null && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: crRevChg >= 0 ? C.green.bg : C.red.bg, color: crRevChg >= 0 ? C.green.tx : C.red.tx }}>{crRevChg >= 0 ? '▲' : '▼'} {Math.abs(crRevChg).toFixed(1)}%</span>}
          </div>
          <div className="kpi-sub" style={{ fontSize: 13 }}>{nDays} days · {fmtN(orders)} orders · {fmtN(units)} units</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={crSparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs><linearGradient id="crGrossGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#E11D48" stopOpacity={0.25} /><stop offset="95%" stopColor="#E11D48" stopOpacity={0} /></linearGradient></defs>
                <Area type="monotone" dataKey="cur" name="Current" stroke="#E11D48" strokeWidth={2} fill="url(#crGrossGrad)" dot={false} connectNulls />
                <Area type="monotone" dataKey="prev" name="Prev" stroke={C.t3} strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ color: p.name === 'Current' ? C.t1 : C.t3 }}>{p.name}: {fmt(p.value)}</div>)}</div> : null} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {[
            { label: 'Net Revenue', value: fmt(excRev), sub: 'Exc. GST', badge: crChgBadge(excRev, crPrevExcRev) },
            { label: 'Daily Avg', value: fmt(dailyAvg), sub: `over ${nDays} days`, badge: crChgBadge(dailyAvg, crPrevRev > 0 ? crPrevRev / nDays : 0) },
            { label: 'ASP', value: `₹${Math.round(asp).toLocaleString('en-IN')}`, sub: 'Avg selling price / unit', badge: crChgBadge(asp, crPrevUnits > 0 ? crPrevRev / crPrevUnits : 0) },
            { label: 'Active Products', value: fmtN(skus), sub: 'Product types sold', badge: null },
          ].map(k => (
            <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
              <div className="kpi-label">{k.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                <div className="kpi-value" style={{ fontSize: 17 }}>{k.value}</div>{k.badge}
              </div>
              {k.sub && <div className="kpi-sub">{k.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Trend Analysis */}
      <TrendAnalysisCard title="Trend Analysis · CRED" daily={daily} grossColor="#E11D48" grossGradId="crGrossGrad3" />

      {/* Geography Breakdown */}
      <ShopifyGeoDonutRow
        regionRows={cr.regionRows || []}
        tierRows={(cr.tierRows || []).map(t => ({ ...t, name: t.name || `Tier ${t.tier}` }))}
        topStates={stateRows.slice(0, 6).map(s => ({ name: s.state, rev: s.rev, orders: s.orders }))}
        allStateRows={stateRows}
      />

      {/* Category Revenue Matrix */}
      <FinancialCategoryMatrix catData={catMatrixData} subCatData={subCatMatrixData} skuData={cr.skuMatrix || {}} title="Category Revenue Matrix · CRED" />

      {/* Category + Sub-category table */}
      <CatSubCatRow
        catRows={catRows}
        subCatRows={subCatRows}
        title="Category Revenue · CRED"
        selectedCat={selectedCat}
        onSelectCat={v => { setSelectedCat(v); setSelectedSubCat(null) }}
        selectedSubCat={selectedSubCat}
        onSelectSubCat={setSelectedSubCat}
      />

      {/* States + Cities */}
      <div className="g-2">
        <PaginatedCard title="Top States" rows={stateRows.map(s => ({ ...s, aov: s.orders ? Math.round(s.rev / s.orders) : 0 }))} columns={[
          { key: 'state', label: 'State' },
          { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
          { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) },
          { key: 'aov', label: 'AOV', align: 'right', render: v => `₹${v.toLocaleString('en-IN')}` },
        ]} pageSize={15} />
        <PaginatedCard title="Top Cities" rows={cityRows.map(c => ({ ...c, aov: c.orders ? Math.round(c.rev / c.orders) : 0 }))} columns={[
          { key: 'city', label: 'City' },
          { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
          { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) },
          { key: 'aov', label: 'AOV', align: 'right', render: v => `₹${v.toLocaleString('en-IN')}` },
        ]} pageSize={15} />
      </div>
    </div>
  )
}

function FirstcryTab({ data }) {
  const fc = data.firstcry || {}
  const t = fc.totals || {}
  const nDays = t.days || 1
  const rev = t.rev || 0
  const excRev = t.excRev || 0
  const orders = t.orders || 0
  const units = t.units || 0
  const skus = t.skus || 0
  const asp = units ? rev / units : 0
  const dailyAvg = nDays ? rev / nDays : 0

  const fcPrevRev = fc.prevRev || 0
  const fcPrevExcRev = fc.prevExcRev || 0
  const fcPrevOrders = fc.prevOrders || 0
  const fcPrevUnits = fc.prevUnits || 0
  const fcPrevDailyArr = fc.prevDaily || []
  const fcRevChg = fcPrevRev > 0 ? ((rev - fcPrevRev) / fcPrevRev * 100) : null
  const fcExcChg = fcPrevExcRev > 0 ? ((excRev - fcPrevExcRev) / fcPrevExcRev * 100) : null

  const [selectedCat, setSelectedCat] = useState(null)
  const [selectedSubCat, setSelectedSubCat] = useState(null)
  const daily = fc.daily || []
  const stateRows = fc.states || []
  const cityRows = fc.cities || []

  const fcChgBadge = (cur, prev) => { if (!prev) return null; const p = (cur - prev) / prev * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> }

  const trendData = daily.map((d, i) => ({
    date: d.date,
    grossRev: d.rev,
    netRev: d.excRev || 0,
    units: d.units,
    prev: fcPrevDailyArr[i]?.rev ?? null,
  }))

  const allCats = fc.categories || []
  const allSubCats = fc.subCategories || []
  const catRows = allCats.map(c => ({ name: c.category, rev: c.rev, excRev: c.excRev || 0, units: c.units, orders: c.orders }))
  const subCatRows = allSubCats.map(s => ({ name: s.subcategory, category: s.category, rev: s.rev, excRev: s.excRev || 0, units: s.units, orders: s.orders }))

  const catMatrixData = {}
  allCats.forEach(c => { catMatrixData[c.category] = { rev: c.rev, excRev: c.excRev || 0, units: c.units } })
  const subCatMatrixData = {}
  allSubCats.forEach(s => {
    if (!subCatMatrixData[s.category]) subCatMatrixData[s.category] = {}
    subCatMatrixData[s.category][s.subcategory] = { rev: s.rev, excRev: s.excRev || 0, units: s.units }
  })

  const fcSparkData = Array.from({ length: Math.max(daily.length, fcPrevDailyArr.length) }, (_, i) => ({
    i, cur: daily[i]?.rev ?? null, prev: fcPrevDailyArr[i]?.rev ?? null
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
        <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
          <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue · Inc. GST</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(rev)}</div>
            {fcRevChg !== null && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: fcRevChg >= 0 ? C.green.bg : C.red.bg, color: fcRevChg >= 0 ? C.green.tx : C.red.tx }}>{fcRevChg >= 0 ? '▲' : '▼'} {Math.abs(fcRevChg).toFixed(1)}%</span>}
          </div>
          <div className="kpi-sub" style={{ fontSize: 13 }}>{nDays} days · {fmtN(orders)} orders · {fmtN(units)} units</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fcSparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs><linearGradient id="fcGrossGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#F97316" stopOpacity={0.25} /><stop offset="95%" stopColor="#F97316" stopOpacity={0} /></linearGradient></defs>
                <Area type="monotone" dataKey="cur" name="Current" stroke="#F97316" strokeWidth={2} fill="url(#fcGrossGrad)" dot={false} connectNulls />
                <Area type="monotone" dataKey="prev" name="Prev" stroke={C.t3} strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ color: p.name === 'Current' ? C.t1 : C.t3 }}>{p.name}: {fmt(p.value)}</div>)}</div> : null} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {[
            { label: 'Net Revenue', value: fmt(excRev), sub: 'Exc. GST', badge: fcChgBadge(excRev, fcPrevExcRev) },
            { label: 'Daily Avg', value: fmt(dailyAvg), sub: `over ${nDays} days`, badge: fcChgBadge(dailyAvg, fcPrevRev > 0 ? fcPrevRev / nDays : 0) },
            { label: 'ASP', value: `₹${Math.round(asp).toLocaleString('en-IN')}`, sub: 'Avg selling price / unit', badge: fcChgBadge(asp, fcPrevUnits > 0 ? fcPrevRev / fcPrevUnits : 0) },
            { label: 'Active Products', value: fmtN(skus), sub: 'Product types sold', badge: null },
          ].map(k => (
            <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
              <div className="kpi-label">{k.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                <div className="kpi-value" style={{ fontSize: 17 }}>{k.value}</div>{k.badge}
              </div>
              {k.sub && <div className="kpi-sub">{k.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      <TrendAnalysisCard title="Trend Analysis · Firstcry" daily={daily} grossColor="#F97316" grossGradId="fcGrossGrad3" />

      <ShopifyGeoDonutRow
        regionRows={fc.regionRows || []}
        tierRows={(fc.tierRows || []).map(t => ({ ...t, name: t.name || `Tier ${t.tier}` }))}
        topStates={stateRows.slice(0, 6).map(s => ({ name: s.state, rev: s.rev, orders: s.orders }))}
        allStateRows={stateRows}
      />

      <FinancialCategoryMatrix catData={catMatrixData} subCatData={subCatMatrixData} skuData={fc.skuMatrix || {}} title="Category Revenue Matrix · Firstcry" />

      <CatSubCatRow
        catRows={catRows}
        subCatRows={subCatRows}
        title="Category Revenue · Firstcry"
        selectedCat={selectedCat}
        onSelectCat={v => { setSelectedCat(v); setSelectedSubCat(null) }}
        selectedSubCat={selectedSubCat}
        onSelectSubCat={setSelectedSubCat}
      />

      <div className="g-2">
        <PaginatedCard title="Top States" rows={stateRows.map(s => ({ ...s, aov: s.orders ? Math.round(s.rev / s.orders) : 0 }))} columns={[
          { key: 'state', label: 'State' },
          { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
          { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) },
          { key: 'aov', label: 'AOV', align: 'right', render: v => `₹${v.toLocaleString('en-IN')}` },
        ]} pageSize={15} />
        <PaginatedCard title="Top Cities" rows={cityRows.map(c => ({ ...c, aov: c.orders ? Math.round(c.rev / c.orders) : 0 }))} columns={[
          { key: 'city', label: 'City' },
          { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
          { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) },
          { key: 'aov', label: 'AOV', align: 'right', render: v => `₹${v.toLocaleString('en-IN')}` },
        ]} pageSize={15} />
      </div>
    </div>
  )
}

function MyntraTab({ data }) {
  const mn = data.myntra || {}
  const totals = mn.totals || {}
  const nDays = totals.days || data.nDays || 1
  const rev = totals.rev || 0
  const excRev = totals.excRev || 0
  const nOrders = totals.orders || 0
  const qty = totals.units || 0
  const asp = qty ? excRev / qty : 0

  const prevRev = mn.prevRev || 0
  const prevExcRev = mn.prevExcRev || 0
  const prevOrders = mn.prevOrders || 0
  const revChg = prevRev > 0 ? ((rev - prevRev) / prevRev * 100) : null
  const excChg = prevExcRev > 0 ? ((excRev - prevExcRev) / prevExcRev * 100) : null

  const dailyArr = mn.daily || []
  const prevDaily = mn.prevDaily || []

  const sparkData = Array.from({ length: Math.max(dailyArr.length, prevDaily.length) }, (_, i) => ({
    i, cur: dailyArr[i]?.rev ?? null, prev: prevDaily[i]?.rev ?? null
  }))

  const chgBadge = (cur, prev) => { if (!prev) return null; const p = (cur - prev) / prev * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> }

  const cityRows = mn.cities || []
  const stateRows = mn.states || []

  const catMatrixData = {}
  ;(mn.categories || []).forEach(c => { catMatrixData[c.category] = { rev: c.rev, excRev: c.excRev || 0, units: c.units, orders: c.orders } })
  const subCatMatrixData = {}
  ;(mn.subCategories || []).forEach(x => { if (!subCatMatrixData[x.category]) subCatMatrixData[x.category] = {}; subCatMatrixData[x.category][x.subcategory] = { rev: x.rev, excRev: x.excRev || 0, units: x.units, orders: x.orders } })
  const catRowsForCatSubCat = (mn.categories || []).map(c => ({ name: c.category, rev: c.rev, excRev: c.excRev || 0, units: c.units, orders: c.orders }))
  const subCatRowsForCatSubCat = (mn.subCategories || []).map(x => ({ name: x.subcategory, category: x.category, rev: x.rev, excRev: x.excRev || 0, units: x.units, orders: x.orders }))

  const [selectedCat, setSelectedCat] = useState(null)
  const [selectedSubCat, setSelectedSubCat] = useState(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* KPI Hero + 2×2 grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
        <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
          <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue · Inc. GST</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(rev)}</div>
            {revChg !== null && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: revChg >= 0 ? C.green.bg : C.red.bg, color: revChg >= 0 ? C.green.tx : C.red.tx }}>{revChg >= 0 ? '▲' : '▼'} {Math.abs(revChg).toFixed(1)}%</span>}
          </div>
          <div className="kpi-sub" style={{ fontSize: 13 }}>{nDays} days · {fmtN(nOrders)} orders · {fmtN(qty)} units</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs><linearGradient id="mnGrossGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#E87858" stopOpacity={0.25} /><stop offset="95%" stopColor="#E87858" stopOpacity={0} /></linearGradient></defs>
                <Area type="monotone" dataKey="cur" name="Current" stroke="#E87858" strokeWidth={2} fill="url(#mnGrossGrad)" dot={false} connectNulls />
                <Area type="monotone" dataKey="prev" name="Prev" stroke={C.t3} strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ color: p.name === 'Current' ? C.t1 : C.t3 }}>{p.name}: {fmt(p.value)}</div>)}</div> : null} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {[
            { label: 'Net Revenue (Exc. GST)', value: fmt(excRev), sub: `GST: ${fmt(rev - excRev)}`, badge: chgBadge(excRev, prevExcRev) },
            { label: 'Daily Avg Revenue', value: fmt(excRev / nDays), sub: 'Net per day', badge: chgBadge(excRev / nDays, prevExcRev > 0 ? prevExcRev / nDays : 0) },
            { label: 'ASP', value: `₹${Math.round(asp).toLocaleString('en-IN')}`, sub: 'Avg selling price (exc. GST)', badge: chgBadge(asp, prevOrders > 0 && prevExcRev > 0 ? prevExcRev / prevOrders : 0) },
            { label: 'Active Products', value: fmtN(totals.skus), sub: 'Product types sold' },
          ].map(k => (
            <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
              <div className="kpi-label">{k.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                <div className="kpi-value" style={{ fontSize: 17 }}>{k.value}</div>{k.badge}
              </div>
              {k.sub && <div className="kpi-sub">{k.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Trend Analysis */}
      <TrendAnalysisCard title="Trend Analysis · Myntra" daily={dailyArr} grossColor="#E87858" grossGradId="mnGrossGrad2" />

      {/* Geography Breakdown */}
      {(() => {
        const regAgg = {}; cityRows.forEach(c => { if (!c.region) return; if (!regAgg[c.region]) regAgg[c.region] = { name: c.region, region: c.region, rev: 0, orders: 0, units: 0 }; regAgg[c.region].rev += c.rev; regAgg[c.region].orders += c.orders; regAgg[c.region].units += c.orders })
        const tierAgg = {}; cityRows.forEach(c => { if (!c.cityTier) return; const k = `Tier ${c.cityTier}`; if (!tierAgg[k]) tierAgg[k] = { name: k, tier: c.cityTier, rev: 0, orders: 0, units: 0 }; tierAgg[k].rev += c.rev; tierAgg[k].orders += c.orders; tierAgg[k].units += c.orders })
        const regionRows = Object.values(regAgg).sort((a, b) => b.rev - a.rev)
        const tierRows = Object.values(tierAgg).sort((a, b) => b.rev - a.rev)
        const topStates = stateRows.slice(0, 6).map(s => ({ ...s, name: s.state }))
        return <ShopifyGeoDonutRow regionRows={regionRows} tierRows={tierRows} topStates={topStates} allStateRows={stateRows} />
      })()}

      {/* Category Revenue Matrix */}
      <FinancialCategoryMatrix catData={catMatrixData} subCatData={subCatMatrixData} skuData={mn.skuMatrix || {}} title="Category Revenue Matrix · Myntra" />

      {/* Category + SubCategory table */}
      <CatSubCatRow
        catRows={catRowsForCatSubCat}
        subCatRows={subCatRowsForCatSubCat}
        title="Category · Myntra"
        selectedCat={selectedCat}
        onSelectCat={v => { setSelectedCat(v); setSelectedSubCat(null) }}
        selectedSubCat={selectedSubCat}
        onSelectSubCat={setSelectedSubCat}
      />

      {/* Top States + Top Cities side by side */}
      <div className="g-2" style={{ alignItems: 'stretch' }}>
        <PaginatedCard title="Top States · Myntra" rows={stateRows} columns={[
          { key: 'state', label: 'State' },
          { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
          { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) },
          { key: 'asp', label: 'ASP', align: 'right', render: (_, r) => `₹${r.orders ? Math.round(r.rev / r.orders).toLocaleString('en-IN') : 0}` },
        ]} pageSize={15} />
        <PaginatedCard title="Top Cities · Myntra" rows={cityRows} columns={[
          { key: 'city', label: 'City' },
          { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
          { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) },
          { key: 'asp', label: 'ASP', align: 'right', render: (_, r) => `₹${r.orders ? Math.round(r.rev / r.orders).toLocaleString('en-IN') : 0}` },
        ]} pageSize={15} />
      </div>
    </div>
  )
}

function OfflineTab({ data }) {
  const off = data.offline || {}
  const [sub, setSub] = useState('all') // 'all' | 'Stockist' | 'Offline_B2B' | 'MTGT'

  const SUB_OPTIONS = [
    { id: 'all', label: 'All Offline' },
    { id: 'Stockist', label: 'Stockist' },
    { id: 'Offline_B2B', label: 'Offline B2B' },
    { id: 'MTGT', label: 'MT GT' },
  ]

  // Sub-channel filter helper — returns rows matching current selection (or all when 'all')
  const filterSub = rows => sub === 'all' ? rows : rows.filter(r => r.subChannel === sub)

  // Totals: split sales vs credit notes
  const totalsBySub = off.totalsBySub || []
  const filteredTotals = filterSub(totalsBySub)
  const grossRev = filteredTotals.reduce((s, r) => s + (r.revSales || 0), 0)            // Gross = sales only
  const cnRev = filteredTotals.reduce((s, r) => s + (r.cnRev || 0), 0)                  // Credit notes (Inc. GST)
  const cnRevAbs = Math.abs(cnRev)                                                       // absolute credit note amount
  const grossAfterCN = grossRev - cnRevAbs                                              // gross minus credit notes
  const cnExcRev = filteredTotals.reduce((s, r) => s + (r.cnExcRev || 0), 0)
  const cnOrders = filteredTotals.reduce((s, r) => s + (r.cnOrders || 0), 0)
  const cnUnits = Math.abs(filteredTotals.reduce((s, r) => s + (r.cnUnits || 0), 0))
  const excRevSales = filteredTotals.reduce((s, r) => s + (r.excRevSales || 0), 0)
  // Net Revenue = (Gross − Credit Notes) excluding GST
  const netRev = excRevSales - Math.abs(cnExcRev)
  const gstCollected = grossAfterCN - netRev
  const nOrders = filteredTotals.reduce((s, r) => s + (r.orders || 0), 0)
  const qty = filteredTotals.reduce((s, r) => s + (r.units || 0), 0)
  const asp = qty ? netRev / qty : 0
  const nDays = data.nDays || 1

  const prevBySub = off.prevBySub || []
  const filteredPrev = filterSub(prevBySub)
  const prevGrossRev = filteredPrev.reduce((s, r) => s + (r.revSales || 0), 0)
  const prevCnRev = Math.abs(filteredPrev.reduce((s, r) => s + (r.cnRev || 0), 0))
  const prevCnExcRev = Math.abs(filteredPrev.reduce((s, r) => s + (r.cnExcRev || 0), 0))
  const prevExcRevSales = filteredPrev.reduce((s, r) => s + (r.excRevSales || 0), 0)
  const prevNetRev = prevExcRevSales - prevCnExcRev
  const prevOrders = filteredPrev.reduce((s, r) => s + (r.orders || 0), 0)
  const prevUnits = filteredPrev.reduce((s, r) => s + (r.units || 0), 0)
  const revChg = prevGrossRev > 0 ? ((grossRev - prevGrossRev) / prevGrossRev * 100) : null

  // Backward-compat aliases for the rest of the component
  const rev = grossRev
  const excRev = netRev
  const prevRev = prevGrossRev
  const prevExcRev = prevNetRev

  // Daily series — filter by sub-channel, aggregate by date.
  // rev/excRev are Sales-only; cnRev/cnExcRev are Credit Notes; net = excRev - |cnExcRev|
  const aggByDate = rows => {
    const m = {}
    filterSub(rows).forEach(d => {
      if (!m[d.date]) m[d.date] = { date: d.date, rev: 0, excRev: 0, cnRev: 0, cnExcRev: 0, orders: 0, units: 0, net: 0 }
      m[d.date].rev += d.rev || 0
      m[d.date].excRev += d.excRev || 0
      m[d.date].cnRev += Math.abs(d.cnRev || 0)
      m[d.date].cnExcRev += Math.abs(d.cnExcRev || 0)
      m[d.date].orders += d.orders || 0
      m[d.date].units += d.units || 0
    })
    Object.values(m).forEach(d => { d.net = (d.excRev || 0) - (d.cnExcRev || 0) })
    return Object.values(m).sort((a, b) => a.date.localeCompare(b.date))
  }
  const dailyArr = aggByDate(off.daily || [])
  const prevDailyArr = aggByDate(off.prevDaily || [])
  const sparkData = Array.from({ length: Math.max(dailyArr.length, prevDailyArr.length) }, (_, i) => ({
    i, cur: dailyArr[i]?.rev ?? null, prev: prevDailyArr[i]?.rev ?? null
  }))

  const chgBadge = (cur, prev) => { if (!prev) return null; const p = (cur - prev) / prev * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> }

  // Category aggregation — sum across selected sub-channel(s)
  const aggCat = rows => {
    const m = {}
    filterSub(rows).forEach(r => {
      if (!m[r.category]) m[r.category] = { name: r.category, rev: 0, excRev: 0, orders: 0, units: 0 }
      m[r.category].rev += r.rev || 0; m[r.category].excRev += r.excRev || 0
      m[r.category].orders += r.orders || 0; m[r.category].units += r.units || 0
    })
    return Object.values(m).sort((a, b) => b.rev - a.rev)
  }
  const catRows = aggCat(off.categoryRows || [])

  const aggSubCat = rows => {
    const m = {}
    filterSub(rows).forEach(r => {
      const k = `${r.category}::${r.subCategory}`
      if (!m[k]) m[k] = { name: r.subCategory, category: r.category, rev: 0, excRev: 0, orders: 0, units: 0 }
      m[k].rev += r.rev || 0; m[k].excRev += r.excRev || 0
      m[k].orders += r.orders || 0; m[k].units += r.units || 0
    })
    return Object.values(m).sort((a, b) => b.rev - a.rev)
  }
  const allSubCatRows = aggSubCat(off.subCategoryRows || []).map(x => ({ ...x, asp: x.units ? x.rev / x.units : 0 }))

  // State / City / Region / Tier aggregation
  const aggBy = (rows, keyFn, baseFields = {}) => {
    const m = {}
    filterSub(rows).forEach(r => {
      const k = keyFn(r)
      if (!m[k]) m[k] = { ...baseFields(r), rev: 0, orders: 0, units: 0 }
      m[k].rev += r.rev || 0; m[k].orders += r.orders || 0; m[k].units += r.units || 0
    })
    return Object.values(m).sort((a, b) => b.rev - a.rev)
  }
  const stateRows = aggBy(off.stateRows || [], r => r.state, r => ({ state: r.state, name: r.state, cities: r.cities || 0 }))
  const cityRows = aggBy(off.cityRows || [], r => `${r.city}|${r.state}`, r => ({ city: r.city, state: r.state, region: r.region, name: r.city }))
  const regionRows = aggBy(off.regionRows || [], r => r.region, r => ({ region: r.region }))
  const tierRows = aggBy(off.tierRows || [], r => `${r.tier}`, r => ({ tier: r.tier, label: r.label }))

  // Category matrix
  const catMatrixData = {}
  catRows.forEach(c => { catMatrixData[c.name] = { rev: c.rev, excRev: c.excRev, units: c.units, orders: c.orders } })
  const subCatMatrixData = {}
  allSubCatRows.forEach(s => { if (!subCatMatrixData[s.category]) subCatMatrixData[s.category] = {}; subCatMatrixData[s.category][s.name] = { rev: s.rev, excRev: s.excRev, units: s.units, orders: s.orders } })
  const skuMatrixData = {}
  filterSub(off.skuRows || []).forEach(x => {
    if (!skuMatrixData[x.category]) skuMatrixData[x.category] = {}
    if (!skuMatrixData[x.category][x.subCategory]) skuMatrixData[x.category][x.subCategory] = {}
    const cur = skuMatrixData[x.category][x.subCategory][x.sku] || { rev: 0, excRev: 0, units: 0, orders: 0 }
    cur.rev += x.rev || 0; cur.excRev += x.excRev || 0; cur.units += x.units || 0; cur.orders += x.orders || 0
    skuMatrixData[x.category][x.subCategory][x.sku] = cur
  })

  const totalRev = rev
  const pct = (a, b) => b > 0 ? `${(a / b * 100).toFixed(1)}%` : '—'

  const subTab = active => ({ fontSize: 12, fontWeight: 700, padding: '5px 16px', borderRadius: 7, border: `1.5px solid ${active ? C.t1 : C.border}`, background: active ? C.t1 : C.card, color: active ? '#fff' : C.t1, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all .15s' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Sub-channel toggle */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {SUB_OPTIONS.map(o => <button key={o.id} onClick={() => setSub(o.id)} style={subTab(sub === o.id)}>{o.label}</button>)}
      </div>

      {/* KPI Hero + 2×2 grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
        <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
          <div className="kpi-label" style={{ fontSize: 11 }}>Gross Revenue · Inc. GST</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(rev)}</div>
            {revChg !== null && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: revChg >= 0 ? C.green.bg : C.red.bg, color: revChg >= 0 ? C.green.tx : C.red.tx }}>{revChg >= 0 ? '▲' : '▼'} {Math.abs(revChg).toFixed(1)}%</span>}
          </div>
          <div className="kpi-sub" style={{ fontSize: 13 }}>{nDays} days · {fmtN(nOrders)} orders · {fmtN(qty)} units</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs><linearGradient id="offGrossGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0D9E68" stopOpacity={0.25} /><stop offset="95%" stopColor="#0D9E68" stopOpacity={0} /></linearGradient></defs>
                <Area type="monotone" dataKey="cur" name="Current" stroke="#0D9E68" strokeWidth={2} fill="url(#offGrossGrad)" dot={false} connectNulls />
                <Area type="monotone" dataKey="prev" name="Prev" stroke={C.t3} strokeWidth={1} fill="none" dot={false} strokeDasharray="3 2" connectNulls />
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>{payload.map(p => <div key={p.name} style={{ color: p.name === 'Current' ? C.t1 : C.t3 }}>{p.name}: {fmt(p.value)}</div>)}</div> : null} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            { label: 'Credit Notes', value: fmt(cnRevAbs), sub: `${fmtN(cnOrders)} orders · ${fmtN(cnUnits)} units`, badge: chgBadge(cnRevAbs, prevCnRev), accent: '#B91C1C' },
            { label: 'Net Revenue (Exc. GST)', value: fmt(netRev), sub: 'Gross − Credit Notes − GST', badge: chgBadge(netRev, prevNetRev) },
            { label: 'GST Collected', value: fmt(gstCollected), sub: 'On net sales', badge: chgBadge(gstCollected, (prevGrossRev - prevCnRev) - prevNetRev) },
            { label: 'AOV', value: `₹${Math.round(nOrders ? grossRev / nOrders : 0).toLocaleString('en-IN')}`, sub: 'Gross ÷ orders', badge: chgBadge(nOrders ? grossRev / nOrders : 0, prevOrders ? prevGrossRev / prevOrders : 0) },
            { label: 'ASP', value: `₹${Math.round(asp).toLocaleString('en-IN')}`, sub: 'Net rev ÷ units', badge: chgBadge(asp, prevUnits > 0 ? prevNetRev / prevUnits : 0) },
            { label: 'Units / Order', value: nOrders ? Math.round(qty / nOrders).toLocaleString('en-IN') : '0', sub: 'Avg units per order', badge: chgBadge(nOrders ? qty / nOrders : 0, prevOrders ? prevUnits / prevOrders : 0) },
            { label: 'Units Sold', value: fmtN(qty), sub: `${fmtN(nOrders)} orders`, badge: chgBadge(qty, prevUnits) },
            { label: 'Daily Avg', value: fmt(netRev / Math.max(nDays, 1)), sub: 'Net rev per day', badge: chgBadge(netRev / Math.max(nDays, 1), prevNetRev / Math.max(nDays, 1)) },
          ].map(k => (
            <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
              <div className="kpi-label">{k.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                <div className="kpi-value" style={{ fontSize: 17 }}>{k.value}</div>{k.badge}
              </div>
              {k.sub && <div className="kpi-sub">{k.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Trend Analysis + Category Revenue (side by side) */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 14, alignItems: 'stretch' }}>
        <Card title={`Trend Analysis · Offline${sub !== 'all' ? ' · ' + (SUB_OPTIONS.find(o => o.id === sub)?.label || sub) : ''}`}>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={dailyArr} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={d => d?.slice(5)} />
              <YAxis yAxisId="main" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => v >= 1e5 ? `${(v/1e5).toFixed(1)}L` : fmt(v)} width={60} />
              <YAxis yAxisId="units" orientation="right" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => fmtN(v)} width={42} />
              <Tooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                return (
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 11px', fontSize: 11 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4, color: C.t2 }}>{label}</div>
                    {payload.map(p => <div key={p.name} style={{ color: p.color }}>{p.name}: {p.name === 'Units' ? fmtN(p.value) : fmt(p.value)}</div>)}
                  </div>
                )
              }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area yAxisId="main" type="monotone" dataKey="rev" name="Gross Revenue" stroke="#FFD600" fill="#FFD60022" strokeWidth={2} dot={false} />
              <Area yAxisId="main" type="monotone" dataKey="net" name="Net Revenue" stroke="#0D9E68" fill="#0D9E6811" strokeWidth={2} dot={false} strokeDasharray="4 2" />
              <Line yAxisId="units" type="monotone" dataKey="units" name="Units" stroke="#2E74CC" strokeWidth={1.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Category Revenue · Offline">
          {catRows.slice(0, 8).map((r, i) => {
            const dots = ['#534AB7','#0D9E68','#2E74CC','#CC8A00','#CC4078','#E24B4A','#9B59B6','#FF6B35']
            return <HBar key={r.name} dot={dots[i % dots.length]} label={r.name} width={(r.rev / (catRows[0]?.rev || 1)) * 100} value={fmt(r.rev)} pctVal={totalRev ? pct(r.rev, totalRev) : '—'} isSelected={false} onClick={() => {}} />
          })}
        </Card>
      </div>

      {/* Geography Breakdown + Top 10 Sub-cats */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
        <ShopifyGeoDonutRow regionRows={regionRows} tierRows={tierRows} topStates={stateRows.slice(0, 6)} allStateRows={stateRows} useUnits={true} />
        <TopSubCatBar subCatRows={allSubCatRows} />
      </div>

      {/* Category Revenue Matrix — Gross / Units / ASP / GST / Net only (no returns/cancel/rto/cir/exch) */}
      <FinancialCategoryMatrix catData={catMatrixData} subCatData={subCatMatrixData} skuData={skuMatrixData} title={`Category Revenue Matrix · Offline${sub !== 'all' ? ' · ' + (SUB_OPTIONS.find(o => o.id === sub)?.label || sub) : ''}`} showReturns={false} />

      {/* Top States + Top Cities */}
      <div className="g-2" style={{ alignItems: 'stretch' }}>
        <PaginatedCard title="Top States · Offline" rows={stateRows} columns={[
          { key: 'state', label: 'State', render: v => v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : v },
          { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
          { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) },
          { key: 'asp', label: 'ASP', align: 'right', render: (_, r) => `₹${r.orders ? Math.round(r.rev / r.orders).toLocaleString('en-IN') : 0}` },
        ]} pageSize={15} />
        <PaginatedCard title="Top Cities · Offline" rows={cityRows} columns={[
          { key: 'city', label: 'City', render: v => v ? v.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : v },
          { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
          { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) },
          { key: 'asp', label: 'ASP', align: 'right', render: (_, r) => `₹${r.orders ? Math.round(r.rev / r.orders).toLocaleString('en-IN') : 0}` },
        ]} pageSize={15} />
      </div>
    </div>
  )
}

function ChannelTab({ data, channel, filters, setFilters, amzRegion, setAmzRegion }) {
  if (channel === 'Shopify') return <ShopifyTab data={data} filters={filters} setFilters={setFilters} />
  if (channel === 'Amazon') return <AmazonTab data={data} region={amzRegion} setRegion={setAmzRegion} />
  if (channel === 'Flipkart') return <FlipkartTab data={data} />
  if (channel === 'Blinkit') return <BlinkitTab data={data} />
  if (channel === 'Instamart') return <InstaTab data={data} />
  if (channel === 'Zepto') return <ZeptoTab data={data} />
  if (channel === 'CRED') return <CredTab data={data} />
  if (channel === 'Firstcry') return <FirstcryTab data={data} />
  if (channel === 'Myntra') return <MyntraTab data={data} />
  const chOrders = data.orders.filter(o => o.channel === channel)
  const chRows = data.rows.filter(r => r.Channel === channel)
  const rev = chOrders.reduce((s, o) => s + o.rev, 0)
  const nOrders = chOrders.length
  const aov = nOrders ? rev / nOrders : 0
  const qty = chOrders.reduce((s, o) => s + o.qty, 0)
  const catMap = {}
  chRows.forEach(r => {
    const cat = r.Category || 'Unknown'
    if (!catMap[cat]) catMap[cat] = { rev: 0, orders: new Set(), units: 0 }
    catMap[cat].rev += parseFloat(r.SellingPrice_Inc_GST || 0); catMap[cat].orders.add(r.OrderId); catMap[cat].units += parseInt(r.ItemQty || 0)
  })
  const catRows = Object.entries(catMap).map(([k, v]) => ({ name: k, rev: v.rev, orders: v.orders.size, units: v.units, aov: v.orders.size ? v.rev / v.orders.size : 0 })).sort((a, b) => b.rev - a.rev)
  const dailyMap = {}
  chOrders.forEach(o => { if (!dailyMap[o.date]) dailyMap[o.date] = { date: o.date, rev: 0, orders: 0 }; dailyMap[o.date].rev += o.rev; dailyMap[o.date].orders += 1 })
  const dailyArr = Object.values(dailyMap).sort((a, b) => a.date?.localeCompare(b.date))
  const statusCounts = {}
  chOrders.forEach(o => { const s = o.orderStatus || 'Unknown'; statusCounts[s] = (statusCounts[s] || 0) + 1 })

  const chExcRev = chRows.reduce((s, r) => s + parseFloat(r.SellingPrice_Exc_GST || 0), 0)
  const grossMarginPct = rev > 0 ? ((rev - chExcRev) / rev * 100) : 0
  const revPerUnit = qty > 0 ? rev / qty : 0
  const chRTORev = channel === 'Shopify' ? chOrders.filter(o => o.isRTO).reduce((s, o) => s + o.rev, 0) + chOrders.filter(o => o.isCancelled).reduce((s, o) => s + o.rev, 0) + (data.cirRev || 0) : 0
  const deliveredCh = chOrders.filter(o => o.orderStatus === 'Delivered').length
  const rtoCh = chOrders.filter(o => o.orderStatus === 'RTO' || o.isRTO).length
  const cancelCh = chOrders.filter(o => o.orderStatus === 'Cancelled' || o.isCancelled).length
  const fulfilBase = deliveredCh + rtoCh + cancelCh
  const fulfilRate = fulfilBase > 0 ? (deliveredCh / fulfilBase * 100) : 0
  const upo = nOrders > 0 ? qty / nOrders : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="g-kpi5">
        <KPICard label="Revenue" value={fmt(rev)} />
        <KPICard label="Orders" value={fmtN(nOrders)} />
        <KPICard label="AOV" value={`₹${Math.round(aov).toLocaleString('en-IN')}`} />
        <KPICard label="Units" value={fmtN(qty)} />
        <KPICard label="Daily Avg" value={fmt(rev / (data.nDays || 1))} />
      </div>
      <div className="g-kpi3">
        <KPICard label="Revenue per Unit" value={`₹${Math.round(revPerUnit).toLocaleString('en-IN')}`} sub="Avg price per SKU" />
        <KPICard label="Revenue at Risk" value={channel === 'Shopify' ? fmt(chRTORev) : 'N/A'} sub="RTO + Cancelled + CIR" accent={chRTORev > 0 ? '#7A4000' : undefined} />
        <KPICard label="Units per Order" value={upo.toFixed(2)} sub="Avg basket size" />
      </div>
      <div className="g-2">
        <Card title={`${channel} Daily Revenue`}>
          <AreaTrendChart data={dailyArr} color={C.ch[channel] || C.acc} />
        </Card>
        <Card title="Order Status">
          {Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).map(([s, count]) => {
            const clr = { Delivered: C.green.tx, Dispatched: C.blue.tx, RTO: C.amber.tx, Cancelled: C.red.tx }[s] || C.acm
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 11.5, color: C.t2, width: 90 }}>{s}</span>
                <div style={{ flex: 1, height: 5, background: C.bg, borderRadius: 3 }}><div style={{ height: '100%', borderRadius: 3, background: clr, width: `${(count / nOrders) * 100}%` }} /></div>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: C.t1, minWidth: 40, textAlign: 'right' }}>{fmtN(count)}</span>
                <span style={{ fontSize: 11, color: C.t3, minWidth: 34, textAlign: 'right' }}>{pct(count, nOrders)}</span>
              </div>
            )
          })}
        </Card>
      </div>
      <Card title="Category Breakdown">
        <DataTable columns={[{ key: 'name', label: 'Category' }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'aov', label: 'AOV', align: 'right', render: v => `₹${Math.round(v).toLocaleString('en-IN')}` }]} rows={catRows} />
      </Card>
      <Card title="Daily Performance">
        <DataTable columns={[{ key: 'date', label: 'Date' }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'aov', label: 'AOV', align: 'right', render: (_, r) => r.orders ? `₹${Math.round(r.rev / r.orders).toLocaleString('en-IN')}` : '—' }]} rows={dailyArr} />
      </Card>
    </div>
  )
}

function QCTab({ data }) {
  const qcChs = ['Blinkit', 'Instamart', 'Zepto']
  const qcOrders = data.orders.filter(o => qcChs.includes(o.channel))
  const qcRev = qcOrders.reduce((s, o) => s + o.rev, 0)
  const nOrds = qcOrders.length
  const aov = nOrds ? qcRev / nOrds : 0
  const best = qcChs.reduce((b, ch) => { const r = data.chMap[ch]?.rev || 0; return r > b.rev ? { ch, rev: r } : b }, { ch: '', rev: 0 })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="g-kpi5">
        <KPICard label="QC Revenue" value={fmt(qcRev)} />
        <KPICard label="Orders" value={fmtN(nOrds)} />
        <KPICard label="Blended AOV" value={`₹${Math.round(aov).toLocaleString('en-IN')}`} />
        <KPICard label="Best Platform" value={best.ch} sub={fmt(best.rev)} />
        <KPICard label="QC Rev Share" value={pct(qcRev, data.totalRev)} />
      </div>
      <div className="g-3">
        {qcChs.map(ch => {
          const chRows = data.rows.filter(r => r.Channel === ch)
          const chOrd = data.chMap[ch] || { rev: 0, orders: 0 }
          const prodMap = {}
          chRows.forEach(r => { const p = r.ProductId || 'Unknown'; if (!prodMap[p]) prodMap[p] = { rev: 0, qty: 0 }; prodMap[p].rev += parseFloat(r.SellingPrice_Inc_GST || 0); prodMap[p].qty += parseInt(r.ItemQty || 0) })
          return (
            <Card key={ch} title={ch} note={`${fmt(chOrd.rev)} · ${fmtN(chOrd.orders)} orders`}>
              <DataTable columns={[{ key: 'sku', label: 'SKU' }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'qty', label: 'Qty', align: 'right', render: v => fmtN(v) }]} rows={Object.entries(prodMap).map(([k, v]) => ({ sku: k, ...v })).sort((a, b) => b.rev - a.rev).slice(0, 15)} maxRows={15} />
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function OpsTab({ data }) {
  const tatArr = data.tatOrders
  const avgTAT = tatArr.length ? tatArr.reduce((a, b) => a + b, 0) / tatArr.length : 0
  const delayed = tatArr.filter(d => d > 7).length
  const statusCounts = data.orderStatusMap || {}
  const tatBuckets = [{ label: 'Same day', min: 0, max: 0 }, { label: '1-2 days', min: 1, max: 2 }, { label: '3-5 days', min: 3, max: 5 }, { label: '6-7 days', min: 6, max: 7 }, { label: '8-14 days', min: 8, max: 14 }, { label: '15+ days', min: 15, max: Infinity }].map(b => ({ ...b, count: tatArr.filter(d => d >= b.min && d <= b.max).length }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="g-kpi5">
        <KPICard label="Avg Delivery TAT" value={`${avgTAT.toFixed(1)}d`} />
        <KPICard label="Orders Tracked" value={fmtN(tatArr.length)} />
        <KPICard label="Delayed >7d" value={fmtN(delayed)} sub={tatArr.length ? pct(delayed, tatArr.length) : '—'} />
        <KPICard label="Total Orders" value={fmtN(data.nOrders)} />
        <KPICard label="Cities Covered" value={fmtN(Object.values(data.stateMap || {}).reduce((s, v) => s + (v.cities?.size || 0), 0))} />
      </div>
      <div className="g-2">
        <Card title="Order Status">
          {Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).map(([s, count]) => {
            const clr = { Delivered: C.green.tx, Dispatched: C.blue.tx, RTO: C.amber.tx, Cancelled: C.red.tx }[s] || C.acm
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 11.5, color: C.t2, width: 90 }}>{s}</span>
                <div style={{ flex: 1, height: 5, background: C.bg, borderRadius: 3 }}><div style={{ height: '100%', borderRadius: 3, background: clr, width: `${(count / data.nOrders) * 100}%` }} /></div>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: C.t1, minWidth: 48, textAlign: 'right' }}>{fmtN(count)}</span>
              </div>
            )
          })}
        </Card>
        <Card title="TAT Distribution">
          <DataTable columns={[{ key: 'label', label: 'Bucket' }, { key: 'count', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'pct', label: '%', render: (_, r) => pct(r.count, tatArr.length) }]} rows={tatBuckets} />
        </Card>
      </div>
    </div>
  )
}

function CXTab({ data }) {
  const { nCusts, repeatCusts, voucherMap, nOrders, orders } = data
  const repeatRate = nCusts ? (repeatCusts / nCusts * 100).toFixed(1) : '0'
  const freqMap = orders.reduce((acc, o) => { if (o.customerId) acc[o.customerId] = (acc[o.customerId] || 0) + 1; return acc }, {})
  const buyers2x = Object.values(freqMap).filter(n => n >= 2).length
  const buyers3x = Object.values(freqMap).filter(n => n >= 3).length
  const voucherOrders = orders.filter(o => o.voucher).length
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="g-kpi5">
        <KPICard label="Unique Customers" value={fmtN(nCusts)} />
        <KPICard label="Repeat Rate" value={`${repeatRate}%`} />
        <KPICard label="2× Buyers" value={fmtN(buyers2x)} />
        <KPICard label="3×+ Buyers" value={fmtN(buyers3x)} />
        <KPICard label="Voucher Penetration" value={pct(voucherOrders, nOrders)} />
      </div>
      <Card title="Voucher Analysis">
        <DataTable columns={[{ key: 'type', label: 'Type' }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'aov', label: 'AOV', align: 'right', render: v => `₹${Math.round(v).toLocaleString('en-IN')}` }]}
          rows={Object.entries(voucherMap).map(([k, v]) => ({ type: k, orders: v.orders, rev: v.rev, aov: v.orders ? v.rev / v.orders : 0 })).sort((a, b) => b.rev - a.rev)} />
      </Card>
    </div>
  )
}

function SalesPage({ data, filters, setFilters, activeTab, setActiveTab, fetchData }) {
  const [amzRegion, setAmzRegion] = useState('india') // lifted from AmazonTab to blur filters for intl
  const filteredData = data

  const cats = useMemo(() => Object.keys(data?.catMap || {}).filter(Boolean).sort(), [data])
  const subCats = useMemo(() => {
    const all = Object.entries(data?.subCatMap || {})
    const cats = filters.category?.length > 0 ? filters.category : null
    const filtered = cats ? all.filter(([k]) => cats.includes(k.split('::')[0])) : all
    return [...new Set(filtered.map(([k]) => k.split('::')[1]).filter(Boolean))].sort()
  }, [data, filters.category])
  const stateOpts = useMemo(() => Object.keys(data?.stateMap || {}).filter(s => s && s.trim() !== '-').map(s => s === 'OTHERS' ? 'Others' : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).sort(), [data])
  const skuOpts = useMemo(() => data?.masterSkuList || [], [data])

  if (!filteredData) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab bar */}
      <div className="sales-tabs">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => { setActiveTab(tab.id); if (tab.id !== 'shopify') setFilters(f => ({ ...f, voucher: '' })) }} className={`stab${activeTab === tab.id ? ' active' : ''}`} style={tab.id === 'all' ? { fontWeight: activeTab === 'all' ? 800 : 700, fontSize: 13 } : {}}>
            {tab.logo && <img src={tab.logo} alt="" style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, objectFit: 'contain', filter: tab.id === 'cred' ? 'invert(1)' : 'none' }} />}
            {tab.label}
          </button>
        ))}
      </div>
      {/* Filter bar */}
      <div className="fbar">
        <div className="fbar-inner">
          {(() => {
            const catBlur = activeTab === 'amazon' && amzRegion === 'intl'
            return <>
              <div style={{ position: 'relative', opacity: catBlur ? 0.35 : 1, pointerEvents: catBlur ? 'none' : 'auto' }} title={catBlur ? 'Not applicable for International' : undefined}>
                <SearchableSelect multi options={cats} value={filters.category || []} onChange={v => setFilters(f => ({ ...f, category: v, subCategory: [] }))} placeholder="All Categories" />
              </div>
              <div style={{ position: 'relative', opacity: catBlur ? 0.35 : 1, pointerEvents: catBlur ? 'none' : 'auto' }} title={catBlur ? 'Not applicable for International' : undefined}>
                <SearchableSelect multi options={subCats} value={filters.subCategory || []} onChange={v => setFilters(f => ({ ...f, subCategory: v }))} placeholder="All Sub-categories" dropdownWidth={320} />
              </div>
            </>
          })()}
          <SearchableSelect multi options={skuOpts} value={filters.sku || []} onChange={v => setFilters(f => ({ ...f, sku: v }))} placeholder="All SKUs" dropdownWidth={280} />
          {activeTab === 'shopify' && <VoucherDropdown voucherList={data?.voucherList || []} selected={filters.voucher} onChange={v => setFilters(f => ({ ...f, voucher: v }))} />}
          <SearchableSelect multi options={['West','South','North','East','Central','Northeast']} value={filters.region || []} onChange={v => setFilters(f => ({ ...f, region: v }))} placeholder="All Regions" />
          <SearchableSelect multi options={['Tier I','Tier II','Tier III']} value={filters.tier || []} onChange={v => setFilters(f => ({ ...f, tier: v }))} placeholder="All Tiers" />
          <SearchableSelect multi options={stateOpts} value={filters.state || []} onChange={v => setFilters(f => ({ ...f, state: v }))} placeholder="All States" dropdownWidth={220} />
          <button onClick={() => setFilters(f => ({ ...f, category: [], subCategory: [], sku: [], subChannel: '', voucher: '', region: [], tier: [], state: [], city: '' }))} className="fclr">✕ Clear</button>
        </div>
      </div>
      {/* Content */}
      <div className="page-scroll">
        {activeTab === 'all' && <AllTab data={filteredData} />}
        {activeTab === 'shopify' && <ChannelTab data={filteredData} channel="Shopify" filters={filters} setFilters={setFilters} />}
        {activeTab === 'amazon' && <ChannelTab data={filteredData} channel="Amazon" amzRegion={amzRegion} setAmzRegion={setAmzRegion} />}
        {activeTab === 'flipkart' && <ChannelTab data={filteredData} channel="Flipkart" />}
        {activeTab === 'blinkit' && <ChannelTab data={filteredData} channel="Blinkit" />}
        {activeTab === 'cred' && <ChannelTab data={filteredData} channel="CRED" />}
        {activeTab === 'firstcry' && <ChannelTab data={filteredData} channel="Firstcry" />}
        {activeTab === 'instamart' && <ChannelTab data={filteredData} channel="Instamart" />}
        {activeTab === 'zepto' && <ChannelTab data={filteredData} channel="Zepto" />}
        {activeTab === 'myntra' && <ChannelTab data={filteredData} channel="Myntra" />}
        {activeTab === 'offline' && <OfflineTab data={filteredData} />}
        {activeTab === 'qc' && <QCTab data={filteredData} />}
        {activeTab === 'ops' && <OpsTab data={filteredData} />}
        {activeTab === 'cx' && <CXTab data={filteredData} />}
      </div>
    </div>
  )
}

// ── Intelligence Page ─────────────────────────────────────────
function IntelCard({ color, label, number, sub, insight, bars, table, warning }) {
  const gradients = {
    red: 'linear-gradient(90deg,#E24B4A,#F08080)',
    green: 'linear-gradient(90deg,#2D9A50,#6ED98A)',
    blue: 'linear-gradient(90deg,#2E74CC,#7AB4EE)',
    amber: 'linear-gradient(90deg,#CC8A00,#F5C460)',
    purple: 'linear-gradient(90deg,#4843B2,#AAA6E6)',
    pink: 'linear-gradient(90deg,#CC4078,#F09BC0)',
  }
  const colors = {
    red: { bg: '#FDE8E8', tx: '#7A1A1A' }, green: { bg: '#E6F4E0', tx: '#286010' },
    blue: { bg: '#E1EFFD', tx: '#184078' }, amber: { bg: '#FEF2DC', tx: '#7A4000' },
    purple: { bg: '#EDECFB', tx: '#4843B2' }, pink: { bg: '#FDE8F3', tx: '#7A1050' },
  }
  const cc = colors[color] || colors.blue
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 13, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderRadius: '13px 13px 0 0', background: gradients[color] }} />
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: C.t3, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-.03em', marginBottom: 4, color: C.t1 }}>{number}</div>
      <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.6, marginBottom: 10 }}>{sub}</div>
      {warning && <div style={{ fontSize: 11.5, padding: '6px 10px', borderRadius: 7, background: cc.bg, color: cc.tx, marginBottom: 10, fontWeight: 500 }}>⚠ {warning}</div>}
      {bars && bars.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {bars.map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 11, color: C.t2, width: 90, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.label}</span>
              <div style={{ flex: 1, height: 5, background: C.bg, borderRadius: 3 }}>
                <div style={{ height: '100%', borderRadius: 3, background: cc.tx, width: `${b.pct}%` }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.t1, fontFamily: 'var(--mono)', minWidth: 52, textAlign: 'right' }}>{b.value}</span>
              <span style={{ fontSize: 10, color: C.t3, minWidth: 30, textAlign: 'right' }}>{b.pct.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
      {insight && (
        <div style={{ background: C.acl, border: `1px solid ${C.acm}`, borderRadius: 8, padding: '9px 11px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#7A6000', marginBottom: 4 }}>◈ Insight</div>
          <div style={{ fontSize: 11.5, color: C.t2, lineHeight: 1.65 }} dangerouslySetInnerHTML={{ __html: insight }} />
        </div>
      )}
    </div>
  )
}

function IntelPage({ data }) {
  if (!data) return (
    <div style={{ padding: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <div style={{ fontSize: 40 }}>◈</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.t1 }}>Intelligence Engine</div>
      <div style={{ fontSize: 12, color: C.t3 }}>Load a date range to generate insights</div>
    </div>
  )

  const { orders, rows, nOrders, nCusts, repeatCusts, totalRev, totalExcRev, chMap, catMap, stateMap, voucherMap, dailyArr, nDays, uniqueDates } = data

  const repeatRate = nCusts ? (repeatCusts / nCusts * 100) : 0
  const freqMap = orders.reduce((acc, o) => { if (o.customerId) acc[o.customerId] = (acc[o.customerId] || 0) + 1; return acc }, {})
  const buyers2x = Object.values(freqMap).filter(n => n >= 2).length
  const buyers3x = Object.values(freqMap).filter(n => n >= 3).length
  const lostRevIfRepeat10 = nCusts > 0 ? ((0.10 - repeatRate / 100) * nCusts * (totalRev / nOrders)) : 0

  const qcChs = ['Blinkit', 'Instamart', 'Zepto']
  const qcRev = qcChs.reduce((s, c) => s + (chMap[c]?.rev || 0), 0)
  const qcOrds = qcChs.reduce((s, c) => s + (chMap[c]?.orders || 0), 0)
  const qcAOV = qcOrds ? qcRev / qcOrds : 0
  const blendedAOV = nOrders ? totalRev / nOrders : 0
  const qcBars = qcChs.filter(c => chMap[c]).map(c => ({ label: c, value: fmt(chMap[c].rev), pct: qcRev ? chMap[c].rev / qcRev * 100 : 0 }))

  const voucherOrders = orders.filter(o => o.voucher)
  const voucherRev = voucherOrders.reduce((s, o) => s + o.rev, 0)
  const noVoucherRev = orders.filter(o => !o.voucher).reduce((s, o) => s + o.rev, 0)
  const noVoucherOrds = orders.filter(o => !o.voucher).length
  const voucherAOV = voucherOrders.length ? voucherRev / voucherOrders.length : 0
  const noVoucherAOV = noVoucherOrds ? noVoucherRev / noVoucherOrds : 0
  const aovDrag = noVoucherAOV - voucherAOV
  const voucherBars = Object.entries(voucherMap).sort((a, b) => b[1].rev - a[1].rev).slice(0, 5).map(([k, v]) => ({ label: k, value: fmt(v.rev), pct: totalRev ? v.rev / totalRev * 100 : 0 }))

  const shopifyOrders = orders.filter(o => o.channel === 'Shopify')
  const rtoOrders = shopifyOrders.filter(o => o.isRTO)
  const cirOrders = shopifyOrders.filter(o => o.isCIR)
  const cancelOrders = shopifyOrders.filter(o => o.isCancelled)
  const rtoRate = shopifyOrders.length ? rtoOrders.length / shopifyOrders.length * 100 : 0
  const cirRate = shopifyOrders.length ? cirOrders.length / shopifyOrders.length * 100 : 0
  const returnBars = [
    { label: 'RTO', value: fmtN(rtoOrders.length), pct: shopifyOrders.length ? rtoOrders.length / shopifyOrders.length * 100 : 0 },
    { label: 'CIR Return', value: fmtN(cirOrders.length), pct: shopifyOrders.length ? cirOrders.length / shopifyOrders.length * 100 : 0 },
    { label: 'Cancelled', value: fmtN(cancelOrders.length), pct: shopifyOrders.length ? cancelOrders.length / shopifyOrders.length * 100 : 0 },
  ]

  const sortedByRev = [...orders].sort((a, b) => b.rev - a.rev)
  const top1pct = Math.ceil(nOrders * 0.01)
  const top10pct = Math.ceil(nOrders * 0.10)
  const top1rev = sortedByRev.slice(0, top1pct).reduce((s, o) => s + o.rev, 0)
  const top10rev = sortedByRev.slice(0, top10pct).reduce((s, o) => s + o.rev, 0)
  const paretoBars = [
    { label: `Top 1% (${fmtN(top1pct)} ord)`, value: fmt(top1rev), pct: totalRev ? top1rev / totalRev * 100 : 0 },
    { label: `Top 10% (${fmtN(top10pct)} ord)`, value: fmt(top10rev), pct: totalRev ? top10rev / totalRev * 100 : 0 },
    { label: 'Bottom 50%', value: fmt(sortedByRev.slice(Math.ceil(nOrders * 0.5)).reduce((s, o) => s + o.rev, 0)), pct: totalRev ? sortedByRev.slice(Math.ceil(nOrders * 0.5)).reduce((s, o) => s + o.rev, 0) / totalRev * 100 : 0 },
  ]

  const topCats = Object.entries(catMap).sort((a, b) => b[1].rev - a[1].rev).slice(0, 5)
  const catGaps = topCats.map(([cat, v]) => {
    const catRows = rows.filter(r => r.Category === cat)
    const presentChs = new Set(catRows.map(r => r.Channel))
    const missingQC = qcChs.filter(c => !presentChs.has(c))
    return { cat, rev: v.rev, missing: missingQC }
  }).filter(g => g.missing.length > 0)

  const mid = Math.floor(uniqueDates.length / 2)
  const fhDates = new Set(uniqueDates.slice(0, mid))
  const lhDates = new Set(uniqueDates.slice(mid))
  const fhRev = orders.filter(o => fhDates.has(o.date)).reduce((s, o) => s + o.rev, 0)
  const lhRev = orders.filter(o => lhDates.has(o.date)).reduce((s, o) => s + o.rev, 0)
  const trendPct = fhRev > 0 ? ((lhRev - fhRev) / fhRev * 100) : 0

  const gstCollected = totalRev - totalExcRev
  const topStates = Object.entries(stateMap).sort((a, b) => b[1].rev - a[1].rev).slice(0, 5).map(([k, v]) => ({ label: k, value: fmt(v.rev), pct: totalRev ? v.rev / totalRev * 100 : 0 }))

  const multiItem = orders.filter(o => o.items > 1)
  const multiItemAOV = multiItem.length ? multiItem.reduce((s, o) => s + o.rev, 0) / multiItem.length : 0
  const singleItemAOV = orders.filter(o => o.items === 1).length ? orders.filter(o => o.items === 1).reduce((s, o) => s + o.rev, 0) / orders.filter(o => o.items === 1).length : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Summary strip */}
      <div className="g-intel">
        {[
          { label: 'Gross Revenue', val: fmt(totalRev) },
          { label: 'GST Collected', val: fmt(gstCollected) },
          { label: 'Repeat Rate', val: `${repeatRate.toFixed(1)}%`, warn: repeatRate < 10 },
          { label: 'QC Share', val: pct(qcRev, totalRev) },
          { label: 'Voucher Orders', val: pct(voucherOrders.length, nOrders) },
          { label: 'Trend (½ period)', val: `${trendPct > 0 ? '+' : ''}${trendPct.toFixed(1)}%`, warn: trendPct < -10 },
        ].map((s, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 11, padding: '11px 13px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: C.t3, marginBottom: 5 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.warn ? '#7A1A1A' : C.t1 }}>{s.val}</div>
          </div>
        ))}
      </div>

      <div className="g-2">
        <IntelCard color="red" label="Customer Retention Crisis"
          number={`${repeatRate.toFixed(1)}%`}
          sub={`${fmtN(repeatCusts)} of ${fmtN(nCusts)} customers ever reordered · ${fmtN(buyers2x)} bought 2×, ${fmtN(buyers3x)} bought 3×+`}
          warning={repeatRate < 10 ? `Improving to 10% = est. +${fmt(Math.abs(lostRevIfRepeat10))} revenue with zero acquisition cost` : undefined}
          bars={[
            { label: '1× buyers', value: fmtN(nCusts - repeatCusts), pct: nCusts ? (nCusts - repeatCusts) / nCusts * 100 : 0 },
            { label: '2× buyers', value: fmtN(buyers2x), pct: nCusts ? buyers2x / nCusts * 100 : 0 },
            { label: '3×+ buyers', value: fmtN(buyers3x), pct: nCusts ? buyers3x / nCusts * 100 : 0 },
          ]}
          insight={`<strong>${(100 - repeatRate).toFixed(1)}%</strong> of customers never came back. Post-purchase email sequence + PLM loyalty codes are the fastest lever. Target: get 1× buyers to 2× within 90 days.`}
        />
        <IntelCard color="green" label="Q-Commerce Opportunity"
          number={fmt(qcRev)}
          sub={`${fmtN(qcOrds)} orders · AOV ₹${Math.round(qcAOV).toLocaleString('en-IN')} vs blended ₹${Math.round(blendedAOV).toLocaleString('en-IN')} — ${(qcAOV / blendedAOV).toFixed(1)}× brand average`}
          bars={qcBars}
          insight={`Q-commerce AOV is <strong>${(qcAOV / blendedAOV).toFixed(1)}× higher</strong> than blended. ${catGaps.length > 0 ? `<strong>${catGaps.map(g => g.cat).join(', ')}</strong> have zero QC presence — biggest untapped gap.` : 'Expand top SKUs to all 3 platforms.'}`}
        />
      </div>

      <div className="g-2">
        <IntelCard color="amber" label="Voucher & Discount Drag"
          number={pct(voucherOrders.length, nOrders)}
          sub={`${fmtN(voucherOrders.length)} orders used vouchers · AOV with voucher ₹${Math.round(voucherAOV).toLocaleString('en-IN')} vs ₹${Math.round(noVoucherAOV).toLocaleString('en-IN')} without`}
          warning={aovDrag > 0 ? `AOV drag: ₹${Math.round(aovDrag).toLocaleString('en-IN')} per vouchered order` : undefined}
          bars={voucherBars}
          insight={`Voucher orders have <strong>₹${Math.round(aovDrag).toLocaleString('en-IN')} lower AOV</strong> than organic. Review PLM loyalty code discount depth — cap at 10% to protect margin.`}
        />
        <IntelCard color="blue" label="Revenue Concentration — Pareto"
          number={`${totalRev ? (top1rev / totalRev * 100).toFixed(1) : 0}%`}
          sub={`Top 1% of orders (${fmtN(top1pct)}) drive this share · High-ticket orders are your most efficient revenue`}
          bars={paretoBars}
          insight={`Top <strong>${fmtN(top1pct)} orders</strong> = ${totalRev ? (top1rev / totalRev * 100).toFixed(1) : 0}% of revenue. Protect these customers with white-glove service and early access to new products.`}
        />
      </div>

      <div className="g-2">
        <IntelCard color="pink" label="Returns & RTO — Shopify Only"
          number={`${rtoRate.toFixed(1)}%`}
          sub={`RTO rate on ${fmtN(shopifyOrders.length)} Shopify orders · CIR ${cirRate.toFixed(1)}% · Marketplace return data unavailable`}
          bars={returnBars}
          insight={`RTO erodes net revenue by the full order value + reverse logistics cost. Every 1% RTO reduction on ${fmtN(shopifyOrders.length)} orders saves est. <strong>${fmt(shopifyOrders.length * 0.01 * blendedAOV)}</strong>.`}
        />
        <IntelCard color="purple" label="Basket & Multi-item Intelligence"
          number={pct(multiItem.length, nOrders)}
          sub={`${fmtN(multiItem.length)} multi-item orders · AOV ₹${Math.round(multiItemAOV).toLocaleString('en-IN')} vs ₹${Math.round(singleItemAOV).toLocaleString('en-IN')} single-item — ${multiItemAOV > singleItemAOV ? '+' : ''}${(((multiItemAOV - singleItemAOV) / (singleItemAOV || 1)) * 100).toFixed(0)}% AOV premium`}
          bars={topStates}
          insight={`Multi-item orders have <strong>₹${Math.round(multiItemAOV - singleItemAOV).toLocaleString('en-IN')} higher AOV</strong>. Bundle recommendations at checkout (e.g. Pillow + Insole) can shift single-item buyers to multi-item.`}
        />
      </div>

      {catGaps.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 13, padding: '16px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.t1, marginBottom: 4 }}>Category × Channel Gap Analysis</div>
          <div style={{ fontSize: 11.5, color: C.t3, marginBottom: 12 }}>High-revenue categories with zero Q-commerce presence</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {catGaps.map((g, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.t1, minWidth: 100 }}>{g.cat}</span>
                <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: C.t2, minWidth: 70 }}>{fmt(g.rev)}</span>
                <span style={{ fontSize: 11, color: C.t3 }}>Missing on:</span>
                {g.missing.map(m => (
                  <span key={m} style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 5, background: '#FDE8E8', color: '#7A1A1A' }}>{m}</span>
                ))}
                <span style={{ fontSize: 11, color: C.green.tx, fontWeight: 600 }}>→ est. {fmt(g.rev * 0.05)}/mo opportunity</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: C.acl, border: `1px solid ${C.acm}`, borderRadius: 13, padding: '16px 18px', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#7A6000', marginBottom: 6 }}>◈ Period Trend Signal</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: trendPct >= 0 ? C.green.tx : C.red.tx, marginBottom: 4 }}>{trendPct > 0 ? '+' : ''}{trendPct.toFixed(1)}%</div>
          <div style={{ fontSize: 12, color: C.t2 }}>Revenue change: first half {fmt(fhRev)} → second half {fmt(lhRev)}</div>
        </div>
        <div style={{ flex: 1, minWidth: 200, fontSize: 12, color: C.t2, lineHeight: 1.7, borderLeft: `1px solid ${C.acm}`, paddingLeft: 20 }}>
          {trendPct < -10
            ? `⚠ Revenue declined ${Math.abs(trendPct).toFixed(1)}% in the second half of this period. Check for demand drop, channel issues, or data gaps (CRED batch, feed delays).`
            : trendPct > 10
            ? `✅ Strong momentum — revenue grew ${trendPct.toFixed(1)}% in the second half. Identify which channels drove growth and double down.`
            : `Revenue is relatively stable across the period (${trendPct.toFixed(1)}%). Intra-period volatility is normal — look at daily channel breakdown for specific signals.`
          }
        </div>
      </div>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────
function Skeleton() {
  return (
    <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="g-hero">
        {[1, 2, 3, 4].map(i => <div key={i} style={{ height: 130, borderRadius: 13, background: C.border, animation: 'pulse 1.5s infinite' }} />)}
      </div>
      <div style={{ height: 240, borderRadius: 13, background: C.border, animation: 'pulse 1.5s infinite' }} />
      <div className="g-3">
        {[1, 2, 3].map(i => <div key={i} style={{ height: 200, borderRadius: 13, background: C.border, animation: 'pulse 1.5s infinite' }} />)}
      </div>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────
const TAB_TO_CHANNEL = { blinkit: 'Blinkit', instamart: 'Instamart', zepto: 'Zepto', cred: 'CRED', firstcry: 'Firstcry' }

export default function App() {
  const [page, setPage] = useState('overview')
  const def = getDefaultDates()
  const [filters, setFilters] = useState({ start: def.start, end: def.end, category: [], subCategory: [], sku: [], subChannel: '', voucher: '', region: [], tier: [], state: [], city: '' })
  const [activeTab, setActiveTab] = useState('all')
  const [rawRows, setRawRows] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const API = import.meta.env.VITE_API_URL || ''
  const reqIdRef = useRef(0)
  const activeTabRef = useRef(activeTab)
  activeTabRef.current = activeTab
  // Client-side cache: key → response data. Cleared when dates change.
  const clientCacheRef = useRef(new Map())

  const fetchData = useCallback(async (start, end, extraFilters = {}, keepPrev = false) => {
    const ch = TAB_TO_CHANNEL[activeTabRef.current] || null
    const cacheKey = JSON.stringify({ start, end, ...extraFilters, channel: ch })

    // Client-side cache hit: skip fetch entirely
    if (keepPrev && clientCacheRef.current.has(cacheKey)) {
      setRawRows(prev => {
        const cached = clientCacheRef.current.get(cacheKey)
        if (prev && typeof prev === 'object' && !Array.isArray(prev)) return { ...prev, ...cached }
        return cached
      })
      return
    }

    const reqId = ++reqIdRef.current
    if (!keepPrev) setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/api/bq`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ start, end, ...extraFilters, ...(ch ? { channel: ch } : {}) }) })
      if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
      const json = await res.json()
      if (reqId !== reqIdRef.current) return // stale response, ignore
      const next = json.source === 'postgres-aggregated' ? json : (json.totalRev !== undefined ? json : (json.rows || []))
      clientCacheRef.current.set(cacheKey, next)
      setRawRows(prev => {
        if (keepPrev && prev && typeof prev === 'object' && !Array.isArray(prev)) return { ...prev, ...next }
        return next
      })
    } catch (e) { if (reqId === reqIdRef.current) setError(e.message) }
    finally { if (reqId === reqIdRef.current) setLoading(false) }
  }, [API])

  const debounceRef = useRef(null)
  const prevDateRef = useRef({ start: null, end: null })
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  useEffect(() => {
    if (!filters.start || !filters.end) return
    clearTimeout(debounceRef.current)
    const dateChanged = filters.start !== prevDateRef.current.start || filters.end !== prevDateRef.current.end
    if (dateChanged) { prevDateRef.current = { start: filters.start, end: filters.end }; setRawRows(null) }
    debounceRef.current = setTimeout(() => {
      const { start, end, category, subCategory, sku, subChannel, voucher, region, tier, state, city, country, paymentType } = filtersRef.current
      const extra = {}
      if (category?.length) extra.category = category.join(',')
      if (subCategory?.length) extra.subCategory = subCategory.join(',')
      if (sku?.length) extra.sku = sku.join(',')
      if (subChannel) extra.subChannel = subChannel
      if (voucher) extra.voucher = voucher
      if (region?.length) extra.region = region.join(',')
      if (tier?.length) extra.tier = tier.join(',')
      if (state?.length) extra.state = state.join(',')
      if (city) extra.city = city
      if (country) extra.country = country
      if (paymentType) extra.paymentType = paymentType
      fetchData(start, end, extra)
    }, 600)
    return () => clearTimeout(debounceRef.current)
  }, [filters.start, filters.end, filters.category, filters.subCategory, filters.sku, filters.subChannel, filters.voucher, filters.region, filters.tier, filters.state, filters.city, filters.country, filters.paymentType, fetchData])

  const data = useMemo(() => { if (!rawRows) return null; if (rawRows.source === 'postgres-aggregated' || rawRows.totalRev !== undefined) return rawRows; return processData(rawRows) }, [rawRows])
  const alerts = useMemo(() => data ? detectAlerts(data) : [], [data])


  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={setPage} />
      <div className="app-main">
        <Topnav page={page} alerts={alerts} onRefresh={() => { const { start, end, category, subCategory, sku, subChannel, voucher, region, tier, state, city, country } = filters; const e = {}; if (category?.length) e.category = category.join(','); if (subCategory?.length) e.subCategory = subCategory.join(','); if (sku?.length) e.sku = sku.join(','); if (subChannel) e.subChannel = subChannel; if (voucher) e.voucher = voucher; if (region?.length) e.region = region.join(','); if (tier?.length) e.tier = tier.join(','); if (state?.length) e.state = state.join(','); if (city) e.city = city; if (country) e.country = country; fetchData(start, end, e) }} loading={loading} filters={filters} setFilters={setFilters} rawRows={rawRows} />
        {loading && (
          <div style={{ height: 2, background: C.border, flexShrink: 0 }}>
            <div className="progress-bar" style={{ height: '100%', background: C.acc }} />
          </div>
        )}
        {error && (
          <div style={{ margin: '12px 16px 0', padding: '10px 13px', borderRadius: 9, background: C.red.bg, border: `1px solid ${C.red.bd}`, color: C.red.tx, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>⚠ {error}</span>
            <button onClick={() => fetchData(filters.start, filters.end)} style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 8px', borderRadius: 5, border: `1px solid ${C.red.bd}`, background: 'transparent', color: C.red.tx, cursor: 'pointer', fontFamily: 'var(--font)' }}>Retry</button>
          </div>
        )}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {!data && !loading && !error && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: C.acl, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>📊</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: C.t1, marginBottom: 4 }}>Frido Intelligence Suite</div>
                <div style={{ fontSize: 12, color: C.t3, marginBottom: 16 }}>Select a date range to load data</div>
                <button onClick={() => fetchData(filters.start, filters.end)} style={{ fontSize: 13, padding: '10px 22px', borderRadius: 10, background: C.acc, color: '#13121A', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600 }}>
                  Load {filters.start} → {filters.end}
                </button>
              </div>
            </div>
          )}
          {loading && !data && <Skeleton />}
          {page === 'overview' && data && (
            <div className="page-scroll">
              <OverviewPage data={data} alerts={alerts} />
            </div>
          )}
          {page === 'sales' && data && <SalesPage data={data} filters={filters} setFilters={setFilters} activeTab={activeTab} setActiveTab={setActiveTab} fetchData={fetchData} />}
          {page === 'intelligence' && (
            <div className="page-scroll">
              <IntelPage data={data} />
            </div>
          )}
        </div>
      </div>
      <BottomNav page={page} setPage={setPage} />
    </div>
  )
}
