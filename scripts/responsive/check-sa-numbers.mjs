// Sales & Allocation mobile vs desktop numbers (same session data, default date range).
// Usage: node scripts/responsive/check-sa-numbers.mjs [sections,comma]   sections: kpis,pairs,contribution,top,movers,daily
import { launch, openPage, VIEWPORTS } from './lib.mjs'
const want = new Set((process.argv[2] || 'kpis,pairs,contribution').split(','))
const norm = s => (s || '').replace(/\s+/g, ' ').trim()
let fails = 0
const same = (label, a, b) => { const ok = norm(a) === norm(b); if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'DIFF'} ${label}: desktop "${norm(a)}" · mobile "${norm(b)}"`) }
async function open(vpName) {
  const { browser, ctx } = await launch(VIEWPORTS.find(v => v.name === vpName))
  const page = await ctx.newPage()
  await openPage(page, '/inventory/sales_allocation')
  return { browser, page }
}
const D = await open('laptop-1366x768')
const P = await open('iphone14-390x844')
const card = (page, title) => page.evaluate(t => {
  const h = [...document.querySelectorAll('div, h2')].filter(d => d.childElementCount === 0 && d.textContent.trim() === t)[0]
  let c = h; for (let i = 0; i < 8 && c && !c.innerText.includes('\n'); i++) c = c.parentElement
  for (let i = 0; i < 4 && c && c.innerText.split('\n').length < 6; i++) c = c.parentElement
  return c ? c.innerText : ''
}, title)

if (want.has('kpis')) {
  const desk = await D.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.inv-kpi-desktop-grid > *')].map(t => {
    const l = t.innerText.split('\n').map(x => x.trim()).filter(Boolean); return [l[0].toUpperCase(), l.slice(1).join(' ')] })))
  const mob = await P.page.evaluate(() => {
    const c = document.querySelector('.master-card')
    return Object.fromEntries([...c.querySelectorAll('.master-tiles > *')].map(t => { const l = t.innerText.split('\n').map(x => x.trim()).filter(Boolean); return [l[0].toUpperCase(), l.slice(1).join(' ')] }))
  })
  const first = s => norm(s).split(' ')[0]
  same('Revenue', first(desk.REVENUE), mob.REVENUE)
  same('Units sold', first(desk['UNITS SOLD']), mob['UNITS SOLD'])
  same('Avg selling price', first(desk['AVG SELLING PRICE']), mob.ASP)
  same('Fill rate', first(desk['FILL RATE']), mob['FILL RATE'])
  same('Momentum', first(desk.MOMENTUM), mob.MOMENTUM)
  same('Sales type mix', (desk['SALES TYPE MIX'] || '').match(/\d+% B2C/)?.[0], mob['SALES MIX'])
  const hero = await P.page.evaluate(() => document.querySelector('.master-card [aria-live]').innerText)
  same('Revenue sub-line (avg/day)', (desk.REVENUE.match(/Avg \S+\/day/) || [''])[0], (hero.match(/Avg \S+\/day/) || [''])[0])
}
if (want.has('pairs')) {
  const desk = await D.page.evaluate(() => {
    const h = [...document.querySelectorAll('*')].find(e => e.childElementCount === 0 && e.textContent.trim() === 'Location-Wise Sales vs Allocation')
    let c = h; while (c && !c.innerText.includes('% OF TOTAL') && !/% of total/i.test(c.innerText)) c = c.parentElement
    while (c && c.innerText.split('\n').length < 10) c = c.parentElement
    const lines = c.innerText.split('\n').map(x => x.trim()).filter(Boolean)
    const out = []
    for (let i = 0; i < lines.length - 2; i++) if (/^[A-Z]{3}$/.test(lines[i]) && / \/ /.test(lines[i + 1])) out.push(`${lines[i]} ${lines[i + 1]} ${lines[i + 2]}`)
    return out
  })
  const mob = await P.page.evaluate(() => [...document.querySelectorAll('.sa-pair')].map(r => r.innerText.replace(/\n/g, ' ').replace(' of shipped', '')))
  same('Sales vs allocation rows', desk.join(' | '), mob.join(' | '))
}
if (want.has('contribution')) {
  // desktop default: Units on both cards; mobile: Units, Channel then Category
  const deskRows = title => D.page.evaluate(t => {
    const h = [...document.querySelectorAll('*')].find(e => e.childElementCount === 0 && e.textContent.trim() === t)
    let c = h; while (c && c.innerText.split('\n').length < 8) c = c.parentElement
    const l = c.innerText.split('\n').map(x => x.trim()).filter(Boolean)
    const out = []
    for (let i = 0; i < l.length - 2; i++) if (/^[\d,]+$/.test(l[i + 1]) && /%$/.test(l[i + 2])) out.push(`${l[i]} ${l[i + 1]} ${l[i + 2]}`)
    return out
  }, title)
  const mobRows = async view => {
    await P.page.getByRole('tab', { name: view, exact: true }).click(); await P.page.waitForTimeout(300)
    const more = P.page.locator('section').filter({ hasText: 'Contribution' }).locator('button', { hasText: /^Show all/ })
    if (await more.count()) { await more.click(); await P.page.waitForTimeout(200) }
    return P.page.evaluate(() => {
      const sec = [...document.querySelectorAll('section')].find(s => s.querySelector('h2')?.textContent === 'Contribution')
      return [...sec.querySelectorAll(':scope > div, :scope > button')].filter(e => e.children.length >= 3 && /%$/.test(e.innerText.trim())).map(e => e.innerText.replace(/\n/g, ' ').trim())
    })
  }
  same('Channel contribution (units)', (await deskRows('Channel-Wise Sales')).join(' | '), (await mobRows('Channel')).join(' | '))
  same('Category contribution (units)', (await deskRows('Category Contribution')).join(' | '), (await mobRows('Category')).join(' | '))
}
if (want.has('top')) {
  // desktop default: Sub-cat, Units → first 10 rows (name, units, %)
  const desk = await D.page.evaluate(() => {
    const h = [...document.querySelectorAll('*')].find(e => e.childElementCount === 0 && e.textContent.trim() === 'Top Products')
    let c = h; while (c && c.innerText.split('\n').length < 20) c = c.parentElement
    const l = c.innerText.split('\n').map(x => x.trim()).filter(Boolean)
    const out = []
    for (let i = 0; i < l.length - 3 && out.length < 10; i++) if (/^\d+$/.test(l[i]) && /^[\d,]+$/.test(l[i + 2]) && /%$/.test(l[i + 3])) out.push(`${l[i + 1]} ${l[i + 2]} ${l[i + 3]}`)
    return out
  })
  const mob = await P.page.evaluate(() => {
    const sec = [...document.querySelectorAll('section')].find(s => s.querySelector('h2')?.textContent === 'Top products')
    return [...sec.querySelectorAll('.ranked-list > div > button')].filter(b => /^\d+\. /.test(b.innerText)).map(b => { const l = b.innerText.split('\n').map(x => x.trim()).filter(Boolean); return `${l[0].replace(/^\d+\. /, '')} ${l[1]} ${l[2]}` })
  })
  same('Top products (sub-cat, units, top 10)', desk.join(' | '), mob.join(' | '))
}
if (want.has('movers')) {
  // desktop default: Sub-category · Risers · Units · Last vs 2nd-last day → name, before, now, change
  const desk = await D.page.evaluate(() => {
    const h = [...document.querySelectorAll('*')].find(e => e.childElementCount === 0 && e.textContent.trim() === 'Drastic Sales Change')
    let c = h; while (c && !/\nchange\n/i.test(c.innerText)) c = c.parentElement
    const l = c.innerText.split('\n').map(x => x.trim()).filter(Boolean)
    const start = l.findIndex(x => /^change$/i.test(x)) + 1, out = []
    for (let i = start; i < l.length - 4 && out.length < 8; i += 5) out.push(`${l[i + 1]} ${l[i + 2]} → ${l[i + 3]} ${l[i + 4]}`)
    return out
  })
  const mob = await P.page.evaluate(() => {
    const sec = [...document.querySelectorAll('section')].find(s => s.querySelector('h2')?.textContent === 'Biggest movers')
    return [...sec.querySelectorAll(':scope > div')].filter(d => /→/.test(d.innerText)).map(d => d.innerText.split('\n').map(x => x.trim()).filter(Boolean).join(' '))
  })
  same('Biggest movers (sub-cat, risers, units, vs 2nd-last day)', desk.join(' | '), mob.join(' | '))
}
await D.browser.close(); await P.browser.close()
console.log(fails ? `${fails} difference(s)` : 'ALL MATCH')
