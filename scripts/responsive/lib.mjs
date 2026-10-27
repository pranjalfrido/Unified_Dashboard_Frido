// Shared Playwright helpers for the responsive-overhaul verification scripts (docs/responsive/).
// Requires: npm run server (API on :3001), npm run dev (Vite on 127.0.0.1:5173), and a saved
// session at docs/responsive/.auth/auth.json (scripts/save-auth.mjs; gitignored, never commit).
import { chromium, webkit, devices } from 'playwright'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const BASE_URL = process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:5173'
export const AUTH_FILE = resolve(repoRoot, 'docs/responsive/.auth/auth.json')

// The fixed audit window. "Last Month" in the date picker resolves to this while today is in Oct 2026.
export const SEPT = { start: '2026-09-01', end: '2026-09-30' }

// Same 13 viewports as docs/responsive/before/<route>/.
export const VIEWPORTS = [
  { name: 'desktop-1920x1080', width: 1920, height: 1080 },
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'laptop-1366x768', width: 1366, height: 768 },
  { name: 'laptop-1280x800', width: 1280, height: 800 },
  { name: 'tablet-1024x768', width: 1024, height: 768 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'iphoneProMax-430x932', width: 430, height: 932, mobile: true },
  { name: 'iphone14-390x844', width: 390, height: 844, mobile: true },
  { name: 'iphoneSE-375x667', width: 375, height: 667, mobile: true },
  { name: 'pixel-412x915', width: 412, height: 915, mobile: true },
  { name: 'smallAndroid-360x800', width: 360, height: 800, mobile: true },
  { name: 'iphone14-landscape-844x390', width: 844, height: 390, mobile: true },
  { name: 'smallAndroid-landscape-800x360', width: 800, height: 360, mobile: true },
]

// Matches both the desktop label ("1 Sept 2026 → 30 Sept 2026") and the compact mobile one
// ("1 Sept – 30 Sept"); month names can be 3 or 4 letters ("Oct", "Sept").
// …and the phone header's short form ("Sep 2026", "1–26 Oct"; HEADER_MOBILE_PROMPT.md §3).
const DATE_LABEL = /\d{1,2}\s+[A-Z][a-z]{2,3}(\s+\d{4})?\s*(→|–|-)\s*\d{1,2}\s+[A-Z][a-z]{2,3}|^[A-Z][a-z]{2} \d{4}$|^\d{1,2}–\d{1,2} [A-Z][a-z]{2}$/
const SEPT_LABEL = /1\s+Sept?(\s+2026)?\s*(→|–|-)\s*30\s+Sept?|Sep 2026/

// RESPONSIVE_ENGINE=webkit runs the same checks on WebKit (Safari's engine). For the iPhone viewports
// it uses Playwright's real device profiles (Safari user agent, isMobile, hasTouch, device pixel
// ratio), so iOS-specific behaviour shows up; screenshots are kept at 1x so they compare with
// Chromium's.
export const ENGINE = process.env.RESPONSIVE_ENGINE === 'webkit' ? 'webkit' : 'chromium'
const IOS_PROFILES = { 'iphoneSE-375x667': 'iPhone SE', 'iphone14-390x844': 'iPhone 14', 'iphone14-landscape-844x390': 'iPhone 14 landscape' }

export async function launch(viewport = VIEWPORTS[1]) {
  const browser = await (ENGINE === 'webkit' ? webkit : chromium).launch()
  const profile = ENGINE === 'webkit' && IOS_PROFILES[viewport.name] ? devices[IOS_PROFILES[viewport.name]] : null
  const ctx = await browser.newContext({
    ...(profile || {}),
    storageState: AUTH_FILE,
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: !!viewport.mobile,
    hasTouch: !!viewport.mobile,
    deviceScaleFactor: 1,
  })
  return { browser, ctx }
}

const pause = ms => new Promise(r => setTimeout(r, ms))

export async function openPage(page, route) {
  await page.goto(BASE_URL + route, { waitUntil: 'networkidle', timeout: 300000 })
  if (await page.getByText('Sign in to Navigator').count()) throw new Error('Not logged in: re-run scripts/save-auth.mjs')
  await waitSettled(page)
}

