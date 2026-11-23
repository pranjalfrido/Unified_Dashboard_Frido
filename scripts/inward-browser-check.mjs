// Browser check for Inventory → Inward (local only, no credentials).
//   1. npm i (Playwright browsers installed)
//   2. VITE_FEEDBACK_LOCAL=1 VITE_SUPABASE_URL=https://placeholder.invalid VITE_SUPABASE_ANON_KEY=x \
//        npx vite --port 5199 --strictPort --host 127.0.0.1 [--config <copy of vite.config.js without
//        server.proxy>]  — without an API server on :3001 the /api proxy also swallows the frontend's
//        own module imports from /api/_pnlAgg.js / _resolvedAgg.js and the app never boots.
//   3. node scripts/inward-browser-check.mjs [outDir]
// Runs Chromium + WebKit at 375, 1280 and 1536 wide as the local test admin (and the local test member
// "Asha", who has no inventory:inward). /api/inward is answered in-browser-test by the REAL aggregation
// code (api/_inward_core.js buildInwardPayload) over synthetic GRN/sales rows built on the SKUs of the
// real Inventory Health snapshot in public/inv-data-7d.json, which is also served (asOf bumped so the
// page accepts it) — so the stock/DOI join runs on real Health numbers. Writes screenshots + report.json.
import { chromium, webkit, devices } from 'playwright'
import { readFileSync, mkdirSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildInwardPayload, buildSkuDetail, periods, normaliseFilters, addDays } from '../api/_inward_core.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.INWARD_BASE_URL || 'http://127.0.0.1:5199'
const outDir = resolve(root, process.argv[2] || 'docs/inward/screens')
mkdirSync(outDir, { recursive: true })

// ── Mock data ────────────────────────────────────────────────────────────────────────────
const inv = JSON.parse(readFileSync(resolve(root, 'public/inv-data-7d.json'), 'utf8'))
const invBody = JSON.stringify({ ...inv, asOf: new Date().toISOString() })
const skus = inv.skus.filter(s => s.avgSale > 0).sort((a, b) => b.avgSale - a.avgSale).slice(0, 260)
const FAC = { PNQ: 'Vadgaon_OPS', GGN: 'Hexalog_GGN2', BLR: 'myfrido-BLR_Hexalog', MUM: 'Beyond_Mum', KOL: 'Aaj_Kol_Item', HYD: 'Losung_Hyderabad', CHN: 'Losung_Chennai' }
const VENDORS = [['Shree Ganesh Polymers', 'Domestic'], ['Apex Foam Industries', 'Domestic'], ['Ningbo Comfort Co', 'Import'], ['Shenzhen Ortho Ltd', 'Import'],
  ['Frido Vadgaon Plant', 'Inhouse'], ['Frido Stitching Unit', 'Inhouse'], ['Stock transfer PNQ', 'Internal'], ['Stock transfer GGN', 'Internal'], ['Kaveri Textiles', 'Domestic'], ['Old Vendor Pvt Ltd', 'Unmapped']]
let seed = 7
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
const grnAll = [], salesAll = []
const START = '2026-08-01', END = '2026-11-08'
for (let d = START; d <= END; d = addDays(d, 1)) {
  const nGrn = 3 + Math.floor(rnd() * 5)
  for (let g = 0; g < nGrn; g++) {
    const [v, t] = VENDORS[Math.floor(rnd() * VENDORS.length)]
    const loc = rnd() < 0.55 ? 'PNQ' : rnd() < 0.6 ? 'GGN' : Object.keys(FAC)[Math.floor(rnd() * 7)]
    const code = `GRN-${d.replace(/-/g, '')}-${g}`
    const lines = 1 + Math.floor(rnd() * 6)
    for (let l = 0; l < lines; l++) {
      const s = skus[Math.floor(rnd() * skus.length)]
      grnAll.push({ d, g: code, f: FAC[loc], v, t, s: s.sku, c: s.category, sc: s.subCategory, n: s.subCategory, q: Math.round(s.avgSale * (2 + rnd() * 10)), r: rnd() < 0.15 ? Math.round(rnd() * 20) : 0, lt: t === 'Internal' ? 2 : Math.round(5 + rnd() * (t === 'Import' ? 60 : 20)) })
    }
  }
  for (const s of skus) for (const l of s.locations || []) if (l.avgSale > 0 && FAC[l.location]) salesAll.push({ d, k: s.sku, f: FAC[l.location], q: Math.round(l.avgSale * (0.6 + rnd() * 0.8)) })
}
const masterRows = skus.map(s => ({ code: s.sku, category: s.category, sub_category: s.subCategory, name: s.subCategory, type: null }))
const cogsRows = []
for (const s of skus) for (const m of ['2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01']) cogsRows.push({ sku: s.sku, month: m, cogs: 150 + (s.sku.length * 37) % 900, subCategory: s.subCategory })
const dqRows = [
  { kind: 'sku', a: 'RM-C-0042_RAW_PO50', b: 'RM-C-0042', c: 'No usable row in productid_sku_mapping', lines: 14, units: 7000, last_date: '2026-11-06' },
  { kind: 'sku', a: 'RM-CHE-0007', b: 'RM-CHE-0007', c: 'No usable row in productid_sku_mapping', lines: 3, units: 900, last_date: '2026-11-03' },
  { kind: 'vendor', a: 'Old Vendor Pvt Ltd', lines: 6, units: 2100, last_date: '2026-11-05' },
  { kind: 'qty', a: 'GRN-20261104-1', b: 'FR-OPC-L1', c: '0', lines: 1, units: 0, last_date: '2026-11-04' },
]
function inwardResponse(body, isAdmin) {
  if (body.mode === 'sku') {
    const today = '2026-11-08'
    return buildSkuDetail({ grnRows: grnAll.filter(r => r.s === body.sku && r.d >= body.start), salesRows: salesAll.filter(r => r.k === body.sku && r.d >= body.start), start: body.start, end: today })
  }
  const range = periods(body.start, body.end)
  const inRange = r => r.d >= range.prevStart && r.d <= range.end
  return buildInwardPayload({ grnRows: grnAll.filter(inRange), salesRows: salesAll.filter(inRange), masterRows, skuMapRows: [], cogsRows, dqRows, range, filters: normaliseFilters(body), isAdmin })
}

