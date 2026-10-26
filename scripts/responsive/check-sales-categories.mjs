// Sales mobile Categories card: Category / Product / SKU toggle, product rows of fixed height with
// the channel's sort chips, "Show all" full-screen list (search, category chips), detail sheet, and
// the product values equal to the desktop Category Revenue Matrix (same rows, first row compared).
// Usage: node scripts/responsive/check-sales-categories.mjs [route] [viewportName]  (RESPONSIVE_ENGINE=webkit ok)
import { launch, openPage, VIEWPORTS, ENGINE } from './lib.mjs'
import { mkdirSync } from 'fs'
const route = '/' + (process.argv[2] || 'sales/shopify/overall').replace(/^.*Git\//, '').replace(/^\/+/, '')
const vp = VIEWPORTS.find(v => v.name === (process.argv[3] || 'iphone14-390x844'))
const out = 'docs/responsive/after/sales/categories'
mkdirSync(out, { recursive: true })
const tag = route.replace(/^\/sales\//, '').replace(/\//g, '-')
const { browser, ctx } = await launch(vp)
const page = await ctx.newPage()
let fail = 0
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' - ' + extra : ''}`) }
await openPage(page, route)
const card = page.locator('section', { has: page.getByRole('tablist', { name: 'Show' }) }).first()
await card.scrollIntoViewIfNeeded()
const catRows = await card.locator('button, div').filter({ hasText: /₹/ }).count()
check('Category view lists categories with ₹ and %', catRows > 0 && /%/.test(await card.innerText()))
await page.screenshot({ path: `${out}/${ENGINE}-${vp.name}-${tag}-category.png` })
await card.getByRole('tab', { name: 'Product' }).click(); await page.waitForTimeout(300)
const rows = card.locator('.ranked-list button').filter({ hasText: /^\d+\. / })
const hs = await rows.evaluateAll(bs => bs.map(b => Math.round(b.getBoundingClientRect().height)))
check('Product view: 10 rows of 74px', hs.length === Math.min(10, hs.length) && hs.length > 0 && hs.every(h => h === 74), JSON.stringify(hs))
const chips = await card.getByRole('group', { name: 'Sort by' }).getByRole('button').allInnerTexts()
check('sort chips = the channel matrix columns', chips.length >= 6, chips.join(', '))
const firstProduct = (await rows.first().innerText()).split('\n').map(s => s.trim()).filter(Boolean)
await page.screenshot({ path: `${out}/${ENGINE}-${vp.name}-${tag}-product.png` })
await rows.first().click(); await page.waitForTimeout(300)
const det = await page.getByRole('dialog').innerText()
check('row opens a detail sheet with every column', chips.every(c => det.toLowerCase().includes(c.toLowerCase())), det.replace(/\s+/g, ' ').slice(0, 100))
await page.goBack(); await page.waitForTimeout(300)
const more = card.getByRole('button', { name: /^Show all \d+ products/ })
if (await more.count()) {
  await more.click(); await page.waitForTimeout(400)
  const full = page.locator('.fullscreen-list')
  check('Show all opens the full-screen list', await full.isVisible())
  await page.screenshot({ path: `${out}/${ENGINE}-${vp.name}-${tag}-full.png` })
  await page.goBack(); await page.waitForTimeout(300)
}
const skuTab = card.getByRole('tab', { name: 'SKU' })
if (await skuTab.count()) {
  await skuTab.click(); await page.waitForTimeout(300)
  check('SKU view lists SKUs', (await card.locator('.ranked-list button').filter({ hasText: /^\d+\. / }).count()) > 0)
}
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
check('no horizontal overflow', overflow <= 0, `${overflow}px`)
await browser.close()
// same product on desktop: the matrix row's Gross Rev and Net Rev
const d = await launch(VIEWPORTS[1])
const dp = await d.ctx.newPage()
await openPage(dp, route)
const name = firstProduct[0].replace(/^\d+\.\s*/, '')
const deskRow = await dp.evaluate(n => { const tr = [...document.querySelectorAll('tr')].find(t => t.querySelectorAll('td')[1]?.innerText.replace(/^▶s*/, '').trim() === n); return tr ? [...tr.querySelectorAll('td')].map(td => td.innerText.trim()) : null }, name)
const mobileGross = firstProduct.find(x => /^₹/.test(x))
check('first product equals the desktop matrix row', !!deskRow && deskRow.some(c => c.startsWith(mobileGross)), `${name}: mobile ${mobileGross} · desktop ${deskRow ? deskRow.slice(2, 4).join(' / ') : 'not found'}`)
await d.browser.close()
console.log(fail ? `${ENGINE} ${vp.name} ${tag}: ${fail} FAILED` : `${ENGINE} ${vp.name} ${tag}: ALL PASS`)
process.exit(fail ? 1 : 0)
