import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Card, ChartTooltip, chartLegendProps, ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from './components.jsx'
import { C as BASE_C, fmt, fmtN, exportCSV } from './utils.js'

// Customer Support (CC dashboard): Freshdesk tickets + Ozonetel calls + Shopify D2C orders,
// laid out as the CC spec sheet does — KPIs down the side, periods across (Day 1..7,
// Week 1..4, Month 1..2). All numbers come from /api/customer-support; definitions are in the
// header comment of api/customer-support.js and repeated in the row tooltips here.

const C = BASE_C
const API = import.meta.env.VITE_API_URL || ''
const GRAINS = [
  { id: 'day', label: 'Daily', n: 7, delta: 'DoD' },
  { id: 'week', label: 'Weekly', n: 4, delta: 'WoW' },
  { id: 'month', label: 'Monthly', n: 2, delta: 'MoM' },
]
const CHANNELS = ['Chat', 'Inbound', 'Email', 'Social media', 'Escalation']

// ── formatting ──
const dur = (s) => {
  if (s == null || !isFinite(s)) return '—'
  if (s < 60) return `${Math.round(s)}s`
  if (s < 3600) return `${(s / 60).toFixed(1)}m`
  return `${(s / 3600).toFixed(1)}h`
}
const hrs = (h) => (h == null || !isFinite(h) ? '—' : `${h.toFixed(1)}h`)
const pctF = (v) => (v == null || !isFinite(v) ? '—' : `${(v * 100).toFixed(1)}%`)
const ratio = (v) => (v == null || !isFinite(v) ? '—' : v.toFixed(2))
const int = (v) => (v == null || !isFinite(v) ? '—' : fmtN(Math.round(v)))
const money = (v) => (v == null || !isFinite(v) ? '—' : fmt(v))
const div = (a, b) => (a == null || !b ? null : a / b)