// ── Page checks (run in the browser) ─────────────────────────────────────────────────────
function pageChecks(isPhone) {
  const root = document.querySelector('.inward-page')
  const vw = window.innerWidth
  const docOverflow = document.documentElement.scrollWidth > vw + 1
  const scrollers = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll') return true } return false }
  const clipped = []
  const small = []
  const smallTargets = []
  const scope = [root, document.querySelector('.m-header')].filter(Boolean)
  for (const s of scope) for (const el of s.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue
    if (r.right > vw + 1 && !scrollers(el)) clipped.push(`${el.tagName} "${(el.innerText || '').slice(0, 30)}" right=${Math.round(r.right)}`)
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())
    const svgText = el.tagName === 'text' || el.tagName === 'tspan'
    if ((hasText || svgText) && parseFloat(cs.fontSize) < 12) small.push(`${el.tagName} ${cs.fontSize} "${el.textContent.trim().slice(0, 30)}"`)
    if (isPhone && (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') && s === root && r.height < 44 && r.top < document.documentElement.scrollHeight) smallTargets.push(`${el.tagName} h=${Math.round(r.height)} "${(el.innerText || el.getAttribute('aria-label') || '').slice(0, 30)}"`)
  }
  return { docOverflow, clipped: clipped.slice(0, 8), clippedCount: clipped.length, smallText: [...new Set(small)].slice(0, 12), smallTextCount: small.length, smallTargets: smallTargets.slice(0, 12), smallTargetCount: smallTargets.length }
}

// The scrolling area: the Inward page's own container, else the app's .page-scroll.
const SCROLLER = `(() => { for (const s of ['.inward-page', '.page-scroll']) { const el = document.querySelector(s); if (el && el.scrollHeight > el.clientHeight + 4) return el } return null })()`
async function stitched(page, path) {
  const hasScroller = await page.evaluate(`!!${SCROLLER}`)
  if (!hasScroller) return page.screenshot({ path, fullPage: true })
  const box = await page.evaluate(`(() => { const el = ${SCROLLER}; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: el.clientHeight, total: el.scrollHeight, vw: innerWidth, bg: getComputedStyle(document.body).backgroundColor } })()`)
  const tiles = []
  for (let y = 0; ; y += box.height) {
    const at = await page.evaluate(`(() => { const el = ${SCROLLER}; el.scrollTop = ${y}; return el.scrollTop })()`)
    await page.waitForTimeout(250)
    tiles.push({ at, png: (await page.screenshot()).toString('base64') })
    if (at + box.height >= box.total || at < y) break
  }
  await page.evaluate(`(() => { const el = ${SCROLLER}; el.scrollTop = 0 })()`)
  const composer = await page.context().newPage()
  const dataUrl = await composer.evaluate(async ({ box, tiles }) => {
    const c = document.createElement('canvas'); c.width = box.vw; c.height = Math.ceil(box.top + box.total)
    const g = c.getContext('2d'); g.fillStyle = box.bg; g.fillRect(0, 0, c.width, c.height)
    const load = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + src })
    for (let i = 0; i < tiles.length; i++) { const img = await load(tiles[i].png); if (i === 0) g.drawImage(img, 0, 0); else g.drawImage(img, box.left, box.top, box.width, box.height, box.left, box.top + tiles[i].at, box.width, box.height) }
    return c.toDataURL('image/png')
  }, { box, tiles })
  await composer.close()
  writeFileSync(path, Buffer.from(dataUrl.split(',')[1], 'base64'))
}

