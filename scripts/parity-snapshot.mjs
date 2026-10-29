#!/usr/bin/env node
// Parity snapshot harness — calls every data-bearing api/*.js endpoint (via the local HTTP
// server started from _local-api-server.mjs, which invokes the handler functions directly, no
// vercel dev needed) with a fixed set of payloads, and saves each JSON response under
// parity/<out>/<endpoint>__<payload-label>.json. Used before/after each perf-optimization commit
// to prove byte-for-byte-equivalent numeric output (see task constraints: no SQL/filter/aggregation
// logic may change, only caching/concurrency/file-org/bundling/instrumentation).
//
// Usage: node scripts/parity-snapshot.mjs [--out <dir>] [--base http://localhost:3000]
// Requires: the local API server already running (node _local-api-server.mjs) with sa_key.json
// present at repo root so api/_bq.js can reach BigQuery.

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const args = process.argv.slice(2)
function argVal(flag, def) {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const OUT_DIR = argVal('--out', 'parity/after')
const BASE = argVal('--base', 'http://localhost:3000')

mkdirSync(OUT_DIR, { recursive: true })

// Fixed, PAST, CLOSED calendar-month ranges relative to "today" 2026-10-29 — never the
// in-progress month (October 2026).
const LAST_FULL_MONTH = { start: '2026-09-01', end: '2026-09-30', label: 'sep2026' }
const MONTH_BEFORE    = { start: '2026-08-01', end: '2026-08-31', label: 'aug2026' }

// Filter variants layered onto LAST_FULL_MONTH only (per spec: "3 filtered variants of the
// last-full-month range"). Real values drawn from CLAUDE.md's documented taxonomy
// (channelGroup: d2c/marketplace/ebo/quick_commerce/offline/international — see api/_bq.js
// CHANNEL_GROUPS) and from endpoint-specific filter keys actually read by each handler (confirmed
// by grepping each file's `req.body` destructure).
const CHANNEL_FILTER = { channelGroup: 'marketplace' }
const CATEGORY_FILTER = { category: 'Neck Support' }
const STATE_FILTER = { state: 'Maharashtra' }

// Endpoint definitions: name -> array of payload variants to send. Payload-less GET endpoints
// use method:'GET'. Endpoints requiring infra not available in this sandbox (Postgres/Supabase —
// api/inventory.js's getPool() has no DATABASE_URL configured locally) are intentionally excluded
// and noted in the run summary instead of silently producing empty/error snapshots.
const ENDPOINTS = {
  // Sales & Ads — courier/shipmentType/category go server-side; zone/payment/state/city are
  // client-side only in App.jsx (CLAUDE.md), so bq.js itself doesn't necessarily filter on them,
  // but it does accept category/channelGroup/state per its own req.body destructure (confirmed).
  bq: [
    { label: 'sep2026', body: LAST_FULL_MONTH },
    { label: 'aug2026', body: MONTH_BEFORE },
    { label: 'sep2026_channel', body: { ...LAST_FULL_MONTH, ...CHANNEL_FILTER } },
    { label: 'sep2026_category', body: { ...LAST_FULL_MONTH, ...CATEGORY_FILTER } },
    { label: 'sep2026_state', body: { ...LAST_FULL_MONTH, ...STATE_FILTER } },
  ],
  logistics: [
    { label: 'sep2026', body: LAST_FULL_MONTH },
    { label: 'aug2026', body: MONTH_BEFORE },
    // logistics.js expects `category` as an ARRAY (api/logistics.js:54 `category.map(...)`), unlike
    // bq.js/_bq.js's buildQuery which take a CSV string — confirmed by a 500 "category.map is not
    // a function" when a string was sent here.
    { label: 'sep2026_category', body: { ...LAST_FULL_MONTH, category: ['Neck Support'] } },
  ],
  // api/logistics-cost.js needs SUPABASE_URL (Postgres), not available in this local sandbox —
  // confirmed 500 "SUPABASE_URL not configured". Excluded from parity; it is untouched by this
  // task's changes anyway (items only touch logistics.js, customer.js, instrumentation, bundling).
  customer: [
    { label: 'sep2026', body: LAST_FULL_MONTH },
    { label: 'aug2026', body: MONTH_BEFORE },
  ],
  returns: [
    { label: 'sep2026', body: LAST_FULL_MONTH },
    { label: 'aug2026', body: MONTH_BEFORE },
  ],
  inward: [
    { label: 'sep2026', body: LAST_FULL_MONTH },
    { label: 'aug2026', body: MONTH_BEFORE },
    { label: 'sep2026_category', body: { ...LAST_FULL_MONTH, category: 'Neck Support' } },
  ],
  'sales-allocation': [
    { label: 'sep2026', body: LAST_FULL_MONTH },
    { label: 'aug2026', body: MONTH_BEFORE },
  ],
  // api/courier-allocation.js needs SUPABASE_URL (Postgres), not available in this local sandbox —
  // confirmed 500 "SUPABASE_URL not configured". Excluded from parity (untouched by this task).
  'customer-support': [
    { label: 'sep2026', body: LAST_FULL_MONTH },
    { label: 'aug2026', body: MONTH_BEFORE },
  ],
  'return-analysis': [
    { label: 'sep2026', body: LAST_FULL_MONTH },
    { label: 'aug2026', body: MONTH_BEFORE },
    { label: 'sep2026_category', body: { ...LAST_FULL_MONTH, category: 'Neck Support' } },
  ],
  'cat-daily': [
    { label: 'sep2026', body: { ...LAST_FULL_MONTH, channel: 'shopify' } },
    { label: 'aug2026', body: { ...MONTH_BEFORE, channel: 'shopify' } },
  ],
  'inventory-oos': [
    { label: 'default', body: {} },
  ],
  'packaging-products': [
    { label: 'default', method: 'GET' },
  ],
}

async function callEndpoint(name, variant) {
  const url = `${BASE}/api/${name}`
  const method = variant.method || 'POST'
  const opts = { method }
  if (method !== 'GET') {
    opts.headers = { 'Content-Type': 'application/json' }
    opts.body = JSON.stringify(variant.body || {})
  }
  const t0 = Date.now()
  const resp = await fetch(url, opts)
  const ms = Date.now() - t0
  const text = await resp.text()
  let json
  try { json = JSON.parse(text) } catch { json = { __nonJsonResponse: text.slice(0, 500) } }
  return { status: resp.status, ms, json }
}

async function main() {
  const summary = []
  for (const [name, variants] of Object.entries(ENDPOINTS)) {
    for (const variant of variants) {
      const label = variant.label
      process.stdout.write(`[${name}__${label}] `)
      try {
        const { status, ms, json } = await callEndpoint(name, variant)
        const outPath = join(OUT_DIR, `${name}__${label}.json`)
        // No pretty-printing — bq.js alone returns ~317 queries' worth of data and a 2-space
        // indent inflates that to 100MB+ per snapshot file, which exhausted local disk space
        // during this task's runs (confirmed: 5 snapshot dirs x ~400MB each hit ENOSPC on a disk
        // with only ~6GB free). Compact JSON is still diffable by parity-diff.mjs, which parses it.
        writeFileSync(outPath, JSON.stringify(json))
        console.log(`status=${status} ms=${ms} -> ${outPath}`)
        summary.push({ name, label, status, ms, ok: status === 200 })
      } catch (e) {
        console.log(`ERROR: ${e.message}`)
        summary.push({ name, label, status: 'ERROR', ms: null, ok: false, error: e.message })
      }
    }
  }
  writeFileSync(join(OUT_DIR, '_summary.json'), JSON.stringify(summary, null, 2))
  const failures = summary.filter(s => !s.ok)
  console.log(`\nDone. ${summary.length - failures.length}/${summary.length} succeeded.`)
  if (failures.length) {
    console.log('Failures:', failures.map(f => `${f.name}__${f.label} (${f.status})`).join(', '))
  }
}

main()
