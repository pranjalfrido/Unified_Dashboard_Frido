import { fmt, fmtN } from '../utils.js'

// Customer Support data model, shared by the laptop page (CustomerSupportPage.jsx) and the phone view
// (CustomerSupportMobile.jsx): one accessor per period (buildModel), the Detailed KPI sections and their
// rows (sections), TTR columns, pending ageing, volume drivers, formats and the change rule (changeOf).
// Moved here unchanged from CustomerSupportPage.jsx so both layouts show the same numbers.


export const GRAINS = [
  { id: 'day', label: 'Daily', n: 7, delta: 'vs same weekday last week' },
  { id: 'week', label: 'Weekly', n: 4, delta: 'WoW' },
  { id: 'month', label: 'Monthly', n: 2, delta: 'MoM' },
]
export const CHANNELS = ['Chat', 'Inbound', 'Email', 'Social media', 'Escalation']
// Display names (CA12): 'Inbound' here is Freshdesk tickets from the Phone source, a different system from
// the Ozonetel inbound call line, so the two are named apart.
export const chLabel = ch => (ch === 'Chat' ? 'Chat (WhatsApp)' : ch === 'Inbound' ? 'Inbound (tickets)' : ch)
// Display only (CA15): dispositions / sub categories sometimes end with dots ('Order Status Query.')
export const trimPunct = x => String(x ?? '').replace(/[.\s]+$/, '')

// ── formatting ──
export const dur = (s) => {
  if (s == null || !isFinite(s)) return '—'
  if (s < 60) return `${Math.round(s)}s`
  if (s < 3600) return `${(s / 60).toFixed(1)}m`
  return `${(s / 3600).toFixed(1)}h`
}
export const hrs = (h) => (h == null || !isFinite(h) ? '—' : `${h.toFixed(1)}h`)
export const pctF = (v) => (v == null || !isFinite(v) ? '—' : `${(v * 100).toFixed(1)}%`)
export const ratio = (v) => (v == null || !isFinite(v) ? '—' : v.toFixed(2))
export const int = (v) => (v == null || !isFinite(v) ? '—' : fmtN(Math.round(v)))
export const money = (v) => (v == null || !isFinite(v) ? '—' : fmt(v))
export const div = (a, b) => (a == null || !b ? null : a / b)

