import { useState } from 'react'
import { C, fmt, fmtN, pct } from '../utils.js'
import { useBreakpoint } from '../responsive/useBreakpoint.js'
import MasterTrendCard from '../responsive/MasterTrendCard.jsx'
import MobileRankedList from '../responsive/MobileRankedList.jsx'
import CompactRankRow from '../responsive/CompactRankRow.jsx'
import SegmentToggle from '../responsive/SegmentToggle.jsx'
import InfoStrip from '../responsive/InfoStrip.jsx'
import FullScreenList from '../responsive/FullScreenList.jsx'
import BottomSheet from '../responsive/BottomSheet.jsx'
import { groupSumTrend } from '../responsive/trend.js'
import { SALES_MOBILE, PRODUCT_SORTS } from './mobileChannelConfig.js'

// Sales tab below 1024px (docs/responsive/SALES_MOBILE_REDESIGN_PROMPT.md). Display only: every
// value comes in from the channel tab, which computes it exactly as its desktop view does; this
// file lays the values out in the order src/sales/mobileChannelConfig.js gives for the channel.
//   channel   key in SALES_MOBILE ('all', 'shopify', 'amazon:sc', …)
//   metrics   { [key]: { label, tileLabel, def, value, sub, delta, lowerIsBetter, point, prevPoint, fmtPoint } }
//   trendRows daily rows for the master card's chart ({ date, ...numbers }, summed per period)
//   data      section inputs: { channels, categories, products, skus, regions, tiers, states, cities,
//             stores, storeTotal, accounts, reasons, notes, period }
const M = C.m
const titleCase = s => (s || '').toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase())
const pctText = v => (v == null || !isFinite(v) ? '—' : `${v.toFixed(1)}%`)

function Card({ title, right, sub, children, className }) {
  return (
    <section className={className} style={{ background: M.card, borderRadius: M.radius.card, padding: 16, boxShadow: M.cardShadow, minWidth: 0 }}>
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: sub ? 2 : 10 }}>
          <h2 style={{ margin: 0, fontSize: M.type.cardTitle, fontWeight: 700, color: M.ink }}>{title}</h2>
          {right}
        </div>
      )}
      {sub && <div style={{ fontSize: 12, color: M.muted, marginBottom: 10 }}>{sub}</div>}
      {children}
    </section>
  )
}

