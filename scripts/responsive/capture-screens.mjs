// Full-page screenshots of one route at all 13 viewports, Sept 2026, plus per-viewport checks.
//
// Usage: node scripts/responsive/capture-screens.mjs <route> <outDir> [--only iphoneSE-375x667,...]
//   e.g. node scripts/responsive/capture-screens.mjs /overview docs/responsive/after/overview
//
// Writes <outDir>/<viewport>.png and <outDir>/report.json with, per viewport:
//   overflowX   - page wider than the viewport (document scrollWidth > innerWidth)
//   numbers     - number tokens rendered on the page (sorted), for before/after integrity diffs
import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { launch, openPage, openWithSept, waitStableText, numberTokens, repoRoot, VIEWPORTS } from './lib.mjs'

const [routeArg, outArg, ...rest] = process.argv.slice(2)
if (!routeArg || !outArg) throw new Error('usage: capture-screens.mjs <route> <outDir> [--only a,b]')
// Pass the route without its leading slash ("overview") from Git Bash on Windows: MSYS rewrites a
// bare "/overview" argument into "C:/Program Files/Git/overview" before node ever sees it.
const route = '/' + routeArg.replace(/^.*Git\//, '').replace(/^\/+/, '')
const outDir = resolve(repoRoot, outArg)
mkdirSync(outDir, { recursive: true })
const onlyIdx = rest.indexOf('--only')
const only = onlyIdx !== -1 ? new Set(rest[onlyIdx + 1].split(',')) : null
// --expand-all: open every collapsible Overview section (responsive/useCollapsible.js stores
// ui.section.<id>) before the page loads, so a full-page capture shows all content.
const expandAll = rest.includes('--expand-all')

// Runs in the page. .page-scroll has overflow-x:hidden, so content wider than the screen is cut
// off silently instead of making the page scroll sideways. Counts visible elements whose right edge
// passes the viewport edge, skipping anything inside its own horizontal scroller (a table that
// scrolls sideways on purpose is fine).
function clippedElements() {
  const root = document.querySelector('.page-scroll') || document.body
  const vw = window.innerWidth
  const inScroller = el => {
    for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX
      if (ox === 'auto' || ox === 'scroll') return true
    }
    return false
  }
  const hits = []
  for (const el of root.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0 || r.right <= vw + 1) continue
    if (inScroller(el)) continue
    hits.push(el)
  }
  // Report only the outermost offenders (their children overflow too, by definition).
  const top = hits.filter(el => !hits.some(o => o !== el && o.contains(el)))
  return {
    count: top.length,
    samples: top.slice(0, 5).map(el => `${el.tagName.toLowerCase()} "${(el.innerText || '').trim().slice(0, 40).replace(/\s+/g, ' ')}" right=${Math.round(el.getBoundingClientRect().right)}`),
  }
}

// Screenshots the viewport at each scroll position of .page-scroll, then composes one tall image:
// the first screen in full (nav + rail), then each further screen's content area at its offset.
async function stitchedScreenshot(page, outPath) {
  const box = await page.evaluate(() => {
    const el = document.querySelector('.page-scroll')
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, width: r.width, height: r.height, total: el.scrollHeight, vw: innerWidth, vh: innerHeight, bg: getComputedStyle(document.body).backgroundColor }
  })
  const tiles = []
  for (let y = 0; ; y += box.height) {
    const at = await page.evaluate(v => { const el = document.querySelector('.page-scroll'); el.scrollTop = v; return el.scrollTop }, y)
    await new Promise(r => setTimeout(r, 350))
    tiles.push({ at, png: (await page.screenshot()).toString('base64') })
    if (at + box.height >= box.total || at < y) break
  }
  await page.evaluate(() => { document.querySelector('.page-scroll').scrollTop = 0 })
  const height = Math.ceil(box.top + box.total)
  const composer = await page.context().browser().newPage({ viewport: { width: box.vw, height: 100 } })
  const dataUrl = await composer.evaluate(async ({ box, tiles, height }) => {
    const c = document.createElement('canvas')
    c.width = box.vw; c.height = height
    const g = c.getContext('2d')
    g.fillStyle = box.bg; g.fillRect(0, 0, c.width, c.height)
    const load = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + src })
    for (let i = 0; i < tiles.length; i++) {
      const img = await load(tiles[i].png)
      if (i === 0) g.drawImage(img, 0, 0)
      else g.drawImage(img, box.left, box.top, box.width, box.height, box.left, box.top + tiles[i].at, box.width, box.height)
    }
    return c.toDataURL('image/png')
  }, { box, tiles, height })
  await composer.close()
  const { writeFileSync: w } = await import('fs')
  w(outPath, Buffer.from(dataUrl.split(',')[1], 'base64'))
}

const report = { route, capturedAt: new Date().toISOString(), viewports: {} }
for (const vp of VIEWPORTS.filter(v => !only || only.has(v.name))) {
  const { browser, ctx } = await launch(vp)
  if (expandAll) await ctx.addInitScript(() => { for (const id of ['overview.salesTrend', 'overview.whereRevenue', 'overview.logistics', 'overview.business']) localStorage.setItem(`ui.section.${id}`, '1') })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e.message || e)))
  try {
    // NO_SEPT=1: pages without a date picker (Inventory) open on their default dates.
    if (process.env.NO_SEPT) await openPage(page, route); else await openWithSept(page, route)
    const text = await waitStableText(page)
    await page.evaluate(() => window.scrollTo(0, 0))
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    const clipped = await page.evaluate(clippedElements)
    // Move the pointer off the charts so no hover tooltip is frozen into the screenshot.
    await page.mouse.move(1, 1)
    if (vp.mobile && vp.width > vp.height) {
      // Phone landscape: Playwright's fullPage grows the viewport to the page height, which makes it
      // portrait and switches the landscape media queries off mid-capture. Scroll and stitch instead.
      await stitchedScreenshot(page, resolve(outDir, `${vp.name}.png`))
    } else {
      // The app scrolls inside .page-scroll (the shell is a fixed 100vh box), so a plain fullPage
      // screenshot only ever shows the first screen. Un-clip the shell for the capture only.
      await page.addStyleTag({ content: '.app-shell,.app-main,.app-main>div,.page-scroll{height:auto!important;max-height:none!important;overflow-x:clip!important;overflow-y:visible!important}' })
      await new Promise(r => setTimeout(r, 800))
      await page.screenshot({ path: resolve(outDir, `${vp.name}.png`), fullPage: true })
    }
    report.viewports[vp.name] = { overflowX, clipped, pageErrors: errors, numbers: numberTokens(text).sort() }
    console.log(`${vp.name.padEnd(32)} overflowX=${overflowX} clipped=${clipped.count} numbers=${report.viewports[vp.name].numbers.length} errors=${errors.length}`)
  } catch (e) {
    report.viewports[vp.name] = { error: String(e.message || e) }
    console.log(`${vp.name.padEnd(32)} FAILED: ${e.message}`)
  }
  await browser.close()
  // Rapid back-to-back browser launches took the Vite dev server down during the Phase 0 sweep.
  await new Promise(r => setTimeout(r, 1500))
}
writeFileSync(resolve(outDir, 'report.json'), JSON.stringify(report, null, 2))
console.log(`wrote ${outDir}`)
const failed = Object.entries(report.viewports).filter(([, v]) => v.error).map(([k]) => k)
if (failed.length) { console.error(`FAILED viewports: ${failed.join(', ')}`); process.exit(1) }
