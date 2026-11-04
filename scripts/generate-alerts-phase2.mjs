// Alerts Phase 2 (31 alerts) — computes the RAW numbers behind the bell, hourly in GitHub Actions, and writes
// public/alerts-phase2.json. It never decides what is "bad": every bar lives in ALERT_RULES
// (src/config/metricTargets.js) and is applied in the browser by src/alerts/phase2Rules.js.
//
// Every number comes from the page's own handler or code, called in-process (same pattern as
// scripts/generate-alerts-cache.mjs) — no re-derived SQL. See docs/ALERTS_PHASE2_BACKTEST.md for the windows and
// the evidence that each value matches its page:
//   rev, ads   /api/bq, window ends revenueLagDays before yesterday (Flipkart / Myntra reports have landed)
//   returns    /api/bq resolved Return % over the latest mature 7 days (orders 14-20 days ago) + return-analysis
//   pnl        the P&L page's own component, headless (scripts/alerts-phase2/pnl-headless.mjs), same mature window
//   alloc      /api/sales-allocation, last 7 days and the 4 weeks before
//   oos        buildOos() of /api/inventory-oos
//   logistics  /api/logistics, forward, orders created 15-21 days ago; baselines 7-day steps earlier
//   cost       public/logistics-cost-data.json (the Cost page's own pre-computed file) + Clickpost shipments
//   customer   /api/customer, trailing 28 days and the 28 before   support  /api/customer-support
// Each section is independent: if one fails it is written as null and its alerts simply don't show.
//
// TARGET alerts (fixed business targets) are refreshed weekly: the `targets` block is rebuilt only when the
// previous file's targetsComputedAt is older than 7 days (or FORCE_TARGETS=1), otherwise carried forward.

import { writeFileSync, readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import bqHandler from '../api/bq.js'
import cogsHandler from '../api/cogs-monthly.js'
import returnAnalysis from '../api/return-analysis.js'
import salesAllocation from '../api/sales-allocation.js'
import logisticsHandler from '../api/logistics.js'
import customerHandler from '../api/customer.js'
import supportHandler from '../api/customer-support.js'
import { buildOos } from '../api/inventory-oos.js'
import { ALERT_RULES } from '../src/config/metricTargets.js'
import { buildModel } from '../src/customer/supportModel.js'
import { computeSupportRules } from '../src/customer/customerRules.js'
import { pnlSummaries } from './alerts-phase2/pnl-headless.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'alerts-phase2.json')
const ONLY = process.env.ALERTS_ONLY ? new Set(process.env.ALERTS_ONLY.split(',')) : null // e.g. ALERTS_ONLY=rev,ads (dev only)

async function callHandler(handler, body) {
  return new Promise((resolve, reject) => {
    const req = { method: 'POST', body, headers: {}, query: {} }
    const res = {
      _status: 200, setHeader() { return this }, getHeader() { return undefined },
      status(c) { this._status = c; return this },
      json(p) { if (this._status >= 400) reject(new Error(JSON.stringify(p).slice(0, 300))); else resolve(p) },
      send(p) { this.json(p) }, end() { resolve(null) },
    }
    Promise.resolve(handler(req, res)).catch(reject)
  })
}

// ── dates (IST) ──────────────────────────────────────────────────────────────────────────────
const istParts = d => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value])); return p }
const NOW = process.env.ALERTS_NOW ? new Date(process.env.ALERTS_NOW) : new Date()
const P = istParts(NOW)
const TODAY = `${P.year}-${P.month}-${P.day}`
const IST_HOUR = +P.hour
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const label = (a, b) => { const f = s => { const d = new Date(s + 'T00:00:00Z'); return `${d.getUTCDate()} ${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })}` }; return a === b ? f(a) : `${f(a)}–${f(b)}` }
const win = (start, end) => ({ start, end, label: label(start, end) })
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0 }
const mean = a => a.reduce((s, x) => s + x, 0) / a.length
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length) }
const run = async (name, fn) => {
  if (ONLY && !ONLY.has(name)) return undefined
  const t = Date.now()
  try { const r = await fn(); console.log(`alerts-phase2: ${name} ok (${((Date.now() - t) / 1000).toFixed(1)}s)`); return r } catch (e) { console.error(`alerts-phase2: ${name} FAILED —`, e.message); return null }
}

