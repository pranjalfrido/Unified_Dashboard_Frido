// HEADER_MOBILE_PROMPT.md §0 and §6: on Overview with nothing filtered there is no "Filtered:" strip and
// no filter count; after setting a Category filter (Sales → filter icon) Overview shows the strip and
// count, and Clear removes both. Notifications: "Notifications (n)" is the first ⋯ item and n equals the
// laptop bell's count (same combinedAlerts list); tapping it opens the list. Logged in through the login
// page as a temporary test user (state file { email, password }, made by an uncommitted setup step).
// Usage: RESPONSIVE_ENGINE=webkit|chromium node scripts/responsive/check-header-filters.mjs <stateFile> [viewport]
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { chromium, webkit } from 'playwright'
import { repoRoot, BASE_URL, VIEWPORTS, ENGINE } from './lib.mjs'

const [stateFile, vpName = 'iphoneSE-375x667'] = process.argv.slice(2)
const user = JSON.parse(readFileSync(stateFile, 'utf8'))
const vp = VIEWPORTS.find(v => v.name === vpName)
const pause = ms => new Promise(r => setTimeout(r, ms))
const results = []
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`) }
const shotDir = resolve(repoRoot, 'docs/responsive/after/header')
mkdirSync(shotDir, { recursive: true })

const browser = await (ENGINE === 'webkit' ? webkit : chromium).launch()
const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
const page = await ctx.newPage()
await page.goto(BASE_URL + '/login', { waitUntil: 'load' })
await page.locator('#email').fill(user.email); await page.locator('#password').fill(user.password)
await page.locator('.btn-signin').click()
await page.locator('.page-scroll').first().waitFor({ timeout: 180000 }); await pause(4000)
const go = async path => { await page.evaluate(p => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')) }, path); await pause(2500); await settle() }
const settle = () => page.waitForFunction(() => !document.querySelector('.load-veil, .delta-shimmer'), null, { timeout: 240000 }).catch(() => {})
const strip = () => page.locator('.mph .filtered-strip').count()
const count = () => page.locator('.mph .mph-count').count()

await go('/overview')
ok('Overview, nothing filtered: no "Filtered:" strip', !(await strip()))
ok('Overview, nothing filtered: no filter count', !(await count()))
ok('Overview: no "Sub-channel: ShopifyIndia" anywhere', !/ShopifyIndia/.test(await page.locator('.topnav').innerText()))
// the default D2C sub-channel (set by the D2C Overall sub-tab) is still not a filter
await go('/sales/shopify/overall'); await pause(2000)
await go('/overview')
ok('after D2C Overall: Overview still shows no strip / count', !(await strip()) && !(await count()))

// set a Category filter on Sales
await go('/sales/all'); await pause(2000)
await page.locator('.mph [data-ctl=filter]').first().click(); await pause(800)
await page.locator('.bottom-sheet button').filter({ hasText: /^Category/ }).first().click(); await pause(800)
await page.locator('.bottom-sheet label').first().click(); await pause(300)
await page.locator('.bottom-sheet button').filter({ hasText: /^Apply/ }).first().click(); await pause(600)
await page.keyboard.press('Escape'); await pause(4000); await settle()
ok('Sales with a Category filter: strip + count', (await strip()) > 0 && (await count()) > 0)
await go('/overview'); await pause(2000)
const n = await count() ? await page.locator('.mph .mph-count').innerText() : ''
ok('Overview with a Category filter: strip + count', (await strip()) > 0 && n === '1', `count ${n}`)
await page.screenshot({ path: resolve(shotDir, `${ENGINE}-${vp.name}__overview-filtered.png`), clip: { x: 0, y: 0, width: vp.width, height: 150 } })
await page.locator('.mph .filtered-strip button').filter({ hasText: /^Clear$/ }).click(); await pause(4000); await settle()
ok('Clear removes strip and count', !(await strip()) && !(await count()))

// notifications in ⋯
const bellCount = await page.evaluate(() => document.querySelector('.alerts-badge')?.textContent ?? null)
await page.locator('.mph [data-ctl=more]').click(); await page.locator('.bottom-sheet').waitFor(); await pause(500)
const first = (await page.locator('.bottom-sheet button').filter({ hasText: /^Notifications \(/ }).first().innerText()).trim()
const dot = await page.locator('.mph .mph-dot').count()
const m = first.match(/Notifications \((\d+)\)/)
ok('⋯: "Notifications (n)" is the first item', !!m, first)
ok('red dot on ⋯ only when n > 0', (+m?.[1] > 0) === (dot > 0), `n=${m?.[1]} dot=${dot}`)
ok('no separate bell in the phone header', !(await page.locator('.mph .alerts-bell-btn').count()) && bellCount === null)
await page.screenshot({ path: resolve(shotDir, `${ENGINE}-${vp.name}__menu-notifications.png`) })
await page.locator('.bottom-sheet button').filter({ hasText: /^Notifications \(/ }).first().click(); await pause(1200)
const sheet = await page.locator('.bottom-sheet').last().innerText().catch(() => '')
ok('Notifications opens the alerts list', new RegExp(`Notifications \\(${m?.[1]}\\)`).test(sheet), sheet.split('\n').slice(0, 2).join(' / '))
await page.screenshot({ path: resolve(shotDir, `${ENGINE}-${vp.name}__notifications.png`) })
// same count as the laptop bell (same session, laptop width)
const lap = await browser.newContext({ storageState: await ctx.storageState(), viewport: { width: 1440, height: 900 } })
const lp = await lap.newPage()
await lp.goto(BASE_URL + '/overview', { waitUntil: 'load' }); await lp.locator('.alerts-badge, .alerts-bell-btn').first().waitFor({ timeout: 180000 }); await pause(8000)
// alerts fill in as Logistics / Inventory data arrive: give the laptop up to 3 minutes to reach its final count
let lapCount = '0'
for (let i = 0; i < 36; i++) { lapCount = await lp.evaluate(() => document.querySelector('.alerts-badge')?.textContent ?? '0'); if (lapCount === m?.[1]) break; await pause(5000) }
ok('same count as the laptop bell', lapCount === m?.[1], `laptop ${lapCount} · phone ${m?.[1]}`)
await browser.close()
writeFileSync(resolve(shotDir, `filters-${ENGINE}-${vp.name}.json`), JSON.stringify(results, null, 2))
console.log(`${results.filter(r => r.pass).length}/${results.length} pass`)
