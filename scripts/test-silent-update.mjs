// Browser test for src/silentUpdate.js (real Chromium, phone 375 + laptop 1280). No login or network needed:
// a tiny local server plays "the deployment" - GET / answers with an index.html whose entry script name changes when
// the test flips to a "new deploy" - and a harness page loads the real silentUpdate.js.
//   node scripts/test-silent-update.mjs
import http from 'http'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import { chromium } from 'playwright'

const SRC = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'silentUpdate.js'), 'utf8')
let deploy = 1 // the "live" build; the page under test loads build 1
const html = () => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
<div id="root"><nav><button id="go-a">Sales</button> <button id="go-b">Inventory</button></nav>
<textarea id="navai" placeholder="Ask NavAI"></textarea><div id="page">page</div></div>
<script type="module" src="/assets/index-BUILD${deploy}.js"></script>
<script type="module" src="/harness.js"></script></body></html>`
const HARNESS = `
import * as S from '/silentUpdate.js'
window.S = S
const n = Number(sessionStorage.getItem('loads') || 0) + 1; sessionStorage.setItem('loads', n); window.__loads = n
S.registerSnapshot(() => ({ filters: { start: '2026-10-01', end: '2026-10-31', category: ['Mobility'] } }))
window.__snap = S.takeSnapshot()
S.startSilentUpdates({ prod: true })
const go = to => { history.pushState({}, '', to); S.onPageSwitch(to) }
document.getElementById('go-a').onclick = () => go('/sales/all')
document.getElementById('go-b').onclick = () => go('/inventory/inventory_health')
`
const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0]
  if (u === '/silentUpdate.js') { res.setHeader('content-type', 'text/javascript'); return res.end(SRC) }
  if (u === '/harness.js') { res.setHeader('content-type', 'text/javascript'); return res.end(HARNESS) }
  if (u.startsWith('/assets/')) { res.setHeader('content-type', 'text/javascript'); return res.end('') }
  if (u === '/__deploy') { deploy += 1; return res.end(String(deploy)) }
  if (u === '/missing-chunk.js') { res.statusCode = 404; return res.end('nope') }
  res.setHeader('content-type', 'text/html'); res.setHeader('cache-control', 'no-store'); res.end(html())   // any path -> the app shell
}).listen(0)
await new Promise(r => server.once('listening', r))
const BASE = `http://127.0.0.1:${server.address().port}`

let pass = 0, fail = 0
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`) }
const browser = await chromium.launch()

for (const [label, vp] of [['phone 375', { width: 375, height: 812 }], ['laptop 1280', { width: 1280, height: 800 }]]) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: label.startsWith('phone') })
  const page = await ctx.newPage()
  const T = n => `[${label}] ${n}`
  const reset = async () => { deploy = 1; await page.goto(BASE + '/overview'); await page.evaluate(() => sessionStorage.clear()); await page.goto(BASE + '/overview'); await page.waitForFunction(() => window.S) }
  const newDeploy = async () => { await page.evaluate(b => fetch(b + '/__deploy'), BASE); await page.evaluate(() => window.S.checkForUpdate(true)) }
  const loads = () => page.evaluate(() => window.__loads)
  const waitLoads = n => page.waitForFunction(x => window.__loads >= x, n, { timeout: 4000 }).then(() => true, () => false)

  // 1. no popup, and nothing reloads by itself when a new deploy appears
  await reset()
  await newDeploy()
  check(T('update detected'), await page.evaluate(() => window.S.hasUpdate()) === true)
  await page.waitForTimeout(800)
  check(T('no popup text on screen'), !(await page.locator('text=/new version|refresh to get/i').count()))
  check(T('no reload by itself'), (await loads()) === 1)

  // 2. update applies on page switch, lands on the page that was clicked, filters kept
  await page.click('#go-a')
  check(T('page switch applies the update'), await waitLoads(2))
  check(T('lands on the clicked page'), new URL(page.url()).pathname === '/sales/all', page.url())
  check(T('new build is the one running'), await page.evaluate(() => document.documentElement.innerHTML.includes('index-BUILD2.js')))
  check(T('filters kept across the reload'), await page.evaluate(() => window.__snap?.filters?.category?.[0] === 'Mobility' && window.__snap.filters.start === '2026-10-01'))

  // 3. never while typing / answer loading / upload
  await reset(); await newDeploy()
  await page.focus('#navai'); await page.keyboard.type('what is the net revenue')
  await page.click('#go-a')   // clicking a button takes focus off the box; the typed draft still protects it
  await page.waitForTimeout(700)
  check(T('no reload with text typed in the NavAI box'), (await loads()) === 1)
  await page.evaluate(() => window.S.onBackToScreen(6 * 60 * 1000))
  await page.waitForTimeout(700)
  check(T('no reload on return from background while typing'), (await loads()) === 1)
  await page.fill('#navai', ''); await page.evaluate(() => { document.activeElement?.blur?.(); window.S.setBusy('navai-answer', true) })
  await page.waitForTimeout(16000) // let the "just typed" window (15 s) pass
  await page.click('#go-b'); await page.waitForTimeout(700)
  check(T('no reload while a NavAI answer is loading'), (await loads()) === 1)
  await page.evaluate(() => window.S.setBusy('navai-answer', false))
  await page.evaluate(() => { window.S.setBusy('upload-1', true) }); await page.click('#go-a'); await page.waitForTimeout(500)
  check(T('no reload while an upload runs'), (await loads()) === 1)
  await page.evaluate(() => window.S.setBusy('upload-1', false))
  await page.click('#go-b')
  check(T('applies at the next safe page switch'), await waitLoads(2))

  // 4. back from background: only after 5+ minutes
  await reset(); await newDeploy()
  await page.evaluate(() => window.S.onBackToScreen(2 * 60 * 1000)); await page.waitForTimeout(600)
  check(T('back after 2 min: no reload'), (await loads()) === 1)
  await page.evaluate(() => window.S.onBackToScreen(6 * 60 * 1000))
  check(T('back after 6 min: reloads'), await waitLoads(2))

  // 5. chunk error: reload once, then stop (and never a blank page)
  await reset()
  await page.evaluate(() => { import('/missing-chunk.js') })   // un-caught rejection, like an old page asking for a gone chunk
  check(T('chunk error reloads once'), await waitLoads(2))
  await page.waitForFunction(() => window.S)
  await page.evaluate(() => { import('/missing-chunk.js') }); await page.waitForTimeout(1200)
  check(T('second chunk error does NOT reload again'), (await loads()) === 2)
  check(T('shows a message and the page is not blank'), (await page.locator('[role=alert] button').count()) === 1 && (await page.locator('#page').count()) === 1)
  await ctx.close()
}
await browser.close(); server.close()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
