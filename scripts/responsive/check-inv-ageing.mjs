// Ageing tables: Spare Parts absent, every other row still there (desktop at 1366 / mobile at 390).
// Compares the rendered rows with the static cache's slowMoving / deadStock minus Spare Parts.
// Usage: node scripts/responsive/check-inv-ageing.mjs [laptop|phone]
import { readFileSync } from 'fs'
import { launch, openPage, VIEWPORTS, repoRoot } from './lib.mjs'
const mode = process.argv[2] || 'laptop'
const vp = VIEWPORTS.find(v => v.name === (mode === 'phone' ? 'iphone14-390x844' : 'laptop-1366x768'))
const { browser, ctx } = await launch(vp)
const page = await ctx.newPage()
const served = []
page.on('response', async r => { if (/inv-data-\d+d\.json|api\/inventory/.test(r.url())) { try { served.push(await r.json()) } catch {} } })
await openPage(page, '/inventory/inventory_health')
const data = served.at(-1)
const want = k => data[k].filter(r => r.category !== 'Spare Parts').map(r => r.subCategory)
let got
if (mode === 'phone') {
  got = {}
  for (const [k, label] of [['slowMoving', 'Slow moving'], ['deadStock', 'Dead stock']]) {
    await page.getByRole('tab', { name: label, exact: true }).click()
    await page.waitForTimeout(300)
    const btn = page.locator('#inv-dead-stock button', { hasText: /^Show all/ })
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(400) }
    // full-screen list: load every page
    for (let i = 0; i < 20; i++) { const more = page.locator('.fullscreen-list button', { hasText: /^Load/ }); if (!(await more.count())) break; await more.click(); await page.waitForTimeout(150) }
    got[k] = await page.evaluate(() => [...document.querySelectorAll('.fullscreen-list button')].map(b => b.querySelector('span span')?.textContent || '').filter(t => /^\d+\. /.test(t)).map(t => t.replace(/^\d+\. /, '')))
    await page.keyboard.press('Escape').catch(() => {}); await page.goBack().catch(() => {}); await page.waitForTimeout(400)
  }
} else {
  got = await page.evaluate(() => {
    const read = sel => [...document.querySelectorAll(`${sel} tbody tr`)].filter(tr => tr.querySelectorAll('td').length === 4 && !tr.textContent.trim().startsWith('↳'))
      .map(tr => tr.querySelector('td').childNodes[1]?.textContent?.trim() || tr.querySelector('td').textContent.trim())
    const cards = [...document.querySelectorAll('.inv-2col-row > div')]
    return { slowMoving: read(`.inv-2col-row > div:nth-child(1)`), deadStock: read('#inv-dead-stock') }
  })
}
for (const k of ['slowMoving', 'deadStock']) {
  const w = want(k), g = got[k]
  const spare = g.filter(x => /spare parts/i.test(x))
  const missing = w.filter(x => !g.includes(x)), extra = g.filter(x => !w.includes(x))
  console.log(`${mode} ${k}: cache ${data[k].length} rows (${data[k].length - w.length} Spare Parts) · shown ${g.length} · expected ${w.length} · spare shown ${spare.length} · missing ${missing.length} · extra ${extra.length}`)
}
await browser.close()
