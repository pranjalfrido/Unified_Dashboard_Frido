// NAV_MOBILE_PROMPT.md §4: phone bottom bar + launcher, logged in through the login page as two test
// users from a local state file ({ full: {email,password}, limited: {…} }, made by an uncommitted setup
// step): every dock icon (≥ 44px), launcher rows, search (rto / roas / cogs), Recent, Edit bar (add /
// remove / limit 6 / Done / reload), last slot = current launcher page, bar visible and on top while
// scrolling long pages, no focus box on tap, no overflow; the limited user sees only their pages.
// Usage: RESPONSIVE_ENGINE=webkit|chromium node scripts/responsive/check-nav.mjs <stateFile> [viewport] [shotDir]
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { chromium, webkit } from 'playwright'
import { repoRoot, BASE_URL, VIEWPORTS, ENGINE } from './lib.mjs'

const [stateFile, vpName = 'iphoneSE-375x667', shotArg] = process.argv.slice(2)
const users = JSON.parse(readFileSync(stateFile, 'utf8'))
const vp = VIEWPORTS.find(v => v.name === vpName)
const shotDir = shotArg ? resolve(repoRoot, shotArg) : null
if (shotDir) mkdirSync(shotDir, { recursive: true })
const pause = ms => new Promise(r => setTimeout(r, ms))
const results = []
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`) }
const browser = await (ENGINE === 'webkit' ? webkit : chromium).launch()

async function login(u) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle' })
  await page.locator('#email').fill(u.email); await page.locator('#password').fill(u.password)
  await page.locator('.btn-signin').click()
  await page.locator('.page-scroll').first().waitFor({ timeout: 60000 }); await pause(2500)
  return { ctx, page }
}
const slots = page => page.locator('nav.mnav button.mnav-slot')
const shot = async (page, n) => { if (shotDir) await page.screenshot({ path: resolve(shotDir, `${ENGINE}-${vp.name}__${n}.png`) }) }
const openLauncher = async page => { await slots(page).last().click(); await page.locator('.mnav-sheet').waitFor(); await pause(400) }
const closeSheet = async page => { await page.keyboard.press('Escape'); await pause(400) }

// ── full user
{
  const { ctx, page } = await login(users.full)
  const labels = await slots(page).evaluateAll(bs => bs.map(b => b.getAttribute('aria-label')))
  ok('dock: 7 icons in order', labels.join('|') === 'Overview|Sales|P&L|Inventory|Logistics|Customer|All pages', labels.join(','))
  const widths = await slots(page).evaluateAll(bs => bs.map(b => Math.round(b.getBoundingClientRect().width)))
  ok('dock: every tap target ≥ 44px', widths.every(w => w >= 44), widths.join(','))
  const navBox = await page.locator('nav.mnav').boundingBox()
  ok('bar: full width, flush with the bottom', Math.round(navBox.width) === vp.width && Math.round(navBox.y + navBox.height) === vp.height)
  for (const [i, path] of [[0, '/overview'], [1, '/sales'], [2, '/pnl'], [3, '/inventory'], [4, '/logistics'], [5, '/customer']]) {
    await slots(page).nth(i).click(); await pause(1200)
    await page.waitForFunction(n => document.querySelectorAll('nav.mnav button.mnav-slot')[n]?.getAttribute('aria-current') === 'page', i, { timeout: 6000 }).catch(() => {}); await pause(400)
    const cur = await slots(page).nth(i).getAttribute('aria-current')
    const glow = await slots(page).nth(i).locator('.mnav-glow').evaluate(e => getComputedStyle(e).opacity)
    ok(`dock → ${path}`, new URL(page.url()).pathname.startsWith(path) && cur === 'page' && +glow > 0.9, `${new URL(page.url()).pathname} current=${cur} glow=${glow}`)
    if (i === 0 || i === 1 || i === 2 || i === 3) await shot(page, `dock-${path.slice(1)}`)
  }
  const outline = await slots(page).nth(5).evaluate(b => getComputedStyle(b).outlineStyle)
  ok('no focus box after a tap', outline === 'none', outline)
  // launcher rows: every page reachable
  await openLauncher(page); await shot(page, 'launcher')
  const rows = await page.locator('.mnav-sheet button.mnav-row').evaluateAll(bs => bs.map(b => b.querySelector('span span')?.textContent).filter(Boolean))
  ok('launcher: profile row says "Profile" (non-admin)', (await page.locator('.mnav-sheet button.mnav-row').first().innerText()).split('\n').map(s => s.trim()).includes('Profile'))
  const pageRows = rows.slice(1)
  for (const name of pageRows) {
    await openLauncher(page).catch(() => {})
    await page.locator('.mnav-sheet button.mnav-row').filter({ hasText: name }).first().click(); await pause(2200)
    const last = await slots(page).last().getAttribute('aria-label')
    ok(`launcher → ${name}`, !(await page.locator('.mnav-sheet').count()) && (last.startsWith(name) || ['Logistics', 'Customer'].includes(name)), `${new URL(page.url()).pathname} · last slot "${last}"`)
  }
  await page.goto(BASE_URL + '/ads', { waitUntil: 'networkidle' }); await pause(2500)
  ok('last slot shows the current launcher page (Ads)', (await slots(page).last().getAttribute('aria-label')).startsWith('Ads') && (await slots(page).last().getAttribute('aria-current')) === 'page')
  await shot(page, 'dock-ads')
  // search
  await openLauncher(page)
  for (const [q, want] of [['rto', 'Logistics'], ['roas', 'Ads'], ['cogs', 'COGS Ledger']]) {
    await page.locator('.mnav-sheet input[type=search]').fill(q); await pause(300)
    const found = await page.locator('.mnav-results button.mnav-row').allInnerTexts()
    ok(`search "${q}" → ${want}`, found.some(t => t.startsWith(want)), found.map(t => t.split('\n')[0]).join(', '))
    if (q === 'rto') await shot(page, 'search')
  }
  await page.locator('.mnav-sheet input[type=search]').fill('')
  const recent = await page.locator('.mnav-recent button').allInnerTexts()
  ok('Recent: last 4 visited, newest first', recent.length === 4 && recent[0] === 'Ads', recent.join(', '))
  // edit bar: remove Customer, add Ads, then try to go past 6
  await page.locator('.mnav-sheet .mnav-link').filter({ hasText: 'Edit bar' }).click(); await pause(400); await shot(page, 'edit')
  const tick = name => page.locator('.mnav-sheet button.mnav-row').filter({ hasText: name }).first().click()
  await tick('Customer'); await tick('Ads'); await tick('Documents'); await pause(200)
  const full = await page.locator('.mnav-sheet').innerText()
  ok('edit: limit 6 (Documents refused when full)', /The bar is full \(6\)/.test(full))
  await page.locator('.mnav-sheet button').filter({ hasText: /^Done$/ }).click(); await pause(500); await closeSheet(page)
  let lab = await slots(page).evaluateAll(bs => bs.map(b => b.getAttribute('aria-label')))
  ok('edit: Done saves (Customer out, Ads in)', lab.includes('Ads') && !lab.includes('Customer') && lab.length === 7, lab.join(','))
  await page.reload({ waitUntil: 'networkidle' }); await pause(2500)
  lab = await slots(page).evaluateAll(bs => bs.map(b => b.getAttribute('aria-label')))
  ok('edit: reload keeps the bar', lab.includes('Ads') && !lab.includes('Customer'), lab.join(','))
  // put the default back for the next run
  await openLauncher(page); await page.locator('.mnav-sheet .mnav-link').filter({ hasText: 'Edit bar' }).click(); await pause(300)
  await tick('Ads'); await tick('Customer'); await page.locator('.mnav-sheet button').filter({ hasText: /^Done$/ }).click(); await pause(300); await closeSheet(page)
  // bar stays visible and on top while scrolling long pages
  for (const path of ['/pnl/shopify', '/customer-support']) {
    await page.goto(BASE_URL + path, { waitUntil: 'networkidle' }); await pause(4000)
    let visible = true
    for (let k = 0; k < 8; k++) {
      await page.evaluate(() => { const el = document.querySelector('.page-scroll'); el && el.scrollBy(0, 600); window.scrollBy(0, 600) }); await pause(250)
      const r = await page.evaluate(() => { const n = document.querySelector('nav.mnav'); const b = n.getBoundingClientRect(); const hit = document.elementFromPoint(innerWidth / 2, b.top + b.height / 2); return { bottom: Math.round(b.bottom), top: n.contains(hit), shown: getComputedStyle(n).display !== 'none' } })
      if (!(r.shown && r.top && r.bottom === vp.height)) visible = false
    }
    ok(`bar visible and on top while scrolling ${path}`, visible)
    if (path === '/customer-support') await shot(page, 'dock-customer-support')
  }
  ok('no sideways overflow', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)))
  await ctx.close()
}

// ── limited user (Overview + Inventory only)
{
  const { ctx, page } = await login(users.limited)
  const labels = await slots(page).evaluateAll(bs => bs.map(b => b.getAttribute('aria-label')))
  ok('limited: dock = their pages only', labels.join('|') === 'Overview|Inventory|All pages', labels.join(','))
  await openLauncher(page)
  const sheet = await page.locator('.mnav-sheet').innerText()
  ok('limited: launcher lists no other page', !/Sales|P&L|Logistics|Customer|Ads|Documents|COGS|Courier|Ledger|Financial/.test(sheet.replace(/Profile/g, '')))
  await page.locator('.mnav-sheet input[type=search]').fill('roas'); await pause(300)
  ok('limited: search "roas" finds nothing', /No page matches/.test(await page.locator('.mnav-sheet').innerText()))
  await ctx.close()
}
await browser.close()
const out = resolve(repoRoot, `docs/responsive/after/nav/check-${ENGINE}-${vp.name}.json`)
mkdirSync(resolve(repoRoot, 'docs/responsive/after/nav'), { recursive: true })
writeFileSync(out, JSON.stringify(results, null, 2))
console.log(`${results.filter(r => r.pass).length}/${results.length} pass`)
