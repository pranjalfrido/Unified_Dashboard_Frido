// First screen (viewport only) of a route at a few sizes, for exact before/after pixel diffs of
// shared chrome (header, nav). Usage: node scripts/responsive/capture-first-screen.mjs <route> <outDir> [viewports,comma]
import { launch, openPage, VIEWPORTS, ENGINE } from './lib.mjs'
import { mkdirSync } from 'fs'
const [route, out, list] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const names = (list || 'iphoneSE-375x667,iphone14-390x844,iphone14-landscape-844x390,laptop-1366x768').split(',')
for (const n of names) {
  const vp = VIEWPORTS.find(v => v.name === n)
  const { browser, ctx } = await launch(vp)
  const page = await ctx.newPage()
  await openPage(page, '/' + route.replace(/^.*Git\//, '').replace(/^\/+/, ''))
  await page.waitForFunction(() => !document.querySelector('.delta-shimmer, .m-skeleton'), null, { timeout: 180000 }).catch(() => {})
  // Hide live numbers that change between loads (alerts count) so only layout and chrome compare.
  await page.addStyleTag({ content: '.alerts-badge{visibility:hidden !important}' })
  await page.screenshot({ path: `${out}/${ENGINE}-${n}.png` })
  const h = await page.evaluate(() => Math.round(document.querySelector('.topnav').getBoundingClientRect().height))
  console.log(`${n}: header ${h}px`)
  await browser.close()
}
