import { getBQ, runQueriesLimited } from './_bq.js'

// Customer Support KPIs: Freshdesk tickets + Ozonetel calls + Shopify D2C orders, bucketed by
// day / ISO week / month so the page can lay periods out as columns (Day 1..7, Week 1..4,
// Month 1..2 in the CC dashboard spec).
//
// Source: ONE table, production.cs_dashboard_unified (SQL: scripts/sql/cs_dashboard_unified.sql),
// rebuilt daily at 11:00 IST by the BigQuery scheduled query cs_dashboard_unified_refresh_schedule
// from Freshdesk (tickets, conversations, agents), Ozonetel (calls, agent login) and Shopify D2C
// orders. record_type tells its rows apart: ticket / call / agent_day / order_day. The heavy work
// (first replies, business-hour FRT, TTR, call-level grouping) is done there, once a day, so the
// queries below are plain aggregations. Data is therefore as of the last 11:00 IST refresh.
//
// Definitions (kept in one place so the page tooltips can quote them)
//   Interaction      ticket with association type Parent or blank (spam included, as in the
//                    CC spec and the CS team's daily working sheet)
//   Task             Child ticket
//   Unique           distinct customer (contact id, else phone, else email) among interactions
//   Customer-initiated  interactions not started by us (excludes the voice-outbound group,
//                       outbound email and the 'Outbound Call' disposition)
//   Escalation       ticket in the Escalations or CXO-Escalations group.
//   TTR              Time to resolve: (Resolved, else Closed) time - Created time, hours, for tickets
//                    created in the period: child tickets by resolver group (Group_Name) and parent tickets
//   FRT              ticket creation -> first public reply from us (bots included)
//   Agent FRT        ticket creation -> first public reply from a Freshdesk agent
//                    Both are BUSINESS-HOUR time, using each group's Freshdesk business hours:
//                    10:00-19:00 for chat, email and escalations, 08:00-22:00 for social media.
//                    A chat at 21:00 answered at 10:15 the next day counts as 15 minutes, as in
//                    Freshdesk's own reports - wall-clock time overstated FRT 3-5x.
//   ART              average resolution time (resolved tickets)
//   Inbound (voice)  Ozonetel inbound calls, one per call_id, first ring 10:00-19:00 IST (see
//                    callLevel): FRT = time to answer, AHT = handling time,
//                    ACW = wrap-up time, all on answered calls
//   CSAT and plan figures are not shown: no survey or plan data exists in BigQuery yet.

const T = '`frido-429506.production.cs_dashboard_unified`'

const GRAINS = { day: 7, week: 4, month: 2 }
const CACHE_TTL_MS = 30 * 60 * 1000
const cache = new Map()

const iso = (d) => d.toISOString().slice(0, 10)
const todayIst = () => iso(new Date(Date.now() + 5.5 * 3600 * 1000))
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
const mondayOf = (s) => { const d = new Date(s + 'T00:00:00Z'); return addDays(s, -((d.getUTCDay() + 6) % 7)) }

// Period keys oldest -> newest, and the inclusive date window they cover.
export function periodsFor(grain, end, count) {
  const keys = []
  if (grain === 'day') {
    for (let i = count - 1; i >= 0; i--) keys.push(addDays(end, -i))
    return { keys, start: keys[0], end }
  }
  if (grain === 'week') {
    const last = mondayOf(end)
    for (let i = count - 1; i >= 0; i--) keys.push(addDays(last, -7 * i))
    return { keys, start: keys[0], end }
  }
  const [y, m] = end.split('-').map(Number)
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1))
    keys.push(iso(d).slice(0, 7))
  }
  return { keys, start: keys[0] + '-01', end }
}

