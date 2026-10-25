// Number-integrity check for the responsive work: layout may change, numbers may not.
//
// Usage: node scripts/responsive/compare-numbers.mjs <baseline.json> <after.json> [<beforeScreensDir> <afterScreensDir>]
//   baseline/after: output of capture-baseline.mjs (desktop 1440x900, per page)
//   screens dirs:   output of capture-screens.mjs (report.json per viewport)
//
// Per page: API data unchanged (numeric summary + top-level scalars), static data files unchanged,
// and the rendered number tokens identical. Per viewport: rendered tokens identical, or - where a
// layout deliberately hides content (Pattern A priority columns) or shows compact axis ticks - every
// value-bearing token difference is listed so it can be checked by eye.
import { readFileSync } from 'fs'
import { resolve } from 'path'

const [baseFile, afterFile, beforeDir, afterDir] = process.argv.slice(2)
const load = f => JSON.parse(readFileSync(resolve(f), 'utf8'))
let failures = 0
const fail = msg => { failures++; console.log('  FAIL ' + msg) }

const base = load(baseFile), after = load(afterFile)
console.log(`baseline ${base.gitCommit} @ ${base.generatedAt}  vs  after ${after.gitCommit} @ ${after.generatedAt}`)
for (const [name, b] of Object.entries(base.pages)) {
  const a = after.pages[name]
  if (!a) { fail(`${name}: missing in after`); continue }
  const apiKey = c => `${c.path} ${JSON.stringify(c.requestBody)}`
  const aCalls = new Map(a.apiCalls.map(c => [apiKey(c), c]))
  let apiOk = 0
  for (const c of b.apiCalls) {
    const x = aCalls.get(apiKey(c))
    if (!x) { fail(`${name}: API call ${c.path} not made after`); continue }
    // Logistics data for a past month is still live (shipments keep moving from in-transit to
    // delivered/RTO), so a tiny drift between two runs is the warehouse, not the frontend. Reported,
    // with its size, but not counted as a failure; anything larger is.
    const rel = c.numeric && x.numeric ? Math.abs(c.numeric.sum - x.numeric.sum) / Math.max(1, Math.abs(c.numeric.sum)) : 1
    if (c.status !== x.status) fail(`${name}: ${c.path} status ${c.status} -> ${x.status}`)
    else if (JSON.stringify(c.numeric) !== JSON.stringify(x.numeric)) {
      if (rel < 1e-5) { console.log(`  DRIFT ${name}: ${c.path} live data moved slightly (sum ${c.numeric.sum} -> ${x.numeric.sum}, ${(rel * 100).toExponential(1)}%, values ${c.numeric.count} -> ${x.numeric.count})`); apiOk++ }
      else fail(`${name}: ${c.path} data changed ${JSON.stringify(c.numeric)} -> ${JSON.stringify(x.numeric)}`)
    }
    else if (JSON.stringify(c.scalars) !== JSON.stringify(x.scalars)) fail(`${name}: ${c.path} top-level values changed`)
    else apiOk++
  }
  const aStatic = new Map(a.staticFiles.map(s => [s.path, s.sha256]))
  const staticOk = b.staticFiles.filter(s => aStatic.get(s.path) === s.sha256).length
  if (staticOk !== b.staticFiles.length) fail(`${name}: static data files differ (${staticOk}/${b.staticFiles.length} identical)`)
  const same = JSON.stringify(b.rendered) === JSON.stringify(a.rendered)
  if (!same) fail(`${name}: rendered numbers differ (${b.rendered.length} -> ${a.rendered.length}): ${diff(b.rendered, a.rendered).slice(0, 8).join(' ; ')}`)
  console.log(`${same && apiOk === b.apiCalls.length && staticOk === b.staticFiles.length ? 'OK  ' : 'DIFF'} ${name.padEnd(22)} rendered ${String(a.rendered.length).padStart(5)} identical=${same}  api ${apiOk}/${b.apiCalls.length} unchanged  static ${staticOk}/${b.staticFiles.length} unchanged`)
}

if (beforeDir && afterDir) {
  const rb = load(resolve(beforeDir, 'report.json')), ra = load(resolve(afterDir, 'report.json'))
  console.log(`\nOverview per viewport (sorted number tokens, before -> after):`)
  for (const [vp, b] of Object.entries(rb.viewports)) {
    const a = ra.viewports[vp]
    if (!a || a.error || b.error) { fail(`${vp}: capture error`); continue }
    const d = diff(b.numbers, a.numbers)
    const status = d.length === 0 ? 'identical' : 'differs'
    console.log(`  ${vp.padEnd(32)} ${String(b.numbers.length).padStart(5)} -> ${String(a.numbers.length).padStart(5)}  ${status}  clipped ${b.clipped?.count ?? '?'} -> ${a.clipped?.count ?? '?'}${d.length ? '\n      ' + summarise(d) : ''}`)
  }
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed')
process.exit(failures ? 1 : 0)

// Multiset difference: "-x" only in before, "+x" only in after.
function diff(b, a) {
  const count = arr => arr.reduce((m, t) => m.set(t, (m.get(t) || 0) + 1), new Map())
  const cb = count(b), ca = count(a), out = []
  for (const [t, n] of cb) for (let i = 0; i < n - (ca.get(t) || 0); i++) out.push('-' + t)
  for (const [t, n] of ca) for (let i = 0; i < n - (cb.get(t) || 0); i++) out.push('+' + t)
  return out
}
function summarise(d) {
  const minus = d.filter(x => x[0] === '-'), plus = d.filter(x => x[0] === '+')
  return `only before (${minus.length}): ${minus.slice(0, 10).join(' ')}${minus.length > 10 ? ' …' : ''}\n      only after  (${plus.length}): ${plus.slice(0, 14).join(' ')}${plus.length > 14 ? ' …' : ''}`
}
