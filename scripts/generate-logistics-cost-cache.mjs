// Runs in GitHub Actions — calls /api/logistics-cost with NO filters and writes
// public/logistics-cost-data.json for CDN delivery.
// Frontend uses this on first load (no filters set); falls back to live API when filters are active.

import { writeFileSync } from 'fs'
import { createServer } from 'http'

// Import the handler directly to avoid needing an HTTP server
// This runs the exact same code path as the API, using the same SUPABASE_URL env var.
const { default: handler } = await import('../api/logistics-cost.js')

console.log('Generating logistics-cost-data.json …')
const t0 = Date.now()

// Simulate a minimal req/res to call the handler with no filters
let responseBody = null
let responseStatus = 200

const fakeReq = {
  method: 'POST',
  body: {},  // No filters = default view
}

const fakeRes = {
  status(code) { responseStatus = code; return this },
  json(body) { responseBody = body; return this },
}

await handler(fakeReq, fakeRes)

if (responseStatus !== 200 || !responseBody) {
  throw new Error(`Handler returned status ${responseStatus}: ${JSON.stringify(responseBody)}`)
}

// Add a timestamp so the frontend can check freshness
responseBody.asOf = new Date().toISOString()

const json = JSON.stringify(responseBody)
writeFileSync('public/logistics-cost-data.json', json)
console.log(`Written public/logistics-cost-data.json — ${(json.length / 1024).toFixed(0)} KB in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
process.exit(0)
