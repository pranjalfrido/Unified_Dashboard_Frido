// Runs in GitHub Actions daily — calls the api/bq.js handler directly (same code as production)
// for MTD and Last Month dates (no filters), saves results to public/ for CDN delivery.
// The frontend serves these instantly instead of waiting 20-40s for live BigQuery.

import { writeFileSync } from 'fs'
import handler from '../api/bq.js'

async function generate(start, end, outFile, label) {
  console.log(`Generating P&L cache: ${start} → ${end} (${label})`)

  const req = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { start, end },
  }

  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })

  let statusCode = 200
  const res = {
    setHeader() {},
    status(code) { statusCode = code; return this },
    end() { reject(new Error(`Handler ended with status ${statusCode}`)) },
    json(data) {
      if (statusCode >= 400) reject(new Error(`Handler returned status ${statusCode}: ${JSON.stringify(data)}`))
      else resolve(data)
    },
  }

  await handler(req, res)
  const payload = await promise

  const out = {
    asOf: new Date().toISOString(),
    mtdStart: start,
    mtdEnd: end,
    ...payload,
  }

  writeFileSync(outFile, JSON.stringify(out))
  const sizeMB = (JSON.stringify(out).length / 1024 / 1024).toFixed(1)
  console.log(`✓ Written ${outFile} (${sizeMB} MB) — ${start} → ${end}`)
}

// MTD: 1st of current month → yesterday
const today = new Date()
const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
const mtdStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), 1).toISOString().slice(0, 10)
const mtdEnd = yesterday.toISOString().slice(0, 10)

// Last Month: 1st → last day of previous calendar month
const lastMonthEnd = new Date(yesterday.getFullYear(), yesterday.getMonth(), 0)
const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1)
const lmStart = lastMonthStart.toISOString().slice(0, 10)
const lmEnd = lastMonthEnd.toISOString().slice(0, 10)

try {
  await generate(mtdStart, mtdEnd, 'public/pnl-data.json', 'MTD')
} catch (e) {
  console.error('✗ MTD P&L cache failed:', e.message)
  process.exit(1)
}

try {
  await generate(lmStart, lmEnd, 'public/pnl-data-lastmonth.json', 'Last Month')
} catch (e) {
  console.error('✗ Last Month P&L cache failed:', e.message)
  process.exit(1)
}
