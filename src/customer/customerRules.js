import { fmt, fmtN } from '../utils.js'
import { CUSTOMER_RULES, SUPPORT_RULES } from '../config/metricTargets.js'
import { avg, div, dur, pendencyRows, periodLabel } from './supportModel.js'

// Watchlists for Customer Intelligence (CUSTOMER_MASTER_PLAN.md Part B §B2.1) and Customer Support
// (§B2.4). Channel-level rules (no product list): each rule has `valueText` (the number), `line` (the
// facts behind it) and `target` (the sub-tab / section that explains it: tap → go there). Shape =
// WatchlistCard's `result`. Thresholds live in src/config/metricTargets.js; read-only, no new data.

const pct = (cur, prev) => (prev ? (cur - prev) / Math.abs(prev) * 100 : null)
const arrow = v => (v > 0 ? '▲' : v < 0 ? '▼' : '')
// Triggered rules first (stable), so the phone card's top 5 shows what needs attention.
const result = (all, label, rulesLines) => {
  const rules = [...all.filter(r => r.count > 0), ...all.filter(r => !r.count)]
  const triggered = rules.filter(r => r.count > 0).length
  return {
    rules, triggered, flaggedProducts: 0, smallCount: 0, bars: { label }, rulesLines,
    headerText: `${triggered} of ${rules.length} rule${rules.length === 1 ? '' : 's'} triggered`,
  }
}

// ── Customer Intelligence ──
// M1 retention of the latest complete cohort (its M1 month has ended before the end date's month) vs the
// size-weighted M1 of the 12 cohorts before it. Customers basis, as the Retention tab's default.
export function latestCohortM1(cohort, end, minSize = CUSTOMER_RULES.m1MinCohort) {
  const by = {}
  for (const r of cohort || []) {
    const cm = r.cohortMonth || r.cohort_month
    const idx = r.cohortIndex ?? r.cohort_index ?? 0
    if (!cm) continue
    ;(by[cm] ||= {})[idx] = r
  }
  const endMonth = (end || '').slice(0, 7)
  const addMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7) }
  const complete = Object.keys(by).sort().filter(cm => by[cm][1] && by[cm][0]?.customers > 0 && addMonth(cm, 1) < endMonth)
  const rate = cm => by[cm][1].customers / by[cm][0].customers * 100
  const eligible = complete.filter(cm => by[cm][0].customers >= minSize)
  const latest = eligible.at(-1)
  if (!latest) return null
  const before = complete.filter(cm => cm < latest).slice(-12)
  if (!before.length) return null
  const num = before.reduce((s, cm) => s + by[cm][1].customers, 0)
  const den = before.reduce((s, cm) => s + by[cm][0].customers, 0)
  return { cohort: latest, size: by[latest][0].customers, m1: rate(latest), avg: den ? num / den * 100 : null, n: before.length }
}

