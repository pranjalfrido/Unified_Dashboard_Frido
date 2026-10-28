// PNL_REVIEW_FIXES.md §7: the phone Financial view against the laptop Financial View table, every
// channel and sub-tab, page default range (live API).
//   chips    the phone's sort chips per view (to compare with §1a's table)
//   top 8    per chip: the phone's top 8 products = the laptop table sorted on the same column
//            (highest first), with the same materiality filter for % / ROAS sorts
//   rows     Units, Revenue, ASP of the phone's top 10 by Revenue ("Show all") = the laptop row
// Usage: node scripts/responsive/check-pnl-fv.mjs <out.json>
import { writeFileSync } from 'fs'
import { resolve } from 'path'
import { launch, openPage, repoRoot, VIEWPORTS } from './lib.mjs'
import { PNL_MATERIALITY } from '../../src/config/metricTargets.js'

const out = resolve(repoRoot, process.argv[2] || 'docs/responsive/after/pnl-review/fv-check.json')
const pause = ms => new Promise(r => setTimeout(r, ms))
const VIEWS = [
  ['all'], ['shopify'], ['shopify', 'MyFrido'], ['shopify', 'Mobility'], ['ebo'],
  ['amazon'], ['amazon', 'Seller Central'], ['amazon', 'Vendor Central'], ['flipkart'], ['blinkit'], ['cred'], ['firstcry'],
  ['instamart'], ['zepto'], ['myntra'], ['international'],
  ['offline'], ['offline', 'B2B'], ['offline', 'Stockist'], ['offline', 'MT GT'], ['offline', 'Miscellaneous', 'Misc'],
]
const LAPTOP_COL = { Revenue: 'Gross', 'Net revenue': 'Net', 'Returns %': 'Ret', 'COGS %': 'COGS', 'GM %': 'GM', 'SnD %': 'SnD', 'CM1 %': 'CM1', ROAS: 'ROAS', 'CM2 %': 'CM2' }
const money = s => {
  if (!s || /—/.test(s)) return null
  const neg = /^[−-]/.test(s.trim())
  const m = s.replace(/[−₹,\s-]/g, '').match(/^([\d.]+)(Cr|L|K)?$/)
  if (!m) return null
  const v = parseFloat(m[1]) * ({ Cr: 1e7, L: 1e5, K: 1e3 }[m[2]] || 1)
  return neg ? -v : v
}
const num = s => { if (!s || /—/.test(s)) return null; const v = parseFloat(s.replace(/[−]/g, '-').replace(/[₹,%x\s]/g, '')); return isNaN(v) ? null : v }
const valueOf = (col, s) => (col === 'Gross' || col === 'Net' ? money(s) : num(s))

// ── laptop: the Financial View table, all product rows
const laptop = {}
{
  const { browser, ctx } = await launch(VIEWPORTS.find(v => v.name === 'laptop-1366x768'))
  const page = await ctx.newPage()
  for (const [tab, sub] of VIEWS) {
    const key = [tab, sub].filter(Boolean).join(' · ')
    await openPage(page, `/pnl/${tab}`); await pause(2500)
    if (sub) { await page.locator('.fbar button').filter({ hasText: new RegExp(`^${sub}$`) }).first().click(); await pause(3000) }
    laptop[key] = await page.evaluate(() => {
      const fv = [...document.querySelectorAll('table')].find(t => t.querySelector('th')?.innerText.startsWith('Product'))
      if (!fv) return null
      const ths = [...fv.querySelectorAll('thead th')].map(t => t.innerText.replace(/[▲▼]/g, '').trim())
      return [...fv.querySelectorAll('tbody tr.fv-row')].map(tr => { const o = { key: tr.dataset.key }; [...tr.children].forEach((td, i) => { o[ths[i]] = i === 0 ? (td.querySelector('[title]')?.title || '').trim() : td.innerText.trim().split(String.fromCharCode(10))[0].trim() }); return o })
    })
    console.log('laptop', key, laptop[key]?.length ?? 'no table')
  }
  await browser.close()
}

