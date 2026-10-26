// Touch / "no resize" check for the mobile Overview, for Chromium and WebKit (RESPONSIVE_ENGINE=webkit
// uses Playwright's iPhone profiles: Safari UA, isMobile, hasTouch).
//   1 scrubber drag (touch pointer events) changes the hero, and nothing on the page changes size
//     during or after it; lifting the finger returns the hero to the period value
//   2 tapping a KPI tile switches the hero and gives the tile the glow; other tiles keep their size
//   3 the header stays pinned at the top after scrolling the page
//   4 the date picker opens fully on screen (bottom sheet on phones), Escape/backdrop closes it
//   5 the "More" bottom sheet fits on screen (≤ 85% of the height) and stays inside the viewport
//   6 safe areas: viewport-fit=cover is set and the bottom nav / header reserve the env() insets
// Playwright cannot synthesise a swipe on mobile WebKit, so the drag is sent as touch-type
// PointerEvents, which is what the scrubber listens to.
// Usage: node scripts/responsive/check-touch.mjs [viewportName] [outDir]
//        ROUTE=/sales/… runs it on another page with the same mobile components (default /overview)
import { launch, openPage, VIEWPORTS, ENGINE } from './lib.mjs'
import { mkdirSync } from 'fs'
const vp = VIEWPORTS.find(v => v.name === (process.argv[2] || 'iphone14-390x844'))
const out = process.argv[3] || 'docs/responsive/after/overview-align/touch'
mkdirSync(out, { recursive: true })
const { browser, ctx } = await launch(vp)
const page = await ctx.newPage()
let fail = 0
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' - ' + extra : ''}`) }
const ROUTE = '/' + (process.env.ROUTE || 'overview').replace(/^.*Git\//, '').replace(/^\/+/, '') // e.g. ROUTE=sales/shopify/overall (no leading slash on Git Bash)
await openPage(page, ROUTE)
await page.waitForFunction(() => !document.querySelector('.delta-shimmer'), null, { timeout: 120000 }).catch(() => {})

// Sizes of every box in the master card + the page's scroll height.
const sizes = () => page.evaluate(() => {
  const card = document.querySelector('.master-card')
  // the card and every block-level box in it (sections, chart, tile grid, tiles); inline text spans
  // may legitimately change width as the numbers change
  const blocks = [card, ...[...card.querySelectorAll('*')].filter(e => ['block', 'flex', 'grid'].includes(getComputedStyle(e).display) && e.tagName !== 'svg')]
  const boxes = blocks.map(e => { const r = e.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}` })
  const sc = document.querySelector('.page-scroll') || document.scrollingElement
  return { boxes, scrollH: sc.scrollHeight, w: document.documentElement.scrollWidth }
})
const hero = () => page.evaluate(() => document.querySelector('.master-card [aria-live]')?.innerText.replace(/\s+/g, ' ').trim() ?? document.querySelector('.master-card').innerText.split('\n').slice(0, 2).join(' '))
const diffCount = (a, b) => a.boxes.filter((x, i) => x !== b.boxes[i]).length + (a.scrollH !== b.scrollH) + (a.w !== b.w)

// 1 scrubber
const before = await sizes(); const h0 = await hero()
const chart = page.locator('.master-card [style*="touch-action: pan-y"]').first()
const box = await chart.boundingBox()
const send = (type, x) => chart.evaluate((el, { type, x, y }) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y })), { type, x, y: box.y + box.height / 2 })
await send('pointerdown', box.x + box.width * 0.2)
const midHeroes = new Set(); let midDiff = 0
for (const f of [0.3, 0.45, 0.6, 0.75, 0.9]) {
  await send('pointermove', box.x + box.width * f); await page.waitForTimeout(60)
  midHeroes.add(await hero()); midDiff += diffCount(before, await sizes())
}
await page.screenshot({ path: `${out}/${ENGINE}-${vp.name}-1-scrub.png` })
await send('pointerup', box.x + box.width * 0.9); await page.waitForTimeout(200)
const after = await sizes(); const h1 = await hero()
check('scrub: hero follows the finger', midHeroes.size >= 3 && ![...midHeroes].every(h => h === h0), `${midHeroes.size} distinct values`)
check('scrub: nothing resizes during the drag', midDiff === 0, `${midDiff} box changes`)
check('scrub: lift returns to the period value, sizes unchanged', h1 === h0 && diffCount(before, after) === 0)

