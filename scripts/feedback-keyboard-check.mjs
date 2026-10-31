// Feedback sheet with the on-screen keyboard open, Chromium (Android Chrome engine) and WebKit (iPhone Safari engine).
// A real keyboard can't be opened in headless browsers, so window.visualViewport is replaced by a stand-in whose
// height we shrink (exactly what the browsers do when the keyboard opens) and a grey 'keyboard' band is drawn in the
// space it would cover. Needs the local stand-in running (vite :5197 with VITE_FEEDBACK_LOCAL=1, API :3017).
import { chromium, webkit } from 'playwright'
import { mkdirSync } from 'fs'

const BASE = process.env.BASE || 'http://127.0.0.1:5197'
const OUT = process.env.SHOTS || '.feedback-local/shots-keyboard'
mkdirSync(OUT, { recursive: true })
const KB = 330
const results = []
const ok = (name, cond, extra = '') => { results.push(!!cond); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`) }

const CASES = [
  { id: 'chromium-android-360', engine: chromium, w: 360, h: 780 },
  { id: 'chromium-android-375', engine: chromium, w: 375, h: 812 },
  { id: 'webkit-iphone-360', engine: webkit, w: 360, h: 780 },
  { id: 'webkit-iphone-375', engine: webkit, w: 375, h: 812 },
]

for (const c of CASES) {
  const browser = await c.engine.launch()
  const ctx = await browser.newContext({ viewport: { width: c.w, height: c.h }, hasTouch: true, isMobile: c.engine === chromium, deviceScaleFactor: 2 })
  await ctx.addInitScript(() => {
    const L = { resize: [], scroll: [] }
    const vv = {
      get height() { return window.innerHeight - (window.__kb || 0) }, get offsetTop() { return 0 }, get width() { return window.innerWidth }, scale: 1,
      addEventListener: (t, f) => { (L[t] = L[t] || []).push(f) }, removeEventListener: (t, f) => { L[t] = (L[t] || []).filter(x => x !== f) },
    }
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
    window.__setKb = h => {
      window.__kb = h
      let band = document.getElementById('__kbband')
      if (h && !band) { band = document.createElement('div'); band.id = '__kbband'; band.textContent = 'ON-SCREEN KEYBOARD'; band.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483000;background:#202124;color:#9aa0a6;font:600 14px sans-serif;display:grid;place-items:center;pointer-events:none'; document.body.appendChild(band) }
      if (band) { band.style.height = h + 'px'; band.style.display = h ? 'grid' : 'none' }
      ;(L.resize || []).forEach(f => f())
    }
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/overview?as=asha`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.mnav', { timeout: 30000 })
  await page.waitForTimeout(1200)
  await page.locator('.mph [data-ctl="more"]').first().click()
  await page.getByRole('button', { name: 'Send feedback' }).first().click()
  const msg = page.getByLabel('Your message')
  await msg.waitFor({ timeout: 6000 })
  await page.getByRole('button', { name: 'Wrong number', exact: true }).click()
  await msg.click()
  await page.evaluate(h => window.__setKb(h), KB)
  await page.waitForTimeout(500)
  await page.keyboard.type('The D2C net revenue for 28 Oct is wrong. It shows 4.2 Cr but Shopify says 3.9 Cr, and I checked twice.')
  await page.waitForTimeout(500)

  const vh = c.h - KB
  const box = async loc => (await loc.boundingBox())
  const send = page.locator('.fb-actions').getByRole('button', { name: 'Send', exact: true })
  const cancel = page.locator('.fb-actions').getByRole('button', { name: 'Cancel', exact: true })
  const bs = await box(send); const bc = await box(cancel); const bt = await box(msg)
  const chip = await box(page.getByRole('button', { name: 'Wrong number', exact: true }))
  ok(`${c.id}: Send is above the keyboard`, bs && bs.y + bs.height <= vh + 0.5, `send bottom ${bs && Math.round(bs.y + bs.height)} ≤ ${vh}`)
  ok(`${c.id}: Cancel is above the keyboard`, bc && bc.y + bc.height <= vh + 0.5)
  ok(`${c.id}: text box fully visible above the keyboard`, bt && bt.y >= 0 && bt.y + bt.height <= vh + 0.5, `box ${bt && Math.round(bt.y)}–${bt && Math.round(bt.y + bt.height)} of ${vh}`)
  ok(`${c.id}: type chips stay visible`, chip && chip.y >= 0 && chip.y + chip.height <= vh)
  ok(`${c.id}: context line hidden while typing`, (await page.getByTestId('fb-context').count()) === 0)
  const cx = bs.x + bs.width / 2; const cy = bs.y + bs.height / 2
  ok(`${c.id}: Send is tappable (nothing covers it)`, await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.fb-send'), [cx, cy]))
  await page.screenshot({ path: `${OUT}/${c.id}-keyboard-open.png` })

  // keyboard closes → context line back, sheet back to the bottom of the screen
  await page.evaluate(() => window.__setKb(0))
  await page.waitForTimeout(500)
  ok(`${c.id}: context line returns when the keyboard closes`, (await page.getByTestId('fb-context').count()) === 1)
  const sb = await box(send)
  ok(`${c.id}: sheet is back at the bottom, Send visible`, sb && sb.y + sb.height <= c.h + 0.5)
  await page.screenshot({ path: `${OUT}/${c.id}-keyboard-closed.png` })

  // and the whole thing still sends, with the keyboard open
  await page.evaluate(h => window.__setKb(h), KB)
  await page.waitForTimeout(300)
  await send.click()
  await page.getByText("Thanks! Suraj's team will look into it.").waitFor({ timeout: 8000 })
  ok(`${c.id}: sends with the keyboard open`, true)
  await browser.close()
}
const bad = results.filter(r => !r).length
console.log(`\n${results.length - bad}/${results.length} passed`)
process.exit(bad ? 1 : 0)
