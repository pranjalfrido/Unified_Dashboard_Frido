// Desktop-unchanged proof for refactors: full-page laptop (1366) screenshots of routes with
// animations and transitions off (they otherwise catch the tab underline mid-animation).
// Usage: [SEPT=1] node scripts/responsive/laptop-same.mjs <outDir> route,route…   then pixel-diff two outDirs.
import { launch, openPage, openWithSept, waitStableText, VIEWPORTS } from './lib.mjs'
import { mkdirSync } from 'fs'
const [out, list] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
for (const r of list.split(',')) {
  // VIEWPORT=<name>: same capture at another size (e.g. iphone14-390x844); default laptop 1366
  const vp = VIEWPORTS.find(v => v.name === (process.env.VIEWPORT || 'laptop-1366x768'))
  const { browser, ctx } = await launch(vp)
  const page = await ctx.newPage()
  // STATIC_INV=1: use the static inv-data file even when the local copy is older than 2 hours (asOf only)
  if (process.env.STATIC_INV) await page.route('**/inv-data-*.json', async q => {
    const res = await q.fetch(); const j = await res.json()
    await q.fulfill({ response: res, json: { ...j, asOf: new Date().toISOString() } })
  })
  const path = '/' + r.replace(/^.*Git\//, '').replace(/^\/+/, '')
  if (process.env.SEPT) await openWithSept(page, path); else await openPage(page, path) // SEPT=1: Sept 2026
  await waitStableText(page)
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none !important;transition:none !important} .alerts-badge{visibility:hidden !important}' })
  // HIDE_SCROLLBARS=1: leave scrollbar pixels out of a before/after diff (e.g. after a scrollbar colour change)
  if (process.env.HIDE_SCROLLBARS) await page.addStyleTag({ content: '::-webkit-scrollbar{display:none !important} *{scrollbar-width:none !important}' })
  await page.mouse.move(1, 760); await page.waitForTimeout(500)
  // the app scrolls inside .page-scroll: unclip it so the full page is captured
  await page.addStyleTag({ content: 'html,body,#root,.app-shell,.app-main{height:auto !important;overflow:visible !important} .page-scroll{height:auto !important;overflow:visible !important;flex:none !important}' })
  // unclipping resizes chart containers, and Recharts re-draws its lines (JS animation, ~1.5s)
  await page.waitForTimeout(3000)
  // grow the viewport to the page height instead of fullPage: Chromium's fullPage capture briefly
  // resizes the window to 1x1, which (correctly) flips width-based mobile layouts and re-mounts charts
  await page.setViewportSize({ width: vp.width, height: await page.evaluate(() => document.documentElement.scrollHeight) })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${out}/${r.replace(/^.*Git\//, '').replace(/[/]/g, '-')}.png` })
  await browser.close()
}
