import { SEG_META } from './customerDefs.js'

// Customer Intelligence numbers for the phone view (src/customer/CustomerMobileView.jsx). Every value
// here is computed with the same formula as the laptop tab in App.jsx (CustomerPage), from the same
// /api/customer response; docs/responsive/CUSTOMER_VERIFICATION.md checks them value by value.

export const pctChg = (cur, prev) => (prev ? (cur - prev) / Math.abs(prev) * 100 : null)

// One row per day: what the master cards plot (sums per day; ratios divide in point()).
export function dailyRows(cd) {
  const spend = {}
  for (const r of cd.dailySpend || []) spend[r.date || ''] = (spend[r.date || ''] || 0) + (r.totalSpend || 0)
  return (cd.daily || []).filter(r => r.date).map(r => ({
    date: r.date,
    gross: r.grossSales || 0, grossExc: r.grossSalesExc || 0, orders: r.totalOrders || 0,
    newC: r.newCustomers || 0, repC: r.repeatCustomers || 0,
    newOrders: r.newOrders || 0, repOrders: r.repeatOrders || 0,
    newSales: r.newSales || 0, repSales: r.repeatSales || r.repeatRevenue || 0,
    repRev: r.repeatRevenue || 0, spend: spend[r.date] || 0,
  }))
}

// Overview "Ad Spend & Acquisition" / "Revenue & Lifetime Value" tables (laptop ledger1 / ledger2).
export function ledgers(k, p) {
  const pLtv12 = p.ltv12 || null
  const pLtvCac = (p.ltvCac != null && p.ltvCac > 0) ? p.ltvCac : null
  return [
    { title: 'Ad spend & acquisition', rows: [
      { label: 'Total spend', cur: k.totalSpend || 0, prev: p.totalSpend || 0, f: 'money' },
      { label: 'New customers', cur: k.newCustomers || 0, prev: p.newCustomers || 0, f: 'int' },
      { label: 'Returning customers', cur: k.returningCustomers || 0, prev: p.returningCustomers || 0, f: 'int' },
      { label: 'ROAS', cur: k.roas || 0, prev: p.roas || 0, f: 'x' },
      { label: 'CAC', cur: k.cac || 0, prev: p.cac || 0, f: 'money', lowerBetter: true },
    ] },
    { title: 'Revenue & lifetime value', rows: [
      { label: 'Gross rev (ex GST)', cur: k.grossExcGst || 0, prev: p.grossExcGst || 0, f: 'money' },
      { label: 'Net rev (ex GST)', cur: k.netRevenue || 0, prev: p.netRevenue || 0, f: 'money' },
      { label: 'Repeat rev %', cur: (k.repeatRevenueRate || 0) * 100, prev: (p.repeatRevenueRate || 0) * 100, f: 'pct' },
      { label: 'LTV (12-mo revenue)', cur: k.ltv12 || 0, prev: pLtv12, f: 'money', noPrev: !pLtv12 },
      { label: 'LTV : CAC', cur: k.ltvCac || 0, prev: pLtvCac, f: 'x', noPrev: !pLtvCac },
    ] },
  ]
}

// Payback (C2, Suraj 27 Oct), shared by laptop and phone: CAC ÷ (12-month revenue per customer ÷ 12 ×
// margin), in months, at a fixed 35% margin for now (P&L D2C CM1 % link in docs/BACKLOG.md).
export const PAYBACK_FALLBACK_MARGIN = 0.35
export function paybackMargin() {
  return { margin: PAYBACK_FALLBACK_MARGIN, label: '35% margin, P&L CM1 link later' }
}
export function paybackMonthsOf(k, margin) {
  return k?.cac > 0 && k?.ltv12 > 0 && margin > 0 ? k.cac / (k.ltv12 / 12 * margin) : null
}

