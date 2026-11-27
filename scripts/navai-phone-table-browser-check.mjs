// NavAI phone tables: the key column is always visible, the Total row is never empty; laptop unchanged. Local only, /api/pulse is mocked.
//   (vite on 5199 as in navai-no-mobile-mic-browser-check.mjs)   node scripts/navai-phone-table-browser-check.mjs [outDir]
import { chromium, devices } from 'playwright'
import { mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.BASE || 'http://127.0.0.1:5199'
const OUT = resolve(root, process.argv[2] || 'docs/navai-phone-table/screens'); mkdirSync(OUT, { recursive: true })
let bad = 0
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); if (!cond) bad++ }

const ANSWERS = {
  value: { q: 'Inventory value of arch comfort slipper', key: 'Inventory value', visible: ['Product', 'Inventory value'], text: `**Inventory value: ₹3.00 Cr** across 2 products

| Product | Category | SKUs with stock | Units | Avg sale | Inventory value | DOI |
|---|---|---|---|---|---|---|
| Cloud Comfort Arch Support Slippers | Footwear | 53 | 85,361 | 931 | ₹2.70 Cr | 91 |
| Arch Comfort Slipper Combo | Footwear | 5 | 1,000 | 10 | ₹30.00 L | 100 |
| **Total** | | **58** | **86,361** | | | |

Source: Inventory Health → Inventory cost detail` },
  inward: { q: 'Posture corrector inward this month', key: 'Units', visible: ['Product', 'Units'], text: `**66,074 units inward**

| Product | Category | SKUs | Units | GRNs | Rejected |
|---|---|---|---|---|---|
| Orthotics Posture Corrector | Orthotics | 3 | 35,271 | 26 | 0 |
| Orthotics Posture Corrector Pro | Orthotics | 2 | 23,066 | 28 | 0 |
| **Total** | | | | | |` },
  sales: { q: 'Cushion sales last month', key: 'Gross revenue', visible: ['Product', 'Gross revenue'], text: `**43,188 units sold**

| Product | Category | Units | Orders | Gross revenue |
|---|---|---|---|---|
| Alpha Cushion A | Mobility | 1,000 | 100 | ₹10.00 L |
| Alpha Cushion B | Mobility | 990 | 101 | ₹10.50 L |
| **Total** | | | | |` },
}
for (const d of [{ id: 'android-375', opts: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } }, phone: true }, { id: 'laptop-1280', opts: { viewport: { width: 1280, height: 800 } } }]) {
  for (const withKeys of [true, false]) {
    if (!d.phone && !withKeys) continue
    const browser = await chromium.launch(); const ctx = await browser.newContext(d.opts); const page = await ctx.newPage()
    const errors = []; page.on('pageerror', e => errors.push(e.message))
    for (const [name, a] of Object.entries(ANSWERS)) {
      const tag = `${d.id}${withKeys ? '' : ' (no hint)'} ${name}`
      await page.route('**/api/pulse', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: a.text, model: 'claude-sonnet-4-6', ...(withKeys ? { tableKeys: [a.key] } : {}) }) }))
      await page.goto(`${BASE}/?as=rohan`); await page.waitForTimeout(2500)
      const all = page.getByRole('button', { name: /All pages/i })
      if (await all.count()) { await all.click(); await page.waitForTimeout(600); await page.getByRole('button', { name: /NavAI/i }).last().click() } else await page.getByText('NavAI', { exact: true }).first().click()
      await page.waitForTimeout(1200)
      const later = page.getByRole('button', { name: 'Not now' }); if (await later.count()) await later.first().click().catch(() => {})
      await page.locator('.pm-box textarea, .af-composer-input').fill(a.q); await page.locator('.pm-send, .af-composer-send').click(); await page.waitForTimeout(1500)
      if (d.phone) {
        const heads = await page.locator('.pm-tb:visible thead th').allTextContents()
        ok(`${tag}: columns shown = ${heads.join(' | ')}`, a.visible.every(v => heads.includes(v)) && heads.length >= 3 && heads.length <= 4 && !heads.includes('Category'))
        const tot = await page.locator('.pm-tb:visible tr.tot td').allTextContents()
        ok(`${tag}: Total row has no empty number cell in the visible columns (${tot.join(' | ')})`, tot.length === heads.length && tot.slice(1).every((c, i) => c.trim() !== ''))
        ok(`${tag}: no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
        ok(`${tag}: "View full table" is there for the other columns`, (await page.getByRole('button', { name: /View full table/ }).count()) >= 1)
        if (withKeys) await page.screenshot({ path: `${OUT}/${tag.replace(/[ ()]/g, '_')}.png` })
      } else {
        const heads = await page.locator('table:visible thead th').allTextContents()
        ok(`${tag}: laptop shows every column (${heads.length})`, heads.length >= 5, heads.join(' | '))
        await page.screenshot({ path: `${OUT}/${tag.replace(/[ ()]/g, '_')}.png` })
      }
    }
    ok(`${d.id}${withKeys ? '' : ' (no hint)'}: no page errors`, errors.length === 0, errors.join(';'))
    await browser.close()
  }
}
console.log(bad ? `\n${bad} failed` : '\nAll checks passed'); process.exit(bad ? 1 : 0)
