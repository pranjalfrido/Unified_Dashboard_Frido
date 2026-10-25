// Interaction check for the mobile Overview Sales Trend card (src/overview/SalesTrendMobile.jsx).
// Real touch events via CDP: first screen, mid-scrub, after lift, after tapping a chip.
//
// Usage: node scripts/responsive/check-trend-mobile.mjs <outDir> [viewportName]
import { mkdirSync } from 'fs'
import { resolve } from 'path'
import { launch, openWithSept, waitStableText, repoRoot, VIEWPORTS } from './lib.mjs'

const [outArg, vpName = 'iphoneSE-375x667'] = process.argv.slice(2)
const outDir = resolve(repoRoot, outArg)
mkdirSync(outDir, { recursive: true })
const vp = VIEWPORTS.find(v => v.name === vpName)
const { browser, ctx } = await launch(vp)
const page = await ctx.newPage()
await openWithSept(page, '/overview')
await waitStableText(page)
const shot = async name => { await page.screenshot({ path: resolve(outDir, `${vpName}-${name}.png`) }); console.log('saved', name) }
const hero = async () => page.evaluate(() => {
  const live = document.querySelector('[aria-live="polite"]')
  return live ? live.innerText.replace(/\s+/g, ' ').trim() : null
})

await shot('1-first-screen')
console.log('hero (period):', await hero())
const fits = await page.evaluate(() => {
  const chips = document.querySelector('.trend-chip-row')?.getBoundingClientRect()
  const nav = document.querySelector('.bottom-nav')?.getBoundingClientRect()
  return { chipsBottom: Math.round(chips?.bottom), visibleBottom: Math.round(nav ? nav.top : innerHeight) }
})
console.log('chips row bottom', fits.chipsBottom, '<= visible bottom', fits.visibleBottom, '→ first screen:', fits.chipsBottom <= fits.visibleBottom)

const box = await page.locator('[role="img"][aria-label*="trend"]').boundingBox()
const cdp = await ctx.newCDPSession(page)
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
const yMid = box.y + box.height / 2
await touch('touchStart', box.x + box.width * 0.2, yMid)
for (let f = 0.2; f <= 0.45; f += 0.05) await touch('touchMove', box.x + box.width * f, yMid)
await page.waitForTimeout(200)
await shot('2-scrubbing')
console.log('hero (scrub):', await hero())
await touch('touchEnd')
await page.waitForTimeout(200)
await shot('3-released')
console.log('hero (after lift):', await hero())

await page.getByRole('button', { name: /^Orders/ }).tap()
await page.waitForTimeout(300)
await shot('4-orders-chip')
console.log('hero (orders chip):', await hero())
await browser.close()
