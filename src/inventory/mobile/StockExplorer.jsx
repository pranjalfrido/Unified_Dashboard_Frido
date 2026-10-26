import { useMemo, useState } from 'react'
import { C } from '../../utils.js'
import { fmtNum, fmtInt, fmtDays } from '../theme.jsx'
import DrillDownList from '../../responsive/DrillDownList.jsx'
import MixBar, { MixLegend } from '../../responsive/MixBar.jsx'
import StatusDot from '../../responsive/StatusDot.jsx'
import BottomSheet from '../../responsive/BottomSheet.jsx'
import FullScreenList from '../../responsive/FullScreenList.jsx'
import InfoPopover from '../../responsive/InfoPopover.jsx'
import { Card, Chips, KV, RowText, ShowAllButton } from './ui.jsx'
import { STATUS_ORDER, MIX_SEGMENTS, statusColor, mixParts } from './invStatus.js'
import { explorerSkus, groupRows } from './invMobileData.js'

// Stock explorer (INVENTORY_MOBILE_REDESIGN_PROMPT.md §2c): replaces Inventory Detail and the
// Location-wise matrix on mobile. Category → Sub-category → SKU drill-down, location chips (the
// matrix's numbers per location), status filter in "⋯" (every real status, existing logic),
// search / "Show all" → full-screen SKU list, SKU → detail sheet.
const M = C.m
const DOI_DEF = 'Days of inventory. On category and sub-category rows: total units ÷ total avg sale per day of the SKUs in the row ("—" when there is no avg sale). On SKU rows: the SKU\'s own DOI, as on desktop.'
const SORTS = [
  { key: 'units', label: 'Units', value: it => it.totalInvt, format: it => fmtInt(it.totalInvt) },
  { key: 'doi', label: 'DOI', value: it => it.doi, format: it => `${fmtDays(it.doi)}d` },
  { key: 'avg', label: 'Avg sale', value: it => it.avgSale, format: it => `${fmtNum(it.avgSale)}/day` },
]
const perDay = v => (v ? `${fmtInt(v)}/day` : '—')
const iconBtn = { minWidth: 36, height: 32, padding: '0 8px', borderRadius: 10, border: `1px solid ${M.line}`, background: '#fff', color: M.ink, fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer', whiteSpace: 'nowrap' }

function SkuSheet({ item, loc, regularLocations, onClose }) {
  const s = item?.s
  const locs = s ? regularLocations(s).filter(l => l.totalInvt > 0 || l.avgSale > 0) : []
  return (
    <BottomSheet open={!!item} onClose={onClose} title={item?.sku || ''}
      subtitle={item ? <>{item.subCategory} · <StatusDot color={statusColor(s.stockStatus)} label={s.stockStatus} fontSize={12} muted /> · Website: {s.websiteStatus || '—'}</> : null}>
      {s && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: M.muted, marginBottom: 6 }}>All locations (Regular)</div>
          <KV items={[
            { label: 'Total', value: fmtInt(s.totalInvt) }, { label: 'DOI', value: `${fmtDays(s.doi)} days` },
            { label: 'RTD', value: fmtInt(s.rtdInvt) }, { label: 'RAW', value: fmtInt(s.rawInvt) },
            { label: 'RAW blocked', value: fmtInt(s.rawBlockedInvt) }, { label: 'Avg sale (B2C)', value: perDay(s.avgSale) },
          ]} />
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: M.muted, margin: '14px 0 4px' }}>By location</div>
          {!locs.length && <div style={{ fontSize: 13, color: M.muted }}>No location-level stock.</div>}
          {locs.map(l => (
            <div key={l.location} style={{ display: 'grid', gridTemplateColumns: '48px minmax(0,1fr) auto auto', columnGap: 10, alignItems: 'center', minHeight: 40, borderTop: `1px solid ${M.line}`, fontSize: 13.5, background: l.location === loc ? M.soft : 'transparent' }}>
              <b>{l.location}</b>
              <StatusDot color={statusColor(l.stockStatus)} label={l.stockStatus || '—'} fontSize={12} muted />
              <span style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtInt(l.totalInvt)}</span>
              <span style={{ textAlign: 'right', color: M.muted, fontSize: 12.5, fontVariantNumeric: 'tabular-nums', minWidth: 92 }}>{perDay(l.avgSale)} · {fmtDays(l.doi)}d</span>
            </div>
          ))}
        </>
      )}
    </BottomSheet>
  )
}

