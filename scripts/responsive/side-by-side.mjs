// Side-by-side: the Sales mockup (docs/responsive/mockups/sales_mobile_mockup.html) next to the live
// Overview at the same phone width, for the shared parts: header, master card, ranked list, bottom nav.
// Writes <outDir>/sbs-<part>-<viewport>.png (left = mockup, right = Overview).
// Usage: node scripts/responsive/side-by-side.mjs [viewportName] [outDir]  (RESPONSIVE_ENGINE=webkit ok)
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { pathToFileURL } from 'url'
import { launch, openPage, VIEWPORTS, ENGINE, repoRoot } from './lib.mjs'

const vp = VIEWPORTS.find(v => v.name === (process.argv[2] || 'iphone14-390x844'))
const out = resolve(repoRoot, process.argv[3] || 'docs/responsive/after/overview-align/side-by-side')
mkdirSync(out, { recursive: true })

// 1 mockup parts
const mb = await chromium.launch()
const mp = await mb.newPage({ viewport: { width: vp.width, height: 900 } })
await mp.goto(pathToFileURL(resolve(repoRoot, 'docs/responsive/mockups/sales_mobile_mockup.html')).href)
await mp.waitForTimeout(800)
const mock = {}
await mp.evaluate(() => { const b = [...document.querySelectorAll('#cpToggle button')].find(x => x.dataset.v === 'prod'); b?.click() })
await mp.waitForTimeout(300)
for (const [part, sel] of [['header', '#phone .top'], ['master', '#master'], ['list', '#cpList'], ['nav', '#phone .nav']]) {
  const el = mp.locator(sel).first()
  mock[part] = (await el.screenshot()).toString('base64')
}
await mb.close()

// 2 Overview parts
const { browser, ctx } = await launch(vp)
const page = await ctx.newPage()
await openPage(page, '/overview')
await page.waitForFunction(() => !document.querySelector('.delta-shimmer'), null, { timeout: 120000 }).catch(() => {})
const ours = {}
for (const [part, sel] of [['header', '.topnav'], ['master', '.master-card'], ['list', '.ranked-list'], ['nav', 'nav.bottom-nav']]) {
  const el = page.locator(sel).first()
  await el.evaluate(e => e.scrollIntoView({ block: 'start' }))
  await page.waitForTimeout(200)
  // Element shots of tall boxes are unreliable on WebKit: clip a viewport-sized shot instead.
  const b = await el.boundingBox()
  ours[part] = (await page.screenshot({ clip: { x: b.x, y: Math.max(0, b.y), width: b.width, height: Math.min(b.height, vp.height - Math.max(0, b.y)) } })).toString('base64')
}
await browser.close()

// 3 compose
const cb = await chromium.launch()
const cp = await cb.newPage({ viewport: { width: vp.width * 2 + 60, height: 400 } })
for (const part of Object.keys(mock)) {
  await cp.setContent(`<body style="margin:0;background:#e9e7e1;font:600 13px system-ui"><div style="display:flex;gap:20px;padding:20px;align-items:flex-start">
    <div><div style="margin-bottom:6px">Sales mockup</div><img src="data:image/png;base64,${mock[part]}"></div>
    <div><div style="margin-bottom:6px">Overview (${ENGINE})</div><img src="data:image/png;base64,${ours[part]}"></div></div></body>`)
  await cp.waitForTimeout(200)
  await cp.screenshot({ path: `${out}/sbs-${part}-${ENGINE}-${vp.name}.png`, fullPage: true })
  console.log('wrote', `sbs-${part}-${ENGINE}-${vp.name}.png`)
}
await cb.close()