const VIEWPORTS = [
  { name: 'phone-375', width: 375, height: 667, mobile: true, device: 'iPhone SE' },
  { name: 'laptop-1280', width: 1280, height: 800 },
  { name: 'desktop-1536', width: 1536, height: 864 },
]

async function context(engine, vp, who) {
  const browser = await (engine === 'webkit' ? webkit : chromium).launch()
  const profile = engine === 'webkit' && vp.device ? devices[vp.device] : {}
  const ctx = await browser.newContext({ ...profile, viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile, deviceScaleFactor: 1 })
  const isAdmin = who === 'admin'
  const timings = []
  await ctx.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.hostname.endsWith('placeholder.invalid')) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
    if (url.pathname === '/inv-data-7d.json') return route.fulfill({ status: 200, contentType: 'application/json', body: invBody })
    if (url.pathname === '/api/inward') {
      const t0 = Date.now()
      const body = JSON.parse(route.request().postData() || '{}')
      if (who !== 'admin') return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: "You don't have access to Inventory → Inward." }) })
      const json = inwardResponse(body, isAdmin)
      timings.push({ mode: body.mode || 'page', ms: Date.now() - t0, bytes: JSON.stringify(json).length })
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) })
    }
    if ((url.pathname.startsWith('/api/') && !url.pathname.endsWith('.js')) || (url.pathname.endsWith('.json') && url.origin === BASE && !url.pathname.startsWith('/src/') && !url.pathname.startsWith('/node_modules/'))) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' })
    return route.continue()
  })
  return { browser, ctx, timings }
}

const report = { at: new Date().toISOString(), base: BASE, runs: [], parity: null, permission: null }
for (const engine of ['chromium', 'webkit']) {
  for (const vp of VIEWPORTS) {
    const { browser, ctx, timings } = await context(engine, vp, 'admin')
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    const t0 = Date.now()
    await page.goto(`${BASE}/inventory/inward?as=admin`, { waitUntil: 'domcontentloaded' })
    await page.getByText('Vendor performance').first().waitFor({ timeout: 60000 })
    const kpiMs = Date.now() - t0
    await page.waitForFunction(() => {
      const sec = [...document.querySelectorAll('.inward-page section')].find(s => s.innerText.startsWith('SKU detail'))
      if (!sec) return false
      const idx = [...sec.querySelectorAll('thead th')].findIndex(th => th.innerText.startsWith('Current stock'))
      return idx >= 0 && /\d/.test(sec.querySelector(`tbody tr td:nth-child(${idx + 1})`)?.innerText || '')
    }, null, { timeout: 60000 })
    const loadMs = Date.now() - t0
    await page.waitForTimeout(1200)
    const isPhone = vp.width <= 768
    const checks = await page.evaluate(pageChecks, isPhone)
    const tag = `${engine}-${vp.name}`
    await stitched(page, resolve(outDir, `${tag}.png`))
    const run = { engine, viewport: vp.name, kpiMs, loadMs, checks, errors, timings: [] }
    // Interactions
    if (isPhone) {
      await page.locator('[data-ctl="filter"]').first().click()
      await page.getByText('Inward filters').first().waitFor()
      await page.screenshot({ path: resolve(outDir, `${tag}-filters.png`) })
      await page.getByRole('button', { name: 'Done' }).click()
      await page.getByRole('button', { name: /View full table/ }).last().click()
      await page.waitForTimeout(600)
      await page.screenshot({ path: resolve(outDir, `${tag}-fulltable.png`) })
      await page.goBack(); await page.waitForTimeout(600)
    }
    // Source mix click filters the page (chip appears, units change)
    const before = await page.locator('.inward-page').innerText()
    await page.locator('.inward-page button[aria-pressed]').filter({ hasText: 'Import' }).first().click()
    await page.getByText('Source: Import').first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(800)
    run.sourceFilterChangedNumbers = before !== await page.locator('.inward-page').innerText()
    await page.getByRole('button', { name: 'Remove Source: Import' }).click()
    await page.waitForTimeout(800)
    // SKU drill-down
    const skuCard = page.locator('section').filter({ hasText: 'SKU detail' }).last()
    await skuCard.locator('tbody tr').first().click()
    await page.getByText('Estimated stock and inward').first().waitFor({ timeout: 20000 })
    await page.waitForTimeout(800)
    await page.screenshot({ path: resolve(outDir, `${tag}-drilldown.png`) })
    run.drilldownOk = true
    run.timings = timings
    report.runs.push(run)
    console.log(`${tag}: KPIs ${kpiMs} ms · with stock ${loadMs} ms · overflow ${checks.docOverflow} · clipped ${checks.clippedCount} · text<12px ${checks.smallTextCount} · targets<44 ${checks.smallTargetCount} · errors ${errors.length}`)
    if (checks.smallText.length) console.log('   small text:', checks.smallText.join(' | '))
    if (checks.smallTargets.length) console.log('   small targets:', checks.smallTargets.join(' | '))
    if (checks.clipped.length) console.log('   clipped:', checks.clipped.join(' | '))
    if (errors.length) console.log('   page errors:', errors.slice(0, 3).join(' | '))
    await browser.close()
  }
}

