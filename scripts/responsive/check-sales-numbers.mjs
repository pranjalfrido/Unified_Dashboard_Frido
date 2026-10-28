// Numbers check for Sales mobile: for each channel view, the master-card tiles on a phone must show
// exactly the values of the matching desktop KPI cards (1440px), same date range and data.
// Prints a table per view: desktop label, desktop value, mobile value, match; desktop tiles not on
// mobile (dropped by the approved rules) are listed, never compared.
// Usage: node scripts/responsive/check-sales-numbers.mjs [route,route…] [phoneViewport]  (RESPONSIVE_ENGINE=webkit ok)
import { launch, openPage, VIEWPORTS, ENGINE } from './lib.mjs'
import { writeFileSync, mkdirSync } from 'fs'

const ROUTES = (process.argv[2] || 'sales/all,sales/shopify/overall,sales/shopify/myfrido,sales/amazon/overall,sales/amazon/seller_central,sales/amazon/vendor_central,sales/flipkart,sales/ebo,sales/offline/overall,sales/blinkit,sales/instamart,sales/zepto,sales/cred,sales/firstcry,sales/myntra').split(',')
const phone = VIEWPORTS.find(v => v.name === (process.argv[3] || 'iphone14-390x844'))
// desktop label → mobile tile label (lower case)
const MAP = {
  'gross revenue inc gst': 'gross rev', 'net revenue': 'net rev', 'net revenue ex gst': 'net rev', 'revenue at risk': 'rev at risk',
  'aov': 'aov', 'asp': 'asp', 'daily avg net rev': 'avg net/day', 'gst': 'gst', 'returns %': 'returns', 'returns % (sc)': 'returns', 'returns % (vc)': 'returns',
  'rto %': 'rto %', 'cir %': 'cir %', 'cancellation %': 'cancel %', 'exchange %': 'exchange %', 'gross rev · seller central': 'gross sc', 'gross rev · vendor central': 'gross vc',
  'cancellation rate': 'cancel rate', 'orders': 'orders', 'units / order': 'units / order', 'credit notes %': 'credit notes %', 'active products': 'active products',
}
const norm = t => (t || '').replace(/\s+/g, ' ').trim()
// A sub-channel route first paints the parent channel's cached tiles, then its own; read only once
// the tile text has stopped changing (3 identical reads, 3 s apart).
async function stable(page, read) {
  let prev = null, same = 0, cur
  for (let i = 0; i < 40 && same < 2; i++) {
    cur = JSON.stringify(await read())
    same = cur === prev ? same + 1 : 0
    prev = cur
    if (same < 2) await page.waitForTimeout(3000)
  }
  return JSON.parse(cur)
}

async function desktopTiles(route) {
  const { browser, ctx } = await launch(VIEWPORTS[1])
  const page = await ctx.newPage()
  await openPage(page, '/' + route)
  await page.waitForFunction(() => [...document.querySelectorAll('.sales-kpi-section')].some(e => e.offsetParent !== null && e.querySelector('.kpi-value')), null, { timeout: 300000 })
  const tiles = await stable(page, () => page.evaluate(() => {
    const sec = [...document.querySelectorAll('.sales-kpi-section')].find(e => e.offsetParent !== null)
    if (!sec) return []
    const hero = sec.querySelector('.sales-kpi-hero')
    const out = hero ? [{ label: 'Gross Revenue Inc GST', value: hero.querySelector('.kpi-value')?.innerText }] : []
    sec.querySelectorAll('.sales-kpi-grid .kpi-card').forEach(c => out.push({ label: c.querySelector('.kpi-label')?.innerText, value: c.querySelector('.kpi-value')?.innerText }))
    return out
  }))
  await browser.close()
  return tiles.map(t => ({ label: norm(t.label).toLowerCase(), value: norm(t.value) }))
}
async function mobileTiles(route) {
  const { browser, ctx } = await launch(phone)
  const page = await ctx.newPage()
  await openPage(page, '/' + route)
  await page.waitForSelector('.master-tiles button', { timeout: 300000 })
  const tiles = await stable(page, () => page.evaluate(() => [...document.querySelectorAll('.master-tiles button')].map(b => {
    const lines = b.innerText.split('\n').map(s => s.trim()).filter(Boolean)
    return { label: lines[0], value: lines[lines.length - 1] }
  })))
  await browser.close()
  return tiles.map(t => ({ label: norm(t.label).toLowerCase(), value: norm(t.value) }))
}

const report = {}
let mismatches = 0
for (const route of ROUTES) {
  const d = await desktopTiles(route), m = await mobileTiles(route)
  const mm = Object.fromEntries(m.map(t => [t.label, t.value]))
  const rows = d.map(t => { const k = MAP[t.label.replace(/ · .*$/, t.label.startsWith('gross rev ·') ? t.label.slice(t.label.indexOf(' ·')) : '')] ?? MAP[t.label]; return { desktop: t.label, dv: t.value, mobile: k && !(k in mm) && (k.replace(/ %$/, '') in mm) ? k.replace(/ %$/, '') : k, mv: k ? (mm[k] ?? mm[k.replace(/ %$/, '')]) : undefined } })
  console.log(`\n${route}  (desktop ${d.length} tiles, mobile ${m.length})`)
  for (const r of rows) {
    if (r.mv === undefined) { console.log(`   –  ${r.desktop.padEnd(28)} ${String(r.dv).padStart(12)}   (not on mobile)`); continue }
    const ok = r.dv === r.mv
    if (!ok) mismatches++
    console.log(`   ${ok ? '✓' : '✗'}  ${r.desktop.padEnd(28)} ${String(r.dv).padStart(12)}  ${String(r.mv).padStart(12)}`)
  }
  const mobileOnly = m.filter(t => !rows.some(r => r.mobile === t.label))
  if (mobileOnly.length) console.log(`   +  mobile only: ${mobileOnly.map(t => `${t.label} ${t.value}`).join(', ')}`)
  report[route] = { rows, mobileOnly }
}
mkdirSync('docs/responsive/after/sales', { recursive: true })
writeFileSync(`docs/responsive/after/sales/numbers-${ENGINE}.json`, JSON.stringify(report, null, 2))
console.log(mismatches ? `\n${mismatches} MISMATCH(ES)` : '\nALL VALUES MATCH DESKTOP')
process.exit(mismatches ? 1 : 0)
