#!/usr/bin/env node
// Report-only audit: which /api/bq queries feed nothing any consumer reads.
// A query's outputs = the response fields that change when it is skipped (deps/*.json, measured).
// A field is "read" when its name appears as a word in any consumer source:
//   src/**  · api/*.js (other endpoints; bq.js and its phase/agg helpers excluded) · server.js ·
//   scripts/**/*.mjs|js (static JSON generators etc.; this folder excluded) · .github/workflows/*
// Usage: node scripts/staged-loading/unused-audit.mjs <profile.json> > audit.json
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { ROOT } from './_harness.mjs'

const profile = Object.fromEntries(JSON.parse(readFileSync(process.argv[2], 'utf8')).rows.map(r => [r.key, r]))
const depsDir = join(ROOT, 'scripts', 'staged-loading', 'deps')
const fieldsOf = {}; const allQ = new Set()
for (const f of readdirSync(depsDir)) {
  const d = JSON.parse(readFileSync(join(depsDir, f), 'utf8'))
  d.queryKeys.forEach(q => allQ.add(q))
  for (const [u, qs] of Object.entries(d.units)) if (u !== '__crash') qs.forEach(q => (fieldsOf[q] ||= new Set()).add(u))
}
const walk = (dir, out = []) => { for (const e of readdirSync(dir)) { const p = join(dir, e); if (['node_modules', 'staged-loading', '.git', 'dist'].includes(e)) continue; const s = statSync(p); if (s.isDirectory()) walk(p, out); else if (/\.(jsx?|mjs|cjs|ya?ml)$/.test(e)) out.push(p) } return out }
const corpus = [
  ...walk(join(ROOT, 'src')),
  ...readdirSync(join(ROOT, 'api')).filter(f => f.endsWith('.js') && !['bq.js', '_bqPhases.js', '_resolvedAgg.js'].includes(f)).map(f => join(ROOT, 'api', f)),
  join(ROOT, 'server.js'),
  ...walk(join(ROOT, 'scripts')),
  ...walk(join(ROOT, '.github')),
].map(p => ({ p: relative(ROOT, p).replace(/\\/g, '/'), t: readFileSync(p, 'utf8') }))
const readers = field => {
  const tok = field.includes('.') ? field.split('.')[1] : field
  const re = new RegExp(`\\b${tok}\\b`)
  return corpus.filter(c => re.test(c.t)).map(c => c.p)
}
const live = new Set(readFileSync(join(ROOT, 'api', 'bq.js'), 'utf8').match(/^    (\w+): /gm).map(s => s.trim().slice(0, -1)))
const out = []
for (const q of [...allQ].sort()) {
  if (!live.has(q)) continue // deleted (shDailySkuCosts)
  const fields = [...(fieldsOf[q] || [])]
  const read = fields.map(f => ({ f, by: readers(f) }))
  const unread = read.every(x => x.by.length === 0)
  if (!unread) continue
  const p = profile[q]
  out.push({ query: q, fields, mbYTD: p ? +(p.bytes / 1e6).toFixed(2) : null, sYTD: p?.ms != null ? +(p.ms / 1000).toFixed(1) : null })
}
console.log(JSON.stringify({ checked: corpus.length, queries: allQ.size, unused: out }, null, 1))
