#!/usr/bin/env node
// One /api/bq request in its own process, old (origin/main) or new (this branch) code — for the
// before/after table in PNL_REDUCTIONS_PLAN.md / the report. Prints one JSON line:
// { api, phase, start, end, status, ms, MB, gzipMB, peakRssMB }   peakRssMB = OS-reported max RSS.
// Run under `node --max-old-space-size=<MB>` to mirror a function's memory.
// Usage: SA_KEY_PATH=... node scripts/pnl-reductions/measure.mjs <old|new> <phase|full> <start> <end>
import { existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { execSync } from 'child_process'
import { gzipSync } from 'zlib'
import { loadKeyIntoEnv, callHandler, quiet } from '../staged-loading/_harness.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const [api = 'new', phase = 'fast', start = '2026-04-01', end = '2026-11-02'] = process.argv.slice(2)
let apiDir = join(ROOT, 'api')
if (api === 'old') {
  // origin/main's api/, inside the repo tree so its imports resolve node_modules
  const old = join(HERE, 'harness', '.parity-old')
  if (!existsSync(join(old, 'api', 'bq.js'))) {
    mkdirSync(old, { recursive: true })
    const base = execSync('git merge-base HEAD origin/main', { cwd: ROOT }).toString().trim()
    execSync(`git archive --format=tar ${base} src api | tar -x -C "${old}"`, { cwd: ROOT })
  }
  apiDir = join(old, 'api')
}
loadKeyIntoEnv()
const handler = (await import(pathToFileURL(join(apiDir, 'bq.js')).href)).default
const t0 = Date.now()
// channel only feeds the cache key and suppresses the post-response MyFrido/Mobility pre-warm
const body = { start, end, channel: '__measure', ...(phase === 'full' ? {} : { phase }) }
const r = await quiet(() => callHandler(handler, body))
const ms = Date.now() - t0
// The function serialises the response (res.json); compression happens outside it, so peak RSS is
// read before the gzip size (for the transfer estimate) is computed.
const json = r.status === 200 ? JSON.stringify(r.body) : ''
const msWithJson = Date.now() - t0
const peakRssMB = Math.round(process.resourceUsage().maxRSS / 1024)
const MB = +(Buffer.byteLength(json) / 1048576).toFixed(1)
const gzipMB = json ? +(gzipSync(json, { level: 6 }).length / 1048576).toFixed(2) : 0
console.log(JSON.stringify({ api, phase, start, end, status: r.status, ms, msWithJson, MB, gzipMB, peakRssMB, error: r.status === 200 ? undefined : JSON.stringify(r.body).slice(0, 200) }))
process.exit(0)
