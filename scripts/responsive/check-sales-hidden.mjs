// Below 1024px no desktop-only Sales block renders (Revenue by Channel, donuts, wide tables, old
// KPI list); iPad portrait (820px) uses the mobile view with a 4-column tile grid and keeps the
// sidebar + desktop tab bar; 1366 still renders the desktop tables.
// Usage: node scripts/responsive/check-sales-hidden.mjs
import { chromium } from 'playwright'
import { AUTH_FILE, BASE_URL, waitSettled } from './lib.mjs'
let fail = 0
const check = (n, ok, x = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' - ' + x : ''}`) }
const b = await chromium.launch()
for (const [w, h, label] of [[820, 1180, 'iPad portrait 820'], [1366, 768, 'laptop 1366']]) {
  const ctx = await b.newContext({ storageState: AUTH_FILE, viewport: { width: w, height: h }, hasTouch: w < 1024, isMobile: false })
  const p = await ctx.newPage()
  for (const r of ['all', 'shopify/overall', 'amazon/overall']) {
    await p.goto(`${BASE_URL}/sales/${r}`, { waitUntil: 'networkidle', timeout: 300000 }); await waitSettled(p)
    const s = await p.evaluate(() => ({ mobile: !!document.querySelector('.sales-mobile'), tables: document.querySelectorAll('.page-scroll table').length, donut: document.querySelectorAll('.recharts-pie').length,
      revByCh: /Revenue by Channel/.test(document.querySelector('.page-scroll')?.innerText || ''), oldList: [...document.querySelectorAll('.ads-kpi-list')].some(e => e.offsetParent), sidebar: !!document.querySelector('.sidebar')?.offsetParent,
      cols: (() => { const g = document.querySelector('.master-tiles'); return g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : 0 })(), overflow: document.documentElement.scrollWidth - innerWidth }))
    if (w < 1024) check(`${label} /sales/${r}: mobile view, no desktop-only blocks, 4 tile columns, sidebar kept`, s.mobile && !s.tables && !s.donut && !s.revByCh && !s.oldList && s.cols === 4 && s.sidebar && s.overflow <= 0, JSON.stringify(s))
    else check(`${label} /sales/${r}: desktop layout`, !s.mobile && s.tables > 0, JSON.stringify(s))
  }
  await ctx.close()
}
await b.close()
console.log(fail ? `${fail} FAILED` : 'ALL PASS')
process.exit(fail ? 1 : 0)
