import { useMemo, useState } from 'react'
import { C } from '../../utils.js'
import { fmtInt, fmtCurrency } from '../theme.jsx'
import DrillDownList from '../../responsive/DrillDownList.jsx'
import Sparkline from '../../responsive/Sparkline.jsx'
import BottomSheet from '../../responsive/BottomSheet.jsx'
import ActionMenu from '../../responsive/ActionMenu.jsx'
import { Card } from '../../responsive/CardKit.jsx'
import { matrixCellsFor, matrixBucketKeyFor, MSEP } from './saMobileData.js'

// Sales & Allocation mobile: Daily sales by product (INVENTORY_MOBILE_REDESIGN_PROMPT.md §3f) - the
// Product-wise Sales Matrix as a Category → Sub-category → SKU drill-down with a sparkline + total.
const M = C.m
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const bucketLabel = (k, gran) => {
  if (gran === 'month') { const [y, m] = k.split('-').map(Number); return `${MONTHS[m - 1]} ${y}` }
  const [, m, d] = k.split('-').map(Number)
  return `${gran === 'week' ? 'Week of ' : ''}${d} ${MONTHS[m - 1]}`
}

export default function DailySalesCard({ fd, revenueAvailable }) {
  const [metric, setMetric] = useState('qty')
  const [gran, setGran] = useState('date')
  const [sel, setSel] = useState(null)
  const cells = useMemo(() => matrixCellsFor(fd.matrixCellRows, gran), [fd, gran])
  const cols = useMemo(() => [...new Set((fd.matrixDates || []).map(d => matrixBucketKeyFor(gran, d)))].sort(), [fd, gran])
  const tree = useMemo(() => {
    const cats = new Map()
    for (const s of fd.matrixSkuList || []) {
      if (!cats.has(s.category)) cats.set(s.category, new Map())
      const subs = cats.get(s.category)
      if (!subs.has(s.subCategory)) subs.set(s.subCategory, [])
      subs.get(s.subCategory).push(s)
    }
    return cats
  }, [fd])
  const series = path => cols.map(k => cells.get(path)?.get(k)?.[metric] || 0)
  const mk = (name, path, key) => { const v = series(path); return { key, name, path, values: v, total: v.reduce((a, x) => a + x, 0) } }
  const getRows = path => {
    if (!path.length) return [...tree.keys()].map(c => mk(c, `${c}${MSEP}${MSEP}`, c)).sort((a, b) => b.total - a.total)
    const subs = tree.get(path[0].key)
    if (path.length === 1) return [...subs.keys()].map(sc => mk(sc, `${path[0].key}${MSEP}${sc}${MSEP}`, sc)).sort((a, b) => b.total - a.total)
    return (subs.get(path[1].key) || []).map(s => mk(s.sku, `${path[0].key}${MSEP}${path[1].key}${MSEP}${s.skuKey}`, s.skuKey)).sort((a, b) => b.total - a.total)
  }
  const fmtV = v => (metric === 'rev' ? fmtCurrency(v) : fmtInt(v))
  const granLabel = { date: 'Date', week: 'Week', month: 'Month' }
  const menu = [
    { id: 'qty', group: 'Show', label: `${metric === 'qty' ? '✓ ' : ''}Units`, onSelect: () => setMetric('qty') },
    ...(revenueAvailable ? [{ id: 'rev', group: 'Show', label: `${metric === 'rev' ? '✓ ' : ''}Revenue`, onSelect: () => setMetric('rev') }] : []),
    ...['date', 'week', 'month'].map(g => ({ id: g, group: 'Per', label: `${gran === g ? '✓ ' : ''}${granLabel[g]}`, onSelect: () => setGran(g) })),
  ]
  return (
    <Card title="Daily sales by product" right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, color: M.muted, whiteSpace: 'nowrap' }}>{metric === 'qty' ? 'units' : 'revenue'} · {cols.length} {gran === 'date' ? 'days' : gran === 'week' ? 'weeks' : 'months'}</span>
      <ActionMenu items={menu} tone="light" title="Daily sales by product" label="Daily sales options" /></span>}>
      <DrillDownList rootLabel="All categories" resetKey={`${gran}|${metric}`} limit={20}
        getRows={getRows} rowKey={r => r.key} rowLabel={r => r.name} canOpen={(r, d) => d < 2} onLeaf={r => setSel(r)}
        renderRow={r => (
          <span style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', columnGap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: M.type.listValue, fontWeight: 600, lineHeight: '17px', overflowWrap: 'anywhere' }}>{r.name}</span>
            <Sparkline values={r.values} label={`${r.name} trend`} />
            <b style={{ fontSize: M.type.listValue, textAlign: 'right', minWidth: 56, fontVariantNumeric: 'tabular-nums' }}>{fmtV(r.total)}</b>
          </span>
        )} />
      <BottomSheet open={!!sel} onClose={() => setSel(null)} title={sel?.name || ''} subtitle={`${metric === 'qty' ? 'Units' : 'Revenue'} per ${granLabel[gran].toLowerCase()}`}>
        {sel && (
          <>
            {cols.map((k, i) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', minHeight: 36, alignItems: 'center', borderTop: `1px solid ${M.line}`, fontSize: 13.5 }}>
                <span>{bucketLabel(k, gran)}</span><b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtV(sel.values[i])}</b>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', minHeight: 40, alignItems: 'center', borderTop: `2px solid ${M.line}`, fontSize: 14, fontWeight: 700 }}>
              <span>Total</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtV(sel.total)}</span>
            </div>
          </>
        )}
      </BottomSheet>
    </Card>
  )
}

