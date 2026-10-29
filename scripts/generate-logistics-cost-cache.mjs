// Runs in GitHub Actions — calls /api/logistics-cost with NO filters and writes
// public/logistics-cost-data.json for CDN delivery.
// Frontend uses this on first load (no filters set); falls back to live API when filters are active.

import { writeFileSync } from 'fs'
import { createServer } from 'http'
// In CI the env comes from repository secrets; locally it comes from .env. Without this
// the script died with "SUPABASE_URL not configured" when run by hand, which is exactly
// when you want to regenerate the cache after an upload.
import { config } from 'dotenv'
config()

// The unfiltered build runs the endpoint's full-ledger B2C queries (lanes, like-for-like,
// rate drift, product). On the transaction pooler (port 6543) every statement is killed at a
// hard 120 s regardless of the statement_timeout the handler asks for, and with the ledger
// past 17 lakh rows those queries now exceed it — the cache silently stopped regenerating
// from 27 Oct. Use the session connection instead (SUPABASE_DB_URL, else the same pooler
// host on 5432), where the handler's 600 s statement_timeout applies. Same rule as
// scripts/refresh-lc-cube-only.mjs. This only affects this script; the deployed API is unchanged.
const sessionUrl = process.env.SUPABASE_DB_URL || (process.env.SUPABASE_URL || '').replace(':6543/', ':5432/')
if (sessionUrl) {
  process.env.SUPABASE_URL = sessionUrl
  // The pooler drops the URL's statement_timeout option; ask the handler's pool to SET it on
  // each session connection instead (see getCostPool in api/logistics-cost.js).
  process.env.LC_SESSION_STATEMENT_TIMEOUT = '1'
}

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

try {
  await handler(fakeReq, fakeRes)
} catch (e) {
  // exit(0) is deliberate — a stale-but-valid JSON beats no dashboard. But the failure must
  // still SHOW: ::error:: surfaces it in the GitHub Actions UI instead of scrolling past in
  // a log nobody reads.
  console.warn(`⚠️  logistics-cost handler threw: ${e.message} — keeping last good JSON, workflow continues`)
  console.log(`::error title=logistics-cost cache not regenerated::${e.message}`)
  process.exit(0)
}

if (responseStatus !== 200 || !responseBody) {
  console.warn(`⚠️  logistics-cost handler returned status ${responseStatus}: ${JSON.stringify(responseBody)} — keeping last good JSON, workflow continues`)
  console.log(`::error title=logistics-cost cache not regenerated::handler returned status ${responseStatus}`)
  process.exit(0)
}

// Add a timestamp so the frontend can check freshness
responseBody.asOf = new Date().toISOString()

const json = JSON.stringify(responseBody)
writeFileSync('public/logistics-cost-data.json', json)
console.log(`Written public/logistics-cost-data.json — ${(json.length / 1024).toFixed(0)} KB in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
process.exit(0)