// Acquisition & Trends (laptop 'trends' tab). margin: see paybackMargin.
export function deriveAcquisition(cd, margin = PAYBACK_FALLBACK_MARGIN) {
  const k = cd.kpis || {}, p = cd.prevKpis || {}
  const acqRate = k.totalCustomers > 0 ? k.newCustomers / k.totalCustomers : 0
  const pAcqRate = p.totalCustomers > 0 ? p.newCustomers / p.totalCustomers : 0
  const ltvCac = k.ltvCac || (k.ltv12 && k.cac ? k.ltv12 / k.cac : 0)
  const pLtvCac = p.ltvCac || 0
  const paybackMonths = paybackMonthsOf(k, margin)

  const spendByDay = {}
  for (const r of cd.dailySpend || []) spendByDay[r.date || ''] = r.totalSpend || 0
  const enriched = (cd.daily || []).map(r => {
    const spend = spendByDay[r.date || ''] || 0
    const nc = r.newCustomers || 0
    return { ...r, spend, cac: (nc > 0 && spend > 0) ? spend / nc : 0, roas: spend > 0 ? (r.grossSales || 0) / spend : 0 }
  })

  // Day of week: only the latest floor(n/7)*7 days, so each weekday counts the same number of times
  const dates = [...new Set(enriched.map(r => r.date).filter(Boolean))].sort()
  const weeks = Math.floor(dates.length / 7)
  const keep = new Set(dates.slice(-weeks * 7))
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dm = Object.fromEntries(names.map((d, i) => [i, { day: d, nc: 0, rev: 0, orders: 0, cnt: 0 }]))
  for (const r of enriched) {
    if (!r.date || !keep.has(r.date)) continue
    const w = new Date(r.date).getDay()
    dm[w].nc += r.newCustomers || 0; dm[w].rev += r.grossSalesExc || 0; dm[w].orders += r.totalOrders || 0; dm[w].cnt++
  }
  const dow = [1, 2, 3, 4, 5, 6, 0].map(i => ({
    day: dm[i].day,
    avg: dm[i].cnt > 0 ? Math.round(dm[i].nc / dm[i].cnt) : 0,
    avgRev: dm[i].cnt > 0 ? Math.round(dm[i].rev / dm[i].cnt) : 0,
    avgOrders: dm[i].cnt > 0 ? Math.round(dm[i].orders / dm[i].cnt) : 0,
  }))

  // CAC efficiency band (daily): average ± one standard deviation
  const cacVals = enriched.map(r => r.cac).filter(v => v > 0)
  const cacAvg = cacVals.length ? cacVals.reduce((s, v) => s + v, 0) / cacVals.length : 0
  const cacStd = cacVals.length > 1 ? Math.sqrt(cacVals.reduce((s, v) => s + (v - cacAvg) ** 2, 0) / cacVals.length) : 0
  const costly = enriched.filter(r => r.cac > cacAvg + cacStd).length
  const efficient = enriched.filter(r => r.cac > 0 && r.cac < cacAvg - cacStd).length

  return { k, p, acqRate, pAcqRate, ltvCac, pLtvCac, paybackMonths, enriched, dow, dowWeeks: weeks, dowInsufficient: dates.length < 7, cacAvg, cacStd, costly, efficient }
}

