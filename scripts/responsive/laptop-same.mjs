// Desktop-unchanged proof for refactors: full-page laptop (1366) screenshots of routes with
// animations and transitions off (they otherwise catch the tab underline mid-animation).
// Usage: node scripts/responsive/laptop-same.mjs <outDir> route,route…   then pixel-diff two outDirs.
import { launch, openPage, waitStableText, VIEWPORTS } from './lib.mjs'
import { mkdirSync } from 'fs'
const [out, list] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
for (const r of list.split(',')) {
  const { browser, ctx } = await launch(VIEWPORTS.find(v => v.name === 'laptop-1366x768'))
  const page = await ctx.newPage()
  await openPage(page, '/' + r.replace(/^.*Git\//, '').replace(/^\/+/, ''))
  await waitStableText(page)
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none !important;transition:none !important} .alerts-badge{visibility:hidden !important}' })
  await page.mouse.move(1, 760); await page.waitForTimeout(500)
  // the app scrolls inside .page-scroll: unclip it so the full page is captured
  await page.addStyleTag({ content: 'html,body,#root,.app-shell,.app-main{height:auto !important;overflow:visible !important} .page-scroll{height:auto !important;overflow:visible !important;flex:none !important}' })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${out}/${r.replace(/^.*Git\//, '').replace(/[/]/g, '-')}.png`, fullPage: true })
  await browser.close()
}
