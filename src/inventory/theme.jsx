// Shared dark/green theme tokens + helpers for the Inventory & Sales pages.
import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

export const IC = {
  page: '#0a0f0c',
  surface: '#101712',
  surfaceHi: '#141d17',
  border: 'rgba(255,255,255,0.08)',
  border2: 'rgba(255,255,255,0.14)',
  t1: '#dde3df',
  t2: '#a4afa9',
  t3: '#71807a',
  acc: '#34d399',
  accDim: 'rgba(52,211,153,0.14)',
  accBorder: 'rgba(52,211,153,0.35)',
  status: {
    'Critical':       { c: '#d03b3b', label: 'Critical' },
    'Low':            { c: '#c98500', label: 'Low' },
    'Sufficient':     { c: '#199e70', label: 'Sufficient' },
    'Excess':         { c: '#3987e5', label: 'Excess' },
    'Dead / No Sale': { c: '#4a5a52', label: 'Dead / No Sale' },
    'No Demand':      { c: '#9085e9', label: 'No Demand' },
    'Out of Stock':   { c: '#6f7d75', label: 'Out of Stock' },
  },
  // Fixed categorical order (never cycled) — from the dataviz skill's validated dark set.
  categorical: ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767', '#d55181', '#d95926'],
}

export const PAGE_BACKGROUND = `
  linear-gradient(135deg, #0d1f16 0%, #0a0f0c 45%, #060907 100%)
`

export function fmtNum(n) {
  if (n == null || Number.isNaN(n)) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e7) return sign + (abs / 1e7).toFixed(2) + 'Cr'
  if (abs >= 1e5) return sign + (abs / 1e5).toFixed(2) + 'L'
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + 'K'
  return Math.round(n).toLocaleString('en-IN')
}

// Full comma-separated number, no K/L/Cr abbreviation — used inside tables where
// exact counts matter (e.g. 2,356 instead of 2.3K).
export function fmtInt(n) {
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
      background: `linear-gradient(180deg, ${IC.surfaceHi} 0%, ${IC.surface} 100%)`,
      border: `1px solid ${IC.border}`,
      borderRadius: 16,
      padding: '18px 20px',
      boxShadow: '0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px rgba(0,0,0,0.25)',
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
  const pad = compact ? '10px 12px' : '16px 18px'
  const labelSize = compact ? 9.5 : 10.5
  const valueSize = compact ? 20 : 26
  const unitSize = compact ? 11 : 12
  const iconSize = compact ? 22 : 26
  const radius = compact ? 12 : 16
  return (
    <div style={{
      background: `linear-gradient(180deg, ${IC.surfaceHi} 0%, ${IC.surface} 100%)`,
      border: `1px solid ${IC.border}`,
      borderRadius: radius,
      padding: pad,
      display: 'flex', flexDirection: 'column', gap: compact ? 5 : 8,
      position: 'relative', overflow: 'hidden',
      minHeight: compact ? 78 : undefined,
      height: compact ? '100%' : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: labelSize, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: IC.t3, lineHeight: 1.2 }}>{label}</span>
        {icon && (
          <span style={{
            width: iconSize, height: iconSize, borderRadius: compact ? 6 : 8, background: IC.accDim, border: `1px solid ${IC.accBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: compact ? 11 : 13, color: IC.acc, flexShrink: 0,
          }}>{icon}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flex: 1 }}>
        <span style={{ fontSize: valueSize, fontWeight: 700, letterSpacing: '-.02em', color: accent || IC.t1, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{value}</span>
        {unit && <span style={{ fontSize: unitSize, color: IC.t3 }}>{unit}</span>}
      </div>
      {!compact && sub && <span style={{ fontSize: 11.5, color: IC.t3 }}>{sub}</span>}
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
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', position: 'relative' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
        {reorderPct != null && (
          <div title={`Reorder point: ${reorderPoint}d`} style={{ position: 'absolute', left: `${reorderPct}%`, top: -1, bottom: -1, width: 2, background: 'rgba(255,255,255,0.5)' }} />
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
      background: IC.surfaceHi, border: `1px solid ${IC.border2}`, borderRadius: 10, boxShadow: '0 12px 28px rgba(0,0,0,0.4)',
      display: 'flex', flexDirection: 'column', maxHeight: pos.maxHeight,
    }}>
      <div style={{ padding: 8, borderBottom: `1px solid ${IC.border}` }}>
        <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`}
          style={{ width: '100%', background: IC.page, border: `1px solid ${IC.border2}`, borderRadius: 6, padding: '5px 8px', color: IC.t1, fontSize: 11.5, boxSizing: 'border-box' }} />
      </div>
      {filtered.length > 0 && (
        <div onClick={toggleSelectAll}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: IC.t2, borderBottom: `1px solid ${IC.border}` }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
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
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
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
          style={{ fontSize: 11, fontWeight: 700, color: IC.acc, background: IC.accDim, border: `1px solid ${IC.accBorder}`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>
          Apply{draft.length > 0 ? ` (${draft.length})` : ''}
        </button>
      </div>
    </div>,
    document.body
  )

  return (
    <div style={{ position: 'relative', width, flexShrink: 0 }}>
      <button ref={btnRef} onClick={() => open ? closeMenu() : openMenu()}
        style={{
          width: '100%', height, boxSizing: 'border-box', textAlign: 'left', background: IC.surface, border: `1px solid ${selected.length ? IC.accBorder : IC.border2}`,
          borderRadius: 8, padding: '0 10px', color: selected.length ? IC.t1 : IC.t3, fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
        }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected.length === 0 ? label
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
        color: active ? IC.acc : IC.t3, padding: '6px 10px', borderBottom: `1px solid ${IC.border2}`,
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
export function DraggableTh({ label, sortKey, sortState, onSort, width, onResize, align = 'right', group, onReorder, dragState, setDragState }) {
  const active = sortState?.key === sortKey
  const arrow = active ? (sortState.dir === 'asc' ? ' ▲' : ' ▼') : ''
  const isDragging = dragState?.key === sortKey
  const isDropTarget = dragState && dragState.key !== sortKey && dragState.group === group

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
      title="Drag to reorder · click to sort"
      style={{
        textAlign: align, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em',
        color: active ? IC.acc : IC.t3, padding: '6px 10px', borderBottom: `1px solid ${IC.border2}`,
        whiteSpace: 'nowrap', width, minWidth: 50, boxSizing: 'border-box', position: 'relative',
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
        style={{ background: IC.surface, border: `1px solid ${IC.border2}`, borderRadius: 8, padding: '6px 10px', color: IC.t1, fontSize: 12, colorScheme: 'dark' }} />
      <span style={{ color: IC.t3, fontSize: 12 }}>→</span>
      <input type="date" value={filters.end} onChange={e => setFilters(f => ({ ...f, end: e.target.value }))}
        style={{ background: IC.surface, border: `1px solid ${IC.border2}`, borderRadius: 8, padding: '6px 10px', color: IC.t1, fontSize: 12, colorScheme: 'dark' }} />
      <button onClick={onRefresh}
        style={{ background: IC.accDim, border: `1px solid ${IC.accBorder}`, borderRadius: 8, padding: '6px 14px', color: IC.acc, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
        Refresh
      </button>
    </div>
  )
}