// Retention (laptop 'cohort' tab, customer basis).
export function deriveRetention(cd) {
  const k = cd.kpis || {}, p = cd.prevKpis || {}
  const map = {}, base0 = {}
  for (const r of cd.cohort || []) {
    const cm = r.cohortMonth || r.cohort_month || ''
    const idx = r.cohortIndex ?? r.cohort_index ?? 0
    ;(map[cm] ||= {})[idx] = r
    if (idx === 0) base0[cm] = r.customers || 0
  }
  const months = Object.keys(map).sort()
  let maxIdx = 0
  for (const r of cd.cohort || []) maxIdx = Math.max(maxIdx, r.cohortIndex ?? r.cohort_index ?? 0)
  const half = Math.floor(months.length / 2)
  const weighted = (idx, onlyFirstHalf) => {
    let s = 0, t = 0
    months.forEach((cm, ci) => {
      const b = base0[cm] || 0
      if (!b || (onlyFirstHalf && ci >= half)) return
      const r = map[cm][idx]
      if (!r) return
      s += r.customers || 0; t += b
    })
    return t > 0 ? s / t * 100 : 0
  }
  const avgM1 = weighted(1), avgM6 = weighted(6), prevAvgM1 = weighted(1, true), prevAvgM6 = weighted(6, true)
  const curve = []
  for (let i = 1; i <= maxIdx; i++) curve.push({ month: `M${i}`, pct: +weighted(i).toFixed(2) })
  const lost90Row = (cd.inactivity || []).find(r => String(r.bucket || '').includes('90'))
  const lost90 = lost90Row ? (lost90Row.customers || 0) : 0
  const avgOrdersPerCust = k.totalCustomers > 0 ? k.totalOrders / k.totalCustomers : 0
  const prevAvgOrdersPerCust = p.totalCustomers > 0 ? (p.totalOrders || 0) / p.totalCustomers : 0
  const rows = months.filter(cm => (base0[cm] || 0) > 0).map(cm => ({
    cohort: cm, size: base0[cm],
    pct: idx => (map[cm][idx] ? (map[cm][idx].customers || 0) / base0[cm] * 100 : null),
  }))
  let maxNonM0 = 0
  for (const r of rows) for (let i = 1; i <= maxIdx; i++) { const v = r.pct(i); if (v != null && v > maxNonM0) maxNonM0 = v }
  return { avgM1, avgM6, prevAvgM1, prevAvgM6, curve, lost90, avgOrdersPerCust, prevAvgOrdersPerCust, rows, maxIdx, heatCeiling: Math.max(maxNonM0 * 1.1, 5) }
}

