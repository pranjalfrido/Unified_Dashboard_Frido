#!/usr/bin/env node
// Per-query rows / in-memory JSON bytes / BigQuery ms for one api/bq.js request (full, unphased).
// Usage: SA_KEY_PATH=... node --max-old-space-size=8000 scripts/staged-loading/query-profile.mjs --start 2026-04-01 --end 2026-10-30 [--src file] --out profile.json
import { writeFileSync } from 'fs'
import { loadKeyIntoEnv, importInstrumentedHandler, callHandler } from './_harness.mjs'

const args = process.argv.slice(2)
const arg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d }
loadKeyIntoEnv()
const handler = await importInstrumentedHandler(arg('--src', undefined))
globalThis.__NO_CACHE = true
let sizes = []
globalThis.__ONRESULTS = results => { sizes = results.map(({ key, rows }) => ({ key, rows: rows.length, bytes: JSON.stringify(rows).length })) }
let timing = null
const log = console.log
console.log = (...a) => { const s = String(a[0] || ''); if (s.startsWith('[timing]')) timing = JSON.parse(s.slice(9)); }
const t0 = Date.now()
const r = await callHandler(handler, { start: arg('--start', '2026-04-01'), end: arg('--end', '2026-10-30'), phase: '__profile' })
console.log = log
const ms = Object.fromEntries((timing?.queries || []).map(q => [q.key, q.ms]))
const rows = sizes.map(s => ({ ...s, ms: ms[s.key] ?? null })).sort((a, b) => b.bytes - a.bytes)
writeFileSync(arg('--out', 'profile.json'), JSON.stringify({ status: r.status, totalMs: Date.now() - t0, rows }, null, 1))
console.log(`status ${r.status}, ${((Date.now() - t0) / 1000).toFixed(1)}s, ${rows.length} queries`)
