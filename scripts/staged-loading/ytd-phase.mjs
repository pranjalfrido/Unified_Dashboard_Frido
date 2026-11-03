#!/usr/bin/env node
// One api/bq.js request (the real, unmodified handler) in its own process — run it under
// `node --max-old-space-size=1024` to mirror Vercel's 1024MB function. Prints one JSON line:
// { phase, status, ms, bytes, peakRssMB }. peakRssMB = process.resourceUsage().maxRSS (OS-reported).
// Usage: SA_KEY_PATH=... node --max-old-space-size=1024 scripts/staged-loading/ytd-phase.mjs <phase|full> [start] [end]
import { loadKeyIntoEnv, importHandler, callHandler, quiet } from './_harness.mjs'

const [phase = 'fast', start = '2026-04-01', end = '2026-10-30'] = process.argv.slice(2)
loadKeyIntoEnv()
const handler = await importHandler()
const t0 = Date.now()
// channel only feeds the cache key and suppresses the post-response MyFrido/Mobility pre-warm,
// which would otherwise keep running (and allocating) after the measured request
const body = { start, end, channel: '__measure', ...(phase === 'full' ? {} : { phase }) }
const r = await quiet(() => callHandler(handler, body))
const ms = Date.now() - t0
const bytes = r.status === 200 ? Buffer.byteLength(JSON.stringify(r.body)) : 0
console.log(JSON.stringify({ phase, start, end, status: r.status, ms, bytes, MB: +(bytes / 1048576).toFixed(1), peakRssMB: Math.round(process.resourceUsage().maxRSS / 1024), error: r.status === 200 ? undefined : JSON.stringify(r.body).slice(0, 200) }))
process.exit(0)
