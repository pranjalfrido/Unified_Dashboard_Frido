// Before | after composites for every screenshot present in both folders (same file name), plus an
// index.html that lists them (open it locally; the PNGs are git-ignored).
// Usage: node scripts/responsive/compose-before-after.mjs <beforeDir> <afterDir> <outDir> [title]
import { chromium } from 'playwright'
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { repoRoot } from './lib.mjs'

const [b, a, o, title = 'Before / after'] = process.argv.slice(2)
const before = resolve(repoRoot, b), after = resolve(repoRoot, a), out = resolve(repoRoot, o)
mkdirSync(out, { recursive: true })
const files = readdirSync(after).filter(f => f.endsWith('.png') && existsSync(resolve(before, f))).sort()
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 400, height: 100 } })
for (const f of files) {
  const data = await page.evaluate(async ({ l, r }) => {
    const load = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + src })
    const [L, R] = [await load(l), await load(r)]
    const gap = 24, head = 28
    const c = document.createElement('canvas')
    c.width = L.width + R.width + gap; c.height = Math.max(L.height, R.height) + head
    const g = c.getContext('2d')
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height)
    g.fillStyle = '#1a1a1a'; g.font = 'bold 16px sans-serif'
    g.fillText('Before', 6, 20); g.fillText('After', L.width + gap + 6, 20)
    g.drawImage(L, 0, head); g.drawImage(R, L.width + gap, head)
    return c.toDataURL('image/png')
  }, { l: readFileSync(resolve(before, f)).toString('base64'), r: readFileSync(resolve(after, f)).toString('base64') })
  writeFileSync(resolve(out, f), Buffer.from(data.split(',')[1], 'base64'))
  console.log('composed', f)
}
await browser.close()
writeFileSync(resolve(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;margin:16px;background:#f4f5f4}h1{font-size:18px}h2{font-size:14px;margin:24px 0 6px}img{max-width:100%;border:1px solid #ccc;background:#fff}</style>
<h1>${title}</h1>${files.map(f => `<h2>${f.replace('.png', '').replace('__', ' · ')}</h2><img src="${f}" loading="lazy">`).join('\n')}`)
console.log(`wrote ${out}`)
