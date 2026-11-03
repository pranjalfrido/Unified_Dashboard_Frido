#!/usr/bin/env node
// Layer-2 parity for ranges too big for a browser tab (3 months, 5 months, YTD): the old page's
// payloads (~150-300 MB of JSON) crash Chromium's renderer, which is the long-range problem this
// branch fixes. Here the real PnLPage (origin/main's and this branch's) renders in Node with
// react-test-renderer, and every component it hands data to is replaced by a stub that records its
// props: PnLChannelTab (every input the desktop and phone channel views render from: KPI summary,
// previous-period summary, sub-category / SKU data, SnD and ad-spend maps, net scale, daily and
// day-wise % series, Mobility net, store rows), StorePnLTable, and the four tools. Old vs new must
// be identical (JSON), for every view at desktop (1440) and phone (390) width; plus each view's
// onSummary() output, the four tools (opened through the phone layout's tool list), the Ads margin
// probe on its six tabs, and (--static) the new code on the full response.
// The display components themselves are unchanged code, so identical props = identical pages.
// Usage: SA_KEY_PATH=... COGS_ENV_PATH=... node --max-old-space-size=24576 node-parity.mjs --cases f.json [--static a,b]
import { readFileSync } from 'fs'
import { join } from 'path'
import { createElement } from 'react'
import { act } from 'react'
import { prevRange } from '../../src/overview/usePrevPeriod.js'
import { exportOld, setupRecorder, ROOT, OLD } from './_record.mjs'

const args = process.argv.slice(2)
const arg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d }
const CASES = JSON.parse(readFileSync(arg('--cases'), 'utf8'))
const STATIC = new Set((arg('--static', '') || '').split(',').filter(Boolean))

// ── browser globals PnLPage touches (set before its modules load: useBreakpoint reads window on import)
const resizeListeners = new Set()
globalThis.window = {
  innerWidth: 1440, innerHeight: 900,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
  addEventListener: (t, f) => { if (t === 'resize') resizeListeners.add(f) },
  removeEventListener: (t, f) => { if (t === 'resize') resizeListeners.delete(f) },
  scrollTo() {},
  // Google's HTTP client (BigQuery) sees `window` and uses window.fetch
  fetch: (...a) => globalThis.fetch(...a),
}
// theme.js reads CSS variables (getComputedStyle) and falls back to its built-in palette: no variables
// here, so both versions get the same fallback colours.
const attrs = new Map()
globalThis.document = { documentElement: { getAttribute: k => attrs.get(k) ?? null, setAttribute: (k, v) => attrs.set(k, v) } }
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' })
const store = new Map()
globalThis.sessionStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() }
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const setWidth = w => { window.innerWidth = w; window.innerHeight = w > 1000 ? 900 : 844; resizeListeners.forEach(f => f()) }

// ── load both PnLPage versions through Vite (JSX, Supabase stub, child components → prop recorders)
const CAPTURED = ['PnLChannelTab', 'StorePnLTable', 'PriceSimulator', 'BreakevenRoasCalculator', 'B2BCostingCalculator', 'POApprovalChecker']
const captures = {}
globalThis.__capture = (name, props) => { captures[name] = props }
const BASE = exportOld({ reuse: !!process.env.PARITY_SHARED_OLD })
const { createServer } = await import('vite')
const react = (await import('@vitejs/plugin-react')).default
const vite = await createServer({
  configFile: false, root: ROOT, logLevel: 'error', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  plugins: [react(), {
    name: 'pnl-node-parity', enforce: 'pre',
    resolveId(id, importer) {
      if (importer && /authFetch\.js$/.test(importer) && /supabase\.js$/.test(id)) return join(ROOT, 'scripts', 'pnl-reductions', 'harness', 'supabase-stub.js')
      const name = CAPTURED.find(n => id === `./${n}.jsx`)
      if (name && importer && /[\\/]pnl[\\/]PnLPage\.jsx$/.test(importer)) return `\0capture:${name}`
    },
    load(id) {
      if (id.startsWith('\0capture:')) return `export default function Stub(props) { globalThis.__capture(${JSON.stringify(id.slice(9))}, props); return null }`
    },
  }],
})
const PAGES = {
  old: (await vite.ssrLoadModule(join(OLD, 'src', 'pnl', 'PnLPage.jsx'))).default,
  new: (await vite.ssrLoadModule(join(ROOT, 'src', 'pnl', 'PnLPage.jsx'))).default,
}
const TestRenderer = (await import('react-test-renderer')).default
// useBreakpoint (one module per version) only re-reads the width while something is subscribed: keep a
// subscriber mounted for each, so setWidth() between views really switches desktop / phone.
const bpNow = {}
for (const [version, dir] of [['old', join(OLD, 'src')], ['new', join(ROOT, 'src')]]) {
  const { useBreakpoint } = await vite.ssrLoadModule(join(dir, 'responsive', 'useBreakpoint.js'))
  await act(async () => { TestRenderer.create(createElement(() => { bpNow[version] = useBreakpoint().width; return null })) })
}
console.log(`old code: ${BASE.slice(0, 8)}; renderer ready`)

