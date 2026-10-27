// Return Analysis mobile tap-through (RETURN_ANALYSIS_MOBILE_PROMPT_1.md §7): Sales → D2C entry card
// (same numbers, same dates, back to the same scroll spot), finger scrolling, no horizontal / inner
// scroll, tiles → chart (no resize), every toggle and sort (no resize), row → sheet, Show all →
// full-screen list + search, cancellation bar → sheet + sub-category picker, filter sheet,
// ⋯ → Qty / Rev + exports. Chromium, or WebKit with RESPONSIVE_ENGINE=webkit.
// Usage: node scripts/responsive/check-ra-interact.mjs [viewportName]
import { launch, openPage, VIEWPORTS, ENGINE } from './lib.mjs'
const vp = VIEWPORTS.find(v => v.name === (process.argv[2] || 'iphone14-390x844'))
const { browser, ctx } = await launch(vp)
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e.message || e)))
let fail = 0
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' - ' + extra : ''}`) }
const act = async loc => { await loc.scrollIntoViewIfNeeded(); try { await loc.tap({ timeout: 8000 }) } catch { await loc.click() } await page.waitForTimeout(350) }
const sec = title => page.locator('section').filter({ has: page.locator('h2', { hasText: new RegExp(`^${title.replace(/[()]/g, '.')}`) }) }).first()
const dialog = () => page.locator('[role=dialog]').last()
const closeSheet = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(400) }
const height = async loc => Math.round((await loc.boundingBox())?.height || 0)
const clean = s => (s || '').replace(/\s+/g, ' ').trim()
const scrollTop = () => page.evaluate(() => document.querySelector('.page-scroll')?.scrollTop || 0)

// ── Sales → D2C: entry card ──
await openPage(page, '/sales/shopify')
const entry = page.locator('.ra-entry')
await entry.scrollIntoViewIfNeeded(); await page.waitForTimeout(1500)
const entryText = clean(await entry.innerText())
const pct = (txt, label) => (txt.match(new RegExp(`${label}\\s*([\\d.]+%)`, 'i')) || [])[1]
const dateBefore = clean(await page.locator('.topnav .drp-trigger').first().innerText())
const spot = await scrollTop()
await act(page.locator('.topnav button[aria-label="More actions"]').first())
check('D2C "⋯" has a Return analysis item', (await dialog().getByRole('button', { name: /^Return analysis/ }).count()) > 0)
await closeSheet()
await page.evaluate(v => { document.querySelector('.page-scroll').scrollTop = v }, spot)
await act(entry); await page.waitForTimeout(2200)
await page.waitForSelector('.master-tiles', { timeout: 240000 })
const tiles = clean(await page.locator('.master-tiles').innerText())
const dateAfter = clean(await page.locator('.topnav .drp-trigger').first().innerText())
const same = ['Return', 'Cancel', 'RTO', 'CIR'].every(l => pct(entryText, l) && tiles.includes(pct(entryText, l)))
check('entry card → Return Analysis, same numbers and dates', /return_analysis/.test(page.url()) && same && dateBefore === dateAfter, `${entryText.slice(0, 70)} · ${dateBefore} → ${dateAfter}`)
await act(page.locator('.topnav button[aria-label="Back"]'))
await page.waitForTimeout(2500)
const back = await scrollTop()
check('back arrow returns to Sales → D2C at the same scroll spot', /\/sales\/shopify/.test(page.url()) && !/return_analysis/.test(page.url()) && Math.abs(back - spot) < 40, `${spot} → ${back}px · ${page.url().split('5173')[1]}`)

// ── Return Analysis ──
await openPage(page, '/sales/shopify/return_analysis')
await page.waitForSelector('text=Exchange deep dive', { timeout: 240000 })
const fingerScroll = await page.evaluate(() => {
  let el = document.querySelector('.ra-mobile')
  while (el && el !== document.body) { const cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) return true; el = el.parentElement }
  return document.scrollingElement.scrollHeight > innerHeight + 1
})
check('the page scrolls by finger', fingerScroll)
if (vp.mobile && ENGINE === 'chromium') { // WebKit (Playwright) has no touch-drag or mobile wheel input; the scroll-box check above covers it
  const sc = page.locator('.page-scroll')
  const b = await sc.boundingBox()
  const t0 = await scrollTop()
  // a real finger drag: touch events through CDP on Chromium; WebKit uses mouse-wheel as stand-in
  if (ENGINE === 'chromium') {
    const cdp = await ctx.newCDPSession(page)
    const x = b.x + b.width / 2, y0 = b.y + b.height * 0.8, y1 = b.y + b.height * 0.2
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] })
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (y1 - y0) * i / 8 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  await page.waitForTimeout(600)
  check('a finger drag moves the page', (await scrollTop()) > t0 + 50, `${t0} → ${await scrollTop()}`)
  await page.evaluate(() => { document.querySelector('.page-scroll').scrollTop = 0 })
}
const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
check('no horizontal page scroll', !hScroll)
const inner = await page.evaluate(() => [...document.querySelectorAll('.ra-mobile *')].filter(el => { const cs = getComputedStyle(el); return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1 }).map(el => el.className || el.tagName))
check('no inner vertical scroll areas in the page', inner.length === 0, inner.slice(0, 3).join(', '))

// tiles → chart, no resize
const master = page.locator('.master-card')
const h0 = await height(master)
const heroLabels = []
for (const t of await page.locator('.master-tiles > *').all()) {
  await act(t)
  heroLabels.push(clean(await master.locator('[aria-live]').innerText()).split(' ')[0])
  if ((await height(master)) !== h0) { check('master card keeps its height', false, `${h0} → ${await height(master)}`); break }
}
check('6 tiles each switch the hero/chart; card keeps its height', new Set(heroLabels).size === 6 && (await height(master)) === h0, heroLabels.join(' | '))

// payment toggle
const pay = sec('By payment type'); const hp = await height(pay)
const payVals = []
for (const t of ['Cancel', 'RTO', 'CIR', 'Exch', 'Total']) { await act(pay.getByRole('tab', { name: t, exact: true })); payVals.push(clean(await pay.locator('button[style*="grid"], div[style*="grid"]').first().innerText())) }
check('payment toggle: 5 metrics, card keeps its height', new Set(payVals).size >= 4 && (await height(pay)) === hp, payVals.slice(0, 3).join(' | '))

// top products: payment chips (re-fetch), row → sheet, Show all + search
const tp = sec('Top products'); const ht = await height(tp)
const first = async () => clean(await tp.locator('.ranked-list > div:not([role=group]) > button').first().innerText())
const all0 = await first()
await act(tp.getByRole('button', { name: 'COD', exact: true })); await page.waitForTimeout(4000)
const cod = await first()
check('top products: COD chip re-ranks the list; card keeps its height', cod !== all0 && Math.abs((await height(tp)) - ht) <= 1, `${all0.slice(0, 40)} → ${cod.slice(0, 40)}`)
await act(tp.getByRole('button', { name: 'All', exact: true })); await page.waitForTimeout(4000)
await act(tp.locator('.ranked-list > div:not([role=group]) > button').first())
check('top product row → sheet with Cancel / RTO / CIR / Exchange', /BY TYPE/i.test(await dialog().innerText()) && /RTO %/.test(await dialog().innerText()))
await closeSheet()
await act(tp.getByRole('button', { name: /^Show all/ }))
const fsl = page.locator('.fullscreen-list')
const fslCount0 = clean(await fsl.innerText()).match(/([\d,]+) products/)?.[1]
await fsl.locator('input').fill('Pillow'); await page.waitForTimeout(500)
const fslCount1 = clean(await fsl.innerText()).match(/([\d,]+) products/)?.[1]
check('top products: Show all → full-screen list + search', fslCount0 && fslCount1 && fslCount1 !== fslCount0, `${fslCount0} → ${fslCount1}`)
await page.goBack(); await page.waitForTimeout(500)
check('Back closes the full-screen list', (await fsl.count()) === 0)

// category: toggle + every sort chip, no resize; row → sheet
// Category rows are compact (no sub-line), Sub-category rows are taller: the height is fixed per view.
const cat = sec('Category breakdown')
let catOk = true; const hv = {}
for (const v of ['Sub-category', 'Category']) {
  await act(cat.getByRole('tab', { name: v, exact: true })); hv[v] = await height(cat)
  for (const s of ['Total return %', 'Cancel %', 'RTO %', 'CIR %', 'Exchange %', 'Revenue']) { await act(cat.getByRole('button', { name: s, exact: true })); if ((await height(cat)) !== hv[v]) catOk = false }
}
check('category: 6 sorts in each view, card keeps its height per view', catOk, JSON.stringify(hv))
await act(cat.locator('.ranked-list > div:not([role=group]) > button').first())
check('category row → sheet lists its sub-categories', /SUB-CATEGORIES/i.test(await dialog().innerText()))
await closeSheet()
await act(cat.getByRole('tab', { name: 'Sub-category', exact: true }))
await act(cat.locator('.ranked-list > div:not([role=group]) > button').first())
check('sub-category row → sheet lists its SKUs', /SKUS/i.test(await dialog().innerText()))
await closeSheet()

// reasons → sub-reasons
const rs = sec('Return reasons')
const hr = await height(rs)
for (const k of ['CIR', 'Exch', 'All']) await act(rs.getByRole('tab', { name: k, exact: true }))
check('reasons: All / CIR / Exch toggle, card keeps its height', (await height(rs)) === hr)
await act(rs.getByRole('button', { name: 'Product', exact: true }))
await dialog().locator('input').first().fill('Orthotics Posture Corrector'); await page.waitForTimeout(400)
await act(dialog().locator('label').filter({ hasText: /^Orthotics Posture Corrector/ }).first())
await act(dialog().getByRole('button', { name: /^Apply/ }))
check('reasons: product slicer narrows to one product', /Orthotics Posture Corrector/.test(await rs.getByRole('button', { name: 'Product', exact: true }).innerText()))
await act(rs.locator('button[style*="grid"]').first())
const rsSheet = await dialog().innerText()
check('reason row → sheet with its sub-reasons', rsSheet.split('\n').filter(Boolean).length > 3, clean(rsSheet).slice(0, 60))
await closeSheet()

// cancellations: bar → sheet; sub-category picker
const cn = sec('Cancellations'); const hn = await height(cn)
await act(cn.locator('button[aria-label*=":"]').last())
check('cancellation bar → sheet with the day buckets', /0-1 days/.test(await dialog().innerText()) && /10\+ days/.test(await dialog().innerText()))
await closeSheet()
await act(cn.getByRole('button', { name: /All sub-categories/ }))
await dialog().locator('input[type=search], input:not([type])').first().fill('Orthotics Posture Corrector'); await page.waitForTimeout(400)
await act(dialog().locator('label').filter({ hasText: /^Orthotics Posture Corrector$/ }).first())
await act(dialog().getByRole('button', { name: /^Apply/ }))
const pickLabel = clean(await cn.getByRole('button', { name: /▾/ }).innerText())
check('sub-category picker filters the chart; card keeps its height', /Orthotics Posture Corrector/.test(pickLabel) && (await height(cn)) === hn, pickLabel)

// months: Show all 12, row → sheet
const mo = sec('Last 12 months')
await act(mo.getByRole('button', { name: /^Show all/ }))
const nMonths = await mo.locator('button').filter({ hasText: /-\d\d/ }).count()
await act(mo.locator('button').filter({ hasText: /-\d\d/ }).first())
check('12 months: Show all → 12 rows; row → sheet with all columns', nMonths === 12 && /EXCHANGE %/i.test(await dialog().innerText()), `${nMonths} rows`)
await closeSheet()

// exchange: sorts, row → "Exchanged to", Show all + search
const ex = sec('Exchange deep dive'); const he = await height(ex)
for (const s of ['Exch %', 'Exch ₹', 'Exch qty']) await act(ex.getByRole('button', { name: s, exact: true }))
check('exchange: 3 sorts, card keeps its height', (await height(ex)) === he)
await act(ex.locator('.ranked-list > div:not([role=group]) > button').first())
check('exchange row → sheet with "Exchanged to"', /EXCHANGED TO/i.test(await dialog().innerText()), clean(await dialog().innerText()).slice(0, 80))
await closeSheet()
await act(ex.getByRole('button', { name: /^Show all/ }))
await fsl.locator('input').fill('FR-OPC'); await page.waitForTimeout(500)
check('exchange: Show all → search by SKU', /FR-OPC/.test(await fsl.innerText()))
await page.goBack(); await page.waitForTimeout(500)

// header: filter sheet, ⋯ → Qty / Rev + exports
await page.evaluate(() => { document.querySelector('.page-scroll').scrollTop = 0 })
await act(page.locator('.topnav .sales-filter-btn, .topnav button[aria-label*="ilter"]').first())
check('filter icon opens the filter sheet', (await page.locator('[role=dialog]').count()) > 0)
await closeSheet(); await closeSheet()
await act(page.locator('.topnav button[aria-label="More actions"]').first())
const menuText = await dialog().innerText()
check('⋯ has Show by revenue / qty and both CSV exports', /Show by qty/.test(menuText) && /Category breakdown/.test(menuText) && /Exchange deep dive/.test(menuText))
await act(dialog().getByRole('button', { name: /^Show by qty/ }))
await page.waitForTimeout(400)
const cap = clean(await page.locator('.topnav .mph-caption').innerText())
const paySub = clean(await sec('By payment type').innerText())
check('Show by qty: header says "by qty", cards switch to units', /by qty/.test(cap) && /units/.test(paySub), cap)
await act(page.locator('.topnav button[aria-label="More actions"]').first())
await act(dialog().getByRole('button', { name: /^Show by revenue/ }))

check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
await browser.close()
console.log(`${ENGINE} ${vp.name}: ${fail ? fail + ' FAILED' : 'ALL PASS'}`)
process.exit(fail ? 1 : 0)