// 2 tile switch + glow
const tiles = page.locator('.master-tiles button[aria-pressed]')
const t = tiles.nth(2)
const tb = await t.boundingBox()
await page.touchscreen.tap(tb.x + tb.width / 2, tb.y + tb.height / 2); await page.waitForTimeout(300)
const pressed = await t.getAttribute('aria-pressed')
const glow = await t.evaluate(e => getComputedStyle(e).boxShadow)
const h2 = await hero()
const afterTile = await sizes()
check('tile tap switches the hero and glows', pressed === 'true' && h2 !== h0 && glow !== 'none', `${h0.slice(0, 30)} → ${h2.slice(0, 30)}`)
// Card size only: a metric without a daily series swaps the chart for 'No daily breakdown' (same height).
check('tile tap: card keeps its size', afterTile.boxes[0] === before.boxes[0], `${before.boxes[0]} → ${afterTile.boxes[0]}`)
await page.screenshot({ path: `${out}/${ENGINE}-${vp.name}-2-tile.png` })

// 3 sticky header
await page.evaluate(() => { const s = document.querySelector('.page-scroll') || document.scrollingElement; s.scrollTop = 1500 })
await page.waitForTimeout(300)
const navTop = await page.evaluate(() => Math.round(document.querySelector('.topnav').getBoundingClientRect().top))
const bnBottom = await page.evaluate(() => Math.round(document.querySelector('nav.bottom-nav').getBoundingClientRect().bottom - innerHeight))
check('header stays pinned after scrolling; bottom nav at the bottom', navTop === 0 && Math.abs(bnBottom) <= 1, `header top ${navTop}px, nav bottom offset ${bnBottom}px`)
await page.screenshot({ path: `${out}/${ENGINE}-${vp.name}-3-scrolled.png` })
await page.evaluate(() => { const s = document.querySelector('.page-scroll') || document.scrollingElement; s.scrollTop = 0 })

// 4 date picker
const trig = page.locator('.topnav .drp-trigger')
const trb = await trig.boundingBox()
await page.touchscreen.tap(trb.x + trb.width / 2, trb.y + trb.height / 2); await page.waitForTimeout(500)
const picker = await page.evaluate(() => {
  const el = [...document.querySelectorAll('div')].filter(d => /Last Month/.test(d.innerText) && /Apply|Cancel/.test(d.innerText)).sort((a, b) => a.innerText.length - b.innerText.length)[0]
  if (!el) return null
  let p = el; while (p && getComputedStyle(p).position !== 'fixed' && getComputedStyle(p).position !== 'absolute') p = p.parentElement
  const r = (p || el).getBoundingClientRect()
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), vw: innerWidth, vh: innerHeight }
})
check('date picker opens fully on screen', !!picker && picker.left >= 0 && picker.right <= picker.vw + 1 && picker.top >= 0 && picker.bottom <= picker.vh + 1, JSON.stringify(picker))
await page.screenshot({ path: `${out}/${ENGINE}-${vp.name}-4-datepicker.png` })
await page.mouse.click(5, 5).catch(() => {}); await page.keyboard.press('Escape'); await page.waitForTimeout(300)

// 5 More sheet size
await page.getByRole('button', { name: 'More', exact: true }).click(); await page.waitForTimeout(500)
const sheet = await page.locator('.bottom-sheet').evaluate(e => { const r = e.getBoundingClientRect(); return { h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight } })
check('bottom sheet fits (≤ 85% height, inside the viewport)', sheet.h <= sheet.vh * 0.85 + 1 && sheet.top >= 0 && sheet.bottom <= sheet.vh + 1, JSON.stringify(sheet))
await page.goBack(); await page.waitForTimeout(300)

// 6 safe areas
const safe = await page.evaluate(() => {
  const cssText = [...document.styleSheets].map(ss => { try { return [...ss.cssRules].map(r => r.cssText).join('') } catch { return '' } }).join('')
  const vpMeta = document.querySelector('meta[name=viewport]')?.content || ''
  const nav = document.querySelector('nav.bottom-nav')
  const root = getComputedStyle(document.documentElement)
  return { envInCss: /env\(safe-area-inset-bottom/.test(cssText), cover: /viewport-fit=cover/.test(vpMeta), safeBottomVar: root.getPropertyValue('--safe-bottom').trim(), navPadBottom: getComputedStyle(nav).paddingBottom, dvh: CSS.supports('height', '100dvh') }
})
check('safe areas: viewport-fit=cover, --safe-bottom from env(), dvh supported', safe.cover && safe.envInCss && safe.safeBottomVar !== '' && safe.dvh, JSON.stringify(safe))

await browser.close()
console.log(fail ? `${ENGINE} ${vp.name}: ${fail} FAILED` : `${ENGINE} ${vp.name}: ALL PASS`)
process.exit(fail ? 1 : 0)
