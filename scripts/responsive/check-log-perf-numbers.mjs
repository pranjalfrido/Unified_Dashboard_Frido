// Logistics → Performance: mobile (iPhone 14) vs desktop (1366) numbers on the same data path.
// Scenarios: default range (static file), Reverse direction, Bluedart only, Sept 2026 (live API).
// Compares the KPI tiles (value + ▲/▼), courier scorecard rows, the four TAT bucket tables, weight
// (qty), geography (drop city), RTO counts per courier and the NDR rows.
// Usage: node scripts/responsive/check-log-perf-numbers.mjs [scenario,…]   (default: all four)
import { launch, openPage, openWithSept, VIEWPORTS } from './lib.mjs'

const ROUTE = '/logistics/performance_analytics'
const want = (process.argv[2] || 'default,reverse,courier,sept').split(',')
const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim()
const num = s => (s == null || s === '—' ? null : parseFloat(String(s).replace(/[^\d.-]/g, '')))
let fails = 0
const same = (label, a, b) => {
  const ok = norm(a) === norm(b)
  if (!ok) fails++
  console.log(`${ok ? 'OK  ' : 'DIFF'} ${label}${ok ? '' : `: desktop "${norm(a).slice(0, 300)}" · mobile "${norm(b).slice(0, 300)}"`}`)
}

async function open(vpName, sept) {
  const { browser, ctx } = await launch(VIEWPORTS.find(v => v.name === vpName))
  const page = await ctx.newPage()
  if (sept) await openWithSept(page, ROUTE); else await openPage(page, ROUTE)
  // the live API (Sept) can take a while: wait until the loading veil is gone
  for (let i = 0; i < 360 && (await page.locator('.load-veil').count()); i++) await page.waitForTimeout(500)
  await page.waitForTimeout(2500)
  return { browser, page }
}
const settle = page => page.waitForTimeout(3500)

// ── apply a scenario ──
async function deskFilter(page, button) {
  await page.locator('button[title="Filters"]').first().click(); await page.waitForTimeout(500)
  await page.locator('button').filter({ hasText: new RegExp(`^\\s*${button}\\s*$`) }).first().click()
  await page.mouse.click(700, 20); await settle(page)
}
async function mobFilter(page, kind) {
  await page.locator('.log-filter-btn').first().tap(); await page.waitForTimeout(500)
  if (kind === 'reverse') await page.locator('[role=dialog] [aria-label="Courier direction"] button').filter({ hasText: /^Reverse$/ }).tap()
  else {
    await page.locator('[role=dialog] button').filter({ hasText: /^Courier/ }).first().tap(); await page.waitForTimeout(300)
    await page.locator('[role=dialog] label').filter({ hasText: /^Bluedart$/ }).first().tap()
    await page.locator('[role=dialog] button').filter({ hasText: /^Apply/ }).first().tap(); await page.waitForTimeout(300)
  }
  await page.locator('[role=dialog] button').filter({ hasText: /^Done$/ }).first().tap(); await settle(page)
}

