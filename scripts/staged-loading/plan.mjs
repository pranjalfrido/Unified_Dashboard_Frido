#!/usr/bin/env node
// Turns measured dependency maps (deps.mjs output, one or more scenarios) into the phase tables
// written to api/_bqPhases.js by write-phases.mjs. Re-run after adding/removing a query or field:
//   node scripts/staged-loading/plan.mjs scripts/staged-loading/deps/*.json > plan.json
//   node scripts/staged-loading/write-phases.mjs plan.json
//
// Rules (see PERF_STATUS.md):
//  * FAST units: every response unit whose measured query dependencies are all "cheap enough for
//    the first paint" (old fast set + the resolved-return-engine inputs + previous-period totals +
//    the small sub-channel queries), minus the PnL/SKU-grain detail units listed in DETAIL_ONLY.
//  * Every other unit is a detail unit, owned by each tab whose source code mentions its name
//    (Sales/Overview, PnL, Ads). A detail unit no tab's code names goes to sales_detail (ads.* to
//    ads_detail) so fast + all three detail groups always rebuilds the full response.
//  * A phase runs exactly the union of its units' dependencies, plus byChannel/byDate always.
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { ROOT } from './_harness.mjs'

const files = process.argv.slice(2)
const deps = {}; const qk = new Set()
for (const f of files) {
  const d = JSON.parse(readFileSync(f, 'utf8'))
  d.queryKeys.forEach(k => qk.add(k))
  for (const [u, qs] of Object.entries(d.units)) {
    if (u === '__crash') { console.error('crash keys in', f, qs); continue }
    ;(deps[u] ||= new Set()); qs.forEach(q => deps[u].add(q))
  }
}
// The pre-existing slow list (api/bq.js before staged loading) — used only as the fast-budget
// baseline. A query added later is outside it (i.e. "cheap") unless listed there.
const OLD_SLOW = new Set(JSON.parse(readFileSync(new URL('./old-slow-keys.json', import.meta.url), 'utf8')).keys)
const FAST_BUDGET = new Set([
  ...[...qk].filter(k => !OLD_SLOW.has(k)),
  // resolved return engine inputs: chMap / netRevenueCalc / returnRev / *.resolvedDailySKU need them
  'shDailySKU', 'fkDailySKUComponents', 'mnDailySKUComponents', 'eboDailySKUComponents', 'amzSCDailyNetBySKU',
  'amzVCDailySKUComponents', 'crDailySKUComponents', 'fcDailySKUComponents', 'offDailySKUComponents', 'shSKU',
  // …and their rolling-window rates, used for the last 15 (immature) days of a range — small
  ...[...qk].filter(k => /ComponentRateMature$/.test(k)),
  // sub-channel KPIs (subChannelMap) — tiny
  'salesCategoryOrders', 'salesCategoryOrdersFk',
  // previous-period totals for every channel's ▲/▼ — one row each
  ...[...qk].filter(k => k.startsWith('prev')),
])
// Dependencies the knockout run cannot see because the query returned no rows in every recorded
// scenario, or only matter on an error path (verified by reading api/bq.js).
// crDaily → cred.daily: overwritten by the later CRED block, but that block's error fallback keeps it.
const MANUAL_DEPS = { 'ebo.returnReasons': ['eboReturnReasons'], 'cred.daily': ['crDaily'] }
for (const [u, qs] of Object.entries(MANUAL_DEPS)) { (deps[u] ||= new Set()); qs.forEach(q => deps[u].add(q)) }
// Small per-channel fields the Sales tabs' KPI tiles read (Amazon SC revenue/orders/units come from
// fulfillment, Delivered % / Cancel rate from status, the Q-commerce and Flipkart headline revenue/
// returns from categories): fast, so no KPI tile ever shows a placeholder 0. All cheap queries.
const FORCE_FAST = ['amzSC.fulfillment', 'amzSC.status', 'flipkart.status', 'cred.status', 'firstcry.status',
  'flipkart.categories', 'blinkit.categories', 'instamart.categories', 'zepto.categories']
for (const u of FORCE_FAST) (deps[u] || []).forEach(q => FAST_BUDGET.add(q))
const DETAIL_ONLY =/^(?:[a-zA-Z]+\.(?:sndBySku|dailyPnLBySku|skuCostRows|storeSkuCostRows|skuWeightGm|skuWeightShares|subCatDateMap|dailySKU|resolvedDailySKU)|pnlSalesRows)$/
const units = Object.keys(deps).filter(u => u !== 'shopify.dailySkuCostRows').sort()
const isFast = u => !DETAIL_ONLY.test(u) && [...deps[u]].every(q => FAST_BUDGET.has(q))
const FAST = units.filter(isFast)
const DETAIL = units.filter(u => !isFast(u))

