// Alignment check for the mobile Channel Scorecard (src/overview/ChannelScorecardMobile.jsx):
// cards in the same grid row must have every internal row (name, value, bar, share text, divider,
// stats) at the same y position. Prints the max misalignment per viewport.
//
// Usage: node scripts/responsive/check-scorecard-align.mjs [viewportName ...] [--shot outDir]
import { resolve } from 'path'
import { launch, openWithSept, waitStableText, repoRoot, VIEWPORTS } from './lib.mjs'

const args = process.argv.slice(2)
const shotIdx = args.indexOf('--shot')
const shotDir = shotIdx !== -1 ? resolve(repoRoot, args[shotIdx + 1]) : null
const names = args.filter((a, i) => !a.startsWith('--') && i !== shotIdx + 1)
for (const name of names.length ? names : ['iphoneSE-375x667', 'tablet-768x1024']) {
  const vp = VIEWPORTS.find(v => v.name === name)
  const { browser, ctx } = await launch(vp)
  const page = await ctx.newPage()
  await openWithSept(page, '/overview')
  await waitStableText(page)
  const r = await page.evaluate(() => {
    const title = [...document.querySelectorAll('span')].find(s => s.textContent === 'Channel Scorecard')
    const grid = title?.parentElement?.nextElementSibling
    if (!grid) return { error: 'scorecard not found' }
    const cards = [...grid.children]
    const byRow = {}
    for (const c of cards) {
      const top = Math.round(c.getBoundingClientRect().top)
      ;(byRow[top] ||= []).push([...c.children].map(ch => Math.round(ch.getBoundingClientRect().top - top)))
    }
    let worst = 0
    for (const rows of Object.values(byRow)) {
      for (let i = 0; i < rows[0].length; i++) {
        const ys = rows.map(r => r[i])
        worst = Math.max(worst, Math.max(...ys) - Math.min(...ys))
      }
    }
    return { cards: cards.length, gridRows: Object.keys(byRow).length, maxMisalignPx: worst }
  })
  console.log(name.padEnd(30), JSON.stringify(r))
  if (shotDir) {
    const el = page.getByText('Channel Scorecard', { exact: true }).locator('xpath=../..')
    await el.screenshot({ path: resolve(shotDir, `scorecard-${name}.png`) })
  }
  await browser.close()
}
