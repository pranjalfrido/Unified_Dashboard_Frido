import { useState } from 'react'
import { C, fmtN } from '../utils.js'
import { useBreakpoint } from '../responsive/useBreakpoint.js'
import MasterTrendCard from '../responsive/MasterTrendCard.jsx'
import { Card, Chips, ShowAllButton } from '../responsive/CardKit.jsx'
import SegmentToggle from '../responsive/SegmentToggle.jsx'
import MobileRankedList from '../responsive/MobileRankedList.jsx'
import BottomSheet from '../responsive/BottomSheet.jsx'
import WatchlistCard from '../responsive/WatchlistCard.jsx'
import StackedDailyBars from '../responsive/StackedDailyBars.jsx'
import CompactRankRow from '../responsive/CompactRankRow.jsx'
import MixBar from '../responsive/MixBar.jsx'
import MiniBars from '../responsive/MiniBars.jsx'
import InfoPopover from '../responsive/InfoPopover.jsx'
import InfoStrip from '../responsive/InfoStrip.jsx'
import FullScreenTable from '../responsive/FullScreenTable.jsx'
import { heatBg, heatInk } from '../responsive/heat.js'
import {
  GRAINS, chLabel, trimPunct, dur, hrs, pctF, ratio, int, div, periodLabel, avg, PCT_DEFAULT, fcr, changeOf,
  ttrColumns, AGE_BUCKETS, pendencyRows, driverRows, DOW, MAIN, per100, reasonLink,
} from './supportModel.js'

// Customer Support below 1024px (CUSTOMER_MASTER_PLAN.md Part B §B4 / B4a / B4b, mockups/customer_mockup.html).
// Display only. Everything is read from the laptop's own model (supportModel.js): the Detailed KPI sheets
// render sections() rows as they come (same sections, metrics, names, order, days and "vs prev"), so
// nothing here is a second definition of a metric.
const M = C.m
const CH_COLOR = { Chat: M.green, Inbound: M.g2, Email: M.g3, 'Social media': M.g4 }
const isSunday = key => new Date(`${key}T00:00:00`).getDay() === 0

// The laptop's DeltaPill rule (CustomerSupportPage): rates change in points, colour only with a good direction.
function Change({ cur, prev, good, isRate, size = 12.5 }) {
  const c = changeOf(cur, prev, isRate)
  if (!c) return <span style={{ fontSize: size, color: M.muted, fontWeight: 600 }}>—</span>
  const better = c.flat || !good ? null : good === 'up' ? c.v > 0 : c.v < 0
  return <span style={{ fontSize: size, fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: better == null ? M.muted : better ? M.up : M.down }}>{c.v > 0 ? '▲' : c.v < 0 ? '▼' : ''}{c.text}</span>
}