const read = p => readFileSync(p, 'utf8')
const lines = read(join(ROOT, 'src', 'App.jsx')).split('\n')
const appRange = (a, b) => lines.slice(a - 1, b).join('\n')
const find = re => lines.findIndex(l => re.test(l)) + 1
const dir = d => readdirSync(join(ROOT, 'src', d)).filter(f => /\.(jsx?|mjs)$/.test(f)).map(f => read(join(ROOT, 'src', d, f))).join('\n')
const L = {
  overview: find(/^function OverviewPage\(/), tabs: find(/^const TABS = \[/), adsSlicer: find(/^function AdsSlicerDropdown\(/),
  blinkit: find(/^function BlinkitTab\(/), intel: find(/^function IntelCard\(/), adsEffect: find(/Load ads static cache when user navigates/),
  dataMemo: find(/^\s*const data = useMemo\(\(\) => \{ if \(!rawRows\)/), heroKpi: find(/^function HeroKPICard\(/),
}
const SRC = {
  sales: [appRange(L.heroKpi, L.adsSlicer - 1), appRange(L.blinkit, L.intel - 1), dir('sales'), dir('overview'), dir('responsive'), read(join(ROOT, 'src', 'utils.js')), read(join(ROOT, 'src', 'components.jsx'))].join('\n'),
  pnl: dir('pnl'),
  ads: [appRange(L.adsSlicer, L.blinkit - 1), dir('ads'), appRange(L.adsEffect, L.dataMemo + 60)].join('\n'),
}
const token = u => u.includes('.') ? u.split('.')[1] : u
const mentions = (src, u) => new RegExp(`\\b${token(u)}\\b`).test(src)
const owner = { sales_detail: [], pnl_detail: [], ads_detail: [] }
for (const u of DETAIL) {
  let any = false
  // Ads: ads.* by field name; anything else only when the Ads code reads it qualified (data.x.y / x.y)
  const qualified = u.includes('.') && new RegExp(`\\b${u.split('.')[0]}\\??\\.${u.split('.')[1]}\\b`).test(SRC.ads)
  if (u.startsWith('ads.') ? mentions(SRC.ads, u) : qualified) { owner.ads_detail.push(u); any = true }
  if (mentions(SRC.pnl, u)) { owner.pnl_detail.push(u); any = true }
  // resolvedDailySKU rows: Sales reads their reductions (<channel>.resolvedAggDetail, api/_resolvedAgg.js)
  // shipped with sales_detail instead; only P&L gets the rows themselves.
  if (!u.startsWith('ads.') && !u.endsWith('.resolvedDailySKU') && mentions(SRC.sales, u)) { owner.sales_detail.push(u); any = true }
  if (!any) (u.startsWith('ads.') ? owner.ads_detail : owner.sales_detail).push(u)
}
// Run by every phase: the small queries chMap's gross / ex-GST / order figures and dailyArr are built
// from. byChannel/byDate: chMap / netRevenueCalc / dailyArr are built unconditionally (the old
// phase:'slow' crashed on chMap['Shopify'] without them). The rest patch chMap per channel (Shopify
// international + netCalc, Amazon SC netCalc, VC accounts, Offline totals, Flipkart/Myntra late-
// report estimates); detail fields that reconcile to chMap (e.g. ads.allSpendDetail) need them, but
// only show it in ranges where those patches are non-zero — so they are pinned here rather than
// left to the measured map. (chMap's heavy resolved-return inputs only move netRev, never these.)
const ALWAYS = ['byChannel', 'byDate', 'fkDaily', 'mnDaily', 'shopifyIntlTotals', 'shNetCalc', 'amzSCNetCalc', 'amzVCAccounts', 'offlineTotals']
const queriesFor = us => [...new Set([...us.flatMap(u => [...deps[u]]), ...ALWAYS])].sort()
// fast also ships <channel>.resolvedAgg (api/_resolvedAgg.js), computed from every resolvedDailySKU
// at response time — so it runs their queries even though the rows themselves are detail fields.
const AGG_SOURCES = units.filter(u => u.endsWith('.resolvedDailySKU'))
const out = { FAST: { units: FAST, queries: queriesFor([...FAST, ...AGG_SOURCES]) } }
for (const [p, us] of Object.entries(owner)) out[p] = { units: us, queries: queriesFor(p === 'sales_detail' ? [...us, ...AGG_SOURCES] : us) }
const used = new Set(Object.values(out).flatMap(o => o.queries))
out.unusedQueries = [...qk].filter(k => !used.has(k)).sort()
console.log(JSON.stringify(out, null, 1))