// Purchase Behavior (laptop 'purchase' tab, Category level). C5: totals from every pair
// (crossSellTotals, else the 500 display rows of an older payload), same-category cells out of the totals.
export function deriveBehaviour(cd, isSubCat = false) {
  const totals = cd.crossSellTotals
  const raw = (isSubCat ? totals?.sub : totals?.cat) || cd.crossSell || []
  const fk = isSubCat ? 'firstSubCategory' : 'firstCategory', sk = isSubCat ? 'secondSubCategory' : 'secondCategory'
  const vol = {}
  for (const r of raw) { if (r[fk]) vol[r[fk]] = (vol[r[fk]] || 0) + r.customers; if (r[sk]) vol[r[sk]] = (vol[r[sk]] || 0) + r.customers }
  const top = Object.entries(vol).filter(([x]) => !(isSubCat && totals?.sub && x === 'Other')).sort((a, b) => b[1] - a[1]).slice(0, isSubCat ? 8 : 9).map(([x]) => x)
  const key = (r, f) => { const v = r[f]; return top.includes(v) ? v : (v ? 'Other' : null) }
  const cols = [...top, ...(raw.some(r => !top.includes(r[sk])) ? ['Other'] : [])]
  const rowsK = [...top, ...(raw.some(r => !top.includes(r[fk])) ? ['Other'] : [])]
  const cm = {}
  for (const r of raw) { const a = key(r, fk), b = key(r, sk); if (!a || !b) continue; (cm[a] ||= {})[b] = (cm[a][b] || 0) + r.customers }
  const off = (f, c) => (f === c ? 0 : (cm[f]?.[c] || 0))
  const colT = {}; for (const c of cols) colT[c] = rowsK.reduce((s, f) => s + off(f, c), 0)
  const grand = Object.values(colT).reduce((a, b) => a + b, 0)
  const rowT = {}; for (const f of rowsK) rowT[f] = cols.reduce((s, c) => s + off(f, c), 0)
  const lift = (f, s) => { const n = cm[f]?.[s] || 0, rt = rowT[f] || 0, share = grand > 0 ? (colT[s] || 0) / grand : 0; return !rt || !share ? null : parseFloat(((n / rt) / share).toFixed(2)) }
  const rate = (f, s) => { const n = cm[f]?.[s] || 0, rt = rowT[f] || 0; return rt > 0 ? parseFloat((n / rt * 100).toFixed(1)) : 0 }
  const pairs = []
  rowsK.forEach(f => cols.forEach(s => { if (f === s) return; const n = cm[f]?.[s] || 0; if (n < 10) return; const lv = lift(f, s); if (lv && lv > 1) pairs.push({ f, s, lift: lv, count: n }) }))
  pairs.sort((a, b) => b.lift - a.lift)

  const fd = cd.orderFreqDist || []
  const fdTot = fd.reduce((s, r) => s + r.customers, 0)
  let cum = 0
  const freq = fd.map(r => { cum += r.customers; return { ...r, pct: fdTot > 0 ? parseFloat((r.customers / fdTot * 100).toFixed(1)) : 0, cumPct: fdTot > 0 ? parseFloat((cum / fdTot * 100).toFixed(1)) : 0 } })
  const d2 = cd.daysToSecondPurchase || []
  const d2Tot = d2.reduce((s, r) => s + r.customers, 0)
  const pairMap = new Map()
  for (const r of (totals?.cat || cd.crossSell || [])) { const kk = `${r.firstCategory}|||${r.secondCategory}`; pairMap.set(kk, (pairMap.get(kk) || 0) + r.customers) }
  const topPairs = [...pairMap.entries()].map(([kk, customers]) => { const [first, second] = kk.split('|||'); return { first, second, customers } }).sort((a, b) => b.customers - a.customers).slice(0, 7)
  return {
    pb: cd.purchaseBehaviorKpis || {}, basket: cd.basketComposition || {},
    matrix: { rows: rowsK, cols, lift, rate, count: (f, s) => cm[f]?.[s] || 0 }, top5: pairs.slice(0, 5),
    freq, oneTimePct: freq.find(r => r.orderCount === '1')?.pct || 0,
    cycle: (cd.repurchaseCycleByCategory || []).slice(0, 10),
    days2: d2.map(r => ({ ...r, pct: d2Tot > 0 ? parseFloat((r.customers / d2Tot * 100).toFixed(1)) : 0 })),
    aovByOrder: cd.aovByOrderNumber || [], topPairs,
  }
}

// Segments & RFM (laptop 'rfm' tab).
export function deriveSegments(cd) {
  const rfm = cd.rfm || []
  const sorted = [...rfm].sort((a, b) => (b.totalRevenue || 0) - (a.totalRevenue || 0))
  const totalRev = rfm.reduce((s, r) => s + (r.totalRevenue || 0), 0)
  const totalCust = rfm.reduce((s, r) => s + (r.customers || 0), 0)
  const atRisk = new Set(['WIN-BACK', 'URGENT SAVE'])
  const healthy = new Set(['Champions', 'Loyal Customers'])
  const atRiskSegs = rfm.filter(r => { const m = SEG_META[r.segment]; return m && atRisk.has(m.action) })
  const atRiskRev = atRiskSegs.reduce((s, r) => s + (r.totalRevenue || 0), 0)
  const atRiskCust = atRiskSegs.reduce((s, r) => s + (r.customers || 0), 0)
  const healthyRev = rfm.reduce((s, r) => s + (healthy.has(r.segment) ? (r.totalRevenue || 0) : 0), 0)
  return { sorted, totalRev, totalCust, atRiskSegs, atRiskRev, atRiskCust, healthyRev }
}

