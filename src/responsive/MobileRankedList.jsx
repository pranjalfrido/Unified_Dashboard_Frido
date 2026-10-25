import { useMemo, useRef, useState } from 'react'
import { C } from '../utils.js'
import BottomSheet from './BottomSheet.jsx'

// Ranked list for record-style tables on phones (replaces a squeezed table). Reusable:
//   items       rows (already computed by the page - this component only orders and displays)
//   sorts       [{ key, label, value: item => number|null, format: item => string, bar?: 'bad' }]
//               the table's own sortable columns; one is active at a time (sort chips)
//   name        item => full name (wraps to 2 lines, never truncated with "…")
//   secondary   (item, sortKey) => small grey text next to the bold value
//   details     [{ label, value: item => string }] - every column, shown in the bottom sheet
//   searchText  item => string matched by the 🔍 search
//   topN        rows shown before "Show all N" (no inner scroll - the list just grows)
export default function MobileRankedList({ title, noun = 'items', items, itemKey, sorts, defaultSort, name, secondary, details, searchText, topN = 10, sheetSubtitle, emptyText = 'No data for this period' }) {
  const [sortKey, setSortKey] = useState(defaultSort || sorts[0].key)
  const [showAll, setShowAll] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(null)
  const inputRef = useRef(null)

  const sort = sorts.find(s => s.key === sortKey) || sorts[0]
  const needle = q.trim().toLowerCase()
  const ranked = useMemo(() => {
    const rows = needle ? items.filter(it => (searchText ? searchText(it) : name(it)).toLowerCase().includes(needle)) : items
    return [...rows].sort((a, b) => (sort.value(b) ?? -Infinity) - (sort.value(a) ?? -Infinity))
  }, [items, needle, sort, searchText, name])
  const visible = showAll || needle ? ranked : ranked.slice(0, topN)
  const max = Math.max(...visible.map(it => sort.value(it) || 0), 0) || 1

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.t1 }}>{title}</div>
          <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>
            {needle ? `${ranked.length} of ${items.length} ${noun} match` : `${showAll ? 'All' : `Top ${Math.min(topN, items.length)} of`} ${items.length} ${noun} · by ${sort.label}`}
          </div>
        </div>
        <button type="button" aria-label={searchOpen ? 'Close search' : `Search ${noun}`} aria-expanded={searchOpen}
          onClick={() => { const next = !searchOpen; setSearchOpen(next); if (!next) setQ(''); else setTimeout(() => inputRef.current?.focus(), 0) }}
          style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 10, border: `1px solid ${C.border}`, background: searchOpen ? C.acl : C.card, color: C.t2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="20" y1="20" x2="16.5" y2="16.5" /></svg>
        </button>
      </div>

      {searchOpen && (
        <input ref={inputRef} type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${noun}…`} aria-label={`Search ${noun}`}
          style={{ width: '100%', marginTop: 10, fontSize: 16, padding: '9px 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.hov, color: C.t1, outline: 'none', fontFamily: 'var(--font)' }} />
      )}

      <div role="group" aria-label="Sort by" style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '12px -16px 4px', padding: '2px 16px', scrollbarWidth: 'none' }}>
        {sorts.map(s => (
          <button key={s.key} type="button" aria-pressed={s.key === sortKey} onClick={() => setSortKey(s.key)}
            style={{ flex: '0 0 auto', minHeight: 36, fontSize: 13, padding: '0 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: s.key === sortKey ? 700 : 500,
              background: s.key === sortKey ? C.acc : C.hov, color: s.key === sortKey ? C.onAcc : C.t1 }}>{s.label}</button>
        ))}
      </div>

      {!visible.length && <div style={{ padding: '16px 0', textAlign: 'center', color: C.t3, fontSize: 13 }}>{needle ? `No ${noun} match "${q}".` : emptyText}</div>}
      <ol style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>
        {visible.map((it, i) => {
          const v = sort.value(it)
          return (
            <li key={itemKey(it)} style={{ borderBottom: i < visible.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <button type="button" onClick={() => setSelected(it)}
                style={{ width: '100%', display: 'flex', gap: 10, padding: '12px 0', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', color: C.t1 }}>
                <span style={{ width: 22, flexShrink: 0, fontSize: 12, fontWeight: 700, color: C.t3, textAlign: 'right', paddingTop: 2, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {/* Full name: wraps, at most 2 lines, cut without an ellipsis. */}
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600, lineHeight: 1.3, maxHeight: '2.6em', overflow: 'hidden', overflowWrap: 'anywhere' }}>{name(it)}</span>
                  <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' }}>{sort.format(it)}</span>
                    <span style={{ fontSize: 12, color: C.t3, textAlign: 'right', minWidth: 0 }}>{secondary ? secondary(it, sortKey) : ''}</span>
                  </span>
                  <span aria-hidden="true" style={{ display: 'block', height: 5, background: C.border, borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${Math.max(0, Math.min(100, ((v || 0) / max) * 100))}%`, background: sort.bar === 'bad' ? C.red.tx : C.acc, borderRadius: 3 }} />
                  </span>
                </span>
                <span aria-hidden="true" style={{ alignSelf: 'center', color: C.border2, fontSize: 20 }}>›</span>
              </button>
            </li>
          )
        })}
      </ol>

      {!needle && ranked.length > topN && (
        <button type="button" onClick={() => setShowAll(s => !s)}
          style={{ marginTop: 10, width: '100%', minHeight: 44, borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.acc, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
          {showAll ? `Show top ${topN}` : `Show all ${ranked.length} →`}
        </button>
      )}

      <BottomSheet open={!!selected} onClose={() => setSelected(null)} title={selected ? name(selected) : ''} subtitle={sheetSubtitle}>
        {selected && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
            {details.map(d => (
              <div key={d.label} style={{ background: C.hov, borderRadius: 12, padding: '10px 12px', minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: C.t3 }}>{d.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.t1, marginTop: 3, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{d.value(selected)}</div>
              </div>
            ))}
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
