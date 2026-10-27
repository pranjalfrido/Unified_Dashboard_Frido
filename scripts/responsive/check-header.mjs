// HEADER_MOBILE_PROMPT.md §6: every phone screen's header, logged in through the login page as a
// temporary test user from a local state file ({ email, password }, made by an uncommitted setup step).
// Per screen: header height (expanded and, in "after" mode, collapsed after scrolling), screenshots of
// both, control order date · filter · ⋯, title on one line, no tap focus box, text ≥ 12px, no sideways
// overflow. "before" mode only measures and screenshots (the old header has no collapse).
// Usage: RESPONSIVE_ENGINE=webkit|chromium node scripts/responsive/check-header.mjs <stateFile> before|after [viewport] [only]
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { chromium, webkit } from 'playwright'
import { repoRoot, BASE_URL, VIEWPORTS, ENGINE } from './lib.mjs'

const [stateFile, mode = 'after', vpName = 'iphoneSE-375x667', only] = process.argv.slice(2)
const user = JSON.parse(readFileSync(stateFile, 'utf8'))
const vp = VIEWPORTS.find(v => v.name === vpName)
const AFTER = mode === 'after'
const shotDir = resolve(repoRoot, `docs/responsive/${mode}/header`)
mkdirSync(shotDir, { recursive: true })
const pause = ms => new Promise(r => setTimeout(r, ms))

// id, route, taps before measuring (chip:/tab:/tab2:/text: or a CSS selector), header selector
const chip = l => `chip:${l}`, tab = l => `tab:${l}`, tab2 = l => `tab2:${l}`
const SALES = ['Overall', 'D2C', 'EBO', 'Amazon', 'Flipkart', 'Blinkit', 'CRED', 'Firstcry', 'Instamart', 'Zepto', 'Myntra', 'International', 'Offline Sales']
const PNL = SALES.map(l => (l === 'Offline Sales' ? 'Offline' : l))
const ADS = ['Overall', 'D2C', 'Amazon', 'Flipkart', 'Myntra', 'Blinkit', 'Zepto', 'Instamart', 'CRED']
const S = [
  { id: 'overview', route: '/overview' },
  ...SALES.map(l => ({ id: `sales-${l}`, route: '/sales/all', taps: [chip(l)] })),
  { id: 'sales-D2C-MyFrido', route: '/sales/shopify', taps: [tab('MyFrido')] },
  { id: 'sales-D2C-Mobility', route: '/sales/shopify', taps: [tab('Mobility')] },
  { id: 'sales-Amazon-SC', route: '/sales/amazon', taps: [tab('Seller Central')] },
  { id: 'sales-Amazon-VC', route: '/sales/amazon', taps: [tab('Vendor Central')] },
  ...['B2B', 'Stockist', 'MT GT', 'Miscellaneous'].map(l => ({ id: `sales-Offline-${l}`, route: '/sales/offline', taps: [tab(l)] })),
  { id: 'sales-return-analysis', route: '/sales/shopify/return_analysis' },
  ...PNL.map(l => ({ id: `pnl-${l}`, route: '/pnl/all', taps: [chip(l)] })),
  { id: 'pnl-D2C-MyFrido', route: '/pnl/shopify', taps: [tab('MyFrido')] },
  { id: 'pnl-Amazon-VC', route: '/pnl/amazon', taps: [tab('Vendor Central')] },
  { id: 'pnl-Offline-B2B', route: '/pnl/offline', taps: [tab('B2B')] },
  { id: 'pnl-tool-price-simulator', route: '/pnl/shopify', taps: ['tool:Price Simulator'] },
  { id: 'pnl-tool-breakeven-roas', route: '/pnl/shopify', taps: ['tool:Breakeven ROAS'] },
  { id: 'pnl-tool-b2b-costing', route: '/pnl/offline', taps: ['tool:B2B Costing'] },
  { id: 'pnl-tool-po-approval', route: '/pnl/offline', taps: ['tool:PO Approval'] },
  { id: 'inventory-health', route: '/inventory/inventory_health' },
  { id: 'inventory-sales', route: '/inventory/sales_allocation' },
  { id: 'logistics-performance', route: '/logistics/performance_analytics' },
  ...['Overview', 'B2C', 'FTL/PTL', '3PL'].map(l => ({ id: `logistics-cost-${l.replace('/', '')}`, route: '/logistics/cost_analytics', taps: [tab2(l)] })),
  ...ADS.map(l => ({ id: `ads-${l}`, route: '/ads', taps: [chip(l)] })),
  ...['Overview', 'Acquisition', 'Retention', 'Behaviour', 'Segments', 'Discounts'].map(l => ({ id: `customers-${l}`, route: '/customer', taps: [tab2(l)] })),
  { id: 'customers-support', route: '/customer-support' },
  { id: 'profile', route: '/profile' },
  { id: 'profile-team', route: '/profile', taps: ['role:button:Team members'], hdr: '.profile-screen' },
  { id: 'profile-member', route: '/profile', taps: ['role:button:Team members', '.profile-team-row'], hdr: '.profile-screen >> nth=-1' },
  { id: 'documents', route: '/documents' },
  { id: 'frido-pulse', route: '/ask' },
  { id: 'cogs', route: '/cogs' },
  { id: 'logistics-ledger', route: '/logistics-ledger' },
  { id: 'purchase-ledger', route: '/purchase-ledger' },
  { id: 'packaging-bom', route: '/packaging-bom' },
  { id: 'courier-allocation', route: '/logistics/courier_allocation' },
  { id: 'financial-mis', route: '/financial-mis' },
  { id: 'full-list', route: '/sales/all', taps: ['text:/^Show all \\d+ .*→/'], hdr: '.fullscreen-list' },
  { id: 'full-table', route: '/customer-support', taps: ['text:Full heatmap →'], hdr: '.fullscreen-table' },
].filter(s => !only || only.split(',').some(o => s.id.startsWith(o)))

