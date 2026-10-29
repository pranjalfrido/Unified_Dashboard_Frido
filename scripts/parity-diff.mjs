#!/usr/bin/env node
// Recursively diffs every numeric field between two parity-snapshot directories (see
// parity-snapshot.mjs). Reports file + JSON path + both values for any numeric field that
// differs by more than 0.01 absolute. Non-numeric fields are ignored by design (string labels,
// ordering of object keys, etc. are not "numbers the dashboard displays"). Exits non-zero if any
// mismatch (or missing/extra file) is found.
//
// Usage: node scripts/parity-diff.mjs <dirA> <dirB>

import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

const [, , dirA, dirB] = process.argv
if (!dirA || !dirB) {
  console.error('Usage: node scripts/parity-diff.mjs <dirA> <dirB>')
  process.exit(2)
}

const TOLERANCE = 0.01

function listJsonFiles(dir) {
  return readdirSync(dir)
    .filter(f => f.endsWith('.json') && f !== '_summary.json')
    .sort()
}

function diffValues(path, a, b, diffs) {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isFinite(a) && Number.isFinite(b)) {
      if (Math.abs(a - b) > TOLERANCE) diffs.push({ path, a, b })
    } else if (a !== b) {
      // NaN/Infinity mismatches — still worth flagging
      diffs.push({ path, a, b })
    }
    return
  }
  if (typeof a !== typeof b) {
    // Type changed (e.g. number -> string) — flag only if at least one side is/contains a number
    if (typeof a === 'number' || typeof b === 'number') diffs.push({ path, a, b })
    return
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    // Several BigQuery aggregate queries in this codebase return an array with no explicit/stable
    // ORDER BY tiebreaker (e.g. logistics.js's byWeek/byStatus/rtoReasons, customer-support.js's
    // pendency) — confirmed by direct comparison: re-running the SAME unchanged code twice can
    // reorder rows while every row's own field values stay byte-identical. A positional [i]
    // comparison would then report thousands of false "diffs" that are pure row-order noise, not
    // real numeric changes. Sort both arrays by their own JSON string representation before
    // comparing — this is order-insensitive (catches a value actually changing) while still catching
    // a row being added/removed/mutated (the sorted multiset differs either way).
    const sortKey = v => JSON.stringify(v)
    const sortedA = [...a].sort((x, y) => sortKey(x).localeCompare(sortKey(y)))
    const sortedB = [...b].sort((x, y) => sortKey(x).localeCompare(sortKey(y)))
    const len = Math.max(sortedA.length, sortedB.length)
    for (let i = 0; i < len; i++) {
      diffValues(`${path}[sorted:${i}]`, sortedA[i], sortedB[i], diffs)
    }
    return
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const k of keys) {
      diffValues(path ? `${path}.${k}` : k, a[k], b[k], diffs)
    }
  }
}

function main() {
  const filesA = new Set(listJsonFiles(dirA))
  const filesB = new Set(listJsonFiles(dirB))
  const allFiles = new Set([...filesA, ...filesB])

  let totalDiffs = 0
  let missing = []
  for (const f of [...allFiles].sort()) {
    if (!filesA.has(f)) { missing.push(`${f}: missing in ${dirA}`); continue }
    if (!filesB.has(f)) { missing.push(`${f}: missing in ${dirB}`); continue }
    const a = JSON.parse(readFileSync(join(dirA, f), 'utf8'))
    const b = JSON.parse(readFileSync(join(dirB, f), 'utf8'))
    const diffs = []
    diffValues('', a, b, diffs)
    if (diffs.length) {
      totalDiffs += diffs.length
      console.log(`\n=== ${f} (${diffs.length} diffs) ===`)
      for (const d of diffs.slice(0, 50)) {
        console.log(`  ${d.path || '(root)'}: ${dirA}=${d.a}  ${dirB}=${d.b}`)
      }
      if (diffs.length > 50) console.log(`  ... and ${diffs.length - 50} more`)
    }
  }

  if (missing.length) {
    console.log('\n=== Missing files ===')
    missing.forEach(m => console.log(`  ${m}`))
  }

  console.log(`\n${allFiles.size} files compared. ${totalDiffs} numeric diffs, ${missing.length} missing files.`)
  if (totalDiffs > 0 || missing.length > 0) {
    console.log('PARITY CHECK: FAILED')
    process.exit(1)
  } else {
    console.log('PARITY CHECK: PASSED')
    process.exit(0)
  }
}

main()
