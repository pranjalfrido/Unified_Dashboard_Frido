// Cost Overview "All months" check (bug 5a): Overview FTL/PTL + 3PL tiles vs the FTL/PTL and 3PL
// tabs on their own, for one month → All → one month again. Laptop 1366, old month dropdown
// ("Last 1" / "All N" buttons). Usage: node scripts/responsive/check-cost-all-months.mjs
import { launch, openPage, VIEWPORTS } from './lib.mjs'
const { browser, ctx } = await launch(VIEWPORTS.find(v => v.name === 'laptop-1366x768'))
const page = await ctx.newPage()
await openPage(page, '/logistics/cost_analytics')
const card = label => page.evaluate(l => {
  const el = [...document.querySelectorAll('div, span')].find(e => e.childElementCount === 0 && e.textContent.trim() === l && e.offsetParent)
  let c = el; for (let i = 0; i < 6 && c && !/₹/.test(c.innerText.replace(l, '')); i++) c = c.parentElement
  return c ? (c.innerText.replace(l, '').match(/₹[\d.,]+\s*(Cr|L|K)?/) || [''])[0].replace(/\s+/g, '') : '?'
}, label)
const pick = async which => { // which: 'last' | 'all'
  await page.locator('button').filter({ hasText: /(of \d+|months)\s*▼?$/ }).first().click(); await page.waitForTimeout(300)
  await page.locator('button').filter({ hasText: which === 'all' ? /^All \d+$/ : /^Last \d+$/ }).first().click()
  await page.waitForTimeout(1500)
}
const tab = async name => { await page.locator('button').filter({ hasText: new RegExp(`^${name.replace('/', '\/')}$`) }).first().click(); await page.waitForTimeout(1500) }
const rows = []
for (const step of ['last', 'all', 'last']) {
  await tab('Overview'); await pick(step)
  const ovF = await card('FTL/PTL Freight Cost'), ovT = await card('3PL Warehousing Cost')
  await tab('FTL/PTL'); await pick(step); const ftl = await card('Total Freight Cost')
  await tab('3PL'); await pick(step); const tpl = await card('Total Warehousing Cost')
  rows.push({ step: step === 'all' ? 'All' : 'Latest month', ovF, ftl, ovT, tpl })
}
console.log('| Selection | Overview FTL/PTL | FTL/PTL tab | Match | Overview 3PL | 3PL tab | Match |')
console.log('|---|---|---|---|---|---|---|')
for (const r of rows) console.log(`| ${r.step} | ${r.ovF} | ${r.ftl} | ${r.ovF === r.ftl ? 'yes' : 'NO'} | ${r.ovT} | ${r.tpl} | ${r.ovT === r.tpl ? 'yes' : 'NO'} |`)
await browser.close()
