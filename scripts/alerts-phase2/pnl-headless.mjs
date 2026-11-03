// Runs the P&L page's OWN component (src/pnl/PnLPage.jsx) headlessly in jsdom, in its existing
// `summaryOnly` mode, with the same /api/bq payload the P&L screen gets, and returns the numbers the page
// computes itself (kpiSummary: CM1 %, GM %, COGS %, SnD % ...). Same approach as the Frido data connector's
// `pnl` tool (frido-data-connector/lib/pnlHeadless.js) — the formulas are the page's code, never a re-derivation
// (Phase 1 learned that every hand re-derivation drifted from the page; see docs/ALERTS_PLAN.md).
//
// The bundle is built from THIS checkout's source at run time (esbuild), with one line patched so the page also
// reports kpiSummary through its existing onSummary hook. The page's two runtime fetches are answered locally:
// /api/cogs-monthly by the real handler, /snd-rates.json from public/. Read-only.
import { JSDOM } from 'jsdom'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { build } from 'esbuild'
import { cpSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, join } from 'path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const WORK = join(ROOT, '.alerts-p2-tmp')

let PnLPage = null
let domReady = false

async function buildBundle() {
  rmSync(WORK, { recursive: true, force: true })
  mkdirSync(WORK, { recursive: true })
  cpSync(join(ROOT, 'src'), join(WORK, 'src'), { recursive: true })
  const pagePath = join(WORK, 'src', 'pnl', 'PnLPage.jsx')
  let page = readFileSync(pagePath, 'utf8')
  const m1 = 'onSummary({\n      gross: activeData.gross,', m2 = 'onSummary({\r\n      gross: activeData.gross,'
  if (page.includes(m1)) page = page.replace(m1, 'onSummary({\n      kpi: kpiSummary,\n      gross: activeData.gross,')
  else if (page.includes(m2)) page = page.replace(m2, 'onSummary({\r\n      kpi: kpiSummary,\r\n      gross: activeData.gross,')
  else throw new Error('PnLPage.jsx onSummary call changed — update scripts/alerts-phase2/pnl-headless.mjs')
  writeFileSync(pagePath, page)
  writeFileSync(join(WORK, 'entry.jsx'), "export { default } from './src/pnl/PnLPage.jsx';\n")
  const out = join(WORK, 'pnl-bundle.mjs')
  await build({
    entryPoints: [join(WORK, 'entry.jsx')], outfile: out,
    bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', target: 'node22', logLevel: 'warning',
    nodePaths: [join(ROOT, 'node_modules')],
    external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
    loader: { '.css': 'empty', '.png': 'dataurl', '.svg': 'dataurl', '.jpg': 'dataurl', '.woff2': 'empty', '.woff': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ VITE_API_URL: '', VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'x', DEV: false, PROD: true, MODE: 'production', BASE_URL: '/' }) },
    banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
  })
  return out
}

async function setup(callHandler, cogsHandler) {
  if (domReady) return
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
  const w = dom.window
  const def = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true })
  def('window', w); def('document', w.document); def('navigator', w.navigator); def('localStorage', w.localStorage); def('sessionStorage', w.sessionStorage)
  for (const k of ['HTMLElement', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) if (w[k]) def(k, typeof w[k] === 'function' && !/^[A-Z]/.test(k) ? w[k].bind(w) : w[k])
  w.matchMedia = w.matchMedia || (q => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
  def('matchMedia', w.matchMedia)
  class RO { observe() {} unobserve() {} disconnect() {} }
  def('ResizeObserver', RO); w.ResizeObserver = RO; def('IntersectionObserver', RO); w.IntersectionObserver = RO
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  const realFetch = globalThis.fetch.bind(globalThis)
  const ok = obj => ({ ok: true, status: 200, json: async () => obj })
  globalThis.fetch = async (url, opts) => {
    if (typeof url === 'string' && url.startsWith('/api/cogs-monthly')) return ok(await callHandler(cogsHandler, JSON.parse(opts?.body || '{}')))
    if (typeof url === 'string' && url.startsWith('/snd-rates.json')) return ok(JSON.parse(readFileSync(join(ROOT, 'public', 'snd-rates.json'), 'utf8')))
    if (typeof url === 'string' && url.startsWith('/')) return { ok: false, status: 404, json: async () => ({}) }
    return realFetch(url, opts)
  }
  w.fetch = globalThis.fetch
  domReady = true
}

async function renderTab(data, tab, start, end) {
  const mount = document.createElement('div'); document.body.appendChild(mount)
  const root = createRoot(mount)
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('P&L page did not report a summary in time')), 90000)
      root.render(React.createElement(PnLPage, {
        data, filters: { start, end }, setFilters() {}, activeTab: tab, setActiveTab() {},
        amzChannelView: 'all', setAmzChannelView() {}, offlineSub: 'all', setOfflineSub() {}, d2cSubCh: 'all', setD2cSubCh() {},
        summaryOnly: true, withMargins: false, onSummary: v => { clearTimeout(timer); resolve(v) },
      }))
    })
  } finally { root.unmount(); mount.remove() }
}

// tabs: shopify (D2C) | amazon | flipkart | ebo | offline | blinkit | zepto | instamart | cred | firstcry | myntra
export async function pnlSummaries({ data, start, end, tabs, callHandler, cogsHandler }) {
  await setup(callHandler, cogsHandler)
  if (!PnLPage) PnLPage = (await import(pathToFileURL(await buildBundle()).href)).default
  const out = {}
  for (const tab of tabs) {
    try {
      const s = await renderTab(data, tab, start, end)
      const k = s.kpi || {}
      out[tab] = { cm1Pct: k.cm1Pct ?? null, gmPct: k.gmPct ?? null, cogsPct: k.cogsPct ?? null, sndPct: k.sndPct ?? null, net: s.net ?? null, gross: s.gross ?? null }
    } catch (e) { out[tab] = { error: e.message } }
  }
  rmSync(WORK, { recursive: true, force: true })
  return out
}
