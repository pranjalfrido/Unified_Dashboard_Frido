// Shared helpers for the staged-loading verification scripts (scripts/staged-loading/*.mjs).
// Calls api/bq.js's real handler in-process (no HTTP server, no vercel dev).
//
// BigQuery credentials: GCP_SA_KEY must hold the service-account JSON before api/_bq.js's getBQ()
// is first called. loadKeyIntoEnv() reads it from SA_KEY_PATH (env var) — the key file itself is
// never copied into the repo and its contents are never printed.
//
// Record/replay: recordReplay(getBQ) monkey-patches the shared BigQuery client so every SQL text
// it sees is answered from an in-memory store (filled on first sight from real BigQuery). Two
// handler runs that issue the same SQL text then see byte-identical rows, which removes BigQuery's
// own run-to-run noise from the comparisons.
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { pathToFileURL } from 'url'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export function loadKeyIntoEnv() {
  if (process.env.GCP_SA_KEY) return
  const p = process.env.SA_KEY_PATH
  if (!p) throw new Error('Set SA_KEY_PATH to the service-account JSON file (it is read in-process, never copied)')
  process.env.GCP_SA_KEY = readFileSync(p, 'utf8')
}

export async function importBQClient() {
  return import(pathToFileURL(join(ROOT, 'api', '_bq.js')).href)
}

// The real, unmodified handler.
export async function importHandler() {
  return (await import(pathToFileURL(join(ROOT, 'api', 'bq.js')).href)).default
}

// An analysis-only copy of api/bq.js (written to the OS temp dir, never into the repo) with two
// hooks: globalThis.__KO (Set of query keys to skip — as if that phase had not run them) and
// globalThis.__NO_CACHE (skip the module-level response cache so repeated runs don't pile up
// payloads in memory). The query text and every aggregation are untouched.
export async function importInstrumentedHandler(srcPath = join(ROOT, 'api', 'bq.js')) {
  let src = readFileSync(srcPath, 'utf8')
  const apiUrl = pathToFileURL(join(ROOT, 'api') + '/').href
  const rep = (a, b) => { if (!src.includes(a)) throw new Error('instrumentation anchor not found: ' + a); src = src.split(a).join(b) }
  rep("from './", `from '${apiUrl}`)
  // static-file lookups (public/*.json) resolve relative to the real api/ folder even when the
  // source being instrumented is a saved copy of an older api/bq.js
  rep('import.meta.url', JSON.stringify(pathToFileURL(join(ROOT, 'api', 'bq.js')).href))
  rep('function setInCache(key, data) {', 'function setInCache(key, data) { if (globalThis.__NO_CACHE) return;')
  rep('runQueriesLimited(bq, filteredQueries, timer)',
    'runQueriesLimited(bq, (globalThis.__QKEYS = Object.keys(queries), globalThis.__KO ? Object.fromEntries(Object.entries(queries).filter(([k]) => !globalThis.__KO.has(k))) : filteredQueries), timer)')
  rep('results.forEach(({ key, rows }) => { r[key] = rows })',
    'globalThis.__ONRESULTS?.(results); results.forEach(({ key, rows }) => { r[key] = rows })')
  const dir = join(tmpdir(), 'staged-loading-analysis'); mkdirSync(dir, { recursive: true })
  const out = join(dir, `bq_instr_${Date.now()}_${Math.random().toString(36).slice(2)}.mjs`)
  writeFileSync(out, src)
  return (await import(pathToFileURL(out).href)).default
}

const cloneRows = rows => Array.isArray(rows) ? rows.map(r => (r && typeof r === 'object') ? Object.assign(Object.create(Object.getPrototypeOf(r)), r) : r) : rows

export function recordReplay(bq, { replayOnly = false } = {}) {
  const store = new Map()
  const orig = bq.__origQuery || bq.query.bind(bq)
  bq.__origQuery = orig
  const stats = { hits: 0, misses: 0 }
  bq.query = async (opts) => {
    const sql = typeof opts === 'string' ? opts : opts.query
    if (store.has(sql)) { stats.hits++; return [cloneRows(store.get(sql))] }
    if (replayOnly) throw new Error('REPLAY MISS: ' + sql.slice(0, 160))
    stats.misses++
    const res = await orig(opts)
    store.set(sql, cloneRows(res[0]))
    return [res[0], ...res.slice(1)]
  }
  return { store, stats, setReplayOnly(v) { replayOnly = v } }
}

export function unpatch(bq) { if (bq.__origQuery) bq.query = bq.__origQuery }

// Minimal Vercel-style req/res pair. Resolves with { status, body, headers }.
export async function callHandler(handler, body) {
  let status = 200, out
  const headers = {}
  const res = {
    setHeader(k, v) { headers[k] = v }, status(s) { status = s; return this },
    json(x) { out = x; return this }, end() { return this },
  }
  await handler({ method: 'POST', body }, res)
  return { status, body: out, headers }
}

export const quiet = async (fn) => {
  const log = console.log, warn = console.warn, err = console.error
  console.log = () => {}; console.warn = () => {}; console.error = () => {}
  try { return await fn() } finally { console.log = log; console.warn = warn; console.error = err }
}

// The 16 per-channel objects api/bq.js nests detail fields under.
export const CHANNEL_OBJECTS = ['shopify','flipkart','blinkit','instamart','zepto','cred','firstcry','myntra','amzSC','amzVCMatrix','amzVC','amzIntl','ebo','offline','international','ads']

// Split a payload into comparison units: every top-level key, except per-channel objects which are
// split one level further (`shopify.catMap`, …) — the same two levels the phase split and the
// frontend merge operate on.
export function toUnits(payload) {
  const m = new Map()
  for (const [k, v] of Object.entries(payload || {})) {
    if (CHANNEL_OBJECTS.includes(k) && v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [sk, sv] of Object.entries(v)) m.set(`${k}.${sk}`, sv)
    } else m.set(k, v)
  }
  return m
}