function ShowAllButton({ children, onClick }) {
  return (
    <button type="button" onClick={onClick}
      style={{ marginTop: 10, width: '100%', minHeight: 44, borderRadius: 12, border: `1px solid ${M.line}`, background: '#fff', color: M.green, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>{children}</button>
  )
}

// Compact ranked rows with "Show all N" growing the list in place (no inner scroll).
function CompactList({ rows, top = 8, noun, onSelect }) {
  const [all, setAll] = useState(false)
  const shown = all ? rows : rows.slice(0, top)
  const max = Math.max(...rows.map(r => r.bar ?? r.raw ?? 0), 0) || 1
  if (!rows.length) return <div style={{ fontSize: 13, color: M.muted, padding: '8px 0' }}>No data for this period</div>
  return (
    <>
      {shown.map((r, i) => (
        <CompactRankRow key={r.key} name={r.name} value={r.value} pct={r.pct} delta={r.delta} barPct={((r.bar ?? r.raw ?? 0) / max) * 100}
          last={i === shown.length - 1} onClick={onSelect ? () => onSelect(r) : undefined} />
      ))}
      {rows.length > top && <ShowAllButton onClick={() => setAll(a => !a)}>{all ? `Show top ${top}` : `Show all ${rows.length} ${noun}`}</ShowAllButton>}
    </>
  )
}

// ── Sections ─────────────────────────────────────────────────────────
function ChannelShareCard({ channels, onOpenChannel }) {
  const [basis, setBasis] = useState('gross')
  const total = channels.reduce((s, c) => s + (basis === 'gross' ? c.gross : (c.net || 0)), 0)
  const rows = [...channels].sort((a, b) => (basis === 'gross' ? b.gross - a.gross : (b.net || 0) - (a.net || 0))).map(c => {
    const v = basis === 'gross' ? c.gross : c.net
    return { key: c.key, id: c.id, name: c.name, raw: v || 0, value: v == null ? '—' : fmt(v), pct: total > 0 && v != null ? `${(v / total * 100).toFixed(1)}%` : '—' }
  })
  return (
    <Card title="Channel share" right={<SegmentToggle label="Revenue basis" value={basis} onChange={setBasis} options={[{ id: 'gross', label: 'Gross' }, { id: 'net', label: 'Net' }]} />}>
      <CompactList rows={rows} top={6} noun="channels" onSelect={r => r.id && onOpenChannel?.(r.id)} />
    </Card>
  )
}

function CategoriesCard({ data, sorts, period, hasSku }) {
  const [view, setView] = useState('category')
  const opts = [{ id: 'category', label: 'Category' }, { id: 'product', label: 'Product' }, ...(hasSku ? [{ id: 'sku', label: 'SKU' }] : [])]
  const totalRev = data.totalRev || 0
  return (
    <Card title={view === 'category' ? 'Categories' : view === 'product' ? 'Products' : 'SKUs'} right={<SegmentToggle label="Show" value={view} onChange={setView} options={opts} />}>
      {view === 'category' && (
        <CompactList noun="categories" top={8}
          rows={(data.categories || []).map(c => ({ key: c.name, name: c.name, raw: c.rev, value: fmt(c.rev), pct: totalRev > 0 ? pct(c.rev, totalRev) : '—' }))} />
      )}
      {view === 'product' && (
        <MobileRankedList title={null} noun="products" items={data.products || []} itemKey={r => `${r.cat}::${r.sc}`}
          name={r => r.sc} sub={r => r.cat} groupOf={r => r.cat} searchText={r => `${r.sc} ${r.cat}`}
          sorts={sorts} sheetSubtitle={period}
          secondary={(r, k) => (k === 'gross' ? `${r.sharePct.toFixed(1)}% · Net ${fmt(r.net)}` : `Gross ${fmt(r.gross)}`)}
          details={sorts.map(s => ({ label: s.label, value: s.format })).concat([{ label: 'Category', value: r => r.cat }])} />
      )}
      {view === 'sku' && (
        <MobileRankedList title={null} noun="SKUs" items={data.skus || []} itemKey={r => r.sku}
          name={r => r.sku} sub={r => `${r.sc} · ${r.cat}`} groupOf={r => r.cat} searchText={r => `${r.sku} ${r.sc} ${r.cat}`}
          sorts={sorts.filter(s => s.sku !== false)} sheetSubtitle={period}
          secondary={(r, k) => (k === 'gross' ? `Net ${fmt(r.net)}` : `Gross ${fmt(r.gross)}`)}
          details={sorts.filter(s => s.sku !== false).map(s => ({ label: s.label, value: s.format })).concat([{ label: 'Product', value: r => r.sc }, { label: 'Category', value: r => r.cat }])} />
      )}
    </Card>
  )
}

function RegionTierCard({ regions, tiers, note }) {
  const hasTier = (tiers || []).length > 0
  const [view, setView] = useState('region')
  const src = view === 'region' || !hasTier ? regions : tiers
  const total = (src || []).reduce((s, r) => s + (r.rev || 0), 0)
  const rows = [...(src || [])].sort((a, b) => b.rev - a.rev).map(r => ({ key: r.name, name: r.name, raw: r.rev, value: fmt(r.rev), pct: total > 0 ? `${(r.rev / total * 100).toFixed(1)}%` : '—' }))
  return (
    <Card title={view === 'region' || !hasTier ? 'Region' : 'City tier'}
      right={hasTier ? <SegmentToggle label="Group by" value={view} onChange={setView} options={[{ id: 'region', label: 'Region' }, { id: 'tier', label: 'City tier' }]} /> : null}>
      {note && <InfoStrip text={note} style={{ marginBottom: 8 }} />}
      <CompactList rows={rows} top={8} noun={view === 'region' ? 'regions' : 'tiers'} />
    </Card>
  )
}

function GeoCard({ states, cities, note, period }) {
  const [view, setView] = useState('state')
  const [full, setFull] = useState(false)
  const [sel, setSel] = useState(null)
  const list = view === 'state' ? states : cities
  const noun = view === 'state' ? 'states' : 'cities'
  const fmtName = view === 'state' ? titleCase : titleCase
  const rows = (list || []).map(r => ({ key: r.name, name: fmtName(r.name), raw: r.rev, value: fmt(r.rev), pct: pctText(r.sharePct), delta: r.mom, item: r }))
  const sorts = [
    { key: 'rev', label: 'Revenue', value: r => r.rev, format: r => fmt(r.rev) },
    { key: 'orders', label: 'Orders', value: r => r.orders, format: r => fmtN(r.orders || 0) },
    { key: 'mom', label: 'vs Prev', value: r => r.mom, format: r => (r.mom == null ? '—' : `${r.mom >= 0 ? '▲' : '▼'}${Math.abs(r.mom).toFixed(1)}%`) },
  ]
  return (
    <Card title={view === 'state' ? 'Top states' : 'Top cities'} sub="Share of revenue · ▲/▼ = change in revenue vs previous period"
      right={<SegmentToggle label="Show" value={view} onChange={v => { setView(v); setFull(false) }} options={[{ id: 'state', label: 'State' }, { id: 'city', label: 'City' }]} />}>
      {note && <InfoStrip text={note} style={{ marginBottom: 8 }} />}
      {rows.length ? (
        <>
          {rows.slice(0, 8).map((r, i, a) => (
            <CompactRankRow key={r.key} name={`${i + 1}. ${r.name}`} value={r.value} pct={r.pct} delta={r.delta} barPct={(r.raw / (rows[0].raw || 1)) * 100}
              last={i === a.length - 1} onClick={() => setSel(r.item)} />
          ))}
          {rows.length > 8 && <ShowAllButton onClick={() => setFull(true)}>Show all {rows.length} {noun} →</ShowAllButton>}
        </>
      ) : <div style={{ fontSize: 13, color: M.muted, padding: '8px 0' }}>No data for this period</div>}
      <FullScreenList open={full} onClose={() => setFull(false)} title={`All ${noun}`} noun={noun} items={list || []} sorts={sorts}
        name={r => fmtName(r.name)} sub={r => (r.state ? titleCase(r.state) : null)} searchText={r => `${r.name} ${r.state || ''}`}
        secondary={(r, k) => (k === 'rev' ? `${pctText(r.sharePct)} share` : fmt(r.rev))} onSelect={setSel} />
      <BottomSheet open={!!sel} onClose={() => setSel(null)} title={sel ? fmtName(sel.name) : ''} subtitle={period}>
        {sel && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
            {[['Revenue', fmt(sel.rev)], ['Share', pctText(sel.sharePct)], ['Orders', sel.orders != null ? fmtN(sel.orders) : '—'], ['vs Prev', sel.mom == null ? '—' : `${sel.mom >= 0 ? '▲' : '▼'}${Math.abs(sel.mom).toFixed(1)}%`],
              ...(sel.extra || [])].map(([k, v]) => (
              <div key={k} style={{ background: M.soft, borderRadius: M.radius.tile, padding: '10px 12px', minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em', color: M.muted }}>{k}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: M.ink, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
              </div>
            ))}
          </div>
        )}
      </BottomSheet>
    </Card>
  )
}

function StoresCard({ stores, total, period }) {
  const sorts = [
    { key: 'gross', label: 'Gross rev', value: r => r.gross, format: r => fmt(r.gross) },
    { key: 'net', label: 'Net rev', value: r => r.net, format: r => fmt(r.net) },
    { key: 'orders', label: 'Orders', value: r => r.orders, format: r => fmtN(r.orders) },
    { key: 'units', label: 'Units', value: r => r.units, format: r => fmtN(r.units) },
    { key: 'aov', label: 'AOV', value: r => r.aov, format: r => fmt(r.aov) },
    { key: 'cancelPct', label: 'Cancel %', value: r => r.cancelPct, format: r => pctText(r.cancelPct), bar: 'bad' },
    { key: 'cirPct', label: 'CIR %', value: r => r.cirPct, format: r => pctText(r.cirPct), bar: 'bad' },
    { key: 'returnPct', label: 'Total return %', value: r => r.returnPct, format: r => pctText(r.returnPct), bar: 'bad' },
  ]
  return (
    <Card title="Store-wise sales" sub={total}>
      <MobileRankedList title={null} noun="stores" items={stores} itemKey={r => r.name} name={r => r.name} sorts={sorts} topN={8} sheetSubtitle={period}
        secondary={(r, k) => (k === 'gross' ? `${pctText(r.sharePct)} share` : `Gross ${fmt(r.gross)}`)} details={sorts.map(s => ({ label: s.label, value: s.format }))} />
    </Card>
  )
}

function AccountsCard({ accounts, note }) {
  const total = accounts.reduce((s, a) => s + (a.rev || 0), 0)
  const rows = accounts.map(a => ({ key: a.name, name: a.name, raw: a.rev, value: fmt(a.rev), pct: a.units != null ? `${fmtN(a.units)} units` : (total > 0 ? `${(a.rev / total * 100).toFixed(1)}%` : '—') }))
  return (
    <Card title="Account breakdown" sub={note}>
      <CompactList rows={rows} top={6} noun="accounts" />
    </Card>
  )
}

function ReasonsCard({ reasons, sub }) {
  const [sel, setSel] = useState(null)
  const rows = reasons.map(r => ({ key: r.name, name: r.name, raw: r.count, value: fmtN(r.count), pct: pctText(r.pct), item: r }))
  return (
    <Card title="Return reasons" sub={sub}>
      <CompactList rows={rows} top={8} noun="reasons" onSelect={r => setSel(r.item)} />
      <BottomSheet open={!!sel} onClose={() => setSel(null)} title={sel?.name || ''} subtitle={sel ? `${fmtN(sel.count)} orders · ${pctText(sel.pct)}` : ''}>
        {sel && (sel.children || []).map((c, i, a) => (
          <CompactRankRow key={c.name} name={c.name} value={fmtN(c.count)} pct={pctText(c.pct)} barPct={(c.count / (a[0]?.count || 1)) * 100} last={i === a.length - 1} />
        ))}
        {sel && sel.byCategory?.length > 0 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: M.muted, margin: '14px 0 2px' }}>By category</div>
            {sel.byCategory.map((c, i, a) => <CompactRankRow key={c.name} name={c.name} value={pctText(c.pct)} pct="" barPct={c.pct} last={i === a.length - 1} />)}
          </>
        )}
      </BottomSheet>
    </Card>
  )
}

