// Inventory mobile vs desktop numbers (same session data). Desktop at 1366, phone at 390.
// Usage: node scripts/responsive/check-inv-numbers.mjs [sections,comma]   sections: summary,warehouse,explorer,status
//   explorer: category rows at All / PNQ / GGN vs the desktop Location-wise table (Total / location columns)
//   status:   explorer filtered to Critical / Excess vs Inventory Detail with the same Stock status filter
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

// ── Stock explorer ───────────────────────────────────────────────
const mobCats = () => P.page.evaluate(() => [...document.querySelectorAll('#inv-stock-explorer .drill-down > button')].filter(b => /avg sale/.test(b.innerText)).map(b => {
  const l = b.innerText.split('\n').map(x => x.trim()).filter(Boolean)
  return { name: l[0], avg: (l[1].match(/avg sale ([\d,—]+)/) || [])[1], units: l[2] }
}))
const fmtIN = n => (n ? Math.round(n).toLocaleString('en-IN') : '—')
const locBtn = loc => P.page.locator('#inv-stock-explorer [aria-label="Location"] button').filter({ hasText: new RegExp(`^${loc}$`) })
if (want.has('explorer')) {
  const pivot = await D.page.evaluate(() => {
    const card = [...document.querySelectorAll('div')].find(d => d.innerText?.startsWith('Location-Wise Inventory'))
    const t = card.querySelector('table')
    const head = [...t.querySelector('tr').children].map(c => c.innerText.trim().toUpperCase().split(/\s/)[0])
    return [...t.querySelectorAll('tr')].filter(tr => tr.children[0]?.innerText.trim().startsWith('›')).map(tr => {
      const c = [...tr.children].map(x => x.innerText.trim())
      const row = { name: c[0].replace(/^›/, '').trim() }
      head.forEach((h, i) => { if (i > 0) row[h] = c[i] })
      return row
    })
  })
  if (process.env.DEBUG) console.log(JSON.stringify(pivot.slice(0, 2)))
  for (const loc of ['All', 'PNQ', 'GGN']) {
    await locBtn(loc).click()
    await P.page.waitForTimeout(500)
    const mob = await mobCats()
    let ok = 0, bad = 0
    for (const r of pivot) {
      const cell = loc === 'All' ? r.TOTAL : r[loc]
      const [dInv, dAvg] = loc === 'All' ? cell.split(' / ') : cell.split('\n')
      const m = mob.find(x => x.name === r.name)
      const dI = dInv?.trim() || '—', dA = dAvg?.trim() || '—'
      if (!m && (dI === '—' || dI === '0')) { ok++; continue }
      const mInv = m ? m.units : '—', mAvg = m ? m.avg : '—'
      if (dI === mInv && (dA === mAvg || (dA === '—' && mAvg === '0'))) ok++
      else { bad++; console.log('DIFF', loc, r.name, 'desktop', dI, dA, 'mobile', mInv, mAvg) }
    }
    fails += bad
    console.log(`${bad ? 'DIFF' : 'OK  '} explorer ${loc}: ${ok} categories match, ${bad} differ (${mob.length} shown on mobile)`)
  }
  await locBtn('All').click()
}
if (want.has('status')) {
  for (const st of ['Critical', 'Excess']) {
    // desktop: Filters → Stock status tile → Inventory Detail footer
    await D.page.getByRole('button', { name: /^Filters/ }).first().click()
    await D.page.getByRole('button', { name: st, exact: true }).first().click()
    await D.page.waitForTimeout(800)
    const foot = await D.page.evaluate(() => [...document.querySelectorAll('.inv-detail-card tfoot tr')].at(-1).innerText.replace(/\s+/g, ' ').trim())
    await D.page.getByRole('button', { name: st, exact: true }).first().click()
    await D.page.mouse.click(5, 300); await D.page.waitForTimeout(500)
    const [, skuN, , , , total, avg] = foot.match(/Total (\d+) SKUs ([\d,—]+) ([\d,—]+) ([\d,—]+) ([\d,—]+) ([\d,—]+)/) || []
    // mobile: explorer ⋯ → status; sum the category rows; SKU count from "Show all N SKUs"
    await P.page.locator('#inv-stock-explorer button[aria-haspopup="dialog"]').click()
    await P.page.locator('[role=dialog] button').filter({ hasText: new RegExp(`^${st}`) }).click()
    await P.page.waitForTimeout(600)
    const mob = await mobCats()
    const sum = k => mob.reduce((a, m) => a + Number((m[k] || '0').replace(/[,—]/g, '') || 0), 0)
    const showAll = await P.page.locator('#inv-stock-explorer button').filter({ hasText: /^Show all/ }).innerText()
    same(`status ${st}: SKUs · units · avg sale`, `${skuN} · ${total} · ${avg}`, `${(showAll.match(/[\d,]+/) || [''])[0].replace(/,/g, '')} · ${fmtIN(sum('units'))} · ${fmtIN(sum('avg'))}`)
    await P.page.locator('#inv-stock-explorer button[aria-haspopup="dialog"]').click()
    await P.page.locator('[role=dialog] button').filter({ hasText: /^All statuses/ }).click()
    await P.page.waitForTimeout(400)
  }
}
await D.browser.close(); await P.browser.close()
console.log(fails ? `${fails} difference(s)` : 'ALL MATCH')