const { recordRange, cogsFor } = await setupRecorder()

const VIEWS = [
  { tab: 'all' },
  ...['all', 'MyFrido', 'Mobility'].map(d2c => ({ tab: 'shopify', d2c })),
  { tab: 'ebo' },
  ...['all', 'sc', 'vc'].map(amz => ({ tab: 'amazon', amz })),
  ...['flipkart', 'blinkit', 'cred', 'firstcry', 'instamart', 'zepto', 'myntra', 'international'].map(tab => ({ tab })),
  ...['all', 'b2b', 'Stockist', 'MTGT', 'misc'].map(off => ({ tab: 'offline', off })),
]
const TOOLS = [['shopify', 'priceSimulator', 'PriceSimulator'], ['shopify', 'breakevenRoas', 'BreakevenRoasCalculator'], ['offline', 'b2bCosting', 'B2BCostingCalculator'], ['offline', 'poApproval', 'POApprovalChecker']]
const ADS_TABS = ['shopify', 'amazon', 'flipkart', 'blinkit', 'zepto', 'instamart']
const viewName = v => [v.tab, v.d2c, v.amz, v.off].filter(Boolean).join('/')
const tick = () => act(async () => { await new Promise(r => setTimeout(r, 2)) })

// Render one view and wait until what it hands its children stops changing (cogs, rate card and the
// previous period load asynchronously). Returns the JSON of every recorded prop set (+ onSummary).
// only: compare one key of onSummary() — the Ads probe, whose only reader takes `margins`
// (App.jsx onSummary={sm => setAdsMargins({ …, margins: sm.margins })}); pnl_margin deliberately
// carries no day-wise trend data, so the probe's `daily` series is not part of its contract.
async function renderView(version, { data, prev, start, end, caseLabel, v, summaryOnly = false, tool = null, only = null }) {
  for (const k of Object.keys(captures)) delete captures[k]
  store.clear()
  let summary = null
  const props = {
    data, filters: { start, end, __case: caseLabel }, setFilters: () => {},
    activeTab: v.tab, setActiveTab: () => {}, amzChannelView: v.amz || 'all', setAmzChannelView: () => {},
    offlineSub: v.off || 'all', setOfflineSub: () => {}, d2cSubCh: v.d2c || 'all', setD2cSubCh: () => {},
    ...(summaryOnly ? { summaryOnly: true, withMargins: true, onSummary: s => { summary = s } } : { loadPeriod: prev ? async () => prev : undefined }),
  }
  let r
  await act(async () => { r = TestRenderer.create(createElement(PAGES[version], props)) })
  const snap = () => JSON.stringify(summaryOnly ? (only ? summary?.[only] : summary) : captures)
  let last = null, same = 0
  for (let i = 0; i < 3000; i++) {
    await tick()
    const s = snap()
    const pending = summaryOnly ? summary == null : captures.PnLChannelTab?.prevSummary?.status === 'loading'
    if (s === last && !pending) { if (++same >= 5) break } else { same = 0; last = s }
  }
  if (tool) {
    await act(async () => { captures.PnLChannelTab.mobileExtras.onTool(tool) })
    for (let i = 0; i < 20; i++) await tick()
  }
  const out = snap()
  await act(async () => { r.unmount() })
  return out
}

function firstDiff(a, b) {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return `@${i}: old …${a.slice(Math.max(0, i - 100), i + 160)}\n         new …${b.slice(Math.max(0, i - 100), i + 160)}`
}

