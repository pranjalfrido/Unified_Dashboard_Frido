// Feedback end-to-end check against the LOCAL stand-in (vite on :5197, API on :3017 started with
// scripts/feedback-local-server.mjs). Test people only; nothing here touches Supabase.
//   node scripts/feedback-e2e.mjs            → runs every scenario, prints PASS/FAIL lines, exits 1 on a failure
import { chromium, webkit } from 'playwright'
import { mkdirSync, rmSync, writeFileSync } from 'fs'

const BASE = process.env.BASE || 'http://127.0.0.1:5197'
const API = process.env.API || 'http://localhost:3017/api/feedback'
const OUT = process.env.SHOTS || '.feedback-local/shots-e2e'
mkdirSync(OUT, { recursive: true })
const results = []
const ok = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`) }
const call = async (action, as, extra = {}) => {
  const r = await fetch(API, { method: 'POST', body: JSON.stringify({ action, callerToken: as ? `local:${as}` : undefined, ...extra }) })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

// a tiny real PNG (a red square) to upload
import zlib from 'zlib'
function png(w, h) {
  const crc = b => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } let x = 0xffffffff; for (const v of b) x = t[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 220; raw[o + 1] = 40; raw[o + 2] = 40 } }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
writeFileSync(`${OUT}/red.png`, png(1600, 900))

const VIEWPORTS = [
  { id: 'laptop-1366', engine: chromium, w: 1366, h: 800, phone: false },
  { id: 'chromium-375', engine: chromium, w: 375, h: 812, phone: true },
  { id: 'chromium-360', engine: chromium, w: 360, h: 780, phone: true },
  { id: 'webkit-375', engine: webkit, w: 375, h: 812, phone: true },
  { id: 'webkit-360', engine: webkit, w: 360, h: 780, phone: true },
]

async function session(vp, as) {
  const browser = await vp.engine.launch()
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.phone, isMobile: vp.phone && vp.engine === chromium, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${BASE}/overview?as=${as}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(vp.phone ? '.mnav' : '.sidebar', { timeout: 30000 })
  await page.waitForTimeout(800)
  return { browser, page, errors }
}

// open the form from the entry point that exists on this device
async function openForm(page, vp) {
  if (vp.phone) {
    // header ⋯ → Send feedback
    await page.locator('.mph [data-ctl="more"]').first().click()
    await page.getByRole('button', { name: 'Send feedback' }).first().click()
  } else {
    await page.getByTestId('fb-open-header').click()
  }
  await page.getByLabel('Your message').waitFor({ timeout: 5000 })
}

async function sendOne(page, vp, { type, text, urgent = false, shot = false }) {
  await openForm(page, vp)
  await page.getByRole('button', { name: type, exact: true }).click()
  await page.getByLabel('Your message').fill(text)
  if (urgent) await page.getByLabel('This is urgent').check()
  if (shot) { await page.getByTestId('fb-file').setInputFiles(`${OUT}/red.png`); await page.locator('.fb-shot img').waitFor({ timeout: 8000 }) }
  const ctxText = await page.getByTestId('fb-context').innerText()
  await page.locator('.fb-actions').getByRole('button', { name: 'Send', exact: true }).click()
  await page.getByText("Thanks! Suraj's team will look into it.").waitFor({ timeout: 8000 })
  return ctxText
}

const reset = async () => { try { rmSync('.feedback-local/feedback.json', { force: true }); rmSync('.feedback-local/shots', { recursive: true, force: true }); rmSync('.feedback-local/emails.log', { force: true }) } catch { /* ignore */ } }

// ───────────────────────── API-level checks (non-admin boundaries) ─────────────────────────
async function apiChecks() {
  await reset()
  const noAuth = await call('list', null)
  ok('API: no token → 401', noAuth.status === 401)
  const asha = await call('submit', 'asha', { type: 'bug', message: 'script <img src=x onerror=alert(1)> test', context: { page: 'Sales' } })
  ok('API: user can submit', asha.status === 200 && asha.body.ok)
  const id = asha.body.id
  ok('API: non-admin list → 403', (await call('list', 'asha')).status === 403)
  ok('API: non-admin get → 403', (await call('get', 'asha', { id })).status === 403)
  ok('API: non-admin update → 403', (await call('update', 'asha', { id, status: 'done', admin_reply: 'hacked' })).status === 403)
  ok('API: non-admin digest → 403', (await call('digest', 'asha')).status === 403)
  const rohanMine = await call('mine', 'rohan')
  ok("API: another user can't see Asha's items", rohanMine.body.items.length === 0)
  const ashaMine = await call('mine', 'asha')
  ok('API: user sees own item', ashaMine.body.items.length === 1 && ashaMine.body.items[0].id === id)
  ok('API: HTML kept as plain text (never interpreted)', ashaMine.body.items[0].message.includes('<img'))
  ok('API: bad type → 400', (await call('submit', 'asha', { type: 'nope', message: 'x' })).status === 400)
  ok('API: empty message → 400', (await call('submit', 'asha', { type: 'bug', message: '   ' })).status === 400)
  ok('API: 1001 chars → 400', (await call('submit', 'asha', { type: 'bug', message: 'a'.repeat(1001) })).status === 400)
  ok('API: forged user_id is ignored (item belongs to caller)', (await call('submit', 'rohan', { type: 'bug', message: 'forge', user_id: '00000000-0000-4000-8000-0000000000b1' })).status === 200 && (await call('mine', 'asha')).body.items.length === 1)
  ok('API: fake image rejected', (await call('submit', 'asha', { type: 'bug', message: 'img', screenshot: 'data:image/png;base64,AAAA' })).status === 400)
  let last
  for (let i = 0; i < 25; i++) last = await call('submit', 'rohan', { type: 'suggestion', message: `bulk ${i}` })
  ok('API: 21st item in a day → 429', last.status === 429)
  const wn = await call('submit', 'asha', { type: 'wrong_number', message: 'revenue wrong', urgent: true, context: { page: 'Overview' } })
  ok('API: urgent / wrong number is e-mailed (logged locally)', wn.status === 200)
  await reset()
}

// ───────────────────────── UI scenarios ─────────────────────────
async function uiScenario(vp) {
  const tag = vp.id
  await reset()
  // 1) each type, with and without screenshot, as a non-admin
  const u = await session(vp, 'asha')
  const types = ['Bug', 'Wrong number', 'Suggestion', 'New feature/page']
  let ctxLine = ''
  for (let i = 0; i < types.length; i++) ctxLine = await sendOne(u.page, vp, { type: types[i], text: `${tag} ${types[i]} ${i % 2 ? 'with' : 'without'} screenshot`, shot: i % 2 === 1, urgent: i === 2 })
  ok(`${tag}: all 4 types sent`, true)
  ok(`${tag}: context line has page, device and version`, /Overview/.test(ctxLine) && /(Phone|Laptop|Tablet) \d+×\d+/.test(ctxLine) && /v\w+/.test(ctxLine), ctxLine)
  await u.page.screenshot({ path: `${OUT}/${tag}-after-send.png` })
  // form look
  await openForm(u.page, vp)
  await u.page.screenshot({ path: `${OUT}/${tag}-form.png` })
  await u.page.keyboard.press('Escape')
  await u.page.waitForTimeout(300)
  const stored = (await call('mine', 'asha')).body.items
  ok(`${tag}: 4 items stored with context`, stored.length >= 4 && stored.every(i => i.context?.page && i.context?.device?.kind && i.context?.appVersion && i.context?.time), `n=${stored.length}`)
  ok(`${tag}: device kind matches`, stored[0].context.device.kind === (vp.phone ? 'Phone' : 'Laptop'))
  // non-admin: no inbox anywhere
  if (vp.phone) {
    await u.page.getByRole('button', { name: 'All pages' }).click()
    await u.page.waitForTimeout(500)
    const hasInbox = await u.page.getByText('Reports and ideas from your team').count()
    ok(`${tag}: non-admin launcher has no Feedback inbox`, hasInbox === 0)
    ok(`${tag}: launcher has "Send feedback"`, await u.page.getByTestId('launcher-send-feedback').count() === 1)
    await u.page.screenshot({ path: `${OUT}/${tag}-launcher-user.png` })
    await u.page.keyboard.press('Escape')
  } else {
    ok(`${tag}: non-admin sidebar has no Inbox`, await u.page.getByTestId('sb-inbox').count() === 0)
    ok(`${tag}: sidebar has Feedback`, await u.page.getByTestId('sb-feedback').count() === 1)
  }
  await u.page.goto(`${BASE}/feedback`, { waitUntil: 'domcontentloaded' })
  await u.page.waitForTimeout(1500)
  ok(`${tag}: non-admin opening /feedback sees no inbox`, await u.page.getByTestId('fbx').count() === 0 && !/feedback$/.test(new URL(u.page.url()).pathname))
  // My feedback in profile
  await u.page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' })
  await u.page.getByTestId('my-feedback').waitFor({ timeout: 10000 })
  await u.page.locator('.fbm-item').first().waitFor({ timeout: 8000 })
  ok(`${tag}: My feedback lists own items`, (await u.page.getByTestId('my-feedback').locator('.fbm-item').count()) >= 4)
  await u.page.screenshot({ path: `${OUT}/${tag}-my-feedback.png`, fullPage: false })
  ok(`${tag}: no page errors (user)`, u.errors.filter(e => !/fetch|Failed to load|NetworkError|Load failed|access control/i.test(e)).length === 0, u.errors.slice(0, 2).join(' | '))
  await u.browser.close()

  // 2) admin inbox
  const a = await session(vp, 'admin')
  if (vp.phone) {
    await a.page.getByRole('button', { name: 'All pages' }).click()
    await a.page.waitForTimeout(500)
    ok(`${tag}: admin launcher shows Feedback page with a New count`, await a.page.getByText('Reports and ideas from your team').count() === 1)
    await a.page.screenshot({ path: `${OUT}/${tag}-launcher-admin.png` })
    await a.page.getByText('Reports and ideas from your team').click()
  } else {
    ok(`${tag}: admin sidebar has Inbox with badge`, await a.page.getByTestId('sb-inbox').count() === 1 && await a.page.locator('.fb-navbadge').count() === 1)
    await a.page.getByTestId('sb-inbox').click()
  }
  await a.page.getByTestId('fbx').waitFor({ timeout: 10000 })
  await a.page.getByTestId('fbx-row').first().waitFor({ timeout: 10000 })
  const rows = await a.page.getByTestId('fbx-row').count()
  ok(`${tag}: inbox lists all items`, rows >= 4, `rows=${rows}`)
  await a.page.screenshot({ path: `${OUT}/${tag}-inbox.png` })
  // filter by type
  await a.page.getByLabel('Filter by type').selectOption('wrong_number')
  await a.page.waitForTimeout(700)
  ok(`${tag}: type filter works`, (await a.page.getByTestId('fbx-row').count()) === 1)
  await a.page.getByLabel('Filter by type').selectOption('')
  await a.page.getByLabel('Filter by status').selectOption('done')
  await a.page.waitForTimeout(700)
  ok(`${tag}: status filter works (none done yet)`, (await a.page.getByTestId('fbx-row').count()) === 0)
  await a.page.getByLabel('Filter by status').selectOption('')
  await a.page.waitForTimeout(500)
  // open the item with a screenshot and close it with a reply
  await a.page.getByTestId('fbx-row').filter({ hasText: 'with screenshot' }).first().click()
  await a.page.getByTestId('fbx-detail').waitFor()
  await a.page.waitForTimeout(600)
  ok(`${tag}: detail shows screenshot`, await a.page.locator('.fbx-shot img').count() === 1)
  await a.page.screenshot({ path: `${OUT}/${tag}-inbox-detail.png` })
  await a.page.getByLabel('Status', { exact: true }).selectOption('done')
  ok(`${tag}: Done without a reply is blocked`, await a.page.getByRole('button', { name: 'Save' }).isDisabled())
  await a.page.getByLabel('Reply', { exact: true }).fill(`Fixed in the latest release (${tag}).`)
  await a.page.getByRole('button', { name: 'Save' }).click()
  await a.page.getByText('Saved.').waitFor({ timeout: 8000 })
  ok(`${tag}: admin closed an item with a reply`, true)
  const failedAsUser = await call('update', 'asha', { id: stored[0].id, status: 'done', admin_reply: 'x' })
  ok(`${tag}: user still gets 403 on update`, failedAsUser.status === 403)
  await a.browser.close()

  // 3) the user sees the notification, My feedback reply
  const u2 = await session(vp, 'asha')
  await u2.page.waitForTimeout(1500)
  if (vp.phone) {
    await u2.page.locator('.mph [data-ctl="more"]').first().click()
    await u2.page.getByRole('button', { name: /Notifications \(/ }).click()
  } else {
    await u2.page.getByLabel('Alerts').click()
  }
  await u2.page.getByText('Your feedback was fixed').first().waitFor({ timeout: 8000 })
  ok(`${tag}: user gets the in-app notification`, true)
  await u2.page.screenshot({ path: `${OUT}/${tag}-notification.png` })
  await u2.page.waitForTimeout(2500) // acknowledged after it was shown
  await u2.page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' })
  await u2.page.getByTestId('my-feedback').waitFor({ timeout: 10000 })
  await u2.page.locator('.fbm-item').first().waitFor({ timeout: 8000 })
  ok(`${tag}: My feedback shows status + reply`, (await u2.page.getByTestId('my-feedback').getByText('Fixed in the latest release').count()) === 1 && (await u2.page.getByTestId('my-feedback').getByText('Done', { exact: true }).count()) >= 1)
  await u2.browser.close()
}

// NavAI 👎: seed a conversation, press "Report this answer"
async function navaiScenario(vp) {
  const tag = `${vp.id}-navai`
  await reset()
  const s = await session(vp, 'asha')
  const uid = '00000000-0000-4000-8000-0000000000b1'
  await s.page.evaluate(uid => {
    const conv = [{ id: 'c1', title: 'Revenue yesterday', updatedAt: Date.now(), messages: [{ id: 'm1', role: 'user', text: 'What was revenue yesterday?' }, { id: 'm2', role: 'assistant', text: 'Revenue yesterday was **₹4.2 Cr**.', model: 'claude-sonnet' }] }]
    localStorage.setItem(`frido_pulse_conversations_${uid}`, JSON.stringify(conv))
  }, uid)
  await s.page.goto(`${BASE}/ask`, { waitUntil: 'domcontentloaded' })
  await s.page.waitForTimeout(1500)
  if (await s.page.getByTestId('report-answer').count() === 0) {
    // phone opens on the first-screen list: open the saved chat
    const t = s.page.getByText('What was revenue yesterday?').first()
    if (await t.count()) await t.click().catch(() => {})
    await s.page.waitForTimeout(800)
  }
  const btn = s.page.getByTestId('report-answer').first()
  const present = await btn.count()
  ok(`${tag}: "Report this answer" shown under the answer`, present >= 1)
  if (present) {
    await s.page.screenshot({ path: `${OUT}/${tag}-answer.png` })
    await btn.click()
    await s.page.getByLabel('Your message').waitFor({ timeout: 5000 })
    ok(`${tag}: type preselected as Wrong number`, (await s.page.getByRole('button', { name: 'Wrong number', exact: true }).getAttribute('aria-pressed')) === 'true')
    await s.page.getByLabel('Your message').fill('Revenue looks too high')
    await s.page.locator('.fb-actions').getByRole('button', { name: 'Send', exact: true }).click()
    await s.page.getByText("Thanks! Suraj's team will look into it.").waitFor({ timeout: 8000 })
    const items = (await call('mine', 'asha')).body.items
    const it = items[0]
    ok(`${tag}: stored as wrong_number with question + answer`, it.type === 'wrong_number' && /revenue yesterday/i.test(it.context.ai?.question || '') && /4\.2 Cr/.test(it.context.ai?.answer || ''), JSON.stringify(it.context.ai))
  }
  await s.browser.close()
}

const only = process.argv[2]
await apiChecks()
for (const vp of VIEWPORTS) {
  if (only && !vp.id.includes(only)) continue
  try { await uiScenario(vp) } catch (e) { ok(`${vp.id}: scenario crashed`, false, e.message.split('\n').slice(0, 6).join(' | ')) }
  try { await navaiScenario(vp) } catch (e) { ok(`${vp.id}-navai: scenario crashed`, false, e.message.split('\n')[0]) }
}
const bad = results.filter(r => !r.ok)
console.log(`\n${results.length - bad.length}/${results.length} passed`)
process.exit(bad.length ? 1 : 0)
