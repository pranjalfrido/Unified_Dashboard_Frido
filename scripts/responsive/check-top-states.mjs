// Section 6 check: Overview mobile Top States - full-width map, top 8 compact rows, "Show all N
// states" grows the list in place, a row opens a sheet with revenue/share/orders + top cities,
// Back closes it. Usage: node scripts/responsive/check-top-states.mjs [viewportName] [outDir]
import { launch, openPage, VIEWPORTS, ENGINE } from './lib.mjs'
import { mkdirSync } from 'fs'
const vp = VIEWPORTS.find(v => v.name === (process.argv[2] || 'iphone14-390x844'))
const out = process.argv[3] || 'docs/responsive/after/overview-align/states'
mkdirSync(out, { recursive: true })
const { browser, ctx } = await launch(vp)
const page = await ctx.newPage()
let fail = 0
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' - ' + extra : ''}`) }
await openPage(page, '/overview')
const card = page.locator('.ov-mobile > div > div').filter({ has: page.getByText('Top States', { exact: true }) })
await card.getByText('Top States', { exact: true }).scrollIntoViewIfNeeded()
await page.waitForSelector('.ov-mobile svg path')
const box = await card.evaluate(el => { const r = el.getBoundingClientRect(), s = el.querySelector('svg').getBoundingClientRect(); return { card: Math.round(r.width), map: Math.round(s.width) } })
check('map is full card width', box.map >= box.card - 34, JSON.stringify(box))
const rows = card.locator('button').filter({ hasText: /^\d+\. / })
check('top 8 rows', (await rows.count()) === 8, `${await rows.count()}`)
check('no Top-5 overlay on mobile', !(await card.getByText('Top 5 States').count()))
await page.screenshot({ path: `${out}/${ENGINE}-${vp.name}-card.png` })
const more = card.getByRole('button', { name: /^Show all \d+ states$/ })
const n = Number((await more.innerText()).match(/\d+/)[0])
await more.click()
check('Show all grows the list in place', (await rows.count()) === n, `${n}`)
await card.getByRole('button', { name: /^Show top 8$/ }).click()
await rows.first().click(); await page.waitForTimeout(400)
const sheet = page.getByRole('dialog')
const txt = await sheet.innerText()
check('row opens sheet with revenue, share, orders, cities', /revenue/i.test(txt) && /share/i.test(txt) && /orders/i.test(txt) && /top cities/i.test(txt), txt.split('\n')[0])
await page.screenshot({ path: `${out}/${ENGINE}-${vp.name}-sheet.png` })
await page.goBack(); await page.waitForTimeout(400)
check('Back closes the sheet, stays on Overview', !(await sheet.count()) && page.url().includes('/overview'))
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
check('no horizontal overflow', overflow <= 0, `${overflow}px`)
await browser.close()
console.log(fail ? `${ENGINE} ${vp.name}: ${fail} FAILED` : `${ENGINE} ${vp.name}: ALL PASS`)
process.exit(fail ? 1 : 0)
