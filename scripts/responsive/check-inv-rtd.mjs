// RTD level on phones: the Stock explorer "⋯" sheet and the filter sheet both set the same filter as
// the desktop Inventory Detail "RTD Level" slicer. Picks Low on the phone, checks the explorer count
// drops, the Filtered strip / filter sheet agree, then widens the same page to desktop and checks the
// desktop slicer shows Low and the table count matches a desktop-only run with RTD Level = Low.
// Usage: node scripts/responsive/check-inv-rtd.mjs [viewportName]
import { launch, openPage, VIEWPORTS } from './lib.mjs'
const vp = VIEWPORTS.find(v => v.name === (process.argv[2] || 'iphone14-390x844'))
const { browser, ctx } = await launch(vp)
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e.message || e)))
let fail = 0
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' - ' + extra : ''}`) }
const tap = async loc => { await loc.scrollIntoViewIfNeeded(); await loc.tap(); await page.waitForTimeout(400) }
const ex = page.locator('#inv-stock-explorer')
const skuN = async () => Number((await ex.locator('button').filter({ hasText: /^Show all [\d,]+ SKUs/ }).innerText()).match(/[\d,]+/)[0].replace(/,/g, ''))

await openPage(page, '/inventory/inventory_health')
const allN = await skuN()
await tap(ex.locator('button[aria-haspopup="dialog"]'))
const sheet = page.locator('[role=dialog]')
const sheetText = await sheet.innerText()
check('explorer "⋯" sheet has RTD level above Stock status', /RTD LEVEL[\s\S]*STOCK STATUS/i.test(sheetText), sheetText.replace(/\s+/g, ' ').slice(0, 90))
await tap(sheet.locator('button').filter({ hasText: /^Low$/ }))
await page.keyboard.press('Escape'); await page.waitForTimeout(400)
if (await sheet.count()) { await page.goBack(); await page.waitForTimeout(400) }
const lowN = await skuN()
const btn = (await ex.locator('button[aria-haspopup="dialog"]').innerText()).trim()
const strip = await page.locator('.filtered-strip').innerText().catch(() => '')
check('RTD Low narrows the explorer, button and Filtered strip say so', lowN > 0 && lowN < allN && /RTD Low/.test(btn) && /RTD level: Low/i.test(strip), `${allN} → ${lowN} SKUs · button "${btn}" · strip "${strip.replace(/\s+/g, ' ').trim()}"`)

await tap(page.locator('.inv-filter-btn').first())
const labels = await page.locator('[role=dialog] button').allInnerTexts()
const order = labels.map(t => t.split('\n')[0].trim())
const iStatus = order.findIndex(t => /^Stock status/.test(t)), iRtd = order.findIndex(t => /^RTD level/.test(t))
check('filter sheet: RTD level right after Stock status and shows Low', iRtd === iStatus + 1 && /Low/.test(labels[iRtd]), labels[iRtd]?.replace(/\s+/g, ' '))
await page.goBack(); await page.waitForTimeout(400)
if (await page.locator('[role=dialog]').count()) await page.keyboard.press('Escape')

// same page, desktop width: the desktop slicer shows the phone's choice
await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(1200)
const note = await page.locator('.inv-detail-card').innerText()
const shared = (note.match(/([\d,]+) of ([\d,]+) SKUs/) || [])[0]
const deskBtn = await page.locator('.inv-detail-card .inv-detail-desktop-only button').first().innerText().catch(() => '')

// fresh desktop run, RTD Level = Low picked on the desktop slicer
const desk = await launch(VIEWPORTS.find(v => v.width === 1440 && !v.mobile))
const d = await desk.ctx.newPage()
await openPage(d, '/inventory/inventory_health')
const dAll = (await d.locator('.inv-detail-card').innerText()).match(/([\d,]+) of ([\d,]+) SKUs/)[0]
await d.locator('.inv-detail-card .inv-detail-desktop-only button').first().click(); await d.waitForTimeout(400)
await d.locator('[data-smsel-panel] div').filter({ hasText: /^Low$/ }).last().click()
await d.locator('[data-smsel-panel] button').filter({ hasText: /^Apply/ }).click(); await d.waitForTimeout(800)
const dLow = (await d.locator('.inv-detail-card').innerText()).match(/([\d,]+) of ([\d,]+) SKUs/)[0]
check('phone choice carries to desktop and equals the desktop slicer result', shared === dLow && dLow !== dAll, `phone→desktop "${shared}" · desktop slicer Low "${dLow}" · All "${dAll}" · slicer "${deskBtn.replace(/\s+/g, ' ').slice(0, 40)}"`)

check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
await browser.close(); await desk.browser.close()
console.log(`${vp.name}: ${fail ? fail + ' FAILED' : 'ALL PASS'}`)
process.exit(fail ? 1 : 0)
