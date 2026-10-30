#!/usr/bin/env node
// Deterministic phase-split check: one full (no-phase) run against real BigQuery is recorded, then
// every phase is replayed against the SAME recorded rows, so any difference is the phase split's
// fault, never BigQuery noise. Checks, per scenario:
//   1. each phase alone returns 200 (no crash)
//   2. every field a phase owns equals the full response's field exactly
//   3. fast + sales_detail + pnl_detail + ads_detail merged (frontend merge rule) == full, exactly
// Usage: SA_KEY_PATH=... node scripts/staged-loading/replay-parity.mjs [--cases cases.json]
import { readFileSync } from 'fs'
import { loadKeyIntoEnv, importBQClient, importInstrumentedHandler, recordReplay, callHandler, quiet, toUnits } from './_harness.mjs'
import { mergePhase } from '../../src/bqPhaseMerge.js'
import { checkAggs, checkAggDetails, checkFrontendEquivalence, isAggUnit } from './agg-check.mjs'

const args = process.argv.slice(2)
const arg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d }
const CASES = arg('--cases') ? JSON.parse(readFileSync(arg('--cases'), 'utf8')) : [
  { label: 'sep_nofilter', body: { start: '2026-09-01', end: '2026-09-30' } },
]
loadKeyIntoEnv()
const { getBQ } = await importBQClient()
// The analysis copy of api/bq.js with only the response cache switched off (globalThis.__NO_CACHE)
// so cases don't pile up in memory; query selection is the real phase logic (no __KO set).
const handler = await importInstrumentedHandler()
globalThis.__NO_CACHE = true
const rr = recordReplay(getBQ())
const PH = ['fast', 'sales_detail', 'pnl_detail', 'ads_detail']
let fails = 0
for (const c0 of CASES) {
  // channel only feeds the cache key and suppresses the background MyFrido/Mobility pre-warm
  const c = { ...c0, body: { channel: '__parity', ...c0.body } }
  rr.store.clear()
  rr.setReplayOnly(false)
  const full = await quiet(() => callHandler(handler, { ...c.body }))
  if (full.status !== 200) { console.log(`${c.label}: full status ${full.status}`); fails++; continue }
  rr.setReplayOnly(true)
  const fullU = toUnits(full.body)
  let merged = null, fastBody = null, salesBody = null
  const per = []
  for (const p of PH) {
    let r
    try { r = await quiet(() => callHandler(handler, { ...c.body, phase: p })) } catch (e) { r = { status: 'THROW ' + e.message } }
    if (r.status !== 200) { per.push(`${p}:CRASH(${r.status} ${JSON.stringify(r.body || '').slice(0, 150)})`); fails++; continue }
    merged = merged ? mergePhase(merged, r.body) : mergePhase(null, r.body)
    if (p === 'fast') fastBody = r.body
    if (p === 'sales_detail') salesBody = r.body
    // fields this phase owns (fast: those not emptied) must equal full exactly
    const pu = toUnits(r.body)
    let bad = []
    for (const [k, v] of pu) {
      if (isAggUnit(k)) continue
      const isPlaceholder = p === 'fast' && JSON.stringify(v) !== JSON.stringify(fullU.get(k)) && ['[]', '{}', '0', 'null', '""', 'false'].includes(JSON.stringify(v))
      if (isPlaceholder) continue
      if (JSON.stringify(v) !== JSON.stringify(fullU.get(k))) bad.push(k)
    }
    per.push(`${p}:${pu.size}f${bad.length ? ' WRONG[' + bad.join(',') + ']' : ''}`)
    if (bad.length) fails++
  }
  const mu = toUnits(merged)
  const diffs = []
  for (const k of new Set([...fullU.keys(), ...mu.keys()])) if (!isAggUnit(k) && JSON.stringify(fullU.get(k)) !== JSON.stringify(mu.get(k))) diffs.push(k)
  if (diffs.length) fails++
  const agg = fastBody ? checkAggs(fastBody, full.body) : { channels: 0, problems: ['no fast'] }
  const aggD = checkAggDetails(salesBody, full.body)
  agg.problems.push(...aggD.problems)
  if (fastBody && salesBody) agg.problems.push(...checkFrontendEquivalence(fastBody, salesBody, full.body))
  if (agg.problems.length) fails++
  per.push(`resolvedAgg: ${agg.problems.length ? 'FAIL ' + agg.problems.join('; ') : 'OK (' + agg.channels + ' channels: fast totals + sales_detail per-SKU/sub-channel/category sums exact, Overview Return % identical)'}`)
  console.log(`${c.label}: ${per.join('  ')}  | merged vs full: ${diffs.length ? 'DIFF ' + diffs.join(',') : 'IDENTICAL (' + fullU.size + ' fields)'}`)
}
console.log(fails ? `FAILURES: ${fails}` : 'ALL PASS')
process.exit(fails ? 1 : 0)