export default function CustomerSupportMobile(p) {
  const { data, grain, setGrain, latest, prev, trendModel, watch, orders7, onNavigate, loading } = p
  const bp = useBreakpoint()
  const layout = bp.isPhoneLandscape ? 'landscape' : bp.width >= 768 ? 'tablet' : 'phone'
  const [frtCh, setFrtCh] = useState('Chat')
  const [hourDay, setHourDay] = useState('all')
  const [heatOpen, setHeatOpen] = useState(false)
  const [pendAll, setPendAll] = useState(null)
  const [drvAll, setDrvAll] = useState(false)
  const dim = { opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }
  const prevLbl = prev ? periodLabel(grain, prev.key) : ''
  const go = id => document.getElementById(`csm-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // ── master card: same values and change rule as the laptop KPI cards ──
  const all = q => q.t('All')
  const kp = [
    { key: 'int', label: 'Interactions', get: q => all(q)?.interactions, f: int, good: null },
    { key: 'uniq', label: 'Unique customers', get: q => all(q)?.unique_int, f: int, good: null },
    { key: 'ito', label: 'Interactions per order (ITO)', tileLabel: 'ITO', get: q => div(all(q)?.interactions, q.orders?.orders), f: ratio, good: 'down' },
    { key: 'itu', label: 'Interactions per unit (ITU)', tileLabel: 'ITU', get: q => div(all(q)?.interactions, q.orders?.units), f: ratio, good: 'down' },
    { key: 'mcr', label: 'MCR (multiple contact)', tileLabel: 'MCR', get: q => div(all(q)?.tasks, all(q)?.interactions), f: pctF, good: 'down' },
    { key: 'fcr', label: 'FCR (first contact)', tileLabel: 'FCR', get: q => fcr(all(q)), f: pctF, good: 'up' },
    { key: 'frt', label: 'Chat agent FRT', get: q => avg(q.t('Chat'), 'afrt_sum', 'afrt_n'), f: dur, good: 'down' },
    { key: 'esc', label: 'Escalation rate', get: q => div(all(q)?.escalations, all(q)?.interactions), f: pctF, good: 'down' },
  ]
  const rows = trendModel.map(q => ({ date: grain === 'month' ? `${q.key}-01` : q.key, ...Object.fromEntries(kp.map(k => [k.key, k.get(q) ?? null])) }))
  const metric = (k, i) => {
    const cur = k.get(latest), pv = prev ? k.get(prev) : null
    const c = changeOf(cur, pv, k.f === pctF)
    return {
      key: k.key, label: k.label, tileLabel: k.tileLabel, value: k.f(cur),
      delta: c ? (k.f === pctF ? c.v : c.v * 100) : null, deltaPts: k.f === pctF, deltaNeutral: !k.good, lowerIsBetter: k.good === 'down',
      sub: i === 0 ? `${int(all(latest)?.unique_int)} unique customers${prevLbl ? ` · prev ${prevLbl}` : ''}` : undefined,
      point: r => r[k.key], fmtPoint: k.f,
    }
  }
  const metrics = kp.map(metric)
  const gran = grain === 'month' ? 'monthly' : grain === 'week' ? 'weekly' : 'daily'

  // ── volume ──
  const volBars = trendModel.map(q => ({ key: q.key, label: periodLabel(grain, q.key), segs: Object.fromEntries(MAIN.map(ch => [ch, q.t(ch)?.interactions || 0])) }))
  const mixParts = MAIN.map(ch => ({ key: ch, label: chLabel(ch), value: latest.t(ch)?.interactions || 0, color: CH_COLOR[ch] })).filter(x => x.value > 0).sort((a, b) => b.value - a.value)
  // ── speed ──
  const frtBars = trendModel.map(q => ({ key: q.key, label: periodLabel(grain, q.key), segs: { v: avg(q.t(frtCh), 'afrt_sum', 'afrt_n') ?? 0 } }))
  const SLA = [['Chat', 'sla_20s', '< 20 sec'], ['Chat', 'sla_40s', '< 40 sec'], ['Email', 'sla_10m', '< 10 min'], ['Email', 'sla_15m', '< 15 min'], ['Social media', 'sla_10m', '< 10 min'], ['Social media', 'sla_15m', '< 15 min']]
  const slaVal = (q, ch, k) => (q ? div(q.t(ch)?.[k], q.t(ch)?.afrt_n) : null)
  // ── calls ──
  const calls = latest.calls
  const funnel = calls ? [['Total calls', calls.total_calls], ['Answered', calls.answered_calls], ['Unique callers', calls.unique_calls], ['Unique answered', calls.unique_answered], ['Unique missed', calls.unique_missed]] : []
  const fMax = Math.max(...funnel.map(x => x[1] || 0), 1)
  const hourly = [...(data.callsHourly || [])].sort((a, b) => a.hr - b.hr)
  // ── demand ──
  const heat = data.heat || []
  const dayIdx = { all: null, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6, Sat: 7, Sun: 1 }
  const hours = Array.from({ length: 24 }, (_, h) => h)
  const byHour = hours.map(h => heat.filter(r => r.hr === h && (dayIdx[hourDay] == null || r.dow === dayIdx[hourDay])).reduce((s, r) => s + (r.n || 0), 0))
  const heatMax = Math.max(...heat.map(r => r.n || 0), 1)
  const drivers = (data.dispo7 || []).filter(r => r.dispo !== '(blank)').map(r => ({ name: trimPunct(r.dispo), cur: Number(r.cur) || 0, prev: Number(r.prev) || 0 })).sort((a, b) => b.cur - a.cur).slice(0, 12)
  const dMax = Math.max(...drivers.map(r => r.cur), 1)
  const agents = (data.agentBoard || []).filter(r => r.agent && r.agent !== 'Unassigned').slice(0, 12)
  const unassigned = (data.agentBoard || []).find(r => r.agent === 'Unassigned')
  const g = GRAINS.find(x => x.id === grain)

  return (
    <div className="cs-mobile ov-mobile" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 24 }}>
      <SegmentToggle options={GRAINS.map(x => ({ id: x.id, label: x.label }))} value={grain} onChange={setGrain} label="Support view" full />
      <div style={dim}>
        <MasterTrendCard metrics={metrics} rawRows={rows} groupTrend={r => r} start={rows[0]?.date} end={rows.at(-1)?.date} granularity={gran} layout={layout}
          note={grain === 'day' ? `Change vs the same weekday last week (${prevLbl || '—'})` : `Change vs the previous ${grain}; the latest ${grain} may be partial`} />
      </div>
      {watch && <div style={dim}><WatchlistCard result={watch} channel="Support" variant="mobile" title="Support watchlist" onOpenRule={id => go(watch.rules.find(r => r.id === id)?.target)} /></div>}

      <section id="csm-volume" style={{ display: 'flex', flexDirection: 'column', gap: 12, ...dim }}>
        <Card title="Volume" sub={`Interactions by channel · ${g.label.toLowerCase()}`}>
          <StackedDailyBars variant="mobile" fmt={int} ariaLabel="Interactions by channel" series={MAIN.map(ch => ({ key: ch, label: chLabel(ch), color: CH_COLOR[ch] }))} bars={volBars} />
          <div style={{ fontSize: 12, fontWeight: 600, color: M.muted, textTransform: 'uppercase', margin: '14px 0 6px' }}>Channel mix · {periodLabel(grain, latest.key)}</div>
          <MixBar height={10} legend fmt={int} label="Channel mix" parts={mixParts} />
        </Card>
      </section>

      <section id="csm-speed" style={{ scrollMarginTop: 12, ...dim }}>
        <Card title="Speed & SLA" sub="Agent first response time, business hours">
          <Chips label="Channel" options={['Chat', 'Email', 'Social media', 'Escalation'].map(ch => ({ id: ch, label: chLabel(ch) }))} value={frtCh} onChange={setFrtCh} />
          <StackedDailyBars variant="mobile" fmt={dur} ariaLabel={`Agent FRT ${frtCh}`} series={[{ key: 'v', label: `Agent FRT · ${chLabel(frtCh)}`, color: M.green }]} bars={frtBars} />
          <div style={{ fontSize: 12, fontWeight: 600, color: M.muted, textTransform: 'uppercase', margin: '14px 0 2px' }}>SLA attainment · {periodLabel(grain, latest.key)}</div>
          {SLA.map(([ch, k, lbl]) => {
            const v = slaVal(latest, ch, k), pv = slaVal(prev, ch, k)
            return (
              <div key={ch + k} style={{ padding: '8px 0', borderBottom: `1px solid ${M.line}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13.5 }}>
                  <span><b>{chLabel(ch)}</b> <span style={{ color: M.muted }}>{lbl}</span></span>
                  <span><b style={{ fontVariantNumeric: 'tabular-nums' }}>{pctF(v)}</b> <Change cur={v} prev={pv} good="up" isRate size={12} /></span>
                </div>
                <div style={{ position: 'relative', height: 6, borderRadius: 3, background: M.line, marginTop: 5 }}>
                  <div style={{ height: '100%', width: `${Math.min((v || 0) * 100, 100)}%`, borderRadius: 3, background: M.green }} />
                  {pv != null && <div title={`previous ${pctF(pv)}`} style={{ position: 'absolute', top: -3, bottom: -3, width: 2, left: `${Math.min(pv * 100, 100)}%`, background: M.ink }} />}
                </div>
              </div>
            )
          })}
          <div style={{ fontSize: 12, color: M.muted, marginTop: 6 }}>Bar = {periodLabel(grain, latest.key)}, tick = {prevLbl || 'previous'}.</div>
        </Card>
      </section>

      <section id="csm-calls" style={{ scrollMarginTop: 12, ...dim }}>
        <Card title="Calls (Ozonetel)" sub={`Inbound line · ${periodLabel(grain, latest.key)}`}>
          {calls ? funnel.map(([l, v], i) => <CompactRankRow key={l} name={l} value={int(v)} pct={i ? pctF(div(v, i < 2 ? calls.total_calls : calls.unique_calls)) : ''} barPct={(v || 0) / fMax * 100} last={i === funnel.length - 1} />)
            : <div style={{ fontSize: 13, color: M.muted }}>{grain === 'day' && isSunday(latest.key) ? 'Closed: the inbound line is closed on Sundays.' : 'No inbound calls in this period (data from 1 Oct 2026; closed on Sundays and holidays).'}</div>}
          {calls && <div style={{ fontSize: 12.5, color: M.ink, marginTop: 8 }}>Answer rate <b>{pctF(div(calls.answered_calls, calls.total_calls))}</b> · AHT <b>{dur(avg(calls, 'aht_sum', 'ans_n'))}</b> · ACW <b>{dur(avg(calls, 'acw_sum', 'ans_n'))}</b></div>}
          {hourly.length > 0 && <>
            <div style={{ fontSize: 12, fontWeight: 600, color: M.muted, textTransform: 'uppercase', margin: '14px 0 6px' }}>Answered vs missed by hour · {data.start} → {data.end}</div>
            <StackedDailyBars variant="mobile" fmt={int} ariaLabel="Answered vs missed by hour" series={[{ key: 'a', label: 'Answered', color: M.green }, { key: 'm', label: 'Missed', color: M.down }]}
              bars={hourly.map(r => ({ key: String(r.hr), label: `${String(r.hr).padStart(2, '0')}:00`, segs: { a: r.answered || 0, m: (r.total || 0) - (r.answered || 0) } }))} />
          </>}
        </Card>
      </section>

      <section id="csm-demand" style={{ display: 'flex', flexDirection: 'column', gap: 12, scrollMarginTop: 12, ...dim }}>
        <Card title="Busiest hours" sub={`Interactions by hour (IST), ${data.trendStart || data.start} → ${data.end}`}>
          <Chips label="Weekday" options={['all', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => ({ id: d, label: d === 'all' ? 'All days' : d }))} value={hourDay} onChange={setHourDay} />
          <StackedDailyBars variant="mobile" fmt={fmtN} ariaLabel="Interactions by hour" series={[{ key: 'v', label: 'Interactions', color: M.green }]} bars={hours.map(h => ({ key: String(h), label: `${String(h).padStart(2, '0')}:00`, segs: { v: byHour[h] } }))} />
          <ShowAllButton onClick={() => setHeatOpen(true)}>Full heatmap →</ShowAllButton>
        </Card>
        <Card title="Orders vs interactions" sub="Shopify D2C orders · interactions · ITO">
          {trendModel.map((q, i) => (
            <CompactRankRow key={q.key} name={periodLabel(grain, q.key)} value={`${int(all(q)?.interactions)} / ${int(q.orders?.orders)}`} pct={`ITO ${ratio(div(all(q)?.interactions, q.orders?.orders))}`}
              barPct={(div(all(q)?.interactions, q.orders?.orders) || 0) / Math.max(...trendModel.map(x => div(all(x)?.interactions, x.orders?.orders) || 0), 0.01) * 100} last={i === trendModel.length - 1} />
          ))}
          <div style={{ fontSize: 12, color: M.muted, marginTop: 6 }}>Interactions / orders per {grain}; bar = ITO (interactions per order).</div>
        </Card>
        <Card title="Top volume drivers" sub={`Dispositions, last 7 days to ${periodLabel('day', data.end)}`}>
          {(drvAll ? drivers : drivers.slice(0, 8)).map((r, i, arr) => {
            const link = reasonLink(r.name)
            return (
              <div key={r.name} style={{ padding: '7px 0', borderBottom: i < arr.length - 1 ? `1px solid ${M.line}` : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13.5 }}>
                  <span style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                  <span style={{ whiteSpace: 'nowrap' }}><b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtN(r.cur)}</b> <Change cur={r.cur} prev={r.prev} good="down" size={12} /></span>
                </div>
                <div style={{ fontSize: 12, color: M.muted, marginTop: 2 }}>
                  {orders7 > 0 ? `${per100(r.cur, orders7)} per 100 orders` : 'per 100 orders: Daily view'}
                  {link && onNavigate && <> · <button type="button" onClick={() => onNavigate(link.dest)} style={{ border: 'none', background: 'none', padding: 0, color: M.green, fontSize: 12, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'var(--font)' }}>{link.label} →</button></>}
                </div>
                <div aria-hidden="true" style={{ height: 3, background: M.line, borderRadius: 2, marginTop: 4 }}><i style={{ display: 'block', height: '100%', width: `${r.cur / dMax * 100}%`, background: M.green, borderRadius: 2 }} /></div>
              </div>
            )
          })}
          {drivers.length > 8 && <ShowAllButton onClick={() => setDrvAll(v => !v)}>{drvAll ? 'Show top 8' : `All ${drivers.length}`}</ShowAllButton>}
        </Card>
        <Card title="Agent leaderboard" sub={`Assigned interactions, ${data.start} → ${data.end}`}>
          <MobileRankedList noun="agents" items={agents} itemKey={r => r.agent} topN={8}
            sorts={[{ key: 'int', label: 'Interactions', value: r => r.interactions, format: r => fmtN(r.interactions) }]}
            name={r => r.agent} sub={r => chLabel(r.main_channel)}
            secondary={r => (r.main_channel === 'Inbound' ? 'FRT n/a (voice)' : `FRT ${dur(avg(r, 'afrt_sum', 'afrt_n'))} · ART ${hrs(avg(r, 'res_sum', 'resolved'))}`)}
            details={[
              { label: 'Main channel', value: r => chLabel(r.main_channel) }, { label: 'Interactions', value: r => fmtN(r.interactions) },
              { label: 'Agent FRT', value: r => (r.main_channel === 'Inbound' ? 'n/a (voice)' : dur(avg(r, 'afrt_sum', 'afrt_n'))) },
              { label: 'ART', value: r => (r.main_channel === 'Inbound' ? 'n/a (voice)' : hrs(avg(r, 'res_sum', 'resolved'))) },
            ]} />
          {unassigned && <div style={{ fontSize: 12, color: M.muted, marginTop: 6 }}>{fmtN(unassigned.interactions)} interactions have no assigned agent (mostly bot-closed chats) and are left out.</div>}
        </Card>
      </section>

      <section id="csm-pending" style={{ display: 'flex', flexDirection: 'column', gap: 12, scrollMarginTop: 12, ...dim }}>
        {['Parent', 'Child'].map(kind => <Pending key={kind} data={data} kind={kind} onAll={() => setPendAll(kind)} />)}
      </section>

      <Detailed {...p} />

      <FullScreenTable open={heatOpen} onClose={() => setHeatOpen(false)} title="Contact heatmap" note={`Interactions by weekday × hour (IST), ${data.trendStart || data.start} → ${data.end}`} head="Day" firstWidth={56}
        cols={hours.map(h => String(h).padStart(2, '0'))}
        rows={[2, 3, 4, 5, 6, 7, 1].map(d => ({ key: String(d), label: DOW[d - 1], cells: hours.map(h => { const n = heat.find(r => r.dow === d && r.hr === h)?.n || 0; return { text: n ? fmtN(n) : '', bg: heatBg(n, heatMax), color: heatInk(n, heatMax) } }) }))} />
      {pendAll && (() => {
        const pr = pendencyRows(data, pendAll)
        const line = (key, label, v, total, strong) => ({ key, label, strong, cells: [...AGE_BUCKETS.map(([k], i) => ({ text: v[k] ? fmtN(v[k]) : '—', color: i >= 5 && v[k] ? M.down : undefined })), { text: fmtN(total), strong: true }] })
        return <FullScreenTable open onClose={() => setPendAll(null)} title={`Pending ${pendAll.toLowerCase()} tickets`} note="By resolver group and age (as of now). 9+ days in red." head="Resolver group" firstWidth={150}
          cols={[...AGE_BUCKETS.map(([, l]) => l), 'Total']} rows={[line('all', 'All resolver groups', pr.all, pr.total, true), ...pr.rows.map(r => line(r.grp, r.grp, r.v, r.total))]} />
      })()}
    </div>
  )
}

