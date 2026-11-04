import { useEffect, useMemo, useState } from 'react'
import { C } from '../../utils.js'
import { fmtInt, fmtCurrency } from '../theme.jsx'
import MobileRankedList from '../../responsive/MobileRankedList.jsx'
import SegmentToggle from '../../responsive/SegmentToggle.jsx'
import FullScreenList from '../../responsive/FullScreenList.jsx'
import { Card, Chips, ChipRow, ShowAllButton, RowText } from '../../responsive/CardKit.jsx'
import { topProductsFrom } from './saMobileData.js'

// Sales & Allocation mobile: Top products and Biggest movers (INVENTORY_MOBILE_REDESIGN_PROMPT.md §3d-e).
const M = C.m
const LEVELS = [{ id: 'sku', label: 'SKU' }, { id: 'subCategory', label: 'Sub-cat' }, { id: 'category', label: 'Category' }]
const pct1 = v => `${v.toFixed(1)}%`

export function TopProductsCard({ fd, channels, revenueAvailable }) {
  const [level, setLevel] = useState('subCategory')
  const items = useMemo(() => topProductsFrom(fd, level, 'qty', channels), [fd, level, channels])
  const tu = fd.summary.totalUnits, tr = fd.summary.totalRevenue
  const noun = level === 'sku' ? 'SKUs' : level === 'subCategory' ? 'sub-categories' : 'categories'
  const sorts = [
    { key: 'qty', label: 'Units', value: r => r.qty, format: r => fmtInt(r.qty) },
    ...(revenueAvailable ? [{ key: 'rev', label: 'Revenue', value: r => r.rev, format: r => fmtCurrency(r.rev) }] : []),
  ]
  return (
    <Card title="Top products" right={<SegmentToggle label="Level" options={LEVELS} value={level} onChange={setLevel} />}
      sub={channels?.length ? `Channel: ${channels.join(', ')}` : null}>
      <MobileRankedList key={level} noun={noun} items={items} itemKey={r => r.name} sorts={sorts} defaultSort="qty" name={r => r.name}
        secondary={(r, k) => pct1(k === 'rev' ? (tr > 0 ? (r.rev / tr) * 100 : 0) : (tu > 0 ? (r.qty / tu) * 100 : 0))}
        details={[
          { label: 'Units', value: r => fmtInt(r.qty) }, { label: 'Revenue', value: r => fmtCurrency(r.rev) },
          { label: '% of units', value: r => pct1(tu > 0 ? (r.qty / tu) * 100 : 0) }, { label: '% of revenue', value: r => pct1(tr > 0 ? (r.rev / tr) * 100 : 0) },
        ]}
        searchText={r => r.name} topN={10} compact />
    </Card>
  )
}

export function MoversCard({ fd, revenueAvailable, onRows }) {
  const [dir, setDir] = useState('risers')
  const [mode, setMode] = useState('day2')
  const [metric, setMetric] = useState('qty')
  const [level, setLevel] = useState('subCategory')
  const [fullOpen, setFullOpen] = useState(false)
  const bucket = fd?.topMovers?.[level]?.[mode]?.[metric]
  const rows = useMemo(() => (bucket ? (dir === 'risers' ? bucket.risers : bucket.fallers) : []), [bucket, dir])
  const name = r => (level === 'sku' ? r.sku : level === 'subCategory' ? r.subCategory : r.category)
  const fmtV = v => (metric === 'rev' ? fmtCurrency(v) : fmtInt(v))
  // CSV of the rows as shown: the desktop Drastic Sales Change export's columns.
  useEffect(() => {
    const key = level === 'sku' ? 'sku' : level === 'subCategory' ? 'subCategory' : 'category'
    onRows?.({ rows, columns: [{ label: level === 'sku' ? 'SKU' : level === 'subCategory' ? 'Sub-category' : 'Category', key }, { label: 'Category', key: 'category' }, { label: 'Last', key: 'lastVal' }, { label: 'Compare', key: 'compareVal' }, { label: '% Change', key: 'pctChange' }] })
  }, [rows, level, onRows])
  const row = r => {
    const up = r.pctChange >= 0
    return <RowText name={name(r)} sub={`${fmtV(r.compareVal)} → ${fmtV(r.lastVal)}`} value={`${up ? '▲' : '▼'} ${Math.abs(r.pctChange).toFixed(0)}%`} valueColor={up ? M.up : M.down} />
  }
  return (
    <Card title="Biggest movers" right={<SegmentToggle label="Direction" options={[{ id: 'risers', label: '▲ Risers' }, { id: 'fallers', label: '▼ Fallers' }]} value={dir} onChange={setDir} />}>
      <Chips label="Compare" options={[{ id: 'day2', label: 'Last vs 2nd-last day' }, { id: 'day7', label: 'Last vs 7th-last day' }]} value={mode} onChange={setMode} />
      <ChipRow>
        <Chips inline label="Measure" options={[{ id: 'qty', label: 'Units' }, ...(revenueAvailable ? [{ id: 'rev', label: 'Revenue' }] : [])]} value={metric} onChange={setMetric} />
        <Chips inline label="Level" options={[{ id: 'sku', label: 'SKU' }, { id: 'subCategory', label: 'Sub-cat' }, { id: 'category', label: 'Category' }]} value={level} onChange={setLevel} />
      </ChipRow>
      {!rows.length && <div style={{ padding: '12px 0', fontSize: 13, color: M.muted }}>No data for this comparison.</div>}
      {rows.slice(0, 8).map((r, i) => <div key={i} style={{ padding: '8px 0', borderTop: `1px solid ${M.line}` }}>{row(r)}</div>)}
      {rows.length > 0 && <ShowAllButton onClick={() => setFullOpen(true)}>Show all {rows.length} · search →</ShowAllButton>}
      <FullScreenList open={fullOpen} onClose={() => setFullOpen(false)} title={dir === 'risers' ? 'Risers' : 'Fallers'} noun={level === 'sku' ? 'SKUs' : level === 'subCategory' ? 'sub-categories' : 'categories'}
        items={rows} sorts={[{ key: 'chg', label: 'Change', value: r => Math.abs(r.pctChange), format: r => `${r.pctChange >= 0 ? '▲' : '▼'} ${Math.abs(r.pctChange).toFixed(0)}%`, bar: dir === 'fallers' ? 'bad' : undefined },
          { key: 'now', label: 'Now', value: r => r.lastVal, format: r => fmtV(r.lastVal) }]}
        name={name} sub={r => `${fmtV(r.compareVal)} → ${fmtV(r.lastVal)}`} searchText={name} />
    </Card>
  )
}

