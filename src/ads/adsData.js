import { ADS_RULES } from '../config/metricTargets.js'

// Ads Phase 2 (ADS_MASTER_PLAN.md Part B): display-only helpers for the new sections. Every number is
// read from what AdsTab already has (ads.daily, channel daily sales, the category / product rows);
// only sums, shares and ratios of those.

// Frido green shades, darkest first (D2C darkest), one per channel / sub-type.
export const SHADES = ['#1f5a3d', '#5f8f75', '#9cc4ad', 'rgba(31,90,61,.30)', '#d5dbd7', 'rgba(31,90,61,.14)', 'rgba(31,90,61,.08)', 'rgba(31,90,61,.05)']

// Overall: one series per channel. D2C = Meta + Google spend, Shopify sales.
export const OVERALL_CHANNELS = [
  { key: 'D2C', label: 'D2C', platforms: ['Meta', 'Google'], sales: 'Shopify' },
  { key: 'Amazon', label: 'Amazon', platforms: ['Amazon'], sales: 'Amazon' },
  { key: 'Flipkart', label: 'Flipkart', platforms: ['Flipkart'], sales: 'Flipkart' },
  { key: 'Myntra', label: 'Myntra', platforms: ['Myntra'], sales: 'Myntra' },
  { key: 'Blinkit', label: 'Blinkit', platforms: ['Blinkit'], sales: 'Blinkit' },
  { key: 'Zepto', label: 'Zepto', platforms: ['Zepto'], sales: 'Zepto' },
  { key: 'Instamart', label: 'Instamart', platforms: ['Instamart'], sales: 'Instamart' },
]

// Series for a tab: Overall → channels; D2C → Meta / Google (sales split by that day's spend share, the
// same rule as the existing trend); any other platform → that platform alone.
export function seriesFor(selPlatform) {
  if (!selPlatform) return OVERALL_CHANNELS.map((c, i) => ({ ...c, color: SHADES[i] }))
  if (selPlatform === 'D2C') return [{ key: 'Meta', label: 'Meta', platforms: ['Meta'], sales: 'Shopify', color: SHADES[0] }, { key: 'Google', label: 'Google', platforms: ['Google'], sales: 'Shopify', color: SHADES[2] }]
  return [{ key: selPlatform, label: selPlatform, platforms: [selPlatform], sales: selPlatform, color: SHADES[0] }]
}

// Day rows for the selected range: { date, spend: {k}, rev: {k}, pending: {k: bool} }.
//   daily            ads.daily ([{ date, platform, spend, clicks, impressions }])
//   salesByChannel   { Shopify: { date: excRev }, Amazon: {...}, ... } (channel sales ex GST per day)
//   pendingAfter     { Flipkart: 'YYYY-MM-DD', Myntra: ... } last real report date (A7): later days have no revenue
export function buildDailyByChannel({ daily = [], salesByChannel = {}, series, pendingAfter = {} }) {
  const byDate = {}
  const plat2key = {}
  series.forEach(s => s.platforms.forEach(p => { plat2key[p] = s.key }))
  daily.forEach(d => {
    const k = plat2key[d.platform]
    if (!k) return
    const row = byDate[d.date] || (byDate[d.date] = { date: d.date, spend: {}, rev: {}, pending: {} })
    row.spend[k] = (row.spend[k] || 0) + (d.spend || 0)
  })
  const dates = Object.keys(byDate).sort()
  dates.forEach(date => {
    const row = byDate[date]
    const shopSpend = series.filter(s => s.sales === 'Shopify').reduce((s, x) => s + (row.spend[x.key] || 0), 0)
    series.forEach(s => {
      const last = pendingAfter[s.sales]
      if (last && date > last) { row.pending[s.key] = true; row.rev[s.key] = null; return }
      const day = salesByChannel[s.sales]?.[date] || 0
      if (s.sales === 'Shopify' && series.filter(x => x.sales === 'Shopify').length > 1) row.rev[s.key] = shopSpend > 0 ? day * (row.spend[s.key] || 0) / shopSpend : 0
      else row.rev[s.key] = day
    })
  })
  return dates.map(d => byDate[d])
}

const pctFmt = v => `${(v * 100).toFixed(1)}%`

