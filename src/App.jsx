import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from 'react'
import { C, fmt, fmtN, pct, processData, detectAlerts, exportCSV, getDefaultDates } from './utils.js'
import { KPICard, AlertCard, HBar, DataTable, Card, Badge, RevTrendChart, AreaTrendChart, MultiLineChart, ChartTooltip, BarChart, Bar, LineChart, Line, AreaChart, Area, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, Treemap } from './components.jsx'

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
  { id: 'instamart', label: 'Instamart', ch: 'Instamart', logo: '/logo-instamart.png' },
  { id: 'zepto', label: 'Zepto', ch: 'Zepto', logo: '/logo-zepto.png' },
  { id: 'myntra', label: 'Myntra', ch: 'Myntra', logo: '/logo-myntra.png' },
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
            {filtered.map(({ code, orders }) => {
              const checked = staged.includes(code)
              return (
                <div key={code} onClick={() => toggle(code)} style={{ padding: '5px 10px', fontSize: 11.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, background: checked ? C.acl : undefined }}>
                  <span style={{ width: 13, height: 13, borderRadius: 3, border: `1.5px solid ${checked ? C.acm : C.border2}`, background: checked ? C.acc : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 8, fontWeight: 700 }}>{checked ? '✓' : ''}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{code}</span>
                  <span style={{ fontSize: 10, color: C.t3, flexShrink: 0 }}>{orders}</span>
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

  const chartProps = {
    data: enrichedDaily,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  }
  const axisProps = {
    xAxis: <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={d => d?.slice(5)} />,
    yAxis: <YAxis tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={fmtTick} width={40} />,
    grid: <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />,
    tooltip: <Tooltip content={<ChartTooltip formatter={metric === 'units' ? fmtN : undefined} />} cursor={({ top, height, x }) => <line x1={x} y1={top} x2={x} y2={top + height} stroke="#BBBBBB" strokeWidth={1} />} />,
    legend: <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />,
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
        {chartType === 'bar' ? (
          <BarChart {...chartProps}>
            {axisProps.grid}{axisProps.xAxis}{axisProps.yAxis}{axisProps.tooltip}{axisProps.legend}
            {channels.map(ch => <Bar key={ch} dataKey={dataKey(ch)} name={ch} stackId="a" fill={C.ch[ch] || C.acc} />)}
          </BarChart>
        ) : chartType === 'area' ? (
          <AreaChart {...chartProps}>
            {axisProps.grid}{axisProps.xAxis}{axisProps.yAxis}{axisProps.tooltip}{axisProps.legend}
            {channels.map(ch => <Area key={ch} type="monotone" dataKey={dataKey(ch)} name={ch} stroke={C.ch[ch] || C.acc} fill={C.ch[ch] || C.acc} fillOpacity={0.15} strokeWidth={2} dot={false} />)}
          </AreaChart>
        ) : (
          <LineChart {...chartProps}>
            {axisProps.grid}{axisProps.xAxis}{axisProps.yAxis}{axisProps.tooltip}{axisProps.legend}
            <Line key="_total" type="monotone" dataKey="_total" name="Total" stroke="#111111" strokeWidth={3} dot={false} strokeDasharray="0" />
            {channels.map(ch => <Line key={ch} type="monotone" dataKey={dataKey(ch)} name={ch} stroke={C.ch[ch] || C.acc} strokeWidth={2} dot={false} />)}
          </LineChart>
        )}
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
    if (!prev) return null
    const pct = (cur - prev) / prev * 100
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
              { label: 'Revenue at Risk', value: fmt(atRiskRev), sub: `${totalRev > 0 ? (atRiskRev / totalRev * 100).toFixed(1) : 0}% of gross · RTO + Cancel + CIR`, accent: atRiskRev > 0 ? '#7A4000' : undefined, badge: null },
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
            const chg = prevChRev > 0 ? ((v.rev - prevChRev) / prevChRev * 100) : null
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
                  ? <span style={{ fontSize: 10.5, fontWeight: 700, width: 58, flexShrink: 0, textAlign: 'center', padding: '2px 0', borderRadius: 4, background: chg >= 0 ? '#E6F4E0' : '#FDE8E8', color: chg >= 0 ? '#286010' : '#7A1A1A', display: 'inline-block' }}>{chg >= 0 ? '▲' : '▼'} {Math.abs(chg).toFixed(1)}%</span>
                  : <span style={{ width: 58, flexShrink: 0 }} />}
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
        <PaginatedCard title="Top States" rows={stateRows} columns={[{ key: 'state', label: 'State', render: v => v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : v }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'aov', label: 'AOV', align: 'right', render: v => `₹${Math.round(v).toLocaleString('en-IN')}` }, { key: 'cities', label: 'Cities' }]} pageSize={15} />
        <PaginatedCard title="Top Cities" rows={cityRows} columns={[{ key: 'city', label: 'City', render: v => v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : v }, { key: 'state', label: 'State', render: v => v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : '—' }, { key: 'region', label: 'Region', render: v => v || '—' }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'aov', label: 'AOV', align: 'right', render: (_, r) => `₹${r.orders ? Math.round(r.rev / r.orders).toLocaleString('en-IN') : 0}` }]} pageSize={15} />
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

function ShopifyGeoDonutRow({ regionRows, tierRows, topStates }) {
  const [metric, setMetric] = useState('rev')
  const REGION_COLORS = ['#534AB7','#0D9E68','#2E74CC','#CC8A00','#CC4078','#E24B4A']
  const TIER_COLORS = ['#FFD600','#FF6B35','#9B59B6']
  const STATE_COLORS = ['#0D9E68','#2E74CC','#534AB7','#CC8A00','#E24B4A','#9B59B6']
  const metricVal = (r, m) => m === 'rev' ? r.rev : m === 'orders' ? r.orders : (r.orders ? Math.round(r.rev / r.orders) : 0)
  const metricFmt = v => metric === 'rev' ? fmt(v) : metric === 'aov' ? `₹${v.toLocaleString('en-IN')}` : fmtN(v)
  const selStyle = active => ({ fontSize: 10, fontWeight: active ? 700 : 500, padding: '2px 8px', borderRadius: 4, border: `1px solid ${active ? C.acm : C.border}`, background: active ? C.acc : 'transparent', color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)' })

  const SmallDonut = ({ title, data, colors }) => {
    const total = data.reduce((s, d) => s + d.value, 0)
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

  if (!regionData.length && !tierData.length && !stateData.length) return null

  return (
    <Card title="Geography Breakdown" action={
      <div style={{ display: 'flex', gap: 3 }}>
        {[['rev','Revenue'],['orders','Orders'],['aov','AOV']].map(([k,l]) => <button key={k} onClick={() => setMetric(k)} style={selStyle(metric === k)}>{l}</button>)}
      </div>
    }>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {regionData.length > 0 && <SmallDonut title="By Region" data={regionData} colors={REGION_COLORS} />}
        {tierData.length > 0 && <SmallDonut title="By City Tier" data={tierData} colors={TIER_COLORS} />}
        {stateData.length > 0 && <SmallDonut title="Top States" data={stateData} colors={STATE_COLORS} />}
      </div>
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

  // Use Shopify-specific rev from chMap, not all-channels totalRev
  const shCh = data.chMap?.['Shopify'] || {}
  const totalRev = shCh.rev || 0
  const totalExcRev = shCh.excRev || data.totalExcRev || 0
  const totalQty = shCh.qty || data.totalQty || 0
  const gst = totalRev - totalExcRev
  const prevRev = sh.prevRev || 0
  const prevExcRev = sh.prevExcRev || 0
  const prevOrders = sh.prevOrders || 0
  const prevDailyArr = sh.prevDaily || []

  const shRevChg = prevRev > 0 ? ((totalRev - prevRev) / prevRev * 100) : null
  const shNOrders = shCh.orders || 0
  const shOrdChg = prevOrders > 0 ? ((shNOrders - prevOrders) / prevOrders * 100) : null
  const shExcChg = prevExcRev > 0 ? ((totalExcRev - prevExcRev) / prevExcRev * 100) : null
  const shChgBadge = (cur, prev) => {
    if (!prev) return null
    const p = (cur - prev) / prev * 100
    return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span>
  }
  const shSparkData = Array.from({ length: Math.max(dailyArr.length, prevDailyArr.length) }, (_, i) => {
    const cur = dailyArr[i]
    const pre = prevDailyArr[i]
    const curRev = cur ? (cur['Shopify'] || 0) : null
    return { i, cur: curRev, prev: pre?.rev ?? null }
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
  const indiaSubChMap = Object.fromEntries(Object.entries(subChannelMap).filter(([k]) => k !== 'International'))
  const intlSubChMap = subChannelMap['International'] ? { International: subChannelMap['International'] } : {}
  const activeSubChMap = isIntl ? intlSubChMap : indiaSubChMap
  const activeSubChKeys = Object.keys(activeSubChMap).sort((a, b) => activeSubChMap[b].rev - activeSubChMap[a].rev)
  const maxSubChRev = Math.max(...Object.values(activeSubChMap).map(v => v.rev), 1)

  // India sub-channel keys for dropdown (excl International)
  const indiaSubChKeys = Object.keys(indiaSubChMap)

  const [subChOpen, setSubChOpen] = useState(false)
  const [pendingSubCh, setPendingSubCh] = useState([])
  const [selectedCat, setSelectedCat] = useState(null)
  const [shTrendGroup, setShTrendGroup] = useState('daily')
  const [shCatView, setShCatView] = useState('table')
  const [shSubCatView, setShSubCatView] = useState('table')
  const catRows = Object.entries(catMap).map(([k, v]) => { const orders = v.orders?.size ?? v.orders ?? 0; return { name: k, rev: v.rev, excRev: v.excRev || 0, orders, units: v.units || 0, aov: orders ? v.rev / orders : 0, asp: (v.units || 0) ? v.rev / v.units : 0 } }).sort((a, b) => b.rev - a.rev)
  const allSubCatRows = Object.entries(subCatMap).map(([k, v]) => { const orders = v.orders?.size ?? v.orders ?? 0; return { name: k.split('::')[1] || k, category: k.split('::')[0] || '', rev: v.rev, orders, units: v.units || 0, aov: orders ? v.rev / orders : 0, asp: (v.units || 0) ? v.rev / v.units : 0 } }).sort((a, b) => b.rev - a.rev)
  const subCatRows = selectedCat ? allSubCatRows.filter(r => r.category === selectedCat) : allSubCatRows
  const stateRows = Object.entries(stateMap).map(([k, v]) => { const ord = v.orders instanceof Set ? v.orders.size : v.orders; return { state: k, rev: v.rev, orders: ord, aov: ord ? v.rev / ord : 0, cities: v.cities?.size || 0 } }).sort((a, b) => b.rev - a.rev)

  const toggleStyle = active => ({ fontSize: 12, fontWeight: active ? 700 : 500, padding: '5px 18px', borderRadius: 7, border: `1.5px solid ${active ? C.acm : C.border2}`, background: active ? C.acc : C.card, color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all .12s' })
  const selStyle = { fontSize: 11.5, padding: '4px 10px', borderRadius: 7, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, outline: 'none', fontFamily: 'var(--font)', cursor: 'pointer' }

  const switchRegion = toIntl => {
    setFilters(f => ({ ...f, subChannel: toIntl ? 'International' : '', voucher: '' }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* India / International toggle + sub-channel dropdown + tiles on right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Left: region toggles + sub-channel dropdown */}
        <button style={toggleStyle(!isIntl)} onClick={() => switchRegion(false)}>🇮🇳 India</button>
        <button style={toggleStyle(isIntl)} onClick={() => switchRegion(true)}>🌐 International</button>
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
        {isIntl && <span style={{ fontSize: 11, color: C.t3, marginLeft: 4 }}>UAE · UK · US</span>}

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
          const row1 = [
            {
              label: 'Net Revenue',
              value: fmt(totalExcRev),
              sub: null,
              badge: excChg !== null ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: excChg >= 0 ? C.green.bg : C.red.bg, color: excChg >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{excChg >= 0 ? '▲' : '▼'} {Math.abs(excChg).toFixed(1)}%</span> : null,
            },
            { label: 'GST Collected', value: fmt(gst), sub: totalRev > 0 ? `${((gst / totalRev) * 100).toFixed(1)}% of gross` : '—', badge: shChgBadge(gst, prevRev - prevExcRev) },
            { label: 'Daily Avg', value: fmt(dailyAvg), sub: `over ${nDays} days`, badge: shChgBadge(dailyAvg, prevRev > 0 ? prevRev / nDays : 0) },
            { label: 'AOV', value: `₹${Math.round(aov).toLocaleString('en-IN')}`, sub: 'Gross rev ÷ orders', badge: shChgBadge(aov, prevOrders > 0 ? prevRev / prevOrders : 0) },
            { label: 'ASP', value: `₹${Math.round(asp).toLocaleString('en-IN')}`, sub: 'Net rev ÷ units sold' },
          ]
          const row2 = [
            { label: 'Cancellation %', value: `${cancelPct.toFixed(1)}%`, sub: `${fmtN(cancelledOrders)} cancelled`, accent: cancelPct > 5 ? '#7A1A1A' : undefined },
            { label: 'CIR %', value: `${cirPct.toFixed(1)}%`, sub: `${fmtN(cirOrders)} CIR orders` },
            { label: 'Exchange %', value: `${exchangePct.toFixed(1)}%`, sub: `${fmtN(exchangeOrders)} exchange orders` },
            { label: 'RTO %', value: `${rtoPct.toFixed(1)}%`, sub: `${fmtN(rtoOrders)} RTO orders`, accent: rtoPct > 10 ? '#7A1A1A' : undefined },
            { label: 'Return %', value: `${returnRevPct.toFixed(1)}%`, sub: `${fmt((data.rtoRevDirect || 0) + (data.cirRev || 0))} RTO+CIR rev`, accent: returnRevPct > 5 ? '#7A1A1A' : undefined },
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
          const rawDaily = (dailyArr || []).map(d => {
            const grossRev = d['Shopify'] || 0
            const rt = returnTrendMap[d.date] || {}
            return { date: d.date, grossRev, netRev: grossRev > 0 ? grossRev / 1.12 : 0, rtoPct: rt.rtoPct || 0, exchPct: rt.exchPct || 0, cirPct: rt.cirPct || 0 }
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
              if (!buckets[key]) buckets[key] = { date: key, grossRev: 0, netRev: 0, rtoPct: 0, exchPct: 0, cirPct: 0, _n: 0 }
              buckets[key].grossRev += d.grossRev
              buckets[key].netRev += d.netRev
              buckets[key].rtoPct += d.rtoPct
              buckets[key].exchPct += d.exchPct
              buckets[key].cirPct += d.cirPct
              buckets[key]._n += 1
            })
            return Object.values(buckets).map(b => ({ ...b, rtoPct: b._n ? b.rtoPct / b._n : 0, exchPct: b._n ? b.exchPct / b._n : 0, cirPct: b._n ? b.cirPct / b._n : 0 })).sort((a, b) => a.date.localeCompare(b.date))
          })()

          const xFmt = d => shTrendGroup === 'daily' ? d?.slice(5) : shTrendGroup === 'monthly' ? d?.slice(0, 7) : d
          return (
            <Card title="Revenue & Returns Trend" action={
              <select value={shTrendGroup} onChange={e => setShTrendGroup(e.target.value)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border2}`, background: C.card, color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', outline: 'none' }}>
                {['daily','weekly','monthly','quarterly'].map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
              </select>
            }>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={grouped} margin={{ top: 4, right: 50, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={xFmt} />
                  <YAxis yAxisId="rev" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => fmt(v)} width={60} />
                  <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => `${v.toFixed(1)}%`} width={40} />
                  <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 11px', fontSize: 11 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4, color: C.t2 }}>{xFmt(label)}</div>
                      {payload.map(p => <div key={p.name} style={{ color: p.color }}>{p.name}: {p.yAxisId === 'pct' ? `${Number(p.value).toFixed(1)}%` : fmt(p.value)}</div>)}
                    </div>
                  ) : null} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area yAxisId="rev" type="monotone" dataKey="grossRev" name="Gross Revenue" stroke="#FFD600" fill="#FFD60022" strokeWidth={2} dot={false} />
                  <Area yAxisId="rev" type="monotone" dataKey="netRev" name="Net Revenue" stroke="#0D9E68" fill="#0D9E6811" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                  <Line yAxisId="pct" type="monotone" dataKey="rtoPct" name="RTO %" stroke="#E24B4A" strokeWidth={1.5} dot={false} />
                  <Line yAxisId="pct" type="monotone" dataKey="exchPct" name="Exchange %" stroke="#9B59B6" strokeWidth={1.5} dot={false} strokeDasharray="3 2" />
                  <Line yAxisId="pct" type="monotone" dataKey="cirPct" name="CIR %" stroke="#2E74CC" strokeWidth={1.5} dot={false} strokeDasharray="5 3" />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          )
        })()}
        <Card title="Category Revenue">
          {catRows.slice(0, 8).map((r, i) => { const dots = ['#534AB7','#0D9E68','#2E74CC','#CC8A00','#CC4078','#E24B4A','#9B59B6','#FF6B35']; return <HBar key={r.name} dot={dots[i % dots.length]} label={r.name} width={(r.rev / (catRows[0]?.rev || 1)) * 100} value={fmt(r.rev)} pctVal={totalRev ? pct(r.rev, totalRev) : '—'} /> })}
        </Card>
      </div>
      <ShopifyGeoDonutRow regionRows={sh.regionRows || []} tierRows={sh.tierRows || []} topStates={sh.topStates || []} />
      <div className="g-2" style={{ alignItems: 'stretch' }}>
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
      </div>
      <div className="g-2" style={{ alignItems: 'stretch' }}>
        <PaginatedCard title="Top States" rows={stateRows} columns={[{ key: 'state', label: 'State', render: v => v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : v }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'aov', label: 'AOV', align: 'right', render: v => `₹${Math.round(v).toLocaleString('en-IN')}` }, { key: 'cities', label: 'Cities' }]} pageSize={15} />
        <PaginatedCard title="Top Cities" rows={shCityRows} columns={[{ key: 'city', label: 'City', render: v => v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : v }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'aov', label: 'AOV', align: 'right', render: (_, r) => `₹${r.orders ? Math.round(r.rev / r.orders).toLocaleString('en-IN') : 0}` }]} pageSize={15} />
      </div>
    </div>
  )
}

function AmazonTab({ data, region = 'india', setRegion = () => {} }) {
  const [subView, setSubView] = useState('overview') // 'overview' | 'sc' | 'vc'
  const amzSC = data.amzSC || {}
  const amzVC = data.amzVC || {}
  const amzIntl = data.amzIntl || {}

  const toggleStyle = active => ({ fontSize: 12, fontWeight: active ? 700 : 500, padding: '5px 18px', borderRadius: 7, border: `1.5px solid ${active ? C.acm : C.border2}`, background: active ? C.acc : C.card, color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all .12s' })
  const subToggleStyle = active => ({ fontSize: 12, fontWeight: 700, padding: '5px 16px', borderRadius: 7, border: `1.5px solid ${active ? C.t1 : C.border}`, background: active ? C.t1 : C.card, color: active ? '#fff' : C.t1, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all .15s', boxShadow: active ? '0 2px 6px rgba(0,0,0,.15)' : 'none' })

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
  const vcTotalShipped = amzVC.accounts?.reduce((s, a) => s + a.shippedRev, 0) || 0
  const vcTotalOrderedUnits = amzVC.accounts?.reduce((s, a) => s + a.orderedUnits, 0) || 0
  const vcTotalShippedUnits = amzVC.accounts?.reduce((s, a) => s + a.shippedUnits, 0) || 0
  const vcTotalReturns = amzVC.accounts?.reduce((s, a) => s + a.returns, 0) || 0
  const vcFillRate = vcTotalOrderedUnits ? (vcTotalShippedUnits / vcTotalOrderedUnits * 100) : 0
  const vcReturnRate = vcTotalShippedUnits ? (vcTotalReturns / vcTotalShippedUnits * 100) : 0
  const vcMaxRev = Math.max(...(amzVC.accounts || []).map(a => a.orderedRev), 1)

  // ── Amazon prev-period for HeroKPICard ──
  const amzPrevSCRev = amzSC.prevRev || 0
  const amzPrevVCRev = amzVC.prevRev || 0
  const amzPrevTotalRev = amzPrevSCRev + amzPrevVCRev
  const amzTotalRev = scTotalRev + vcTotalOrdered
  const amzTotalChg = amzPrevTotalRev > 0 ? ((amzTotalRev - amzPrevTotalRev) / amzPrevTotalRev * 100) : null
  const amzSCChg = amzPrevSCRev > 0 ? ((scTotalRev - amzPrevSCRev) / amzPrevSCRev * 100) : null
  const amzVCChg = amzPrevVCRev > 0 ? ((vcTotalOrdered - amzPrevVCRev) / amzPrevVCRev * 100) : null
  const amzPrevDailyArr = amzSC.prevDaily || []
  const amzSparkData = Array.from({ length: Math.max(scDailyArr.length, amzPrevDailyArr.length) }, (_, i) => {
    const cur = scDailyArr[i]
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
          {[{ id: 'india', label: '🇮🇳 India' }, { id: 'intl', label: '🌍 International' }].map(opt => (
            <button key={opt.id} onClick={() => { setRegion(opt.id); setSubView('overview') }} style={{ fontSize: 12, fontWeight: region === opt.id ? 700 : 500, padding: '5px 16px', borderRadius: 7, border: 'none', background: region === opt.id ? C.acc : 'transparent', color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all .15s', boxShadow: region === opt.id ? '0 1px 4px rgba(0,0,0,.10)' : 'none' }}>{opt.label}</button>
          ))}
        </div>
        {/* Divider */}
        {region === 'india' && <span style={{ color: C.border2, fontSize: 18, lineHeight: 1 }}>│</span>}
        {/* Sub-toggle: SC / VC — India only */}
        {region === 'india' && (
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ id: 'sc', label: 'Seller Central' }, { id: 'vc', label: 'Vendor Central' }].map(opt => (
              <button key={opt.id} onClick={() => setSubView(opt.id)} style={subToggleStyle(subView === opt.id)}>{opt.label}</button>
            ))}
          </div>
        )}
      </div>

      {/* ── INDIA · OVERVIEW (SC + VC combined) ── */}
      {region === 'india' && subView === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* KPI layout: hero + 2 rows of 4 */}
          {(() => {
            const amzChgBadge = (cur, prev) => { if (!prev) return null; const p = (cur - prev) / prev * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> }
            const amzPrevOrders = amzSC.prevOrders || 0
            const amzPrevAOV = amzPrevOrders > 0 ? amzPrevSCRev / amzPrevOrders : 0
            const amzPrevDailyAvg = amzPrevTotalRev > 0 ? amzPrevTotalRev / (data.nDays || 1) : 0
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
                <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
                  <div className="kpi-label" style={{ fontSize: 11 }}>Total Revenue · SC + VC</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                    <div className="kpi-value" style={{ fontSize: 32, fontWeight: 800 }}>{fmt(scTotalRev + vcTotalOrdered)}</div>
                    {amzTotalChg !== null && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: amzTotalChg >= 0 ? C.green.bg : C.red.bg, color: amzTotalChg >= 0 ? C.green.tx : C.red.tx }}>{amzTotalChg >= 0 ? '▲' : '▼'} {Math.abs(amzTotalChg).toFixed(1)}%</span>}
                  </div>
                  <div className="kpi-sub" style={{ fontSize: 13 }}>{fmtN(scTotalOrders)} orders · {fmtN(scTotalUnits + vcTotalOrderedUnits)} units</div>
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
                      { label: 'SC Revenue', value: fmt(scTotalRev), sub: 'Seller Central', badge: amzChgBadge(scTotalRev, amzPrevSCRev) },
                      { label: 'VC Revenue', value: fmt(vcTotalOrdered), sub: 'Vendor Central', badge: amzChgBadge(vcTotalOrdered, amzPrevVCRev) },
                      { label: 'Total Orders', value: fmtN(scTotalOrders), sub: 'SC orders', badge: amzChgBadge(scTotalOrders, amzPrevOrders) },
                      { label: 'Daily Avg', value: fmt((scTotalRev + vcTotalOrdered) / (data.nDays || 1)), sub: 'SC + VC per day', badge: amzChgBadge((scTotalRev + vcTotalOrdered) / (data.nDays || 1), amzPrevDailyAvg) },
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
                      { label: 'AOV', value: `₹${Math.round(scAOV).toLocaleString('en-IN')}`, sub: 'SC avg order value', badge: amzChgBadge(scAOV, amzPrevAOV) },
                      { label: 'ASP', value: `₹${scTotalUnits ? Math.round(scTotalRev / scTotalUnits).toLocaleString('en-IN') : 0}`, sub: 'Avg selling price / unit' },
                      { label: 'FBA Share', value: `${scTotalRev ? (scFBA.rev / scTotalRev * 100).toFixed(1) : 0}%`, sub: `${fmt(scFBA.rev)} revenue` },
                      { label: 'Cancellation Rate', value: `${scCancelRate.toFixed(1)}%`, sub: `${fmtN(scCancelOrders)} cancelled`, accent: scCancelRate > 10 ? '#7A1A1A' : undefined },
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
          {/* Row 1: Daily Revenue + Order Status Breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 14, alignItems: 'stretch' }}>
            <Card title={`Daily ${scChartMetric === 'rev' ? 'Revenue' : scChartMetric === 'units' ? 'Units' : 'Orders'} · India (Seller Central FBA + MFN)`} action={<div style={{ display: 'flex', gap: 4 }}>{[{ v: 'rev', label: 'Revenue' }, { v: 'units', label: 'Units' }, { v: 'orders', label: 'Orders' }].map(opt => <button key={opt.v} onClick={() => setScChartMetric(opt.v)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${scChartMetric === opt.v ? C.t1 : C.border}`, background: scChartMetric === opt.v ? C.t1 : 'transparent', color: scChartMetric === opt.v ? '#fff' : C.t2, cursor: 'pointer', fontFamily: 'var(--font)' }}>{opt.label}</button>)}</div>}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={scDailyArr} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={d => d?.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => scChartMetric === 'rev' ? (v >= 1e5 ? `${(v/1e5).toFixed(0)}L` : v) : fmtN(v)} width={40} />
                  <Tooltip content={<ChartTooltip formatter={scChartMetric !== 'rev' ? fmtN : undefined} />} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey={scChartMetric === 'rev' ? 'FBA' : scChartMetric === 'units' ? 'FBA_units' : 'FBA_orders'} stackId="a" fill="#E8930A" name="FBA" />
                  <Bar dataKey={scChartMetric === 'rev' ? 'MFN' : scChartMetric === 'units' ? 'MFN_units' : 'MFN_orders'} stackId="a" fill="#2E74CC" name="MFN" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Order Status Breakdown · Seller Central">
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, height: '100%' }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {(amzSC.status || []).map(s => {
                    const clr = { Shipped: '#2E74CC', Pending: '#E8930A', Cancelled: '#E24B4A', Shipping: '#9B59B6' }[s.status] || C.t3
                    return (
                      <div key={s.status} style={{ textAlign: 'center', padding: '10px 18px', borderRadius: 10, background: C.bg, border: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: clr, fontFamily: 'var(--mono)' }}>{fmtN(s.orders)}</div>
                        <div style={{ fontSize: 11, color: C.t2, marginTop: 3, fontWeight: 500 }}>{s.status}</div>
                        <div style={{ fontSize: 11, color: C.t3 }}>{scStatusTotal ? (s.orders / scStatusTotal * 100).toFixed(1) : 0}%</div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ textAlign: 'center', paddingTop: 4 }}>
                  <div style={{ fontSize: 11, color: C.t3 }}>Total Orders</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: C.t1, fontFamily: 'var(--mono)' }}>{fmtN(scStatusTotal)}</div>
                  <div style={{ fontSize: 11, color: C.red.tx, marginTop: 4 }}>Cancel Rate: <strong>{scCancelRate.toFixed(1)}%</strong></div>
                </div>
              </div>
            </Card>
          </div>
          {/* Row 2: FBA vs MFN + Top States */}
          <div className="g-2" style={{ alignItems: 'stretch' }}>
            <Card title="FBA vs MFN · Seller Central">
              {[{ label: 'FBA (Fulfilled by Amazon)', ...scFBA }, { label: 'MFN (Merchant Fulfilled)', ...scMFN }].map((r, i) => (
                <div key={r.label} style={{ padding: '10px 0', borderBottom: i === 0 ? `1px solid ${C.border}` : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.t1 }}>{r.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.t1, fontFamily: 'var(--mono)' }}>{fmt(r.rev)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16 }}>
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
            <div style={{ alignSelf: 'flex-start' }}>
              <Card title="Top States · Seller Central">
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 0 6px', borderBottom: `1px solid ${C.border}`, marginBottom: 2 }}>
                  <span style={{ width: 8, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, width: 110, flexShrink: 0 }}>State</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, minWidth: 62, textAlign: 'right' }}>Revenue</span>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, width: 50, textAlign: 'right' }}>Orders</span>
                </div>
                <div style={{ overflowY: 'auto', maxHeight: 360 }}>
                  {(amzSC.states || []).map((s, i) => (
                    <HBar key={s.state} dot={['#E8930A','#2E74CC','#0D9E68','#CC4078','#9B59B6','#534AB7','#CC8A00','#E24B4A'][i % 8]} label={s.state?.charAt(0) + s.state?.slice(1).toLowerCase()} width={(s.rev / maxStateRev) * 100} value={fmt(s.rev)} pctVal={fmtN(s.orders)} />
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ── INDIA · SELLER CENTRAL ── */}
      {region === 'india' && subView === 'sc' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* KPIs row 1 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10 }}>
            <KPICard label="Total Revenue" value={fmt(scTotalRev)} sub={`${data.nDays || 7} days`} />
            <KPICard label="Net Revenue (Exc GST)" value={fmt(scTotalExcRev)} sub={`GST ${fmt(scTotalRev - scTotalExcRev)}`} />
            <KPICard label="Total Orders" value={fmtN(scTotalOrders)} />
            <KPICard label="AOV" value={`₹${Math.round(scAOV).toLocaleString('en-IN')}`} sub="Revenue / Orders" />
            <KPICard label="ASP" value={`₹${scTotalUnits ? Math.round(scTotalRev / scTotalUnits).toLocaleString('en-IN') : 0}`} sub="Revenue / Units" />
            <KPICard label="Total Units" value={fmtN(scTotalUnits)} />
            <KPICard label="Cancellation Rate" value={`${scCancelRate.toFixed(1)}%`} sub={`${fmtN(scCancelOrders)} cancelled`} accent={scCancelRate > 10 ? '#7A1A1A' : undefined} />
          </div>
          {/* KPIs row 2 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            <KPICard label="Daily Avg Revenue" value={fmt(scTotalRev / (data.nDays || 1))} sub="Revenue per day" />
            <KPICard label="Units per Order" value={scTotalOrders ? (scTotalUnits / scTotalOrders).toFixed(2) : '0'} sub="Avg basket size" />
            <KPICard label="FBA Share" value={`${scTotalRev ? (scFBA.rev / scTotalRev * 100).toFixed(1) : 0}%`} sub={`MFN ${scTotalRev ? (scMFN.rev / scTotalRev * 100).toFixed(1) : 0}%`} />
          </div>
          {/* FBA vs MFN */}
          <div className="g-2" style={{ alignItems: 'stretch' }}>
            <Card title="FBA vs MFN Breakdown">
              {[{ label: 'FBA (Fulfilled by Amazon)', ...scFBA }, { label: 'MFN (Merchant Fulfilled)', ...scMFN }].map((r, i) => (
                <div key={r.label} style={{ padding: '20px 0', borderBottom: i === 0 ? `1px solid ${C.border}` : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>{r.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.t1, fontFamily: 'var(--mono)' }}>{fmt(r.rev)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: C.t3 }}>Orders: <strong style={{ color: C.t1 }}>{fmtN(r.orders)}</strong></span>
                    <span style={{ fontSize: 12, color: C.t3 }}>Units: <strong style={{ color: C.t1 }}>{fmtN(r.units)}</strong></span>
                    <span style={{ fontSize: 12, color: C.t3 }}>AOV: <strong style={{ color: C.t1 }}>₹{r.orders ? Math.round(r.rev / r.orders).toLocaleString('en-IN') : 0}</strong></span>
                    <span style={{ fontSize: 12, color: C.t3 }}>Share: <strong style={{ color: C.t1 }}>{scTotalRev ? (r.rev / scTotalRev * 100).toFixed(1) : 0}%</strong></span>
                  </div>
                  <div style={{ marginTop: 4, height: 8, background: C.bg, borderRadius: 4 }}>
                    <div style={{ height: '100%', borderRadius: 4, background: i === 0 ? '#E8930A' : '#2E74CC', width: `${scTotalRev ? (r.rev / scTotalRev * 100) : 0}%`, transition: 'width .5s' }} />
                  </div>
                </div>
              ))}
            </Card>
            <Card title="Order Status">
              {(amzSC.status || []).map((s, i) => {
                const clr = { Shipped: C.green.tx, Pending: C.amber.tx, Cancelled: C.red.tx, Shipping: C.blue.tx }[s.status] || C.t3
                const total = amzSC.status.reduce((sum, x) => sum + x.orders, 0)
                return (
                  <div key={s.status} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', borderBottom: i < (amzSC.status.length - 1) ? `1px solid ${C.border}` : 'none' }}>
                    <span style={{ fontSize: 11.5, color: C.t2, width: 80 }}>{s.status}</span>
                    <div style={{ flex: 1, height: 5, background: C.bg, borderRadius: 3 }}><div style={{ height: '100%', borderRadius: 3, background: clr, width: `${total ? (s.orders / total * 100) : 0}%` }} /></div>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: C.t1, minWidth: 50, textAlign: 'right' }}>{fmtN(s.orders)}</span>
                    <span style={{ fontSize: 11, color: C.t3, minWidth: 36, textAlign: 'right' }}>{total ? (s.orders / total * 100).toFixed(1) : 0}%</span>
                  </div>
                )
              })}
            </Card>
          </div>
          {/* Daily trend FBA vs MFN */}
          <Card title={`Daily ${scChartMetric === 'rev' ? 'Revenue' : 'Orders'} · FBA vs MFN`} action={<div style={{ display: 'flex', gap: 4 }}>{[{ v: 'rev', label: 'Revenue' }, { v: 'orders', label: 'Orders' }].map(opt => <button key={opt.v} onClick={() => setScChartMetric(opt.v)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${scChartMetric === opt.v ? C.t1 : C.border}`, background: scChartMetric === opt.v ? C.t1 : 'transparent', color: scChartMetric === opt.v ? '#fff' : C.t2, cursor: 'pointer', fontFamily: 'var(--font)' }}>{opt.label}</button>)}</div>}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={scDailyArr} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={d => d?.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => scChartMetric === 'rev' ? (v >= 1e5 ? `${(v/1e5).toFixed(0)}L` : v) : fmtN(v)} width={40} />
                <Tooltip content={<ChartTooltip formatter={scChartMetric === 'orders' ? fmtN : undefined} />} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey={scChartMetric === 'rev' ? 'FBA' : 'FBA_orders'} stackId="a" fill="#E8930A" name="FBA" />
                <Bar dataKey={scChartMetric === 'rev' ? 'MFN' : 'MFN_orders'} stackId="a" fill="#2E74CC" name="MFN" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <div className="g-2" style={{ alignItems: 'stretch' }}>
            {/* Top States */}
            <div style={{ alignSelf: 'flex-start' }}>
              <Card title="Top States">
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 0 6px', borderBottom: `1px solid ${C.border}`, marginBottom: 2 }}>
                  <span style={{ width: 8, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, width: 110, flexShrink: 0 }}>State</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, minWidth: 62, textAlign: 'right' }}>Revenue</span>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, width: 50, textAlign: 'right' }}>Orders</span>
                </div>
                <div style={{ overflowY: 'auto', maxHeight: 520 }}>
                  {(amzSC.states || []).map((s, i) => (
                    <HBar key={s.state} dot={['#E8930A','#2E74CC','#0D9E68','#CC4078','#9B59B6','#534AB7','#CC8A00','#E24B4A','#FF6B35','#4AB89A'][i % 10]} label={s.state?.charAt(0) + s.state?.slice(1).toLowerCase()} width={(s.rev / maxStateRev) * 100} value={fmt(s.rev)} pctVal={fmtN(s.orders)} />
                  ))}
                </div>
              </Card>
            </div>
            {/* Top SKUs */}
            <Card title="Top SKUs · Seller Central">
              <DataTable columns={[
                { key: 'sku', label: 'SKU' },
                { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) },
                { key: 'units', label: 'Units', align: 'right', render: v => fmtN(v) },
                { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
              ]} rows={amzSC.skus || []} maxRows={20} />
            </Card>
          </div>
        </div>
      )}

      {/* ── INDIA · VENDOR CENTRAL ── */}
      {region === 'india' && subView === 'vc' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10 }}>
            <KPICard label="Ordered Revenue" value={fmt(vcTotalOrdered)} sub="Gross ordered value" />
            <KPICard label="Ordered Units" value={fmtN(vcTotalOrderedUnits)} />
            <KPICard label="Shipped Units" value={fmtN(vcTotalShippedUnits)} />
            <KPICard label="ASP" value={`₹${vcTotalOrderedUnits ? Math.round(vcTotalOrdered / vcTotalOrderedUnits).toLocaleString('en-IN') : 0}`} sub="Ordered rev / units" />
            <KPICard label="Vendor Accounts" value={fmtN(amzVC.accounts?.length || 0)} sub="Active accounts" />
            <KPICard label="Customer Returns" value={fmtN(vcTotalReturns)} accent={vcTotalReturns > 100 ? '#7A4000' : undefined} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
            <KPICard label="Return Rate" value={`${vcReturnRate.toFixed(1)}%`} sub="Returns / Shipped" accent={vcReturnRate > 5 ? '#7A1A1A' : undefined} />
            <KPICard label="Daily Avg Ordered" value={fmt(vcTotalOrdered / (data.nDays || 1))} sub="Revenue per day" />
          </div>
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
            <Card title="Daily Ordered vs Shipped Units">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={amzVC.daily || []} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={d => d?.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: C.t3 }} width={40} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="orderedUnits" stroke="#E8930A" strokeWidth={2} dot={false} name="Ordered Units" />
                  <Line type="monotone" dataKey="shippedUnits" stroke="#0D9E68" strokeWidth={2} dot={false} name="Shipped Units" />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </div>
          <Card title="Top ASINs · Vendor Central">
            <DataTable columns={[
              { key: 'asin', label: 'ASIN' },
              { key: 'sku', label: 'SKU' },
              { key: 'orderedUnits', label: 'Ordered', align: 'right', render: v => fmtN(v) },
              { key: 'orderedRev', label: 'Ordered Rev', align: 'right', mono: true, render: v => fmt(v) },
              { key: 'shippedUnits', label: 'Shipped', align: 'right', render: v => fmtN(v) },
              { key: 'returns', label: 'Returns', align: 'right', render: v => fmtN(v) },
            ]} rows={amzVC.asins || []} maxRows={20} />
          </Card>
        </div>
      )}

      {/* ── INTERNATIONAL · SELLER CENTRAL ── */}
      {region === 'intl' && (subView === 'overview' || subView === 'sc') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(() => {
            const intlTotalUnits = (amzIntl.countries || []).reduce((s, c) => s + (c.units || 0), 0)
            const intlASP = intlTotalUnits ? Math.round(intlTotalRev / intlTotalUnits) : 0
            return (<>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10 }}>
                <KPICard label="Total Revenue" value={fmt(intlTotalRev)} sub={`${(amzIntl.countries || []).length} markets`} />
                <KPICard label="Total Orders" value={fmtN(intlTotalOrders)} />
                <KPICard label="AOV" value={`₹${Math.round(intlAOV).toLocaleString('en-IN')}`} sub="Revenue / Orders" />
                <KPICard label="ASP" value={`₹${intlASP.toLocaleString('en-IN')}`} sub="Revenue / Units" />
                <KPICard label="Total Units" value={fmtN(intlTotalUnits)} />
                <KPICard label="Top Market" value={(amzIntl.countries?.[0]?.country) || '—'} sub={amzIntl.countries?.[0] ? `${fmt(amzIntl.countries[0].rev)}` : ''} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                <KPICard label="Daily Avg Revenue" value={fmt(intlTotalRev / (data.nDays || 1))} sub="Revenue per day" />
                <KPICard label="Units per Order" value={intlTotalOrders ? (intlTotalUnits / intlTotalOrders).toFixed(2) : '0'} sub="Avg basket size" />
                <KPICard label="Markets" value={fmtN((amzIntl.countries || []).length)} sub="Active countries" />
              </div>
            </>)
          })()}
          {/* Daily revenue by country */}
          {(() => {
            const intlCountryColors = { UAE: '#E8930A', UK: '#2E74CC', US: '#0D9E68' }
            const intlDailyMap = {}
            ;(amzIntl.daily || []).forEach(d => {
              if (!intlDailyMap[d.date]) intlDailyMap[d.date] = { date: d.date }
              intlDailyMap[d.date][d.country] = (intlDailyMap[d.date][d.country] || 0) + d.rev
            })
            const intlDailyArr = Object.values(intlDailyMap).sort((a, b) => a.date.localeCompare(b.date))
            const intlCountries = [...new Set((amzIntl.daily || []).map(d => d.country).filter(Boolean))]
            return (
              <Card title="Daily Revenue by Country · Seller Central">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={intlDailyArr} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={d => d?.slice(5)} />
                    <YAxis tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => v >= 1e5 ? `${(v/1e5).toFixed(0)}L` : v} width={40} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                    {intlCountries.map(ct => <Bar key={ct} dataKey={ct} stackId="a" fill={intlCountryColors[ct] || C.t3} />)}
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )
          })()}
          <div className="g-2" style={{ alignItems: 'stretch' }}>
            <Card title="Country Breakdown">
              {(amzIntl.countries || []).map((c, i) => (
                <HBar key={c.country} dot={intlDots[c.country] || C.t3} label={c.country} width={intlTotalRev ? (c.rev / intlTotalRev * 100) : 0} value={fmt(c.rev)} pctVal={fmtN(c.orders) + ' ord'} />
              ))}
              {(!amzIntl.countries || amzIntl.countries.length === 0) && <div style={{ fontSize: 12, color: C.t3, padding: '20px 0', textAlign: 'center' }}>No international orders in this period</div>}
            </Card>
            <Card title="Top SKUs · International Seller Central">
              <DataTable columns={[
                { key: 'sku', label: 'SKU' },
                { key: 'country', label: 'Country' },
                { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) },
                { key: 'units', label: 'Units', align: 'right', render: v => fmtN(v) },
                { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
              ]} rows={amzIntl.skus || []} maxRows={20} />
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

function FlipkartTab({ data }) {
  const [subView, setSubView] = useState('overview')
  const subToggleStyle = active => ({ fontSize: 12, fontWeight: 700, padding: '5px 16px', borderRadius: 7, border: `1.5px solid ${active ? C.t1 : C.border}`, background: active ? C.t1 : C.card, color: active ? '#fff' : C.t1, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all .15s', boxShadow: active ? '0 2px 6px rgba(0,0,0,.15)' : 'none' })

  const fk = data.flipkart || {}
  const nDays = data.nDays || 1
  const statusColors = { Delivered: C.green.tx, Dispatched: C.blue.tx, RTO: C.amber.tx, Cancelled: C.red.tx, Shipped: '#2E74CC', Pending: '#E8930A', Return: '#9B59B6' }

  // Filter all arrays by subView
  const filterSub = arr => subView === 'overview' ? arr : arr.filter(x => x.sub === (subView === 'fbf' ? 'FBF' : 'NON-FBF'))

  const totals = filterSub(fk.totals || [])
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
    if (!dailyMap[x.date]) dailyMap[x.date] = { date: x.date, FBF: 0, NonFBF: 0, FBF_orders: 0, NonFBF_orders: 0, FBF_units: 0, NonFBF_units: 0, estimated: x.estimated || false }
    if (x.sub === 'FBF') { dailyMap[x.date].FBF = x.rev; dailyMap[x.date].FBF_orders = x.orders; dailyMap[x.date].FBF_units = x.units || 0 }
    else { dailyMap[x.date].NonFBF = x.rev; dailyMap[x.date].NonFBF_orders = x.orders; dailyMap[x.date].NonFBF_units = x.units || 0 }
    if (x.estimated) dailyMap[x.date].estimated = true
  })
  const dailyArr = Object.values(dailyMap).sort((a, b) => a.date?.localeCompare(b.date))
  const subDailyArr = filterSub(fk.daily || []).map(x => ({ date: x.date, rev: x.rev, orders: x.orders }))
    .reduce((acc, x) => { const e = acc.find(a => a.date === x.date); if (e) { e.rev += x.rev } else acc.push({ ...x }); return acc }, [])
    .sort((a, b) => a.date?.localeCompare(b.date))
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
          <button onClick={() => setSubView('overview')} style={{ fontSize: 12, fontWeight: subView === 'overview' ? 700 : 500, padding: '5px 16px', borderRadius: 7, border: 'none', background: subView === 'overview' ? C.acc : 'transparent', color: C.t1, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all .15s' }}>📦 Overview</button>
        </div>
        <span style={{ color: C.border2, fontSize: 18 }}>│</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {[{ id: 'fbf', label: 'FBF' }, { id: 'nonfbf', label: 'Non-FBF' }].map(opt => (
            <button key={opt.id} onClick={() => setSubView(opt.id)} style={subToggleStyle(subView === opt.id)}>{opt.label}</button>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, flex: 1 }}>
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
              { label: 'Orders', value: fmtN(nOrders), sub: subView === 'overview' ? 'FBF + Non-FBF' : subView === 'fbf' ? 'FBF only' : 'Non-FBF only', badge: fkChgBadge(nOrders, fkPrevOrders) },
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, flex: 1 }}>
            {[
              { label: 'Total Units', value: fmtN(qty), sub: `ASP ₹${Math.round(asp).toLocaleString('en-IN')}`, badge: fkChgBadge(qty, fkPrevUnits) },
              { label: 'GST Collected', value: fmt(rev - excRev), sub: 'Inc GST − Exc GST', badge: fkChgBadge(rev - excRev, fkPrevGST) },
              { label: 'FBF Share', value: `${allRev ? (fbfT.rev / allRev * 100).toFixed(1) : 0}%`, sub: `${fmt(fbfT.rev)} · ${fmtN(fbfT.orders)} orders`, badge: fkChgBadge(fbfT.rev, fkPrevFbfRev) },
              { label: 'Non-FBF Share', value: `${allRev ? (nfbfT.rev / allRev * 100).toFixed(1) : 0}%`, sub: `${fmt(nfbfT.rev)} · ${fmtN(nfbfT.orders)} orders`, badge: fkChgBadge(nfbfT.rev, fkPrevNonFbfRev) },
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

      {/* Row 1: Daily chart + FBF vs Non-FBF breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 14, alignItems: 'stretch' }}>
        <Card title={subView === 'overview' ? `Daily ${chartMetric === 'rev' ? 'Revenue' : chartMetric === 'units' ? 'Units' : 'Orders'} · FBF vs Non-FBF` : `Daily ${chartMetric === 'rev' ? 'Revenue' : chartMetric === 'units' ? 'Units' : 'Orders'} · ${subView === 'fbf' ? 'FBF' : 'Non-FBF'}`}
          action={<div style={{ display: 'flex', gap: 4 }}>{[{ v: 'rev', label: 'Revenue' }, { v: 'units', label: 'Units' }, { v: 'orders', label: 'Orders' }].map(opt => <button key={opt.v} onClick={() => setChartMetric(opt.v)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${chartMetric === opt.v ? C.t1 : C.border}`, background: chartMetric === opt.v ? C.t1 : 'transparent', color: chartMetric === opt.v ? '#fff' : C.t2, cursor: 'pointer', fontFamily: 'var(--font)' }}>{opt.label}</button>)}</div>}>
          {fkEstimatedDays > 0 && (
            <div style={{ fontSize: 11, color: '#92600A', background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: 6, padding: '5px 10px', marginBottom: 8 }}>
              ⏳ Data available till {fkLatestReal} · Last {fkEstimatedDays} day{fkEstimatedDays > 1 ? 's' : ''} shown as 7-day rolling avg estimate
            </div>
          )}
          {subView === 'overview' ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dailyArr} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={d => d?.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => chartMetric === 'rev' ? (v >= 1e5 ? `${(v/1e5).toFixed(0)}L` : v) : fmtN(v)} width={40} />
                <Tooltip content={<ChartTooltip formatter={chartMetric !== 'rev' ? fmtN : undefined} extraLabel={entry => entry?.estimated ? ' (est.)' : ''} />} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey={chartMetric === 'rev' ? 'FBF' : chartMetric === 'units' ? 'FBF_units' : 'FBF_orders'} stackId="a" name="FBF">
                  {dailyArr.map((entry, i) => <Cell key={i} fill={entry.estimated ? '#F5C97A' : '#E8930A'} opacity={entry.estimated ? 0.6 : 1} />)}
                </Bar>
                <Bar dataKey={chartMetric === 'rev' ? 'NonFBF' : chartMetric === 'units' ? 'NonFBF_units' : 'NonFBF_orders'} stackId="a" name="Non-FBF">
                  {dailyArr.map((entry, i) => <Cell key={i} fill={entry.estimated ? '#A8C8F0' : '#2E74CC'} opacity={entry.estimated ? 0.6 : 1} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <AreaTrendChart data={subDailyArr} color={subView === 'fbf' ? '#E8930A' : '#2E74CC'} />
          )}
        </Card>
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

      {/* Row 2: Order Status + Top States */}
      <div className="g-2" style={{ alignItems: 'stretch' }}>
        <Card title="Order Status Breakdown">
          {Object.entries(statusAgg).sort((a, b) => b[1] - a[1]).map(([s, count]) => {
            const clr = statusColors[s] || C.t3
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 11.5, color: C.t2, width: 100 }}>{s}</span>
                <div style={{ flex: 1, height: 5, background: C.bg, borderRadius: 3 }}><div style={{ height: '100%', borderRadius: 3, background: clr, width: `${statusTotal ? (count / statusTotal * 100) : 0}%` }} /></div>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: C.t1, minWidth: 45, textAlign: 'right' }}>{fmtN(count)}</span>
                <span style={{ fontSize: 11, color: C.t3, minWidth: 38, textAlign: 'right' }}>{statusTotal ? (count / statusTotal * 100).toFixed(1) : 0}%</span>
              </div>
            )
          })}
        </Card>
        <div style={{ alignSelf: 'flex-start' }}>
          <Card title="All States">
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 0 6px', borderBottom: `1px solid ${C.border}`, marginBottom: 2 }}>
              <span style={{ width: 8, flexShrink: 0 }} /><span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, width: 110, flexShrink: 0 }}>State</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, minWidth: 62, textAlign: 'right' }}>Revenue</span>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, width: 50, textAlign: 'right' }}>Orders</span>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: 320 }}>
              {stateRows.map((s, i) => (
                <HBar key={s.state} dot={['#E8930A','#2E74CC','#0D9E68','#CC4078','#9B59B6','#534AB7','#CC8A00','#E24B4A'][i % 8]} label={s.state?.charAt(0) + s.state?.slice(1).toLowerCase()} width={(s.rev / maxStateRev) * 100} value={fmt(s.rev)} pctVal={fmtN(s.orders)} />
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Category + SKU tables */}
      <div className="g-2">
        <Card title="Category Breakdown">
          <DataTable columns={[{ key: 'name', label: 'Category' }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'units', label: 'Units', align: 'right', render: v => fmtN(v) }, { key: 'aov', label: 'AOV', align: 'right', render: v => `₹${Math.round(v).toLocaleString('en-IN')}` }]} rows={catRows} />
        </Card>
        <Card title="Top SKUs">
          <DataTable columns={[{ key: 'sku', label: 'SKU' }, { key: 'sub', label: 'Type' }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'units', label: 'Units', align: 'right', render: v => fmtN(v) }]} rows={skuRows} />
        </Card>
      </div>
    </div>
  )
}