const REV_END = addDays(TODAY, -1 - ALERT_RULES.revenueLagDays), REV_START = addDays(REV_END, -6)
const MAT_END = addDays(TODAY, -14), MAT_START = addDays(TODAY, -20) // returns / P&L mature window (Phase 1 convention)
const LOG_END = addDays(TODAY, -15), LOG_START = addDays(TODAY, -21) // logistics mature window (Phase 1 convention)
const ALLOC_END = addDays(TODAY, -1), ALLOC_START = addDays(TODAY, -7)

const out = { generatedAt: NOW.toISOString(), today: TODAY, windows: {}, rev: null, ads: null, returns: null, subcats: null, pnl: null, alloc: null, oos: null, logistics: null, cost: null, customer: null, support: null }

// ── /api/bq payloads (one per window; shared by several alerts) ───────────────────────────────
let bqRev = null, bqMat = null
const CH_KEYS = ['Shopify', 'Amazon', 'Flipkart', 'Blinkit', 'Zepto', 'Instamart', 'Myntra', 'CRED', 'Firstcry', 'EBO', 'offline_sales']

// #1 revenue (gross inc-GST, as the Overview scorecard) and #12 / #13 ads — one payload, window ending REV_END
await run('rev', async () => {
  bqRev = await callHandler(bqHandler, { start: REV_START, end: REV_END })
  const d = bqRev
  const channels = { Overall: { cur: num(d.totalRev), prev: num(d.prevRev) } }
  for (const k of CH_KEYS) channels[k] = { cur: num(d.chMap?.[k]?.rev), prev: num(d.prevChMap?.[k]?.rev) }
  out.windows.rev = { ...win(REV_START, REV_END), prev: win(addDays(REV_START, -7), addDays(REV_START, -1)) }
  out.rev = { channels }
})
await run('ads', async () => {
  const d = bqRev || await callHandler(bqHandler, { start: REV_START, end: REV_END })
  // The Ads page's own ROAS (src/App.jsx AdsTab): channel ex-GST sales / ad spend; D2C = Meta + Google spend against Shopify sales,
  // current-period D2C spend also carries the manager-entered additional spend, the previous period's does not (reproduced as the page does).
  const t = Object.fromEntries((d.ads?.totals || []).map(x => [x.platform, x])), pt = d.ads?.prevTotals || {}
  const PLAT = { D2C: ['Meta', 'Google'], Amazon: ['Amazon'], Blinkit: ['Blinkit'], Zepto: ['Zepto'], Instamart: ['Instamart'], Flipkart: ['Flipkart'], Myntra: ['Myntra'], CRED: ['CRED'] }
  const SALES = { D2C: 'Shopify', Amazon: 'Amazon', Blinkit: 'Blinkit', Zepto: 'Zepto', Instamart: 'Instamart', Flipkart: 'Flipkart', Myntra: 'Myntra', CRED: 'CRED' }
  const platforms = {}
  for (const [tab, ps] of Object.entries(PLAT)) {
    const spend = ps.reduce((s, p) => s + num(t[p]?.spend), 0), prevSpend = ps.reduce((s, p) => s + num(pt[p]?.spend), 0)
    const add = tab === 'D2C' ? num(d.ads?.additionalSpend) : 0
    const rev = num(d.chMap?.[SALES[tab]]?.excRev)
    let prevRev = num(d.prevChMap?.[SALES[tab]]?.excRev)
    if (tab === 'D2C') prevRev = num(d.shopify?.prevExcRev)
    if (tab === 'Amazon') prevRev = num(d.prevChMap?.Amazon?.excRev) || num(d.amzSC?.prevExcRev)
    if (tab === 'Flipkart') prevRev = num(d.prevChMap?.Flipkart?.excRev) || num(d.flipkart?.prevExcRev)
    platforms[tab] = { spend: spend + add, prevSpend, roas: spend + add > 0 ? rev / (spend + add) : null, prevRoas: prevSpend > 0 && prevRev > 0 ? prevRev / prevSpend : null }
  }
  const un = rows => (rows || []).filter(x => x.subCategory === 'Unattributed').reduce((s, x) => s + num(x.spend), 0)
  const totalSpend = (d.ads?.totals || []).reduce((s, x) => s + num(x.spend), 0)
  const byPlatform = {}
  for (const [p, det] of Object.entries(d.ads?.spendDetailByPlatform || {})) {
    const sp = num(t[p]?.spend); if (sp > 0) byPlatform[p] = { spend: sp, unattributed: un(det?.subCategoryRows) }
  }
  out.ads = { window: win(REV_START, REV_END), platforms, unattributed: { spend: totalSpend, unattributed: un(d.ads?.allSpendDetail?.subCategoryRows), byPlatform } }
})

