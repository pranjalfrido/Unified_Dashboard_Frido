// NavAI has no 🎙 on phones and tablets; laptop/desktop keeps it. Local only, nothing real is called.
//   VITE_FEEDBACK_LOCAL=1 VITE_SUPABASE_URL=https://placeholder.invalid VITE_SUPABASE_ANON_KEY=x npx vite --port 5199 --strictPort --host 127.0.0.1
//   node scripts/navai-no-mobile-mic-browser-check.mjs [outDir]
import { chromium, webkit, devices } from 'playwright'
import { mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.BASE || 'http://127.0.0.1:5199'
const OUT = resolve(root, process.argv[2] || 'docs/navai-no-mobile-mic/screens'); mkdirSync(OUT, { recursive: true })
const results = []
const ok = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`) }

// the stand-in microphone (Web Speech API), present everywhere so "hidden" can only come from our device check
const SPEECH = `
window.__recs = []
class FakeRec { constructor() { window.__recs.push(this); window.__rec = this } start() { setTimeout(() => this.onstart && this.onstart(), 0) } stop() { setTimeout(() => this.onend && this.onend(), 0) } abort() {} }
window.SpeechRecognition = FakeRec; window.webkitSpeechRecognition = FakeRec
window.__say = t => window.__rec.onresult({ results: [Object.assign([{ transcript: t }], { isFinal: true })] })`

const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
const LINUX_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const D = [
  { id: 'android-pixel7-375', engine: chromium, phone: true, opts: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } } },
  { id: 'iphone13-safari-375', engine: webkit, phone: true, opts: { ...devices['iPhone 13'], viewport: { width: 375, height: 812 } } },
  { id: 'ipad-safari', engine: webkit, tablet: true, opts: { ...devices['iPad (gen 7)'] } },
  { id: 'ipados-as-mac-touch', engine: webkit, tablet: true, opts: { ...devices['iPad Pro 11'], userAgent: MAC_UA } },
  { id: 'android-desktop-site-coarse', engine: chromium, tablet: true, opts: { ...devices['Pixel 7'], viewport: { width: 980, height: 1200 }, userAgent: LINUX_UA } },
  { id: 'laptop-chrome-1280', engine: chromium, opts: { viewport: { width: 1280, height: 800 } } },
  // a Windows touchscreen laptop: touch points present, but the primary pointer is a mouse/trackpad (pointer: fine, hover: hover)
  { id: 'touchscreen-laptop-1280', engine: chromium, touchLaptop: true, opts: { viewport: { width: 1280, height: 800 } } },
]
const only = process.env.ONLY || ''
for (const d of D.filter(x => !only || x.id.includes(only))) {
  const tag = d.id
  console.log(`\n=== ${tag} ===`)
  const browser = await d.engine.launch()
  const ctx = await browser.newContext(d.opts)
  await ctx.addInitScript(SPEECH)
  if (d.touchLaptop) await ctx.addInitScript("Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 10 })")
  const page = await ctx.newPage()
  const errors = [], loaded = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('request', r => { if (/VoiceButton|useVoiceInput/.test(r.url())) loaded.push(r.url()) })
  await page.route('**/api/pulse', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"text":"ok"}' }))
  await page.goto(`${BASE}/?as=rohan`); await page.waitForTimeout(3000)
  const allPages = page.getByRole('button', { name: /All pages/i })
  if (await allPages.count()) { await allPages.click(); await page.waitForTimeout(700); await page.getByRole('button', { name: /NavAI/i }).last().click() }
  else await page.getByText('NavAI', { exact: true }).first().click()
  await page.waitForTimeout(1500)
  const later = page.getByRole('button', { name: 'Not now' }); if (await later.count()) await later.first().click().catch(() => {})
  const mics = await page.locator('.nx-mic').count(), voiceBox = await page.locator('.nx-voice, .nx-caret, .nx-listening').count()
  const mobile = !!(d.phone || d.tablet)
  if (mobile) {
    ok(`${tag} no 🎙 button, no language menu`, mics === 0 && voiceBox === 0 && (await page.getByRole('button', { name: /Speak your question|Voice language/ }).count()) === 0)
    ok(`${tag} speech code was never downloaded`, loaded.length === 0, loaded.join(','))
    ok(`${tag} 📎 is there`, (await page.getByRole('button', { name: 'Upload or add files' }).count()) === 1)
    ok(`${tag} Send is there`, (await page.locator('.pm-send, .af-composer-send').count()) === 1)
    ok(`${tag} composer fits (nothing outside the screen, no horizontal scroll)`, await page.evaluate(() => {
      const c = document.querySelector('.pm-box, .af-composer'); if (!c) return false; const r = c.getBoundingClientRect()
      return r.left >= 0 && r.right <= window.innerWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1 &&
        [...c.querySelectorAll('button')].every(b => { const q = b.getBoundingClientRect(); return q.left >= 0 && q.right <= window.innerWidth + 1 }) }))
    const ta = page.locator('.pm-box textarea, .af-composer-input'); await ta.fill('hello'); await page.locator('.pm-send, .af-composer-send').click(); await page.waitForTimeout(800)
    ok(`${tag} typing and sending still work`, (await page.getByText('ok', { exact: true }).count()) >= 1)
    await page.screenshot({ path: `${OUT}/${tag}.png` })
  } else {
    ok(`${tag} 🎙 shown (laptop)`, mics === 1)
    ok(`${tag} language caret shown`, (await page.locator('.nx-caret').count()) === 1)
    const ta = page.locator('.af-composer-input'); await ta.fill('typed')
    await page.getByRole('button', { name: /Speak your question/ }).click(); await page.waitForTimeout(300)
    const cfg = await page.evaluate(() => ({ cont: window.__rec.continuous, lang: window.__rec.lang }))
    ok(`${tag} voice unchanged: continuous, en-IN, Listening…`, cfg.cont === true && cfg.lang === 'en-IN' && (await page.getByText('Listening…').count()) === 1, JSON.stringify(cfg))
    await page.evaluate(() => window.__say('hello')); await page.waitForTimeout(150)
    ok(`${tag} text goes after what was typed`, (await ta.inputValue()) === 'typed hello')
    await page.locator('.nx-caret').click()
    ok(`${tag} en-IN / hi-IN menu works`, (await page.getByRole('menuitemradio').count()) === 2)
    await page.screenshot({ path: `${OUT}/${tag}.png` })
  }
  ok(`${tag} no page errors`, errors.length === 0, errors.join(' | '))
  await browser.close()
}
const bad = results.filter(r => !r.ok)
console.log(`\n${results.length - bad.length}/${results.length} passed`)
process.exit(bad.length ? 1 : 0)