// ── Stock / DOI parity with the Inventory Health page (same feed, rendered side by side) ──
{
  const { browser, ctx } = await context('chromium', { width: 1536, height: 864 }, 'admin')
  const page = await ctx.newPage()
  await page.goto(`${BASE}/inventory/inward?as=admin`, { waitUntil: 'domcontentloaded' })
  await page.getByText('Current stock').first().waitFor({ timeout: 60000 })
  await page.waitForTimeout(1000)
  const skuCard = page.locator('section').filter({ hasText: 'SKU detail' }).last()
  const rows = await skuCard.locator('tbody tr').evaluateAll(trs => trs.slice(0, 3).map(tr => [...tr.children].map(td => td.innerText.trim())))
  const inward = rows.map(c => ({ sku: c[0], stock: c[5], avgSale: c[6], doi: c[7].replace(/\s/g, '') }))
  await page.screenshot({ path: resolve(outDir, 'chromium-desktop-1536-inward-side.png') })
  // Health page itself: type each SKU in its Inventory Detail search and read that row
  // (columns: category, sub-category, product id, RTD, RAW, RAW blocked, TOTAL INVT, AVG SALE, DOI, …).
  const healthPage = await ctx.newPage()
  await healthPage.goto(`${BASE}/inventory/health?as=admin`, { waitUntil: 'domcontentloaded' })
  await healthPage.getByText('Inventory Detail').first().waitFor({ timeout: 60000 })
  await healthPage.waitForTimeout(1500)
  const health = []
  for (const r of inward) {
    const search = healthPage.getByPlaceholder(/^Search(\.\.\.|…)$/).first() // Inventory Detail's search box
    await search.fill(r.sku)
    await healthPage.waitForTimeout(900)
    // Inventory Detail row: category · sub-category · › product id · RTD · RAW · RAW BLOCKED · TOTAL INVT · AVG SALE (B2C) · DOI · …
    const row = await healthPage.locator('tbody tr').evaluateAll((trs, sku) => {
      for (const tr of trs) {
        const cells = [...tr.children].map(td => td.innerText.trim())
        const pid = cells.findIndex(c => /^[›>]/.test(c) && c.replace(/^[›>\s]+/, '') === sku)
        if (pid >= 0 && cells.length >= pid + 7) return { stock: cells[pid + 4], avgSale: cells[pid + 5], doi: cells[pid + 6] }
      }
      return {}
    }, r.sku)
    health.push({ sku: r.sku, stock: row.stock, avgSale: row.avgSale, doi: (row.doi || '').replace(/\s/g, '') })
    await healthPage.screenshot({ path: resolve(outDir, `chromium-desktop-1536-health-${r.sku}.png`) })
  }
  report.parity = { inward, healthPage: health, match: inward.every((r, i) => r.stock === health[i].stock && r.avgSale === health[i].avgSale && r.doi === health[i].doi) }
  console.log('parity (Inward SKU table vs Inventory Health page):', JSON.stringify(report.parity))
  await browser.close()
}

// ── Permission UI: local test member "Asha" has no inventory:inward ──────────────────────
{
  const out = {}
  for (const [vpName, vp] of [['phone-375', VIEWPORTS[0]], ['laptop-1280', VIEWPORTS[1]]]) {
    const { browser, ctx } = await context('chromium', vp, 'asha')
    const page = await ctx.newPage()
    await page.goto(`${BASE}/inventory/health?as=asha`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(6000)
    const healthText = await page.locator('body').innerText()
    await page.goto(`${BASE}/inventory/inward`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    const inwardText = await page.locator('body').innerText()
    await page.screenshot({ path: resolve(outDir, `permission-asha-${vpName}.png`) })
    out[vpName] = { inwardTabVisibleOnHealth: /\bInward\b/.test(healthText), directUrlShowsNoAccess: /don't have access to Inventory → Inward/.test(inwardText), inwardDataShown: /Vendor performance/.test(inwardText) }
    await browser.close()
  }
  report.permission = out
  console.log('permission (Asha, no inventory:inward):', JSON.stringify(out))
}

writeFileSync(resolve(outDir, 'report.json'), JSON.stringify(report, null, 2))
console.log(`report → ${resolve(outDir, 'report.json')}`)
