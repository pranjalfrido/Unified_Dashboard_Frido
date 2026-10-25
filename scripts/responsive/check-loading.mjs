// Loading-state check (MOBILE_DESIGN_SYSTEM.md §4: never show placeholder numbers while loading).
// Holds every logistics response (static logistics-data*.json + /api/logistics) and the customer /
// inventory data for a few seconds, then checks the mobile Overview cards show skeletons - no "0" or
// "—" values - and that the cards keep their height when the real values arrive.
// Usage: node scripts/responsive/check-loading.mjs [viewportName] [outDir]  (RESPONSIVE_ENGINE=webkit ok)
import { launch, VIEWPORTS, ENGINE, BASE_URL, waitSettled } from './lib.mjs'
import { mkdirSync } from 'fs'
const vp = VIEWPORTS.find(v => v.name === (process.argv[2] || 'iphone14-390x844'))
const out = process.argv[3] || 'docs/responsive/after/overview-align/loading'
mkdirSync(out, { recursive: true })
const HOLD = 12000
const { browser, ctx } = await launch(vp)
const page = await ctx.newPage()
let release
const gate = new Promise(r => { release = r })
await page.route(/logistics-data[^/]*\.json|\/api\/logistics|\/api\/customer|inv-data[^/]*\.json/, async route => { await gate; await route.continue() })
let fail = 0
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' - ' + extra : ''}`) }

await page.goto(BASE_URL + '/overview', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.ov-mobile', { timeout: 300000 })
await page.waitForTimeout(3000)
const read = () => page.evaluate(() => {
  const cardOf = title => [...document.querySelectorAll('.ov-mobile span, .ov-mobile div')].find(e => e.textContent.trim() === title && !e.children.length)?.closest('[style*="border-radius"]')
  const out = {}
  for (const t of ['Logistics & Ops', 'Delivery health', 'Speed & SLA', 'Customers · D2C', 'Inventory alerts']) {
    let c = cardOf(t); if (t === 'Delivery health') c = c?.parentElement?.closest('[style*="border-radius"]') || c
    if (!c) { out[t] = null; continue }
    const skel = c.querySelectorAll('.m-skeleton').length
    // value-looking text outside labels: a bare 0, 0.0%, 0.0d or an em dash on its own
    const zeros = [...c.querySelectorAll('*')].filter(e => !e.children.length && /^(0|0\.0%|0\.0d|—)$/.test(e.textContent.trim())).map(e => e.textContent.trim())
    out[t] = { skel, zeros, h: Math.round(c.getBoundingClientRect().height) }
  }
  return out
})
const during = await read()
await page.locator('.ov-mobile').getByText('Logistics & Ops', { exact: true }).scrollIntoViewIfNeeded()
await page.screenshot({ path: `${out}/${ENGINE}-${vp.name}-loading.png` })
for (const [t, r] of Object.entries(during)) check(`while loading, "${t}" shows skeletons and no placeholder numbers`, !!r && r.skel > 0 && r.zeros.length === 0, r ? `${r.skel} skeletons, placeholders: ${JSON.stringify(r.zeros)}` : 'card not found')

release()
await waitSettled(page)
// /api/logistics can take well over a minute when cold
await page.waitForFunction(() => !document.querySelector('.ov-mobile .m-skeleton'), null, { timeout: 300000 }).catch(() => {})
const after = await read()
await page.locator('.ov-mobile').getByText('Logistics & Ops', { exact: true }).scrollIntoViewIfNeeded()
await page.screenshot({ path: `${out}/${ENGINE}-${vp.name}-loaded.png` })
for (const [t, r] of Object.entries(after)) {
  const b = during[t]
  check(`after loading, "${t}" shows values, same height`, !!r && r.skel === 0 && (!b || Math.abs(b.h - r.h) <= 2), r ? `${r.skel} skeletons left, height ${b?.h} → ${r.h}px` : 'card not found')
}
await browser.close()
console.log(fail ? `${ENGINE} ${vp.name}: ${fail} FAILED` : `${ENGINE} ${vp.name}: ALL PASS`)
process.exit(fail ? 1 : 0)
