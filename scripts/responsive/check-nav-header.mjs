// Section 3 check: phone header + bottom nav. For each phone viewport: bottom nav visible with
// labelled items, sidebar hidden, header gradient on Overview, "More" sheet opens/closes, no
// horizontal overflow. Laptop: bottom nav hidden, sidebar visible, header unchanged.
// Usage: node scripts/responsive/check-nav-header.mjs [outDir]   (RESPONSIVE_ENGINE=webkit for WebKit)
import { launch, openPage, VIEWPORTS, ENGINE } from './lib.mjs'
import { mkdirSync } from 'fs'
const out = process.argv[2] || 'docs/responsive/after/overview-align/nav'
mkdirSync(out, { recursive: true })
const names = ['iphoneSE-375x667', 'iphone14-390x844', 'pixel-412x915', 'iphone14-landscape-844x390', 'tablet-768x1024', 'laptop-1366x768']
let fail = 0
for (const name of names) {
  const vp = VIEWPORTS.find(v => v.name === name)
  const { browser, ctx } = await launch(vp)
  const page = await ctx.newPage()
  await openPage(page, '/overview')
  const r = await page.evaluate(() => {
    const vis = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0
    const nav = document.querySelector('nav.bottom-nav[aria-label="Main"]')
    const top = document.querySelector('.topnav')
    return {
      nav: vis(nav), labels: nav ? [...nav.querySelectorAll('button')].map(b => b.innerText.replace(/\s+/g, ' ').replace('⋯', '').trim()) : [],
      sidebar: vis(document.querySelector('.sidebar')),
      headerBg: top ? getComputedStyle(top).backgroundImage.slice(0, 40) : null,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }
  })
  const phone = vp.mobile || vp.width <= 768 // the agreed phone rule: ≤768px, plus phone landscape
  const ok = phone ? (r.nav && !r.sidebar && r.labels.includes('More') && r.headerBg.includes('gradient') && r.overflow <= 0)
                   : (!r.nav && r.sidebar && !r.headerBg.includes('gradient'))
  if (!ok) fail++
  console.log(`${ENGINE} ${name}: ${ok ? 'PASS' : 'FAIL'} nav=${r.nav} sidebar=${r.sidebar} labels=[${r.labels.join(', ')}] header=${r.headerBg} overflowX=${r.overflow}`)
  await page.screenshot({ path: `${out}/${ENGINE}-${name}.png` })
  if (phone) {
    await page.getByRole('button', { name: 'More', exact: true }).click()
    await page.waitForTimeout(600)
    const sheet = await page.getByRole('dialog').count()
    await page.screenshot({ path: `${out}/${ENGINE}-${name}-more.png` })
    await page.goBack(); await page.waitForTimeout(500)
    const closed = (await page.getByRole('dialog').count()) === 0 && page.url().includes('overview')
    console.log(`   More sheet: opened=${sheet > 0} closedByBack=${closed}`)
    if (!sheet || !closed) fail++
  }
  await browser.close()
}
console.log(fail ? `${fail} FAILED` : 'ALL PASS')
process.exit(fail ? 1 : 0)
