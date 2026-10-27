import { useMemo, useState } from 'react'
import { C } from '../utils.js'
import BottomSheet from './BottomSheet.jsx'
import RankedRow from './RankedRow.jsx'
import FullScreenList from './FullScreenList.jsx'
import { rankItems, barMax, barPctOf } from './rankSort.js'

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
//   badge       item => node before the name (P&L flag dots); valueColor: (item, sortKey) => colour
//   renderSheet item => the detail sheet's content instead of the `details` grid (P&L product sheet)
//   onSelect    item => handled by the caller instead of the built-in sheet (e.g. a category → products)
//   flipOnRetap tapping the active chip again flips highest ↔ lowest first; the line says which
//   scopeFor    sortKey => { keep: item => bool, label } | null: rank only the kept items for that sort
//               (e.g. P&L % sorts skip tiny products), with a "Show all" link to include the rest
//   rowLayout   passed to RankedRow ('line' = P&L one-line rows)
export default function MobileRankedList({ title, noun = 'items', items, itemKey, sorts, defaultSort, name, sub, secondary, details, searchText, groupOf, topN = 10, sheetSubtitle, emptyText = 'No data for this period', compact = false, badge, valueColor, renderSheet, onSelect, flipOnRetap = false, scopeFor, rowLayout }) {
  const M = C.m
  const [sortKey, setSortKey] = useState(defaultSort || sorts[0].key)
  const [dir, setDir] = useState('desc')
  const [scopeAll, setScopeAll] = useState(false)
  const [fullOpen, setFullOpen] = useState(false)
  const [selected, setSelected] = useState(null)

  const sort = sorts.find(s => s.key === sortKey) || sorts[0]
  const scope = scopeFor?.(sort.key) || null
  const pool = useMemo(() => (scope && !scopeAll ? items.filter(scope.keep) : items), [items, scope, scopeAll])
  const ranked = useMemo(() => rankItems(pool, sort.value, dir), [pool, sort, dir])
  const visible = ranked.slice(0, topN)
  const max = barMax(visible, sort.value)
  const pickSort = key => { if (key === sortKey) { if (flipOnRetap) setDir(d => (d === 'desc' ? 'asc' : 'desc')) } else { setSortKey(key); setDir('desc') } }
  const linkStyle = { border: 'none', background: 'none', padding: 0, color: M.green, fontWeight: 600, fontSize: 12, fontFamily: 'var(--font)', cursor: 'pointer' }

  return (
    <div className="ranked-list">
      {title && <div style={{ fontSize: M.type.cardTitle, fontWeight: 700, color: M.ink }}>{title}</div>}
      <div className="ranked-list-line" style={{ fontSize: 12, color: M.muted, marginTop: 2 }}>
        {`Top ${Math.min(topN, ranked.length)} of ${ranked.length} ${noun} · by ${sort.label}${flipOnRetap ? (dir === 'desc' ? ' · highest first' : ' · lowest first') : ''}`}
        {scope && (scopeAll
          ? <> · all {noun} · <button type="button" onClick={() => setScopeAll(false)} style={linkStyle}>{scope.label} only</button></>
          : <> · {scope.label} · <button type="button" onClick={() => setScopeAll(true)} style={linkStyle}>Show all</button></>)}
      </div>

      <div role="group" aria-label="Sort by" style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '10px -16px 2px', padding: '2px 16px', scrollbarWidth: 'none' }}>
        {sorts.map(s => {
          const on = s.key === sortKey
          return (
            <button key={s.key} type="button" aria-pressed={on} onClick={() => pickSort(s.key)}
              style={{ flex: '0 0 auto', minHeight: compact ? 28 : 32, padding: compact ? '0 10px' : '0 11px', borderRadius: M.radius.chip, border: `1px solid ${on ? M.green : M.line}`, background: on ? M.green : '#fff', color: on ? '#fff' : M.ink,
                fontSize: compact ? 12 : 12.5, fontWeight: on ? 700 : 500, fontFamily: 'var(--font)', cursor: 'pointer' }}>{s.label}</button>
          )
        })}
      </div>

      {!visible.length && <div style={{ padding: '16px 0', textAlign: 'center', color: M.muted, fontSize: 13 }}>{emptyText}</div>}
      <div>
        {visible.map((it, i) => (
          <RankedRow key={itemKey(it)} rank={i + 1} name={name(it)} sub={sub?.(it, sortKey)} value={sort.format(it)} secondary={secondary?.(it, sortKey)}
            barPct={barPctOf(it, sort.value, max)} barTone={sort.bar} onClick={() => (onSelect ? onSelect(it) : setSelected(it))} compact={compact}
            badge={badge?.(it)} valueColor={valueColor?.(it, sortKey)} layout={rowLayout} />
        ))}
      </div>

      {ranked.length > topN && (
        <button type="button" onClick={() => setFullOpen(true)}
          style={{ marginTop: 10, width: '100%', minHeight: 44, borderRadius: 12, border: `1px solid ${M.line}`, background: '#fff', color: M.green, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
          Show all {ranked.length} {noun} →
        </button>
      )}

      <FullScreenList open={fullOpen} onClose={() => setFullOpen(false)} title={`All ${noun}`} noun={noun} items={items} sorts={sorts} initialSort={sortKey}
        name={name} sub={sub} secondary={secondary} searchText={searchText} groupOf={groupOf} onSelect={onSelect ? it => { setFullOpen(false); onSelect(it) } : setSelected} badge={badge} valueColor={valueColor}
        flipOnRetap={flipOnRetap} initialDir={dir} scopeFor={scopeFor} initialScopeAll={scopeAll} rowLayout={rowLayout} />

      <BottomSheet open={!!selected} onClose={() => setSelected(null)} title={selected ? name(selected) : ''} subtitle={selected && sub ? [sub(selected), sheetSubtitle].filter(Boolean).join(' · ') : sheetSubtitle}>
        {selected && renderSheet && renderSheet(selected)}
        {selected && !renderSheet && (
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