// ── phone
const result = {}
{
  const { browser, ctx } = await launch(VIEWPORTS.find(v => v.name === 'iphone14-390x844'))
  const page = await ctx.newPage()
  for (const [tab, sub, phoneSub] of VIEWS) {
    const key = [tab, sub].filter(Boolean).join(' · ')
    const r = result[key] = { chips: [], mismatches: [], ties: 0, checked: 0 }
    await openPage(page, `/pnl/${tab}`); await pause(2500)
    if (sub) { await page.locator('.m-header [role=tab]').filter({ hasText: new RegExp(`^${phoneSub || sub}$`) }).first().click(); await pause(3000) }
    const list = page.locator('.pnl-mobile .ranked-list').first()
    if (!(await list.count())) { r.note = 'no Financial view card'; console.log('phone', key, r.note); continue }
    await list.scrollIntoViewIfNeeded()
    r.chips = (await list.locator('[aria-label="Sort by"] button').allInnerTexts()).map(s => s.trim())
    const rows = laptop[key] || []
    const tabGross = rows.reduce((s, x) => s + (money(x.Gross) || 0), 0)
    const material = x => (money(x.Gross) || 0) >= tabGross * PNL_MATERIALITY.minShareOfGross || (num(x.Units) || 0) >= PNL_MATERIALITY.minUnits
    for (const chip of r.chips) {
      // tap only an inactive chip (tapping the active one flips the order)
      const btn = list.locator('[aria-label="Sort by"] button').filter({ hasText: new RegExp(`^${chip.replace(/[%()]/g, m => '\\' + m)}$`) }).first()
      if ((await btn.getAttribute('aria-pressed')) !== 'true') { await btn.click(); await pause(400) }
      const phoneRows = await list.locator(':scope > div > button.ranked-row-line').evaluateAll(bs => bs.map(b => ({ name: b.children[0].innerText.replace(/^\d+\.\s*/, '').trim(), value: b.children[1].innerText.trim() })))
      const col = LAPTOP_COL[chip]
      const scoped = chip !== 'Revenue' && chip !== 'Net revenue'
      const pool = rows.filter(x => valueOf(col, x[col]) != null && (!scoped || material(x)))
      const sorted = pool.sort((a, b) => valueOf(col, b[col]) - valueOf(col, a[col])).slice(0, phoneRows.length)
      r.checked++
      const lapNames = sorted.map(x => x.Product)
      const phoneNames = phoneRows.map(x => x.name)
      if (lapNames.join('|') !== phoneNames.join('|')) {
        // same values in the same order → a tie at display precision, not a mismatch
        const round = v => (v == null ? '—' : col === 'Gross' || col === 'Net' ? Math.round(v / 100) : col === 'ROAS' ? v.toFixed(2) : v.toFixed(1))
        const lapVals = sorted.map(x => round(valueOf(col, x[col]))).join('|'), phoneVals = phoneRows.map(x => round(valueOf(col, x.value))).join('|')
        if (lapVals === phoneVals) r.ties++
        else r.mismatches.push({ chip, laptop: sorted.map(x => `${x.Product} ${x[col]}`), phone: phoneRows.map(x => `${x.name} ${x.value}`) })
      }
    }
    // Units · Revenue · ASP for the top 10 by Revenue (full list)
    { const rb = list.locator('[aria-label="Sort by"] button').filter({ hasText: /^Revenue$/ }).first(); if ((await rb.getAttribute('aria-pressed')) !== 'true') { await rb.click(); await pause(300) } }
    const showAll = list.locator('button').filter({ hasText: /^Show all \d+/ })
    if (await showAll.count()) {
      await showAll.first().click(); await pause(800)
      const full = await page.locator('.fullscreen-list button.ranked-row-line').evaluateAll(bs => bs.slice(0, 10).map(b => ({ name: b.children[0].innerText.replace(/^\d+\.\s*/, '').trim(), value: b.children[1].innerText.trim(), sub: b.children[2].innerText.trim() })))
      await page.locator('.fullscreen-list button[aria-label="Back"]').click(); await pause(500)
      r.rowsChecked = full.length
      r.rowMismatches = full.filter(p => {
        const l = rows.find(x => x.Product === p.name && p.sub.startsWith(x.Category))
        if (!l) return true
        const units = p.sub.match(/([\d,]+) units?/)?.[1], asp = p.sub.match(/ASP (₹[\d,]+|—)/)?.[1]
        return units !== l.Units || p.value !== l.Gross || asp !== l.ASP
      }).map(p => p.name)
    }
    console.log('phone', key, JSON.stringify({ chips: r.chips, checked: r.checked, ties: r.ties, mismatches: r.mismatches.length, rows: r.rowsChecked, rowMismatches: r.rowMismatches }))
  }
  await browser.close()
}
writeFileSync(out, JSON.stringify(result, null, 2))
console.log(`wrote ${out}`)
