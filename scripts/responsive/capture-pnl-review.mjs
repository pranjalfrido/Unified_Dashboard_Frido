// Screens touched by PNL_REVIEW_FIXES.md, page default range (live API), for before / after:
//   phones  D2C Financial view card (Revenue, then Returns %), a product sheet, and the four tools
//           (Price Simulator, Breakeven ROAS from D2C; B2B Costing, PO Approval from Offline)
//   laptop  D2C Financial View table and the four tools
// Usage: node scripts/responsive/capture-pnl-review.mjs <outDir> [viewport,...]
//   default viewports: iphoneSE-375x667,iphone14-390x844,laptop-1366x768
// Also writes <outDir>/report.json: page scrollWidth vs clientWidth (overflow) for every screen.
import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { launch, openPage, repoRoot, VIEWPORTS } from './lib.mjs'

const [outArg, vpArg] = process.argv.slice(2)
if (!outArg) throw new Error('usage: capture-pnl-review.mjs <outDir> [viewports]')
const outDir = resolve(repoRoot, outArg)
mkdirSync(outDir, { recursive: true })
const names = (vpArg || 'iphoneSE-375x667,iphone14-390x844,laptop-1366x768').split(',')
const pause = ms => new Promise(r => setTimeout(r, ms))
const UNCLIP = '.app-shell,.app-main,.app-main>div,.page-scroll{height:auto!important;max-height:none!important;overflow-x:clip!important;overflow-y:visible!important}'

const overflow = page => page.evaluate(() => {
  const el = document.querySelector('.page-scroll') || document.documentElement
  return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, docScrollWidth: document.documentElement.scrollWidth, innerWidth }
})
const full = async (page, file) => {
  const tag = await page.addStyleTag({ content: UNCLIP })
  await pause(600)
  await page.screenshot({ path: resolve(outDir, file), fullPage: true })
  await tag.evaluate(n => n.remove())
  await pause(300)
}

const report = {}
for (const name of names) {
  const vp = VIEWPORTS.find(v => v.name === name)
  const { browser, ctx } = await launch(vp)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e.message || e)))
  const rep = report[name] = { errors }
  const shotCard = async (card, file) => {
    const tag = await page.addStyleTag({ content: UNCLIP + '.bottom-nav{display:none!important}' })
    await pause(500); await card.scrollIntoViewIfNeeded(); await pause(300)
    await card.screenshot({ path: resolve(outDir, file) })
    await tag.evaluate(n => n.remove()); await pause(300)
  }
  const tool = async (route, label, file, after) => {
    await openPage(page, route); await pause(2500)
    if (vp.mobile) {
      const btn = page.locator('.pnl-mobile button').filter({ hasText: label }).first()
      await btn.scrollIntoViewIfNeeded(); await btn.click()
    } else {
      await page.locator('.fbar button').filter({ hasText: label }).first().click()
    }
    await pause(2500)
    if (after) await after()
    rep[file] = await overflow(page)
    await full(page, file)
  }
  try {
    await openPage(page, '/pnl/shopify'); await pause(3000)
    if (vp.mobile) {
      const card = page.locator('.pnl-mobile .ranked-list').first().locator('xpath=ancestor::section[1]')
      await card.scrollIntoViewIfNeeded(); await pause(500)
      await shotCard(card, `${name}__fv-revenue.png`)
      const chip = card.locator('button[aria-pressed]').filter({ hasText: /^Returns %/ }).first()
      await chip.click(); await pause(500)
      await shotCard(card, `${name}__fv-returns.png`)
      rep.fvLine = await card.locator('.ranked-list > div').first().innerText()
      await card.locator('.ranked-list button[type=button]').filter({ hasText: /^1\./ }).first().click(); await pause(900)
      await page.screenshot({ path: resolve(outDir, `${name}__sheet.png`) })
      await page.keyboard.press('Escape'); await pause(400)
    } else {
      const fv = page.locator('table').filter({ has: page.locator('th', { hasText: /^Product/ }) }).first()
      await fv.scrollIntoViewIfNeeded(); await pause(600)
      await page.screenshot({ path: resolve(outDir, `${name}__fv-table.png`) })
      rep.fvHeaders = await fv.locator('thead th').allInnerTexts()
    }
    // Section 7 case: Orthotics Posture Corrector, no lever touched (planned must equal current)
    await tool('/pnl/shopify', 'Price Simulator', `${name}__price-simulator.png`, async () => {
      const box = page.locator('input[placeholder^="Search product"]').first()
      await box.click(); await box.fill('Orthotics Posture Corrector'); await pause(800)
      await page.getByText('Orthotics Posture Corrector', { exact: true }).last().dispatchEvent('mousedown'); await pause(2500)
      rep.priceSimText = (await page.locator('.page-scroll').innerText()).slice(0, 3000)
    })
    await tool('/pnl/shopify', 'Breakeven ROAS', `${name}__breakeven-roas.png`)
    await tool('/pnl/offline', 'B2B Costing', `${name}__b2b-costing.png`)
    await tool('/pnl/offline', 'PO Approval', `${name}__po-approval.png`)
  } catch (e) {
    rep.failed = String(e.message || e)
    console.log(`${name} FAILED: ${rep.failed}`)
  }
  console.log(name, JSON.stringify(rep).slice(0, 400))
  await browser.close()
  await pause(1500)
}
writeFileSync(resolve(outDir, 'report.json'), JSON.stringify(report, null, 2))
console.log(`wrote ${outDir}`)
