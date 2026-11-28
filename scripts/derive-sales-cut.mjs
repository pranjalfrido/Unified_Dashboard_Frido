// Run: node scripts/derive-sales-cut.mjs
// Writes public/sales-data.json and public/sales-data-lastmonth.json from the existing public/pnl-data*.json (no BigQuery).
// The hourly precompute (scripts/generate-pnl-cache.mjs) writes them itself; this is for the first deploy and for tests.
import { readFileSync, writeFileSync } from 'node:fs'
import { salesCut } from './_salesCut.mjs'

for (const [src, dst] of [['public/pnl-data.json', 'public/sales-data.json'], ['public/pnl-data-lastmonth.json', 'public/sales-data-lastmonth.json']]) {
  const out = JSON.stringify(salesCut(JSON.parse(readFileSync(src, 'utf8'))))
  writeFileSync(dst, out)
  console.log(`wrote ${dst} (${(out.length / 1048576).toFixed(1)} MB)`)
}