// Period keys for an explicit date range (the top-bar date picker). Edge periods can be
// partial: a week or month that starts before `start` only counts the days inside the range.
// Daily view is capped at 62 columns, keeping the latest 62 days.
export function periodsForRange(grain, start, end) {
  if (grain === 'day') {
    const from = addDays(end, -61) > start ? addDays(end, -61) : start
    const keys = []
    for (let d = from; d <= end; d = addDays(d, 1)) keys.push(d)
    return { keys, start: from, end }
  }
  if (grain === 'week') {
    const keys = []
    for (let d = mondayOf(start); d <= end; d = addDays(d, 7)) keys.push(d)
    return { keys, start, end }
  }
  const keys = []
  let [y, m] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  while (y < ey || (y === ey && m <= em)) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`)
    if (++m > 12) { m = 1; y++ }
  }
  return { keys, start, end }
}

const bucketSql = (grain, d) => (grain === 'day' ? `CAST(${d} AS STRING)`
  : grain === 'week' ? `CAST(DATE_TRUNC(${d}, WEEK(MONDAY)) AS STRING)`
    : `FORMAT_DATE('%Y-%m', ${d})`)

// Inbound calls (record_type 'call', is_cs_inbound): one row per Ozonetel call_id on the customer
// line, campaign 'Inbound_918045152790', type Inbound, first ring 10:00:00-19:00:59 IST; a call is
// answered if any of its attempts was. 21 Oct 2026: 2,174 calls, 1,260 answered, 1,516 callers.

function buildQueries(grain, start, end) {
  const B = (d) => bucketSql(grain, d)
  const inWin = `event_date BETWEEN '${start}' AND '${end}'`

  // Ticket rows in the window, with the short names the aggregates below use.
  const TICKETS = `
    tr AS (
      SELECT ${B('event_date')} AS bucket, event_ts AS created_ist, ticket_id AS id, channel,
        group_name AS grp, is_escalation AS is_esc, is_interaction AS is_int, is_task,
        is_customer_initiated AS is_cust, customer_key AS cust, resolution_time_hrs AS res_hrs,
        agent_name AS agent, replying_agent_ids,
        COALESCE(disposition, '(blank)') AS dispo, COALESCE(sub_category, '(blank)') AS sub1,
        COALESCE(sub_category_2, '(blank)') AS sub2,
        frt_bh_seconds AS frt_s, agent_frt_bh_seconds AS afrt_s
      FROM ${T}
      WHERE record_type = 'ticket' AND ${inWin}
    )`

  const TICKET_AGG = `
        COUNTIF(is_int) AS interactions,
        COUNTIF(is_task) AS tasks,
        COUNT(DISTINCT IF(is_int, cust, NULL)) AS unique_int,
        COUNTIF(is_int AND is_cust) AS cust_int,
        COUNTIF(is_int AND is_esc) AS escalations,
        SUM(IF(is_int AND frt_s >= 0, frt_s, NULL)) AS frt_sum, COUNTIF(is_int AND frt_s >= 0) AS frt_n,
        SUM(IF(is_int AND afrt_s >= 0, afrt_s, NULL)) AS afrt_sum, COUNTIF(is_int AND afrt_s >= 0) AS afrt_n,
        SUM(IF(is_int, res_hrs, NULL)) AS res_sum, COUNTIF(is_int AND res_hrs IS NOT NULL) AS res_n,
        COUNTIF(is_int AND afrt_s BETWEEN 0 AND 20) AS sla_20s, COUNTIF(is_int AND afrt_s BETWEEN 0 AND 40) AS sla_40s,
        COUNTIF(is_int AND afrt_s BETWEEN 0 AND 600) AS sla_10m, COUNTIF(is_int AND afrt_s BETWEEN 0 AND 900) AS sla_15m`

  const CALLS = `
    c AS (
      SELECT ${B('event_date')} AS bucket, event_ts, caller_id, is_answered AS answered,
        time_to_answer_s AS tta, handling_s AS ht, wrapup_s AS acw
      FROM ${T}
      WHERE record_type = 'call' AND is_cs_inbound AND ${inWin}
    )`

  return {
    // Per bucket x channel, plus an 'All' total per bucket (exact uniques), plus escalations
    // as their own row set - escalation is a flag on top of the source channel, not a channel.
    tickets: `WITH ${TICKETS}
      -- IF(GROUPING(...)) rather than COALESCE: an alias named like the grouped column made
      -- BigQuery keep the rollup row's NULL instead of labelling it 'All'.
      SELECT bucket, IF(GROUPING(channel) = 1, 'All', channel) AS ch, ${TICKET_AGG}
      FROM tr GROUP BY GROUPING SETS ((bucket, channel), (bucket))
      UNION ALL
      SELECT bucket, 'Escalation' AS ch, ${TICKET_AGG}
      FROM tr WHERE is_esc GROUP BY bucket
      -- ...and each escalation group on its own, with the same metrics (channel key = group name).
      UNION ALL
      SELECT bucket, grp AS channel, ${TICKET_AGG}
      FROM tr WHERE grp IN ('Escalations', 'CXO-Escalations') GROUP BY bucket, grp`,

    // Volume drivers: Disposition > Sub category > Sub category 2 of interactions, per bucket.
    dispositions: `WITH ${TICKETS}
      SELECT bucket, dispo, sub1, sub2, COUNT(*) AS n FROM tr WHERE is_int GROUP BY 1, 2, 3, 4`,

    // TTR: (Resolved, else Closed) time - Created time (ttr_hours, NULL until resolved), over the
    // tickets created in each period. `ttr` = child tickets by resolver group; `ttrType` = by
    // association type (Parent / Child / none).
    ttr: `SELECT ${B('event_date')} AS bucket, COALESCE(NULLIF(TRIM(group_name), ''), '(no group)') AS grp,
        COUNT(*) AS created, COUNTIF(ttr_hours IS NOT NULL) AS resolved, SUM(ttr_hours) AS hrs_sum
      FROM ${T}
      WHERE record_type = 'ticket' AND ${inWin} AND association_type = 'Child'
      GROUP BY 1, 2`,
    ttrType: `SELECT ${B('event_date')} AS bucket, COALESCE(association_type, 'None') AS assoc,
        COUNT(*) AS created, COUNTIF(ttr_hours IS NOT NULL) AS resolved, SUM(ttr_hours) AS hrs_sum
      FROM ${T}
      WHERE record_type = 'ticket' AND ${inWin}
      GROUP BY 1, 2`,

    // Pending ticket ageing, independent of the chosen dates: tickets created in the last 45 days
    // that are not Resolved / Closed (Junk = discarded spam is left out), by resolver group.
    // kind: Child = association type Child; Parent = Parent or none. Age = today - created date;
    // today's tickets fall in the first bucket (1 day). Statuses are as of the last refresh.
    pendency: `WITH x AS (
        SELECT IF(association_type = 'Child', 'Child', 'Parent') AS kind,
          COALESCE(NULLIF(TRIM(group_name), ''), '(no group)') AS grp,
          DATE_DIFF(CURRENT_DATE('Asia/Kolkata'), event_date, DAY) AS age
        FROM ${T}
        WHERE record_type = 'ticket'
          AND event_date >= DATE_SUB(CURRENT_DATE('Asia/Kolkata'), INTERVAL 45 DAY)
          AND status NOT IN ('Resolved', 'Closed', 'Junk')
          AND COALESCE(association_type, '') IN ('', 'Parent', 'Child'))
      SELECT kind, grp,
        CASE WHEN age <= 1 THEN '1' WHEN age = 2 THEN '2' WHEN age = 3 THEN '3' WHEN age <= 5 THEN '4-5'
             WHEN age <= 8 THEN '6-8' WHEN age <= 10 THEN '9-10' WHEN age <= 15 THEN '11-15' ELSE '15+' END AS bucket,
        COUNT(*) AS n
      FROM x GROUP BY 1, 2, 3`,

    // Top volume drivers card: always the last 7 days ending on the "up to" date, against the
    // 7 days before, whatever the Daily / Weekly / Monthly view.
    dispo7: `SELECT COALESCE(disposition, '(blank)') AS dispo,
        COUNTIF(event_date >= '${addDays(end, -6)}') AS cur,
        COUNTIF(event_date < '${addDays(end, -6)}') AS prev
      FROM ${T}
      WHERE record_type = 'ticket' AND event_date BETWEEN '${addDays(end, -13)}' AND '${end}'
        AND COALESCE(association_type, '') IN ('', 'Parent')
      GROUP BY 1`,

    // When customers reach us: interactions by weekday x hour (IST) over the whole window.
    // dow follows BigQuery: 1 = Sunday ... 7 = Saturday.
    heat: `WITH ${TICKETS}
      SELECT EXTRACT(DAYOFWEEK FROM created_ist) AS dow, EXTRACT(HOUR FROM created_ist) AS hr, COUNT(*) AS n
      FROM tr WHERE is_int GROUP BY 1, 2`,

    // Agent leaderboard over the whole window (Freshdesk 'Agent' = assigned agent).
    agentBoard: `WITH ${TICKETS}
      SELECT agent, COUNTIF(is_int) AS interactions, COUNTIF(is_int AND res_hrs IS NOT NULL) AS resolved,
        SUM(IF(is_int AND afrt_s >= 0, afrt_s, NULL)) AS afrt_sum, COUNTIF(is_int AND afrt_s >= 0) AS afrt_n,
        SUM(IF(is_int, res_hrs, NULL)) AS res_sum,
        COUNTIF(is_int AND is_esc) AS escalations,
        APPROX_TOP_COUNT(channel, 1)[OFFSET(0)].value AS main_channel
      FROM tr
      WHERE agent IS NOT NULL
      GROUP BY 1 HAVING interactions > 0
      ORDER BY interactions DESC LIMIT 25`,

    // Inbound calls by hour of the call's first ring; the 19:00-minute arrivals fall in the 19:00 bar.
    callsHourly: `WITH ${CALLS}
      SELECT EXTRACT(HOUR FROM event_ts) AS hr, COUNT(*) AS total, COUNTIF(answered) AS answered
      FROM c GROUP BY 1 HAVING hr IS NOT NULL`,

    // Freshdesk agents who sent a public reply on tickets of each channel, by the ticket's bucket.
    agents: `WITH ${TICKETS}
      SELECT bucket, channel, COUNT(DISTINCT a) AS agents
      FROM tr, UNNEST(replying_agent_ids) AS a
      GROUP BY 1, 2`,

    // Inbound calls; a caller counts as missed only if none of their calls in the period was answered.
    calls: `WITH ${CALLS},
      callers AS (
        SELECT bucket, COUNT(*) AS unique_calls, COUNTIF(any_answered) AS unique_answered,
               COUNTIF(NOT any_answered) AS unique_missed
        FROM (SELECT bucket, caller_id, LOGICAL_OR(answered) AS any_answered FROM c GROUP BY 1, 2)
        GROUP BY 1
      ),
      calls AS (
        SELECT bucket, COUNT(*) AS total_calls, COUNTIF(answered) AS answered_calls,
          SUM(IF(answered, tta, NULL)) AS tta_sum, SUM(IF(answered, ht, NULL)) AS aht_sum,
          SUM(IF(answered, acw, NULL)) AS acw_sum, COUNTIF(answered AND ht IS NOT NULL) AS ans_n
        FROM c GROUP BY 1
      )
      SELECT calls.*, callers.unique_calls, callers.unique_answered, callers.unique_missed
      FROM calls JOIN callers USING (bucket)`,

    // Voice agents logged in and their login hours.
    voiceAgents: `SELECT ${B('event_date')} AS bucket,
        COUNT(DISTINCT IF(login_hours > 0, agent_name, NULL)) AS agents, SUM(login_hours) AS login_hours
      FROM ${T}
      WHERE record_type = 'agent_day' AND ${inWin}
      GROUP BY 1`,

    // Shopify D2C orders (website + Mobility store), from the daily order rows.
    orders: `SELECT ${B('event_date')} AS bucket,
        SUM(revenue) AS revenue, SUM(orders) AS orders, SUM(units) AS units
      FROM ${T}
      WHERE record_type = 'order_day' AND ${inWin}
      GROUP BY 1`,
  }
}

const num = (v) => (v == null ? null : Number(v.value ?? v))

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const body = req.body || {}
  const grain = GRAINS[body.grain] ? body.grain : 'day'
  const count = Math.min(Math.max(Number(body.periods) || GRAINS[grain], 1), 31)
  // Default end = yesterday IST: today's tickets and calls are still arriving.
  const end = /^\d{4}-\d{2}-\d{2}$/.test(body.end || '') ? body.end : addDays(todayIst(), -1)

  // Explicit range from the top-bar picker wins; otherwise the last N periods up to `end`.
  const ISO = /^\d{4}-\d{2}-\d{2}$/
  const range = ISO.test(body.start || '') && ISO.test(body.end || '') && body.start <= body.end
    ? periodsForRange(grain, body.start, body.end) : null

  const key = JSON.stringify(range ? [grain, range.start, range.end] : [grain, count, end])
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS && !body.refresh) return res.status(200).json(hit.data)

  try {
    let { keys, start, end: winEnd } = range || { ...periodsFor(grain, end, count), end }
    // A single day has no trend and nothing to compare against, so the 6 days before it are
    // fetched as context: trend charts and the heatmap show the full 7 days, the cards and
    // tables show only the chosen day (`hidden` = leading context periods the tables must not
    // list) and still compare it with the day before. Charts that read well for one day
    // (calls by hour, agent leaderboard) keep covering only the chosen day.
    const viewStart = start
    let hidden = 0
    if (grain === 'day' && keys.length === 1) {
      const day = keys[0]
      start = addDays(day, -6); keys = Array.from({ length: 7 }, (_, i) => addDays(start, i)); hidden = 6
    }
    const queries = buildQueries(grain, start, winEnd)
    if (hidden) {
      const view = buildQueries(grain, viewStart, winEnd)
      for (const k of ['agentBoard', 'callsHourly']) queries[k] = view[k]
    }
    const results = await runQueriesLimited(getBQ(), queries)
    const out = Object.fromEntries(results.map(({ key: k, rows }) => [k, rows.map(r =>
      Object.fromEntries(Object.entries(r).map(([c, v]) => [c, typeof v === 'object' && v !== null && !('value' in v) ? num(v) : (v?.value ?? v)])))]))
    const data = { grain, periods: keys, hidden, start: viewStart, trendStart: start, end: winEnd, asOf: new Date().toISOString(), ...out }
    cache.set(key, { at: Date.now(), data })
    res.status(200).json(data)
  } catch (e) {
    console.error('[customer-support]', e)
    res.status(500).json({ error: e.message })
  }
}