export function computeCustomerRules(custData, end) {
  if (!custData) return null
  const R = CUSTOMER_RULES
  const k = custData.kpis || {}, p = custData.prevKpis || {}
  const rules = []

  const cacChg = pct(k.cac, p.cac), roasChg = pct(k.roas, p.roas)
  const cacHit = cacChg != null && roasChg != null && cacChg >= R.cacUpPct && roasChg < 0
  rules.push({
    id: 'cac', name: 'Acquisition getting expensive', target: 'trends', red: true, count: cacHit ? 1 : 0,
    valueText: cacChg == null ? '—' : `${arrow(cacChg)}${Math.abs(cacChg).toFixed(1)}%`,
    line: cacChg == null ? 'No previous period to compare' : `CAC ${fmt(k.cac)} vs ${fmt(p.cac)} · ROAS ${(k.roas || 0).toFixed(2)}x vs ${(p.roas || 0).toFixed(2)}x`,
    info: `CAC up at least ${R.cacUpPct}% vs the previous period while ROAS fell.`,
  })

  const lc = k.ltvCac || 0
  rules.push({
    id: 'ltvcac', name: `LTV:CAC below ${R.ltvCacMin}x`, target: 'overview', red: false, count: lc > 0 && lc < R.ltvCacMin ? 1 : 0,
    valueText: lc > 0 ? `${lc.toFixed(2)}x` : '—',
    line: `LTV ${fmt(k.ltv12 || 0)} (12-mo revenue) ÷ CAC ${fmt(k.cac || 0)}`,
    info: 'LTV here is revenue per customer over the last 12 months (not margin), so 3x on revenue is a soft bar.',
  })

  const m1 = latestCohortM1(custData.cohort, end)
  const m1Gap = m1 && m1.avg != null ? m1.m1 - m1.avg : null
  rules.push({
    id: 'm1', name: 'M1 retention slipping', target: 'cohort', red: false, count: m1Gap != null && m1Gap < -R.m1DropPts ? 1 : 0,
    valueText: m1 ? `${m1.m1.toFixed(1)}%` : '—',
    line: m1 ? `${m1.cohort} cohort (${fmtN(m1.size)}) vs ${m1.avg.toFixed(1)}% avg of the ${m1.n} before` : 'No complete cohort yet',
    info: `M1 retention of the latest complete cohort (≥ ${fmtN(R.m1MinCohort)} customers) below the size-weighted average of the 12 cohorts before it by more than ${R.m1DropPts} pts.`,
  })

  const rr = (k.repeatRevenueRate || 0) * 100, prr = (p.repeatRevenueRate || 0) * 100
  const rrPts = p.repeatRevenueRate ? rr - prr : null
  rules.push({
    id: 'repeatRev', name: 'Repeat revenue share down', target: 'overview', red: false, count: rrPts != null && rrPts <= -R.repeatRevDropPts ? 1 : 0,
    valueText: rrPts == null ? '—' : `${arrow(rrPts)}${Math.abs(rrPts).toFixed(1)} pts`,
    line: rrPts == null ? 'No previous period to compare' : `${rr.toFixed(1)}% of gross sales vs ${prr.toFixed(1)}%`,
    info: `Repeat revenue % down at least ${R.repeatRevDropPts} pts vs the previous period.`,
  })

  const byFirst = custData.discountRepeatRateByFirst || []
  const dRow = byFirst.find(r => r.type === 'Discounted'), nRow = byFirst.find(r => r.type === 'Non-Discounted')
  const gap = dRow && nRow ? Number(dRow.repeatRate) - Number(nRow.repeatRate) : null
  rules.push({
    id: 'discount', name: 'Discount dependence', target: 'spend', red: false, count: gap != null && gap > R.discountGapPts ? 1 : 0,
    valueText: gap == null ? '—' : `${gap >= 0 ? '+' : '−'}${Math.abs(gap).toFixed(1)} pts`,
    line: gap == null ? 'No discount data' : `Repeat rate ${Number(dRow.repeatRate).toFixed(1)}% discounted vs ${Number(nRow.repeatRate).toFixed(1)}% full-price first orders`,
    info: `Customers whose first order was discounted come back more than full-price ones by more than ${R.discountGapPts} pts: repeat demand leans on discounts.`,
  })

  const wb = (custData.rfm || []).filter(r => R.winBackSegments.includes(r.segment))
  const wbCust = wb.reduce((s, r) => s + (r.customers || 0), 0), wbRev = wb.reduce((s, r) => s + (r.totalRevenue || 0), 0)
  rules.push({
    id: 'winback', name: 'Win-back pool', target: 'rfm', red: false, count: wbCust > 0 ? 1 : 0,
    valueText: fmtN(wbCust),
    line: wbCust ? `${fmt(wbRev)} lifetime revenue · ${wb.map(r => `${r.segment} ${fmtN(r.customers)}`).join(' · ')}` : 'No customers in these segments',
    info: `${R.winBackSegments.join(' + ')} customers (RFM, 12 months to the end date) and their lifetime revenue.`,
  })

  return result(rules, 'Customer', [
    `CAC up ≥ ${R.cacUpPct}% while ROAS down`, `LTV:CAC below ${R.ltvCacMin}x`,
    `M1 of the latest complete cohort below its 12-cohort average by > ${R.m1DropPts} pts (cohorts ≥ ${fmtN(R.m1MinCohort)})`,
    `Repeat revenue % down ≥ ${R.repeatRevDropPts} pts`, `Repeat rate discounted − full-price first orders > ${R.discountGapPts} pts`,
    `Win-back pool: ${R.winBackSegments.join(' + ')}`,
  ])
}