// #2 / #5 / #6 returns and #8-#11 P&L share one mature-window payload
await run('returns', async () => {
  bqMat = await callHandler(bqHandler, { start: MAT_START, end: MAT_END })
  const d = bqMat
  const sum = rows => { let gross = 0, ret = 0; for (const r of rows || []) { gross += num(r.gross); ret += num(r.totalReturnRev) } return { gross, ret } }
  const channels = {
    Shopify: sum((d.shopify?.resolvedDailySKU || []).filter(r => String(r.subChannel || '').toLowerCase() !== 'shopify international')),
    Amazon: sum([...(d.amzSC?.resolvedDailySKU || []), ...(d.amzVC?.resolvedDailySKU || [])]),
    Flipkart: sum(d.flipkart?.resolvedDailySKU), Myntra: sum(d.myntra?.resolvedDailySKU), EBO: sum(d.ebo?.resolvedDailySKU),
    CRED: sum(d.cred?.resolvedDailySKU), Firstcry: sum(d.firstcry?.resolvedDailySKU),
  }
  const t = d.offline?.totalsBySub || []
  const offline = { rev: t.reduce((s, x) => s + num(x.revSales), 0), creditNotes: t.reduce((s, x) => s + Math.abs(num(x.cnRev)), 0) }
  out.windows.returns = win(MAT_START, MAT_END)
  out.returns = { channels, offline }
})

// #7 D2C sub-category return % (return-analysis handler): latest mature week vs the 4 weeks before
await run('subcats', async () => {
  const wins = [0, 1, 2, 3, 4].map(k => ({ start: addDays(MAT_START, -7 * k), end: addDays(MAT_END, -7 * k) }))
  const res = []
  for (const w of wins) res.push(await callHandler(returnAnalysis, { start: w.start, end: w.end }))
  const key = c => `${c.category}|${c.subCategory}`
  const cur = res[0].categoryTable || []
  const rows = []
  for (const c of cur) {
    const lost = num(c.rtoRev) + num(c.cirRev) + num(c.cancelRev)
    if (lost < 50000) continue
    const base = res.slice(1).map(r => (r.categoryTable || []).find(x => key(x) === key(c))?.totalReturnPct).filter(v => v != null)
    if (base.length < 4) continue
    rows.push({ category: c.category, subCategory: c.subCategory, pct: num(c.totalReturnPct), avg4: mean(base.map(num)), lost })
  }
  out.windows.subcats = win(MAT_START, MAT_END)
  out.subcats = { rows }
})

// #8-#11 P&L — the page's own component, headless
await run('pnl', async () => {
  const d = bqMat || await callHandler(bqHandler, { start: MAT_START, end: MAT_END })
  const tabs = await pnlSummaries({ data: d, start: MAT_START, end: MAT_END, tabs: ['shopify', 'amazon', 'flipkart', 'ebo', 'offline', 'blinkit', 'zepto', 'instamart', 'cred', 'firstcry', 'myntra'], callHandler, cogsHandler })
  out.windows.pnl = win(MAT_START, MAT_END)
  out.pnl = { tabs }
})
bqRev = null; bqMat = null // free the large payloads