// Ads watchlist (Part B §1.5). Result has the WatchlistCard shape (rules / triggered / flaggedProducts /
// smallCount / bars / rulesLines) plus flagsByKey and ruleName for the lists.
//   rows        product rows [{ category, subCategory, spend, revenue, roas }] (Unattributed excluded)
//   prevByProd  { subCategory: { spend, revenue } } for the previous equal-length period, or null
//   beRoasByProd { subCategory: breakeven ROAS } from P&L (null where P&L has no CM1)
//   unattributed, totalSpend, cpc, prevCpc: channel level
export function computeAdsRules({ rows = [], prevByProd = null, beRoasByProd = null, unattributed = 0, totalSpend = 0, cpc = null, prevCpc = null, channel = 'Ads', fmt }) {
  const R = ADS_RULES
  const material = rows.filter(r => (r.spend || 0) >= R.minSpend)
  const small = rows.filter(r => (r.spend || 0) > 0 && (r.spend || 0) < R.minSpend).length
  const key = r => `${r.category}::${r.subCategory}`
  const item = (r, impact) => ({ row: r, key: key(r), impact })
  const rules = []
  if (beRoasByProd) {
    const items = material.filter(r => beRoasByProd[r.subCategory] != null && r.roas < beRoasByProd[r.subCategory])
      .map(r => item(r, -(r.spend - r.revenue / beRoasByProd[r.subCategory])))
    rules.push({ id: 'loss', chip: 'Loss', red: true, name: 'Spending at a loss', what: 'loss', revLabel: 'spend', items,
      info: `Product ROAS below its breakeven ROAS from P&L (Gross ex GST ÷ CM1). Loss = spend − CM1. Only products whose P&L CM1 is known; ROAS here is total-sales ROAS, the same as P&L's.` })
  }
  rules.push({ id: 'nosales', chip: 'No sales', red: true, name: 'Spend, no sales', what: 'spend', revLabel: 'revenue',
    items: material.filter(r => r.spend > R.noSalesSpend && (r.roas || 0) < R.noSalesRoas).map(r => item(r, -r.spend)),
    info: `Spend above ₹${(R.noSalesSpend / 1000).toFixed(0)} K and ROAS below ${R.noSalesRoas}x.` })
  const share = totalSpend > 0 ? unattributed / totalSpend : 0
  rules.push({ id: 'unattr', chip: 'Unattributed', red: false, name: 'Unattributed spend', items: [], channelLevel: true, hit: share > R.unattributedShare,
    valueText: pctFmt(share), line: share > 0 ? `${fmt(unattributed)} not linked to a product` : 'All spend linked to a product',
    info: `Spend whose campaign isn't tagged to a product (e.g. "all products" sale campaigns). Flagged above ${R.unattributedShare * 100}% of spend.` })
  if (prevByProd) {
    const items = material.filter(r => { const p = prevByProd[r.subCategory]; if (!(r.spend >= R.roasDropMinSpend) || !p || !(p.spend >= R.roasDropMinSpend) || !(p.revenue > 0)) return false; const pr = p.revenue / p.spend; return r.roas < pr * (1 - R.roasDropPct / 100) })
      .map(r => { const p = prevByProd[r.subCategory]; return item(r, (r.roas - p.revenue / p.spend) * r.spend) })
    rules.push({ id: 'roasdown', chip: 'ROAS ↓', red: false, name: `ROAS down ≥ ${R.roasDropPct}%`, what: 'revenue at the old ROAS', revLabel: 'spend', items,
      info: `Product ROAS ▼ ${R.roasDropPct}% or more vs the previous period of the same length. Both periods need at least ₹${(R.roasDropMinSpend / 1000).toFixed(0)} K spend.` })
  }
  if (cpc != null && prevCpc > 0) {
    const d = (cpc - prevCpc) / prevCpc * 100
    rules.push({ id: 'cpcup', chip: 'CPC ↑', red: false, name: `CPC up ≥ ${R.cpcUpPct}%`, items: [], channelLevel: true, hit: d >= R.cpcUpPct,
      valueText: `${d >= 0 ? '▲' : '▼'}${Math.abs(d).toFixed(0)}%`, line: `CPC ₹${prevCpc.toFixed(2)} → ₹${cpc.toFixed(2)} vs previous period`,
      info: `Channel CPC ▲ ${R.cpcUpPct}% or more vs the previous period (no clicks per product in the data, so channel level only).` })
  }
  rules.forEach(r => {
    if (r.channelLevel) { r.count = r.hit ? 1 : 0; r.impact = 0; r.revenue = 0; return }
    r.items.sort((a, b) => a.impact - b.impact)
    r.count = r.items.length
    r.impact = r.items.reduce((s, x) => s + x.impact, 0)
    r.revenue = r.items.reduce((s, x) => s + ((r.revLabel === 'spend' ? x.row.spend : x.row.revenue) || 0), 0)
  })
  const flagsByKey = {}
  const order = ['loss', 'nosales', 'roasdown']
  rules.forEach(r => r.items.forEach(x => { (flagsByKey[x.key] = flagsByKey[x.key] || []).push(r.id) }))
  Object.keys(flagsByKey).forEach(k => { flagsByKey[k] = order.filter(id => flagsByKey[k].includes(id)) })
  return {
    rules, flagsByKey, ruleName: Object.fromEntries(rules.map(r => [r.id, r.name])), chipName: Object.fromEntries(rules.map(r => [r.id, r.chip])),
    triggered: rules.filter(r => r.count > 0).length, flaggedProducts: Object.keys(flagsByKey).length, smallCount: small,
    bars: { label: channel },
    rulesLines: [
      beRoasByProd && 'Spending at a loss: ROAS below the product\'s P&L breakeven ROAS',
      `Spend, no sales: spend > ₹${(R.noSalesSpend / 1000).toFixed(0)} K and ROAS < ${R.noSalesRoas}x`,
      `Unattributed spend above ${R.unattributedShare * 100}% of spend`,
      prevByProd && `ROAS down ≥ ${R.roasDropPct}% vs previous period`,
      `CPC up ≥ ${R.cpcUpPct}% vs previous period (channel)`,
      `Products under ₹${(R.minSpend / 1000).toFixed(0)} K spend aren't checked`,
    ].filter(Boolean),
  }
}

