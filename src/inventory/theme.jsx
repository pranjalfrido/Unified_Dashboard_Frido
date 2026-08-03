// Shared theme tokens + helpers for the Inventory & Sales pages — matches the light theme
// used by the rest of the app shell (Logistics/Sales/Overview, see utils.js's `C`).
import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

export const IC = {
  page: '#F2F1EF',
  surface: '#fff',
  surfaceHi: '#fff',
  border: '#E4E4E7',
  border2: '#C7C7CE',
  // Subtle hover fill for slicer/toggle controls — a touch darker than `surface` (white) so
  // hovering a dropdown or tile gives visible feedback without looking like an active/
  // selected state (that's still accDim/accBorder).
  hoverBg: '#F5F5F6',
  t1: '#1F1F23',
  t2: '#5B5B62',
  t3: '#8B8B92',
  acc: '#FFD600',
  accDim: '#FFF9CC',
  accBorder: '#E6C200',
  // Positive/negative delta color — separate from `acc` (the yellow brand accent used for
  // active-toggle highlighting) since yellow doesn't read as "good" the way the app shell's
  // green/red delta badges do (see App.jsx's HeroKPICard `chg` badge).
  positive: '#286010',
  negative: '#7A1A1A',
  status: {
    'Critical':       { c: '#d03b3b', label: 'Critical' },
    'Low':            { c: '#c98500', label: 'Low' },
    'Sufficient':     { c: '#199e70', label: 'Sufficient' },
    'Excess':         { c: '#3987e5', label: 'Excess' },
    'Dead / No Sale': { c: '#4a5a52', label: 'Dead / No Sale' },
    'No Demand':      { c: '#9085e9', label: 'No Demand' },
    'Out of Stock':   { c: '#6f7d75', label: 'Out of Stock' },
  },
  // Fixed categorical order (never cycled) — from the dataviz skill's validated set.
  categorical: ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767', '#d55181', '#d95926'],
}

export const PAGE_BACKGROUND = '#F2F1EF'

// ── Laptop-width scaling ──────────────────────────────────────────────────────
// The Inventory tab was built and tuned against a large desktop monitor. On a laptop screen
// (1366-1440px-class, common corporate laptop resolutions) the request is specifically for
// the WHOLE tab — every box, font, heading, the sidebar, everything — to shrink together in
// exact proportion, the same way remote-desktop's own screen scaling or a browser zoom-out
// looks: nothing reflows or resizes independently, the entire page is just uniformly
// smaller. CSS `zoom` on one top-level wrapper does exactly this in one step (unlike
// `transform: scale`, it doesn't require manual overflow/dimension compensation and doesn't
// break `position: fixed` descendants like the sidebar) — far more reliable than manually
// multiplying hundreds of individual pixel values across every component, which risks
// missing spots and drifting out of proportion with each other.
const ZOOM_BREAKPOINTS = [
  { minWidth: 1600, zoom: 1 },
  { minWidth: 1440, zoom: 0.9 },
  { minWidth: 1280, zoom: 0.8 },
  { minWidth: 0, zoom: 0.72 },
]
function zoomForWidth(width) {
  for (const bp of ZOOM_BREAKPOINTS) if (width >= bp.minWidth) return bp.zoom
  return 1
}