function periodLabel(grain, key) {
  if (grain === 'month') {
    const [y, m] = key.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
  const d = new Date(key + 'T00:00:00Z')
  const s = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return grain === 'week' ? `Wk ${s}` : `${d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' })} ${s}`
}

// ── data shaping: one accessor per period ──
function buildModel(data) {
  const by = (rows, k = 'bucket') => Object.fromEntries((rows || []).map(r => [r[k], r]))
  const tix = {}
  for (const r of data.tickets || []) (tix[r.bucket] ||= {})[r.ch] = r
  const calls = by(data.calls), voice = by(data.voiceAgents), orders = by(data.orders)
  const agents = {}
  for (const r of data.agents || []) (agents[r.bucket] ||= {})[r.channel] = r.agents
  return data.periods.map(p => ({
    key: p,
    t: (ch = 'All') => tix[p]?.[ch] || null,
    calls: calls[p] || null,
    voice: voice[p] || null,
    orders: orders[p] || null,
    agents: agents[p] || {},
  }))
}

// avg of a sum/count pair on a ticket row
const avg = (row, sum, n) => (row && row[n] ? row[sum] / row[n] : null)

// Tables that carry a % / Count toggle open in Count, except SLA, which is a share by nature.
const PCT_DEFAULT = { sla: 'pct' }

// FCR = share of Parent + blank tickets that did NOT need a child ticket (100% - MCR). A period's
// child tickets are not always children of that same period's parents, so it is clamped at 0.
const fcr = (row) => (row?.interactions ? Math.max(0, 1 - (row.tasks || 0) / row.interactions) : null)

function sections(model) {
  const T = (ch) => (p) => p.t(ch)
  const channelRows = CHANNELS.flatMap(ch => {
    if (ch === 'Inbound') {
      return [
        { group: ch, label: 'FRT', hint: 'Ozonetel inbound: average time to answer (answered calls)', fmt: dur, good: 'down', get: p => avg(p.calls, 'tta_sum', 'answered_calls') },
        { group: ch, label: 'AHT', hint: 'Ozonetel inbound: average handling time (answered calls)', fmt: dur, good: 'down', get: p => avg(p.calls, 'aht_sum', 'ans_n') },
        { group: ch, label: 'ACW', hint: 'Ozonetel inbound: average after-call wrap-up time', fmt: dur, good: 'down', get: p => avg(p.calls, 'acw_sum', 'ans_n') },
      ]
    }
    return [
      { group: ch, label: 'FRT', hint: 'Ticket created → first public reply from us (automated replies included), in Freshdesk business hours', fmt: dur, good: 'down', get: p => avg(T(ch)(p), 'frt_sum', 'frt_n') },
      { group: ch, label: 'Agent FRT', hint: 'Ticket created → first public reply from a Freshdesk agent, in business hours (chat/email 10:00–19:00, social 08:00–22:00)', fmt: dur, good: 'down', get: p => avg(T(ch)(p), 'afrt_sum', 'afrt_n') },
      { group: ch, label: 'ART', hint: 'Average resolution time of resolved tickets', fmt: hrs, good: 'down', get: p => avg(T(ch)(p), 'res_sum', 'res_n') },
    ]
  })

  const units = p => p.orders?.units, ordersN = p => p.orders?.orders
  const all = p => p.t('All')
  return [
    {
      id: 'channel', title: 'Channel performance',
      note: 'FRT · Agent FRT · AHT / ART · ACW by channel. CSAT is not shown: no survey data is synced to BigQuery yet.',
      rows: channelRows,
    },
    {
      id: 'business', title: 'Orders & interaction conversion',
      note: 'Shopify D2C (MyFrido + Mobility). Interactions = Parent + blank association tickets.',
      rows: [
        { label: 'Revenue achieved', fmt: money, good: 'up', hint: 'Shopify D2C order value incl. GST', get: p => p.orders?.revenue },
        { label: 'Actual orders', fmt: int, good: 'up', get: ordersN },
        { label: 'Actual items', fmt: int, good: 'up', get: units },
        { label: 'ITU', hint: 'Interaction to unit = interactions / Shopify D2C units sold (lower is better)', fmt: ratio, good: 'down', get: p => div(all(p)?.interactions, units(p)) },
        { label: 'Task to unit', hint: 'Tasks (Child tickets) / Shopify D2C units sold (lower is better)', fmt: ratio, good: 'down', get: p => div(all(p)?.tasks, units(p)) },
        { label: 'ITO', hint: 'Interaction to order = interactions / Shopify D2C orders (lower is better)', fmt: ratio, good: 'down', get: p => div(all(p)?.interactions, ordersN(p)) },
        { label: 'Task to order', hint: 'Tasks (Child tickets) / Shopify D2C orders (lower is better)', fmt: ratio, good: 'down', get: p => div(all(p)?.tasks, ordersN(p)) },
        { label: 'UITU', hint: 'Unique interaction to unit = ordered units / unique customers contacting', fmt: ratio, get: p => div(units(p), all(p)?.unique_int) },
        { label: 'UITO', hint: 'Unique interaction to order = orders / unique customers contacting', fmt: ratio, get: p => div(ordersN(p), all(p)?.unique_int) },
        { label: 'CITU', hint: 'Customer interaction to unit = units / customer-initiated interactions (outbound excluded)', fmt: ratio, get: p => div(units(p), all(p)?.cust_int) },
        { label: 'CITO', hint: 'Customer interaction to order = orders / customer-initiated interactions', fmt: ratio, get: p => div(ordersN(p), all(p)?.cust_int) },
      ],
    },
    {
      id: 'interactions', title: 'Interactions',
      note: 'Association type Parent + blank. Escalation = tickets in the Escalations / CXO-Escalations groups.',
      rows: [
        ...['Chat', 'Inbound', 'Email', 'Social media', 'Escalation'].map(ch => ({
          label: ch === 'Chat' ? 'Chat (WhatsApp)' : ch, fmt: int, get: p => p.t(ch)?.interactions,
          pct: p => div(p.t(ch)?.interactions, all(p)?.interactions),
          hint: { Chat: 'WhatsApp', Inbound: 'Freshdesk phone tickets', Email: 'Email, outbound email and portal', 'Social media': 'Instagram and Facebook', Escalation: 'Tickets in the Escalations / CXO-Escalations groups' }[ch],
        })),
        { label: 'Total interactions', fmt: int, strong: true, get: p => all(p)?.interactions, pct: p => div(all(p)?.interactions, all(p)?.interactions) },
        { label: 'Unique interactions', fmt: int, hint: 'Distinct customers (contact id, else phone, else email)', get: p => all(p)?.unique_int, pct: p => div(all(p)?.unique_int, all(p)?.interactions) },
        { label: 'Customer-initiated', fmt: int, hint: 'Excludes voice-outbound, outbound email and outbound-call tickets', get: p => all(p)?.cust_int, pct: p => div(all(p)?.cust_int, all(p)?.interactions) },
        { label: 'Escalation to interaction', fmt: pctF, good: 'down', get: p => div(all(p)?.escalations, all(p)?.interactions) },
      ],
    },
    {
      id: 'tasks', title: 'Tasks',
      note: 'Tasks are Child tickets.',
      rows: [
        { label: 'Tasks', fmt: int, get: p => all(p)?.tasks, pct: p => div(all(p)?.tasks, all(p)?.interactions), hint: '% = share of interactions' },
        { label: 'Interaction to task', hint: 'Child / (Parent + blank)', fmt: pctF, good: 'down', get: p => div(all(p)?.tasks, all(p)?.interactions) },
        { label: 'Tasks to units', hint: 'Child tickets / ordered units', fmt: pctF, good: 'down', get: p => div(all(p)?.tasks, units(p)) },
        { label: 'FRT (all channels)', fmt: dur, good: 'down', get: p => avg(all(p), 'frt_sum', 'frt_n') },
        { label: 'Agent FRT (all channels)', fmt: dur, good: 'down', get: p => avg(all(p), 'afrt_sum', 'afrt_n') },
      ],
    },
    {
      id: 'contact', title: 'Contact resolution (MCR / FCR)',
      note: 'MCR = child tickets ÷ (Parent + blank association tickets): the share of contacts that needed a follow-up task. FCR = 100% − MCR. By channel, a child ticket counts on the channel it was created on.',
      rows: [
        { group: 'Overall', label: 'MCR', fmt: pctF, good: 'down', strong: true, hint: 'Child tickets ÷ (Parent + blank)', get: p => div(all(p)?.tasks, all(p)?.interactions) },
        { group: 'Overall', label: 'FCR', fmt: pctF, good: 'up', strong: true, hint: '100% − MCR', get: p => fcr(all(p)) },
        { group: 'Overall', label: 'Child tickets', fmt: int, get: p => all(p)?.tasks },
        { group: 'Overall', label: 'Parent + blank (interactions)', fmt: int, get: p => all(p)?.interactions },
        ...['Chat', 'Inbound', 'Email', 'Social media'].flatMap(ch => [
          { group: ch === 'Chat' ? 'Chat (WhatsApp)' : ch, label: 'MCR', fmt: pctF, good: 'down', get: p => div(p.t(ch)?.tasks, p.t(ch)?.interactions) },
          { group: ch === 'Chat' ? 'Chat (WhatsApp)' : ch, label: 'FCR', fmt: pctF, good: 'up', get: p => fcr(p.t(ch)) },
        ]),
      ],
    },
    {
      id: 'escalations', title: 'Escalations & CXO escalations',
      note: 'Tickets in the Escalations and CXO-Escalations groups (Parent + blank), same metrics as the other channels. Resolved rate = tickets with a resolution time ÷ tickets; MCR / FCR as in Contact resolution.',
      rows: [
        ...[
          ['All escalations', 'Escalation'],
          ['Escalations group', 'Escalations'],
          ['CXO escalations', 'CXO-Escalations'],
        ].flatMap(([label, ch]) => [
          { group: label, label: 'Interactions', fmt: int, get: p => p.t(ch)?.interactions, pct: p => div(p.t(ch)?.interactions, all(p)?.interactions), hint: '% = share of all interactions' },
          { group: label, label: 'Unique customers', fmt: int, get: p => p.t(ch)?.unique_int },
          { group: label, label: 'FRT', fmt: dur, good: 'down', hint: 'Ticket created → first public reply from us, business hours', get: p => avg(p.t(ch), 'frt_sum', 'frt_n') },
          { group: label, label: 'Agent FRT', fmt: dur, good: 'down', hint: 'Ticket created → first public reply from a Freshdesk agent, business hours', get: p => avg(p.t(ch), 'afrt_sum', 'afrt_n') },
          { group: label, label: 'ART', fmt: hrs, good: 'down', hint: 'Average resolution time of resolved tickets', get: p => avg(p.t(ch), 'res_sum', 'res_n') },
          { group: label, label: 'Resolved rate', fmt: pctF, good: 'up', hint: 'Tickets with a resolution time ÷ tickets created in the period', get: p => div(p.t(ch)?.res_n, p.t(ch)?.interactions) },
          { group: label, label: 'Child tickets', fmt: int, get: p => p.t(ch)?.tasks },
          { group: label, label: 'MCR', fmt: pctF, good: 'down', hint: 'Child tickets ÷ (Parent + blank)', get: p => div(p.t(ch)?.tasks, p.t(ch)?.interactions) },
          { group: label, label: 'FCR', fmt: pctF, good: 'up', hint: '100% − MCR', get: p => fcr(p.t(ch)) },
        ]),
      ],
    },
    {
      id: 'sla', title: 'SLA',
      note: 'Share of tickets whose first agent reply came within the target, counted in business hours (of tickets that got an agent reply).',
      rows: [
        { label: 'Chat < 20 sec', ch: 'Chat', k: 'sla_20s' }, { label: 'Chat < 40 sec', ch: 'Chat', k: 'sla_40s' },
        { label: 'Email < 10 min', ch: 'Email', k: 'sla_10m' }, { label: 'Email < 15 min', ch: 'Email', k: 'sla_15m' },
        { label: 'Social media < 10 min', ch: 'Social media', k: 'sla_10m' }, { label: 'Social media < 15 min', ch: 'Social media', k: 'sla_15m' },
      ].map(r => ({ label: r.label, fmt: int, good: 'up',
        hint: 'Count = tickets whose first agent reply met the target; % = share of tickets that got an agent reply',
        get: p => p.t(r.ch)?.[r.k], pct: p => div(p.t(r.ch)?.[r.k], p.t(r.ch)?.afrt_n) })),
    },
    {
      id: 'ozonetel', title: 'Ozonetel — inbound calls',
      note: 'Inbound line Inbound_918045152790 only. One count per call (Ozonetel call_id, not per ringing attempt), first ring 10:00–19:00 IST. Data starts 1 Oct 2026. A unique caller is missed only if none of their calls was answered.',
      rows: [
        // Count = the number; % = share of its base (total calls for the first three, unique callers for the rest).
        { label: 'Total calls', fmt: int, get: p => p.calls?.total_calls, pct: p => div(p.calls?.total_calls, p.calls?.total_calls), hint: '% = 100% (the base)' },
        { label: 'Answered calls', fmt: int, good: 'up', get: p => p.calls?.answered_calls, pct: p => div(p.calls?.answered_calls, p.calls?.total_calls), hint: '% = answered / total calls' },
        { label: 'Unique calls', fmt: int, get: p => p.calls?.unique_calls, pct: p => div(p.calls?.unique_calls, p.calls?.total_calls), hint: '% = unique callers / total calls (lower = more repeat callers)' },
        { label: 'Unique calls answered', fmt: int, good: 'up', get: p => p.calls?.unique_answered, pct: p => div(p.calls?.unique_answered, p.calls?.unique_calls), hint: '% = answered / unique callers' },
        { label: 'Unique calls missed', fmt: int, good: 'down', get: p => p.calls?.unique_missed, pct: p => div(p.calls?.unique_missed, p.calls?.unique_calls), hint: '% = missed / unique callers' },
      ],
    },
    {
      id: 'agents', title: 'Agents available & available hours',
      note: 'Inbound = Ozonetel agents logged in and their login hours. Other channels = Freshdesk agents who replied; hours are only tracked for voice.',
      rows: [
        ...['Chat', 'Email', 'Social media'].map(ch => ({ label: `${ch} — agents`, fmt: int, get: p => p.agents[ch] })),
        { label: 'Inbound — agents', fmt: int, get: p => p.voice?.agents },
        { label: 'Escalation — agents', fmt: int, hint: 'Not separable from channel agents in Freshdesk', get: () => null },
        { label: 'Inbound — available hours', fmt: hrs, get: p => p.voice?.login_hours },
      ],
    },
  ]
}

// ── UI ──
function Delta({ cur, prev, good }) {
  if (cur == null || prev == null || !isFinite(cur) || !isFinite(prev) || prev === 0) return <span style={{ color: C.t3 }}>—</span>
  const ch = (cur - prev) / Math.abs(prev)
  const better = good === 'up' ? ch > 0 : good === 'down' ? ch < 0 : null
  const color = better == null || Math.abs(ch) < 0.005 ? C.t2 : better ? C.green.tx : C.red.tx
  return <span style={{ color, fontWeight: 600 }}>{ch > 0 ? '▲' : ch < 0 ? '▼' : ''} {Math.abs(ch * 100).toFixed(1)}%</span>
}

// Same segmented "% | Count" control as the other dashboard tables.
function ShareToggle({ mode, setMode }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[{ id: 'pct', label: '%' }, { id: 'count', label: 'Count' }].map((opt, i) => (
        <div key={opt.id} style={{ display: 'flex', alignItems: 'center' }}>
          {i > 0 && <div style={{ width: 1, height: 14, background: C.border2, margin: '0 4px' }} />}
          <button onClick={e => { e.stopPropagation(); setMode(opt.id) }}
            style={{ fontSize: 11, fontWeight: mode === opt.id ? 700 : 500, padding: '3px 9px', borderRadius: 6, border: 'none', outline: 'none',
              background: mode === opt.id ? C.acs : 'transparent', color: mode === opt.id ? C.acd : C.t2, cursor: 'pointer', minWidth: 44, textAlign: 'center' }}>{opt.label}</button>
        </div>
      ))}
    </div>
  )
}

