import { useState } from 'react'
import { C } from '../../utils.js'
import { fmtNum, fmtInt, fmtDays } from '../theme.jsx'
import SegmentToggle from '../../responsive/SegmentToggle.jsx'
import BottomSheet from '../../responsive/BottomSheet.jsx'
import FullScreenList from '../../responsive/FullScreenList.jsx'
import { Card, RowText, ShowAllButton } from '../../responsive/CardKit.jsx'

// Ageing stock (INVENTORY_MOBILE_REDESIGN_PROMPT.md §2d): one card with Slow moving / Dead stock
// (the desktop's two sub-category tables, Spare Parts already removed by the page). Full names, no
// "…"; top 8 + "Show all" (full-screen list with search); tap → the sub-category's SKUs, the same
// rows the desktop table shows when a row is expanded.
const M = C.m
const TOP = 8
const VIEWS = [{ id: 'slow', label: 'Slow moving' }, { id: 'dead', label: 'Dead stock' }]
const HINT = { slow: 'No sale, or more than 45 days of inventory · sorted by units', dead: 'More than 200 days of inventory, or no sale with over 200 units · sorted by units' }
const SORTS = [
  { key: 'units', label: 'Units', value: r => r.totalInvt, format: r => fmtInt(r.totalInvt) },
  { key: 'doi', label: 'DOI', value: r => r.doi, format: r => `${fmtDays(r.doi)}d` },
  { key: 'avg', label: 'Avg sale', value: r => r.avgSale, format: r => `${fmtNum(r.avgSale)}/day` },
]

export default function AgeingCard({ slow, dead }) {
  const [view, setView] = useState('slow')
  const [fullOpen, setFullOpen] = useState(false)
  const [sel, setSel] = useState(null)
  const rows = [...(view === 'slow' ? slow : dead)].sort((a, b) => b.totalInvt - a.totalInvt)
  const noun = view === 'slow' ? 'slow-moving sub-categories' : 'dead-stock sub-categories'
  return (
    <Card id="inv-dead-stock" title="Ageing stock" right={<SegmentToggle label="Ageing view" options={VIEWS} value={view} onChange={setView} />}>
      <div style={{ fontSize: 12, color: M.muted, marginBottom: 4 }}>{HINT[view]}</div>
      {!rows.length && <div style={{ padding: '12px 0', fontSize: 13, color: M.muted }}>{view === 'slow' ? 'No slow-moving sub-categories flagged.' : 'No dead stock right now.'}</div>}
      {rows.slice(0, TOP).map(r => (
        <button key={`${r.category}|${r.subCategory}`} type="button" onClick={() => setSel(r)}
          style={{ display: 'block', width: '100%', minHeight: 48, padding: '8px 0', border: 'none', borderTop: `1px solid ${M.line}`, background: 'transparent', textAlign: 'left', fontFamily: 'var(--font)', color: M.ink, cursor: 'pointer' }}>
          <RowText name={r.subCategory} sub={`${r.category} · avg ${fmtNum(r.avgSale)}/day`} value={fmtInt(r.totalInvt)} valueSub={`DOI ${fmtDays(r.doi)}d`} />
        </button>
      ))}
      {rows.length > TOP && <ShowAllButton onClick={() => setFullOpen(true)}>Show all {rows.length} →</ShowAllButton>}

      <FullScreenList open={fullOpen} onClose={() => setFullOpen(false)} title={view === 'slow' ? 'Slow moving' : 'Dead stock'} noun={noun} items={rows} sorts={SORTS}
        name={r => r.subCategory} sub={r => r.category} secondary={(r, k) => (k === 'units' ? `DOI ${fmtDays(r.doi)}d` : `${fmtInt(r.totalInvt)} units`)}
        searchText={r => `${r.subCategory} ${r.category}`} groupOf={r => r.category} onSelect={setSel} />

      <BottomSheet open={!!sel} onClose={() => setSel(null)} title={sel?.subCategory || ''} subtitle={sel ? `${sel.category} · ${fmtInt(sel.totalInvt)} units · avg ${fmtNum(sel.avgSale)}/day · DOI ${fmtDays(sel.doi)}d` : null}>
        {sel && (sel.skus || []).map(s => (
          <div key={s.sku} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', columnGap: 12, alignItems: 'center', minHeight: 40, borderTop: `1px solid ${M.line}`, fontSize: 13.5 }}>
            <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{s.sku}</span>
            <span style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtInt(s.totalInvt)}</span>
            <span style={{ textAlign: 'right', color: M.muted, fontSize: 12.5, fontVariantNumeric: 'tabular-nums', minWidth: 90 }}>{fmtNum(s.avgSale)}/day · {fmtDays(s.doi)}d</span>
          </div>
        ))}
      </BottomSheet>
    </Card>
  )
}
