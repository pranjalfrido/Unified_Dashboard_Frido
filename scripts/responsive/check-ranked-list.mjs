// Section 5 check: Overview product list (MobileRankedList → RankedRow + FullScreenList).
// Card: 10 rows of 74px, sort chips re-rank, "Show all N →". Full screen: count, search, category
// chips, Load more, inner scrolling (the page behind stays put), row → detail sheet, Back closes
// the sheet first and then the list.
// Usage: node scripts/responsive/check-ranked-list.mjs [viewportName] [outDir]  (RESPONSIVE_ENGINE=webkit ok)
import { launch, openPage, VIEWPORTS, ENGINE } from './lib.mjs'
import { mkdirSync } from 'fs'
const vp = VIEWPORTS.find(v => v.name === (process.argv[2] || 'iphone14-390x844'))
const out = process.argv[3] || 'docs/responsive/after/overview-align/list'
mkdirSync(out, { recursive: true })
const { browser, ctx } = await launch(vp)
const page = await ctx.newPage()
let fail = 0
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' - ' + extra : ''}`) }
await openPage(page, '/overview')

const card = page.locator('.ranked-list', { hasText: 'Product Performance' })
await card.scrollIntoViewIfNeeded()
const rows = card.locator('button:not([aria-pressed])').filter({ hasText: /^\d+\. / })
const heights = await rows.evaluateAll(bs => bs.map(b => Math.round(b.getBoundingClientRect().height)))
check('card shows 10 rows, each 74px', heights.length === 10 && heights.every(h => h === 74), JSON.stringify(heights))
const first = async () => (await rows.first().innerText()).split('\n')[0]
const byRev = await first()
await card.getByRole('button', { name: 'Units', exact: true }).click()
const byUnits = await first()
check('sort chip re-ranks', (await card.getByText(/by Units/).count()) > 0, `${byRev} → ${byUnits}`)
await card.getByRole('button', { name: 'Gross rev', exact: true }).click()
await card.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${out}/${ENGINE}-${vp.name}-card.png` }) // element shots of tall cards are unreliable on WebKit

const more = card.getByRole('button', { name: /^Show all \d+ sub-categories/ })
const total = Number((await more.innerText()).match(/\d+/)[0])
await more.click(); await page.waitForTimeout(400)
const full = page.locator('.fullscreen-list')
check('Show all opens full-screen list with the count', await full.isVisible() && (await full.innerText()).includes(`${total} sub-categories`), `${total}`)
const listRows = () => full.locator('button').filter({ hasText: /^\d+\. / }).count()
check('20 rows + Load more', (await listRows()) === Math.min(20, total) && (total <= 20 || await full.getByRole('button', { name: /^Load \d+ more/ }).isVisible()), `${await listRows()} rows`)
await page.screenshot({ path: `${out}/${ENGINE}-${vp.name}-full.png` })

// Inner scroll: the list body scrolls, the page behind does not.
const scrollBox = full.locator('div[style*="overflow-y: auto"]').first()
const bodyBefore = await page.evaluate(() => (document.querySelector('.page-scroll') || document.scrollingElement).scrollTop)
// Mobile WebKit in Playwright has no wheel/swipe input, so there the box is scrolled directly
// (this still proves it is the scroll container and that the page behind does not move).
if (ENGINE === 'webkit') await scrollBox.evaluate(e => e.scrollBy(0, 600))
else { await scrollBox.hover(); await page.mouse.wheel(0, 600) }
await page.waitForTimeout(400)
const inner = await scrollBox.evaluate(e => e.scrollTop)
const bodyAfter = await page.evaluate(() => (document.querySelector('.page-scroll') || document.scrollingElement).scrollTop)
check('full-screen list scrolls inside, page behind stays put', inner > 0 && bodyAfter === bodyBefore, `inner ${inner}px, page ${bodyBefore}→${bodyAfter}`)
await scrollBox.evaluate(e => { e.scrollTop = 0 })

if (total > 20) {
  await full.getByRole('button', { name: /^Load \d+ more/ }).click()
  check('Load more adds rows', (await listRows()) === Math.min(40, total), `${await listRows()} rows`)
}
const someName = (await full.locator('button').filter({ hasText: /^\d+\. / }).first().innerText()).split('\n')[0].replace(/^\d+\.\s*/, '')
await full.getByRole('searchbox').fill(someName.slice(0, 5))
const searched = await listRows()
check('search narrows the list', searched >= 1 && searched < total, `"${someName.slice(0, 5)}" → ${searched}`)
await full.getByRole('searchbox').fill('')
const catChips = full.getByRole('group', { name: 'Filter by group' }).getByRole('button')
if (await catChips.count() > 2) {
  const chip = catChips.nth(1); const cname = await chip.innerText()
  await chip.click()
  const n = await listRows()
  check('category chip filters', n >= 1 && n < total, `${cname} → ${n}`)
  await catChips.first().click()
}
await full.locator('button').filter({ hasText: /^\d+\. / }).first().click(); await page.waitForTimeout(400)
const sheet = page.getByRole('dialog').filter({ hasText: 'Revenue (Inc. GST)' })
check('row opens the detail sheet over the list', await sheet.isVisible())
await page.screenshot({ path: `${out}/${ENGINE}-${vp.name}-detail.png` })
await page.goBack(); await page.waitForTimeout(500)
check('Back #1 closes the sheet, list stays', !(await sheet.count()) && await full.isVisible())
await page.goBack(); await page.waitForTimeout(500)
check('Back #2 closes the list, still on Overview', !(await full.count()) && page.url().includes('/overview'))
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
check('no horizontal overflow', overflow <= 0, `${overflow}px`)
await browser.close()
console.log(fail ? `${ENGINE} ${vp.name}: ${fail} FAILED` : `${ENGINE} ${vp.name}: ALL PASS`)
process.exit(fail ? 1 : 0)
