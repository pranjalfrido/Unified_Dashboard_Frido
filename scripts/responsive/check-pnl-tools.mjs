// PNL_REVIEW_FIXES.md §7: the four P&L tools with the review's cases, on laptop and phones.
//   Price Simulator  Orthotics Posture Corrector, no lever touched (planned must equal current)
//   Breakeven ROAS   New product ₹1,999 / 7% / ₹600 / 500 g / 18% (the calculator's defaults)
//   B2B Costing      COGS ₹249, Vol. weight 0.5 kg, EBITDA 20%, no listing price
//   PO Approval      Orthotics Heel Protector, 20 × ₹400
// Per viewport: the outputs (same inputs → same outputs on laptop and phone), and on phones the page
// width (scrollWidth ≤ clientWidth), input font sizes (≥ 16px, no iOS zoom) and that the sticky
// result bar hides while an input has focus. Screenshots of each tool with its case filled in.
// Usage: node scripts/responsive/check-pnl-tools.mjs <outDir> [viewport,...]
import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { launch, openPage, repoRoot, VIEWPORTS } from './lib.mjs'

const [outArg, vpArg] = process.argv.slice(2)
const outDir = resolve(repoRoot, outArg || 'docs/responsive/after/pnl-tools')
mkdirSync(outDir, { recursive: true })
const names = (vpArg || 'laptop-1366x768,iphoneSE-375x667,iphone14-390x844,smallAndroid-360x800').split(',')
const pause = ms => new Promise(r => setTimeout(r, ms))
const UNCLIP = '.app-shell,.app-main,.app-main>div,.page-scroll{height:auto!important;max-height:none!important;overflow-x:clip!important;overflow-y:visible!important}'

const report = {}
for (const name of names) {
  const vp = VIEWPORTS.find(v => v.name === name)
  const { browser, ctx } = await launch(vp)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e.message || e)))
  page.on('dialog', d => d.dismiss())
  const rep = report[name] = { errors }
  const root = () => page.locator('.page-scroll')
  const field = label => root().locator('label').filter({ has: page.locator('span', { hasText: new RegExp(`^${label}`) }) }).locator('input').first()
  const set = async (label, v) => { const i = field(label); await i.click(); await i.fill(String(v)); await i.press('Enter'); await pause(200) }
  const pick = async (text, placeholder = 'Search product') => {
    const box = root().locator(`input[placeholder^="${placeholder}"]`).first()
    await box.click(); await box.fill(text); await pause(700)
    await page.getByText(text, { exact: true }).last().dispatchEvent('mousedown'); await pause(1500)
  }
  const open = async (route, label) => {
    await openPage(page, route); await pause(2500)
    if (vp.mobile) { const b = page.locator('.pnl-mobile button').filter({ hasText: label }).first(); await b.scrollIntoViewIfNeeded(); await b.click() }
    else await page.locator('.fbar button').filter({ hasText: label }).first().click()
    await pause(2500)
  }
  const phoneChecks = async key => {
    if (!vp.mobile) return
    rep[key].width = await page.evaluate(() => { const el = document.querySelector('.page-scroll') || document.documentElement; return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth } })
    rep[key].smallInputs = await page.evaluate(() => [...document.querySelectorAll('.pnl-tool-phone input')].filter(i => i.offsetParent && parseFloat(getComputedStyle(i).fontSize) < 16).length)
    rep[key].barShown = await page.locator('.tool-result-bar').count() > 0
    const inp = root().locator('.pnl-tool-phone input').first()
    if (await inp.count()) { await inp.focus(); await pause(300); rep[key].barWhileTyping = await page.locator('.tool-result-bar').count() > 0; await inp.blur(); await pause(200) }
  }
  const shot = async file => {
    const tag = await page.addStyleTag({ content: UNCLIP }); await pause(500)
    await page.screenshot({ path: resolve(outDir, `${name}__${file}.png`), fullPage: true })
    await tag.evaluate(n => n.remove()); await pause(200)
  }
  const text = () => root().innerText()
  try {
    // Price Simulator
    await open('/pnl/shopify', 'Price Simulator')
    await pick('Orthotics Posture Corrector')
    let t = await text()
    rep.price = {
      plannedCm2: t.match(/PLANNED CONTRIBUTION MARGIN 2 \(CM2\)[^\n]*\n(₹[\d.,]+ ?[A-Za-z]*)/i)?.[1],
      currentCm2: t.match(/Current CM2 \(mature-normalised\): (₹[\d.,]+ ?[A-Za-z]*)/)?.[1],
      breakevenDiscount: t.match(/BREAKEVEN DISCOUNT\n([\d.]+%)/i)?.[1],
      bar: vp.mobile ? (await page.locator('.tool-result-bar').innerText().catch(() => null)) : null,
    }
    await phoneChecks('price'); await shot('price-simulator')
    // Breakeven ROAS (defaults = the review case)
    await open('/pnl/shopify', 'Breakeven ROAS')
    t = await text()
    rep.breakeven = { breakeven: t.match(/BREAKEVEN ROAS\n([\d.]+x)/i)?.[1], cm2at15: t.match(/CM2 @ 15%\n([\d.]+x)/i)?.[1], bar: vp.mobile ? (await page.locator('.tool-result-bar').innerText().catch(() => null)) : null }
    await phoneChecks('breakeven'); await shot('breakeven-roas')
    // B2B Costing
    await open('/pnl/offline', 'B2B Costing')
    await set('COGS / Unit', 249); await set('Vol. Weight', 0.5)
    t = await text()
    rep.b2b = { spInclGst: t.match(/SELLING PRICE INCL\. GST[^\n]*\n(₹[\d.,]+)/i)?.[1], exactQuoted: t.match(/SP ex-GST: ([^\n]+)/)?.[1], status: t.match(/(Enter listing price to check|✓ OK — within Listing Price|⚠ SP exceeds Listing Price)/)?.[1], bar: vp.mobile ? (await page.locator('.tool-result-bar').innerText().catch(() => null)) : null }
    await phoneChecks('b2b'); await shot('b2b-costing')
    // PO Approval
    await open('/pnl/offline', 'PO Approval')
    await pick('Orthotics Heel Protector')
    await set('Qty', 20); await set('Selling Price', 400)
    t = await text()
    rep.po = { profitPct: t.match(/PROFIT %\n([−-]?[\d.]+%)/i)?.[1], profitLine: t.match(/(Profit:? [^\n]*sale[^\n]*)/i)?.[1], decision: t.match(/(APPROVE|REVIEW)[^\n]*/)?.[0], bar: vp.mobile ? (await page.locator('.tool-result-bar').innerText().catch(() => null)) : null }
    await phoneChecks('po'); await shot('po-approval')
  } catch (e) {
    rep.failed = String(e.message || e)
  }
  console.log(name, JSON.stringify(rep))
  await browser.close(); await pause(1500)
}
writeFileSync(resolve(outDir, 'report.json'), JSON.stringify(report, null, 2))
console.log(`wrote ${outDir}`)