export const TOTAL_SALES_ROAS_INFO = "Revenue here is the channel's total sales ex GST in the period (all orders, not only ad-attributed), divided by ad spend. Ad platforms don't report attributed revenue for every channel, so this is a blended, total-sales ROAS."

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// Last-6-months table from the adsMonthly payload ({ spend: [{ month, platform, spend }], sales: [{ month,
// channel, excRev }] }): one row per series, { spend, rev } per month; channels sharing Shopify sales (D2C
// tab: Meta / Google) split that month's sales by their spend share, as the daily trend does.
export function monthlyTable(data, win, series) {
  const months = win.months.map((k, i) => {
    const m = Number(k.slice(5)) - 1
    const last = i === win.months.length - 1
    return { key: k, label: MONTHS[m], partial: last && win.toDay < win.daysInLast ? `1–${win.toDay} ${MONTHS[m]}` : null }
  })
  const spend = {}, sales = {}
  ;(data.spend || []).forEach(x => { const o = spend[x.month] || (spend[x.month] = {}); o[x.platform] = (o[x.platform] || 0) + x.spend })
  ;(data.sales || []).forEach(x => { const o = sales[x.month] || (sales[x.month] = {}); o[x.channel] = (o[x.channel] || 0) + x.excRev })
  const rows = series.map(s => ({ key: s.key, label: s.label, color: s.color, byMonth: {} }))
  const total = {}
  const shared = series.filter(s => s.sales === 'Shopify')
  months.forEach(m => {
    const sp = s => s.platforms.reduce((t, p) => t + (spend[m.key]?.[p] || 0), 0)
    const shopSpend = shared.reduce((t, s) => t + sp(s), 0)
    let tSpend = 0, tRev = 0
    const counted = new Set()
    rows.forEach((r, i) => {
      const s = series[i]
      const sv = sp(s)
      const chRev = sales[m.key]?.[s.sales] || 0
      r.byMonth[m.key] = { spend: sv, rev: s.sales === 'Shopify' && shared.length > 1 ? (shopSpend > 0 ? chRev * sv / shopSpend : 0) : chRev }
      tSpend += sv
      if (!counted.has(s.sales)) { tRev += chRev; counted.add(s.sales) }
    })
    total[m.key] = { spend: tSpend, rev: tRev }
  })
  return { months, rows, total }
}
