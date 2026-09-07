// Runs in GitHub Actions daily — calls the api/bq.js handler directly (same code as production)
// for MTD dates (no filters), saves the result to public/pnl-data.json for CDN delivery.
// The frontend serves this instantly instead of waiting 8-10s for live BigQuery.

import { writeFileSync } from 'fs'
import handler from '../api/bq.js'

// MTD: 1st of current month → yesterday
const endD = new Date()
endD.setDate(endD.getDate() - 1)
const startD = new Date(endD.getFullYear(), endD.getMonth(), 1)

const start = startD.toISOString().slice(0, 10)
const end = endD.toISOString().slice(0, 10)

console.log(`Generating P&L cache: ${start} → ${end} (MTD, no filters)`)

// Fake req/res so we can call the Vercel handler directly
const req = {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: { start, end },
}

let resolve, reject
const promise = new Promise((res, rej) => { resolve = res; reject = rej })

let statusCode = 200
const headers = {}
const res = {
  setHeader(k, v) { headers[k] = v },
  status(code) { statusCode = code; return this },
  end() { reject(new Error(`Handler ended with status ${statusCode}`)) },
  json(data) {
    if (statusCode >= 400) {
      reject(new Error(`Handler returned status ${statusCode}: ${JSON.stringify(data)}`))
    } else {
      resolve(data)
    }
  },
}

try {
  await handler(req, res)
  const payload = await promise

  const out = {
    asOf: new Date().toISOString(),
    mtdStart: start,
    mtdEnd: end,
    ...payload,
  }

  writeFileSync('public/pnl-data.json', JSON.stringify(out))
  const sizeMB = (JSON.stringify(out).length / 1024 / 1024).toFixed(1)
  console.log(`✓ Written public/pnl-data.json (${sizeMB} MB)`)
  console.log(`  MTD window: ${start} → ${end}`)
} catch (e) {
  console.error('✗ P&L cache generation failed:', e.message)
  process.exit(1)
}
