// Login page on phones (logged out): field attributes for password managers, 16px inputs, no
// overflow, Sign in visible with the keyboard open (viewport shortened after focus), inline error
// under the form (wrong password with a made-up account; network error with the browser offline),
// "Signing in…" state, the Contact link. Screenshots per viewport.
// Usage: RESPONSIVE_ENGINE=webkit|chromium node scripts/responsive/check-login.mjs <outDir> [viewport]
import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { chromium, webkit, devices } from 'playwright'
import { repoRoot, BASE_URL, VIEWPORTS, ENGINE } from './lib.mjs'

const [outArg = 'docs/responsive/after/login', vpName = 'iphoneSE-375x667'] = process.argv.slice(2)
const outDir = resolve(repoRoot, outArg); mkdirSync(outDir, { recursive: true })
const vp = VIEWPORTS.find(v => v.name === vpName)
const pause = ms => new Promise(r => setTimeout(r, ms))
const results = []
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`) }
const browser = await (ENGINE === 'webkit' ? webkit : chromium).launch()
const profile = ENGINE === 'webkit' && vp.name.startsWith('iphone') ? devices[vp.name.startsWith('iphoneSE') ? 'iPhone SE' : 'iPhone 14'] : {}
const ctx = await browser.newContext({ ...profile, viewport: { width: vp.width, height: vp.height }, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const shot = n => page.screenshot({ path: resolve(outDir, `${ENGINE}-${vp.name}__${n}.png`) })
await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle' }); await pause(1500)
await shot('login')
const a = await page.evaluate(() => {
  const e = document.querySelector('#email'), p = document.querySelector('#password'), r = document.querySelector('.login-card').getBoundingClientRect()
  return { eType: e.type, eAuto: e.autocomplete, eMode: e.inputMode, pAuto: p.autocomplete, eFont: parseFloat(getComputedStyle(e).fontSize), pFont: parseFloat(getComputedStyle(p).fontSize),
    overflow: document.documentElement.scrollWidth > innerWidth + 1, fullWidth: Math.round(r.width) === innerWidth, radius: getComputedStyle(document.querySelector('.login-card')).borderTopLeftRadius,
    band: getComputedStyle(document.querySelector('.panel-brand')).backgroundImage, eyebrow: getComputedStyle(document.querySelector('.eyebrow')).color,
    mail: document.querySelector('.footer-note a').getAttribute('href') }
})
ok('email: type=email autocomplete=email inputmode=email', a.eType === 'email' && a.eAuto === 'email' && a.eMode === 'email')
ok('password: autocomplete=current-password', a.pAuto === 'current-password')
ok('inputs ≥ 16px', a.eFont >= 16 && a.pFont >= 16, `${a.eFont}/${a.pFont}`)
ok('full screen, no card', a.fullWidth && a.radius === '0px')
ok('dark-green band (header gradient)', /linear-gradient/.test(a.band) && /15, 42, 29/.test(a.band))
ok('WELCOME BACK in muted green', a.eyebrow === 'rgb(95, 143, 117)', a.eyebrow)
ok('Contact → mailto Suraj with subject', a.mail === 'mailto:suraj.s@myfrido.com?subject=Request%20access%20to%20Navigator')
ok('no sideways overflow', !a.overflow)
// password-manager style fill (both fields at once), then the keyboard: shorter viewport after focus
await page.locator('#email').fill('autofill.test@example.com'); await page.locator('#password').fill('not-the-real-password')
await page.locator('#password').focus()
await page.setViewportSize({ width: vp.width, height: Math.round(vp.height * 0.55) }); await pause(900)
const btn = await page.locator('.btn-signin').boundingBox()
ok('Sign in visible with the keyboard open', btn && btn.y >= 0 && btn.y + btn.height <= Math.round(vp.height * 0.55) + 1, `button at ${btn && Math.round(btn.y)}`)
await shot('keyboard')
await page.setViewportSize({ width: vp.width, height: vp.height }); await pause(300)
// wrong password (made-up account): inline error under the form, Signing in… while waiting
await page.locator('.btn-signin').click()
const busy = await page.locator('.btn-signin').innerText()
await page.locator('.err-bottom').waitFor({ timeout: 15000 }).catch(() => {})
const wrong = await page.locator('.err-bottom').innerText().catch(() => '')
ok('"Signing in…" while waiting', /Signing in/.test(busy), busy)
ok('wrong password: inline error under the form', /Incorrect email or password/.test(wrong))
ok('error sits below the Sign in button', (await page.locator('.err-bottom').boundingBox())?.y > (await page.locator('.btn-signin').boundingBox())?.y)
await shot('error')
await ctx.setOffline(true); await page.locator('.btn-signin').click(); await pause(2500)
ok('network error message', /Can't reach the server/.test(await page.locator('.err-bottom').innerText().catch(() => '')))
await ctx.setOffline(false)
writeFileSync(resolve(outDir, `check-${ENGINE}-${vp.name}.json`), JSON.stringify(results, null, 2))
console.log(`${results.filter(r => r.pass).length}/${results.length} pass`)
await browser.close()
