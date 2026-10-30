#!/usr/bin/env node
// Live parity: for each case, the OLD single unphased /api/bq response vs the NEW staged result
// (fast + sales_detail + pnl_detail + ads_detail, each a separate live BigQuery run, merged with the
// frontend's own mergePhase). Every field is compared; differences within BigQuery's run-to-run
// noise are tolerated but still listed:
//   numbers: |old − new| ≤ 1 when |old| ≥ 100 (large summed values), else ≤ 0.01 (rates / averages)
//   arrays:  compared by position; if that fails, by a sort on each row's non-numeric fields
//            (BigQuery returns ties in any order)
// Usage: SA_KEY_PATH=... node --max-old-space-size=12000 scripts/staged-loading/live-parity.mjs --cases cases.json --out result.json
import { readFileSync, writeFileSync } from 'fs'
import { loadKeyIntoEnv, importInstrumentedHandler, callHandler, quiet, toUnits } from './_harness.mjs'
import { mergePhase } from '../../src/bqPhaseMerge.js'

const args = process.argv.slice(2)
const arg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d }
const CASES = JSON.parse(readFileSync(arg('--cases', 'scripts/staged-loading/parity-cases.json'), 'utf8'))
const OLD_SRC = arg('--old') // optional: a saved copy of the pre-change api/bq.js for the "old" side
loadKeyIntoEnv()
globalThis.__NO_CACHE = true
const newHandler = await importInstrumentedHandler()
const oldHandler = OLD_SRC ? await importInstrumentedHandler(OLD_SRC) : newHandler

const tol = (a, b) => Math.abs(a - b) <= (Math.abs(a) >= 100 ? 1 : 0.01)
const sig = v => (v && typeof v === 'object') ? JSON.stringify(Object.entries(v).filter(([, x]) => typeof x !== 'number' && typeof x !== 'object').sort()) : String(v)
function cmp(path, a, b, out) {
  if (typeof a === 'number' && typeof b === 'number') {
    if (a === b || (Number.isNaN(a) && Number.isNaN(b))) return
    out.push({ path, old: a, new: b, tolerated: tol(a, b) })
    return
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) { out.push({ path, old: `len ${a.length}`, new: `len ${b.length}`, tolerated: false }); return }
    const pos = []
    a.forEach((x, i) => cmp(`${path}[${i}]`, x, b[i], pos))
    if (pos.every(d => d.tolerated)) { out.push(...pos); return }
    const sa = [...a].sort((x, y) => sig(x).localeCompare(sig(y))), sb = [...b].sort((x, y) => sig(x).localeCompare(sig(y)))
    const srt = []
    sa.forEach((x, i) => cmp(`${path}[sorted ${i}]`, x, sb[i], srt))
    out.push(...(srt.filter(d => !d.tolerated).length <= pos.filter(d => !d.tolerated).length ? srt : pos))
    return
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in a) || !(k in b)) { out.push({ path: `${path}.${k}`, old: k in a ? 'present' : 'MISSING', new: k in b ? 'present' : 'MISSING', tolerated: false }); continue }
      cmp(`${path}.${k}`, a[k], b[k], out)
    }
    return
  }
  if (a !== b) out.push({ path, old: a, new: b, tolerated: false })
}

const results = []
for (const c of CASES) {
  const body = { channel: '__parity', ...c.body }
  const t0 = Date.now()
  const full = await quiet(() => callHandler(oldHandler, { ...body }))
  const tFull = Date.now() - t0
  let merged = null, phaseMs = {}, crash = null
  for (const p of ['fast', 'sales_detail', 'pnl_detail', 'ads_detail']) {
    const t1 = Date.now()
    const r = await quiet(() => callHandler(newHandler, { ...body, phase: p }))
    phaseMs[p] = Date.now() - t1
    if (r.status !== 200) { crash = `${p}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`; break }
    merged = mergePhase(merged, r.body)
  }
  if (full.status !== 200 || crash) {
    results.push({ label: c.label, pass: false, error: crash || `full ${full.status}` })
    console.log(`${c.label}: ERROR ${crash || full.status}`)
    continue
  }
  const fu = toUnits(full.body), mu = toUnits(merged)
  // shopify.dailySkuCostRows is intentionally removed (decision 2): an "old" side that still has it is not a diff
  fu.delete('shopify.dailySkuCostRows')
  const diffs = []
  for (const k of new Set([...fu.keys(), ...mu.keys()])) {
    if (!fu.has(k) || !mu.has(k)) { diffs.push({ path: k, old: fu.has(k) ? 'present' : 'MISSING', new: mu.has(k) ? 'present' : 'MISSING', tolerated: false }); continue }
    cmp(k, fu.get(k), mu.get(k), diffs)
  }
  const hard = diffs.filter(d => !d.tolerated)
  results.push({ label: c.label, body: c.body, pass: hard.length === 0, fields: fu.size, diffs, fullMs: tFull, phaseMs })
  console.log(`${c.label}: ${hard.length === 0 ? 'PASS' : 'FAIL'} — ${fu.size} fields, ${diffs.length} diffs (${hard.length} beyond tolerance) · full ${tFull}ms, phases ${JSON.stringify(phaseMs)}`)
  for (const d of hard.slice(0, 15)) console.log(`    ✗ ${d.path}: old=${JSON.stringify(d.old)} new=${JSON.stringify(d.new)}`)
}
writeFileSync(arg('--out', 'live-parity.json'), JSON.stringify(results, null, 1))
console.log(results.every(r => r.pass) ? 'ALL PASS' : 'SOME FAILED')
