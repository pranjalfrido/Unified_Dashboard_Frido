// Sales mobile channel-specific cards vs desktop: Overall Channel share (top 6, Gross / Net, tap opens
// the channel), EBO Store-wise sales (total line, top 8, sort chips), Amazon Account breakdown,
// D2C Return reasons. Each first row is compared with the desktop card / table.
// Usage: node scripts/responsive/check-sales-cards.mjs [viewportName]   (RESPONSIVE_ENGINE=webkit ok)
import { launch, openWithSept, VIEWPORTS, ENGINE, waitSettled } from './lib.mjs'
import { mkdirSync } from 'fs'
const vp = VIEWPORTS.find(v => v.name === (process.argv[2] || 'iphone14-390x844'))
const out = 'docs/responsive/after/sales/cards'
mkdirSync(out, { recursive: true })
let fail = 0
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' - ' + extra : ''}`) }
const lines = t => t.split('\n').map(s => s.trim()).filter(Boolean)

async function mobileCard(route, heading, fn) {
  const { browser, ctx } = await launch(vp)
  const page = await ctx.newPage()
  await openWithSept(page, route) // Sept 2026: a full month with EBO store data
  const card = page.locator('section', { has: page.getByRole('heading', { name: heading, exact: true }) }).first()
  await card.waitFor({ timeout: 300000 })
  await card.scrollIntoViewIfNeeded()
  const r = await fn(page, card)
  await page.screenshot({ path: `${out}/${ENGINE}-${vp.name}-${heading.replace(/\W+/g, '-')}.png` })
  await browser.close()
  return r
}
async function desktop(route, fn) {
  const { browser, ctx } = await launch(VIEWPORTS[1])
  const page = await ctx.newPage()
  await openWithSept(page, route) // Sept 2026: a full month with EBO store data
  const r = await page.evaluate(fn)
  await browser.close()
  return r
}

// Overall: Channel share
const cs = await mobileCard('/sales/all', 'Channel share', async (page, card) => {
  const rows = card.locator('button').filter({ hasText: /₹/ })
  const n = await rows.count()
  const first = lines(await rows.first().innerText())
  const more = await card.getByRole('button', { name: /^Show all \d+ channels/ }).count()
  await card.getByRole('tab', { name: 'Net' }).click(); await page.waitForTimeout(200)
  const firstNet = lines(await rows.first().innerText())
  await card.getByRole('tab', { name: 'Gross' }).click(); await page.waitForTimeout(200)
  await rows.first().click(); await waitSettled(page)
  return { n, first, firstNet, more, url: page.url() }
})
check('Channel share: top 6 + "Show all"', cs.n === 6 && cs.more === 1, `${cs.n} rows`)
check('Channel share: tapping a channel opens its tab', /\/sales\/(?!all)/.test(cs.url), cs.url.replace(/^.*\/sales/, '/sales'))
const deskCs = await desktop('/sales/all', () => { const card = [...document.querySelectorAll('div')].find(d => d.innerText.trim().startsWith('Channel Share') && d.innerText.length < 2000); return card ? card.innerText.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 12) : null })
check('Channel share: first row equals desktop (gross)', !!deskCs && deskCs.includes(cs.first[1]) && deskCs.includes(cs.first[2]), `${cs.first.join(' ')} · desktop ${deskCs?.slice(3, 7).join(' ')}`)

// EBO: Store-wise sales
const st = await mobileCard('/sales/ebo', 'Store-wise sales', async (page, card) => {
  const txt = await card.innerText()
  const rows = card.locator('.ranked-list button').filter({ hasText: /^\d+\. / })
  const chips = await card.getByRole('group', { name: 'Sort by' }).getByRole('button').allInnerTexts()
  return { txt, n: await rows.count(), first: lines(await rows.first().innerText()), chips }
})
check('EBO stores: total line, top 8, sort chips', /\d+ stores · ₹/.test(st.txt) && st.n === 8 && st.chips.length === 8, `${st.txt.split('\n')[1]} · chips ${st.chips.join(', ')}`)
const deskSt = await desktop('/sales/ebo', () => {
  const table = [...document.querySelectorAll('table')].find(t => { const h = t.querySelector('thead')?.innerText || ''; return /\bstore\b/i.test(h) && /gross rev/i.test(h) })
  const tr = table?.querySelector('tbody tr')
  return tr ? [...tr.querySelectorAll('td')].map(td => td.innerText.trim()) : null
})
check('EBO stores: first store equals the desktop table', !!deskSt && deskSt[0] === st.first[0].replace(/^\d+\.\s*/, '') && deskSt[3].startsWith(st.first[1]), `${st.first.slice(0, 2).join(' ')} · desktop ${deskSt?.[0]} ${deskSt?.[3]}`)

// Amazon: Account breakdown
const ac = await mobileCard('/sales/amazon/overall', 'Account breakdown', async (page, card) => lines(await card.innerText()))
const deskAc = await desktop('/sales/amazon/overall', () => { const card = [...document.querySelectorAll('div')].find(d => d.innerText.trim().startsWith('Channel · Account Breakdown') && d.innerText.length < 1500); return card ? card.innerText.split('\n').map(s => s.trim()).filter(Boolean) : null })
check('Amazon accounts: same accounts and ₹ as desktop', !!deskAc && ac.slice(2, 4).every(x => deskAc.includes(x)), `${ac.slice(1, 5).join(' ')} · desktop ${deskAc?.slice(2, 5).join(' ')}`)

// D2C: Return reasons
const rr = await mobileCard('/sales/shopify/overall', 'Return reasons', async (page, card) => {
  const t = lines(await card.innerText())
  const rows = card.locator('button').filter({ hasText: /%/ })
  await rows.first().click(); await page.waitForTimeout(300)
  const sheet = await page.getByRole('dialog').innerText()
  return { t, sheet }
})
const deskRr = await desktop('/sales/shopify/overall', () => { const card = [...document.querySelectorAll('div')].find(d => d.innerText.trim().startsWith('Return Reasons · D2C') && d.querySelector('table')); return card ? card.innerText.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 12) : null })
const subLine = rr.t[1]
check('Return reasons: same "N reasons · N orders" as desktop', !!deskRr && deskRr.some(x => x.includes(subLine)), `${subLine} · desktop ${deskRr?.[1]}`)
check('Return reasons: a reason opens its sub-reasons (% of reason) and categories', /of reason/.test(rr.sheet) && /By category/i.test(rr.sheet))
console.log(fail ? `${ENGINE} ${vp.name}: ${fail} FAILED` : `${ENGINE} ${vp.name}: ALL PASS`)
process.exit(fail ? 1 : 0)
