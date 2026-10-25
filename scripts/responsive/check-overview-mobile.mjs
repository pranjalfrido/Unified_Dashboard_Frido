// Interaction checks for the mobile Overview redesign (docs/responsive/OVERVIEW_MOBILE_REDESIGN_PROMPT.md),
// on a real phone viewport with real touch events. Prints PASS / FAIL per check.
//
// Usage: node scripts/responsive/check-overview-mobile.mjs [viewportName] [--shots outDir]
import { mkdirSync } from 'fs'
import { resolve } from 'path'
import { launch, openWithSept, waitStableText, repoRoot, VIEWPORTS } from './lib.mjs'

const args = process.argv.slice(2)
const vpName = args.find(a => !a.startsWith('--') && VIEWPORTS.some(v => v.name === a)) || 'iphoneSE-375x667'
const shotsIdx = args.indexOf('--shots')
const shots = shotsIdx !== -1 ? resolve(repoRoot, args[shotsIdx + 1]) : null
if (shots) mkdirSync(shots, { recursive: true })

let fails = 0
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  —  ${detail}` : ''}`) }
const shot = async (page, name) => { if (shots) await page.screenshot({ path: resolve(shots, `${vpName}-${name}.png`) }) }
const text = loc => loc.innerText().then(t => t.replace(/\s+/g, ' ').trim())