// #3 / #15 warehouse fill rate and allocation (weekly windows, the handler's own fields)
await run('alloc', async () => {
  const wk = k => ({ start: addDays(ALLOC_START, -7 * k), end: addDays(ALLOC_END, -7 * k) })
  const resp = []
  for (let k = 0; k <= 4; k++) resp.push(await callHandler(salesAllocation, wk(k)))
  const fills = r => Object.fromEntries((r.fillRateByWarehouse || []).filter(x => x.fillRate != null).map(x => [x.warehouse, x.fillRate * 100]))
  const allocs = r => Object.fromEntries((r.facilityAllocation || []).filter(x => x.allocationPct != null).map(x => [x.location, x.allocationPct * 100]))
  const cur = { fill: fills(resp[0]), alloc: allocs(resp[0]) }
  const prior = resp.slice(1).map(r => ({ fill: fills(r), alloc: allocs(r) }))
  const avg = (key, id) => { const v = prior.map(p => p[key][id]).filter(x => x != null); return v.length >= 3 ? mean(v) : null }
  const warehouses = {}
  for (const w of new Set([...Object.keys(cur.fill), ...Object.keys(cur.alloc)])) warehouses[w] = { fillRate: cur.fill[w] ?? null, fillAvg4: avg('fill', w), allocationPct: cur.alloc[w] ?? null, allocAvg4: avg('alloc', w) }
  // per channel (top 10 by revenue): allocation % per location, current window
  const channels = {}
  for (const ch of (resp[0].channelSales || []).slice(0, 10).map(c => c.channel)) {
    const r = await callHandler(salesAllocation, { ...wk(0), channel: ch })
    channels[ch] = { alloc: allocs(r), fill: fills(r) }
  }
  out.windows.alloc = win(ALLOC_START, ALLOC_END)
  out.alloc = { warehouses, channels }
})

// #14 OOS loss — the Out-of-stock page's own build, current snapshot
await run('oos', async () => {
  const o = await buildOos()
  const stocked = (o.skus || []).filter(r => !r.neverInStock)
  const byCategory = {}
  for (const r of stocked) byCategory[r.category || 'Uncategorised'] = (byCategory[r.category || 'Uncategorised'] || 0) + (r.lossToDate || 0)
  out.oos = { asOf: o.asOf, skus: stocked.length, loss: stocked.reduce((s, r) => s + (r.lossToDate || 0), 0), byCategory }
})

// #16-#21 logistics (forward, AWB created-date grain) — current mature window + 8 weekly-spaced baselines
await run('logistics', async () => {
  const fwd = body => callHandler(logisticsHandler, { shipmentType: 'forward', ...body })
  const cur = await fwd({ start: LOG_START, end: LOG_END })
  const cod = await fwd({ start: LOG_START, end: LOG_END, paymentMode: 'COD' })
  const pre = await fwd({ start: LOG_START, end: LOG_END, paymentMode: 'Prepaid' })
  const base = []
  for (let k = 1; k <= 8; k++) base.push(await fwd({ start: addDays(LOG_START, -7 * k), end: addDays(LOG_END, -7 * k) }))
  const k = cur.kpis || {}
  const kp = x => ({ total: num(x.kpis?.total_shipments), rto: num(x.kpis?.rto), delivered: num(x.kpis?.delivered) })
  const couriers = []
  for (const c of cur.byCourier || []) {
    const total = num(c.total); if (!total) continue
    const hist = base.map(b => (b.byCourier || []).find(x => x.courier_group === c.courier_group)).filter(x => x && num(x.total) >= 300)
    const rtoH = hist.map(x => num(x.rto) / num(x.total) * 100), delH = hist.map(x => num(x.delivered) / num(x.total) * 100)
    couriers.push({
      courier: c.courier_group, total, rtoPct: num(c.rto) / total * 100, delPct: num(c.delivered) / total * 100,
      n: hist.length, rtoMean: hist.length >= 4 ? mean(rtoH) : null, rtoSd: hist.length >= 4 ? sd(rtoH) : null, delMean: hist.length >= 4 ? mean(delH) : null, delSd: hist.length >= 4 ? sd(delH) : null,
    })
  }
  out.windows.logistics = win(LOG_START, LOG_END)
  out.logistics = {
    forward: { ...kp(cur), deliveredTotal: num(k.orders_delivered_total), within3dPickup: num(k.delivered_within_3d_of_pickup), within5dOrder: num(k.delivered_within_5d_of_order) },
    cod: kp(cod), prepaid: kp(pre), couriers,
  }
})

