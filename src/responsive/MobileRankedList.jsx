import { useMemo, useState } from 'react'
import { C } from '../utils.js'
import BottomSheet from './BottomSheet.jsx'
import RankedRow from './RankedRow.jsx'
import FullScreenList from './FullScreenList.jsx'

// Ranked list for record-style tables on phones (mockups/sales_mobile_mockup.html "Categories &
// products"). Reusable:
//   items       rows (already computed by the page - this component only orders and displays)
//   sorts       [{ key, label, value: item => number|null, format: item => string, bar?: 'bad' }]
//               the table's own sortable columns; one is active at a time (sort chips)
//   name        item => full name (max 2 lines, cut without "…"); sub: item => small grey line under it
//   secondary   (item, sortKey) => small grey text under the bold value
//   details     [{ label, value: item => string }] - every column, shown in the detail sheet
//   searchText  item => string matched by the full-screen list's search
//   groupOf     item => group name (e.g. category) for the full-screen list's group chips
//   topN        rows shown in the card; "Show all N →" opens the full-screen list
export default function MobileRankedList({ title, noun = 'items', items, itemKey, sorts, defaultSort, name, sub, secondary, details, searchText, groupOf, topN = 10, sheetSubtitle, emptyText = 'No data for this period', compact = false }) {
  const M = C.m
  const [sortKey, setSortKey] = useState(defaultSort || sorts[0].key)
  const [fullOpen, setFullOpen] = useState(false)
  const [selected, setSelected] = useState(null)

  const sort = sorts.find(s => s.key === sortKey) || sorts[0]
  const ranked = useMemo(() => [...items].sort((a, b) => (sort.value(b) ?? -Infinity) - (sort.value(a) ?? -Infinity)), [items, sort])
  const visible = ranked.slice(0, topN)
  const max = Math.max(...visible.map(it => sort.value(it) || 0), 0) || 1

  return (
    <div className="ranked-list">
      {title && <div style={{ fontSize: M.type.cardTitle, fontWeight: 700, color: M.ink }}>{title}</div>}
      <div style={{ fontSize: 12, color: M.muted, marginTop: 2 }}>{`Top ${Math.min(topN, items.length)} of ${items.length} ${noun} · by ${sort.label}`}</div>

      <div role="group" aria-label="Sort by" style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '10px -16px 2px', padding: '2px 16px', scrollbarWidth: 'none' }}>
        {sorts.map(s => {
          const on = s.key === sortKey
          return (
            <button key={s.key} type="button" aria-pressed={on} onClick={() => setSortKey(s.key)}
              style={{ flex: '0 0 auto', minHeight: compact ? 28 : 32, padding: compact ? '0 10px' : '0 11px', borderRadius: M.radius.chip, border: `1px solid ${on ? M.green : M.line}`, background: on ? M.green : '#fff', color: on ? '#fff' : M.ink,
                fontSize: compact ? 12 : 12.5, fontWeight: on ? 700 : 500, fontFamily: 'var(--font)', cursor: 'pointer' }}>{s.label}</button>
          )
        })}
      </div>

      {!visible.length && <div style={{ padding: '16px 0', textAlign: 'center', color: M.muted, fontSize: 13 }}>{emptyText}</div>}
      <div>
        {visible.map((it, i) => (
          <RankedRow key={itemKey(it)} rank={i + 1} name={name(it)} sub={sub?.(it)} value={sort.format(it)} secondary={secondary?.(it, sortKey)}
            barPct={((sort.value(it) || 0) / max) * 100} barTone={sort.bar} onClick={() => setSelected(it)} compact={compact} />
        ))}
      </div>

      {ranked.length > topN && (
        <button type="button" onClick={() => setFullOpen(true)}
          style={{ marginTop: 10, width: '100%', minHeight: 44, borderRadius: 12, border: `1px solid ${M.line}`, background: '#fff', color: M.green, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
          Show all {ranked.length} {noun} →
        </button>
      )}

      <FullScreenList open={fullOpen} onClose={() => setFullOpen(false)} title={`All ${noun}`} noun={noun} items={items} sorts={sorts} initialSort={sortKey}
        name={name} sub={sub} secondary={secondary} searchText={searchText} groupOf={groupOf} onSelect={setSelected} />

      <BottomSheet open={!!selected} onClose={() => setSelected(null)} title={selected ? name(selected) : ''} subtitle={selected && sub ? [sub(selected), sheetSubtitle].filter(Boolean).join(' · ') : sheetSubtitle}>
        {selected && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
            {details.map(d => (
              <div key={d.label} style={{ background: M.soft, borderRadius: M.radius.tile, padding: '10px 12px', minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em', color: M.muted }}>{d.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: M.ink, marginTop: 3, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{d.value(selected)}</div>
              </div>
            ))}
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
