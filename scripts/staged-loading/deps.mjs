#!/usr/bin/env node
// Query → response-field dependency map for api/bq.js, measured, not guessed.
//
// 1. Runs the full (unphased) handler once against real BigQuery, recording every query's rows.
// 2. Replays it from the recording (twice — any unit that differs between two identical replays is
//    reported as volatile and excluded).
// 3. For every query key, replays with ONLY that query skipped (exactly what a phase that doesn't
//    run it sees: api/bq.js fills skipped keys with []) and records which response units changed.
//
// Output: JSON { units: { "<unit>": ["queryKey", ...] }, queryKeys: [...], volatile: [...] }
// Usage: SA_KEY_PATH=... node scripts/staged-loading/deps.mjs --start 2026-09-01 --end 2026-09-30 [--body '{"subChannel":"ShopifyIndia"}'] --out deps.json
import { writeFileSync } from 'fs'
import { loadKeyIntoEnv, importBQClient, importInstrumentedHandler, recordReplay, callHandler, quiet, toUnits } from './_harness.mjs'

const args = process.argv.slice(2)
const arg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d }
const start = arg('--start', '2026-09-01'), end = arg('--end', '2026-09-30')
const extra = JSON.parse(arg('--body', '{}'))
const out = arg('--out', 'deps.json')
const only = arg('--only', null) // comma list of query keys to test (default: all)

loadKeyIntoEnv()
const { getBQ } = await importBQClient()
const handler = await importInstrumentedHandler(arg('--src', undefined))
const rr = recordReplay(getBQ())
globalThis.__NO_CACHE = true

let n = 0
const run = async (ko) => {
  globalThis.__KO = ko
  // unique phase string → unique server cache key, and (being an unrecognised phase) the full path
  const r = await quiet(() => callHandler(handler, { start, end, ...extra, phase: `__analysis_${n++}` }))
  if (r.status !== 200) throw new Error(`status ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`)
  const u = toUnits(r.body)
  const s = new Map(); for (const [k, v] of u) s.set(k, JSON.stringify(v) ?? 'undefined')
  return s
}

const t0 = Date.now()
await run(null)
console.log(`recorded ${rr.store.size} distinct SQL texts in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
rr.setReplayOnly(true)
const base = await run(null)
const base2 = await run(null)
const volatile = [...base.keys()].filter(k => base.get(k) !== base2.get(k))
console.log(`units: ${base.size}, volatile: ${volatile.join(', ') || 'none'}`)
const queryKeys = globalThis.__QKEYS
const deps = {}
for (const u of base.keys()) deps[u] = []
const test = only ? only.split(',') : queryKeys
let i = 0
for (const q of test) {
  const t = Date.now()
  let s
  try { s = await run(new Set([q])) } catch (e) { console.log(`  ${q}: CRASH ${e.message.slice(0, 200)}`); deps.__crash = (deps.__crash || []).concat(q); continue }
  const changed = []
  for (const k of new Set([...base.keys(), ...s.keys()])) {
    if (volatile.includes(k)) continue
    if (base.get(k) !== s.get(k)) { changed.push(k); (deps[k] ||= []).push(q) }
  }
  i++
  if (i % 20 === 0 || process.env.VERBOSE) console.log(`  [${i}/${test.length}] ${q} -> ${changed.length} units (${Date.now() - t}ms)`)
}
writeFileSync(out, JSON.stringify({ start, end, extra, queryKeys, volatile, units: deps }, null, 1))
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${out}`)