function Pending({ data, kind, onAll }) {
  const pr = pendencyRows(data, kind)
  const shades = [M.g4, M.g4, M.g3, M.g3, M.g2, M.down, M.down, M.downDark]
  const old = r => ['9-10', '11-15', '15+'].reduce((s, k) => s + (r.v[k] || 0), 0)
  return (
    <Card title={`Pending ${kind.toLowerCase()} tickets`} right={<span style={{ fontSize: 15, fontWeight: 700, color: M.ink }}>{fmtN(pr.total)}</span>}
      sub={kind === 'Parent' ? 'Parent / no association, created in the last 45 days, not resolved (as of now)' : 'Child tickets by the resolver group they were raised to (as of now)'}>
      {pr.total ? <>
        <MixBar height={10} legend fmt={fmtN} label={`Pending ${kind} by age`} parts={AGE_BUCKETS.map(([k, l], i) => ({ key: k, label: l, value: pr.all[k] || 0, color: shades[i] }))} />
        <div style={{ height: 8 }} />
        {pr.rows.slice(0, 5).map((r, i) => (
          <div key={r.grp} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, minHeight: 40, alignItems: 'center', borderBottom: i < Math.min(5, pr.rows.length) - 1 ? `1px solid ${M.line}` : 'none', fontSize: 13.5 }}>
            <span title={r.grp} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.grp}</span>
            <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}><b>{fmtN(r.total)}</b>{old(r) > 0 && <span style={{ color: M.down, fontSize: 12.5 }}> · {fmtN(old(r))} 9+ d</span>}</span>
          </div>
        ))}
        <ShowAllButton onClick={onAll}>All {pr.rows.length} groups →</ShowAllButton>
      </> : <div style={{ fontSize: 13, color: M.muted }}>No pending {kind.toLowerCase()} tickets.</div>}
      <div style={{ fontSize: 12, color: M.muted, marginTop: 6 }}>Backlog trend: today only (no daily snapshot history yet).</div>
    </Card>
  )
}

