// Inventory mobile interaction check (INVENTORY_MOBILE_REDESIGN_PROMPT.md §6), Chromium or WebKit
// (RESPONSIVE_ENGINE=webkit uses the iPhone profiles). Taps through: sub-tabs, filter sheet, warehouse
// sheet → "See stock", explorer drill down/up + Back, location + status chips, SKU sheet, the 4,121-SKU
// full-screen list, ageing toggle; Sales & Allocation tiles, contribution / movers toggles, daily drill.
// Usage: node scripts/responsive/check-inv-interact.mjs [viewportName]
import { launch, openPage, VIEWPORTS, ENGINE } from './lib.mjs'
const vp = VIEWPORTS.find(v => v.name === (process.argv[2] || 'iphone14-390x844'))
const { browser, ctx } = await launch(vp)
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e.message || e)))
let fail = 0
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' - ' + extra : ''}`) }
const tap = async loc => { await loc.scrollIntoViewIfNeeded(); await loc.tap(); await page.waitForTimeout(350) }
const crumb = () => page.locator('#inv-stock-explorer .drill-down > div').first().innerText().then(t => t.replace(/\s+/g, ' ').trim())
const ex = page.locator('#inv-stock-explorer')
const rows = () => ex.locator('.drill-down > button').filter({ hasText: /avg|DOI/ })

await openPage(page, '/inventory/inventory_health')

// filter sheet
await tap(page.locator('.inv-filter-btn').first())
const sheetRows = await page.locator('[role=dialog] button').filter({ hasText: /^(Location|Stock status|SKU)/ }).count()
await tap(page.locator('[role=dialog] button').filter({ hasText: /^Location/ }).first())
await tap(page.locator('[role=dialog] [role=option], [role=dialog] label, [role=dialog] button').filter({ hasText: /^PNQ/ }).first())
await tap(page.locator('[role=dialog] button').filter({ hasText: /^Apply/ }).first())
await tap(page.locator('[role=dialog] button').filter({ hasText: /^Show results/ }).first())
const badge = await page.locator('.inv-filter-btn b').first().innerText().catch(() => '')
const strip = await page.locator('.filtered-strip').innerText().catch(() => '')
check('filter sheet: Location = PNQ applies (badge + Filtered strip)', sheetRows >= 3 && badge === '1' && /Location: PNQ/.test(strip), `rows ${sheetRows}, badge "${badge}"`)
await tap(page.locator('.filtered-strip button').filter({ hasText: /^Clear/ }))
check('filter strip: Clear removes it', (await page.locator('.filtered-strip').count()) === 0)

// warehouse sheet → See stock
await tap(page.locator('.inv-wh-row').filter({ hasText: 'GGN' }))
const whSheet = await page.locator('[role=dialog]').innerText()
await tap(page.locator('[role=dialog] button').filter({ hasText: /^See GGN stock/ }))
await page.waitForTimeout(600)
check('warehouse row → sheet → "See GGN stock" switches the explorer', /GGN warehouse/.test(whSheet) && /📍 GGN/.test(await crumb()))
await tap(ex.locator('[aria-label="Location"] button').filter({ hasText: /^All$/ }))

// drill down / up + Back
const cat = (await rows().first().innerText()).split('\n')[0]
await tap(rows().first())
const c1 = await crumb()
await tap(rows().first())
const c2 = await crumb()
check('drill-down: category → sub-category → SKUs, breadcrumb grows', c1.includes(cat) && c2.split('›').length === 3, c2)
await tap(rows().first())
const skuSheet = await page.locator('[role=dialog]').innerText().catch(() => '')
check('SKU sheet opens with RTD / RAW / By location', /RTD/.test(skuSheet) && /BY LOCATION/i.test(skuSheet))
await page.goBack(); await page.waitForTimeout(400)
check('Back closes the SKU sheet, stays on the SKU level', (await page.locator('[role=dialog]').count()) === 0 && (await crumb()).split('›').length === 3)
await page.goBack(); await page.waitForTimeout(400)
check('Back goes up one level', (await crumb()).split('›').length === 2, await crumb())
await tap(ex.locator('.drill-down > div button').filter({ hasText: 'All categories' }))
check('breadcrumb "All categories" goes back to the top', (await crumb()).split('›').length === 1)
check('still on Inventory Health after Back', /inventory_health/.test(page.url()), page.url())

// location + status
await tap(ex.locator('[aria-label="Location"] button').filter({ hasText: /^PNQ$/ }))
const pnqCount = await ex.locator('h2 ~ span, span').filter({ hasText: /categories$/ }).first().innerText().catch(() => '')
await tap(ex.locator('button[aria-haspopup="dialog"]'))
await tap(page.locator('[role=dialog] button').filter({ hasText: /^Critical/ }))
const stBtn = await ex.locator('button[aria-haspopup="dialog"]').innerText()
check('location chip PNQ + status menu Critical', /📍 PNQ/.test(await crumb()) && /Critical/.test(stBtn), `${pnqCount} · button "${stBtn.trim()}"`)
await tap(ex.locator('button[aria-haspopup="dialog"]'))
await tap(page.locator('[role=dialog] button').filter({ hasText: /^All statuses/ }))
await tap(ex.locator('[aria-label="Location"] button').filter({ hasText: /^All$/ }))

// full-screen list
const t0 = Date.now()
const showAllBtn = ex.locator('button').filter({ hasText: /^Show all [\d,]+ SKUs/ })
const allN = (await showAllBtn.innerText()).match(/[\d,]+/)[0].replace(/,/g, '')
await tap(showAllBtn)
const fsl = page.locator('.fullscreen-list')
const openMs = Date.now() - t0
const fsCount = await fsl.locator('span').filter({ hasText: /^[\d,]+ SKUs$/ }).first().innerText().catch(() => '')
const t1 = Date.now()
for (let i = 0; i < 3; i++) await tap(fsl.locator('button').filter({ hasText: /^Load/ }))
const loadMs = Date.now() - t1
const shown = await fsl.locator('button').filter({ hasText: /^\d+\. / }).count()
await fsl.locator('input[type=search]').fill('FR-OPC')
await page.waitForTimeout(300)
const found = await fsl.locator('button').filter({ hasText: /^\d+\. FR-OPC/ }).count()
check('full-screen list: all SKUs, Load more, search', fsCount.replace(/,/g, '') === `${allN} SKUs` && shown === 80 && found > 0, `${fsCount}; opened ${openMs} ms; 3 × Load more ${loadMs} ms; search FR-OPC → ${found}`)
await page.goBack(); await page.waitForTimeout(400)
check('Back closes the full-screen list', (await fsl.count()) === 0)

// ageing toggle
const age = page.locator('#inv-dead-stock')
const slowFirst = (await age.locator(':scope > button').first().innerText()).split('\n')[0]
await tap(age.getByRole('tab', { name: 'Dead stock', exact: true }))
const deadFirst = (await age.locator(':scope > button').first().innerText()).split('\n')[0]
check('ageing toggle switches the list', slowFirst !== deadFirst && !/Spare Parts/.test(await age.innerText()), `${slowFirst} → ${deadFirst}`)

// sub-tab → Sales & Allocation
const subTab = page.getByRole('tab', { name: 'Sales & Allocation', exact: true })
if (await subTab.count()) await tap(subTab.first())
else await tap(page.locator('.inv-tablet-bar').getByRole('tab', { name: 'Sales & Allocation' }))
await page.waitForSelector('.sa-mobile .master-card', { timeout: 120000 })
check('sub-tab switches to Sales & Allocation', /sales_allocation/.test(page.url()))

// master tiles
const heroLabel = () => page.locator('.sa-mobile .master-card [aria-live]').locator('..').innerText().then(t => t.split('\n')[0])
const tileBefore = await page.locator('.sa-mobile .master-card').boundingBox()
await tap(page.locator('.sa-mobile .master-tiles button').filter({ hasText: /^Units sold/i }))
const unitsHero = await heroLabel()
await tap(page.locator('.sa-mobile .master-tiles button').filter({ hasText: /^Momentum/i }))
const momHero = await page.locator('.sa-mobile .master-card').innerText()
const tileAfter = await page.locator('.sa-mobile .master-card').boundingBox()
check('master tiles switch the hero; card keeps its size', /UNITS SOLD/i.test(unitsHero) && /No daily breakdown/.test(momHero) && Math.round(tileBefore.height) === Math.round(tileAfter.height), `${Math.round(tileBefore.height)} → ${Math.round(tileAfter.height)}px`)

// contribution + movers
const con = page.locator('section').filter({ has: page.locator('h2', { hasText: 'Contribution' }) })
await tap(con.getByRole('tab', { name: 'Category', exact: true }))
const conFirst = await con.locator('div, button').filter({ hasText: /%$/ }).first().innerText()
check('contribution: Category toggle', /Footwear|Orthotics|Pillows/.test(conFirst), conFirst.replace(/\n/g, ' '))
const mov = page.locator('section').filter({ has: page.locator('h2', { hasText: 'Biggest movers' }) })
await tap(mov.getByRole('tab', { name: '▼ Fallers' }))
await tap(mov.locator('button').filter({ hasText: /^Last vs 7th-last day$/ }))
const movText = await mov.innerText()
check('movers: Fallers + vs 7th-last day show ▼ rows', /▼ \d+%/.test(movText) && !/▲ \d+%/.test(movText))

// daily drill + sparklines
const daily = page.locator('section').filter({ has: page.locator('h2', { hasText: 'Daily sales by product' }) })
const sparks = await daily.locator('svg[role=img]').count()
await tap(daily.locator('.drill-down > button').first())
const dCrumb = await daily.locator('.drill-down > div').first().innerText()
check('daily sales: sparklines + drill into a category', sparks >= 5 && /›/.test(dCrumb), `${sparks} sparklines; ${dCrumb.replace(/\s+/g, ' ')}`)
await page.goBack(); await page.waitForTimeout(400)
check('daily sales: Back goes up', !/›/.test(await daily.locator('.drill-down > div').first().innerText()))

check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
const ow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
check('no horizontal page scroll', ow <= 1, `${ow}px`)
console.log(`${ENGINE} ${vp.name}: ${fail ? fail + ' FAILED' : 'ALL PASS'}`)
await browser.close()
process.exit(fail ? 1 : 0)
