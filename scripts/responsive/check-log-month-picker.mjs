// Cost month picker before/after (LOGISTICS_MOBILE_REDESIGN_PROMPT.md §1a): the same months picked
// with the OLD dropdown (BASE_OLD, e.g. a worktree before the picker, on another port) and with the
// new MonthRangePicker (this checkout) must give identical numbers. Laptop 1366, every sub-tab:
// Latest · Last 3M · All · a non-contiguous pick (Apr + Jun + Sep). Compares the full text of the
// content area under the toolbar.
// Usage: BASE_OLD=http://127.0.0.1:5175 AUTH_OLD=<auth.json for that origin> node scripts/responsive/check-log-month-picker.mjs
import { chromium } from 'playwright'
import { VIEWPORTS, AUTH_FILE } from './lib.mjs'

const NEW = process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:5173'
const OLD = process.env.BASE_OLD
if (!OLD || !process.env.AUTH_OLD) throw new Error('set BASE_OLD and AUTH_OLD')
const vp = VIEWPORTS.find(v => v.name === 'laptop-1366x768')
// TABS=B2C,3PL to run some; SETTLE_MS to wait longer for chart labels (Recharts adds pie labels after its animation)
const TABS = (process.env.TABS || 'Overview,B2C,FTL/PTL,3PL').split(',')
const SELS = ['latest', 'last3', 'all', 'pick']
const MON = { Apr: 3, Jun: 5, Jul: 6, Aug: 7, Sep: 8 }

async function openCost(base, auth) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ storageState: auth, viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.goto(base + '/logistics/cost_analytics', { waitUntil: 'networkidle', timeout: 300000 })
  await page.waitForTimeout(2500)
  return { browser, page }
}
const settle = async page => { for (let i = 0; i < 40; i++) { if (!(await page.locator('text=Refreshing').count())) break; await page.waitForTimeout(500) } await page.waitForTimeout(+(process.env.SETTLE_MS || 1500)) }
const tab = async (page, name) => { await page.locator('.lc-page button').filter({ hasText: new RegExp(`^${name.replace('/', '\\/')}$`) }).first().click(); await settle(page) }
const contentText = page => page.evaluate(() => {
  const btn = [...document.querySelectorAll('.lc-page button')].find(b => b.textContent.trim() === 'Overview')
  const content = btn?.parentElement?.parentElement?.nextElementSibling
  return (content?.innerText || '').replace(/\s+/g, ' ').trim()
})

// OLD dropdown: "Last 1" / "All N" buttons, month rows toggle on click.
async function pickOld(page, sel) {
  const dd = page.locator('.lc-page button').filter({ hasText: /(of \d+|months)\s*▼?$/ }).first()
  const open = async () => { await dd.click(); await page.waitForTimeout(300) }
  const toggleMonth = async mon => {
    const ok = await page.evaluate(m => {
      const re = new RegExp(`^${m}\\w* 2026$`)
      const el = [...document.querySelectorAll('.lc-page div')].filter(d => re.test(d.textContent.trim()) && d.onclick !== undefined).pop()
      const row = el && (el.closest('div[style*="cursor: pointer"]') || el)
      if (!row) return false
      row.click(); return true
    }, mon)
    if (!ok) throw new Error(`old dropdown: no row for ${mon}`)
    await page.waitForTimeout(400)
  }
  await open()
  await page.locator('.lc-page button').filter({ hasText: sel === 'all' ? /^All \d+$/ : /^Last \d+$/ }).first().click()
  await settle(page)
  if (sel === 'last3' || sel === 'pick') {
    await open()
    for (const m of sel === 'last3' ? ['Aug', 'Jul'] : ['Jun', 'Apr']) await toggleMonth(m)
    await page.keyboard.press('Escape'); await page.mouse.click(700, 20)
    await settle(page)
  }
}
// NEW MonthRangePicker: quick picks, or Pick months mode for single months; Apply.
async function pickNew(page, sel) {
  await page.locator('.mrp-pill').first().click(); await page.waitForTimeout(300)
  const preset = { latest: 'Latest month', last3: 'Last 3 months', all: 'All available', pick: 'Latest month' }[sel]
  await page.locator('[role=dialog] button').filter({ hasText: new RegExp(`^${preset}`) }).first().click()
  if (sel === 'pick') {
    await page.locator('[role=dialog] [role=tab]').filter({ hasText: 'Pick months' }).click()
    for (const m of ['Jun', 'Apr']) await page.locator(`[role=dialog] button[aria-label="${m} 2026"]`).click()
  }
  await page.locator('[role=dialog] button').filter({ hasText: /^Apply$/ }).click()
  await settle(page)
}

const A = await openCost(OLD, process.env.AUTH_OLD)
const B = await openCost(NEW, AUTH_FILE)
let fails = 0
for (const t of TABS) {
  await tab(A.page, t); await tab(B.page, t)
  for (const s of SELS) {
    await pickOld(A.page, s); await pickNew(B.page, s)
    const [a, b] = [await contentText(A.page), await contentText(B.page)]
    const same = a === b && a.length > 50
    if (!same) {
      fails++
      let i = 0; while (i < a.length && a[i] === b[i]) i++
      console.log(`DIFF ${t} ${s}: at char ${i}\n   old "…${a.slice(Math.max(0, i - 60), i + 60)}…"\n   new "…${b.slice(Math.max(0, i - 60), i + 60)}…"`)
    } else console.log(`SAME ${t} ${s} (${a.length} chars of content)`)
  }
}
await A.browser.close(); await B.browser.close()
console.log(fails ? `${fails} difference(s)` : 'ALL IDENTICAL')
process.exit(fails ? 1 : 0)
