// Captures the number-integrity baseline for the responsive overhaul (Sept 2026, desktop 1440x900).
//
// For each page it records:
//   - apiCalls: every /api/* POST the page makes. The browser can't reliably read large api/bq
//     bodies (CDP "content evicted" race), so the request body is recorded in the browser and
//     REPLAYED from Node against the same local API; top-level scalars + a sha256 of the full
//     response are stored. Same hash before/after = the data underneath did not change.
//   - staticFiles: asOf + sha256 of any public/*.json the page loaded.
//   - rendered: every number token visible on the page, in order (what the user actually sees).
//
// Usage: node scripts/responsive/capture-baseline.mjs [out.json] [--pages overview,sales-all]
import { writeFileSync, readFileSync } from 'fs'
import { createHash } from 'crypto'
import { resolve } from 'path'
import { execSync } from 'child_process'
import { launch, openPage, openWithSept, waitStableText, canonicalJSON, numericSummary, numberTokens, repoRoot, SEPT, VIEWPORTS } from './lib.mjs'

const API = 'http://localhost:3001'
const PAGES = {
  overview: '/overview',
  'sales-all': '/sales/all',
  'pnl-all': '/pnl/all',
  'pnl-shopify': '/pnl/shopify',
  'inventory-health': '/inventory/inventory_health',
  'logistics-performance': '/logistics/performance_analytics',
}
const NO_DATE_PICKER = new Set(['inventory-health'])

const args = process.argv.slice(2)
const out = resolve(repoRoot, args.find(a => a.endsWith('.json')) || 'docs/responsive/baseline-numbers.json')
const pagesArg = args.indexOf('--pages')
const pageNames = pagesArg !== -1 ? args[pagesArg + 1].split(',') : Object.keys(PAGES)

const sha = s => createHash('sha256').update(s).digest('hex').slice(0, 16)
const scalars = o => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v === null || typeof v !== 'object'))

const result = {
  generatedAt: new Date().toISOString(),
  gitCommit: execSync('git rev-parse --short HEAD', { cwd: repoRoot }).toString().trim(),
  dateRange: SEPT,
  viewport: '1440x900',
  methodology: 'Request bodies recorded in the browser, replayed from Node against the local API (:3001); top-level scalars + sha256 of the full response (canonical: sorted keys and rows) stored. Static public/*.json: asOf + sha256. rendered: number tokens from the page body text once it stops changing, in order.',
  pages: {},
}

const { browser, ctx } = await launch(VIEWPORTS[1])
for (const name of pageNames) {
  const page = await ctx.newPage()
  const posts = []
  const statics = new Set()
  page.on('request', req => {
    const u = new URL(req.url())
    if (req.method() === 'POST' && u.pathname.startsWith('/api/')) posts.push({ path: u.pathname, body: req.postData() || '' })
  })
  page.on('response', res => {
    const u = new URL(res.url())
    if (res.status() === 200 && /^\/[\w-]+\.json$/.test(u.pathname)) statics.add(u.pathname)
  })
  console.log(`[${name}] opening ${PAGES[name]}`)
  // Inventory Health has no global date picker (rolling window from its own static cache).
  if (NO_DATE_PICKER.has(name)) await openPage(page, PAGES[name])
  else await openWithSept(page, PAGES[name])
  const text = await waitStableText(page)

  // Only the calls made for the Sept range (the page's default-range calls before the picker change are dropped).
  const septCalls = posts.filter(p => p.body.includes(SEPT.start) || !/"start"/.test(p.body))
  const seen = new Set()
  const apiCalls = []
  for (const c of septCalls) {
    const key = c.path + c.body
    if (seen.has(key)) continue
    seen.add(key)
    const r = await fetch(API + c.path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: c.body })
    const raw = await r.text()
    let json = null
    try { json = JSON.parse(raw) } catch {}
    apiCalls.push({ path: c.path, requestBody: c.body ? JSON.parse(c.body) : null, status: r.status, sha256: sha(json ? canonicalJSON(json) : raw), numeric: numericSummary(json), scalars: scalars(json) })
    console.log(`  ${c.path} ${r.status} sha=${apiCalls.at(-1).sha256}`)
  }
  const staticFiles = [...statics].map(p => {
    const raw = readFileSync(resolve(repoRoot, 'public' + p), 'utf8')
    let asOf = null
    try { asOf = JSON.parse(raw).asOf ?? null } catch {}
    return { path: p, asOf, sha256: sha(raw) }
  })
  result.pages[name] = { path: PAGES[name], apiCalls, staticFiles, rendered: numberTokens(text) }
  console.log(`  rendered number tokens: ${result.pages[name].rendered.length}; static files: ${staticFiles.map(s => s.path).join(', ') || 'none'}`)
  await page.close()
}
await browser.close()
writeFileSync(out, JSON.stringify(result, null, 2))
console.log(`wrote ${out}`)
