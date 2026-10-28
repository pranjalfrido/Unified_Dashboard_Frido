// Reconciles the values the mobile Overview shows that the desktop Overview does not (Sept 2026):
//   1 all state revenues (Top States "Show all") add up to the Gross revenue hero, shares to ~100%
//     (the gap = orders with no state on them)
//   2 a state's top cities never add up to more than that state
//   3 the New / Repeat revenue split percentages match their two values
//   4 the "x repeat" customer count equals the Customer page's "returning" count for the same range
// Values are read from the screen, so the tolerance is the display rounding (₹x.xx Cr / L).
// Usage: node scripts/responsive/check-reconcile.mjs
import { launch, openWithSept, waitStableText, VIEWPORTS } from './lib.mjs'

const money = t => { const m = t.replace(/,/g, '').match(/₹\s?([\d.]+)\s?(Cr|L|K)?/); if (!m) return null; return +m[1] * ({ Cr: 1e7, L: 1e5, K: 1e3 }[m[2]] || 1) }
const unit = t => ({ Cr: 0.005e7, L: 0.005e5, K: 0.005e3 }[(t.match(/(Cr|L|K)\b/) || [])[1]] || 0.5) // half the last shown digit
let fail = 0
const check = (name, ok, extra) => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name} - ${extra}`) }

const { browser, ctx } = await launch(VIEWPORTS.find(v => v.name === 'iphone14-390x844'))
const page = await ctx.newPage()
await openWithSept(page, '/overview')
await waitStableText(page)

// 1 states vs gross
const heroText = await page.locator('.master-card').innerText()
const gross = money(heroText.split('\n').find(l => /₹/.test(l)))
const card = page.locator('.ov-mobile > div > div').filter({ has: page.getByText('Top States', { exact: true }) })
await card.getByRole('button', { name: /^Show all \d+ states$/ }).click()
const rows = await card.locator('button').filter({ hasText: /^\d+\. / }).allInnerTexts()
const parsed = rows.map(r => { const p = r.split('\n').map(s => s.trim()).filter(Boolean); return { name: p[0], text: p[1], rev: money(p[1]), share: parseFloat(p[2]) } })
const sum = parsed.reduce((s, r) => s + r.rev, 0)
const tol = parsed.reduce((s, r) => s + unit(r.text), 0)
const shareSum = parsed.reduce((s, r) => s + (r.share || 0), 0)
const gap = gross - sum
check('state revenues add up to the Gross revenue hero', sum <= gross + tol && shareSum <= 100.5,
  `${parsed.length} states sum ₹${(sum / 1e7).toFixed(2)} Cr vs gross ₹${(gross / 1e7).toFixed(2)} Cr; shares sum ${shareSum.toFixed(1)}%; gap ₹${(gap / 1e5).toFixed(2)} L (${(gap / gross * 100).toFixed(2)}%, display rounding ±₹${(tol / 1e5).toFixed(2)} L)`)
const unknown = parsed.find(r => /unknown/i.test(r.name))
console.log(`     state labelled "Unknown" in the list: ${unknown ? unknown.text : 'none'}`)

// 2 cities within a state
await card.locator('button').filter({ hasText: /^1\. / }).first().click(); await page.waitForTimeout(400)
const sheet = page.getByRole('dialog')
const st = await sheet.innerText()
const stateRev = money(st.split('\n').find(l => /₹/.test(l)))
const cityRows = await sheet.locator('div, button').filter({ hasText: /^\d+\. / }).evaluateAll(els => [...new Set(els.map(e => e.innerText))])
const citySum = cityRows.map(t => money(t) || 0).reduce((a, b) => a + b, 0)
const cityShare = cityRows.map(t => parseFloat((t.match(/([\d.]+)%/) || [])[1] || 0)).reduce((a, b) => a + b, 0)
check('top cities stay within their state', citySum <= stateRev * 1.001 && cityShare <= 100.05, `${parsed[0].name}: ${cityRows.length} cities ₹${(citySum / 1e7).toFixed(2)} Cr of ₹${(stateRev / 1e7).toFixed(2)} Cr (${cityShare.toFixed(1)}%)`)
await page.goBack(); await page.waitForTimeout(300)

// 3 new / repeat split
const cust = await page.locator('.ov-mobile').getByText('Customers · D2C', { exact: true }).locator('xpath=ancestor::div[3]').innerText()
const nm = cust.match(/New customers\s*\n\s*(₹[\d.,]+\s?(?:Cr|L|K)?)\s*(\d+)%/), rm = cust.match(/Repeat customers\s*\n\s*(₹[\d.,]+\s?(?:Cr|L|K)?)\s*(\d+)%/)
const nv = money(nm[1]), rv = money(rm[1]), np = +nm[2], rp = +rm[2]
const calcNew = nv / (nv + rv) * 100
check('New / Repeat split matches its values', Math.abs(calcNew - np) <= 1 && np + rp === 100, `${nm[1]} + ${rm[1]} → new ${calcNew.toFixed(1)}% (shown ${np}%), repeat ${rp}%`)
const repeatNote = (cust.match(/([\d,]+) repeat/) || [])[1]
await browser.close()

// 4 repeat count vs the Customer page (desktop), same range
const d = await launch(VIEWPORTS[1])
const p2 = await d.ctx.newPage()
await openWithSept(p2, '/customer')
const ctext = await waitStableText(p2)
const returning = (ctext.match(/([\d,]+) returning/) || [])[1]
check('"x repeat" equals the Customer page\'s returning customers', !!repeatNote && repeatNote === returning, `Overview mobile ${repeatNote} repeat · Customer page ${returning} returning (both /api/customer {start,end})`)
await d.browser.close()
console.log(fail ? `${fail} FAILED` : 'ALL PASS')
process.exit(fail ? 1 : 0)
