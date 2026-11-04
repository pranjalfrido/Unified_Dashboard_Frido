import { useState } from 'react'
import { C } from '../utils.js'
import { useBreakpoint } from '../responsive/useBreakpoint.js'
import MasterTrendCard from '../responsive/MasterTrendCard.jsx'
import { groupSumTrend } from '../responsive/trend.js'
import { Card, KV } from '../responsive/CardKit.jsx'
import InfoStrip from '../responsive/InfoStrip.jsx'
import SegmentToggle from '../responsive/SegmentToggle.jsx'
import MobileRankedList from '../responsive/MobileRankedList.jsx'
import FullScreenList from '../responsive/FullScreenList.jsx'
import BottomSheet from '../responsive/BottomSheet.jsx'
import WatchlistCard from '../responsive/WatchlistCard.jsx'
import FlagChips from '../responsive/FlagChips.jsx'
import StackedDailyBars from '../responsive/StackedDailyBars.jsx'
import MonthRows from '../responsive/MonthRows.jsx'
import DualShareBar from '../responsive/DualShareBar.jsx'
import PacingBar from '../responsive/PacingBar.jsx'
import CompactRankRow from '../responsive/CompactRankRow.jsx'
import MixBar from '../responsive/MixBar.jsx'
import { monthlyTable } from './adsData.js'
import { DetailGate } from '../DetailGate.jsx'
import { useDetailReady } from '../detailPhase.js'

// Ads below 1024px (ADS_MASTER_PLAN.md Part B §3, mockups/ads_mockup.html phone). Display only: AdsTab
// passes the same values its laptop cards / tables show. Order: master card → watchlist → daily spend →
// last 6 months → spend vs revenue share (Overall) → pacing → platform overview (Overall) → Amazon split
// → unattributed line → By category / By product.
const M = C.m
const DAY = d => { const [, m, dd] = d.split('-').map(Number); return `${dd} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}` }
const x2 = v => (v != null && isFinite(v) ? `${v.toFixed(2)}x` : '—')