// ── Detailed KPIs (B4a): the laptop's sections() as they are, one sheet per section ──
function Detailed({ dData, dModel, dGrain, setDGrain, dHidden, dBack, secs, dLoading, dError }) {
  const [open, setOpen] = useState(null)
  const [mode, setMode] = useState('count')
  const [group, setGroup] = useState(null)
  const [ttrSel, setTtrSel] = useState(null)
  const [ttrFull, setTtrFull] = useState(false)
  const [drvAll, setDrvAll] = useState(false)
  const gd = GRAINS.find(x => x.id === dGrain)
  const shown = dModel.slice(dHidden)
  const sec = secs.find(s => s.id === open)
  const drivers = open === 'drivers' && dData ? driverRows(dData, dModel) : []
  const ttr = open === 'ttr' && dData ? ttrColumns(dData) : []
  const openSec = (id, hasPct) => { setOpen(id); setMode(PCT_DEFAULT[id] || 'count'); setGroup(null); setTtrSel(null); setDrvAll(false); if (!hasPct) setMode('count') }
  const lastLbl = shown.length ? periodLabel(dGrain, shown.at(-1).key) : ''
  const span = shown.length ? `${periodLabel(dGrain, shown[0].key)} → ${lastLbl}` : ''
  const list = [
    ...secs.map(s => ({ id: s.id, title: s.title, n: s.rows.length, hasPct: s.rows.some(r => r.pct) })),
    { id: 'ttr', title: 'TTR: time to resolve', n: null }, { id: 'drivers', title: 'Volume drivers: top 15 by sub category 2', n: 15, hasPct: true },
  ]

  // A function, not a nested component (keeps React from remounting rows on every render)
  const metricRow = ({ r, model = dModel, hidden = dHidden, backN = dBack, grain = dGrain, secId }, key) => {
    const asPct = mode === 'pct' && r.pct
    const vals = model.map(q => (asPct ? r.pct(q) : r.get(q)))
    const f = asPct ? pctF : r.fmt
    const sv = vals.slice(hidden), keys = model.slice(hidden).map(q => q.key)
    const closedAt = i => sv[i] == null && r.closedSunday && grain === 'day' && isSunday(keys[i])
    const cur = vals.at(-1), pv = vals.length > backN ? vals.at(-1 - backN) : null
    const txt = sv.map((v, i) => (closedAt(i) ? 'Closed' : f(v)))
    return (
      <div key={key} className="csm-metric" data-sec={secId} data-group={r.group || ''} data-metric={r.label} data-vals={txt.join('|')} data-delta={changeOf(cur, pv, asPct || r.fmt === pctF)?.text || '—'}
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '2px 10px', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${M.line}` }}>
        <span style={{ fontSize: 13.5, fontWeight: r.strong ? 700 : 500, color: M.ink, display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <span style={{ minWidth: 0 }}>{r.label}</span>{r.hint && <InfoPopover title={r.label} text={r.hint} style={{ width: 22, height: 22 }} />}
        </span>
        <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <b style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums', color: cur == null ? M.muted : M.ink }}>{txt.at(-1)}</b>{' '}
          <Change cur={cur} prev={pv} good={asPct && r.goodPct ? r.goodPct : r.good} isRate={asPct || r.fmt === pctF} size={12} />
        </span>
        <span style={{ fontSize: 12, color: M.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{txt.slice(0, -1).slice(-3).join(' · ')}</span>
        <MiniBars values={sv.map((v, i) => (closedAt(i) ? null : v))} labels={keys.map((k, i) => `${periodLabel(grain, k)}: ${txt[i]}`)} label={r.label} />
      </div>
    )
  }

  const groups = sec ? [...new Set(sec.rows.map(r => r.group).filter(Boolean))] : []
  const g = group && groups.includes(group) ? group : groups[0]
  const secRows = sec ? (groups.length ? sec.rows.filter(r => r.group === g) : sec.rows) : []
  const tSub = [
    { id: 'c', label: 'Created', get: x => x.c, fmt: int, good: null }, { id: 'n', label: 'Resolved', get: x => x.n, fmt: int, good: 'up' },
    { id: 'p', label: 'Pending', get: x => x.c - x.n, fmt: int, good: 'down' }, { id: 't', label: 'TTR', get: x => (x.n ? x.h / x.n : null), fmt: hrs, good: 'down' },
  ]
  // TTR compares each period with the one before it, as the laptop TTR table does.
  const ttrRow = (col, m) => {
    const vals = dModel.map(q => (col.v[q.key] ? m.get(col.v[q.key]) : m.id === 't' ? null : 0))
    return { label: m.label, fmt: m.fmt, good: m.good, get: q => vals[dModel.indexOf(q)], strong: m.id === 't' }
  }

  return (
    <section id="csm-detailed" style={{ scrollMarginTop: 12 }}>
      <Card title="Detailed KPIs" sub={dGrain === 'day' ? 'Every KPI from the CC sheet, last 7 days' : `${gd.label}: the latest ${dGrain} may be partial`}>
        <SegmentToggle options={[{ id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }]} value={dGrain} onChange={setDGrain} label="Detailed KPIs view" full />
        {dError && <div style={{ fontSize: 13, color: M.down, marginTop: 8 }}>Couldn't load the detailed tables: {dError}</div>}
        {!dData && dLoading && <div aria-busy="true" style={{ height: 200, borderRadius: 12, background: M.soft, marginTop: 8 }} />}
        {dData && <div style={{ opacity: dLoading ? 0.6 : 1, marginTop: 6 }}>
          {list.map((s, i) => (
            <button key={s.id} type="button" onClick={() => openSec(s.id, s.hasPct)} className="csm-section"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, width: '100%', minHeight: 48, padding: '6px 0', border: 'none', borderBottom: i < list.length - 1 ? `1px solid ${M.line}` : 'none', background: 'transparent', fontFamily: 'var(--font)', color: M.ink, textAlign: 'left', cursor: 'pointer' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{s.title}</span>
              <span style={{ fontSize: 12, color: M.muted, whiteSpace: 'nowrap' }}>{s.n ? `${s.n} rows ` : ''}›</span>
            </button>
          ))}
          <div style={{ fontSize: 12, color: M.muted, marginTop: 6 }}>{span}; change {gd.delta}. CSAT not available: no survey data.</div>
        </div>}
      </Card>

      <BottomSheet open={!!open} onClose={() => setOpen(null)} title={sec?.title || list.find(s => s.id === open)?.title || ''} subtitle={`${span} · bars = each ${dGrain}, latest darkest`}>
        {sec && <>
          {sec.note && <InfoStrip text={sec.note.length > 70 ? `${sec.note.slice(0, 68)}…` : sec.note} detail={sec.note} />}
          {(groups.length > 1 || sec.rows.some(r => r.pct)) && <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '8px 0 2px' }}>
            {groups.length > 1 && <Chips label="Group" options={groups.map(x => ({ id: x, label: x }))} value={g} onChange={setGroup} />}
            {sec.rows.some(r => r.pct) && <SegmentToggle options={[{ id: 'pct', label: '%' }, { id: 'count', label: 'Count' }]} value={mode} onChange={setMode} label="% or count" full />}
          </div>}
          {secRows.map(r => metricRow({ r, secId: sec.id }, `${r.group || ''}${r.label}`))}
        </>}
        {open === 'drivers' && <>
          <SegmentToggle options={[{ id: 'pct', label: '%' }, { id: 'count', label: 'Count' }]} value={mode} onChange={setMode} label="% or count" full />
          {(drvAll ? drivers : drivers.slice(0, 8)).map(r => <div key={r.label}>{metricRow({ r, secId: "drivers" })}<div style={{ fontSize: 12, color: M.muted, marginTop: -6, paddingBottom: 6 }}>{r.hint}</div></div>)}
          {drivers.length > 8 && <ShowAllButton onClick={() => setDrvAll(v => !v)}>{drvAll ? 'Top 8' : `All ${drivers.length}`}</ShowAllButton>}
        </>}
        {open === 'ttr' && <>
          <InfoStrip text="Created · resolved · pending (as of now) · TTR" detail="TTR = average hours from Created to Resolved / Closed. Change vs the period before, as on laptop." />
          {ttr.filter(c => c.kind === 'type').map(col => (
            <div key={col.label} style={{ background: M.soft, borderRadius: 12, padding: '8px 12px', margin: '8px 0' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{col.label} · {lastLbl}</div>
              {tSub.map(m => metricRow({ r: ttrRow(col, m), backN: 1, secId: `ttr:${col.label}` }, m.id))}
            </div>
          ))}
          <div style={{ fontSize: 12, fontWeight: 600, color: M.muted, textTransform: 'uppercase', margin: '10px 0 2px' }}>Resolver groups (top 12) · tap for every {dGrain}</div>
          {ttr.filter(c => c.kind === 'group').map(col => {
            const x = col.v[shown.at(-1)?.key]
            const on = ttrSel === col.label
            return (
              <div key={col.label}>
                <button type="button" onClick={() => setTtrSel(on ? null : col.label)} title={col.label}
                  style={{ display: 'flex', justifyContent: 'space-between', gap: 8, width: '100%', minHeight: 44, alignItems: 'center', border: 'none', borderBottom: `1px solid ${M.line}`, background: 'transparent', fontFamily: 'var(--font)', color: M.ink, textAlign: 'left', cursor: 'pointer', padding: 0 }}>
                  <span style={{ fontSize: 13.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.label}</span>
                  <span style={{ fontSize: 12.5, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>TTR <b>{hrs(x && x.n ? x.h / x.n : null)}</b> · pending {int(x ? x.c - x.n : 0)} {on ? '▴' : '▾'}</span>
                </button>
                {on && <div style={{ padding: '0 0 6px 10px' }}>{tSub.map(m => metricRow({ r: ttrRow(col, m), backN: 1, secId: `ttr:${col.label}` }, m.id))}</div>}
              </div>
            )
          })}
          <ShowAllButton onClick={() => setTtrFull(true)}>Full table →</ShowAllButton>
        </>}
      </BottomSheet>
      {ttrFull && (() => {
        const cols = ttrColumns(dData)
        return <FullScreenTable open onClose={() => setTtrFull(false)} title="TTR: time to resolve" note="Per period: Created · Resolved · Pending · TTR (hours)." head="Group" firstWidth={150}
          cols={shown.flatMap(q => tSub.map(m => ({ label: `${periodLabel(dGrain, q.key)} ${m.label === 'Created' ? 'C' : m.label === 'Resolved' ? 'R' : m.label === 'Pending' ? 'P' : 'TTR'}`, title: `${periodLabel(dGrain, q.key)} · ${m.label}` })))}
          rows={cols.map(col => ({ key: col.label, label: col.label, strong: col.kind === 'type', cells: shown.flatMap(q => tSub.map(m => { const x = col.v[q.key]; return { text: m.fmt(x ? m.get(x) : m.id === 't' ? null : 0) } })) }))} />
      })()}
    </section>
  )
}
