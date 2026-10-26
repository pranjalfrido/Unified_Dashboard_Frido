// Palette + type check for a mobile page (docs/responsive/MOBILE_DESIGN_SYSTEM.md §1): every text,
// background, border and SVG colour inside the page's mobile root must come from the one mobile
// palette (C.m in src/utils.js, white, black-ish shadows, transparent, or a translucent version of
// those), and no visible text may be smaller than 12px. Also checks the header + bottom nav.
// Usage: node scripts/responsive/check-palette.mjs [viewportName] [root selector]  (RESPONSIVE_ENGINE=webkit ok)
//        ROUTE=/sales/… runs it on another page with the same mobile components (default /overview)
import { launch, openPage, VIEWPORTS, ENGINE } from './lib.mjs'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { repoRoot } from './lib.mjs'

const vp = VIEWPORTS.find(v => v.name === (process.argv[2] || 'iphone14-390x844'))
const root = process.argv[3] || '.ov-mobile'
// Palette = every #hex inside the `m: { ... }` block of C in src/utils.js, plus white/ink basics.
const utils = readFileSync(resolve(repoRoot, 'src/utils.js'), 'utf8')
const mBlock = utils.slice(utils.indexOf('  m: {'), utils.indexOf('\n  },', utils.indexOf('  m: {')))
const hex = [...new Set([...mBlock.matchAll(/#[0-9a-fA-F]{6}\b/g)].map(x => x[0].toLowerCase()))]
const rgbaInM = [...mBlock.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g)].map(x => [+x[1], +x[2], +x[3]])
const palette = [...hex.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))), ...rgbaInM,
  [255, 255, 255], [0, 0, 0], [26, 26, 26], [201, 207, 203]] // white, shadows/backdrop, CRED logo tile, prev-period line

const { browser, ctx } = await launch(vp)
const page = await ctx.newPage()
const ROUTE = '/' + (process.env.ROUTE || 'overview').replace(/^.*Git\//, '').replace(/^\/+/, '') // e.g. ROUTE=sales/shopify/overall (no leading slash on Git Bash)
await openPage(page, ROUTE)
await page.waitForFunction(() => !document.querySelector('.delta-shimmer'), null, { timeout: 120000 }).catch(() => {})
const found = await page.evaluate(({ root, palette }) => {
  const near = (c) => palette.some(p => Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) + Math.abs(p[2] - c[2]) <= 6)
  const parse = v => { const m = v && v.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/); return m ? { c: [+m[1], +m[2], +m[3]], a: m[4] == null ? 1 : +m[4] } : null }
  const bad = new Map(), small = new Map()
  const els = [...document.querySelectorAll(`${root} *, .topnav.m-header *, .topnav.m-header, nav.bottom-nav[aria-label=Main] *, .filtered-strip *`)]
  for (const el of els) {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none') continue
    if (el.tagName === 'IMG') continue
    const props = ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'fill', 'stroke']
    for (const p of props) {
      if ((p.startsWith('border') && parseFloat(cs[p.replace('Color', 'Width')]) === 0)) continue
      if ((p === 'fill' || p === 'stroke') && !(el instanceof SVGElement)) continue
      if (p === 'color' && ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue // text colour only matters where there is text
      const x = parse(cs[p]); if (!x || x.a === 0) continue
      if (!near(x.c)) { const k = `${p} ${cs[p]}`; if (!bad.has(k)) bad.set(k, (el.className?.baseVal ?? el.className) || el.tagName) }
    }
    const ownText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())
    if (ownText && parseFloat(cs.fontSize) < 12) { const k = `${cs.fontSize} "${el.textContent.trim().slice(0, 24)}"`; small.set(k, el.tagName) }
  }
  return { bad: [...bad.entries()], small: [...small.keys()], n: els.length }
}, { root, palette })
console.log(`${ENGINE} ${vp.name}: scanned ${found.n} elements`)
console.log(`colours outside the mobile palette: ${found.bad.length}`)
for (const [k, where] of found.bad) console.log(`   ${k}   (${String(where).slice(0, 40)})`)
console.log(`text under 12px: ${found.small.length}`)
for (const k of found.small) console.log(`   ${k}`)
await browser.close()
process.exit(found.bad.length || found.small.length ? 1 : 0)
