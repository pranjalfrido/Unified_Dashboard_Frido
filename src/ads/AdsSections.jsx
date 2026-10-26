import { useState } from 'react'
import { C } from '../utils.js'
import SegmentToggle from '../responsive/SegmentToggle.jsx'
import StackedDailyBars from '../responsive/StackedDailyBars.jsx'
import HeatTable from '../responsive/HeatTable.jsx'
import MonthChannelTable from '../responsive/MonthChannelTable.jsx'
import PacingBar from '../responsive/PacingBar.jsx'
import DualShareBar from '../responsive/DualShareBar.jsx'
import WatchlistCard from '../responsive/WatchlistCard.jsx'
import InfoPopover from '../responsive/InfoPopover.jsx'
import { monthlyTable, TOTAL_SALES_ROAS_INFO } from './adsData.js'

// Ads Phase 2 laptop sections (ADS_MASTER_PLAN.md Part B §1), added under the trend / platform overview:
// watchlist → daily spend by channel (+ heat table) → last 6 months | pacing + spend vs revenue share.
// Display only; the inputs are built in AdsTab from data it already has (see adsData.js).
const M = C.m
const DAY = d => { const [, m, dd] = d.split('-').map(Number); return `${dd} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}` }

function Card({ title, right, sub, children, style }) {
  return (
    <div className="kpi-card" style={{ padding: '14px 16px', minWidth: 0, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: sub ? 2 : 10, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.t1 }}>{title}</div>
        {right}
      </div>
      {sub && <div style={{ fontSize: 12, color: C.t3, marginBottom: 10 }}>{sub}</div>}
      {children}
    </div>
  )
}

export function DailySpendCard({ dayRows, series, fmt, pendingNote }) {
  const [mode, setMode] = useState('spend')
  const bars = dayRows.map(d => {
    const pend = series.some(s => d.pending[s.key])
    if (mode === 'roas') {
      let sp = 0, rv = 0
      series.forEach(s => { if (!d.pending[s.key]) { sp += d.spend[s.key] || 0; rv += d.rev[s.key] || 0 } })
      return { key: d.date, label: DAY(d.date), segs: { roas: sp > 0 ? rv / sp : 0 }, pending: pend, tip: `Total-sales ROAS ${sp > 0 ? (rv / sp).toFixed(2) + 'x' : '—'}${pend ? '\n(pending-revenue channels left out)' : ''}` }
    }
    const segs = Object.fromEntries(series.map(s => [s.key, mode === 'spend' ? d.spend[s.key] || 0 : d.rev[s.key] || 0]))
    const tip = series.map(s => `${s.label}: ${fmt(d.spend[s.key] || 0)} · ${d.pending[s.key] ? 'rev pending' : `${fmt(d.rev[s.key] || 0)} · ${(d.spend[s.key] || 0) > 0 ? ((d.rev[s.key] || 0) / d.spend[s.key]).toFixed(1) + 'x' : '—'}`}`).join('\n')
    return { key: d.date, label: DAY(d.date), segs, pending: mode === 'rev' && pend, tip }
  })
  const barSeries = mode === 'roas' ? [{ key: 'roas', label: 'Total-sales ROAS', color: M.g2 }] : series
  const heatRows = series.map(s => ({ key: s.key, label: s.label, cells: dayRows.map(d => d.spend[s.key] || 0), total: dayRows.reduce((t, d) => t + (d.spend[s.key] || 0), 0), marks: new Set(dayRows.map((d, i) => (d.pending[s.key] ? i : -1)).filter(i => i >= 0)) }))
  return (
    <Card title="Daily spend by channel" right={<SegmentToggle options={[{ id: 'spend', label: 'Spend' }, { id: 'rev', label: 'Revenue' }, { id: 'roas', label: 'ROAS' }]} value={mode} onChange={setMode} label="Daily view" />}
      sub={mode === 'roas' ? 'Blended total-sales ROAS per day (pending-revenue channels left out)' : `${mode === 'spend' ? 'Ad spend' : 'Channel sales ex GST'} per day, stacked by ${series.length > 1 ? (series[0].key === 'Meta' ? 'platform' : 'channel') : 'day'}`}>
      <StackedDailyBars bars={bars} series={barSeries} fmt={mode === 'roas' ? v => `${v.toFixed(1)}x` : fmt} ariaLabel={`Daily ${mode} by channel`} />
      {series.length > 1 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 4 }}>Spend heat · each row shaded against its own busiest day{pendingNote ? ' · ◌ revenue pending' : ''}</div>
          <HeatTable rows={heatRows} cols={dayRows.map(d => Number(d.date.slice(8)))} fmt={fmt} markLabel="revenue pending" />
        </div>
      )}
      {pendingNote && <div style={{ fontSize: 12, color: C.t3, marginTop: 6 }}>{pendingNote}</div>}
    </Card>
  )
}