let fails = 0
for (const c of CASES) {
  const t0 = Date.now()
  const body = { channel: '__parity', ...c.body }
  const pr = prevRange(body.start, body.end)
  let cur, prev, cogs
  try {
    cur = await recordRange(body)
    if (!STATIC.has(c.label)) delete cur.full
    prev = await recordRange({ ...body, start: pr.start, end: pr.end })
    for (const k of ['full', 'adsOld', 'adsNew']) delete prev[k]
    cogs = { [`${body.start.slice(0, 7)}-01`]: await cogsFor(body.start, body.end), [`${pr.start.slice(0, 7)}-01`]: await cogsFor(pr.start, pr.end) }
  } catch (e) { console.log(`${c.label}: RECORD FAILED ${e.message}`); fails++; continue }
  const sndRates = readFileSync(join(ROOT, 'public', 'snd-rates.json'), 'utf8')
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url)
    if (u.endsWith('/snd-rates.json')) return new Response(sndRates, { status: 200, headers: { 'Content-Type': 'application/json' } })
    if (u.endsWith('/api/cogs-monthly')) { const { startMonth } = JSON.parse(opts.body || '{}'); return new Response(JSON.stringify(cogs[startMonth] || { rows: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }) }
    throw new Error('unexpected fetch ' + u)
  }
  const diffs = []
  let n = 0
  const compare = async (label, spec, newOverride = {}) => {
    const o = await renderView('old', spec)
    const nw = await renderView('new', { ...spec, ...newOverride })
    n++
    if (o !== nw) diffs.push(`${label} ${firstDiff(o, nw)}`)
    if (o === 'null' || o === '{}') diffs.push(`${label}: nothing rendered`)
  }
  const base = { start: body.start, end: body.end, caseLabel: c.label }
  try {
    for (const [layout, w] of [['desktop', 1440], ['phone', 390]]) {
      await act(async () => setWidth(w))
      if (bpNow.old !== w || bpNow.new !== w) throw new Error(`breakpoint not switched to ${w}: ${JSON.stringify(bpNow)}`)
      for (const v of VIEWS) {
        await compare(`${layout} ${viewName(v)}`, { ...base, v, data: cur.old, prev: prev.old }, { data: cur.new, prev: prev.new })
        await compare(`${layout} ${viewName(v)} summary`, { ...base, v, data: cur.old, summaryOnly: true }, { data: cur.new })
      }
      if (layout === 'phone') for (const [tab, tool, comp] of TOOLS) await compare(`tool ${comp}`, { ...base, v: { tab }, data: cur.old, prev: prev.old, tool }, { data: cur.new, prev: prev.new })
    }
    await act(async () => setWidth(1440))
    for (const v of VIEWS) await compare(`prev-period summary ${viewName(v)}`, { start: pr.start, end: pr.end, caseLabel: c.label, v, data: prev.old, summaryOnly: true }, { data: prev.new })
    for (const tab of ADS_TABS) await compare(`ads margins ${tab}`, { ...base, v: { tab }, data: cur.adsOld, summaryOnly: true, only: 'margins' }, { data: cur.adsNew })
    if (cur.full) for (const v of VIEWS) await compare(`static ${viewName(v)}`, { ...base, v, data: cur.old, prev: prev.old }, { data: cur.full, prev: prev.new })
  } catch (e) { diffs.push(`CRASH ${e.stack?.split('\n').slice(0, 3).join(' | ')}`) }
  globalThis.fetch = realFetch
  const l1 = [...cur.l1, ...prev.l1]
  const mb = x => (x / 1e6).toFixed(1)
  if (diffs.length || l1.length) fails++
  console.log(`${c.label} (${((Date.now() - t0) / 1000).toFixed(0)}s): ${n} comparisons old vs new ${diffs.length ? 'DIFF\n  ' + diffs.slice(0, 5).join('\n  ') : 'IDENTICAL'}` +
    `  | layer 1: ${l1.length ? 'FAIL ' + l1.slice(0, 2).join('; ') : 'exact'}  | MB full ${mb(cur.sizes.full)} · pnl_detail old ${mb(cur.sizes.oldPnl)} → new ${mb(cur.sizes.pnl_detail)} · pnl_margin ${mb(cur.sizes.pnl_margin)}`)
  cur = prev = cogs = null
}
await vite.close()
console.log(fails ? `FAILURES: ${fails}` : 'ALL PASS')
process.exit(fails ? 1 : 0)
