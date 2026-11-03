#!/usr/bin/env node
// Deterministic phase check for the P&L reductions (PNL_REDUCTIONS_PLAN.md §5, layer 1). Per case,
// one full (no-phase) run against real BigQuery is recorded; every phase is then replayed on the SAME
// rows, so any difference is this change's fault, never BigQuery noise.
//   1. every phase returns 200, and every field it owns === the full response's field
//   2. fast + sales_detail + pnl_detail + ads_detail merged (frontend rule) == full, except the
//      REDUCED_ONLY row arrays, which no phase ships any more
//   3. resolvedAgg / resolvedAggDetail still exact (staged-loading agg-check)
//   4. pnl_detail's pnlAgg / pnlTrend === the original PnLPage row expressions (payload-check.mjs)
//   5. pnl_margin's pnlAgg (shopify, amzSC, flipkart) === the same, and === pnl_detail's
// Usage: SA_KEY_PATH=... node scripts/pnl-reductions/replay.mjs [--cases file.json] [--only label,label]
import { readFileSync } from 'fs'
import { loadKeyIntoEnv, importBQClient, importInstrumentedHandler, recordReplay, callHandler, quiet, toUnits } from '../staged-loading/_harness.mjs'
import { checkAggs, checkAggDetails, checkFrontendEquivalence, isAggUnit } from '../staged-loading/agg-check.mjs'
import { mergePhase } from '../../src/bqPhaseMerge.js'
import { checkPnlPayload } from './payload-check.mjs'

const args = process.argv.slice(2)
const arg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d }
let CASES = JSON.parse(readFileSync(arg('--cases', new URL('../staged-loading/parity-cases.json', import.meta.url)), 'utf8'))
if (arg('--only')) CASES = CASES.filter(c => arg('--only').split(',').includes(c.label))

const REDUCED_ONLY = new Set(readFileSync(new URL('../../api/_bqPhases.js', import.meta.url), 'utf8')
  .match(/const REDUCED_ONLY = \[([\s\S]*?)\]/)[1].match(/'[^']+'/g).map(s => s.slice(1, -1)))
const isPnlUnit = k => k.endsWith('.pnlAgg') || k.endsWith('.pnlTrend')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

loadKeyIntoEnv()
const { getBQ } = await importBQClient()
const handler = await importInstrumentedHandler()
globalThis.__NO_CACHE = true
const rr = recordReplay(getBQ())
const PH = ['fast', 'sales_detail', 'pnl_detail', 'pnl_margin', 'ads_detail']
let fails = 0
for (const c0 of CASES) {
  const c = { ...c0, body: { channel: '__parity', ...c0.body } }
  rr.store.clear(); rr.setReplayOnly(false)
  const t0 = Date.now()
  const full = await quiet(() => callHandler(handler, { ...c.body }))
  if (full.status !== 200) { console.log(`${c.label}: full status ${full.status}`); fails++; continue }
  rr.setReplayOnly(true)
  const fullU = toUnits(full.body)
  const bodies = {}, per = [], sizes = {}
  let merged = null
  for (const p of PH) {
    let r
    try { r = await quiet(() => callHandler(handler, { ...c.body, phase: p })) } catch (e) { r = { status: 'THROW ' + e.message } }
    if (r.status !== 200) { per.push(`${p}:CRASH(${r.status})`); fails++; continue }
    bodies[p] = r.body
    sizes[p] = (JSON.stringify(r.body).length / 1e6).toFixed(1)
    if (p !== 'pnl_margin') merged = mergePhase(merged, r.body)
    const bad = []
    for (const [k, v] of toUnits(r.body)) {
      if (isAggUnit(k) || isPnlUnit(k)) continue
      if (REDUCED_ONLY.has(k) && !(p === 'fast' && same(v, []))) { bad.push(`${k}(reduced field shipped)`); continue }
      const placeholder = p === 'fast' && !same(v, fullU.get(k)) && ['[]', '{}', '0', 'null', '""', 'false'].includes(JSON.stringify(v))
      if (!placeholder && !same(v, fullU.get(k))) bad.push(k)
    }
    per.push(`${p}:${sizes[p]}MB${bad.length ? ' WRONG[' + bad.slice(0, 6).join(',') + ']' : ''}`)
    if (bad.length) fails++
  }
  // 2. merged == full, except the reduced row arrays (fast's [] placeholder) — those must be the placeholder
  const mu = toUnits(merged)
  const diffs = []
  for (const k of new Set([...fullU.keys(), ...mu.keys()])) {
    if (isAggUnit(k) || isPnlUnit(k)) continue
    if (REDUCED_ONLY.has(k)) { if (!same(mu.get(k), [])) diffs.push(`${k}(not placeholder)`); continue }
    if (!same(fullU.get(k), mu.get(k))) diffs.push(k)
  }
  if (diffs.length) fails++
  // 3. staged-loading reductions
  const agg = checkAggs(bodies.fast, full.body)
  agg.problems.push(...checkAggDetails(bodies.sales_detail, full.body).problems, ...checkFrontendEquivalence(bodies.fast, bodies.sales_detail, full.body))
  if (agg.problems.length) fails++
  // 4 / 5. P&L reductions
  const pnlP = checkPnlPayload(full.body, bodies.pnl_detail)
  const marP = checkPnlPayload(full.body, bodies.pnl_margin, ['shopify', 'amzSC', 'flipkart'])
  for (const ch of ['shopify', 'amzSC', 'flipkart']) if (!same(bodies.pnl_margin?.[ch]?.pnlAgg, bodies.pnl_detail?.[ch]?.pnlAgg)) marP.push(`${ch}.pnlAgg differs between pnl_margin and pnl_detail`)
  if (pnlP.length) fails++
  if (marP.length) fails++
  console.log(`${c.label} (${((Date.now() - t0) / 1000).toFixed(0)}s): full ${(JSON.stringify(full.body).length / 1e6).toFixed(1)}MB  ${per.join('  ')}`)
  console.log(`   merged vs full: ${diffs.length ? 'DIFF ' + diffs.slice(0, 8).join(',') : `IDENTICAL (${fullU.size} fields; ${REDUCED_ONLY.size} reduced row arrays = placeholder)`}` +
    `  | resolvedAgg: ${agg.problems.length ? 'FAIL ' + agg.problems.slice(0, 3).join('; ') : 'exact'}` +
    `  | pnl_detail pnlAgg/pnlTrend: ${pnlP.length ? 'FAIL ' + pnlP.slice(0, 3).join('; ') : 'exact'}` +
    `  | pnl_margin: ${marP.length ? 'FAIL ' + marP.slice(0, 3).join('; ') : 'exact'}`)
}
console.log(fails ? `FAILURES: ${fails}` : 'ALL PASS')
process.exit(fails ? 1 : 0)