// #22-#25 courier cost (the Cost page's own pre-computed file) + Clickpost shipments per courier for invoice coverage
await run('cost', async () => {
  const file = JSON.parse(readFileSync(join(ROOT, 'public', 'logistics-cost-data.json'), 'utf8'))
  const months = (file.byMonth || []).filter(r => r.dim === 'month').map(r => ({ month: r.key, n: num(r.n), cost: num(r.cost), wt: num(r.wt), value: num(r.value) })).sort((a, b) => a.month.localeCompare(b.month))
  const latest = months.at(-1), prior3 = months.slice(-4, -1)
  const agg = a => a.reduce((s, x) => ({ cost: s.cost + x.cost, wt: s.wt + x.wt, value: s.value + x.value }), { cost: 0, wt: 0, value: 0 })
  const pa = prior3.length === 3 ? agg(prior3) : null
  // expected invoice month: M-1 from the invoiceExpectedDay of month M, else M-2
  const [y, m, day] = TODAY.split('-').map(Number)
  const back = day >= ALERT_RULES.invoiceExpectedDay ? 1 : 2
  const ed = new Date(Date.UTC(y, m - 1 - back, 1)), expMonth = `${ed.getUTCFullYear()}-${String(ed.getUTCMonth() + 1).padStart(2, '0')}`
  const mEnd = new Date(Date.UTC(ed.getUTCFullYear(), ed.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
  const cp = await callHandler(logisticsHandler, { shipmentType: 'forward', start: `${expMonth}-01`, end: mEnd })
  const shipped = {}
  for (const c of cp.byCourier || []) shipped[c.courier_group] = num(c.total)
  // ledger courier name -> Clickpost courier group(s)
  const MAP = { Bluedart: ['Bluedart'], Delhivery: ['Delhivery', 'Delhivery NDD'], Ekart: ['Ekart'], ElasticRun: ['ElasticRun'], Shadowfax: ['Shadowfax'], SkyAir: ['Skye Air'], Swift: ['Swift'], Urbanbolt: ['Urbane Bolt'], Safexpress: ['Safexpress'] }
  const ledger = {}
  for (const r of file.trendAll || []) (ledger[r.courier_name] ||= {})[r.month_year] = num(r.n)
  const couriers = Object.keys(MAP).map(name => {
    const ship = MAP[name].reduce((s, g) => s + (shipped[g] || 0), 0)
    const invoiced = ledger[name]?.[expMonth] || 0
    return { courier: name, shipped: ship, invoiced, coverage: ship > 0 ? invoiced / ship : null }
  })
  out.cost = {
    month: latest?.month || null, asOf: file.asOf || null,
    perShipment: latest && latest.n ? latest.cost / latest.n : null,
    perKg: latest && latest.wt ? latest.cost / latest.wt : null, perKgTrailing: pa && pa.wt ? pa.cost / pa.wt : null,
    freightPct: latest && latest.value ? latest.cost / latest.value * 100 : null, freightPctTrailing: pa && pa.value ? pa.cost / pa.value * 100 : null,
    invoice: { expectedMonth: expMonth, couriers },
  }
})

// #26-#28 customer — two consecutive 28-day periods (handler kpis + prevKpis)
await run('customer', async () => {
  const w0 = { start: addDays(TODAY, -28), end: addDays(TODAY, -1) }, w1 = { start: addDays(TODAY, -56), end: addDays(TODAY, -29) }
  const [a, b] = [await callHandler(customerHandler, w0), await callHandler(customerHandler, w1)]
  const pick = r => {
    const d = r.discountRepeatRateByFirst || [], dis = d.find(x => x.type === 'Discounted'), non = d.find(x => x.type === 'Non-Discounted')
    return { ltvCac: r.kpis?.ltvCac ?? null, repPct: num(r.kpis?.repeatRevenueRate) * 100, repPrevPct: num(r.prevKpis?.repeatRevenueRate) * 100, discountGap: dis && non ? num(dis.repeatRate) - num(non.repeatRate) : null }
  }
  out.windows.customer = win(w0.start, w0.end)
  out.customer = { cur: pick(a), prevPeriod: pick(b) }
})

// #29-#31 support — the page's own buildModel / computeSupportRules, latest complete day (vs the same weekday last week) and week
await run('support', async () => {
  const dayEnd = addDays(TODAY, IST_HOUR >= 11 ? -1 : -2) // the day table rebuilds at 11:00 IST
  const dow = new Date(TODAY + 'T00:00:00Z').getUTCDay() // last complete Mon-Sun week ends on the most recent Sunday
  const weekEnd = addDays(TODAY, -(dow === 0 ? 7 : dow))
  const dayResp = await callHandler(supportHandler, { grain: 'day', end: dayEnd, periods: 8 })
  const weekResp = await callHandler(supportHandler, { grain: 'week', end: weekEnd, periods: 2 })
  const frt = m => Object.keys({ Chat: 0, Email: 0, 'Social media': 0 }).map(ch => { const t = m.at(-1).t(ch); return { ch, n: t?.afrt_n || 0, avgSec: t?.afrt_n ? t.afrt_sum / t.afrt_n : null } })
  const dm = buildModel(dayResp), wm = buildModel(weekResp)
  const rules = computeSupportRules(dayResp, dm, 7, 'day')
  const cur = dm.at(-1), prev = dm.at(-8)
  const esc = p => ({ esc: p?.t('All')?.escalations ?? null, inter: p?.t('All')?.interactions ?? null })
  const per = p => ({ inter: p?.t('All')?.interactions ?? null, orders: p?.orders?.orders ?? null })
  out.windows.support = { day: cur?.key || null, prevDay: prev?.key || null, week: wm.at(-1)?.key || null }
  out.support = {
    day: { key: cur?.key, frt: frt(dm), esc: esc(cur), escPrev: esc(prev), per: per(cur), perPrev: per(prev), pageRules: rules?.rules?.map(r => ({ id: r.id, count: r.count })) || null },
    week: { key: wm.at(-1)?.key, frt: frt(wm) },
  }
})

// ── targets: refreshed weekly ────────────────────────────────────────────────────────────────
function buildTargets() {
  return {
    returns: out.returns ? { window: out.windows.returns, channels: { Flipkart: out.returns.channels.Flipkart, Myntra: out.returns.channels.Myntra } } : null,
    alloc: out.alloc ? { window: out.windows.alloc, warehouses: Object.fromEntries(Object.entries(out.alloc.warehouses).map(([w, v]) => [w, { fillRate: v.fillRate, allocationPct: v.allocationPct }])), channels: out.alloc.channels } : null,
    logistics: out.logistics ? { window: out.windows.logistics, forward: out.logistics.forward, cod: out.logistics.cod, prepaid: out.logistics.prepaid } : null,
    cost: out.cost ? { month: out.cost.month, perShipment: out.cost.perShipment } : null,
    unattributed: out.ads ? { window: out.ads.window, ...out.ads.unattributed } : null,
    pnl: out.pnl ? { window: out.windows.pnl, tabs: { offline: out.pnl.tabs.offline, cred: out.pnl.tabs.cred } } : null,
    support: out.support ? { week: out.support.week } : null,
  }
}
let prior = null
try { if (existsSync(OUT)) prior = JSON.parse(readFileSync(OUT, 'utf8')) } catch { prior = null }
const dueMs = 7 * 24 * 3600 * 1000
const targetsDue = process.env.FORCE_TARGETS === '1' || !prior?.targets || !prior?.targetsComputedAt || NOW - new Date(prior.targetsComputedAt) >= dueMs
if (targetsDue) { out.targets = buildTargets(); out.targetsComputedAt = NOW.toISOString() } else { out.targets = prior.targets; out.targetsComputedAt = prior.targetsComputedAt }
if (ONLY && prior) { for (const k of Object.keys(prior)) if (!(k in out) || out[k] == null) out[k] = prior[k]; out.windows = { ...prior.windows, ...out.windows } } // dev partial runs keep the other sections

writeFileSync(OUT, JSON.stringify(out, null, 1))
console.log('alerts-phase2: wrote public/alerts-phase2.json', `(targets ${targetsDue ? 'recomputed' : 'carried forward from ' + prior.targetsComputedAt})`)
process.exit(0)
