// Logistics → Cost: mobile (iPhone 14) vs desktop (1366) on the same data path, default months
// (each tab's own default). Overview, B2C, FTL/PTL, 3PL: tiles + hero, and the lists row by row.
// Usage: node scripts/responsive/check-log-cost-numbers.mjs [Overview,B2C,FTL/PTL,3PL]
import { launch, openPage, VIEWPORTS } from './lib.mjs'

const ROUTE = '/logistics/cost_analytics'
const tabs = (process.argv[2] || 'Overview,B2C,FTL/PTL,3PL').split(',')
const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim()
let fails = 0
const same = (label, a, b) => {
  const ok = norm(a) === norm(b)
  if (!ok) fails++
  console.log(`${ok ? 'OK  ' : 'DIFF'} ${label}${ok ? '' : `: desktop "${norm(a).slice(0, 400)}" · mobile "${norm(b).slice(0, 400)}"`}`)
}
async function open(vpName) {
  const { browser, ctx } = await launch(VIEWPORTS.find(v => v.name === vpName))
  const page = await ctx.newPage()
  await openPage(page, ROUTE); await page.waitForTimeout(2500)
  return { browser, page }
}
const settle = page => page.waitForTimeout(3000)

// ── desktop readers ──
const dTiles = (page, labels) => page.evaluate(labels => {
  const T = s => (s || '').replace(/\s+/g, ' ').trim()
  const out = {}
  for (const l of labels) {
    const el = [...document.querySelectorAll('.lc-page div, .lc-page span')].find(e => e.childElementCount === 0 && T(e.textContent).toUpperCase() === l.toUpperCase() && e.offsetParent)
    let c = el; for (let i = 0; i < 4 && c && c.innerText.split('\n').filter(x => x.trim()).length < 2; i++) c = c.parentElement
    const lines = (c?.innerText || '').split('\n').map(T).filter(Boolean)
    out[l] = { value: lines[1], delta: ((c?.innerText || '').match(/[▲▼]\s*[\d.]+%/) || [''])[0].replace(/\s+/g, '') }
  }
  return out
}, labels)
const dTable = (page, mustHave) => page.evaluate(mustHave => {
  const T = s => (s || '').replace(/\s+/g, ' ').trim()
  const t = [...document.querySelectorAll('.lc-page table')].find(tb => { const h = T(tb.querySelector('thead')?.innerText).toUpperCase(); return mustHave.every(m => h.includes(m.toUpperCase())) && tb.offsetParent })
  if (!t) return null
  const heads = [...t.querySelectorAll('thead th')].map(th => T(th.innerText).toUpperCase())
  return [...t.querySelectorAll('tbody tr')].map(tr => Object.fromEntries([...tr.children].map((td, i) => [heads[i], T(td.innerText)])))
}, mustHave)
const dCards = (page, section) => page.evaluate(section => {
  const T = s => (s || '').replace(/\s+/g, ' ').trim()
  const h = [...document.querySelectorAll('.lc-page *')].find(e => e.childElementCount === 0 && T(e.textContent).toUpperCase() === section.toUpperCase())
  let grid = h; for (let i = 0; i < 6 && grid && !grid.nextElementSibling?.querySelector?.('.channel-card-hover'); i++) grid = grid.parentElement
  const cards = [...(grid?.nextElementSibling?.querySelectorAll('.channel-card-hover') || [])]
  return cards.map(c => c.innerText.split('\n').map(T).filter(Boolean))
}, section)