// ── Customer Support ──
// model: buildModel(data); back: how many periods back "vs prev" compares (7 in Day view, else 1).
export function computeSupportRules(data, model, back = 1, grain = 'day') {
  if (!data || !model?.length) return null
  const R = SUPPORT_RULES
  const latest = model.at(-1), prev = model.length > back ? model.at(-1 - back) : null
  const prevLbl = prev ? periodLabel(grain, prev.key) : ''
  const rules = []

  const old = new Set(['9-10', '11-15', '15+'])
  const byGrp = {}
  let pend = 0
  for (const r of data.pendency || []) {
    if (!old.has(r.bucket)) continue
    const n = Number(r.n) || 0
    pend += n; byGrp[r.grp] = (byGrp[r.grp] || 0) + n
  }
  const top = Object.entries(byGrp).sort((a, b) => b[1] - a[1])[0]
  const allPend = pendencyRows(data, 'Parent').total + pendencyRows(data, 'Child').total
  rules.push({
    id: 'pending', name: `Pending > ${R.pendingDays} days`, target: 'pending', red: true, count: pend > 0 ? 1 : 0,
    valueText: fmtN(pend), line: pend ? `of ${fmtN(allPend)} pending · most in ${top[0]} (${fmtN(top[1])})` : `None of ${fmtN(allPend)} pending tickets`,
    info: 'Parent + child tickets still open after more than 8 days (as of now, whatever dates are chosen).',
  })

  const checked = Object.keys(R.frtTargetSec).filter(ch => (latest.t(ch)?.afrt_n || 0) >= R.frtMinReplies)
  const over = Object.entries(R.frtTargetSec).map(([ch, t]) => {
    const row = latest.t(ch)
    const v = avg(row, 'afrt_sum', 'afrt_n')
    return { ch, t, v, n: row?.afrt_n || 0 }
  }).filter(x => x.v != null && x.n >= R.frtMinReplies && x.v > x.t)
  rules.push({
    id: 'frt', name: 'Agent FRT above target', target: 'speed', red: false, count: over.length,
    valueText: `${over.length} channel${over.length === 1 ? '' : 's'}`,
    line: over.length ? over.map(x => `${x.ch} ${dur(x.v)} vs ${dur(x.t)}`).join(' · ') : checked.length ? `${checked.join(', ')} within target` : `Not enough agent replies to check (< ${R.frtMinReplies} per channel)`,
    info: `Agent first response time above the channel's target (chat ${dur(R.frtTargetSec.Chat)}, social ${dur(R.frtTargetSec['Social media'])}, email ${dur(R.frtTargetSec.Email)}; starting targets, to confirm with the CS head), channels with at least ${R.frtMinReplies} agent replies.`,
  })

  const esc = p => div(p?.t('All')?.escalations, p?.t('All')?.interactions)
  const e1 = esc(latest), e0 = prev ? esc(prev) : null
  const ePts = e1 != null && e0 != null ? (e1 - e0) * 100 : null
  rules.push({
    id: 'esc', name: 'Escalation rate up', target: 'top', red: true, count: ePts != null && ePts >= R.escalationUpPts ? 1 : 0,
    valueText: ePts == null ? '—' : `${arrow(ePts)}${Math.abs(ePts).toFixed(1)} pts`,
    line: ePts == null ? 'No comparison period' : `${(e1 * 100).toFixed(1)}% vs ${(e0 * 100).toFixed(1)}% ${prevLbl ? `on ${prevLbl}` : ''}`.trim(),
    info: `Escalations ÷ interactions up at least ${R.escalationUpPts} pts vs ${back === 7 ? 'the same weekday last week' : 'the previous period'}.`,
  })

  const per = p => { const v = div(p?.t('All')?.interactions, p?.orders?.orders); return v == null ? null : v * 100 }
  const c1 = per(latest), c0 = prev ? per(prev) : null
  const cChg = c1 != null && c0 ? (c1 - c0) / c0 * 100 : null
  rules.push({
    id: 'per100', name: 'Contacts per 100 orders up', target: 'demand', red: false, count: cChg != null && cChg >= R.per100UpPct ? 1 : 0,
    valueText: c1 == null ? '—' : `${c1.toFixed(0)}`,
    line: c1 == null ? 'No orders in this period' : cChg == null ? `${c1.toFixed(0)} per 100 orders` : `${arrow(cChg)}${Math.abs(cChg).toFixed(1)}% vs ${c0.toFixed(0)} ${prevLbl ? `on ${prevLbl}` : ''}`.trim(),
    info: `Interactions per 100 Shopify D2C orders up at least ${R.per100UpPct}% vs ${back === 7 ? 'the same weekday last week' : 'the previous period'}.`,
  })

  return result(rules, 'Support', [
    `Pending more than ${R.pendingDays} days`, `Agent FRT above chat ${dur(R.frtTargetSec.Chat)} / social ${dur(R.frtTargetSec['Social media'])} / email ${dur(R.frtTargetSec.Email)} (≥ ${R.frtMinReplies} replies)`,
    `Escalation rate up ≥ ${R.escalationUpPts} pts`, `Interactions per 100 orders up ≥ ${R.per100UpPct}%`,
  ])
}