// ── read desktop ──
const desk = page => page.evaluate(() => {
  const T = s => (s || '').replace(/\s+/g, ' ').trim()
  const out = { kpi: {}, courier: [], tat: {}, weight: [], geo: [], rto: [], ndr: [] }
  // hero + KPI cards
  const hero = [...document.querySelectorAll('.kpi-card')].find(c => /^Total Shipments/i.test(c.innerText))
  if (hero) {
    const l = hero.innerText.split('\n').map(T).filter(Boolean)
    out.kpi.ship = { value: l[1], delta: (hero.innerText.match(/[▲▼]\s*[\d.]+%/) || [''])[0].replace(/\s+/g, '') }
    out.kpi.rto = { value: (hero.innerText.match(/([\d.]+%)\s*RTO/) || [])[1] }
  }
  for (const c of document.querySelectorAll('.kpi-card')) {
    const l = c.innerText.split('\n').map(T).filter(Boolean)
    const delta = (c.innerText.match(/[▲▼]\s*[\d.]+%/) || [''])[0].replace(/\s+/g, '')
    out.kpi[l[0].toUpperCase()] = { value: l[1], delta }
  }
  const cardOf = title => { const t = [...document.querySelectorAll('div, span')].find(e => e.childElementCount === 0 && T(e.textContent) === title); return t?.closest('.card-hoverable') }
  const rowsOf = table => [...table.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => T(td.innerText)))
  // courier table: the table whose first header is "Courier" and has "Vol %"
  const ct = [...document.querySelectorAll('table')].find(t => /Courier/i.test(t.querySelector('th')?.innerText || '') && /Vol %/i.test(t.innerText))
  if (ct) out.courier = rowsOf(ct).filter(r => r.length > 5)
  for (const [k, title] of [['processing', 'Order Processing Time'], ['pickup', 'Order Pickup Time'], ['transit', 'In-Transit Time'], ['fulfilment', 'Fulfilment Time']]) {
    const span = [...document.querySelectorAll('span')].find(s => s.firstChild?.textContent?.trim() === title)
    const table = span?.closest('.card-hoverable')?.querySelector('table')
    const card = span?.closest('.card-hoverable')
    const all = card ? [...card.querySelectorAll('tr')].map(tr => [...tr.children].map(td => T(td.innerText))).filter(r => r.length === 5 && !/^Facility$|^Courier$/i.test(r[0])) : []
    if (table) out.tat[k] = { rows: all.filter(r => !/^Total$/i.test(r[0])), foot: all.filter(r => /^Total$/i.test(r[0])) }
  }
  const listOf = card => { const l = (card?.innerText || '').split('\n').map(T).filter(Boolean); const r = []; for (let i = 0; i < l.length - 1; i++) { const m = l[i + 1].match(/^([\d,]+|₹[\d.]+[KLCr]*) ?\(([\d.]+)%\)$/); if (m) r.push(`${l[i]} ${m[1]} ${m[2]}%`) } return r }
  out.weight = listOf(cardOf('Shipment Allocation by Weight'))
  out.geo = listOf(cardOf('Total Shipments by Drop City'))
  const rt = [...document.querySelectorAll('table')].find(t => /Total RTO/i.test(t.querySelector('thead')?.innerText || ''))
  if (rt) out.rto = rowsOf(rt).map(r => `${r[0]} ${r[1]}`)
  const nt = [...document.querySelectorAll('table')].find(t => /NDR Count/i.test(t.querySelector('thead')?.innerText || ''))
  if (nt) out.ndr = rowsOf(nt).map(r => `${r[0]} ${r[2]} ${r[3]} ${r[4]} ${r[5]}`)
  return out
})

// ── read mobile ──
async function mob(page) {
  const base = await page.evaluate(() => {
    const T = s => (s || '').replace(/\s+/g, ' ').trim()
    const out = { kpi: {}, courier: [], weight: [], geo: [], rto: [], ndr: [] }
    for (const t of document.querySelectorAll('.master-tiles > *')) {
      const l = t.innerText.split('\n').map(T).filter(Boolean)
      out.kpi[l[0].toUpperCase()] = { value: l.at(-1), delta: (t.innerText.match(/[▲▼]\s*[\d.]+%/) || [''])[0].replace(/\s+/g, '') }
    }
    out.courier = [...document.querySelectorAll('#log-scorecard .score-row')].map(b => b.innerText.split('\n').map(T).filter(Boolean))
    const card = title => [...document.querySelectorAll('section')].find(s => T(s.querySelector('h2')?.textContent) === title)
    const compact = sec => [...(sec?.querySelectorAll('button, div') || [])].filter(e => e.style?.gridTemplateColumns?.startsWith('minmax(0,1fr) auto auto') || e.style?.gridTemplateColumns === 'minmax(0px, 1fr) auto auto').map(e => e.innerText.split('\n').map(T).filter(Boolean))
    out.weight = compact(card('By weight')).map(l => `${l[0]} ${l[1]} ${l[2]}`)
    out.geo = compact(card('Geography')).map(l => `${l[0]} ${l[1]} ${l[2]}`)
    out.rto = [...(card('RTO shipment analysis')?.querySelectorAll('.sbr-row') || [])].map(r => r.innerText.split('\n').map(T).filter(Boolean)).filter(l => l[0] !== 'Total').map(l => `${l[0]} ${(l[1].match(/^([\d,]+) RTO/) || [])[1]}`)
    out.ndr = [...(card('NDR')?.querySelectorAll('button') || [])].map(b => b.innerText.split('\n').map(T).filter(Boolean)).filter(l => /NDR ·/.test(l[1] || '')).map(l => {
      const m = l[1].match(/^([\d,]+) NDR · → del ([\d.]+%|—) · → RTO ([\d.]+%|—)/) || []
      return `${l[0]} ${m[1]} ${l[2]} ${m[2]} ${m[3]}`
    })
    return out
  })
  // TAT: switch the toggle through all four
  base.tat = {}
  const speed = page.locator('section').filter({ has: page.locator('h2', { hasText: /^Speed/ }) })
  for (const [k, label] of [['processing', 'Processing'], ['pickup', 'Pickup'], ['transit', 'In-transit'], ['fulfilment', 'Fulfilment']]) {
    await speed.getByRole('tab', { name: label, exact: true }).click(); await page.waitForTimeout(250)
    base.tat[k] = await speed.locator('.sbr-row').evaluateAll(rows => rows.map(r => {
      const name = r.innerText.split('\n')[0].trim()
      const vals = [...r.innerText.matchAll(/(?:\d+(?:–\d+)?[dh]|\d+\+[dh]|\d+[dh]\+)\s+([\d.]+%|—)/g)].map(m => m[1])
      return { name, vals }
    }))
  }
  return base
}