// Opens `route` and sets the date range to Sept 2026 via the real picker UI ("Last Month"),
// then asserts the rendered label shows Sept. Retries up to 3 times.
export async function openWithSept(page, route) {
  await page.goto(BASE_URL + route, { waitUntil: 'networkidle', timeout: 300000 })
  if (await page.getByText('Sign in to Navigator').count()) throw new Error('Not logged in: re-run scripts/save-auth.mjs')
  for (let attempt = 1; attempt <= 3; attempt++) {
    await pause(1500)
    const trigger = page.locator('button, [role=button], div[style*="cursor: pointer"]').filter({ hasText: DATE_LABEL }).last()
    await trigger.click({ timeout: 30000 })
    await page.getByText('Last Month', { exact: true }).first().click({ timeout: 15000 })
    const apply = page.getByRole('button', { name: 'Apply', exact: true })
    if (await apply.count() && await apply.last().isVisible()) await apply.last().click()
    await page.keyboard.press('Escape').catch(() => {})
    await waitSettled(page)
    const body = await page.locator('body').innerText()
    if (SEPT_LABEL.test(body)) return
  }
  throw new Error(`Date label never showed Sept 2026 on ${route}`)
}

// Network idle plus no visible loading spinner/overlay, then a short buffer for charts to animate in.
export async function waitSettled(page, { timeout = 480000 } = {}) {
  await page.waitForLoadState('networkidle', { timeout })
  await page.waitForFunction(() => !document.querySelector('[data-loading-overlay], .loading-overlay, [aria-busy="true"]'), null, { timeout }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout })
  await pause(4000)
}

// Several Overview sections render after their own async loads (static caches, logistics, alerts
// badge), so networkidle alone isn't "done". Returns the body text once it is unchanged across
// `reads` consecutive reads `interval` ms apart.
export async function waitStableText(page, { interval = 3000, reads = 3, timeout = 300000 } = {}) {
  const t0 = Date.now()
  let last = null, same = 0
  while (Date.now() - t0 < timeout) {
    const text = await page.locator('body').innerText()
    same = text === last ? same + 1 : 1
    last = text
    if (same >= reads) return text
    await pause(interval)
  }
  throw new Error('Page text never stabilised')
}

// JSON with object keys sorted, arrays sorted by their serialised rows and numbers rounded to 12
// significant digits, so BigQuery row order (no ORDER BY) and float-summation-order noise
// (474797909.77000093 vs 474797909.7700009) don't register as a data change.
export function canonicalJSON(v) {
  if (Array.isArray(v)) return '[' + v.map(canonicalJSON).sort().join(',') + ']'
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonicalJSON(v[k])).join(',') + '}'
  if (typeof v === 'number' && isFinite(v)) return String(Number(v.toPrecision(12)))
  return JSON.stringify(v)
}

// Tolerant fingerprint: how many numbers a response holds and their total to 10 significant digits.
// Survives BigQuery ROUND() flips on .xx5 averages (api/logistics returns 3.87 or 3.88 for the same
// query), which make the exact sha256 differ between identical calls; a real data change still moves it.
export function numericSummary(v) {
  let count = 0, sum = 0
  const walk = x => {
    if (Array.isArray(x)) x.forEach(walk)
    else if (x && typeof x === 'object') Object.values(x).forEach(walk)
    else if (typeof x === 'number' && isFinite(x)) { count++; sum += x }
  }
  walk(v)
  return { count, sum: Number(sum.toPrecision(10)) }
}

// Every number-like token rendered on the page, in order (₹ amounts, %, ROAS "x", plain counts).
export function numberTokens(text) {
  return (text.match(/[-−]?₹\s?[\d,]+(\.\d+)?\s?(Cr|L|K)?|[-−]?\d[\d,]*(\.\d+)?\s?(%|x\b|Cr\b|L\b|K\b)?/g) || [])
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => /\d/.test(s))
}
