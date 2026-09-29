// Imports All_logistics_rate_card_Sheet.xlsx into Supabase as logistics_rate_card.
//
// Sheet shape: Carrier | Service | Weight Slab (kg) | A | B | C | D | E
// One row per (carrier, service, slab); the five zone columns are the forward rate.
// We unpivot the zones so the table is (carrier, service, slab_kg, zone, rate) — that
// makes the lookup a plain indexed equality join instead of dynamic column selection.
//
//   node scripts/import-rate-card.mjs --dry-run
//   node scripts/import-rate-card.mjs
//
// Requires (run once in the Supabase SQL editor):
//   CREATE TABLE IF NOT EXISTS public.logistics_rate_card (
//     id           BIGSERIAL PRIMARY KEY,
//     carrier      TEXT    NOT NULL,
//     service      TEXT    NOT NULL,
//     slab_kg      NUMERIC NOT NULL,
//     zone         TEXT    NOT NULL,
//     rate         NUMERIC NOT NULL,
//     UNIQUE (carrier, service, slab_kg, zone)
//   );
//   CREATE INDEX IF NOT EXISTS idx_rate_card_lookup
//     ON public.logistics_rate_card (carrier, service, zone, slab_kg);
//   GRANT SELECT, INSERT, UPDATE, DELETE ON public.logistics_rate_card TO service_role;
//   GRANT USAGE, SELECT ON SEQUENCE public.logistics_rate_card_id_seq TO service_role;

import XLSX from 'xlsx'
import pkg from 'pg'
import { config } from 'dotenv'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

config()
const { Pool } = pkg
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const argv = process.argv.slice(2)
const DRY = argv.includes('--dry-run')
const arg = n => { const i = argv.indexOf(n); return i !== -1 ? argv[i + 1] : null }

const SRC = arg('--file') || [
  join(ROOT, '..', 'All_logistics_rate_card_Sheet.xlsx'),
  join(ROOT, 'All_logistics_rate_card_Sheet.xlsx'),
].find(existsSync)

if (!SRC) { console.error('Rate card xlsx not found. Pass --file <path>.'); process.exit(1) }

const ZONES = ['A', 'B', 'C', 'D', 'E']

const rows = XLSX.utils.sheet_to_json(XLSX.readFile(SRC).Sheets['Sheet1'], { defval: null })
console.log(`Read ${rows.length.toLocaleString('en-IN')} rate rows from ${SRC}`)

const out = []
let skipped = 0
for (const r of rows) {
  const carrier = String(r.Carrier || '').trim()
  const service = String(r.Service || '').trim()
  const slab = parseFloat(r['Weight Slab (kg)'])
  if (!carrier || !service || !isFinite(slab)) { skipped++; continue }
  for (const z of ZONES) {
    const rate = parseFloat(r[z])
    // A blank zone means that lane isn't served at that slab — skip rather than store 0,
    // which would later read as "free shipping" instead of "no rate".
    if (!isFinite(rate) || rate <= 0) continue
    out.push({ carrier, service, slab_kg: slab, zone: z, rate })
  }
}

console.log(`Unpivoted to ${out.length.toLocaleString('en-IN')} (carrier, service, slab, zone) rates`)
if (skipped) console.log(`  ${skipped} sheet rows skipped (missing carrier/service/slab)`)

const combos = {}
for (const o of out) (combos[`${o.carrier} | ${o.service}`] ??= new Set()).add(o.slab_kg)
console.log(`  ${Object.keys(combos).length} carrier/service combos:`)
for (const [k, v] of Object.entries(combos)) {
  const s = [...v].sort((a, b) => a - b)
  console.log(`    ${k.padEnd(34)} ${String(s.length).padStart(4)} slabs  ${s[0]} … ${s[s.length - 1]} kg`)
}

if (DRY) {
  console.log('\n[DRY RUN] Nothing written. Re-run without --dry-run to load.')
  process.exit(0)
}

const connStr = process.env.SUPABASE_URL
if (!connStr) { console.error('SUPABASE_URL not set'); process.exit(1) }
const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false }, max: 3 })

try {
  // Replace wholesale: a rate card is a snapshot, and leaving stale slabs behind
  // would silently price some shipments off an old card.
  await pool.query('BEGIN')
  await pool.query('DELETE FROM public.logistics_rate_card')

  const CHUNK = 1000
  let done = 0
  for (let i = 0; i < out.length; i += CHUNK) {
    const batch = out.slice(i, i + CHUNK)
    const vals = []
    const params = []
    batch.forEach((o, k) => {
      const b = k * 5
      vals.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`)
      params.push(o.carrier, o.service, o.slab_kg, o.zone, o.rate)
    })
    await pool.query(
      `INSERT INTO public.logistics_rate_card (carrier, service, slab_kg, zone, rate)
       VALUES ${vals.join(',')}
       ON CONFLICT (carrier, service, slab_kg, zone) DO UPDATE SET rate = EXCLUDED.rate`,
      params
    )
    done += batch.length
    process.stdout.write(`\r  inserted ${done.toLocaleString('en-IN')} / ${out.length.toLocaleString('en-IN')}`)
  }
  await pool.query('COMMIT')
  process.stdout.write('\n')

  const { rows: chk } = await pool.query(
    `SELECT COUNT(*)::int n, COUNT(DISTINCT carrier)::int carriers,
            COUNT(DISTINCT carrier || '|' || service)::int combos
       FROM public.logistics_rate_card`
  )
  console.log('Loaded:', JSON.stringify(chk[0]))
} catch (e) {
  await pool.query('ROLLBACK').catch(() => {})
  console.error('Import failed:', e.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
