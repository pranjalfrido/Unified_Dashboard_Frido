// Return Analysis: mobile numbers = desktop numbers (RETURN_ANALYSIS_MOBILE_PROMPT_1.md §7).
// Reads the desktop page (laptop 1366) and the mobile page (iPhone 14) for the same dates and
// compares: the 6 KPI tiles, the payment-type table (every metric × type), top 8 products, top 8
// sub-categories by revenue and by total return %, reasons (every reason + Total), the 12-month
// table, and the top 10 exchange SKUs. Data path: the live API (/api/return-analysis, BigQuery).
// Usage: [SEPT=1] node scripts/responsive/check-ra-numbers.mjs      (default dates = 1–25 Oct)
import { launch, openPage, openWithSept, VIEWPORTS } from './lib.mjs'

const ROUTE = '/sales/shopify/return_analysis'
const vpOf = n => VIEWPORTS.find(v => v.name === n)
const open = async page => { if (process.env.SEPT) await openWithSept(page, ROUTE); else await openPage(page, ROUTE); await page.waitForTimeout(1500) }
const clean = s => (s || '').replace(/\s+/g, ' ').trim()
let fail = 0, n = 0
const same = (what, d, m) => { n++; const ok = clean(d) === clean(m); if (!ok) { fail++; console.log(`DIFF ${what}: desktop "${d}" · mobile "${m}"`) } return ok }

// ── desktop ──
const dk = await launch(vpOf('laptop-1366x768'))
const dp = await dk.ctx.newPage()
await open(dp)
await dp.waitForSelector('text=Exchange Deep Dive · SKU-wise', { timeout: 240000 })
const D = await dp.evaluate(() => {
  const clean = s => (s || '').replace(/\s+/g, ' ').trim()
  const cardOf = title => [...document.querySelectorAll('*')].find(e => e.childElementCount === 0 && clean(e.textContent) === title)?.closest('.card, [class*="card"]') || null
  const out = {}
  // KPI tiles: label span → next sibling's first span
  const trend = cardOf('Return Metrics Trend')
  out.kpis = {}
  for (const label of ['Revenue', 'Return %', 'Cancel %', 'RTO %', 'CIR %', 'Exchange %']) {
    const el = [...trend.querySelectorAll('span')].find(s => clean(s.textContent) === label)
    const box = el.nextElementSibling
    out.kpis[label] = { value: clean(box.children[0].textContent), badge: clean(box.children[1]?.textContent || '') }
  }
  const tableRows = card => [...card.querySelectorAll('table')].flatMap(t => [...t.querySelectorAll('tr')].map(tr => [...tr.children].map(td => clean(td.textContent).replace(/^▶s*/, ''))))
  out.pay = tableRows(cardOf('Payment Type-wise Return Breakdown'))
  // Top products: rows inside the scroll list
  const tp = cardOf('Top Products · High Returns')
  out.top = [...tp.querySelectorAll('.hb-track')].map(t => { const row = t.parentElement; return { name: clean(row.children[1].children[0].textContent), sub: clean(row.children[1].children[1].textContent), value: clean(row.lastElementChild.textContent) } })
  out.cat = tableRows(cardOf('Category-wise Return Breakdown'))
  out.months = tableRows(cardOf('Last 12 Months Summary'))
  out.reasons = tableRows(cardOf('Return Reasons · Detail'))
  out.exch = tableRows(cardOf('Exchange Deep Dive · SKU-wise'))
  return out
})
// Return Reasons totals for CIR and Exch (the card opens on All)
const rcard = dp.getByText('Return Reasons · Detail', { exact: true }).locator('xpath=ancestor::div[contains(@class,"card")][1]')
D.reasonTotals = {}
for (const k of ['CIR', 'Exch']) { await rcard.getByRole('button', { name: k, exact: true }).click(); await dp.waitForTimeout(300); D.reasonTotals[k] = clean(await rcard.locator('tfoot').innerText()) }
await dk.browser.close()

