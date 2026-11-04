#!/usr/bin/env node
// Layer-2 parity for PNL_REDUCTIONS_PLAN.md §5: what the P&L page SHOWS, old code vs new code, on the
// same BigQuery rows. Per case:
//   1. Record the range and its previous period: one live full (no-phase) run each, then every phase
//      replayed on the recorded rows (new api/bq.js). Layer-1 checks (payload-check.mjs) run here too.
//   2. Build each version's page input exactly as that version of the app assembles it:
//        old: fast + origin/main's pnl_detail (its pickPhaseFields on the same payload)
//        new: fast + this branch's pnl_detail            (+ "static": the full response, rows present)
//        Ads probe — old: fast + old pnl_detail + ads_detail   new: fast + pnl_margin + ads_detail
//   3. Render every P&L view in old.html / new.html (harness/, real PnLPage, Supabase stubbed) at
//      desktop 1440 px and phone 390 px: 21 tab / sub-tab views, 4 tools; the desktop Financial View
//      with every product's SKU rows expanded. Compare the rendered DOM (KPI cards, tables, watchlist
//      flags, margin matrix, chart SVG) and the summary instance's onSummary() output (KPI totals,
//      per-product rows, daily series incl. the day-wise % trend, product margins) — exactly.
//   4. Ads: the hidden margin probe on its six tabs, old input vs new input: margins identical.
// Recordings are deleted after each case.
//
// Needs: SA_KEY_PATH (BigQuery key, read in place), COGS_ENV_PATH (a .env with SUPABASE_URL, read in
// place, for the real /api/cogs-monthly answer). Optional: --only a,b  --cases file  --static a,b
// (cases that also compare new-on-full-response)  --phone-tools  --keep (don't delete recordings)
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'
import { prevRange } from '../../src/overview/usePrevPeriod.js'
import { exportOld, setupRecorder, OLD } from './_record.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const HARNESS = join(HERE, 'harness')
const args = process.argv.slice(2)
const arg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d }
const flag = f => args.includes(f)
let CASES = JSON.parse(readFileSync(arg('--cases', join(ROOT, 'scripts', 'staged-loading', 'parity-cases.json')), 'utf8'))
if (arg('--only')) CASES = CASES.filter(c => arg('--only').split(',').includes(c.label))
const STATIC = new Set((arg('--static', '') || '').split(',').filter(Boolean))
const OUT = join(tmpdir(), 'pnl-render-parity')
// Several shards can run at once (--only per shard): each needs its own PARITY_PORT, and
// PARITY_SHARED_OLD=1 makes them reuse one export of origin/main instead of re-creating it.
const LOG = join(OUT, `diffs-${process.env.PARITY_PORT || 5199}.log`)
const SHARED_OLD = !!process.env.PARITY_SHARED_OLD
mkdirSync(OUT, { recursive: true })
writeFileSync(LOG, '')

// ── 0. origin/main's code (old.html) + 1. BigQuery recording and cogs-monthly (_record.mjs) ──
const BASE = exportOld({ reuse: SHARED_OLD })
console.log(`old code: ${BASE.slice(0, 8)} (exported to ${OLD})`)
const { recordRange, cogsFor } = await setupRecorder()

// ── 2. browser ──
const { createServer } = await import('vite')
const vite = await createServer({ configFile: join(HARNESS, 'vite.config.mjs') })
await vite.listen()
const { chromium } = await import('playwright')
// The old page holds ~150 MB payloads at 3+ months: give the renderer a big heap.
const launch = () => chromium.launch({ args: ['--js-flags=--max-old-space-size=8192'] })
let browser = await launch()
const LAYOUTS = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } }
const sndRates = readFileSync(join(ROOT, 'public', 'snd-rates.json'), 'utf8')