// Spend & Discounts (laptop 'spend' tab).
export function deriveDiscounts(cd, margin = PAYBACK_FALLBACK_MARGIN) {
  const k = cd.kpis || {}
  const dd = cd.discountDist || []
  const isNon = r => r.bucket === '0%' || r.bucket === 'No Price Data'
  const discOrders = dd.filter(r => !isNon(r)).reduce((s, r) => s + (r.totalOrders || 0), 0)
  const nonOrders = dd.filter(isNon).reduce((s, r) => s + (r.totalOrders || 0), 0)
  const allOrders = dd.reduce((s, r) => s + (r.totalOrders || 0), 0)
  const revAll = dd.reduce((s, r) => s + (r.totalOrders || 0) * (r.aovExc || 0), 0)
  const bands = dd.map(r => ({
    ...r,
    revPct: revAll > 0 ? parseFloat(((r.totalOrders || 0) * (r.aovExc || 0) / revAll * 100).toFixed(1)) : 0,
    repeatPct: (r.totalOrders || 0) > 0 ? parseFloat(((r.repeatOrders || 0) / (r.totalOrders || 0) * 100).toFixed(1)) : 0,
  }))
  const discRev = dd.filter(r => !isNon(r)).reduce((s, r) => s + (r.totalOrders || 0) * (r.aovExc || 0), 0)
  const nonRev = dd.filter(isNon).reduce((s, r) => s + (r.totalOrders || 0) * (r.aovExc || 0), 0)
  const paybackMonths = paybackMonthsOf(k, margin) // C2: same as Acquisition
  const db = dd.filter(r => !isNon(r) && (r.avgDiscPct || 0) > 0)
  const dbOrders = db.reduce((s, r) => s + (r.totalOrders || 0), 0)
  const dbValue = db.reduce((s, r) => s + (r.totalOrders || 0) * (r.aovExc || 0) * ((r.avgDiscPct || 0) / 100), 0)
  const discPerOrder = dbOrders > 0 ? dbValue / dbOrders : null
  const avgDiscPct = dbOrders > 0 ? db.reduce((s, r) => s + (r.avgDiscPct || 0) * (r.totalOrders || 0), 0) / dbOrders : null
  // Spend vs sales per day: gross ex GST and net revenue scaled from daily gross inc GST, as on laptop
  const excRatio = (k.grossSales > 0 && k.grossExcGst > 0) ? k.grossExcGst / k.grossSales : 1
  const netRatio = (k.grossSales > 0 && k.netRevenue > 0) ? k.netRevenue / k.grossSales : 0
  const spend = {}
  for (const r of cd.dailySpend || []) spend[r.date || r.label || ''] = (spend[r.date || r.label || ''] || 0) + (r.totalSpend || r.spend || 0)
  const byDay = {}
  for (const r of cd.daily || []) {
    const d = r.date || r.month || r.label || ''
    const x = (byDay[d] ||= { date: d, totalSpend: 0, grossSalesExcGst: 0, netRevenue: 0 })
    x.grossSalesExcGst += (r.grossSales || 0) * excRatio; x.netRevenue += (r.grossSales || 0) * netRatio
  }
  for (const [d, v] of Object.entries(spend)) (byDay[d] ||= { date: d, totalSpend: 0, grossSalesExcGst: 0, netRevenue: 0 }).totalSpend += v
  const days = Object.values(byDay).sort((a, b) => (a.date < b.date ? -1 : 1)).map(r => ({ ...r, discountGiven: Math.max(0, r.grossSalesExcGst - r.netRevenue) }))
  const byFirst = cd.discountRepeatRateByFirst || []
  return {
    k, paybackMonths, discOrders, nonOrders, allOrders, revAll, discRev, nonRev,
    discAov: discOrders > 0 ? discRev / discOrders : 0, nonAov: nonOrders > 0 ? nonRev / nonOrders : 0,
    discPerOrder, avgDiscPct, bands, days, cats: cd.categoryDiscountAnalysis || [],
    discRepeat: byFirst.find(r => r.type === 'Discounted'), nonRepeat: byFirst.find(r => r.type === 'Non-Discounted'),
  }
}