// ── mobile ──
const mb = await launch(vpOf('iphone14-390x844'))
const mp = await mb.ctx.newPage()
await open(mp)
await mp.waitForSelector('text=Exchange deep dive', { timeout: 240000 })
const card = t => mp.locator('section').filter({ has: mp.locator('h2', { hasText: new RegExp(`^${t.replace(/[()·]/g, '.')}$`) }) }).first()
const tap = async l => { await l.scrollIntoViewIfNeeded(); await l.tap(); await mp.waitForTimeout(300) }
// KPI tiles
const tiles = await mp.locator('.master-tiles > *').allInnerTexts()
const tileMap = Object.fromEntries(tiles.map(t => { const l = t.split('\n').map(x => x.trim()).filter(Boolean); return [l[0].toLowerCase(), { badge: l.length > 2 ? l[1] : '', value: l[l.length - 1] }] }))
for (const [dl, ml] of [['Revenue', 'revenue'], ['Return %', 'return %'], ['Cancel %', 'cancel %'], ['RTO %', 'rto %'], ['CIR %', 'cir %'], ['Exchange %', 'exchange %']]) {
  same(`KPI ${dl}`, D.kpis[dl].value, tileMap[ml]?.value)
  same(`KPI ${dl} ▲/▼`, D.kpis[dl].badge.replace(/\s/g, ''), (tileMap[ml]?.badge || '').replace(/\s/g, ''))
}
// payment type: each metric toggle → row values
const payHead = D.pay[0] // Metric, Overall, COD, PPCOD, Prepaid
const payRow = label => D.pay.find(r => r[0].toLowerCase() === label.toLowerCase())
const pc = card('By payment type')
for (const [tog, label] of [['Total', 'Total Return %'], ['Cancel', 'Cancel %'], ['RTO', 'RTO %'], ['CIR', 'CIR %'], ['Exch', 'Exchange %']]) {
  await tap(pc.getByRole('tab', { name: tog, exact: true }))
  const rows = await pc.locator('div[style*="grid"], button[style*="grid"]').allInnerTexts()
  const mrow = Object.fromEntries(rows.map(t => t.split('\n').map(x => x.trim()).filter(Boolean)).map(l => [l[0], l[1]]))
  payHead.slice(1).forEach((h, i) => same(`Payment ${label} · ${h}`, payRow(label)[i + 1], mrow[h]))
}
const revRow = payRow('Revenue')
const payRevText = clean(await pc.innerText())
payHead.slice(1).forEach((h, i) => { n++; if (!payRevText.includes(clean(revRow[i + 1]))) { fail++; console.log(`DIFF Payment revenue · ${h}: desktop "${revRow[i + 1]}" not on mobile`) } })
// top products (top 8)
const rankedRows = async c => (await c.locator('.ranked-list > div:not([role=group]) > button').allInnerTexts()).map(t => t.split('\n').map(x => x.trim()).filter(Boolean))
const tpRows = await rankedRows(card('Top products · high returns'))
D.top.slice(0, 8).forEach((d, i) => { same(`Top product ${i + 1} name`, `${i + 1}. ${d.name}`, tpRows[i]?.[0]); same(`Top product ${i + 1} ₹`, d.value, tpRows[i]?.find(x => x.startsWith('₹'))) })
// category breakdown, sub-category view: top 8 by revenue and by total return %
const cc = card('Category breakdown')
await tap(cc.getByRole('tab', { name: 'Sub-category' }))
const catHead = D.cat[0]
const ci = h => catHead.findIndex(x => x.toLowerCase().startsWith(h))
const deskCat = D.cat.slice(1).filter(r => r.length === catHead.length && r[0] !== 'Total' && r[ci('revenue')]?.startsWith('₹'))
const parseRs = s => { const v = parseFloat(s.replace(/[₹,\s]/g, '')); return /Cr/.test(s) ? v * 1e7 : /L/.test(s) ? v * 1e5 : /K/.test(s) ? v * 1e3 : v }
const byRev = [...deskCat].sort((a, b) => parseRs(b[ci('revenue')]) - parseRs(a[ci('revenue')]))
let mc = await rankedRows(cc)
byRev.slice(0, 8).forEach((d, i) => { same(`Category by revenue ${i + 1}`, `${d[ci('sub')]} ${d[ci('revenue')]}`, `${(mc[i]?.[0] || '').replace(/^\d+\.\s*/, '')} ${mc[i]?.find(x => x.startsWith('₹'))}`) })
await tap(cc.getByRole('button', { name: 'Total return %', exact: true }))
mc = await rankedRows(cc)
const byTot = [...deskCat].sort((a, b) => parseFloat(b[ci('total')]) - parseFloat(a[ci('total')]))
byTot.slice(0, 8).forEach((d, i) => same(`Category by total return % ${i + 1} value`, d[ci('total')], mc[i]?.find(x => /%$/.test(x))))
// reasons: every reason (count, share, ₹) + Total
const rc = card('Return reasons (CIR & Exchange)')
if (await rc.getByRole('button', { name: /^Show all/ }).count()) await tap(rc.getByRole('button', { name: /^Show all/ }))
const mReasons = (await rc.locator('button[style*="grid"]').allInnerTexts()).map(t => t.split('\n').map(x => x.trim()).filter(Boolean))
const dReasons = D.reasons.slice(1).filter(r => r.length === 4)
const dTotal = dReasons.find(r => r[0] === 'Total'), dList = dReasons.filter(r => r[0] !== 'Total')
dList.forEach(d => { const m = mReasons.find(x => x[0] === d[0]); same(`Reason ${d[0]}`, `${d[1]} · ${d[2]} · ${d[3]}`, m ? `${m[1]} · ${m[2].replace(' · ', ' · ')}` : 'missing') })
const totalLine = clean(await rc.locator('div').filter({ hasText: /^Total/ }).last().innerText())
same('Reasons total (All)', `Total ${dTotal[1]} · ${dTotal[3]}`, totalLine)
for (const k of ['CIR', 'Exch']) {
  await tap(rc.getByRole('tab', { name: k, exact: true }))
  const d = D.reasonTotals[k].split(' ') // Total, count, 100%, ₹x, unit
  same(`Reasons total (${k})`, `Total ${d[1]} · ${d.slice(3).join(' ')}`, clean(await rc.locator('div').filter({ hasText: /^Total/ }).last().innerText()))
}
// 12 months
const mo = card('Last 12 months')
await tap(mo.getByRole('button', { name: /^Show all/ }))
const mMonths = (await mo.locator('button').filter({ hasText: /-\d\d/ }).allInnerTexts()).map(t => t.split('\n').map(x => x.trim()).filter(Boolean))
const mh = D.months[0], mi = h => mh.findIndex(x => x.toLowerCase().startsWith(h))
D.months.slice(1).filter(r => r.length === mh.length && /^[A-Z][a-z]{2}-\d\d$/.test(r[0])).forEach(d => {
  const m = mMonths.find(x => x[0].startsWith(d[0]))
  same(`Month ${d[0]}`, `${d[mi('revenue')]} ${d[mi('total')]}`, m ? `${m[1].replace(/^Rev /, '')} ${m[2]}` : 'missing')
})
for (const d of D.months.slice(1).filter(r => /^[A-Z][a-z]{2}-\d\d$/.test(r[0])).slice(0, 3)) {
  await tap(mo.locator('button').filter({ hasText: new RegExp(`^${d[0]}`) }).first())
  const sheet = clean(await mp.locator('[role=dialog]').innerText())
  for (const h of ['cancel', 'rto', 'cir', 'exchang']) { n++; if (!sheet.includes(d[mi(h)])) { fail++; console.log(`DIFF Month ${d[0]} ${h}: desktop ${d[mi(h)]} not in sheet`) } }
  await mp.keyboard.press('Escape'); await mp.waitForTimeout(300)
}
// exchange: top 10 by exch qty
const ex = card('Exchange deep dive')
const mEx = await rankedRows(ex)
const eh = D.exch[0], ei = h => eh.findIndex(x => x.toLowerCase().replace(/\s+/g, ' ').startsWith(h))
D.exch.slice(1).filter(r => r.length === eh.length).slice(0, 10).forEach((d, i) => {
  const m = mEx[i] || []
  same(`Exchange ${i + 1}`, `${d[ei('sku')]} ${d[ei('exch qty')]} ${d[ei('exch %')]} · ${d[ei('exch rev')]}`, `${(m[0] || '').replace(/^\d+\.\s*/, '')} ${m[m.length - 2]} ${m[m.length - 1]}`)
})
await mb.browser.close()
console.log(`${process.env.SEPT ? 'Sep 2026' : '1–25 Oct 2026'} (live API): ${n} values compared, ${fail ? fail + ' differ' : 'ALL MATCH'}`)
process.exit(fail ? 1 : 0)