export function periodLabel(grain, key) {
  if (grain === 'month') {
    const [y, m] = key.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
  const d = new Date(key + 'T00:00:00Z')
  const s = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return grain === 'week' ? `Wk ${s}` : `${d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' })} ${s}`
}

// ── data shaping: one accessor per period ──
export function buildModel(data) {
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
export const avg = (row, sum, n) => (row && row[n] ? row[sum] / row[n] : null)

// Tables that carry a % / Count toggle open in Count, except SLA, which is a share by nature.
export const PCT_DEFAULT = { sla: 'pct' }

// FCR = share of Parent + blank tickets that did NOT need a child ticket (100% - MCR). A period's
// child tickets are not always children of that same period's parents, so it is clamped at 0.
export const fcr = (row) => (row?.interactions ? Math.max(0, 1 - (row.tasks || 0) / row.interactions) : null)

export function sections(model) {
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
        { label: 'UITU', good: 'up', hint: 'Unique interaction to unit = ordered units / unique customers contacting', fmt: ratio, get: p => div(units(p), all(p)?.unique_int) },
        { label: 'UITO', good: 'up', hint: 'Unique interaction to order = orders / unique customers contacting', fmt: ratio, get: p => div(ordersN(p), all(p)?.unique_int) },
        { label: 'CITU', good: 'up', hint: 'Customer interaction to unit = units / customer-initiated interactions (outbound excluded)', fmt: ratio, get: p => div(units(p), all(p)?.cust_int) },
        { label: 'CITO', good: 'up', hint: 'Customer interaction to order = orders / customer-initiated interactions', fmt: ratio, get: p => div(ordersN(p), all(p)?.cust_int) },
      ],
    },
    {
      id: 'interactions', title: 'Interactions',
      note: 'Association type Parent + blank. Escalation = tickets in the Escalations / CXO-Escalations groups.',
      rows: [
        ...['Chat', 'Inbound', 'Email', 'Social media', 'Escalation'].map(ch => ({
          label: chLabel(ch), fmt: int, get: p => p.t(ch)?.interactions,
          pct: p => div(p.t(ch)?.interactions, all(p)?.interactions),
          hint: { Chat: 'WhatsApp', Inbound: 'Freshdesk tickets from the Phone source (logged at any time, Sundays included): not the Ozonetel call line', Email: 'Email, outbound email and portal', 'Social media': 'Instagram and Facebook', Escalation: 'Tickets in the Escalations / CXO-Escalations groups' }[ch],
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
          { group: chLabel(ch), label: 'MCR', fmt: pctF, good: 'down', get: p => div(p.t(ch)?.tasks, p.t(ch)?.interactions) },
          { group: chLabel(ch), label: 'FCR', fmt: pctF, good: 'up', get: p => fcr(p.t(ch)) },
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
      id: 'ozonetel', title: 'Calls (Ozonetel): inbound line',
      note: 'Inbound line Inbound_918045152790 only. One count per call (Ozonetel call_id, not per ringing attempt), first ring 10:00–19:00 IST. Data starts 1 Oct 2026. A unique caller is missed only if none of their calls was answered.',
      rows: [
        // Count = the number; % = share of its base (total calls for the first three, unique callers for the rest).
        { label: 'Total calls', closedSunday: true, fmt: int, get: p => p.calls?.total_calls, pct: p => div(p.calls?.total_calls, p.calls?.total_calls), hint: '% = 100% (the base)' },
        { label: 'Answered calls', closedSunday: true, fmt: int, good: 'up', get: p => p.calls?.answered_calls, pct: p => div(p.calls?.answered_calls, p.calls?.total_calls), hint: '% = answered / total calls' },
        { label: 'Unique calls', closedSunday: true, fmt: int, get: p => p.calls?.unique_calls, pct: p => div(p.calls?.unique_calls, p.calls?.total_calls), hint: '% = unique callers / total calls (lower = more repeat callers)' },
        { label: 'Unique calls answered', closedSunday: true, fmt: int, good: 'up', get: p => p.calls?.unique_answered, pct: p => div(p.calls?.unique_answered, p.calls?.unique_calls), hint: '% = answered / unique callers' },
        { label: 'Unique calls missed', closedSunday: true, fmt: int, good: 'down', get: p => p.calls?.unique_missed, pct: p => div(p.calls?.unique_missed, p.calls?.unique_calls), hint: '% = missed / unique callers' },
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

// isRate: the metric is itself a % (stored as a fraction), so its change is shown in points
// ("▲ 3.3 pts"), not as a % of a % (CA11).
export function changeOf(cur, prev, isRate) {
  if (cur == null || prev == null || !isFinite(cur) || !isFinite(prev)) return null
  if (isRate) { const pts = (cur - prev) * 100; return { v: pts, flat: Math.abs(pts) < 0.05, text: `${Math.abs(pts).toFixed(1)} pts` } }
  if (prev === 0) return null
  const ch = (cur - prev) / Math.abs(prev)
  return { v: ch, flat: Math.abs(ch) < 0.005, text: `${Math.abs(ch * 100).toFixed(1)}%` }
}

// TTR. Columns = parent tickets, child tickets (all), then the top 12 resolver groups; for each, per
// period: tickets created, how many are resolved/closed, how many are still pending (created -
// resolved, as of now) and the average TTR of the resolved ones = (Resolved, else Closed) time -
// Created time, in hours.
export function ttrColumns(data) {
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

export const TTR_METRICS = [
  { id: 'created', label: 'Created', hint: 'Tickets created in the period', get: x => x.c, fmt: int },
  { id: 'resolved', label: 'Resolved', hint: 'Of those created, how many are resolved or closed now', get: x => x.n, fmt: int },
  { id: 'pending', label: 'Pending', hint: 'Created − resolved: still open as of now', get: x => x.c - x.n, fmt: int },
  { id: 'ttr', label: 'Avg TTR', hint: 'Resolved/Closed time − Created time, averaged over the resolved tickets', get: x => (x.n ? x.h / x.n : null), fmt: hrs, strong: true },
]

// Export rows (periods across, like the other tables): the same four metrics for every column.
export function ttrRows(data) {
  return ttrColumns(data).flatMap(col => TTR_METRICS.map(m => ({
    group: col.kind === 'group' ? `Resolver group: ${col.label}` : col.label,
    label: m.label, fmt: m.fmt, hint: m.hint, strong: m.strong,
    good: m.id === 'resolved' ? 'up' : m.id === 'pending' || m.id === 'ttr' ? 'down' : null,
    get: p => (col.v[p.key] ? m.get(col.v[p.key]) : m.id === 'ttr' ? null : 0),
  })))
}

// Pending ticket ageing: one table per kind (Parent / Child), resolver groups down, age buckets across.
export const AGE_BUCKETS = [
  ['1', '1 day'], ['2', '2 days'], ['3', '3 days'], ['4-5', '4-5 days'],
  ['6-8', '6-8 days'], ['9-10', '9-10 days'], ['11-15', '11-15 days'], ['15+', '15+ days'],
]
export function pendencyRows(data, kind) {
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
export function pendencyCsv(data, kind) {
  const { rows, all, total } = pendencyRows(data, kind)
  const line = (name, v, t) => ({ 'Resolver group': name, ...Object.fromEntries(AGE_BUCKETS.map(([k, l]) => [l, v[k] || 0])), Total: t })
  return [line('All resolver groups', all, total), ...rows.map(r => line(r.grp, r.v, r.total))]
}

// Top 15 by volume at sub category level 2. The same level-2 name sits under several parents
// (e.g. 'Pick Up Delayed' under Exchange and Return), so a row is one Disposition > Sub category >
// Sub category 2 path, labelled with the level-2 name and its disposition; hover for the full path.
export function driverRows(data, model) {
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
  return [...m.values()].map(({ dispo, sub1, sub2, v }) => ({
    label: `${trimPunct(sub2)} · ${trimPunct(dispo)}`, hint: `${trimPunct(dispo)} › ${trimPunct(sub1)} › ${trimPunct(sub2)}`, fmt: int, good: 'down',
    get: p => v[p.key], pct: p => div(v[p.key], p.t('All')?.interactions),
  })).sort((a, b) => (b.get({ key: last }) || 0) - (a.get({ key: last }) || 0)).slice(0, 15)
}

// One flat CSV of every detailed table, in the view on screen. Columns: Table, Group, Metric, Unit,
// one column per period (ISO key: day, week start or month), Change % (latest vs previous period).
// Values are raw numbers (durations in seconds / hours, rates in %), and a row that has a % view
// gets a second "(%)" row so the file holds both the Count and the % toggle states.
export function detailedCsv(tables, model, hidden) {
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

export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const MAIN = ['Chat', 'Inbound', 'Email', 'Social media']

export const shiftDay = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

// B2.5 (Contacts per 100 orders by reason): Shopify D2C orders of the last 7 periods of a Day-view model
// (dispo7 covers the last 7 days to the end date), contacts per 100 of them, and the page that explains a
// reason (return / exchange → Return Analysis, delivery / order status / cancellation → Logistics).
export const orders7Of = model => (model.length >= 7 ? model.slice(-7).reduce((s, p) => s + (p.orders?.orders || 0), 0) : 0)
export const per100 = (n, orders) => (orders > 0 ? (n / orders * 100).toFixed(1) : null)
const REASON_LINKS = [
  { re: /return|exchange|refund|replace/i, dest: 'returns', label: 'Return Analysis' },
  { re: /order status|deliver|dispatch|ship|track|courier|pick ?up|cancel/i, dest: 'logistics', label: 'Logistics' },
]
export const reasonLink = name => REASON_LINKS.find(l => l.re.test(name)) || null