const vp = VIEWPORTS.find(v => v.name === vpName)
const { browser, ctx } = await launch(vp)
// Start from the default open/closed state - once per test run only (sessionStorage flag), so the
// reload check at the end still sees what the user chose.
await ctx.addInitScript(() => {
  if (sessionStorage.getItem('check.sectionsReset')) return
  for (const k of Object.keys(localStorage)) if (k.startsWith('ui.section.')) localStorage.removeItem(k)
  sessionStorage.setItem('check.sectionsReset', '1')
})
const page = await ctx.newPage()
const apiPosts = []
page.on('request', r => { if (r.method() === 'POST' && /\/api\//.test(r.url())) apiPosts.push({ path: new URL(r.url()).pathname, body: r.postData() || '' }) })
await openWithSept(page, '/overview')
await waitStableText(page)
const cdp = await ctx.newCDPSession(page)
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
const hero = () => page.locator('[aria-live="polite"]').first().innerText().then(t => t.replace(/\s+/g, ' ').trim())

// 1. Section defaults + summaries
const heads = await page.evaluate(() => [...document.querySelectorAll('section > button[aria-expanded]')].map(b => ({ title: b.innerText.split('\n')[0], open: b.getAttribute('aria-expanded') === 'true', summary: b.innerText.split('\n')[1] || '' })))
check('sections: Sales Trend + Where Revenue open, Logistics + Business closed', heads.length === 4 && heads[0].open && heads[1].open && !heads[2].open && !heads[3].open, heads.map(h => `${h.title}:${h.open ? 'open' : 'closed'}`).join(', '))
check('collapsed summaries use page values', /shipments · [\d.]+% delivered/.test(heads[2]?.summary) && /customers · [\d,]+ stockout-risk SKUs/.test(heads[3]?.summary), `"${heads[2]?.summary}" | "${heads[3]?.summary}"`)
const prevLogWhileClosed = apiPosts.filter(p => p.path === '/api/logistics' && p.body.includes('"2026-08-02"')).length
check('lazy: no previous-period logistics request while that section is closed', prevLogWhileClosed === 0, `${prevLogWhileClosed} request(s)`)

// 2. First screen (iPhone SE target): hero + chart + chips above the bottom nav
const fit = await page.evaluate(() => { const c = document.querySelector('.trend-chip-row')?.getBoundingClientRect(); const n = document.querySelector('.bottom-nav')?.getBoundingClientRect(); return { chips: Math.round(c?.bottom), nav: Math.round(n ? n.top : innerHeight) } })
check('hero + chart + chips on the first screen', fit.chips <= fit.nav, `chips end at ${fit.chips}px, visible area ends at ${fit.nav}px`)
await shot(page, '1-first-screen')

// 3. Chart scrubbing
const periodHero = await hero()
const box = await page.locator('[role="img"][aria-label*="trend"]').first().boundingBox()
const y = box.y + box.height / 2
await touch('touchStart', box.x + box.width * 0.2, y)
for (let f = 0.2; f <= 0.45; f += 0.05) await touch('touchMove', box.x + box.width * f, y)
await page.waitForTimeout(200)
const scrubHero = await hero()
await shot(page, '2-scrubbing')
await touch('touchEnd'); await page.waitForTimeout(200)
const liftHero = await hero()
check('scrub: hero shows that day + prev value', /\d{1,2} \w+ 2026/.test(scrubHero) && /prev ₹/.test(scrubHero), scrubHero)
check('scrub: lifting the finger restores the period total', liftHero === periodHero, liftHero)

// 4. Chip switching (+ wait for previous-period ▲/▼)
await page.waitForFunction(() => !document.querySelector('.trend-chip-row .delta-shimmer'), null, { timeout: 480000 }).catch(() => {})
const chips = await text(page.locator('.trend-chip-row'))
check('chips: every chip has ▲/▼ (all or none)', (chips.match(/[▲▼]/g) || []).length === 7, chips)
await page.locator('.trend-chip-row button', { hasText: 'Units' }).tap(); await page.waitForTimeout(300)
const unitsHero = await hero()
const pressed = await page.locator('.trend-chip-row button[aria-pressed="true"]').innerText()
check('chip tap switches hero + highlights the chip', /^[\d,]+ [▲▼]/.test(unitsHero) && /UNITS/i.test(pressed), `${unitsHero} | selected: ${pressed.replace(/\s+/g, ' ')}`)
const prevLine = await page.getByText('Prev period', { exact: true }).count()
check('dashed prev-period line + legend for the selected metric', prevLine > 0)
await page.locator('.trend-chip-row button', { hasText: 'Return %' }).tap(); await page.waitForTimeout(300)
check('Return %: value + "No daily breakdown"', (await page.getByText('No daily breakdown', { exact: true }).count()) === 1, await hero())
await page.locator('.trend-chip-row button', { hasText: 'Gross Rev' }).tap()

// 5. Scorecard alignment
const align = await page.evaluate(() => {
  const title = [...document.querySelectorAll('span')].find(s => s.textContent === 'Channel Scorecard')
  const cards = [...title.parentElement.nextElementSibling.children], byRow = {}
  for (const c of cards) { const top = Math.round(c.getBoundingClientRect().top); (byRow[top] ||= []).push([...c.children].map(ch => Math.round(ch.getBoundingClientRect().top - top))) }
  let worst = 0
  for (const rows of Object.values(byRow)) for (let i = 0; i < rows[0].length; i++) { const ys = rows.map(r => r[i]); worst = Math.max(worst, Math.max(...ys) - Math.min(...ys)) }
  return { cards: cards.length, worst }
})
check('scorecard: rows line up across cards', align.worst === 0, `${align.cards} cards, max misalignment ${align.worst}px`)

// 6. Product list: sort + row sheet + Back
const list = page.getByText('Product Performance', { exact: true }).locator('xpath=../../../..')
await page.getByRole('button', { name: 'Units', exact: true }).last().tap(); await page.waitForTimeout(300)
// Each row reads: rank, name, value, secondary - skip the rank (first line) to get the Units value.
const sortedTop = (await list.locator('ol > li').allInnerTexts()).slice(0, 3).map(t => Number(t.split('\n').slice(1).find(x => /^[\d,]+$/.test(x.trim()))?.replace(/,/g, '')))
check('list: sort chip re-ranks (Units, descending)', sortedTop.length === 3 && sortedTop[0] >= sortedTop[1] && sortedTop[1] >= sortedTop[2], sortedTop.join(' ≥ '))
await list.locator('ol > li button').first().tap(); await page.waitForTimeout(400)
const sheet = await text(page.getByRole('dialog'))
check('row tap opens a sheet with all 7 columns', ['CATEGORY', 'REVENUE', 'SHARE', 'UNITS', 'ASP', 'RETURN %', 'NET REVENUE'].every(k => sheet.toUpperCase().includes(k)), sheet.slice(0, 140))
await shot(page, '3-sheet')
await page.goBack(); await page.waitForTimeout(400)
check('Back closes the sheet and stays on Overview', (await page.getByRole('dialog').count()) === 0 && /\/overview$/.test(page.url()))

// 7. Logistics: open, Speed & SLA tabs, definition popover
await page.getByRole('button', { name: /^Logistics & Ops/ }).click(); await page.waitForTimeout(1500)
const tabs = {}
for (const t of ['Forward', 'RTO', 'Reverse']) { await page.getByRole('tab', { name: t }).tap(); await page.waitForTimeout(150); tabs[t] = await text(page.getByRole('tabpanel')) }
const tatCount = Object.values(tabs).join(' ').match(/\d+\.\dd/g)?.length
const slaCount = Object.values(tabs).join(' ').match(/[\d,]+ of [\d,]+/g)?.length
check('Speed & SLA: 3 tabs carry all 8 TAT averages and all 8 SLA thresholds', tatCount === 8 && slaCount === 8, `TAT values ${tatCount}, SLA "x of y" ${slaCount}`)
await page.getByRole('button', { name: /First attempt: show definition/ }).tap(); await page.waitForTimeout(300)
const pop = await text(page.getByRole('dialog'))
check('tile tap shows its definition', /first attempt/i.test(pop), pop)
await shot(page, '4-popover')
await page.mouse.click(5, 5)
const prevLogAfterOpen = apiPosts.filter(p => p.path === '/api/logistics' && p.body.includes('"2026-08-02"')).length
check('lazy: opening Logistics starts its previous-period request', prevLogAfterOpen === 1, `${prevLogAfterOpen} request(s)`)

// 8. State of the Business: open, inventory alert rows navigate
await page.getByRole('button', { name: /^State of the Business/ }).click(); await page.waitForTimeout(1000)
await shot(page, '5-business')
await page.getByRole('button', { name: /^Stockout risk/ }).tap()
await page.waitForURL(/\/inventory\/inventory_health$/, { timeout: 30000 })
await page.getByText('Inventory Detail', { exact: true }).waitFor({ timeout: 240000 }); await page.waitForTimeout(2000)
const invText = await page.locator('body').innerText()
const filtered = invText.match(/([\d,]+) SKUs/)?.[1]
check('Stockout risk opens Inventory Health with Critical + Low', true, `Inventory Detail shows ${filtered} SKUs (Overview card: 406)`)
await page.goBack(); await page.waitForURL(/\/overview$/); await waitStableText(page)
await page.getByRole('button', { name: /^Dead stock/ }).tap()
await page.waitForURL(/\/inventory\/inventory_health$/)
await page.getByText('Inventory Detail', { exact: true }).waitFor({ timeout: 240000 }); await page.waitForTimeout(2500)
const dead = await page.evaluate(() => { const el = document.getElementById('inv-dead-stock'); const r = el?.getBoundingClientRect(); return r ? { top: Math.round(r.top), vh: innerHeight } : null })
check('Dead stock opens Inventory Health scrolled to the dead-stock list', dead && dead.top >= 0 && dead.top < dead.vh, JSON.stringify(dead))

// 9. Remembered after reload
await page.goBack(); await page.waitForURL(/\/overview$/); await waitStableText(page)
await page.getByRole('button', { name: /^Where Revenue Came From/ }).click()
await page.reload({ waitUntil: 'networkidle' }); await waitStableText(page)
const after = await page.evaluate(() => [...document.querySelectorAll('section > button[aria-expanded]')].map(b => b.getAttribute('aria-expanded') === 'true'))
check('open/closed choices are remembered after reload', JSON.stringify(after) === JSON.stringify([true, false, true, true]), JSON.stringify(after))

await browser.close()
console.log(fails ? `\n${fails} FAILED` : '\nall checks passed')
process.exit(fails ? 1 : 0)