export default function AdsMobileView({
  channel, metrics, trendRows, start, end, fmt,
  watch, dayRows, series, monthly, shareRows, pacing, overview, amazonSplit,
  unattributed, totalSpend, catRows, prodRows, beRoas, pendingNote,
}) {
  const bp = useBreakpoint()
  // Watchlist, daily-by-channel revenue and category / product spend come from the ads_detail group
  // of /api/bq (or the ads-data.json cache) — staged loading, one loader card each until it lands.
  const detailReady = useDetailReady('ads_detail')
  const layout = bp.isPhoneLandscape ? 'landscape' : bp.width >= 768 ? 'tablet' : 'phone'
  const [dayMode, setDayMode] = useState('spend')
  const [daySel, setDaySel] = useState(null)
  const [monthSel, setMonthSel] = useState(null)
  const [ruleOpen, setRuleOpen] = useState(null)
  const [prodSel, setProdSel] = useState(null)
  const [grp, setGrp] = useState('prod')
  const [catOpen, setCatOpen] = useState(null)

  const flagsOf = r => (r && !r.isCat ? watch?.flagsByKey?.[`${r.category}::${r.subCategory}`] || [] : [])
  const chipProps = { names: watch?.ruleName, labels: watch?.chipName, redIds: ['loss', 'nosales'] }
  const rule = watch?.rules.find(r => r.id === ruleOpen) || null
  const t = monthly?.status === 'ready' ? monthlyTable(monthly.data, monthly.win, series) : null

  const listProps = {
    itemKey: r => (r.isCat ? `c:${r.category}` : `${r.category}::${r.subCategory}`),
    sorts: [
      { key: 'spend', label: 'Spend', value: r => r.spend, format: r => fmt(r.spend) },
      { key: 'roas', label: 'ROAS ↑', value: r => (r.spend > 0 ? -(r.revenue / r.spend) : null), format: r => x2(r.spend > 0 ? r.revenue / r.spend : null), bar: 'bad' },
      { key: 'rev', label: 'Revenue', value: r => r.revenue, format: r => fmt(r.revenue) },
    ],
    name: r => (r.isCat ? r.category : r.subCategory), sub: r => (r.isCat ? `${r.n} product${r.n === 1 ? '' : 's'}` : r.category),
    secondary: (r, k) => (k === 'spend' ? `ROAS ${x2(r.spend > 0 ? r.revenue / r.spend : null)}` : fmt(r.spend) + ' spend'),
    searchText: r => `${r.subCategory || ''} ${r.category}`, groupOf: r => r.category,
    badge: r => <FlagChips ids={flagsOf(r)} variant="mobile" {...chipProps} />,
    valueColor: (r, k) => { if (k !== 'roas' || r.isCat || !(r.spend > 0)) return undefined; const ro = r.revenue / r.spend, be = beRoas?.[r.subCategory]; return (be != null ? ro < be : ro < 1) ? M.down : undefined },
  }

  const day = daySel != null ? dayRows[daySel] : null
  return (
    <div className="ads-mobile ov-mobile" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 24 }}>
      <MasterTrendCard key={channel} metrics={metrics} rawRows={trendRows} groupTrend={groupSumTrend} start={start} end={end} layout={layout} />

      {!detailReady && <DetailGate phase="ads_detail" label="Loading watchlist & daily spend" height={200} />}
      {detailReady && watch && <WatchlistCard result={watch} channel={channel} variant="mobile" title="Ads watchlist" onOpenRule={setRuleOpen} />}

      {detailReady && dayRows.length > 0 && (
        <Card title="Daily spend by channel" right={<span style={{ fontSize: 12, color: M.muted }}>tap a day</span>}>
          <SegmentToggle options={[{ id: 'spend', label: 'Spend' }, { id: 'rev', label: 'Revenue' }]} value={dayMode} onChange={setDayMode} label="Daily view" full />
          <div style={{ height: 8 }} />
          <StackedDailyBars variant="mobile" series={series} fmt={fmt} onSelect={setDaySel} ariaLabel={`Daily ${dayMode} by channel`}
            bars={dayRows.map(d => ({ key: d.date, label: DAY(d.date), pending: dayMode === 'rev' && series.some(s => d.pending[s.key]), segs: Object.fromEntries(series.map(s => [s.key, dayMode === 'spend' ? d.spend[s.key] || 0 : d.rev[s.key] || 0])) }))} />
          {pendingNote && <div style={{ fontSize: 12, color: M.muted, marginTop: 6 }}>{pendingNote}</div>}
        </Card>
      )}

      <Card title="Last 6 months" right={<span style={{ fontSize: 12, color: M.muted }}>tap a month</span>}>
        {!t ? <div aria-busy={monthly?.status !== 'error'} style={{ height: monthly?.status === 'error' ? 'auto' : 200, borderRadius: 12, background: monthly?.status === 'error' ? 'none' : M.soft, fontSize: 13, color: M.muted }}>{monthly?.status === 'error' ? "Couldn't load the monthly data." : ''}</div>
          : <MonthRows onSelect={setMonthSel} months={[...t.months].reverse().map(m => ({
            key: m.key, label: `${m.label} ${m.key.slice(0, 4)}`, partial: m.partial ? `${m.partial}, partial` : null, value: fmt(t.total[m.key].spend),
            sub: `Rev ${fmt(t.total[m.key].rev)} · ROAS ${x2(t.total[m.key].spend > 0 ? t.total[m.key].rev / t.total[m.key].spend : null)}`,
            parts: t.rows.map(r => ({ key: r.key, value: r.byMonth[m.key].spend, color: r.color })),
          }))} />}
        <div style={{ fontSize: 12, color: M.muted, marginTop: 6 }}>Fixed to the last 6 calendar months (not the date picker). Revenue without late-report estimates.</div>
      </Card>

      {shareRows?.length > 0 && <Card title="Spend vs revenue share"><DualShareBar rows={shareRows} limit={5} onAll={() => setRuleOpen('__share')} /></Card>}

      {pacing && <Card title={`${pacing.monthLabel} pacing`} right={<span style={{ fontSize: 12, color: M.muted }}>{pacing.daysElapsed} of {pacing.daysInMonth} days</span>}><PacingBar {...pacing} fmt={fmt} /></Card>}

      {overview?.length > 0 && (
        <Card title="Platform overview" right={<span style={{ fontSize: 12, color: M.muted }}>spend · total-sales ROAS</span>}>
          {overview.map((p, i) => <CompactRankRow key={p.key} name={p.label} value={fmt(p.spend)} pct={`${x2(p.roas)}`} barPct={p.share} last={i === overview.length - 1} />)}
        </Card>
      )}

      {amazonSplit?.length > 0 && (
        <Card title="Spend type split">
          <MixBar parts={amazonSplit} height={10} legend fmt={fmt} label="Amazon spend type split" />
        </Card>
      )}

      {unattributed > 0 && <InfoStrip text={`${fmt(unattributed)} (${totalSpend > 0 ? (unattributed / totalSpend * 100).toFixed(1) : 0}%) not linked to a product`} detail={'e.g. "all products" sale campaigns. Category and product ROAS are on linked spend only; totals include it.'} />}

      {!detailReady && <DetailGate phase="ads_detail" label="Loading category & product spend" height={200} />}
      {detailReady && (prodRows.length > 0 || catRows.length > 0) && (
        <Card title="By category · By product" right={<span style={{ fontSize: 12, color: M.muted }}>{grp === 'prod' ? `${prodRows.length} products` : `${catRows.length} categories`}</span>}>
          <SegmentToggle options={[{ id: 'cat', label: 'Category' }, { id: 'prod', label: 'Product' }]} value={grp} onChange={setGrp} label="Group by" full />
          <div style={{ height: 6 }} />
          <MobileRankedList key={grp} noun={grp === 'prod' ? 'products' : 'categories'} items={grp === 'prod' ? prodRows : catRows} topN={8} {...listProps}
            onSelect={r => (r.isCat ? setCatOpen(r.category) : setProdSel(r))} />
        </Card>
      )}

      {/* rule → its products */}
      <FullScreenList open={!!rule} onClose={() => setRuleOpen(null)} title={rule?.name || ''} noun="products" items={rule?.items || []}
        sorts={[{ key: 'impact', label: '₹ impact', value: x => -x.impact, format: x => fmt(x.impact), bar: 'bad' }]}
        name={x => x.row.subCategory} sub={x => `${x.row.category} · ROAS ${x2(x.row.spend > 0 ? x.row.revenue / x.row.spend : null)}${beRoas?.[x.row.subCategory] != null && isFinite(beRoas[x.row.subCategory]) ? ` vs breakeven ${x2(beRoas[x.row.subCategory])}` : ''}`}
        secondary={x => `${fmt(x.row.spend)} spend`} valueColor={() => (rule?.red ? M.down : undefined)} searchText={x => `${x.row.subCategory} ${x.row.category}`} groupOf={x => x.row.category}
        badge={x => <FlagChips ids={flagsOf(x.row)} variant="mobile" {...chipProps} />} onSelect={x => setProdSel(x.row)} />
      {/* category → its products */}
      <FullScreenList open={!!catOpen} onClose={() => setCatOpen(null)} title={catOpen || ''} noun="products" items={prodRows.filter(r => r.category === catOpen)}
        initialSort="spend" {...listProps} onSelect={r => setProdSel(r)} />

      <BottomSheet open={!!prodSel} onClose={() => setProdSel(null)} title={prodSel?.subCategory || ''} subtitle={prodSel ? `${prodSel.category} · ${channel}` : ''}>
        {prodSel && (() => {
          const ro = prodSel.spend > 0 ? prodSel.revenue / prodSel.spend : null
          const be = beRoas?.[prodSel.subCategory]
          const flags = flagsOf(prodSel)
          return (
            <div>
              {flags.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>{flags.map(id => <span key={id} style={{ fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: ['loss', 'nosales'].includes(id) ? 'rgba(192,57,43,.1)' : 'rgba(200,134,10,.12)', color: ['loss', 'nosales'].includes(id) ? M.down : '#8a5a00' }}>{watch?.ruleName?.[id]}</span>)}</div>}
              <KV items={[
                { label: 'Spend', value: fmt(prodSel.spend) },
                { label: 'Revenue (total sales)', value: fmt(prodSel.revenue) },
                { label: 'ROAS', value: x2(ro), color: ro != null && (be != null ? ro < be : ro < 1) ? M.down : undefined },
                { label: 'Breakeven ROAS', value: be == null ? '—' : isFinite(be) ? x2(be) : 'CM1 ≤ 0' },
              ]} />
            </div>
          )
        })()}
      </BottomSheet>

      <BottomSheet open={!!day} onClose={() => setDaySel(null)} title={day ? DAY(day.date) : ''} subtitle="spend · revenue · total-sales ROAS">
        {day && series.map((s, i) => <CompactRankRow key={s.key} name={s.label} value={fmt(day.spend[s.key] || 0)}
          pct={day.pending[s.key] ? 'rev pending' : `${fmt(day.rev[s.key] || 0)} · ${x2((day.spend[s.key] || 0) > 0 ? (day.rev[s.key] || 0) / day.spend[s.key] : null)}`} barPct={0} last={i === series.length - 1} />)}
      </BottomSheet>

      <BottomSheet open={!!monthSel} onClose={() => setMonthSel(null)} title={monthSel?.label || ''} subtitle="spend · total-sales ROAS by channel">
        {monthSel && t && t.rows.map((r, i) => { const v = r.byMonth[monthSel.key]; return <CompactRankRow key={r.key} name={r.label} value={fmt(v.spend)} pct={x2(v.spend > 0 ? v.rev / v.spend : null)} barPct={0} last={i === t.rows.length - 1} /> })}
      </BottomSheet>

      <BottomSheet open={ruleOpen === '__share'} onClose={() => setRuleOpen(null)} title="Spend vs revenue share" subtitle="all channels">
        {shareRows && <DualShareBar rows={shareRows} />}
      </BottomSheet>
    </div>
  )
}