// ── View ────────────────────────────────────────────────────────────
export default function SalesMobileView({ channel, metrics, trendRows, start, end, data = {}, onOpenChannel }) {
  const bp = useBreakpoint()
  const cfg = SALES_MOBILE[channel]
  if (!cfg) return null
  if (cfg.placeholder) {
    return (
      <div className="sales-mobile" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 24 }}>
        <Card title={cfg.placeholder.title} right={<span style={{ fontSize: 12, fontWeight: 700, color: M.amber, border: `1px solid ${M.amber}`, borderRadius: 999, padding: '2px 8px' }}>In progress</span>}>
          <div style={{ fontSize: 13, color: M.muted }}>{cfg.placeholder.text}</div>
        </Card>
      </div>
    )
  }
  const layout = bp.isPhoneLandscape ? 'landscape' : bp.width >= 768 ? 'tablet' : 'phone'
  const tiles = cfg.tiles.map(k => ({ key: k, ...metrics[k], deltasHidden: !cfg.deltas || metrics[k]?.deltasHidden })).filter(t => t.value != null)
  const sorts = (cfg.productSorts || []).map(k => PRODUCT_SORTS[k]).filter(Boolean)
  const sec = {
    channelShare: () => data.channels?.length > 0 && <ChannelShareCard key="cs" channels={data.channels} onOpenChannel={onOpenChannel} />,
    categories: () => (data.categories || data.products) && <CategoriesCard key="cat" data={data} sorts={sorts} period={data.period} hasSku={cfg.sku && (data.skus || []).length > 0} />,
    stores: () => data.stores?.length > 0 && <StoresCard key="st" stores={data.stores} total={data.storeTotal} period={data.period} />,
    accounts: () => data.accounts?.length > 0 && <AccountsCard key="acc" accounts={data.accounts} note={data.accountsNote} />,
    reasons: () => data.reasons?.length > 0 && <ReasonsCard key="rr" reasons={data.reasons} sub={data.reasonsSub} />,
    regionTier: () => (data.regions?.length > 0 || data.tiers?.length > 0) && <RegionTierCard key="rt" regions={data.regions || []} tiers={data.tiers || []} note={data.regionNote} />,
    geo: () => !(data.states || data.cities || data.geoUnavailable) ? null : data.geoUnavailable
      ? <Card key="geo" title="Top states & cities"><InfoStrip text={data.geoUnavailable} /></Card>
      : <GeoCard key="geo" states={data.states || []} cities={data.cities || []} note={data.geoNote} period={data.period} />,
  }
  // One column at every width below 1024px; tablets get wider cards and a 4-up tile grid.
  return (
    <div className="sales-mobile ov-mobile" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 24 }}>
      <MasterTrendCard key={channel} metrics={tiles} rawRows={trendRows || []} groupTrend={groupSumTrend} start={start} end={end} layout={layout}
        note={data.note ? <InfoStrip text={data.note} detail={data.noteDetail} /> : null} />
      {cfg.sections.map(s => sec[s]?.()).filter(Boolean)}
    </div>
  )
}