export default function StockExplorer({ skus, pivot, regularLocations, loc, setLoc, resetKey }) {
  const [status, setStatus] = useState('All')
  const [menuOpen, setMenuOpen] = useState(false)
  const [fullOpen, setFullOpen] = useState(false)
  const [sel, setSel] = useState(null)
  const [path, setPath] = useState([])

  const all = useMemo(() => explorerSkus({ skus, pivot, loc, regularLocations }), [skus, pivot, loc, regularLocations])
  const items = useMemo(() => (status === 'All' ? all : all.filter(it => it.status === status)), [all, status])
  const cats = useMemo(() => groupRows(items, 'category'), [items])
  const getRows = path => {
    if (!path.length) return cats
    const inCat = items.filter(it => it.category === path[0].key)
    if (path.length === 1) return groupRows(inCat, 'subCategory')
    return inCat.filter(it => it.subCategory === path[1].key).sort((a, b) => b.totalInvt - a.totalInvt)
  }
  const levelCount = getRows(path).length
  const countText = `${levelCount} ${path.length === 0 ? 'categories' : path.length === 1 ? 'sub-categories' : 'SKUs'}`
  const locChips = [{ id: 'All', label: 'All' }, ...pivot.locations.map(l => ({ id: l, label: l }))]

  return (
    <Card id="inv-stock-explorer" title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>Stock explorer <InfoPopover title="DOI" text={DOI_DEF} /></span>}
      right={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: M.muted, whiteSpace: 'nowrap' }}>{countText}</span>
          <button type="button" aria-label="Search SKUs" onClick={() => setFullOpen(true)} style={iconBtn}>🔍</button>
          <button type="button" aria-label={status === 'All' ? 'Filter by status' : `Status: ${status}`} aria-haspopup="dialog" onClick={() => setMenuOpen(true)}
            style={{ ...iconBtn, ...(status !== 'All' ? { background: M.green, color: '#fff', borderColor: M.green } : {}) }}>⋯{status !== 'All' ? ` ${status}` : ''}</button>
        </span>
      }>
      <Chips label="Location" options={locChips} value={loc} onChange={setLoc} />
      <MixLegend prefix="Bar = SKUs by status:" parts={MIX_SEGMENTS} style={{ marginBottom: 4 }} />
      <DrillDownList rootLabel="All categories" resetKey={`${resetKey}|${loc}|${status}`} onPathChange={setPath}
        crumbRight={loc !== 'All' ? <span style={{ fontWeight: 600, color: M.ink }}>📍 {loc}</span> : null}
        getRows={getRows} rowKey={r => r.key} rowLabel={r => r.name}
        canOpen={(r, d) => d < 2}
        emptyText={status === 'All' ? 'No stock here' : `No ${status} SKUs here`}
        onLeaf={r => setSel(r)}
        renderRow={(r, d) => d < 2
          ? <>
              <RowText name={r.name} sub={`avg sale ${perDay(r.avgSale)} · DOI ${r.doi == null ? '—' : `${fmtDays(r.doi)}d`}`} value={fmtInt(r.totalInvt)} valueSub="units" />
              <MixBar parts={mixParts(r.counts)} height={4} label={`${r.name}: SKUs by status`} style={{ marginTop: 6 }} />
            </>
          : <RowText name={r.sku} sub={<><StatusDot color={statusColor(r.status)} label={r.status || '—'} fontSize={12} muted /> · avg {perDay(r.avgSale)}</>}
              value={fmtInt(r.totalInvt)} valueSub={`DOI ${fmtDays(r.doi)}d`} />}
        footer={p => !p.length && <ShowAllButton onClick={() => setFullOpen(true)}>Show all {fmtInt(items.length)} SKUs →</ShowAllButton>} />

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Show status">
        {['All', ...STATUS_ORDER].map(st => (
          <button key={st} type="button" aria-pressed={st === status} onClick={() => { setStatus(st); setMenuOpen(false) }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 48, border: 'none', borderTop: `1px solid ${M.line}`, background: 'none', fontFamily: 'var(--font)', cursor: 'pointer', padding: '0 2px' }}>
            {st === 'All' ? <span style={{ fontSize: 14, fontWeight: 600, color: M.ink }}>All statuses</span> : <StatusDot color={statusColor(st)} label={st} fontSize={14} />}
            <span style={{ fontSize: 12.5, color: M.muted }}>{st === 'All' ? all.length : all.filter(it => it.status === st).length} SKUs{st === status ? ' ✓' : ''}</span>
          </button>
        ))}
      </BottomSheet>

      <FullScreenList open={fullOpen} onClose={() => setFullOpen(false)} title={loc === 'All' ? 'All SKUs' : `SKUs at ${loc}`} noun="SKUs" items={items} sorts={SORTS}
        name={it => it.sku} sub={it => `${it.subCategory} · ${it.status || '—'}`} secondary={(it, k) => (k === 'units' ? `DOI ${fmtDays(it.doi)}d` : `${fmtInt(it.totalInvt)} units`)}
        searchText={it => `${it.sku} ${it.category} ${it.subCategory}`} groupOf={it => it.status} onSelect={setSel} />

      <SkuSheet item={sel} loc={loc} regularLocations={regularLocations} onClose={() => setSel(null)} />
    </Card>
  )
}
