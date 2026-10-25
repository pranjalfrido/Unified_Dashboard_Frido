// Pixel comparison of two screenshots (same size expected). Prints the size check, the share of
// differing pixels, and the bounding box of the differences; optionally writes a diff image
// (differing pixels in red over a faded copy of the first image).
//
// Usage: node scripts/responsive/pixel-diff.mjs <a.png> <b.png> [diff.png]
import { readFileSync, writeFileSync } from 'fs'
import { chromium } from 'playwright'

const [a, b, out] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage()
const res = await page.evaluate(async ([A, B, wantDiff]) => {
  const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + src })
  const [ia, ib] = await Promise.all([load(A), load(B)])
  if (ia.width !== ib.width || ia.height !== ib.height) return { sameSize: false, a: [ia.width, ia.height], b: [ib.width, ib.height] }
  const w = ia.width, h = ia.height
  const ctx = (img) => { const c = new OffscreenCanvas(w, h); const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h) }
  const da = ctx(ia).data, db = ctx(ib).data
  const diff = new OffscreenCanvas(w, h), dg = diff.getContext('2d'), out = dg.createImageData(w, h)
  let n = 0, x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let i = 0; i < da.length; i += 4) {
    const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])
    const p = i / 4, x = p % w, y = (p / w) | 0
    if (d > 24) { n++; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; out.data.set([220, 30, 30, 255], i) }
    else out.data.set([da[i], da[i + 1], da[i + 2], 60], i)
  }
  let png = null
  if (wantDiff) {
    dg.putImageData(out, 0, 0)
    const blob = await diff.convertToBlob()
    png = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob) })
  }
  return { sameSize: true, size: [w, h], diffPixels: n, diffPct: +(n / (w * h) * 100).toFixed(4), box: n ? { x0, y0, x1, y1 } : null, png }
}, [readFileSync(a).toString('base64'), readFileSync(b).toString('base64'), !!out])
await browser.close()
if (out && res.png) writeFileSync(out, Buffer.from(res.png, 'base64'))
delete res.png
console.log(JSON.stringify(res))