function BlinkitTab({ data }) {
  const bl = data.blinkit || {}
  const t = bl.totals || {}
  const nDays = t.days || 1
  const rev = t.rev || 0
  const excRev = t.excRev || 0
  const units = t.units || 0
  const skus = t.skus || 0
  const cities = t.cities || 0
  const asp = units ? excRev / units : 0
  const dailyAvg = nDays ? rev / nDays : 0

  const daily = bl.daily || []
  const maxDailyRev = Math.max(...daily.map(d => d.rev), 1)
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

  const cats = bl.categories || []
  const maxCatRev = Math.max(...cats.map(c => c.rev), 1)

  const cityRows = bl.cities || []
  const maxCityRev = Math.max(...cityRows.map(c => c.rev), 1)

  const skuRows = bl.skus || []
  const catColors = ['#FFD600','#0D9E68','#2E74CC','#CC4078','#9B59B6','#534AB7','#CC8A00','#E24B4A']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPI layout: hero + 2 rows of 3 */}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, flex: 1 }}>
            {[
              { label: 'Net Revenue (Exc GST)', value: fmt(excRev), sub: `GST ${fmt(rev - excRev)}`, badge: blChgBadge(excRev, blPrevExcRev) },
              { label: 'Daily Avg', value: fmt(dailyAvg), sub: `over ${nDays} days`, badge: blChgBadge(dailyAvg, blPrevRev > 0 ? blPrevRev / nDays : 0) },
              { label: 'Units Sold', value: fmtN(units), sub: `${skus} SKUs`, badge: blChgBadge(units, blPrevUnits) },
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
              { label: 'ASP', value: `₹${Math.round(asp).toLocaleString('en-IN')}`, sub: 'Avg selling price', badge: blChgBadge(asp, blPrevUnits > 0 ? blPrevExcRev / blPrevUnits : 0) },
              { label: 'Cities', value: fmtN(cities), sub: 'Cities with sales', badge: blChgBadge(cities, blPrevCities) },
              { label: 'Active SKUs', value: fmtN(skus), sub: 'In date range', badge: blChgBadge(skus, blPrevSkus) },
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

      {/* Row 1: Daily trend + Category breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 14, alignItems: 'stretch' }}>
        <Card title="Daily Revenue & Units">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={daily} margin={{ top: 4, right: 40, bottom: 0, left: 0 }}>
              <defs><linearGradient id="blRevGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#FFD600" stopOpacity={0.2} /><stop offset="95%" stopColor="#FFD600" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={d => d?.slice(5)} />
              <YAxis yAxisId="rev" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} width={42} />
              <YAxis yAxisId="units" orientation="right" tick={{ fontSize: 10, fill: '#2E74CC' }} tickFormatter={v => fmtN(v)} width={30} />
              <Tooltip content={({ active, payload, label }) => active && payload?.length ? (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 11.5 }}><div style={{ color: C.t3, marginBottom: 4 }}>{label}</div>{payload.map(p => <div key={p.name} style={{ color: p.color, fontWeight: 600 }}>{p.name}: {p.name === 'Revenue' ? fmt(p.value) : fmtN(p.value)}</div>)}</div>) : null} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area yAxisId="rev" type="monotone" dataKey="rev" name="Revenue" stroke="#FFD600" strokeWidth={2} fill="url(#blRevGrad)" dot={false} />
              <Line yAxisId="units" type="monotone" dataKey="units" name="Units" stroke="#2E74CC" strokeWidth={2} dot={{ r: 3, fill: '#2E74CC' }} activeDot={{ r: 5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Category Breakdown">
          {cats.map((c, i) => (
            <div key={c.category} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: catColors[i % catColors.length], flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, color: C.t2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.category}</span>
              <div style={{ width: 80, height: 5, background: C.bg, borderRadius: 3, flexShrink: 0 }}>
                <div style={{ height: '100%', borderRadius: 3, background: catColors[i % catColors.length], width: `${(c.rev / maxCatRev) * 100}%` }} />
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: C.t1, minWidth: 60, textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(c.rev)}</span>
              <span style={{ fontSize: 11, color: C.t3, minWidth: 40, textAlign: 'right' }}>{fmtN(c.units)}u</span>
            </div>
          ))}
        </Card>
      </div>


      {/* SKU Table + City Table */}
      <div className="g-2">
        <Card title="SKU Performance">
          <div style={{ overflowY: 'auto', maxHeight: 400 }}>
          <DataTable
            columns={[
              { key: 'name', label: 'Product', render: v => <span style={{ fontSize: 11, display: 'block', wordBreak: 'break-word' }}>{v}</span> },
              { key: 'units', label: 'Units', align: 'right', render: v => fmtN(v) },
              { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
              { key: 'cities', label: 'Cities', align: 'right', render: v => fmtN(v) },
            ]}
            rows={skuRows}
          />
          </div>
        </Card>
        <Card title="All Cities">
          <div style={{ overflowY: 'auto', maxHeight: 400 }}>
            <DataTable
              columns={[
                { key: 'city', label: 'City' },
                { key: 'region', label: 'Region', render: v => v || '—' },
                { key: 'cityTier', label: 'Tier', render: v => v ? `Tier ${v}` : '—' },
                { key: 'units', label: 'Units', align: 'right', render: v => fmtN(v) },
                { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
                { key: 'skus', label: 'SKUs', align: 'right', render: v => fmtN(v) },
              ]}
              rows={cityRows}
            />
          </div>
        </Card>
      </div>
    </div>
  )
}

function InstaTab({ data }) {
  const ins = data.instamart || {}
  const t = ins.totals || {}
  const nDays = t.days || 1
  const rev = t.rev || 0
  const excRev = t.excRev || 0
  const units = t.units || 0
  const skus = t.skus || 0
  const cities = t.cities || 0
  const asp = units ? excRev / units : 0
  const dailyAvg = nDays ? rev / nDays : 0

  const daily = ins.daily || []
  const maxDailyRev = Math.max(...daily.map(d => d.rev), 1)
  const insPrevRev = ins.prevRev || 0
  const insPrevDailyArr = ins.prevDaily || []
  const insRevChg = insPrevRev > 0 ? ((rev - insPrevRev) / insPrevRev * 100) : null
  const insSparkData = Array.from({ length: Math.max(daily.length, insPrevDailyArr.length) }, (_, i) => ({
    i, cur: daily[i]?.rev ?? null, prev: insPrevDailyArr[i]?.rev ?? null
  }))

  const cats = ins.categories || []
  const maxCatRev = Math.max(...cats.map(c => c.rev), 1)

  const cityRows = ins.cities || []
  const maxCityRev = Math.max(...cityRows.map(c => c.rev), 1)

  const skuRows = ins.skus || []
  const catColors = ['#FF6B35','#0D9E68','#2E74CC','#CC4078','#9B59B6','#534AB7','#CC8A00','#E24B4A']

  const insChgBadge = (cur, prev) => { if (!prev) return null; const p = (cur - prev) / prev * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
        {/* Hero card */}
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
        {/* Right: 2 rows of 3 KPIs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, flex: 1 }}>
            {[
              { label: 'Net Revenue (Exc GST)', value: fmt(excRev), sub: 'Before tax' },
              { label: 'Daily Avg Revenue', value: fmt(dailyAvg), sub: 'Inc GST / day' },
              { label: 'Units Sold', value: fmtN(units), sub: `${skus} SKUs` },
            ].map(k => (
              <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
                <div className="kpi-label">{k.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}><div className="kpi-value" style={{ fontSize: 17 }}>{k.value}</div>{k.badge}</div>
                </div>
                {k.sub && <div className="kpi-sub">{k.sub}</div>}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, flex: 1 }}>
            {[
              { label: 'ASP (Inc GST)', value: `₹${Math.round(asp).toLocaleString('en-IN')}`, sub: 'Avg selling price' },
              { label: 'Cities', value: fmtN(cities), sub: 'Cities with sales' },
              { label: 'SKUs', value: fmtN(skus), sub: 'Active SKUs' },
            ].map(k => (
              <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
                <div className="kpi-label">{k.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}><div className="kpi-value" style={{ fontSize: 17 }}>{k.value}</div>{k.badge}</div>
                </div>
                {k.sub && <div className="kpi-sub">{k.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 14, alignItems: 'stretch' }}>
        <Card title="Daily Revenue & Units">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={daily} margin={{ top: 4, right: 40, bottom: 0, left: 0 }}>
              <defs><linearGradient id="inRevGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#FF6B35" stopOpacity={0.2} /><stop offset="95%" stopColor="#FF6B35" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={d => d?.slice(5)} />
              <YAxis yAxisId="rev" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} width={42} />
              <YAxis yAxisId="units" orientation="right" tick={{ fontSize: 10, fill: '#2E74CC' }} tickFormatter={v => fmtN(v)} width={30} />
              <Tooltip content={({ active, payload, label }) => active && payload?.length ? (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 11.5 }}><div style={{ color: C.t3, marginBottom: 4 }}>{label}</div>{payload.map(p => <div key={p.name} style={{ color: p.color, fontWeight: 600 }}>{p.name}: {p.name === 'Revenue' ? fmt(p.value) : fmtN(p.value)}</div>)}</div>) : null} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area yAxisId="rev" type="monotone" dataKey="rev" name="Revenue" stroke="#FF6B35" strokeWidth={2} fill="url(#inRevGrad)" dot={false} />
              <Line yAxisId="units" type="monotone" dataKey="units" name="Units" stroke="#2E74CC" strokeWidth={2} dot={{ r: 3, fill: '#2E74CC' }} activeDot={{ r: 5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Category Breakdown">
          {cats.map((c, i) => (
            <div key={c.category} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: catColors[i % catColors.length], flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, color: C.t2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.category}</span>
              <div style={{ width: 80, height: 5, background: C.bg, borderRadius: 3, flexShrink: 0 }}>
                <div style={{ height: '100%', borderRadius: 3, background: catColors[i % catColors.length], width: `${(c.rev / maxCatRev) * 100}%` }} />
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: C.t1, minWidth: 60, textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(c.rev)}</span>
              <span style={{ fontSize: 11, color: C.t3, minWidth: 40, textAlign: 'right' }}>{fmtN(c.units)}u</span>
            </div>
          ))}
        </Card>
      </div>


      <div className="g-2">
        <Card title="SKU Performance">
          <div style={{ overflowY: 'auto', maxHeight: 400 }}>
            <DataTable
              columns={[
                { key: 'name', label: 'Product', render: v => <span style={{ fontSize: 11, display: 'block', wordBreak: 'break-word' }}>{v}</span> },
                { key: 'units', label: 'Units', align: 'right', render: v => fmtN(v) },
                { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
                { key: 'cities', label: 'Cities', align: 'right', render: v => fmtN(v) },
              ]}
              rows={skuRows}
            />
          </div>
        </Card>
        <Card title="All Cities">
          <div style={{ overflowY: 'auto', maxHeight: 400 }}>
            <DataTable
              columns={[
                { key: 'city', label: 'City' },
                { key: 'region', label: 'Region', render: v => v || '—' },
                { key: 'cityTier', label: 'Tier', render: v => v ? `Tier ${v}` : '—' },
                { key: 'units', label: 'Units', align: 'right', render: v => fmtN(v) },
                { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
                { key: 'skus', label: 'SKUs', align: 'right', render: v => fmtN(v) },
              ]}
              rows={cityRows}
            />
          </div>
        </Card>
      </div>
    </div>
  )
}

function ZeptoTab({ data }) {
  const zp = data.zepto || {}
  const t = zp.totals || {}
  const nDays = t.days || 1
  const rev = t.rev || 0
  const excRev = t.excRev || 0
  const units = t.units || 0
  const orders = t.orders || 0
  const skus = t.skus || 0
  const cities = t.cities || 0
  const asp = units ? excRev / units : 0
  const dailyAvg = nDays ? rev / nDays : 0

  const daily = zp.daily || []
  const zpPrevRev = zp.prevRev || 0
  const zpPrevDailyArr = zp.prevDaily || []
  const zpRevChg = zpPrevRev > 0 ? ((rev - zpPrevRev) / zpPrevRev * 100) : null
  const zpSparkData = Array.from({ length: Math.max(daily.length, zpPrevDailyArr.length) }, (_, i) => ({
    i, cur: daily[i]?.rev ?? null, prev: zpPrevDailyArr[i]?.rev ?? null
  }))
  const cats = zp.categories || []
  const maxCatRev = Math.max(...cats.map(c => c.rev), 1)
  const cityRows = zp.cities || []
  const maxCityRev = Math.max(...cityRows.map(c => c.rev), 1)
  const skuRows = zp.skus || []
  const catColors = ['#8B5CF6','#0D9E68','#2E74CC','#CC4078','#FF6B35','#534AB7','#CC8A00','#E24B4A']

  const zpChgBadge = (cur, prev) => { if (!prev) return null; const p = (cur - prev) / prev * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
        {/* Hero card */}
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
        {/* Right: 2 rows of 3 KPIs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, flex: 1 }}>
            {[
              { label: 'Net Revenue (Exc GST)', value: fmt(excRev), sub: 'Before tax' },
              { label: 'Daily Avg Revenue', value: fmt(dailyAvg), sub: 'Inc GST / day', badge: zpChgBadge(dailyAvg, zpPrevRev > 0 ? zpPrevRev / nDays : 0) },
              { label: 'Orders', value: fmtN(orders), sub: `${fmtN(units)} units sold` },
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
              { label: 'ASP (Inc GST)', value: `₹${Math.round(asp).toLocaleString('en-IN')}`, sub: 'Avg selling price' },
              { label: 'Cities', value: fmtN(cities), sub: 'Cities with sales' },
              { label: 'SKUs', value: fmtN(skus), sub: 'Active SKUs' },
            ].map(k => (
              <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
                <div className="kpi-label">{k.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}><div className="kpi-value" style={{ fontSize: 17 }}>{k.value}</div>{k.badge}</div>
                </div>
                {k.sub && <div className="kpi-sub">{k.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 14, alignItems: 'stretch' }}>
        <Card title="Daily Revenue & Orders">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={daily} margin={{ top: 4, right: 40, bottom: 0, left: 0 }}>
              <defs><linearGradient id="zpRevGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.2} /><stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={d => d?.slice(5)} />
              <YAxis yAxisId="rev" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} width={42} />
              <YAxis yAxisId="units" orientation="right" tick={{ fontSize: 10, fill: '#2E74CC' }} tickFormatter={v => fmtN(v)} width={30} />
              <Tooltip content={({ active, payload, label }) => active && payload?.length ? (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 11.5 }}><div style={{ color: C.t3, marginBottom: 4 }}>{label}</div>{payload.map(p => <div key={p.name} style={{ color: p.color, fontWeight: 600 }}>{p.name}: {p.name === 'Revenue' ? fmt(p.value) : fmtN(p.value)}</div>)}</div>) : null} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area yAxisId="rev" type="monotone" dataKey="rev" name="Revenue" stroke="#8B5CF6" strokeWidth={2} fill="url(#zpRevGrad)" dot={false} />
              <Line yAxisId="units" type="monotone" dataKey="units" name="Units" stroke="#2E74CC" strokeWidth={2} dot={{ r: 3, fill: '#2E74CC' }} activeDot={{ r: 5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Category Breakdown">
          {cats.map((c, i) => (
            <div key={c.category} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: catColors[i % catColors.length], flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, color: C.t2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.category}</span>
              <div style={{ width: 80, height: 5, background: C.bg, borderRadius: 3, flexShrink: 0 }}>
                <div style={{ height: '100%', borderRadius: 3, background: catColors[i % catColors.length], width: `${(c.rev / maxCatRev) * 100}%` }} />
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: C.t1, minWidth: 60, textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(c.rev)}</span>
              <span style={{ fontSize: 11, color: C.t3, minWidth: 40, textAlign: 'right' }}>{fmtN(c.units)}u</span>
            </div>
          ))}
        </Card>
      </div>


      <div className="g-2">
        <Card title="SKU Performance">
          <div style={{ overflowY: 'auto', maxHeight: 400 }}>
            <DataTable
              columns={[
                { key: 'name', label: 'Product', render: v => <span style={{ fontSize: 11, display: 'block', wordBreak: 'break-word' }}>{v}</span> },
                { key: 'units', label: 'Units', align: 'right', render: v => fmtN(v) },
                { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
                { key: 'cities', label: 'Cities', align: 'right', render: v => fmtN(v) },
              ]}
              rows={skuRows}
            />
          </div>
        </Card>
        <Card title="All Cities">
          <div style={{ overflowY: 'auto', maxHeight: 400 }}>
            <DataTable
              columns={[
                { key: 'city', label: 'City' },
                { key: 'region', label: 'Region', render: v => v || '—' },
                { key: 'cityTier', label: 'Tier', render: v => v ? `Tier ${v}` : '—' },
                { key: 'units', label: 'Units', align: 'right', render: v => fmtN(v) },
                { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
                { key: 'skus', label: 'SKUs', align: 'right', render: v => fmtN(v) },
              ]}
              rows={cityRows}
            />
          </div>
        </Card>
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
  const cities = t.cities || 0
  const aov = orders ? rev / orders : 0
  const dailyAvg = nDays ? rev / nDays : 0

  const crPrevRev = cr.prevRev || 0
  const crPrevExcRev = cr.prevExcRev || 0
  const crPrevOrders = cr.prevOrders || 0
  const crPrevUnits = cr.prevUnits || 0
  const crPrevSkus = cr.prevSkus || 0
  const crPrevCities = cr.prevCities || 0
  const crPrevDailyArr = cr.prevDaily || []
  const crRevChg = crPrevRev > 0 ? ((rev - crPrevRev) / crPrevRev * 100) : null
  const crExcChg = crPrevExcRev > 0 ? ((excRev - crPrevExcRev) / crPrevExcRev * 100) : null

  const [selectedCat, setSelectedCat] = useState(null)
  const daily = cr.daily || []
  const crSparkData = Array.from({ length: Math.max(daily.length, crPrevDailyArr.length) }, (_, i) => ({
    i, cur: daily[i]?.rev ?? null, prev: crPrevDailyArr[i]?.rev ?? null
  }))
  const cats = cr.categories || []
  const allSubCats = cr.subCategories || []
  const subCats = selectedCat ? allSubCats.filter(s => s.category === selectedCat) : allSubCats
  const maxCatRev = Math.max(...cats.map(c => c.rev), 1)
  const statusRows = cr.status || []
  const stateRows = cr.states || []
  const cityRows = cr.cities || []
  const maxCityRev = Math.max(...cityRows.map(c => c.rev), 1)
  const skuRows = cr.skus || []
  const catColors = ['#E11D48','#0D9E68','#2E74CC','#CC4078','#FF6B35','#534AB7','#CC8A00','#8B5CF6']

  const crChgBadge = (cur, prev) => { if (!prev) return null; const p = (cur - prev) / prev * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
        {/* Hero card */}
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
        {/* Right: 2 rows of 4 KPIs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, flex: 1 }}>
            {(() => { return (
              <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 13px' }}>
                <div className="kpi-label">Net (Exc GST)</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="kpi-value" style={{ fontSize: 17 }}>{fmt(excRev)}</div>
                  {crExcChg !== null && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: crExcChg >= 0 ? C.green.bg : C.red.bg, color: crExcChg >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{crExcChg >= 0 ? '▲' : '▼'} {Math.abs(crExcChg).toFixed(1)}%</span>}
                </div>
                <div className="kpi-sub">Before tax</div>
              </div>
            )})()}
            {[
              { label: 'Daily Avg Revenue', value: fmt(dailyAvg), sub: `over ${nDays} days`, badge: crChgBadge(dailyAvg, crPrevRev > 0 ? crPrevRev / nDays : 0) },
              { label: 'Orders', value: fmtN(orders), sub: `${fmtN(units)} units · ${skus} SKUs`, badge: crChgBadge(orders, crPrevOrders) },
              { label: 'AOV', value: `₹${Math.round(aov).toLocaleString('en-IN')}`, sub: 'Avg order value', badge: crChgBadge(aov, crPrevOrders > 0 ? crPrevRev / crPrevOrders : 0) },
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
              { label: 'Units Sold', value: fmtN(units), sub: `${skus} SKUs`, badge: crChgBadge(units, crPrevUnits) },
              { label: 'Cities', value: fmtN(cities), sub: 'Cities with orders', badge: crChgBadge(cities, crPrevCities) },
              { label: 'GST Collected', value: fmt(rev - excRev), sub: `${rev > 0 ? ((rev - excRev) / rev * 100).toFixed(1) : 0}% of gross`, badge: crChgBadge(rev - excRev, crPrevRev - crPrevExcRev) },
              { label: 'Net per Unit', value: units ? `₹${Math.round(excRev / units).toLocaleString('en-IN')}` : '—', sub: 'Exc. GST per unit', badge: crChgBadge(units > 0 ? excRev / units : 0, crPrevUnits > 0 ? crPrevExcRev / crPrevUnits : 0) },
            ].map(k => (
              <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
                <div className="kpi-label">{k.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}><div className="kpi-value" style={{ fontSize: 17 }}>{k.value}</div>{k.badge}</div>
                </div>
                {k.sub && <div className="kpi-sub">{k.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 14, alignItems: 'stretch' }}>
        <Card title="Daily Revenue & Orders">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={daily} margin={{ top: 4, right: 40, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="credRevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#E11D48" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#E11D48" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={d => d?.slice(5)} />
              <YAxis yAxisId="rev" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} width={42} />
              <YAxis yAxisId="orders" orientation="right" tick={{ fontSize: 10, fill: '#2E74CC' }} tickFormatter={v => fmtN(v)} width={30} />
              <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 11.5 }}>
                  <div style={{ color: C.t3, marginBottom: 4 }}>{label}</div>
                  {payload.map(p => <div key={p.name} style={{ color: p.color, fontWeight: 600 }}>{p.name}: {p.name === 'Revenue' ? fmt(p.value) : fmtN(p.value)}</div>)}
                </div>
              ) : null} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area yAxisId="rev" type="monotone" dataKey="rev" name="Revenue" stroke="#E11D48" strokeWidth={2} fill="url(#credRevGrad)" dot={false} />
              <Line yAxisId="orders" type="monotone" dataKey="units" name="Units" stroke="#2E74CC" strokeWidth={2} dot={{ r: 3, fill: '#2E74CC' }} activeDot={{ r: 5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
        <Card title="All States">
          <div style={{ overflowY: 'auto', maxHeight: 220 }}>
          {(() => { const maxRev = Math.max(...stateRows.map(s => s.rev), 1); return stateRows.map((s, i) => (
            <div key={s.state} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: catColors[i % catColors.length], flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, color: C.t2, flex: 1 }}>{s.state}</span>
              <div style={{ width: 70, height: 5, background: C.bg, borderRadius: 3, flexShrink: 0 }}>
                <div style={{ height: '100%', borderRadius: 3, background: catColors[i % catColors.length], width: `${(s.rev / maxRev) * 100}%` }} />
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: C.t1, minWidth: 40, textAlign: 'right' }}>{fmtN(s.orders)}</span>
              <span style={{ fontSize: 11, color: C.t3, minWidth: 65, textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(s.rev)}</span>
            </div>
          ))})()}
          </div>
        </Card>
      </div>

      <div className="g-2" style={{ alignItems: 'stretch' }}>
        <Card title="Category Revenue" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {[{ label: 'Category' }, { label: 'Revenue', align: 'right' }, { label: 'Exc GST', align: 'right' }, { label: 'Orders', align: 'right' }, { label: 'AOV', align: 'right' }].map(c => (
                    <th key={c.label} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t3, textAlign: c.align || 'left', padding: '3px 5px 7px', borderBottom: `1px solid ${C.border}` }}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cats.map((r, i) => {
                  const isSelected = selectedCat === r.category
                  const catAov = r.orders ? r.rev / r.orders : 0
                  return (
                    <tr key={r.category} onClick={() => setSelectedCat(isSelected ? null : r.category)} style={{ borderBottom: i < cats.length - 1 ? `1px solid ${C.border}` : 'none', background: isSelected ? C.acl : '', cursor: 'pointer' }} onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#FFFBE6' }} onMouseLeave={e => { e.currentTarget.style.background = isSelected ? C.acl : '' }}>
                      <td style={{ padding: '5.5px 5px', color: C.t2 }}>{isSelected ? <strong>{r.category}</strong> : r.category}</td>
                      <td style={{ padding: '5.5px 5px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11.5, color: C.t1 }}>{fmt(r.rev)}</td>
                      <td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>{fmt(r.excRev)}</td>
                      <td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>{fmtN(r.orders)}</td>
                      <td style={{ padding: '5.5px 5px', textAlign: 'right', color: C.t2 }}>₹{Math.round(catAov).toLocaleString('en-IN')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <PaginatedCard title={selectedCat ? `Sub-categories · ${selectedCat}` : 'Sub-categories'} rows={subCats.map(s => ({ name: s.subcategory, rev: s.rev, orders: s.orders, aov: s.orders ? s.rev / s.orders : 0 }))} columns={[{ key: 'name', label: 'Sub-category' }, { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) }, { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) }, { key: 'aov', label: 'AOV', align: 'right', render: v => `₹${Math.round(v).toLocaleString('en-IN')}` }]} pageSize={selectedCat ? subCats.length : cats.length} />
      </div>

      <div className="g-2">
        <Card title="SKU Performance">
          <div style={{ overflowY: 'auto', maxHeight: 400 }}>
            <DataTable
              columns={[
                { key: 'sku', label: 'SKU' },
                { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) },
                { key: 'units', label: 'Units', align: 'right', render: v => fmtN(v) },
                { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
              ]}
              rows={skuRows}
            />
          </div>
        </Card>
        <Card title="Top Cities">
          <div style={{ overflowY: 'auto', maxHeight: 400 }}>
            <DataTable
              columns={[
                { key: 'city', label: 'City' },
                { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) },
                { key: 'rev', label: 'Revenue', align: 'right', mono: true, render: v => fmt(v) },
              ]}
              rows={cityRows}
            />
          </div>
        </Card>
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
  const aov = nOrders ? rev / nOrders : 0
  const asp = qty ? excRev / qty : 0

  const prevRev = mn.prevRev || 0
  const prevExcRev = mn.prevExcRev || 0
  const prevOrders = mn.prevOrders || 0
  const revChg = prevRev > 0 ? ((rev - prevRev) / prevRev * 100) : null
  const excChg = prevExcRev > 0 ? ((excRev - prevExcRev) / prevExcRev * 100) : null
  const ordChg = prevOrders > 0 ? ((nOrders - prevOrders) / prevOrders * 100) : null

  const STATUS_LABEL = { C: 'Delivered', F: 'Fulfilled', SH: 'Shipped', RTO: 'RTO', PK: 'Packed', WP: 'WH Packed', L: 'Lost' }
  const STATUS_COLOR = { C: C.green.bd, RTO: C.red.bd, SH: C.blue.bd, F: C.green.bd, PK: C.amber.bd, WP: C.amber.bd, L: C.red.bd }

  const dailyArr = mn.daily || []
  const prevDaily = mn.prevDaily || []
  const [chartMetric, setChartMetric] = useState('exc_rev')

  const sparkData = Array.from({ length: Math.max(dailyArr.length, prevDaily.length) }, (_, i) => ({
    i, cur: dailyArr[i]?.excRev ?? null, prev: prevDaily[i]?.rev ?? null
  }))

  const chartData = dailyArr.map(d => ({
    date: d.date,
    current: chartMetric === 'exc_rev' ? d.excRev : chartMetric === 'rev' ? d.rev : chartMetric === 'units' ? d.units : d.orders
  }))

  const catColors = ['#E87858','#0D9E68','#2E74CC','#CC4078','#FF6B35','#534AB7','#CC8A00','#8B5CF6']
  const maxCatRev = Math.max(...(mn.categories || []).map(c => c.rev), 1)
  const maxStateRev = Math.max(...(mn.states || []).map(s => s.rev), 1)
  const statusTotal = (mn.status || []).reduce((s, x) => s + x.orders, 0)

  const toggleBtn = (active) => ({ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: `1.5px solid ${active ? C.t1 : C.border}`, background: active ? C.t1 : 'transparent', color: active ? '#fff' : C.t2, cursor: 'pointer', fontFamily: 'var(--font)' })

  const mnChgBadge = (cur, prev) => { if (!prev) return null; const p = (cur - prev) / prev * 100; return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: p >= 0 ? C.green.bg : C.red.bg, color: p >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span> }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* KPI Hero + 2×4 grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 5fr', gap: 10, alignItems: 'stretch' }}>
        {/* Hero card */}
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
        {/* Right: 2 rows of 4 KPIs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, flex: 1 }}>
            {(() => { return (
              <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 13px' }}>
                <div className="kpi-label">Net (Exc. GST)</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="kpi-value" style={{ fontSize: 17 }}>{fmt(excRev)}</div>
                  {excChg !== null && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: excChg >= 0 ? C.green.bg : C.red.bg, color: excChg >= 0 ? C.green.tx : C.red.tx, flexShrink: 0 }}>{excChg >= 0 ? '▲' : '▼'} {Math.abs(excChg).toFixed(1)}%</span>}
                </div>
                <div className="kpi-sub">GST: {fmt(rev - excRev)}</div>
              </div>
            )})()}
            {[
              { label: 'Orders', value: fmtN(nOrders), sub: ordChg != null ? `${ordChg >= 0 ? '▲' : '▼'} ${Math.abs(ordChg).toFixed(1)}% vs prev` : '—', badge: mnChgBadge(nOrders, prevOrders) },
              { label: 'Daily Avg Revenue', value: fmt(excRev / nDays), sub: 'Net per day', badge: mnChgBadge(excRev / nDays, prevExcRev > 0 ? prevExcRev / nDays : 0) },
              { label: 'AOV', value: `₹${Math.round(aov).toLocaleString('en-IN')}`, sub: 'Avg order value', badge: mnChgBadge(aov, prevOrders > 0 ? prevRev / prevOrders : 0) },
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
              { label: 'Units Sold', value: fmtN(qty), sub: `ASP ₹${Math.round(asp).toLocaleString('en-IN')}` },
              { label: 'GST Collected', value: fmt(rev - excRev), sub: rev > 0 ? `${((rev - excRev) / rev * 100).toFixed(1)}% of gross` : '—' },
              { label: 'Unique SKUs', value: fmtN(totals.skus), sub: 'Active SKUs' },
              { label: 'Cities', value: fmtN(totals.cities), sub: 'Cities covered' },
            ].map(k => (
              <div key={k.label} className="kpi-card" style={{ padding: '10px 13px' }}>
                <div className="kpi-label">{k.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}><div className="kpi-value" style={{ fontSize: 17 }}>{k.value}</div>{k.badge}</div>
                </div>
                {k.sub && <div className="kpi-sub">{k.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Daily chart + Order Status */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 14, alignItems: 'stretch' }}>
        <Card title="Daily Trend"
          action={<div style={{ display: 'flex', gap: 4 }}>
            {[{ v: 'exc_rev', label: 'Net Rev' }, { v: 'rev', label: 'Gross Rev' }, { v: 'units', label: 'Units' }, { v: 'orders', label: 'Orders' }].map(opt => (
              <button key={opt.v} onClick={() => setChartMetric(opt.v)} style={toggleBtn(chartMetric === opt.v)}>{opt.label}</button>
            ))}
          </div>}>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="mnTrendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#E87858" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#E87858" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={d => d?.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: C.t3 }} tickFormatter={v => chartMetric === 'orders' || chartMetric === 'units' ? fmtN(v) : fmt(v)} width={60} />
              <Tooltip content={<ChartTooltip formatter={chartMetric === 'orders' || chartMetric === 'units' ? fmtN : undefined} />} />
              <Area type="monotone" dataKey="current" name={chartMetric === 'exc_rev' ? 'Net Revenue' : chartMetric === 'rev' ? 'Gross Revenue' : chartMetric === 'units' ? 'Units' : 'Orders'} stroke="#E87858" fill="url(#mnTrendGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Order Status">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(mn.status || []).map((s, i) => {
              const pct = statusTotal ? (s.orders / statusTotal * 100) : 0
              return (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 12, color: C.t2 }}>{STATUS_LABEL[s.status] || s.status}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.t1 }}>{fmtN(s.orders)} <span style={{ color: C.t3, fontWeight: 400 }}>({pct.toFixed(1)}%)</span></span>
                  </div>
                  <div style={{ height: 6, background: C.bg, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: STATUS_COLOR[s.status] || C.acm, borderRadius: 3 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Categories + SKUs */}
      <div className="g-2" style={{ alignItems: 'stretch' }}>
        <Card title="Revenue by Category">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {(mn.categories || []).map((c, i) => {
              const pct = (c.rev / maxCatRev * 100).toFixed(1)
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ minWidth: 130, fontSize: 12, color: C.t2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.category}</span>
                  <div style={{ flex: 1, height: 8, background: C.bg, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: catColors[i % catColors.length], borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.t1, minWidth: 60, textAlign: 'right' }}>{fmt(c.rev)}</span>
                  <span style={{ fontSize: 11, color: C.t3, minWidth: 30, textAlign: 'right' }}>{fmtN(c.orders)}</span>
                </div>
              )
            })}
          </div>
        </Card>

        <Card title="Top States">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {(mn.states || []).slice(0, 15).map((s, i) => {
              const pct = (s.rev / maxStateRev * 100).toFixed(1)
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ minWidth: 120, fontSize: 12, color: C.t2 }}>{s.state ? s.state.charAt(0) + s.state.slice(1).toLowerCase() : '—'}</span>
                  <div style={{ flex: 1, height: 7, background: C.bg, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: '#E87858', borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, minWidth: 55, textAlign: 'right' }}>{fmt(s.rev)}</span>
                  <span style={{ fontSize: 11, color: C.t3, minWidth: 36, textAlign: 'right' }}>{fmtN(s.orders)}</span>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* SKU table */}
      <PaginatedCard title="Top SKUs" rows={mn.skus || []} columns={[
        { key: 'sku', label: 'SKU' },
        { key: 'category', label: 'Category' },
        { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) },
        { key: 'units', label: 'Units', align: 'right', render: v => fmtN(v) },
        { key: 'rev', label: 'Gross Rev', align: 'right', mono: true, render: v => fmt(v) },
        { key: 'excRev', label: 'Net Rev', align: 'right', mono: true, render: v => fmt(v) },
        { key: 'aov', label: 'AOV', align: 'right', render: (_, r) => `₹${r.orders ? Math.round(r.rev / r.orders).toLocaleString('en-IN') : 0}` },
      ]} pageSize={15} />

      {/* Cities */}
      <PaginatedCard title="Top Cities" rows={mn.cities || []} columns={[
        { key: 'city', label: 'City' },
        { key: 'region', label: 'Region', render: v => v || '—' },
        { key: 'cityTier', label: 'Tier', render: v => v ? `Tier ${v}` : '—' },
        { key: 'orders', label: 'Orders', align: 'right', render: v => fmtN(v) },
        { key: 'rev', label: 'Gross Rev', align: 'right', mono: true, render: v => fmt(v) },
        { key: 'aov', label: 'AOV', align: 'right', render: (_, r) => `₹${r.orders ? Math.round(r.rev / r.orders).toLocaleString('en-IN') : 0}` },
      ]} pageSize={15} />
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
  const stateOpts = useMemo(() => Object.keys(data?.stateMap || {}).filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).sort(), [data])
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
        {activeTab === 'instamart' && <ChannelTab data={filteredData} channel="Instamart" />}
        {activeTab === 'zepto' && <ChannelTab data={filteredData} channel="Zepto" />}
        {activeTab === 'myntra' && <ChannelTab data={filteredData} channel="Myntra" />}
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
const TAB_TO_CHANNEL = { blinkit: 'Blinkit', instamart: 'Instamart', zepto: 'Zepto', cred: 'CRED' }

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
      const { start, end, category, subCategory, sku, subChannel, voucher, region, tier, state, city } = filtersRef.current
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
      fetchData(start, end, extra)
    }, 600)
    return () => clearTimeout(debounceRef.current)
  }, [filters.start, filters.end, filters.category, filters.subCategory, filters.sku, filters.subChannel, filters.voucher, filters.region, filters.tier, filters.state, filters.city, fetchData])

  const data = useMemo(() => { if (!rawRows) return null; if (rawRows.source === 'postgres-aggregated' || rawRows.totalRev !== undefined) return rawRows; return processData(rawRows) }, [rawRows])
  const alerts = useMemo(() => data ? detectAlerts(data) : [], [data])


  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={setPage} />
      <div className="app-main">
        <Topnav page={page} alerts={alerts} onRefresh={() => { const { start, end, category, subCategory, sku, subChannel, voucher, region, tier, state, city } = filters; const e = {}; if (category?.length) e.category = category.join(','); if (subCategory?.length) e.subCategory = subCategory.join(','); if (sku?.length) e.sku = sku.join(','); if (subChannel) e.subChannel = subChannel; if (voucher) e.voucher = voucher; if (region?.length) e.region = region.join(','); if (tier?.length) e.tier = tier.join(','); if (state?.length) e.state = state.join(','); if (city) e.city = city; fetchData(start, end, e) }} loading={loading} filters={filters} setFilters={setFilters} rawRows={rawRows} />
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