// ── mobile readers ──
const mTiles = page => page.evaluate(() => {
  const T = s => (s || '').replace(/\s+/g, ' ').trim()
  const out = {}
  for (const t of document.querySelectorAll('.master-tiles > *')) { const l = t.innerText.split('\n').map(T).filter(Boolean); out[l[0].toUpperCase()] = { value: l.at(-1), delta: (t.innerText.match(/[▲▼]\s*[\d.]+%/) || [''])[0].replace(/\s+/g, '') } }
  const hero = document.querySelector('.master-card [aria-live]')
  out._hero = { value: hero?.querySelector('div')?.innerText.trim(), sub: T(hero?.innerText.split('\n').slice(1).join(' ')) }
  return out
})
const mRows = (page, title) => page.evaluate(title => {
  const T = s => (s || '').replace(/\s+/g, ' ').trim()
  const sec = [...document.querySelectorAll('.log-mobile section')].find(s => T(s.querySelector('h2')?.textContent) === title)
  return [...(sec?.querySelectorAll('button') || [])].map(b => b.innerText.split('\n').map(T).filter(Boolean)).filter(l => l.length >= 3 && !/^Show |→$/.test(l[0]))
}, title)
const mTab = async (page, section, label) => { await page.locator('section').filter({ has: page.locator('h2', { hasText: new RegExp(`^${section}$`) }) }).getByRole('tab', { name: label, exact: true }).click(); await page.waitForTimeout(300) }

