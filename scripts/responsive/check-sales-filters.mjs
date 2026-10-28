// Sales filters on phones: FilterSheet rows, FilterPicker (revenue sort, search, pinned selection,
// Apply (n)), Category → Sub-category → SKU dependency, SKU search over the full master, the
// "Filtered:" strip with ✕ / Clear, "Reset all", Product launch toggle, D2C-only rows.
// Usage: node scripts/responsive/check-sales-filters.mjs [viewportName]   (RESPONSIVE_ENGINE=webkit ok)
import { launch, openPage, VIEWPORTS, ENGINE, waitSettled } from './lib.mjs'
import { mkdirSync } from 'fs'
const vp = VIEWPORTS.find(v => v.name === (process.argv[2] || 'iphone14-390x844'))
const out = 'docs/responsive/after/sales/filters'
mkdirSync(out, { recursive: true })
const { browser, ctx } = await launch(vp)
const page = await ctx.newPage()
let fail = 0
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' - ' + extra : ''}`) }
const hdr = page.locator('.topnav.m-header')
const sheet = page.getByRole('dialog')
const money = t => { const m = (t || '').replace(/,/g, '').match(/₹\s?([\d.]+)\s?(Cr|L|K)?/); return m ? +m[1] * ({ Cr: 1e7, L: 1e5, K: 1e3 }[m[2]] || 1) : null }
const pickerRows = () => sheet.locator('label').evaluateAll(ls => ls.map(l => l.innerText.split('\n').map(s => s.trim()).filter(Boolean)))

await openPage(page, '/sales/shopify/overall')
await hdr.locator('.ov-filter-btn').click(); await page.waitForTimeout(400)
const rowsTxt = await sheet.innerText()
check('sheet rows: Category, Sub-category, SKU, Payment type, Voucher (D2C)', ['Category', 'Sub-category', 'SKU', 'Payment type', 'Voucher'].every(k => rowsTxt.includes(k)), rowsTxt.replace(/\s+/g, ' ').slice(0, 120))
check('footer: Reset all / Show results', rowsTxt.includes('Reset all') && rowsTxt.includes('Show results'))
await page.screenshot({ path: `${out}/${ENGINE}-${vp.name}-sheet.png` })

await sheet.getByRole('button', { name: /^Category/ }).click(); await page.waitForTimeout(300)
const cats = await pickerRows()
const revs = cats.map(r => money(r[r.length - 1]))
check('Category picker sorted by revenue, revenue shown', revs.length > 1 && revs.every(v => v != null) && revs.every((v, i) => i === 0 || v <= revs[i - 1] + 1), cats.slice(0, 3).map(r => r.join(' ')).join(' | '))
const cat = cats[0][0]
await sheet.locator('label').first().click()
check('Apply (1) after ticking one', await sheet.getByRole('button', { name: 'Apply (1)' }).isVisible())
await page.screenshot({ path: `${out}/${ENGINE}-${vp.name}-picker.png` })
await sheet.getByRole('button', { name: 'Apply (1)' }).click(); await page.waitForTimeout(300)
await sheet.getByRole('button', { name: /^Sub-category/ }).click(); await page.waitForTimeout(300)
const subs = await pickerRows()
check('Sub-category limited to the chosen Category', subs.length > 0 && subs.every(r => r.some(x => x.split(', ').includes(cat))), `${subs.length} options under ${cat}`)
const sub = subs[0][0]
await sheet.locator('label').first().click()
await sheet.getByRole('button', { name: 'Apply (1)' }).click(); await page.waitForTimeout(300)
await sheet.getByRole('button', { name: /^SKU/ }).click(); await page.waitForTimeout(300)
const skus = await pickerRows()
check('SKU limited to the chosen Sub-category, with revenue', skus.length > 0 && skus.every(r => r.includes(sub) && money(r[r.length - 1]) != null), `${skus.length} SKUs under ${sub}`)
await sheet.getByRole('searchbox').fill('AR-FCC') // item-master codes with no sales in Oct 2026
const searched = await pickerRows()
check('SKU search also lists unsold SKUs from the item master', searched.some(r => r.includes('No sales in this period')), `${searched.length} results`)
await sheet.getByRole('button', { name: 'Back to filters' }).click(); await page.waitForTimeout(200)
await sheet.getByRole('button', { name: 'Show results' }).click()
await waitSettled(page)
const strip = hdr.locator('.filtered-strip')
const stripTxt = await strip.innerText().catch(() => '')
check('"Filtered:" strip shows Category and Sub-category; icon count 2', stripTxt.includes(cat) && stripTxt.includes(sub) && (await hdr.locator('.ov-filter-btn b').innerText()) === '2', stripTxt.replace(/\s+/g, ' '))
await page.screenshot({ path: `${out}/${ENGINE}-${vp.name}-strip.png` })
await strip.getByRole('button', { name: /Remove filter Sub-category/ }).click(); await waitSettled(page)
check('✕ removes one filter', !(await strip.innerText()).includes(sub) && (await strip.innerText()).includes(cat))
await hdr.locator('.ov-filter-btn').click(); await page.waitForTimeout(300)
await sheet.getByRole('button', { name: 'New ≤90d' }).click(); await page.waitForTimeout(300)
check('Launch toggle sets "New ≤90d"', (await sheet.getByRole('button', { name: 'New ≤90d' }).getAttribute('aria-pressed')) === 'true')
await sheet.getByRole('button', { name: 'Reset all' }).click(); await waitSettled(page)
check('Reset all clears every filter', !(await hdr.locator('.filtered-strip').count()) && !(await hdr.locator('.ov-filter-btn b').count()))
await hdr.getByRole('button', { name: 'Amazon', exact: true }).click(); await waitSettled(page)
await hdr.locator('.ov-filter-btn').click(); await page.waitForTimeout(300)
const amz = await sheet.innerText()
check('Payment type / Voucher only on D2C', !amz.includes('Payment type') && !amz.includes('Voucher'))
await browser.close()
console.log(fail ? `${ENGINE} ${vp.name}: ${fail} FAILED` : `${ENGINE} ${vp.name}: ALL PASS`)
process.exit(fail ? 1 : 0)