const VIEWS = [
  { tab: 'all' },
  ...['all', 'MyFrido', 'Mobility'].map(d2c => ({ tab: 'shopify', d2c })),
  { tab: 'ebo' },
  ...['all', 'sc', 'vc'].map(amz => ({ tab: 'amazon', amz })),
  ...['flipkart', 'blinkit', 'cred', 'firstcry', 'instamart', 'zepto', 'myntra', 'international'].map(tab => ({ tab })),
  ...['all', 'b2b', 'Stockist', 'MTGT', 'misc'].map(off => ({ tab: 'offline', off })),
]
const TOOLS = [
  { tab: 'shopify', tool: 'Price Simulator' }, { tab: 'shopify', tool: 'Breakeven ROAS' },
  { tab: 'offline', tool: 'B2B Costing Calculator' }, { tab: 'offline', tool: 'PO Approval Checker' },
]
const ADS_TABS = ['shopify', 'amazon', 'flipkart', 'blinkit', 'zepto', 'instamart']
const viewName = v => [v.tab, v.d2c, v.amz, v.off, v.tool].filter(Boolean).join('/')

async function openPage(version, layout, dir) {
  // an out-of-memory tab can take the whole browser down (old page, YTD): start a fresh one
  if (!browser.isConnected()) browser = await launch()
  const ctx = await browser.newContext({ viewport: LAYOUTS[layout], deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.on('pageerror', e => { page.__errors = [...(page.__errors || []), e.message] })
  await page.route('**/snd-rates.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: sndRates }))
  await page.route('**/api/cogs-monthly', async r => {
    const { startMonth } = JSON.parse(r.request().postData() || '{}')
    const which = existsSync(join(dir, `cogs-${startMonth}.json`)) ? `cogs-${startMonth}.json` : null
    await r.fulfill({ status: 200, contentType: 'application/json', body: which ? readFileSync(join(dir, which), 'utf8') : '{"rows":[]}' })
  })
  await page.route('**/__data/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(join(dir, r.request().url().split('/__data/')[1])) }))
  await page.route(/\.(png|svg|jpg)$/, r => r.fulfill({ status: 404, body: '' }))
  await page.goto(`http://localhost:${vite.config.server.port}/${version}.html`)
  await page.waitForFunction(() => typeof window.__render === 'function', null, { timeout: 120000 })
  return page
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
async function settle(page, sel = '#root') {
  let last = null, same = 0
  for (let i = 0; i < 200; i++) {
    const h = await page.evaluate(s => document.querySelector(s).innerHTML, sel)
    if (h === last) { if (++same >= 5) return h } else { same = 0; last = h }
    await sleep(200)
  }
  return last
}
async function renderView(page, spec, { expand, tool }) {
  await page.evaluate(s => window.__render(s), spec)
  if (spec.probe) await page.waitForFunction(() => window.__summary != null, null, { timeout: 60000 })
  let html = spec.main ? await settle(page) : ''
  if (spec.main && tool) {
    await page.getByText(tool, { exact: true }).first().click()
    html = await settle(page)
  } else if (spec.main && expand) {
    await page.evaluate(async () => {
      const sel = 'table span[title][style*="cursor: pointer"]'
      for (let i = 0; ; i++) {
        const els = document.querySelectorAll(sel)
        if (i >= els.length) break
        els[i].click()
        await new Promise(r => setTimeout(r, 0))
      }
    })
    html = await settle(page)
  }
  const summary = spec.probe ? await page.evaluate(() => JSON.stringify(window.__summary)) : null
  return { html, summary }
}

// --timing: instead of the view comparison, the browser-side cost of the first P&L numbers and of the
// Ads margin figure, old vs new: JSON.parse of each response (fast, then the P&L group), and the
// P&L calculation itself (a summary instance: channel data, KPI summary, Financial View rows,
// margins) until onSummary. Desktop at full speed, phone with 4x CPU throttling (DevTools' "mid-tier
// mobile"). Median of 3 after a warm-up. Network and server time are added in the report from
// measure.mjs (server ms, gzip MB).
const TIMING = flag('--timing')
async function timing(dir, body) {
  const out = {}
  for (const [layout, cpu] of [['desktop', 1], ['phone', 4]]) {
    for (const version of ['old', 'new']) {
      let page, step = 'open page'
      try {
      page = await openPage(version, layout, dir)
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
      const parse = async file => page.evaluate(async u => {
        const t = await (await fetch(u)).text()
        const t0 = performance.now(); JSON.parse(t); return performance.now() - t0
      }, `/__data/${file}.json`)
      const med = xs => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]
      const parts = version === 'old' ? { pnl: 'part-oldPnl', ads: 'part-oldPnl' } : { pnl: 'part-pnl_detail', ads: 'part-pnl_margin' }
      const r = { parseFast: [], parsePnl: [], parseAds: [], calcPnl: [], calcAds: [] }
      for (let k = 0; k < 4; k++) {
        const keep = k > 0 // first round = warm-up
        step = 'parse responses'
        const pf = await parse('part-fast'), pp = await parse(parts.pnl), pa = await parse(parts.ads)
        if (keep) { r.parseFast.push(pf); r.parsePnl.push(pp); r.parseAds.push(pa) }
        // one payload in the tab at a time, as in the app (the P&L page holds its merged data; the
        // Ads page holds its own)
        for (const [key, file, tab] of [['calcPnl', version, 'shopify'], ['calcAds', version === 'old' ? 'adsOld' : 'adsNew', 'shopify']]) {
          step = `load ${file}.json`
          await page.evaluate(u => window.__load('d', u), `/__data/${file}.json`)
          step = `${key} calculation`
          const spec = { key: `t-${k}-${key}`, start: body.start, end: body.end, caseLabel: `timing-${k}`, tab, amz: 'all', off: 'all', d2c: 'all', data: 'd', main: false, probe: true }
          await page.evaluate(s => { window.__t0 = performance.now(); window.__render(s) }, spec)
          const ms = await (await page.waitForFunction(() => window.__summary != null && performance.now() - window.__t0, null, { polling: 'raf', timeout: 120000 })).jsonValue()
          if (keep) r[key].push(ms)
          await page.evaluate(() => { window.__render({ main: false, probe: false }); return window.__drop('d') })
        }
      }
      out[`${layout}.${version}`] = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(med(v))]))
      } catch (e) {
        // the old page's long-range payloads can crash the tab (renderer out of memory)
        out[`${layout}.${version}`] = { crash: `during ${step}: ${e.message.split('\n')[0]}` }
      }
      await page?.context().close().catch(() => {})
    }
  }
  const mb = f => +(readFileSync(join(dir, `${f}.json`)).length / 1048576).toFixed(1)
  out.MB = { fast: mb('part-fast'), oldPnl: mb('part-oldPnl'), pnl_detail: mb('part-pnl_detail'), pnl_margin: mb('part-pnl_margin') }
  return out
}

// Recharts numbers its clipPath ids from one page-wide counter of chart mounts, so a chart that
// mounts one extra time while data arrives shifts every later id; the id itself carries no data.
// Only that id is normalised, and only where it sits in an attribute value: id="rechartsN-clip",
// clip-path="url(#rechartsN-clip)", href="#rechartsN-clip". Text content, numbers and SVG path
// data (d="…", points, x / y / width / height) are compared byte for byte.
const RECHARTS_ID_ATTR = /(\bid="|url\(#|href="#)recharts\d+-clip(?=[")])/g
const normIds = h => h.replace(RECHARTS_ID_ATTR, '$1recharts#-clip')

function firstDiff(a, b) {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return `@${i}\n  old: …${a.slice(Math.max(0, i - 120), i + 200)}\n  new: …${b.slice(Math.max(0, i - 120), i + 200)}`
}

let fails = 0
const results = []
for (const c of CASES) {
  const t0 = Date.now()
  const body = { channel: '__parity', ...c.body }
  const pr = prevRange(body.start, body.end)
  const dir = join(OUT, c.label)
  mkdirSync(dir, { recursive: true })
  let cur, prev
  try {
    cur = await recordRange(body, { parts: TIMING })
    prev = await recordRange({ ...body, start: pr.start, end: pr.end })
  } catch (e) { console.log(`${c.label}: RECORD FAILED ${e.message}`); fails++; continue }
  const l1 = [...cur.l1, ...prev.l1]
  for (const [name, v] of Object.entries({ old: cur.old, new: cur.new, full: cur.full, adsOld: cur.adsOld, adsNew: cur.adsNew, prevOld: prev.old, prevNew: prev.new })) writeFileSync(join(dir, `${name}.json`), JSON.stringify(v))
  if (TIMING) for (const [name, v] of Object.entries(cur.parts)) writeFileSync(join(dir, `part-${name}.json`), JSON.stringify(v))
  for (const [s, e] of [[body.start, body.end], [pr.start, pr.end]]) writeFileSync(join(dir, `cogs-${s.slice(0, 7)}-01.json`), JSON.stringify(await cogsFor(s, e)))
  const sizes = cur.sizes
  cur = prev = null
  if (TIMING) {
    console.log(`${c.label} timing ${JSON.stringify(await timing(dir, body))}`)
    if (!flag('--keep')) rmSync(dir, { recursive: true, force: true })
    continue
  }

  const diffs = []
  let views = 0
  for (const layout of ['desktop', 'phone']) {
    const pages = {}
    // Each data set is loaded only for the step that reads it (the old page's 3-5 month payloads
    // are ~150 MB each).
    const FILES = { old: { cur: 'old', prev: 'prevOld', ads: 'adsOld' }, new: { cur: 'new', prev: 'prevNew', ads: 'adsNew', full: 'full' } }
    const load = async (names, versions = ['old', 'new']) => {
      for (const version of versions) for (const n of names) if (FILES[version][n]) await pages[version].evaluate(([a, u]) => window.__load(a, u), [n, `/__data/${FILES[version][n]}.json`])
    }
    const drop = async names => { for (const version of ['old', 'new']) for (const n of names) await pages[version].evaluate(a => { window.__render({ main: false, probe: false }); return window.__drop(a) }, n) }
    for (const version of ['old', 'new']) pages[version] = await openPage(version, layout, dir)
    // --split-prev (3+ month ranges): one Chromium tab can't hold the old page's current AND
    // previous-period payloads (150 + 109 MB of JSON at 3 months). The views then render without the
    // previous-period overlay, and the previous period's summary (what feeds ▲/▼ and the watchlist's
    // prev-period rules) is compared on its own below; the display code is unchanged, so identical
    // inputs on both passes = identical page.
    const SPLIT = flag('--split-prev')
    await load(SPLIT ? ['cur'] : ['cur', 'prev'])
    const specOf = (v, i, extra) => ({ key: `${layout}-${i}`, start: body.start, end: body.end, caseLabel: c.label, tab: v.tab, amz: v.amz || 'all', off: v.off || 'all', d2c: v.d2c || 'all', data: 'cur', prevData: SPLIT ? undefined : 'prev', main: true, probe: true, ...extra })
    const compare = async (label, v, i, opts, newExtra = {}) => {
      const [o, n] = await Promise.all([renderView(pages.old, specOf(v, i), opts), renderView(pages.new, specOf(v, i, newExtra), opts)])
      views++
      if (normIds(o.html) !== normIds(n.html)) { diffs.push(`${layout} ${label}: DOM`); writeFileSync(LOG, `\n=== ${c.label} ${layout} ${label} DOM ${firstDiff(normIds(o.html), normIds(n.html))}\n`, { flag: 'a' }) }
      if (o.summary !== n.summary) { diffs.push(`${layout} ${label}: summary`); writeFileSync(LOG, `\n=== ${c.label} ${layout} ${label} summary ${firstDiff(o.summary || '', n.summary || '')}\n`, { flag: 'a' }) }
      if (!o.html && opts.main !== false && !o.summary) diffs.push(`${layout} ${label}: empty`)
    }
    let i = 0
    for (const v of VIEWS) await compare(viewName(v), v, i++, { expand: layout === 'desktop' })
    for (const v of TOOLS) if (layout === 'desktop' || flag('--phone-tools')) await compare(viewName(v), v, i++, { tool: v.tool })
    if (SPLIT && layout === 'desktop') {
      await drop(['cur'])
      await load(['prev'])
      for (const v of VIEWS) {
        const spec = { ...specOf(v, i++), start: pr.start, end: pr.end, data: 'prev', prevData: undefined, main: false }
        const [o, n] = await Promise.all([renderView(pages.old, spec, {}), renderView(pages.new, spec, {})])
        views++
        if (o.summary !== n.summary || !o.summary) { diffs.push(`prev summary ${viewName(v)}`); writeFileSync(LOG, `\n=== ${c.label} prev ${viewName(v)} ${firstDiff(o.summary || '', n.summary || '')}\n`, { flag: 'a' }) }
      }
      await drop(['prev'])
      await load(['cur'])
    }
    if (layout === 'desktop') {
      // Ads margin probe: summary only, old input vs new (pnl_margin) input
      await drop(['cur'])
      await load(['ads'])
      for (const tab of ADS_TABS) {
        const v = { tab }
        const [o, n] = await Promise.all([
          renderView(pages.old, { ...specOf(v, i), main: false, probeData: 'ads' }, {}),
          renderView(pages.new, { ...specOf(v, i++), main: false, probeData: 'ads' }, {}),
        ])
        views++
        const om = JSON.parse(o.summary).margins, nm = JSON.parse(n.summary).margins
        if (JSON.stringify(om) !== JSON.stringify(nm) || !om) { diffs.push(`ads margins ${tab}`); writeFileSync(LOG, `\n=== ${c.label} ads ${tab} ${firstDiff(JSON.stringify(om) || '', JSON.stringify(nm) || '')}\n`, { flag: 'a' }) }
      }
      await drop(['ads'])
      // static path: new code on the full response (rows present) vs old
      if (STATIC.has(c.label)) {
        await load(['cur'], ['old'])
        await load(['full'], ['new'])
        for (const v of VIEWS) await compare(`static:${viewName(v)}`, v, i++, { expand: true }, { data: 'full' })
      }
    }
    for (const version of ['old', 'new']) {
      if (pages[version].__errors?.length) { diffs.push(`${layout} ${version}: page errors ${pages[version].__errors.slice(0, 2).join(' | ')}`) }
      await pages[version].context().close()
    }
  }
  if (!flag('--keep')) rmSync(dir, { recursive: true, force: true })
  const ok = !diffs.length && !l1.length
  if (!ok) fails++
  const mb = n => (n / 1e6).toFixed(1)
  const line = `${c.label} (${((Date.now() - t0) / 1000).toFixed(0)}s): ${views} views old vs new ${diffs.length ? 'DIFF ' + diffs.slice(0, 6).join('; ') : 'IDENTICAL'}` +
    `  | layer 1: ${l1.length ? 'FAIL ' + l1.slice(0, 2).join('; ') : 'exact'}  | MB full ${mb(sizes.full)} · pnl_detail old ${mb(sizes.oldPnl)} → new ${mb(sizes.pnl_detail)} · pnl_margin ${mb(sizes.pnl_margin)}`
  console.log(line)
  results.push(line)
}
await browser.close()
await vite.close()
if (!SHARED_OLD) rmSync(OLD, { recursive: true, force: true })
console.log(fails ? `FAILURES: ${fails} (details: ${LOG})` : 'ALL PASS')
process.exit(fails ? 1 : 0)
