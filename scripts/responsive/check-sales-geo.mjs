// Sales mobile geography: Region / City tier card (toggle, compact rows) and Top states / cities
// (State / City toggle, top 8, "Show all" full-screen list, detail sheet). The top state's revenue
// and share equal the desktop Top States table (same rows). Amazon VC shows the "not available" note.
// Usage: node scripts/responsive/check-sales-geo.mjs [route] [viewportName]  (RESPONSIVE_ENGINE=webkit ok)
import { launch, openPage, VIEWPORTS, ENGINE } from './lib.mjs'
import { mkdirSync } from 'fs'
const route = '/' + (process.argv[2] || 'sales/shopify/overall').replace(/^.*Git\//, '').replace(/^\/+/, '')
const vp = VIEWPORTS.find(v => v.name === (process.argv[3] || 'iphone14-390x844'))
const out = 'docs/responsive/after/sales/geo'
mkdirSync(out, { recursive: true })
const tag = route.replace(/^\/sales\//, '').replace(/\//g, '-')
const { browser, ctx } = await launch(vp)
const page = await ctx.newPage()
let fail = 0
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' - ' + extra : ''}`) }
await openPage(page, route)
const geo = page.locator('section', { has: page.getByRole('heading', { name: /^Top (states|cities)/ }) }).first()
if (/vendor_central/.test(route)) {
  const txt = await page.locator('section', { has: page.getByRole('heading', { name: 'Top states & cities' }) }).innerText()
  check('VC: geography shows the "not available" note', /Not available for Vendor Central/.test(txt))
  await browser.close(); console.log(fail ? `${ENGINE} ${tag}: ${fail} FAILED` : `${ENGINE} ${vp.name} ${tag}: ALL PASS`); process.exit(fail ? 1 : 0)
}
await geo.waitFor({ timeout: 300000 })
const region = page.locator('section', { has: page.getByRole('heading', { name: /^(Region|City tier)$/ }) }).first()
if (await region.count()) {
  await region.scrollIntoViewIfNeeded()
  check('Region card: rows with ₹ and %', /₹/.test(await region.innerText()) && /%/.test(await region.innerText()))
  const tierTab = region.getByRole('tab', { name: 'City tier' })
  if (await tierTab.count()) { await tierTab.click(); await page.waitForTimeout(200); check('City tier toggle shows tiers', /Tier/.test(await region.innerText())) }
  await page.screenshot({ path: `${out}/${ENGINE}-${vp.name}-${tag}-region.png` })
}
await geo.scrollIntoViewIfNeeded()
const rows = geo.locator('button').filter({ hasText: /^\d+\. / })
const n = await rows.count()
check('Top states: up to 8 rows', n > 0 && n <= 8, `${n}`)
const first = (await rows.first().innerText()).split('\n').map(s => s.trim()).filter(Boolean)
await page.screenshot({ path: `${out}/${ENGINE}-${vp.name}-${tag}-states.png` })
await rows.first().click(); await page.waitForTimeout(300)
check('state opens a detail sheet', /Revenue/i.test(await page.getByRole('dialog').innerText()))
await page.goBack(); await page.waitForTimeout(300)
const more = geo.getByRole('button', { name: /^Show all \d+ states/ })
if (await more.count()) {
  await more.click(); await page.waitForTimeout(300)
  check('Show all opens a searchable full-screen list', await page.locator('.fullscreen-list').isVisible() && await page.locator('.fullscreen-list').getByRole('searchbox').isVisible())
  await page.goBack(); await page.waitForTimeout(300)
}
await geo.getByRole('tab', { name: 'City' }).click(); await page.waitForTimeout(200)
check('City toggle lists cities', (await geo.locator('button').filter({ hasText: /^\d+\. / }).count()) > 0)
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
check('no horizontal overflow', overflow <= 0, `${overflow}px`)
await browser.close()
// desktop Top States, first row: name + its value cells
const d = await launch(VIEWPORTS[1])
const dp = await d.ctx.newPage()
await openPage(dp, route)
const name = first[0].replace(/^\d+\.\s*/, '')
const desk = await dp.evaluate(nm => {
  const card = [...document.querySelectorAll('div')].find(x => x.innerText.trim().startsWith('Top States') && x.querySelector('table'))
  const tr = card && [...card.querySelectorAll('tbody tr')].find(t => t.innerText.toLowerCase().includes(nm.toLowerCase()))
  return tr ? tr.innerText.replace(/\s+/g, ' ') : null
}, name)
const share = first.find(x => /%$/.test(x))
check('top state matches the desktop Top States row', !!desk && desk.includes(share), `${name}: mobile ${first.slice(1).join(' ')} · desktop ${desk}`)
await d.browser.close()
console.log(fail ? `${ENGINE} ${vp.name} ${tag}: ${fail} FAILED` : `${ENGINE} ${vp.name} ${tag}: ALL PASS`)
process.exit(fail ? 1 : 0)
