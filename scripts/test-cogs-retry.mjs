// Run: node scripts/test-cogs-retry.mjs
// P&L / Ads COGS loader: /api/cogs-monthly is retried once before the page falls back to the ASP estimate (unchanged
// numbers either way). Renders the real PnLPage (esbuild bundle of THIS checkout, summary mode, the one the Ads page uses
// for breakeven ROAS) in jsdom. Needs SUPABASE_URL (.env) for the real-COGS numbers; without it only the retry counts run.
import { JSDOM } from 'jsdom'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { build } from 'esbuild'
import { cpSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, join } from 'path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WORK = join(ROOT, '.cogs-test-tmp')
if (!process.env.SUPABASE_URL) {
  for (const f of [join(ROOT, '.env'), 'C:/Users/SurajSingh/OneDrive - Arcatron Mobility Pvt Ltd/Desktop/mis02/Unified_Dashboard_Frido/.env']) {
    if (!existsSync(f)) continue
    for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
    break
  }
}
let fail = 0
const T = (name, ok) => { if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', name) }

rmSync(WORK, { recursive: true, force: true }); mkdirSync(WORK, { recursive: true })
cpSync(join(ROOT, 'src'), join(WORK, 'src'), { recursive: true }); cpSync(join(ROOT, 'api'), join(WORK, 'api'), { recursive: true })
writeFileSync(join(WORK, 'entry.jsx'), "export { default } from './src/pnl/PnLPage.jsx';\n")
const out = join(WORK, 'bundle.mjs')
await build({
  entryPoints: [join(WORK, 'entry.jsx')], outfile: out, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', target: 'node22', logLevel: 'error',
  nodePaths: [join(ROOT, 'node_modules')], external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  loader: { '.css': 'empty', '.png': 'dataurl', '.svg': 'dataurl', '.jpg': 'dataurl', '.woff2': 'empty', '.woff': 'empty' },
  define: { 'import.meta.env': JSON.stringify({ VITE_API_URL: '', VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'x', DEV: false, PROD: true, MODE: 'production', BASE_URL: '/' }) },
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
})
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
console.warn = () => {}

globalThis.__COGS_RETRY_MS = 0
const cogsMod = await import('../api/cogs-monthly.js')
let mode = 'real', calls = 0, failFirst = 0
const ok = obj => ({ ok: true, status: 200, json: async () => obj })
const callHandler = body => new Promise((resolve, reject) => {
  const res = { _s: 200, setHeader() { return this }, status(c) { this._s = c; return this }, json(p) { this._s >= 400 ? reject(new Error(JSON.stringify(p))) : resolve(p) }, end() { resolve(null) } }
  Promise.resolve(cogsMod.default({ method: 'POST', body, headers: {}, query: {} }, res)).catch(reject)
})
globalThis.fetch = async (url, opts) => {
  if (typeof url === 'string' && url.startsWith('/api/cogs-monthly')) {
    calls++
    if (mode === 'fail500' || (mode === 'failOnce' && calls <= failFirst)) return { ok: false, status: 500, json: async () => ({ error: 'boom' }) }
    if (mode === 'empty') return ok({ rows: [] })
    return ok(await callHandler(JSON.parse(opts?.body || '{}')))
  }
  if (typeof url === 'string' && url.startsWith('/snd-rates.json')) return ok(JSON.parse(readFileSync(join(ROOT, 'public', 'snd-rates.json'), 'utf8')))
  return { ok: false, status: 404, json: async () => ({}) }
}
w.fetch = globalThis.fetch

const data = JSON.parse(readFileSync(join(ROOT, 'public', 'pnl-data.json'), 'utf8'))
const start = data.mtdStart, end = data.mtdEnd
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function run(m, opts = {}) {
  mode = m; calls = 0; failFirst = opts.failFirst || 0
  cogsMod._resetCogsCache()
  const fresh = await import(pathToFileURL(out).href + '?' + Math.random()) // the COGS cache lives in the module
  const mount = document.createElement('div'); document.body.appendChild(mount)
  const root = createRoot(mount)
  let summary = null
  root.render(React.createElement(fresh.default, {
    data, filters: { start, end }, setFilters() {}, activeTab: 'shopify', setActiveTab() {},
    amzChannelView: 'all', setAmzChannelView() {}, offlineSub: 'all', setOfflineSub() {}, d2cSubCh: 'all', setD2cSubCh() {},
    summaryOnly: true, withMargins: true, onSummary: v => { summary = v },
  }))
  const t0 = Date.now()
  while (Date.now() - t0 < 90000 && !summary) await sleep(150)
  await sleep(300)
  root.unmount(); mount.remove()
  return { summary, calls }
}

const f500 = await run('fail500')
T('request failing twice: retried once (2 calls), page still renders from the estimate', f500.calls === 2 && !!f500.summary)
const empty = await run('empty')
T('empty rows are treated as a failure: retried once', empty.calls === 2 && !!empty.summary && empty.summary.cogs === f500.summary.cogs)
if (process.env.SUPABASE_URL) {
  const once = await run('failOnce', { failFirst: 1 })
  const real = await run('real')
  T('first call fails, the retry succeeds: real COGS used', once.calls === 2 && once.summary.cogs === real.summary.cogs)
  T('normal: one request', real.calls === 1)
  T('fallback numbers are the old ones (estimate above real COGS, net revenue identical)', f500.summary.cogs > real.summary.cogs && f500.summary.net === real.summary.net)
  const cr = real.summary.cogs / 1e7
  console.log(`D2C ${start} to ${end}: COGS real Rs ${cr.toFixed(3)} Cr, fallback estimate Rs ${(f500.summary.cogs / 1e7).toFixed(3)} Cr`)
  if (start === '2026-11-01' && end === '2026-11-27') T('D2C 1-27 Nov COGS Rs 7.52 Cr unchanged', Math.abs(cr - 7.519) < 0.006)
} else console.log('SKIP numbers: no SUPABASE_URL')
rmSync(WORK, { recursive: true, force: true })
console.log(fail ? `${fail} FAILED` : 'ALL PASS')
process.exit(fail ? 1 : 0)
