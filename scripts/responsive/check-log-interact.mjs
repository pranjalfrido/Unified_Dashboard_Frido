// Logistics mobile tap-through (LOGISTICS_MOBILE_REDESIGN_PROMPT.md §7): sub-tabs + Cost tabs, filter
// sheet with the courier picker's search, tile switching + scrub (no resize), scorecard View / Sort /
// detail sheet, TAT toggle + stacked bars, RTO toggles + ageing-basis menu, NDR toggle, Cost month
// sheet, partner toggle, product drill-down, full-screen list, "⋯" export. Chromium, or WebKit with
// RESPONSIVE_ENGINE=webkit. Usage: node scripts/responsive/check-log-interact.mjs [viewportName]
import { launch, openPage, VIEWPORTS, ENGINE } from './lib.mjs'
const vp = VIEWPORTS.find(v => v.name === (process.argv[2] || 'iphone14-390x844'))
const { browser, ctx } = await launch(vp)
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e.message || e)))
let fail = 0
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' - ' + extra : ''}`) }
const act = async loc => { await loc.scrollIntoViewIfNeeded(); try { await loc.tap({ timeout: 8000 }) } catch { await loc.click() } await page.waitForTimeout(350) }
const sec = title => page.locator('section').filter({ has: page.locator('h2', { hasText: new RegExp(`^${title}`) }) })
const dialog = () => page.locator('[role=dialog]').last()
const closeSheet = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(350) }

await openPage(page, '/logistics/performance_analytics')
const userScroll = () => page.evaluate(() => {
  let el = document.querySelector('.master-card')
  while (el && el !== document.body) { const cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) return true; el = el.parentElement }
  return document.scrollingElement.scrollHeight > innerHeight + 1
})
check('Performance: the page scrolls by finger (scrollable box around the content)', await userScroll())

// master card: tile switching keeps the size; scrub changes the hero
const card = page.locator('.master-card').first()
const h0 = (await card.boundingBox()).height
await act(card.locator('.master-tiles button').filter({ hasText: /^RTO %/ }))
const heroLabel = (await card.innerText()).split('\n')[0]
const h1 = (await card.boundingBox()).height
check('tile tap switches the hero (RTO %), card keeps its size', /RTO %/i.test(heroLabel) && Math.abs(h0 - h1) < 1, `${Math.round(h0)} → ${Math.round(h1)}px`)
const chart = card.locator('svg').filter({ has: page.locator('path') }).first()
const cb = await chart.boundingBox()
const v0 = await card.locator('[aria-live]').innerText()
await page.mouse.move(cb.x + cb.width * 0.3, cb.y + cb.height / 2); await page.mouse.down(); await page.mouse.move(cb.x + cb.width * 0.6, cb.y + cb.height / 2, { steps: 4 })
const v1 = await card.locator('[aria-live]').innerText(); const h2 = (await card.boundingBox()).height
await page.mouse.up(); await page.waitForTimeout(300)
check('scrub shows a point in the hero, nothing resizes', v0 !== v1 && Math.abs(h2 - h0) < 1)

// filter sheet: courier picker search → Bluedart → badge + Filtered strip → Clear
await act(page.locator('.log-filter-btn').first())
await act(dialog().locator('button').filter({ hasText: /^Courier/ }).first())
await dialog().locator('input[type=search]').fill('blue'); await page.waitForTimeout(300)
const found = await dialog().locator('label').filter({ hasText: /^Bluedart/ }).count()
await act(dialog().locator('label').filter({ hasText: /^Bluedart$/ }).first())
await act(dialog().locator('button').filter({ hasText: /^Apply/ }).first())
await act(dialog().locator('button').filter({ hasText: /^Done$/ }).first())
await page.waitForTimeout(2500)
const badge = await page.locator('.log-filter-btn b').first().innerText().catch(() => '')
const strip = await page.locator('.filtered-strip').innerText().catch(() => '')
check('filter sheet: courier search finds Bluedart, applies (badge 1 + Filtered strip)', found > 0 && badge === '1' && /Courier: Bluedart/.test(strip), `found ${found}, badge "${badge}"`)
await act(page.locator('.filtered-strip button').filter({ hasText: /^Clear/ }))
await page.waitForTimeout(2500)
check('Filtered strip: Clear removes it', (await page.locator('.filtered-strip').count()) === 0)

// scorecard: View → Zone (nested), expand, Sort → Del %, detail sheet
const sc = page.locator('#log-scorecard')
await act(sc.getByRole('button', { name: 'View by' }))
await act(dialog().locator('button').filter({ hasText: /Zone/ }).first())
await closeSheet()
const viewTxt = await sc.getByRole('button', { name: 'View by' }).innerText()
await act(sc.locator('.score-row').first())
const drill = await sc.locator('.score-row').count()
await act(sc.getByRole('button', { name: 'Sort by' }))
await act(dialog().locator('button').filter({ hasText: /^Del %/ }).first())
const sortTxt = await sc.getByRole('button', { name: 'Sort by' }).innerText()
await act(sc.locator('button').filter({ hasText: /^All columns for/ }).first())
const sheetTxt = await dialog().innerText().catch(() => '')
await closeSheet()
check('scorecard: View Courier › Zone nests, Sort by Del %, row → all-columns sheet', /Courier › Zone/.test(viewTxt) && drill > 9 && /Del %/.test(sortTxt) && /EDD breach %/i.test(sheetTxt), `${viewTxt.trim()} · ${sortTxt.trim()} · ${drill} rows`)
await act(sc.getByRole('button', { name: 'View by' })); await act(dialog().locator('button').filter({ hasText: /Zone/ }).first()); await closeSheet()

// TAT toggle
const speed = sec('Speed')
await act(speed.getByRole('tab', { name: 'Pickup', exact: true }))
const spTxt = await speed.innerText()
check('TAT toggle: Pickup shows its definition and hour buckets', /Shipment creation → shipment pickup/.test(spTxt) && /0–12h/.test(spTxt) && (await speed.locator('.sbr-row').count()) > 2)

// RTO toggles + basis menu
const rto = sec('RTO shipment analysis')
await act(rto.getByRole('tab', { name: 'Delivery ageing', exact: true }))
const delTxt = await rto.innerText()
await act(rto.getByRole('tab', { name: 'Reasons', exact: true }))
const reasonsTxt = await rto.innerText()
await act(rto.getByRole('tab', { name: 'RTO ageing', exact: true }))
await act(rto.getByRole('button', { name: 'Ageing basis' }))
await act(dialog().locator('button').filter({ hasText: /Order creation/ }).first())
const baseTxt = await rto.innerText()
check('RTO: delivery ageing / reasons toggles, basis menu → order creation', /RTO mark date → delivered back/.test(delTxt) && /RTO reasons/.test(reasonsTxt) && /order creation → RTO mark date/.test(baseTxt))

// NDR toggle
const ndr = sec('NDR')
const ndrAll = await ndr.innerText()
await act(ndr.getByRole('tab', { name: 'COD', exact: true }))
const ndrCod = await ndr.innerText()
check('NDR: COD toggle changes the summary', ndrAll !== ndrCod)

// Cost: sub-tab, month sheet, partner toggle
await act(page.getByRole('tab', { name: 'Cost', exact: true }).first())
await page.waitForTimeout(3000)
check('header tab switches to Cost', /cost_analytics/.test(page.url()), page.url())
check('Cost: the page scrolls by finger', await userScroll())
await act(page.locator('.m-header .mrp-pill').first())
await act(dialog().locator('button').filter({ hasText: /^Last 3M$/ }))
await act(dialog().locator('button').filter({ hasText: /^Apply/ }))
await page.waitForTimeout(2500)
const pill = await page.locator('.m-header .mrp-pill').innerText()
check('month sheet: Last 3M → Apply updates the header pill', /Jul – Sep 26/.test(pill), pill.trim())
const partners = sec('Partners')
await act(partners.getByRole('tab', { name: 'FTL/PTL', exact: true }))
check('Overview partners: FTL/PTL toggle lists transporters', /trips/.test(await partners.innerText()))

// B2C: product drill-down, full-screen slab list (search + Back), "⋯" export
await act(page.locator('.mph-tabs2').getByRole('tab', { name: 'B2C', exact: true }))
await page.waitForTimeout(3000)
const prod = sec('Cost by product')
const cat = (await prod.locator('.drill-down > button').first().innerText()).split('\n')[0]
await act(prod.locator('.drill-down > button').first())
const crumb = await prod.locator('.drill-down > div').first().innerText()
check('B2C: cost by product drills into a category', crumb.includes(cat) && /›/.test(crumb), crumb.replace(/\s+/g, ' '))
await page.goBack(); await page.waitForTimeout(400)
const slabs = sec('Weight slabs')
await act(slabs.locator('button').filter({ hasText: /^Show all \d+ slabs/ }))
const fsl = page.locator('.fullscreen-list')
await fsl.locator('input[type=search]').fill('2 kg'); await page.waitForTimeout(300)
const hits = await fsl.locator('button').filter({ hasText: /2 kg/ }).count()
await page.goBack(); await page.waitForTimeout(500)
check('B2C: full-screen slab list opens, search works, Back closes it', hits > 0 && (await fsl.count()) === 0, `${hits} hits`)
await act(page.locator('.m-header .m-action-btn').first())
const menuTxt = await dialog().innerText()
const dl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null)
await act(dialog().locator('button').filter({ hasText: /^By courier$/ }).first())
const file = await dl
check('"⋯" lists CSV exports and downloads one', /Export as CSV/i.test(menuTxt) && !!file, file ? await file.suggestedFilename() : 'no download')

check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
const ow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
check('no horizontal page scroll', ow <= 1, `${ow}px`)
console.log(`${ENGINE} ${vp.name}: ${fail ? fail + ' FAILED' : 'ALL PASS'}`)
await browser.close()
process.exit(fail ? 1 : 0)
