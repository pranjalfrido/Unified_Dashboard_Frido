// Cost of the mobile Overview's previous-period ▲/▼: the three extra requests (sales /api/bq,
// /api/logistics, /api/customer) for the previous equal-length range, for three common ranges.
//   time   - wall time of each extra request against the local API server (run it > 5 min after
//            those ranges were last requested, so /api/bq's in-memory cache is cold)
//   bytes  - from BigQuery's own job log (INFORMATION_SCHEMA.JOBS_BY_USER, this service account):
//            billed during the run (0 when BigQuery's 24h result cache answered), and the bytes the
//            same query text processed on its first uncached run (= the cost of a first visit)
// Usage: node scripts/responsive/measure-prev-cost.mjs
import { BigQuery } from '@google-cloud/bigquery'
import { resolve } from 'path'
import { repoRoot } from './lib.mjs'

const API = 'http://localhost:3001'
const LOCATION = 'asia-south1'
const bq = new BigQuery({ keyFilename: resolve(repoRoot, 'sa_key.json'), projectId: 'frido-429506' })

const iso = d => d.toISOString().slice(0, 10)
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
// Same rule as src/overview/usePrevPeriod.js prevRange() / api/bq.js prevRev.
const prevRange = (s, e) => { const days = (new Date(e) - new Date(s)) / 86400000 + 1; return { start: addDays(s, -days), end: addDays(s, -1) } }
// Same rule as utils.js getMaturityAdjustedRange (dates only).
const matured = (s, e, today) => { const boundary = addDays(today, -15); return e <= boundary ? { start: s, end: e } : { start: addDays(today, -45), end: boundary } }

const today = iso(new Date())
const y = new Date(); y.setDate(1)
const ranges = {
  'Last 7 days': { start: addDays(today, -6), end: today },
  'This month (MTD)': { start: `${today.slice(0, 8)}01`, end: addDays(today, -1) },
  'Last month': (() => { const s = new Date(Date.UTC(y.getFullYear(), y.getMonth() - 1, 1)), e = new Date(Date.UTC(y.getFullYear(), y.getMonth(), 0)); return { start: iso(s), end: iso(e) } })(),
}

const post = async (path, body) => {
  const t0 = performance.now()
  const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  await r.arrayBuffer()
  return { status: r.status, ms: Math.round(performance.now() - t0) }
}

const results = []
for (const [name, r] of Object.entries(ranges)) {
  const sp = prevRange(r.start, r.end)
  const lr = matured(r.start, r.end, today)
  const lp = prevRange(lr.start, lr.end)
  const tStart = new Date()
  const sales = await post('/api/bq', { start: sp.start, end: sp.end })
  const log = await post('/api/logistics', { start: lp.start, end: lp.end })
  const cust = await post('/api/customer', { start: sp.start, end: sp.end })
  const tEnd = new Date(Date.now() + 2000)
  results.push({ name, range: r, salesPrev: sp, logPrev: lp, sales, log, cust, tStart, tEnd })
  console.log(`${name.padEnd(18)} current ${r.start}→${r.end} | prev sales/customer ${sp.start}→${sp.end} | prev logistics ${lp.start}→${lp.end}`)
  console.log(`${''.padEnd(18)} /api/bq ${sales.status} ${sales.ms} ms · /api/logistics ${log.status} ${log.ms} ms · /api/customer ${cust.status} ${cust.ms} ms`)
}

// BigQuery's job log needs a moment to show the jobs.
await new Promise(r => setTimeout(r, 15000))
const lo = results[0].tStart.toISOString(), hi = new Date(Date.now()).toISOString()
try {
  const [jobs] = await bq.query({
    location: LOCATION, maximumBytesBilled: '2000000000',
    query: `
      WITH w AS (
        SELECT creation_time, cache_hit, total_bytes_processed, total_bytes_billed, query
        FROM \`region-asia-south1\`.INFORMATION_SCHEMA.JOBS_BY_USER
        WHERE creation_time BETWEEN TIMESTAMP('${lo}') AND TIMESTAMP('${hi}') AND job_type = 'QUERY' AND statement_type = 'SELECT'
          AND query NOT LIKE '%INFORMATION_SCHEMA%'
      ),
      first_uncached AS (
        SELECT query, MAX(total_bytes_processed) AS uncached_bytes
        FROM \`region-asia-south1\`.INFORMATION_SCHEMA.JOBS_BY_USER
        WHERE creation_time > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY) AND cache_hit = FALSE AND query IN (SELECT query FROM w)
        GROUP BY query
      )
      SELECT w.creation_time, w.cache_hit, w.total_bytes_billed, COALESCE(w.total_bytes_processed, 0) AS processed, f.uncached_bytes
      FROM w LEFT JOIN first_uncached f USING (query)`,
  })
  const GB = b => (Number(b || 0) / 1e9).toFixed(2)
  console.log('\nrange               BQ jobs  cache hits  billed in this run  bytes uncached (first visit)')
  for (const r of results) {
    const js = jobs.filter(j => { const t = new Date(j.creation_time.value); return t >= r.tStart && t <= r.tEnd })
    const billed = js.reduce((s, j) => s + Number(j.total_bytes_billed || 0), 0)
    const uncached = js.reduce((s, j) => s + Number(j.uncached_bytes ?? j.processed ?? 0), 0)
    console.log(`${r.name.padEnd(19)} ${String(js.length).padStart(7)}  ${String(js.filter(j => j.cache_hit).length).padStart(10)}  ${(GB(billed) + ' GB').padStart(18)}  ${(GB(uncached) + ' GB').padStart(27)}`)
  }
} catch (e) {
  console.log('job-log query failed:', e.message)
}
