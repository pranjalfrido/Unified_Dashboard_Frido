// Spot-check for the mobile Overview's previous-period ▲/▼ values.
//   1. Phone, Sept 2026, every section open: wait until all previous-period loads have finished and
//      read the cached values (sessionStorage ov.prev.*).
//   2. Desktop: pick that previous range (2–31 Aug 2026) in the real date picker and read the same
//      KPIs from the ordinary desktop Overview.
// Prints both side by side for Net Revenue, RTO % and Repeat rate (plus everything else cached).
import { launch, openWithSept, waitStableText, VIEWPORTS } from './lib.mjs'
// Same formatter as src/utils.js fmt (that module needs the browser for its theme tokens).
const fmt = v => { if (v == null || isNaN(v)) return '₹0'; if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`; if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`; if (v >= 1e3) return `₹${(v / 1e3).toFixed(2)} K`; return `₹${Math.round(v).toLocaleString('en-IN')}` }

// ── 1. previous-period values as the mobile page computed them ──
const phone = await launch(VIEWPORTS.find(v => v.name === 'iphoneSE-375x667'))
await phone.ctx.addInitScript(() => { for (const id of ['overview.salesTrend', 'overview.whereRevenue', 'overview.logistics', 'overview.business']) localStorage.setItem(`ui.section.${id}`, '1') })
const mp = await phone.ctx.newPage()
await openWithSept(mp, '/overview')
await waitStableText(mp)
await mp.waitForFunction(() => !document.querySelector('.delta-shimmer'), null, { timeout: 480000 })
const cache = await mp.evaluate(() => Object.fromEntries(Object.keys(sessionStorage).filter(k => k.startsWith('ov.prev.')).map(k => [k, JSON.parse(sessionStorage.getItem(k))])))
await phone.browser.close()
const pick = prefix => Object.entries(cache).find(([k, v]) => k.startsWith(`ov.prev.${prefix}`) && v.range?.start === '2026-08-02')?.[1]
const sales = pick('sales:'), log = pick('log:'), cust = pick('cust:')
console.log('previous range used:', sales?.range, log?.range, cust?.range)

// ── 2. the same KPIs on the desktop Overview for 2–31 Aug 2026 ──
const desk = await launch(VIEWPORTS.find(v => v.name === 'desktop-1440x900'))
const dp = await desk.ctx.newPage()
await openWithSept(dp, '/overview')
await dp.locator('button').filter({ hasText: /1 Sept 2026/ }).first().click()
await dp.getByRole('button', { name: '‹' }).click()
const aug = dp.getByText('August 2026', { exact: false }).first().locator('xpath=ancestor::div[.//*[normalize-space(text())="31"]][1]')
await aug.getByText('2', { exact: true }).first().click()
await aug.getByText('31', { exact: true }).first().click()
await dp.getByRole('button', { name: 'Apply', exact: true }).click()
await dp.waitForLoadState('networkidle', { timeout: 480000 })
const body = await waitStableText(dp, { timeout: 480000 })
await dp.screenshot({ path: process.argv[2] || 'spot-aug.png' })
await desk.browser.close()
const after = (label, re = /([₹\d][\d,.]*\s?(Cr|L|K)?%?)/) => {
  const i = body.toUpperCase().indexOf(label.toUpperCase())
  return i < 0 ? null : (body.slice(i + label.length, i + label.length + 40).match(re) || [])[1]
}
const label = body.match(/\d{1,2} \w+ 2026\s*→\s*\d{1,2} \w+ 2026/)?.[0]
console.log('desktop date label:', label)
console.log('\nspot-check                 mobile prev value        desktop for 2–31 Aug')
console.log('Net Revenue           ', fmt(sales?.netRevenueCalc).padEnd(24), after('NET REVENUE'))
console.log('RTO %                 ', `${log?.lRtoPct?.toFixed(1)}%`.padEnd(24), after('RTO %'))
console.log('Repeat rate           ', `${(cust?.repeatRate * 100).toFixed(1)}%`.padEnd(24), after('Repeat Rate'))
console.log('\nalso (mobile prev): units', sales?.totalQty, '· AOV', sales?.blendedAOV?.toFixed(0), '· ASP', sales?.blendedASP?.toFixed(0), '· Return %', sales?.totalReturnPct?.toFixed(1),
  '· shipments', log?.lTotal, '· delivered %', log?.lDelPct?.toFixed(1), '· customers', cust?.totalCustomers, '· LTV', cust?.ltv?.toFixed(0))
console.log('desktop Aug: Units', after('UNITS'), '· AOV', after('AOV (INC. GST)'), '· ASP', after('ASP (INC. GST)'), '· Return %', after('RETURN %'), '· Total shipments', (body.match(/([\d,]{6,})\s*TOTAL SHIPMENTS/i) || [])[1], '· Del. %', after('DEL. %'))