// Hook: returns the current zoom factor, updating on window resize. Used once at the top of
// the Inventory tab (InventoryPage.jsx) to set `zoom` on the whole page's outer container.
export function useUIScale() {
  const [zoom, setZoomState] = useState(() => (typeof window === 'undefined' ? 1 : zoomForWidth(window.innerWidth)))
  useEffect(() => {
    const onResize = () => setZoomState(zoomForWidth(window.innerWidth))
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return zoom
}

export function fmtNum(n) {
  if (n == null || Number.isNaN(n) || n === 0) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e7) return sign + (abs / 1e7).toFixed(2) + 'Cr'
  if (abs >= 1e5) return sign + (abs / 1e5).toFixed(2) + 'L'
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + 'K'
  return Math.round(n).toLocaleString('en-IN')
}

// Full comma-separated number, no K/L/Cr abbreviation — used inside tables where
// exact counts matter (e.g. 2,356 instead of 2.3K). Zero renders as '—' (a dash reads as
// "nothing here" faster than scanning a "0" among real quantities in a dense table).
export function fmtInt(n) {
  if (n == null || Number.isNaN(n) || n === 0) return '—'
  return Math.round(n).toLocaleString('en-IN')
}

// Day-count formatter (DOI etc.) — comma-separates large values like fmtInt, but does NOT
// collapse 0 to '—': "0 days of inventory" is a real, meaningful (and urgent) reading, unlike
// a quantity of 0 which reads as "nothing here."
export function fmtDays(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return Math.round(n).toLocaleString('en-IN')
}

export function fmtCurrency(n) {
  if (n == null || Number.isNaN(n) || n === 0) return '—'
  return '₹' + fmtNum(n)
}

export function getDefaultDates() {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 6)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

// ── Shared building blocks ─────────────────────────────────────────────────
export function GlassCard({ title, note, action, children, style }) {
  return (
    <div style={{
      background: IC.surface,
      border: `1px solid ${IC.border}`,
      borderRadius: 16,
      padding: '18px 20px',
      boxShadow: '0 4px 10px rgba(0,0,0,0.08), 0 16px 40px rgba(0,0,0,0.14)',
      // A wide table/chart inside can otherwise grow this card past its allotted flex
      // width instead of respecting it — the card's own overflow:auto wrapper around such
      // content only actually clips/scrolls if THIS box is itself constrained; without
      // minWidth:0 here, a flex/grid parent lets this card size to its content instead of
      // shrinking to fit, and the resulting overflow pushes the whole page wider than the
      // viewport (visible as the entire window gaining horizontal scroll).
      minWidth: 0,
      ...style,
    }}>
      {(title || note || action) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            {title && <span style={{ fontSize: 13.5, fontWeight: 600, color: IC.t1, letterSpacing: '-.01em' }}>{title}</span>}
            {note && <span style={{ fontSize: 11.5, color: IC.t3 }}>{note}</span>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

export function KpiTile({ label, value, unit, sub, accent, icon, compact }) {
  const pad = compact ? '10px 12px' : '12px 16px'
  const labelSize = compact ? 9.5 : 10.5
  const valueSize = compact ? 20 : 24
  const unitSize = compact ? 11 : 12
  const iconSize = compact ? 24 : 26
  const radius = compact ? 12 : 16
  return (
    <div style={{
      background: IC.surface,
      border: `1px solid ${IC.border}`,
      borderRadius: radius,
      padding: pad,
      display: 'flex', flexDirection: 'column', gap: 5,
      position: 'relative', overflow: 'hidden',
      minHeight: compact ? 78 : undefined,
      height: compact ? '100%' : undefined,
      boxShadow: '0 4px 10px rgba(0,0,0,0.08), 0 16px 40px rgba(0,0,0,0.14)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: labelSize, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: IC.t3, lineHeight: 1.2 }}>{label}</span>
        {icon && (
          typeof icon === 'string' && icon.startsWith('/')
            ? <img src={icon} alt="" style={{ width: iconSize, height: iconSize, objectFit: 'contain', flexShrink: 0, mixBlendMode: 'multiply' }} />
            : <span style={{
                width: iconSize, height: iconSize, borderRadius: compact ? 6 : 8, background: IC.accDim, border: `1px solid ${IC.accBorder}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: compact ? 11 : 13, color: IC.acc, flexShrink: 0,
              }}>{icon}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flex: 1 }}>
        <span style={{ fontSize: valueSize, fontWeight: 700, letterSpacing: '-.02em', color: accent || IC.t1, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{value}</span>
        {unit && <span style={{ fontSize: unitSize, color: IC.t3 }}>{unit}</span>}
      </div>
      {sub && <span style={{ fontSize: compact ? 10.5 : 11.5, color: IC.t3 }}>{sub}</span>}
    </div>
  )
}

export function StatusChip({ status }) {
  const s = IC.status[status] || { c: IC.t3, label: status }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999,
      background: `${s.c}22`, border: `1px solid ${s.c}55`, fontSize: 11, fontWeight: 600, color: s.c, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.c }} />
      {s.label}
    </span>
  )
}

export function DoiBar({ doi, reorderPoint }) {
  if (doi == null) return <span style={{ fontSize: 12, color: IC.t3 }}>—</span>
  const capped = Math.min(doi, 60)
  const pct = (capped / 60) * 100
  const color = doi <= 2 ? IC.status.Critical.c : doi <= 15 ? IC.status.Low.c : doi <= 45 ? IC.status.Sufficient.c : IC.status.Excess.c
  const reorderPct = reorderPoint != null ? Math.min(100, (reorderPoint / 60) * 100) : null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 110 }}>
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(0,0,0,0.08)', overflow: 'hidden', position: 'relative' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
        {reorderPct != null && (
          <div title={`Reorder point: ${reorderPoint}d`} style={{ position: 'absolute', left: `${reorderPct}%`, top: -1, bottom: -1, width: 2, background: 'rgba(0,0,0,0.4)' }} />
        )}
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: IC.t1, fontVariantNumeric: 'tabular-nums', minWidth: 26, textAlign: 'right' }}>{doi}d</span>
    </div>
  )
}

export function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: IC.surfaceHi, border: `1px solid ${IC.border2}`, borderRadius: 10, padding: '8px 12px', fontSize: 11.5 }}>
      <div style={{ fontWeight: 700, color: IC.t1, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, color: IC.t2 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color || p.fill }} />
          <span>{p.name}</span>
          <span style={{ marginLeft: 'auto', fontWeight: 700, color: IC.t1, fontVariantNumeric: 'tabular-nums' }}>{fmtNum(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ── CSV export ──────────────────────────────────────────────────────────────
export function exportCsv(filename, columns, rows) {
  const escape = v => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = columns.map(c => escape(c.label)).join(',')
  const body = rows.map(r => columns.map(c => escape(c.get ? c.get(r) : r[c.key])).join(',')).join('\n')
  const blob = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function ExportButton({ filename, columns, rows }) {
  return (
    <button onClick={() => exportCsv(filename, columns, rows)}
      style={{ fontSize: 11, color: IC.t2, background: IC.surface, border: `1px solid ${IC.border2}`, borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>
      ⭳ Export CSV
    </button>
  )
}

// ── Simple single-select dropdown filter (kept for the Sales & Allocation page) ──
export function MultiSelectFilter({ label, options, selected, onChange }) {
  return (
    <select
      multiple={false}
      value={selected[0] || ''}
      onChange={e => onChange(e.target.value ? [e.target.value] : [])}
      style={{
        background: IC.surface, border: `1px solid ${IC.border2}`, borderRadius: 8, padding: '6px 10px',
        color: selected.length ? IC.t1 : IC.t3, fontSize: 12, minWidth: 130, cursor: 'pointer',
      }}>
      <option value="">{label}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

// ── Searchable multi-select dropdown (checkbox list + search box) ────────────
// Selections are staged in a local draft and only committed to the parent on
// "Apply" — Clear resets the draft to empty (also applied immediately, matching
// how a clear action is expected to take effect right away).
export function SearchableMultiSelect({ label, options, selected, onChange, getKey, getLabel, width = 170, height = 34 }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState(selected)
  const [pos, setPos] = useState(null)
  const ref = useRef(null)
  const btnRef = useRef(null)
  const key = getKey || (o => o)
  const disp = getLabel || (o => o)
  const panelWidth = Math.max(width, 220)
  const PANEL_MAX_HEIGHT = 360

  useEffect(() => {
    if (!open) return
    const onDocClick = e => {
      if (btnRef.current?.contains(e.target)) return
      if (e.target.closest('[data-smsel-panel]')) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  // Position the portalled panel against the trigger button — flips above the
  // button when there isn't enough room below (common inside the fixed-height sidebar).
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < PANEL_MAX_HEIGHT && rect.top > spaceBelow
    setPos({
      left: Math.min(rect.left, window.innerWidth - panelWidth - 8),
      top: openUp ? undefined : rect.bottom + 4,
      bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
      maxHeight: openUp ? Math.min(PANEL_MAX_HEIGHT, rect.top - 12) : Math.min(PANEL_MAX_HEIGHT, spaceBelow - 12),
    })
  }, [open, panelWidth])

  const openMenu = () => { setDraft(selected); setQuery(''); setOpen(true) }
  const closeMenu = () => setOpen(false)

  const filtered = query.trim()
    ? options.filter(o => disp(o).toLowerCase().includes(query.trim().toLowerCase()))
    : options

  const toggle = (k) => {
    setDraft(prev => prev.includes(k) ? prev.filter(s => s !== k) : [...prev, k])
  }
  const allFilteredKeys = filtered.map(key)
  const allFilteredSelected = allFilteredKeys.length > 0 && allFilteredKeys.every(k => draft.includes(k))
  const toggleSelectAll = () => {
    setDraft(prev => allFilteredSelected ? prev.filter(k => !allFilteredKeys.includes(k)) : [...new Set([...prev, ...allFilteredKeys])])
  }
  const apply = () => { onChange(draft); closeMenu() }
  const clear = () => { setDraft([]); onChange([]) }

  const panel = open && pos && createPortal(
    <div data-smsel-panel ref={ref} style={{
      position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, zIndex: 400, width: panelWidth,
      background: IC.surfaceHi, border: `1px solid ${IC.border2}`, borderRadius: 10, boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
      display: 'flex', flexDirection: 'column', maxHeight: pos.maxHeight,
    }}>
      <div style={{ padding: 8, borderBottom: `1px solid ${IC.border}` }}>
        <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`}
          style={{ width: '100%', background: IC.page, border: `1px solid ${IC.border2}`, borderRadius: 6, padding: '5px 8px', color: IC.t1, fontSize: 11.5, boxSizing: 'border-box' }} />
      </div>
      {filtered.length > 0 && (
        <div onClick={toggleSelectAll}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: IC.t2, borderBottom: `1px solid ${IC.border}` }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <span style={{
            width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${allFilteredSelected ? IC.acc : IC.border2}`,
            background: allFilteredSelected ? IC.acc : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: IC.page,
          }}>{allFilteredSelected ? '✓' : ''}</span>
          Select all{query.trim() ? ' (filtered)' : ''}
        </div>
      )}
      <div style={{ overflowY: 'auto', flex: 1, padding: 4 }}>
        {filtered.length === 0 && <div style={{ padding: '8px 10px', fontSize: 11.5, color: IC.t3 }}>No matches</div>}
        {filtered.map(o => {
          const k = key(o)
          const isSel = draft.includes(k)
          return (
            <div key={k} onClick={() => toggle(k)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: isSel ? IC.t1 : IC.t2 }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{
                width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${isSel ? IC.acc : IC.border2}`,
                background: isSel ? IC.acc : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: IC.page,
              }}>{isSel ? '✓' : ''}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{disp(o)}</span>
            </div>
          )
        })}
      </div>
      <div style={{ borderTop: `1px solid ${IC.border}`, padding: 8, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <button onClick={clear} disabled={draft.length === 0 && selected.length === 0}
          style={{ fontSize: 11, color: IC.t3, background: 'none', border: `1px solid ${IC.border2}`, borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}>
          Clear
        </button>
        <button onClick={apply}
          style={{ fontSize: 11, fontWeight: 700, color: IC.t1, background: IC.accDim, border: `1px solid ${IC.accBorder}`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>
          Apply{draft.length > 0 ? ` (${draft.length})` : ''}
        </button>
      </div>
    </div>,
    document.body
  )

  // Selecting every available option is functionally identical to selecting none (no
  // filtering actually happens either way) — so it should look like the default,
  // unfiltered state too, rather than showing "N selected" and forcing the user to hit
  // Clear just to get back to a slicer that LOOKS unfiltered.
  const isAllSelected = options.length > 0 && selected.length === options.length
  const isFiltered = selected.length > 0 && !isAllSelected

  return (
    <div style={{ position: 'relative', width, flexShrink: 0 }}>
      <button ref={btnRef} onClick={() => open ? closeMenu() : openMenu()}
        onMouseEnter={e => e.currentTarget.style.background = IC.hoverBg}
        onMouseLeave={e => e.currentTarget.style.background = IC.surface}
        style={{
          width: '100%', height, boxSizing: 'border-box', textAlign: 'left', background: IC.surface, border: `1px solid ${isFiltered ? IC.accBorder : IC.border2}`,
          borderRadius: 8, padding: '0 10px', color: isFiltered ? IC.t1 : IC.t3, fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, transition: 'background .12s',
        }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {!isFiltered ? label
            : selected.length === 1 ? (() => {
              const match = options.find(o => key(o) === selected[0])
              return match ? disp(match) : label
            })()
            : `${label} · ${selected.length} selected`}
        </span>
        <span style={{ color: IC.t3, fontSize: 10, flexShrink: 0 }}>▾</span>
      </button>
      {panel}
    </div>
  )
}

// ── Sort header cell: click to sort asc/desc, drag right edge to resize ───────
export function SortableTh({ label, sortKey, sortState, onSort, width, onResize, align = 'right' }) {
  const dragRef = useRef(null)
  const active = sortState?.key === sortKey
  const arrow = active ? (sortState.dir === 'asc' ? ' ▲' : ' ▼') : ''

  const startResize = e => {
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const startWidth = width
    const onMove = ev => onResize(Math.max(50, startWidth + (ev.clientX - startX)))
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <th
      onClick={() => onSort && onSort(sortKey)}
      style={{
        textAlign: align, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em',
        color: active ? IC.t1 : IC.t3, padding: '6px 10px', borderBottom: `1px solid ${IC.border2}`,
        whiteSpace: 'nowrap', width, minWidth: 50, boxSizing: 'border-box', position: 'relative',
        cursor: onSort ? 'pointer' : 'default', userSelect: 'none', background: IC.surfaceHi,
      }}>
      {label}{arrow}
      {onResize && (
        <span ref={dragRef} onMouseDown={startResize}
          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize' }} />
      )}
    </th>
  )
}

// ── Draggable + sortable + resizable header cell — drag to reorder columns ────
// (reordering only makes sense within a same-group column set; callers enforce that
// by only allowing a drop when dragged.group === target.group).
// Column width IS its hide state, matching Excel's own model: dragging the resize handle
// past a small threshold (rather than clamping at some minimum) sets width to 0, which
// hides the column entirely; what remains is a thin colored "seam" in its place (like
// Excel's double-line marker between two adjacent headers) that's still draggable to pull
// the column back open. `onHide`/`MIN_VISIBLE_WIDTH` let a caller tune where the snap-to-zero
// threshold sits; default is generous enough that a normal resize doesn't accidentally hide.
const MIN_VISIBLE_WIDTH = 40
const HIDE_SNAP_THRESHOLD = 20
export function DraggableTh({ label, sortKey, sortState, onSort, width, onResize, align = 'right', group, onReorder, dragState, setDragState }) {
  const active = sortState?.key === sortKey
  const arrow = active ? (sortState.dir === 'asc' ? ' ▲' : ' ▼') : ''
  const isDragging = dragState?.key === sortKey
  const isDropTarget = dragState && dragState.key !== sortKey && dragState.group === group
  const isHidden = width === 0

  const startResize = e => {
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const startWidth = isHidden ? 0 : width
    const onMove = ev => {
      const raw = startWidth + (ev.clientX - startX)
      onResize(raw < HIDE_SNAP_THRESHOLD ? 0 : Math.max(MIN_VISIBLE_WIDTH, raw))
    }
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // Hidden column renders as a thin grabbable seam instead of a normal header — no label,
  // no sort/drag-to-reorder (there's nothing meaningful to reorder when it has no width),
  // just the resize handle so dragging it rightward restores the column.
  if (isHidden) {
    return (
      <th title="Drag to restore this column" style={{ width: 0, minWidth: 0, padding: 0, position: 'relative', borderBottom: `1px solid ${IC.border2}`, background: IC.surfaceHi }}>
        <span onMouseDown={startResize}
          style={{ position: 'absolute', left: -3, top: 0, bottom: 0, width: 6, cursor: 'col-resize', background: IC.accBorder }} />
      </th>
    )
  }

  return (
    <th
      draggable
      onDragStart={e => { e.stopPropagation(); setDragState({ key: sortKey, group }) }}
      onDragEnd={() => setDragState(null)}
      onDragOver={e => { if (isDropTarget) e.preventDefault() }}
      onDrop={e => {
        e.preventDefault()
        if (dragState && dragState.group === group && dragState.key !== sortKey) onReorder(dragState.key, sortKey)
        setDragState(null)
      }}
      onClick={() => onSort && onSort(sortKey)}
      title="Drag to reorder · click to sort · drag right edge to resize (drag to 0 to hide)"
      style={{
        textAlign: align, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em',
        color: active ? IC.t1 : IC.t3, padding: '6px 10px', borderBottom: `1px solid ${IC.border2}`,
        whiteSpace: 'nowrap', width, minWidth: MIN_VISIBLE_WIDTH, boxSizing: 'border-box', position: 'relative',
        cursor: 'grab', userSelect: 'none', background: isDropTarget ? 'rgba(52,211,153,0.10)' : IC.surfaceHi,
        opacity: isDragging ? 0.4 : 1,
        outline: isDropTarget ? `1px dashed ${IC.accBorder}` : 'none',
      }}>
      {label}{arrow}
      {onResize && (
        <span onMouseDown={startResize}
          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize' }} />
      )}
    </th>
  )
}

// ── Clickable multi-select tile row (for Location / Stock Status) ────────────
export function TileMultiSelect({ items, selected, onToggle, renderTile }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
      {items.map(item => {
        const isSel = selected.includes(item.key)
        return (
          <div key={item.key} onClick={() => onToggle(item.key)}
            style={{
              cursor: 'pointer', borderRadius: 12, padding: '10px 12px',
              background: isSel ? IC.accDim : IC.surface,
              border: `1.5px solid ${isSel ? IC.accBorder : IC.border}`,
              transition: 'border-color .12s, background .12s',
            }}>
            {renderTile(item, isSel)}
          </div>
        )
      })}
    </div>
  )
}

function toISO(d) { return d.toISOString().slice(0, 10) }
export const DATE_PRESETS = [
  { label: 'Today', get: () => { const d = new Date(); return { start: toISO(d), end: toISO(d) } } },
  { label: 'WTD', get: () => { const e = new Date(); const s = new Date(e); const day = (s.getDay() + 6) % 7; s.setDate(s.getDate() - day); return { start: toISO(s), end: toISO(e) } } },
  { label: 'Last 7d', get: () => { const e = new Date(); const s = new Date(e); s.setDate(s.getDate() - 6); return { start: toISO(s), end: toISO(e) } } },
  { label: 'Last 30d', get: () => { const e = new Date(); const s = new Date(e); s.setDate(s.getDate() - 29); return { start: toISO(s), end: toISO(e) } } },
  { label: 'Last 90d', get: () => { const e = new Date(); const s = new Date(e); s.setDate(s.getDate() - 89); return { start: toISO(s), end: toISO(e) } } },
  { label: 'MTD', get: () => { const e = new Date(); const s = new Date(e.getFullYear(), e.getMonth(), 1); return { start: toISO(s), end: toISO(e) } } },
]

export function DatePresetPicker({ setFilters }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {DATE_PRESETS.map(p => (
        <button key={p.label} onClick={() => setFilters(f => ({ ...f, ...p.get() }))}
          style={{ fontSize: 11, color: IC.t2, background: IC.surface, border: `1px solid ${IC.border}`, borderRadius: 7, padding: '5px 9px', cursor: 'pointer' }}>
          {p.label}
        </button>
      ))}
    </div>
  )
}

export function DateRangeControl({ filters, setFilters, onRefresh }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <DatePresetPicker setFilters={setFilters} />
      <input type="date" value={filters.start} onChange={e => setFilters(f => ({ ...f, start: e.target.value }))}
        style={{ background: IC.surface, border: `1px solid ${IC.border2}`, borderRadius: 8, padding: '6px 10px', color: IC.t1, fontSize: 12, colorScheme: 'light' }} />
      <span style={{ color: IC.t3, fontSize: 12 }}>→</span>
      <input type="date" value={filters.end} onChange={e => setFilters(f => ({ ...f, end: e.target.value }))}
        style={{ background: IC.surface, border: `1px solid ${IC.border2}`, borderRadius: 8, padding: '6px 10px', color: IC.t1, fontSize: 12, colorScheme: 'light' }} />
      <button onClick={onRefresh}
        style={{ background: IC.acc, border: `1px solid ${IC.acc}`, borderRadius: 8, padding: '6px 14px', color: IC.t1, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
        Refresh
      </button>
    </div>
  )
}