function compare(tag, D, Mb) {
  // KPIs: desktop label → mobile tile label
  const map = [['ship', 'SHIPMENTS'], ['Z-RTO', 'Z-RTO'], ['FASR % (OF ATT.)', 'FASR'], ['RASR % (OF ATT.)', 'RASR'], ['MULTI-ATT DEL', 'MULTI-ATT'],
    ['AVG PROCESSING', 'PROCESSING'], ['AVG PICKUP TAT', 'PICKUP'], ['AVG IN-TRANSIT', 'IN-TRANSIT'], ['AVG FULFILMENT', 'FULFILMENT']]
  same(`${tag} KPI RTO %`, D.kpi.rto?.value, Mb.kpi['RTO %']?.value)
  for (const [d, m] of map) same(`${tag} KPI ${m} value · ▲/▼`, `${D.kpi[d]?.value} · ${D.kpi[d]?.delta}`, `${Mb.kpi[m]?.value} · ${Mb.kpi[m]?.delta}`)
  // courier rows: name, total, del %, rto % (desktop cells: name, vol, total, del, rto …)
  const dC = D.courier.map(r => `${r[0]} ${r[2]} ${r[3]} ${r[4]}`)
  const mC = Mb.courier.map(l => { const m = (l[1] || '').match(/^([\d,]+) · del ([\d.]+%) · RTO ([\d.]+%)/) || []; return `${l[0]} ${m[1]} ${m[2]} ${m[3]}` })
  same(`${tag} scorecard rows (courier, total, del %, RTO %)`, dC.join(' | '), mC.join(' | '))
  for (const k of ['processing', 'pickup', 'transit', 'fulfilment']) {
    const dt = D.tat[k]
    if (!dt) { same(`${tag} TAT ${k}`, 'desktop table missing', ''); continue }
    const f = v => (v === '—' || v == null ? '—' : `${num(v)}`)
    const dRows = [['Total', ...(dt.foot[0] || []).slice(1)], ...dt.rows].map(r => `${r[0]} ${r.slice(1, 5).map(f).join(' ')}`)
    const mRows = (Mb.tat[k] || []).map(r => `${r.name} ${r.vals.map(f).join(' ')}`)
    same(`${tag} TAT ${k} (rows + total, % per bucket)`, dRows.join(' | '), mRows.join(' | '))
  }
  same(`${tag} weight (qty)`, D.weight.join(' | '), Mb.weight.join(' | '))
  same(`${tag} geography (drop city, top 7 shown)`, D.geo.slice(0, 7).join(' | '), Mb.geo.join(' | '))
  same(`${tag} RTO count per courier`, D.rto.filter(r => !/^Total/.test(r)).join(' | '), Mb.rto.join(' | '))
  same(`${tag} NDR rows (count, NDR %, → del, → RTO)`, D.ndr.filter(r => !/^Total/.test(r)).join(' | '), Mb.ndr.join(' | '))
}

for (const sc of want) {
  const sept = sc === 'sept'
  const Dk = await open('laptop-1366x768', sept), Ph = await open('iphone14-390x844', sept)
  if (sc === 'reverse') { await deskFilter(Dk.page, 'Reverse'); await mobFilter(Ph.page, 'reverse') }
  if (sc === 'courier') { await deskFilter(Dk.page, 'Bluedart'); await mobFilter(Ph.page, 'courier') }
  const D = await desk(Dk.page), Mb = await mob(Ph.page)
  console.log(`== ${sc}${sept ? ' (Sept 2026, live API)' : ' (1–25 Oct, static file)'}`)
  compare(sc, D, Mb)
  await Dk.browser.close(); await Ph.browser.close()
}
console.log(fails ? `${fails} difference(s)` : 'ALL MATCH')
process.exit(fails ? 1 : 0)