export function SixMonthsCard({ monthly, series, fmt }) {
  const [mode, setMode] = useState('spend')
  const t = monthly.status === 'ready' ? monthlyTable(monthly.data, monthly.win, series) : null
  const val = (o) => (o == null ? null : mode === 'spend' ? o.spend : mode === 'rev' ? o.rev : (o.spend > 0 ? o.rev / o.spend : null))
  return (
    <Card title="Last 6 months" right={<SegmentToggle options={[{ id: 'spend', label: 'Spend' }, { id: 'rev', label: 'Revenue' }, { id: 'roas', label: 'ROAS' }]} value={mode} onChange={setMode} label="Month view" />}
      sub="Fixed to the last 6 calendar months (not the date picker)">
      {monthly.status === 'loading' || monthly.status === 'idle'
        ? <div aria-busy="true" style={{ height: 180, borderRadius: 10, background: C.bg }} />
        : !t ? <div style={{ fontSize: 13, color: C.t3 }}>Couldn't load the monthly data.</div>
          : <MonthChannelTable months={t.months} fmt={mode === 'roas' ? v => `${v.toFixed(2)}x` : fmt} change={mode === 'spend' ? 'neutral' : 'good-up'}
            rows={t.rows.map(r => ({ key: r.key, label: r.label, values: Object.fromEntries(t.months.map(m => [m.key, val(r.byMonth[m.key])])) }))}
            total={Object.fromEntries(t.months.map(m => [m.key, val(t.total[m.key])]))}
            caption={`* ${t.months[t.months.length - 1].partial} (partial). Revenue = channel sales ex GST without late-report estimates, so the current month's Flipkart / Myntra can sit below the card. Spend ▲/▼ is neutral grey; revenue and ROAS ▲ green.`} />}
    </Card>
  )
}

export function PacingCard({ pacing, fmt }) {
  if (!pacing) return null
  return (
    <Card title={`${pacing.monthLabel} pacing`} right={<span style={{ fontSize: 12, color: C.t3 }}>{pacing.daysElapsed} of {pacing.daysInMonth} days</span>}>
      <PacingBar {...pacing} fmt={fmt} />
    </Card>
  )
}

export function ShareCard({ rows }) {
  const [all, setAll] = useState(false)
  if (!rows?.length) return null
  return (
    <Card title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Spend share vs revenue share<InfoPopover title="Revenue share" text={TOTAL_SALES_ROAS_INFO} style={{ width: 20, height: 20, margin: '-4px 0' }} /></span>}>
      <DualShareBar rows={rows} limit={all ? undefined : 5} onAll={() => setAll(true)} />
    </Card>
  )
}

export default function AdsLaptopSections({ watch, activeRule, onRule, channel, dayRows, series, fmt, pendingNote, monthly, pacing, shareRows }) {
  return (
    <>
      {watch && <WatchlistCard result={watch} channel={channel} activeRule={activeRule} onRule={onRule} title="Ads watchlist" />}
      {dayRows.length > 0 && <DailySpendCard dayRows={dayRows} series={series} fmt={fmt} pendingNote={pendingNote} />}
      <div style={{ display: 'grid', gridTemplateColumns: pacing || shareRows?.length ? 'minmax(0,3fr) minmax(0,2fr)' : '1fr', gap: 14 }}>
        <SixMonthsCard monthly={monthly} series={series} fmt={fmt} />
        {(pacing || shareRows?.length > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <PacingCard pacing={pacing} fmt={fmt} />
            <ShareCard rows={shareRows} />
          </div>
        )}
      </div>
    </>
  )
}
