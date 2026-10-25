// Section 4 check: Overview "Filtered:" strip + filter icon + FilterSheet/FilterPicker.
// Sets one Sales category on the desktop Sales tab (the way a user would), goes to Overview, shrinks
// to a phone, then checks: strip + icon visible with the category, the sheet opens with a row,
// the picker opens (search, Apply), ✕ on the chip clears the filter, and no filter = no strip/icon.
// Usage: node scripts/responsive/check-overview-filters.mjs [viewportName] [outDir]  (RESPONSIVE_ENGINE=webkit ok)
import { launch, openPage, VIEWPORTS, ENGINE, waitSettled } from './lib.mjs'
import { mkdirSync } from 'fs'
const vp = VIEWPORTS.find(v => v.name === (process.argv[2] || 'iphone14-390x844'))
const out = process.argv[3] || 'docs/responsive/after/overview-align/filters'
mkdirSync(out, { recursive: true })
const { browser, ctx } = await launch(vp)
const page = await ctx.newPage()
let fail = 0
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' - ' + extra : ''}`) }

await page.setViewportSize({ width: 1440, height: 900 })
await openPage(page, '/sales')
await page.getByTitle('Filters', { exact: true }).first().click()
await page.getByText('All Categories', { exact: true }).first().click()
const firstCat = page.locator('div[style*="padding: 5px 10px"]').first()
const cat = (await firstCat.innerText()).trim()
await firstCat.click()
await page.getByRole('button', { name: 'Apply', exact: true }).first().click() // the dropdown stages choices until Apply
await waitSettled(page)
await page.locator('.sidebar .sb-item', { hasText: 'Overview' }).first().click()
await page.setViewportSize({ width: vp.width, height: vp.height })
await waitSettled(page)
await page.waitForFunction(() => !document.querySelector('.ov-mobile .delta-shimmer'), null, { timeout: 120000 }).catch(() => {})

const strip = page.locator('.filtered-strip')
check('strip shows the Sales category', await strip.isVisible() && (await strip.innerText()).includes(cat), `category "${cat}"`)
const btn = page.locator('.ov-filter-btn')
check('filter icon visible in header with count', await btn.isVisible() && (await btn.innerText()).trim() === '1')
await page.screenshot({ path: `${out}/${ENGINE}-${vp.name}-strip.png` })

await btn.click(); await page.waitForTimeout(500)
const sheet = page.getByRole('dialog')
check('FilterSheet opens with a Category row', await sheet.isVisible() && (await sheet.innerText()).includes('Category'))
await page.screenshot({ path: `${out}/${ENGINE}-${vp.name}-sheet.png` })
await sheet.getByRole('button', { name: /^Category/ }).click(); await page.waitForTimeout(300)
const search = sheet.getByRole('searchbox')
const fs16 = await search.evaluate(e => getComputedStyle(e).fontSize)
check('FilterPicker: search (16px), Selected (1), Apply (1)', fs16 === '16px' && /selected \(1\)/i.test(await sheet.innerText()) && await sheet.getByRole('button', { name: 'Apply (1)' }).isVisible(), `search ${fs16}`)
await page.screenshot({ path: `${out}/${ENGINE}-${vp.name}-picker.png` })
await sheet.getByRole('button', { name: 'Back to filters' }).click()
await sheet.getByRole('button', { name: 'Done' }).click(); await page.waitForTimeout(400)
check('sheet closes on Done', (await page.getByRole('dialog').count()) === 0)

await strip.getByRole('button', { name: /Remove filter Category/ }).click()
await waitSettled(page)
check('✕ clears the filter: no strip, no icon', !(await strip.count()) && !(await btn.count()))
await page.screenshot({ path: `${out}/${ENGINE}-${vp.name}-cleared.png` })
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
check('no horizontal overflow', overflow <= 0, `${overflow}px`)
await browser.close()
console.log(fail ? `${ENGINE} ${vp.name}: ${fail} FAILED` : `${ENGINE} ${vp.name}: ALL PASS`)
process.exit(fail ? 1 : 0)