const D = await open('laptop-1366x768'), P = await open('iphone14-390x844')
for (const tab of tabs) {
  await D.page.locator('.lc-page button').filter({ hasText: new RegExp(`^${tab.replace('/', '\\/')}$`) }).first().click(); await settle(D.page)
  await P.page.getByRole('tab', { name: tab, exact: true }).first().tap(); await settle(P.page)
  const mt = await mTiles(P.page)
  console.log(`== ${tab} (default months, static file)`)
  const tiles = async pairs => { const dt = await dTiles(D.page, pairs.map(p => p[0])); for (const [d, m] of pairs) same(`${tab} tile ${m}`, dt[d]?.value, mt[m]?.value) }
  if (tab === 'Overview') {
    await tiles([['Total Logistics Cost', 'TOTAL COST'], ['B2C Courier Cost', 'B2C COURIER'], ['FTL/PTL Freight Cost', 'FTL/PTL FREIGHT'], ['3PL Warehousing Cost', '3PL WAREHOUSING'], ['Partners', 'PARTNERS'], ['Logistics % of Value', '% OF VALUE']])
    for (const [section, label] of [['B2C Courier Partners', 'B2C couriers'], ['FTL/PTL Transport Partners', 'FTL/PTL'], ['3PL Warehousing Partners', '3PL']]) {
      const cards = await dCards(D.page, section)
      await mTab(P.page, 'Partners', label)
      const more = P.page.locator('section').filter({ has: P.page.locator('h2', { hasText: /^Partners$/ }) }).locator('button', { hasText: /^Show all/ })
      if (await more.count()) { await more.click(); await P.page.waitForTimeout(200) }
      const rows = await mRows(P.page, 'Partners')
      // desktop card: [name, share, cost, …]; mobile row: [name, sub, cost, share]
      same(`${tab} partners ${label} (name, cost, share)`, cards.map(c => (/^[A-Z]{2,3}$/.test(c[0]) ? c.slice(1) : c)).filter(c => c[0] !== 'Rental Fixed Vehicle').map(c => `${c[0]} ${c[2]} ${c[1]}`).join(' | '), rows.filter(r => r[0] !== 'Rental fixed vehicle').map(r => `${r[0]} ${r[2]} ${r[3]}`).join(' | '))
    }
  }
  if (tab === 'B2C') {
    const dt = await dTiles(D.page, ['Total Logistics Cost'])
    same(`${tab} hero cost + MoM`, `${dt['Total Logistics Cost']?.value} ${dt['Total Logistics Cost']?.delta}`, `${mt._hero.value} ${(mt._hero.sub.match(/[▲▼][\d.]+%/) || [''])[0]}`)
    await tiles([['Total Shipment Value', 'SHIPMENT VALUE'], ['Cost per Kg', 'COST PER KG'], ['Avg Cost / Shipment', 'COST / SHPMT'], ['Surcharge % of Freight', 'SURCHARGE %'], ['Wasted Freight (Returns)', 'WASTED FREIGHT']])
    const ct = await dTable(D.page, ['Courier', 'Over Wt', 'Under Wt'])
    const mc = await mRows(P.page, 'Couriers')
    same(`${tab} couriers (name, shipments, cost, ₹/shpmt, ₹/kg, over-wt %, share)`,
      (ct || []).map(r => `${r.COURIER} ${r.SHIPMENTS} ${r.COST} ${r['AVG COST / SHIPMENT']} ${r['COST / KG']} ${(r['OVER WT'].match(/\(([\d.]+%)\)/) || [])[1]} ${r['SHARE OF SPEND']}`).join(' | '),
      mc.map(l => { const m = l[1].match(/^([\d,]+) · (₹[\d.]+)\/shpmt(?: · (₹[\d.]+)\/kg)?/) || []; const v = l[3].match(/^([\d.]+%|—) · over-wt ([\d.]+%)/) || []; return `${l[0]} ${m[1]} ${l[2]} ${m[2]} ${m[3] || '—'} ${v[2]} ${v[1]}` }).join(' | '))
    const zt = await dTable(D.page, ['Zone', 'Avg Cost / Shipment', 'Share'])
    const mz = await mRows(P.page, 'Where the money goes')
    same(`${tab} money by zone (zone, shipments, ₹/shpmt, ₹/kg, share)`, (zt || []).map(r => `${r.ZONE} ${r.SHIPMENTS} ${r['AVG COST / SHIPMENT']} ${r['COST / KG']} ${r.SHARE}`).join(' | '),
      mz.map(l => { const m = l[1].match(/^([\d,]+) shpmt · (₹[\d.]+)\/shpmt(?: · (₹[\d.]+)\/kg)?/) || []; return `${l[0]} ${m[1]} ${m[2]} ${m[3] || '—'} ${l[3]}` }).join(' | '))
    const mt2 = await dTable(D.page, ['Mode', 'Shipments', 'Cost'])
    await mTab(P.page, 'Where the money goes', 'By leg')
    const ml = await mRows(P.page, 'Where the money goes')
    same(`${tab} money by leg (mode, shipments, cost, ₹/shpmt, share)`, (mt2 || []).map(r => `${r.MODE} ${r.SHIPMENTS} ${r.COST} ${r['AVG COST / SHIPMENT']} ${r.SHARE}`).join(' | '),
      ml.map(l => { const m = l[1].match(/^([\d,]+) shpmt · (₹[\d.]+)\/shpmt/) || []; return `${l[0]} ${m[1]} ${l[2]} ${m[2]} ${l[3]}` }).join(' | '))
    const bt = await dTable(D.page, ['Slab', 'Overbilled'])
    await mTab(P.page, 'Weight slabs', 'Rate card band')
    const mb = await mRows(P.page, 'Weight slabs')
    same(`${tab} rate card bands (band, shipments, cost, share, ₹/shpmt, ₹/kg, overbilled)`, (bt || []).map(r => `${r.SLAB} ${r.SHIPMENTS} ${r['TOTAL COST']} ${r.SHARE} ${r['AVG COST / SHIPMENT']} ${r['COST / KG']} ${r.OVERBILLED}`).join(' | '),
      mb.map(l => { const m = l[1].match(/^([\d,]+) shpmt · (₹[\d.]+)\/shpmt · (₹[\d.]+|—)\/kg/) || []; const v = l[3].match(/^([\d.]+%) · overbilled ([\d.]+%)/) || []; return `${l[0]} ${m[1]} ${l[2]} ${v[1]} ${m[2]} ${m[3]} ${v[2]}` }).join(' | '))
    const st = await dTable(D.page, ['Weight Slab', 'Forward', 'Reverse'])
    await mTab(P.page, 'Weight slabs', 'Billed slab')
    const ms = await mRows(P.page, 'Weight slabs')
    const stMap = new Map((st || []).map(r => [r['WEIGHT SLAB'].replace(/\s+/g, ' '), r]))
    same(`${tab} billed slabs, top 8 by spend (slab, shipments, spend, ₹/shpmt, ₹/kg, share)`,
      ms.map(l => { const r = stMap.get(l[0]); return r ? `${l[0]} ${r.SHIPMENTS} ${r['TOTAL SPEND']} ${r['AVG COST / SHIPMENT']} ${r['COST / KG']} ${r['SHARE OF SPEND']}` : `${l[0]} missing on desktop` }).join(' | '),
      ms.map(l => { const m = l[1].match(/^([\d,]+) shpmt · (₹[\d.]+)\/shpmt · (₹[\d.]+)\/kg/) || []; return `${l[0]} ${m[1]} ${l[2]} ${m[2]} ${m[3]} ${l[3]}` }).join(' | '))
    const drt = await dTable(D.page, ['Courier', 'First', 'Latest', 'Drift'])
    const md = await mRows(P.page, 'Rate drift by courier')
    same(`${tab} rate drift (courier, first, latest, drift, months)`, (drt || []).map(r => `${r.COURIER} ${r.FIRST} ${r.LATEST} ${r.DRIFT} ${r.MONTHS}`).join(' | '),
      md.map(l => { const m = l[1].match(/^(₹[\d.]+) → (₹[\d.]+) \/kg · ([\d,]+) months/) || []; return `${l[0]} ${m[1]} ${m[2]} ${l[2]} ${m[3]}` }).join(' | '))
    const pt = await dTable(D.page, ['Spend', 'Cost / Order'])
    const mp = await mRows(P.page, 'Cost by product')
    same(`${tab} cost by product, categories (name, shipments, spend, cost/order)`, (pt || []).map(r => `${(r['CATEGORY / SUB-CATEGORY'] || '').replace(/^[+−]\s*/, '')} ${r.SHIPMENTS} ${r.SPEND} ${r['COST / ORDER']}`).join(' | '),
      mp.map(l => { const m = l[1].match(/^([\d,]+) shpmt · (.+?)\/order/) || []; return `${l[0]} ${m[1]} ${l[2]} ${m[2]}` }).join(' | '))
    const lt = await dTable(D.page, ['Courier', 'vs cheapest'])
    const ml2 = await mRows(P.page, 'Like-for-like courier cost')
    same(`${tab} like-for-like (courier, shipments, avg ₹, ₹/kg, vs cheapest)`, (lt || []).map(r => `${r.COURIER} ${r.SHIPMENTS} ${r['AVG ₹']} ${r['₹/KG']} ${r['VS CHEAPEST']}`).join(' | '),
      ml2.map(l => { const m = l[1].match(/^([\d,]+) shpmt · (₹[\d.]+)\/kg/) || []; return `${l[0]} ${m[1]} ${l[2]} ${m[2]} ${l[3]}` }).join(' | '))
  }
  if (tab === 'FTL/PTL') {
    const dt = await dTiles(D.page, ['Total Freight Cost'])
    same(`${tab} hero cost + MoM`, `${dt['Total Freight Cost']?.value} ${dt['Total Freight Cost']?.delta}`, `${mt._hero.value} ${(mt._hero.sub.match(/[▲▼][\d.]+%/) || [''])[0]}`)
    await tiles([['Avg Cost / Trip', 'AVG COST/TRIP'], ['Rental Fixed Vehicle', 'RENTAL VEHICLES'], ['Dearest Vehicle', 'DEAREST VEHICLE'], ['Top Transporter Share', 'TOP TRANSPORTER'], ['Top 3 Lane Share', 'TOP 3 LANES'], ['Single-Sourced Spend', 'SINGLE-SOURCED'], ['Transporters', 'TRANSPORTERS']])
    const tt = await dTable(D.page, ['Transporter', 'Total Spend', 'Share'])
    const more = P.page.locator('section').filter({ has: P.page.locator('h2', { hasText: /^Transporters$/ }) }).locator('button', { hasText: /^Show all/ })
    if (await more.count()) { await more.click(); await P.page.waitForTimeout(200) }
    const mtr = await mRows(P.page, 'Transporters')
    same(`${tab} transporters (name, trips, spend, ₹/trip, share)`, (tt || []).map(r => `${r.TRANSPORTER} ${r.TRIPS} ${r['TOTAL SPEND']} ${r['AVG COST / TRIP']} ${r.SHARE}`).join(' | '),
      mtr.map(l => { const m = l[1].match(/^([\d,]+) trips · (₹[\d,]+)\/trip/) || []; return `${l[0]} ${m[1]} ${l[2]} ${m[2]} ${l[3]}` }).join(' | '))
    const vt = await dTable(D.page, ['Vehicle', 'Lanes', 'Transporters'])
    const vm = P.page.locator('section').filter({ has: P.page.locator('h2', { hasText: /^Vehicle types$/ }) }).locator('button', { hasText: /^Show all/ })
    if (await vm.count()) { await vm.click(); await P.page.waitForTimeout(200) }
    const mv = await mRows(P.page, 'Vehicle types')
    same(`${tab} vehicle types (vehicle, trips, spend, lanes, transporters, share)`, (vt || []).map(r => `${r.VEHICLE} ${r.TRIPS} ${r['TOTAL SPEND']} ${r.LANES} ${r.TRANSPORTERS} ${r.SHARE}`).join(' | '),
      mv.map(l => { const m = l[1].match(/^([\d,]+) trips · ([\d,]+) lanes · ([\d,]+) transporters/) || []; return `${l[0]} ${m[1]} ${l[2]} ${m[2]} ${m[3]} ${l[3]}` }).join(' | '))
    const ty = await dTable(D.page, ['Type', 'Trips', 'Cost'])
    const mty = await mRows(P.page, 'Freight type mix')
    same(`${tab} freight types (type, trips, cost, ₹/trip)`, (ty || []).map(r => `${r.TYPE} ${r.TRIPS} ${r.COST} ${r['AVG COST / TRIP']}`).join(' | '),
      mty.map(l => { const m = l[1].match(/^([\d,]+) trips · (₹[\d,]+)\/trip/) || []; return `${l[0]} ${m[1]} ${l[2]} ${m[2]}` }).join(' | '))
  }
  if (tab === '3PL') {
    const dt = await dTiles(D.page, ['Total Warehousing Cost'])
    same(`${tab} hero cost + ₹/parcel badge`, `${dt['Total Warehousing Cost']?.value} ${dt['Total Warehousing Cost']?.delta}`, `${mt._hero.value} ${(mt._hero.sub.match(/[▲▼][\d.]+%/) || [''])[0]}`)
    await tiles([['Cost / Parcel', 'COST / PARCEL'], ['Cost / kg', 'COST / KG'], ['Avg Parcel Weight', 'AVG PARCEL WEIGHT'], ['Cost / Site / Month', 'COST / SITE / MONTH'], ['Operations', 'OPERATIONS'], ['Rental', 'RENTAL'], ['Warehousing % of Value', '% OF VALUE']])
    const wt = await dTable(D.page, ['Facility', 'Pincode', 'Partner'])
    const wm = P.page.locator('section').filter({ has: P.page.locator('h2', { hasText: /^Warehouses/ }) }).locator('button', { hasText: /^Show all/ })
    const mw = await mRows(P.page, 'Warehouses (sites)')
    same(`${tab} sites (facility, total, ₹/parcel)`, (wt || []).slice(0, mw.length).map(r => `${r.FACILITY} ${r.TOTAL} ${r['₹ / PARCEL']}`).join(' | '),
      mw.map(l => `${l[0]} ${l[2]} ${(l[3].match(/^(₹[\d.]+)\/parcel/) || ['', '—'])[1]}`).join(' | '))
    if (await wm.count()) console.log('     (first rows compared; the rest are in the full-screen list)')
  }
}
await D.browser.close(); await P.browser.close()
console.log(fails ? `${fails} difference(s)` : 'ALL MATCH')
process.exit(fails ? 1 : 0)
