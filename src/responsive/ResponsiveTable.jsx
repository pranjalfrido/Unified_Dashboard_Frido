import { useEffect, useRef, useState } from 'react'
import { C } from '../utils.js'
import { useBreakpoint } from './useBreakpoint.js'

// Shared responsive table (docs/responsive/RESPONSIVE_PLAN.md, prompt Phase 6). One component,
// three patterns, chosen per table:
//
//   pattern="priority"  (A) every column has priority 1-3; mobile shows 1, tablet 1-2, desktop all.
//                           A "Columns" control lets the reader switch hidden columns back on.
//   pattern="scroll"    (B) all columns, horizontal scroll with sticky header + sticky first column,
//                           edge shadows while more content is off-screen, optional sticky totals row.
//                           For wide numeric tables (P&L, Financial MIS, SKU-wise, reconciliation).
//   pattern="cards"     (C) a table on tablet/desktop; on mobile each row becomes a compact card
//                           (title + up to 4 fields). For record-style tables.
//
// columns: [{ key, label, align, priority = 1, render(value, row), mono, width, cardLabel }]
// Values are rendered exactly as the column's render() returns them - this component only decides
// WHICH cells are shown and how they are laid out, never what they say.
export function ResponsiveTable({
  columns, rows, pattern = 'priority', rowKey = (r, i) => i, maxHeight, totalsRow,
  cardTitle, cardFields, emptyText = 'No data for this period', rowStyle, onRowClick,
  fontSize = 12, headStyle, cellPadding = '8px 12px', tableClassName, label,
}) {
  const bp = useBreakpoint()
  const level = bp.isMobile ? 1 : bp.isTablet ? 2 : 3
  const [shown, setShown] = useState(() => new Set())     // columns the reader switched ON
  const [menuOpen, setMenuOpen] = useState(false)
  const scrollRef = useRef(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  const visibleCols = pattern === 'priority'
    ? columns.filter(c => (c.priority ?? 1) <= level || shown.has(c.key))
    : columns
  const hiddenCols = pattern === 'priority' ? columns.filter(c => (c.priority ?? 1) > level) : []

  // Scroll shadows for pattern B: show a shadow on whichever side still has content off-screen.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || pattern !== 'scroll') return
    const update = () => setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 })
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', update); ro.disconnect() }
  }, [pattern, rows, visibleCols.length])

  const cell = (c, r) => (c.render ? c.render(r[c.key], r) : r[c.key])
  const alignOf = c => (c.align === 'right' ? 'right' : c.align === 'center' ? 'center' : 'left')

  if (!rows?.length) return <div style={{ padding: '16px 10px', textAlign: 'center', color: C.t3, fontSize: 12 }}>{emptyText}</div>

  // ── Pattern C on mobile: card list ──
  if (pattern === 'cards' && bp.isMobile) {
    const fields = (cardFields || columns.slice(1, 5).map(c => c.key)).map(k => columns.find(c => c.key === k)).filter(Boolean)
    return (
      <div role="list" aria-label={label} style={{ display: 'flex', flexDirection: 'column', gap: 8, ...(maxHeight ? { maxHeight, overflowY: 'auto' } : {}) }}>
        {rows.map((r, i) => (
          <div key={rowKey(r, i)} role="listitem" onClick={onRowClick ? () => onRowClick(r) : undefined}
            style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 12px', background: C.card, cursor: onRowClick ? 'pointer' : 'default' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.t1, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {cardTitle ? cardTitle(r) : cell(columns[0], r)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '6px 12px' }}>
              {fields.map(c => (
                <div key={c.key} style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: C.t3 }}>{c.cardLabel || c.label}</div>
                  <div style={{ fontSize: 13, color: C.t1, fontFamily: c.mono ? 'var(--mono)' : 'inherit', fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cell(c, r)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  const sticky = pattern === 'scroll'
  const th = (c, i) => ({
    fontSize: 12, fontWeight: 600, letterSpacing: 0.2, color: C.t3, textAlign: alignOf(c), padding: `10px ${cellPadding.split(' ')[1] || '12px'}`,
    background: C.card, borderBottom: `2px solid ${C.border}`, whiteSpace: 'nowrap',
    position: 'sticky', top: 0, zIndex: sticky && i === 0 ? 3 : 2,
    ...(sticky && i === 0 ? { left: 0 } : {}),
    ...(c.width ? { width: c.width } : {}),
    ...headStyle,
  })
  const td = (c, i, bg) => ({
    padding: cellPadding, textAlign: alignOf(c), fontFamily: c.mono ? 'var(--mono)' : 'inherit', fontVariantNumeric: 'tabular-nums',
    ...(sticky && i === 0 ? { position: 'sticky', left: 0, zIndex: 1, background: bg, boxShadow: edges.left ? `6px 0 8px -6px rgba(0,0,0,.18)` : 'none' } : {}),
    ...(c.cellStyle || {}),
  })

  return (
    <div style={{ position: 'relative' }}>
      {hiddenCols.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6, position: 'relative' }}>
          <button type="button" onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen}
            style={{ minHeight: bp.isTouch ? 36 : 26, padding: '3px 10px', borderRadius: 8, border: `1px solid ${C.border2}`, background: C.card, color: C.t2, fontSize: 11.5, fontFamily: 'var(--font)', cursor: 'pointer' }}>
            Columns ({visibleCols.length}/{columns.length})
          </button>
          {menuOpen && (
            <div role="menu" style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: C.z.dropdown, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: C.sh3, padding: 6, minWidth: 180 }}>
              {hiddenCols.map(c => (
                <label key={c.key} role="menuitemcheckbox" aria-checked={shown.has(c.key)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px', minHeight: 36, fontSize: 12.5, color: C.t1, cursor: 'pointer', borderRadius: 6 }}>
                  <input type="checkbox" checked={shown.has(c.key)}
                    onChange={() => setShown(prev => { const n = new Set(prev); n.has(c.key) ? n.delete(c.key) : n.add(c.key); return n })} />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      <div ref={scrollRef} className="rt-scroll"
        style={{ overflow: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'contain', border: `1px solid ${C.border}`, borderRadius: 10, ...(maxHeight ? { maxHeight } : {}),
          boxShadow: sticky && edges.right ? 'inset -10px 0 8px -8px rgba(0,0,0,.18)' : 'none' }}>
        <table className={tableClassName} aria-label={label} style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize }}>
          <thead>
            <tr>{visibleCols.map((c, i) => <th key={c.key} scope="col" style={th(c, i)}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => {
              const bg = ri % 2 === 1 ? C.hov : C.card
              return (
                <tr key={rowKey(r, ri)} onClick={onRowClick ? () => onRowClick(r) : undefined}
                  style={{ background: bg, cursor: onRowClick ? 'pointer' : 'default', ...(rowStyle ? rowStyle(r, ri) : {}) }}>
                  {visibleCols.map((c, i) => <td key={c.key} style={td(c, i, bg)}>{cell(c, r)}</td>)}
                </tr>
              )
            })}
          </tbody>
          {totalsRow && (
            <tfoot>
              <tr>
                {visibleCols.map((c, i) => (
                  <td key={c.key} style={{ ...td(c, i, C.ach), position: 'sticky', bottom: 0, zIndex: i === 0 && sticky ? 3 : 2, background: C.ach, fontWeight: 700, borderTop: `2px solid ${C.border}` }}>
                    {c.render && totalsRow[c.key] !== undefined ? c.render(totalsRow[c.key], totalsRow) : totalsRow[c.key]}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
