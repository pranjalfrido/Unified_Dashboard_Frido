// Browser check for NavAI on phones: 📎 menu, big phone photos, clear send errors, voice on Android and iPhone.
// Local only: no credentials, nothing real is called. /api/pulse is answered by the test.
//   1. VITE_FEEDBACK_LOCAL=1 VITE_SUPABASE_URL=https://placeholder.invalid VITE_SUPABASE_ANON_KEY=x npx vite --port 5199 --strictPort --host 127.0.0.1
//   2. node scripts/navai-mobile-input-browser-check.mjs [outDir]
// Android = Chromium with the Pixel 7 identity, iPhone = WebKit with the iPhone 13 identity, both at 375 wide; laptop = Chromium 1280.
// The microphone is a stand-in that follows the Web Speech API (the real engine can't be driven by a test).
import { chromium, webkit, devices } from 'playwright'
import { mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.BASE || 'http://127.0.0.1:5199'
const OUT = resolve(root, process.argv[2] || 'docs/navai-mobile-input/screens')
mkdirSync(OUT, { recursive: true })
const results = []
const ok = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`) }

const ANDROID = { engine: chromium, id: 'android-chrome-375', phone: true, opts: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } } }
const IPHONE = { engine: webkit, id: 'iphone-safari-375', phone: true, opts: { ...devices['iPhone 13'], viewport: { width: 375, height: 812 } } }
const IPHONE_CHROME = { engine: webkit, id: 'iphone-chrome-375', phone: true, opts: { ...devices['iPhone 13'], viewport: { width: 375, height: 812 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.6312.52 Mobile/15E148 Safari/604.1' } }
const LAPTOP = { engine: chromium, id: 'chromium-laptop-1280', phone: false, opts: { viewport: { width: 1280, height: 800 } } }

// ── the stand-in microphone: records how it was used ──
const SPEECH = `
window.__recs = []; window.__mode = 'ok'; window.__inClick = false; window.__syncStart = []
document.addEventListener('click', () => { window.__inClick = true }, true)
window.addEventListener('click', () => { window.__inClick = false })
class FakeRec {
  constructor() { this.live = false; window.__recs.push(this); window.__rec = this }
  start() {
    window.__syncStart.push(window.__inClick)
    this.live = true
    const m = window.__mode
    if (m === 'ok') setTimeout(() => this.onstart && this.onstart(), 0)
    else if (m === 'audiostart') setTimeout(() => this.onaudiostart && this.onaudiostart(), 0)
    else if (m.startsWith('error:')) setTimeout(() => { this.onerror && this.onerror({ error: m.slice(6) }) }, 0) // no onend: it must still reset
    // 'silent': never starts, never errors
  }
  stop() { this.live = false; setTimeout(() => this.onend && this.onend(), 0) }
  abort() { this.live = false }
}
window.SpeechRecognition = FakeRec; window.webkitSpeechRecognition = FakeRec
window.__say = (texts, final) => window.__rec.onresult({ results: texts.map((t, i) => Object.assign([{ transcript: t }], { isFinal: final ?? true })) })
window.__liveCount = () => window.__recs.filter(r => r.live).length`

async function session(vp, as, init, routeFn) {
  const browser = await vp.engine.launch()
  const ctx = await browser.newContext(vp.opts)
  if (init) await ctx.addInitScript(init)
  const page = await ctx.newPage()
  const sent = []
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/api/pulse', async route => {
    let body = {}
    try { body = JSON.parse(route.request().postData() || '{}') } catch { /* ignore */ }
    sent.push({ body, bytes: (route.request().postData() || '').length })
    if (routeFn) return routeFn(route, sent.length)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'Answer ok.', model: 't' }) })
  })
  await page.goto(`${BASE}/?as=${as}`)
  await page.waitForTimeout(3000)
  if (vp.phone) { await page.getByRole('button', { name: /All pages/i }).click(); await page.waitForTimeout(700); await page.getByRole('button', { name: /NavAI/i }).last().click() }
  else await page.getByText('NavAI', { exact: true }).first().click()
  await page.waitForTimeout(1200)
  const later = page.getByRole('button', { name: 'Not now' }); if (await later.count()) await later.first().click().catch(() => {})
  return { browser, page, sent, errors }
}
const box = (vp, page) => page.locator(vp.phone ? '.pm-box textarea' : '.af-composer-input')
const sendBtn = (vp, page) => page.locator(vp.phone ? '.pm-send' : '.af-composer-send')
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

// A real-size phone photo: 4000x3000 noisy JPEG (5-8 MB) with EXIF orientation 6 (camera held upright), built in the browser.
async function makePhoto(browser, orientation = 6) {
  const p = await browser.newPage()
  const b64 = await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 4000; c.height = 3000
    const x = c.getContext('2d'); const img = x.createImageData(4000, 3000)
    const d = img.data; for (let o = 0; o < d.length; o += 65536) crypto.getRandomValues(d.subarray(o, Math.min(o + 65536, d.length))); for (let i = 3; i < d.length; i += 4) d[i] = 255
    x.putImageData(img, 0, 0)
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.6))
    const buf = new Uint8Array(await blob.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return btoa(bin)
  })
  await p.close()
  const jpg = Buffer.from(b64, 'base64')
  // EXIF APP1 with one IFD0 entry: Orientation
  const tiff = Buffer.from([0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0])
  const exif = Buffer.concat([Buffer.from('Exif\0\0'), tiff])
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.from([(exif.length + 2) >> 8, (exif.length + 2) & 255]), exif])
  return Buffer.concat([jpg.subarray(0, 2), app1, jpg.subarray(2)])
}
const jpegSize = b64 => { const b = Buffer.from(b64, 'base64'); let i = 2; while (i < b.length) { if (b[i] !== 0xff) { i++; continue } const m = b[i + 1]; if (m === 0xc0 || m === 0xc2) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; i += 2 + b.readUInt16BE(i + 2) } return null }

const only = process.env.ONLY || ''
const want = id => !only || id.includes(only)
let photo = null

// ───────────────────────── 📎 menu + photos + send errors ─────────────────────────
for (const vp of [ANDROID, IPHONE, LAPTOP].filter(v => want(v.id))) {
  const tag = vp.id
  console.log(`\n=== ${tag}: attachments ===`)
  const { browser, page, sent, errors } = await session(vp, 'rohan')
  if (!photo) photo = await makePhoto(browser)
  ok(`${tag} test photo is real size (5-8 MB)`, photo.length > 5e6 && photo.length < 8.5e6, `${(photo.length / 1048576).toFixed(1)} MB`)
  const attach = page.getByRole('button', { name: 'Upload or add files' })
  ok(`${tag} 📎 shown for a person with ask:files`, (await attach.count()) === 1)
  await attach.click()
  await page.waitForTimeout(500)
  if (vp.phone) {
    const labels = await page.locator('.nx-attach-sheet button b').allTextContents()
    ok(`${tag} 📎 opens a sheet with 3 choices`, labels.join('|') === 'Photo or screenshot|Take photo|Document', labels.join('|'))
    await page.screenshot({ path: `${OUT}/${tag}-attach-sheet.png` })
    const attrs = await page.evaluate(() => ['photo', 'camera', 'doc'].map(k => { const i = document.querySelector(`[data-testid=nx-input-${k}]`); return { accept: i.accept, capture: i.getAttribute('capture'), multiple: i.multiple } }))
    ok(`${tag} Photo or screenshot: image/*, no capture (Gallery / Photo Library)`, attrs[0].accept === 'image/*' && attrs[0].capture === null && attrs[0].multiple)
    ok(`${tag} Take photo: image/* with capture=environment`, attrs[1].accept === 'image/*' && attrs[1].capture === 'environment')
    ok(`${tag} Document: PDF, Excel, CSV, Word only`, attrs[2].accept === '.pdf,.xlsx,.xls,.csv,.docx', attrs[2].accept)
    // choosing "Document" opens the document picker (a real click on its input) and closes the sheet
    const chooser = page.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null)
    await page.getByRole('button', { name: /Document/ }).click()
    const fc = await chooser
    ok(`${tag} tapping Document opens the file picker`, !!fc)
    await page.waitForTimeout(500)
    ok(`${tag} the sheet closes after choosing`, (await page.locator('.nx-attach-sheet').count()) === 0)
    // a too-big PDF through the document picker
    if (fc) await fc.setFiles({ name: 'big-report.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(5 * 1024 * 1024, 37) })
    await page.waitForTimeout(500)
    ok(`${tag} a too-big PDF gives a clear message`, (await page.getByText(/over 4 MB; please split the PDF/).count()) >= 1)
    // 6 MB photo through "Photo or screenshot"
    await attach.click(); await page.waitForTimeout(400)
    const c2 = page.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null)
    await page.getByRole('button', { name: /Photo or screenshot/ }).click()
    const fc2 = await c2
    ok(`${tag} tapping Photo or screenshot opens the picker`, !!fc2)
    if (fc2) await fc2.setFiles({ name: 'IMG20261123183605.jpg', mimeType: 'image/jpeg', buffer: photo })
  } else {
    ok(`${tag} laptop: no sheet, one picker (unchanged)`, (await page.locator('.nx-attach-sheet').count()) === 0 && (await page.locator('[data-testid=nx-file-input]').count()) === 1)
    await page.locator('[data-testid=nx-file-input]').setInputFiles({ name: 'IMG20261123183605.jpg', mimeType: 'image/jpeg', buffer: photo })
  }
  await page.waitForTimeout(500)
  for (let i = 0; i < 100 && (await page.locator('.nx-chip.busy').count()); i++) await page.waitForTimeout(150)
  ok(`${tag} the photo chip is ready (no error)`, (await page.locator('.nx-chip[data-status=ready]').count()) === 1, await page.locator('.nx-chip').first().getAttribute('data-status'))
  await box(vp, page).fill('what is in this photo')
  await sendBtn(vp, page).click()
  for (let i = 0; i < 80 && !sent.length; i++) await page.waitForTimeout(100)
  const att = sent[0]?.body?.messages?.at(-1)?.attachments?.[0]
  const dim = att ? jpegSize(att.data) : null
  ok(`${tag} 6 MB 4000x3000 photo sends fine`, !!att && att.type === 'image')
  ok(`${tag} it arrives at 1600 px or less on the long side`, dim && Math.max(dim.w, dim.h) <= 1600, dim ? `${dim.w}x${dim.h}` : 'none')
  ok(`${tag} rotation applied (portrait, as the phone was held)`, dim && dim.h > dim.w, dim ? `${dim.w}x${dim.h}` : 'none')
  ok(`${tag} whole request under 4 MB`, sent[0]?.bytes < 4_000_000, sent[0] ? `${(sent[0].bytes / 1048576).toFixed(2)} MB` : '')
  ok(`${tag} request carries no file name beyond the chip name, only data we sent (no extra fields)`, att && Object.keys(att).sort().join() === 'data,media_type,name,type')
  await page.waitForTimeout(600)
  ok(`${tag} an answer appeared and the box is empty`, (await page.getByText('Answer ok.').count()) >= 1 && (await box(vp, page).inputValue()) === '')
  ok(`${tag} no horizontal scroll`, await noOverflow(page))
  ok(`${tag} no page errors`, errors.length === 0, errors.join(' | '))
  await browser.close()
}

// HEIC that this browser can't read, and each failure message, with the question kept in the box
for (const vp of [ANDROID, LAPTOP].filter(v => want(v.id))) {
  const tag = vp.id
  console.log(`\n=== ${tag}: send errors ===`)
  const modes = [
    ['500 Chat failed', r => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Chat failed. Please try again.' }) }), /NavAI couldn't answer this time/],
    ['413 too large', r => r.fulfill({ status: 413, contentType: 'text/plain', body: 'FUNCTION_PAYLOAD_TOO_LARGE' }), /too large|Photo too large/],
    ['504 timeout', r => r.fulfill({ status: 504, contentType: 'text/plain', body: 'FUNCTION_INVOCATION_TIMEOUT' }), /NavAI took too long, try again\./],
    ['network down', r => r.abort('failed'), /Network problem, try again\./],
  ]
  for (const [name, fn, re] of modes) {
    const { browser, page, sent, errors } = await session(vp, 'rohan', null, fn)
    await box(vp, page).fill('sales of d2c last month')
    await sendBtn(vp, page).click()
    await page.waitForTimeout(1500)
    ok(`${tag} ${name}: clear message shown`, (await page.getByText(re).count()) >= 1)
    ok(`${tag} ${name}: never the bare "Chat failed"`, (await page.getByText(/Chat failed/).count()) === 0)
    ok(`${tag} ${name}: the question is back in the box to resend`, (await box(vp, page).inputValue()) === 'sales of d2c last month')
    if (name.startsWith('413')) {
      // with a photo attached the message names the photo
      await box(vp, page).fill('')
    }
    await browser.close()
  }
  // 413 with a photo: "Photo too large, try a screenshot." and the photo stays attached
  {
    const { browser, page } = await session(vp, 'rohan', null, r => r.fulfill({ status: 413, contentType: 'text/plain', body: 'FUNCTION_PAYLOAD_TOO_LARGE' }))
    const input = vp.phone ? null : page.locator('[data-testid=nx-file-input]')
    if (vp.phone) { await page.getByRole('button', { name: 'Upload or add files' }).click(); await page.waitForTimeout(300) }
    const fcP = vp.phone ? page.waitForEvent('filechooser') : null
    if (vp.phone) await page.getByRole('button', { name: /Photo or screenshot/ }).click()
    const files = { name: 'a.jpg', mimeType: 'image/jpeg', buffer: photo }
    if (vp.phone) await (await fcP).setFiles(files); else await input.setInputFiles(files)
    for (let i = 0; i < 100 && (await page.locator('.nx-chip.busy').count()); i++) await page.waitForTimeout(150)
    await box(vp, page).fill('read this')
    await sendBtn(vp, page).click()
    await page.waitForTimeout(1500)
    ok(`${tag} 413 with a photo: "Photo too large, try a screenshot."`, (await page.getByText('Photo too large, try a screenshot.').count()) >= 1)
    ok(`${tag} the photo is still attached for another try`, (await page.locator('.nx-chip[data-status=ready]').count()) === 1)
    await browser.close()
  }
  // HEIC / unreadable image
  {
    const { browser, page } = await session(vp, 'rohan')
    const files = { name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: Buffer.from('not really a heic file') }
    if (vp.phone) { await page.getByRole('button', { name: 'Upload or add files' }).click(); await page.waitForTimeout(300); const f = page.waitForEvent('filechooser'); await page.getByRole('button', { name: /Photo or screenshot/ }).click(); await (await f).setFiles(files) }
    else await page.locator('[data-testid=nx-file-input]').setInputFiles(files)
    await page.waitForTimeout(1500)
    const err = await page.locator('.nx-chip-error').first().textContent().catch(() => '')
    ok(`${tag} an unreadable HEIC is refused clearly (no crash, not sent)`, /iPhone photo format can't be read/.test(err), err)
    ok(`${tag} Send stays off while a failed file is attached`, await sendBtn(vp, page).isDisabled())
    await browser.close()
  }
}

// Voice on phones and tablets was removed: see navai-no-mobile-mic-browser-check.mjs.
// laptop: mic works as before
if (want(LAPTOP.id)) {
  const vp = LAPTOP, tag = vp.id
  const { browser, page } = await session(vp, 'admin', SPEECH)
  const mic = page.getByRole('button', { name: /Speak your question|Stop listening/ })
  await page.locator('.af-composer-input').fill('typed')
  await mic.click(); await page.waitForTimeout(300)
  const cfg = await page.evaluate(() => ({ continuous: window.__rec.continuous, lang: window.__rec.lang, n: window.__recs.length }))
  ok(`${tag} laptop voice unchanged: continuous, en-IN, listening`, cfg.continuous === true && cfg.lang === 'en-IN' && (await page.getByText('Listening…').count()) === 1, JSON.stringify(cfg))
  await page.evaluate(() => window.__say(['hello']))
  ok(`${tag} laptop text goes after what was typed`, (await page.locator('.af-composer-input').inputValue()) === 'typed hello')
  await browser.close()
}

const bad = results.filter(r => !r.ok)
console.log(`\n${results.length - bad.length}/${results.length} passed`)
process.exit(bad.length ? 1 : 0)