const browser = await (ENGINE === 'webkit' ? webkit : chromium).launch()
const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
const page = await ctx.newPage()
await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle' })
await page.locator('#email').fill(user.email); await page.locator('#password').fill(user.password)
await page.locator('.btn-signin').click()
await page.locator('.page-scroll').first().waitFor({ timeout: 90000 }); await pause(3000)

// In-app navigation (keeps the loaded data): the router follows popstate.
const go = async path => { await page.evaluate(p => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')) }, path); await pause(1800) }
const settle = () => page.waitForFunction(() => !document.querySelector('.load-veil, .delta-shimmer'), null, { timeout: 60000 }).catch(() => {})
async function tap(t) {
  let loc
  if (t.startsWith('chip:')) loc = page.locator('.topnav [role=group] button').filter({ hasText: new RegExp(`^${t.slice(5).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })
  else if (t.startsWith('tab:')) loc = page.locator('.topnav [aria-label=View] [role=tab]').filter({ hasText: new RegExp(`^${t.slice(4)}$`) })
  else if (t.startsWith('tab2:')) loc = page.locator('.topnav [aria-label=Section] [role=tab]').filter({ hasText: new RegExp(`^${t.slice(5)}$`) })
  else if (t.startsWith('tool:')) loc = page.locator('.pnl-mobile button').filter({ hasText: t.slice(5) })
  else if (t.startsWith('role:button:')) loc = page.getByRole('button', { name: new RegExp(t.slice(12)) })
  else if (t.startsWith('text:')) { const s = t.slice(5); loc = page.getByText(s.startsWith('/') ? new RegExp(s.slice(1, s.lastIndexOf('/'))) : s) }
  else loc = page.locator(t)
  loc = loc.first(); await loc.scrollIntoViewIfNeeded({ timeout: 20000 }); await loc.click({ timeout: 20000 }); await pause(1500)
}
// The page's own header box: the top bar, or a full-screen view's first row.
const headerBox = sel => page.evaluate(sel => {
  const nth = sel.includes('>> nth=-1')
  const els = [...document.querySelectorAll(sel.replace(' >> nth=-1', ''))]
  let root = nth ? els[els.length - 1] : els[0]
  if (!root) root = document.querySelector('.af-header, .af-topbar')
  if (!root) return null
  const h = root.matches('.topnav, .af-topbar') ? root : (root.querySelector('.mph') || root.firstElementChild)
  const r = h.getBoundingClientRect()
  return { y: Math.round(r.top), h: Math.round(r.height * 10) / 10 }
}, sel)

const rows = []
const results = []
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); if (!pass) console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`) }
for (const s of S) {
  try {
    const toolBack = page.locator('.topnav button[aria-label^="Back to"]')
    if (await toolBack.count()) { await toolBack.first().click(); await pause(800) }
    await go(s.route); await settle()
    for (const t of s.taps || []) await tap(t)
    await settle(); await pause(800)
    await page.evaluate(() => document.activeElement?.blur?.()) // the ring left by the previous screen's Escape is keyboard focus
    const sel = s.hdr || '.topnav'
    const box = await headerBox(sel)
    if (!box) { ok(`${s.id}: header found`, false); continue }
    await page.screenshot({ path: resolve(shotDir, `${ENGINE}-${vp.name}__${s.id}.png`), clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, box.y + box.h + 60) } })
    const row = { id: s.id, expanded: box.h }
    if (AFTER) {
      const h = await page.evaluate(sel => {
        const root = document.querySelector(sel.replace(' >> nth=-1', ''))
        const head = root?.matches('.topnav') ? root : root?.querySelector('.mph')
        if (!head) return { missing: true }
        const r1 = head.querySelector('.mph-r1')
        const ctl = [...(r1?.querySelectorAll('.mph-ctl > *') || [])].map(e => e.matches('.mph-date, .mph-date *') || e.querySelector('.drp-trigger, .mrp-pill') ? 'date' : e.querySelector('[data-ctl=filter]') || e.matches('[data-ctl=filter]') ? 'filter' : e.querySelector('[data-ctl=more]') || e.matches('[data-ctl=more]') ? 'more' : 'other')
        const t = head.querySelector('.mph-title b')
        const small = [...head.querySelectorAll('*')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && e.getBoundingClientRect().width && parseFloat(getComputedStyle(e).fontSize) < 12).map(e => e.textContent.trim().slice(0, 20))
        return { ctl, titleH: t ? t.getBoundingClientRect().height : 0, titleW: t ? t.scrollWidth <= t.clientWidth + 1 : true, small, bg: getComputedStyle(head.querySelector('.mph') || head).backgroundColor }
      }, sel)
      const order = (h.ctl || []).filter(c => c !== 'other')
      const want = ['date', 'filter', 'more'].filter(c => order.includes(c))
      ok(`${s.id}: control order date · filter · ⋯`, !h.missing && order.join() === want.join(), (h.ctl || []).join(' '))
      ok(`${s.id}: title on one line`, h.titleH <= 26, `${h.titleH}px`)
      ok(`${s.id}: header text ≥ 12px`, !h.small?.length, (h.small || []).join(' | '))
      // collapse: only the page header (not full-screen views)
      if (!s.hdr) {
        await page.evaluate(() => {
          const sc = [...document.querySelectorAll('.app-main *')].find(e => { const cs = getComputedStyle(e); return /(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 200 && e.getBoundingClientRect().height > 200 })
          if (sc) for (let i = 1; i <= 6; i++) setTimeout(() => sc.scrollBy(0, 60), i * 40)
        })
        await pause(900)
        const c = await headerBox(sel)
        row.collapsed = c?.h
        await page.screenshot({ path: resolve(shotDir, `${ENGINE}-${vp.name}__${s.id}--collapsed.png`), clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, (c?.y || 0) + (c?.h || 42) + 60) } })
        await page.evaluate(() => { const sc = [...document.querySelectorAll('.app-main *')].find(e => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollTop > 0); if (sc) { sc.scrollBy(0, -30); setTimeout(() => sc.scrollTo(0, 0), 120) } })
        await pause(700)
        const back = await headerBox(sel)
        row.restored = back?.h
        ok(`${s.id}: scrolling up restores the header`, Math.abs((back?.h || 0) - box.h) <= 2, `${box.h} → ${c?.h} → ${back?.h}`)
      }
      // no focus box after tapping a header button
      const btn = page.locator(`${sel.replace(' >> nth=-1', '')} .mph-r1 [data-ctl=more]`).last()
      if (await btn.count()) {
        await btn.click(); await pause(500)
        const ring = await btn.evaluate(b => getComputedStyle(b).outlineStyle !== 'none' && parseFloat(getComputedStyle(b).outlineWidth) > 0)
        ok(`${s.id}: no focus box after a tap`, !ring)
        await page.keyboard.press('Escape'); await pause(500)
      }
    }
    ok(`${s.id}: no sideways overflow`, !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)))
    rows.push(row)
    console.log(`${s.id}: ${row.expanded}${row.collapsed != null ? ` / ${row.collapsed}` : ''}`)
    // close full-screen views / sub-screens before the next screen
    for (let i = 0; i < 3 && await page.locator('[role=dialog][aria-modal=true]').count(); i++) { await page.goBack().catch(() => {}); await pause(700) }
  } catch (e) { ok(`${s.id}: opened`, false, e.message.split('\n')[0]); for (let i = 0; i < 3 && await page.locator('[role=dialog][aria-modal=true]').count(); i++) { await page.keyboard.press('Escape'); await pause(300); await page.goBack().catch(() => {}); await pause(500) } }
}
await browser.close()
const out = resolve(repoRoot, `docs/responsive/${mode}/header/heights-${ENGINE}-${vp.name}${only ? '-part' : ''}.json`)
writeFileSync(out, JSON.stringify({ rows, results }, null, 2))
console.log(`${results.filter(r => r.pass).length}/${results.length} pass · ${rows.length}/${S.length} screens`)
