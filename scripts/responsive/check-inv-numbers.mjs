// Inventory mobile vs desktop numbers (same session data). Desktop at 1366, phone at 390.
// Usage: node scripts/responsive/check-inv-numbers.mjs [sections,comma]   sections: summary,warehouse
import { launch, openPage, VIEWPORTS } from './lib.mjs'
const want = new Set((process.argv[2] || 'summary,warehouse').split(','))
const norm = s => (s || '').replace(/\s+/g, ' ').trim()
let fails = 0
const same = (label, a, b) => { const ok = norm(a) === norm(b); if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'DIFF'} ${label}: desktop "${norm(a)}" · mobile "${norm(b)}"`) }

async function open(vpName, route) {
  const { browser, ctx } = await launch(VIEWPORTS.find(v => v.name === vpName))
  const page = await ctx.newPage()
  await openPage(page, route)
  return { browser, page }
}

const D = await open('laptop-1366x768', '/inventory/inventory_health')
const P = await open('iphone14-390x844', '/inventory/inventory_health')

if (want.has('summary')) {
  const desk = await D.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.inv-kpi-desktop-grid > *')].map(t => {
    const lines = t.innerText.split('\n').map(x => x.trim()).filter(Boolean)
    return [lines[0].toUpperCase(), lines.slice(1).join(' ')]
  })))
  const mob = await P.page.evaluate(() => {
    const card = document.querySelector('.master-card')
    const tiles = Object.fromEntries([...card.querySelectorAll('.master-tiles > *')].map(t => { const l = t.innerText.split('\n').map(x => x.trim()).filter(Boolean); return [l[0].toUpperCase(), l.slice(1).join(' ')] }))
    const heroVal = card.querySelector('[aria-live] > div')?.innerText
    return { tiles, heroVal }
  })
  const num = s => (norm(s).match(/[\d.,]+[KLCr]*/) || [''])[0]
  same('Total inventory', num(desk['TOTAL INVENTORY']), num(mob.heroVal))
  same('RTD', num(desk['RTD INVENTORY']), num(mob.tiles['RTD']))
  same('RAW', num(desk['RAW INVENTORY']), num(mob.tiles['RAW']))
  same('Blocked RAW', num(desk['BLOCKED RAW']), num(mob.tiles['BLOCKED RAW']))
  same('Avg sale (B2C)', num(desk['AVG SALE (B2C)']), num(mob.tiles['AVG SALE (B2C)']))
  same('Total avg sale', num(desk['TOTAL AVG SALE']), num(mob.tiles['TOTAL AVG SALE']))
  same('Days of inventory', num(desk['DAYS OF INVENTORY']), num(mob.tiles['DAYS OF INVENTORY']))
}

if (want.has('warehouse')) {
  const desk = await D.page.evaluate(() => [...document.querySelectorAll('.inv-wh-desktop-wrap .inv-wh-grid > div')].map(c => {
    const t = c.innerText.split('\n').map(x => x.trim()).filter(Boolean)
    const get = re => (t.find(x => re.test(x)) || '')
    return { loc: t[0], status: t[1], total: (t.find(x => /units$/.test(x)) || '').replace(/\s*units$/, ''), doi: get(/^DOI/).replace(/^DOI\s*/, ''), alloc: get(/^Allocation/).replace(/^Allocation:\s*/, '') }
  }))
  const mob = await P.page.evaluate(() => [...document.querySelectorAll('.inv-wh-row')].map(b => {
    const s = b.querySelectorAll(':scope > span')
    return { loc: s[0].innerText.trim(), total: s[1].querySelector('b').innerText.trim(), status: s[1].innerText.replace(s[1].querySelector('b').innerText, '').trim(), doi: s[2].innerText.trim(), alloc: s[3].innerText.trim() }
  }))
  same('Warehouse locations', desk.map(d => d.loc).join(','), mob.map(m => m.loc).join(','))
  for (const d of desk) {
    const m = mob.find(x => x.loc === d.loc) || {}
    same(`${d.loc} units · status · DOI · allocation`, `${d.total} · ${d.status} · ${d.doi} · ${d.alloc}`, `${m.total} · ${m.status} · ${m.doi} · ${m.alloc}`)
  }
}
await D.browser.close(); await P.browser.close()
console.log(fails ? `${fails} difference(s)` : 'ALL MATCH')