// `hidden` leading periods are context only: not shown as columns, but the change pill still
// compares against them. With a single period on screen the previous one is shown beside it
// (PREV | CURRENT | VS PREV); with several, the earlier ones are muted and the latest is bold.
function Matrix({ rows, model, grain, deltaLabel, mode = 'count', hidden = 0 }) {
  const th = { padding: '10px 12px', fontSize: 11, fontWeight: 700, color: C.t1, textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap', borderBottom: `1px solid ${C.border2}` }
  const td = { padding: '13px 12px', fontSize: 13, borderTop: `1px solid ${C.border}`, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }
  const shownModel = model.slice(hidden)
  const withPrev = shownModel.length === 1 && model.length > 1       // show the day before beside the single column
  const cols = withPrev ? model.slice(-2) : shownModel
  let lastGroup = null
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 240 + (cols.length + 1) * 96 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left', minWidth: 190 }}>Metric</th>
            {cols.map((p, j) => {
              const isLast = j === cols.length - 1
              const lbl = withPrev ? (isLast ? 'Current' : 'Prev') : periodLabel(grain, p.key)
              return <th key={p.key} title={periodLabel(grain, p.key)} style={{ ...th, textAlign: 'right', color: isLast ? C.t1 : C.t3 }}>{lbl}</th>
            })}
            <th style={{ ...th, textAlign: 'right' }}>vs Prev</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            // A row with a `pct` getter shows its share of the base in % mode; the other rows stay as they are.
            const asPct = mode === 'pct' && r.pct
            const vals = model.map(p => (asPct ? r.pct(p) : r.get(p)))
            const fmtV = asPct ? pctF : r.fmt
            const showGroup = r.group && r.group !== lastGroup
            lastGroup = r.group
            const shown = withPrev ? vals.slice(-2) : vals.slice(hidden)
            return [
              showGroup && (
                <tr key={`g${i}`}><td colSpan={cols.length + 2} style={{ ...td, padding: '9px 12px', fontWeight: 700, color: C.acd, background: C.acl, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.06em' }}>{r.group}</td></tr>
              ),
              <tr key={i} title={r.hint || ''}>
                <td style={{ ...td, paddingLeft: r.group ? 24 : 12, fontWeight: r.strong ? 700 : 500, color: C.t1, cursor: r.hint ? 'help' : undefined }}>
                  {r.label}{r.hint && <span style={{ color: C.t3, fontSize: 10, marginLeft: 4 }}>ⓘ</span>}
                </td>
                {shown.map((v, j) => {
                  const isLast = j === shown.length - 1
                  return <td key={j} style={{ ...td, textAlign: 'right', fontSize: isLast ? 14 : 12.5, fontWeight: isLast || r.strong ? 700 : 400, color: v == null ? C.t3 : isLast ? C.t1 : C.t3 }}>{fmtV(v)}</td>
                })}
                <td style={{ ...td, textAlign: 'right' }}><DeltaPill cur={vals.at(-1)} prev={vals.at(-2)} good={asPct && r.goodPct ? r.goodPct : r.good} title={deltaLabel} /></td>
              </tr>,
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}

// TTR. Columns = parent tickets, child tickets (all), then the top 12 resolver groups; for each, per
// period: tickets created, how many are resolved/closed, how many are still pending (created -
// resolved, as of now) and the average TTR of the resolved ones = (Resolved, else Closed) time -
// Created time, in hours.
function ttrColumns(data) {
  const byKey = (src, field) => {
    const g = new Map()
    for (const r of src || []) {
      if (!g.has(r[field])) g.set(r[field], {})
      g.get(r[field])[r.bucket] = { c: Number(r.created) || 0, n: Number(r.resolved) || 0, h: Number(r.hrs_sum) || 0 }
    }
    return g
  }
  const sum = (g) => {
    const all = {}
    for (const v of g.values()) for (const [b, x] of Object.entries(v)) {
      all[b] = all[b] || { c: 0, n: 0, h: 0 }; all[b].c += x.c; all[b].n += x.n; all[b].h += x.h
    }
    return all
  }
  const types = byKey(data.ttrType, 'assoc')
  const groups = byKey(data.ttr, 'grp')
  const total = (v) => Object.values(v).reduce((a, x) => a + x.c, 0)
  const list = [...groups.entries()].sort((a, b) => total(b[1]) - total(a[1])).slice(0, 12)
  return [
    { label: 'Parent tickets', kind: 'type', v: types.get('Parent') || {} },
    { label: 'Child tickets', kind: 'type', v: types.get('Child') || sum(groups) },
    ...list.map(([k, v]) => ({ label: k, kind: 'group', v })),
  ]
}

const TTR_METRICS = [
  { id: 'created', label: 'Created', hint: 'Tickets created in the period', get: x => x.c, fmt: int },
  { id: 'resolved', label: 'Resolved', hint: 'Of those created, how many are resolved or closed now', get: x => x.n, fmt: int },
  { id: 'pending', label: 'Pending', hint: 'Created − resolved: still open as of now', get: x => x.c - x.n, fmt: int },
  { id: 'ttr', label: 'Avg TTR', hint: 'Resolved/Closed time − Created time, averaged over the resolved tickets', get: x => (x.n ? x.h / x.n : null), fmt: hrs, strong: true },
]

// Export rows (periods across, like the other tables): the same four metrics for every column.
function ttrRows(data) {
  return ttrColumns(data).flatMap(col => TTR_METRICS.map(m => ({
    group: col.kind === 'group' ? `Resolver group: ${col.label}` : col.label,
    label: m.label, fmt: m.fmt, hint: m.hint, strong: m.strong,
    good: m.id === 'resolved' ? 'up' : m.id === 'pending' || m.id === 'ttr' ? 'down' : null,
    get: p => (col.v[p.key] ? m.get(col.v[p.key]) : m.id === 'ttr' ? null : 0),
  })))
}

// Day-on-day comparison in one table: a row per resolver group (after parent and child tickets in
// total), and for every period in view four sub-columns: Created, Resolved, Pending, Avg TTR.
// Pending and TTR are coloured by whether they improved on the previous period (lower is better),
// Resolved the other way round; Created is neutral. Hover a figure for the previous value.
function TtrTable({ data, model, grain, hidden }) {
  const shown = model.slice(hidden)
  const cols = useMemo(() => ttrColumns(data), [data])
  const SUB = [
    { id: 'created', label: 'Created', get: x => x.c, fmt: int, good: null },
    { id: 'resolved', label: 'Resolved', get: x => x.n, fmt: int, good: 'up' },
    { id: 'pending', label: 'Pending', get: x => x.c - x.n, fmt: int, good: 'down' },
    { id: 'ttr', label: 'TTR', get: x => (x.n ? x.h / x.n : null), fmt: hrs, good: 'down' },
  ]
  const W = 62
  const head = { padding: '8px 6px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: C.t1, textAlign: 'center', borderBottom: `1px solid ${C.border2}` }
  const cell = { padding: '10px 6px', fontSize: 12.5, borderTop: `1px solid ${C.border}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', minWidth: W }
  const tone = (good, cur, prev) => {
    if (!good || cur == null || prev == null || prev === 0 || cur === prev) return C.t1
    const better = good === 'up' ? cur > prev : cur < prev
    return better ? C.green.tx : C.red.tx
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 230 + shown.length * SUB.length * W }}>
        <thead>
          <tr>
            <th rowSpan={2} style={{ ...head, textAlign: 'left', minWidth: 200, position: 'sticky', left: 0, background: C.card, zIndex: 2, verticalAlign: 'bottom' }}>Resolver group</th>
            {shown.map((p, i) => (
              <th key={p.key} colSpan={SUB.length} style={{ ...head, background: i === shown.length - 1 ? C.ach : C.acl, borderLeft: `2px solid ${C.card}` }}>{periodLabel(grain, p.key)}</th>
            ))}
          </tr>
          <tr>
            {shown.flatMap((p, i) => SUB.map((m, j) => (
              <th key={`${p.key}-${m.id}`} style={{ ...head, fontSize: 9.5, color: C.t3, borderLeft: j === 0 ? `2px solid ${C.card}` : undefined, background: i === shown.length - 1 ? 'rgba(' + C.accRgb + ',0.07)' : 'transparent' }}>{m.label}</th>
            )))}
          </tr>
        </thead>
        <tbody>
          {cols.map((col, ci) => {
            const first = ci === 0 || (col.kind === 'group' && cols[ci - 1].kind === 'type')
            return (
              <tr key={col.label}>
                <td title={col.label} style={{ ...cell, textAlign: 'left', fontWeight: col.kind === 'type' ? 700 : 500, color: C.t1, position: 'sticky', left: 0, background: col.kind === 'type' ? C.acl : C.card, zIndex: 1, borderTop: first && col.kind === 'group' ? `2px solid ${C.border2}` : cell.borderTop, maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis' }}>{col.label}</td>
                {shown.map((p, i) => {
                  const idx = hidden + i
                  const x = col.v[p.key], px = idx > 0 ? col.v[model[idx - 1].key] : null
                  return SUB.map((m, j) => {
                    const cur = x ? m.get(x) : (m.id === 'ttr' ? null : 0)
                    const prev = px ? m.get(px) : null
                    const delta = cur != null && prev ? ` (${cur >= prev ? '+' : ''}${(((cur - prev) / Math.abs(prev)) * 100).toFixed(1)}%)` : ''
                    return (
                      <td key={`${p.key}-${m.id}`} title={prev != null ? `Previous: ${m.fmt(prev)}${delta}` : ''}
                        style={{ ...cell, borderLeft: j === 0 ? `2px solid ${C.card}` : undefined, fontWeight: m.id === 'ttr' ? 700 : 400,
                          color: cur == null ? C.t3 : tone(m.good, cur, prev),
                          background: col.kind === 'type' ? C.acl : i === shown.length - 1 ? 'rgba(' + C.accRgb + ',0.05)' : 'transparent',
                          borderTop: first && col.kind === 'group' ? `2px solid ${C.border2}` : cell.borderTop }}>{m.fmt(cur)}</td>
                    )
                  })
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Pending ticket ageing: one table per kind (Parent / Child), resolver groups down, age buckets across.
const AGE_BUCKETS = [
  ['1', '1 day'], ['2', '2 days'], ['3', '3 days'], ['4-5', '4-5 days'],
  ['6-8', '6-8 days'], ['9-10', '9-10 days'], ['11-15', '11-15 days'], ['15+', '15+ days'],
]
function pendencyRows(data, kind) {
  const g = new Map()
  for (const r of (data.pendency || []).filter(x => x.kind === kind)) {
    if (!g.has(r.grp)) g.set(r.grp, {})
    g.get(r.grp)[r.bucket] = Number(r.n) || 0
  }
  const tot = (v) => Object.values(v).reduce((a, b) => a + b, 0)
  const rows = [...g.entries()].map(([grp, v]) => ({ grp, v, total: tot(v) })).sort((a, b) => b.total - a.total)
  const all = {}
  for (const r of rows) for (const [b, n] of Object.entries(r.v)) all[b] = (all[b] || 0) + n
  return { rows, all, total: tot(all) }
}
function pendencyCsv(data, kind) {
  const { rows, all, total } = pendencyRows(data, kind)
  const line = (name, v, t) => ({ 'Resolver group': name, ...Object.fromEntries(AGE_BUCKETS.map(([k, l]) => [l, v[k] || 0])), Total: t })
  return [line('All resolver groups', all, total), ...rows.map(r => line(r.grp, r.v, r.total))]
}
function PendencyTable({ data, kind }) {
  const { rows, all, total } = useMemo(() => pendencyRows(data, kind), [data, kind])
  if (!total) return <div style={{ color: C.t3, fontSize: 12.5, padding: 20 }}>No pending {kind.toLowerCase()} tickets.</div>
  const max = Math.max(...rows.flatMap(r => Object.values(r.v)), 1)
  const th = { padding: '9px 10px', fontSize: 10.5, fontWeight: 700, color: C.t1, textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'right', borderBottom: `1px solid ${C.border2}`, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1, background: C.card }
  const td = { padding: '10px', fontSize: 12.5, borderTop: `1px solid ${C.border}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  const heat = (n) => (n ? `rgba(${C.accRgb},${(0.08 + 0.5 * (n / max)).toFixed(2)})` : 'transparent')
  return (
    <div style={{ overflowX: 'auto', maxHeight: 300, overflowY: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 240 + (AGE_BUCKETS.length + 1) * 84 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left', minWidth: 210 }}>Resolver group</th>
            {AGE_BUCKETS.map(([k, l]) => <th key={k} style={th}>{l}</th>)}
            <th style={{ ...th, background: C.acl }}>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: C.t1, background: C.acl }}>All resolver groups</td>
            {AGE_BUCKETS.map(([k]) => <td key={k} style={{ ...td, fontWeight: 700, color: C.t1, background: C.acl }}>{fmtN(all[k] || 0)}</td>)}
            <td style={{ ...td, fontWeight: 800, color: C.t1, background: C.acl }}>{fmtN(total)}</td>
          </tr>
          {rows.map(r => (
            <tr key={r.grp}>
              <td title={r.grp} style={{ ...td, textAlign: 'left', color: C.t1, fontWeight: 500 }}>{r.grp}</td>
              {AGE_BUCKETS.map(([k]) => <td key={k} style={{ ...td, background: heat(r.v[k] || 0), color: r.v[k] ? C.t1 : C.t3 }}>{r.v[k] ? fmtN(r.v[k]) : '—'}</td>)}
              <td style={{ ...td, fontWeight: 700, color: C.t1 }}>{fmtN(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Top 15 by volume at sub category level 2. The same level-2 name sits under several parents
// (e.g. 'Pick Up Delayed' under Exchange and Return), so a row is one Disposition > Sub category >
// Sub category 2 path, labelled with the level-2 name and its disposition; hover for the full path.
function driverRows(data, model) {
  const keys = model.map(p => p.key)
  const m = new Map()
  for (const r of data.dispositions || []) {
    // Tickets closed without a sub category 2 say nothing about why customers contact us.
    if (r.sub2 === '(blank)') continue
    const k = `${r.dispo}\u0001${r.sub1}\u0001${r.sub2}`
    if (!m.has(k)) m.set(k, { dispo: r.dispo, sub1: r.sub1, sub2: r.sub2, v: Object.fromEntries(keys.map(x => [x, 0])) })
    m.get(k).v[r.bucket] = Number(r.n) || 0
  }
  const last = keys.at(-1)
  const clean = (x) => x.replace(/\.$/, '')
  return [...m.values()].map(({ dispo, sub1, sub2, v }) => ({
    label: `${sub2} · ${clean(dispo)}`, hint: `${clean(dispo)} › ${sub1} › ${sub2}`, fmt: int, good: 'down',
    get: p => v[p.key], pct: p => div(v[p.key], p.t('All')?.interactions),
  })).sort((a, b) => (b.get({ key: last }) || 0) - (a.get({ key: last }) || 0)).slice(0, 15)
}

function Drivers({ data, model, grain, deltaLabel, mode, hidden }) {
  const rows = useMemo(() => driverRows(data, model), [data, model])
  return <Matrix rows={rows} model={model} grain={grain} deltaLabel={deltaLabel} mode={mode} hidden={hidden} />
}

// One flat CSV of every detailed table, in the view on screen. Columns: Table, Group, Metric, Unit,
// one column per period (ISO key: day, week start or month), Change % (latest vs previous period).
// Values are raw numbers (durations in seconds / hours, rates in %), and a row that has a % view
// gets a second "(%)" row so the file holds both the Count and the % toggle states.
function detailedCsv(tables, model, hidden) {
  const unitOf = (fmtFn) => (fmtFn === dur ? 'seconds' : fmtFn === hrs ? 'hours' : fmtFn === pctF ? '%' : fmtFn === ratio ? 'ratio' : fmtFn === money ? 'INR' : 'count')
  const round = (v, d = 4) => (v == null || !isFinite(v) ? '' : Math.round(v * 10 ** d) / 10 ** d)
  const shown = model.slice(hidden)
  const out = []
  const push = (table, r, label, unit, vals, scale) => {
    const row = { Table: table, Group: r.group || '', Metric: label, Unit: unit }
    shown.forEach((p, i) => { row[p.key] = round(vals[hidden + i] == null ? null : vals[hidden + i] * scale) })
    const cur = vals.at(-1), prev = vals.at(-2)
    row['Change %'] = cur != null && prev != null && isFinite(cur) && isFinite(prev) && prev !== 0 ? round(((cur - prev) / Math.abs(prev)) * 100, 1) : ''
    out.push(row)
  }
  for (const t of tables) {
    for (const r of t.rows) {
      const vals = model.map(p => r.get(p))
      push(t.title, r, r.label, unitOf(r.fmt), vals, r.fmt === pctF ? 100 : 1)
      if (r.pct) push(t.title, r, `${r.label} (%)`, '%', model.map(p => r.pct(p)), 100)
    }
  }
  return out
}

// Export dropdown for the top bar. `data` = what the page registered: { items:[{id,title}], run(id), view, busy }.
export function ExportMenu({ data }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const disabled = !data || data.busy || !data.items.length
  const pick = (id) => { setOpen(false); data.run(id) }
  const row = { display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12.5, color: C.t1, background: 'transparent', border: 'none', borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap' }
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => !disabled && setOpen(o => !o)} disabled={disabled} title="Export the detailed KPI tables as CSV"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, padding: '7px 14px', borderRadius: 10, border: `1px solid ${C.border2}`, background: C.card, color: C.acc, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
        ⤓ Export <span style={{ fontSize: 9 }}>▾</span>
      </button>
      {open && !disabled && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 1000, minWidth: 300, maxHeight: 420, overflowY: 'auto', background: C.card, border: `1px solid ${C.border2}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: 6 }}>
          <div style={{ padding: '6px 12px 8px', fontSize: 10.5, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.06em' }}>Detailed KPI tables · {data.view}</div>
          <button onClick={() => pick('all')} style={{ ...row, fontWeight: 700, color: C.acd, background: C.acl }}>All tables (one CSV)</button>
          <div style={{ height: 1, background: C.border, margin: '6px 4px' }} />
          {data.items.map(it => (
            <button key={it.id} onClick={() => pick(it.id)} style={row}
              onMouseEnter={e => { e.currentTarget.style.background = C.bg }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>{it.title}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── visual layer ──────────────────────────────────────────────────────────────

// Every colour reads the active theme at render time (C.* are getters), so switching theme
// recolours the page. Channels take steps of the theme's accent ramp (dark -> light, spaced
// on lightness so they stay distinguishable); escalations and missed calls keep the fixed
// semantic red, because they mean "bad" in every theme.
const ramp = (i) => C.ramp[Math.min(i, C.ramp.length - 1)]
const chColor = (ch) => ({
  Inbound: ramp(0), Chat: ramp(2), Email: ramp(3), 'Social media': ramp(4), Escalation: C.red.tx,
}[ch] || C.t3)
const axis = { fontSize: 10.5, fill: C.t3 }
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAIN = ['Chat', 'Inbound', 'Email', 'Social media']
const kfmt = (v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)

const shiftDay = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

function SectionTitle({ children, note, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 -4px' }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: C.t2, letterSpacing: '.06em', textTransform: 'uppercase' }}>{children}</span>
      {note && <span style={{ fontSize: 11.5, color: C.t3 }}>{note}</span>}
      <div style={{ flex: 1, height: 1, background: C.border }} />
      {right}
    </div>
  )
}

// Change pill: coloured tint + arrow + %, green when the move is good, red when bad, grey when
// the KPI has no good direction (volumes), too small to matter, or has no previous value.
function DeltaPill({ cur, prev, good, title }) {
  const ok = cur != null && prev != null && isFinite(cur) && isFinite(prev) && prev !== 0
  const ch = ok ? (cur - prev) / Math.abs(prev) : null
  const flat = ch == null || Math.abs(ch) < 0.005
  const better = flat || !good ? null : good === 'up' ? ch > 0 : ch < 0
  const tone = better == null ? { bg: C.bg, tx: C.t2 } : better ? C.green : C.red
  return (
    <span title={title} style={{ background: tone.bg, color: tone.tx, fontSize: 11.5, fontWeight: 700, padding: '3px 8px', borderRadius: 8, whiteSpace: 'nowrap', flexShrink: 0 }}>
      {ch == null ? '—' : `${ch > 0 ? '▲' : ch < 0 ? '▼' : ''} ${Math.abs(ch * 100).toFixed(1)}%`}
    </span>
  )
}

// KPI card: label, big value with the change pill beside it, one line of context, and a
// full-width sparkline over the visible periods. Every card has the same rows so a row of
// cards lines up. `detail` = the counts behind the value; without it the previous value shows.
function KpiCard({ label, values, f, good, prevLabel, detail, noPrev }) {
  const cur = values.at(-1), prev = values.at(-2)
  const series = values.map((v, i) => ({ i, v: v == null || !isFinite(v) ? null : v }))
  const gid = `sp-${label.replace(/\W/g, '')}`
  const hasCur = cur != null && isFinite(cur), hasPrev = prev != null && isFinite(prev)
  const line = detail || (hasPrev ? `Previous: ${f(prev)}` : '\u00a0')
  const pillTitle = hasCur && !hasPrev ? (noPrev || `No data ${prevLabel}`) : prevLabel
  return (
    <div className="kpi-card" style={{ background: C.card, borderRadius: C.r.lg, boxShadow: C.sh1, padding: '12px 16px 8px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, overflow: 'hidden' }}>
      <div title={label} style={{ fontSize: 10.5, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: C.t1, letterSpacing: '-.01em', lineHeight: 1.15 }}>{f(cur)}</div>
        <DeltaPill cur={cur} prev={prev} good={good} title={pillTitle} />
      </div>
      <div title={hasCur && !hasPrev && noPrev ? `${line} · ${noPrev}` : line} style={{ fontSize: 11.5, color: C.t2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line}</div>
      <div style={{ height: 34, marginTop: 'auto', paddingTop: 4 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.acc} stopOpacity={0.3} />
                <stop offset="100%" stopColor={C.acc} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="v" stroke={C.acc} strokeWidth={1.8} fill={`url(#${gid})`} connectNulls isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function ChannelTrend({ model, grain }) {
  const data = model.map(p => ({ name: periodLabel(grain, p.key), ...Object.fromEntries(MAIN.map(ch => [ch, p.t(ch)?.interactions || 0])) }))
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={C.border} vertical={false} />
        <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} />
        <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={kfmt} />
        <Tooltip content={<ChartTooltip formatter={int} />} cursor={{ fill: C.hov }} />
        <Legend {...chartLegendProps()} />
        {MAIN.map((ch, i) => (
          <Bar key={ch} dataKey={ch} stackId="a" fill={chColor(ch)} radius={i === MAIN.length - 1 ? [5, 5, 0, 0] : 0} maxBarSize={56} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

function ChannelMix({ latest }) {
  const data = MAIN.map(ch => ({ name: ch, value: latest.t(ch)?.interactions || 0 })).filter(d => d.value > 0)
  const total = data.reduce((s, d) => s + d.value, 0)
  const sorted = [...data].sort((a, b) => b.value - a.value)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 260 }}>
      <div style={{ position: 'relative', width: '52%', height: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke="none" isAnimationActive={false}>
              {data.map(d => <Cell key={d.name} fill={chColor(d.name)} />)}
            </Pie>
            <Tooltip content={<ChartTooltip formatter={int} />} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.t1 }}>{fmtN(total)}</div>
          <div style={{ fontSize: 10.5, color: C.t3 }}>interactions</div>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sorted.map(d => (
          <div key={d.name}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.t2 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: chColor(d.name) }} />{d.name}</span>
              <span style={{ fontWeight: 700, color: C.t1 }}>{((d.value / total) * 100).toFixed(1)}%</span>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: C.bg }}><div style={{ height: '100%', width: `${(d.value / total) * 100}%`, borderRadius: 3, background: chColor(d.name) }} /></div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FrtTrend({ model, grain }) {
  const chans = ['Chat', 'Email', 'Social media', 'Escalation']
  const data = model.map(p => ({
    name: periodLabel(grain, p.key),
    ...Object.fromEntries(chans.map(ch => { const s = avg(p.t(ch), 'afrt_sum', 'afrt_n'); return [ch, s == null ? null : s / 60] })),
  }))
  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -6 }}>
        <CartesianGrid stroke={C.border} vertical={false} />
        <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} />
        <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={v => (v >= 60 ? `${(v / 60).toFixed(0)}h` : `${v.toFixed(0)}m`)} />
        <Tooltip content={<ChartTooltip formatter={v => dur(v * 60)} sortByValue />} />
        <Legend {...chartLegendProps()} />
        {chans.map(ch => <Line key={ch} type="monotone" dataKey={ch} stroke={chColor(ch)} strokeWidth={2.2} dot={{ r: 3 }} connectNulls />)}
      </LineChart>
    </ResponsiveContainer>
  )
}

// Progress bars per SLA target: latest period, previous period as a tick mark.
function SlaBars({ latest, prev }) {
  const rows = [
    ['Chat', 'sla_20s', '< 20 sec'], ['Chat', 'sla_40s', '< 40 sec'],
    ['Email', 'sla_10m', '< 10 min'], ['Email', 'sla_15m', '< 15 min'],
    ['Social media', 'sla_10m', '< 10 min'], ['Social media', 'sla_15m', '< 15 min'],
  ]
  const val = (p, ch, k) => (p ? div(p.t(ch)?.[k], p.t(ch)?.afrt_n) : null)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 2px' }}>
      {rows.map(([ch, k, lbl]) => {
        const v = val(latest, ch, k), pv = val(prev, ch, k)
        const color = v == null ? C.t3 : C.acd
        return (
          <div key={ch + k}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: C.t2 }}><b style={{ color: C.t1 }}>{ch}</b> {lbl}</span>
              <span><b style={{ color }}>{pctF(v)}</b> <span style={{ fontSize: 10.5 }}><Delta cur={v} prev={pv} good="up" /></span></span>
            </div>
            <div style={{ position: 'relative', height: 8, borderRadius: 4, background: C.bg }}>
              <div style={{ height: '100%', width: `${Math.min((v || 0) * 100, 100)}%`, borderRadius: 4, background: `linear-gradient(90deg, ${C.acd}, ${C.acc})` }} />
              {pv != null && <div title={`previous ${pctF(pv)}`} style={{ position: 'absolute', top: -3, bottom: -3, width: 2, left: `${Math.min(pv * 100, 100)}%`, background: C.t2, borderRadius: 1 }} />}
            </div>
          </div>
        )
      })}
      <div style={{ fontSize: 10.5, color: C.t3 }}>Bar = latest period, tick = previous. Share of tickets whose first agent reply met the target.</div>
    </div>
  )
}

function OrdersVsInteractions({ model, grain }) {
  const data = model.map(p => ({
    name: periodLabel(grain, p.key),
    Orders: p.orders?.orders || 0,
    Interactions: p.t('All')?.interactions || 0,
    ITO: div(p.t('All')?.interactions, p.orders?.orders),
  }))
  return (
    <div style={{ height: '100%', minHeight: 300 }}>
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} barCategoryGap="8%" barGap={3}>
        <CartesianGrid stroke={C.border} vertical={false} />
        <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} />
        <YAxis yAxisId="l" width={34} tick={axis} axisLine={false} tickLine={false} tickFormatter={kfmt} />
        <YAxis yAxisId="r" orientation="right" width={30} tick={axis} axisLine={false} tickLine={false} tickFormatter={v => v.toFixed(1)} />
        <Tooltip content={<ChartTooltip formatter={v => (v != null && v < 50 ? ratio(v) : int(v))} />} cursor={{ fill: C.hov }} />
        <Legend {...chartLegendProps()} />
        <Bar yAxisId="l" dataKey="Orders" fill={C.acc} radius={[5, 5, 0, 0]} maxBarSize={64} />
        <Bar yAxisId="l" dataKey="Interactions" fill={ramp(4)} radius={[5, 5, 0, 0]} maxBarSize={64} />
        <Line yAxisId="r" type="monotone" dataKey="ITO" name="ITO (interactions per order)" stroke={ramp(0)} strokeWidth={2.4} dot={{ r: 3.5, fill: ramp(0) }} />
      </ComposedChart>
    </ResponsiveContainer>
    </div>
  )
}

// Funnel of the latest period's inbound calls.
function CallFunnel({ calls }) {
  if (!calls) return <div style={{ color: C.t3, fontSize: 12.5, padding: 20 }}>No inbound calls in this period (Ozonetel data starts 1 Oct 2026; the inbound line is closed on Sundays and holidays).</div>
  const steps = [
    { label: 'Total calls', v: calls.total_calls, color: ramp(0) },
    { label: 'Answered', v: calls.answered_calls, color: ramp(2) },
    { label: 'Unique callers', v: calls.unique_calls, color: ramp(3) },
    { label: 'Unique answered', v: calls.unique_answered, color: ramp(4) },
    { label: 'Unique missed', v: calls.unique_missed, color: C.red.tx },
  ]
  const max = Math.max(...steps.map(s => s.v || 0), 1)
  const stats = [
    { label: 'Answer rate', v: pctF(div(calls.answered_calls, calls.total_calls)) },
    { label: 'AHT', v: dur(avg(calls, 'aht_sum', 'ans_n')) },
    { label: 'ACW', v: dur(avg(calls, 'acw_sum', 'ans_n')) },
  ]
  // Fills the card's height (the card sits beside the taller by-hour chart): bars spread out
  // evenly and the three call stats become tiles pinned to the bottom.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 14, height: '100%', minHeight: 250 }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10, flex: 1 }}>
        {steps.map(s => (
          <div key={s.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(84px, 112px) minmax(0, 1fr) 52px', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
            <span style={{ color: C.t2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
            <div style={{ height: 24, borderRadius: 6, background: C.bg, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${((s.v || 0) / max) * 100}%`, background: s.color, borderRadius: 6 }} />
            </div>
            <span style={{ textAlign: 'right', fontWeight: 700, color: C.t1, fontVariantNumeric: 'tabular-nums' }}>{int(s.v)}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {stats.map(t => (
          <div key={t.label} style={{ background: C.bg, borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.05em' }}>{t.label}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.t1 }}>{t.v}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CallsByHour({ rows }) {
  const data = [...(rows || [])].sort((a, b) => a.hr - b.hr).map(r => ({
    name: `${String(r.hr).padStart(2, '0')}:00`, Answered: r.answered, Missed: r.total - r.answered, 'Answer rate': r.total ? r.answered / r.total : null,
  }))
  if (!data.length) return <div style={{ color: C.t3, fontSize: 12.5, padding: 20 }}>No inbound calls in this window.</div>
  return (
    <ResponsiveContainer width="100%" height={250}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={C.border} vertical={false} />
        <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} />
        <YAxis yAxisId="l" tick={axis} axisLine={false} tickLine={false} tickFormatter={kfmt} />
        <YAxis yAxisId="r" orientation="right" tick={axis} axisLine={false} tickLine={false} domain={[0, 1]} tickFormatter={v => `${Math.round(v * 100)}%`} />
        <Tooltip content={<ChartTooltip formatter={v => (v != null && v <= 1 ? pctF(v) : int(v))} />} cursor={{ fill: C.hov }} />
        <Legend {...chartLegendProps()} />
        <Bar yAxisId="l" dataKey="Answered" stackId="c" fill={C.acc} maxBarSize={28} />
        <Bar yAxisId="l" dataKey="Missed" stackId="c" fill={C.red.tx} fillOpacity={0.75} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Line yAxisId="r" type="monotone" dataKey="Answer rate" stroke={ramp(0)} strokeWidth={2.2} dot={{ r: 2.5, fill: ramp(0) }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// Weekday x hour heatmap of interactions (IST), Monday first.
function ContactHeatmap({ rows }) {
  const grid = {}
  let max = 0
  for (const r of rows || []) { grid[`${r.dow}-${r.hr}`] = r.n; max = Math.max(max, r.n) }
  const days = [2, 3, 4, 5, 6, 7, 1]
  const hours = Array.from({ length: 24 }, (_, h) => h)
  const cell = (n) => (!n ? C.bg : `rgba(${C.accRgb},${(0.12 + 0.88 * (n / max)).toFixed(2)})`)
  return (
    <div style={{ overflowX: 'auto', height: '100%', minHeight: 300, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '38px repeat(24, minmax(18px, 1fr))', gridTemplateRows: 'auto repeat(7, minmax(26px, 1fr))', gap: 3, minWidth: 560, flex: 1 }}>
        <div />
        {hours.map(h => <div key={h} style={{ fontSize: 9.5, color: C.t3, textAlign: 'center' }}>{h % 3 === 0 ? h : ''}</div>)}
        {days.map(d => [
          <div key={`l${d}`} style={{ fontSize: 11, color: C.t2, alignSelf: 'center' }}>{DOW[d - 1]}</div>,
          ...hours.map(h => {
            const n = grid[`${d}-${h}`] || 0
            return <div key={`${d}-${h}`} title={`${DOW[d - 1]} ${String(h).padStart(2, '0')}:00 — ${fmtN(n)} interactions`}
              style={{ borderRadius: 4, background: cell(n) }} />
          }),
        ])}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 10.5, color: C.t3 }}>
        less {[0.15, 0.35, 0.55, 0.75, 1].map(a => <span key={a} style={{ width: 16, height: 10, borderRadius: 3, background: `rgba(${C.accRgb},${a})` }} />)} more
        <span style={{ marginLeft: 'auto' }}>Busiest hour-slot: {fmtN(max)} interactions</span>
      </div>
    </div>
  )
}

// Always the last 7 days (to the "up to" date) vs the 7 days before - see dispo7 in the API.
function DriversChart({ data }) {
  const rows = useMemo(() => (data.dispo7 || [])
    .filter(r => r.dispo !== '(blank)')
    .map(r => ({ name: r.dispo, cur: Number(r.cur) || 0, prev: Number(r.prev) || 0 }))
    .sort((a, b) => b.cur - a.cur).slice(0, 12), [data])
  const max = Math.max(...rows.map(r => r.cur), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8, padding: '2px', height: '100%', minHeight: 360 }}>
      {rows.map(r => (
        <div key={r.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 190px) 1fr 58px 70px', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
          <span style={{ color: C.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name}>{r.name}</span>
          <div style={{ height: 16, borderRadius: 5, background: C.bg }}>
            <div style={{ height: '100%', width: `${(r.cur / max) * 100}%`, borderRadius: 5, background: `linear-gradient(90deg, ${C.acd}, ${C.acc})` }} />
          </div>
          <span style={{ textAlign: 'right', fontWeight: 700, color: C.t1 }}>{fmtN(r.cur)}</span>
          <span style={{ textAlign: 'right', fontSize: 11 }}><Delta cur={r.cur} prev={r.prev} good="down" /></span>
        </div>
      ))}
      <div style={{ fontSize: 10.5, color: C.t3 }}>Last 7 days vs the 7 days before. Rising drivers (red) are where extra volume is coming from.</div>
    </div>
  )
}

function AgentBoard({ rows }) {
  const list = (rows || []).filter(r => r.agent && r.agent !== 'Unassigned').slice(0, 12)
  const unassigned = (rows || []).find(r => r.agent === 'Unassigned')
  const max = Math.max(...list.map(r => r.interactions), 1)
  const th = { fontSize: 10.5, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.04em', padding: '0 6px 6px', textAlign: 'right' }
  const td = { padding: '5px 6px', fontSize: 12, borderTop: `1px solid ${C.border}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          <th style={{ ...th, textAlign: 'left' }}>Agent</th><th style={{ ...th, textAlign: 'left' }}>Main channel</th>
          <th style={th}>Interactions</th><th style={th}>Agent FRT</th><th style={th}>ART</th>
        </tr></thead>
        <tbody>
          {list.map((r, i) => (
            <tr key={r.agent}>
              <td style={{ ...td, textAlign: 'left', color: C.t1, fontWeight: 600 }}>
                <span style={{ display: 'inline-block', width: 18, color: C.t3, fontWeight: 500 }}>{i + 1}</span>{r.agent}
              </td>
              <td style={{ ...td, textAlign: 'left' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, color: C.acd, background: C.acl }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: chColor(r.main_channel) }} />{r.main_channel}
                </span>
              </td>
              <td style={td}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                  <div style={{ width: 60, height: 5, borderRadius: 3, background: C.bg }}><div style={{ height: '100%', width: `${(r.interactions / max) * 100}%`, background: C.acc, borderRadius: 3 }} /></div>
                  {fmtN(r.interactions)}
                </div>
              </td>
              <td style={td}>{dur(avg(r, 'afrt_sum', 'afrt_n'))}</td>
              <td style={td}>{hrs(avg(r, 'res_sum', 'resolved'))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {unassigned && <div style={{ fontSize: 10.5, color: C.t3, marginTop: 8 }}>{fmtN(unassigned.interactions)} interactions in this window have no assigned agent (mostly bot-closed chats) and are left out of the ranking.</div>}
    </div>
  )
}

// `toggle` = { default } adds the % / Count switch; children is then a function of the mode.
function Collapsible({ title, note, children, defaultOpen = false, toggle }) {
  const [open, setOpen] = useState(defaultOpen)
  const [mode, setMode] = useState(toggle?.default || 'count')
  const flip = () => setOpen(o => !o)
  const action = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {toggle && open && <ShareToggle mode={mode} setMode={setMode} />}
      <button onClick={flip} style={{ fontSize: 11.5, fontWeight: 700, color: C.acc, background: 'transparent', border: `1px solid ${C.border2}`, borderRadius: 14, padding: '2px 10px', cursor: 'pointer' }}>{open ? 'Hide' : 'Show'}</button>
    </div>
  )
  if (open) {
    return (
      <div style={{ background: C.card, borderRadius: C.r.lg, boxShadow: C.sh1, overflow: 'hidden' }}>
        <div style={{ background: C.ach, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div onClick={flip} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minWidth: 0 }}>
            <span style={{ width: 4, height: 18, borderRadius: 2, background: C.acd, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: C.t1, textTransform: 'uppercase', letterSpacing: '.08em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
          </div>
          {action}
        </div>
        {note && <div style={{ padding: '10px 18px', fontSize: 12.5, fontStyle: 'italic', color: C.t2, borderBottom: `1px solid ${C.border}` }}>{note}</div>}
        <div style={{ padding: '0 8px 8px' }}>{typeof children === 'function' ? children(mode) : children}</div>
      </div>
    )
  }
  // Collapsed: a slim one-line bar instead of a full card with room for a table underneath.
  return (
    <div className="card-hoverable" onClick={flip}
      style={{ background: C.card, borderRadius: C.r.lg, boxShadow: C.sh1, padding: '9px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.t1, whiteSpace: 'nowrap' }}>▸ {title}</span>
        {note && <span style={{ fontSize: 11.5, color: C.t3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{note}</span>}
      </div>
      <div onClick={e => e.stopPropagation()}>{action}</div>
    </div>
  )
}

const row2 = (a, b) => ({ display: 'grid', gridTemplateColumns: `minmax(0, ${a}fr) minmax(0, ${b}fr)`, gap: 14 })

// The date range lives in App so the shared date-range picker can sit in the top bar; the top
// bar's Refresh button bumps `refreshTick` to bypass the API's 30-minute cache.
export default function CustomerSupportPage({ dateRange, refreshTick = 0, onExportReady }) {
  const [grain, setGrain] = useState('day')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1100)
  const [vw, setVw] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1600))

  useEffect(() => {
    const onResize = () => { setNarrow(window.innerWidth < 1100); setVw(window.innerWidth) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const ctl = new AbortController()
    setLoading(true); setError(null)
    fetch(`${API}/api/customer-support`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
      body: JSON.stringify({ grain, start: dateRange?.start, end: dateRange?.end, refresh: refreshTick > 0 || undefined }),
    })
      .then(async r => {
        const text = await r.text()
        let j = null
        try { j = text ? JSON.parse(text) : null } catch { /* non-JSON error page */ }
        if (!r.ok || !j) throw new Error(j?.error || `the API returned ${r.status}${text ? '' : ' with an empty body'} — is the backend running with the customer-support route?`)
        return j
      })
      .then(j => setData(j))
      .catch(e => { if (e.name !== 'AbortError') setError(e.message) })
      .finally(() => setLoading(false))
    return () => ctl.abort()
  }, [grain, dateRange?.start, dateRange?.end, refreshTick])

  const g = GRAINS.find(x => x.id === grain)
  const model = useMemo(() => (data ? buildModel(data) : []), [data])

  // The detailed KPI tables have their own view: last 7 days (default), week-on-week or
  // month-on-month, all ending on the chosen end date. Fetched separately from the page above.
  const [dGrain, setDGrain] = useState('day')
  const [dData, setDData] = useState(null)
  const [dLoading, setDLoading] = useState(false)
  const [dError, setDError] = useState(null)
  useEffect(() => {
    const ctl = new AbortController()
    const end = dateRange?.end
    const body = dGrain === 'day' && end ? { grain: 'day', start: shiftDay(end, -6), end }
      : { grain: dGrain, end, periods: dGrain === 'week' ? 4 : 3 }
    setDLoading(true); setDError(null)
    fetch(`${API}/api/customer-support`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
      body: JSON.stringify({ ...body, refresh: refreshTick > 0 || undefined }),
    })
      .then(async r => {
        const text = await r.text()
        let j = null
        try { j = text ? JSON.parse(text) : null } catch { /* non-JSON error page */ }
        if (!r.ok || !j) throw new Error(j?.error || `the API returned ${r.status}`)
        return j
      })
      .then(setDData)
      .catch(e => { if (e.name !== 'AbortError') setDError(e.message) })
      .finally(() => setDLoading(false))
    return () => ctl.abort()
  }, [dGrain, dateRange?.end, refreshTick])
  const dModel = useMemo(() => (dData ? buildModel(dData) : []), [dData])
  const secs = useMemo(() => (dModel.length ? sections(dModel) : []), [dModel])
  const gd = GRAINS.find(x => x.id === dGrain)
  // Hands the top bar's Export menu its list of tables and a function that downloads one (or all).
  const exportTables = useMemo(() => (dData ? [
    ...secs.map(sec => ({ id: sec.id, title: sec.title, rows: sec.rows })),
    { id: 'ttr', title: 'TTR - time to resolve, parent and child tickets', rows: ttrRows(dData) },
    { id: 'drivers', title: 'Volume drivers - top 15 by sub category level 2', rows: driverRows(dData, dModel) },
    // Snapshot tables (as of now): own CSV shape, so they are exported on their own, never in "All tables".
    { id: 'pend-parent', title: 'Pending ageing - Parent tickets', csv: () => pendencyCsv(data, 'Parent') },
    { id: 'pend-child', title: 'Pending ageing - Child tickets', csv: () => pendencyCsv(data, 'Child') },
  ] : []), [secs, dData, dModel, data])
  useEffect(() => {
    if (!onExportReady) return
    onExportReady({
      view: `${gd.label} view`,
      busy: dLoading,
      items: exportTables.map(({ id, title }) => ({ id, title })),
      run: (id) => {
        const one = exportTables.find(t => t.id === id)
        if (one?.csv) { exportCSV(one.csv(), `customer_support_${id}_${new Date().toISOString().slice(0, 10)}.csv`); return }
        const tables = (id === 'all' ? exportTables : exportTables.filter(t => t.id === id)).filter(t => t.rows)
        if (!tables.length || !dData) return
        exportCSV(detailedCsv(tables, dModel, dData.hidden || 0), `customer_support_${id === 'all' ? 'detailed_kpis' : id}_${dGrain}_${dData.end}.csv`)
      },
    })
    return () => onExportReady(null)
  }, [exportTables, dGrain, dLoading])
  // `hidden` = context periods the API adds so a single day still has a day-before to compare with.
  const hidden = data?.hidden || 0
  const view = model.slice(hidden)
  const latest = model.at(-1), prev = model.at(-2)

  const kpis = latest ? [
    { label: 'Interactions', values: model.map(p => p.t('All')?.interactions), f: int, good: null, accent: C.acc },
    { label: 'Unique customers', values: model.map(p => p.t('All')?.unique_int), f: int, good: null, accent: ramp(3) },
    // Support load per unit sold (Shopify D2C units): lower = fewer contacts / tasks per unit.
    { label: 'Interactions per unit (ITU)', values: model.map(p => div(p.t('All')?.interactions, p.orders?.units)), f: ratio, good: 'down', accent: ramp(1),
      detail: `${int(latest.t('All')?.interactions)} interactions / ${int(latest.orders?.units)} units` },
    // Same measure per order: contacts per Shopify D2C order (lower is better).
    { label: 'Interactions per order (ITO)', values: model.map(p => div(p.t('All')?.interactions, p.orders?.orders)), f: ratio, good: 'down', accent: ramp(1),
      detail: `${int(latest.t('All')?.interactions)} interactions / ${int(latest.orders?.orders)} orders` },
    { label: 'Tasks per unit', values: model.map(p => div(p.t('All')?.tasks, p.orders?.units)), f: ratio, good: 'down', accent: ramp(2),
      detail: `${int(latest.t('All')?.tasks)} tasks / ${int(latest.orders?.units)} units` },
    { label: 'Tasks per order', values: model.map(p => div(p.t('All')?.tasks, p.orders?.orders)), f: ratio, good: 'down', accent: ramp(2),
      detail: `${int(latest.t('All')?.tasks)} tasks / ${int(latest.orders?.orders)} orders` },
    // Multiple-contact / first-contact resolution: how many contacts needed a follow-up task.
    { label: 'MCR (multiple contact)', values: model.map(p => div(p.t('All')?.tasks, p.t('All')?.interactions)), f: pctF, good: 'down', accent: ramp(2),
      detail: `${int(latest.t('All')?.tasks)} child / ${int(latest.t('All')?.interactions)} parent + blank` },
    { label: 'FCR (first contact)', values: model.map(p => fcr(p.t('All'))), f: pctF, good: 'up', accent: ramp(1),
      detail: `${int(Math.max(0, (latest.t('All')?.interactions || 0) - (latest.t('All')?.tasks || 0)))} of ${int(latest.t('All')?.interactions)} needed no task` },
    { label: 'Chat agent FRT', values: model.map(p => avg(p.t('Chat'), 'afrt_sum', 'afrt_n')), f: dur, good: 'down', accent: ramp(2) },
    // Two views of the inbound line: did each CUSTOMER get through (unique callers), and how
    // many of all calls were picked up (a caller who rings 3 times counts 3 times).
    { label: 'Calls answered (unique)', values: model.map(p => div(p.calls?.unique_answered, p.calls?.unique_calls)), f: pctF, good: 'up', accent: ramp(0),
      detail: latest.calls ? `${int(latest.calls.unique_answered)} of ${int(latest.calls.unique_calls)} callers` : 'no calls',
      noPrev: prev ? `No inbound calls on ${periodLabel(grain, prev.key)}` : '' },
    { label: 'Calls answered (overall)', values: model.map(p => div(p.calls?.answered_calls, p.calls?.total_calls)), f: pctF, good: 'up', accent: ramp(1),
      detail: latest.calls ? `${int(latest.calls.answered_calls)} of ${int(latest.calls.total_calls)} calls` : 'no calls',
      noPrev: prev ? `No inbound calls on ${periodLabel(grain, prev.key)}` : '' },
    { label: 'Escalation rate', values: model.map(p => div(p.t('All')?.escalations, p.t('All')?.interactions)), f: pctF, good: 'down', accent: C.red.tx,
      detail: `${int(latest.t('All')?.escalations)} of ${int(latest.t('All')?.interactions)} interactions` },
  ] : []

  const btn = (active) => ({ padding: '6px 14px', fontSize: 12.5, fontWeight: 700, borderRadius: 20, cursor: 'pointer',
    border: `1.5px solid ${active ? C.acc : C.border2}`, background: active ? C.acc : C.card, color: active ? C.onAcc : C.t2 })
  const grid = (a, b) => (narrow ? { display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 14 } : row2(a, b))
  const dim = { opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }
  const range = data ? (view.length > 1 ? `${periodLabel(grain, view[0].key)} – ${periodLabel(grain, view.at(-1).key)}` : periodLabel(grain, view[0].key)) : ''
  const win = data ? `${data.start} → ${data.end}` : ''

  return (
    <div style={{ padding: '18px 22px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>Freshdesk · Ozonetel · Shopify D2C</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.t1, letterSpacing: -0.5 }}>Customer Support</div>
          {data && <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>{g.label} view · {range}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, background: C.card, padding: 4, borderRadius: 24, boxShadow: C.sh1 }}>
            {GRAINS.map(x => <button key={x.id} style={{ ...btn(grain === x.id), border: 'none' }} onClick={() => setGrain(x.id)}>{x.label}</button>)}
          </div>
        </div>
      </div>

      {error && <div style={{ background: C.red.bg, color: C.red.tx, border: `1px solid ${C.red.bd}`, padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>Couldn't load support data: {error}</div>}
      {!data && loading && <div style={{ color: C.t3, fontSize: 13 }}>Loading support data…</div>}

      {data && latest && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${vw < 760 ? 2 : vw < 1100 ? 3 : vw < 1500 ? 4 : 6}, minmax(0, 1fr))`, gap: 12, ...dim }}>
            {kpis.map(k => <KpiCard key={k.label} {...k} prevLabel={prev ? `vs ${periodLabel(grain, prev.key)}` : ''} />)}
          </div>

          <SectionTitle note="what came in, on which channel">Volume</SectionTitle>
          <div style={{ ...grid(2, 1), ...dim }}>
            <Card title="Interactions by channel" note={g.label.toLowerCase()}><ChannelTrend model={model} grain={grain} /></Card>
            <Card title="Channel mix" note={periodLabel(grain, latest.key)}><ChannelMix latest={latest} /></Card>
          </div>

          <SectionTitle note="how fast we respond">Speed & SLA</SectionTitle>
          <div style={{ ...grid(3, 2), ...dim }}>
            <Card title="Agent first response time" note="first reply from a real agent, business hours, by channel"><FrtTrend model={model} grain={grain} /></Card>
            <Card title="SLA attainment" note={periodLabel(grain, latest.key)}><SlaBars latest={latest} prev={prev} /></Card>
          </div>

          <SectionTitle note="Ozonetel inbound line">Calls</SectionTitle>
          <div style={{ ...grid(2, 3), ...dim }}>
            <Card fill title="Inbound call funnel" note={periodLabel(grain, latest.key)}><CallFunnel calls={latest.calls} /></Card>
            <Card title="Answered vs missed by hour" note={win}><CallsByHour rows={data.callsHourly} /></Card>
          </div>

          <SectionTitle note="when customers contact us, and why">Demand</SectionTitle>
          <div style={{ ...grid(3, 2), ...dim }}>
            <Card fill title="Contact heatmap" note={`interactions by weekday × hour (IST), ${data.trendStart || data.start} → ${data.end}`}><ContactHeatmap rows={data.heat} /></Card>
            <Card fill title="Orders vs interactions" note="Shopify D2C orders against support interactions"><OrdersVsInteractions model={model} grain={grain} /></Card>
          </div>
          <div style={{ ...grid(1, 1), ...dim }}>
            <Card fill title="Top volume drivers" note={`dispositions, last 7 days to ${periodLabel('day', data.end)}`}><DriversChart data={data} /></Card>
            <Card title="Agent leaderboard" note={`assigned interactions, ${win}`}><AgentBoard rows={data.agentBoard} /></Card>
          </div>

          <SectionTitle note="as of now, whatever dates are chosen">Pending tickets — ageing</SectionTitle>
          <div style={dim}>
            <Collapsible defaultOpen title="Parent tickets" note="Association type Parent or none. Created in the last 45 days and not Resolved / Closed (Junk, i.e. discarded spam, is left out). Age = today − created date; tickets created today count under 1 day.">
              <PendencyTable data={data} kind="Parent" />
            </Collapsible>
          </div>
          <div style={dim}>
            <Collapsible defaultOpen title="Child tickets" note="Association type Child, by the resolver group they were raised to. Same rules: created in the last 45 days, not Resolved / Closed, age = today − created date.">
              <PendencyTable data={data} kind="Child" />
            </Collapsible>
          </div>

          <SectionTitle
            note={dGrain === 'day' ? 'every KPI from the CC sheet, last 7 days' : `every KPI from the CC sheet, ${gd.label.toLowerCase()} — the latest ${dGrain} may be partial`}
            right={(
              <div style={{ display: 'flex', gap: 4, background: C.card, padding: 3, borderRadius: 20, boxShadow: C.sh1 }}>
                {[{ id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }].map(x => (
                  <button key={x.id} onClick={() => setDGrain(x.id)} title={x.id === 'day' ? 'Last 7 days (DoD)' : x.id === 'week' ? 'Last 4 weeks (WoW)' : 'Last 3 months (MoM)'}
                    style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 12px', borderRadius: 16, border: 'none', cursor: 'pointer',
                      background: dGrain === x.id ? C.acc : 'transparent', color: dGrain === x.id ? C.onAcc : C.t2 }}>{x.label}</button>
                ))}
              </div>
            )}>Detailed KPIs</SectionTitle>
          {dError && <div style={{ background: C.red.bg, color: C.red.tx, border: `1px solid ${C.red.bd}`, padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>Couldn't load the detailed tables: {dError}</div>}
          {!dData && dLoading && <div style={{ color: C.t3, fontSize: 13 }}>Loading detailed tables…</div>}
          {dData && (
            <>
              {secs.map((sec, i) => (
                <div key={sec.id} style={{ opacity: dLoading ? 0.6 : 1, transition: 'opacity .2s' }}>
                  <Collapsible title={sec.title} note={sec.note} defaultOpen={i === 0}
                    toggle={sec.rows.some(r => r.pct) ? { default: PCT_DEFAULT[sec.id] || 'count' } : null}>
                    {mode => <Matrix rows={sec.rows} model={dModel} grain={dGrain} deltaLabel={gd.delta} mode={mode} hidden={dData.hidden || 0} />}
                  </Collapsible>
                </div>
              ))}
              <div style={{ opacity: dLoading ? 0.6 : 1, transition: 'opacity .2s' }}>
                <Collapsible title="TTR — time to resolve, parent and child tickets"
                  note="Parent and child tickets, then each resolver group (top 12), period by period: tickets created, resolved / closed, still pending (as of now) and TTR = average hours from Created to Resolved / Closed. Green = better than the previous period, red = worse.">
                  <TtrTable data={dData} model={dModel} grain={dGrain} hidden={dData.hidden || 0} />
                </Collapsible>
              </div>
              <div style={{ opacity: dLoading ? 0.6 : 1, transition: 'opacity .2s' }}>
                <Collapsible title="Volume drivers — top 15 by sub category level 2" note={`ranked on the latest period; each row is Sub category 2 · its disposition (hover for the full path); % = share of that period's interactions`} toggle={{ default: 'count' }}>
                  {mode => <Drivers data={dData} model={dModel} grain={dGrain} deltaLabel={gd.delta} mode={mode} hidden={dData.hidden || 0} />}
                </Collapsible>
              </div>
            </>
          )}

          <div style={{ fontSize: 11, color: C.t3 }}>
            Periods {win}{grain !== 'day' ? '; the latest period may be partial' : ''}. Data as of {new Date(data.asOf).toLocaleString('en-IN')}.
            Not shown yet: CSAT (no survey data in BigQuery) and revenue / order / item plans (no plan source).
          </div>
        </>
      )}
    </div>
  )
}
